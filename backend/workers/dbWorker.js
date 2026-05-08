/**
 * MedVise database backup and recovery worker.
 *
 * Required environment variables:
 * - DATABASE_URL: Postgres connection string used by the API and worker.
 * - REDIS_URL: Redis connection string used by BullMQ.
 * - SUPABASE_URL: Supabase project URL.
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key for private storage.
 *
 * Optional environment variables:
 * - SUPABASE_BACKUP_BUCKET: bucket where database dump artifacts are stored.
 * - SUPABASE_BACKUP_PREFIX: storage key prefix, defaults to "medvise/backups".
 * - PG_DUMP_BIN: pg_dump binary path, defaults to "pg_dump".
 * - PG_RESTORE_BIN: pg_restore binary path, defaults to "pg_restore".
 * - RESTORE_DATABASE_URL: restore target DB. Defaults to DATABASE_URL.
 *
 * The machine running this worker must have PostgreSQL client tools installed.
 * Vercel serverless functions should enqueue jobs only; run this worker on a
 * persistent process host such as Render Background Worker, Railway, Fly.io, or
 * your own server.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const { promisify } = require("util");
const { exec } = require("child_process");
const { Worker } = require("bullmq");
const pool = require("../db/pool");
const { DB_WORKER_HEARTBEAT_KEY, connection } = require("../queues/dbTasksQueue");
const {
  downloadStorageUriToFile,
  uploadBackupArtifact,
} = require("../services/supabaseStorageService");

const execAsync = promisify(exec);

const DB_QUEUE_NAME = "db-tasks";
const PG_DUMP_BIN = process.env.PG_DUMP_BIN || "pg_dump";
const PG_RESTORE_BIN = process.env.PG_RESTORE_BIN || "pg_restore";
let heartbeatTimer = null;

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

async function markRecoveryProcessing(recoveryJobId) {
  try {
    await pool.query(
      `
        UPDATE recovery_jobs
        SET status = 'processing',
            started_at = NOW(),
            error_message = NULL
        WHERE id = $1
      `,
      [recoveryJobId],
    );
  } catch (error) {
    if (error?.code !== "42703") {
      throw error;
    }

    await pool.query(
      `
        UPDATE recovery_jobs
        SET status = 'processing',
            error_message = NULL
        WHERE id = $1
      `,
      [recoveryJobId],
    );
  }
}

async function handleBackup(job) {
  requireEnv("DATABASE_URL");
  requireEnv("REDIS_URL");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const { backupJobId } = job.data;
  if (!backupJobId) {
    throw new Error("backupJobId is required.");
  }

  const dumpPath = path.join(os.tmpdir(), `medvise-backup-${backupJobId}.dump`);

  try {
    await pool.query(
      `
        UPDATE backup_jobs
        SET status = 'processing',
            started_at = NOW(),
            error_message = NULL
        WHERE id = $1
      `,
      [backupJobId],
    );

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

async function handleRestore(job) {
  requireEnv("DATABASE_URL");
  requireEnv("REDIS_URL");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const { recoveryJobId, backupJobId, targetEnv } = job.data;
  if (!recoveryJobId || !backupJobId) {
    throw new Error("recoveryJobId and backupJobId are required.");
  }

  const restorePath = path.join(
    os.tmpdir(),
    `medvise-restore-${recoveryJobId}-${backupJobId}.dump`,
  );

  try {
    await markRecoveryProcessing(recoveryJobId);

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

if (!connection) {
  throw new Error("REDIS_URL is required before starting dbWorker.");
}

async function writeWorkerHeartbeat() {
  await connection.set(
    DB_WORKER_HEARTBEAT_KEY,
    JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
    }),
    "EX",
    45,
  );
}

async function startWorkerHeartbeat() {
  await writeWorkerHeartbeat();
  heartbeatTimer = setInterval(() => {
    writeWorkerHeartbeat().catch((error) => {
      console.error("[dbWorker] heartbeat failed:", error);
    });
  }, 15000);
}

startWorkerHeartbeat().catch((error) => {
  console.error("[dbWorker] initial heartbeat failed:", error);
});

const worker = new Worker(
  DB_QUEUE_NAME,
  async (job) => {
    if (job.name === "backup") {
      return handleBackup(job);
    }

    if (job.name === "restore") {
      return handleRestore(job);
    }

    throw new Error(`Unknown db task: ${job.name}`);
  },
  {
    connection,
    concurrency: 1,
  },
);

worker.on("completed", (job) => {
  console.log(`[dbWorker] ${job.name} job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`[dbWorker] ${job?.name} job ${job?.id} failed:`, error);
});

process.on("SIGTERM", async () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await worker.close();
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await worker.close();
  await pool.end();
  process.exit(0);
});
