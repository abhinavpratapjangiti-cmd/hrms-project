const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET missing");
}

/* =====================================================
   JWT VERIFICATION MIDDLEWARE (DB-FREE, DEPLOY-SAFE)
===================================================== */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ Trust JWT claims (Appwrite = data source)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      employee_id: decoded.employee_id || null
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
