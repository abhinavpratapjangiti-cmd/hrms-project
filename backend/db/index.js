const mysql = require("mysql2/promise");

/* =====================================================
   MySQL Connection Pool (OPTIONAL / NON-BLOCKING)
   - App must NOT crash if MySQL is unavailable
===================================================== */

let pool = null;

async function initMySQL() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "hrms_db",
      port: Number(process.env.DB_PORT || 3306),

      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const conn = await pool.getConnection();
    conn.release();

    console.log("✅ MySQL connected (optional pool ready)");
  } catch (err) {
    console.warn("⚠️ MySQL unavailable. Continuing without DB.");
    pool = null; // 👈 critical
  }
}

// 🔁 Initialize once (non-blocking)
initMySQL();

/* =====================================================
   SAFE QUERY WRAPPER
===================================================== */
async function query(...args) {
  if (!pool) {
    throw new Error("DB_NOT_AVAILABLE");
  }
  return pool.query(...args);
}

/* =====================================================
   EXPORT
===================================================== */
module.exports = {
  query
};

/* =====================================================
   END db/index.js
===================================================== */
