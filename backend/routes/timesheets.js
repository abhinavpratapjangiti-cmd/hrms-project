const express = require("express");
const router = express.Router();
const db = require("../db");
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   1️⃣ MY TIMESHEETS – CALENDAR (UI)
===================================================== */
router.get("/my/calendar", verifyToken, async (req, res) => {
  try {
    const { month } = req.query;
    const empId = req.user.employee_id;

    if (!empId || !month) {
      return res.status(400).json({ message: "Employee or month missing" });
    }

    const [rows] = await db.query(
      `
      WITH RECURSIVE calendar AS (
        SELECT DATE(CONCAT(?, '-01')) AS work_date
        UNION ALL
        SELECT DATE_ADD(work_date, INTERVAL 1 DAY)
        FROM calendar
        WHERE work_date < LAST_DAY(CONCAT(?, '-01'))
      )
      SELECT
        c.work_date,
        DAYNAME(c.work_date) AS day,

        CASE WHEN ts.status = 'Approved' THEN TIME(al.clock_in) END AS start_time,
        CASE WHEN ts.status = 'Approved' THEN TIME(al.clock_out) END AS end_time,

        CASE WHEN ts.status = 'Approved' THEN ts.project END AS project,
        CASE WHEN ts.status = 'Approved' THEN ts.task END AS task,

        ts.hours,
        ts.status,

        CASE
          WHEN h.holiday_date IS NOT NULL THEN 'HOL'
          WHEN DAYOFWEEK(c.work_date) IN (1,7) THEN 'WO'
          WHEN ts.status = 'Approved' THEN 'P'
          ELSE ''
        END AS type

      FROM calendar c
      LEFT JOIN attendance_logs al
        ON al.employee_id = ?
       AND al.log_date = c.work_date
      LEFT JOIN timesheets ts
        ON ts.employee_id = ?
       AND ts.work_date = c.work_date
      LEFT JOIN holidays h
        ON h.holiday_date = c.work_date
      ORDER BY c.work_date
      `,
      [month, month, empId, empId]
    );

    res.json(rows);
  } catch (err) {
    console.error("My calendar error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   2️⃣ TEAM APPROVAL – API
===================================================== */
router.get("/approval", verifyToken, async (req, res) => {
  try {
    const { month } = req.query;
    const { role, employee_id: managerId } = req.user;

    if (!month) return res.status(400).json({ message: "Month missing" });
    if (!["manager", "hr", "admin"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [rows] = await db.query(
      `
      SELECT
        t.id,
        e.name AS employee_name,
        t.work_date,
        t.project,
        t.task,
        t.hours,
        t.status
      FROM timesheets t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.status = 'Submitted'
        AND DATE_FORMAT(t.work_date, '%Y-%m') = ?
        AND (
          ? IN ('hr','admin')
          OR e.manager_id = ?
        )
      ORDER BY t.work_date
      `,
      [month, role, managerId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Approval list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   3️⃣ UPDATE TIMESHEET STATUS
===================================================== */
router.put("/:id/status", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (!["manager", "hr", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [result] = await db.query(
      `
      UPDATE timesheets
      SET status = ?, approved_by = ?, approved_at = NOW()
      WHERE id = ? AND status = 'Submitted'
      `,
      [status, req.user.id, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Timesheet not found or already processed"
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   4️⃣ MY TIMESHEET – OFFICIAL EXCEL
===================================================== */
router.get("/my/calendar/excel", verifyToken, async (req, res) => {
  try {
    const { month } = req.query;
    const empId = req.user.employee_id;

    if (!empId || !month) {
      return res.status(400).json({ message: "Employee or month missing" });
    }

    const [[emp]] = await db.query(
      `
      SELECT name, department, designation, work_location, client_name
      FROM employees WHERE id = ?
      `,
      [empId]
    );

    const [rows] = await db.query(
      `
      SELECT
        t.work_date,
        DAYNAME(t.work_date) AS day,
        t.project,
        t.task,
        t.hours,
        t.status
      FROM timesheets t
      WHERE t.employee_id = ?
        AND DATE_FORMAT(t.work_date, '%Y-%m') = ?
      ORDER BY t.work_date
      `,
      [empId, month]
    );

    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("Timesheet");

    sh.columns = [
      { header: "Date", width: 15 },
      { header: "Day", width: 12 },
      { header: "Project", width: 25 },
      { header: "Task", width: 30 },
      { header: "Hours", width: 10 },
      { header: "Status", width: 15 }
    ];

    sh.addRow([
      `Employee: ${emp.name}`,
      `Department: ${emp.department}`,
      `Designation: ${emp.designation}`,
      `Client: ${emp.client_name || "-"}`,
      `Month: ${month}`
    ]);
    sh.addRow([]);

    sh.getRow(3).font = { bold: true };

    rows.forEach(r => {
      sh.addRow([
        r.work_date.toLocaleDateString("en-GB"),
        r.day,
        r.project || "-",
        r.task || "-",
        r.hours || "-",
        r.status
      ]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Timesheet-${month}.xlsx`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ message: "Export failed" });
  }
});

/* =====================================================
   5️⃣ PENDING TIMESHEETS (MY TEAM)
===================================================== */
router.get("/pending/my-team", verifyToken, async (req, res) => {
  try {
    if (!["manager", "hr", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    let sql = `
      SELECT COUNT(*) AS count
      FROM timesheets t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.status = 'Submitted'
    `;
    const params = [];

    if (req.user.role === "manager") {
      sql += " AND e.manager_id = ?";
      params.push(req.user.employee_id);
    }

    const [[row]] = await db.query(sql, params);
    res.json({ count: row.count });
  } catch (err) {
    console.error("Pending count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
/* =====================================================
   END routes/timesheets.js
===================================================== */