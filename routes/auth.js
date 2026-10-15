const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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
    const { name, rollNumber, dept, phone, password, category, email } = req.body;

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
      email: email ? String(email).trim().toLowerCase() : undefined,
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
      user: { name: user.name, rollNumber: user.rollNumber, dept: user.dept, phone: user.phone, email: user.email },
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
    const { rollNumber, password, identifier } = req.body;
    const inputStr = (rollNumber || identifier || "").trim();
    if (!inputStr || !password) {
      return res.status(400).json({ error: "Roll number and password are required." });
    }
    const isEmail = inputStr.includes("@");
    const query = isEmail ? { email: inputStr.toLowerCase() } : { rollNumber: inputStr.toUpperCase() };
    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ error: "Account not found. Please register first." });
    }
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    const token = makeToken(user);
    res.json({
      token,
      user: { name: user.name, rollNumber: user.rollNumber, dept: user.dept, phone: user.phone, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { sendPasswordResetEmail } = require("../utils/email");

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}•@${domain}`;
  }
  return `${local.slice(0, 2)}${"•".repeat(Math.min(local.length - 2, 5))}@${domain}`;
}

const resetCooldowns = new Map(); // identifier/ip -> timestamp

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { identifier, email, rollNumber } = req.body;
    const input = (identifier || email || rollNumber || "").trim();
    const clientIp = req.ip || req.headers["x-forwarded-for"] || "client";
    const cooldownKey = `${clientIp}:${input.toLowerCase()}`;
    const now = Date.now();

    const genericSuccessResponse = {
      success: true,
      message: "We've sent password reset instructions to the email address associated with your GradeWise account.",
    };

    if (!input) return res.status(200).json(genericSuccessResponse);

    // Rate limit check: 30 seconds cooldown per request
    const lastRequest = resetCooldowns.get(cooldownKey);
    if (lastRequest && now - lastRequest < 30000) {
      const waitSecs = Math.ceil((30000 - (now - lastRequest)) / 1000);
      return res.status(429).json({
        error: "rate_limited",
        message: `Please wait ${waitSecs} seconds before requesting another password reset email.`,
        retryAfter: waitSecs,
      });
    }

    resetCooldowns.set(cooldownKey, now);

    const isEmail = input.includes("@");
    const query = isEmail ? { email: input.toLowerCase() } : { rollNumber: input.toUpperCase() };
    const user = await User.findOne(query);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour validity
      await user.save();

      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
      const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      // Target email: either stored on user or input if input was email
      const targetEmail = user.email || (isEmail ? input.toLowerCase() : null);

      console.log(`[PASSWORD RESET AUDIT] User found (${user.rollNumber}). Target Email: ${targetEmail || "No email on file"}`);

      if (targetEmail) {
        const mailResult = await sendPasswordResetEmail(targetEmail, resetUrl);
        if (!mailResult.sent) {
          console.error(`[PASSWORD RESET ERROR] Provider failed for ${user.rollNumber}: ${mailResult.error}`);
          return res.status(502).json({
            success: false,
            error: "provider_failed",
            message: "We couldn't send the reset email. Please try again in a few moments.",
          });
        }
        return res.status(200).json({
          ...genericSuccessResponse,
          maskedEmail: maskEmail(targetEmail),
        });
      }
    } else {
      console.log(`[PASSWORD RESET AUDIT] Reset requested for non-existent identifier: ${input}`);
    }

    // Non-enumerating generic response
    res.status(200).json(genericSuccessResponse);
  } catch (err) {
    console.error("[PASSWORD RESET ERROR]", err);
    res.status(500).json({ error: "An error occurred while processing password reset request." });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Reset token is required." });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired password reset token." });
    }

    user.passwordHash = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successfully. You can now login with your new password." });
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
