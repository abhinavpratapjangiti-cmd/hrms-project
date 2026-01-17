const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   ORG CHART
   GET /api/org
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        e.id,
        e.name,
        u.role,
        e.manager_id,
        m.name AS manager_name
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY manager_name, e.name
      `
    );

    res.json(rows);

  } catch (err) {
    console.error("ORG CHART ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
/* =========================        
    END routes/org.js       
========================= */