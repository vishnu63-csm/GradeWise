const mongoose = require("mongoose");

const StudentSubjectGradeSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, default: 3 },
    grade: {
      type: String,
      required: true,
      enum: ["S", "A", "B", "C", "D", "E", "F", "Ab"],
    },
    gradePoint: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const BatchStudentResultSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResultBatch",
      required: true,
      index: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    studentName: { type: String, trim: true, default: "Student" },
    semester: {
      type: String,
      required: true,
      enum: ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
      index: true,
    },
    regulation: { type: String, default: "R23" },
    dept: { type: String, default: "CSM" },
    sgpa: { type: Number, required: true, default: 0 },
    percentage: { type: Number, required: true, default: 0 },
    totalCredits: { type: Number, required: true, default: 0 },
    passed: { type: Boolean, required: true, default: true },
    backlogCount: { type: Number, required: true, default: 0 },
    failedSubjects: { type: [String], default: [] },
    subjects: { type: [StudentSubjectGradeSchema], default: [] },
  },
  { timestamps: true }
);

// Composite index for fast lookups
BatchStudentResultSchema.index({ batchId: 1, rollNumber: 1 });

module.exports = mongoose.model("BatchStudentResult", BatchStudentResultSchema);
