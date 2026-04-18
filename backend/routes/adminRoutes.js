const express = require("express");
const adminController = require("../controllers/adminController");
const {
  requireAuth,
  requireRole,
  requireAdminMfa,
} = require("../middleware/auth");

const router = express.Router();

router.post(
  "/2fa/setup",
  requireAuth,
  requireRole("admin"),
  adminController.setupTwoFactor,
);
router.post(
  "/2fa/verify-setup",
  requireAuth,
  requireRole("admin"),
  adminController.verifyTwoFactorSetup,
);
router.post(
  "/2fa/verify",
  requireAuth,
  requireRole("admin"),
  adminController.verifyTwoFactorChallenge,
);

router.use(requireAuth, requireRole("admin"), requireAdminMfa);

router.get("/", adminController.getAdminDashboard);
router.get("/metrics", adminController.getMetricsOverview);
router.get("/backups", adminController.listBackups);
router.post("/backup", adminController.createBackup);
router.post("/recovery", adminController.createRecovery);
router.get("/chat-logs", adminController.listChatLogs);
router.post("/chat-logs/:id/retraining", adminController.queueRetrainingFeedback);
router.post("/predictions/:id/ground-truth", adminController.upsertPredictionGroundTruth);

module.exports = router;
