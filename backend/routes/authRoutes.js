const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/onboarding/complete", requireAuth, authController.completeOnboarding);

module.exports = router;
