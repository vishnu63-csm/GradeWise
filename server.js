require("dotenv").config();

// Override DNS to use Google's public resolvers — fixes SRV lookup failures on
// restricted networks (corporate/college) where the local DNS blocks SRV records.
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const adminRoutes = require("./routes/admin");
const aiRoutes = require("./routes/ai");

// Register all models (ensures indexes are created)
require("./models/Student");
require("./models/User");
require("./models/Admin");
require("./models/ResultUpload");
require("./models/StudentResult");
require("./models/RollNumberRule");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI is not set in .env");
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Auth routes (register, login — public)
app.use("/api/auth", authRoutes);
// Admin routes (upload, analytics — protected by adminAuth)
app.use("/api/admin", adminRoutes);
// GradeWise AI Assistant routes (protected by JWT inside)
app.use("/api/ai", aiRoutes);
// Student data routes (all protected by JWT middleware inside)
app.use("/api", apiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// HTML Page Route Aliases
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/how-it-works", (req, res) => res.sendFile(path.join(__dirname, "public", "how-it-works.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));
app.get("/help", (req, res) => res.sendFile(path.join(__dirname, "public", "help.html")));
app.get("/privacy", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "register.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "public", "register.html")));
app.get("/forgot-password", (req, res) => res.sendFile(path.join(__dirname, "public", "forgot-password.html")));
app.get("/reset-password", (req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));
app.get("/reset-password/:token", (req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));

// Catch-all: serve index.html or login page for unknown routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const { verifyEmailService } = require("./utils/email");

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB Atlas ✅");
    await verifyEmailService();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
