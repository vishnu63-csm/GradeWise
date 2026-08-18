const mongoose = require("mongoose");

/**
 * RollNumberRule — configurable mapping from roll number prefix to department.
 *
 * JNTUK roll number structure (10 chars):
 *   [YY][INST][ADM][DEPT_CODE]  e.g. 23HP1A4201
 *   YY        = batch year (23 = 2023 admissions)
 *   INST      = institution code (HP = HITS Prem)
 *   ADM       = admission type slot (1A = Regular, 5A = Lateral Entry)
 *   DEPT_CODE = 2-char department numeric code (42 = AIML/CSM)
 *   XX        = roll sequence (01-99)
 *
 * So the 8-char prefix  "23HP1A42"  uniquely identifies:
 *   batch=2023, institution=HP, Regular Entry, dept 42
 */
const RollNumberRuleSchema = new mongoose.Schema(
  {
    // The prefix to match against (first 8 chars of roll number typically)
    pattern:       { type: String, required: true, trim: true, uppercase: true },

    // Human-readable department name
    department:    { type: String, required: true, trim: true },

    // Short dept code for analytics (e.g. "CSM", "CSE", "ECE")
    departmentCode: { type: String, trim: true, uppercase: true, default: "" },

    // Admission type inferred from roll pattern
    admissionType: {
      type: String,
      enum: ["Regular Entry", "Lateral Entry"],
      required: true,
    },

    // Regulation this rule applies to
    regulation: { type: String, default: "R23" },

    // Academic year this rule applies to (e.g. "2023-24")
    academicYear: { type: String, default: "" },

    // Description / notes
    description: { type: String, default: "" },

    // Whether this rule is active
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Unique index on pattern (one rule per prefix)
RollNumberRuleSchema.index({ pattern: 1 }, { unique: true });

/**
 * Static method: given a roll number, find the matching active rule.
 */
RollNumberRuleSchema.statics.matchRoll = async function (rollNumber) {
  const roll = String(rollNumber).trim().toUpperCase();
  // Try prefix lengths from longest (8) to shortest (4)
  const rules = await this.find({ active: true }).lean();
  let bestMatch = null;
  let bestLen = 0;
  for (const rule of rules) {
    const p = rule.pattern.toUpperCase();
    if (roll.startsWith(p) && p.length > bestLen) {
      bestMatch = rule;
      bestLen = p.length;
    }
  }
  return bestMatch; // null if no rule found
};

module.exports = mongoose.model("RollNumberRule", RollNumberRuleSchema);
