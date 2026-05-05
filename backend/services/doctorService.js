const pool = require("../db/pool");

function isSchemaError(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function mapRiskLevel(row) {
  const label = String(row.predictedLabel || "").toLowerCase();
  const value = Number(row.predictedValue);

  if (label.includes("high") || label.includes("severe") || value > 1) {
    return "High Risk";
  }

  if (
    label.includes("positive") ||
    label.includes("disease") ||
    label.includes("risk") ||
    value === 1
  ) {
    return "Elevated Risk";
  }

  if (label.includes("healthy") || label.includes("negative") || value === 0) {
    return "Low Risk";
  }

  return row.predictedLabel || "Unknown";
}

function mapPrediction(row) {
  return {
    id: row.id,
    specialty: row.specialty,
    predictedLabel: row.predictedLabel,
    predictedValue: row.predictedValue,
    riskLevel: mapRiskLevel(row),
    probabilities: row.probabilities || {},
    createdAt: row.createdAt,
  };
}

async function listPatientsForDoctor(doctorClerkUserId) {
  if (!doctorClerkUserId) {
    const error = new Error("Authenticated clinician Clerk user ID is required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          pdl.patient_user_id AS "patientUserId",
          pdl.patient_email_snapshot AS "patientEmail",
          pdl.patient_name_snapshot AS "patientName",
          pdl.status,
          pdl.created_at AS "linkedAt",
          COUNT(pe.id)::int AS "predictionCount",
          MAX(pe.created_at) AS "lastPredictionAt"
        FROM patient_doctor_links pdl
        LEFT JOIN prediction_events pe
          ON pe.clerk_user_id = pdl.patient_user_id
        WHERE pdl.doctor_user_id = $1
          AND pdl.status = 'active'
        GROUP BY pdl.patient_user_id, pdl.patient_email_snapshot, pdl.patient_name_snapshot, pdl.status, pdl.created_at
        ORDER BY MAX(pe.created_at) DESC NULLS LAST, pdl.created_at DESC
      `,
      [doctorClerkUserId],
    );

    return result.rows.map((row) => ({
      patientUserId: row.patientUserId,
      displayName:
        row.patientName ||
        row.patientEmail ||
        `Patient ${String(row.patientUserId).slice(-6)}`,
      email: row.patientEmail || null,
      status: row.status,
      linkedAt: row.linkedAt,
      predictionCount: row.predictionCount,
      lastPredictionAt: row.lastPredictionAt,
    }));
  } catch (error) {
    if (isSchemaError(error)) {
      error.originalMessage = error.message;
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

async function getPatientSummaryForDoctor({ doctorClerkUserId, patientClerkUserId }) {
  if (!doctorClerkUserId || !patientClerkUserId) {
    const error = new Error("Doctor and patient Clerk user IDs are required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  try {
    // Data isolation rule: every doctor detail read starts by proving there is
    // an active patient_doctor_links row for this exact doctor and patient.
    const linkResult = await pool.query(
      `
        SELECT
          id,
          patient_email_snapshot AS "patientEmail",
          patient_name_snapshot AS "patientName"
        FROM patient_doctor_links
        WHERE doctor_user_id = $1
          AND patient_user_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [doctorClerkUserId, patientClerkUserId],
    );

    if (!linkResult.rows[0]) {
      const error = new Error("Patient is not linked to this clinician.");
      error.code = "PATIENT_NOT_LINKED";
      throw error;
    }

    const predictionsResult = await pool.query(
      `
        SELECT
          pe.id,
          pe.specialty,
          pe.predicted_label AS "predictedLabel",
          pe.predicted_value AS "predictedValue",
          pe.probabilities_json AS probabilities,
          pe.created_at AS "createdAt"
        FROM prediction_events pe
        -- This join is the authorization boundary. A clinician can only read
        -- prediction rows whose clerk_user_id is actively linked to them.
        INNER JOIN patient_doctor_links pdl
          ON pdl.patient_user_id = pe.clerk_user_id
          AND pdl.doctor_user_id = $1
          AND pdl.status = 'active'
        WHERE pe.clerk_user_id = $2
        ORDER BY pe.created_at DESC
        LIMIT 20
      `,
      [doctorClerkUserId, patientClerkUserId],
    );

    const summariesResult = await pool.query(
      `
        SELECT
          cs.id,
          cs.specialty,
          cs.summary,
          cs.started_at AS "startedAt",
          cs.last_message_at AS "lastMessageAt"
        FROM chat_sessions cs
        -- Same isolation check for chat summaries: the saved session must belong
        -- to a Clerk user ID that is actively linked to the current clinician.
        INNER JOIN patient_doctor_links pdl
          ON pdl.patient_user_id = cs.clerk_user_id
          AND pdl.doctor_user_id = $1
          AND pdl.status = 'active'
        WHERE cs.clerk_user_id = $2
          AND cs.summary IS NOT NULL
          AND BTRIM(cs.summary) <> ''
        ORDER BY cs.last_message_at DESC
        LIMIT 10
      `,
      [doctorClerkUserId, patientClerkUserId],
    );

    const messagesResult = await pool.query(
      `
        SELECT
          cm.id,
          cm.chat_session_id AS "chatSessionId",
          cm.sender_role AS "senderRole",
          cm.content_redacted AS "content",
          cm.created_at AS "createdAt"
        FROM chat_messages cm
        INNER JOIN chat_sessions cs
          ON cs.id = cm.chat_session_id
        INNER JOIN patient_doctor_links pdl
          ON pdl.patient_user_id = cs.clerk_user_id
          AND pdl.doctor_user_id = $1
          AND pdl.status = 'active'
        WHERE cs.clerk_user_id = $2
        ORDER BY cm.created_at DESC
        LIMIT 30
      `,
      [doctorClerkUserId, patientClerkUserId],
    );

    return {
      patient: {
        patientUserId: patientClerkUserId,
        displayName:
          linkResult.rows[0]?.patientName ||
          linkResult.rows[0]?.patientEmail ||
          `Patient ${String(patientClerkUserId).slice(-6)}`,
        email: linkResult.rows[0]?.patientEmail || null,
      },
      summaries: summariesResult.rows,
      predictions: predictionsResult.rows.map(mapPrediction),
      messages: messagesResult.rows,
    };
  } catch (error) {
    if (isSchemaError(error)) {
      error.originalMessage = error.message;
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  listPatientsForDoctor,
  getPatientSummaryForDoctor,
};
