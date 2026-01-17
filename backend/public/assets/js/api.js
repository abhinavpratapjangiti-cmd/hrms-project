console.log("🔥 api.js LOADED", new Date().toISOString());

/* =========================
   API CONFIG (GLOBAL)
========================= */
// ❌ DO NOT prefix /api here
const API_BASE = "";
window.API_BASE = API_BASE;

/* =========================
   JWT UTILITIES (NEW)
========================= */
function isTokenExpired(token) {
  try {
    var payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch (e) {
    return true;
  }
}

function forceLogout(reason) {
  console.warn("🔒 Force logout:", reason);
  localStorage.clear();
  alert("Session expired. Please login again.");
  window.location.replace("/login.html");
}

/* =========================
   AUTH HEADERS (FIXED)
========================= */
function getAuthHeaders() {
  const token = localStorage.getItem("token");

  if (!token) {
    console.warn("No auth token found");
    forceLogout("Missing token");
    throw new Error("NO_AUTH_TOKEN");
  }

  if (isTokenExpired(token)) {
    forceLogout("JWT expired");
    throw new Error("JWT_EXPIRED");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

/* =========================
   SAFE RESPONSE HANDLER
========================= */
async function handleResponse(res) {
  if (res.status === 401) {
    console.warn("401 Unauthorized → logging out");
    forceLogout("401 Unauthorized");
    throw new Error("UNAUTHORIZED");
  }

  // 🔥 304 has NO body → must handle explicitly
  if (res.status === 304) {
    console.warn("304 Not Modified → forcing reload");
    throw new Error("CACHED_RESPONSE");
  }

  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(text || "NON_JSON_RESPONSE");
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "API_ERROR");
  }

  return data;
}

/* =========================
   GENERIC GET (🔥 NO CACHE)
========================= */
async function apiGet(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const res = await fetch(`/api${cleanPath}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      ...getAuthHeaders(),
      "Cache-Control": "no-store"
    }
  });

  return handleResponse(res);
}

/* =========================
   GENERIC POST
========================= */
async function apiPost(path, body = {}) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });

  return handleResponse(res);
}

/* =========================
   GENERIC PUT
========================= */
async function apiPut(path, body = {}) {
  const res = await fetch(`/api${path}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });

  return handleResponse(res);
}

/* =========================
   GENERIC DELETE
========================= */
async function apiDelete(path) {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });

  return handleResponse(res);
}
/* =========================
   END api.js
========================= */