/* =====================================================
   dashboard.js — FINAL, ZIP-ALIGNED, SPA-SAFE
===================================================== */

(function () {
  if (window.__dashboardLoaded) return;
  window.__dashboardLoaded = true;
  console.log("dashboard.js loaded");
})();

/* ================= AUTH ================= */
function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  return { Authorization: "Bearer " + token };
}

/* ================= SAFE FETCH ================= */
function safeFetch(url) {
  const headers = authHeaders();
  if (!headers) return Promise.resolve(null);

  return fetch(url, { headers })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
}

/* ================= HOME LIFECYCLE ================= */
window.onHomeRendered = function () {
  if (!authHeaders()) {
    console.warn("No token, dashboard APIs skipped");
    return;
  }

  resetHolidayCard();
  loadHoliday();
  loadUpcomingHolidays();
  loadThoughtOfTheDay();
  loadLeaveBalance();
  loadTodayTime();
  applyRoleBasedDashboards();
};

/* ================= ROLE BASED ================= */
function applyRoleBasedDashboards() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = (user.role || "").toLowerCase();
  const isManager = ["manager", "hr", "admin"].includes(role);

  if (!isManager) return;

  document.getElementById("managerDashboard")?.classList.remove("d-none");
  document.getElementById("homeInboxCard")?.classList.remove("d-none");

  loadManagerStats();
}

/* ================= MANAGER STATS ================= */
function loadManagerStats() {
  loadTeamAttendanceSummary();

  safeFetch("/api/leaves/pending/my-team")
    .then(d => setText("pendingLeavesCount", d?.count ?? 0));

  safeFetch("/api/timesheets/pending/my-team")
    .then(d => setText("pendingTimesheetsCount", d?.count ?? 0));

  safeFetch("/api/leaves/team/on-leave")
    .then(d => setText("teamOnLeave", d?.count ?? 0));
}

/* ================= TEAM ATTENDANCE SUMMARY ================= */
function loadTeamAttendanceSummary() {
  safeFetch("/api/attendance/team/summary")
    .then(d => {
      const present = d?.present ?? 0;
      const total = d?.total ?? 0;
      const onLeave = d?.on_leave ?? 0;
      const absent = d?.absent ?? 0;

      setText("teamAttendanceCount", `${present} / ${total}`);
      setText(
        "teamAttendanceMeta",
        `Present: ${present} · On Leave: ${onLeave} · Absent: ${absent}`
      );
      setText("teamOnLeave", onLeave);
    });
}

/* ================= TEAM ATTENDANCE MODAL ================= */
function openTeamAttendanceModal(filter) {
  const modal = document.getElementById("teamAttendanceModal");
  const tbody = document.getElementById("teamAttendanceTable");
  if (!modal || !tbody) return;

  tbody.innerHTML =
    "<tr><td colspan='4' class='text-center text-muted'>Loading…</td></tr>";

  safeFetch("/api/attendance/team/today/details")
    .then(rows => {
      if (!Array.isArray(rows)) rows = [];

      if (filter === "ON_LEAVE") {
        rows = rows.filter(r => r.status === "ON_LEAVE");
      }

      if (!rows.length) {
        tbody.innerHTML =
          "<tr><td colspan='4' class='text-center text-muted'>No data</td></tr>";
        return;
      }

      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.employee_name || "—"}</td>
          <td>${r.status || "—"}</td>
          <td>${r.clock_in ? formatTime(r.clock_in) : "—"}</td>
          <td>${r.clock_out ? formatTime(r.clock_out) : "—"}</td>
        </tr>
      `).join("");
    });

  new bootstrap.Modal(modal).show();
}

/* ================= TODAY TIME ================= */
function loadTodayTime() {
  safeFetch("/api/attendance/today")
    .then(d => {
      setText(
        "workedTime",
        typeof d?.worked_seconds === "number"
          ? secToHHMM(d.worked_seconds)
          : "00:00"
      );

      setText(
        "breakTime",
        typeof d?.break_seconds === "number"
          ? secToHHMM(d.break_seconds)
          : "00:00"
      );

      if (d?.clock_in_at) {
        const el = document.getElementById("loggedInSince");
        if (el) {
          el.classList.remove("d-none");
          el.innerText = "Logged in since " + formatTime(d.clock_in_at);
        }
      }
    });
}

/* ================= HOLIDAY ================= */
function resetHolidayCard() {
  document.getElementById("holidayCard")?.classList.add("d-none");
}

function loadHoliday() {
  safeFetch("/api/holiday/nearest")
    .then(h => {
      if (!h) return;
      document.getElementById("holidayCard")?.classList.remove("d-none");
      setText("holidayText", h.name);
      setText("holidayDate", formatDate(h.holiday_date));
    });
}

/* ================= OTHER ================= */
function loadUpcomingHolidays() {
  safeFetch("/api/holiday")
    .then(rows => {
      if (!Array.isArray(rows)) rows = [];
      document.getElementById("upcomingHolidays").innerHTML =
        rows.map(h =>
          `<li>${formatDate(h.holiday_date)} - ${h.name}</li>`
        ).join("");
    });
}

function loadThoughtOfTheDay() {
  safeFetch("/api/thought/today")
    .then(d => setText("thoughtText", d?.text || "Have a productive day."));
}

function loadLeaveBalance() {
  safeFetch("/api/leaves/balance")
    .then(rows => {
      if (!Array.isArray(rows)) rows = [];
      document.getElementById("leaveBalanceBox").innerHTML =
        rows.map(l => `
          <div class="col text-center">
            <div class="fw-bold">${l.balance}</div>
            <small>${l.leave_type}</small>
          </div>
        `).join("");
    });
}

/* ================= UTIL ================= */
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.innerText = v ?? "—";
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatTime(t) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function secToHHMM(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* =====================================================
   END dashboard.js
===================================================== */
