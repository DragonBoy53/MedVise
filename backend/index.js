// index.js

// 1. --- IMPORTS ---
require("dotenv").config(); // Loads .env variables
const express = require("express");
const { Pool } = require("pg"); // PostgreSQL client
const bcrypt = require("bcryptjs"); // Password hashing
const jwt = require("jsonwebtoken"); // JSON Web Token
const cors = require("cors"); // Cross-Origin Resource Sharing

// 2. --- SETUP ---
const app = express();
const PORT = process.env.PORT || 3001; // Port to run the server on

// 3. --- MIDDLEWARE ---
app.use(cors()); // Allow requests from your Expo app
app.use(express.json()); // Parse incoming JSON bodies (e.g., from app)

// 4. --- DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 5. --- API ENDPOINTS (THE ROUTES) ---

// POST /api/register
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    // --- Validation ---
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: "Please provide all fields." });
    }

    // --- Check if user already exists ---
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use." });
    }

    // --- Hash the password ---
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // --- Save new user to database ---
    const newUser = await pool.query(
      "INSERT INTO users (fullName, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role",
      [fullName, email, passwordHash, role]
    );

    // --- Send success response ---
    res
      .status(201)
      .json({
        message: "User registered successfully!",
        user: newUser.rows[0],
      });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // --- Validation ---
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password." });
    }

    // --- Check if user exists ---
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const dbUser = user.rows[0];

    // --- Compare passwords ---
    const isMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // --- Create JWT Token ---
    const token = jwt.sign(
      {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" } // Token expires in 1 day
    );

    // --- Send success response with token ---
    res.status(200).json({
      message: "Login successful!",
      token: token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullname,
        role: dbUser.role,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// 6. --- START THE SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});