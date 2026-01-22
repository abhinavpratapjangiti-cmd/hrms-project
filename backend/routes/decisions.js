const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

/* ======================================================
   DECISION ENGINE – PROFILE (v1.1)
   PURPOSE:
   - Centralized decision logic
   - No DB writes
   - No hard dependency on Appwrite / MySQL
   - Safe defaults for production
   - Frontend contract locked
====================================================== */

/*
  Mounted at:
  app.use("/api/decisions", decisionsRoutes)

  GET /api/decisions/profile
*/
router.get("/profile", verifyToken, (req, res) => {
  const role = String(req.user?.role || "").toLowerCase();

  /* ======================================================
     BASE DECISIONS (FAIL-OPEN DEFAULTS)
  ====================================================== */
  const decisions = {
    canApplyLeave: true,
    canEditProfile: true,

    // Approval rights
    canApprove: role === "manager" || role === "admin",

    // Risk engines (v1 static → v2 computed later)
    attritionRisk: "LOW",   // LOW | MEDIUM | HIGH
    leaveRisk: "NORMAL",    // NORMAL | EXCESSIVE

    // Manager-only enrichment
    managerLoad: null
  };

  /* ======================================================
     MANAGER-SPECIFIC SIGNALS
  ====================================================== */
  if (role === "manager") {
    decisions.managerLoad = {
      teamSize: 12,     // placeholder → future computed
      risk: "HIGH"
    };
  }

  res.json(decisions);
});

module.exports = router;

/* ======================================================
   END routes/decisions.js
====================================================== */
