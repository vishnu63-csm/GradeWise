require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("./models/User");
const Student = require("./models/Student");

async function testAuthFlow() {
  console.log("=== SAAS AUTHENTICATION & PASSWORD RESET INTEGRATION TEST ===");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MONGODB_URI set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to DB ✅");

  const testRoll = "23A31A6299";
  const testPhone = "9876543210";
  const testEmail = "teststudent@example.com";
  const initialPassword = "Password123!";
  const newPassword = "NewSecurePassword456!";

  // Cleanup pre-existing test user
  await User.deleteOne({ rollNumber: testRoll });
  await Student.deleteOne({ rollNumber: testRoll });

  // 1. Create User
  const user = new User({
    name: "Test SaaS Student",
    rollNumber: testRoll,
    dept: "CSM",
    phone: testPhone,
    email: testEmail,
    passwordHash: initialPassword,
  });
  await user.save();
  console.log("✅ 1. Created Test User with Email");

  // 2. Test Compare Password
  const isMatchInitial = await user.comparePassword(initialPassword);
  if (!isMatchInitial) throw new Error("Initial password match failed");
  console.log("✅ 2. Verified initial password hash match");

  // 3. Generate Forgot Password Token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();
  console.log("✅ 3. Generated and saved SHA-256 hashed password reset token");

  // 4. Verify Reset Password Flow
  const resetUser = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!resetUser) throw new Error("Could not find user with reset token");

  resetUser.passwordHash = newPassword;
  resetUser.resetPasswordToken = undefined;
  resetUser.resetPasswordExpires = undefined;
  await resetUser.save();
  console.log("✅ 4. Reset password successfully");

  // 5. Verify New Password Works
  const updatedUser = await User.findOne({ rollNumber: testRoll });
  const isMatchNew = await updatedUser.comparePassword(newPassword);
  if (!isMatchNew) throw new Error("New password match failed");
  console.log("✅ 5. Verified new password authenticates cleanly");

  // Cleanup
  await User.deleteOne({ rollNumber: testRoll });
  await Student.deleteOne({ rollNumber: testRoll });
  console.log("✅ Cleanup complete.");

  await mongoose.disconnect();
  console.log("=== ALL AUTH TESTS PASSED CLEANLY ===");
}

testAuthFlow().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
