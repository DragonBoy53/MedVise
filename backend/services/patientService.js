const pool = require("../db/pool");
const {
  findClinicianByIdentifier,
  getClerkUser,
  getPrimaryEmail,
} = require("./accountService");

function isSchemaError(error) {
  return error?.code === "42P01" || error?.code === "42703";
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
    const patientUser = await getClerkUser(patientClerkUserId);
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
          patient_email_snapshot,
          patient_name_snapshot,
          doctor_email_snapshot,
          doctor_name_snapshot,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
        ON CONFLICT (patient_user_id, doctor_user_id)
        DO UPDATE SET
          patient_email_snapshot = EXCLUDED.patient_email_snapshot,
          patient_name_snapshot = EXCLUDED.patient_name_snapshot,
          doctor_email_snapshot = EXCLUDED.doctor_email_snapshot,
          doctor_name_snapshot = EXCLUDED.doctor_name_snapshot,
          status = 'active',
          updated_at = NOW()
        RETURNING
          id,
          patient_user_id AS "patientUserId",
          doctor_user_id AS "doctorUserId",
          patient_email_snapshot AS "patientEmail",
          patient_name_snapshot AS "patientName",
          doctor_email_snapshot AS "doctorEmail",
          doctor_name_snapshot AS "doctorName",
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        patientClerkUserId,
        doctor.clerkUserId,
        getPrimaryEmail(patientUser),
        patientUser?.fullName ||
          [patientUser?.firstName, patientUser?.lastName].filter(Boolean).join(" ") ||
          null,
        doctor.email,
        doctor.displayName,
      ],
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

async function listLinkedDoctors(patientClerkUserId) {
  if (!patientClerkUserId) {
    const error = new Error("Authenticated patient Clerk user ID is required.");
    error.code = "UNSUPPORTED_AUTH";
    throw error;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          doctor_user_id AS "doctorUserId",
          doctor_email_snapshot AS "doctorEmail",
          doctor_name_snapshot AS "doctorName",
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM patient_doctor_links
        WHERE patient_user_id = $1
        ORDER BY updated_at DESC, created_at DESC
      `,
      [patientClerkUserId],
    );

    return result.rows;
  } catch (error) {
    if (isSchemaError(error)) {
      error.code = "SCHEMA_NOT_READY";
    }
    throw error;
  }
}

module.exports = {
  linkDoctorToPatient,
  listLinkedDoctors,
};
