const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { verifyToken } = require("../middleware/auth");
const databases = require("../lib/appwrite");
const { Query } = require("node-appwrite");
const { pushNotification } = require("./wsServer");

/* =========================
   CONSTANTS
========================= */
const ALLOWED_ROLES = ["employee", "manager", "hr", "admin"];
const USER_CREATORS = ["admin", "hr"];

const DB_ID = process.env.APPWRITE_DB_ID;
const EMP_COL = process.env.APPWRITE_EMP_COLLECTION_ID;
const NOTIF_COL = process.env.APPWRITE_NOTIFICATION_COLLECTION_ID;

/* =========================
   CREATE USER (ADMIN + HR)
========================= */
router.post("/", verifyToken, async (req, res) => {
  try {
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const {
      name,
      email,
      password,
      role,
      department,
      client_name,
      work_location,
      designation,
      manager_user_id
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, Email, Password & Role are required"
      });
    }

    if (!ALLOWED_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({ message: "Invalid role" });
    }

    /* =========================
       1️⃣ CHECK DUPLICATE EMAIL
    ========================= */
    const existing = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [Query.equal("email", email)]
    );

    if (existing.total > 0) {
      return res.status(409).json({ message: "User already exists" });
    }

    /* =========================
       2️⃣ HASH PASSWORD
       (stored only for future auth migration)
    ========================= */
    const hashedPassword = await bcrypt.hash(password, 10);

    /* =========================
       3️⃣ CREATE EMPLOYEE
    ========================= */
    const emp = await databases.createDocument(
      DB_ID,
      EMP_COL,
      "unique()",
      {
        user_id: Date.now(), // temporary numeric ID
        name,
        email,
        password: hashedPassword,
        role: role.toLowerCase(),
        department: department || null,
        client_name: client_name || null,
        work_location: work_location || null,
        designation: designation || null,
        manager_user_id: manager_user_id || null,
        active: true,
        created_at: new Date().toISOString()
      }
    );

    /* =========================
       🔔 NOTIFICATIONS
    ========================= */
    try {
      // Notify HRs
      const hrs = await databases.listDocuments(
        DB_ID,
        EMP_COL,
        [Query.equal("role", "hr")]
      );

      for (const hr of hrs.documents) {
        pushNotification(hr.user_id, {
          id: Date.now(),
          type: "user",
          message: `New employee ${name} was added`,
          created_at: new Date()
        });
      }

      // Notify manager
      if (manager_user_id) {
        pushNotification(manager_user_id, {
          id: Date.now(),
          type: "user",
          message: `${name} has been added to your team`,
          created_at: new Date()
        });
      }
    } catch (e) {
      console.warn("Notification skipped:", e.message);
    }

    res.status(201).json({ message: "User created successfully" });

  } catch (err) {
    console.error("CREATE USER ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   LIST USERS (ADMIN + HR)
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const queries = [];
    if (req.query.role) {
      queries.push(Query.equal("role", req.query.role.toLowerCase()));
    }

    const result = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      queries
    );

    res.json(result.documents);

  } catch (err) {
    console.error("LIST USERS ERROR:", err.message);
    res.status(500).json([]);
  }
});

/* =========================
   ORG SNAPSHOT
========================= */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(DB_ID, EMP_COL);

    const stats = {
      total: result.total,
      managers: result.documents.filter(e => e.role === "manager").length,
      active: result.documents.filter(e => e.active).length,
      inactive: result.documents.filter(e => !e.active).length
    };

    res.json(stats);
  } catch {
    res.json({ total: 0, managers: 0, active: 0, inactive: 0 });
  }
});

/* =========================
   DEPARTMENT DISTRIBUTION
========================= */
router.get("/departments", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(DB_ID, EMP_COL);

    const map = {};
    for (const e of result.documents) {
      if (!e.department) continue;
      map[e.department] = (map[e.department] || 0) + 1;
    }

    res.json(
      Object.entries(map)
        .map(([department, count]) => ({ department, count }))
        .sort((a, b) => b.count - a.count)
    );
  } catch {
    res.json([]);
  }
});

/* =========================
   RECENT USERS
========================= */
router.get("/recent", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [Query.orderDesc("created_at"), Query.limit(5)]
    );

    res.json(
      result.documents.map(e => ({
        name: e.name,
        role: e.role
      }))
    );
  } catch {
    res.json([]);
  }
});

module.exports = router;

/* =========================
   END routes/users.js (APPWRITE)
========================= */
