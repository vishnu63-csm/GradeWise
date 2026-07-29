const mongoose = require("mongoose");
const User = require("../models/User");
const Student = require("../models/Student");
require("dotenv").config();

async function runMigration() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isDeleteTest = args.includes("--delete-test-users");
  const isDryRun = !isApply && !isDeleteTest;

  console.log("==================================================");
  console.log("LEGACY DATA MIGRATION & CLEANUP SCRIPT");
  console.log("==================================================");
  console.log(`MODE: ${isDryRun ? "DRY RUN (No changes will be saved)" : "EXECUTION MODE"}`);
  console.log(`  --apply:             ${isApply ? "ENABLED" : "DISABLED"}`);
  console.log(`  --delete-test-users: ${isDeleteTest ? "ENABLED" : "DISABLED"}`);
  console.log("==================================================\n");

  try {
    const mongoUri =
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/sgpa_app";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB...\n");

    // 1. Identify Category Mismatches (5A in roll number but category is not Lateral Entry)
    const categoryMismatchStudents = await Student.find({
      rollNumber: /^\d{2}[A-Z0-9]{2}5A[A-Z0-9]{4}$/i,
      category: { $ne: "Lateral Entry" },
    });

    console.log(`[1] Category Mismatches Found (${categoryMismatchStudents.length} records):`);
    categoryMismatchStudents.forEach((s, i) => {
      console.log(
        `   ${i + 1}. ID: ${s._id} | Roll: ${s.rollNumber} | Name: "${s.name}" | Current Cat: "${s.category}" -> New Cat: "Lateral Entry"`
      );
    });

    if (isApply && categoryMismatchStudents.length > 0) {
      console.log("\n   --> Applying Category Fixes...");
      for (const s of categoryMismatchStudents) {
        s.category = "Lateral Entry";
        await s.save();
        console.log(`   ✅ Updated Student ${s.rollNumber} category to "Lateral Entry"`);
      }
    } else if (isDryRun && categoryMismatchStudents.length > 0) {
      console.log("   [DRY RUN] Would update category to 'Lateral Entry' for above records.");
    }

    // 2. Identify Test Users for Deletion
    const testUserRolls = ["L1785312401722", "D1785312401722"];
    const testUsers = await User.find({ rollNumber: { $in: testUserRolls } });
    const testStudents = await Student.find({ rollNumber: { $in: testUserRolls } });

    console.log(`\n[2] Test Accounts Found (${testUsers.length} Users, ${testStudents.length} Students):`);
    testUsers.forEach((u, i) => {
      console.log(`   ${i + 1}. User ID: ${u._id} | Name: "${u.name}" | Roll: ${u.rollNumber} | Phone: ${u.phone}`);
    });

    if (isDeleteTest && testUsers.length > 0) {
      console.log("\n   --> Deleting Test Accounts...");
      const userRes = await User.deleteMany({ rollNumber: { $in: testUserRolls } });
      const studentRes = await Student.deleteMany({ rollNumber: { $in: testUserRolls } });
      console.log(`   ✅ Deleted ${userRes.deletedCount} User(s) and ${studentRes.deletedCount} Student(s).`);
    } else if (isDryRun && testUsers.length > 0) {
      console.log("   [DRY RUN] Would delete test account records above.");
    }

    // 3. Identify Invalid Phone Records (Skipped for manual review)
    const invalidPhoneUsers = await User.find({
      rollNumber: { $nin: testUserRolls },
      phone: { $not: /^[6-9]\d{9}$/ },
    });

    console.log(`\n[3] Invalid Phone Numbers Flagged for Manual Review (${invalidPhoneUsers.length} records):`);
    invalidPhoneUsers.forEach((u, i) => {
      console.log(`   ${i + 1}. User ID: ${u._id} | Name: "${u.name}" | Roll: ${u.rollNumber} | Invalid Phone: "${u.phone}"`);
    });
    console.log("   ⚠️ ACTION: Flagged for manual verification only. No automatic changes made.");

    console.log("\n==================================================");
    console.log(`Migration script finished successfully. (${isDryRun ? "DRY RUN" : "CHANGES SAVED"})`);
    console.log("==================================================\n");

    await mongoose.disconnect();
  } catch (err) {
    console.error("Migration script error:", err.message);
    process.exit(1);
  }
}

runMigration();
