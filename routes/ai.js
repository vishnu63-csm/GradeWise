const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");
const authMiddleware = require("../middleware/auth");
const User = require("../models/User");
const Student = require("../models/Student");

// Per-user rate limiting map: userId -> array of timestamps
const aiRateLimits = new Map();
const MAX_REQUESTS_PER_MINUTE = 15;

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const userTimestamps = aiRateLimits.get(userId) || [];
  
  // Filter timestamps within last 60s
  const recent = userTimestamps.filter(ts => now - ts < windowMs);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  recent.push(now);
  aiRateLimits.set(userId, recent);
  return true;
}

// Upgraded System Prompt for Academic & Study Assistant
const SYSTEM_PROMPT = `You are GradeWise AI — the official Academic & Study Assistant for B.Tech engineering students using GradeWise.

YOUR DUAL ROLE & CAPABILITIES:

1. EDUCATIONAL STUDY ASSISTANT:
   - Help students master engineering subjects, computer science concepts (AI/ML, Data Structures, DBMS, Operating Systems, Computer Networks), programming (Python, C, C++, Java), and Mathematics.
   - Assist with exam preparation, revision notes, step-by-step math problem solving, code debugging, and concept comparisons.
   - Provide structured, student-friendly explanations (e.g. Definition → Core Principles → Code/Math Example → Exam Summary).
   - Adapt to student formatting requests (e.g. 5-mark answer, 10-mark answer, beginner explanation, interview preparation).

2. GRADEWISE ACADEMIC ASSISTANT:
   - Help students understand their SGPA, CGPA, semester performance, credit weightings, and overall degree progress using [STUDENT CONTEXT].
   - Guide students on using GradeWise (adding semesters: Dashboard → Academic Records → "+ Add Semester", calculating CGPA, checking published results).
   - GradeWise application calculations in [STUDENT CONTEXT] are the authoritative source of truth for personal academic standing. Reference those exact numbers.

GUIDELINES:
- Be clear, friendly, structured, concise, and student-focused.
- NEVER refuse to answer general educational, programming, or engineering study questions.
- NEVER state "I can only help with GradeWise academic records". You are a complete study & academic assistant.
- If asked non-academic high-stakes topics (medical, legal, financial advice), provide brief general info and recommend consulting certified professionals.`;

// POST /api/ai/chat
router.post("/chat", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, conversation, stream, mode } = req.body;

    // 1. Validate Input Message
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message cannot be empty." });
    }
    const cleanMessage = message.trim();
    if (cleanMessage.length > 1000) {
      return res.status(400).json({ success: false, error: "Message exceeds maximum length of 1000 characters." });
    }

    // 2. Check Rate Limit
    if (!checkRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        error: "rate_limited",
        message: "You are asking GradeWise AI questions too quickly. Please wait a minute before asking another question.",
      });
    }

    // 3. Fetch Minimal Student Academic Context
    const user = await User.findById(userId).select("-passwordHash -resetPasswordToken -resetPasswordExpires");
    if (!user) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    const student = await Student.findOne({ rollNumber: user.rollNumber });
    let academicContextText = "[STUDENT CONTEXT]\n";
    academicContextText += `Name: ${user.name}\n`;
    academicContextText += `Roll Number: ${user.rollNumber}\n`;
    academicContextText += `Branch / Department: ${user.dept || "B.Tech"}\n`;

    if (student) {
      const stats = student.computeCgpa() || {};
      academicContextText += `Entry Category: ${student.category || "Regular Entry"}\n`;
      academicContextText += `Overall Calculated CGPA: ${stats.cgpa ? stats.cgpa.toFixed(2) : "N/A"}\n`;
      academicContextText += `Percentage Equivalent: ${stats.percentage ? stats.percentage.toFixed(2) + "%" : "N/A"}\n`;
      academicContextText += `Completed Credits: ${stats.totalCredits || 0}\n`;

      if (student.semesters && student.semesters.length > 0) {
        academicContextText += `SEMESTER HISTORY (${student.semesters.length} Semesters Recorded):\n`;
        student.semesters.forEach(s => {
          academicContextText += `- Semester ${s.semester}: SGPA ${(s.sgpa || 0).toFixed(2)} | Credits: ${s.credits || 0}\n`;
        });
      } else {
        academicContextText += "No semesters recorded yet in GradeWise dashboard.\n";
      }
    }

    if (mode === "study") {
      academicContextText += "\n[MODE INSTRUCTION]: The student has requested STUDY MODE. Structure the answer into clear headings: Overview, Key Principles/Conditions, Code/Formula Example, and Exam Summary.\n";
    } else if (mode === "examprep") {
      academicContextText += "\n[MODE INSTRUCTION]: The student has requested EXAM PREP MODE. Format the response as a structured 5-mark / 10-mark university exam answer or revision points with key definitions highlighted.\n";
    }

    // 4. Construct Messages Array for Groq
    const groqMessages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${academicContextText}` }
    ];

    // Append prior conversation history (limited to last 6 messages)
    if (Array.isArray(conversation)) {
      const validHistory = conversation.slice(-6).filter(
        m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      );
      validHistory.forEach(m => groqMessages.push({ role: m.role, content: m.content }));
    }

    groqMessages.push({ role: "user", content: cleanMessage });

    // 5. Check Groq API Key
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn("[GRADEWISE AI WARN] GROQ_API_KEY is not set in environment.");
      return res.status(503).json({
        success: false,
        error: "ai_not_configured",
        message: "GradeWise AI is currently not configured on the server.",
      });
    }

    const groq = new Groq({ apiKey });
    const candidateModels = Array.from(new Set([
      process.env.GROQ_MODEL,
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "allam-2-7b"
    ].filter(Boolean)));

    // 6. Support Streaming via Server-Sent Events (SSE) or JSON
    const wantsStream = stream !== false;

    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let streamStarted = false;
      for (const m of candidateModels) {
        try {
          const completionStream = await groq.chat.completions.create({
            messages: groqMessages,
            model: m,
            temperature: 0.5,
            max_tokens: 1000,
            stream: true,
          });

          for await (const chunk of completionStream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          }
          res.write(`data: [DONE]\n\n`);
          res.end();
          streamStarted = true;
          break;
        } catch (err) {
          console.warn(`[GRADEWISE AI WARN] Model ${m} stream error:`, err.message);
        }
      }

      if (!streamStarted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "GradeWise AI is temporarily unavailable. Please try again in a moment." })}\n\n`);
        res.end();
      }
    } else {
      let reply = null;
      let lastErr = null;
      for (const m of candidateModels) {
        try {
          const completion = await groq.chat.completions.create({
            messages: groqMessages,
            model: m,
            temperature: 0.5,
            max_tokens: 1000,
          });
          reply = completion.choices[0]?.message?.content;
          if (reply) break;
        } catch (err) {
          lastErr = err;
          console.warn(`[GRADEWISE AI WARN] Model ${m} error:`, err.message);
        }
      }

      if (!reply) {
        throw lastErr || new Error("Failed to generate AI response.");
      }

      res.json({
        success: true,
        message: reply,
      });
    }

  } catch (err) {
    console.error("[GRADEWISE AI ERROR]", err.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "ai_error",
        message: "GradeWise AI is temporarily unavailable. Please try again in a moment.",
      });
    }
  }
});

module.exports = router;
