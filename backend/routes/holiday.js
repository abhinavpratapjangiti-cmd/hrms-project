const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   GET /api/holiday/nearest
========================= */
router.get("/nearest", verifyToken, async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        name,
        DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
        description
      FROM holidays
      WHERE is_public = 1
        AND holiday_date >= CURDATE()
      ORDER BY holiday_date ASC
      LIMIT 1
    `;

    const [rows] = await db.query(sql);

    if (!rows.length) return res.json({});

    const h = rows[0];

    // Safe readable date (no timezone shift)
    const date_readable = new Date(h.holiday_date + "T00:00:00")
      .toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });

    res.json({
      id: h.id,
      name: h.name,
      holiday_date: h.holiday_date,
      description: h.description,
      date_readable
    });

  } catch (err) {
    console.error("Holiday nearest DB error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   GET /api/holiday
   (Upcoming holidays list)
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const { from, to } = req.query;

    let sql = `
      SELECT
        id,
        name,
        DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
        description,
        is_public
      FROM holidays
      WHERE 1=1
    `;

    const params = [];

    if (from && to) {
      sql += " AND holiday_date BETWEEN ? AND ?";
      params.push(from, to);
    } else if (from) {
      sql += " AND holiday_date >= ?";
      params.push(from);
    } else if (to) {
      sql += " AND holiday_date <= ?";
      params.push(to);
    } else {
      sql += " AND holiday_date >= CURDATE()";
    }

    sql += " ORDER BY holiday_date ASC LIMIT 5";

    const [rows] = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("Holiday list DB error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   POST /api/holiday
   (ADMIN ONLY)
========================= */
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    const { name, holiday_date, description = null, is_public = 1 } = req.body;

    if (!name || !holiday_date) {
      return res.status(400).json({
        message: "name and holiday_date required"
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO holidays (name, holiday_date, description, is_public)
      VALUES (?, ?, ?, ?)
      `,
      [name, holiday_date, description, is_public ? 1 : 0]
    );

    res.json({ status: "success", id: result.insertId });

  } catch (err) {
    console.error("Holiday create DB error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Holiday already exists for that date" });
    }

    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   DELETE /api/holiday/:id
   (ADMIN ONLY)
========================= */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    const [result] = await db.query(
      "DELETE FROM holidays WHERE id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ status: "success" });

  } catch (err) {
    console.error("Holiday delete DB error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   GET /api/holiday/today
========================= */
router.get("/today", verifyToken, async (req, res) => {
  try {
    const sql = `
      SELECT
        name,
        description
      FROM holidays
      WHERE holiday_date = CURDATE()
        AND is_public = 1
      LIMIT 1
    `;

    const [rows] = await db.query(sql);

    if (!rows.length) return res.json(null);

    res.json(rows[0]);

  } catch (err) {
    console.error("Holiday today error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
