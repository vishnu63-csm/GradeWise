const mongoose = require("mongoose");
const User = require("../models/User");
const Student = require("../models/Student");
const {
  validateName,
  validateRollNumber,
  validateDepartment,
  validatePhone,
  validateCategory,
} = require("../utils/validation");

require("dotenv").config();

async function runAudit() {
  try {
    const mongoUri =
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/sgpa_app";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB for Data Audit...\n");

    const users = await User.find({}).lean();
    const students = await Student.find({}).lean();

    console.log(`==================================================`);
    console.log(`EXISTING DATABASE AUDIT REPORT`);
    console.log(`==================================================`);
    console.log(`Total Users in DB: ${users.length}`);
    console.log(`Total Students in DB: ${students.length}\n`);

    const studentMapByRoll = new Map();
    students.forEach((s) => studentMapByRoll.set(s.rollNumber, s));

    const invalidRecords = [];
    const validRecords = [];

    for (const u of users) {
      const s = studentMapByRoll.get(u.rollNumber) || {};
      const category = s.category || "Regular Entry";

      const errors = [];

      const nameVal = validateName(u.name);
      if (!nameVal.valid) errors.push(`Name: ${nameVal.message}`);

      const rollVal = validateRollNumber(u.rollNumber, category);
      if (!rollVal.valid) errors.push(`Roll: ${rollVal.message}`);

      const deptVal = validateDepartment(u.dept);
      if (!deptVal.valid) errors.push(`Dept: ${deptVal.message}`);

      const phoneVal = validatePhone(u.phone);
      if (!phoneVal.valid) errors.push(`Phone: ${phoneVal.message}`);

      const catVal = validateCategory(category);
      if (!catVal.valid) errors.push(`Category: ${catVal.message}`);

      const recordInfo = {
        userId: u._id.toString(),
        studentId: s._id ? s._id.toString() : "N/A",
        name: u.name,
        rollNumber: u.rollNumber,
        dept: u.dept,
        phone: u.phone,
        category: category,
        errors,
      };

      if (errors.length > 0) {
        invalidRecords.push(recordInfo);
      } else {
        validRecords.push(recordInfo);
      }
    }

    console.log(`--------------------------------------------------`);
    console.log(`AUDIT SUMMARY`);
    console.log(`--------------------------------------------------`);
    console.log(`Valid Records: ${validRecords.length}`);
    console.log(`Invalid Records Identified: ${invalidRecords.length}\n`);

    if (invalidRecords.length > 0) {
      console.log(`--------------------------------------------------`);
      console.log(`DETAILED INVALID RECORDS REPORT`);
      console.log(`--------------------------------------------------`);
      invalidRecords.forEach((rec, idx) => {
        console.log(`[Record #${idx + 1}]`);
        console.log(`  User ID:    ${rec.userId}`);
        console.log(`  Student ID: ${rec.studentId}`);
        console.log(`  Name:       "${rec.name}"`);
        console.log(`  Roll No:    "${rec.rollNumber}"`);
        console.log(`  Dept:       "${rec.dept}"`);
        console.log(`  Phone:      "${rec.phone}"`);
        console.log(`  Category:   "${rec.category}"`);
        console.log(`  Validation Errors:`);
        rec.errors.forEach((err) => console.log(`    ❌ ${err}`));
        console.log(``);
      });
    }

    await mongoose.disconnect();
    console.log(`Audit complete. No records were deleted or modified.`);
  } catch (err) {
    console.error("Audit script failed:", err.message);
  }
}

runAudit();
