require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const os = require("os");
const chatController = require("./controllers/chatController");
const adminRoutes = require("./routes/adminRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const { optionalAuth, requireAuth, requireRole } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: os.tmpdir() });

app.post("/api/register", async (req, res) => {
  res.status(410).json({
    message:
      "Local password registration has been retired. Create users through Clerk sign-up and assign roles through Clerk metadata.",
  });
});

app.post("/api/login", async (req, res) => {
  res.status(410).json({
    message:
      "Local login has been retired. Sign in through Clerk on the client, then send the Clerk session token as a Bearer token.",
  });
});

app.get("/api/admin/test", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    res.status(200).json({
      message: "Admin access granted via Clerk!",
      userId: req.auth.clerkUserId,
      role: req.auth.role,
      sessionId: req.auth.sessionId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/chat", upload.single("image"), optionalAuth, chatController);
app.use("/api/admin", adminRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/recommendations", recommendationRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
