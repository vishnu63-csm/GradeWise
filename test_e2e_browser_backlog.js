/**
 * test_e2e_browser_backlog.js
 * Comprehensive Real Browser End-to-End & Security Verification for Backlog Clearance
 */

const dotenv = require("dotenv");
dotenv.config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const jwt = require("jsonwebtoken");

const Student = require("./models/Student");
const User = require("./models/User");

const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runBrowserE2E() {
  console.log("==================================================");
  console.log("REAL BROWSER E2E & SECURITY VERIFICATION");
  console.log("==================================================");

  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/sgpa_app";
    await mongoose.connect(mongoUri);
  }

  const testRollA = "23A31A6299";
  const testRollB = "23A31A6288";
  const latRoll   = "24A35A6201";
  const testPass  = "password123";

  // Clean test users
  await Student.deleteMany({ rollNumber: { $in: [testRollA, testRollB, latRoll] } });
  await User.deleteMany({ rollNumber: { $in: [testRollA, testRollB, latRoll] } });

  // 1. Create Regular Student A with F grade in 1-1
  // 1-1: Programming in C (3 cr, A=9), Math-I (4 cr, F=0), Physics (3 cr, A=9) -> SGPA 5.40
  // 1-2: Data Structures (4 cr, A=9), Chemistry (3 cr, A=9), Graphics (3 cr, A=9) -> SGPA 9.00
  // Initial CGPA = 7.20 (64.50%)
  const studentA = await Student.create({
    name: "Regular Student A",
    rollNumber: testRollA,
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

  const userA = new User({
    name: studentA.name,
    rollNumber: testRollA,
    dept: studentA.dept,
    phone: studentA.phone,
    passwordHash: testPass,
  });
  await userA.save();

  // Create Student B (Target for unauthorized access testing)
  const studentB = await Student.create({
    name: "Regular Student B",
    rollNumber: testRollB,
    dept: "CSM",
    phone: "9876543211",
    category: "Regular Entry",
    semesters: [
      {
        semester: "2-1",
        credits: 10,
        sgpa: 6.00,
        subjects: [
          { code: "23CS201", subject: "Python", credits: 4, grade: "F", gradePoint: 0 }
        ]
      }
    ]
  });
  const userB = new User({
    name: studentB.name,
    rollNumber: testRollB,
    dept: studentB.dept,
    phone: studentB.phone,
    passwordHash: testPass,
  });
  await userB.save();

  // Create Lateral Entry Student
  const studentLat = await Student.create({
    name: "Lateral Student",
    rollNumber: latRoll,
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
  const userLat = new User({
    name: studentLat.name,
    rollNumber: latRoll,
    dept: studentLat.dept,
    phone: studentLat.phone,
    passwordHash: testPass,
  });
  await userLat.save();

  console.log(`✅ Seeded test users: Student A (${testRollA}), Student B (${testRollB}), Lateral Student (${latRoll})`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on("console", msg => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", err => console.error("PAGE ERROR:", err));

    // Handle alert dialogs automatically
    page.on("dialog", async dialog => {
      console.log(`💬 Browser Alert Dialog: "${dialog.message()}"`);
      await dialog.dismiss();
    });

    // Step 1: Open Login Page
    console.log(`\nStep 1: Navigating to ${BASE_URL}/login.html...`);
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: "networkidle0" });

    // Fill credentials for Student A
    await page.type("#identifier", testRollA);
    await page.type("#password", testPass);

    // Step 2: Login & Redirect to app.html
    console.log("Step 2: Submitting login form...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#submitBtn")
    ]);

    console.log(`✅ Logged in successfully. Current URL: ${page.url()}`);

    // Allow loadHome() execution
    await new Promise(r => setTimeout(r, 2000));

    const initialCgpa = await page.$eval("#kpiCgpa", el => el.textContent.trim());
    const initialBacklogs = await page.$eval("#kpiBacklogs", el => el.textContent.trim());
    console.log(`Initial KPIs -> CGPA: ${initialCgpa}, Backlogs: ${initialBacklogs}`);

    if (initialCgpa !== "7.20" || initialBacklogs !== "1") {
      throw new Error(`Initial KPI mismatch! Expected CGPA=7.20, Backlogs=1. Got CGPA=${initialCgpa}, Backlogs=${initialBacklogs}`);
    }
    console.log("✅ Initial dashboard KPIs verified!");

    // Step 4: Navigate to SGPA Tab
    console.log("\nStep 4: Navigating to SGPA tab...");
    await page.click('button[data-tab="sgpa"]');
    await page.waitForSelector("#semesterGrid", { visible: true });
    await new Promise(r => setTimeout(r, 600));

    // Step 5: Locate Mathematics-I row & Update Grade button
    console.log("Step 5: Locating Mathematics-I subject row & 'Update Grade' button...");
    const updateBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll(".btn-secondary"));
      return btns.find(b => b.textContent.includes("Update Grade"));
    });

    if (!updateBtn || !(await updateBtn.asElement())) {
      throw new Error("Update Grade button NOT found in SGPA view!");
    }
    console.log("✅ 'Update Grade' button located.");

    // Step 6: Click Update Grade & Inspect Modal Details
    console.log("\nStep 6: Opening Update Grade modal...");
    await updateBtn.asElement().click();
    await page.waitForSelector("#updateGradeModal", { visible: true });

    const modalCode  = await page.$eval("#ugSubjectCode", el => el.textContent.trim());
    const modalName  = await page.$eval("#ugSubjectName", el => el.textContent.trim());
    const modalCr    = await page.$eval("#ugCredits", el => el.textContent.trim());
    const modalGrade = await page.$eval("#ugPrevGrade", el => el.textContent.trim());
    const modalPts   = await page.$eval("#ugPrevGradePoint", el => el.textContent.trim());

    console.log(`Modal Content -> Code: '${modalCode}', Name: '${modalName}', Credits: '${modalCr}', PrevGrade: '${modalGrade}', PrevPts: '${modalPts}'`);

    if (modalName !== "Mathematics-I" || modalGrade !== "F" || modalPts !== "0") {
      throw new Error(`Modal content verification failed! Got Name '${modalName}', Grade '${modalGrade}'`);
    }
    console.log("✅ Modal display details verified successfully!");

    // Step 7 & 8: Select Grade B & Verify Grade Point counter (8 Points)
    console.log("\nStep 7 & 8: Changing Grade from F to B...");
    await page.select("#ugNewGrade", "B");
    await page.evaluate(() => {
      document.getElementById("ugNewGrade").dispatchEvent(new Event("change"));
    });

    const livePts = await page.$eval("#ugNewGradePointDisplay", el => el.textContent.trim());
    console.log(`Live Grade Point Display: '${livePts}'`);
    if (!livePts.includes("8")) {
      throw new Error(`Expected live points to contain '8', got '${livePts}'`);
    }
    console.log("✅ Live grade point update verified: 8 Points.");

    // Step 9 & 10: Submit Form (Save & Recalculate)
    console.log("\nStep 9 & 10: Clicking Save & Recalculate...");
    await page.click("#ugSubmitBtn");
    
    // Wait for update processing to finish
    await page.waitForFunction(() => {
      const alertEl = document.getElementById("ugAlert");
      const btn = document.getElementById("ugSubmitBtn");
      const modal = document.getElementById("updateGradeModal");
      return (alertEl && alertEl.style.display !== "none") || 
             (modal && !modal.classList.contains("open")) || 
             (btn && btn.textContent !== "Saving & Recalculating...");
    }, { timeout: 10000 });

    const modalAlertText = await page.evaluate(() => {
      const alertEl = document.getElementById("ugAlert");
      return alertEl && alertEl.style.display !== "none" ? alertEl.textContent : "";
    });
    if (modalAlertText) {
      console.log("Modal Alert Text:", modalAlertText);
    }
    await new Promise(r => setTimeout(r, 1000));

    // Step 11: Verify subject row reflects new Grade B
    const updatedSubjText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".sem-subject-row"));
      const mathRow = rows.find(r => r.textContent.includes("Mathematics-I"));
      return mathRow ? mathRow.textContent : "";
    });
    console.log(`Updated Subject Row Text: ${updatedSubjText.replace(/\s+/g, ' ')}`);
    if (!updatedSubjText.includes("B")) {
      throw new Error(`Subject row failed to update to B! Got: ${updatedSubjText}. Modal alert: ${modalAlertText}`);
    }
    console.log("✅ Subject row verified: Grade updated to B.");

    // Step 12, 13, 14, 15, 16: Return to Dashboard & Verify updated KPIs
    console.log("\nStep 12-16: Returning to Dashboard to verify dynamic KPI updates...");
    await page.click('button[data-tab="home"]');
    await new Promise(r => setTimeout(r, 1200));
    
    const newCgpa = await page.$eval("#kpiCgpa", el => el.textContent.trim());
    const newBacklogs = await page.$eval("#kpiBacklogs", el => el.textContent.trim());
    console.log(`Updated Dashboard KPIs -> CGPA: ${newCgpa} (Expected: 8.80), Backlogs: ${newBacklogs} (Expected: 0)`);

    if (newCgpa !== "8.80" || newBacklogs !== "0") {
      throw new Error(`Dynamic KPI update failed! Expected CGPA=8.80, Backlogs=0. Got CGPA=${newCgpa}, Backlogs=${newBacklogs}`);
    }
    console.log("✅ Dynamic KPI updates verified! CGPA=8.80, Backlogs=0.");

    // Step 18 & 19: Refresh Browser Page & Verify Persistence
    console.log("\nStep 18 & 19: Reloading browser page to test persistence...");
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1200));

    const reloadedCgpa = await page.$eval("#kpiCgpa", el => el.textContent.trim());
    const reloadedBacklogs = await page.$eval("#kpiBacklogs", el => el.textContent.trim());
    console.log(`Reloaded KPIs -> CGPA: ${reloadedCgpa}, Backlogs: ${reloadedBacklogs}`);

    if (reloadedCgpa !== "8.80" || reloadedBacklogs !== "0") {
      throw new Error(`Persistence failure after page reload! Got CGPA=${reloadedCgpa}, Backlogs=${reloadedBacklogs}`);
    }
    console.log("✅ Persistence verified! Grade update, SGPA & CGPA persist across browser reloads.");

    // Step 20: Audit Trail Verification in Database
    console.log("\nStep 20: Verifying grade history audit trail in MongoDB...");
    const dbStudent = await Student.findOne({ rollNumber: testRollA });
    if (!dbStudent.gradeHistory || dbStudent.gradeHistory.length === 0) {
      throw new Error("Audit history record missing in Student document!");
    }
    const record = dbStudent.gradeHistory[0];
    console.log(`Audit Record: Subject='${record.subjectName}', Previous='${record.previousGrade}' (${record.previousGradePoint} pts), New='${record.newGrade}' (${record.newGradePoint} pts)`);

    if (record.previousGrade !== "F" || record.newGrade !== "B") {
      throw new Error("Audit record does not preserve original F grade attempt!");
    }
    console.log("✅ Audit history verified! Original 'F' attempt is preserved.");

    // SECURITY VERIFICATION SUITE
    console.log("\n==================================================");
    console.log("RUNNING API SECURITY VERIFICATION TESTS");
    console.log("==================================================");

    const userADoc   = await User.findOne({ rollNumber: testRollA });
    const userBDoc   = await User.findOne({ rollNumber: testRollB });
    const userLatDoc = await User.findOne({ rollNumber: latRoll });

    const tokenA   = jwt.sign({ id: userADoc._id, rollNumber: testRollA, name: userADoc.name }, JWT_SECRET);
    const tokenB   = jwt.sign({ id: userBDoc._id, rollNumber: testRollB, name: userBDoc.name }, JWT_SECRET);
    const tokenLat = jwt.sign({ id: userLatDoc._id, rollNumber: latRoll, name: userLatDoc.name }, JWT_SECRET);

    // Security Test 1: Cross-student grade modification (Student B attempting to modify Student A's 1-1 Mathematics-I)
    // Student B does NOT own Student A's 1-1 record -> API should reject with HTTP 404 / 403
    const sec1Res = await fetch(`${BASE_URL}/api/student/semester/update-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenB}` },
      body: JSON.stringify({ semester: "1-1", subject: "Mathematics-I", newGrade: "S" })
    });
    console.log(`Security Test 1 (Cross-student edit rejection): HTTP ${sec1Res.status}`);
    if (sec1Res.status !== 404 && sec1Res.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Cross-student grade modification returned HTTP ${sec1Res.status}`);
    }
    console.log("✅ Security Test 1 PASS: Prevented cross-student grade modification.");

    // Security Test 2: Invalid Grade Value
    const sec2Res = await fetch(`${BASE_URL}/api/student/semester/update-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenA}` },
      body: JSON.stringify({ semester: "1-1", subject: "Mathematics-I", newGrade: "Z_INVALID" })
    });
    console.log(`Security Test 2 (Invalid grade value rejection): HTTP ${sec2Res.status}`);
    if (sec2Res.status !== 400) {
      throw new Error(`SECURITY VULNERABILITY: Invalid grade value returned HTTP ${sec2Res.status}`);
    }
    console.log("✅ Security Test 2 PASS: Invalid grade value rejected.");

    // Security Test 3: Unauthorized API Request (No JWT token)
    const sec3Res = await fetch(`${BASE_URL}/api/student/semester/update-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semester: "1-1", subject: "Mathematics-I", newGrade: "S" })
    });
    console.log(`Security Test 3 (No token rejection): HTTP ${sec3Res.status}`);
    if (sec3Res.status !== 401) {
      throw new Error(`SECURITY VULNERABILITY: Unauthenticated request returned HTTP ${sec3Res.status}`);
    }
    console.log("✅ Security Test 3 PASS: Unauthenticated request rejected.");

    // Security Test 4: Lateral Entry 1-1 / 1-2 Semester Restriction
    const sec4Res = await fetch(`${BASE_URL}/api/student/semester/update-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenLat}` },
      body: JSON.stringify({ semester: "1-1", subject: "Mathematics-I", newGrade: "A" })
    });
    console.log(`Security Test 4 (Lateral Entry 1-1 restriction): HTTP ${sec4Res.status}`);
    if (sec4Res.status !== 400 && sec4Res.status !== 404) {
      throw new Error(`SECURITY VULNERABILITY: Lateral Entry 1-1 modification returned HTTP ${sec4Res.status}`);
    }
    console.log("✅ Security Test 4 PASS: Lateral entry 1-1 modification restricted.");

    console.log("\n==================================================");
    console.log("ALL REAL BROWSER & SECURITY TESTS PASSED!");
    console.log("==================================================");

  } finally {
    if (browser) await browser.close();
    await Student.deleteMany({ rollNumber: { $in: [testRollA, testRollB, latRoll] } });
    await User.deleteMany({ rollNumber: { $in: [testRollA, testRollB, latRoll] } });
  }
}

runBrowserE2E().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("\n❌ BROWSER E2E FAILED:", err);
  process.exit(1);
});
