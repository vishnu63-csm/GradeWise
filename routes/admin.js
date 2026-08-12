const express = require("express");
const router = express.Router();
const multer = require("multer");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const ResultBatch = require("../models/ResultBatch");
const BatchStudentResult = require("../models/BatchStudentResult");
const adminAuth = require("../middleware/adminAuth");
const { parseResultPdf } = require("../utils/pdfParser");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";

function makeAdminToken(admin) {
  return jwt.sign(
    {
      id: admin._id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
      isAdmin: true,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ── 1. POST /api/admin/login ──────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const normUsername = username.trim().toLowerCase();
    let admin = await Admin.findOne({ username: normUsername });

    // Seed default admin if no admin exists yet
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
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid admin password." });
    }

    const token = makeAdminToken(admin);
    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── All routes below require Admin Authorization ──────────────────────────────
router.use(adminAuth);

// ── 2. POST /api/admin/upload-result ──────────────────────────────────────────
router.post("/upload-result", upload.single("pdfFile"), async (req, res) => {
  try {
    let fileBuffer = req.file ? req.file.buffer : null;
    let fileName = req.file ? req.file.originalname : "Uploaded_Result.pdf";
    let fileSize = req.file ? req.file.size : 0;

    // If text was pasted instead of file upload
    if (!fileBuffer && req.body && req.body.pastedText) {
      fileBuffer = Buffer.from(req.body.pastedText, "utf-8");
      fileName = "Pasted_Result_Text.txt";
      fileSize = fileBuffer.length;
    }

    if (!fileBuffer && (!req.body || !req.body.demo)) {
      return res.status(400).json({ error: "Please upload a valid PDF file or paste result text." });
    }

    const parsed = await parseResultPdf(fileBuffer || "DEMO_BATCH_EXTRACTION");

    // Compute validation status counts
    const validCount = parsed.students.filter((s) => s.rollNumber && s.subjects.length > 0).length;
    const invalidCount = parsed.students.length - validCount;
    const duplicateCount = 0; // Check existing batch duplicates if needed

    res.json({
      fileName,
      fileSize,
      detectedSemester: parsed.semester,
      detectedRegulation: parsed.regulation,
      detectedDept: parsed.dept,
      startRoll: parsed.startRoll,
      endRoll: parsed.endRoll,
      totalStudentsDetected: parsed.students.length,
      validRecords: validCount,
      invalidRecords: invalidCount,
      duplicateRecords: duplicateCount,
      recordsRequiringReview: invalidCount,
      students: parsed.students,
    });
  } catch (err) {
    res.status(500).json({ error: `PDF Processing Failed: ${err.message}` });
  }
});

// ── 3. POST /api/admin/confirm-result ─────────────────────────────────────────
router.post("/confirm-result", async (req, res) => {
  try {
    const {
      fileName,
      fileSize,
      semester,
      regulation,
      dept,
      students,
      overrideStartRoll,
      overrideEndRoll,
    } = req.body;

    if (!semester || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "Semester and a non-empty list of student records are required." });
    }

    const totalStudents = students.length;
    let passedStudents = 0;
    let failedStudents = 0;
    let totalPointsSum = 0;
    let totalPctSum = 0;
    let totalBacklogs = 0;
    let studentsWithBacklogs = 0;

    const sgpaList = [];
    const pctList = [];

    const gradeDist = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, Ab: 0 };
    const backlogDist = { b0: 0, b1: 0, b2: 0, b3: 0, b4plus: 0 };
    const sgpaDist = { range9_10: 0, range8_89: 0, range7_79: 0, range6_69: 0, range5_59: 0, below5: 0 };
    const pctDist = { range90_100: 0, range80_89: 0, range70_79: 0, range60_69: 0, range50_59: 0, below50: 0 };

    const subjectMap = new Map();

    students.forEach((s) => {
      const sgpa = Number(s.sgpa) || 0;
      const pct = (sgpa - 0.75) * 10;
      sgpaList.push(sgpa);
      pctList.push(pct);

      totalPointsSum += sgpa;
      totalPctSum += pct;

      const backlogs = Number(s.backlogCount) || 0;
      totalBacklogs += backlogs;

      if (backlogs === 0) {
        passedStudents++;
        backlogDist.b0++;
      } else {
        failedStudents++;
        studentsWithBacklogs++;
        if (backlogs === 1) backlogDist.b1++;
        else if (backlogs === 2) backlogDist.b2++;
        else if (backlogs === 3) backlogDist.b3++;
        else backlogDist.b4plus++;
      }

      // SGPA Ranges
      if (sgpa >= 9.0) sgpaDist.range9_10++;
      else if (sgpa >= 8.0) sgpaDist.range8_89++;
      else if (sgpa >= 7.0) sgpaDist.range7_79++;
      else if (sgpa >= 6.0) sgpaDist.range6_69++;
      else if (sgpa >= 5.0) sgpaDist.range5_59++;
      else sgpaDist.below5++;

      // Percentage Ranges
      if (pct >= 90) pctDist.range90_100++;
      else if (pct >= 80) pctDist.range80_89++;
      else if (pct >= 70) pctDist.range70_79++;
      else if (pct >= 60) pctDist.range60_69++;
      else if (pct >= 50) pctDist.range50_59++;
      else pctDist.below50++;

      // Process subjects
      (s.subjects || []).forEach((sub) => {
        const g = sub.grade || "F";
        if (gradeDist[g] !== undefined) gradeDist[g]++;

        let stat = subjectMap.get(sub.name);
        if (!stat) {
          stat = {
            code: sub.code || "",
            name: sub.name,
            credits: Number(sub.credits) || 3,
            totalAttempted: 0,
            passedCount: 0,
            failedCount: 0,
            gradeCounts: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, Ab: 0 },
          };
          subjectMap.set(sub.name, stat);
        }

        stat.totalAttempted++;
        if (g === "F" || g === "Ab") {
          stat.failedCount++;
        } else {
          stat.passedCount++;
        }
        if (stat.gradeCounts[g] !== undefined) stat.gradeCounts[g]++;
      });
    });

    sgpaList.sort((a, b) => a - b);
    pctList.sort((a, b) => a - b);

    const passPercentage = totalStudents > 0 ? (passedStudents / totalStudents) * 100 : 0;
    const failPercentage = totalStudents > 0 ? (failedStudents / totalStudents) * 100 : 0;
    const averageSgpa = totalStudents > 0 ? totalPointsSum / totalStudents : 0;
    const averagePercentage = totalStudents > 0 ? totalPctSum / totalStudents : 0;

    const highestSgpa = sgpaList.length ? sgpaList[sgpaList.length - 1] : 0;
    const lowestSgpa = sgpaList.length ? sgpaList[0] : 0;
    const medianSgpa = sgpaList.length ? sgpaList[Math.floor(sgpaList.length / 2)] : 0;

    const highestPercentage = pctList.length ? pctList[pctList.length - 1] : 0;
    const lowestPercentage = pctList.length ? pctList[0] : 0;
    const medianPercentage = pctList.length ? pctList[Math.floor(pctList.length / 2)] : 0;

    // Convert subject stats map to array
    const subjectStats = [];
    subjectMap.forEach((val) => {
      const passPct = val.totalAttempted > 0 ? (val.passedCount / val.totalAttempted) * 100 : 0;
      const failPct = val.totalAttempted > 0 ? (val.failedCount / val.totalAttempted) * 100 : 0;
      subjectStats.push({
        ...val,
        passPercentage: passPct,
        failPercentage: failPct,
      });
    });

    const startRoll = overrideStartRoll || (students[0] ? students[0].rollNumber : "");
    const endRoll = overrideEndRoll || (students[students.length - 1] ? students[students.length - 1].rollNumber : "");

    // Create ResultBatch document
    const resultBatch = new ResultBatch({
      fileName: fileName || "Semester_Result_Batch.pdf",
      fileSize: fileSize || 0,
      semester,
      regulation: regulation || "R23",
      dept: dept || "CSM",
      uploadedBy: req.admin.username || "Admin",
      totalStudents,
      passedStudents,
      failedStudents,
      passPercentage,
      failPercentage,
      averageSgpa,
      highestSgpa,
      lowestSgpa,
      medianSgpa,
      averagePercentage,
      highestPercentage,
      lowestPercentage,
      medianPercentage,
      totalBacklogs,
      studentsWithBacklogs,
      rollNumberRange: { startRoll, endRoll },
      gradeDistribution: gradeDist,
      backlogDistribution: backlogDist,
      sgpaDistribution: sgpaDist,
      percentageDistribution: pctDist,
      subjectStats,
    });

    await resultBatch.save();

    // Create BatchStudentResult documents
    const batchStudentDocs = students.map((s) => ({
      batchId: resultBatch._id,
      rollNumber: s.rollNumber,
      studentName: s.studentName || `Student ${s.rollNumber.slice(-4)}`,
      semester,
      regulation: regulation || "R23",
      dept: dept || "CSM",
      sgpa: Number(s.sgpa) || 0,
      percentage: (Number(s.sgpa) - 0.75) * 10,
      totalCredits: Number(s.totalCredits) || 0,
      passed: s.passed !== undefined ? s.passed : (s.backlogCount || 0) === 0,
      backlogCount: Number(s.backlogCount) || 0,
      failedSubjects: s.failedSubjects || [],
      subjects: s.subjects || [],
    }));

    await BatchStudentResult.insertMany(batchStudentDocs);

    res.json({
      message: "Result batch saved and analytics computed successfully!",
      batchId: resultBatch._id,
      resultBatch,
    });
  } catch (err) {
    res.status(500).json({ error: `Save Failed: ${err.message}` });
  }
});

// ── 4. GET /api/admin/analytics ───────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const {
      batchId,
      semester,
      dept,
      regulation,
      startRoll,
      endRoll,
      minSgpa,
      maxSgpa,
      status, // "passed", "failed", "all"
    } = req.query;

    let query = {};
    if (batchId) query.batchId = batchId;
    if (semester) query.semester = semester;
    if (dept) query.dept = dept;
    if (regulation) query.regulation = regulation;
    if (status === "passed") query.passed = true;
    if (status === "failed") query.passed = false;

    if (minSgpa || maxSgpa) {
      query.sgpa = {};
      if (minSgpa) query.sgpa.$gte = Number(minSgpa);
      if (maxSgpa) query.sgpa.$lte = Number(maxSgpa);
    }

    if (startRoll && endRoll) {
      query.rollNumber = { $gte: startRoll.toUpperCase(), $lte: endRoll.toUpperCase() };
    }

    const results = await BatchStudentResult.find(query).lean();
    if (!results.length) {
      return res.json({
        totalStudents: 0,
        passedStudents: 0,
        failedStudents: 0,
        passPercentage: 0,
        failPercentage: 0,
        averageSgpa: 0,
        highestSgpa: 0,
        lowestSgpa: 0,
        students: [],
        subjectStats: [],
        insights: ["No student result records found matching the selected filters."],
      });
    }

    const totalStudents = results.length;
    let passedStudents = 0;
    let failedStudents = 0;
    let sgpaSum = 0;
    let pctSum = 0;
    let totalBacklogs = 0;
    let studentsWithBacklogs = 0;

    const sgpaList = [];
    const gradeDist = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, Ab: 0 };
    const backlogDist = { b0: 0, b1: 0, b2: 0, b3: 0, b4plus: 0 };
    const sgpaDist = { range9_10: 0, range8_89: 0, range7_79: 0, range6_69: 0, range5_59: 0, below5: 0 };
    const pctDist = { range90_100: 0, range80_89: 0, range70_79: 0, range60_69: 0, range50_59: 0, below50: 0 };

    const subjectMap = new Map();

    results.forEach((r) => {
      const sgpa = r.sgpa || 0;
      const pct = (sgpa - 0.75) * 10;
      sgpaList.push(sgpa);
      sgpaSum += sgpa;
      pctSum += pct;

      const backlogs = r.backlogCount || 0;
      totalBacklogs += backlogs;

      if (r.passed) {
        passedStudents++;
        backlogDist.b0++;
      } else {
        failedStudents++;
        studentsWithBacklogs++;
        if (backlogs === 1) backlogDist.b1++;
        else if (backlogs === 2) backlogDist.b2++;
        else if (backlogs === 3) backlogDist.b3++;
        else backlogDist.b4plus++;
      }

      if (sgpa >= 9.0) sgpaDist.range9_10++;
      else if (sgpa >= 8.0) sgpaDist.range8_89++;
      else if (sgpa >= 7.0) sgpaDist.range7_79++;
      else if (sgpa >= 6.0) sgpaDist.range6_69++;
      else if (sgpa >= 5.0) sgpaDist.range5_59++;
      else sgpaDist.below5++;

      if (pct >= 90) pctDist.range90_100++;
      else if (pct >= 80) pctDist.range80_89++;
      else if (pct >= 70) pctDist.range70_79++;
      else if (pct >= 60) pctDist.range60_69++;
      else if (pct >= 50) pctDist.range50_59++;
      else pctDist.below50++;

      (r.subjects || []).forEach((sub) => {
        const g = sub.grade || "F";
        if (gradeDist[g] !== undefined) gradeDist[g]++;

        let stat = subjectMap.get(sub.name);
        if (!stat) {
          stat = {
            name: sub.name,
            credits: sub.credits || 3,
            totalAttempted: 0,
            passedCount: 0,
            failedCount: 0,
          };
          subjectMap.set(sub.name, stat);
        }
        stat.totalAttempted++;
        if (g === "F" || g === "Ab") stat.failedCount++;
        else stat.passedCount++;
      });
    });

    sgpaList.sort((a, b) => a - b);

    const passPercentage = (passedStudents / totalStudents) * 100;
    const failPercentage = (failedStudents / totalStudents) * 100;
    const averageSgpa = sgpaSum / totalStudents;
    const averagePercentage = pctSum / totalStudents;
    const highestSgpa = sgpaList[sgpaList.length - 1] || 0;
    const lowestSgpa = sgpaList[0] || 0;

    // Leaderboard sorted descending by SGPA
    const leaderboard = [...results]
      .sort((a, b) => b.sgpa - a.sgpa)
      .map((r, idx) => ({
        rank: idx + 1,
        rollNumber: r.rollNumber,
        studentName: r.studentName,
        sgpa: r.sgpa,
        percentage: r.percentage,
        backlogCount: r.backlogCount,
      }));

    // Academic Attention list (failed or low SGPA)
    const academicAttention = results
      .filter((r) => !r.passed || r.sgpa < 6.0 || r.backlogCount > 0)
      .sort((a, b) => a.sgpa - b.sgpa)
      .map((r) => ({
        rollNumber: r.rollNumber,
        studentName: r.studentName,
        sgpa: r.sgpa,
        percentage: r.percentage,
        backlogCount: r.backlogCount,
        failedSubjects: r.failedSubjects,
      }));

    // Subject Performance list
    const subjectStats = [];
    subjectMap.forEach((val) => {
      const passPct = val.totalAttempted > 0 ? (val.passedCount / val.totalAttempted) * 100 : 0;
      const failPct = val.totalAttempted > 0 ? (val.failedCount / val.totalAttempted) * 100 : 0;
      subjectStats.push({
        ...val,
        passPercentage: passPct,
        failPercentage: failPct,
      });
    });

    // Subject failure ranking (highest fail % first)
    const subjectFailureRanking = [...subjectStats].sort((a, b) => b.failPercentage - a.failPercentage);
    const bestSubject = [...subjectStats].sort((a, b) => b.passPercentage - a.passPercentage)[0];

    // Dynamic Automatic Insights Generator
    const insights = [];
    insights.push(`${passPercentage.toFixed(2)}% of students passed this semester (${passedStudents} of ${totalStudents}).`);
    if (bestSubject) {
      insights.push(`"${bestSubject.name}" achieved the highest pass rate (${bestSubject.passPercentage.toFixed(2)}%).`);
    }
    if (subjectFailureRanking.length > 0 && subjectFailureRanking[0].failPercentage > 0) {
      insights.push(`"${subjectFailureRanking[0].name}" recorded the highest failure rate (${subjectFailureRanking[0].failPercentage.toFixed(2)}% with ${subjectFailureRanking[0].failedCount} failed students).`);
    }
    if (sgpaDist.range9_10 > 0) {
      insights.push(`${sgpaDist.range9_10} student(s) achieved an outstanding SGPA above 9.0.`);
    }
    if (studentsWithBacklogs > 0) {
      insights.push(`${studentsWithBacklogs} student(s) currently have at least one active backlog.`);
    }

    res.json({
      totalStudents,
      passedStudents,
      failedStudents,
      passPercentage,
      failPercentage,
      averageSgpa,
      highestSgpa,
      lowestSgpa,
      averagePercentage,
      totalBacklogs,
      studentsWithBacklogs,
      gradeDistribution: gradeDist,
      backlogDistribution: backlogDist,
      sgpaDistribution: sgpaDist,
      percentageDistribution: pctDist,
      subjectStats,
      subjectFailureRanking,
      leaderboard,
      academicAttention,
      insights,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. GET /api/admin/result-history ──────────────────────────────────────────
router.get("/result-history", async (req, res) => {
  try {
    const batches = await ResultBatch.find({}).sort({ createdAt: -1 }).lean();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6. DELETE /api/admin/result-batch/:id ─────────────────────────────────────
router.delete("/result-batch/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await ResultBatch.findByIdAndDelete(id);
    await BatchStudentResult.deleteMany({ batchId: id });
    res.json({ message: "Result batch archived and deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 7. GET /api/admin/dashboard ───────────────────────────────────────────────
// Returns overview stats + recent batches for the dashboard tab
router.get("/dashboard", async (req, res) => {
  try {
    const Student = require("../models/Student");
    const batches = await ResultBatch.find({}).sort({ createdAt: -1 }).lean();
    const totalStudents = await Student.countDocuments({});

    let totalPassed = 0, totalFailed = 0, sgpaSum = 0, batchCount = 0;
    batches.forEach(b => {
      totalPassed += b.passedStudents || 0;
      totalFailed += b.failedStudents || 0;
      if (b.averageSgpa) { sgpaSum += b.averageSgpa; batchCount++; }
    });

    const totalInBatches = totalPassed + totalFailed;
    res.json({
      batches: batches.map(b => ({
        _id: b._id,
        dept: b.dept,
        semester: b.semester,
        academicYear: b.academicYear || "",
        regulation: b.regulation,
        totalStudents: b.totalStudents,
        passedStudents: b.passedStudents,
        failedStudents: b.failedStudents,
        avgSgpa: b.averageSgpa,
        passRate: b.passPercentage,
        createdAt: b.createdAt,
      })),
      totalStudents,
      avgSgpa: batchCount > 0 ? sgpaSum / batchCount : null,
      totalPassed,
      totalFailed,
      passRate: totalInBatches > 0 ? (totalPassed / totalInBatches) * 100 : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 8. POST /api/admin/upload-pdf ─────────────────────────────────────────────
// Accepts a PDF upload with batch metadata, parses it, returns preview
router.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const { academicYear, semester, dept, regulation } = req.body;
    if (!semester || !dept) {
      return res.status(400).json({ error: "Semester and Department are required." });
    }

    let fileBuffer = req.file ? req.file.buffer : null;
    const fileName = req.file ? req.file.originalname : "result.pdf";
    const fileSize = req.file ? req.file.size : 0;

    if (!fileBuffer) {
      return res.status(400).json({ error: "No PDF file provided." });
    }

    const parsed = await parseResultPdf(fileBuffer);

    // Save a provisional ResultBatch as "draft"
    const draftBatch = new ResultBatch({
      fileName,
      fileSize,
      semester,
      regulation: regulation || "R23",
      dept,
      academicYear: academicYear || "",
      uploadedBy: req.admin.username || "Admin",
      totalStudents: parsed.students.length,
      isDraft: true,
    });
    await draftBatch.save();

    // Store draft student results for confirmation step
    if (parsed.students.length > 0) {
      const docs = parsed.students.map(s => ({
        batchId: draftBatch._id,
        rollNumber: s.rollNumber || "",
        studentName: s.studentName || "",
        semester,
        regulation: regulation || "R23",
        dept,
        sgpa: Number(s.sgpa) || 0,
        percentage: (Number(s.sgpa) - 0.75) * 10,
        totalCredits: Number(s.totalCredits) || 0,
        passed: (s.backlogCount || 0) === 0,
        backlogCount: Number(s.backlogCount) || 0,
        failedSubjects: s.failedSubjects || [],
        subjects: s.subjects || [],
        isDraft: true,
      }));
      await BatchStudentResult.insertMany(docs);
    }

    const total = parsed.students.length;
    const passed = parsed.students.filter(s => (s.backlogCount || 0) === 0).length;
    const avgSgpa = total > 0
      ? parsed.students.reduce((a, s) => a + (Number(s.sgpa) || 0), 0) / total
      : 0;

    res.json({
      batchId: draftBatch._id,
      studentCount: total,
      avgSgpa,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      students: parsed.students,
    });
  } catch (err) {
    res.status(500).json({ error: `PDF Processing Failed: ${err.message}` });
  }
});

// ── 9. POST /api/admin/batch/:id/confirm ──────────────────────────────────────
// Promotes a draft batch to confirmed status
router.post("/batch/:id/confirm", async (req, res) => {
  try {
    const batch = await ResultBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found." });

    const results = await BatchStudentResult.find({ batchId: batch._id }).lean();
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const sgpaSum = results.reduce((a, r) => a + r.sgpa, 0);
    const avgSgpa = total > 0 ? sgpaSum / total : 0;

    batch.isDraft = false;
    batch.passedStudents = passed;
    batch.failedStudents = failed;
    batch.passPercentage = total > 0 ? (passed / total) * 100 : 0;
    batch.failPercentage = total > 0 ? (failed / total) * 100 : 0;
    batch.averageSgpa = avgSgpa;
    await batch.save();

    await BatchStudentResult.updateMany({ batchId: batch._id }, { $unset: { isDraft: "" } });

    res.json({ message: "Batch confirmed.", batchId: batch._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 10. POST /api/admin/batch/manual ─────────────────────────────────────────
// Submit a manually entered result batch
router.post("/batch/manual", async (req, res) => {
  try {
    const { academicYear, semester, dept, regulation, students } = req.body;
    if (!semester || !dept || !Array.isArray(students) || !students.length) {
      return res.status(400).json({ error: "Semester, Department, and at least one student are required." });
    }

    const total = students.length;
    let passed = 0, failed = 0, sgpaSum = 0;
    students.forEach(s => {
      const hasBlog = s.backlogs && s.backlogs.length > 0;
      if (!hasBlog) passed++; else failed++;
      sgpaSum += Number(s.sgpa) || 0;
    });
    const avgSgpa = total > 0 ? sgpaSum / total : 0;

    const batch = new ResultBatch({
      fileName: "Manual_Entry.csv",
      fileSize: 0,
      semester,
      regulation: regulation || "R23",
      dept,
      academicYear: academicYear || "",
      uploadedBy: req.admin.username || "Admin",
      totalStudents: total,
      passedStudents: passed,
      failedStudents: failed,
      passPercentage: total > 0 ? (passed / total) * 100 : 0,
      failPercentage: total > 0 ? (failed / total) * 100 : 0,
      averageSgpa: avgSgpa,
    });
    await batch.save();

    const docs = students.map(s => ({
      batchId: batch._id,
      rollNumber: s.roll || s.rollNumber || "",
      studentName: s.name || s.studentName || "",
      semester,
      regulation: regulation || "R23",
      dept,
      sgpa: Number(s.sgpa) || 0,
      percentage: (Number(s.sgpa) - 0.75) * 10,
      totalCredits: Number(s.credits) || 0,
      passed: !(s.backlogs && s.backlogs.length > 0),
      backlogCount: s.backlogs ? s.backlogs.length : 0,
      failedSubjects: s.backlogs || [],
      subjects: [],
    }));
    await BatchStudentResult.insertMany(docs);

    res.json({ message: "Manual batch saved.", batchId: batch._id, totalStudents: total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 11. GET /api/admin/batch/:id/analytics ────────────────────────────────────
// Returns full analytics for a single batch
router.get("/batch/:id/analytics", async (req, res) => {
  try {
    const batch = await ResultBatch.findById(req.params.id).lean();
    if (!batch) return res.status(404).json({ error: "Batch not found." });

    const results = await BatchStudentResult.find({ batchId: req.params.id }).lean();

    res.json({
      batch,
      students: results.map(r => ({
        name: r.studentName,
        roll: r.rollNumber,
        sgpa: r.sgpa,
        credits: r.totalCredits,
        backlogs: r.failedSubjects || [],
        passed: r.passed,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 12. GET /api/admin/students ───────────────────────────────────────────────
// Returns all registered students (for admin overview)
router.get("/students", async (req, res) => {
  try {
    const Student = require("../models/Student");
    const students = await Student.find({}, {
      name: 1, rollNumber: 1, dept: 1, category: 1,
      semesters: 1, cgpa: 1, phone: 1,
    }).lean();

    // Compute CGPA for each if not stored
    const GRADE_POINTS = { S:10,A:9,B:8,C:7,D:6,E:5,F:0,Ab:0 };
    const mapped = students.map(s => {
      let totalC = 0, weighted = 0;
      (s.semesters || []).forEach(sem => {
        if (s.category === "Lateral Entry" && (sem.semester === "1-1" || sem.semester === "1-2")) return;
        totalC += sem.credits || 0;
        weighted += (sem.credits || 0) * (sem.sgpa || 0);
      });
      const cgpa = totalC > 0 ? weighted / totalC : null;
      return {
        name: s.name,
        rollNumber: s.rollNumber,
        dept: s.dept,
        category: s.category,
        semesters: s.semesters || [],
        cgpa: s.cgpa != null ? s.cgpa : cgpa,
        phone: s.phone,
      };
    });

    res.json({ students: mapped, total: mapped.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
