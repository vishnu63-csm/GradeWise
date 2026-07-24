const mongoose = require("mongoose");

const SubjectSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 0 },
    grade: {
      type: String,
      required: true,
      enum: ["S", "A", "B", "C", "D", "E", "F", "Ab"],
    },
  },
  { _id: false }
);

const SemesterSchema = new mongoose.Schema(
  {
    semester: {
      type: String,
      required: true,
      enum: ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
    },
    subjects: { type: [SubjectSchema], default: [] },
    credits: { type: Number, required: true },
    sgpa: { type: Number, required: true },
  },
  { _id: false }
);

const StudentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    dept: { type: String, required: true, trim: true, default: "CSM" },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{10}$/, "Phone number must be 10 digits"],
    },
    email: { type: String, trim: true, lowercase: true, default: "" },
    semesters: { type: [SemesterSchema], default: [] },
  },
  { timestamps: true }
);

// Recompute CGPA on the fly (not stored, always derived from semesters)
StudentSchema.methods.computeCgpa = function () {
  let totalCredits = 0;
  let weighted = 0;
  for (const s of this.semesters) {
    totalCredits += s.credits;
    weighted += s.credits * s.sgpa;
  }
  if (totalCredits === 0) return null;
  const cgpa = Math.round((weighted / totalCredits) * 100) / 100;
  const percentage = Math.round((cgpa - 0.75) * 10 * 100) / 100;
  return { cgpa, percentage, totalCredits };
};

module.exports = mongoose.model("Student", StudentSchema);
