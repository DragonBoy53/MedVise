const pool = require("../db/pool");

function isUndefinedTableError(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function resolveOwnershipFilter(auth) {
  if (auth?.clerkUserId) {
    return {
      column: "pe.clerk_user_id",
      value: auth.clerkUserId,
    };
  }

  const error = new Error("Authenticated user does not have a supported identity.");
  error.code = "UNSUPPORTED_AUTH";
  throw error;
}

function mapPredictionRow(row) {
  return {
    id: row.id,
    chatSessionId: row.chatSessionId,
    modelVersionId: row.modelVersionId,
    specialty: row.specialty,
    predictedLabel: row.predictedLabel,
    predictedValue: row.predictedValue,
    probabilities: row.probabilities || {},
    inputPayload: row.inputPayload || {},
    responsePayload: row.responsePayload || {},
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
    groundTruth: row.groundTruthId
      ? {
          id: row.groundTruthId,
          predictionEventId: row.id,
          actualLabel: row.actualLabel,
          actualValue: row.actualValue,
          labelSource: row.labelSource,
          isPredictionCorrect: row.isPredictionCorrect,
          enteredByClerkUserId: row.enteredByClerkUserId,
          createdAt: row.groundTruthCreatedAt,
        }
      : null,
  };
}

function deriveGroundTruthFromPrediction(event, isPredictionCorrect) {
  if (isPredictionCorrect) {
    return {
      actualValue: event.predictedValue,
      actualLabel: event.predictedLabel || "Confirmed prediction",
    };
  }

  if (event.specialty === "diabetes" || event.specialty === "thyroid") {
    const nextValue = event.predictedValue === 1 ? 0 : 1;
    return {
      actualValue: nextValue,
      actualLabel: nextValue === 1 ? "Confirmed Positive" : "Confirmed Negative",
    };
  }

  if (event.specialty === "cardiology") {
    const actualValue = event.predictedValue === 0 ? 1 : 0;
    return {
      actualValue,
      actualLabel:
        actualValue > 0 ? "Confirmed Disease" : "Confirmed Healthy / No Disease",
    };
  }

  return {
    actualValue: null,
    actualLabel: "User marked this prediction as false",
  };
}

async function listPredictionsForUser(auth) {
  const ownership = resolveOwnershipFilter(auth);

  try {
    const result = await pool.query(
      `
        SELECT
          pe.id,
          pe.chat_session_id AS "chatSessionId",
          pe.model_version_id AS "modelVersionId",
          pe.specialty,
          pe.predicted_label AS "predictedLabel",
          pe.predicted_value AS "predictedValue",
          pe.probabilities_json AS probabilities,
          pe.input_payload_json AS "inputPayload",
          pe.response_payload_json AS "responsePayload",
          pe.latency_ms AS "latencyMs",
          pe.created_at AS "createdAt",
          pgt.id AS "groundTruthId",
          pgt.actual_label AS "actualLabel",
          pgt.actual_value AS "actualValue",
          pgt.label_source AS "labelSource",
          pgt.is_prediction_correct AS "isPredictionCorrect",
          pgt.entered_by_clerk_user_id AS "enteredByClerkUserId",
          pgt.created_at AS "groundTruthCreatedAt"
        FROM prediction_events pe
        LEFT JOIN prediction_ground_truth pgt ON pgt.prediction_event_id = pe.id
        WHERE ${ownership.column} = $1
        ORDER BY pe.created_at DESC
      `,
      [ownership.value],
    );

    return result.rows.map(mapPredictionRow);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function getPredictionForUser(predictionEventId, auth) {
  const ownership = resolveOwnershipFilter(auth);

  try {
    const result = await pool.query(
      `
        SELECT
          pe.id,
          pe.chat_session_id AS "chatSessionId",
          pe.model_version_id AS "modelVersionId",
          pe.specialty,
          pe.predicted_label AS "predictedLabel",
          pe.predicted_value AS "predictedValue",
          pe.probabilities_json AS probabilities,
          pe.input_payload_json AS "inputPayload",
          pe.response_payload_json AS "responsePayload",
          pe.latency_ms AS "latencyMs",
          pe.created_at AS "createdAt",
          pgt.id AS "groundTruthId",
          pgt.actual_label AS "actualLabel",
          pgt.actual_value AS "actualValue",
          pgt.label_source AS "labelSource",
          pgt.is_prediction_correct AS "isPredictionCorrect",
          pgt.entered_by_clerk_user_id AS "enteredByClerkUserId",
          pgt.created_at AS "groundTruthCreatedAt"
        FROM prediction_events pe
        LEFT JOIN prediction_ground_truth pgt ON pgt.prediction_event_id = pe.id
        WHERE pe.id = $1 AND ${ownership.column} = $2
        LIMIT 1
      `,
      [predictionEventId, ownership.value],
    );

    if (!result.rows[0]) {
      const error = new Error("Prediction not found.");
      error.code = "PREDICTION_NOT_FOUND";
      throw error;
    }

    return mapPredictionRow(result.rows[0]);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function labelPredictionForUser(predictionEventId, auth, isPredictionCorrect) {
  const event = await getPredictionForUser(predictionEventId, auth);
  const derivedTruth = deriveGroundTruthFromPrediction(event, isPredictionCorrect);

  try {
    const result = await pool.query(
      `
        INSERT INTO prediction_ground_truth (
          prediction_event_id,
          actual_label,
          actual_value,
          label_source,
          entered_by,
          entered_by_clerk_user_id,
          is_prediction_correct
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (prediction_event_id)
        DO UPDATE SET
          actual_label = EXCLUDED.actual_label,
          actual_value = EXCLUDED.actual_value,
          label_source = EXCLUDED.label_source,
          entered_by = EXCLUDED.entered_by,
          entered_by_clerk_user_id = EXCLUDED.entered_by_clerk_user_id,
          is_prediction_correct = EXCLUDED.is_prediction_correct,
          created_at = NOW()
        RETURNING
          id,
          prediction_event_id AS "predictionEventId",
          actual_label AS "actualLabel",
          actual_value AS "actualValue",
          label_source AS "labelSource",
          entered_by_clerk_user_id AS "enteredByClerkUserId",
          is_prediction_correct AS "isPredictionCorrect",
          created_at AS "createdAt"
      `,
      [
        predictionEventId,
        derivedTruth.actualLabel,
        derivedTruth.actualValue,
        "user_feedback",
        auth?.localUserId || null,
        auth?.clerkUserId || null,
        isPredictionCorrect,
      ],
    );

    return {
      event,
      groundTruth: result.rows[0],
    };
  } catch (error) {
    if (isUndefinedTableError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  listPredictionsForUser,
  getPredictionForUser,
  labelPredictionForUser,
};
