const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   🔔 NOTIFICATION HELPER
========================= */
async function createNotification(userId, type, message) {
  try {
    const [result] = await db.query(
      `
      INSERT INTO notifications (user_id, type, message, is_read)
      VALUES (?, ?, ?, 0)
      `,
      [userId, type, message]
    );

    // 🔔 realtime push (non-blocking)
    pushNotification(userId, {
      id: result.insertId,
      type,
      message,
      created_at: new Date()
    });
  } catch (err) {
    console.error("Notification create failed:", err);
  }
}

/* =========================
   HELPER: USER → EMPLOYEE
========================= */
async function getEmployee(userId) {
  const [rows] = await db.query(
    `
    SELECT id, name, manager_id, user_id
    FROM employees
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  return rows[0];
}

/* =========================
   APPLY LEAVE
========================= */
router.post("/apply", verifyToken, async (req, res) => {
  try {
    const { from_date, to_date, leave_type, reason } = req.body;

    if (!from_date || !to_date || !leave_type) {
      return res.status(400).json({
        message: "from_date, to_date and leave_type are required"
      });
    }

    const from = new Date(from_date);
    const to = new Date(to_date);

    if (isNaN(from) || isNaN(to) || from > to) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const emp = await getEmployee(req.user.id);

    /* ✅ overlap protection */
    const [overlap] = await db.query(
      `
      SELECT 1
      FROM leaves
      WHERE employee_id = ?
        AND status IN ('PENDING','APPROVED')
        AND from_date <= ?
        AND to_date >= ?
      LIMIT 1
      `,
      [emp.id, to_date, from_date]
    );

    if (overlap.length) {
      return res.status(400).json({
        message: "Leave already applied for selected dates"
      });
    }

    /* ✅ insert leave */
    await db.query(
      `
      INSERT INTO leaves
        (employee_id, from_date, to_date, leave_type, reason, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
      `,
      [emp.id, from_date, to_date, leave_type, reason || null]
    );

    /* 🔔 notify manager */
    if (emp.manager_id) {
      const [mgr] = await db.query(
        "SELECT user_id FROM employees WHERE id = ?",
        [emp.manager_id]
      );

      if (mgr.length) {
        createNotification(
          mgr[0].user_id,
          "leave",
          `${emp.name} applied for leave`
        );
      }
    }

    res.json({
      status: "success",
      message: "Leave applied successfully"
    });

  } catch (err) {
    console.error("Apply leave error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   HR – ALL PENDING LEAVES
========================= */
router.get("/pending", verifyToken, async (req, res) => {
  if (!["hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        l.id,
        l.from_date,
        l.to_date,
        l.leave_type,
        DATEDIFF(l.to_date, l.from_date) + 1 AS days,
        e.name AS employee_name
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'PENDING'
      ORDER BY l.from_date ASC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Pending leaves fetch error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   APPROVE / REJECT LEAVE
========================= */
router.post("/:id/decision", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { decision } = req.body;
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return res.status(400).json({ message: "Invalid decision" });
  }

  try {
    const [result] = await db.query(
      `
      UPDATE leaves
      SET
        status = ?,
        approved_by = ?,
        approved_role = ?,
        approved_at = NOW()
      WHERE id = ? AND status = 'PENDING'
      `,
      [decision, req.user.id, req.user.role, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(400).json({
        message: "Leave already processed"
      });
    }

    /* 🔔 notify employee */
    const [emp] = await db.query(
      `
      SELECT e.user_id
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.id = ?
      `,
      [req.params.id]
    );

    if (emp.length) {
      createNotification(
        emp[0].user_id,
        "leave",
        `Your leave has been ${decision.toLowerCase()}`
      );
    }

    res.json({ status: "success" });

  } catch (err) {
    console.error("Leave decision error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   LEAVE BALANCE
========================= */
router.get("/balance", verifyToken, async (req, res) => {
  try {
    const emp = await getEmployee(req.user.id);

    const [rows] = await db.query(
      `
      SELECT
        lt.code AS leave_type,
        lt.name,
        lt.annual_quota,
        COALESCE(SUM(DATEDIFF(l.to_date, l.from_date) + 1), 0) AS used,
        GREATEST(
          lt.annual_quota -
          COALESCE(SUM(DATEDIFF(l.to_date, l.from_date) + 1), 0),
          0
        ) AS balance
      FROM leave_types lt
      LEFT JOIN leaves l
        ON l.leave_type = lt.code
        AND l.employee_id = ?
        AND l.status = 'APPROVED'
      GROUP BY lt.code, lt.name, lt.annual_quota
      ORDER BY lt.code
      `,
      [emp.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("Leave balance error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   PENDING LEAVES (MY TEAM)
========================= */
router.get("/pending/my-team", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const mgr = await getEmployee(req.user.id);

    let sql = `
      SELECT
        l.id,
        l.from_date,
        l.to_date,
        l.leave_type,
        DATEDIFF(l.to_date, l.from_date) + 1 AS days,
        e.name AS employee
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'PENDING'
    `;
    const params = [];

    if (req.user.role === "manager") {
      sql += " AND e.manager_id = ?";
      params.push(mgr.id);
    }

    sql += " ORDER BY l.from_date ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("Pending team leaves error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   TEAM ON LEAVE (TODAY)
========================= */
router.get("/team/on-leave", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const mgr = await getEmployee(req.user.id);

    let sql = `
      SELECT COUNT(*) AS count
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'APPROVED'
        AND CURDATE() BETWEEN l.from_date AND l.to_date
    `;
    const params = [];

    if (req.user.role === "manager") {
      sql += " AND e.manager_id = ?";
      params.push(mgr.id);
    }

    const [rows] = await db.query(sql, params);
    res.json({ count: rows[0].count });

  } catch (err) {
    console.error("Team on leave error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   USED LEAVES BY TYPE (SELF)
========================= */
router.get("/used/:type", verifyToken, async (req, res) => {
  try {
    const leaveType = req.params.type.toUpperCase();

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(from_date,'%d %b %Y') AS from_date,
        DATE_FORMAT(to_date,'%d %b %Y') AS to_date,
        (DATEDIFF(to_date, from_date) + 1) AS days,
        reason,
        status
      FROM leaves
      WHERE employee_id = (
        SELECT id FROM employees WHERE user_id = ?
      )
      AND leave_type = ?
      ORDER BY from_date DESC
      `,
      [req.user.id, leaveType]
    );

    res.json(rows);

  } catch (err) {
    console.error("Leave usage fetch failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
/* ======================================================       
    END routes/leaves.js       
====================================================== */