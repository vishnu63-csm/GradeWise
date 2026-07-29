const mongoose = require("mongoose");
const User = require("../models/User");
const Student = require("../models/Student");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/sgpa_app"; // default URI if not in env

async function inspect() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sgpa_app";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const users = await User.find({}).lean();
    const students = await Student.find({}).lean();

    console.log(`Found ${users.length} Users and ${students.length} Students.`);

    console.log("\n--- Sample Users ---");
    users.forEach((u, i) => {
      console.log(`${i + 1}. Name: "${u.name}", Roll: "${u.rollNumber}", Dept: "${u.dept}", Phone: "${u.phone}"`);
    });

    console.log("\n--- Sample Students ---");
    students.forEach((s, i) => {
      console.log(`${i + 1}. Name: "${s.name}", Roll: "${s.rollNumber}", Dept: "${s.dept}", Phone: "${s.phone}", Category: "${s.category}"`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error("Inspection error:", err.message);
  }
}

inspect();
