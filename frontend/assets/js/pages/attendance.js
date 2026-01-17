/* =====================================================
   attendance.js — FINAL, FULL, CONTRACT-LOCKED
   ROLE:
   - Attendance page controller ONLY
===================================================== */

/* ===== GLOBAL LIVE TIMER STATE ===== */
var liveBaseSeconds = 0;
var liveTimerInterval = null;

(function () {
  if (window.__attendanceLoaded) return;
  window.__attendanceLoaded = true;

  console.log("attendance.js loaded");

  /* ================= AUTH ================= */
  var token = localStorage.getItem("token") || "";
  function authHeaders() {
    return { Authorization: "Bearer " + token };
  }

  /* ================= UTIL ================= */
  function el(id) {
    return document.getElementById(id);
  }

  function set(id, val) {
    if (el(id)) el(id).innerText = val;
  }

  function fmtTime(ts) {
    if (!ts) return "--";
    var d = new Date(ts);
    return isNaN(d)
      ? "--"
      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDate(d) {
    if (!d) return "--";
    var dt = new Date(d);
    return isNaN(dt)
      ? "--"
      : dt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
  }

  function secToHHMM(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function secToHHMMSS(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return (
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0")
    );
  }

  /* ================= BUTTON LOCKING ================= */
  function toggleButtons(status) {
    var inBtn  = el("clockInBtn");
    var outBtn = el("clockOutBtn");
    var sbBtn  = el("startBreakBtn");
    var ebBtn  = el("endBreakBtn");

    [inBtn, outBtn, sbBtn, ebBtn].forEach(function (b) {
      if (!b) return;
      b.style.display = "none";
      b.disabled = true;
      b.classList.add("disabled");
    });

    if (status === "NOT_STARTED") {
      if (inBtn) {
        inBtn.style.display = "inline-block";
        inBtn.disabled = false;
        inBtn.classList.remove("disabled");
      }
    }

    if (status === "WORKING") {
      if (outBtn) {
        outBtn.style.display = "inline-block";
        outBtn.disabled = false;
        outBtn.classList.remove("disabled");
      }
      if (sbBtn) {
        sbBtn.style.display = "inline-block";
        sbBtn.disabled = false;
        sbBtn.classList.remove("disabled");
      }
    }

    if (status === "ON_BREAK") {
      if (outBtn) {
        outBtn.style.display = "inline-block";
        outBtn.disabled = false;
        outBtn.classList.remove("disabled");
      }
      if (ebBtn) {
        ebBtn.style.display = "inline-block";
        ebBtn.disabled = false;
        ebBtn.classList.remove("disabled");
      }
      if (sbBtn) {
        sbBtn.style.display = "inline-block";
        sbBtn.disabled = true;
        sbBtn.classList.add("disabled");
      }
    }
  }

  /* ================= LIVE TIMER ================= */
  function startLive() {
    var t = el("liveWorkTimer");
    if (!t) return;

    stopLive();
    liveTimerInterval = setInterval(function () {
      liveBaseSeconds++;
      t.innerText = secToHHMMSS(liveBaseSeconds);
    }, 1000);
  }

  function stopLive() {
    if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
  }

  /* ================= TODAY STATUS ================= */
  function loadToday() {
    fetch("/api/attendance/today", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : {}))
      .then(d => {
        var status = d.status || "NOT_STARTED";
        var worked = Number(d.worked_seconds || 0);
        var brk = Number(d.break_seconds || 0);

        liveBaseSeconds = worked;

        set(
          "attendanceStatusText",
          status === "WORKING" ? "Working" :
          status === "ON_BREAK" ? "On Break" :
          status === "CLOCKED_OUT" ? "Completed" :
          "Not started"
        );

        set("workedTime", secToHHMM(worked));
        set("breakTime", secToHHMM(brk));
        set("clockInAtText", d.clock_in_at ? fmtTime(d.clock_in_at) : "--");

        toggleButtons(status);

        stopLive();
        if (status === "WORKING") startLive();
      })
      .catch(e => console.warn("today load failed", e));
  }

  /* ================= ATTENDANCE HISTORY (LOCKED) ================= */
  function loadHistory() {
    var tbody = el("attendanceTableBody");
    if (!tbody) return;

    fetch("/api/attendance", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) {
          tbody.innerHTML =
            "<tr><td colspan='4' class='text-center text-muted'>No records</td></tr>";
          return;
        }

        tbody.innerHTML = rows.map(r => (
          "<tr>" +
            "<td>" + fmtDate(r.date) + "</td>" +
            "<td>" + (r.check_in ? fmtTime(r.check_in) : "--") + "</td>" +
            "<td>" + (r.check_out ? fmtTime(r.check_out) : "--") + "</td>" +
            "<td>" + Number(r.hours || 0).toFixed(2) + "</td>" +
          "</tr>"
        )).join("");
      })
      .catch(() => {
        tbody.innerHTML =
          "<tr><td colspan='4' class='text-center text-danger'>Failed to load</td></tr>";
      });
  }

  /* ================= BUTTON WIRING ================= */
  function wireButtons() {
    if (el("clockInBtn")) {
      el("clockInBtn").onclick = function () {
        fetch("/api/attendance/clock-in", {
          method: "POST",
          headers: authHeaders()
        }).then(() => {
          loadToday();
          loadHistory();
        });
      };
    }

    if (el("clockOutBtn")) {
      el("clockOutBtn").onclick = function () {
        var p = prompt("Project:");
        var t = prompt("Task:");
        if (!p || !t) return;

        fetch("/api/attendance/clock-out", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ project: p, task: t })
        }).then(() => {
          loadToday();
          loadHistory();
        });
      };
    }

    if (el("startBreakBtn")) {
      el("startBreakBtn").onclick = function () {
        if (el("startBreakBtn").disabled) return;
        fetch("/api/attendance/start-break", {
          method: "POST",
          headers: authHeaders()
        }).then(loadToday);
      };
    }

    if (el("endBreakBtn")) {
      el("endBreakBtn").onclick = function () {
        fetch("/api/attendance/end-break", {
          method: "POST",
          headers: authHeaders()
        }).then(loadToday);
      };
    }
  }

  /* ================= INIT ================= */
  window.onAttendanceRendered = function () {
    wireButtons();
    loadToday();
    loadHistory();
  };

  window.refreshAttendanceToday = loadToday;

})();
/* =====================================================    
    END attendance.js
===================================================== */