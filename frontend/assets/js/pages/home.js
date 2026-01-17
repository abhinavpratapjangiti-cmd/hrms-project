/* =====================================================
   HOME.JS — FINAL, STABLE, SPA-SAFE (ES5)
   ROLE:
   - Router orchestration ONLY
   - Holiday banner orchestration
   - Inbox layout control
   - Midnight refresh trigger
===================================================== */
(function () {

  if (window.__homeLoaded) return;
  window.__homeLoaded = true;

  console.log("🏠 home.js loaded");

  /* =====================================================
     1️⃣ ONE-TIME GLOBAL SEARCH SETUP
  ===================================================== */
  if (!window.__homeSearchInit) {
    window.__homeSearchInit = true;

    var routes = [
      { key: "attendance", route: "attendance" },
      { key: "timesheet", route: "timesheets" },
      { key: "leave", route: "leaves" },
      { key: "payroll", route: "payroll" },
      { key: "analytics", route: "analytics" },
      { key: "users", route: "manage-users" }
    ];

    var search = document.getElementById("globalSearch");
    if (search) {
      search.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;

        var q = search.value.toLowerCase().trim();
        if (!q) return;

        for (var i = 0; i < routes.length; i++) {
          if (q.indexOf(routes[i].key) !== -1) {
            window.location.hash = "#/" + routes[i].route;
            return;
          }
        }
      });
    }
  }

  /* =====================================================
     2️⃣ UTILITIES
  ===================================================== */
  function getToken() {
    return localStorage.getItem("token");
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch (e) {
      return null;
    }
  }

  /* =====================================================
     3️⃣ FULL-PAGE HOLIDAY BANNER (UI ONLY)
  ===================================================== */
  function showFullPageHolidayBanner(name, description) {
    if (!name) return;

    var key = "holiday_fullpage_" + name;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,.85);" +
      "display:flex;align-items:center;justify-content:center;z-index:10000";

    var card = document.createElement("div");
    card.style.cssText =
      "background:linear-gradient(135deg,#6366f1,#4f46e5);" +
      "color:#fff;padding:36px 48px;border-radius:22px;text-align:center;" +
      "max-width:90%;box-shadow:0 25px 60px rgba(0,0,0,.35)";

    card.innerHTML =
      "<div style='font-size:42px'>🎉</div>" +
      "<div style='font-size:28px;font-weight:700'>" + name + "</div>" +
      (description ? "<div style='opacity:.9'>" + description + "</div>" : "") +
      "<div style='margin-top:16px;font-size:13px;opacity:.75'>Click anywhere to continue</div>";

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    overlay.onclick = function () { overlay.remove(); };
    setTimeout(function () { overlay.remove(); }, 4000);
  }

  /* =====================================================
     4️⃣ TODAY HOLIDAY (ORCHESTRATION ONLY)
  ===================================================== */
  function loadTodayHolidayCard() {
    var title = document.getElementById("holidayText");
    var dateEl = document.getElementById("holidayDate");
    var token = getToken();

    if (!title || !token) return;

    fetch("/api/holiday/today", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.name) {
          title.innerText = d.name;
          if (dateEl) dateEl.innerText = d.description || "";

          showFullPageHolidayBanner(d.name, d.description);

          var lname = d.name.toLowerCase();
          if (lname.indexOf("sankranti") !== -1 && window.loadSankranti) {
            window.loadSankranti();
          }
          if (lname.indexOf("new year") !== -1 && window.loadNewYear) {
            window.loadNewYear();
          }
        } else {
          title.innerText = "No holiday today 🎯";
          if (dateEl) dateEl.innerText = "";
        }
      });
  }

  /* =====================================================
     5️⃣ LEAVE / INBOX LAYOUT (UI ONLY)
  ===================================================== */
  function refreshHomeInbox() {
    var user = getUser();
    if (!user || !user.role) return;

    var role = user.role.toUpperCase();
    var inbox = document.getElementById("homeInboxCard");
    var leaveCol = document.getElementById("leaveBalanceCol");
    if (!leaveCol) return;

    if (role === "EMPLOYEE") {
      if (inbox) inbox.classList.add("d-none");
      leaveCol.classList.remove("col-md-6");
      leaveCol.classList.add("col-12");
    } else {
      if (inbox) inbox.classList.remove("d-none");
      leaveCol.classList.remove("col-12");
      leaveCol.classList.add("col-md-6");
    }

    if (window.loadNotifications) window.loadNotifications();
  }

  /* =====================================================
     6️⃣ MIDNIGHT AUTO REFRESH (TRIGGERS ONLY)
  ===================================================== */
  function scheduleMidnightRefresh() {
    if (window.__homeMidnightScheduled) return;
    window.__homeMidnightScheduled = true;

    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);

    setTimeout(function () {
      loadTodayHolidayCard();
      if (window.loadTodayTime) window.loadTodayTime();

      window.__homeMidnightScheduled = false;
      scheduleMidnightRefresh();
    }, next - now);
  }

  /* =====================================================
     7️⃣ VIEW ATTENDANCE BUTTON (STRICT ROUTER)
  ===================================================== */
  function bindViewAttendance() {
    if (window.__viewAttendanceBound) return;
    window.__viewAttendanceBound = true;

    var btn = document.getElementById("viewAttendanceBtn");
    if (!btn) return;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.hash = "#/attendance";
    });
  }

  /* =====================================================
     8️⃣ HOME INIT (SPA SAFE)
  ===================================================== */
  function initHome() {
    if (!document.getElementById("homePage")) return false;

    loadTodayHolidayCard();
    refreshHomeInbox();
    scheduleMidnightRefresh();
    bindViewAttendance();

    // delegate dashboard data refresh
    if (window.loadTodayTime) window.loadTodayTime();

    return true;
  }

  function waitForHomeDom() {
    if (initHome()) return;

    var obs = new MutationObserver(function () {
      if (initHome()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function onRouteChange() {
    if (
      location.hash === "#/home" ||
      location.hash === "" ||
      location.hash === "#"
    ) {
      waitForHomeDom();
    }
  }

  onRouteChange();
  window.addEventListener("hashchange", onRouteChange);

})();
/* =========================
   END home.js
========================= */