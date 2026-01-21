const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

// 🔐 FAIL FAST
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

/* =====================================================
   JWT VERIFICATION MIDDLEWARE (SINGLE SOURCE OF TRUTH)
===================================================== */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  console.log("AUTH HEADER:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    /* ================= TOKEN VERSION CHECK ================= */
    const [rows] = await db.query(
      "SELECT token_version FROM users WHERE id = ?",
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid session" });
    }

    if ((decoded.token_version || 0) !== (rows[0].token_version || 0)) {
      return res.status(401).json({
        message: "Session expired. Please login again."
      });
    }

    // ✅ Canonical user object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      employee_id: decoded.employee_id || null
    };

    // 🔄 Presence update (non-blocking)
    db.query(
      `
      UPDATE users
      SET last_seen = NOW(), is_logged_in = 1
      WHERE id = ?
      `,
      [decoded.id]
    ).catch(() => {});

    next();
  } catch (err) {
    console.error("JWT verification error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
