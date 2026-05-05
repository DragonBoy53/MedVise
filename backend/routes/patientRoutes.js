const express = require("express");
const patientController = require("../controllers/patientController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/linked-doctors",
  requireAuth,
  requireRole("user"),
  patientController.listLinkedDoctors,
);

router.post(
  "/link-doctor",
  requireAuth,
  requireRole("user"),
  patientController.linkDoctor,
);

module.exports = router;
