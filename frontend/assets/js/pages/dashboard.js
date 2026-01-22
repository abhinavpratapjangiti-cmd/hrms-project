/* =====================================================
   dashboard.js — APPWRITE SPA SAFE (PROD)
===================================================== */

import { Client, Account, Functions } from "https://cdn.jsdelivr.net/npm/appwrite@14.0.0/+esm";

/* ================= APPWRITE INIT ================= */
const client = new Client()
  .setEndpoint("https://cloud.appwrite.io/v1")
  .setProject("APPWRITE_PROJECT_ID");

const account = new Account(client);
const functions = new Functions(client);

/* ================= SAFE FUNCTION CALL ================= */
async function callFunction(fnName, path, payload = null) {
  try {
    const res = await functions.createExecution(
      fnName,
      JSON.stringify({ path, payload })
    );

    return JSON.parse(res.response || "{}");
  } catch (e) {
    console.warn("Function failed:", fnName, path);
    return null;
  }
}

/* ================= HOME LIFECYCLE ================= */
window.onHomeRendered = async function () {
  try {
    await account.get(); // ensures logged-in session
  } catch {
    console.warn("Not logged in — dashboard skipped");
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
async function applyRoleBasedDashboards() {
  const user = await account.get();
  const role = (user.prefs?.role || "").toLowerCase();
  const isManager = ["manager", "hr", "admin"].includes(role);

  if (!isManager) return;

  document.getElementById("managerDashboard")?.classList.remove("d-none");
  document.getElementById("homeInboxCard")?.classList.remove("d-none");

  loadManagerStats();
}

/* ================= MANAGER STATS ================= */
function loadManagerStats() {
  callFunction("dashboard", "/attendance/team/summary")
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

  callFunction("dashboard", "/leaves/pending/my-team")
    .then(d => setText("pendingLeavesCount", d?.count ?? 0));

  callFunction("dashboard", "/timesheets/pending/my-team")
    .then(d => setText("pendingTimesheetsCount", d?.count ?? 0));
}

/* ================= TODAY TIME ================= */
function loadTodayTime() {
  callFunction("attendance", "/today")
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
  callFunction("holiday", "/nearest")
    .then(h => {
      if (!h) return;
      document.getElementById("holidayCard")?.classList.remove("d-none");
      setText("holidayText", h.name);
      setText("holidayDate", formatDate(h.holiday_date));
    });
}

function loadUpcomingHolidays() {
  callFunction("holiday", "/list")
    .then(rows => {
      if (!Array.isArray(rows)) rows = [];
      document.getElementById("upcomingHolidays").innerHTML =
        rows.map(h =>
          `<li>${formatDate(h.holiday_date)} - ${h.name}</li>`
        ).join("");
    });
}

/* ================= THOUGHT ================= */
function loadThoughtOfTheDay() {
  callFunction("thought", "/today")
    .then(d =>
      setText("thoughtText", d?.thought || "Have a productive day.")
    );
}

/* ================= LEAVES ================= */
function loadLeaveBalance() {
  callFunction("leaves", "/balance")
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
   END dashboard.js (APPWRITE)
===================================================== */
