const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   SHOULD SHOW FESTIVAL
========================= */
router.get("/should-show", verifyToken, async (req, res) => {
  try {
    const { festival } = req.query;
    const year = new Date().getFullYear();

    if (!festival) {
      return res.status(400).json({ show: false });
    }

    const [rows] = await db.query(
      `
      SELECT 1
      FROM festival_views
      WHERE user_id = ? AND festival = ? AND year = ?
      `,
      [req.user.id, festival, year]
    );

    res.json({ show: rows.length === 0 });

  } catch (err) {
    console.error("Festival should-show error:", err);
    res.status(500).json({ show: false });
  }
});

/* =========================
   MARK FESTIVAL VIEWED
========================= */
router.post("/mark-viewed", verifyToken, async (req, res) => {
  try {
    const { festival } = req.body;
    const year = new Date().getFullYear();

    if (!festival) {
      return res.status(400).json({ success: false });
    }

    await db.query(
      `
      INSERT IGNORE INTO festival_views (user_id, festival, year)
      VALUES (?, ?, ?)
      `,
      [req.user.id, festival, year]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Festival mark-viewed error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
/* ======================================================       
    END routes/festival.js       
====================================================== */