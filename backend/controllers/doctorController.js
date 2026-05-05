const doctorService = require("../services/doctorService");

async function listPatients(req, res) {
  try {
    const items = await doctorService.listPatientsForDoctor(req.auth?.clerkUserId);
    return res.json({ items });
  } catch (error) {
    console.error("[doctorController.listPatients]", error);

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message:
          "Patient sharing tables are not ready yet. Run backend/sql/patient_doctor_links.sql first.",
      });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type is not supported." });
    }

    return res.status(500).json({ message: "Failed to load linked patients." });
  }
}

async function getPatientSummary(req, res) {
  try {
    const item = await doctorService.getPatientSummaryForDoctor({
      doctorClerkUserId: req.auth?.clerkUserId,
      patientClerkUserId: req.params.id,
    });

    return res.json({ item });
  } catch (error) {
    console.error("[doctorController.getPatientSummary]", error);

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message:
          "Patient sharing tables are not ready yet. Run backend/sql/patient_doctor_links.sql first.",
      });
    }

    if (error.code === "PATIENT_NOT_LINKED") {
      return res.status(404).json({
        message: "Patient not found or has not shared data with this clinician.",
      });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type is not supported." });
    }

    return res.status(500).json({ message: "Failed to load patient summary." });
  }
}

module.exports = {
  listPatients,
  getPatientSummary,
};
