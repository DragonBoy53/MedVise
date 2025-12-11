require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer"); // ✅ Added for file uploads
const fs = require("fs");         // ✅ Added for file reading
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon/Vercel Postgres
  },
});

// Initialize Google AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure Multer for temp storage (Required for Vercel/Serverless)
const upload = multer({ dest: "/tmp" }); // ✅ Use /tmp for serverless environments

// --- ROUTES ---

// 1. Register
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    if (!fullName || !email || !password || !role) return res.status(400).json({ message: "All fields required" });

    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) return res.status(400).json({ message: "Email already in use" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      "INSERT INTO users (fullName, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role",
      [fullName, email, passwordHash, role]
    );

    res.status(201).json({ message: "User registered!", user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 2. Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing credentials" });

    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) return res.status(400).json({ message: "Invalid credentials" });

    const dbUser = user.rows[0];
    const isMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: dbUser.id, email: dbUser.email, role: dbUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful!",
      token: token,
      user: { id: dbUser.id, email: dbUser.email, fullName: dbUser.fullname, role: dbUser.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 3. Chat Route (Fixed for Images + Text)
// ✅ Added upload.single("image") middleware
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    // When using multer, text fields are in req.body, files in req.file
    const message = req.body.message || ""; 
    const file = req.file;

    // ✅ FIXED: Use the standard model name
    const modelName = "gemini-2.5-flash"; 

    let promptParts = [];

    // Add text if present
    if (message) {
      promptParts.push({ text: message });
    } else {
      promptParts.push({ text: "Analyze this image/report." });
    }

    // Add image if present
    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      const imageBase64 = imageBuffer.toString("base64");
      
      promptParts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: imageBase64
        }
      });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: promptParts
        }
      ],
    });

    const responseText = response.text || "No response generated.";
    
    // Cleanup temp file
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { /* ignore cleanup error */ }
    }

    res.json({ reply: responseText });

  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ 
      message: "AI Service Unavailable", 
      details: error.message 
    });
  }
});

// Only listen if running locally
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;