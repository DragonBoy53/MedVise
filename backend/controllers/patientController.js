const patientService = require("../services/patientService");

async function linkDoctor(req, res) {
  try {
    const doctorIdentifier =
      req.body?.doctorIdentifier ||
      req.body?.doctorUserId ||
      req.body?.clinicianCode;

    const result = await patientService.linkDoctorToPatient({
      patientClerkUserId: req.auth?.clerkUserId,
      doctorIdentifier,
    });

    return res.status(201).json({
      message: "Doctor linked successfully.",
      ...result,
    });
  } catch (error) {
    console.error("[patientController.linkDoctor]", error);

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message: `Schema not ready — ${error.originalMessage || error.message}. Ensure both admin_portal_schema.sql and patient_doctor_links.sql have been applied to your NeonDB database.`,
      });
    }

    if (error.code === "MISSING_DOCTOR_IDENTIFIER") {
      return res.status(400).json({
        message: "doctorIdentifier, doctorUserId, or clinicianCode is required.",
      });
    }

    if (error.code === "CLINICIAN_NOT_FOUND") {
      return res.status(404).json({
        message:
          "Clinician not found. Confirm the submitted email, clinician code, or Clerk user ID belongs to a clinician account.",
      });
    }

    if (error.code === "SELF_LINK_NOT_ALLOWED") {
      return res.status(400).json({ message: "You cannot link your account to itself." });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type cannot link doctors." });
    }

    return res.status(500).json({ message: "Failed to link doctor." });
  }
}

async function listLinkedDoctors(req, res) {
  try {
    const items = await patientService.listLinkedDoctors(req.auth?.clerkUserId);
    return res.json({ items });
  } catch (error) {
    console.error("[patientController.listLinkedDoctors]", error);

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message: `Schema not ready — ${error.originalMessage || error.message}. Ensure both admin_portal_schema.sql and patient_doctor_links.sql have been applied to your NeonDB database.`,
      });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type cannot view shared doctors." });
    }

    return res.status(500).json({ message: "Failed to load linked doctors." });
  }
}

module.exports = {
  linkDoctor,
  listLinkedDoctors,
};
