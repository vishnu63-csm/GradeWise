const mongoose = require("mongoose");

const SubjectStatSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, default: 3 },
    totalAttempted: { type: Number, required: true, default: 0 },
    passedCount: { type: Number, required: true, default: 0 },
    failedCount: { type: Number, required: true, default: 0 },
    passPercentage: { type: Number, required: true, default: 0 },
    failPercentage: { type: Number, required: true, default: 0 },
    gradeCounts: {
      S: { type: Number, default: 0 },
      A: { type: Number, default: 0 },
      B: { type: Number, default: 0 },
      C: { type: Number, default: 0 },
      D: { type: Number, default: 0 },
      E: { type: Number, default: 0 },
      F: { type: Number, default: 0 },
      Ab: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const ResultBatchSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    semester: {
      type: String,
      required: true,
      enum: ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
    },
    regulation: { type: String, required: true, default: "R23" },
    dept: { type: String, required: true, default: "CSM" },
    uploadedBy: { type: String, default: "Admin" },
    academicYear: { type: String, default: "" },
    isDraft: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    totalStudents: { type: Number, required: true, default: 0 },
    passedStudents: { type: Number, required: true, default: 0 },
    failedStudents: { type: Number, required: true, default: 0 },
    passPercentage: { type: Number, required: true, default: 0 },
    failPercentage: { type: Number, required: true, default: 0 },
    averageSgpa: { type: Number, default: 0 },
    highestSgpa: { type: Number, default: 0 },
    lowestSgpa: { type: Number, default: 0 },
    medianSgpa: { type: Number, default: 0 },
    averagePercentage: { type: Number, default: 0 },
    highestPercentage: { type: Number, default: 0 },
    lowestPercentage: { type: Number, default: 0 },
    medianPercentage: { type: Number, default: 0 },
    totalBacklogs: { type: Number, default: 0 },
    studentsWithBacklogs: { type: Number, default: 0 },
    rollNumberRange: {
      startRoll: { type: String, default: "" },
      endRoll: { type: String, default: "" },
    },
    gradeDistribution: {
      S: { type: Number, default: 0 },
      A: { type: Number, default: 0 },
      B: { type: Number, default: 0 },
      C: { type: Number, default: 0 },
      D: { type: Number, default: 0 },
      E: { type: Number, default: 0 },
      F: { type: Number, default: 0 },
      Ab: { type: Number, default: 0 },
    },
    backlogDistribution: {
      b0: { type: Number, default: 0 },
      b1: { type: Number, default: 0 },
      b2: { type: Number, default: 0 },
      b3: { type: Number, default: 0 },
      b4plus: { type: Number, default: 0 },
    },
    sgpaDistribution: {
      range9_10: { type: Number, default: 0 },
      range8_89: { type: Number, default: 0 },
      range7_79: { type: Number, default: 0 },
      range6_69: { type: Number, default: 0 },
      range5_59: { type: Number, default: 0 },
      below5: { type: Number, default: 0 },
    },
    percentageDistribution: {
      range90_100: { type: Number, default: 0 },
      range80_89: { type: Number, default: 0 },
      range70_79: { type: Number, default: 0 },
      range60_69: { type: Number, default: 0 },
      range50_59: { type: Number, default: 0 },
      below50: { type: Number, default: 0 },
    },
    subjectStats: { type: [SubjectStatSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResultBatch", ResultBatchSchema);
