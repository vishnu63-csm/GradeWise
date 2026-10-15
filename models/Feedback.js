const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["Bug Report", "Calculation Issue", "Feature Request", "General Feedback"],
      default: "General Feedback",
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    userRollNumber: { type: String, default: "Anonymous", index: true },
    userName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["OPEN", "IN_REVIEW", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", FeedbackSchema);
