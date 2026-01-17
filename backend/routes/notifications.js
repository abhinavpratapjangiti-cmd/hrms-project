const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   🔔 GET UNREAD NOTIFICATIONS ONLY
   Bell + dropdown
   GET /api/notifications
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT id, type, message, created_at
      FROM notifications
      WHERE user_id = ?
        AND is_read = 0
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [req.user.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ Notifications error:", err);
    res.status(500).json([]);
  }
});

/* =========================
   📥 UNREAD COUNT (BELL + HOME INBOX)
   GET /api/notifications/inbox/count
========================= */
router.get("/inbox/count", verifyToken, async (req, res) => {
  try {
    const [[row]] = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ?
        AND (is_read = 0 OR is_read IS NULL)
      `,
      [req.user.id]
    );

    res.json({ count: row.count });

  } catch (err) {
    console.error("❌ Inbox count error:", err);
    res.json({ count: 0 });
  }
});

/* =========================
   ✅ MARK ALL AS READ
   PUT /api/notifications/read-all
========================= */
router.put("/read-all", verifyToken, async (req, res) => {
  try {
    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
        AND is_read = 0
      `,
      [req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Read-all error:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   ✅ MARK SINGLE AS READ
   PUT /api/notifications/:id/read
========================= */
router.put("/:id/read", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
        AND user_id = ?
      `,
      [id, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Mark-read error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
/* ======================================================       
    END routes/notifications.js       
====================================================== */