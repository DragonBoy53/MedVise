/**
 * MedVise database backup and recovery worker.
 *
 * Required environment variables:
 * - DATABASE_URL: Neon/Postgres connection string used by the API and worker.
 * - SUPABASE_URL: Supabase project URL for private dump storage.
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key for Storage access.
 *
 * Optional environment variables:
 * - SUPABASE_BACKUP_BUCKET: bucket where database dump artifacts are stored.
 * - SUPABASE_BACKUP_PREFIX: storage key prefix, defaults to "medvise/backups".
 * - PG_DUMP_BIN: pg_dump binary path, defaults to "pg_dump".
 * - PG_RESTORE_BIN: pg_restore binary path, defaults to "pg_restore".
 * - RESTORE_DATABASE_URL: restore target DB. Defaults to DATABASE_URL.
 * - DB_WORKER_POLL_INTERVAL_MS: idle poll interval, defaults to 15000.
 *
 * The machine running this worker must have PostgreSQL client tools installed.
 * Vercel serverless functions should create rows only; this worker polls Neon
 * for queued jobs and stores dump artifacts in Supabase Storage.
 */
const path = require("path");
const { loadEnv } = require("../config/loadEnv");
loadEnv();

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const { promisify } = require("util");
const { exec } = require("child_process");
const pool = require("../db/pool");
const {
  downloadStorageUriToFile,
  uploadBackupArtifact,
} = require("../services/supabaseStorageService");

const execAsync = promisify(exec);

const PG_DUMP_BIN = process.env.PG_DUMP_BIN || "pg_dump";
const PG_RESTORE_BIN = process.env.PG_RESTORE_BIN || "pg_restore";
const POLL_INTERVAL_MS = Number(process.env.DB_WORKER_POLL_INTERVAL_MS || 15000);
let shutdownRequested = false;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for database backup/recovery worker.`);
  }
  return value;
}

function shellQuote(value) {
  return `"${String(value).replace(/(["`$\\])/g, "\\$1")}"`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFileSize(filePath) {
  const stat = await fsp.stat(filePath);
  return stat.size;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function updateWorkerHeartbeat() {
  try {
    await pool.query(
      `
        INSERT INTO worker_heartbeats (heartbeat_key, last_seen_at, metadata_json)
        VALUES ('db-worker', NOW(), $1::jsonb)
        ON CONFLICT (heartbeat_key)
        DO UPDATE SET
          last_seen_at = EXCLUDED.last_seen_at,
          metadata_json = EXCLUDED.metadata_json
      `,
      [
        JSON.stringify({
          pid: process.pid,
          host: os.hostname(),
          pollIntervalMs: POLL_INTERVAL_MS,
        }),
      ],
    );
  } catch (error) {
    if (error?.code === "42P01") {
      console.warn(
        "[dbWorker] worker_heartbeats table is missing. Run backend/sql/admin_portal_schema.sql on Neon to show worker status in the app.",
      );
      return;
    }

    throw error;
  }
}

async function updateBackupFailure(backupJobId, error) {
  await pool.query(
    `
      UPDATE backup_jobs
      SET status = 'failed',
          completed_at = NOW(),
          error_message = $2
      WHERE id = $1
    `,
    [backupJobId, String(error?.message || error).slice(0, 2000)],
  );
}

async function updateRecoveryFailure(recoveryJobId, error) {
  await pool.query(
    `
      UPDATE recovery_jobs
      SET status = 'failed',
          completed_at = NOW(),
          error_message = $2
      WHERE id = $1
    `,
    [recoveryJobId, String(error?.message || error).slice(0, 2000)],
  );
}

async function markRecoveryCompleted({ recoveryJobId, backupJobId, targetEnv }) {
  await pool.query(
    `
      INSERT INTO recovery_jobs (
        id,
        backup_job_id,
        status,
        target_env,
        confirmed_at,
        completed_at,
        error_message
      )
      VALUES ($1, $2, 'completed', $3, NOW(), NOW(), NULL)
      ON CONFLICT (id)
      DO UPDATE SET
        status = 'completed',
        completed_at = NOW(),
        error_message = NULL
    `,
    [recoveryJobId, backupJobId, targetEnv || "production"],
  );
}

async function claimNextBackupJob() {
  const result = await pool.query(`
    UPDATE backup_jobs
    SET status = 'processing',
        started_at = NOW(),
        error_message = NULL
    WHERE id = (
      SELECT id
      FROM backup_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);

  return result.rows[0] || null;
}

async function claimNextRecoveryJob() {
  let result;

  try {
    result = await pool.query(`
      UPDATE recovery_jobs
      SET status = 'processing',
          started_at = NOW(),
          error_message = NULL
      WHERE id = (
        SELECT id
        FROM recovery_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, backup_job_id AS "backupJobId", target_env AS "targetEnv"
    `);
  } catch (error) {
    if (error?.code !== "42703") {
      throw error;
    }

    result = await pool.query(`
      UPDATE recovery_jobs
      SET status = 'processing',
          error_message = NULL
      WHERE id = (
        SELECT id
        FROM recovery_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, backup_job_id AS "backupJobId", target_env AS "targetEnv"
    `);
  }

  return result.rows[0] || null;
}

async function handleBackup(backupJobId) {
  requireEnv("DATABASE_URL");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const dumpPath = path.join(os.tmpdir(), `medvise-backup-${backupJobId}.dump`);

  try {
    const dumpCommand = [
      shellQuote(PG_DUMP_BIN),
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--verbose",
      "--file",
      shellQuote(dumpPath),
      shellQuote(process.env.DATABASE_URL),
    ].join(" ");

    await execAsync(dumpCommand, {
      env: process.env,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 1000 * 60 * 20,
    });

    const sizeBytes = await getFileSize(dumpPath);
    const checksum = await sha256File(dumpPath);

    const artifact = await uploadBackupArtifact({ backupJobId, filePath: dumpPath });

    await pool.query(
      `
        UPDATE backup_jobs
        SET status = 'completed',
            storage_uri = $2,
            checksum = $3,
            size_bytes = $4,
            completed_at = NOW(),
            error_message = NULL
        WHERE id = $1
      `,
      [backupJobId, artifact.storageUri, checksum, artifact.sizeBytes || sizeBytes],
    );

    return {
      storageUri: artifact.storageUri,
      checksum,
      sizeBytes: artifact.sizeBytes || sizeBytes,
    };
  } catch (error) {
    await updateBackupFailure(backupJobId, error);
    throw error;
  } finally {
    await fsp.rm(dumpPath, { force: true }).catch(() => {});
  }
}

async function handleRestore({ recoveryJobId, backupJobId, targetEnv }) {
  requireEnv("DATABASE_URL");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const restorePath = path.join(
    os.tmpdir(),
    `medvise-restore-${recoveryJobId}-${backupJobId}.dump`,
  );

  try {
    const backupResult = await pool.query(
      `
        SELECT storage_uri AS "storageUri"
        FROM backup_jobs
        WHERE id = $1
          AND status = 'completed'
          AND storage_uri IS NOT NULL
        LIMIT 1
      `,
      [backupJobId],
    );

    const storageUri = backupResult.rows[0]?.storageUri;
    if (!storageUri) {
      throw new Error("Completed backup artifact was not found for restore.");
    }

    await downloadStorageUriToFile(storageUri, restorePath);

    const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;
    const restoreCommand = [
      shellQuote(PG_RESTORE_BIN),
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--verbose",
      "--dbname",
      shellQuote(restoreDatabaseUrl),
      shellQuote(restorePath),
    ].join(" ");

    await execAsync(restoreCommand, {
      env: process.env,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 1000 * 60 * 30,
    });

    await markRecoveryCompleted({ recoveryJobId, backupJobId, targetEnv });

    return { restoredFrom: storageUri };
  } catch (error) {
    await updateRecoveryFailure(recoveryJobId, error);
    throw error;
  } finally {
    await fsp.rm(restorePath, { force: true }).catch(() => {});
  }
}

async function processNextJob() {
  await updateWorkerHeartbeat();

  const backupJob = await claimNextBackupJob();
  if (backupJob) {
    console.log(`[dbWorker] Processing backup job ${backupJob.id}.`);
    await handleBackup(backupJob.id);
    console.log(`[dbWorker] Backup job ${backupJob.id} completed.`);
    return true;
  }

  const recoveryJob = await claimNextRecoveryJob();
  if (recoveryJob) {
    console.log(`[dbWorker] Processing recovery job ${recoveryJob.id}.`);
    await handleRestore({
      recoveryJobId: recoveryJob.id,
      backupJobId: recoveryJob.backupJobId,
      targetEnv: recoveryJob.targetEnv,
    });
    console.log(`[dbWorker] Recovery job ${recoveryJob.id} completed.`);
    return true;
  }

  return false;
}

async function runWorkerLoop() {
  requireEnv("DATABASE_URL");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  await assertPostgresTool(PG_DUMP_BIN, "PG_DUMP_BIN");
  await assertPostgresTool(PG_RESTORE_BIN, "PG_RESTORE_BIN");

  console.log("[dbWorker] Started. Polling Neon for queued backup/recovery jobs.");

  while (!shutdownRequested) {
    try {
      const processedJob = await processNextJob();
      await delay(processedJob ? 1000 : POLL_INTERVAL_MS);
    } catch (error) {
      console.error("[dbWorker] Worker loop failed:", error);
      await delay(POLL_INTERVAL_MS);
    }
  }
}

async function assertPostgresTool(binary, envKey) {
  try {
    await execAsync(`${shellQuote(binary)} --version`, {
      env: process.env,
      timeout: 1000 * 10,
    });
  } catch (error) {
    throw new Error(
      `${envKey} (${binary}) is not available. Install PostgreSQL client tools or set ${envKey} to the full binary path.`,
    );
  }
}

async function shutdown() {
  shutdownRequested = true;
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

runWorkerLoop().catch(async (error) => {
  console.error("[dbWorker] Fatal startup error:", error);
  await pool.end();
  process.exit(1);
});
