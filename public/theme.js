/* ─── GradeWise Theme Engine (Light / Dark Mode Controller) ───────────────── */
(function() {
  "use strict";

  function getSavedTheme() {
    return localStorage.getItem("gradewise_theme") || "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gradewise_theme", theme);
    
    // Update theme toggle button text & icon if present in DOM
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      if (theme === "dark") {
        btn.innerHTML = `<span>☀️</span><span>Light</span>`;
        btn.title = "Switch to Light Mode";
      } else {
        btn.innerHTML = `<span>🌙</span><span>Dark</span>`;
        btn.title = "Switch to Dark Mode";
      }
    }
  }

  function toggleTheme() {
    const current = getSavedTheme();
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  // Apply saved theme immediately on script load to prevent FOUC
  applyTheme(getSavedTheme());

  window.GradeWiseTheme = {
    getTheme: getSavedTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getSavedTheme());
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      btn.addEventListener("click", toggleTheme);
    }
  });
})();
