const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

// 🔐 FAIL FAST — never allow silent fallback
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

/* =====================================================
   JWT VERIFICATION MIDDLEWARE
   - Single source of truth
   - MySQL-backed token version check
===================================================== */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // ✅ Verify JWT signature
    const decoded = jwt.verify(token, JWT_SECRET);

    /* ================= TOKEN VERSION CHECK ================= */
    const [rows] = await db.query(
      "SELECT token_version FROM users WHERE id = ?",
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid session" });
    }

    const currentVersion = rows[0].token_version || 0;

    if ((decoded.token_version || 0) !== currentVersion) {
      return res.status(401).json({
        message: "Session expired. Please login again."
      });
    }

    // ✅ Attach canonical user object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      employee_id: decoded.employee_id || null
    };

    /* ================= PRESENCE UPDATE (NON-BLOCKING) ================= */
    db.query(
      `
      UPDATE users
      SET last_seen = NOW(), is_logged_in = 1
      WHERE id = ?
      `,
      [decoded.id]
    ).catch(() => {
      // deliberately ignored
    });

    next();
  } catch (err) {
    console.error("JWT verification error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
