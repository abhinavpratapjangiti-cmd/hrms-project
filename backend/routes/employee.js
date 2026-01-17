const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   HELPER: USER → EMPLOYEE ID
========================= */
async function getEmployeeIdByUser(userId) {
  const [rows] = await db.query(
    "SELECT id FROM employees WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (!rows.length) throw new Error("Employee not found");
  return rows[0].id;
}

/* =========================
   EMPLOYEE SEARCH (HR / ADMIN / MANAGER)
========================= */
router.get("/search", verifyToken, async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.user.role?.toLowerCase();

  if (q.length < 2) return res.json([]);
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json([]);
  }

  try {
    let sql = `
      SELECT
        e.id,
        e.name,
        e.emp_code,
        e.designation,
        e.department
      FROM employees e
      WHERE (
        e.name LIKE ?
        OR e.emp_code LIKE ?
      )
    `;
    const params = [`%${q}%`, `%${q}%`];

    if (role === "manager") {
      const managerEmpId = await getEmployeeIdByUser(req.user.id);
      sql += " AND e.manager_id = ?";
      params.push(managerEmpId);
    }

    sql += " ORDER BY e.name LIMIT 10";

    const [rows] = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("EMP SEARCH ERROR:", err);
    res.json([]);
  }
});

/* =========================
   GET ALL EMPLOYEES (ADMIN / HR)
========================= */
router.get("/", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        e.id,
        e.name,
        e.email,
        u.role,
        e.department,
        e.manager_id,
        e.active
      FROM employees e
      JOIN users u ON u.id = e.user_id
      ORDER BY e.name
      `
    );

    res.json(rows);

  } catch (err) {
    console.error("EMP LIST ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   GET MY PROFILE (ME PAGE)
========================= */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        e.id,
        e.name,
        e.email,
        e.employment_type,
        u.role,
        u.profile_photo,
        e.department,
        e.client_name,
        e.work_location,
        e.designation,
        DATE_FORMAT(e.date_of_joining,'%Y-%m-%d') AS date_of_joining,
        e.manager_id,
        m.name AS manager_name,
        e.active,
        CASE WHEN e.active = 1 THEN 'Active' ELSE 'Inactive' END AS status
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.user_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("GET /employees/me ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   GET MY TIMELINE (CAREER)
========================= */
router.get("/me/timeline", verifyToken, async (req, res) => {
  try {
    const employeeId = await getEmployeeIdByUser(req.user.id);
    const timeline = [];

    // JOIN DATE
    const [[emp]] = await db.query(
      `
      SELECT DATE_FORMAT(date_of_joining,'%Y-%m-%d') AS join_date
      FROM employees
      WHERE id = ?
      `,
      [employeeId]
    );

    if (emp?.join_date) {
      timeline.push({
        label: "Joined LovasIT",
        date: emp.join_date
      });
    }

    // ROLE HISTORY
    const [history] = await db.query(
      `
      SELECT
        old_designation,
        new_designation,
        DATE_FORMAT(changed_at,'%Y-%m-%d') AS date
      FROM employee_role_history
      WHERE employee_id = ?
      ORDER BY changed_at
      `,
      [employeeId]
    );

    history.forEach(h => {
      timeline.push({
        label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
        date: h.date
      });
    });

    res.json(timeline);

  } catch (err) {
    console.error("ME TIMELINE ERROR:", err);
    res.json([]); // fail-safe for Me page
  }
});

/* =========================
   GET EMPLOYEE BY ID
========================= */
router.get("/:id", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    let sql = `
      SELECT
        e.id,
        e.name,
        u.email,
        e.employment_type,
        u.role,
        u.profile_photo,
        e.department,
        e.client_name,
        e.work_location,
        e.designation,
        DATE_FORMAT(e.date_of_joining,'%Y-%m-%d') AS date_of_joining,
        e.manager_id,
        m.name AS manager_name,
        e.active,
        CASE WHEN e.active = 1 THEN 'Active' ELSE 'Inactive' END AS status
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.id = ?
    `;
    const params = [req.params.id];

    if (role === "manager") {
      const managerEmpId = await getEmployeeIdByUser(req.user.id);
      sql += " AND e.manager_id = ?";
      params.push(managerEmpId);
    }

    sql += " LIMIT 1";

    const [rows] = await db.query(sql, params);

    if (!rows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("GET /employees/:id ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   EMPLOYEE TIMELINE BY ID
========================= */
router.get("/:id/timeline", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const employeeId = req.params.id;
    const timeline = [];

    const [[join]] = await db.query(
      `
      SELECT DATE_FORMAT(date_of_joining,'%Y-%m-%d') AS join_date
      FROM employees
      WHERE id = ?
      `,
      [employeeId]
    );

    if (join?.join_date) {
      timeline.push({
        label: "Joined LovasIT",
        date: join.join_date
      });
    }

    const [history] = await db.query(
      `
      SELECT
        old_designation,
        new_designation,
        DATE_FORMAT(changed_at,'%Y-%m-%d') AS date
      FROM employee_role_history
      WHERE employee_id = ?
      ORDER BY changed_at
      `,
      [employeeId]
    );

    history.forEach(h => {
      timeline.push({
        label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
        date: h.date
      });
    });

    res.json(timeline);

  } catch (err) {
    console.error("EMPLOYEE TIMELINE ERROR:", err);
    res.json([]);
  }
});

/* =========================
   UPDATE EMPLOYEE ROLE
========================= */
router.put("/:id/role", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const employeeId = req.params.id;
  const { newDesignation } = req.body;

  if (!newDesignation) {
    return res.status(400).json({ message: "New designation required" });
  }

  try {
    const [[emp]] = await db.query(
      "SELECT designation FROM employees WHERE id = ?",
      [employeeId]
    );

    if (!emp) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (emp.designation === newDesignation) {
      return res.status(400).json({ message: "No change detected" });
    }

    await db.query(
      "UPDATE employees SET designation = ? WHERE id = ?",
      [newDesignation, employeeId]
    );

    await db.query(
      `
      INSERT INTO employee_role_history
        (employee_id, old_designation, new_designation, changed_by, changed_at)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [employeeId, emp.designation, newDesignation, req.user.id]
    );

    res.json({ message: "Role updated successfully" });

  } catch (err) {
    console.error("ROLE UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

module.exports = router;
/* ======================================================
   END routes/employee.js
====================================================== */
