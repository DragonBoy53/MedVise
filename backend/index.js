
require("dotenv").config(); 
const express = require("express");
const { Pool } = require("pg"); 
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 
const cors = require("cors"); 

const app = express();
const PORT = process.env.PORT || 3001; 


app.use(cors()); 
app.use(express.json()); 


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;


    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: "Please provide all fields." });
    }


    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use." });
    }

   
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

  
    const newUser = await pool.query(
      "INSERT INTO users (fullName, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role",
      [fullName, email, passwordHash, role]
    );

 
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


app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

 
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password." });
    }

  
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const dbUser = user.rows[0];


    const isMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }


    const token = jwt.sign(
      {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" } 
    );

 
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
