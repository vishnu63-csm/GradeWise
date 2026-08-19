const mongoose = require("mongoose");

/**
 * SubjectResult — individual subject result for a student in one exam.
 */
const SubjectResultSchema = new mongoose.Schema(
  {
    code:          { type: String, trim: true, default: "" },
    name:          { type: String, required: true, trim: true },
    internalMarks: { type: Number, default: null },
    externalMarks: { type: Number, default: null },
    grade: {
      type: String,
      enum: ["S", "A", "B", "C", "D", "E", "F", "Ab", "UNKNOWN"],
      default: "UNKNOWN",
    },
    gradePoint:    { type: Number, default: 0 },
    credits:       { type: Number, default: 3 },
    passed:        { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * StudentResult — one student's result for one exam (upload).
 * Exists independently of whether the student has a User account.
 * Matched to students via rollNumber at query time.
 */
const StudentResultSchema = new mongoose.Schema(
  {
    // Link to the upload batch
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResultUpload",
      required: true,
      index: true,
    },

    // Student identity
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    studentName: { type: String, trim: true, default: "" },

    // Classification (derived from RollNumberRule or admin input)
    department:    { type: String, trim: true, default: "" },
    admissionType: {
      type: String,
      enum: ["Regular Entry", "Lateral Entry", "Unknown"],
      default: "Unknown",
    },

    // Exam metadata (copied from upload for fast queries)
    semester: {
      type: String,
      required: true,
      enum: ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
      index: true,
    },
    regulation:   { type: String, default: "R23" },
    academicYear: { type: String, default: "" },
    examSession:  { type: String, default: "" },
    examType:     { type: String, enum: ["Regular", "Supply", "Other"], default: "Regular" },

    // Computed result values
    sgpa:          { type: Number, default: 0 },
    percentage:    { type: Number, default: 0 },
    totalCredits:  { type: Number, default: 0 },
    passed:        { type: Boolean, default: true },
    backlogCount:  { type: Number, default: 0 },
    failedSubjects: { type: [String], default: [] },

    // Subjects
    subjects: { type: [SubjectResultSchema], default: [] },

    // Validation state (used before publishing)
    validationStatus: {
      type: String,
      enum: ["VALID", "NEEDS_REVIEW", "INVALID", "READY_TO_PUBLISH"],
      default: "VALID",
      index: true,
    },
    validationNotes: { type: String, default: "" },
    reviewReasons:    { type: [String], default: [] },
    extractionErrors: { type: [String], default: [] },
    isVerified:       { type: Boolean, default: false },
    reviewedBy:       { type: String, default: null },
    reviewedAt:       { type: Date, default: null },

    // Published flag (controlled by upload status)
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// Primary lookup: student logs in → find all their published results
StudentResultSchema.index({ rollNumber: 1, isPublished: 1 });

// Admin review: find all records in an upload that need review
StudentResultSchema.index({ uploadId: 1, validationStatus: 1 });

// Analytics: filter by semester, regulation, dept
StudentResultSchema.index({ semester: 1, regulation: 1, department: 1 });

// Duplicate detection compound index
StudentResultSchema.index(
  { rollNumber: 1, semester: 1, regulation: 1, academicYear: 1, examSession: 1 },
  { name: "dup_check_idx" }
);

module.exports = mongoose.model("StudentResult", StudentResultSchema);
