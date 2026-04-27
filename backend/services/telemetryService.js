const pool = require("../db/pool");

const MODEL_CONFIG_BY_SPECIALTY = {
  cardiology: {
    modelName: "medvise_cardio_xgboost.pkl",
    algorithm: "xgboost",
    versionTag: process.env.CARDIOLOGY_MODEL_VERSION || "cardiology-v1",
    artifactUri: "ml_service/models/medvise_cardio_xgboost.pkl",
    datasetVersion: process.env.CARDIOLOGY_DATASET_VERSION || null,
    baselineMetrics: {
      accuracy: 0.8908,
      precision: 0.89,
      recall: 0.9,
      falseAlarmRate: null,
      rocAuc: null,
      sampleSize: 238,
      metricScope: "multiclass_test_set_macro_average",
      classMetrics: {
        healthy: { precision: 0.88, recall: 0.88, support: 112 },
        mildDisease: { precision: 0.86, recall: 0.83, support: 69 },
        severeDisease: { precision: 0.93, recall: 0.98, support: 57 },
      },
      confusionMatrix: null,
      sourceNote:
        "Baseline metrics imported from Models.ipynb. Accuracy is overall multiclass test-set accuracy. Precision and recall are macro averages across Healthy, Mild Disease, and Severe Disease.",
    },
  },
  diabetes: {
    modelName: "diabetes_model.pkl",
    algorithm: "catboost",
    versionTag: process.env.DIABETES_MODEL_VERSION || "diabetes-v1",
    artifactUri: "ml_service/models/diabetes_model.pkl",
    datasetVersion: process.env.DIABETES_DATASET_VERSION || null,
    baselineMetrics: {
      accuracy: 0.8968,
      precision: 0.46,
      recall: 0.92,
      falseAlarmRate: null,
      rocAuc: 0.9782,
      sampleSize: 19230,
      metricScope: "binary_test_set_positive_class",
      classMetrics: {
        healthy: { precision: 0.99, recall: 0.89, support: 17534 },
        diabetesPositive: { precision: 0.46, recall: 0.92, support: 1696 },
      },
      confusionMatrix: null,
      sourceNote:
        "Baseline metrics imported from Models.ipynb. Precision and recall reflect the positive diabetes class on the held-out test set. False alarm rate is left null because the notebook output did not persist exact confusion-matrix counts.",
    },
  },
  thyroid: {
    modelName: "thyroid_model.pkl",
    algorithm: "xgboost",
    versionTag: process.env.THYROID_MODEL_VERSION || "thyroid-v1",
    artifactUri: "ml_service/models/thyroid_model.pkl",
    datasetVersion: process.env.THYROID_DATASET_VERSION || null,
    baselineMetrics: {
      accuracy: 0.9947,
      precision: 0.94,
      recall: 1,
      falseAlarmRate: 0.00574,
      rocAuc: null,
      sampleSize: 755,
      metricScope: "binary_test_set_positive_class",
      classMetrics: {
        healthy: { precision: 1, recall: 0.99, support: 697 },
        thyroidPositive: { precision: 0.94, recall: 1, support: 58 },
      },
      confusionMatrix: {
        trueNegative: 693,
        falsePositive: 4,
        falseNegative: 0,
        truePositive: 58,
      },
      sourceNote:
        "Baseline metrics imported from Models.ipynb. False alarm rate is derived from the thyroid test-set confusion matrix implied by the notebook's reported accuracy, recall, and class supports.",
    },
  },
};

function getSpecialtyFromToolName(toolName) {
  if (toolName === "predict_cardiology") return "cardiology";
  if (toolName === "predict_diabetes") return "diabetes";
  if (toolName === "predict_thyroid") return "thyroid";
  return null;
}

function mapProbabilities(specialty, toolResult) {
  if (specialty === "cardiology") {
    const probabilities = Array.isArray(toolResult?.probabilities)
      ? toolResult.probabilities
      : [];

    return {
      class_0: probabilities[0] ?? null,
      class_1: probabilities[1] ?? null,
      class_2: probabilities[2] ?? null,
    };
  }

  const positiveProbability =
    typeof toolResult?.probability === "number" ? toolResult.probability : null;

  return {
    negative: positiveProbability == null ? null : Number((1 - positiveProbability).toFixed(4)),
    positive: positiveProbability,
  };
}

async function ensureModelBaselineMetrics(modelVersionId, specialty) {
  const baseline = MODEL_CONFIG_BY_SPECIALTY[specialty]?.baselineMetrics;
  if (!modelVersionId || !baseline) {
    return null;
  }

  const result = await pool.query(
    `
      INSERT INTO model_baseline_metrics (
        model_version_id,
        accuracy,
        precision,
        recall,
        false_alarm_rate,
        roc_auc,
        evaluation_sample_size,
        metric_scope,
        class_metrics_json,
        confusion_matrix_json,
        source_note,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, NOW())
      ON CONFLICT (model_version_id)
      DO UPDATE SET
        accuracy = EXCLUDED.accuracy,
        precision = EXCLUDED.precision,
        recall = EXCLUDED.recall,
        false_alarm_rate = EXCLUDED.false_alarm_rate,
        roc_auc = EXCLUDED.roc_auc,
        evaluation_sample_size = EXCLUDED.evaluation_sample_size,
        metric_scope = EXCLUDED.metric_scope,
        class_metrics_json = EXCLUDED.class_metrics_json,
        confusion_matrix_json = EXCLUDED.confusion_matrix_json,
        source_note = EXCLUDED.source_note,
        updated_at = NOW()
      RETURNING id, model_version_id
    `,
    [
      modelVersionId,
      baseline.accuracy,
      baseline.precision,
      baseline.recall,
      baseline.falseAlarmRate,
      baseline.rocAuc,
      baseline.sampleSize,
      baseline.metricScope,
      JSON.stringify(baseline.classMetrics || {}),
      JSON.stringify(baseline.confusionMatrix || {}),
      baseline.sourceNote,
    ],
  );

  return result.rows[0] || null;
}

async function ensureModelVersion(specialty) {
  const config = MODEL_CONFIG_BY_SPECIALTY[specialty];
  if (!config) {
    return null;
  }

  const activeResult = await pool.query(
    `
      SELECT id, specialty, model_name, algorithm, version_tag, is_active
      FROM model_versions
      WHERE LOWER(specialty) = $1 AND is_active = TRUE
      ORDER BY deployed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [specialty],
  );

  if (activeResult.rows[0]) {
    await ensureModelBaselineMetrics(activeResult.rows[0].id, specialty);
    return activeResult.rows[0];
  }

  const upsertResult = await pool.query(
    `
      INSERT INTO model_versions (
        specialty,
        model_name,
        algorithm,
        version_tag,
        artifact_uri,
        dataset_version,
        is_active,
        deployed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      ON CONFLICT (specialty, version_tag)
      DO UPDATE SET
        model_name = EXCLUDED.model_name,
        algorithm = EXCLUDED.algorithm,
        artifact_uri = EXCLUDED.artifact_uri,
        dataset_version = EXCLUDED.dataset_version,
        is_active = TRUE
      RETURNING id, specialty, model_name, algorithm, version_tag, is_active
    `,
    [
      specialty,
      config.modelName,
      config.algorithm,
      config.versionTag,
      config.artifactUri,
      config.datasetVersion,
    ],
  );

  await ensureModelBaselineMetrics(upsertResult.rows[0]?.id, specialty);
  return upsertResult.rows[0];
}

async function createPredictionEvent({
  specialty,
  extractedFeatures,
  toolResult,
  latencyMs,
  clerkUserId = null,
}) {
  const modelVersion = await ensureModelVersion(specialty);

  const result = await pool.query(
    `
      INSERT INTO prediction_events (
        model_version_id,
        clerk_user_id,
        specialty,
        predicted_label,
        predicted_value,
        probabilities_json,
        input_payload_json,
        response_payload_json,
        latency_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
      RETURNING id, specialty, predicted_label, predicted_value, created_at
    `,
    [
      modelVersion?.id || null,
      clerkUserId,
      specialty,
      toolResult?.label || "Unknown",
      Number.isInteger(toolResult?.prediction)
        ? toolResult.prediction
        : Number.isInteger(toolResult?.predicted_value)
          ? toolResult.predicted_value
          : null,
      JSON.stringify(mapProbabilities(specialty, toolResult)),
      // Persist the exact feature payload sent to the ML inference service.
      JSON.stringify(extractedFeatures || {}),
      // Persist the raw inference response returned from Render for auditability.
      JSON.stringify(toolResult || {}),
      latencyMs || null,
    ],
  );

  return result.rows[0];
}

module.exports = {
  ensureModelVersion,
  getSpecialtyFromToolName,
  createPredictionEvent,
};
