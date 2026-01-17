const bcrypt = require("bcrypt");
const db = require("./db");

async function reset() {
  const plainPassword = "123456"; // 👈 use this to login
  const hashed = await bcrypt.hash(plainPassword, 10);

  const sql = "UPDATE employees SET password = ? WHERE email = ?";
  db.query(sql, [hashed, "ravi@test.com"], (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log("✅ Password reset to 123456");
    }
    process.exit();
  });
}

reset();
