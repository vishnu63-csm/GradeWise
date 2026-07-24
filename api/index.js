// api/index.js — Vercel Serverless Entry Point
//
// This file is the ONLY entry point used by Vercel.
// server.js is preserved for local development (node server.js / nodemon).
//
// Key differences from server.js:
//  - Exports a handler function instead of calling app.listen()
//  - MongoDB connection is cached between warm invocations (readyState check)
//  - No process.exit() — serverless functions must never call it
//  - No dns.setServers() — Vercel's infrastructure handles DNS correctly

"use strict";

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const mongoose = require("mongoose");
const path    = require("path");

const authRoutes = require("../routes/auth");
const apiRoutes  = require("../routes/api");

// ── Build the Express app ─────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// Serve all static files from /public (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, "../public")));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);   // register, login
app.use("/api",      apiRoutes);    // student data (JWT-protected)

// Health check — useful for Vercel uptime monitoring
app.get("/health", (_req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// SPA / MPA catch-all — serve login page for any unmatched GET route
// (browser navigation, direct URL entry, etc.)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

// ── MongoDB connection (cached across warm invocations) ───────────────────────
// readyState: 0=disconnected 1=connected 2=connecting 3=disconnecting
async function connectDB() {
  if (mongoose.connection.readyState === 1) return; // already connected

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to your Vercel project environment variables."
    );
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000, // fail fast if Atlas is unreachable
  });
}

// ── Exported handler ──────────────────────────────────────────────────────────
// Vercel calls this function for every incoming request.
module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
