/* ─── GradeWise Student App Controller ──────────────────────────────────── */
"use strict";

const GRADE_POINTS = { S:10, A:9, B:8, C:7, D:6, E:5, F:0, Ab:0 };
const GRADES = ["S","A","B","C","D","E","F","Ab"];
const SEMESTERS_ALL = ["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"];
const SEMESTERS_LATERAL = ["2-1","2-2","3-1","3-2","4-1","4-2"];
const SEM_LABELS = {"1-1":"1-1","1-2":"1-2","2-1":"2-1","2-2":"2-2","3-1":"3-1","3-2":"3-2","4-1":"4-1","4-2":"4-2"};

/* ── State ──────────────────────────────────────────────────────────────── */
let studentData      = null;
let publishedResults = [];
let homeChartInst    = null;
let cgpaChartInst    = null;

/* ── Auth ───────────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("sgpa_token") || ""; }
function guardAuth() {
  if (!getToken()) { window.location.href = "login.html"; return false; }
  return true;
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}`, ...(opts.headers||{}) },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { window.location.href = "login.html"; }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

/* ── Formatting ─────────────────────────────────────────────────────────── */
const fmt2    = n => n != null ? Number(n).toFixed(2) : "—";
const fmtPct  = n => n != null ? `${Number(n).toFixed(2)}%` : "—";
const semOrd  = s => SEMESTERS_ALL.indexOf(s);
const semSort = a => [...a].sort((x,y) => semOrd(x.semester) - semOrd(y.semester));
const esc     = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

/* ── Navigation & View Router ────────────────────────────────────────────── */
const VALID_VIEWS = ["home", "results", "sgpa", "cgpa", "profile", "regulations"];

function switchTab(name, updateHash = true) {
  // Normalize alias
  const target = (name === "dashboard" || name === "home") ? "home" : name;
  if (!VALID_VIEWS.includes(target)) return;

  // Update URL hash without extra history entries if triggered programmatically
  if (updateHash) {
    const hash = target === "home" ? "dashboard" : target;
    if (window.location.hash !== `#${hash}`) {
      window.location.hash = hash;
    }
  }

  // 1. Remove active class from all sidebar buttons
  document.querySelectorAll(".sidebar-btn[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === target);
  });

  // 2. Hide all view sections, show ONLY target section
  document.querySelectorAll(".section-tab").forEach(s => {
    const isTarget = s.id === `tab-${target}`;
    s.classList.toggle("active", isTarget);
    s.style.display = isTarget ? "block" : "none";
  });

  // 3. Close mobile sidebar drawer & scroll to top
  document.getElementById("sidebar")?.classList.remove("open");
  window.scrollTo(0, 0);

  // 4. Trigger section data loader
  if (target === "home")    loadHome();
  if (target === "results") loadResults();
  if (target === "sgpa")    renderSgpa();
  if (target === "cgpa")    renderCgpa();
  if (target === "profile") renderProfile();
}
window.switchTab = switchTab;

function handleHashRoute() {
  const hash = (window.location.hash || "").replace("#", "").toLowerCase();
  const view = (hash === "dashboard" || hash === "" || !hash) ? "home" : hash;
  switchTab(view, false);
}

function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
window.closeModal = closeModal;

/* ═══════════════════════════════════════════════════════════ HOME DASHBOARD ═ */
async function loadHome() {
  try {
    studentData = await apiFetch("/api/student");
    
    // User info in topbar
    const name = studentData.name || "Student";
    const roll = studentData.rollNumber || "";
    document.getElementById("userName").textContent = name.split(" ")[0] || "Student";
    document.getElementById("userRoll").textContent = roll || "JNTUK R23";
    const initials = name.split(" ").map(w=>w[0]||"").slice(0,2).join("").toUpperCase() || "ST";
    document.getElementById("userAvatar").textContent = initials;

    // Greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("welcomeMsg").textContent = `${greeting}, ${name} 👋`;

    // Calculate metrics
    const sems = getApplicableSemesters(studentData);
    const cgpa = studentData.cgpa;
    const pct  = studentData.percentage;
    const latestSem = sems.length > 0 ? sems[sems.length - 1] : null;
    const backlogs  = sems.reduce((acc, s) => acc + (s.subjects || []).filter(sub => sub.grade === "F" || sub.grade === "Ab").length, 0);

    // Update KPI cards
    document.getElementById("kpiCgpa").textContent     = cgpa != null ? fmt2(cgpa) : "—";
    document.getElementById("kpiSgpa").textContent     = latestSem ? fmt2(latestSem.sgpa) : "—";
    document.getElementById("kpiPct").textContent      = pct != null ? fmtPct(pct) : "—";
    document.getElementById("kpiBacklogs").textContent = backlogs;

    // Load published results
    try {
      const res = await apiFetch("/api/student/results");
      publishedResults = res.results || [];
      if (publishedResults.length > 0) {
        publishedResults.sort((a,b) => semOrd(a.semester) - semOrd(b.semester));
        renderLatestFeaturedResult(publishedResults[publishedResults.length - 1]);
        renderJourneyNodes(publishedResults);
      } else {
        renderJourneyNodesFromSemesters(sems);
      }
    } catch(_) {
      renderJourneyNodesFromSemesters(sems);
    }

    if (sems.length > 0) {
      renderHomeChart(sems);
    }
  } catch(e) {
    console.error("loadHome error:", e);
  }
}

function getApplicableSemesters(sd) {
  if (!sd) return [];
  const cat = sd.category || "Regular Entry";
  return semSort((sd.semesters || []).filter(s =>
    !(cat === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2"))
  ));
}

function renderLatestFeaturedResult(result) {
  if (!result) return;
  document.getElementById("featuredSemTitle").textContent = `${result.semester} Semester`;
  document.getElementById("featuredSemMeta").textContent  = `${result.regulation || "R23"} • ${result.examType || "Regular"} • ${result.examSession || "Official Exam"}`;
  document.getElementById("featuredSgpa").textContent     = fmt2(result.sgpa);
  document.getElementById("featuredPct").textContent      = fmtPct(result.percentage);
  document.getElementById("featuredCredits").textContent  = result.totalCredits || 0;
  document.getElementById("featuredBacklogs").textContent = result.backlogCount || 0;
  document.getElementById("featuredTime").textContent     = result.publishedAt ? `Published ${timeAgo(result.publishedAt)}` : "Published Result";

  const isPass = result.passed;
  document.getElementById("featuredStatusBadge").innerHTML = `
    <span class="badge ${isPass ? "badge-pass" : "badge-fail"}" style="font-size:14px;padding:6px 16px;">
      ${isPass ? "PASS" : "FAIL"}
    </span>`;
}

function renderJourneyNodes(pubResults) {
  const row = document.getElementById("journeyNodeRow");
  if (!row) return;
  const pubSems = new Set(pubResults.map(r => r.semester));
  const latestSem = pubResults.length > 0 ? pubResults[pubResults.length - 1].semester : null;

  row.innerHTML = SEMESTERS_ALL.map(sem => {
    const isCompleted = pubSems.has(sem);
    const isLatest    = sem === latestSem;
    let cls = "";
    if (isLatest) cls = "active";
    else if (isCompleted) cls = "completed";

    return `
      <div class="journey-node ${cls}" onclick="switchTab('results')">
        <div class="journey-node-circle">${isLatest ? "●" : isCompleted ? "✓" : "○"}</div>
        <div class="journey-node-lbl">${sem}</div>
      </div>`;
  }).join("");
}

function renderJourneyNodesFromSemesters(sems) {
  const row = document.getElementById("journeyNodeRow");
  if (!row) return;
  const userSems = new Set(sems.map(s => s.semester));
  const latestSem = sems.length > 0 ? sems[sems.length - 1].semester : null;

  row.innerHTML = SEMESTERS_ALL.map(sem => {
    const isCompleted = userSems.has(sem);
    const isLatest    = sem === latestSem;
    let cls = "";
    if (isLatest) cls = "active";
    else if (isCompleted) cls = "completed";

    return `
      <div class="journey-node ${cls}" onclick="switchTab('sgpa')">
        <div class="journey-node-circle">${isLatest ? "●" : isCompleted ? "✓" : "○"}</div>
        <div class="journey-node-lbl">${sem}</div>
      </div>`;
  }).join("");
}

function renderHomeChart(sems) {
  const ctx = document.getElementById("homeChart")?.getContext("2d");
  if (!ctx) return;
  if (homeChartInst) homeChartInst.destroy();

  const labels = sems.map(s => s.semester);
  const sgpaData = sems.map(s => +Number(s.sgpa).toFixed(2));

  homeChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "SGPA",
        data: sgpaData,
        borderColor: "#3B82F6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        tension: 0.35,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: "#3B82F6",
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 10, grid: { color: "rgba(156, 163, 175, 0.15)" } },
        x: { grid: { display: false } }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════ MY RESULTS TAB ═ */
async function loadResults() {
  const container = document.getElementById("resultsList");
  container.innerHTML = "Loading published results...";
  try {
    const res = await apiFetch("/api/student/results");
    publishedResults = res.results || [];
    if (publishedResults.length === 0) {
      container.innerHTML = `
        <div class="card-box" style="text-align:center;padding:48px 24px;">
          <div style="font-size:3rem;margin-bottom:12px;">📑</div>
          <h3 class="card-title" style="justify-content:center;">No Published Results Yet</h3>
          <p style="color:var(--text-sub);max-width:460px;margin:0 auto 20px;">
            Results published by your institution will automatically appear here matched to your roll number.
          </p>
        </div>`;
      return;
    }

    container.innerHTML = publishedResults.map(r => `
      <div class="card-box" style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="font-family:var(--font-head);font-size:1.3rem;">${r.semester} Semester Result</h2>
            <div style="font-size:13px;color:var(--text-sub);margin-top:2px;">${esc(r.regulation||"R23")} • ${esc(r.examType||"Regular")} • ${esc(r.examSession||"")}</div>
          </div>
          <div>
            <span class="badge ${r.passed ? "badge-pass" : "badge-fail"}">${r.passed ? "PASS" : "FAIL"}</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:12px;background:var(--bg-muted);padding:14px;border-radius:var(--radius-md);margin-bottom:16px;">
          <div><div style="font-size:11px;color:var(--text-muted);">SGPA</div><div style="font-family:var(--font-head);font-weight:800;font-size:1.2rem;">${fmt2(r.sgpa)}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);">PERCENTAGE</div><div style="font-family:var(--font-head);font-weight:800;font-size:1.2rem;">${fmtPct(r.percentage)}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);">CREDITS</div><div style="font-family:var(--font-head);font-weight:800;font-size:1.2rem;">${r.totalCredits||0}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);">BACKLOGS</div><div style="font-family:var(--font-head);font-weight:800;font-size:1.2rem;">${r.backlogCount||0}</div></div>
        </div>

        <button class="btn btn-secondary" onclick="openResultDetail('${r._id}')">View Subject Details →</button>
      </div>
    `).join("");
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

function openResultDetail(resultId) {
  const r = publishedResults.find(x => x._id === resultId);
  if (!r) return;
  document.getElementById("resultDetailTitle").textContent = `${r.semester} Semester — Subject Breakdown`;
  
  const subjects = r.subjects || [];
  document.getElementById("resultDetailBody").innerHTML = `
    <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
      <span class="badge ${r.passed ? "badge-pass" : "badge-fail"}" style="font-size:13px;">${r.passed ? "PASS" : "FAIL"}</span>
      <span><strong>SGPA:</strong> ${fmt2(r.sgpa)}</span>
      <span><strong>Percentage:</strong> ${fmtPct(r.percentage)}</span>
      <span><strong>Credits:</strong> ${r.totalCredits}</span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Subject Code</th><th>Subject Name</th><th>Int</th><th>Ext</th><th>Grade</th><th>Credits</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${subjects.map(s => `
            <tr>
              <td><code>${esc(s.code||"—")}</code></td>
              <td>${esc(s.name)}</td>
              <td>${s.internalMarks != null ? s.internalMarks : "—"}</td>
              <td>${s.externalMarks != null ? s.externalMarks : "—"}</td>
              <td><strong>${esc(s.grade)}</strong></td>
              <td>${s.credits}</td>
              <td><span class="badge ${s.passed ? "badge-pass" : "badge-fail"}">${s.passed ? "PASS" : "FAIL"}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  openModal("resultDetailModal");
}
window.openResultDetail = openResultDetail;

/* ════════════════════════════════════════════════════════════ SGPA TAB ═══ */
function renderSgpa() {
  const sd = studentData;
  if (!sd) return;
  const sems = semSort(sd.semesters || []);
  const grid = document.getElementById("semesterGrid");
  if (!grid) return;

  if (sems.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;"><p style="color:var(--text-sub);">No manual semester grades added yet.</p></div>`;
    return;
  }

  grid.innerHTML = sems.map(s => `
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">${s.semester} Semester</span>
        <span class="badge badge-info">${s.credits} Credits</span>
      </div>
      <div class="metric-value-row">
        <span class="metric-value">${fmt2(s.sgpa)}</span>
        <span style="font-size:13px;color:var(--text-sub);">${fmtPct((s.sgpa - 0.75)*10)}</span>
      </div>
    </div>
  `).join("");
}

/* ════════════════════════════════════════════════════════════ CGPA TAB ═══ */
function renderCgpa() {
  const sd = studentData;
  if (!sd) return;
  const sems = getApplicableSemesters(sd);
  const container = document.getElementById("cgpaContent");
  if (!container) return;

  container.innerHTML = `
    <div class="kpi-row" style="margin-bottom:24px;">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-label">Overall CGPA</span></div>
        <div class="metric-value" style="color:var(--brand-primary);">${fmt2(sd.cgpa)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-label">Percentage</span></div>
        <div class="metric-value" style="color:#EAB308;">${fmtPct(sd.percentage)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-label">Total Credits</span></div>
        <div class="metric-value">${sd.totalCredits || sems.reduce((a,s)=>a+s.credits,0)}</div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════ PROFILE TAB ═══ */
function renderProfile() {
  const sd = studentData;
  if (!sd) return;
  const container = document.getElementById("profileContent");
  if (!container) return;

  container.innerHTML = `
    <div class="card-box" style="max-width:600px;">
      <div class="card-title">Student Information</div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:14px;">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding-bottom:8px;">
          <span style="color:var(--text-sub);">Full Name</span><strong>${esc(sd.name)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding-bottom:8px;">
          <span style="color:var(--text-sub);">Roll Number</span><code>${esc(sd.rollNumber)}</code>
        </div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding-bottom:8px;">
          <span style="color:var(--text-sub);">Department</span><strong>${esc(sd.dept||"CSM")}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding-bottom:8px;">
          <span style="color:var(--text-sub);">Admission Category</span><strong>${esc(sd.category||"Regular Entry")}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--text-sub);">Phone</span><strong>${esc(sd.phone)}</strong>
        </div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════ INIT ═══ */
document.addEventListener("DOMContentLoaded", async () => {
  if (!guardAuth()) return;

  // Sidebar navigation bindings
  document.querySelectorAll(".sidebar-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Mobile sidebar toggle
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Logout binding
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  // Hash change routing for browser back/forward buttons
  window.addEventListener("hashchange", handleHashRoute);

  // Initial load
  await loadHome();
  handleHashRoute();
});
