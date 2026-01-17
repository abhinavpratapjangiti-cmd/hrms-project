function sendNotification(db, pushNotification, userId, message) {
  db.query(
    "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)",
    [userId, message],
    (err, result) => {
      if (err) {
        console.error("Notification insert failed", err);
        return;
      }

      pushNotification(userId, {
        type: "NOTIFICATION",
        id: result.insertId,
        message,
        is_read: 0,
        created_at: new Date()
      });
    }
  );
}

module.exports = { sendNotification };
