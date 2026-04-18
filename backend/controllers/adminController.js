const adminService = require("../services/adminService");

async function getAdminDashboard(req, res) {
  try {
    const summary = await adminService.getAdminSummary(req.auth.id);
    res.json(summary);
  } catch (error) {
    console.error("[adminController.getAdminDashboard]", error);
    res.status(500).json({ message: "Failed to load admin dashboard." });
  }
}

async function setupTwoFactor(req, res) {
  try {
    // TODO: Replace this placeholder with a real TOTP enrollment flow.
    res.status(501).json({
      message: "2FA setup skeleton created. Implement TOTP secret generation next.",
      steps: [
        "Generate a TOTP secret per admin user.",
        "Encrypt and store the secret in admin_2fa_secrets.",
        "Return an otpauth URL and QR code to the admin portal.",
      ],
    });
  } catch (error) {
    console.error("[adminController.setupTwoFactor]", error);
    res.status(500).json({ message: "Failed to initialize 2FA setup." });
  }
}

async function verifyTwoFactorSetup(req, res) {
  try {
    // TODO: Validate the first OTP code and mark 2FA as enabled.
    res.status(501).json({
      message: "2FA verification skeleton created. Implement OTP validation next.",
    });
  } catch (error) {
    console.error("[adminController.verifyTwoFactorSetup]", error);
    res.status(500).json({ message: "Failed to verify 2FA setup." });
  }
}

async function verifyTwoFactorChallenge(req, res) {
  try {
    // TODO: Verify submitted OTP, then issue a short-lived admin token with mfaVerified=true.
    res.status(501).json({
      message: "2FA challenge skeleton created. Issue an MFA-verified token here.",
    });
  } catch (error) {
    console.error("[adminController.verifyTwoFactorChallenge]", error);
    res.status(500).json({ message: "Failed to verify MFA challenge." });
  }
}

async function getMetricsOverview(req, res) {
  try {
    const metrics = await adminService.getMetricsOverview();
    res.json(metrics);
  } catch (error) {
    console.error("[adminController.getMetricsOverview]", error);
    res.status(500).json({ message: "Failed to load metrics overview." });
  }
}

async function listBackups(req, res) {
  try {
    const backups = await adminService.listBackupJobs();
    res.json({ items: backups });
  } catch (error) {
    console.error("[adminController.listBackups]", error);
    res.status(500).json({ message: "Failed to load backup jobs." });
  }
}

async function createBackup(req, res) {
  try {
    const job = await adminService.createBackupJob(req.auth.id);
    res.status(202).json({
      message: "Backup job queued. Attach a worker to run pg_dump and upload the artifact.",
      job,
    });
  } catch (error) {
    console.error("[adminController.createBackup]", error);
    res.status(500).json({ message: "Failed to queue backup job." });
  }
}

async function createRecovery(req, res) {
  try {
    const { backupJobId, targetEnv = "staging" } = req.body;

    if (!backupJobId) {
      return res.status(400).json({ message: "backupJobId is required." });
    }

    const job = await adminService.createRecoveryJob(
      req.auth.id,
      backupJobId,
      targetEnv,
    );

    return res.status(202).json({
      message:
        "Recovery job queued. Next step is implementing worker-side validation and restore orchestration.",
      job,
    });
  } catch (error) {
    console.error("[adminController.createRecovery]", error);
    res.status(500).json({ message: "Failed to queue recovery job." });
  }
}

async function listChatLogs(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const flaggedOnly = req.query.flaggedOnly === "true";
    const logs = await adminService.listChatLogs({ limit, flaggedOnly });
    res.json({ items: logs });
  } catch (error) {
    console.error("[adminController.listChatLogs]", error);
    res.status(500).json({ message: "Failed to load chat logs." });
  }
}

async function queueRetrainingFeedback(req, res) {
  try {
    const { id: chatSessionId } = req.params;
    const { notes } = req.body;
    const record = await adminService.queueRetrainingFeedback(
      chatSessionId,
      req.auth.id,
      notes,
    );

    res.status(201).json({
      message: "Interaction queued for retraining review.",
      record,
    });
  } catch (error) {
    console.error("[adminController.queueRetrainingFeedback]", error);
    res.status(500).json({ message: "Failed to queue retraining feedback." });
  }
}

module.exports = {
  getAdminDashboard,
  setupTwoFactor,
  verifyTwoFactorSetup,
  verifyTwoFactorChallenge,
  getMetricsOverview,
  listBackups,
  createBackup,
  createRecovery,
  listChatLogs,
  queueRetrainingFeedback,
};
