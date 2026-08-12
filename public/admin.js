/* ─── GradeWise Admin Portal — JavaScript Controller ─────────────────────── */
"use strict";

/* ── State ────────────────────────────────────────────────────────────────── */
let adminToken    = "";
let batches       = [];
let allStudents   = [];
let manualEntries = [];
let currentBatch  = null;

let dashBatchChart   = null;
let dashPfChart      = null;
let sgpaDistChart    = null;
let batchPfChart     = null;

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmt2(n) { return n != null ? Number(n).toFixed(2) : "—"; }
function fmtPct(n) { return n != null ? `${Number(n).toFixed(2)}%` : "—"; }

function showEl(id)  { const el = document.getElementById(id); if(el) el.style.display=""; }
function hideEl(id)  { const el = document.getElementById(id); if(el) el.style.display="none"; }
function blockEl(id) { const el = document.getElementById(id); if(el) el.style.display="block"; }
function flexEl(id)  { const el = document.getElementById(id); if(el) el.style.display="flex"; }

async function adminFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ── Auth ─────────────────────────────────────────────────────────────────── */
async function adminLogin() {
  const username = document.getElementById("adminUser").value.trim();
  const password = document.getElementById("adminPass").value;
  if (!username || !password) {
    document.getElementById("loginMsg").innerHTML = '<div class="alert alert-error">Enter username and password.</div>';
    return;
  }
  document.getElementById("loginBtnText").style.display    = "none";
  document.getElementById("loginBtnSpinner").style.display = "inline-block";
  document.getElementById("loginMsg").innerHTML = "";
  try {
    const data = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(r => r.json());
    if (!data.token) throw new Error(data.error || "Login failed");
    adminToken = data.token;
    localStorage.setItem("admin_token", adminToken);
    localStorage.setItem("admin_user", JSON.stringify({ username }));
    showAdminApp(username);
  } catch(e) {
    document.getElementById("loginMsg").innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  } finally {
    document.getElementById("loginBtnText").style.display    = "";
    document.getElementById("loginBtnSpinner").style.display = "none";
  }
}
window.adminLogin = adminLogin;

function adminLogout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  adminToken = "";
  document.getElementById("adminApp").style.display   = "none";
  document.getElementById("loginScreen").style.display = "";
}
window.adminLogout = adminLogout;

function showAdminApp(username) {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminApp").style.display    = "";
  const initials = (username||"A").slice(0,2).toUpperCase();
  document.getElementById("adminAvatar").textContent = initials;
  document.getElementById("adminName").textContent   = username || "Admin";
  loadDashboard();
  loadStudents();
}

/* ── Navigation ───────────────────────────────────────────────────────────── */
function adminSwitchTab(name) {
  document.querySelectorAll("#adminNavTabs .nav-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".section-tab").forEach(s => {
    s.classList.toggle("active", s.id === `tab-${name}`);
  });
  window.scrollTo(0, 0);
  if (name === "analytics")  { populateBatchSelects(); showEl("analyticsEmpty"); hideEl("analyticsContent"); }
  if (name === "leaderboard"){ populateBatchSelects(); }
}
window.adminSwitchTab = adminSwitchTab;

document.addEventListener("DOMContentLoaded", () => {
  // Tab wiring
  document.querySelectorAll("#adminNavTabs .nav-tab").forEach(btn => {
    btn.addEventListener("click", () => adminSwitchTab(btn.dataset.tab));
  });
  // Enter key on login
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && document.getElementById("loginScreen").style.display !== "none") adminLogin();
  });
  // Restore session
  const tok = localStorage.getItem("admin_token");
  const usr = localStorage.getItem("admin_user");
  if (tok) {
    adminToken = tok;
    const u = usr ? JSON.parse(usr) : {};
    showAdminApp(u.username || "Admin");
  }
  // Drag & drop
  const zone = document.getElementById("uploadZone");
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      document.getElementById("pdfInput").files = e.dataTransfer.files;
      handleFileSelect({ files: [file] });
    }
  });
});

/* ══════════════════════════════════════════════════════════════ DASHBOARD ══*/
async function loadDashboard() {
  hideEl("dashContent"); hideEl("dashEmpty");
  showEl("dashLoading");
  try {
    const data = await adminFetch("/api/admin/dashboard");
    batches = data.batches || [];
    hideEl("dashLoading");
    if (!batches.length) { showEl("dashEmpty"); return; }
    renderDashboard(data);
    blockEl("dashContent");
  } catch(e) {
    hideEl("dashLoading");
    document.getElementById("dashContent").innerHTML = `<div class="alert alert-error">Failed to load dashboard: ${e.message}</div>`;
    blockEl("dashContent");
  }
}

function renderDashboard(data) {
  const totalStudents = data.totalStudents || 0;
  const totalBatches  = batches.length;
  const avgSgpa       = data.avgSgpa ? Number(data.avgSgpa).toFixed(2) : "—";
  const passRate      = data.passRate ? Number(data.passRate).toFixed(1) + "%" : "—";

  document.getElementById("dashKpiGrid").innerHTML = [
    { icon:"📦", val:totalBatches,  lbl:"Total Batches",  cls:"accent-blue" },
    { icon:"👥", val:totalStudents, lbl:"Students Tracked",cls:"accent-ind" },
    { icon:"📈", val:avgSgpa,       lbl:"Avg SGPA",        cls:"accent-green"},
    { icon:"✅", val:passRate,      lbl:"Overall Pass Rate",cls:"accent-gold"},
  ].map(k=>`
    <div class="kpi-card ${k.cls}">
      <div class="kpi-icon">${k.icon}</div>
      <div class="kpi-value">${k.val}</div>
      <div class="kpi-label">${k.lbl}</div>
    </div>`).join("");

  // Batch chart
  const ctx1 = document.getElementById("dashBatchChart").getContext("2d");
  if (dashBatchChart) dashBatchChart.destroy();
  dashBatchChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: batches.map(b => `${b.semester} (${b.dept})`),
      datasets: [{
        label: "Avg SGPA",
        data: batches.map(b => b.avgSgpa ? Number(b.avgSgpa).toFixed(2) : 0),
        backgroundColor: "rgba(37,99,235,.15)", borderColor: "#2563EB",
        borderWidth: 2, borderRadius: 8,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        y:{beginAtZero:false,min:0,max:10,grid:{color:"#F1F5F9"},ticks:{color:"#94A3B8"}},
        x:{grid:{display:false},ticks:{color:"#94A3B8",maxRotation:30}}
      }
    }
  });

  // Pass/Fail donut
  const ctx2 = document.getElementById("dashPassFailChart").getContext("2d");
  if (dashPfChart) dashPfChart.destroy();
  const passed = data.totalPassed || 0;
  const failed = data.totalFailed || 0;
  dashPfChart = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: ["Pass","Fail"],
      datasets: [{
        data: [passed, failed],
        backgroundColor: ["#16A34A","#DC2626"],
        borderWidth: 0, hoverOffset: 4
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:"70%",
      plugins:{ legend:{position:"bottom"} }
    }
  });

  // Recent batches list
  document.getElementById("recentBatchesList").innerHTML = batches.slice(0,6).map(b=>`
    <div class="batch-item">
      <div style="width:42px;height:42px;border-radius:var(--radius);background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📦</div>
      <div class="batch-item-info">
        <div class="batch-title">${b.dept} — Sem ${b.semester} (${b.academicYear||""})</div>
        <div class="batch-meta">${b.totalStudents||0} students · Avg SGPA ${b.avgSgpa?Number(b.avgSgpa).toFixed(2):"—"} · Pass ${b.passRate?Number(b.passRate).toFixed(1)+"%" : "—"}</div>
      </div>
      <div style="display:flex;gap:var(--space-sm);">
        <button class="btn btn-ghost btn-sm" onclick='openBatchAnalytics("${b._id}")'>Analytics</button>
      </div>
    </div>`).join("");
}

function openBatchAnalytics(id) {
  document.getElementById("analyticsBatchSelect").value = id;
  adminSwitchTab("analytics");
  loadBatchAnalytics();
}
window.openBatchAnalytics = openBatchAnalytics;

/* ══════════════════════════════════════════════════════════════ UPLOAD ══════*/
function handleFileSelect(input) {
  const file = input.files ? input.files[0] : null;
  if (!file) return;
  document.getElementById("fileInfo").style.display = "block";
  document.getElementById("fileInfo").innerHTML = `
    <div class="alert alert-info">📄 <strong>${file.name}</strong> — ${(file.size/1024).toFixed(1)} KB selected</div>`;
  document.getElementById("parseResult").style.display = "none";
}
window.handleFileSelect = handleFileSelect;

async function uploadPdf() {
  const file  = document.getElementById("pdfInput").files[0];
  const year  = document.getElementById("upYear").value.trim();
  const sem   = document.getElementById("upSemester").value;
  const dept  = document.getElementById("upDept").value;
  const reg   = document.getElementById("upRegulation").value;

  if (!year || !sem || !dept) {
    document.getElementById("uploadMsg").innerHTML = '<div class="alert alert-error">Please fill in Batch Details (Year, Semester, Department).</div>';
    return;
  }
  if (!file) {
    document.getElementById("uploadMsg").innerHTML = '<div class="alert alert-error">Please select a PDF file.</div>';
    return;
  }

  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("academicYear", year);
  formData.append("semester", sem);
  formData.append("dept", dept);
  formData.append("regulation", reg);

  document.getElementById("uploadBtnText").style.display    = "none";
  document.getElementById("uploadBtnSpinner").style.display = "inline-block";
  document.getElementById("uploadMsg").innerHTML = "";

  try {
    const res = await fetch("/api/admin/upload-pdf", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    document.getElementById("parseResult").style.display = "block";
    document.getElementById("parseResult").innerHTML = `
      <div class="parse-result-banner">
        <div style="font-weight:700;margin-bottom:8px;color:var(--brand-primary);">✅ PDF Parsed Successfully</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-sm);font-size:14px;">
          <div><div class="form-label">Students Found</div><div style="font-weight:700;">${data.studentCount||0}</div></div>
          <div><div class="form-label">Avg SGPA</div><div style="font-weight:700;">${data.avgSgpa?Number(data.avgSgpa).toFixed(2):"—"}</div></div>
          <div><div class="form-label">Pass Rate</div><div style="font-weight:700;">${data.passRate?Number(data.passRate).toFixed(1)+"%":"—"}</div></div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:var(--space-md);" onclick='confirmBatchSave("${data.batchId||""}")'>Confirm &amp; Save Batch</button>
      </div>`;
    loadDashboard();
  } catch(e) {
    document.getElementById("uploadMsg").innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  } finally {
    document.getElementById("uploadBtnText").style.display    = "";
    document.getElementById("uploadBtnSpinner").style.display = "none";
  }
}
window.uploadPdf = uploadPdf;

async function confirmBatchSave(batchId) {
  if (!batchId) return;
  try {
    await adminFetch(`/api/admin/batch/${batchId}/confirm`, { method: "POST" });
    document.getElementById("uploadMsg").innerHTML = '<div class="alert alert-success">✅ Batch saved to database.</div>';
    loadDashboard();
    populateBatchSelects();
  } catch(e) {
    document.getElementById("uploadMsg").innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  }
}
window.confirmBatchSave = confirmBatchSave;

/* Manual entry */
function addManualEntry() {
  const roll     = document.getElementById("manualRoll").value.trim().toUpperCase();
  const name     = document.getElementById("manualName").value.trim();
  const sgpa     = parseFloat(document.getElementById("manualSgpa").value);
  const credits  = parseFloat(document.getElementById("manualCredits").value);
  const backlogs = document.getElementById("manualBacklogs").value.split(",").map(s=>s.trim()).filter(Boolean);

  if (!roll || !name || isNaN(sgpa) || isNaN(credits)) {
    alert("Please fill Roll Number, Name, SGPA, and Credits."); return;
  }
  manualEntries.push({ roll, name, sgpa, credits, backlogs });
  renderManualEntries();
  // Clear fields
  ["manualRoll","manualName","manualSgpa","manualCredits","manualBacklogs"].forEach(id => {
    document.getElementById(id).value = "";
  });
}
window.addManualEntry = addManualEntry;

function renderManualEntries() {
  document.getElementById("manualEntriesList").innerHTML = manualEntries.map((e,i) => `
    <div class="batch-item" style="padding:10px 14px;">
      <div style="flex:1;">
        <span style="font-weight:700;">${e.name}</span>
        <span style="color:var(--text-muted);margin-left:8px;font-size:13px;font-family:monospace;">${e.roll}</span>
        <span class="badge badge-blue" style="margin-left:8px;">SGPA ${e.sgpa.toFixed(2)}</span>
        ${e.backlogs.length ? `<span class="badge badge-danger" style="margin-left:4px;">${e.backlogs.length} Backlog${e.backlogs.length>1?"s":""}</span>` : '<span class="badge badge-success" style="margin-left:4px;">Clear</span>'}
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeManualEntry(${i})">Remove</button>
    </div>`).join("");
  document.getElementById("manualSubmitRow").style.display = manualEntries.length ? "" : "none";
}
window.removeManualEntry = (i) => { manualEntries.splice(i,1); renderManualEntries(); };

async function submitManualBatch() {
  const year = document.getElementById("upYear").value.trim();
  const sem  = document.getElementById("upSemester").value;
  const dept = document.getElementById("upDept").value;
  const reg  = document.getElementById("upRegulation").value;
  if (!year||!sem||!dept) { alert("Fill in Batch Details first."); return; }
  if (!manualEntries.length) { alert("Add at least one entry."); return; }

  document.getElementById("manualBtnText").style.display    = "none";
  document.getElementById("manualBtnSpinner").style.display = "inline-block";
  try {
    await adminFetch("/api/admin/batch/manual", {
      method: "POST",
      body: JSON.stringify({ academicYear:year, semester:sem, dept, regulation:reg, students:manualEntries }),
    });
    document.getElementById("uploadMsg").innerHTML = '<div class="alert alert-success">✅ Batch submitted successfully.</div>';
    manualEntries = [];
    renderManualEntries();
    loadDashboard();
    populateBatchSelects();
  } catch(e) {
    document.getElementById("uploadMsg").innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  } finally {
    document.getElementById("manualBtnText").style.display    = "";
    document.getElementById("manualBtnSpinner").style.display = "none";
  }
}
window.submitManualBatch = submitManualBatch;

/* ══════════════════════════════════════════════════════════════ ANALYTICS ══*/
function populateBatchSelects() {
  const opts = batches.map(b =>
    `<option value="${b._id}">${b.dept} — Sem ${b.semester} (${b.academicYear||""})</option>`
  ).join("");
  ["analyticsBatchSelect","lbBatchSelect"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) { const cur = sel.value; sel.innerHTML = '<option value="">-- Select Batch --</option>' + opts; sel.value = cur; }
  });
}

async function loadBatchAnalytics() {
  const id = document.getElementById("analyticsBatchSelect").value;
  if (!id) { showEl("analyticsEmpty"); hideEl("analyticsContent"); return; }
  hideEl("analyticsEmpty"); hideEl("analyticsContent");
  blockEl("analyticsLoading");

  try {
    const data = await adminFetch(`/api/admin/batch/${id}/analytics`);
    currentBatch = data;
    hideEl("analyticsLoading");
    renderBatchAnalytics(data);
    blockEl("analyticsContent");
  } catch(e) {
    hideEl("analyticsLoading");
    document.getElementById("analyticsContent").innerHTML = `<div class="alert alert-error">Failed: ${e.message}</div>`;
    blockEl("analyticsContent");
  }
}
window.loadBatchAnalytics = loadBatchAnalytics;

function renderBatchAnalytics(data) {
  const students = data.students || [];
  const total    = students.length;
  const passed   = students.filter(s => !s.backlogs || s.backlogs.length === 0).length;
  const failed   = total - passed;
  const avgSgpa  = total ? students.reduce((a,s)=>a+s.sgpa,0)/total : 0;
  const maxSgpa  = total ? Math.max(...students.map(s=>s.sgpa)) : 0;
  const minSgpa  = total ? Math.min(...students.map(s=>s.sgpa)) : 0;

  document.getElementById("analyticsKpiGrid").innerHTML = [
    { val:total,             lbl:"Total Students",  cls:"accent-blue"  },
    { val:passed,            lbl:"Passed",           cls:"accent-green" },
    { val:failed,            lbl:"With Backlogs",    cls:"accent-red"   },
    { val:fmt2(avgSgpa),     lbl:"Avg SGPA",         cls:"accent-ind"   },
    { val:fmt2(maxSgpa),     lbl:"Highest SGPA",     cls:"accent-gold"  },
    { val:fmt2(minSgpa),     lbl:"Lowest SGPA",      cls:"accent-blue"  },
  ].map(k=>`
    <div class="kpi-card ${k.cls}">
      <div class="kpi-value" style="font-size:1.3rem;">${k.val}</div>
      <div class="kpi-label">${k.lbl}</div>
    </div>`).join("");

  // SGPA distribution histogram
  const buckets = ["5–6","6–7","7–8","8–9","9–10"];
  const counts  = [0,0,0,0,0];
  students.forEach(s => {
    const v = s.sgpa;
    if      (v < 6)  counts[0]++;
    else if (v < 7)  counts[1]++;
    else if (v < 8)  counts[2]++;
    else if (v < 9)  counts[3]++;
    else             counts[4]++;
  });
  const ctx1 = document.getElementById("sgpaDistChart").getContext("2d");
  if (sgpaDistChart) sgpaDistChart.destroy();
  sgpaDistChart = new Chart(ctx1, {
    type:"bar",
    data:{
      labels:buckets,
      datasets:[{ label:"Students", data:counts,
        backgroundColor:["#DBEAFE","#BBF7D0","#A7F3D0","#C7D2FE","#E9D5FF"],
        borderRadius:8, borderWidth:0 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,grid:{color:"#F1F5F9"},ticks:{color:"#94A3B8"}},
              x:{grid:{display:false},ticks:{color:"#94A3B8"}}}
    }
  });

  // Pass/Fail donut
  const ctx2 = document.getElementById("batchPassFailChart").getContext("2d");
  if (batchPfChart) batchPfChart.destroy();
  batchPfChart = new Chart(ctx2, {
    type:"doughnut",
    data:{ labels:["Pass","Fail"],
      datasets:[{ data:[passed,failed], backgroundColor:["#16A34A","#DC2626"], borderWidth:0, hoverOffset:4 }]
    },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"70%", plugins:{legend:{position:"bottom"}} }
  });

  // Subject analytics
  const subjectMap = {};
  students.forEach(s => {
    (s.backlogs||[]).forEach(sub => {
      subjectMap[sub] = (subjectMap[sub]||0) + 1;
    });
  });
  const subjectGrid = document.getElementById("subjectAnalyticsGrid");
  if (Object.keys(subjectMap).length) {
    subjectGrid.innerHTML = Object.entries(subjectMap)
      .sort((a,b)=>b[1]-a[1]).slice(0,12).map(([sub,cnt]) => {
        const failPct = total ? (cnt/total*100).toFixed(1) : 0;
        return `
        <div class="subject-analytics-card">
          <div style="font-weight:700;font-size:14px;">${sub}</div>
          <div style="font-size:13px;color:var(--text-muted);">${cnt} of ${total} students failed</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${failPct}%;background:var(--brand-danger);"></div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--brand-danger);">${failPct}% Fail Rate</div>
        </div>`;
      }).join("");
  } else {
    subjectGrid.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">No backlog data available.</p>';
  }
}

function exportCsv() {
  if (!currentBatch) { alert("Load a batch first."); return; }
  const rows = [["Name","Roll Number","SGPA","Credits","Percentage","Backlogs"]];
  (currentBatch.students||[]).forEach(s => {
    rows.push([
      s.name || "—", s.roll, fmt2(s.sgpa), s.credits || "—",
      fmtPct((s.sgpa - 0.75) * 10),
      (s.backlogs||[]).join("; ") || "None"
    ]);
  });
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href:url, download:"batch_results.csv" });
  a.click(); URL.revokeObjectURL(url);
}
window.exportCsv = exportCsv;

/* ══════════════════════════════════════════════════════════════ LEADERBOARD ══*/
async function loadLeaderboard() {
  const id = document.getElementById("lbBatchSelect").value;
  if (!id) { hideEl("lbContent"); showEl("lbEmpty"); return; }
  try {
    const data = await adminFetch(`/api/admin/batch/${id}/analytics`);
    const students = [...(data.students||[])].sort((a,b)=>b.sgpa-a.sgpa);
    showEl("lbContent"); hideEl("lbEmpty");

    document.getElementById("lbTableBody").innerHTML = students.map((s,i) => {
      const rank = i + 1;
      let rankHtml;
      if      (rank === 1) rankHtml = '<span class="rank-badge rank-1">🥇</span>';
      else if (rank === 2) rankHtml = '<span class="rank-badge rank-2">🥈</span>';
      else if (rank === 3) rankHtml = '<span class="rank-badge rank-3">🥉</span>';
      else                 rankHtml = `<span class="rank-badge rank-n">${rank}</span>`;
      const hasBacklog = s.backlogs && s.backlogs.length > 0;
      return `<tr>
        <td>${rankHtml}</td>
        <td style="font-weight:600;">${s.name||"—"}</td>
        <td class="td-mono">${s.roll||"—"}</td>
        <td class="td-num" style="color:var(--brand-primary);">${fmt2(s.sgpa)}</td>
        <td>${fmtPct((s.sgpa-0.75)*10)}</td>
        <td>${hasBacklog
          ? `<span class="badge badge-danger">${s.backlogs.length} Backlog</span>`
          : '<span class="badge badge-success">Clear</span>'}</td>
      </tr>`;
    }).join("");
  } catch(e) {
    alert("Failed to load leaderboard: " + e.message);
  }
}
window.loadLeaderboard = loadLeaderboard;

/* ══════════════════════════════════════════════════════════════ STUDENTS ════*/
async function loadStudents() {
  try {
    const data = await adminFetch("/api/admin/students");
    allStudents = data.students || [];
    renderStudents(allStudents);
    hideEl("studentsLoading");
    showEl("studentsTable");
  } catch(e) {
    console.error("Students load failed:", e.message);
  }
}

function renderStudents(list) {
  document.getElementById("studentsTableBody").innerHTML = list.map((s,i)=>`
    <tr>
      <td>${i+1}</td>
      <td style="font-weight:600;">${s.name||"—"}</td>
      <td class="td-mono">${s.rollNumber||"—"}</td>
      <td>${s.dept||"—"}</td>
      <td>
        ${s.category==="Lateral Entry"
          ? '<span class="badge badge-blue">Lateral</span>'
          : '<span class="badge badge-success">Regular</span>'}
      </td>
      <td class="td-num" style="color:var(--brand-primary);">${s.cgpa!=null?fmt2(s.cgpa):"—"}</td>
      <td>${(s.semesters||[]).length}</td>
    </tr>`).join("");
}

function filterStudents() {
  const q = document.getElementById("studentSearch").value.toLowerCase();
  renderStudents(allStudents.filter(s =>
    (s.name||"").toLowerCase().includes(q) ||
    (s.rollNumber||"").toLowerCase().includes(q)
  ));
}
window.filterStudents = filterStudents;
