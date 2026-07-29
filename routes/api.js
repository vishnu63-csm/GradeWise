const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const authMiddleware = require("../middleware/auth");

const GRADE_POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, Ab: 0 };

function calcSgpa(subjects) {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const sub of subjects) {
    const gp = GRADE_POINTS[sub.grade];
    if (gp === undefined) throw new Error(`Invalid grade: ${sub.grade}`);
    const credits = Number(sub.credits);
    if (Number.isNaN(credits) || credits < 0) {
      throw new Error(`Invalid credits for subject: ${sub.subject}`);
    }
    totalCredits += credits;
    totalPoints += credits * gp;
  }
  if (totalCredits === 0) throw new Error("Total credits cannot be zero");
  return {
    sgpa: totalPoints / totalCredits, // Full precision internally
    credits: totalCredits,
  };
}

function computeCgpaFromSemesters(semesters, category) {
  let totalCredits = 0;
  let weighted = 0;
  for (const s of semesters || []) {
    if (category === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2")) {
      continue;
    }
    totalCredits += s.credits;
    weighted += s.credits * s.sgpa;
  }
  if (totalCredits === 0) return null;
  const cgpa = weighted / totalCredits; // Unrounded internal
  const percentage = (cgpa - 0.75) * 10;
  return { cgpa, percentage, totalCredits };
}

// All routes below require a valid JWT
router.use(authMiddleware);

// GET /api/student
router.get("/student", async (req, res) => {
  try {
    const student = await Student.findOne({
      rollNumber: req.user.rollNumber,
    }).lean();
    if (!student) return res.status(404).json({ error: "Student record not found." });
    const derived = computeCgpaFromSemesters(student.semesters, student.category);
    res.json({ ...student, ...(derived || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/student/semester
router.post("/student/semester", async (req, res) => {
  try {
    const { semester, subjects } = req.body;
    if (!semester || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ error: "semester and subjects[] are required" });
    }
    const { sgpa, credits } = calcSgpa(subjects);

    const student = await Student.findOne({ rollNumber: req.user.rollNumber });
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    if (student.category === "Lateral Entry" && (semester === "1-1" || semester === "1-2")) {
      return res.status(400).json({ error: "Lateral Entry students cannot enter 1-1 or 1-2 semesters." });
    }

    const existingIdx = student.semesters.findIndex((s) => s.semester === semester);
    const record = { semester, subjects, credits, sgpa };
    if (existingIdx >= 0) {
      student.semesters[existingIdx] = record;
    } else {
      student.semesters.push(record);
    }
    await student.save();

    const studentPlain = student.toObject();
    const derived = computeCgpaFromSemesters(studentPlain.semesters, studentPlain.category);
    const sgpaPct = (sgpa - 0.75) * 10;
    res.json({ sgpa, sgpaPct, credits, ...(derived || {}), student: studentPlain });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/student/semester/:semester
router.delete("/student/semester/:semester", async (req, res) => {
  try {
    const student = await Student.findOne({ rollNumber: req.user.rollNumber });
    if (!student) return res.status(404).json({ error: "Student record not found." });
    student.semesters = student.semesters.filter(
      (s) => s.semester !== req.params.semester
    );
    await student.save();
    const studentPlain = student.toObject();
    const derived = computeCgpaFromSemesters(studentPlain.semesters, studentPlain.category);
    res.json({ ...studentPlain, ...(derived || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/student/category
router.put("/student/category", async (req, res) => {
  try {
    const { category } = req.body;
    if (category !== "Regular Entry" && category !== "Lateral Entry") {
      return res.status(400).json({ error: "Invalid category" });
    }
    const student = await Student.findOne({ rollNumber: req.user.rollNumber });
    if (!student) return res.status(404).json({ error: "Student record not found." });
    
    student.category = category;
    await student.save();
    
    const studentPlain = student.toObject();
    const derived = computeCgpaFromSemesters(studentPlain.semesters, studentPlain.category);
    res.json({ ...studentPlain, ...(derived || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
