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
    document.getElementById("kpiNeedsReview").textContent = data.needsReviewResults || 0;
    document.getElementById("kpiParsingErrors").textContent = data.parsingErrorsCount || 0;

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

let _uploadsFilterStatus = "";

function setUploadsFilter(status) {
  _uploadsFilterStatus = status;
  loadUploadsList();
}
window.setUploadsFilter = setUploadsFilter;

async function loadUploadsList() {
  const container = document.getElementById("uploadsListTable");
  container.innerHTML = "Loading uploads...";
  try {
    const q = _uploadsFilterStatus ? `?status=${_uploadsFilterStatus}` : "";
    const data = await adminFetch(`/api/admin/uploads${q}`);
    const uploads = data.uploads || [];

    const filters = ["", "NEEDS_REVIEW", "DRAFT", "PUBLISHED"];
    const ids = ["upFlAll", "upFlNeedsReview", "upFlDraft", "upFlPublished"];
    filters.forEach((f, idx) => {
      const btn = document.getElementById(ids[idx]);
      if (btn) {
        btn.classList.toggle("active", _uploadsFilterStatus === f);
        btn.style.background = _uploadsFilterStatus === f ? "var(--bg-card)" : "none";
      }
    });

    if (uploads.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><p>No result files match the selected filter status.</p></div>`;
      return;
    }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>File Name</th><th>Sem</th><th>Regulation</th><th>Session</th>
          <th>Total</th><th>Valid</th><th>Needs Review</th><th>Status</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${uploads.map(u => `
          <tr>
            <td><strong>${esc(u.fileName)}</strong></td>
            <td>${esc(u.semester)}</td>
            <td>${esc(u.regulation)}</td>
            <td>${esc(u.examSession || "—")}</td>
            <td>${u.totalStudents || 0}</td>
            <td><span class="badge badge-pass">${u.validStudents || 0} valid</span></td>
            <td>
              ${(u.needsReviewCount || 0) > 0
                ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent-gold-txt);border-color:var(--accent-gold-txt);" onclick="openReviewModal('${u._id}')">⚠ ${u.needsReviewCount} — Review Now</button>`
                : `<span style="color:var(--accent-green-txt);font-size:12px;">✓ All clear</span>`
              }
            </td>
            <td><span class="status-pill status-${u.status}">${esc(u.status)}</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap;">
              ${u.status !== "PUBLISHED"
                ? `<button class="btn btn-ghost btn-sm" onclick="openReviewModal('${u._id}')">Review</button>
                   <button class="btn btn-primary btn-sm" onclick="confirmPublish('${u._id}', ${u.needsReviewCount || 0})">Publish</button>`
                : `<button class="btn btn-ghost btn-sm" onclick="unpublishUpload('${u._id}')">Unpublish</button>`
              }
              ${u.status !== "PUBLISHED" ? `<button class="btn btn-danger btn-sm" onclick="deleteUpload('${u._id}')">Delete</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}

async function confirmPublish(id, needsReviewCount) {
  const msg = needsReviewCount > 0
    ? `⚠ There are ${needsReviewCount} records that NEED REVIEW.\n\nPublishing will only include VALID records.\n\nDo you want to publish the valid records now?`
    : "Publish all valid results? They will become immediately visible to matching students.";
  if (!confirm(msg)) return;
  try {
    const res = await adminFetch(`/api/admin/upload/${id}/publish`, { method: "POST" });
    alert(res.message || "Published successfully!");
    loadUploadsList();
  } catch(e) {
    alert("Publishing failed: " + e.message);
  }
}
window.confirmPublish = confirmPublish;

async function publishUpload(id) {
  await confirmPublish(id, 0);
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

/* ═══════════════════════════════════════════════════════════ REVIEW MODAL ══ */
let _reviewUploadId = null;
let _reviewPage = 1;
let _reviewFilter = "";

async function openReviewModal(uploadId) {
  _reviewUploadId = uploadId;
  _reviewPage = 1;
  _reviewFilter = "";
  openModal("reviewModal");
  await loadReviewRecords();
}
window.openReviewModal = openReviewModal;

async function loadReviewRecords() {
  const body = document.getElementById("reviewModalBody");
  const tabs = document.getElementById("reviewTabs");
  if (!body || !_reviewUploadId) return;
  body.innerHTML = `<div style="padding:20px;color:var(--text-sub);">Loading records…</div>`;

  try {
    const qp = new URLSearchParams({ page: _reviewPage, limit: 20 });
    if (_reviewFilter) qp.set("validationStatus", _reviewFilter);
    const data = await adminFetch(`/api/admin/upload/${_reviewUploadId}?${qp}`);
    const u = data.upload || {};
    const results = data.results || [];
    const total = data.total || 0;

    // Tabs
    const allCount = u.totalStudents || 0;
    const validCount = u.validStudents || 0;
    const needsReviewCount = u.needsReviewCount || 0;

    if (tabs) {
      tabs.innerHTML = `
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border-color);margin-bottom:16px;">
          ${[["","All",allCount],["VALID","Valid",validCount],["NEEDS_REVIEW","Needs Review",needsReviewCount]].map(([val,label,cnt]) => `
            <button onclick="setReviewFilter('${val}')" style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:${_reviewFilter===val?"var(--brand-primary)":"var(--text-sub)"};border-bottom:2px solid ${_reviewFilter===val?"var(--brand-primary)":"transparent"};transition:all 0.15s;">
              ${label} <span style="font-size:11px;opacity:0.7;">(${cnt})</span>
            </button>
          `).join("")}
        </div>`;
    }

    if (results.length === 0) {
      body.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-sub);">
          <div style="font-size:36px;margin-bottom:12px;">✓</div>
          <div style="font-weight:600;font-size:14px;">No Records Require Review</div>
          <div style="font-size:13px;margin-top:6px;">All extracted records have been successfully validated.</div>
        </div>`;
      return;
    }

    const pages = Math.ceil(total / 20);

    body.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
        Showing ${results.length} of ${total} records (Page ${_reviewPage}/${pages})
      </div>
      <table class="data-table" style="font-size:13px;">
        <thead>
          <tr>
            <th>Roll Number</th><th>Student Name</th><th>Dept</th>
            <th>Issues</th><th>SGPA</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => {
            const issues = (r.reviewReasons || []);
            const statusColor = r.validationStatus === "VALID" ? "var(--accent-green-txt)"
              : r.validationStatus === "NEEDS_REVIEW" ? "var(--accent-gold-txt)" : "var(--accent-rose-txt)";
            return `<tr>
              <td><code style="font-size:12px;">${esc(r.rollNumber)}</code></td>
              <td>${esc(r.studentName || "—")}</td>
              <td>${esc(r.department || "—")}</td>
              <td style="max-width:200px;">
                ${issues.length > 0
                  ? `<span style="color:var(--accent-gold-txt);font-size:12px;" title="${issues.join(' | ')}">⚠ ${issues[0]}${issues.length > 1 ? ` +${issues.length-1} more` : ""}</span>`
                  : `<span style="color:var(--accent-green-txt);font-size:12px;">✓ OK</span>`}
              </td>
              <td>${r.sgpa > 0 ? r.sgpa.toFixed(2) : "—"}</td>
              <td><span style="font-size:11px;font-weight:700;color:${statusColor};">${r.validationStatus}</span></td>
              <td>
                <button class="btn btn-ghost btn-sm" style="font-size:12px;" onclick="openRecordEditor('${r._id}')">
                  ${r.validationStatus === "NEEDS_REVIEW" ? "Review" : "View"}
                </button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">
        ${_reviewPage > 1 ? `<button class="btn btn-ghost btn-sm" onclick="reviewPaginate(${_reviewPage-1})">← Prev</button>` : ""}
        <span style="line-height:32px;font-size:13px;color:var(--text-sub);">Page ${_reviewPage} / ${pages}</span>
        ${_reviewPage < pages ? `<button class="btn btn-ghost btn-sm" onclick="reviewPaginate(${_reviewPage+1})">Next →</button>` : ""}
      </div>`;
  } catch(e) {
    body.innerHTML = `<div class="alert alert-error">⚠ ${esc(e.message)}</div>`;
  }
}
window.loadReviewRecords = loadReviewRecords;

function setReviewFilter(f) {
  _reviewFilter = f;
  _reviewPage = 1;
  loadReviewRecords();
}
window.setReviewFilter = setReviewFilter;

function reviewPaginate(page) {
  _reviewPage = page;
  loadReviewRecords();
}
window.reviewPaginate = reviewPaginate;

/* ═══════════════════════════════════════════════════════════ RECORD EDITOR ══ */
let _editingResultId = null;
let _editingResultData = null;

async function openRecordEditor(resultId) {
  _editingResultId = resultId;
  const body = document.getElementById("recordEditorBody");
  const title = document.getElementById("recordEditorTitle");
  if (!body) return;
  openModal("recordEditorModal");
  body.innerHTML = `<div style="padding:20px;color:var(--text-sub);">Loading result details…</div>`;

  try {
    // Fetch single result (via upload detail endpoint with no filter)
    const data = await adminFetch(`/api/admin/results/${resultId}`);
    const r = data.result;
    _editingResultData = JSON.parse(JSON.stringify(r));
    title.textContent = `Reviewing: ${r.rollNumber}`;
    renderRecordEditor(r);
  } catch(e) {
    body.innerHTML = `<div class="alert alert-error">❌ ${esc(e.message)}</div>`;
  }
}
window.openRecordEditor = openRecordEditor;

function isRecordEditorDirty() {
  if (!_editingResultData) return false;
  const nameInput = document.getElementById("editName")?.value || "";
  if (nameInput.trim() !== (_editingResultData.studentName || "").trim()) return true;
  
  const deptInput = document.getElementById("editDept")?.value || "";
  if (deptInput.trim() !== (_editingResultData.department || "").trim()) return true;

  const currentSubjects = collectSubjectsFromEditor();
  const originalSubjects = _editingResultData.subjects || [];
  if (currentSubjects.length !== originalSubjects.length) return true;

  for (let i = 0; i < currentSubjects.length; i++) {
    const c = currentSubjects[i];
    const o = originalSubjects[i];
    if (!o) return true;
    if (c.code !== o.code || c.name !== o.name || c.credits !== o.credits || c.grade !== o.grade) {
      return true;
    }
  }
  return false;
}

async function saveRecordDraftQuietly() {
  if (!_editingResultId) return false;
  const payload = {
    studentName: document.getElementById("editName")?.value?.trim() || "",
    subjects: collectSubjectsFromEditor(),
  };
  try {
    const uploadId = _editingResultData?.uploadId || _reviewUploadId;
    await adminFetch(`/api/admin/upload/${uploadId}/result/${_editingResultId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  } catch(e) {
    alert("Auto-save failed: " + e.message);
    return false;
  }
}

function navigateRecordEditor(targetId) {
  if (isRecordEditorDirty()) {
    openModal("unsavedChangesModal");
    
    document.getElementById("unsavedSaveBtn").onclick = async () => {
      closeModal("unsavedChangesModal");
      const success = await saveRecordDraftQuietly();
      if (success) {
        openRecordEditor(targetId);
      }
    };
    
    document.getElementById("unsavedDiscardBtn").onclick = () => {
      closeModal("unsavedChangesModal");
      openRecordEditor(targetId);
    };
  } else {
    openRecordEditor(targetId);
  }
}
window.navigateRecordEditor = navigateRecordEditor;

function renderRecordEditor(r) {
  const body = document.getElementById("recordEditorBody");
  const issues = (r.reviewReasons || []).concat(r.extractionErrors || []);

  // Find index in current review results array for next/prev paging
  const reviewResultIds = window._reviewResultIds || [];
  const currentIdx = reviewResultIds.indexOf(r._id);
  const prevBtn = currentIdx > 0
    ? `<button class="btn btn-ghost btn-sm" onclick="navigateRecordEditor('${reviewResultIds[currentIdx - 1]}')">← Previous Student</button>`
    : "";
  const nextBtn = currentIdx !== -1 && currentIdx < reviewResultIds.length - 1
    ? `<button class="btn btn-ghost btn-sm" onclick="navigateRecordEditor('${reviewResultIds[currentIdx + 1]}')">Next Student →</button>`
    : "";

  const checks = [];
  
  // 1. Roll Number
  if (r.rollNumber && r.rollNumber.length === 10) {
    checks.push({ name: "Roll Number Format", pass: true });
  } else {
    checks.push({ name: "Roll Number Format", pass: false, desc: "Must be exactly 10 characters." });
  }
  
  // 2. Student Name
  if (r.studentName && r.studentName.trim().length >= 3 && !/\b(design|drawing|steel|structures|lab|practical|project|engineering)\b/i.test(r.studentName)) {
    checks.push({ name: "Student Name", pass: true });
  } else {
    checks.push({ name: "Student Name", pass: false, desc: "Name missing or invalid." });
  }

  // 3. Subjects Extracted
  if (r.subjects && r.subjects.length > 0) {
    checks.push({ name: "Subjects Extracted", pass: true });
    
    const missingCodes = r.subjects.filter(s => !s.code || s.code.trim().length === 0);
    if (missingCodes.length === 0) {
      checks.push({ name: "Subject Codes", pass: true });
    } else {
      checks.push({ name: "Subject Codes", pass: false, desc: `${missingCodes.length} subject code(s) missing.` });
    }

    const invalidCredits = r.subjects.filter(s => s.credits == null || s.credits === 0);
    if (invalidCredits.length === 0) {
      checks.push({ name: "Credits Assigned", pass: true });
    } else {
      checks.push({ name: "Credits Assigned", pass: false, desc: "Some subjects have 0 credits." });
    }

    const missingGrades = r.subjects.filter(s => !s.grade || s.grade === "UNKNOWN" || s.grade === "—");
    if (missingGrades.length === 0) {
      checks.push({ name: "Grades Formatted", pass: true });
    } else {
      checks.push({ name: "Grades Formatted", pass: false, desc: "Some subjects have missing/unknown grades." });
    }
  } else {
    checks.push({ name: "Subjects Extracted", pass: false, desc: "No subjects found." });
  }

  if (r.sgpa != null && r.sgpa >= 0 && r.sgpa <= 10) {
    checks.push({ name: "SGPA Calculated", pass: true });
  } else {
    checks.push({ name: "SGPA Calculated", pass: false, desc: "Calculated SGPA out of range." });
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
      
      <!-- Left Side: Raw PDF Block -->
      <div class="card-box" style="padding:16px;">
        <div style="font-weight:700;font-size:12px;color:var(--text-sub);margin-bottom:8px;display:flex;justify-content:space-between;">
          <span>Raw PDF Source Block</span>
          <span class="badge badge-info" style="font-size:10px;">Page Text Segment</span>
        </div>
        <pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:11.5px;background:var(--bg-muted);color:var(--text-main);padding:12px;border-radius:6px;max-height:450px;overflow-y:auto;margin:0;line-height:1.6;border:1px solid var(--border-color);">${esc(r.rawText || "No raw text segment captured for this student.")}</pre>
      </div>

      <!-- Right Side: Edit Form -->
      <div>
        <!-- Student Info -->
        <div class="card-box" style="margin-bottom:16px;background:var(--bg-muted);">
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;font-size:13px;">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;">ROLL NUMBER</div>
              <div style="font-weight:700;font-family:var(--font-mono);">${esc(r.rollNumber)}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;">STUDENT NAME</div>
              <input id="editName" value="${esc(r.studentName || "")}" style="width:100%;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;padding:4px 8px;font-size:13px;" placeholder="Enter student name"/>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;">DEPARTMENT</div>
              <input id="editDept" value="${esc(r.department || "")}" style="width:100%;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;padding:4px 8px;font-size:13px;" placeholder="e.g. CSE"/>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;">SEMESTER</div>
              <div>${esc(r.semester)}</div>
            </div>
          </div>
        </div>

        <!-- Validation Summary Checklist -->
        <div class="card-box" style="margin-bottom:16px;padding:12px;">
          <div style="font-weight:700;font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Validation Checklist</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12.5px;">
            ${checks.map(c => `
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:13px;color:${c.pass ? "var(--brand-success)" : "var(--brand-danger)"};">${c.pass ? "✓" : "✕"}</span>
                <span style="color:${c.pass ? "var(--text-main)" : "var(--brand-danger)"};font-weight:${c.pass ? "500" : "700"};">${c.name}</span>
                ${c.desc ? `<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">(${c.desc})</span>` : ""}
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Issues -->
        ${issues.length > 0 ? `
        <div style="background:rgba(234,179,8,0.08);border:1px solid var(--accent-gold-bg);border-radius:8px;padding:12px 16px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;color:var(--accent-gold-txt);margin-bottom:6px;">⚠ Validation Issues</div>
          <ul style="margin:0;padding-left:16px;font-size:12.5px;color:var(--text-sub);">
            ${issues.map(i => `<li>${esc(i)}</li>`).join("")}
          </ul>
        </div>` : `
        <div style="background:rgba(34,197,94,0.08);border:1px solid var(--accent-green-bg);border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:var(--accent-green-txt);">
          ✓ No validation issues found for this record.
        </div>`}

        <!-- Calculated Values -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
          ${[["SGPA", r.sgpa?.toFixed(2) || "—"], ["Percentage", r.percentage?.toFixed(2)+"%"], ["Credits", r.totalCredits], ["Backlogs", r.backlogCount]].map(([l,v]) => `
            <div style="text-align:center;padding:10px;background:var(--bg-muted);border-radius:8px;">
              <div style="font-size:16px;font-weight:800;color:var(--text-main);">${v}</div>
              <div style="font-size:9px;color:var(--text-muted);font-weight:600;">${l}</div>
            </div>`).join("")}
        </div>

        <!-- Subject Table -->
        <div style="font-weight:700;font-size:13px;margin-bottom:8px;">Subject Results</div>
        <div style="overflow-x:auto;max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;margin-bottom:8px;">
          <table class="data-table" id="editSubjectsTable" style="font-size:12px;width:100%;margin:0;">
            <thead><tr><th>#</th><th>Code</th><th>Name</th><th>Cr</th><th>Int</th><th>Ext</th><th>Grd</th><th></th></tr></thead>
            <tbody id="editSubjectRows">
              ${(r.subjects || []).map((s, idx) => buildSubjectRow(s, idx)).join("")}
            </tbody>
          </table>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-bottom:16px;" onclick="addSubjectRow()">+ Add Subject</button>
      </div>

    </div>

    <!-- Paging and Footer Controls -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color);flex-wrap:wrap;gap:12px;">
      <div style="display:flex;gap:8px;">
        ${prevBtn}
        ${nextBtn}
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="closeModal('recordEditorModal')">Close</button>
        <button class="btn btn-ghost" onclick="saveRecordDraft()">Save Draft</button>
        <button class="btn btn-primary" onclick="saveAndVerify()">Mark as Verified ✓</button>
      </div>
    </div>`;
}
}

function buildSubjectRow(s, idx) {
  const grades = ["S","A","B","C","D","E","F","Ab"];
  return `<tr id="subj-row-${idx}" data-idx="${idx}">
    <td style="color:var(--text-muted);">${idx+1}</td>
    <td><input value="${esc(s.code||"")}" class="subj-code" data-idx="${idx}" style="width:80px;" placeholder="Code"/></td>
    <td><input value="${esc(s.name||"")}" class="subj-name" data-idx="${idx}" style="width:180px;" placeholder="Subject Name"/></td>
    <td><input type="number" value="${s.credits||3}" class="subj-credits" data-idx="${idx}" style="width:55px;" min="1" max="6"/></td>
    <td><input type="number" value="${s.internalMarks!=null?s.internalMarks:""}" class="subj-int" data-idx="${idx}" style="width:55px;" placeholder="—"/></td>
    <td><input type="number" value="${s.externalMarks!=null?s.externalMarks:""}" class="subj-ext" data-idx="${idx}" style="width:55px;" placeholder="—"/></td>
    <td><select class="subj-grade" data-idx="${idx}" style="width:60px;">${grades.map(g => `<option value="${g}"${g===s.grade?" selected":""}>${g}</option>`).join("")}</select></td>
    <td class="subj-gp-${idx}">${s.gradePoint||0}</td>
    <td><button onclick="removeSubjectRow(${idx})" style="background:none;border:none;cursor:pointer;color:var(--accent-rose-txt);">✕</button></td>
  </tr>`;
}

function addSubjectRow() {
  const tbody = document.getElementById("editSubjectRows");
  if (!tbody) return;
  const idx = tbody.querySelectorAll("tr").length;
  const newRow = document.createElement("tr");
  newRow.id = `subj-row-${idx}`;
  newRow.dataset.idx = idx;
  const grades = ["S","A","B","C","D","E","F","Ab"];
  newRow.innerHTML = `
    <td style="color:var(--text-muted);">${idx+1}</td>
    <td><input value="" class="subj-code" data-idx="${idx}" style="width:80px;" placeholder="Code"/></td>
    <td><input value="" class="subj-name" data-idx="${idx}" style="width:180px;" placeholder="Subject Name"/></td>
    <td><input type="number" value="3" class="subj-credits" data-idx="${idx}" style="width:55px;" min="1" max="6"/></td>
    <td><input type="number" value="" class="subj-int" data-idx="${idx}" style="width:55px;" placeholder="—"/></td>
    <td><input type="number" value="" class="subj-ext" data-idx="${idx}" style="width:55px;" placeholder="—"/></td>
    <td><select class="subj-grade" data-idx="${idx}" style="width:60px;">${grades.map(g => `<option value="${g}">${g}</option>`).join("")}</select></td>
    <td class="subj-gp-${idx}">0</td>
    <td><button onclick="removeSubjectRow(${idx})" style="background:none;border:none;cursor:pointer;color:var(--accent-rose-txt);">✕</button></td>`;
  tbody.appendChild(newRow);
}
window.addSubjectRow = addSubjectRow;

function removeSubjectRow(idx) {
  document.getElementById(`subj-row-${idx}`)?.remove();
}
window.removeSubjectRow = removeSubjectRow;

function collectSubjectsFromEditor() {
  const GRADE_POINTS = { S:10, A:9, B:8, C:7, D:6, E:5, F:0, Ab:0 };
  const rows = document.querySelectorAll("#editSubjectRows tr");
  return Array.from(rows).map(row => {
    const idx = row.dataset.idx;
    const grade = row.querySelector(`.subj-grade`)?.value || "F";
    const credits = parseFloat(row.querySelector(`.subj-credits`)?.value) || 3;
    const gradePoint = GRADE_POINTS[grade] !== undefined ? GRADE_POINTS[grade] : 0;
    const intV = row.querySelector(`.subj-int`)?.value;
    const extV = row.querySelector(`.subj-ext`)?.value;
    return {
      code: row.querySelector(`.subj-code`)?.value?.trim() || "",
      name: row.querySelector(`.subj-name`)?.value?.trim() || "Subject",
      credits,
      internalMarks: intV !== "" && intV != null ? parseFloat(intV) : null,
      externalMarks: extV !== "" && extV != null ? parseFloat(extV) : null,
      grade,
      gradePoint,
      passed: grade !== "F" && grade !== "Ab",
    };
  });
}

async function saveRecordDraft() {
  if (!_editingResultId) return;
  const payload = {
    studentName: document.getElementById("editName")?.value?.trim() || "",
    subjects: collectSubjectsFromEditor(),
  };
  try {
    const uploadId = _editingResultData?.uploadId || _reviewUploadId;
    const res = await adminFetch(`/api/admin/upload/${uploadId}/result/${_editingResultId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    alert("Draft saved. " + (res.message || ""));
    loadReviewRecords();
  } catch(e) {
    alert("Save failed: " + e.message);
  }
}
window.saveRecordDraft = saveRecordDraft;

async function saveAndVerify() {
  if (!_editingResultId) return;
  const uploadId = _editingResultData?.uploadId || _reviewUploadId;
  const payload = {
    studentName: document.getElementById("editName")?.value?.trim() || "",
    subjects: collectSubjectsFromEditor(),
  };
  try {
    await adminFetch(`/api/admin/upload/${uploadId}/result/${_editingResultId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await adminFetch(`/api/admin/results/${_editingResultId}/verify`, { method: "POST" });
    alert(res.message || "Verified!");
    closeModal("recordEditorModal");
    loadReviewRecords();
  } catch(e) {
    alert("Verify failed: " + e.message);
  }
}
window.saveAndVerify = saveAndVerify;

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

    const reconciled = data.studentCount === (data.validCount + data.needsReviewCount);
    const hasReview = data.needsReviewCount > 0;
    msg.innerHTML = `<div class="alert alert-${!reconciled ? "error" : hasReview ? "warning" : "success"}" style="background:var(--bg-muted);border:1px solid var(--border-color);border-radius:10px;padding:16px;">
      <div style="font-weight:700;margin-bottom:8px;">${!reconciled ? "⚠ Reconciliation Discrepancy Detected" : hasReview ? "⚠ Processing complete — review needed" : "✅ Processing complete"}</div>
      <div style="font-size:13px;color:var(--text-sub);">
        Total: <strong>${data.studentCount}</strong> &nbsp;|&nbsp;
        Valid: <strong style="color:var(--accent-green-txt);">${data.validCount}</strong> &nbsp;|&nbsp;
        Needs Review: <strong style="color:var(--accent-gold-txt);">${data.needsReviewCount}</strong>
        ${data.duplicateCount > 0 ? ` &nbsp;|&nbsp; Duplicates: <strong style="color:var(--accent-rose-txt);">${data.duplicateCount}</strong>` : ""}
      </div>
      ${!reconciled ? `<div style="font-size:12px;color:var(--brand-danger);margin-top:8px;font-weight:600;">✕ Warning: Total detected students does not equal Valid + Needs Review count.</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        ${hasReview ? `<button class="btn btn-ghost btn-sm" onclick="openReviewModal('${data.uploadId}')">Review ${data.needsReviewCount} records</button>` : ""}
        <button class="btn btn-primary btn-sm" ${!reconciled ? "disabled title='Cannot publish with reconciliation error'" : ""} onclick="confirmPublish('${data.uploadId}', ${data.needsReviewCount})">Publish Valid Records</button>
      </div>
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
      <div class="card-box" style="margin-bottom:24px;padding:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:12px;">Analytics Filters</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px;align-items:end;">
          <div><label class="field-label">Semester</label><select id="anSem" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="1-1">1-1</option><option value="1-2">1-2</option><option value="2-1">2-1</option><option value="2-2">2-2</option><option value="3-1">3-1</option><option value="3-2">3-2</option><option value="4-1">4-1</option><option value="4-2">4-2</option></select></div>
          <div><label class="field-label">Regulation</label><select id="anReg" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="R23">R23</option><option value="R20">R20</option></select></div>
          <div><label class="field-label">Department</label><input id="anDept" class="field-input" placeholder="e.g. CSE" onchange="loadAnalytics()"/></div>
          <div><label class="field-label">Admission Type</label><select id="anAdmType" class="field-input" onchange="loadAnalytics()"><option value="">All</option><option value="Regular Entry">Regular Entry</option><option value="Lateral Entry">Lateral Entry</option></select></div>
          <div><label class="field-label">Exam Session</label><input id="anSession" class="field-input" placeholder="e.g. April 2026" onchange="loadAnalytics()"/></div>
          <div><button class="btn btn-ghost btn-sm" onclick="clearAnalyticsFilters()" style="width:100%;">Reset Filters</button></div>
        </div>
      </div>

      <!-- Redesigned Overview KPIs -->
      <div class="kpi-row" style="margin-bottom:28px;display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;">
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Total Student Results</span></div>
          <div class="metric-value">${data.total || 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Pass Rate</span></div>
          <div class="metric-value" style="color:var(--brand-success);">${fmtPct(data.passPercentage)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Average SGPA</span></div>
          <div class="metric-value">${fmt2(data.averageSgpa)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Total Backlogs</span></div>
          <div class="metric-value" style="color:var(--brand-danger);">${data.totalBacklogs || 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Highest / Lowest SGPA</span></div>
          <div class="metric-value" style="font-size:1.4rem;">${fmt2(data.highestSgpa)} / ${fmt2(data.lowestSgpa)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Standing (Imp / Dec)</span></div>
          <div class="metric-value" style="font-size:1.4rem;">
            <span style="color:var(--brand-success);">↑${data.improvedCount || 0}</span> / 
            <span style="color:var(--brand-danger);">↓${data.declinedCount || 0}</span>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><span class="metric-label">Students At Risk</span></div>
          <div class="metric-value" style="color:var(--brand-warning);">${data.atRiskCount || 0}</div>
        </div>
      </div>

      <!-- Department & Regular vs LE Breakdown -->
      <div class="card-box" style="margin-bottom:24px;">
        <div class="card-title">Department &amp; Entry Type Breakdown</div>
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
      <div class="card-box" style="margin-bottom:24px;">
        <div class="card-title">Subject Performance Analysis</div>
        ${(data.subjectStats||[]).length === 0 ? '<p class="empty-sub">No subject statistics available.</p>' : `
        <table class="data-table">
          <thead><tr><th>Subject Code</th><th>Subject Name</th><th>Total Enrolled</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
          <tbody>${data.subjectStats.map(s=>`<tr>
            <td><code>${esc(s._id.code||"—")}</code></td>
            <td>${esc(s._id.name)}</td>
            <td>${s.total}</td>
            <td><span class="text-success">${s.passed}</span></td>
            <td><span class="${s.failed>0?"text-danger":""}">${s.failed}</span></td>
            <td><span class="badge ${s.passRate>=75?"badge-pass":s.passRate>=50?"badge-warning":"badge-fail"}">${fmtPct(s.passRate)}</span></td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <!-- Backlog Analysis -->
      <div class="card-box" style="margin-bottom:24px;">
        <div class="card-title">Students with Active Backlogs</div>
        ${(data.backlogStudents||[]).length === 0 ? '<p class="empty-sub">🎉 No active backlog records found!</p>' : `
        <table class="data-table">
          <thead><tr><th>Roll Number</th><th>Student Name</th><th>Department</th><th>Semester</th><th>Backlog Count</th><th>Failed Subjects</th></tr></thead>
          <tbody>${data.backlogStudents.map(b=>`<tr>
            <td><button class="btn btn-ghost btn-sm" onclick="openStudentProfile('${b.rollNumber}')" style="padding:2px 6px;"><code>${esc(b.rollNumber)}</code></button></td>
            <td>${esc(b.studentName||"—")}</td>
            <td>${esc(b.department||"—")}</td>
            <td>${esc(b.semester)}</td>
            <td><span class="badge badge-fail">${b.backlogCount}</span></td>
            <td>${(b.failedSubjects||[]).map(esc).join(", ")||"—"}</td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <!-- Student Improvement Tracking -->
      <div class="card-box" style="margin-bottom:24px;">
        <div class="card-title">Student Semester Improvement Standings</div>
        ${(data.studentImprovement||[]).length === 0 ? '<p class="empty-sub">Improvement comparison will appear when historical semester results exist.</p>' : `
        <table class="data-table">
          <thead><tr><th>Roll Number</th><th>Student Name</th><th>Dept</th><th>Prev Sem (${esc(data.studentImprovement[0]?.prevSem||"")})</th><th>Latest Sem (${esc(data.studentImprovement[0]?.latestSem||"")})</th><th>SGPA Improvement</th></tr></thead>
          <tbody>${data.studentImprovement.map(i=>`<tr>
            <td><button class="btn btn-ghost btn-sm" onclick="openStudentProfile('${i.rollNumber}')" style="padding:2px 6px;"><code>${esc(i.rollNumber)}</code></button></td>
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
