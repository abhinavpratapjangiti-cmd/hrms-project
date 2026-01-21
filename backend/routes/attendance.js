const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");

/* =========================
   HELPER: SEND NOTIFICATION
========================= */
async function sendNotification(userId, message) {
  try {
    const [result] = await db.query(
      "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)",
      [userId, message]
    );

    pushNotification(userId, {
      type: "NOTIFICATION",
      id: result.insertId,
      message,
      is_read: 0,
      created_at: new Date()
    });
  } catch (err) {
    console.error("Notification insert failed:", err);
  }
}

/* =========================
   HELPER: USER → EMPLOYEE (MySQL)
========================= */
async function getEmployeeId(userId) {
  const [rows] = await db.query(
    "SELECT id FROM employees WHERE user_id = ?",
    [userId]
  );

  if (!rows.length) {
    throw new Error("Employee not found for user_id=" + userId);
  }

  return rows[0].id;
}

/* =====================================================
   TODAY STATUS — Appwrite
===================================================== */
router.get("/today", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const result = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      [
        Query.equal("user_id", userId),
        Query.equal("date", today),
        Query.limit(1)
      ]
    );

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
    console.error("Attendance today error:", err);
    res.json({ status: "NOT_STARTED" });
  }
});

/* =====================================================
   CLOCK IN — Appwrite
===================================================== */
router.post("/clock-in", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const employeeId = req.user.employee_id;
    const employeeName = req.user.name || "—";
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    try {
      await databases.createDocument(
        process.env.APPWRITE_DB_ID,
        process.env.APPWRITE_ATT_COLLECTION_ID,
        docId,
        {
          user_id: userId,
          employee_id: employeeId,
          employee_name: employeeName,
          date: today,
          status: "WORKING",
          clock_in: new Date().toISOString(),
          clock_out: null,
          break_start: null,
          worked_seconds: 0,
          break_seconds: 0
        }
      );
    } catch (err) {
      if (err.code === 409) {
        await databases.updateDocument(
          process.env.APPWRITE_DB_ID,
          process.env.APPWRITE_ATT_COLLECTION_ID,
          docId,
          { status: "WORKING" }
        );
      } else {
        throw err;
      }
    }

    sendNotification(userId, "Clock-in successful");
    res.json({ success: true });

  } catch (err) {
    console.error("Clock-in error:", err);
    res.status(500).json({ message: "Clock-in failed" });
  }
});

/* =====================================================
   START BREAK — Appwrite
===================================================== */
router.post("/start-break", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    await databases.updateDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      docId,
      {
        status: "ON_BREAK",
        break_start: new Date().toISOString()
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Start break error:", err);
    res.status(400).json({ message: "Invalid break start" });
  }
});

/* =====================================================
   END BREAK — Appwrite
===================================================== */
router.post("/end-break", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    const doc = await databases.getDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      docId
    );

    if (!doc.break_start) {
      return res.status(400).json({ message: "No active break" });
    }

    const breakSeconds =
      (Date.now() - new Date(doc.break_start).getTime()) / 1000;

    await databases.updateDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      docId,
      {
        status: "WORKING",
        break_start: null,
        break_seconds: (doc.break_seconds || 0) + Math.floor(breakSeconds)
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("End break error:", err);
    res.status(400).json({ message: "Invalid break end" });
  }
});

/* =====================================================
   CLOCK OUT — Appwrite
===================================================== */
router.post("/clock-out", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    const doc = await databases.getDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      docId
    );

    const workedSeconds =
      (Date.now() - new Date(doc.clock_in).getTime()) / 1000 -
      (doc.break_seconds || 0);

    await databases.updateDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      docId,
      {
        status: "CLOCKED_OUT",
        clock_out: new Date().toISOString(),
        worked_seconds: Math.max(Math.floor(workedSeconds), 0)
      }
    );

    sendNotification(userId, "Clock-out successful");
    res.json({ success: true });

  } catch (err) {
    console.error("Clock-out error:", err);
    res.status(400).json({ message: "Already clocked out" });
  }
});

/* =====================================================
   ATTENDANCE HISTORY — MySQL (TEMP)
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(log_date, '%Y-%m-%d') AS date,
        clock_in  AS check_in,
        clock_out AS check_out,
        ROUND(total_work_minutes / 60, 2) AS hours
      FROM attendance_logs
      WHERE employee_id = ?
      ORDER BY log_date DESC
      LIMIT 30
      `,
      [empId]
    );

    res.json(rows || []);
  } catch (err) {
    console.error("Attendance history error:", err);
    res.status(500).json({ message: "Failed to load attendance history" });
  }
});

/* =====================================================
   TEAM ATTENDANCE SUMMARY — Appwrite (FIXED)
===================================================== */
router.get("/team/summary", verifyToken, async (req, res) => {
  try {
    const managerUserId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const team = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_EMP_COLLECTION_ID,
      [
        Query.equal("manager_user_id", managerUserId),
        Query.equal("active", true)
      ]
    );

    const total = team.total || 0;
    if (!total) {
      return res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
    }

    const employeeIds = team.documents.map(e => e.$id);

    const attendance = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      [
        Query.equal("date", today),
        Query.contains("employee_id", employeeIds)
      ]
    );

    const leaves = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_LEAVE_COLLECTION_ID,
      [
        Query.equal("status", "Approved"),
        Query.contains("employee_id", employeeIds),
        Query.lessThanEqual("from_date", today),
        Query.greaterThanEqual("to_date", today)
      ]
    );

    const present = attendance.documents.filter(
      a => a.status === "WORKING"
    ).length;

    const on_leave = leaves.total || 0;
    const absent = Math.max(total - present - on_leave, 0);

    res.json({ present, total, on_leave, absent });

  } catch (err) {
    console.error("Team summary error:", err);
    res.json({ present: 0, total: 0, on_leave: 0, absent: 0 });
  }
});

/* =====================================================
   TEAM ATTENDANCE TODAY DETAILS — Appwrite
===================================================== */
router.get("/team/today/details", verifyToken, async (req, res) => {
  try {
    const managerUserId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const team = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_EMP_COLLECTION_ID,
      [
        Query.equal("manager_user_id", managerUserId),
        Query.equal("active", true)
      ]
    );

    if (!team.total) return res.json([]);

    const employeeIds = team.documents.map(e => e.$id);

    const attendance = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_ATT_COLLECTION_ID,
      [
        Query.equal("date", today),
        Query.contains("employee_id", employeeIds)
      ]
    );

    const rows = attendance.documents.map(a => ({
      employee_name: a.employee_name || "—",
      status: a.status || "ABSENT",
      clock_in: a.clock_in || null,
      clock_out: a.clock_out || null
    }));

    res.json(rows);
  } catch (err) {
    console.error("Team today details error:", err);
    res.json([]);
  }
});

module.exports = router;
