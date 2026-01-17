const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   🔔 HELPER: NOTIFICATION
========================= */
async function notifyUser(userId, message) {
  try {
    const [result] = await db.query(
      `
      INSERT INTO notifications (user_id, type, message, is_read)
      VALUES (?, 'timesheet', ?, 0)
      `,
      [userId, message]
    );

    // 🔔 REALTIME PUSH (non-blocking)
    pushNotification(userId, {
      id: result.insertId,
      type: "timesheet",
      message,
      created_at: new Date()
    });
  } catch (err) {
    console.error("Notify user failed:", err);
  }
}

/* =========================
   MANAGER SUMMARY
   GET /api/manager/summary
========================= */
router.get("/summary", verifyToken, async (req, res) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const managerEmpId = req.user.employee_id;
  if (!managerEmpId) {
    return res.status(400).json({ message: "Employee mapping missing" });
  }

  try {
    const [[row]] = await db.query(
      `
      SELECT
        COALESCE((
          SELECT COUNT(DISTINCT a.employee_id)
          FROM attendance a
          JOIN employees e ON e.id = a.employee_id
          WHERE DATE(a.created_at) = CURDATE()
            AND e.manager_id = ?
        ), 0) AS present,

        COALESCE((
          SELECT COUNT(*)
          FROM employees
          WHERE manager_id = ?
        ), 0) AS total,

        COALESCE((
          SELECT COUNT(DISTINCT l.employee_id)
          FROM leaves l
          JOIN employees e ON e.id = l.employee_id
          WHERE l.status = 'Approved'
            AND CURDATE() BETWEEN l.from_date AND l.to_date
            AND e.manager_id = ?
        ), 0) AS on_leave,

        COALESCE((
          SELECT COUNT(*)
          FROM timesheets t
          JOIN employees e ON e.id = t.employee_id
          WHERE t.status = 'Submitted'
            AND e.manager_id = ?
        ), 0) AS pending_timesheets
      `,
      [managerEmpId, managerEmpId, managerEmpId, managerEmpId]
    );

    res.json(row);

  } catch (err) {
    console.error("Manager summary error:", err);
    res.status(500).json({ message: "Summary failed" });
  }
});

/* =========================
   PENDING TIMESHEETS
   GET /api/manager/timesheets/pending
========================= */
router.get("/timesheets/pending", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    // HR / Admin → all
    if (req.user.role !== "manager") {
      const [rows] = await db.query(
        `
        SELECT
          t.id,
          t.work_date,
          t.hours,
          e.name AS employee
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        WHERE t.status = 'Submitted'
        ORDER BY t.work_date DESC
        `
      );
      return res.json(rows);
    }

    // Manager → only reportees
    const managerEmpId = req.user.employee_id;
    if (!managerEmpId) {
      return res.status(400).json({ message: "Employee mapping missing" });
    }

    const [rows] = await db.query(
      `
      SELECT
        t.id,
        t.work_date,
        t.hours,
        e.name AS employee
      FROM timesheets t
      JOIN employees e ON e.id = t.employee_id
      WHERE e.manager_id = ?
        AND t.status = 'Submitted'
      ORDER BY t.work_date DESC
      `,
      [managerEmpId]
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   APPROVE / REJECT TIMESHEET
   POST /api/manager/timesheets/:id/:action
========================= */
router.post("/timesheets/:id/:action", verifyToken, async (req, res) => {
  const { id, action } = req.params;
  const status = action === "approve" ? "Approved" : "Rejected";

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const approverEmpId = req.user.employee_id;

  try {
    const [[ts]] = await db.query(
      `
      SELECT
        t.employee_id,
        t.work_date,
        e.manager_id,
        u.id AS user_id
      FROM timesheets t
      JOIN employees e ON e.id = t.employee_id
      JOIN users u ON u.id = e.user_id
      WHERE t.id = ?
      `,
      [id]
    );

    if (!ts) {
      return res.status(404).json({ message: "Timesheet not found" });
    }

    // ❌ No self approval
    if (req.user.role === "manager" && ts.employee_id === approverEmpId) {
      return res.status(403).json({ message: "Self approval not allowed" });
    }

    // ❌ Manager ownership check
    if (req.user.role === "manager" && ts.manager_id !== approverEmpId) {
      return res.status(403).json({ message: "Not your reportee" });
    }

    await db.query(
      `
      UPDATE timesheets
      SET status = ?, approved_by = ?, approved_at = NOW()
      WHERE id = ?
      `,
      [status, req.user.id, id]
    );

    await notifyUser(
      ts.user_id,
      `Your timesheet for ${ts.work_date} was ${status}`
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
/* ======================================================      
    END routes/manager.js       
====================================================== */