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
        message:
          "Patient sharing tables are not ready yet. Run backend/sql/patient_doctor_links.sql first.",
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
          "Clinician not found. Confirm the doctor has a users row with role='clinician' and the submitted Clerk user ID.",
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

module.exports = {
  linkDoctor,
};
