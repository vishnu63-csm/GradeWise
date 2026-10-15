/**
 * GradeWise AI — Academic & Study Assistant Floating Widget
 */
(function () {
  let isPanelOpen = false;
  let isSending = false;
  let currentMode = "normal"; // "normal" | "study" | "examprep"
  let conversationMessages = []; // Local session history: [{role: 'user'|'assistant', content: string}]

  const subjectQuestionsMap = {
    "All": [
      "What is my current CGPA?",
      "Explain recursion with a C++ code example",
      "Give me 3 Operating Systems viva questions",
      "Explain Normalization in DBMS (1NF to 3NF)",
      "How is SGPA calculated under JNTUK R23?"
    ],
    "AI / ML": [
      "What is the difference between supervised and unsupervised learning?",
      "Explain overfitting and how to prevent it",
      "What is a confusion matrix in ML?"
    ],
    "Programming": [
      "Explain pointers vs references in C++",
      "Write a Python function for Binary Search with time complexity",
      "What are Java interface default methods?"
    ],
    "Data Structures": [
      "Explain time complexity of quicksort vs mergesort",
      "Implement Stack using Arrays in C",
      "What is a Balanced Binary Search Tree (AVL)?"
    ],
    "DBMS": [
      "Explain ACID properties in database management",
      "What is the difference between Primary Key and Foreign Key?",
      "Explain SQL JOIN types with diagrams"
    ],
    "OS": [
      "Explain Process vs Thread with memory layout",
      "What is Deadlock and 4 necessary conditions?",
      "Explain Paging vs Segmentation in OS"
    ],
    "Networks": [
      "Explain OSI 7 Layers model with responsibilities",
      "What is the difference between TCP and UDP?",
      "How does DNS resolution work step-by-step?"
    ],
    "Math": [
      "Explain Eigenvalues and Eigenvectors intuitively",
      "What is Bayes Theorem with an engineering example?",
      "How to solve first order linear differential equations?"
    ],
    "GradeWise": [
      "What is my current CGPA?",
      "Explain my latest semester SGPA",
      "How do I add a new semester record?",
      "How does GradeWise compute CGPA with credits?"
    ]
  };

  function initGradeWiseAi() {
    // 1. Inject Floating Launcher Button
    const launcher = document.createElement("button");
    launcher.id = "gwAiLauncher";
    launcher.className = "gw-ai-launcher";
    launcher.setAttribute("aria-label", "Open GradeWise AI Assistant");
    launcher.innerHTML = `<span class="gw-ai-sparkle">✦</span> <span>GradeWise AI</span>`;
    document.body.appendChild(launcher);

    // 2. Inject Panel Shell
    const panel = document.createElement("div");
    panel.id = "gwAiPanel";
    panel.className = "gw-ai-panel";
    panel.style.display = "none";
    panel.innerHTML = `
      <div class="gw-ai-header">
        <div class="gw-ai-header-brand">
          <div style="width:28px;height:28px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#818CF8;">✦</div>
          <div>
            <div class="gw-ai-header-title">GradeWise AI</div>
            <div class="gw-ai-header-sub">Your academic & study assistant</div>
          </div>
        </div>
        <button class="gw-ai-close-btn" id="gwAiCloseBtn" title="Close Panel">✕</button>
      </div>

      <!-- Mode Selector Bar -->
      <div class="gw-ai-mode-bar" id="gwAiModeBar">
        <button class="gw-ai-mode-pill active" data-mode="normal" title="General Assistant">⚡ Normal</button>
        <button class="gw-ai-mode-pill" data-mode="study" title="Step-by-step explanations & examples">📖 Study Mode</button>
        <button class="gw-ai-mode-pill" data-mode="examprep" title="Exam & viva prep mode">🎯 Exam Prep</button>
      </div>

      <div class="gw-ai-thread" id="gwAiThread">
        <!-- Initial Welcome Card -->
        <div class="gw-ai-welcome-card" id="gwAiWelcomeCard">
          <div class="gw-ai-welcome-title">GradeWise AI Assistant ✦</div>
          <div class="gw-ai-welcome-sub">
            Ask about your SGPA/CGPA records, or study engineering concepts, coding, and exam prep.
          </div>

          <!-- 4 Action Cards Grid -->
          <div class="gw-ai-action-grid">
            <button class="gw-ai-action-card" data-q="Explain recursion in C++ step by step with code">
              <div class="gw-ai-action-card-title">💡 Learn</div>
              <div class="gw-ai-action-card-sub">Explain CS & Eng concepts</div>
            </button>
            <button class="gw-ai-action-card" data-q="Give me 3 Operating Systems viva questions with answers">
              <div class="gw-ai-action-card-title">🎯 Exam Prep</div>
              <div class="gw-ai-action-card-sub">Quiz & viva practice</div>
            </button>
            <button class="gw-ai-action-card" data-q="Write a Python script for Binary Search with explanation">
              <div class="gw-ai-action-card-title">💻 Solve & Code</div>
              <div class="gw-ai-action-card-sub">Code & algorithms</div>
            </button>
            <button class="gw-ai-action-card" data-q="What is my current CGPA?">
              <div class="gw-ai-action-card-title">📊 Your Grades</div>
              <div class="gw-ai-action-card-sub">GradeWise records</div>
            </button>
          </div>

          <!-- Subject Category Pills -->
          <div class="gw-ai-subject-bar" id="gwAiSubjectBar">
            <button class="gw-ai-subject-pill active" data-sub="All">All</button>
            <button class="gw-ai-subject-pill" data-sub="AI / ML">AI / ML</button>
            <button class="gw-ai-subject-pill" data-sub="Programming">Programming</button>
            <button class="gw-ai-subject-pill" data-sub="Data Structures">DSA</button>
            <button class="gw-ai-subject-pill" data-sub="DBMS">DBMS</button>
            <button class="gw-ai-subject-pill" data-sub="OS">OS</button>
            <button class="gw-ai-subject-pill" data-sub="Networks">Networks</button>
            <button class="gw-ai-subject-pill" data-sub="Math">Math</button>
            <button class="gw-ai-subject-pill" data-sub="GradeWise">GradeWise</button>
          </div>

          <!-- Dynamic Quick Questions -->
          <div class="gw-ai-quick-questions" id="gwAiQuickQuestions">
            ${renderQuickQuestions("All")}
          </div>
        </div>
      </div>

      <div class="gw-ai-disclaimer">
        GradeWise AI can make mistakes. Verify important academic information with official university records.
      </div>

      <div class="gw-ai-input-bar">
        <input type="text" id="gwAiInput" class="gw-ai-input" placeholder="Ask GradeWise AI..." maxlength="1000" />
        <button id="gwAiSendBtn" class="gw-ai-send-btn" title="Send message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // 3. Bind Event Listeners
    launcher.addEventListener("click", toggleAiPanel);
    document.getElementById("gwAiCloseBtn").addEventListener("click", toggleAiPanel);

    const inputEl = document.getElementById("gwAiInput");
    const sendBtn = document.getElementById("gwAiSendBtn");

    sendBtn.addEventListener("click", () => handleUserSend());
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleUserSend();
      }
    });

    // Mode Bar Selection
    document.getElementById("gwAiModeBar").addEventListener("click", (e) => {
      const pill = e.target.closest(".gw-ai-mode-pill");
      if (pill) {
        document.querySelectorAll(".gw-ai-mode-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        currentMode = pill.dataset.mode || "normal";
      }
    });

    // Subject Category Pills Selection
    document.getElementById("gwAiSubjectBar").addEventListener("click", (e) => {
      const pill = e.target.closest(".gw-ai-subject-pill");
      if (pill) {
        document.querySelectorAll(".gw-ai-subject-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        const sub = pill.dataset.sub || "All";
        const qqContainer = document.getElementById("gwAiQuickQuestions");
        if (qqContainer) {
          qqContainer.innerHTML = renderQuickQuestions(sub);
        }
      }
    });

    // Action Cards & Quick Question Button Delegation
    document.getElementById("gwAiThread").addEventListener("click", (e) => {
      const actionCard = e.target.closest(".gw-ai-action-card");
      if (actionCard && actionCard.dataset.q) {
        inputEl.value = actionCard.dataset.q;
        handleUserSend();
        return;
      }

      const btn = e.target.closest(".gw-ai-quick-btn");
      if (btn && btn.dataset.q) {
        inputEl.value = btn.dataset.q;
        handleUserSend();
        return;
      }

      const copyBtn = e.target.closest(".gw-ai-copy-btn");
      if (copyBtn) {
        const bubble = copyBtn.closest(".gw-ai-bubble");
        if (bubble) {
          const textToCopy = bubble.innerText.replace("Copy", "").trim();
          navigator.clipboard.writeText(textToCopy).then(() => {
            copyBtn.innerText = "Copied!";
            setTimeout(() => { copyBtn.innerText = "Copy"; }, 2000);
          }).catch(() => {});
        }
      }
    });
  }

  function renderQuickQuestions(subjectKey) {
    const list = subjectQuestionsMap[subjectKey] || subjectQuestionsMap["All"];
    return list.map(q => `<button class="gw-ai-quick-btn" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
  }

  function toggleAiPanel() {
    const panel = document.getElementById("gwAiPanel");
    const launcher = document.getElementById("gwAiLauncher");
    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      panel.style.display = "flex";
      void panel.offsetWidth; // Force reflow for transform transition
      panel.classList.remove("is-closed");
      panel.classList.add("is-open");
      if (launcher) launcher.classList.remove("has-pulse");
      document.getElementById("gwAiInput").focus();
    } else {
      panel.classList.remove("is-open");
      panel.classList.add("is-closed");
      if (launcher) launcher.classList.add("has-pulse");
      setTimeout(() => {
        if (!isPanelOpen) panel.style.display = "none";
      }, 250);
    }
  }

  function appendUserMessage(text) {
    const thread = document.getElementById("gwAiThread");
    const welcomeCard = document.getElementById("gwAiWelcomeCard");
    if (welcomeCard) welcomeCard.style.display = "none";

    const row = document.createElement("div");
    row.className = "gw-ai-msg-row user";
    row.innerHTML = `<div class="gw-ai-bubble user">${escapeHtml(text)}</div>`;
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  function createAssistantBubble() {
    const thread = document.getElementById("gwAiThread");
    const row = document.createElement("div");
    row.className = "gw-ai-msg-row assistant";
    row.innerHTML = `
      <div class="gw-ai-avatar">✦</div>
      <div class="gw-ai-bubble assistant">
        <button class="gw-ai-copy-btn" title="Copy text">Copy</button>
        <div class="gw-ai-typing">
          <div class="gw-ai-typing-dot"></div>
          <div class="gw-ai-typing-dot"></div>
          <div class="gw-ai-typing-dot"></div>
        </div>
      </div>
    `;
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return row.querySelector(".gw-ai-bubble");
  }

  async function handleUserSend() {
    const inputEl = document.getElementById("gwAiInput");
    const sendBtn = document.getElementById("gwAiSendBtn");
    const text = inputEl.value.trim();

    if (!text || isSending) return;

    const token = localStorage.getItem("sgpa_token");
    if (!token) {
      appendUserMessage(text);
      const bubble = createAssistantBubble();
      bubble.innerHTML = `
        <button class="gw-ai-copy-btn" title="Copy text">Copy</button>
        <p>Please <a href="/login" style="color:#4F46E5;font-weight:600;">Sign In</a> to GradeWise to access your academic information and GradeWise AI.</p>
      `;
      inputEl.value = "";
      return;
    }

    appendUserMessage(text);
    inputEl.value = "";
    isSending = true;
    sendBtn.disabled = true;

    const bubbleEl = createAssistantBubble();
    let assistantText = "";

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text,
          mode: currentMode,
          conversation: conversationMessages.slice(-6),
          stream: true
        })
      });

      if (res.status === 401) {
        bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button><p>Session expired. Please <a href="/login" style="color:#4F46E5;font-weight:600;">Sign In again</a> to access GradeWise AI.</p>`;
        return;
      }
      if (res.status === 429) {
        bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button><p style="color:#DC2626;">You are asking questions too quickly. Please wait a minute before trying again.</p>`;
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button><p style="color:#DC2626;">${escapeHtml(errData.message || "GradeWise AI is temporarily unavailable. Please try again in a moment.")}</p>`;
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.slice(6).trim();
            if (rawData === "[DONE]") break;

            try {
              const parsed = JSON.parse(rawData);
              if (parsed.text) {
                assistantText += parsed.text;
                bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button>` + formatMarkdown(assistantText);
                const thread = document.getElementById("gwAiThread");
                thread.scrollTop = thread.scrollHeight;
              } else if (parsed.error) {
                assistantText = parsed.error;
                bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button><p style="color:#DC2626;">${escapeHtml(parsed.error)}</p>`;
              }
            } catch (e) {
              // Ignore line parse errors
            }
          }
        }
      }

      if (assistantText) {
        conversationMessages.push({ role: "user", content: text });
        conversationMessages.push({ role: "assistant", content: assistantText });
      }

    } catch (err) {
      bubbleEl.innerHTML = `<button class="gw-ai-copy-btn">Copy</button><p style="color:#DC2626;">Connection error. GradeWise AI is temporarily unavailable. Please try again in a moment.</p>`;
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMarkdown(text) {
    let clean = escapeHtml(text);

    // Code blocks ```lang\ncode\n```
    clean = clean.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)```/g, function (match, p1) {
      return `<pre><code>${p1}</code></pre>`;
    });

    // Inline code `code`
    clean = clean.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    clean = clean.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    clean = clean.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    clean = clean.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold **text**
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points
    clean = clean.replace(/^[•\*]\s+(.*)$/gm, '<li>$1</li>');
    if (clean.includes('<li>')) {
      clean = clean.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    }

    // Newlines to paragraph breaks (ignoring inside pre)
    const parts = clean.split(/(<pre>[\s\S]*?<\/pre>)/g);
    return parts.map(part => {
      if (part.startsWith('<pre>')) return part;
      return part.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    }).join('');
  }

  // Initialize widget on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGradeWiseAi);
  } else {
    initGradeWiseAi();
  }
})();
