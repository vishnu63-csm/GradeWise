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

const {
  validateName,
  validateRollNumber,
  validateDepartment,
  validatePhone,
  validateCategory,
} = require("../utils/validation");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, rollNumber, dept, phone, password, category } = req.body;

    // 1. Password basic check
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    // 2. Validate Category
    const catVal = validateCategory(category);
    if (!catVal.valid) return res.status(400).json({ error: catVal.message });

    // 3. Validate Name
    const nameVal = validateName(name);
    if (!nameVal.valid) return res.status(400).json({ error: nameVal.message });

    // 4. Validate Roll Number
    const rollVal = validateRollNumber(rollNumber, catVal.value);
    if (!rollVal.valid) return res.status(400).json({ error: rollVal.message });

    // 5. Validate Department
    const deptVal = validateDepartment(dept);
    if (!deptVal.valid) return res.status(400).json({ error: deptVal.message });

    // 6. Validate Phone
    const phoneVal = validatePhone(phone);
    if (!phoneVal.valid) return res.status(400).json({ error: phoneVal.message });

    const finalRoll = rollVal.value;
    const finalPhone = phoneVal.value;
    const finalName = nameVal.value;
    const finalDept = deptVal.value;
    const finalCategory = catVal.value;

    // 7. Check Uniqueness (Roll Number)
    const rollExists = await User.findOne({ rollNumber: finalRoll });
    if (rollExists) {
      return res.status(409).json({ error: "Roll number is already registered. Please log in." });
    }

    // 8. Check Uniqueness (Phone Number)
    const phoneExistsUser = await User.findOne({ phone: finalPhone });
    const phoneExistsStudent = await Student.findOne({ phone: finalPhone });
    if (phoneExistsUser || phoneExistsStudent) {
      return res.status(409).json({ error: "Phone number is already registered with another account." });
    }

    // Create User & Student records
    const user = new User({
      name: finalName,
      rollNumber: finalRoll,
      dept: finalDept,
      phone: finalPhone,
      passwordHash: password,
    });
    await user.save();

    const student = new Student({
      name: finalName,
      rollNumber: finalRoll,
      dept: finalDept,
      phone: finalPhone,
      semesters: [],
      category: finalCategory,
    });
    await student.save();

    const token = makeToken(user);
    res.status(201).json({
      token,
      user: { name: user.name, rollNumber: user.rollNumber, dept: user.dept, phone: user.phone },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      if (field === "phone") {
        return res.status(409).json({ error: "Phone number already registered." });
      }
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
