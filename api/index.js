// api/index.js — Vercel Serverless Entry Point (Optimized for cold-start speed)
"use strict";

require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const mongoose  = require("mongoose");
const path      = require("path");

// ── Disable mongoose buffering so DB errors surface immediately ───────────────
mongoose.set("bufferCommands", false);

// ── Build the Express app ONCE at module level (survives warm invocations) ────
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve static files from bundled public/ directory
const PUBLIC_DIR = path.join(__dirname, "../public");
app.use(express.static(PUBLIC_DIR, {
  maxAge: "1d",          // Cache static assets in browser for 1 day
  etag: true,
  lastModified: true,
}));

// ── API routes ────────────────────────────────────────────────────────────────
const authRoutes  = require("../routes/auth");
const apiRoutes   = require("../routes/api");
const adminRoutes = require("../routes/admin");

app.use("/api/auth",  authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api",       apiRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// Catch-all — serve login page
app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// ── MongoDB connection — module-level promise cache ───────────────────────────
// Reuse the same promise across all warm invocations of this serverless fn.
let dbPromise = null;

function connectDB() {
  // readyState 1 = connected, 2 = connecting
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (dbPromise) return dbPromise;           // already connecting — reuse promise

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return Promise.reject(
      new Error("MONGODB_URI not set. Add it in Vercel → Settings → Environment Variables.")
    );
  }

  dbPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,   // fail fast if Atlas unreachable
    socketTimeoutMS: 45000,
    maxPoolSize: 10,                  // reuse up to 10 connections
    minPoolSize: 1,                   // keep at least 1 alive between requests
    connectTimeoutMS: 8000,
  }).then(() => {
    console.log("[GradeWise] MongoDB connected");
  }).catch((err) => {
    dbPromise = null;                 // reset so next request retries
    throw err;
  });

  return dbPromise;
}

// ── Exported Vercel handler ───────────────────────────────────────────────────
module.exports = async (req, res) => {
  // Skip DB connection for static assets to save time
  const isStatic = /\.(css|js|html|png|ico|svg|woff2?|ttf|jpg|jpeg|gif|webp)$/i.test(req.url);
  if (!isStatic) {
    try {
      await connectDB();
    } catch (err) {
      console.error("[GradeWise] DB connection failed:", err.message);
      return res.status(503).json({
        error: "Service temporarily unavailable. Database connection failed.",
        detail: err.message,
      });
    }
  }
  return app(req, res);
};
