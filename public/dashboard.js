/* ── Auth guard ── */
const token = localStorage.getItem("sgpa_token");
const userJson = localStorage.getItem("sgpa_user");
if (!token || !userJson) {
  window.location.href = "login.html";
}
const currentUser = JSON.parse(userJson || "{}");

/* ── Helpers ── */
const GRADES = ["S", "A", "B", "C", "D", "E", "F", "Ab"];
const RING_CIRC = 314; // 2π × 50

function apiHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function setMsg(el, text, kind) {
  el.textContent = text;
  el.className = "msg" + (kind ? " " + kind : "");
}

function escAttr(v) {
  return String(v).replace(/"/g, "&quot;");
}

function deriveCgpa(semesters) {
  let tc = 0, tw = 0;
  for (const s of semesters || []) { tc += s.credits; tw += s.credits * s.sgpa; }
  if (!tc) return null;
  const cgpa = Math.round((tw / tc) * 100) / 100;
  // JNTUK R23 percentage formula: (cgpa - 0.75) * 10
  const pct = Math.round((cgpa - 0.75) * 10 * 100) / 100;
  return { cgpa, pct };
}

/* ── Topbar / logout ── */
document.getElementById("topbarUser").textContent =
  currentUser.rollNumber ? `${currentUser.rollNumber}` : "";

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("sgpa_token");
  localStorage.removeItem("sgpa_user");
  window.location.href = "login.html";
});

/* ── Inject SVG gradient for ring ── */
const svgNS = "http://www.w3.org/2000/svg";
const ringSvg = document.querySelector(".cgpa-ring");
const defs = document.createElementNS(svgNS, "defs");
defs.innerHTML = `
  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#60A5FA"/>
    <stop offset="100%" stop-color="#A78BFA"/>
  </linearGradient>`;
ringSvg.prepend(defs);

/* ── CGPA ring update ── */
function updateCgpaRing(cgpa, pct) {
  const cgpaEl = document.getElementById("sidebarCgpa");
  const pctEl  = document.getElementById("sidebarPct");
  const fill   = document.getElementById("ringFill");

  if (cgpa == null) {
    cgpaEl.textContent = "—";
    pctEl.textContent  = "";
    fill.style.strokeDashoffset = RING_CIRC;
    return;
  }
  cgpaEl.textContent = cgpa;
  pctEl.textContent  = `${pct}%`;
  const offset = RING_CIRC - (cgpa / 10) * RING_CIRC;
  fill.style.strokeDashoffset = offset.toFixed(1);
}

/* ── Sidebar student info ── */
function updateSidebarInfo(student) {
  const name = student.name || currentUser.name || "";
  document.getElementById("sidebarName").textContent = name;
  document.getElementById("sidebarRoll").textContent =
    student.rollNumber || currentUser.rollNumber || "";
  document.getElementById("sidebarDept").textContent =
    student.dept || currentUser.dept || "";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("avatarCircle").textContent = initials || "?";
}

/* ── Sidebar SGPA list ── */
function updateSgpaList(semesters) {
  const list = document.getElementById("sgpaList");
  if (!semesters || !semesters.length) {
    list.innerHTML = '<div class="sgpa-empty">No semesters yet</div>';
    return;
  }
  const sorted = [...semesters].sort((a, b) => a.semester.localeCompare(b.semester));
  list.innerHTML = sorted.map((s) => {
    const barWidth = ((s.sgpa / 10) * 100).toFixed(1);
    return `<div class="sgpa-item">
      <span class="sgpa-sem">${s.semester}</span>
      <div class="sgpa-bar-wrap"><div class="sgpa-bar" style="width:${barWidth}%"></div></div>
      <span class="sgpa-val">${s.sgpa}</span>
    </div>`;
  }).join("");
}

/* ── Refresh all sidebar ── */
function refreshSidebar(student) {
  updateSidebarInfo(student);
  updateSgpaList(student.semesters || []);
  const d = deriveCgpa(student.semesters);
  updateCgpaRing(d ? d.cgpa : null, d ? d.pct : null);
}

/* ── Subject rows ── */
const subjectBody = document.getElementById("subjectBody");

function addRow(subject = "", credits = "", grade = "A") {
  const idx = subjectBody.children.length + 1;
  const tr  = document.createElement("tr");
  tr.innerHTML = `
    <td class="col-num row-num">${idx}</td>
    <td><input type="text" class="s-input s-subject" placeholder="Subject name" value="${escAttr(subject)}"/></td>
    <td><input type="number" class="s-input s-credits" min="0" step="0.5" placeholder="3" value="${escAttr(credits)}"/></td>
    <td>
      <select class="s-input s-grade">
        ${GRADES.map((g) => `<option value="${g}" ${g === grade ? "selected" : ""}>${g}</option>`).join("")}
      </select>
    </td>
    <td><button type="button" class="icon-btn remove-row" title="Remove">&times;</button></td>
  `;
  subjectBody.appendChild(tr);
  tr.querySelector(".remove-row").addEventListener("click", () => {
    tr.remove();
    renumber();
  });
}

function renumber() {
  [...subjectBody.children].forEach((tr, i) => {
    tr.querySelector(".row-num").textContent = i + 1;
  });
}

function collectSubjects() {
  return [...subjectBody.children].map((tr) => ({
    subject: tr.querySelector(".s-subject").value.trim(),
    credits: tr.querySelector(".s-credits").value,
    grade:   tr.querySelector(".s-grade").value,
  }));
}

document.getElementById("addRowBtn").addEventListener("click", () => addRow());
for (let i = 0; i < 6; i++) addRow();

/* ── Calculate & Save ── */
document.getElementById("calcBtn").addEventListener("click", async () => {
  const msgEl    = document.getElementById("semMsg");
  const semester = document.getElementById("semester").value;
  const subjects = collectSubjects().filter((s) => s.subject);

  if (!subjects.length) { setMsg(msgEl, "Add at least one subject.", "err"); return; }
  for (const s of subjects) {
    if (s.credits === "" || Number.isNaN(Number(s.credits))) {
      setMsg(msgEl, `Enter valid credits for "${s.subject}".`, "err"); return;
    }
  }

  setMsg(msgEl, "Saving…", "");
  try {
    const res = await fetch("/api/student/semester", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ semester, subjects }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { window.location.href = "login.html"; return; }
      throw new Error(data.error || "Save failed");
    }
    setMsg(msgEl, `✓ Saved ${semester}`, "ok");
    // Use JNTUK formula for banner percentage too
    const pct = data.cgpa != null ? Math.round((data.cgpa - 0.75) * 10 * 100) / 100 : null;
    showResultBanner(data.sgpa, data.cgpa, pct ?? data.percentage);
    refreshSidebar(data.student);
    renderHistory(data.student);
  } catch (err) {
    setMsg(msgEl, err.message, "err");
  }
});

/* ── Result banner ── */
function showResultBanner(sgpa, cgpa, pct) {
  const banner = document.getElementById("resultBanner");
  document.getElementById("bannerSgpa").textContent = sgpa ?? "—";
  document.getElementById("bannerCgpa").textContent = cgpa ?? "—";
  document.getElementById("bannerPct").textContent  = pct != null ? `${pct}%` : "—";
  banner.classList.remove("hidden");
}

/* ── History table ── */
function renderHistory(student) {
  const panel = document.getElementById("historyPanel");
  const body  = document.getElementById("historyBody");
  const sems  = student?.semesters || [];

  if (!sems.length) { panel.style.display = "none"; return; }
  panel.style.display = "";
  body.innerHTML = "";

  const sorted = [...sems].sort((a, b) => a.semester.localeCompare(b.semester));
  let runC = 0, runW = 0;

  for (const sem of sorted) {
    runC += sem.credits;
    runW += sem.credits * sem.sgpa;
    const runCgpa = runC > 0 ? Math.round((runW / runC) * 100) / 100 : null;
    // JNTUK R23: percentage = (cgpa - 0.75) * 10
    const runPct  = runCgpa != null ? Math.round((runCgpa - 0.75) * 10 * 100) / 100 : null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="td-sem">${sem.semester}</td>
      <td>${sem.credits}</td>
      <td class="td-sgpa">${sem.sgpa}</td>
      <td class="td-cgpa">${runCgpa ?? "—"}</td>
      <td class="td-pct">${runPct != null ? runPct + "%" : "—"}</td>
      <td><button class="icon-btn del-sem" title="Delete semester">&times;</button></td>
    `;
    tr.querySelector(".del-sem").addEventListener("click", () =>
      deleteSemester(sem.semester)
    );
    body.appendChild(tr);
  }

  // Summary row
  const finalCgpa = runC > 0 ? Math.round((runW / runC) * 100) / 100 : null;
  const finalPct  = finalCgpa != null ? Math.round((finalCgpa - 0.75) * 10 * 100) / 100 : null;
  if (finalCgpa != null) {
    const tr = document.createElement("tr");
    tr.className = "summary-row";
    tr.innerHTML = `
      <td colspan="2"><strong>Overall (${sorted.length} sem${sorted.length > 1 ? "s" : ""})</strong></td>
      <td></td>
      <td class="td-cgpa"><strong>${finalCgpa}</strong></td>
      <td class="td-pct"><strong>${finalPct}%</strong></td>
      <td></td>
    `;
    body.appendChild(tr);
  }
}

/* ── Delete semester ── */
async function deleteSemester(semester) {
  if (!confirm(`Delete semester ${semester}?`)) return;
  try {
    const res = await fetch(
      `/api/student/semester/${encodeURIComponent(semester)}`,
      { method: "DELETE", headers: apiHeaders() }
    );
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { window.location.href = "login.html"; return; }
      throw new Error(data.error || "Delete failed");
    }
    refreshSidebar(data);
    renderHistory(data);
    const d = deriveCgpa(data.semesters);
    if (!d) document.getElementById("resultBanner").classList.add("hidden");
  } catch (err) {
    alert(err.message);
  }
}

/* ── Initial load ── */
async function loadStudent() {
  try {
    const res = await fetch("/api/student", { headers: apiHeaders() });
    if (res.status === 401) { window.location.href = "login.html"; return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    refreshSidebar(data);
    renderHistory(data);
    if (data.cgpa != null) {
      const pct = Math.round((data.cgpa - 0.75) * 10 * 100) / 100;
      showResultBanner(null, data.cgpa, pct);
      document.getElementById("bannerSgpa").textContent = "—";
    }
  } catch (err) {
    console.error("Failed to load student:", err.message);
  }
}

loadStudent();
