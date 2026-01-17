const mysql = require("mysql2/promise");
require("dotenv").config();

/* =====================================================
   MySQL Connection Pool (Promise-based)
===================================================== */
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "hrms_db",
  port: process.env.DB_PORT || 3306,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/* =====================================================
   Connection Test (Optional but Useful)
===================================================== */
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("✅ MySQL Connected (pool)");
    connection.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err);
    process.exit(1);
  }
})();

module.exports = db;
/* ======================================================
    END db/index.js       
====================================================== */