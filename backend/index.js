require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer"); 
const fs = require("fs");         
const { GoogleGenAI } = require("@google/genai"); // Ensure you have installed @google/genai

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
  },
});

// Initialize Google AI
// Note: Depending on your exact SDK version, this initialization matches the new @google/genai lib
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure Multer for temp storage
const upload = multer({ dest: "/tmp" }); 

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

// 3. Chat Route (Updated to use your specific Image Understanding Logic)
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const message = req.body.message || ""; 
    const file = req.file;
    const modelName = "gemini-2.5-flash"; 

    // Initialize the contents array
    let contents = [];

    // 1. Handle Image (Prioritize adding image data first if it exists)
    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      const imageBase64 = imageBuffer.toString("base64");
      
      // Pushing the image object exactly as your snippet requires
      contents.push({
        inlineData: {
          mimeType: file.mimetype, // e.g., 'image/jpeg'
          data: imageBase64,
        },
      });
    }

    // 2. Handle Text (Push text object to the same array)
    // If no message is provided but an image is, we provide a default prompt
    const promptText = message || (file ? "Analyze this image." : "Hello");
    
    contents.push({ 
        text: promptText 
    });

    // 3. Generate Content
    // Passing the simple flat 'contents' array as seen in your sample code
    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
    });

    // Depending on the exact version of @google/genai, response.text might be a property or a function.
    // Based on your snippet "console.log(response.text)", we use the property access.
    // If you get undefined, try response.text()
    const replyText = response.text || "No response text found.";

    // 4. Cleanup Temp File
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.error("Cleanup error", e); }
    }

    res.json({ reply: replyText });

  } catch (error) {
    console.error("Gemini API Error:", error);
    
    // Cleanup on error as well
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    res.status(500).json({ 
      message: "AI Service Unavailable", 
      details: error.message 
    });
  }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;