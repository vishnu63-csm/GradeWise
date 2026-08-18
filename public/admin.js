/* ─── GradeWise Admin Portal JavaScript ─────────────────────────────────── */
"use strict";

/* ── State & Auth ───────────────────────────────────────────────────────── */
function getAdminToken() { return localStorage.getItem("gradewise_admin_token") || ""; }
function guardAdminAuth() {
  if (!getAdminToken()) { window.location.href = "login.html"; return false; }
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
    if (res.status === 401) { window.location.href = "login.html"; }
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
  try {
    const data = await adminFetch("/api/admin/analytics");
    container.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:var(--space-xl);">
        <div class="kpi-card accent-blue"><div class="kpi-value">${data.total || 0}</div><div class="kpi-label">Total Student Results</div></div>
        <div class="kpi-card accent-green"><div class="kpi-value">${fmtPct(data.passPercentage)}</div><div class="kpi-label">Overall Pass Percentage</div></div>
        <div class="kpi-card accent-gold"><div class="kpi-value">${fmt2(data.averageSgpa)}</div><div class="kpi-label">Average SGPA</div></div>
        <div class="kpi-card accent-ind"><div class="kpi-value">${data.totalBacklogs || 0}</div><div class="kpi-label">Total Backlogs</div></div>
      </div>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

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
              <td><code>${esc(s.rollNumber)}</code></td>
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

/* ═══════════════════════════════════════════════════════════ INIT ════════ */
document.addEventListener("DOMContentLoaded", () => {
  if (!guardAdminAuth()) return;

  document.querySelectorAll(".nav-tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("adminLogoutBtn").addEventListener("click", () => {
    localStorage.removeItem("gradewise_admin_token");
    window.location.href = "login.html";
  });

  loadOverview();
});
