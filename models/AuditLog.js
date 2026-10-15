const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    adminUsername: { type: String, default: "System", index: true },
    details: { type: String, default: "" },
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: "ResultUpload", default: null, index: true },
    targetRollNumber: { type: String, default: null, index: true },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
