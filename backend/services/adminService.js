const pool = require("../db/pool");
const VALID_SPECIALTIES = ["cardiology", "diabetes", "thyroid"];

function isUndefinedTableError(error) {
  return error?.code === "42P01";
}

function normalizeSpecialty(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();

  return VALID_SPECIALTIES.includes(value) ? value : null;
}

function buildDefaultMetricsPayload(specialty, modelVersion, note, schemaReady = true) {
  return {
    specialty: specialty || modelVersion?.specialty || null,
    modelName: modelVersion?.model_name || null,
    versionTag: modelVersion?.version_tag || null,
    accuracy: 0,
    precision: 0,
    recall: 0,
    falseAlarmRate: 0,
    totalPredictions: 0,
    sampleSize: 0,
    windowStart: null,
    windowEnd: null,
    lastUpdated: null,
    note,
    schemaReady,
  };
}

async function getActiveModelVersion(specialty) {
  if (!specialty) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT id, specialty, model_name, version_tag
      FROM model_versions
      WHERE LOWER(specialty) = $1 AND is_active = TRUE
      ORDER BY deployed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [specialty],
  );

  return result.rows[0] || null;
}

function buildMetricFilter({ specialty, modelVersion }) {
  const params = [];
  const whereClauses = [];

  if (specialty) {
    params.push(specialty);
    whereClauses.push(`LOWER(pe.specialty) = $${params.length}`);
  }

  if (modelVersion?.id) {
    params.push(modelVersion.id);
    whereClauses.push(`pe.model_version_id = $${params.length}`);
  }

  return {
    params,
    whereClause: whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "",
  };
}

function toRate(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(5));
}

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

async function getMetricsOverview(specialtyInput) {
  const specialty = normalizeSpecialty(specialtyInput);

  try {
    const activeModelVersion = await getActiveModelVersion(specialty);
    const { params, whereClause } = buildMetricFilter({
      specialty,
      modelVersion: activeModelVersion,
    });

    const totalPredictionsResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_predictions,
          MIN(pe.created_at) AS window_start,
          MAX(pe.created_at) AS window_end
        FROM prediction_events pe
        ${whereClause}
      `,
      params,
    );

    const totalPredictions = totalPredictionsResult.rows[0]?.total_predictions || 0;
    const windowStart = totalPredictionsResult.rows[0]?.window_start || null;
    const windowEnd = totalPredictionsResult.rows[0]?.window_end || null;

    if (!totalPredictions) {
      return buildDefaultMetricsPayload(
        specialty,
        activeModelVersion,
        specialty
          ? `No real prediction events found yet for ${specialty}. Metrics will appear after users start generating predictions.`
          : "No real prediction events found yet. Metrics will appear after users start generating predictions.",
      );
    }

    const labeledMetricsResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS sample_size,
          COUNT(*) FILTER (
            WHERE
              (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pe.predicted_value, 0) > 0
                  ELSE COALESCE(pe.predicted_value, 0) = 1
                END
              )
              AND
              (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pgt.actual_value, 0) > 0
                  ELSE COALESCE(pgt.actual_value, 0) = 1
                END
              )
          )::int AS tp,
          COUNT(*) FILTER (
            WHERE
              (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pe.predicted_value, 0) > 0
                  ELSE COALESCE(pe.predicted_value, 0) = 1
                END
              )
              AND NOT (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pgt.actual_value, 0) > 0
                  ELSE COALESCE(pgt.actual_value, 0) = 1
                END
              )
          )::int AS fp,
          COUNT(*) FILTER (
            WHERE NOT (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pe.predicted_value, 0) > 0
                  ELSE COALESCE(pe.predicted_value, 0) = 1
                END
              )
              AND
              (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pgt.actual_value, 0) > 0
                  ELSE COALESCE(pgt.actual_value, 0) = 1
                END
              )
          )::int AS fn,
          COUNT(*) FILTER (
            WHERE NOT (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pe.predicted_value, 0) > 0
                  ELSE COALESCE(pe.predicted_value, 0) = 1
                END
              )
              AND NOT (
                CASE
                  WHEN LOWER(pe.specialty) = 'cardiology' THEN COALESCE(pgt.actual_value, 0) > 0
                  ELSE COALESCE(pgt.actual_value, 0) = 1
                END
              )
          )::int AS tn,
          MAX(pgt.created_at) AS last_labeled_at
        FROM prediction_events pe
        INNER JOIN prediction_ground_truth pgt ON pgt.prediction_event_id = pe.id
        ${whereClause}
      `,
      params,
    );

    const labeledMetrics = labeledMetricsResult.rows[0];
    const sampleSize = labeledMetrics?.sample_size || 0;
    const tp = labeledMetrics?.tp || 0;
    const fp = labeledMetrics?.fp || 0;
    const fn = labeledMetrics?.fn || 0;
    const tn = labeledMetrics?.tn || 0;

    if (!sampleSize) {
      return {
        ...buildDefaultMetricsPayload(
          specialty,
          activeModelVersion,
          "Predictions are being recorded, but no verified ground-truth outcomes have been submitted yet. Accuracy, precision, recall, and false alarm rate require actual confirmed outcomes.",
        ),
        totalPredictions,
        windowStart,
        windowEnd,
        lastUpdated: windowEnd,
      };
    }

    return {
      specialty: specialty || activeModelVersion?.specialty || null,
      modelName: activeModelVersion?.model_name || null,
      versionTag: activeModelVersion?.version_tag || null,
      accuracy: toRate(tp + tn, sampleSize),
      precision: toRate(tp, tp + fp),
      recall: toRate(tp, tp + fn),
      falseAlarmRate: toRate(fp, fp + tn),
      totalPredictions,
      sampleSize,
      windowStart,
      windowEnd,
      lastUpdated: labeledMetrics?.last_labeled_at || windowEnd,
    };
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return buildDefaultMetricsPayload(
        specialty,
        null,
        "Admin schema is not installed yet. Run backend/sql/admin_portal_schema.sql against your PostgreSQL database.",
        false,
      );
    }

    throw error;
  }
}

async function listBackupJobs() {
  try {
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
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function createBackupJob(initiatedBy) {
  try {
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
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function createRecoveryJob(initiatedBy, backupJobId, targetEnv) {
  try {
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
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
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
  try {
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
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function upsertPredictionGroundTruth({
  predictionEventId,
  actualValue,
  actualLabel,
  labelSource,
  enteredBy,
}) {
  try {
    const predictionResult = await pool.query(
      `
        SELECT id, specialty
        FROM prediction_events
        WHERE id = $1
        LIMIT 1
      `,
      [predictionEventId],
    );

    const prediction = predictionResult.rows[0];
    if (!prediction) {
      const error = new Error("Prediction event not found.");
      error.code = "PREDICTION_NOT_FOUND";
      throw error;
    }

    const resolvedLabel =
      actualLabel ||
      (prediction.specialty === "cardiology"
        ? actualValue > 0
          ? "Confirmed Disease"
          : "Confirmed Healthy / No Disease"
        : actualValue === 1
          ? "Confirmed Positive"
          : "Confirmed Negative");

    const result = await pool.query(
      `
        INSERT INTO prediction_ground_truth (
          prediction_event_id,
          actual_label,
          actual_value,
          label_source,
          entered_by
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (prediction_event_id)
        DO UPDATE SET
          actual_label = EXCLUDED.actual_label,
          actual_value = EXCLUDED.actual_value,
          label_source = EXCLUDED.label_source,
          entered_by = EXCLUDED.entered_by,
          created_at = NOW()
        RETURNING
          id,
          prediction_event_id AS "predictionEventId",
          actual_label AS "actualLabel",
          actual_value AS "actualValue",
          label_source AS "labelSource",
          created_at AS "createdAt"
      `,
      [
        predictionEventId,
        resolvedLabel,
        actualValue,
        labelSource || "admin_review",
        enteredBy || null,
      ],
    );

    return result.rows[0];
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  getAdminSummary,
  getMetricsOverview,
  listBackupJobs,
  createBackupJob,
  createRecoveryJob,
  listChatLogs,
  queueRetrainingFeedback,
  normalizeSpecialty,
  upsertPredictionGroundTruth,
};
