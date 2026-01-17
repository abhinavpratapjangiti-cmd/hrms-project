const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   CONSTANTS
========================= */
const ALLOWED_ROLES = ["employee", "manager", "hr", "admin"];
const USER_CREATORS = ["admin", "hr"];

/* =========================
   CREATE USER (ADMIN + HR)
========================= */
router.post("/", verifyToken, async (req, res) => {
  try {
    const requesterRole = (req.user.role || "").toLowerCase();
    if (!USER_CREATORS.includes(requesterRole)) {
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
      manager_id
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
       1️⃣ CHECK DUPLICATE USER
    ========================= */
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length) {
      return res.status(409).json({ message: "User already exists" });
    }

    /* =========================
       2️⃣ HASH PASSWORD
    ========================= */
    const hashedPassword = await bcrypt.hash(password, 10);

    /* =========================
       3️⃣ INSERT USER
    ========================= */
    const [userResult] = await db.query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
      `,
      [name, email, hashedPassword, role.toLowerCase()]
    );

    const userId = userResult.insertId;

    /* =========================
       4️⃣ INSERT EMPLOYEE
    ========================= */
    await db.query(
      `
      INSERT INTO employees (
        user_id, name, email, department,
        client_name, work_location, designation,
        manager_id, active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        userId,
        name,
        email,
        department || null,
        client_name || null,
        work_location || null,
        designation || null,
        manager_id || null
      ]
    );

    /* =========================
       🔔 NON-BLOCKING NOTIFICATIONS
    ========================= */
    try {
      // Notify HR users
      const [hrs] = await db.query(
        "SELECT id FROM users WHERE role = 'hr'"
      );

      for (const hr of hrs) {
        const [n] = await db.query(
          `
          INSERT INTO notifications (user_id, type, message, is_read)
          VALUES (?, 'user', ?, 0)
          `,
          [hr.id, `New employee ${name} was added`]
        );

        pushNotification(hr.id, {
          id: n.insertId,
          type: "user",
          message: `New employee ${name} was added`,
          created_at: new Date()
        });
      }

      // Notify reporting manager
      if (Number(manager_id)) {
        const [rows] = await db.query(
          "SELECT user_id FROM employees WHERE id = ?",
          [manager_id]
        );

        if (rows[0]?.user_id) {
          const managerUserId = rows[0].user_id;

          const [n] = await db.query(
            `
            INSERT INTO notifications (user_id, type, message, is_read)
            VALUES (?, 'user', ?, 0)
            `,
            [managerUserId, `${name} has been added to your team`]
          );

          pushNotification(managerUserId, {
            id: n.insertId,
            type: "user",
            message: `${name} has been added to your team`,
            created_at: new Date()
          });
        }
      }
    } catch (notifyErr) {
      console.warn("Notification skipped:", notifyErr.message);
    }

    /* =========================
       5️⃣ RESPONSE
    ========================= */
    res.status(201).json({ message: "User created successfully" });

  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   LIST USERS (ADMIN + HR)
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const requesterRole = (req.user.role || "").toLowerCase();
    if (!USER_CREATORS.includes(requesterRole)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const { role } = req.query;

    let sql = `
      SELECT
        e.id,
        e.name,
        e.email,
        u.role,
        e.department,
        e.active
      FROM employees e
      JOIN users u ON u.id = e.user_id
    `;
    const params = [];

    if (role) {
      sql += " WHERE u.role = ?";
      params.push(role.toLowerCase());
    }

    sql += " ORDER BY e.name";

    const [rows] = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("LIST USERS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   ORG SNAPSHOT
========================= */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(u.role = 'manager') AS managers,
        SUM(e.active = 1) AS active,
        SUM(e.active = 0) AS inactive
      FROM employees e
      JOIN users u ON u.id = e.user_id
      `
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("STATS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   DEPARTMENT DISTRIBUTION
========================= */
router.get("/departments", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT department, COUNT(*) AS count
      FROM employees
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department
      ORDER BY count DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("DEPARTMENT ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   RECENT USERS
========================= */
router.get("/recent", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT e.name, u.role
      FROM employees e
      JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC
      LIMIT 5
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("RECENT USERS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
/* =========================
   END routes/users.js
========================= */  