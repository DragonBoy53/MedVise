const express = require("express");
const doctorController = require("../controllers/doctorController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("clinician"));

router.get("/patients", doctorController.listPatients);
router.get("/patients/:id/summary", doctorController.getPatientSummary);

module.exports = router;
