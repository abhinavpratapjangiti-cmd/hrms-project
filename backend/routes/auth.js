const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const transporter = require("../utils/mailer");

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_HISTORY_LIMIT = 5;

/* =====================================================
   HELPERS
===================================================== */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

/* =====================================================
   SHARED PASSWORD UPDATE LOGIC (SSOT)
===================================================== */
async function updatePasswordForUser(userId, newPassword) {
  if (!STRONG_PASSWORD.test(newPassword)) {
    throw new Error("WEAK_PASSWORD");
  }

  const [history] = await db.query(
    `
    SELECT password_hash
    FROM user_password_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [userId, PASSWORD_HISTORY_LIMIT]
  );

  for (const h of history) {
    if (await bcrypt.compare(newPassword, h.password_hash)) {
      throw new Error("PASSWORD_REUSE");
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await db.query(
    `
    UPDATE users
    SET password = ?, token_version = IFNULL(token_version,0) + 1
    WHERE id = ?
    `,
    [newHash, userId]
  );

  await db.query(
    `INSERT INTO user_password_history (user_id, password_hash)
     VALUES (?, ?)`,
    [userId, newHash]
  );

  await db.query(
    `
    DELETE FROM user_password_history
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM user_password_history
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        ) t
      )
    `,
    [userId, userId, PASSWORD_HISTORY_LIMIT]
  );
}

/* =========================
   LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.query(
      `
      SELECT u.id,u.name,u.email,u.role,u.password,u.token_version,
             e.id AS employee_id
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE u.email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role.toLowerCase(),
        employee_id: user.employee_id,
        token_version: user.token_version || 0
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        employee_id: user.employee_id
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

/* =========================
   CHANGE PASSWORD
========================= */
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const [[user]] = await db.query(
      "SELECT password FROM users WHERE id = ?",
      [userId]
    );

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: "Current password incorrect" });
    }

    await updatePasswordForUser(userId, newPassword);

    res.json({
      message: "Password updated successfully. Please login again.",
      forceLogout: true
    });

  } catch (err) {
    if (err.message === "WEAK_PASSWORD") {
      return res.status(400).json({ message: "Weak password" });
    }
    if (err.message === "PASSWORD_REUSE") {
      return res.status(400).json({
        message: `You cannot reuse your last ${PASSWORD_HISTORY_LIMIT} passwords`
      });
    }
    res.status(500).json({ message: "Password update failed" });
  }
});

/* =========================
   FORGOT PASSWORD
========================= */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  res.json({ message: "If the email exists, a reset link has been sent." });
  if (!email) return;

  const [rows] = await db.query(
    "SELECT id FROM users WHERE email = ? AND is_active = 1 LIMIT 1",
    [email]
  );

  if (!rows.length) return;

  const userId = rows[0].id;
  await db.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  await db.query(
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
    `,
    [userId, tokenHash]
  );

  const resetLink =
    `${process.env.APP_URL}/pages/reset-password.html?token=${rawToken}`;

  await transporter.sendMail({
    from: `"LovasIT HRMS" <${process.env.ZOHO_EMAIL}>`,
    to: email,
    subject: "Reset your HRMS password",
    html: `
      <p>Hello,</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link expires in 15 minutes.</p>
    `
  });
});

/* =========================
   RESET PASSWORD
========================= */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashToken(token);

    const [rows] = await db.query(
      `
      SELECT user_id
      FROM password_reset_tokens
      WHERE token_hash = ?
        AND expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const userId = rows[0].user_id;
    await updatePasswordForUser(userId, newPassword);

    await db.query(
      "DELETE FROM password_reset_tokens WHERE user_id = ?",
      [userId]
    );

    res.json({
      message: "Password reset successful. Please login again.",
      forceLogout: true
    });

  } catch (err) {
    res.status(500).json({ message: "Reset password failed" });
  }
});

/* =========================
   LOGOUT ALL DEVICES
========================= */
router.post("/logout-all", verifyToken, async (req, res) => {
  await db.query(
    `
    UPDATE users
    SET token_version = IFNULL(token_version,0) + 1
    WHERE id = ?
    `,
    [req.user.id]
  );

  res.json({ message: "Logged out from all devices successfully" });
});

module.exports = router;
/* ======================================================       
    END routes/auth.js       
====================================================== */