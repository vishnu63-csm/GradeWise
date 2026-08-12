/* ─── GradeWise Student App — JavaScript Controller ─────────────────────── */
"use strict";

/* ── Constants ────────────────────────────────────────────────────────────── */
const GRADE_POINTS = { S:10, A:9, B:8, C:7, D:6, E:5, F:0, Ab:0 };
const GRADES = ["S","A","B","C","D","E","F","Ab"];
const SEMESTERS_ALL = ["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"];
const SEMESTERS_LATERAL = ["2-1","2-2","3-1","3-2","4-1","4-2"];

/* ── State ────────────────────────────────────────────────────────────────── */
let studentData = null;
let homeChartInstance = null;
let cgpaChartInstance = null;
let currentDetailSemester = null;

/* ── Auth Helpers ─────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("sgpa_token") || ""; }
function guardAuth() {
  const token = getToken();
  if (!token) { window.location.href = "login.html"; return false; }
  return true;
}

async function apiFetch(url, opts = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { window.location.href = "login.html"; }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

/* ── Formatting Helpers ───────────────────────────────────────────────────── */
function fmt2(n)   { return n != null ? Number(n).toFixed(2) : "—"; }
function fmtPct(n) { return n != null ? `${Number(n).toFixed(2)}%` : "—"; }
const semOrder = (s) => SEMESTERS_ALL.indexOf(s);
const semSort  = (arr) => [...arr].sort((a,b) => semOrder(a.semester) - semOrder(b.semester));

function showEl(id)  { const el = document.getElementById(id); if (el) el.style.display = ""; }
function hideEl(id)  { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function blockEl(id) { const el = document.getElementById(id); if (el) el.style.display = "block"; }

function statusBadge(sgpa) {
  if (sgpa >= 9)    return '<span class="badge badge-success">Outstanding</span>';
  if (sgpa >= 8)    return '<span class="badge badge-blue">Excellent</span>';
  if (sgpa >= 7)    return '<span class="badge badge-blue">Very Good</span>';
  if (sgpa >= 6)    return '<span class="badge badge-warning">Good</span>';
  if (sgpa >= 5)    return '<span class="badge badge-warning">Pass</span>';
  return '<span class="badge badge-danger">Needs Improvement</span>';
}

/* ── Navigation ───────────────────────────────────────────────────────────── */
function switchTab(name) {
  // Desktop tabs
  document.querySelectorAll(".nav-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  // Content sections
  document.querySelectorAll(".section-tab").forEach(s => {
    s.classList.toggle("active", s.id === `tab-${name}`);
  });
  // Close mobile nav
  document.getElementById("mobileNav").classList.remove("open");
  window.scrollTo(0, 0);

  // Load tab data on first visit
  if (name === "cgpa")    renderCgpa();
  if (name === "profile") renderProfile();
  if (name === "reports") renderReports();
}

window.switchTab = switchTab;

/* ── Modals ───────────────────────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
window.closeModal = closeModal;

/* ── Accordion ────────────────────────────────────────────────────────────── */
function toggleAccordion(head) {
  const body = head.nextElementSibling;
  head.classList.toggle("open");
  body.classList.toggle("open");
}
window.toggleAccordion = toggleAccordion;

/* ═══════════════════════════════════════════════════════════════════ HOME ═══*/
async function loadHome() {
  hideEl("homeContent"); hideEl("homeError");
  showEl("homeLoading");
  try {
    studentData = await apiFetch("/api/student");
    hideEl("homeLoading");

    const name = studentData.name || "";
    document.getElementById("welcomeMsg").textContent = `Welcome back, ${name.split(" ")[0]}!`;

    const sems = getApplicableSemesters(studentData);
    const hasSems = sems.length > 0;

    const cgpa = studentData.cgpa;
    const pct  = studentData.percentage;
    const latestSem = hasSems ? sems[sems.length - 1] : null;

    // KPI Cards
    document.getElementById("homeKpiGrid").innerHTML = [
      { icon: "🎓", val: cgpa != null ? fmt2(cgpa) : "—", lbl: "Overall CGPA",        cls: "accent-blue" },
      { icon: "📈", val: latestSem ? fmt2(latestSem.sgpa) : "—", lbl: "Latest SGPA",  cls: "accent-ind" },
      { icon: "💯", val: pct != null ? fmtPct(pct) : "—", lbl: "Overall %",           cls: "accent-gold" },
      { icon: "📚", val: sems.length, lbl: "Semesters",                                cls: "accent-green" },
      { icon: "✅", val: studentData.totalCredits || sems.reduce((a,s)=>a+s.credits,0), lbl: "Total Credits", cls: "accent-blue" },
    ].map(k => `
      <div class="kpi-card ${k.cls}">
        <div class="kpi-icon">${k.icon}</div>
        <div class="kpi-value">${k.val}</div>
        <div class="kpi-label">${k.lbl}</div>
      </div>`).join("");

    if (hasSems) {
      showEl("homeChartRow");
      hideEl("homeEmpty");
      renderHomeChart(sems);
    } else {
      document.getElementById("homeChartRow").style.display = "none";
      showEl("homeEmpty");
    }

    blockEl("homeContent");
  } catch(e) {
    hideEl("homeLoading");
    document.getElementById("homeError").innerHTML = `<div class="alert alert-error">⚠ Unable to load academic data. ${e.message}</div>`;
    blockEl("homeError");
  }
}

function getApplicableSemesters(sd) {
  if (!sd) return [];
  const cat = sd.category || "Regular Entry";
  return semSort(
    (sd.semesters || []).filter(s =>
      !(cat === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2"))
    )
  );
}

function renderHomeChart(sems) {
  const ctx = document.getElementById("homeChart").getContext("2d");
  if (homeChartInstance) homeChartInstance.destroy();
  const labels = sems.map(s => s.semester);
  const data   = sems.map(s => Number(s.sgpa).toFixed(4));

  homeChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "SGPA",
        data,
        backgroundColor: "rgba(37,99,235,0.15)",
        borderColor: "#2563EB",
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const sgpa = Number(ctx.raw);
              const pct  = (sgpa - 0.75) * 10;
              return [`SGPA: ${sgpa.toFixed(2)}`, `Percentage: ${pct.toFixed(2)}%`];
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: false, min: 0, max: 10, grid: { color: "#F1F5F9" }, ticks: { color: "#94A3B8" } },
        x: { grid: { display: false }, ticks: { color: "#94A3B8" } }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════ SGPA ═══*/
function renderSgpa() {
  const sd = studentData;
  if (!sd) return;
  hideEl("sgpaLoading");
  const sems = semSort(sd.semesters || []);
  const cat  = sd.category || "Regular Entry";
  const grid = document.getElementById("semesterGrid");

  if (!sems.length) { showEl("sgpaEmpty"); grid.innerHTML = ""; return; }
  hideEl("sgpaEmpty");

  // Running CGPA computation
  let runC = 0, runW = 0;
  const semsWithCgpa = sems.map(s => {
    const isLateral = cat === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2");
    if (!isLateral) { runC += s.credits; runW += s.credits * s.sgpa; }
    const runCgpa = runC > 0 ? runW / runC : null;
    return { ...s, runCgpa };
  });

  grid.innerHTML = semsWithCgpa.map(s => {
    const semPct = (s.sgpa - 0.75) * 10;
    const isExcl = cat === "Lateral Entry" && (s.semester === "1-1" || s.semester === "1-2");
    return `
    <div class="sem-card">
      <div class="sem-card-head">
        <span class="sem-label">Semester ${s.semester}</span>
        ${isExcl
          ? '<span class="badge badge-gray">Excluded (Lateral)</span>'
          : statusBadge(s.sgpa)}
      </div>
      <div class="sem-metrics">
        <div>
          <div class="sem-metric-val">${fmt2(s.sgpa)}</div>
          <div class="sem-metric-label">SGPA</div>
        </div>
        <div>
          <div class="sem-metric-val" style="color:var(--brand-success);">${fmtPct(semPct)}</div>
          <div class="sem-metric-label">Percentage</div>
        </div>
        <div>
          <div class="sem-metric-val" style="color:var(--text-primary);">${s.credits}</div>
          <div class="sem-metric-label">Credits</div>
        </div>
        <div>
          <div class="sem-metric-val" style="color:var(--brand-secondary);font-size:1rem;">${s.runCgpa != null ? fmt2(s.runCgpa) : "—"}</div>
          <div class="sem-metric-label">Cum. CGPA</div>
        </div>
      </div>
      <div class="sem-actions">
        <button class="btn btn-ghost btn-sm" onclick='openSemDetail(${JSON.stringify(s)})'>View Details</button>
        <button class="btn btn-secondary btn-sm" onclick='openEditSem("${s.semester}")'>Edit</button>
      </div>
    </div>`;
  }).join("");
}

function openSemDetail(s) {
  currentDetailSemester = s;
  const cat = studentData ? studentData.category : "Regular Entry";
  document.getElementById("semDetailTitle").textContent = `Semester ${s.semester}`;
  const semPct = (s.sgpa - 0.75) * 10;

  document.getElementById("semDetailKpi").innerHTML = [
    { val: fmt2(s.sgpa), lbl: "SGPA" },
    { val: fmtPct(semPct), lbl: "Semester %" },
    { val: s.credits, lbl: "Total Credits" },
    { val: (s.subjects || []).length, lbl: "Subjects" },
  ].map(k => `
    <div class="kpi-card accent-blue">
      <div class="kpi-value" style="font-size:1.4rem;">${k.val}</div>
      <div class="kpi-label">${k.lbl}</div>
    </div>`).join("");

  const tbody = document.getElementById("semDetailBody");
  tbody.innerHTML = (s.subjects || []).map((sub, i) => {
    const gp = GRADE_POINTS[sub.grade] ?? 0;
    return `<tr>
      <td>${i + 1}</td>
      <td>${sub.subject || sub.name || "—"}</td>
      <td>${sub.credits}</td>
      <td><span class="grade-chip grade-${sub.grade}">${sub.grade}</span></td>
      <td>${gp}</td>
      <td>${(sub.credits * gp).toFixed(1)}</td>
    </tr>`;
  }).join("");

  document.getElementById("semDetailDelBtn").onclick = () => deleteSemester(s.semester);
  openModal("semDetailModal");
}
window.openSemDetail = openSemDetail;

async function deleteSemester(sem) {
  if (!confirm(`Delete Semester ${sem}? This cannot be undone.`)) return;
  try {
    await apiFetch(`/api/student/semester/${encodeURIComponent(sem)}`, { method: "DELETE" });
    closeModal("semDetailModal");
    studentData = await apiFetch("/api/student");
    renderSgpa();
    renderHomeChart(getApplicableSemesters(studentData));
  } catch(e) { alert("Delete failed: " + e.message); }
}

function openEditSem(sem) {
  const s = (studentData.semesters || []).find(x => x.semester === sem);
  if (!s) return;
  // Pre-fill modal
  document.getElementById("modalCategory").value = studentData.category || "Regular Entry";
  document.getElementById("modalSemester").value = sem;
  updateSemesterOptions();
  // Fill subject rows
  const tbody = document.getElementById("subjectTableBody");
  tbody.innerHTML = "";
  (s.subjects || []).forEach(sub => addSubjectRow(sub));
  updateLiveCalc();
  openModal("addSemModal");
}
window.openEditSem = openEditSem;

/* ═══════════════════════════════════════════════════════════════════ CGPA ═══*/
function renderCgpa() {
  const sd = studentData;
  if (!sd) return;

  const sems = getApplicableSemesters(sd);
  if (!sems.length) {
    hideEl("cgpaContent"); hideEl("cgpaLoading"); showEl("cgpaEmpty"); return;
  }

  hideEl("cgpaLoading"); hideEl("cgpaEmpty"); blockEl("cgpaContent");

  const cgpa    = sd.cgpa;
  const pct     = sd.percentage;
  const bestSgpa = Math.max(...sems.map(s => s.sgpa));
  const latestSem = sems[sems.length - 1];
  const totalCreds = sems.reduce((a, s) => a + s.credits, 0);

  document.getElementById("cgpaBig").textContent   = cgpa != null ? fmt2(cgpa) : "—";
  document.getElementById("cgpaPctBig").textContent = pct  != null ? fmtPct(pct) : "—";

  document.getElementById("cgpaKpiGrid").innerHTML = [
    { val: sems.length,            lbl: "Semesters Completed",  cls: "accent-ind"   },
    { val: totalCreds,             lbl: "Total Credits",         cls: "accent-blue"  },
    { val: fmt2(bestSgpa),         lbl: "Best SGPA",             cls: "accent-green" },
    { val: fmt2(latestSem.sgpa),   lbl: "Latest SGPA",           cls: "accent-gold"  },
  ].map(k => `
    <div class="kpi-card ${k.cls}">
      <div class="kpi-value" style="font-size:1.4rem;">${k.val}</div>
      <div class="kpi-label">${k.lbl}</div>
    </div>`).join("");

  // Running CGPA for table
  let runC = 0, runW = 0;
  const tbody = document.getElementById("cgpaTableBody");
  tbody.innerHTML = sems.map(s => {
    runC += s.credits; runW += s.credits * s.sgpa;
    const runCgpa = runC > 0 ? runW / runC : null;
    const runPct  = runCgpa != null ? (runCgpa - 0.75) * 10 : null;
    const semPct  = (s.sgpa - 0.75) * 10;
    return `<tr>
      <td><strong>${s.semester}</strong></td>
      <td>${s.credits}</td>
      <td class="td-num">${fmt2(s.sgpa)}</td>
      <td>${fmtPct(semPct)}</td>
      <td class="td-num" style="color:var(--brand-primary);">${runCgpa != null ? fmt2(runCgpa) : "—"}</td>
      <td>${runPct  != null ? fmtPct(runPct) : "—"}</td>
    </tr>`;
  }).join("");

  // Chart
  const ctx = document.getElementById("cgpaChart").getContext("2d");
  if (cgpaChartInstance) cgpaChartInstance.destroy();

  let rc = 0, rw = 0;
  const cgpaLine = sems.map(s => {
    rc += s.credits; rw += s.credits * s.sgpa;
    return +(rw / rc).toFixed(4);
  });

  cgpaChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: sems.map(s => s.semester),
      datasets: [
        {
          label: "SGPA",
          data: sems.map(s => +s.sgpa.toFixed(4)),
          borderColor: "#2563EB", backgroundColor: "rgba(37,99,235,.08)",
          tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 8,
          pointBackgroundColor: "#2563EB",
        },
        {
          label: "Cumulative CGPA",
          data: cgpaLine,
          borderColor: "#16A34A", backgroundColor: "transparent",
          tension: 0.4, fill: false, pointRadius: 5, pointHoverRadius: 8,
          borderDash: [6,3], pointBackgroundColor: "#16A34A",
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "top" }, tooltip: { mode: "index", intersect: false } },
      scales: {
        y: { min: 0, max: 10, grid: { color: "#F1F5F9" }, ticks: { color: "#94A3B8" } },
        x: { grid: { display: false }, ticks: { color: "#94A3B8" } }
      }
    }
  });
}

/* ═════════════════════════════════════════════════════════════════ PROFILE ══*/
function renderProfile() {
  const sd = studentData;
  if (!sd) return;
  const name = sd.name || "—";
  const initials = name.split(" ").map(w => w[0] || "").slice(0, 2).join("").toUpperCase() || "?";

  document.getElementById("profileAvatar").textContent = initials;
  document.getElementById("profileName").textContent = name;
  document.getElementById("profileRoll").textContent = sd.rollNumber || "—";
  document.getElementById("profileDept").textContent = sd.dept || "—";
  document.getElementById("profilePhone").textContent = sd.phone || "—";

  const catEl = document.getElementById("profileCategory");
  const isLateral = sd.category === "Lateral Entry";
  catEl.innerHTML = isLateral
    ? '<span class="badge badge-blue">Lateral Entry</span>'
    : '<span class="badge badge-success">Regular Entry</span>';

  const sems = getApplicableSemesters(sd);
  document.getElementById("profileKpiGrid").innerHTML = [
    { val: sems.length,                          lbl: "Semesters",   cls: "accent-blue" },
    { val: sd.cgpa != null ? fmt2(sd.cgpa) : "—", lbl: "CGPA",       cls: "accent-blue" },
    { val: sd.percentage != null ? fmtPct(sd.percentage) : "—", lbl: "Percentage", cls: "accent-gold" },
    { val: sems.reduce((a,s)=>a+s.credits,0),    lbl: "Credits",     cls: "accent-green" },
  ].map(k => `
    <div class="kpi-card ${k.cls}">
      <div class="kpi-value" style="font-size:1.3rem;">${k.val}</div>
      <div class="kpi-label">${k.lbl}</div>
    </div>`).join("");
}

/* ══════════════════════════════════════════════════════════════════ REPORTS ══*/
function renderReports() {
  const sd = studentData;
  if (!sd) return;

  const name = sd.name || "—";
  const initials = name.split(" ").map(w=>w[0]||"").slice(0,2).join("").toUpperCase();
  document.getElementById("reportStudentInfo").innerHTML = `
    <div><div class="form-label">Student Name</div><div style="font-weight:700;">${name}</div></div>
    <div><div class="form-label">Roll Number</div><div style="font-family:monospace;font-weight:700;">${sd.rollNumber||"—"}</div></div>
    <div><div class="form-label">Department</div><div style="font-weight:700;">${sd.dept||"—"}</div></div>
    <div><div class="form-label">Category</div><div style="font-weight:700;">${sd.category||"—"}</div></div>
    <div><div class="form-label">Regulation</div><div style="font-weight:700;">JNTUK R23</div></div>
    <div><div class="form-label">Phone</div><div style="font-weight:700;">${sd.phone||"—"}</div></div>
  `;

  const sems = getApplicableSemesters(sd);
  let runC=0, runW=0;
  document.getElementById("reportTableBody").innerHTML = sems.map(s=>{
    runC += s.credits; runW += s.credits * s.sgpa;
    const runCgpa = runC>0 ? runW/runC : null;
    const runPct  = runCgpa!=null ? (runCgpa-0.75)*10 : null;
    return `<tr>
      <td><strong>${s.semester}</strong></td><td>${s.credits}</td>
      <td class="td-num">${fmt2(s.sgpa)}</td>
      <td>${fmtPct((s.sgpa-0.75)*10)}</td>
      <td class="td-num">${runCgpa!=null?fmt2(runCgpa):"—"}</td>
      <td>${runPct!=null?fmtPct(runPct):"—"}</td>
    </tr>`;
  }).join("");

  // Subject details per semester
  document.getElementById("reportSubjectDetails").innerHTML = semSort(sd.semesters||[]).map(s=>`
    <div style="margin-bottom:var(--space-lg);">
      <div class="section-heading" style="font-size:13px;">Semester ${s.semester} — SGPA ${fmt2(s.sgpa)}</div>
      <div class="table-wrap">
        <table class="data-table" style="font-size:13px;">
          <thead><tr><th>#</th><th>Subject</th><th>Credits</th><th>Grade</th><th>GP</th><th>Points</th></tr></thead>
          <tbody>
            ${(s.subjects||[]).map((sub,i)=>{
              const gp = GRADE_POINTS[sub.grade]??0;
              return `<tr>
                <td>${i+1}</td>
                <td>${sub.subject||sub.name||"—"}</td>
                <td>${sub.credits}</td>
                <td><span class="grade-chip grade-${sub.grade}">${sub.grade}</span></td>
                <td>${gp}</td><td>${(sub.credits*gp).toFixed(1)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`).join("");
}

function printReport() { window.print(); }
window.printReport = printReport;

function downloadPdfReport() {
  alert("Tip: Use Ctrl+P (or Cmd+P on Mac) → Save as PDF from the Print dialog for a full-page report.");
  window.print();
}
window.downloadPdfReport = downloadPdfReport;

/* ══════════════════════════════════════════════════════════ ADD SEMESTER ══════*/
function updateSemesterOptions() {
  const cat = document.getElementById("modalCategory").value;
  const sel = document.getElementById("modalSemester");
  const cur = sel.value;
  const opts = cat === "Lateral Entry" ? SEMESTERS_LATERAL : SEMESTERS_ALL;
  sel.innerHTML = opts.map(s => `<option value="${s}"${s===cur?" selected":""}>${s}</option>`).join("");
}
window.updateSemesterOptions = updateSemesterOptions;
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("modalCategory").addEventListener("change", updateSemesterOptions);
});

function addSubjectRow(sub = null) {
  const tbody = document.getElementById("subjectTableBody");
  const idx   = tbody.children.length + 1;
  const tr    = document.createElement("tr");
  tr.innerHTML = `
    <td style="color:var(--text-muted);width:30px;">${idx}</td>
    <td><input class="form-control" style="min-width:160px;" placeholder="Subject name" value="${sub ? (sub.subject||sub.name||"") : ""}" oninput="updateLiveCalc()"/></td>
    <td><input class="form-control" style="width:70px;" type="number" min="0.5" max="6" step="0.5" placeholder="Credits" value="${sub ? sub.credits : 3}" oninput="updateLiveCalc()"/></td>
    <td>
      <select class="form-control" style="width:80px;" onchange="updateLiveCalc()">
        ${GRADES.map(g => `<option value="${g}"${sub && sub.grade===g?" selected":""}>${g}</option>`).join("")}
      </select>
    </td>
    <td><button class="del-row" onclick="this.closest('tr').remove();updateLiveCalc();">✕</button></td>`;
  tbody.appendChild(tr);
  updateLiveCalc();
}
window.addSubjectRow = addSubjectRow;

function updateLiveCalc() {
  const rows = document.querySelectorAll("#subjectTableBody tr");
  let totalC = 0, totalP = 0, valid = true;
  rows.forEach(row => {
    const inputs = row.querySelectorAll("input, select");
    const credits = parseFloat(inputs[1]?.value) || 0;
    const grade   = inputs[2]?.value || "F";
    const gp      = GRADE_POINTS[grade] ?? 0;
    if (credits > 0) { totalC += credits; totalP += credits * gp; }
    else valid = false;
  });
  const preview = document.getElementById("liveCalcPreview");
  if (totalC > 0) {
    const sgpa = totalP / totalC;
    const pct  = (sgpa - 0.75) * 10;
    document.getElementById("previewSgpa").textContent    = sgpa.toFixed(2);
    document.getElementById("previewPct").textContent     = pct.toFixed(2) + "%";
    document.getElementById("previewCredits").textContent = totalC;
    preview.style.display = "flex";
  } else {
    preview.style.display = "none";
  }
}
window.updateLiveCalc = updateLiveCalc;

async function saveSemester() {
  const sem      = document.getElementById("modalSemester").value;
  const category = document.getElementById("modalCategory").value;
  const rows     = document.querySelectorAll("#subjectTableBody tr");
  const subjects = [];

  rows.forEach(row => {
    const inputs = row.querySelectorAll("input, select");
    const name    = inputs[0]?.value?.trim();
    const credits = parseFloat(inputs[1]?.value);
    const grade   = inputs[2]?.value;
    if (name && !isNaN(credits) && credits > 0 && grade) {
      subjects.push({ subject: name, credits, grade });
    }
  });

  if (!subjects.length) {
    document.getElementById("modalMsg").innerHTML = '<div class="alert alert-error">Please add at least one subject with valid data.</div>';
    return;
  }

  const text    = document.getElementById("saveBtnText");
  const spinner = document.getElementById("saveBtnSpinner");
  text.style.display = "none"; spinner.style.display = "inline-block";
  document.getElementById("modalMsg").innerHTML = "";

  try {
    // Update category if changed
    if (studentData && studentData.category !== category) {
      await apiFetch("/api/student/category", { method: "PUT", body: JSON.stringify({ category }) });
    }
    await apiFetch("/api/student/semester", {
      method: "POST",
      body: JSON.stringify({ semester: sem, subjects }),
    });
    studentData = await apiFetch("/api/student");
    closeModal("addSemModal");
    renderSgpa();
    renderHomeChart(getApplicableSemesters(studentData));
  } catch(e) {
    document.getElementById("modalMsg").innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  } finally {
    text.style.display = ""; spinner.style.display = "none";
  }
}
window.saveSemester = saveSemester;

/* ══════════════════════════════════════════════════════════════════════ INIT ══*/
document.addEventListener("DOMContentLoaded", async () => {
  if (!guardAuth()) return;

  // Load user chip
  const userRaw = localStorage.getItem("sgpa_user");
  if (userRaw) {
    try {
      const u = JSON.parse(userRaw);
      const name = u.name || "";
      document.getElementById("userName").textContent = name.split(" ")[0] || "Student";
      const initials = name.split(" ").map(w=>w[0]||"").slice(0,2).join("").toUpperCase() || "?";
      document.getElementById("userAvatar").textContent = initials;
    } catch(_) {}
  }

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

  // Add Semester buttons
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

  // Load data
  await loadHome();
  renderSgpa();
});
