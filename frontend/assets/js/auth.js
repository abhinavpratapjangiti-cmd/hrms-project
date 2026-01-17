/* =====================================================
   AUTH HELPER — STABILITY PATCH (NON-MODULE)
===================================================== */

/* =========================
   USER HELPERS
========================= */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

function getRole() {
  return getUser()?.role || null;
}

function getToken() {
  return localStorage.getItem("token");
}

/* =========================
   REQUIRE AUTH
========================= */
function requireAuth() {
  const token = localStorage.getItem("token");
  const user = localStorage.getItem("user");

  if (!token || !user) {
    localStorage.clear();
    window.location.replace("/login.html");
    return false;
  }

  return true;
}

/* =========================
   POPULATE USER INFO
========================= */
function populateUserName() {
  const user = getUser();
  if (!user) return;

  // 🔐 Ensure DOM is ready (prevents null element errors)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populateUserName, {
      once: true
    });
    return;
  }

  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const profileName = document.getElementById("profileName");
  const profileRole = document.getElementById("profileRole");

  if (nameEl) {
    nameEl.textContent = user.name || user.email || "User";
  }

  if (profileName) {
    profileName.textContent = user.name || user.email || "User";
  }

  if (roleEl && user.role) {
    roleEl.textContent = user.role.toUpperCase();
    roleEl.classList.remove("d-none");
    roleEl.classList.add(
      user.role === "admin" ? "bg-danger" : "bg-primary"
    );
  }

  if (profileRole && user.role) {
    profileRole.textContent = user.role.toUpperCase();
  }
}

/* =========================
   LOGOUT
========================= */
function confirmLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login.html";
}

/* =========================
   GLOBAL EXPORTS (SPA SAFE)
========================= */
window.getToken = getToken;
window.getUser = getUser;
window.getRole = getRole;
window.requireAuth = requireAuth;
window.populateUserName = populateUserName;
window.confirmLogout = confirmLogout;
