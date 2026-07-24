// api/index.js — Vercel Serverless Entry Point
//
// All directories (public/, routes/, models/, middleware/) are bundled
// via "includeFiles" in vercel.json so express.static and require() work.

"use strict";

require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const path     = require("path");

const authRoutes = require("../routes/auth");
const apiRoutes  = require("../routes/api");

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// Static files — bundled alongside this function via vercel.json includeFiles
app.use(express.static(path.join(__dirname, "../public")));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api",      apiRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// Catch-all — serve login page (SPA / MPA fallback)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

// ── MongoDB connection (cached across warm invocations) ───────────────────────
async function connectDB() {
  // Already connected — reuse the existing connection
  if (mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured. " +
      "Go to Vercel → Project → Settings → Environment Variables and add MONGODB_URI."
    );
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
}

// ── Exported handler ──────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("[GradeWise] DB connection failed:", err.message);
    // Return a friendly 503 instead of crashing the function
    return res.status(503).json({
      error: "Service temporarily unavailable. Database connection failed.",
      detail: err.message,
    });
  }
  return app(req, res);
};
