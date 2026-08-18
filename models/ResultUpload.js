const mongoose = require("mongoose");

/**
 * ResultUpload — tracks a single PDF upload through its lifecycle.
 * One upload = one exam result set for one semester.
 */
const ResultUploadSchema = new mongoose.Schema(
  {
    fileName:    { type: String, required: true },
    fileSize:    { type: Number, default: 0 },
    uploadedBy:  { type: String, default: "Admin" },

    // Exam metadata (admin-provided)
    semester: {
      type: String,
      required: true,
      enum: ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
      index: true,
    },
    regulation:   { type: String, default: "R23", index: true },
    academicYear: { type: String, default: "" },   // e.g. "2024-25"
    examSession:  { type: String, default: "" },   // e.g. "April 2026"
    examType:     { type: String, enum: ["Regular", "Supply", "Other"], default: "Regular" },

    // Upload lifecycle status
    status: {
      type: String,
      enum: [
        "PROCESSING",
        "VALIDATING",
        "DRAFT",
        "NEEDS_REVIEW",
        "READY_TO_PUBLISH",
        "PUBLISHING",
        "PUBLISHED",
        "PUBLISH_FAILED",
        "ARCHIVED",
      ],
      default: "PROCESSING",
      index: true,
    },

    // Processing summary
    detectedDepartments: { type: [String], default: [] },
    totalStudents:        { type: Number, default: 0 },
    validStudents:        { type: Number, default: 0 },
    invalidStudents:      { type: Number, default: 0 },
    needsReviewCount:     { type: Number, default: 0 },
    duplicateCount:       { type: Number, default: 0 },

    // Aggregate analytics snapshot (computed on publish)
    analytics: {
      passedStudents:   { type: Number, default: 0 },
      failedStudents:   { type: Number, default: 0 },
      passPercentage:   { type: Number, default: 0 },
      averageSgpa:      { type: Number, default: 0 },
      highestSgpa:      { type: Number, default: 0 },
      lowestSgpa:       { type: Number, default: 0 },
      totalBacklogs:    { type: Number, default: 0 },
    },

    publishedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index for listing uploads by status and date
ResultUploadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ResultUpload", ResultUploadSchema);
