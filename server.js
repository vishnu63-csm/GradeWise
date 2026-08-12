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
// Student data routes (all protected by JWT middleware inside)
app.use("/api", apiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// Catch-all: serve login page for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas ✅");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
