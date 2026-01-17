const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   HELPER: SEND NOTIFICATION
========================= */
async function sendNotification(userId, message) {
  try {
    const [result] = await db.query(
      "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)",
      [userId, message]
    );

    pushNotification(userId, {
      type: "NOTIFICATION",
      id: result.insertId,
      message,
      is_read: 0,
      created_at: new Date()
    });
  } catch (err) {
    console.error("Notification insert failed:", err);
  }
}

/* =========================
   HELPER: USER → EMPLOYEE
========================= */
async function getEmployeeId(userId) {
  const [rows] = await db.query(
    "SELECT id FROM employees WHERE user_id = ?",
    [userId]
  );

  if (!rows.length) {
    throw new Error("Employee not found for user_id=" + userId);
  }

  return rows[0].id;
}

/* =====================================================
   TODAY STATUS (LIVE)
===================================================== */
router.get("/today", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);

    const [rows] = await db.query(
      `
      SELECT
        clock_in,
        break_start,
        status,
        total_work_minutes,
        total_break_minutes,

        CASE
          WHEN status = 'WORKING'
            THEN TIMESTAMPDIFF(SECOND, clock_in, NOW())
                 - (total_break_minutes * 60)

          WHEN status = 'ON_BREAK'
            THEN TIMESTAMPDIFF(SECOND, clock_in, break_start)
                 - (total_break_minutes * 60)

          ELSE (total_work_minutes * 60)
        END AS worked_seconds,

        CASE
          WHEN status = 'ON_BREAK' AND break_start IS NOT NULL
            THEN (total_break_minutes * 60)
                 + TIMESTAMPDIFF(SECOND, break_start, NOW())
          ELSE (total_break_minutes * 60)
        END AS break_seconds
      FROM attendance_logs
      WHERE employee_id = ?
        AND log_date = CURDATE()
      LIMIT 1
      `,
      [empId]
    );

    if (!rows.length || !rows[0].clock_in) {
      return res.json({ status: "NOT_STARTED" });
    }

    res.json({
      status: rows[0].status,
      clock_in_at: rows[0].clock_in,
      worked_seconds: Math.max(rows[0].worked_seconds, 0),
      break_seconds: Math.max(rows[0].break_seconds, 0)
    });

  } catch (err) {
    console.error("Today status error:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   CLOCK IN
===================================================== */
router.post("/clock-in", verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body || {};
    const empId = await getEmployeeId(req.user.id);

    await db.query(
      `
      INSERT INTO attendance_logs (
        employee_id, log_date, clock_in,
        latitude, longitude, accuracy, status
      )
      VALUES (?, CURDATE(), NOW(), ?, ?, ?, 'WORKING')
      ON DUPLICATE KEY UPDATE
        clock_in = IF(clock_in IS NULL, NOW(), clock_in),
        status = 'WORKING'
      `,
      [empId, latitude || null, longitude || null, accuracy || null]
    );

    sendNotification(req.user.id, "Clock-in successful");
    res.json({ success: true });

  } catch (err) {
    console.error("Clock-in error:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   START BREAK
===================================================== */
router.post("/start-break", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);

    const [result] = await db.query(
      `
      UPDATE attendance_logs
      SET break_start = NOW(), status = 'ON_BREAK'
      WHERE employee_id = ?
        AND log_date = CURDATE()
        AND status = 'WORKING'
        AND break_start IS NULL
      `,
      [empId]
    );

    if (!result.affectedRows) {
      return res.status(400).json({ message: "Invalid break start" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Start break error:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   END BREAK
===================================================== */
router.post("/end-break", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);

    const [result] = await db.query(
      `
      UPDATE attendance_logs
      SET
        total_break_minutes =
          total_break_minutes +
          ROUND(TIMESTAMPDIFF(SECOND, break_start, NOW()) / 60),
        break_start = NULL,
        status = 'WORKING'
      WHERE employee_id = ?
        AND log_date = CURDATE()
        AND status = 'ON_BREAK'
        AND break_start IS NOT NULL
      `,
      [empId]
    );

    if (!result.affectedRows) {
      return res.status(400).json({ message: "Invalid break end" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("End break error:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   CLOCK OUT
===================================================== */
router.post("/clock-out", verifyToken, async (req, res) => {
  try {
    const { project, task } = req.body || {};
    if (!project || !task) {
      return res.status(400).json({ message: "Project and task are required" });
    }

    const empId = await getEmployeeId(req.user.id);

    const [result] = await db.query(
      `
      UPDATE attendance_logs
      SET
        project = ?,
        task = ?,
        total_break_minutes =
          total_break_minutes +
          IF(
            status = 'ON_BREAK' AND break_start IS NOT NULL,
            ROUND(TIMESTAMPDIFF(SECOND, break_start, NOW()) / 60),
            0
          ),
        break_start = NULL,
        clock_out = NOW(),
        total_work_minutes =
          GREATEST(
            TIMESTAMPDIFF(MINUTE, clock_in, NOW()) - total_break_minutes,
            0
          ),
        status = 'CLOCKED_OUT'
      WHERE employee_id = ?
        AND log_date = CURDATE()
        AND status IN ('WORKING','ON_BREAK')
      `,
      [project, task, empId]
    );

    if (!result.affectedRows) {
      return res.status(400).json({ message: "Already clocked out" });
    }

    sendNotification(req.user.id, "Clock-out successful");
    res.json({ success: true });

  } catch (err) {
    console.error("Clock-out error:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   ATTENDANCE HISTORY (SELF)
   🔒 CONTRACT LOCKED
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(log_date, '%Y-%m-%d') AS date,
        clock_in  AS check_in,
        clock_out AS check_out,
        ROUND(total_work_minutes / 60, 2) AS hours
      FROM attendance_logs
      WHERE employee_id = ?
      ORDER BY log_date DESC
      LIMIT 30
      `,
      [empId]
    );

    res.json(Array.isArray(rows) ? rows : []);

  } catch (err) {
    console.error("Attendance history error:", err);
    res.status(500).json({ message: "Failed to load attendance history" });
  }
});
/* =====================================================
   TEAM ATTENDANCE SUMMARY (SAFE CONTRACT)
   - No side effects
   - No dependency on clock/break logic
===================================================== */
router.get("/team/summary", verifyToken, async (req, res) => {
  try {
    const [teamRows] = await db.query(
      `
      SELECT e.id
      FROM employees e
      JOIN employees m ON e.manager_id = m.id
      WHERE m.user_id = ?
        AND e.active = 1
      `,
      [req.user.id]
    );

    const total = teamRows.length;

    if (!total) {
      return res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
    }

    const empIds = teamRows.map(r => r.id);

    const [[leave]] = await db.query(
      `
      SELECT COUNT(DISTINCT employee_id) AS cnt
      FROM leaves
      WHERE employee_id IN (?)
        AND status = 'Approved'
        AND CURDATE() BETWEEN from_date AND to_date
      `,
      [empIds]
    );

    const [[present]] = await db.query(
      `
      SELECT COUNT(DISTINCT employee_id) AS cnt
      FROM attendance_logs
      WHERE employee_id IN (?)
        AND log_date = CURDATE()
        AND clock_in IS NOT NULL
      `,
      [empIds]
    );

    const onLeave = leave?.cnt || 0;
    const presentCnt = present?.cnt || 0;
    const absent = Math.max(total - presentCnt - onLeave, 0);

    res.json({
      present: presentCnt,
      total,
      on_leave: onLeave,
      absent
    });

  } catch (err) {
    console.error("Team summary error:", err);
    // 🔒 NEVER break UI
    res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
  }
});
/* =====================================================
   TEAM ATTENDANCE TODAY DETAILS (SAFE STUB)
   - Prevents dashboard cascade failures
===================================================== */
router.get("/team/today/details", verifyToken, async (req, res) => {
  res.json([]); // 🔒 Empty is valid and UI-safe
});

module.exports = router;
/* =====================================================
   END attendance.js
===================================================== */