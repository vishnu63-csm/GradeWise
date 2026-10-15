// Shared auth page & public page helpers
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function setLoading(loading, btnText, spinner) {
  if (btnText) {
    btnText.textContent = loading ? "Please wait…" : btnText.dataset.original || btnText.textContent;
  }
  if (spinner) {
    spinner.classList.toggle("hidden", !loading);
  }
}

// Global DOM Ready handlers
document.addEventListener("DOMContentLoaded", () => {
  // 1. Save original submit button text
  const btnText = document.getElementById("btnText");
  if (btnText) btnText.dataset.original = btnText.textContent;

  // 2. Password toggle
  const toggleBtn = document.getElementById("togglePass");
  const passInput = document.getElementById("password");
  if (toggleBtn && passInput) {
    toggleBtn.addEventListener("click", () => {
      passInput.type = passInput.type === "password" ? "text" : "password";
    });
  }

  // 3. Dynamic header active link highlighting
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  document.querySelectorAll("#headerNav a").forEach(link => {
    const linkPath = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (linkPath === currentPath) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
});
