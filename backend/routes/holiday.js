const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");

const DB_ID = process.env.APPWRITE_DB_ID;
const FESTIVAL_COL = process.env.APPWRITE_FESTIVAL_COLLECTION_ID;

/* =====================================================
   SHOULD SHOW FESTIVAL (APPWRITE)
   GET /api/festival/should-show?festival=diwali
===================================================== */
router.get("/should-show", verifyToken, async (req, res) => {
  try {
    const { festival } = req.query;
    const year = new Date().getFullYear();

    if (!festival) {
      return res.json({ show: false });
    }

    const result = await databases.listDocuments(
      DB_ID,
      FESTIVAL_COL,
      [
        Query.equal("user_id", req.user.id),
        Query.equal("festival", festival),
        Query.equal("year", year),
        Query.limit(1)
      ]
    );

    // ✅ Same logic as MySQL
    res.json({ show: result.total === 0 });

  } catch (err) {
    console.error("Festival should-show error:", err.message);
    res.json({ show: false }); // UI-safe
  }
});

/* =====================================================
   MARK FESTIVAL AS VIEWED (APPWRITE)
   POST /api/festival/mark-viewed
===================================================== */
router.post("/mark-viewed", verifyToken, async (req, res) => {
  try {
    const { festival } = req.body;
    const year = new Date().getFullYear();

    if (!festival) {
      return res.json({ success: false });
    }

    // 🔒 Idempotent insert (check first)
    const existing = await databases.listDocuments(
      DB_ID,
      FESTIVAL_COL,
      [
        Query.equal("user_id", req.user.id),
        Query.equal("festival", festival),
        Query.equal("year", year),
        Query.limit(1)
      ]
    );

    if (existing.total === 0) {
      await databases.createDocument(
        DB_ID,
        FESTIVAL_COL,
        "unique()",
        {
          user_id: req.user.id,
          festival,
          year,
          created_at: new Date().toISOString()
        }
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Festival mark-viewed error:", err.message);
    res.json({ success: false });
  }
});

module.exports = router;

/* =====================================================
   END routes/festival.js (APPWRITE)
===================================================== */
