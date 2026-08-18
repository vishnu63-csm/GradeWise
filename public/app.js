/* ─── GradeWise Student App ─────────────────────────────────────────────── */
"use strict";

const GRADE_POINTS = { S:10, A:9, B:8, C:7, D:6, E:5, F:0, Ab:0 };
const GRADES = ["S","A","B","C","D","E","F","Ab"];
const SEMESTERS_ALL = ["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"];
const SEMESTERS_LATERAL = ["2-1","2-2","3-1","3-2","4-1","4-2"];
const SEM_LABELS = {"1-1":"I-I","1-2":"I-II","2-1":"II-I","2-2":"II-II","3-1":"III-I","3-2":"III-II","4-1":"IV-I","4-2":"IV-II"};

/* ── State ──────────────────────────────────────────────────────────────── */
let studentData      = null;
let publishedResults = []; // fetched from /api/student/results
let homeChartInst    = null;
let cgpaChartInst    = null;
let editingSemName   = null;

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

function showEl(id)  { const e=document.getElementById(id); if(e) e.style.display=""; }
function hideEl(id)  { const e=document.getElementById(id); if(e) e.style.display="none"; }
function blockEl(id) { const e=document.getElementById(id); if(e) e.style.display="block"; }

function statusBadge(sgpa) {
  if (sgpa >= 9) return '<span class="badge badge-success">Outstanding</span>';
  if (sgpa >= 8) return '<span class="badge badge-blue">Excellent</span>';
  if (sgpa >= 7) return '<span class="badge badge-blue">Very Good</span>';
  if (sgpa >= 6) return '<span class="badge badge-warning">Good</span>';
  if (sgpa >= 5) return '<span class="badge badge-warning">Pass</span>';
  return '<span class="badge badge-danger">Needs Improvement</span>';
}

function gradeChip(g) {
  const cls = {S:"grade-S",A:"grade-A",B:"grade-B",C:"grade-C",D:"grade-D",E:"grade-E",F:"grade-F",Ab:"grade-F",UNKNOWN:"grade-F"}[g]||"";
  return `<span class="grade-chip ${cls}">${esc(g)}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

/* ── Navigation ─────────────────────────────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".section-tab").forEach(s => s.classList.toggle("active", s.id === `tab-${name}`));
  document.getElementById("mobileNav").classList.remove("open");
  window.scrollTo(0, 0);
  if (name === "results") loadResults();
  if (name === "cgpa")    renderCgpa();
  if (name === "profile") renderProfile();
}
window.switchTab = switchTab;

function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
window.closeModal = closeModal;

/* ═══════════════════════════════════════════════════════════ HOME TAB ════ */
async function loadHome() {
  hideEl("homeContent"); hideEl("homeError");
  showEl("homeLoading");
  try {
    [studentData] = await Promise.all([apiFetch("/api/student")]);
    // Also try to fetch latest published result (non-blocking)
    try {
      const lr = await apiFetch("/api/student/results/latest");
      if (lr.result) renderLatestResultBanner(lr.result);
    } catch(_) {}

    const name = studentData.name || "";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("welcomeMsg").textContent = `${greeting}, ${name.split(" ")[0]}! 👋`;

    const sems = getApplicableSemesters(studentData);
    const hasSems = sems.length > 0;
    const cgpa   = studentData.cgpa;
    const pct    = studentData.percentage;
    const latest = hasSems ? sems[sems.length - 1] : null;

    // KPI cards
    document.getElementById("homeKpiGrid").innerHTML = [
      { icon:"🎓", val: cgpa != null ? fmt2(cgpa) : "—",              lbl:"Overall CGPA",   cls:"accent-blue" },
      { icon:"📈", val: latest ? fmt2(latest.sgpa) : "—",             lbl:"Latest SGPA",    cls:"accent-ind"  },
      { icon:"💯", val: pct  != null ? fmtPct(pct)  : "—",            lbl:"Overall %",      cls:"accent-gold" },
      { icon:"📚", val: sems.length,                                   lbl:"Semesters",      cls:"accent-green"},
      { icon:"✅", val: studentData.totalCredits || sems.reduce((a,s)=>a+s.credits,0), lbl:"Total Credits", cls:"accent-blue"},
    ].map(k => `
      <div class="kpi-card ${k.cls}">
        <div class="kpi-icon">${k.icon}</div>
        <div class="kpi-value">${k.val}</div>
        <div class="kpi-label">${k.lbl}</div>
      </div>`).join("");

    if (hasSems) {
      document.getElementById("homeChartRow").style.display = "";
      hideEl("homeEmpty");
      renderHomeChart(sems);
    } else {
      document.getElementById("homeChartRow").style.display = "none";
      showEl("homeEmpty");
    }

    hideEl("homeLoading");
    blockEl("homeContent");
    renderSgpa();
  } catch(e) {
    hideEl("homeLoading");
    document.getElementById("homeError").innerHTML = `<div class="alert alert-error">⚠ Unable to load academic data. ${esc(e.message)}</div>`;
    blockEl("homeError");
  }
}

function renderLatestResultBanner(result) {
  const banner = document.getElementById("latestResultBanner");
  if (!banner) return;
  const statusClass = result.passed ? "badge-success" : "badge-danger";
  const statusText  = result.passed ? "PASS" : "FAIL";
  const semLabel = SEM_LABELS[result.semester] || result.semester;
  banner.innerHTML = `
    <div class="result-banner">
      <div class="result-banner-badge">🔔 New Result Available</div>
      <div class="result-banner-content">
        <div>
          <div class="result-banner-title">${esc(semLabel)} Semester Results</div>
          <div class="result-banner-meta">${esc(result.regulation)} • ${esc(result.examType)} • ${esc(result.examSession)}</div>
          <div style="margin-top:8px;">
            <span class="badge ${statusClass}" style="font-size:13px;padding:4px 12px;">${statusText}</span>
            ${result.sgpa ? `<span style="margin-left:8px;font-weight:600;color:var(--text-primary);">SGPA: ${fmt2(result.sgpa)}</span>` : ""}
          </div>
        </div>
        <button class="btn btn-primary" onclick="switchTab('results')">View Full Result →</button>
      </div>
    </div>`;
  banner.style.display = "";
}

function getApplicableSemesters(sd) {
  if (!sd) return [];
  const cat = sd.category || "Regular Entry";
  return semSort((sd.semesters || []).filter(s =>
    !(cat === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2"))
  ));
}

function renderHomeChart(sems) {
  const ctx = document.getElementById("homeChart").getContext("2d");
  if (homeChartInst) homeChartInst.destroy();
  homeChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sems.map(s => SEM_LABELS[s.semester] || s.semester),
      datasets: [{ label:"SGPA", data: sems.map(s => +Number(s.sgpa).toFixed(4)),
        backgroundColor:"rgba(37,99,235,0.12)", borderColor:"#2563EB", borderWidth:2, borderRadius:8 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: c=>{
        const s=Number(c.raw); return [`SGPA: ${s.toFixed(2)}`,`%: ${((s-0.75)*10).toFixed(2)}%`];
      }}}},
      scales: {
        y:{beginAtZero:false,min:0,max:10,grid:{color:"#F1F5F9"},ticks:{color:"#94A3B8"}},
        x:{grid:{display:false},ticks:{color:"#94A3B8"}}
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════ MY RESULTS TAB ══ */
async function loadResults() {
  showEl("resultsLoading");
  hideEl("journeySection");
  hideEl("resultsEmpty");
  document.getElementById("resultsList").innerHTML = "";
  document.getElementById("semDetailCard").style.display = "none";

  try {
    const data = await apiFetch("/api/student/results");
    publishedResults = data.results || [];
    hideEl("resultsLoading");

    if (publishedResults.length === 0) {
      showEl("resultsEmpty");
      return;
    }

    // Sort by semester order then by publishedAt
    publishedResults.sort((a, b) => semOrd(a.semester) - semOrd(b.semester));

    renderJourney();
    renderResultCards();
  } catch(e) {
    hideEl("resultsLoading");
    document.getElementById("resultsList").innerHTML =
      `<div class="alert alert-error">⚠ Could not load results. ${esc(e.message)}</div>`;
  }
}

function renderJourney() {
  const track = document.getElementById("journeyTrack");
  const semsSeen = [...new Set(publishedResults.map(r => r.semester))].sort((a,b) => semOrd(a)-semOrd(b));
  const latest = semsSeen[semsSeen.length-1];
  track.innerHTML = semsSeen.map((sem, i) => {
    const isLatest = sem === latest;
    return `<div class="journey-stop ${isLatest?"latest":""}" onclick="scrollToSemCard('${sem}')">
      <div class="journey-dot">${isLatest ? "●" : "✓"}</div>
      <div class="journey-label">${SEM_LABELS[sem]||sem}${isLatest?'<span class="journey-latest-tag">Latest</span>':""}</div>
    </div>`;
  }).join('<div class="journey-line"></div>');
  showEl("journeySection");
}

function scrollToSemCard(sem) {
  const el = document.getElementById(`result-card-${sem}`);
  if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
}
window.scrollToSemCard = scrollToSemCard;

function renderResultCards() {
  const list = document.getElementById("resultsList");
  // Group by semester
  const bySem = {};
  for (const r of publishedResults) {
    if (!bySem[r.semester]) bySem[r.semester] = [];
    bySem[r.semester].push(r);
  }

  const sems = Object.keys(bySem).sort((a,b) => semOrd(a)-semOrd(b));
  list.innerHTML = sems.map(sem => {
    const results = bySem[sem];
    const r = results[0]; // latest for that sem
    const semLabel = SEM_LABELS[sem] || sem;
    const statusCls = r.passed ? "badge-success" : "badge-danger";
    const statusTxt = r.passed ? "PASS" : "FAIL";
    const backlogs  = r.backlogCount || 0;

    return `<div class="result-card" id="result-card-${sem}">
      <div class="result-card-header">
        <div>
          <div class="result-card-title">${esc(semLabel)} Semester</div>
          <div class="result-card-meta">${esc(r.regulation||"")} • ${esc(r.examType||"")} • ${esc(r.examSession||"")}</div>
          ${r.department ? `<div class="result-card-dept">${esc(r.department)} — ${esc(r.admissionType||"")}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <span class="badge ${statusCls}" style="font-size:13px;padding:5px 14px;">${statusTxt}</span>
          <div style="margin-top:6px;font-size:11px;color:var(--text-muted);">Published ${timeAgo(r.publishedAt)}</div>
        </div>
      </div>
      <div class="result-card-stats">
        <div class="result-stat"><div class="result-stat-val">${fmt2(r.sgpa)}</div><div class="result-stat-lbl">SGPA</div></div>
        <div class="result-stat"><div class="result-stat-val">${fmtPct(r.percentage)}</div><div class="result-stat-lbl">Percentage</div></div>
        <div class="result-stat"><div class="result-stat-val">${r.totalCredits||0}</div><div class="result-stat-lbl">Credits</div></div>
        <div class="result-stat"><div class="result-stat-val ${backlogs>0?"text-danger":""}">${backlogs}</div><div class="result-stat-lbl">Backlogs</div></div>
        <div class="result-stat"><div class="result-stat-val">${(r.subjects||[]).length}</div><div class="result-stat-lbl">Subjects</div></div>
      </div>
      <div class="result-card-footer">
        <button class="btn btn-ghost btn-sm" onclick="openResultDetail('${r._id}')">View Subjects →</button>
        ${statusBadge(r.sgpa||0)}
      </div>
    </div>`;
  }).join("");
}

function openResultDetail(resultId) {
  const r = publishedResults.find(x => x._id === resultId);
  if (!r) return;
  const semLabel = SEM_LABELS[r.semester] || r.semester;
  const statusCls = r.passed ? "badge-success" : "badge-danger";

  let subTable = "";
  if ((r.subjects||[]).length > 0) {
    subTable = `<div style="overflow-x:auto;margin-top:var(--space-md);">
      <table class="data-table">
        <thead><tr><th>Subject</th><th>Code</th><th>Int.</th><th>Ext.</th><th>Grade</th><th>Credits</th><th>Status</th></tr></thead>
        <tbody>
          ${r.subjects.map(s => `<tr>
            <td>${esc(s.name)}</td>
            <td style="font-family:monospace;font-size:12px;">${esc(s.code||"—")}</td>
            <td>${s.internalMarks != null ? s.internalMarks : "—"}</td>
            <td>${s.externalMarks != null ? s.externalMarks : "—"}</td>
            <td>${gradeChip(s.grade)}</td>
            <td>${s.credits}</td>
            <td><span class="badge ${s.passed ? "badge-success" : "badge-danger"}">${s.passed ? "PASS" : "FAIL"}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  } else {
    subTable = `<div class="empty-state" style="padding:32px 0;"><div class="empty-icon">📋</div><p>No subject details available.</p></div>`;
  }

  document.getElementById("resultDetailTitle").textContent = `${semLabel} Semester — ${r.examSession||""}`;
  document.getElementById("resultDetailBody").innerHTML = `
    <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;margin-bottom:var(--space-lg);">
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${fmt2(r.sgpa)}</div><div class="result-stat-lbl">SGPA</div></div>
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${fmtPct(r.percentage)}</div><div class="result-stat-lbl">Percentage</div></div>
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${r.totalCredits||0}</div><div class="result-stat-lbl">Credits</div></div>
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${r.backlogCount||0}</div><div class="result-stat-lbl">Backlogs</div></div>
    </div>
    <div style="margin-bottom:12px;"><span class="badge ${statusCls}" style="font-size:14px;padding:6px 16px;">${r.passed?"PASS":"FAIL"}</span> ${statusBadge(r.sgpa||0)}</div>
    ${r.failedSubjects&&r.failedSubjects.length ? `<div class="alert alert-error" style="margin-bottom:12px;">❌ Failed/Absent: ${r.failedSubjects.map(esc).join(", ")}</div>` : ""}
    ${subTable}`;
  openModal("resultDetailModal");
}
window.openResultDetail = openResultDetail;

/* ════════════════════════════════════════════════════════════ SGPA TAB ═══ */
function renderSgpa() {
  const sd = studentData;
  if (!sd) return;
  const sems = semSort(sd.semesters || []);
  hideEl("sgpaLoading");

  if (sems.length === 0) {
    showEl("sgpaEmpty");
    document.getElementById("semesterGrid").innerHTML = "";
    return;
  }
  hideEl("sgpaEmpty");

  document.getElementById("semesterGrid").innerHTML = sems.map(s => {
    const pct = (s.sgpa - 0.75) * 10;
    const isLE = sd.category === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2");
    return `<div class="semester-card ${isLE ? "sem-excluded" : ""}">
      <div class="semester-card-top">
        <div class="semester-name">${esc(SEM_LABELS[s.semester]||s.semester)} Semester ${isLE ? '<span class="badge badge-gray">Excluded (LE)</span>' : ""}</div>
        ${statusBadge(s.sgpa)}
      </div>
      <div class="sem-stats">
        <div class="sem-stat"><span class="sem-stat-val accent-blue">${fmt2(s.sgpa)}</span><span class="sem-stat-lbl">SGPA</span></div>
        <div class="sem-stat"><span class="sem-stat-val accent-green">${fmtPct(pct)}</span><span class="sem-stat-lbl">Percentage</span></div>
        <div class="sem-stat"><span class="sem-stat-val">${s.credits}</span><span class="sem-stat-lbl">Credits</span></div>
        <div class="sem-stat"><span class="sem-stat-val">${(s.subjects||[]).length}</span><span class="sem-stat-lbl">Subjects</span></div>
      </div>
      <div class="semester-card-footer">
        <button class="btn btn-ghost btn-sm" onclick="openSemDetail('${s.semester}')">View Details</button>
        <button class="btn btn-outline btn-sm" onclick="openEditSem('${s.semester}')">Edit</button>
      </div>
    </div>`;
  }).join("");
}

function openSemDetail(semName) {
  const sd = studentData;
  if (!sd) return;
  const sem = (sd.semesters||[]).find(s => s.semester === semName);
  if (!sem) return;
  const pct = (sem.sgpa - 0.75) * 10;
  document.getElementById("resultDetailTitle").textContent = `${SEM_LABELS[semName]||semName} Semester — Manual Entry`;
  document.getElementById("resultDetailBody").innerHTML = `
    <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;margin-bottom:var(--space-lg);">
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${fmt2(sem.sgpa)}</div><div class="result-stat-lbl">SGPA</div></div>
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${fmtPct(pct)}</div><div class="result-stat-lbl">Percentage</div></div>
      <div class="result-stat card" style="padding:16px 24px;"><div class="result-stat-val">${sem.credits}</div><div class="result-stat-lbl">Credits</div></div>
    </div>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Subject</th><th>Credits</th><th>Grade</th><th>Grade Points</th></tr></thead>
        <tbody>${(sem.subjects||[]).map(s=>`<tr>
          <td>${esc(s.subject)}</td><td>${s.credits}</td><td>${gradeChip(s.grade)}</td><td>${GRADE_POINTS[s.grade]??0}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
  openModal("resultDetailModal");
}
window.openSemDetail = openSemDetail;

/* ═══════════════════════════════════════════════════════════ CGPA TAB ════ */
function renderCgpa() {
  const sd = studentData;
  if (!sd) { document.getElementById("cgpaContent").innerHTML = ""; return; }
  const sems = getApplicableSemesters(sd);
  const cgpa = sd.cgpa;
  const pct  = sd.percentage;

  let cumulSgpa = 0, cumulCred = 0;
  const progressData = sems.map(s => {
    cumulCred += s.credits; cumulSgpa += s.credits * s.sgpa;
    const cgpaHere = cumulCred > 0 ? cumulSgpa / cumulCred : 0;
    return { semester: s.semester, cgpa: cgpaHere, pct: (cgpaHere - 0.75) * 10, sgpa: s.sgpa };
  });

  document.getElementById("cgpaContent").innerHTML = `
    <div class="kpi-grid" style="margin-bottom:var(--space-xl);">
      <div class="kpi-card accent-blue"><div class="kpi-icon">🎓</div><div class="kpi-value">${fmt2(cgpa)}</div><div class="kpi-label">Overall CGPA</div></div>
      <div class="kpi-card accent-gold"><div class="kpi-icon">💯</div><div class="kpi-value">${fmtPct(pct)}</div><div class="kpi-label">Overall %</div></div>
      <div class="kpi-card accent-green"><div class="kpi-icon">📚</div><div class="kpi-value">${sems.length}</div><div class="kpi-label">Counted Semesters</div></div>
      <div class="kpi-card accent-ind"><div class="kpi-icon">✅</div><div class="kpi-value">${sems.reduce((a,s)=>a+s.credits,0)}</div><div class="kpi-label">Total Credits</div></div>
    </div>
    ${sems.length > 0 ? `<div class="chart-wrap" style="margin-bottom:var(--space-xl);"><div class="chart-title">📈 CGPA Progression</div><div class="chart-canvas-wrap"><canvas id="cgpaChart"></canvas></div></div>` : ""}
    <div class="card">
      <div class="section-heading" style="margin-bottom:var(--space-md);">Semester Breakdown</div>
      ${sems.length === 0 ? '<p class="empty-sub">No semesters recorded.</p>' : `
      <table class="data-table">
        <thead><tr><th>Semester</th><th>SGPA</th><th>%</th><th>Credits</th><th>Cumulative CGPA</th></tr></thead>
        <tbody>${progressData.map(p=>`<tr>
          <td>${SEM_LABELS[p.semester]||p.semester}</td>
          <td><strong>${fmt2(p.sgpa)}</strong></td>
          <td>${fmtPct((p.sgpa-0.75)*10)}</td>
          <td>${sems.find(s=>s.semester===p.semester)?.credits||0}</td>
          <td>${fmt2(p.cgpa)}</td>
        </tr>`).join("")}</tbody>
      </table>`}
    </div>`;

  if (sems.length > 0) {
    setTimeout(() => {
      const ctx = document.getElementById("cgpaChart")?.getContext("2d");
      if (!ctx) return;
      if (cgpaChartInst) cgpaChartInst.destroy();
      cgpaChartInst = new Chart(ctx, {
        type:"line",
        data:{ labels: progressData.map(p=>SEM_LABELS[p.semester]||p.semester),
          datasets:[
            { label:"CGPA", data:progressData.map(p=>+p.cgpa.toFixed(4)), borderColor:"#2563EB", backgroundColor:"rgba(37,99,235,0.08)", tension:0.3, fill:true, pointBackgroundColor:"#2563EB", pointRadius:5 },
            { label:"SGPA", data:progressData.map(p=>+p.sgpa.toFixed(4)), borderColor:"#16A34A", backgroundColor:"transparent", tension:0.3, fill:false, borderDash:[4,4], pointRadius:4 },
          ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true,position:"top"}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${Number(c.raw).toFixed(2)}`}} },
          scales:{ y:{min:0,max:10,grid:{color:"#F1F5F9"},ticks:{color:"#94A3B8"}}, x:{grid:{display:false},ticks:{color:"#94A3B8"}} }
        }
      });
    }, 80);
  }
}

/* ═══════════════════════════════════════════════════════════ PROFILE TAB ═ */
function renderProfile() {
  const sd = studentData;
  if (!sd) return;
  const sems = getApplicableSemesters(sd);
  const backlogs = sems.reduce((a,s) => a + (s.subjects||[]).filter(sub=>sub.grade==="F"||sub.grade==="Ab").length, 0);

  document.getElementById("profileContent").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);max-width:800px;">
      <div class="card">
        <div class="section-heading">Personal Info</div>
        <div class="profile-row"><span class="profile-lbl">Name</span><span class="profile-val">${esc(sd.name||"—")}</span></div>
        <div class="profile-row"><span class="profile-lbl">Roll Number</span><span class="profile-val"><code>${esc(sd.rollNumber||"—")}</code></span></div>
        <div class="profile-row"><span class="profile-lbl">Department</span><span class="profile-val">${esc(sd.dept||"—")}</span></div>
        <div class="profile-row"><span class="profile-lbl">Category</span><span class="profile-val"><span class="badge badge-blue">${esc(sd.category||"Regular Entry")}</span></span></div>
        <div class="profile-row"><span class="profile-lbl">Phone</span><span class="profile-val">${esc(sd.phone||"—")}</span></div>
      </div>
      <div class="card">
        <div class="section-heading">Academic Summary</div>
        <div class="profile-row"><span class="profile-lbl">CGPA</span><span class="profile-val"><strong>${fmt2(sd.cgpa)}</strong></span></div>
        <div class="profile-row"><span class="profile-lbl">Percentage</span><span class="profile-val">${fmtPct(sd.percentage)}</span></div>
        <div class="profile-row"><span class="profile-lbl">Semesters</span><span class="profile-val">${sems.length}</span></div>
        <div class="profile-row"><span class="profile-lbl">Total Credits</span><span class="profile-val">${sems.reduce((a,s)=>a+s.credits,0)}</span></div>
        <div class="profile-row"><span class="profile-lbl">Active Backlogs</span><span class="profile-val ${backlogs>0?"text-danger":""}">${backlogs}</span></div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════ ADD SEM MODAL ══ */
function updateSemesterOptions() {
  const cat  = document.getElementById("modalCategory").value;
  const sems = cat === "Lateral Entry" ? SEMESTERS_LATERAL : SEMESTERS_ALL;
  const used = (studentData?.semesters||[]).map(s => s.semester);
  const sel  = document.getElementById("modalSemester");
  sel.innerHTML = sems.filter(s => !used.includes(s)).map(s => `<option value="${s}">${SEM_LABELS[s]||s}</option>`).join("");
}
window.updateSemesterOptions = updateSemesterOptions;

document.addEventListener("change", e => {
  if (e.target && e.target.id === "modalCategory") updateSemesterOptions();
});

function addSubjectRow(tbody = "subjectTableBody") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="field-input" placeholder="Subject name" style="min-width:150px;"/></td>
    <td><input class="field-input" type="number" placeholder="3" min="0.5" max="10" step="0.5" style="width:70px;"/></td>
    <td><select class="field-input">${GRADES.map(g=>`<option>${g}</option>`).join("")}</select></td>
    <td><button class="btn-icon btn-danger-icon" onclick="this.closest('tr').remove()" title="Remove">✕</button></td>`;
  document.getElementById(tbody).appendChild(tr);
}
window.addSubjectRow = addSubjectRow;

function addEditSubjectRow() { addSubjectRow("editSubjectTableBody"); }
window.addEditSubjectRow = addEditSubjectRow;

function collectSubjects(tbody) {
  const rows = document.getElementById(tbody).querySelectorAll("tr");
  const subjects = [];
  for (const row of rows) {
    const inputs  = row.querySelectorAll("input, select");
    const subject = inputs[0]?.value.trim();
    const credits = parseFloat(inputs[1]?.value);
    const grade   = inputs[2]?.value;
    if (!subject) throw new Error("Subject name cannot be empty.");
    if (!credits || credits <= 0) throw new Error(`Invalid credits for "${subject}".`);
    if (!grade) throw new Error(`Grade missing for "${subject}".`);
    subjects.push({ subject, credits, grade });
  }
  if (subjects.length === 0) throw new Error("Add at least one subject.");
  return subjects;
}

async function saveSemester() {
  const sem      = document.getElementById("modalSemester").value;
  const category = document.getElementById("modalCategory").value;
  const msgEl    = document.getElementById("modalMsg");
  msgEl.innerHTML = "";

  let subjects;
  try { subjects = collectSubjects("subjectTableBody"); }
  catch(e) { msgEl.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`; return; }

  const text = document.getElementById("saveBtnText");
  const spin = document.getElementById("saveBtnSpinner");
  text.style.display = "none"; spin.style.display = "inline-block";

  try {
    if (studentData && studentData.category !== category) {
      await apiFetch("/api/student/category", { method:"PUT", body: JSON.stringify({ category }) });
    }
    await apiFetch("/api/student/semester", { method:"POST", body: JSON.stringify({ semester:sem, subjects }) });
    studentData = await apiFetch("/api/student");
    closeModal("addSemModal");
    renderSgpa();
    if (homeChartInst) renderHomeChart(getApplicableSemesters(studentData));
  } catch(e) {
    msgEl.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  } finally {
    text.style.display = ""; spin.style.display = "none";
  }
}
window.saveSemester = saveSemester;

function openEditSem(semName) {
  const sem = (studentData?.semesters||[]).find(s => s.semester === semName);
  if (!sem) return;
  editingSemName = semName;
  document.getElementById("editModalTitle").textContent = `Edit ${SEM_LABELS[semName]||semName} Semester`;
  document.getElementById("editSemName").value = semName;
  document.getElementById("editModalMsg").innerHTML = "";
  const tbody = document.getElementById("editSubjectTableBody");
  tbody.innerHTML = "";
  for (const s of (sem.subjects||[])) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="field-input" value="${esc(s.subject)}" style="min-width:150px;"/></td>
      <td><input class="field-input" type="number" value="${s.credits}" min="0.5" max="10" step="0.5" style="width:70px;"/></td>
      <td><select class="field-input">${GRADES.map(g=>`<option ${g===s.grade?"selected":""}>${g}</option>`).join("")}</select></td>
      <td><button class="btn-icon btn-danger-icon" onclick="this.closest('tr').remove()" title="Remove">✕</button></td>`;
    tbody.appendChild(tr);
  }
  openModal("editSemModal");
}
window.openEditSem = openEditSem;

async function saveEditSemester() {
  const semName = document.getElementById("editSemName").value;
  const msgEl   = document.getElementById("editModalMsg");
  msgEl.innerHTML = "";

  let subjects;
  try { subjects = collectSubjects("editSubjectTableBody"); }
  catch(e) { msgEl.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`; return; }

  const text = document.getElementById("editSaveBtnText");
  const spin = document.getElementById("editSaveBtnSpinner");
  text.style.display = "none"; spin.style.display = "inline-block";

  try {
    await apiFetch("/api/student/semester", { method:"POST", body: JSON.stringify({ semester:semName, subjects }) });
    studentData = await apiFetch("/api/student");
    closeModal("editSemModal");
    renderSgpa();
    if (homeChartInst) renderHomeChart(getApplicableSemesters(studentData));
  } catch(e) {
    msgEl.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  } finally {
    text.style.display = ""; spin.style.display = "none";
  }
}
window.saveEditSemester = saveEditSemester;

async function deleteSemester() {
  const semName = document.getElementById("editSemName").value;
  if (!confirm(`Delete ${SEM_LABELS[semName]||semName} semester? This cannot be undone.`)) return;
  try {
    await apiFetch(`/api/student/semester/${encodeURIComponent(semName)}`, { method:"DELETE" });
    studentData = await apiFetch("/api/student");
    closeModal("editSemModal");
    renderSgpa();
    if (homeChartInst) renderHomeChart(getApplicableSemesters(studentData));
  } catch(e) {
    document.getElementById("editModalMsg").innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  }
}
window.deleteSemester = deleteSemester;

/* ════════════════════════════════════════════════════════════════ INIT ═══ */
document.addEventListener("DOMContentLoaded", async () => {
  if (!guardAuth()) return;

  // Populate user chip
  try {
    const u = JSON.parse(localStorage.getItem("sgpa_user") || "{}");
    const name = u.name || "";
    document.getElementById("userName").textContent = name.split(" ")[0] || "Student";
    const initials = name.split(" ").map(w=>w[0]||"").slice(0,2).join("").toUpperCase() || "?";
    document.getElementById("userAvatar").textContent = initials;
  } catch(_) {}

  // Tab switching
  document.querySelectorAll(".nav-tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Hamburger
  document.getElementById("hamburger").addEventListener("click", () => {
    document.getElementById("mobileNav").classList.toggle("open");
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  // Add semester button
  document.getElementById("addSemBtn").addEventListener("click", () => {
    document.getElementById("subjectTableBody").innerHTML = "";
    document.getElementById("modalMsg").innerHTML = "";
    if (studentData) document.getElementById("modalCategory").value = studentData.category || "Regular Entry";
    updateSemesterOptions();
    addSubjectRow();
    openModal("addSemModal");
  });
  document.getElementById("addSemBtnEmpty").addEventListener("click", () => {
    document.getElementById("addSemBtn").click();
  });

  await loadHome();
});
