const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");
const { pushNotification } = require("./wsServer");

const DB_ID = process.env.APPWRITE_DB_ID;
const ATT_COL = process.env.APPWRITE_ATT_COLLECTION_ID;
const TS_COL = process.env.APPWRITE_TS_COLLECTION_ID;

/* =====================================================
   🔔 REALTIME NOTIFICATION (NO DB)
===================================================== */
function notify(userId, message) {
  if (!userId) return;
  pushNotification(userId, {
    id: Date.now(),
    type: "timesheet",
    message,
    created_at: new Date().toISOString()
  });
}

/* =====================================================
   MANAGER SUMMARY
   GET /api/manager/summary
===================================================== */
router.get("/summary", verifyToken, async (req, res) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const managerUserId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    /* Present today */
    const attendance = await databases.listDocuments(
      DB_ID,
      ATT_COL,
      [
        Query.equal("manager_user_id", managerUserId),
        Query.equal("date", today)
      ]
    );

    /* Total reportees */
    const employees = new Set(
      attendance.documents.map(a => a.employee_id)
    );

    /* On leave today */
    // (Already handled in leaves summary dashboard)

    /* Pending timesheets */
    const pendingTS = await databases.listDocuments(
      DB_ID,
      TS_COL,
      [
        Query.equal("manager_user_id", managerUserId),
        Query.equal("status", "Submitted")
      ]
    );

    res.json({
      present: attendance.total,
      total: employees.size,
      on_leave: 0, // derived elsewhere (leaves module)
      pending_timesheets: pendingTS.total
    });

  } catch (err) {
    console.error("Manager summary error:", err.message);
    res.status(500).json({ message: "Summary failed" });
  }
});

/* =====================================================
   PENDING TIMESHEETS
   GET /api/manager/timesheets/pending
===================================================== */
router.get("/timesheets/pending", verifyToken, async (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const queries = [
      Query.equal("status", "Submitted"),
      Query.orderDesc("work_date")
    ];

    if (req.user.role === "manager") {
      queries.push(Query.equal("manager_user_id", req.user.id));
    }

    const result = await databases.listDocuments(
      DB_ID,
      TS_COL,
      queries
    );

    res.json(
      result.documents.map(t => ({
        id: t.$id,
        work_date: t.work_date,
        hours: t.hours,
        employee: t.employee_name
      }))
    );

  } catch (err) {
    console.error("Pending timesheets error:", err.message);
    res.status(500).json({ message: "Fetch failed" });
  }
});

/* =====================================================
   APPROVE / REJECT TIMESHEET
   POST /api/manager/timesheets/:id/:action
===================================================== */
router.post("/timesheets/:id/:action", verifyToken, async (req, res) => {
  const { id, action } = req.params;
  const status = action === "approve" ? "Approved" : "Rejected";

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const ts = await databases.getDocument(DB_ID, TS_COL, id);

    /* ❌ No self approval */
    if (
      req.user.role === "manager" &&
      ts.employee_user_id === req.user.id
    ) {
      return res.status(403).json({ message: "Self approval not allowed" });
    }

    /* ❌ Manager ownership */
    if (
      req.user.role === "manager" &&
      ts.manager_user_id !== req.user.id
    ) {
      return res.status(403).json({ message: "Not your reportee" });
    }

    await databases.updateDocument(
      DB_ID,
      TS_COL,
      id,
      {
        status,
        approved_by: req.user.id,
        approved_at: new Date().toISOString()
      }
    );

    notify(
      ts.employee_user_id,
      `Your timesheet for ${ts.work_date} was ${status}`
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Timesheet decision error:", err.message);
    res.status(500).json({ message: "Update failed" });
  }
});

module.exports = router;

/* =====================================================
   END routes/manager.js (APPWRITE — PROD READY)
===================================================== */
