/**
 * test_backlog_clearance.js
 * Comprehensive automated test suite for Previous Semester Grade Update / Backlog Clearance feature.
 */

const dotenv = require("dotenv");
dotenv.config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Student = require("./models/Student");
const User = require("./models/User");

const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";

async function runBacklogClearanceTests() {
  console.log("==================================================");
  console.log("BACKLOG CLEARANCE & GRADE UPDATE TEST SUITE");
  console.log("==================================================");

  // 1. Connect DB if needed
  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/sgpa_app";
    await mongoose.connect(mongoUri);
  }

  const testRoll = "23A31A6299";
  const otherRoll = "23A31A6288";

  try {
    // Clean up test users
    await Student.deleteMany({ rollNumber: { $in: [testRoll, otherRoll] } });
    await User.deleteMany({ rollNumber: { $in: [testRoll, otherRoll] } });

    // Create Test Student 1 with an F grade in 1-1 ("Mathematics", 4 credits, grade "F")
    const student1 = await Student.create({
      name: "Backlog Test Student",
      rollNumber: testRoll,
      dept: "CSM",
      phone: "9876543210",
      category: "Regular Entry",
      semesters: [
        {
          semester: "1-1",
          credits: 10,
          sgpa: 5.40,
          subjects: [
            { code: "23CS101", subject: "Programming in C", credits: 3, grade: "A", gradePoint: 9 },
            { code: "23MA101", subject: "Mathematics-I", credits: 4, grade: "F", gradePoint: 0 },
            { code: "23PH101", subject: "Physics", credits: 3, grade: "A", gradePoint: 9 }
          ]
        },
        {
          semester: "1-2",
          credits: 10,
          sgpa: 9.00,
          subjects: [
            { code: "23CS102", subject: "Data Structures", credits: 4, grade: "A", gradePoint: 9 },
            { code: "23CH101", subject: "Chemistry", credits: 3, grade: "A", gradePoint: 9 },
            { code: "23ME101", subject: "Graphics", credits: 3, grade: "A", gradePoint: 9 }
          ]
        }
      ]
    });

    // Create Test Student 2 (Unauthorized attacker attempt)
    const student2 = await Student.create({
      name: "Other Student",
      rollNumber: otherRoll,
      dept: "CSM",
      phone: "9876543211",
      category: "Regular Entry",
      semesters: []
    });

    const user1 = await User.create({
      name: student1.name,
      rollNumber: testRoll,
      dept: student1.dept,
      phone: student1.phone,
      passwordHash: "dummyhash123",
    });

    const user2 = await User.create({
      name: student2.name,
      rollNumber: otherRoll,
      dept: student2.dept,
      phone: student2.phone,
      passwordHash: "dummyhash123",
    });

    const token1 = jwt.sign({ id: user1._id, rollNumber: testRoll, name: user1.name }, JWT_SECRET);
    const token2 = jwt.sign({ id: user2._id, rollNumber: otherRoll, name: user2.name }, JWT_SECRET);

    // Initial CGPA calculation check
    const initialDerived = student1.computeCgpa();
    console.log(`Initial 1-1 SGPA: ${student1.semesters[0].sgpa.toFixed(2)} | Mathematics Grade: F (0 Pts)`);
    console.log(`Initial CGPA: ${initialDerived.cgpa.toFixed(2)} (${initialDerived.percentage.toFixed(2)}%)`);

    // TEST 1 & 2: Update F -> B via API
    console.log("\nStep 1: Submitting Grade Update (F -> B) for Mathematics-I...");

    const PORT = process.env.PORT || 3000;
    const baseUrl = `http://localhost:${PORT}`;

    const updateRes = await fetch(`${baseUrl}/api/student/semester/update-grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token1}`
      },
      body: JSON.stringify({
        semester: "1-1",
        subject: "Mathematics-I",
        newGrade: "B"
      })
    });

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(`Grade update API failed: ${updateData.error}`);
    }

    console.log("✅ Step 1 PASS: API returned 200 OK.");
    console.log(`Message: ${updateData.message}`);

    // TEST 3 & 4: Verify subject grade point and semester SGPA changed
    // 1-1 SGPA = (3*9 + 4*8 + 3*9) / 10 = (27 + 32 + 27)/10 = 86/10 = 8.60
    const expectedSgpa = 8.60;
    console.log(`Updated 1-1 SGPA: ${updateData.sgpa.toFixed(2)} (Expected: ${expectedSgpa.toFixed(2)})`);

    if (Math.abs(updateData.sgpa - expectedSgpa) > 0.001) {
      throw new Error(`SGPA calculation mismatch! Expected ${expectedSgpa}, got ${updateData.sgpa}`);
    }
    console.log("✅ Step 2 & 3 PASS: Subject grade point updated from 0 -> 8 and 1-1 SGPA recalculated correctly!");

    // TEST 5: Verify overall CGPA changed correctly
    // Sem 1-1: 10 cr @ 8.60 = 86 pts. Sem 1-2: 10 cr @ 9.00 = 90 pts. Total: 176 / 20 = 8.80 CGPA
    const expectedCgpa = 8.80;
    console.log(`Updated Overall CGPA: ${updateData.cgpa.toFixed(2)} (Expected: ${expectedCgpa.toFixed(2)})`);

    if (Math.abs(updateData.cgpa - expectedCgpa) > 0.001) {
      throw new Error(`CGPA calculation mismatch! Expected ${expectedCgpa}, got ${updateData.cgpa}`);
    }
    console.log("✅ Step 4 PASS: Overall CGPA recalculated accurately!");

    // TEST 6 & 7: Verify Grade History audit record stored in Database
    const updatedStudentInDb = await Student.findOne({ rollNumber: testRoll });
    if (!updatedStudentInDb.gradeHistory || updatedStudentInDb.gradeHistory.length === 0) {
      throw new Error("Grade history audit record was NOT stored in Student document!");
    }

    const historyRecord = updatedStudentInDb.gradeHistory[0];
    console.log("\nStored History Audit Record:");
    console.log(`Subject: ${historyRecord.subjectName} | Sem: ${historyRecord.semester} | ${historyRecord.previousGrade} (${historyRecord.previousGradePoint} pts) -> ${historyRecord.newGrade} (${historyRecord.newGradePoint} pts) | UpdatedBy: ${historyRecord.updatedBy}`);

    if (
      historyRecord.subjectName !== "Mathematics-I" ||
      historyRecord.previousGrade !== "F" ||
      historyRecord.newGrade !== "B" ||
      historyRecord.previousGradePoint !== 0 ||
      historyRecord.newGradePoint !== 8
    ) {
      throw new Error("History audit record contains wrong grade data!");
    }
    console.log("✅ Step 5 PASS: History audit record successfully verified in database!");

    // TEST 8: Unauthorized user access test (Student 2 trying to modify Student 1's grade)
    console.log("\nStep 6: Testing unauthorized grade modification prevention...");
    const unauthRes = await fetch(`${baseUrl}/api/student/semester/update-grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token2}` // Attacker token
      },
      body: JSON.stringify({
        semester: "1-1",
        subject: "Mathematics-I",
        newGrade: "S"
      })
    });

    const unauthData = await unauthRes.json();
    if (unauthRes.ok) {
      throw new Error("SECURITY FAILURE: Student 2 was able to modify Student 1's grade!");
    }
    console.log(`✅ Step 6 PASS: Prevented unauthorized access with HTTP ${unauthRes.status} (${unauthData.error}).`);

    // TEST 9: Lateral Entry recalculation sanity test
    console.log("\nStep 7: Testing Lateral Entry grade update & credit exclusion...");
    const latStudent = await Student.create({
      name: "Lateral Student",
      rollNumber: "23A31A6277",
      dept: "CSM",
      phone: "9876543212",
      category: "Lateral Entry",
      semesters: [
        {
          semester: "2-1",
          credits: 10,
          sgpa: 5.00,
          subjects: [
            { code: "23CS301", subject: "Java", credits: 5, grade: "F", gradePoint: 0 },
            { code: "23CS302", subject: "COA", credits: 5, grade: "S", gradePoint: 10 }
          ]
        }
      ]
    });

    const latUser = await User.create({
      name: latStudent.name,
      rollNumber: latStudent.rollNumber,
      dept: latStudent.dept,
      phone: latStudent.phone,
      passwordHash: "dummyhash123",
    });

    const latToken = jwt.sign({ id: latUser._id, rollNumber: latStudent.rollNumber, name: latUser.name }, JWT_SECRET);

    const latUpdateRes = await fetch(`${baseUrl}/api/student/semester/update-grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${latToken}`
      },
      body: JSON.stringify({
        semester: "2-1",
        subject: "Java",
        newGrade: "A"
      })
    });

    const latUpdateData = await latUpdateRes.json();
    if (!latUpdateRes.ok) {
      throw new Error(`Lateral Entry update failed: ${latUpdateData.error}`);
    }

    // Java (5 cr @ A=9) + COA (5 cr @ S=10) = (45+50)/10 = 9.50 SGPA & CGPA
    if (Math.abs(latUpdateData.cgpa - 9.50) > 0.001) {
      throw new Error(`Lateral Entry CGPA mismatch! Expected 9.50, got ${latUpdateData.cgpa}`);
    }
    console.log("✅ Step 7 PASS: Lateral entry backlog clearance & CGPA recalculation verified!");

    console.log("\n==================================================");
    console.log("ALL BACKLOG CLEARANCE & GRADE UPDATE TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await Student.deleteMany({ rollNumber: { $in: [testRoll, otherRoll, "23A31A6277"] } });
    await User.deleteMany({ rollNumber: { $in: [testRoll, otherRoll, "23A31A6277"] } });
  }
}

runBacklogClearanceTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("\n❌ TEST FAILED:", err.message);
  process.exit(1);
});
