const pool = require("../db/pool");
const { ensureModelVersion } = require("./telemetryService");
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

function buildMetricsResponse(specialty, modelVersion, baseline, live) {
  return {
    specialty: specialty || modelVersion?.specialty || null,
    modelName: modelVersion?.model_name || null,
    versionTag: modelVersion?.version_tag || null,
    baseline,
    live,
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
    return null;
  }

  return Number((numerator / denominator).toFixed(5));
}

function toNumberOrNull(value) {
  if (value == null) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function buildDefaultBaselineMetrics(note, schemaReady = true) {
  return {
    accuracy: null,
    precision: null,
    recall: null,
    falseAlarmRate: null,
    rocAuc: null,
    sampleSize: 0,
    metricScope: null,
    classMetrics: {},
    confusionMatrix: {},
    updatedAt: null,
    note,
    schemaReady,
  };
}

function buildDefaultLiveMetrics(note, schemaReady = true) {
  return {
    accuracy: null,
    precision: null,
    recall: null,
    falseAlarmRate: null,
    totalPredictions: 0,
    sampleSize: 0,
    windowStart: null,
    windowEnd: null,
    lastUpdated: null,
    note,
    schemaReady,
  };
}

async function getBaselineMetrics(modelVersionId) {
  if (!modelVersionId) {
    return buildDefaultBaselineMetrics(
      "No active model version has been registered yet for this specialty.",
    );
  }

  try {
    const result = await pool.query(
      `
        SELECT
          accuracy,
          precision,
          recall,
          false_alarm_rate AS "falseAlarmRate",
          roc_auc AS "rocAuc",
          evaluation_sample_size AS "sampleSize",
          metric_scope AS "metricScope",
          class_metrics_json AS "classMetrics",
          confusion_matrix_json AS "confusionMatrix",
          source_note AS "note",
          updated_at AS "updatedAt"
        FROM model_baseline_metrics
        WHERE model_version_id = $1
        LIMIT 1
      `,
      [modelVersionId],
    );

    const row = result.rows[0];
    if (!row) {
      return buildDefaultBaselineMetrics(
        "Baseline notebook metrics have not been attached to this model version yet.",
      );
    }

    return {
      accuracy: toNumberOrNull(row.accuracy),
      precision: toNumberOrNull(row.precision),
      recall: toNumberOrNull(row.recall),
      falseAlarmRate: toNumberOrNull(row.falseAlarmRate),
      rocAuc: toNumberOrNull(row.rocAuc),
      sampleSize: row.sampleSize || 0,
      metricScope: row.metricScope || null,
      classMetrics: row.classMetrics || {},
      confusionMatrix: row.confusionMatrix || {},
      updatedAt: row.updatedAt || null,
      note: row.note || null,
      schemaReady: true,
    };
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return buildDefaultBaselineMetrics(
        "Baseline metrics table is not installed yet. Run backend/sql/admin_portal_schema.sql against PostgreSQL.",
        false,
      );
    }

    throw error;
  }
}

async function getLiveMetrics({ specialty, modelVersion }) {
  const { params, whereClause } = buildMetricFilter({
    specialty,
    modelVersion,
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
    return {
      ...buildDefaultLiveMetrics(
        specialty
          ? `No real prediction events found yet for ${specialty}. Live metrics will appear after users start generating predictions.`
          : "No real prediction events found yet. Live metrics will appear after users start generating predictions.",
      ),
      totalPredictions,
      windowStart,
      windowEnd,
    };
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
      ...buildDefaultLiveMetrics(
        "Predictions are being recorded, but no verified ground-truth outcomes have been submitted yet. Accuracy, precision, recall, and false alarm rate require actual confirmed outcomes.",
      ),
      totalPredictions,
      sampleSize,
      windowStart,
      windowEnd,
      lastUpdated: windowEnd,
    };
  }

  return {
    accuracy: toRate(tp + tn, sampleSize),
    precision: toRate(tp, tp + fp),
    recall: toRate(tp, tp + fn),
    falseAlarmRate: toRate(fp, fp + tn),
    totalPredictions,
    sampleSize,
    windowStart,
    windowEnd,
    lastUpdated: labeledMetrics?.last_labeled_at || windowEnd,
    note: null,
    schemaReady: true,
  };
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
    const activeModelVersion = specialty
      ? await ensureModelVersion(specialty)
      : await getActiveModelVersion(specialty);

    const [baseline, live] = await Promise.all([
      getBaselineMetrics(activeModelVersion?.id || null),
      getLiveMetrics({ specialty, modelVersion: activeModelVersion }),
    ]);

    return buildMetricsResponse(specialty, activeModelVersion, baseline, live);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return buildMetricsResponse(
        specialty,
        null,
        buildDefaultBaselineMetrics(
          "Admin schema is not installed yet. Run backend/sql/admin_portal_schema.sql against your PostgreSQL database.",
          false,
        ),
        buildDefaultLiveMetrics(
          "Admin schema is not installed yet. Run backend/sql/admin_portal_schema.sql against your PostgreSQL database.",
          false,
        ),
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
        initiated_by AS "initiatedBy",
        initiated_by_clerk_user_id AS "initiatedByClerkUserId",
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

async function createBackupJob({ initiatedBy = null, initiatedByClerkUserId = null }) {
  try {
    const result = await pool.query(
      `
        INSERT INTO backup_jobs (initiated_by, initiated_by_clerk_user_id, status)
        VALUES ($1, $2, 'queued')
        RETURNING
          id,
          initiated_by AS "initiatedBy",
          initiated_by_clerk_user_id AS "initiatedByClerkUserId",
          status,
          created_at AS "createdAt"
      `,
      [initiatedBy, initiatedByClerkUserId],
    );

    return result.rows[0];
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function createRecoveryJob({
  initiatedBy = null,
  initiatedByClerkUserId = null,
  backupJobId,
  targetEnv,
}) {
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
        INSERT INTO recovery_jobs (
          backup_job_id,
          initiated_by,
          initiated_by_clerk_user_id,
          status,
          target_env,
          confirmed_at
        )
        VALUES ($1, $2, $3, 'queued', $4, NOW())
        RETURNING
          id,
          backup_job_id AS "backupJobId",
          initiated_by AS "initiatedBy",
          initiated_by_clerk_user_id AS "initiatedByClerkUserId",
          status,
          target_env AS "targetEnv",
          created_at AS "createdAt"
      `,
      [effectiveBackupJobId, initiatedBy, initiatedByClerkUserId, targetEnv],
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

async function queueRetrainingFeedback({
  chatSessionId,
  reviewedBy = null,
  reviewedByClerkUserId = null,
  notes,
}) {
  try {
    const result = await pool.query(
      `
        INSERT INTO retraining_feedback_queue (
          chat_session_id,
          submitted_by,
          submitted_by_clerk_user_id,
          notes,
          status
        )
        VALUES ($1, $2, $3, $4, 'queued')
        RETURNING
          id,
          chat_session_id AS "chatSessionId",
          submitted_by AS "submittedBy",
          submitted_by_clerk_user_id AS "submittedByClerkUserId",
          notes,
          status,
          created_at AS "createdAt"
      `,
      [chatSessionId, reviewedBy, reviewedByClerkUserId, notes || null],
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
  enteredByClerkUserId,
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
          entered_by,
          entered_by_clerk_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (prediction_event_id)
        DO UPDATE SET
          actual_label = EXCLUDED.actual_label,
          actual_value = EXCLUDED.actual_value,
          label_source = EXCLUDED.label_source,
          entered_by = EXCLUDED.entered_by,
          entered_by_clerk_user_id = EXCLUDED.entered_by_clerk_user_id,
          created_at = NOW()
        RETURNING
          id,
          prediction_event_id AS "predictionEventId",
          actual_label AS "actualLabel",
          actual_value AS "actualValue",
          label_source AS "labelSource",
          entered_by_clerk_user_id AS "enteredByClerkUserId",
          created_at AS "createdAt"
      `,
      [
        predictionEventId,
        resolvedLabel,
        actualValue,
        labelSource || "admin_review",
        enteredBy || null,
        enteredByClerkUserId || null,
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
