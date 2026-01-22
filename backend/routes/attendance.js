const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");
const { pushNotification } = require("./wsServer");

const DB_ID = process.env.APPWRITE_DB_ID;
const ATT_COL = process.env.APPWRITE_ATT_COLLECTION_ID;
const EMP_COL = process.env.APPWRITE_EMP_COLLECTION_ID;
const LEAVE_COL = process.env.APPWRITE_LEAVE_COLLECTION_ID;

/* =====================================================
   🔔 REALTIME NOTIFICATION (NO DB SIDE EFFECTS)
===================================================== */
function notify(userId, message) {
  pushNotification(userId, {
    id: Date.now(),
    type: "attendance",
    message,
    created_at: new Date()
  });
}

/* =====================================================
   TODAY STATUS
===================================================== */
router.get("/today", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const result = await databases.listDocuments(DB_ID, ATT_COL, [
      Query.equal("user_id", req.user.id),
      Query.equal("date", today),
      Query.limit(1)
    ]);

    if (!result.total) {
      return res.json({ status: "NOT_STARTED" });
    }

    const a = result.documents[0];

    res.json({
      status: a.status || "NOT_STARTED",
      clock_in_at: a.clock_in || null,
      worked_seconds: Math.max(a.worked_seconds || 0, 0),
      break_seconds: Math.max(a.break_seconds || 0, 0)
    });
  } catch (err) {
    console.error("Attendance today error:", err.message);
    res.json({ status: "NOT_STARTED" });
  }
});

/* =====================================================
   CLOCK IN
===================================================== */
router.post("/clock-in", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${req.user.id}_${today}`;

    try {
      await databases.createDocument(DB_ID, ATT_COL, docId, {
        user_id: req.user.id,
        employee_id: req.user.employee_id,
        employee_name: req.user.email,
        date: today,
        status: "WORKING",
        clock_in: new Date().toISOString(),
        worked_seconds: 0,
        break_seconds: 0
      });
    } catch (err) {
      if (err.code === 409) {
        await databases.updateDocument(DB_ID, ATT_COL, docId, {
          status: "WORKING"
        });
      } else {
        throw err;
      }
    }

    notify(req.user.id, "Clock-in successful");
    res.json({ success: true });
  } catch (err) {
    console.error("Clock-in error:", err.message);
    res.status(500).json({ message: "Clock-in failed" });
  }
});

/* =====================================================
   START BREAK
===================================================== */
router.post("/start-break", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${req.user.id}_${today}`;

    await databases.updateDocument(DB_ID, ATT_COL, docId, {
      status: "ON_BREAK",
      break_start: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Start break error:", err.message);
    res.status(400).json({ message: "Invalid break start" });
  }
});

/* =====================================================
   END BREAK
===================================================== */
router.post("/end-break", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${req.user.id}_${today}`;

    const doc = await databases.getDocument(DB_ID, ATT_COL, docId);
    if (!doc.break_start) {
      return res.status(400).json({ message: "No active break" });
    }

    const seconds =
      (Date.now() - new Date(doc.break_start).getTime()) / 1000;

    await databases.updateDocument(DB_ID, ATT_COL, docId, {
      status: "WORKING",
      break_start: null,
      break_seconds: (doc.break_seconds || 0) + Math.floor(seconds)
    });

    res.json({ success: true });
  } catch (err) {
    console.error("End break error:", err.message);
    res.status(400).json({ message: "Invalid break end" });
  }
});

/* =====================================================
   CLOCK OUT
===================================================== */
router.post("/clock-out", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${req.user.id}_${today}`;

    const doc = await databases.getDocument(DB_ID, ATT_COL, docId);

    const worked =
      (Date.now() - new Date(doc.clock_in).getTime()) / 1000 -
      (doc.break_seconds || 0);

    await databases.updateDocument(DB_ID, ATT_COL, docId, {
      status: "CLOCKED_OUT",
      clock_out: new Date().toISOString(),
      worked_seconds: Math.max(Math.floor(worked), 0)
    });

    notify(req.user.id, "Clock-out successful");
    res.json({ success: true });
  } catch (err) {
    console.error("Clock-out error:", err.message);
    res.status(400).json({ message: "Already clocked out" });
  }
});

/* =====================================================
   TEAM ATTENDANCE SUMMARY
===================================================== */
router.get("/team/summary", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const team = await databases.listDocuments(DB_ID, EMP_COL, [
      Query.equal("manager_user_id", req.user.id),
      Query.equal("active", true)
    ]);

    const total = team.total || 0;
    if (!total) {
      return res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
    }

    const empIds = team.documents.map(e => e.$id);

    const attendance = await databases.listDocuments(DB_ID, ATT_COL, [
      Query.equal("date", today)
    ]);

    const present = attendance.documents.filter(a =>
      empIds.includes(a.employee_id) &&
      ["WORKING", "ON_BREAK", "CLOCKED_OUT"].includes(a.status)
    ).length;

    const leaves = await databases.listDocuments(DB_ID, LEAVE_COL, [
      Query.equal("status", "APPROVED"),
      Query.lessThanEqual("from_date", today),
      Query.greaterThanEqual("to_date", today)
    ]);

    const on_leave = leaves.documents.filter(l =>
      empIds.includes(l.employee_id)
    ).length;

    const absent = Math.max(total - present - on_leave, 0);

    res.json({ present, total, on_leave, absent });
  } catch (err) {
    console.error("Team summary error:", err.message);
    res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
  }
});

/* =====================================================
   TEAM TODAY DETAILS
===================================================== */
router.get("/team/today/details", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const team = await databases.listDocuments(DB_ID, EMP_COL, [
      Query.equal("manager_user_id", req.user.id),
      Query.equal("active", true)
    ]);

    if (!team.total) return res.json([]);

    const empIds = team.documents.map(e => e.$id);

    const attendance = await databases.listDocuments(DB_ID, ATT_COL, [
      Query.equal("date", today)
    ]);

    const rows = attendance.documents
      .filter(a => empIds.includes(a.employee_id))
      .map(a => ({
        employee_name: a.employee_name || "—",
        status: a.status || "ABSENT",
        clock_in: a.clock_in || null,
        clock_out: a.clock_out || null
      }));

    res.json(rows);
  } catch (err) {
    console.error("Team details error:", err.message);
    res.json([]);
  }
});

module.exports = router;

/* =====================================================
   END routes/attendance.js
===================================================== */
