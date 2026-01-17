/* =====================================================
   dashboard.js — FINAL, ZIP-ALIGNED, SPA-SAFE
   ROLE:
   - Home dashboard ONLY
   - No routing
   - Summary + modal drill-down
===================================================== */

(function () {
  if (window.__dashboardLoaded) return;
  window.__dashboardLoaded = true;

  console.log("dashboard.js loaded");
})();

/* ================= AUTH ================= */
function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: "Bearer " + token } : {};
}

/* ================= HOME LIFECYCLE ================= */
window.onHomeRendered = function () {
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

  fetch("/api/leaves/pending/my-team", { headers: authHeaders() })
    .then(r => r.json())
    .then(d => setText("pendingLeavesCount", d.count || 0));

  fetch("/api/timesheets/pending/my-team", { headers: authHeaders() })
    .then(r => r.json())
    .then(d => setText("pendingTimesheetsCount", d.count || 0));

  fetch("/api/leaves/team/on-leave", { headers: authHeaders() })
    .then(r => r.json())
    .then(d => setText("teamOnLeave", d.count || 0));
}

/* ================= TEAM ATTENDANCE SUMMARY ================= */
function loadTeamAttendanceSummary() {
  fetch("/api/attendance/team/summary", { headers: authHeaders() })
    .then(r => r.json())
    .then(d => {
      setText("teamAttendanceCount", `${d.present} / ${d.total}`);
      setText(
        "teamAttendanceMeta",
        `Present: ${d.present} · On Leave: ${d.on_leave} · Absent: ${d.absent}`
      );
      setText("teamOnLeave", d.on_leave);
    });
}

/* ================= TEAM ATTENDANCE MODAL ================= */
function openTeamAttendanceModal(filter) {
  const modal = document.getElementById("teamAttendanceModal");
  const tbody = document.getElementById("teamAttendanceTable");
  if (!modal || !tbody) return;

  tbody.innerHTML =
    "<tr><td colspan='4' class='text-center text-muted'>Loading…</td></tr>";

  fetch("/api/attendance/team/today/details", { headers: authHeaders() })
    .then(r => r.json())
    .then(rows => {
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
          <td>${r.employee_name}</td>
          <td>${r.status}</td>
          <td>${r.clock_in ? formatTime(r.clock_in) : "—"}</td>
          <td>${r.clock_out ? formatTime(r.clock_out) : "—"}</td>
        </tr>
      `).join("");
    });

  new bootstrap.Modal(modal).show();
}

/* ================= TODAY TIME ================= */
/* ================= TODAY TIME (SAFE) ================= */
function loadTodayTime() {
  fetch("/api/attendance/today", { headers: authHeaders() })
    .then(r => {
      if (!r.ok) return null; // 🔒 guard 404 / 500
      return r.json();
    })
    .then(d => {
      // ⛔ No attendance yet OR API missing
      if (!d) {
        setText("workedTime", "00:00");
        setText("breakTime", "00:00");
        return;
      }

      // ✅ Support both seconds & hh:mm (backend drift safe)
      if (typeof d.worked_seconds !== "undefined") {
        setText("workedTime", secToHHMM(d.worked_seconds));
      } else {
        setText("workedTime", d.worked || "00:00");
      }

      if (typeof d.break_seconds !== "undefined") {
        setText("breakTime", secToHHMM(d.break_seconds));
      } else {
        setText("breakTime", d.break || "00:00");
      }

      if (d.clock_in_at) {
        const el = document.getElementById("loggedInSince");
        if (el) {
          el.classList.remove("d-none");
          el.innerText = "Logged in since " + formatTime(d.clock_in_at);
        }
      }
    })
    .catch(err => {
      console.warn("Today attendance unavailable", err);
      setText("workedTime", "00:00");
      setText("breakTime", "00:00");
    });
}

/* ================= HOLIDAY ================= */
function resetHolidayCard() {
  document.getElementById("holidayCard")?.classList.add("d-none");
}

function loadHoliday() {
  fetch("/api/holiday/nearest", { headers: authHeaders() })
    .then(r => r.json())
    .then(h => {
      if (!h) return;
      document.getElementById("holidayCard").classList.remove("d-none");
      setText("holidayText", h.name);
      setText("holidayDate", formatDate(h.holiday_date));
    });
}

/* ================= OTHER ================= */
function loadUpcomingHolidays() {
  fetch("/api/holiday", { headers: authHeaders() })
    .then(r => r.json())
    .then(rows => {
      document.getElementById("upcomingHolidays").innerHTML =
        rows.map(h => `<li>${formatDate(h.holiday_date)} - ${h.name}</li>`).join("");
    });
}

function loadThoughtOfTheDay() {
  fetch("/api/thought/today", { headers: authHeaders() })
    .then(r => r.json())
    .then(d => setText("thoughtText", d.text || "Have a productive day."));
}

function loadLeaveBalance() {
  fetch("/api/leaves/balance", { headers: authHeaders() })
    .then(r => r.json())
    .then(rows => {
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
    day: "2-digit", month: "short", year: "numeric"
  });
}

function formatTime(t) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
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