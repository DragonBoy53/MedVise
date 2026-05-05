const { updateOnboardingRole } = require("../services/accountService");

async function completeOnboarding(req, res) {
  try {
    const role = String(req.body?.role || "").trim().toLowerCase();

    if (!["user", "clinician"].includes(role)) {
      return res.status(400).json({
        message: "role must be either 'user' or 'clinician'.",
      });
    }

    const result = await updateOnboardingRole({
      clerkUserId: req.auth?.clerkUserId,
      role,
    });

    return res.status(200).json({
      message: "Account onboarding completed.",
      item: result,
    });
  } catch (error) {
    console.error("[authController.completeOnboarding]", error);

    if (error.code === "CLERK_NOT_CONFIGURED") {
      return res.status(503).json({
        message: "Clerk backend is not configured on the server.",
      });
    }

    return res.status(500).json({ message: "Failed to complete onboarding." });
  }
}

module.exports = {
  completeOnboarding,
};
