const mysql = require("mysql2/promise");

/* =====================================================
   MySQL Connection Pool (Production-safe)
===================================================== */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),

  // ✅ REQUIRED for Railway / cloud MySQL
  ssl: {
    rejectUnauthorized: false
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // ✅ Prevent infinite hang
  connectTimeout: 15000
});

/* =====================================================
   Connection Test (NON-FATAL)
===================================================== */
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("✅ MySQL Connected (pool)");
    connection.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    // ❌ DO NOT exit in production (Render will restart loop)
  }
})();

module.exports = db;

/* ======================================================
   END db/index.js
====================================================== */
