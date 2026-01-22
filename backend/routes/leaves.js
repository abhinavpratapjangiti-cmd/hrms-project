const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");
const { pushNotification } = require("./wsServer");

const DB_ID = process.env.APPWRITE_DB_ID;
const LEAVE_COL = process.env.APPWRITE_LEAVE_COLLECTION_ID;

/* =====================================================
   🔔 REALTIME NOTIFICATION (NO DB)
===================================================== */
function notify(userId, type, message) {
  if (!userId) return;
  try {
    pushNotification(userId, {
      id: Date.now(),
      type,
      message,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("Notification error:", err.message);
  }
}

/* =====================================================
   APPLY LEAVE
===================================================== */
router.post("/apply", verifyToken, async (req, res) => {
  try {
    const { from_date, to_date, leave_type, reason } = req.body;

    if (!from_date || !to_date || !leave_type) {
      return res.status(400).json({
        message: "from_date, to_date and leave_type are required"
      });
    }

    const from = new Date(from_date);
    const to = new Date(to_date);

    if (isNaN(from) || isNaN(to) || from > to) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    /* 🔒 Overlap protection (PENDING + APPROVED) */
    const existing = await databases.listDocuments(
      DB_ID,
      LEAVE_COL,
      [
        Query.equal("employee_id", req.user.employee_id),
        Query.lessThanEqual("from_date", to_date),
        Query.greaterThanEqual("to_date", from_date)
      ]
    );

    const overlap = existing.documents.some(d =>
      ["PENDING", "APPROVED"].includes(d.status)
    );

    if (overlap) {
      return res.status(400).json({
        message: "Leave already applied for selected dates"
      });
    }

    const doc = await databases.createDocument(
      DB_ID,
      LEAVE_COL,
      "unique()",
      {
        employee_id: req.user.employee_id,
        employee_user_id: req.user.id,
        employee_name: req.user.email,
        manager_user_id: req.user.manager_user_id || null,
        from_date,
        to_date,
        leave_type,
        reason: reason || null,
        status: "PENDING",
        created_at: new Date().toISOString()
      }
    );

    notify(
      doc.manager_user_id,
      "leave",
      "New leave request submitted"
    );

    res.json({
      status: "success",
      message: "Leave applied successfully"
    });

  } catch (err) {
    console.error("Apply leave error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   LEAVE BALANCE
===================================================== */
router.get("/balance", verifyToken, async (req, res) => {
  try {
    const QUOTA = { CL: 12, SL: 10, PL: 15 };

    const result = await databases.listDocuments(
      DB_ID,
      LEAVE_COL,
      [
        Query.equal("employee_id", req.user.employee_id),
        Query.equal("status", "APPROVED")
      ]
    );

    const used = {};

    for (const l of result.documents) {
      const days =
        (new Date(l.to_date) - new Date(l.from_date)) /
          (1000 * 60 * 60 * 24) + 1;

      used[l.leave_type] = (used[l.leave_type] || 0) + days;
    }

    res.json(
      Object.keys(QUOTA).map(type => ({
        leave_type: type,
        balance: Math.max(QUOTA[type] - (used[type] || 0), 0)
      }))
    );

  } catch (err) {
    console.error("Leave balance error:", err.message);
    res.json([]);
  }
});

/* =====================================================
   PENDING LEAVES (MY TEAM)
===================================================== */
router.get("/pending/my-team", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const queries = [Query.equal("status", "PENDING")];

    if (req.user.role === "manager") {
      queries.push(Query.equal("manager_user_id", req.user.id));
    }

    const result = await databases.listDocuments(
      DB_ID,
      LEAVE_COL,
      queries
    );

    res.json(result.documents);

  } catch (err) {
    console.error("Pending team leaves error:", err.message);
    res.json([]);
  }
});

/* =====================================================
   TEAM ON LEAVE (TODAY)
===================================================== */
router.get("/team/on-leave", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const queries = [
      Query.equal("status", "APPROVED"),
      Query.lessThanEqual("from_date", today),
      Query.greaterThanEqual("to_date", today)
    ];

    if (req.user.role === "manager") {
      queries.push(Query.equal("manager_user_id", req.user.id));
    }

    const result = await databases.listDocuments(
      DB_ID,
      LEAVE_COL,
      queries
    );

    res.json({ count: result.total });

  } catch (err) {
    console.error("Team on leave error:", err.message);
    res.json({ count: 0 });
  }
});

/* =====================================================
   APPROVE / REJECT LEAVE
===================================================== */
router.post("/:id/decision", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { decision } = req.body;
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return res.status(400).json({ message: "Invalid decision" });
  }

  try {
    const doc = await databases.getDocument(
      DB_ID,
      LEAVE_COL,
      req.params.id
    );

    await databases.updateDocument(
      DB_ID,
      LEAVE_COL,
      req.params.id,
      {
        status: decision,
        approved_by: req.user.id,
        approved_role: req.user.role,
        approved_at: new Date().toISOString()
      }
    );

    notify(
      doc.employee_user_id,
      "leave",
      `Your leave was ${decision.toLowerCase()}`
    );

    res.json({ status: "success" });

  } catch (err) {
    console.error("Leave decision error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

/* =====================================================
   END routes/leaves.js (APPWRITE — CORRECT & SAFE)
===================================================== */
