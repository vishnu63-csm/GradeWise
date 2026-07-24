const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Student = require("../models/Student");

const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";
const JWT_EXPIRES = "7d";

function makeToken(user) {
  return jwt.sign(
    { id: user._id, rollNumber: user.rollNumber, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, rollNumber, dept, phone, password } = req.body;
    if (!name || !rollNumber || !dept || !phone || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: "Phone must be 10 digits." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const roll = rollNumber.trim().toUpperCase();

    const exists = await User.findOne({ rollNumber: roll });
    if (exists) {
      return res.status(409).json({ error: "Roll number already registered. Please log in." });
    }

    const user = new User({ name, rollNumber: roll, dept, phone, passwordHash: password });
    await user.save();

    const student = new Student({ name, rollNumber: roll, dept, phone, semesters: [] });
    await student.save();

    const token = makeToken(user);
    res.status(201).json({
      token,
      user: { name: user.name, rollNumber: user.rollNumber, dept: user.dept, phone: user.phone },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Roll number already registered." });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { rollNumber, password } = req.body;
    if (!rollNumber || !password) {
      return res.status(400).json({ error: "Roll number and password are required." });
    }
    const roll = rollNumber.trim().toUpperCase();
    const user = await User.findOne({ rollNumber: roll });
    if (!user) {
      return res.status(401).json({ error: "Roll number not found. Please register first." });
    }
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    const token = makeToken(user);
    res.json({
      token,
      user: { name: user.name, rollNumber: user.rollNumber, dept: user.dept, phone: user.phone },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me  (protected)
const authMiddleware = require("../middleware/auth");
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
