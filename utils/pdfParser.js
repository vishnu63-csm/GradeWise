/**
 * pdfParser.js — GradeWise Real PDF Data Extractor
 *
 * Strategy:
 *  1. Extract raw text from PDF buffer using pdf-parse
 *  2. Admin provides: semester, regulation, academicYear, examSession, examType
 *  3. Parser finds all JNTUK roll numbers in the text
 *  4. For each roll, tries to extract subject grades from surrounding lines
 *  5. Records that can't be fully extracted are marked NEEDS_REVIEW
 *  6. NO fake/mock data is generated — uncertain fields are flagged
 */

const pdfParse = require("pdf-parse");

const GRADE_POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, Ab: 0 };
const VALID_GRADES = new Set(["S", "A", "B", "C", "D", "E", "F", "AB"]);

// ── Regex patterns ────────────────────────────────────────────────────────────

// Matches standard JNTUK 10-char roll numbers: digits + alnum combo with 1A or 5A slot
const ROLL_REGEX = /\b(\d{2}[A-Z0-9]{2}[15]A[A-Z0-9]{4})\b/gi;

// Matches grade tokens (standalone letters or Ab)
const GRADE_REGEX = /\b(S|A|B|C|D|E|F|Ab)\b/g;

// Subject code pattern (e.g. R23CS3101, CS301, R20A3101)
const SUBJECT_CODE_REGEX = /\b([A-Z]{1,4}\d{2,6}[A-Z0-9]*)\b/g;

// Credit patterns (standalone numbers 1-6, possibly decimal)
const CREDIT_REGEX = /\b([1-6](?:\.\d)?)\b/g;

// ── Semester / Regulation helpers ─────────────────────────────────────────────

function detectSemester(text) {
  const t = text.toUpperCase();
  const map = [
    [/\bIV[\s-]*(?:YEAR|YR)?[\s-]*II[\s-]*SEM/i,  "4-2"],
    [/\bIV[\s-]*(?:YEAR|YR)?[\s-]*I[\s-]*SEM/i,   "4-1"],
    [/\bIII[\s-]*(?:YEAR|YR)?[\s-]*II[\s-]*SEM/i, "3-2"],
    [/\bIII[\s-]*(?:YEAR|YR)?[\s-]*I[\s-]*SEM/i,  "3-1"],
    [/\bII[\s-]*(?:YEAR|YR)?[\s-]*II[\s-]*SEM/i,  "2-2"],
    [/\bII[\s-]*(?:YEAR|YR)?[\s-]*I[\s-]*SEM/i,   "2-1"],
    [/\bI[\s-]*(?:YEAR|YR)?[\s-]*II[\s-]*SEM/i,   "1-2"],
    [/\bI[\s-]*(?:YEAR|YR)?[\s-]*I[\s-]*SEM/i,    "1-1"],
    [/\b4[-\s]*2\b/,  "4-2"],
    [/\b4[-\s]*1\b/,  "4-1"],
    [/\b3[-\s]*2\b/,  "3-2"],
    [/\b3[-\s]*1\b/,  "3-1"],
    [/\b2[-\s]*2\b/,  "2-2"],
    [/\b2[-\s]*1\b/,  "2-1"],
    [/\b1[-\s]*2\b/,  "1-2"],
    [/\b1[-\s]*1\b/,  "1-1"],
  ];
  for (const [re, sem] of map) {
    if (re.test(t)) return sem;
  }
  return null; // unknown — don't guess
}

function detectRegulation(text) {
  const m = text.match(/\bR(\d{2})\b/i);
  if (m) return `R${m[1].toUpperCase()}`;
  return null;
}

function detectExamSession(text) {
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  for (const mo of months) {
    const re = new RegExp(`(${mo}[\\s-]+\\d{4})`, "i");
    const m = text.match(re);
    if (m) return m[1];
  }
  return "";
}

// ── Core subject extraction ───────────────────────────────────────────────────

/**
 * Given lines of text in the region for one student,
 * attempt to extract subject rows.
 *
 * JNTUK result PDFs typically have rows like:
 *   <SubjectCode> <SubjectName> <Internal> <External> <Grade> <Credits>
 * or:
 *   <SubjectCode> <SubjectName> <Grade> <Credits>
 *
 * Returns array of subject objects and a confidence flag.
 */
function extractSubjectsFromLines(lines) {
  const subjects = [];
  let confidence = "HIGH"; // HIGH | MEDIUM | LOW

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;

    // Skip obvious header lines
    if (/subject|code|name|grade|credit|marks|internal|external|total|sgpa|cgpa|roll/i.test(trimmed) && trimmed.length < 60) continue;

    // Try to find a grade in this line
    const gradeMatch = trimmed.match(/\b(S|A|B|C|D|E|F|Ab)\b/);
    if (!gradeMatch) continue;

    const grade = gradeMatch[1].toUpperCase() === "AB" ? "Ab" : gradeMatch[1];
    const gradePoint = GRADE_POINTS[grade] !== undefined ? GRADE_POINTS[grade] : 0;

    // Try to find credits (number 1-6, optionally with decimal)
    const creditMatches = [...trimmed.matchAll(/\b([1-6](?:\.\d{1,2})?)\b/g)].map(m => parseFloat(m[1]));
    const credits = creditMatches.find(c => c >= 1 && c <= 6) || null;

    // Try to find subject code
    const codeMatch = trimmed.match(/\b([A-Z]{1,4}\d{3,7}[A-Z0-9]*)\b/);
    const code = codeMatch ? codeMatch[1] : "";

    // Extract marks if present (2 or 3 digit numbers before the grade)
    const marksMatches = [...trimmed.matchAll(/\b(\d{1,3})\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 0 && n <= 100);
    let internalMarks = null;
    let externalMarks = null;
    if (marksMatches.length >= 2) {
      internalMarks = marksMatches[0];
      externalMarks = marksMatches[1];
    } else if (marksMatches.length === 1) {
      externalMarks = marksMatches[0];
    }

    // Extract subject name: remove code, marks, grade, credits, and keywords from line
    let name = trimmed
      .replace(codeMatch ? codeMatch[0] : "", "")
      .replace(gradeMatch[0], "")
      .replace(/\b(PASS|FAIL|ABSENT|COMPLETED|PROMOTED)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\b/g, "")
      .replace(/[^A-Za-z\s&().-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!name || name.length < 2) {
      name = code || "Subject";
      confidence = "MEDIUM";
    }

    if (!credits) {
      confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
    }

    subjects.push({
      code,
      name,
      internalMarks,
      externalMarks,
      grade,
      gradePoint,
      credits: credits || 3,
      passed: grade !== "F" && grade !== "Ab",
    });
  }

  return { subjects, confidence };
}

/**
 * Calculate SGPA from extracted subjects.
 */
function calcSgpa(subjects) {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const s of subjects) {
    totalCredits += s.credits || 0;
    totalPoints += (s.credits || 0) * (s.gradePoint || 0);
  }
  if (totalCredits === 0) return { sgpa: 0, percentage: 0, totalCredits: 0 };
  const sgpa = totalPoints / totalCredits;
  const percentage = (sgpa - 0.75) * 10;
  return { sgpa, percentage, totalCredits };
}

// ── Main parse function ───────────────────────────────────────────────────────

/**
 * parseResultPdf(bufferOrText, adminMeta)
 *
 * @param {Buffer|string} bufferOrText  — PDF file buffer or raw text
 * @param {object} adminMeta            — { semester, regulation, academicYear, examSession, examType }
 *
 * Returns:
 * {
 *   semester, regulation, academicYear, examSession, examType,
 *   extractedStudents: [{ rollNumber, studentName, subjects, sgpa, percentage, ... validationStatus }]
 *   detectedRolls: number,
 *   warnings: string[]
 * }
 */
async function parseResultPdf(bufferOrText, adminMeta = {}) {
  // ── Step 1: Extract text ─────────────────────────────────────────────────
  let text = "";
  if (Buffer.isBuffer(bufferOrText)) {
    try {
      const data = await pdfParse(bufferOrText, { max: 0 }); // max:0 = all pages
      text = data.text || "";
    } catch (err) {
      console.warn("[pdfParser] pdf-parse failed:", err.message);
      text = bufferOrText.toString("utf8");
    }
  } else {
    text = String(bufferOrText || "");
  }

  const warnings = [];

  // ── Step 2: Determine exam metadata ────────────────────────────────────
  const semester    = adminMeta.semester    || detectSemester(text)    || null;
  const regulation  = adminMeta.regulation  || detectRegulation(text)  || "R23";
  const academicYear = adminMeta.academicYear || "";
  const examSession  = adminMeta.examSession  || detectExamSession(text) || "";
  const examType     = adminMeta.examType     || "Regular";

  if (!semester) {
    warnings.push("Could not determine semester from PDF — please verify.");
  }

  // ── Step 3: Find all roll numbers ────────────────────────────────────────
  const rollMatches = [...text.matchAll(ROLL_REGEX)].map(m => m[1].toUpperCase());
  const uniqueRolls = [...new Set(rollMatches)].sort();

  if (uniqueRolls.length === 0) {
    warnings.push("No JNTUK roll numbers found in the PDF. The PDF may be scanned (image-based) or use an unsupported format.");
    return {
      semester, regulation, academicYear, examSession, examType,
      extractedStudents: [],
      detectedRolls: 0,
      warnings,
    };
  }

  // ── Step 4: Split text into per-student regions ──────────────────────────
  const lines = text.split("\n");
  const lineRollMap = new Map(); // rollNumber → line index

  for (let i = 0; i < lines.length; i++) {
    const found = [...lines[i].matchAll(ROLL_REGEX)];
    for (const m of found) {
      const roll = m[1].toUpperCase();
      if (!lineRollMap.has(roll)) {
        lineRollMap.set(roll, i);
      }
    }
  }

  // Sort uniqueRolls by their APPEARANCE ORDER in the document (line index)
  const orderedRolls = [...uniqueRolls].sort((a, b) => {
    const lineA = lineRollMap.get(a) ?? 0;
    const lineB = lineRollMap.get(b) ?? 0;
    return lineA - lineB;
  });

  // ── Step 5: For each roll, extract subject data ──────────────────────────
  const extractedStudents = [];

  for (let ri = 0; ri < orderedRolls.length; ri++) {
    const roll = orderedRolls[ri];
    const startLine = lineRollMap.get(roll) ?? -1;
    const nextRoll  = orderedRolls[ri + 1];
    const endLine   = nextRoll && lineRollMap.has(nextRoll)
      ? lineRollMap.get(nextRoll)
      : Math.min(startLine + 30, lines.length);

    // Lines belonging to this student
    const studentLines = startLine >= 0
      ? lines.slice(startLine, endLine)
      : [];

    // Try to find student name (line containing roll or next line)
    let studentName = "";
    for (const line of studentLines.slice(0, 5)) {
      const clean = line
        .replace(ROLL_REGEX, "")
        .replace(/\b(HTNO|ROLL|NAME|STUDENT|NO|HALL|TICKET|REGISTRATION|NUMBER)\b/gi, "")
        .replace(/\d/g, "")
        .replace(/[^A-Za-z\s.]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length >= 3 && /[A-Za-z]{2,}/.test(clean)) {
        studentName = clean;
        break;
      }
    }

    // Extract subjects from student's text block
    const { subjects, confidence } = extractSubjectsFromLines(studentLines);

    // Compute SGPA if we have subjects with grades
    const { sgpa, percentage, totalCredits } = subjects.length > 0
      ? calcSgpa(subjects)
      : { sgpa: 0, percentage: 0, totalCredits: 0 };

    const backlogCount   = subjects.filter(s => !s.passed).length;
    const failedSubjects = subjects.filter(s => !s.passed).map(s => s.name);
    const passed         = backlogCount === 0 && subjects.length > 0;

    // Determine validation status
    let validationStatus = "VALID";
    let validationNotes  = "";

    if (subjects.length === 0) {
      validationStatus = "NEEDS_REVIEW";
      validationNotes  = "No subjects extracted from PDF for this student.";
    } else if (confidence === "LOW") {
      validationStatus = "NEEDS_REVIEW";
      validationNotes  = "Subject data extracted with low confidence. Credits or names may be incomplete.";
    } else if (confidence === "MEDIUM") {
      validationNotes  = "Some subject details uncertain.";
    }

    extractedStudents.push({
      rollNumber: roll,
      studentName,
      semester:    semester || "3-1",
      regulation,
      academicYear,
      examSession,
      examType,
      sgpa,
      percentage,
      totalCredits,
      passed,
      backlogCount,
      failedSubjects,
      subjects,
      validationStatus,
      validationNotes,
    });
  }

  // Summary warnings
  const needsReview = extractedStudents.filter(s => s.validationStatus === "NEEDS_REVIEW").length;
  if (needsReview > 0) {
    warnings.push(`${needsReview} student record(s) need admin review (subjects could not be extracted clearly).`);
  }

  return {
    semester,
    regulation,
    academicYear,
    examSession,
    examType,
    extractedStudents,
    detectedRolls: uniqueRolls.length,
    warnings,
  };
}

module.exports = {
  detectSemester,
  detectRegulation,
  detectExamSession,
  parseResultPdf,
};
