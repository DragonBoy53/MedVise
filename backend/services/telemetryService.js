const pool = require("../db/pool");

const MODEL_CONFIG_BY_SPECIALTY = {
  cardiology: {
    modelName: "medvise_cardio_xgboost.pkl",
    algorithm: "xgboost",
    versionTag: process.env.CARDIOLOGY_MODEL_VERSION || "cardiology-v1",
    artifactUri: "ml_service/models/medvise_cardio_xgboost.pkl",
    datasetVersion: process.env.CARDIOLOGY_DATASET_VERSION || null,
  },
  diabetes: {
    modelName: "diabetes_model.pkl",
    algorithm: "catboost",
    versionTag: process.env.DIABETES_MODEL_VERSION || "diabetes-v1",
    artifactUri: "ml_service/models/diabetes_model.pkl",
    datasetVersion: process.env.DIABETES_DATASET_VERSION || null,
  },
  thyroid: {
    modelName: "thyroid_model.pkl",
    algorithm: "xgboost",
    versionTag: process.env.THYROID_MODEL_VERSION || "thyroid-v1",
    artifactUri: "ml_service/models/thyroid_model.pkl",
    datasetVersion: process.env.THYROID_DATASET_VERSION || null,
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

  return upsertResult.rows[0];
}

async function createPredictionEvent({ specialty, extractedFeatures, toolResult, latencyMs }) {
  const modelVersion = await ensureModelVersion(specialty);

  const result = await pool.query(
    `
      INSERT INTO prediction_events (
        model_version_id,
        specialty,
        predicted_label,
        predicted_value,
        probabilities_json,
        input_payload_json,
        response_payload_json,
        latency_ms
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
      RETURNING id, specialty, predicted_label, predicted_value, created_at
    `,
    [
      modelVersion?.id || null,
      specialty,
      toolResult?.label || "Unknown",
      Number.isInteger(toolResult?.prediction) ? toolResult.prediction : null,
      JSON.stringify(mapProbabilities(specialty, toolResult)),
      JSON.stringify(extractedFeatures || {}),
      JSON.stringify(toolResult || {}),
      latencyMs || null,
    ],
  );

  return result.rows[0];
}

module.exports = {
  getSpecialtyFromToolName,
  createPredictionEvent,
};
