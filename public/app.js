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

function animateValue(id, start, end, duration, decimals = 2, isPct = false) {
  const obj = document.getElementById(id);
  if (!obj) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    obj.textContent = end != null ? (isPct ? `${Number(end).toFixed(decimals)}%` : Number(end).toFixed(decimals)) : "—";
    return;
  }
  if (end == null || isNaN(end)) {
    obj.textContent = "—";
    return;
  }
  const endNum = Number(end);
  const startNum = Number(start) || 0;
  if (startNum === endNum) {
    obj.textContent = isPct ? `${endNum.toFixed(decimals)}%` : (decimals === 0 ? endNum : endNum.toFixed(decimals));
    return;
  }
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const val = progress * (endNum - startNum) + startNum;
    obj.textContent = isPct ? `${val.toFixed(decimals)}%` : (decimals === 0 ? Math.floor(val) : val.toFixed(decimals));
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.textContent = isPct ? `${endNum.toFixed(decimals)}%` : (decimals === 0 ? endNum : endNum.toFixed(decimals));
    }
  };
  window.requestAnimationFrame(step);
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
    // Show skeleton layout in Latest Result Card while loading
    document.getElementById("latestResultBanner").innerHTML = `
      <div class="featured-result-card skeleton-box" style="height:220px;"></div>`;

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
    document.getElementById("welcomeMsg").textContent = `${greeting}, ${name.split(" ")[0]} 👋`;

    // Calculate metrics
    const sems = getApplicableSemesters(studentData);
    const cgpa = studentData.cgpa;
    const pct  = studentData.percentage;
    const latestSem = sems.length > 0 ? sems[sems.length - 1] : null;
    const backlogs  = sems.reduce((acc, s) => acc + (s.subjects || []).filter(sub => sub.grade === "F" || sub.grade === "Ab").length, 0);

    // Dynamic CGPA comparison trend calculation
    let cgpaTrendText = "Cumulative Index";
    if (sems.length > 1 && cgpa) {
      const prevSemCount = sems.length - 1;
      let prevCumulCred = 0, prevCumulPoints = 0;
      for (let i = 0; i < prevSemCount; i++) {
        prevCumulCred += sems[i].credits;
        prevCumulPoints += sems[i].credits * sems[i].sgpa;
      }
      const prevCgpa = prevCumulCred > 0 ? prevCumulPoints / prevCumulCred : 0;
      const diff = cgpa - prevCgpa;
      if (diff > 0) cgpaTrendText = `↑ ${diff.toFixed(2)} from previous sem`;
      else if (diff < 0) cgpaTrendText = `↓ ${Math.abs(diff).toFixed(2)} from previous sem`;
      else cgpaTrendText = "Same as previous sem";
    }

    // Update KPI card values & subtitles (with clean performance animations)
    const oldCgpa = parseFloat(document.getElementById("kpiCgpa")?.textContent) || 0;
    const oldSgpa = parseFloat(document.getElementById("kpiSgpa")?.textContent) || 0;
    const oldPct  = parseFloat(document.getElementById("kpiPct")?.textContent) || 0;
    const oldBack = parseInt(document.getElementById("kpiBacklogs")?.textContent) || 0;

    animateValue("kpiCgpa", oldCgpa, cgpa, 500, 2, false);
    animateValue("kpiSgpa", oldSgpa, latestSem ? latestSem.sgpa : null, 500, 2, false);
    animateValue("kpiPct", oldPct, pct, 500, 2, true);
    animateValue("kpiBacklogs", oldBack, backlogs, 500, 0, false);

    // Update subtitles/captions
    const kpiCards = document.getElementById("homeKpiGrid").querySelectorAll(".metric-card");
    if (kpiCards[0]) kpiCards[0].querySelector(".metric-footer").innerHTML = `<span>${cgpaTrendText}</span>`;
    if (kpiCards[1]) kpiCards[1].querySelector(".metric-footer").innerHTML = `<span>${latestSem ? `${latestSem.semester} Semester` : "No semesters added"}</span>`;
    if (kpiCards[2]) kpiCards[2].querySelector(".metric-footer").innerHTML = `<span>Based on JNTUK R23 formula</span>`;
    if (kpiCards[3]) kpiCards[3].querySelector(".metric-footer").innerHTML = `<span>${backlogs > 0 ? `⚠️ ${backlogs} backlogs pending` : "All clear 🎉"}</span>`;

    // Fetch published results
    let latestPubResult = null;
    try {
      const res = await apiFetch("/api/student/results");
      publishedResults = res.results || [];
      if (publishedResults.length > 0) {
        publishedResults.sort((a,b) => semOrd(a.semester) - semOrd(b.semester));
        latestPubResult = publishedResults[publishedResults.length - 1];
        renderLatestFeaturedResult(latestPubResult);
      } else {
        renderLatestManualResult(latestSem);
      }
    } catch(_) {
      renderLatestManualResult(latestSem);
    }

    // Render timeline nodes
    renderJourneyNodes(sems, publishedResults);

    // Dynamic Notifications
    populateDynamicNotifications(latestSem, latestPubResult, backlogs);

    // Health and Insights
    updateAcademicHealthAndInsights(sems, cgpa, pct, backlogs);

    // Target Planner
    recomputeTargetPlanner();

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
  const isPass = result.passed;
  const statusClass = isPass ? "badge-pass" : "badge-fail";
  const statusText  = isPass ? "PASS" : "FAIL";

  document.getElementById("latestResultBanner").innerHTML = `
    <div class="featured-result-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div>
          <div class="featured-badge">🎓 LATEST PUBLISHED RESULT</div>
          <div class="featured-title" style="font-size:1.6rem;">${esc(result.semester)} Semester</div>
          <div class="featured-sub">${esc(result.regulation||"R23")} • ${esc(result.examType||"Regular")} • ${esc(result.examSession||"")}</div>
        </div>
        <div>
          <span class="badge ${statusClass}" style="font-size:14px;padding:6px 16px;">${statusText}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:12px;background:rgba(255,255,255,0.1);padding:16px;border-radius:12px;margin-bottom:16px;backdrop-filter:blur(4px);">
        <div><div style="font-size:11px;color:#C7D2FE;text-transform:uppercase;font-weight:600;">SGPA</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${fmt2(result.sgpa)}</div></div>
        <div><div style="font-size:11px;color:#C7D2FE;text-transform:uppercase;font-weight:600;">Percentage</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${fmtPct(result.percentage)}</div></div>
        <div><div style="font-size:11px;color:#C7D2FE;text-transform:uppercase;font-weight:600;">Credits</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${result.totalCredits||0}</div></div>
        <div><div style="font-size:11px;color:#C7D2FE;text-transform:uppercase;font-weight:600;">Backlogs</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:${result.backlogCount>0?"#FCA5A5":"white"};">${result.backlogCount||0}</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <span style="font-size:12px;color:#C7D2FE;">Published ${timeAgo(result.publishedAt)}</span>
        <button class="btn btn-primary" style="background:white;color:#1E3A8A;font-weight:700;" onclick="openResultDetail('${result._id}')">View Full Result →</button>
      </div>
    </div>`;
}

function renderLatestManualResult(latestSem) {
  const banner = document.getElementById("latestResultBanner");
  if (!latestSem) {
    banner.innerHTML = `
      <div class="card-box" style="padding:32px;text-align:center;background:var(--bg-card);border:1px solid var(--border-color);">
        <div style="font-size:2.5rem;margin-bottom:8px;">🔔</div>
        <h3 class="card-title" style="justify-content:center;margin-bottom:4px;">No published results yet</h3>
        <p style="color:var(--text-sub);font-size:13px;max-width:380px;margin:0 auto;">Results published by your institution will automatically appear here matched to your roll number.</p>
      </div>`;
    return;
  }

  const pct = (latestSem.sgpa - 0.75) * 10;
  banner.innerHTML = `
    <div class="featured-result-card" style="background:linear-gradient(135deg, #4F46E5 0%, #3730A3 100%);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div>
          <div class="featured-badge" style="background:rgba(255,255,255,0.2);">📝 LATEST MANUAL ENTRY</div>
          <div class="featured-title" style="font-size:1.6rem;">${latestSem.semester} Semester</div>
          <div class="featured-sub">Manual record values</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:12px;background:rgba(255,255,255,0.1);padding:16px;border-radius:12px;margin-bottom:16px;backdrop-filter:blur(4px);">
        <div><div style="font-size:11px;color:#E0E7FF;text-transform:uppercase;font-weight:600;">SGPA</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${fmt2(latestSem.sgpa)}</div></div>
        <div><div style="font-size:11px;color:#E0E7FF;text-transform:uppercase;font-weight:600;">Percentage</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${fmtPct(pct)}</div></div>
        <div><div style="font-size:11px;color:#E0E7FF;text-transform:uppercase;font-weight:600;">Credits</div><div style="font-family:var(--font-head);font-size:1.4rem;font-weight:800;color:white;">${latestSem.credits||0}</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <span style="font-size:12px;color:#E0E7FF;">User Manual Grade Record</span>
        <button class="btn btn-primary" style="background:white;color:#312E81;font-weight:700;" onclick="switchTab('sgpa')">Manage Semesters →</button>
      </div>
    </div>`;
}

function renderJourneyNodes(manualSems, pubResults) {
  const row = document.getElementById("journeyNodeRow");
  if (!row) return;

  const userSemsMap = new Map(manualSems.map(s => [s.semester, s]));
  const pubSemsMap = new Map(pubResults.map(r => [r.semester, r]));
  
  const allCompletedSems = new Set([...userSemsMap.keys(), ...pubSemsMap.keys()]);
  const latestSem = [...allCompletedSems].sort((a,b) => semOrd(a) - semOrd(b)).pop();

  row.innerHTML = SEMESTERS_ALL.map(sem => {
    const isCompleted = allCompletedSems.has(sem);
    const isLatest    = sem === latestSem;
    let sgpaDisplay   = "";
    let cls = "";
    
    if (isLatest) cls = "active";
    else if (isCompleted) cls = "completed";

    if (pubSemsMap.has(sem)) {
      const pRes = pubSemsMap.get(sem);
      sgpaDisplay = `${fmt2(pRes.sgpa)} SGPA • ${pRes.totalCredits || 0} Cr`;
    } else if (userSemsMap.has(sem)) {
      const mRes = userSemsMap.get(sem);
      sgpaDisplay = `${fmt2(mRes.sgpa)} SGPA • ${mRes.credits || 0} Cr`;
    }

    return `
      <div class="journey-node ${cls}" style="animation-delay: ${SEMESTERS_ALL.indexOf(sem) * 60}ms;" onclick="handleJourneyNodeClick('${sem}')">
        <div class="journey-node-circle">${isLatest ? "●" : isCompleted ? "✓" : "○"}</div>
        <div class="journey-node-lbl">${sem}</div>
        ${sgpaDisplay ? `<div style="font-size:9.5px;color:var(--text-muted);font-weight:600;margin-top:2px;">${sgpaDisplay}</div>` : ""}
      </div>`;
  }).join("");
}

function handleJourneyNodeClick(sem) {
  // If exists in published results, open detail drawer
  const pub = publishedResults.find(r => r.semester === sem);
  if (pub) {
    openResultDetail(pub._id);
    return;
  }
  // Otherwise switch to SGPA manual management tab
  switchTab("sgpa");
}
window.handleJourneyNodeClick = handleJourneyNodeClick;

function populateDynamicNotifications(latestSem, latestPubResult, backlogCount) {
  const list = document.getElementById("notificationsList");
  if (!list) return;
  list.innerHTML = "";

  const alerts = [];
  if (latestPubResult) {
    alerts.push({
      title: `🎉 Result Published`,
      desc: `Your official ${latestPubResult.semester} Semester result sheet is available.`,
      cls: "background:var(--accent-green-bg);border-left:4px solid var(--brand-success);"
    });
  }
  if (backlogCount > 0) {
    alerts.push({
      title: `⚠️ Pending Backlogs`,
      desc: `You currently have ${backlogCount} pending backlog subjects.`,
      cls: "background:var(--accent-rose-bg);border-left:4px solid var(--brand-danger);"
    });
  } else if (latestSem || latestPubResult) {
    alerts.push({
      title: `✅ Academic Clearance`,
      desc: `All clear! Keep up the good work.`,
      cls: "background:var(--accent-blue-bg);border-left:4px solid var(--brand-primary);"
    });
  } else {
    alerts.push({
      title: `👋 Welcome to GradeWise`,
      desc: `Add your manual semesters or wait for your institution results.`,
      cls: "background:var(--bg-muted);border-left:4px solid var(--text-muted);"
    });
  }

  list.innerHTML = alerts.map(a => `
    <div style="padding:12px;border-radius:var(--radius-sm);font-size:13px;${a.cls}">
      <div style="font-weight:700;color:var(--text-main);">${esc(a.title)}</div>
      <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${esc(a.desc)}</div>
    </div>`).join("");
}

let _currentChartFilter = "both";
function updateHomeChartFilter(filter) {
  _currentChartFilter = filter;
  
  const sgpaBtn = document.getElementById("chartToggleSgpa");
  const cgpaBtn = document.getElementById("chartToggleCgpa");
  const bothBtn = document.getElementById("chartToggleBoth");

  if (sgpaBtn) {
    sgpaBtn.classList.toggle("active", filter === "sgpa");
    sgpaBtn.style.background = filter === "sgpa" ? "var(--bg-card)" : "none";
  }
  if (cgpaBtn) {
    cgpaBtn.classList.toggle("active", filter === "cgpa");
    cgpaBtn.style.background = filter === "cgpa" ? "var(--bg-card)" : "none";
  }
  if (bothBtn) {
    bothBtn.classList.toggle("active", filter === "both");
    bothBtn.style.background = filter === "both" ? "var(--bg-card)" : "none";
  }

  const sems = getApplicableSemesters(studentData);
  if (sems.length > 0) {
    renderHomeChart(sems);
  }
}
window.updateHomeChartFilter = updateHomeChartFilter;

function recomputeTargetPlanner() {
  if (!studentData) return;
  
  const sems = getApplicableSemesters(studentData);
  const completedCredits = sems.reduce((acc, s) => acc + (s.credits || 0), 0);
  const totalCgpaPoints = sems.reduce((acc, s) => acc + (s.credits || 0) * (s.sgpa || 0), 0);
  
  const cgpa = studentData.cgpa || (completedCredits > 0 ? totalCgpaPoints / completedCredits : 0);
  document.getElementById("planCurrentCgpa").textContent = cgpa > 0 ? cgpa.toFixed(2) : "—";
  
  const targetEl = document.getElementById("planTargetInput");
  const target = parseFloat(targetEl?.value) || 8.50;
  
  let progress = 0;
  if (cgpa > 0) {
    progress = Math.min(100, Math.max(0, (cgpa / target) * 100));
  }
  document.getElementById("planProgress").textContent = `${progress.toFixed(1)}%`;
  
  if (cgpa >= target && cgpa > 0) {
    document.getElementById("planReqSgpa").textContent = "✓ Target already achieved!";
    return;
  }
  
  const targetTotalCredits = 160;
  const remainingCredits = targetTotalCredits - completedCredits;
  
  if (remainingCredits <= 0) {
    document.getElementById("planReqSgpa").textContent = "All credits completed!";
    return;
  }
  
  const requiredSgpa = (target * targetTotalCredits - totalCgpaPoints) / remainingCredits;
  
  if (requiredSgpa <= 0) {
    document.getElementById("planReqSgpa").textContent = "✓ Target already achieved!";
  } else if (requiredSgpa > 10) {
    document.getElementById("planReqSgpa").textContent = "Mathematically impossible (> 10.00 SGPA)";
  } else {
    document.getElementById("planReqSgpa").textContent = `${requiredSgpa.toFixed(2)} SGPA`;
  }
}
window.recomputeTargetPlanner = recomputeTargetPlanner;

function updateAcademicHealthAndInsights(sems, cgpa, pct, backlogs) {
  // 1. Health Checklist
  const healthContainer = document.getElementById("healthChecklist");
  if (healthContainer) {
    const completedCredits = sems.reduce((acc, s) => acc + (s.credits || 0), 0);
    const creditPct = Math.min(100, (completedCredits / 160) * 100);
    
    let cgpaStatus = "Needs Improvement ✕";
    let cgpaColor = "var(--brand-danger)";
    if (cgpa >= 8.0) {
      cgpaStatus = "Excellent ✓";
      cgpaColor = "var(--brand-success)";
    } else if (cgpa >= 6.5) {
      cgpaStatus = "Good ✓";
      cgpaColor = "var(--brand-primary)";
    }

    healthContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <span style="color:var(--text-sub);">CGPA Status</span>
        <strong style="color:${cgpaColor};">${cgpaStatus}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <span style="color:var(--text-sub);">Backlog Status</span>
        <strong style="color:${backlogs === 0 ? "var(--brand-success)" : "var(--brand-danger)"};">
          ${backlogs === 0 ? "All Clear ✓" : `${backlogs} Pending ✕`}
        </strong>
      </div>
      <div style="font-size:13px;margin-top:6px;">
        <div style="display:flex;justify-content:space-between;color:var(--text-sub);margin-bottom:4px;">
          <span>Credit Progress</span>
          <strong>${completedCredits} / 160 Cr (${creditPct.toFixed(1)}%)</strong>
        </div>
        <div style="width:100%;height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;">
          <div style="width:${creditPct}%;height:100%;background:var(--brand-primary);border-radius:3px;"></div>
        </div>
      </div>`;
  }

  // 2. Academic Insights List
  const insightsContainer = document.getElementById("insightsList");
  if (insightsContainer) {
    const insights = [];
    const completedCredits = sems.reduce((acc, s) => acc + (s.credits || 0), 0);
    
    if (cgpa > 0) {
      insights.push(`Your cumulative CGPA is standing at **${cgpa.toFixed(2)}**.`);
    }
    
    if (sems.length > 0) {
      const highestSemObj = [...sems].sort((a,b) => b.sgpa - a.sgpa)[0];
      insights.push(`Your highest performance was in **${highestSemObj.semester}** with **${highestSemObj.sgpa.toFixed(2)}** SGPA.`);
    }

    insights.push(`You have completed **${completedCredits}** out of 160 total credits.`);

    if (backlogs === 0) {
      insights.push(`You currently have **no active backlogs**; academic profile is completely clear.`);
    } else {
      insights.push(`You have **${backlogs} active backlogs** that require completion.`);
    }

    insightsContainer.innerHTML = insights.map(i => `
      <li style="line-height:1.5;">${i.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>
    `).join("");
  }
}

function renderHomeChart(sems) {
  const ctx = document.getElementById("homeChart")?.getContext("2d");
  if (!ctx) return;
  if (homeChartInst) homeChartInst.destroy();

  const labels = sems.map(s => s.semester);
  const sgpaData = sems.map(s => +Number(s.sgpa).toFixed(2));
  
  let accumulatedCredits = 0;
  let accumulatedPoints = 0;
  const cgpaData = sems.map(s => {
    accumulatedCredits += (s.credits || 0);
    accumulatedPoints += (s.credits || 0) * (s.sgpa || 0);
    return accumulatedCredits > 0 ? +Number(accumulatedPoints / accumulatedCredits).toFixed(2) : 0;
  });

  const datasets = [];
  if (_currentChartFilter === "sgpa" || _currentChartFilter === "both") {
    datasets.push({
      label: "SGPA",
      data: sgpaData,
      borderColor: "#3B82F6",
      backgroundColor: "rgba(59, 130, 246, 0.05)",
      tension: 0.35,
      fill: true,
      pointRadius: 5,
      pointBackgroundColor: "#3B82F6",
    });
  }
  if (_currentChartFilter === "cgpa" || _currentChartFilter === "both") {
    datasets.push({
      label: "CGPA",
      data: cgpaData,
      borderColor: "#EAB308",
      backgroundColor: "rgba(234, 179, 8, 0.05)",
      tension: 0.35,
      fill: true,
      pointRadius: 5,
      pointBackgroundColor: "#EAB308",
    });
  }

  homeChartInst = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
        }
      },
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
const PREVIEW_COUNT = 3; // subjects visible before "expand"

function gradeClass(g) {
  const map = { S:"grade-S", A:"grade-A", B:"grade-B", C:"grade-C", D:"grade-D", E:"grade-E", F:"grade-F", Ab:"grade-Ab" };
  return map[g] || "grade-Ab";
}

function buildSubjectRows(subjects, expanded) {
  if (!subjects || subjects.length === 0) {
    return `<div style="font-size:13px;color:var(--text-muted);padding:10px 0;font-style:italic;">No subject-wise data available for this semester.</div>`;
  }
  const visible = expanded ? subjects : subjects.slice(0, PREVIEW_COUNT);
  return visible.map((sub, sIdx) => {
    const name  = esc(sub.subject || sub.name || "Subject");
    const code  = sub.code ? `<span class="sem-subject-code">${esc(sub.code)}</span>` : "";
    const grade = sub.grade || "—";
    const isFail = (grade === "F" || grade === "Ab");
    const credits = sub.credits || 0;
    return `
      <div class="sem-subject-row${isFail ? " failed-row" : ""}" style="animation-delay: ${sIdx * 45}ms;">
        <div style="flex:1;min-width:0;">
          <div class="sem-subject-name" title="${name}">${name}</div>
          ${code}
        </div>
        <div class="sem-subject-right">
          <span class="sem-credit-pill">${credits} Cr</span>
          <span class="grade-badge ${gradeClass(grade)}">${esc(grade)}</span>
        </div>
      </div>`;
  }).join("");
}

function buildSemCard(sem, pubResult, idx) {
  // Determine subjects source: published result takes priority
  const subjects = pubResult ? (pubResult.subjects || []) : (sem.subjects || []);

  // Calculate totals from real subject data if available
  const realCredits = subjects.length > 0
    ? subjects.reduce((acc, s) => acc + (s.credits || 0), 0)
    : (sem.credits || 0);

  const totalSubjects = subjects.length;
  const passedCount   = subjects.filter(s => s.passed !== false && s.grade !== "F" && s.grade !== "Ab").length;
  const failedCount   = totalSubjects - passedCount;
  const sgpa          = pubResult ? pubResult.sgpa : sem.sgpa;
  const pct           = pubResult ? pubResult.percentage : ((sgpa - 0.75) * 10);
  const hasMore       = subjects.length > PREVIEW_COUNT;
  const isPublished   = !!pubResult;
  const sourceLabel   = isPublished
    ? `<span class="badge badge-pass" style="font-size:10px;padding:2px 8px;">Official</span>`
    : `<span class="badge badge-info" style="font-size:10px;padding:2px 8px;">Manual</span>`;

  return `
    <div class="sem-card" id="semcard-${idx}">
      <div class="sem-card-header">
        <div>
          <div style="font-family:var(--font-head);font-weight:700;font-size:1.05rem;">${esc(sem.semester)} Semester</div>
          ${isPublished ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(pubResult.regulation||"R23")} • ${esc(pubResult.examType||"Regular")} • ${esc(pubResult.examSession||"")}</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${sourceLabel}
          <span class="badge ${pubResult ? (pubResult.passed ? "badge-pass" : "badge-fail") : "badge-info"}"
                style="font-size:10px;padding:2px 8px;">
            ${pubResult ? (pubResult.passed ? "PASS" : "FAIL") : `${realCredits} Cr`}
          </span>
        </div>
      </div>

      <div class="sem-card-meta">
        <div class="sem-card-meta-item">
          <div class="lbl">SGPA</div>
          <div class="val">${fmt2(sgpa)}</div>
        </div>
        <div class="sem-card-meta-item">
          <div class="lbl">Percentage</div>
          <div class="val">${fmtPct(pct)}</div>
        </div>
        <div class="sem-card-meta-item">
          <div class="lbl">Total Credits</div>
          <div class="val">${realCredits}</div>
        </div>
      </div>

      ${totalSubjects > 0 ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px;">Subject Performance</div>` : ""}
      <div class="sem-subjects-list" id="subj-list-${idx}">
        ${buildSubjectRows(subjects, false)}
      </div>

      <div class="sem-card-footer">
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          ${totalSubjects > 0 ? `
            <span>Subjects: <strong>${totalSubjects}</strong></span>
            <span style="color:var(--accent-green-txt);">Passed: <strong>${passedCount}</strong></span>
            ${failedCount > 0 ? `<span style="color:var(--accent-rose-txt);">Failed: <strong>${failedCount}</strong></span>` : ""}
          ` : "<span style='color:var(--text-muted);font-style:italic;'>No subject data</span>"}
        </div>
        <div style="display:flex;gap:12px;align-items:center;">
          ${hasMore ? `<button class="sem-expand-btn" id="expbtn-${idx}" data-expanded="0" data-semid="${esc(sem.semester)}" onclick="toggleSemExpand(${idx}, ${subjects.length})">Show all ${subjects.length} subjects ↓</button>` : ""}
          ${pubResult ? `<button class="sem-expand-btn" onclick="openResultDetail('${pubResult._id}')">Full detail →</button>` : ""}
        </div>
      </div>
    </div>`;
}

function toggleSemExpand(idx, total) {
  const list = document.getElementById(`subj-list-${idx}`);
  const btn  = document.getElementById(`expbtn-${idx}`);
  if (!list || !btn) return;
  const isExpanded = btn.dataset.expanded === "1";
  const semId = btn.dataset.semid;
  if (!semId) return;

  const sd = studentData;
  if (!sd) return;
  const sems = semSort(sd.semesters || []);
  const sem = sems.find(s => s.semester === semId) || { semester: semId, subjects: [] };
  const pubResult = publishedResults.find(r => r.semester === semId) || null;
  const subjects = pubResult ? (pubResult.subjects || []) : (sem.subjects || []);

  list.innerHTML = buildSubjectRows(subjects, !isExpanded);
  btn.dataset.expanded = isExpanded ? "0" : "1";
  btn.textContent = isExpanded ? `Show all ${total} subjects ↓` : "Show less ↑";
}
window.toggleSemExpand = toggleSemExpand;

function renderSgpa() {
  const sd = studentData;
  if (!sd) return;
  const sems = semSort(sd.semesters || []);
  const grid = document.getElementById("semesterGrid");
  if (!grid) return;

  if (sems.length === 0 && publishedResults.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center;padding:48px 24px;">
        <div style="font-size:2.5rem;margin-bottom:12px;">📚</div>
        <h3 style="font-family:var(--font-head);margin-bottom:6px;">No Semester Data Yet</h3>
        <p style="color:var(--text-sub);max-width:400px;margin:0 auto 20px;">
          Add your semester grades manually using the button above, or wait for your institution to publish results.
        </p>
        <button class="btn btn-primary" id="addSemBtnEmpty" onclick="openAddSemesterModal()">+ Add First Semester</button>
      </div>`;
    return;
  }

  // Merge manual semesters with published results
  const allSems = new Set([
    ...sems.map(s => s.semester),
    ...publishedResults.map(r => r.semester)
  ]);
  const sortedSems = [...allSems].sort((a,b) => semOrd(a) - semOrd(b));

  const cards = sortedSems.map((semId, idx) => {
    const manualSem = sems.find(s => s.semester === semId) || { semester: semId, sgpa: 0, credits: 0, subjects: [] };
    const pubResult = publishedResults.find(r => r.semester === semId) || null;
    return buildSemCard(manualSem, pubResult, idx);
  });

  grid.innerHTML = `<div class="sem-cards-grid">${cards.join("")}</div>`;
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

/* ════════════════════════════════════════════════════ ADD SEMESTER MODAL ═ */
function openAddSemesterModal() {
  const modal = document.getElementById("addSemesterModal");
  if (!modal) return;

  const errorEl = document.getElementById("addSemError");
  if (errorEl) errorEl.style.display = "none";

  const sems = getApplicableSemesters(studentData);
  const existingSems = new Set(sems.map(s => s.semester));
  const semSelect = document.getElementById("addSemSelect");
  
  if (semSelect) {
    let candidate = "";
    const allList = (studentData && studentData.category === "Lateral Entry") ? SEMESTERS_LATERAL : SEMESTERS_ALL;
    for (const s of allList) {
      if (!existingSems.has(s)) { candidate = s; break; }
    }
    semSelect.value = candidate || "1-1";
  }

  const tbody = document.getElementById("addSemSubjectRows");
  if (tbody) {
    tbody.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      addSubjectRowToAddSemModal();
    }
  }

  openModal("addSemesterModal");
}
window.openAddSemesterModal = openAddSemesterModal;

function addSubjectRowToAddSemModal(code = "", name = "", credits = 3, grade = "A") {
  const tbody = document.getElementById("addSemSubjectRows");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <input type="text" class="sem-sub-code" value="${esc(code)}" placeholder="e.g. CS301" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;font-size:12px;font-family:var(--font-mono);"/>
    </td>
    <td>
      <input type="text" class="sem-sub-name" value="${esc(name)}" placeholder="Subject Title" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;font-size:12.5px;" required/>
    </td>
    <td>
      <select class="sem-sub-credits" style="width:100%;padding:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;font-size:12.5px;">
        <option value="1" ${credits == 1 ? "selected" : ""}>1</option>
        <option value="1.5" ${credits == 1.5 ? "selected" : ""}>1.5</option>
        <option value="2" ${credits == 2 ? "selected" : ""}>2</option>
        <option value="2.5" ${credits == 2.5 ? "selected" : ""}>2.5</option>
        <option value="3" ${credits == 3 || !credits ? "selected" : ""}>3</option>
        <option value="3.5" ${credits == 3.5 ? "selected" : ""}>3.5</option>
        <option value="4" ${credits == 4 ? "selected" : ""}>4</option>
      </select>
    </td>
    <td>
      <select class="sem-sub-grade" style="width:100%;padding:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);border-radius:6px;font-size:12.5px;">
        <option value="S" ${grade === "S" ? "selected" : ""}>S (10)</option>
        <option value="A" ${grade === "A" ? "selected" : ""}>A (9)</option>
        <option value="B" ${grade === "B" ? "selected" : ""}>B (8)</option>
        <option value="C" ${grade === "C" ? "selected" : ""}>C (7)</option>
        <option value="D" ${grade === "D" ? "selected" : ""}>D (6)</option>
        <option value="E" ${grade === "E" ? "selected" : ""}>E (5)</option>
        <option value="F" ${grade === "F" ? "selected" : ""}>F (0)</option>
        <option value="Ab" ${grade === "Ab" ? "selected" : ""}>Ab (0)</option>
      </select>
    </td>
    <td style="text-align:center;">
      <button type="button" class="icon-btn" onclick="this.closest('tr').remove()" style="color:var(--brand-danger);padding:4px;" title="Remove row">✕</button>
    </td>
  `;
  tbody.appendChild(tr);
}
window.addSubjectRowToAddSemModal = addSubjectRowToAddSemModal;

async function handleAddSemesterSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById("addSemError");
  const saveBtn = document.getElementById("saveAddSemBtn");
  
  if (errorEl) errorEl.style.display = "none";

  const semester = document.getElementById("addSemSelect")?.value;
  if (!semester) {
    showAddSemError("Please select a valid semester.");
    return;
  }

  if (studentData && studentData.category === "Lateral Entry" && (semester === "1-1" || semester === "1-2")) {
    showAddSemError("Lateral Entry students cannot add 1-1 or 1-2 semesters.");
    return;
  }

  const rowElements = document.querySelectorAll("#addSemSubjectRows tr");
  const subjects = [];

  rowElements.forEach(tr => {
    const code = tr.querySelector(".sem-sub-code")?.value?.trim() || "";
    const name = tr.querySelector(".sem-sub-name")?.value?.trim() || "";
    const credits = parseFloat(tr.querySelector(".sem-sub-credits")?.value) || 0;
    const grade = tr.querySelector(".sem-sub-grade")?.value || "F";

    if (name) {
      subjects.push({
        code,
        subject: name,
        name,
        credits,
        grade,
      });
    }
  });

  if (subjects.length === 0) {
    showAddSemError("Please enter at least one subject with a valid subject title.");
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving Record...";
    }

    const resData = await apiFetch("/api/student/semester", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semester, subjects }),
    });

    if (resData.student) {
      studentData = resData.student;
    } else {
      studentData = await apiFetch("/api/student");
    }

    closeModal("addSemesterModal");

    renderSgpa();
    await loadHome();

  } catch(err) {
    showAddSemError(err.message || "Failed to save semester record.");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Semester Record";
    }
  }
}

function showAddSemError(msg) {
  const errorEl = document.getElementById("addSemError");
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
  }
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

  // Add Semester button & form bindings
  document.getElementById("addSemBtn")?.addEventListener("click", openAddSemesterModal);
  document.getElementById("addSemesterForm")?.addEventListener("submit", handleAddSemesterSubmit);

  // Hash change routing for browser back/forward buttons
  window.addEventListener("hashchange", handleHashRoute);

  // Initial load
  await loadHome();
  handleHashRoute();
});
