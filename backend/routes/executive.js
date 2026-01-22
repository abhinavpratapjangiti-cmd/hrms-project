const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   EXECUTIVE ACTIONS API (APPWRITE-READY)
   Base path: /api/executive
===================================================== */

/**
 * GET /api/executive/actions
 * Purpose: Executive insights & recommendations
 * Phase 1: Static response (frontend computes insights)
 * Phase 2: Appwrite-backed insights
 */
router.get("/actions", verifyToken, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();

    // Optional future gate (not enforced yet)
    // if (!["admin", "hr", "executive"].includes(role)) {
    //   return res.status(403).json({ message: "Forbidden" });
    // }

    res.json({
      status: "OK",
      source: "appwrite-ready",
      message: "Executive actions endpoint active",
      generated_at: new Date().toISOString()
    });

  } catch (err) {
    console.error("Executive actions API failed:", err.message);
    res.status(500).json({
      message: "Failed to load executive actions"
    });
  }
});

module.exports = router;

/* =====================================================
   END routes/executive.js
===================================================== */
