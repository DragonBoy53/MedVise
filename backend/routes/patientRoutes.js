const express = require("express");
const patientController = require("../controllers/patientController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/link-doctor",
  requireAuth,
  requireRole("user"),
  patientController.linkDoctor,
);

module.exports = router;
