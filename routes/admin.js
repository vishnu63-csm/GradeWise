/**
 * routes/admin.js — GradeWise Admin API
 *
 * All routes below /api/admin/ (except /login) require admin JWT.
 *
 * Upload workflow:
 *   POST /upload-pdf         → parse PDF → save as DRAFT → return preview
 *   POST /upload/:id/publish → mark StudentResults as published, update upload status
 *   POST /upload/:id/unpublish
 *   GET  /uploads            → list all uploads
 *   GET  /upload/:id         → detail + student results
 *   DELETE /upload/:id       → delete upload + its results
 *
 * Roll Number Rules:
 *   GET/POST /roll-rules
 *   PUT/DELETE /roll-rules/:id
 *
 * Analytics:
 *   GET /analytics
 *
 * Misc:
 *   GET /dashboard
 *   GET /students
 */

"use strict";

const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const Admin         = require("../models/Admin");
const ResultUpload  = require("../models/ResultUpload");
const StudentResult = require("../models/StudentResult");
const RollNumberRule = require("../models/RollNumberRule");
const AuditLog      = require("../models/AuditLog");
const Feedback      = require("../models/Feedback");
const adminAuth     = require("../middleware/adminAuth");
const { parseResultPdf } = require("../utils/pdfParser");

async function logAudit(action, adminUsername, details, uploadId = null, targetRollNumber = null) {
  try {
    await AuditLog.create({
      action,
      adminUsername: adminUsername || "Admin",
      details: details || "",
      uploadId,
      targetRollNumber,
    });
  } catch (err) {
    console.error("[AuditLog error]", err.message);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";
const GRADE_POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, Ab: 0 };

// ── Helper: make admin JWT ────────────────────────────────────────────────────
function makeAdminToken(admin) {
  return jwt.sign(
    { id: admin._id, username: admin.username, name: admin.name, role: admin.role, isAdmin: true },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ── Helper: classify roll number via rules ────────────────────────────────────
async function classifyRoll(rollNumber) {
  const rule = await RollNumberRule.matchRoll(rollNumber);
  if (!rule) return { department: "", admissionType: "Unknown" };
  return { department: rule.department, admissionType: rule.admissionType };
}

// ── Helper: run validations on result ──────────────────────────────────────────
function runResultValidation(doc) {
  const reasons = [];
  const errors = [];

  if (!doc.studentName || doc.studentName.trim().length === 0) {
    reasons.push("Student name could not be extracted.");
  }
  if (!doc.subjects || doc.subjects.length === 0) {
    reasons.push("No subjects extracted from PDF for this student.");
  } else {
    for (const sub of doc.subjects) {
      if (!sub.code || sub.code.trim().length === 0) {
        reasons.push(`Subject code could not be detected for subject: ${sub.name || "Unnamed"}`);
      }
      if (!sub.grade || sub.grade === "UNKNOWN" || sub.grade === "—") {
        reasons.push(`Missing grade for subject: ${sub.code || sub.name}`);
      }
      if (sub.credits == null || sub.credits === 0) {
        reasons.push(`Credits missing or zero for subject: ${sub.code || sub.name}`);
      }
    }
  }

  // Recalculate values from subjects
  if (doc.subjects && doc.subjects.length > 0) {
    let totalCredits = 0;
    let totalPoints = 0;
    let backlogs = 0;
    const failedSubs = [];
    
    for (const s of doc.subjects) {
      const gp = GRADE_POINTS[s.grade] !== undefined ? GRADE_POINTS[s.grade] : 0;
      totalCredits += s.credits || 0;
      totalPoints  += (s.credits || 0) * gp;
      if (s.grade === "F" || s.grade === "Ab" || !s.passed) {
        backlogs++;
        failedSubs.push(s.name || s.code);
      }
    }
    
    doc.totalCredits  = totalCredits;
    doc.sgpa          = totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(2)) : 0;
    doc.percentage    = (doc.sgpa - 0.75) * 10;
    doc.backlogCount  = backlogs;
    doc.failedSubjects = failedSubs;
    doc.passed        = backlogs === 0;
  }

  doc.reviewReasons = reasons;
  doc.extractionErrors = errors;

  if (reasons.length > 0 || errors.length > 0) {
    doc.validationStatus = "NEEDS_REVIEW";
    doc.validationNotes = reasons.concat(errors).join(" | ");
  } else {
    doc.validationStatus = "VALID";
    doc.validationNotes = "";
  }
}

// ── Helper: recompute upload batch statistics ─────────────────────────────────
async function recomputeUploadStats(uploadId) {
  const StudentResult = require("../models/StudentResult");
  const ResultUpload = require("../models/ResultUpload");

  const results = await StudentResult.find({ uploadId });
  const totalStudents = results.length;
  const needsReview = results.filter(r => r.validationStatus === "NEEDS_REVIEW").length;
  const validStudents = results.filter(r => r.validationStatus === "VALID" || r.validationStatus === "READY_TO_PUBLISH").length;
  const duplicates = results.filter(r => r.validationStatus === "NEEDS_REVIEW" && r.validationNotes.includes("duplicate")).length;

  await ResultUpload.findByIdAndUpdate(uploadId, {
    totalStudents,
    validStudents,
    needsReviewCount: needsReview,
    duplicateCount: duplicates
  });
}

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const normUsername = username.trim().toLowerCase();
    let admin = await Admin.findOne({ username: normUsername });

    if (!admin) {
      const adminCount = await Admin.countDocuments();
      if (adminCount === 0 && (normUsername === "admin" || normUsername === "gradewiseadmin")) {
        admin = new Admin({
          username: normUsername,
          passwordHash: password.length >= 6 ? password : "adminpassword123",
          name: "GradeWise Administrator",
          role: "superadmin",
        });
        await admin.save();
      } else {
        return res.status(401).json({ error: "Invalid admin credentials." });
      }
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: "Invalid admin password." });

    const token = makeAdminToken(admin);
    res.json({ token, admin: { id: admin._id, username: admin.username, name: admin.name, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── All routes below require admin auth ───────────────────────────────────────
router.use(adminAuth);

// ── POST /api/admin/upload-pdf ────────────────────────────────────────────────
// Step 1: Upload PDF, parse it, save all StudentResults as DRAFT
router.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  let uploadDoc = null;
  try {
    const { semester, regulation, academicYear, examSession, examType } = req.body;
    if (!semester) return res.status(400).json({ error: "Semester is required." });

    const fileBuffer = req.file ? req.file.buffer : null;
    const fileName   = req.file ? req.file.originalname : "paste.txt";
    const fileSize   = req.file ? req.file.size : 0;

    if (!fileBuffer && !req.body.pastedText) {
      return res.status(400).json({ error: "No PDF file or pasted text provided." });
    }

    const buffer = fileBuffer || Buffer.from(req.body.pastedText, "utf8");

    // Create upload document immediately in PROCESSING state
    uploadDoc = new ResultUpload({
      fileName, fileSize,
      uploadedBy: req.admin.username || "Admin",
      semester, regulation: regulation || "R23",
      academicYear: academicYear || "",
      examSession:  examSession  || "",
      examType:     examType     || "Regular",
      status: "PROCESSING",
    });
    await uploadDoc.save();

    await logAudit("UPLOAD_PDF", req.admin?.username, `Uploaded PDF file for ${semester} (${regulation})`, uploadDoc._id);

    // Parse PDF
    const parsed = await parseResultPdf(buffer, { semester, regulation, academicYear, examSession, examType });

    if (parsed.extractedStudents.length === 0) {
      uploadDoc.status = "NEEDS_REVIEW";
      uploadDoc.notes  = parsed.warnings.join(" | ");
      await uploadDoc.save();
      return res.json({
        uploadId: uploadDoc._id,
        status: "NEEDS_REVIEW",
        warnings: parsed.warnings,
        studentCount: 0,
        needsReviewCount: 0,
        validCount: 0,
      });
    }

    // Classify each roll number with rules, check for duplicates
    const studentDocs = [];
    let validCount = 0;
    let needsReview = 0;
    let dupCount    = 0;
    const departments = new Set();

    for (const s of parsed.extractedStudents) {
      const { department, admissionType } = await classifyRoll(s.rollNumber);
      if (department) departments.add(department);

      // Duplicate check
      const existing = await StudentResult.findOne({
        rollNumber: s.rollNumber,
        semester:   s.semester || semester,
        regulation: s.regulation || regulation || "R23",
        academicYear: s.academicYear || academicYear || "",
        examSession:  s.examSession  || examSession  || "",
        isPublished: true,
      });

      const sDoc = {
        uploadId:      uploadDoc._id,
        rollNumber:    s.rollNumber,
        studentName:   s.studentName || "",
        department,
        admissionType,
        semester:      s.semester    || semester,
        regulation:    s.regulation  || regulation || "R23",
        academicYear:  s.academicYear || academicYear || "",
        examSession:   s.examSession  || examSession  || "",
        examType:      s.examType     || examType     || "Regular",
        subjects:      s.subjects     || [],
        isPublished:   false,
        rawText:       s.rawText || "",
      };

      // Run validation
      runResultValidation(sDoc);

      if (existing) {
        dupCount++;
        sDoc.validationStatus = "NEEDS_REVIEW";
        sDoc.reviewReasons.push("Possible duplicate: a published result already exists for this semester/session.");
        sDoc.validationNotes = sDoc.reviewReasons.join(" | ");
      }

      if (sDoc.validationStatus === "NEEDS_REVIEW") {
        needsReview++;
      } else {
        validCount++;
      }

      studentDocs.push(sDoc);
    }

    // Bulk insert student results
    if (studentDocs.length > 0) {
      await StudentResult.insertMany(studentDocs);
    }

    // Update upload document
    uploadDoc.status             = needsReview > 0 ? "NEEDS_REVIEW" : "DRAFT";
    uploadDoc.detectedDepartments = [...departments];
    uploadDoc.totalStudents       = studentDocs.length;
    uploadDoc.validStudents       = validCount;
    uploadDoc.invalidStudents     = 0;
    uploadDoc.needsReviewCount    = needsReview;
    uploadDoc.duplicateCount      = dupCount;
    uploadDoc.notes               = parsed.warnings.join(" | ");
    await uploadDoc.save();

    res.json({
      uploadId:         uploadDoc._id,
      status:           uploadDoc.status,
      studentCount:     studentDocs.length,
      validCount,
      needsReviewCount: needsReview,
      duplicateCount:   dupCount,
      departments:      [...departments],
      warnings:         parsed.warnings,
      semester:         parsed.semester,
      regulation:       parsed.regulation,
    });
  } catch (err) {
    if (uploadDoc) {
      uploadDoc.status = "PUBLISH_FAILED";
      uploadDoc.notes  = err.message;
      await uploadDoc.save().catch(() => {});
    }
    res.status(500).json({ error: `Upload processing failed: ${err.message}` });
  }
});

// ── GET /api/admin/uploads ────────────────────────────────────────────────────
router.get("/uploads", async (req, res) => {
  try {
    const { status, semester, regulation } = req.query;
    const query = {};
    if (status)     query.status     = status;
    if (semester)   query.semester   = semester;
    if (regulation) query.regulation = regulation;

    const uploads = await ResultUpload.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ uploads, total: uploads.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/results/:resultId ─────────────────────────────────────────
// Fetch a single student result by _id (for the record editor)
router.get("/results/:resultId", async (req, res) => {
  try {
    const result = await StudentResult.findById(req.params.resultId).lean();
    if (!result) return res.status(404).json({ error: "Result not found." });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/upload/:id ─────────────────────────────────────────────────
router.get("/upload/:id", async (req, res) => {
  try {
    const upload = await ResultUpload.findById(req.params.id).lean();
    if (!upload) return res.status(404).json({ error: "Upload not found." });

    const { page = 1, limit = 50, validationStatus } = req.query;
    const query = { uploadId: req.params.id };
    if (validationStatus) query.validationStatus = validationStatus;

    const total   = await StudentResult.countDocuments(query);
    const results = await StudentResult.find(query)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.json({ upload, results, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/upload/:id/result/:resultId ────────────────────────────────
// Admin edits a specific student result record before publishing
router.put("/upload/:id/result/:resultId", async (req, res) => {
  try {
    const { resultId } = req.params;
    const { studentName, subjects, validationStatus } = req.body;

    const result = await StudentResult.findOne({ _id: resultId, uploadId: req.params.id });
    if (!result) return res.status(404).json({ error: "Result not found." });
    if (result.isPublished) return res.status(400).json({ error: "Cannot edit a published result." });

    if (studentName !== undefined) result.studentName = studentName;
    if (Array.isArray(subjects)) {
      result.subjects = subjects.map(s => ({
        ...s,
        gradePoint: GRADE_POINTS[s.grade] !== undefined ? GRADE_POINTS[s.grade] : 0,
        passed: s.grade !== "F" && s.grade !== "Ab",
      }));
    }

    // Run validation & recalculation
    runResultValidation(result);

    // If explicit status was sent
    if (validationStatus) {
      result.validationStatus = validationStatus;
    }

    await result.save();

    // Recompute upload stats
    await recomputeUploadStats(req.params.id);

    res.json({ message: "Result updated.", result: result.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/results/:resultId/verify ──────────────────────────────────
// Re-validate a single result after admin edits
router.post("/results/:resultId/verify", async (req, res) => {
  try {
    const result = await StudentResult.findById(req.params.resultId);
    if (!result) return res.status(404).json({ error: "Result not found." });
    if (result.isPublished) return res.status(400).json({ error: "Cannot re-verify a published result." });

    runResultValidation(result);

    if (result.reviewReasons.length === 0 && result.extractionErrors.length === 0) {
      result.validationStatus = "VALID";
      result.isVerified  = true;
      result.reviewedBy  = req.admin.username || "Admin";
      result.reviewedAt  = new Date();
    }

    await result.save();
    await recomputeUploadStats(result.uploadId);

    res.json({
      message: result.validationStatus === "VALID"
        ? "Record verified and marked VALID — ready to publish."
        : "Record still has issues. Please correct and try again.",
      validationStatus: result.validationStatus,
      reviewReasons: result.reviewReasons,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/upload/:id/publish ───────────────────────────────────────
// Publishes all VALID results in the upload
router.post("/upload/:id/publish", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const uploadDoc = await ResultUpload.findById(req.params.id).session(session);
    if (!uploadDoc) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Upload not found." });
    }
    if (uploadDoc.status === "PUBLISHED") {
      await session.abortTransaction();
      return res.status(400).json({ error: "This upload is already published." });
    }

    uploadDoc.status = "PUBLISHING";
    await uploadDoc.save({ session });

    const now = new Date();

    // Publish only VALID records (skip NEEDS_REVIEW unless admin forces)
    const forcePublishAll = req.body.forcePublishAll === true;
    const resultFilter = { uploadId: uploadDoc._id, isPublished: false };
    if (!forcePublishAll) {
      resultFilter.validationStatus = { $in: ["VALID", "VERIFIED", "READY_TO_PUBLISH"] };
    }

    const updateResult = await StudentResult.updateMany(
      resultFilter,
      { $set: { isPublished: true, publishedAt: now } },
      { session }
    );

    // Recalculate analytics
    const published = await StudentResult.find({ uploadId: uploadDoc._id, isPublished: true }).lean();
    const total     = published.length;
    const passed    = published.filter(r => r.passed).length;
    const sgpas     = published.map(r => r.sgpa).filter(n => n > 0).sort((a, b) => a - b);
    const avgSgpa   = sgpas.length ? sgpas.reduce((a, b) => a + b, 0) / sgpas.length : 0;
    const backlogs  = published.reduce((a, r) => a + r.backlogCount, 0);

    uploadDoc.status       = "PUBLISHED";
    uploadDoc.publishedAt  = now;
    uploadDoc.validStudents = total;
    uploadDoc.analytics    = {
      passedStudents:  passed,
      failedStudents:  total - passed,
      passPercentage:  total > 0 ? (passed / total) * 100 : 0,
      averageSgpa:     avgSgpa,
      highestSgpa:     sgpas[sgpas.length - 1] || 0,
      lowestSgpa:      sgpas[0] || 0,
      totalBacklogs:   backlogs,
    };
    await uploadDoc.save({ session });

    await session.commitTransaction();
    await logAudit("PUBLISH_RESULTS", req.admin?.username, `Published ${updateResult.modifiedCount} records`, uploadDoc._id);
    res.json({
      message:        `Published ${updateResult.modifiedCount} results successfully.`,
      publishedCount: updateResult.modifiedCount,
      analytics:      uploadDoc.analytics,
    });
  } catch (err) {
    await session.abortTransaction();
    // Mark as failed
    await ResultUpload.findByIdAndUpdate(req.params.id, { status: "PUBLISH_FAILED", notes: err.message });
    res.status(500).json({ error: `Publishing failed: ${err.message}` });
  } finally {
    session.endSession();
  }
});

// ── POST /api/admin/upload/:id/unpublish ─────────────────────────────────────
router.post("/upload/:id/unpublish", async (req, res) => {
  try {
    const uploadDoc = await ResultUpload.findById(req.params.id);
    if (!uploadDoc) return res.status(404).json({ error: "Upload not found." });
    if (uploadDoc.status !== "PUBLISHED") {
      return res.status(400).json({ error: "Upload is not currently published." });
    }

    await StudentResult.updateMany(
      { uploadId: uploadDoc._id },
      { $set: { isPublished: false, publishedAt: null } }
    );

    uploadDoc.status      = "DRAFT";
    uploadDoc.publishedAt = null;
    await uploadDoc.save();

    res.json({ message: "Upload unpublished. Students can no longer see these results." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/upload/:id ──────────────────────────────────────────────
router.delete("/upload/:id", async (req, res) => {
  try {
    const uploadDoc = await ResultUpload.findById(req.params.id);
    if (!uploadDoc) return res.status(404).json({ error: "Upload not found." });
    if (uploadDoc.status === "PUBLISHED") {
      return res.status(400).json({ error: "Cannot delete a published upload. Unpublish first." });
    }

    await StudentResult.deleteMany({ uploadId: uploadDoc._id });
    await ResultUpload.findByIdAndDelete(req.params.id);

    res.json({ message: "Upload and all associated results deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/roll-rules ─────────────────────────────────────────────────
router.get("/roll-rules", async (req, res) => {
  try {
    const rules = await RollNumberRule.find({}).sort({ pattern: 1 }).lean();
    res.json({ rules, total: rules.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/roll-rules ────────────────────────────────────────────────
router.post("/roll-rules", async (req, res) => {
  try {
    const { pattern, department, departmentCode, admissionType, regulation, academicYear, description } = req.body;
    if (!pattern || !department || !admissionType) {
      return res.status(400).json({ error: "pattern, department, and admissionType are required." });
    }
    const rule = new RollNumberRule({
      pattern: pattern.trim().toUpperCase(),
      department, departmentCode, admissionType,
      regulation: regulation || "R23",
      academicYear: academicYear || "",
      description: description || "",
    });
    await rule.save();
    res.status(201).json({ message: "Roll number rule created.", rule: rule.toObject() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `A rule for pattern "${req.body.pattern}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/roll-rules/:id ─────────────────────────────────────────────
router.put("/roll-rules/:id", async (req, res) => {
  try {
    const rule = await RollNumberRule.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!rule) return res.status(404).json({ error: "Rule not found." });
    res.json({ message: "Rule updated.", rule: rule.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/roll-rules/:id ──────────────────────────────────────────
router.delete("/roll-rules/:id", async (req, res) => {
  try {
    const rule = await RollNumberRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found." });
    res.json({ message: "Rule deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const Student = require("../models/Student");
    const totalStudents = await Student.countDocuments({});
    const publishedUploads = await ResultUpload.countDocuments({ status: "PUBLISHED" });
    const publishedResults = await StudentResult.countDocuments({ isPublished: true });

    const needsReviewResults = await StudentResult.countDocuments({ validationStatus: "NEEDS_REVIEW" });
    const parsingErrorsCount = await StudentResult.countDocuments({ validationStatus: "PARSING_ERROR" });

    const passStats = await StudentResult.aggregate([
      { $match: { isPublished: true } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        passed: { $sum: { $cond: ["$passed", 1, 0] } },
        backlogs: { $sum: "$backlogCount" },
      }},
    ]);

    const s = passStats[0] || { total: 0, passed: 0, backlogs: 0 };
    const passPercentage = s.total > 0 ? (s.passed / s.total) * 100 : null;

    const recentUploads = await ResultUpload.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      totalStudents,
      publishedUploads,
      publishedResults,
      passPercentage,
      studentsWithBacklogs: s.backlogs,
      needsReviewResults,
      parsingErrorsCount,
      recentUploads,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/analytics ──────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const { semester, regulation, department, academicYear, admissionType, examSession, uploadId } = req.query;

    const match = { isPublished: true };
    if (semester)      match.semester      = semester;
    if (regulation)    match.regulation    = regulation;
    if (department)    match.department    = department;
    if (academicYear)  match.academicYear  = academicYear;
    if (admissionType) match.admissionType = admissionType;
    if (examSession)   match.examSession   = examSession;
    if (uploadId)      match.uploadId      = new mongoose.Types.ObjectId(uploadId);

    // Overall stats
    const stats = await StudentResult.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        total:       { $sum: 1 },
        passed:      { $sum: { $cond: ["$passed", 1, 0] } },
        avgSgpa:     { $avg: "$sgpa" },
        maxSgpa:     { $max: "$sgpa" },
        minSgpa:     { $min: "$sgpa" },
        totalBacklogs: { $sum: "$backlogCount" },
      }},
    ]);

    // Department & Admission Type breakdown (Regular vs LE)
    const deptBreakdown = await StudentResult.aggregate([
      { $match: match },
      { $group: {
        _id: { dept: "$department", type: "$admissionType" },
        total:    { $sum: 1 },
        passed:   { $sum: { $cond: ["$passed", 1, 0] } },
        avgSgpa:  { $avg: "$sgpa" },
        backlogs: { $sum: "$backlogCount" },
      }},
      { $sort: { "_id.dept": 1, "_id.type": 1 } },
    ]);

    // Subject analysis (pass rate per subject & most failed subjects)
    const subjectStats = await StudentResult.aggregate([
      { $match: match },
      { $unwind: "$subjects" },
      { $group: {
        _id: { code: "$subjects.code", name: "$subjects.name" },
        total:    { $sum: 1 },
        passed:   { $sum: { $cond: ["$subjects.passed", 1, 0] } },
        failed:   { $sum: { $cond: [{ $not: "$subjects.passed" }, 1, 0] } },
        avgGrade: { $avg: "$subjects.gradePoint" },
      }},
      { $addFields: { passRate: { $multiply: [{ $divide: ["$passed", "$total"] }, 100] } } },
      { $sort: { passRate: 1 } },
      { $limit: 50 },
    ]);

    // Top performing students
    const topStudents = await StudentResult.find(match)
      .sort({ sgpa: -1 })
      .limit(10)
      .select("rollNumber studentName sgpa percentage department admissionType semester")
      .lean();

    // Students with backlogs
    const backlogStudents = await StudentResult.find({ ...match, backlogCount: { $gt: 0 } })
      .sort({ backlogCount: -1 })
      .limit(20)
      .select("rollNumber studentName sgpa backlogCount failedSubjects department semester")
      .lean();

    // Student improvement tracking across semesters
    const studentImprovement = await StudentResult.aggregate([
      { $match: { isPublished: true } },
      { $sort: { rollNumber: 1, semester: 1 } },
      { $group: {
        _id: "$rollNumber",
        name: { $first: "$studentName" },
        dept: { $first: "$department" },
        semesters: { $push: { semester: "$semester", sgpa: "$sgpa" } }
      }},
      { $match: { "semesters.1": { $exists: true } } },
      { $project: {
        rollNumber: "$_id",
        name: 1, dept: 1,
        prevSem: { $arrayElemAt: ["$semesters", -2] },
        latestSem: { $arrayElemAt: ["$semesters", -1] }
      }},
      { $project: {
        rollNumber: 1, name: 1, dept: 1,
        prevSem: "$prevSem.semester", prevSgpa: "$prevSem.sgpa",
        latestSem: "$latestSem.semester", latestSgpa: "$latestSem.sgpa",
        improvement: { $subtract: ["$latestSem.sgpa", "$prevSem.sgpa"] }
      }},
      { $sort: { improvement: -1 } },
      { $limit: 10 }
    ]);

    const atRiskCount = await StudentResult.countDocuments({
      ...match,
      $or: [{ backlogCount: { $gte: 3 } }, { sgpa: { $lt: 5.0 } }]
    });

    const improvementStats = await StudentResult.aggregate([
      { $match: { isPublished: true } },
      { $sort: { rollNumber: 1, semester: 1 } },
      { $group: {
        _id: "$rollNumber",
        semesters: { $push: "$sgpa" }
      }},
      { $match: { "semesters.1": { $exists: true } } },
      { $project: {
        change: { $subtract: [{ $arrayElemAt: ["$semesters", -1] }, { $arrayElemAt: ["$semesters", -2] }] }
      }}
    ]);

    const improvedCount = improvementStats.filter(i => i.change > 0).length;
    const declinedCount = improvementStats.filter(i => i.change < 0).length;

    const s = stats[0] || {};
    res.json({
      total:            s.total || 0,
      passed:           s.passed || 0,
      failed:           (s.total || 0) - (s.passed || 0),
      passPercentage:   s.total > 0 ? (s.passed / s.total) * 100 : 0,
      averageSgpa:      s.avgSgpa || 0,
      highestSgpa:      s.maxSgpa || 0,
      lowestSgpa:       s.minSgpa || 0,
      totalBacklogs:    s.totalBacklogs || 0,
      atRiskCount,
      improvedCount,
      declinedCount,
      deptBreakdown,
      subjectStats,
      topStudents,
      backlogStudents,
      studentImprovement,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── GET /api/admin/students ───────────────────────────────────────────────────
router.get("/students", async (req, res) => {
  try {
    const Student = require("../models/Student");
    const { page = 1, limit = 50, search } = req.query;
    const query = search
      ? { $or: [
          { rollNumber: { $regex: search, $options: "i" } },
          { name:       { $regex: search, $options: "i" } },
        ]}
      : {};

    const total    = await Student.countDocuments(query);
    const students = await Student.find(query, {
      name: 1, rollNumber: 1, dept: 1, category: 1, phone: 1, createdAt: 1,
    })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.json({ students, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/leaderboards ───────────────────────────────────────────────
router.get("/leaderboards", async (req, res) => {
  try {
    const { semester, department, academicYear, admissionType, limit = 50 } = req.query;

    const match = { isPublished: true };
    if (semester)      match.semester      = semester;
    if (department)    match.department    = department;
    if (academicYear)  match.academicYear  = academicYear;
    if (admissionType) match.admissionType = admissionType;

    const leaderboard = await StudentResult.find(match)
      .sort({ sgpa: -1, percentage: -1 })
      .limit(Number(limit))
      .select("rollNumber studentName sgpa percentage department admissionType semester academicYear examSession")
      .lean();

    const improvement = await StudentResult.aggregate([
      { $match: { isPublished: true } },
      { $sort: { rollNumber: 1, semester: 1 } },
      { $group: {
        _id: "$rollNumber",
        name: { $first: "$studentName" },
        dept: { $first: "$department" },
        admissionType: { $first: "$admissionType" },
        semesters: { $push: { semester: "$semester", sgpa: "$sgpa" } }
      }},
      { $match: { "semesters.1": { $exists: true } } },
      { $project: {
        rollNumber: "$_id",
        name: 1, dept: 1, admissionType: 1,
        prevSem: { $arrayElemAt: ["$semesters", -2] },
        latestSem: { $arrayElemAt: ["$semesters", -1] }
      }},
      { $project: {
        rollNumber: 1, name: 1, dept: 1, admissionType: 1,
        prevSem: "$prevSem.semester", prevSgpa: "$prevSem.sgpa",
        latestSem: "$latestSem.semester", latestSgpa: "$latestSem.sgpa",
        improvement: { $subtract: ["$latestSem.sgpa", "$prevSem.sgpa"] }
      }},
      { $sort: { improvement: -1 } },
      { $limit: Number(limit) }
    ]);

    res.json({ leaderboard, improvement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/student/:rollNumber ────────────────────────────────────────
router.get("/student/:rollNumber", async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const Student = require("../models/Student");
    const student = await Student.findOne({ rollNumber: rollNumber.toUpperCase() }).lean();
    const results = await StudentResult.find({ rollNumber: rollNumber.toUpperCase() })
      .sort({ semester: 1 })
      .lean();
    res.json({ student, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy result-history for backward compat ─────────────────────────────────
router.get("/result-history", async (req, res) => {
  try {
    const uploads = await ResultUpload.find({}).sort({ createdAt: -1 }).lean();
    res.json(uploads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/audit-logs ────────────────────────────────────────────────
router.get("/audit-logs", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/feedback ──────────────────────────────────────────────────
router.get("/feedback", async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const items = await Feedback.find({})
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/student/update-grade ─────────────────────────────────────
// Admin updates a student subject grade / clears backlog
router.post("/student/update-grade", async (req, res) => {
  try {
    const { rollNumber, semester, subject, newGrade } = req.body;
    if (!rollNumber || !semester || !subject || !newGrade) {
      return res.status(400).json({ error: "rollNumber, semester, subject, and newGrade are required." });
    }

    const validGrades = ["S", "A", "B", "C", "D", "E", "F", "Ab"];
    const formattedGrade = String(newGrade).trim();
    if (!validGrades.includes(formattedGrade)) {
      return res.status(400).json({ error: `Invalid grade: ${newGrade}. Must be one of S, A, B, C, D, E, F, Ab.` });
    }

    const Student = require("../models/Student");
    const student = await Student.findOne({ rollNumber: String(rollNumber).trim().toUpperCase() });
    if (!student) {
      return res.status(404).json({ error: `Student with roll number ${rollNumber} not found.` });
    }

    const semRecord = student.semesters.find((s) => s.semester === semester);
    if (!semRecord) {
      return res.status(404).json({ error: `Semester ${semester} not found for student ${rollNumber}.` });
    }

    const targetSub = semRecord.subjects.find(
      (s) => s.subject.toLowerCase() === String(subject).trim().toLowerCase() ||
             (s.code && s.code.toLowerCase() === String(subject).trim().toLowerCase())
    );

    if (!targetSub) {
      return res.status(404).json({ error: `Subject '${subject}' not found in semester ${semester}.` });
    }

    const previousGrade = targetSub.grade;
    const previousGradePoint = GRADE_POINTS[previousGrade] !== undefined ? GRADE_POINTS[previousGrade] : 0;
    const newGradePoint = GRADE_POINTS[formattedGrade];

    targetSub.grade = formattedGrade;
    targetSub.gradePoint = newGradePoint;

    if (!targetSub.history) targetSub.history = [];
    targetSub.history.push({
      previousGrade,
      previousGradePoint,
      newGrade: formattedGrade,
      newGradePoint,
      updatedAt: new Date(),
      updatedBy: req.admin ? req.admin.username : "Admin",
    });

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
      updatedBy: req.admin ? req.admin.username : "Admin",
    });

    // Recalculate semester SGPA & credits
    let totalCredits = 0, totalPoints = 0;
    for (const sub of semRecord.subjects) {
      const gp = GRADE_POINTS[sub.grade] || 0;
      totalCredits += Number(sub.credits);
      totalPoints += Number(sub.credits) * gp;
    }
    semRecord.sgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
    semRecord.credits = totalCredits;

    await student.save();

    await logAudit(
      "CLEAR_BACKLOG_UPDATE_GRADE",
      req.admin ? req.admin.username : "Admin",
      `Updated grade for ${subject} (${semester}) from ${previousGrade} to ${formattedGrade} for student ${rollNumber}`,
      null,
      rollNumber
    );

    res.json({
      success: true,
      message: `Grade updated for student ${rollNumber}.`,
      student: student.toObject(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
