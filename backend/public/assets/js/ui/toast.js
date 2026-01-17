console.log("toast.js loaded");

window.showSuccessToast = function (title, message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "app-toast success";

  toast.innerHTML = `
    <div class="app-toast-icon">✅</div>
    <div>
      <div class="app-toast-title">${title}</div>
      <div class="app-toast-msg">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
};

window.showErrorToast = function (title, message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.style.background = "linear-gradient(135deg,#dc2626,#ef4444)";

  toast.innerHTML = `
    <div class="app-toast-icon">❌</div>
    <div>
      <div class="app-toast-title">${title}</div>
      <div class="app-toast-msg">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
};
