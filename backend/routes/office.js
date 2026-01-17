const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   GET ACTIVE OFFICE LOCATION
   GET /api/office-locations/active
========================= */
router.get("/active", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM office_locations WHERE active = 1 LIMIT 1"
    );

    res.json(rows[0] || null);

  } catch (err) {
    console.error("❌ Office location error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
/* =========================
   END routes/office.js
========================= */