/* ─── GradeWise Admin Portal JavaScript ─────────────────────────────────── */
"use strict";

/* ── State & Auth ───────────────────────────────────────────────────────── */
function getAdminToken() { return localStorage.getItem("gradewise_admin_token") || ""; }
function guardAdminAuth() {
  if (!getAdminToken()) { window.location.href = "admin-login.html"; return false; }
  return true;
}

async function adminFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${getAdminToken()}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { window.location.href = "admin-login.html"; }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

const fmt2   = n => n != null ? Number(n).toFixed(2) : "—";
const fmtPct = n => n != null ? `${Number(n).toFixed(2)}%` : "—";
const esc    = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function switchTab(name) {
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".section-tab").forEach(s => s.classList.toggle("active", s.id === `tab-${name}`));
  window.scrollTo(0, 0);

  if (name === "overview") loadOverview();
  if (name === "uploads") loadUploadsList();
  if (name === "rules") loadRules();
  if (name === "analytics") loadAnalytics();
  if (name === "students") loadStudents();
}
window.switchTab = switchTab;

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
window.closeModal = closeModal;

/* ═══════════════════════════════════════════════════════════ OVERVIEW ════ */
async function loadOverview() {
  try {
    const data = await adminFetch("/api/admin/dashboard");
    document.getElementById("kpiTotalStudents").textContent = data.totalStudents || 0;
    document.getElementById("kpiPublishedUploads").textContent = data.publishedUploads || 0;
    document.getElementById("kpiPassPercentage").textContent = data.passPercentage != null ? fmtPct(data.passPercentage) : "—";
    document.getElementById("kpiTotalBacklogs").textContent = data.studentsWithBacklogs || 0;

    const uploads = data.recentUploads || [];
    const container = document.getElementById("recentUploadsTable");
    if (uploads.length === 0) {
      container.innerHTML = `<p class="empty-sub">No recent uploads found.</p>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>File</th><th>Semester</th><th>Regulation</th><th>Session</th><th>Students</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${uploads.map(u => `
            <tr>
              <td><strong>${esc(u.fileName)}</strong></td>
              <td>${esc(u.semester)}</td>
              <td>${esc(u.regulation)}</td>
              <td>${esc(u.examSession || "—")}</td>
              <td>${u.totalStudents || 0}</td>
              <td><span class="status-pill status-${u.status}">${esc(u.status)}</span></td>
              <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch(e) {
    document.getElementById("recentUploadsTable").innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════ UPLOADS LIST ═ */
async function loadUploadsList() {
  const container = document.getElementById("uploadsListTable");
  container.innerHTML = "Loading uploads...";
  try {
    const data = await adminFetch("/api/admin/uploads");
    const uploads = data.uploads || [];
    if (uploads.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><p>No result files uploaded yet.</p></div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>File Name</th><th>Sem</th><th>Regulation</th><th>Session</th><th>Students</th><th>Valid / Review</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${uploads.map(u => `
            <tr>
              <td><strong>${esc(u.fileName)}</strong></td>
              <td>${esc(u.semester)}</td>
              <td>${esc(u.regulation)}</td>
              <td>${esc(u.examSession || "—")}</td>
              <td>${u.totalStudents || 0}</td>
              <td><span class="text-success">${u.validStudents || 0}</span> / <span class="text-danger">${u.needsReviewCount || 0}</span></td>
              <td><span class="status-pill status-${u.status}">${esc(u.status)}</span></td>
              <td>
                ${u.status === "PUBLISHED" ? 
                  `<button class="btn btn-ghost btn-sm" onclick="unpublishUpload('${u._id}')">Unpublish</button>` :
                  `<button class="btn btn-primary btn-sm" onclick="publishUpload('${u._id}')">Publish</button>`
                }
                <button class="btn btn-danger btn-sm" onclick="deleteUpload('${u._id}')">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

async function publishUpload(id) {
  if (!confirm("Are you sure you want to publish these results? They will become immediately visible to matching students.")) return;
  try {
    const res = await adminFetch(`/api/admin/upload/${id}/publish`, { method: "POST" });
    alert(res.message || "Published successfully!");
    loadUploadsList();
  } catch(e) {
    alert("Publishing failed: " + e.message);
  }
}
window.publishUpload = publishUpload;

async function unpublishUpload(id) {
  if (!confirm("Are you sure you want to unpublish? Students will no longer see these results.")) return;
  try {
    const res = await adminFetch(`/api/admin/upload/${id}/unpublish`, { method: "POST" });
    alert(res.message || "Unpublished successfully!");
    loadUploadsList();
  } catch(e) {
    alert("Unpublishing failed: " + e.message);
  }
}
window.unpublishUpload = unpublishUpload;

async function deleteUpload(id) {
  if (!confirm("Delete this upload and all its student result records? This action cannot be undone.")) return;
  try {
    await adminFetch(`/api/admin/upload/${id}`, { method: "DELETE" });
    loadUploadsList();
  } catch(e) {
    alert("Delete failed: " + e.message);
  }
}
window.deleteUpload = deleteUpload;

/* ═══════════════════════════════════════════════════════════ UPLOAD WIZARD ═ */
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("startUploadBtn");
  const msg = document.getElementById("uploadMsg");
  msg.innerHTML = "";
  btn.disabled = true;
  btn.textContent = "Processing PDF Data...";

  try {
    const formData = new FormData();
    formData.append("semester", document.getElementById("wSemester").value);
    formData.append("regulation", document.getElementById("wRegulation").value);
    formData.append("examSession", document.getElementById("wExamSession").value);
    formData.append("academicYear", document.getElementById("wAcademicYear").value);

    const pdfFile = document.getElementById("wPdfFile").files[0];
    if (pdfFile) formData.append("pdf", pdfFile);

    const res = await fetch("/api/admin/upload-pdf", {
      method: "POST",
      headers: { "Authorization": `Bearer ${getAdminToken()}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    msg.innerHTML = `<div class="alert alert-success">
      ✅ Processing complete! Found <strong>${data.studentCount}</strong> student records.<br/>
      Valid: ${data.validCount} | Needs Review: ${data.needsReviewCount}<br/>
      <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="publishUpload('${data.uploadId}')">Publish Now</button>
    </div>`;
  } catch(err) {
    msg.innerHTML = `<div class="alert alert-error">❌ ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Start Processing PDF →";
  }
});

/* ═══════════════════════════════════════════════════════════ ROLL RULES ═══ */
async function loadRules() {
  const container = document.getElementById("rulesListTable");
  try {
    const data = await adminFetch("/api/admin/roll-rules");
    const rules = data.rules || [];
    if (rules.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>No roll number rules configured.</p></div>`;
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Prefix Pattern</th><th>Department</th><th>Admission Type</th><th>Regulation</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${rules.map(r => `
            <tr>
              <td><code>${esc(r.pattern)}</code></td>
              <td>${esc(r.department)}</td>
              <td><span class="badge badge-blue">${esc(r.admissionType)}</span></td>
              <td>${esc(r.regulation || "R23")}</td>
              <td><button class="btn btn-danger btn-sm" onclick="deleteRule('${r._id}')">Delete</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

function openAddRuleModal() {
  document.getElementById("ruleId").value = "";
  document.getElementById("rulePattern").value = "";
  document.getElementById("ruleDept").value = "";
  document.getElementById("ruleMsg").innerHTML = "";
  openModal("ruleModal");
}
window.openAddRuleModal = openAddRuleModal;

async function saveRollRule() {
  const pattern = document.getElementById("rulePattern").value.trim();
  const department = document.getElementById("ruleDept").value.trim();
  const admissionType = document.getElementById("ruleAdmType").value;
  const msg = document.getElementById("ruleMsg");

  try {
    await adminFetch("/api/admin/roll-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, department, admissionType }),
    });
    closeModal("ruleModal");
    loadRules();
  } catch(e) {
    msg.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  }
}
window.saveRollRule = saveRollRule;

async function deleteRule(id) {
  if (!confirm("Delete this rule?")) return;
  try {
    await adminFetch(`/api/admin/roll-rules/${id}`, { method: "DELETE" });
    loadRules();
  } catch(e) {
    alert("Failed to delete rule: " + e.message);
  }
}
window.deleteRule = deleteRule;

/* ═══════════════════════════════════════════════════════════ ANALYTICS ════ */
async function loadAnalytics() {
  const container = document.getElementById("analyticsContent");
  container.innerHTML = `<div class="loading-state"><p>Loading analytics and aggregations...</p></div>`;

  try {
    // Read filter values if controls exist
    const semester    = document.getElementById("anSem")?.value || "";
    const regulation  = document.getElementById("anReg")?.value || "";
    const department  = document.getElementById("anDept")?.value || "";
    const acadYear    = document.getElementById("anYear")?.value || "";
    const admType     = document.getElementById("anAdmType")?.value || "";
    const examSession = document.getElementById("anSession")?.value || "";

    const query = new URLSearchParams();
    if (semester)    query.set("semester", semester);
    if (regulation)  query.set("regulation", regulation);
    if (department)  query.set("department", department);
    if (acadYear)    query.set("academicYear", acadYear);
    if (admType)     query.set("admissionType", admType);
    if (examSession) query.set("examSession", examSession);

    const data = await adminFetch(`/api/admin/analytics?${query.toString()}`);

    container.innerHTML = `
      <!-- Filters bar -->
      <div class="card" style="margin-bottom:var(--space-xl);padding:var(--space-md);">
        <div class="section-heading" style="margin-bottom:12px;">Analytics Filters</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:12px;align-items:end;">
          <div><label class="field-label">Semester</label><select id="anSem" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="1-1">1-1</option><option value="1-2">1-2</option><option value="2-1">2-1</option><option value="2-2">2-2</option><option value="3-1">3-1</option><option value="3-2">3-2</option><option value="4-1">4-1</option><option value="4-2">4-2</option></select></div>
          <div><label class="field-label">Regulation</label><select id="anReg" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="R23">R23</option><option value="R20">R20</option></select></div>
          <div><label class="field-label">Department</label><input id="anDept" class="field-input" placeholder="e.g. CSE" onchange="loadAnalytics()"/></div>
          <div><label class="field-label">Admission Type</label><select id="anAdmType" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="Regular Entry">Regular Entry</option><option value="Lateral Entry">Lateral Entry</option></select></div>
          <div><label class="field-label">Exam Session</label><input id="anSession" class="field-input" placeholder="e.g. April 2026" onchange="loadAnalytics()"/></div>
          <div><button class="btn btn-ghost btn-sm" onclick="clearAnalyticsFilters()">Reset Filters</button></div>
        </div>
      </div>

      <!-- Overview KPIs -->
      <div class="kpi-grid" style="margin-bottom:var(--space-xl);">
        <div class="kpi-card accent-blue"><div class="kpi-value">${data.total || 0}</div><div class="kpi-label">Total Student Results</div></div>
        <div class="kpi-card accent-green"><div class="kpi-value">${fmtPct(data.passPercentage)}</div><div class="kpi-label">Pass Rate (${data.passed}/${data.total})</div></div>
        <div class="kpi-card accent-gold"><div class="kpi-value">${fmt2(data.averageSgpa)}</div><div class="kpi-label">Average SGPA</div></div>
        <div class="kpi-card accent-ind"><div class="kpi-value">${data.totalBacklogs || 0}</div><div class="kpi-label">Total Backlogs</div></div>
      </div>

      <!-- Department & Regular vs LE Breakdown -->
      <div class="card" style="margin-bottom:var(--space-xl);">
        <div class="section-heading" style="margin-bottom:var(--space-md);">Department &amp; Entry Type Breakdown</div>
        ${(data.deptBreakdown||[]).length === 0 ? '<p class="empty-sub">No department breakdown available.</p>' : `
        <table class="data-table">
          <thead><tr><th>Department</th><th>Admission Type</th><th>Students</th><th>Passed</th><th>Pass Rate</th><th>Avg SGPA</th><th>Backlogs</th></tr></thead>
          <tbody>${data.deptBreakdown.map(d=>`<tr>
            <td><strong>${esc(d._id.dept||"General")}</strong></td>
            <td><span class="badge badge-blue">${esc(d._id.type||"Regular Entry")}</span></td>
            <td>${d.total}</td>
            <td>${d.passed}</td>
            <td><strong>${fmtPct((d.passed/d.total)*100)}</strong></td>
            <td>${fmt2(d.avgSgpa)}</td>
            <td>${d.backlogs||0}</td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <!-- Subject Performance & Most Failed Subjects -->
      <div class="card" style="margin-bottom:var(--space-xl);">
        <div class="section-heading" style="margin-bottom:var(--space-md);">Subject Performance Analysis</div>
        ${(data.subjectStats||[]).length === 0 ? '<p class="empty-sub">No subject statistics available.</p>' : `
        <table class="data-table">
          <thead><tr><th>Subject Code</th><th>Subject Name</th><th>Total Enrolled</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
          <tbody>${data.subjectStats.map(s=>`<tr>
            <td><code>${esc(s._id.code||"—")}</code></td>
            <td>${esc(s._id.name)}</td>
            <td>${s.total}</td>
            <td><span class="text-success">${s.passed}</span></td>
            <td><span class="${s.failed>0?"text-danger":""}">${s.failed}</span></td>
            <td><span class="badge ${s.passRate>=75?"badge-success":s.passRate>=50?"badge-warning":"badge-danger"}">${fmtPct(s.passRate)}</span></td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <!-- Backlog Analysis -->
      <div class="card" style="margin-bottom:var(--space-xl);">
        <div class="section-heading" style="margin-bottom:var(--space-md);">Students with Active Backlogs</div>
        ${(data.backlogStudents||[]).length === 0 ? '<p class="empty-sub">🎉 No active backlog records found!</p>' : `
        <table class="data-table">
          <thead><tr><th>Roll Number</th><th>Student Name</th><th>Department</th><th>Semester</th><th>Backlog Count</th><th>Failed Subjects</th></tr></thead>
          <tbody>${data.backlogStudents.map(b=>`<tr>
            <td><code>${esc(b.rollNumber)}</code></td>
            <td>${esc(b.studentName||"—")}</td>
            <td>${esc(b.department||"—")}</td>
            <td>${esc(b.semester)}</td>
            <td><span class="badge badge-danger">${b.backlogCount}</span></td>
            <td>${(b.failedSubjects||[]).map(esc).join(", ")||"—"}</td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <!-- Student Improvement Tracking -->
      <div class="card">
        <div class="section-heading" style="margin-bottom:var(--space-md);">Student Semester Improvement Tracking</div>
        ${(data.studentImprovement||[]).length === 0 ? '<p class="empty-sub">Improvement comparison will appear when historical semester results exist.</p>' : `
        <table class="data-table">
          <thead><tr><th>Roll Number</th><th>Student Name</th><th>Dept</th><th>Prev Sem (${esc(data.studentImprovement[0]?.prevSem||"")})</th><th>Latest Sem (${esc(data.studentImprovement[0]?.latestSem||"")})</th><th>SGPA Improvement</th></tr></thead>
          <tbody>${data.studentImprovement.map(i=>`<tr>
            <td><code>${esc(i.rollNumber)}</code></td>
            <td>${esc(i.name||"—")}</td>
            <td>${esc(i.dept||"—")}</td>
            <td>${fmt2(i.prevSgpa)}</td>
            <td>${fmt2(i.latestSgpa)}</td>
            <td><strong class="${i.improvement>=0?"text-success":"text-danger"}">${i.improvement>=0?"+":""}${fmt2(i.improvement)}</strong></td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

function clearAnalyticsFilters() {
  ["anSem","anReg","anDept","anYear","anAdmType","anSession"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  loadAnalytics();
}
window.clearAnalyticsFilters = clearAnalyticsFilters;


/* ═══════════════════════════════════════════════════════════ STUDENTS ═════ */
async function loadStudents() {
  const container = document.getElementById("studentsListTable");
  try {
    const data = await adminFetch("/api/admin/students");
    const students = data.students || [];
    if (students.length === 0) {
      container.innerHTML = `<p class="empty-sub">No registered students found.</p>`;
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Roll Number</th><th>Name</th><th>Dept</th><th>Category</th><th>Phone</th><th>Registered</th></tr>
        </thead>
        <tbody>
          ${students.map(s => `
            <tr>
              <td><button class="btn btn-ghost btn-sm" onclick="openStudentProfile('${s.rollNumber}')" style="padding:2px 6px;"><code>${esc(s.rollNumber)}</code></button></td>
              <td>${esc(s.name)}</td>
              <td>${esc(s.dept || "—")}</td>
              <td>${esc(s.category || "Regular Entry")}</td>
              <td>${esc(s.phone)}</td>
              <td>${new Date(s.createdAt).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════ LEADERBOARDS ═ */
async function loadLeaderboards() {
  const lbTable = document.getElementById("leaderboardTable");
  const impTable = document.getElementById("improvementTable");
  if (!lbTable || !impTable) return;
  
  lbTable.innerHTML = "Loading standings...";
  impTable.innerHTML = "Loading improvements...";

  try {
    const sem = document.getElementById("ldSem")?.value || "3-2";
    const dept = document.getElementById("ldDept")?.value || "";
    const adm = document.getElementById("ldAdm")?.value || "";

    const query = new URLSearchParams();
    if (sem) query.set("semester", sem);
    if (dept) query.set("department", dept);
    if (adm) query.set("admissionType", adm);

    const data = await adminFetch(`/api/admin/leaderboards?${query.toString()}`);
    const lb = data.leaderboard || [];
    const imp = data.improvement || [];

    if (lb.length === 0) {
      lbTable.innerHTML = `<p class="empty-sub" style="padding:20px 0;">No leaderboard entries match this filter.</p>`;
    } else {
      lbTable.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Rank</th><th>Roll Number</th><th>Name</th><th>Dept</th><th>SGPA</th><th>%</th></tr></thead>
          <tbody>
            ${lb.map((s, idx) => `
              <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td><button class="btn btn-ghost btn-sm" onclick="openStudentProfile('${s.rollNumber}')" style="padding:2px 6px;"><code>${esc(s.rollNumber)}</code></button></td>
                <td>${esc(s.studentName)}</td>
                <td>${esc(s.department)}</td>
                <td><strong>${fmt2(s.sgpa)}</strong></td>
                <td>${fmtPct(s.percentage)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`;
    }

    if (imp.length === 0) {
      impTable.innerHTML = `<p class="empty-sub" style="padding:20px 0;">No improvement records found.</p>`;
    } else {
      impTable.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Student Name</th><th>Roll Number</th><th>Prev SGPA</th><th>Latest SGPA</th><th>Change</th></tr></thead>
          <tbody>
            ${imp.map(i => `
              <tr>
                <td><strong>${esc(i.name)}</strong></td>
                <td><button class="btn btn-ghost btn-sm" onclick="openStudentProfile('${i.rollNumber}')" style="padding:2px 6px;"><code>${esc(i.rollNumber)}</code></button></td>
                <td>${fmt2(i.prevSgpa)}</td>
                <td>${fmt2(i.latestSgpa)}</td>
                <td><span class="badge ${i.improvement >= 0 ? "badge-pass" : "badge-fail"}">${i.improvement >= 0 ? "+" : ""}${fmt2(i.improvement)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>`;
    }

  } catch(e) {
    lbTable.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
    impTable.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}
window.loadLeaderboards = loadLeaderboards;

function clearLeaderboardFilters() {
  const sem = document.getElementById("ldSem");
  const dept = document.getElementById("ldDept");
  const adm = document.getElementById("ldAdm");
  if (sem) sem.value = "3-2";
  if (dept) dept.value = "";
  if (adm) adm.value = "";
  loadLeaderboards();
}
window.clearLeaderboardFilters = clearLeaderboardFilters;


/* ══════════════════════════════════════════════════════════ STUDENT DETAIL ═ */
let profileChartInst = null;

async function openStudentProfile(rollNumber) {
  const title = document.getElementById("studentProfileTitle");
  const body = document.getElementById("studentProfileBody");
  title.textContent = `Loading Academic Profile for ${rollNumber}...`;
  body.innerHTML = "Fetching results details...";
  openModal("studentProfileModal");

  try {
    const data = await adminFetch(`/api/admin/student/${rollNumber}`);
    const student = data.student;
    const results = data.results || [];

    title.textContent = `${student ? esc(student.name) : "Student"} (${rollNumber.toUpperCase()})`;

    // Check backlogs
    const backlogs = results.reduce((acc, r) => acc + (r.backlogCount || 0), 0);

    body.innerHTML = `
      <div class="card-box" style="margin-bottom:20px;background:var(--bg-muted);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px;">
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;">DEPARTMENT</div><div style="font-weight:700;font-size:14px;color:var(--text-main);">${esc(student?.dept || "CSM")}</div></div>
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;">CATEGORY</div><div style="font-weight:700;font-size:14px;color:var(--text-main);">${esc(student?.category || "Regular Entry")}</div></div>
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;">TOTAL BACKLOGS</div><div style="font-weight:700;font-size:14px;color:${backlogs > 0 ? "var(--accent-rose-txt)" : "var(--text-main)"};">${backlogs}</div></div>
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;">CGPA</div><div style="font-weight:700;font-size:14px;color:var(--brand-primary);">${student?.cgpa != null ? fmt2(student.cgpa) : "—"}</div></div>
        </div>
      </div>

      <div class="card-box" style="margin-bottom:20px;">
        <div class="card-title">Performance Trend</div>
        <div style="height:180px;position:relative;">
          <canvas id="profileChart"></canvas>
        </div>
      </div>

      <div class="card-title" style="margin-top:16px;">Semester Results History</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${results.length === 0 ? `<p style="color:var(--text-sub);font-style:italic;">No published exam results found for this student.</p>` : 
          results.map(r => `
            <div class="card-box" style="border-left:4px solid ${r.passed ? "var(--brand-primary)" : "var(--accent-rose-txt)"}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong>${esc(r.semester)} Semester</strong>
                <span class="badge ${r.passed ? "badge-pass" : "badge-fail"}">${r.passed ? "PASS" : "FAIL"}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);font-size:12px;margin-bottom:8px;background:var(--bg-muted);padding:8px;border-radius:6px;">
                <div>SGPA: <strong>${fmt2(r.sgpa)}</strong></div>
                <div>Pct: <strong>${fmtPct(r.percentage)}</strong></div>
                <div>Credits: <strong>${r.totalCredits}</strong></div>
                <div>Backlogs: <strong>${r.backlogCount}</strong></div>
              </div>
              <div style="font-size:12px;max-height:120px;overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead><tr style="text-align:left;color:var(--text-muted);font-size:10px;"><th>Subject</th><th>Credits</th><th>Grade</th></tr></thead>
                  <tbody>
                    ${(r.subjects || []).map(s => `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td>${esc(s.name)}</td>
                        <td>${s.credits}</td>
                        <td><strong>${esc(s.grade)}</strong></td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          `).join("")
        }
      </div>`;

    // Render Trend chart
    setTimeout(() => {
      const ctx = document.getElementById("profileChart")?.getContext("2d");
      if (!ctx) return;
      if (profileChartInst) profileChartInst.destroy();
      
      const labels = results.map(r => r.semester);
      const sData = results.map(r => r.sgpa);
      
      profileChartInst = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "SGPA",
            data: sData,
            borderColor: "#3B82F6",
            tension: 0.3,
            fill: false,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { min: 0, max: 10 } }
        }
      });
    }, 100);

  } catch(e) {
    body.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  }
}
window.openStudentProfile = openStudentProfile;


/* ── Navigation & View Router ────────────────────────────────────────────── */
const ADMIN_VIEWS = ["overview", "uploads", "upload-wizard", "students", "analytics", "leaderboards", "rules"];

function switchTab(name, updateHash = true) {
  const target = (name === "dashboard" || name === "overview") ? "overview" : name;
  if (!ADMIN_VIEWS.includes(target)) return;

  if (updateHash) {
    const hash = target === "overview" ? "overview" : target;
    if (window.location.hash !== `#${hash}`) {
      window.location.hash = hash;
    }
  }

  // 1. Sidebar buttons
  document.querySelectorAll(".sidebar-btn[data-tab]").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === target);
  });

  // 2. Hide all view sections, show ONLY target section
  document.querySelectorAll(".section-tab").forEach(s => {
    const isTarget = s.id === `tab-${target}`;
    s.classList.toggle("active", isTarget);
    s.style.display = isTarget ? "block" : "none";
  });

  document.getElementById("sidebar")?.classList.remove("open");
  window.scrollTo(0, 0);

  if (target === "overview")  loadOverview();
  if (target === "uploads")   loadUploadsList();
  if (target === "rules")     loadRules();
  if (target === "analytics") loadAnalytics();
  if (target === "students")  loadStudents();
  if (target === "leaderboards") loadLeaderboards();
}
window.switchTab = switchTab;

function handleAdminHashRoute() {
  const hash = (window.location.hash || "").replace("#", "").toLowerCase();
  const view = (hash === "overview" || hash === "" || !hash) ? "overview" : hash;
  switchTab(view, false);
}

/* ═══════════════════════════════════════════════════════════ INIT ════════ */
document.addEventListener("DOMContentLoaded", () => {
  if (!guardAdminAuth()) return;

  document.querySelectorAll(".sidebar-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.toggle("open");
  });

  document.getElementById("adminLogoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("gradewise_admin_token");
    localStorage.removeItem("gradewise_admin");
    window.location.href = "admin-login.html";
  });

  window.addEventListener("hashchange", handleAdminHashRoute);
  loadOverview();
  handleAdminHashRoute();
});
