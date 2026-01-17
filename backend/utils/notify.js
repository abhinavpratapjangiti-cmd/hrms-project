const db = require("../db");

/**
 * Create notification
 */
function notify(userId, type, message) {
  return new Promise((resolve, reject) => {
    db.query(
      `
      INSERT INTO notifications (user_id, type, message)
      VALUES (?, ?, ?)
      `,
      [userId, type, message],
      err => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { notify };
