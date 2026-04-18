const pool = require("../db/pool");

async function getAdminSummary(userId) {
  const [usersResult, modelsResult] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total_users FROM users"),
    pool.query(
      "SELECT COUNT(*)::int AS active_models FROM model_versions WHERE is_active = TRUE",
    ),
  ]);

  return {
    adminUserId: userId,
    totalUsers: usersResult.rows[0]?.total_users || 0,
    activeModels: modelsResult.rows[0]?.active_models || 0,
    generatedAt: new Date().toISOString(),
  };
}

async function getMetricsOverview() {
  const snapshotResult = await pool.query(`
    SELECT
      accuracy,
      precision,
      recall,
      false_alarm_rate,
      sample_size,
      window_start,
      window_end,
      created_at
    FROM metric_snapshots
    ORDER BY window_end DESC NULLS LAST, created_at DESC
    LIMIT 1
  `);

  const latestSnapshot = snapshotResult.rows[0];

  if (!latestSnapshot) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      falseAlarmRate: 0,
      totalPredictions: 0,
      sampleSize: 0,
      windowStart: null,
      windowEnd: null,
      lastUpdated: null,
      note: "No metric snapshots found yet. Add prediction logging and aggregation jobs.",
    };
  }

  const predictionCountResult = await pool.query(
    "SELECT COUNT(*)::int AS total_predictions FROM prediction_events",
  );

  return {
    accuracy: Number(latestSnapshot.accuracy || 0),
    precision: Number(latestSnapshot.precision || 0),
    recall: Number(latestSnapshot.recall || 0),
    falseAlarmRate: Number(latestSnapshot.false_alarm_rate || 0),
    totalPredictions: predictionCountResult.rows[0]?.total_predictions || 0,
    sampleSize: latestSnapshot.sample_size || 0,
    windowStart: latestSnapshot.window_start,
    windowEnd: latestSnapshot.window_end,
    lastUpdated: latestSnapshot.created_at,
  };
}

async function listBackupJobs() {
  const result = await pool.query(`
    SELECT
      id,
      status,
      storage_uri AS "storageUri",
      checksum,
      size_bytes AS "sizeBytes",
      started_at AS "startedAt",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      error_message AS "errorMessage"
    FROM backup_jobs
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return result.rows;
}

async function createBackupJob(initiatedBy) {
  const result = await pool.query(
    `
      INSERT INTO backup_jobs (initiated_by, status)
      VALUES ($1, 'queued')
      RETURNING
        id,
        initiated_by AS "initiatedBy",
        status,
        created_at AS "createdAt"
    `,
    [initiatedBy],
  );

  return result.rows[0];
}

async function createRecoveryJob(initiatedBy, backupJobId, targetEnv) {
  let effectiveBackupJobId = backupJobId;

  if (!effectiveBackupJobId) {
    const latestBackupResult = await pool.query(`
      SELECT id
      FROM backup_jobs
      ORDER BY created_at DESC
      LIMIT 1
    `);

    effectiveBackupJobId = latestBackupResult.rows[0]?.id || null;
  }

  if (!effectiveBackupJobId) {
    const error = new Error("No backup job is available yet.");
    error.code = "NO_BACKUP_AVAILABLE";
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO recovery_jobs (backup_job_id, initiated_by, status, target_env, confirmed_at)
      VALUES ($1, $2, 'queued', $3, NOW())
      RETURNING
        id,
        backup_job_id AS "backupJobId",
        initiated_by AS "initiatedBy",
        status,
        target_env AS "targetEnv",
        created_at AS "createdAt"
    `,
    [effectiveBackupJobId, initiatedBy, targetEnv],
  );

  return result.rows[0];
}

async function listChatLogs({ limit = 20, flaggedOnly = false }) {
  const values = [];
  const whereClauses = [];

  if (flaggedOnly) {
    values.push(true);
    whereClauses.push(`EXISTS (
      SELECT 1
      FROM chat_reviews cr
      WHERE cr.chat_session_id = cs.id AND cr.flagged_for_retraining = $${values.length}
    )`);
  }

  values.push(limit);

  const result = await pool.query(
    `
      SELECT
        cs.id,
        cs.user_id AS "userId",
        cs.channel,
        cs.specialty,
        cs.started_at AS "startedAt",
        cs.last_message_at AS "lastMessageAt",
        cs.status,
        (
          SELECT COUNT(*)
          FROM chat_messages cm
          WHERE cm.chat_session_id = cs.id
        )::int AS "messageCount"
      FROM chat_sessions cs
      ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY cs.started_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}

async function queueRetrainingFeedback(chatSessionId, reviewedBy, notes) {
  const result = await pool.query(
    `
      INSERT INTO retraining_feedback_queue (chat_session_id, submitted_by, notes, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING
        id,
        chat_session_id AS "chatSessionId",
        submitted_by AS "submittedBy",
        notes,
        status,
        created_at AS "createdAt"
    `,
    [chatSessionId, reviewedBy, notes || null],
  );

  return result.rows[0];
}

module.exports = {
  getAdminSummary,
  getMetricsOverview,
  listBackupJobs,
  createBackupJob,
  createRecoveryJob,
  listChatLogs,
  queueRetrainingFeedback,
};
