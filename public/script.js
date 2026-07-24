const GRADES = ["S", "A", "B", "C", "D", "E", "F", "Ab"];

const subjectBody = document.getElementById("subjectBody");
const rollInput   = document.getElementById("rollNumber");
const lookupRoll  = document.getElementById("lookupRoll");

let currentStudent = null;

/* ---------- Subject rows ---------- */

function addRow(subject = "", credits = "", grade = "A") {
  const idx = subjectBody.children.length + 1;
  const tr  = document.createElement("tr");
  tr.innerHTML = `
    <td class="row-num">${idx}</td>
    <td><input type="text" class="s-subject" placeholder="e.g. Data Structures" value="${escapeAttr(subject)}" /></td>
    <td><input type="number" class="s-credits" min="0" step="0.5" placeholder="3" value="${escapeAttr(credits)}" /></td>
    <td>
      <select class="s-grade">
        ${GRADES.map((g) => `<option value="${g}" ${g === grade ? "selected" : ""}>${g}</option>`).join("")}
      </select>
    </td>
    <td><button type="button" class="icon-btn remove-row" title="Remove subject">&times;</button></td>
  `;
  subjectBody.appendChild(tr);
  tr.querySelector(".remove-row").addEventListener("click", () => {
    tr.remove();
    renumberRows();
  });
}

function renumberRows() {
  [...subjectBody.children].forEach((tr, i) => {
    tr.querySelector(".row-num").textContent = i + 1;
  });
}

function escapeAttr(v) {
  return String(v).replace(/"/g, "&quot;");
}

function collectSubjects() {
  return [...subjectBody.children].map((tr) => ({
    subject: tr.querySelector(".s-subject").value.trim(),
    credits: tr.querySelector(".s-credits").value,
    grade:   tr.querySelector(".s-grade").value,
  }));
}

function clearRows() { subjectBody.innerHTML = ""; }

document.getElementById("addRowBtn").addEventListener("click", () => addRow());
for (let i = 0; i < 6; i++) addRow();

/* ---------- Messaging helper ---------- */

function setMsg(el, text, kind) {
  el.textContent = text;
  el.className = "msg" + (kind ? " " + kind : "");
}

/* ---------- CGPA calculation (client-side) ---------- */

function deriveCgpa(semesters) {
  let totalCredits = 0, weighted = 0;
  for (const s of semesters || []) {
    totalCredits += s.credits;
    weighted     += s.credits * s.sgpa;
  }
  if (!totalCredits) return null;
  const cgpa       = Math.round((weighted / totalCredits) * 100) / 100;
  // JNTUK R23 formula
  const percentage = Math.round((cgpa - 0.75) * 10 * 100) / 100;
  return { cgpa, percentage };
}

/* ---------- Seal stamp ---------- */

function stampSeal(sealId, valueId, value) {
  const seal = document.getElementById(sealId);
  document.getElementById(valueId).textContent = value != null ? value : "\u2014";
  seal.classList.remove("stamped");
  void seal.offsetWidth;
  seal.classList.add("stamped");
}

function updateCgpaDisplay(cgpa, percentage) {
  if (cgpa != null) {
    stampSeal("cgpaSeal", "cgpaValue", cgpa);
    document.getElementById("percentCaption").textContent = `Overall \u00b7 ${percentage}%`;
  } else {
    document.getElementById("cgpaValue").textContent = "\u2014";
    document.getElementById("cgpaSeal").classList.remove("stamped");
    document.getElementById("percentCaption").textContent = "Overall";
  }
}

/* ---------- Profile save ---------- */

document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  const msgEl = document.getElementById("profileMsg");
  const body  = {
    name:       document.getElementById("name").value.trim(),
    rollNumber: rollInput.value.trim().toUpperCase(),
    dept:       document.getElementById("dept").value,
    phone:      document.getElementById("phone").value.trim(),
    email:      document.getElementById("email").value.trim(),
  };
  if (!body.name || !body.rollNumber || !body.phone) {
    setMsg(msgEl, "Name, roll number and phone are required.", "err"); return;
  }
  if (!/^\d{10}$/.test(body.phone)) {
    setMsg(msgEl, "Phone number must be exactly 10 digits.", "err"); return;
  }
  try {
    const res  = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    currentStudent = data;
    setMsg(msgEl, "Saved. You can now enter semester marks below.", "ok");
    updateCgpaDisplay(data.cgpa ?? null, data.percentage ?? null);
    renderHistory(currentStudent);
  } catch (err) {
    setMsg(msgEl, err.message, "err");
  }
});

/* ---------- Calculate & save semester ---------- */

document.getElementById("calcBtn").addEventListener("click", async () => {
  const msgEl   = document.getElementById("semMsg");
  const roll    = rollInput.value.trim().toUpperCase();
  if (!roll) { setMsg(msgEl, "Enter and save the student's roll number first.", "err"); return; }
  const semester = document.getElementById("semester").value;
  const subjects = collectSubjects().filter((s) => s.subject);
  if (!subjects.length) { setMsg(msgEl, "Add at least one subject.", "err"); return; }
  for (const s of subjects) {
    if (s.credits === "" || Number.isNaN(Number(s.credits))) {
      setMsg(msgEl, `Enter valid credits for "${s.subject}".`, "err"); return;
    }
  }
  try {
    const res  = await fetch(`/api/students/${encodeURIComponent(roll)}/semester`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semester, subjects }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Calculation failed");
    setMsg(msgEl, `Saved ${semester} for ${roll}.`, "ok");
    stampSeal("sgpaSeal", "sgpaValue", data.sgpa);
    updateCgpaDisplay(data.cgpa ?? null, data.percentage ?? null);
    currentStudent = data.student;
    renderHistory(currentStudent);
  } catch (err) {
    setMsg(msgEl, err.message, "err");
  }
});

/* ---------- Lookup existing student ---------- */

document.getElementById("lookupBtn").addEventListener("click", async () => {
  const msgEl = document.getElementById("lookupMsg");
  const roll  = lookupRoll.value.trim().toUpperCase();
  if (!roll) { setMsg(msgEl, "Enter a roll number to look up.", "err"); return; }
  try {
    const res  = await fetch(`/api/students/${encodeURIComponent(roll)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Not found");
    currentStudent = data;
    populateForm(data);
    setMsg(msgEl, `Loaded record for ${data.name}.`, "ok");
  } catch (err) {
    setMsg(msgEl, err.message, "err");
  }
});

document.getElementById("newBtn").addEventListener("click", () => {
  currentStudent = null;
  document.getElementById("name").value  = "";
  rollInput.value = "";
  document.getElementById("phone").value = "";
  document.getElementById("email").value = "";
  document.getElementById("dept").value  = "CSM";
  lookupRoll.value = "";
  clearRows();
  for (let i = 0; i < 6; i++) addRow();
  document.getElementById("sgpaValue").textContent = "\u2014";
  document.getElementById("cgpaValue").textContent = "\u2014";
  document.getElementById("percentCaption").textContent = "Overall";
  document.getElementById("sgpaSeal").classList.remove("stamped");
  document.getElementById("cgpaSeal").classList.remove("stamped");
  document.getElementById("historyCard").style.display = "none";
  setMsg(document.getElementById("lookupMsg"), "Started a blank record.", "ok");
});

function populateForm(student) {
  document.getElementById("name").value  = student.name  || "";
  rollInput.value = student.rollNumber || "";
  document.getElementById("dept").value  = student.dept  || "CSM";
  document.getElementById("phone").value = student.phone || "";
  document.getElementById("email").value = student.email || "";
  const cgpa       = student.cgpa       ?? (deriveCgpa(student.semesters || {}) || {}).cgpa       ?? null;
  const percentage = student.percentage ?? (deriveCgpa(student.semesters || {}) || {}).percentage ?? null;
  updateCgpaDisplay(cgpa, percentage);
  renderHistory(student);
}

/* ---------- History table ---------- */

function renderHistory(student) {
  const card   = document.getElementById("historyCard");
  const body   = document.getElementById("historyBody");
  const nameEl = document.getElementById("historyName");
  if (!student || !student.semesters || !student.semesters.length) {
    card.style.display = "none"; return;
  }
  card.style.display = "";
  nameEl.textContent = `${student.name} (${student.rollNumber})`;
  body.innerHTML = "";

  const sorted = [...student.semesters].sort((a, b) => a.semester.localeCompare(b.semester));
  let runC = 0, runW = 0;

  for (const sem of sorted) {
    runC += sem.credits;
    runW += sem.credits * sem.sgpa;
    const runCgpa = runC > 0 ? Math.round((runW / runC) * 100) / 100 : null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sem.semester}</td>
      <td>${sem.credits}</td>
      <td class="sgpa-cell">${sem.sgpa}</td>
      <td class="cgpa-cell">${runCgpa !== null ? runCgpa : "\u2014"}</td>
      <td><button type="button" class="icon-btn del-sem" title="Delete semester">&times;</button></td>
    `;
    tr.querySelector(".del-sem").addEventListener("click", () =>
      deleteSemester(student.rollNumber, sem.semester)
    );
    body.appendChild(tr);
  }

  const finalCgpa = runC > 0 ? Math.round((runW / runC) * 100) / 100 : null;
  const finalPct  = finalCgpa != null ? Math.round((finalCgpa - 0.75) * 10 * 100) / 100 : null;
  if (finalCgpa != null) {
    const tr = document.createElement("tr");
    tr.className = "summary-row";
    tr.innerHTML = `
      <td colspan="2"><strong>CGPA (${sorted.length} sem${sorted.length > 1 ? "s" : ""})</strong></td>
      <td></td>
      <td class="cgpa-cell"><strong>${finalCgpa}</strong> <span class="pct-badge">${finalPct}%</span></td>
      <td></td>
    `;
    body.appendChild(tr);
  }
}

async function deleteSemester(rollNumber, semester) {
  if (!confirm(`Delete ${semester} record for ${rollNumber}?`)) return;
  try {
    const res  = await fetch(
      `/api/students/${encodeURIComponent(rollNumber)}/semester/${encodeURIComponent(semester)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed");
    currentStudent = data;
    renderHistory(currentStudent);
    updateCgpaDisplay(data.cgpa ?? null, data.percentage ?? null);
  } catch (err) {
    alert(err.message);
  }
}
