/**
 * test_live_vercel.js
 * Verifies that the live Vercel deployment has Backlog Clearance / Grade Update active
 */

const dotenv = require("dotenv");
dotenv.config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mongoose = require("mongoose");
const puppeteer = require("puppeteer");

const Student = require("./models/Student");
const User = require("./models/User");

const LIVE_URL = "https://grade-wise-lne9.vercel.app";

async function verifyLiveVercel() {
  console.log("==================================================");
  console.log(`VERIFYING LIVE VERCEL DEPLOYMENT: ${LIVE_URL}`);
  console.log("==================================================");

  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI missing");
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  }

  const testRoll = "23A31A6299";
  const testPass = "password123";

  // Clean and create test student
  await Student.deleteMany({ rollNumber: testRoll });
  await User.deleteMany({ rollNumber: testRoll });

  const student = await Student.create({
    name: "Live Vercel Student",
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
      }
    ]
  });

  const user = new User({
    name: student.name,
    rollNumber: testRoll,
    dept: student.dept,
    phone: student.phone,
    passwordHash: testPass,
  });
  await user.save();

  console.log(`✅ Seeded student ${testRoll} in MongoDB Atlas for live Vercel verification.`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on("dialog", async d => {
      console.log(`💬 Live Alert: "${d.message()}"`);
      await d.dismiss();
    });

    console.log(`\nStep 1: Navigating to ${LIVE_URL}/login.html...`);
    await page.goto(`${LIVE_URL}/login.html`, { waitUntil: "networkidle0" });

    await page.type("#identifier", testRoll);
    await page.type("#password", testPass);

    console.log("Step 2: Logging in...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#submitBtn")
    ]);

    console.log(`✅ Successfully logged into live site. Current URL: ${page.url()}`);

    console.log("Step 3: Navigating to SGPA tab...");
    await page.waitForSelector('button[data-tab="sgpa"]', { visible: true });
    await page.click('button[data-tab="sgpa"]');
    await page.waitForSelector("#semesterGrid", { visible: true });
    await new Promise(r => setTimeout(r, 600));

    console.log("Step 4: Locating Update Grade button on live site...");
    const updateBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll(".btn-secondary"));
      return btns.find(b => b.textContent.includes("Update Grade"));
    });

    if (!updateBtn || !(await updateBtn.asElement())) {
      throw new Error("'Update Grade' button NOT found on live Vercel deployment!");
    }
    console.log("✅ 'Update Grade' button is active on live Vercel deployment!");

    await updateBtn.asElement().click();
    await page.waitForSelector("#updateGradeModal", { visible: true });
    console.log("✅ 'Update Grade' modal successfully opened on live Vercel app!");

    console.log("Step 5: Updating grade F -> B on live Vercel app...");
    await page.select("#ugNewGrade", "B");
    await page.click("#ugSubmitBtn");
    
    // Wait for update processing to finish and modal to close
    await page.waitForFunction(() => {
      const modal = document.getElementById("updateGradeModal");
      return modal && !modal.classList.contains("open");
    }, { timeout: 15000 });

    // Step 6: Verify subject row reflects new Grade B on live site
    const updatedSubjText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".sem-subject-row"));
      const mathRow = rows.find(r => r.textContent.includes("Mathematics-I"));
      return mathRow ? mathRow.textContent : "";
    });
    console.log(`Live Subject Row Text: ${updatedSubjText.replace(/\s+/g, ' ')}`);
    if (!updatedSubjText.includes("B")) {
      throw new Error(`Live subject row failed to update to B! Got: ${updatedSubjText}`);
    }
    console.log("✅ Live subject row verified: Grade updated to B.");

    // Step 7: Navigate to Dashboard to verify dynamic KPI updates
    console.log("Step 7: Checking live Dashboard KPIs...");
    await page.click('button[data-tab="home"]');
    await page.waitForFunction(() => {
      const el = document.getElementById("kpiCgpa");
      return el && el.textContent.trim() === "8.60";
    }, { timeout: 10000 });

    const newCgpa = await page.$eval("#kpiCgpa", el => el.textContent.trim());
    const newBacklogs = await page.$eval("#kpiBacklogs", el => el.textContent.trim());
    console.log(`Live Updated KPIs -> CGPA: ${newCgpa}, Backlogs: ${newBacklogs}`);

    if (newCgpa !== "8.60" || newBacklogs !== "0") {
      throw new Error(`Live KPI mismatch! Expected CGPA=8.60, Backlogs=0. Got CGPA=${newCgpa}, Backlogs=${newBacklogs}`);
    }
    console.log("✅ Live dynamic KPI updates verified! CGPA=8.60, Backlogs=0.");

    // Step 8: Reload page to test persistence on live Vercel
    console.log("Step 8: Reloading live page to test persistence...");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const el = document.getElementById("kpiCgpa");
      return el && el.textContent.trim() === "8.60";
    }, { timeout: 10000 });

    const reloadedCgpa = await page.$eval("#kpiCgpa", el => el.textContent.trim());
    const reloadedBacklogs = await page.$eval("#kpiBacklogs", el => el.textContent.trim());
    console.log(`Reloaded Live KPIs -> CGPA: ${reloadedCgpa}, Backlogs: ${reloadedBacklogs}`);

    if (reloadedCgpa !== "8.60" || reloadedBacklogs !== "0") {
      throw new Error(`Live persistence failure! CGPA: ${reloadedCgpa}, Backlogs: ${reloadedBacklogs}`);
    }
    console.log("✅ Live persistence verified! Grade update, SGPA & CGPA persist across browser reloads.");

    console.log("\n==================================================");
    console.log("LIVE VERCEL DEPLOYMENT VERIFICATION PASSED 100%!");
    console.log("==================================================");

  } finally {
    if (browser) await browser.close();
    await Student.deleteMany({ rollNumber: testRoll });
    await User.deleteMany({ rollNumber: testRoll });
  }
}

verifyLiveVercel().then(() => process.exit(0)).catch(e => {
  console.error("❌ Live verification error:", e.message);
  process.exit(1);
});
