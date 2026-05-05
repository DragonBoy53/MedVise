const pool = require("../db/pool");

function isSchemaError(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function findClinicianByIdentifier(identifier) {
  const result = await pool.query(
    `
      SELECT
        clerk_user_id AS "clerkUserId"
      FROM users
      WHERE role = 'clinician'
        AND (clerk_user_id = $1 OR clinician_code = $1)
      LIMIT 1
    `,
    [identifier],
  );

  return result.rows[0] || null;
}

async function linkDoctorToPatient({ patientClerkUserId, doctorIdentifier }) {
  const normalizedIdentifier =
    typeof doctorIdentifier === "string" ? doctorIdentifier.trim() : "";

  if (!patientClerkUserId) {
    const error = new Error("Authenticated patient Clerk user ID is required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  if (!normalizedIdentifier) {
    const error = new Error("Doctor identifier is required.");
    error.code = "MISSING_DOCTOR_IDENTIFIER";
    throw error;
  }

  try {
    const doctor = await findClinicianByIdentifier(normalizedIdentifier);
    if (!doctor) {
      const error = new Error("Clinician was not found.");
      error.code = "CLINICIAN_NOT_FOUND";
      throw error;
    }

    if (doctor.clerkUserId === patientClerkUserId) {
      const error = new Error("Patients cannot link to themselves.");
      error.code = "SELF_LINK_NOT_ALLOWED";
      throw error;
    }

    const result = await pool.query(
      `
        INSERT INTO patient_doctor_links (
          patient_user_id,
          doctor_user_id,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'active', NOW(), NOW())
        ON CONFLICT (patient_user_id, doctor_user_id)
        DO UPDATE SET
          status = 'active',
          updated_at = NOW()
        RETURNING
          id,
          patient_user_id AS "patientUserId",
          doctor_user_id AS "doctorUserId",
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [patientClerkUserId, doctor.clerkUserId],
    );

    return {
      link: result.rows[0],
      doctor: {
        clerkUserId: doctor.clerkUserId,
        displayName: doctor.clerkUserId,
      },
    };
  } catch (error) {
    if (isSchemaError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  linkDoctorToPatient,
};
