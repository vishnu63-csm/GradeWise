const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const StudentResult = require("../models/StudentResult");
const Feedback = require("../models/Feedback");
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

// ── Public Feedback Endpoint ──────────────────────────────────────────────────
router.post("/feedback/public", async (req, res) => {
  try {
    const { category, subject, message, userRollNumber, userName } = req.body;
    if (!subject || !subject.trim() || !message || !message.trim()) {
      return res.status(400).json({ error: "Subject and message are required." });
    }
    const feedback = await Feedback.create({
      category: category || "General Feedback",
      subject: subject.trim(),
      message: message.trim(),
      userRollNumber: userRollNumber ? userRollNumber.trim().toUpperCase() : "Anonymous",
      userName: userName ? userName.trim() : "",
    });
    res.status(201).json({ success: true, feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All routes below require a valid JWT
router.use(authMiddleware);

// ── Authenticated Feedback Endpoint ──────────────────────────────────────────
router.post("/feedback", async (req, res) => {
  try {
    const { category, subject, message } = req.body;
    if (!subject || !subject.trim() || !message || !message.trim()) {
      return res.status(400).json({ error: "Subject and message are required." });
    }
    const feedback = await Feedback.create({
      category: category || "General Feedback",
      subject: subject.trim(),
      message: message.trim(),
      userRollNumber: req.user.rollNumber,
      userName: req.user.name || "",
    });
    res.status(201).json({ success: true, feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.json({ student: studentPlain, ...studentPlain, ...(derived || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/student/semester/update-grade — Backlog clearance & grade update
router.post("/student/semester/update-grade", async (req, res) => {
  try {
    const { semester, subject, subjectCode, newGrade } = req.body;
    if (!semester || (!subject && !subjectCode) || !newGrade) {
      return res.status(400).json({ error: "semester, subject/subjectCode, and newGrade are required." });
    }

    const validGrades = ["S", "A", "B", "C", "D", "E", "F", "Ab"];
    const formattedGrade = String(newGrade).trim();
    if (!validGrades.includes(formattedGrade)) {
      return res.status(400).json({ error: `Invalid grade: ${newGrade}. Must be one of S, A, B, C, D, E, F, Ab.` });
    }

    const student = await Student.findOne({ rollNumber: req.user.rollNumber });
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    if (student.category === "Lateral Entry" && (semester === "1-1" || semester === "1-2")) {
      return res.status(400).json({ error: "Lateral Entry students cannot modify 1-1 or 1-2 semester grades." });
    }

    const semRecord = student.semesters.find((s) => s.semester === semester);
    if (!semRecord) {
      return res.status(404).json({ error: `Semester ${semester} not found for this student.` });
    }

    const targetSub = semRecord.subjects.find(
      (s) => (subject && s.subject.toLowerCase() === String(subject).trim().toLowerCase()) ||
             (subjectCode && s.code && s.code.toLowerCase() === String(subjectCode).trim().toLowerCase())
    );

    if (!targetSub) {
      return res.status(404).json({ error: `Subject '${subject || subjectCode}' not found in semester ${semester}.` });
    }

    const previousGrade = targetSub.grade;
    const previousGradePoint = GRADE_POINTS[previousGrade] !== undefined ? GRADE_POINTS[previousGrade] : 0;
    const newGradePoint = GRADE_POINTS[formattedGrade];

    if (previousGrade === formattedGrade) {
      return res.status(400).json({ error: `Subject already has grade ${formattedGrade}.` });
    }

    // Update grade and gradePoint
    targetSub.grade = formattedGrade;
    targetSub.gradePoint = newGradePoint;

    // Audit record on subject
    if (!targetSub.history) targetSub.history = [];
    targetSub.history.push({
      previousGrade,
      previousGradePoint,
      newGrade: formattedGrade,
      newGradePoint,
      updatedAt: new Date(),
      updatedBy: req.user.rollNumber || req.user.name || "Student",
    });

    // Audit record on student gradeHistory
    if (!student.gradeHistory) student.gradeHistory = [];
    student.gradeHistory.push({
      semester,
      subjectCode: targetSub.code || "",
      subjectName: targetSub.subject,
      previousGrade,
      previousGradePoint,
      newGrade: formattedGrade,
      newGradePoint,
      attemptDate: new Date(),
      updatedBy: req.user.rollNumber || "Student",
    });

    // Recalculate semester SGPA
    const { sgpa, credits } = calcSgpa(semRecord.subjects);
    semRecord.sgpa = sgpa;
    semRecord.credits = credits;

    await student.save();

    const studentPlain = student.toObject();
    const derived = computeCgpaFromSemesters(studentPlain.semesters, studentPlain.category);
    const sgpaPct = (sgpa - 0.75) * 10;

    res.json({
      success: true,
      message: `Grade updated from ${previousGrade} to ${formattedGrade} for ${targetSub.subject}. SGPA & CGPA recalculated.`,
      semester,
      sgpa,
      sgpaPct,
      credits,
      ...(derived || {}),
      student: studentPlain,
      historyRecord: studentPlain.gradeHistory[studentPlain.gradeHistory.length - 1],
    });
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

// GET /api/student/results — all published results for this student
router.get("/student/results", async (req, res) => {
  try {
    const roll = req.user.rollNumber;
    if (!roll) return res.status(400).json({ error: "No roll number on account." });

    const results = await StudentResult.find({
      rollNumber: roll,
      isPublished: true,
    })
      .sort({ semester: 1, publishedAt: -1 })
      .lean();

    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/results/latest — most recently published result
router.get("/student/results/latest", async (req, res) => {
  try {
    const roll = req.user.rollNumber;
    if (!roll) return res.status(400).json({ error: "No roll number on account." });

    const result = await StudentResult.findOne({
      rollNumber: roll,
      isPublished: true,
    })
      .sort({ publishedAt: -1 })
      .lean();

    if (!result) return res.json({ result: null });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/results/:semester — result for a specific semester
router.get("/student/results/:semester", async (req, res) => {
  try {
    const roll = req.user.rollNumber;
    const { semester } = req.params;
    if (!roll) return res.status(400).json({ error: "No roll number on account." });

    const result = await StudentResult.findOne({
      rollNumber: roll,
      semester,
      isPublished: true,
    })
      .sort({ publishedAt: -1 })
      .lean();

    if (!result) return res.status(404).json({ error: "No published result found for this semester." });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
