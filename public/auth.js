// Shared auth page helpers
function showError(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}

function setLoading(loading, btnText, spinner) {
  btnText.textContent = loading ? "Please wait…" : btnText.dataset.original || btnText.textContent;
  spinner.classList.toggle("hidden", !loading);
}

// Store original button text
document.addEventListener("DOMContentLoaded", () => {
  const btnText = document.getElementById("btnText");
  if (btnText) btnText.dataset.original = btnText.textContent;

  // Password toggle
  const toggleBtn = document.getElementById("togglePass");
  const passInput = document.getElementById("password");
  if (toggleBtn && passInput) {
    toggleBtn.addEventListener("click", () => {
      passInput.type = passInput.type === "password" ? "text" : "password";
    });
  }
});
