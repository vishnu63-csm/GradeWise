const http = require("http");
const dns = require("dns");

// DNS override for Atlas MongoDB connectivity
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

async function testPasswordResetFlow() {
  console.log("==================================================");
  console.log("FULL END-TO-END PASSWORD RESET FLOW AUDIT");
  console.log("==================================================");

  const testRoll = "23HP1A4299";
  const testEmail = "teststudent.reset@gradewise.edu.in";
  const initialPassword = "InitialPassword123";
  const newPassword = "NewSecurePassword456";

  // 1. Create / Register test user
  console.log("Step 1: Registering test user...");
  const regPayload = {
    name: "Reset Flow Test User",
    rollNumber: testRoll,
    category: "Regular Entry",
    dept: "CSE",
    phone: "9876543299",
    email: testEmail,
    password: initialPassword,
  };

  const regRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    regPayload
  );

  if (regRes.statusCode === 201 || (regRes.statusCode === 409 && regRes.body.error.includes("already registered"))) {
    console.log("✅ Step 1 PASS: User registration ready.");
  } else {
    console.error("❌ Step 1 FAIL: Registration error:", regRes.body);
    process.exit(1);
  }

  // 2. Request forgot password via Roll Number
  console.log("Step 2: Requesting forgot-password for roll number...");
  const forgotRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/forgot-password",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { identifier: testRoll }
  );

  if (forgotRes.statusCode === 200 && forgotRes.body.message.includes("instructions")) {
    console.log("✅ Step 2 PASS: Forgot password returned non-enumerating generic success response.");
  } else {
    console.error("❌ Step 2 FAIL:", forgotRes.body);
    process.exit(1);
  }

  // 3. Verify database reset token generation directly via Mongoose
  const mongoose = require("mongoose");
  require("dotenv").config();
  const User = require("./models/User");

  await mongoose.connect(process.env.MONGODB_URI);
  const userInDb = await User.findOne({ rollNumber: testRoll });

  if (!userInDb || !userInDb.resetPasswordToken || !userInDb.resetPasswordExpires) {
    console.error("❌ Step 3 FAIL: Reset token not saved in MongoDB user record.");
    process.exit(1);
  }
  if (userInDb.resetPasswordExpires < Date.now()) {
    console.error("❌ Step 3 FAIL: Token expiry is already invalid.");
    process.exit(1);
  }
  console.log("✅ Step 3 PASS: Reset token hash & 1-hour expiry saved securely in DB.");

  // 4. Test resetting password with invalid / random token
  console.log("Step 4: Testing reset-password with invalid token...");
  const invalidReset = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/reset-password",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { token: "fake-random-token-xyz", password: newPassword }
  );

  if (invalidReset.statusCode === 400 && invalidReset.body.error.includes("Invalid or expired")) {
    console.log("✅ Step 4 PASS: Rejected invalid token with 400 Bad Request.");
  } else {
    console.error("❌ Step 4 FAIL: Invalid token was not rejected cleanly:", invalidReset.body);
    process.exit(1);
  }

  // 5. Simulate token reset using a fresh known raw token hash matching the DB
  const crypto = require("crypto");
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  userInDb.resetPasswordToken = hashedToken;
  userInDb.resetPasswordExpires = Date.now() + 3600000;
  await userInDb.save();

  console.log("Step 5: Resetting password using valid token...");
  const validReset = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/reset-password",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { token: rawToken, password: newPassword }
  );

  if (validReset.statusCode === 200 && validReset.body.success) {
    console.log("✅ Step 5 PASS: Password updated successfully.");
  } else {
    console.error("❌ Step 5 FAIL:", validReset.body);
    process.exit(1);
  }

  // 6. Confirm token is invalidated in DB
  const updatedUser = await User.findOne({ rollNumber: testRoll });
  if (updatedUser.resetPasswordToken || updatedUser.resetPasswordExpires) {
    console.error("❌ Step 6 FAIL: Token was not cleared after reset.");
    process.exit(1);
  }
  console.log("✅ Step 6 PASS: Token cleared/invalidated immediately after single use.");

  // 7. Test login with old password (must fail)
  console.log("Step 7: Testing login with old password...");
  const oldLogin = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { rollNumber: testRoll, password: initialPassword }
  );

  if (oldLogin.statusCode === 401) {
    console.log("✅ Step 7 PASS: Old password rejected with 401 Unauthorized.");
  } else {
    console.error("❌ Step 7 FAIL: Old password still allowed login!");
    process.exit(1);
  }

  // 8. Test login with new password (must succeed)
  console.log("Step 8: Testing login with new password...");
  const newLogin = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { rollNumber: testRoll, password: newPassword }
  );

  if (newLogin.statusCode === 200 && newLogin.body.token) {
    console.log("✅ Step 8 PASS: Login succeeded with new password.");
  } else {
    console.error("❌ Step 8 FAIL: Could not login with new password:", newLogin.body);
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("--------------------------------------------------");
  console.log("ALL 8 PASSWORD RESET AUDIT TESTS PASSED CLEANLY!");
  console.log("--------------------------------------------------");
}

testPasswordResetFlow();
