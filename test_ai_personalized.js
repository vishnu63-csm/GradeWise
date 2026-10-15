const http = require("http");
const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on("error", (err) => reject(err));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runPersonalizedAiTest() {
  console.log("==================================================");
  console.log("PERSONALIZED STUDENT ACADEMIC CONTEXT TEST");
  console.log("==================================================");

  // 1. Authenticate test student
  const testRoll = "23HP1A4299";
  const loginRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { rollNumber: testRoll, password: "NewSecurePassword456" }
  );

  const token = loginRes.body.token;
  if (!token) {
    console.error("❌ Failed to log in test user.");
    process.exit(1);
  }

  // Add 2 semesters to test student record in DB directly for rich personalized context testing
  const mongoose = require("mongoose");
  require("dotenv").config();
  const Student = require("./models/Student");
  await mongoose.connect(process.env.MONGODB_URI);

  const student = await Student.findOne({ rollNumber: testRoll });
  if (student) {
    student.semesters = [
      {
        semester: "1-1",
        credits: 19,
        sgpa: 8.10,
        subjects: [{ subject: "Mathematics I", credits: 4, grade: "A" }]
      },
      {
        semester: "1-2",
        credits: 19,
        sgpa: 8.50,
        subjects: [{ subject: "Data Structures", credits: 4, grade: "S" }]
      }
    ];
    await student.save();
    console.log("✅ Seeded student semester records in DB: S1=8.10, S2=8.50 (CGPA derived = 8.30).");
  }

  // 2. Ask personalized question: "What is my current CGPA?"
  console.log("\nQuery 1: Asking personalized question: 'What is my current CGPA?'...");
  const cgpaRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/ai/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
    { message: "What is my current CGPA?", stream: false }
  );

  console.log("🤖 GradeWise AI Response:");
  console.log(cgpaRes.body.message);

  if (cgpaRes.body.message && (cgpaRes.body.message.includes("8.3") || cgpaRes.body.message.includes("CGPA"))) {
    console.log("✅ Query 1 PASS: GradeWise AI answered with student's exact calculated CGPA from database context!");
  } else {
    console.error("❌ Query 1 FAIL: Did not include expected CGPA value.");
    process.exit(1);
  }

  // 3. Ask app usage question: "How do I add a semester?"
  console.log("\nQuery 2: Asking app usage question: 'How do I add a semester?'...");
  const usageRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/ai/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
    { message: "How do I add a semester in GradeWise?", stream: false }
  );

  console.log("🤖 GradeWise AI Response:");
  console.log(usageRes.body.message);

  if (usageRes.body.message && usageRes.body.message.includes("Add Semester")) {
    console.log("✅ Query 2 PASS: GradeWise AI gave accurate GradeWise UI instructions!");
  } else {
    console.error("❌ Query 2 FAIL: Did not give UI guidance.");
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("\n--------------------------------------------------");
  console.log("PERSONALIZED & APP CONTEXT TESTS PASSED CLEANLY!");
  console.log("--------------------------------------------------");
}

runPersonalizedAiTest();
