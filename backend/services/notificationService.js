function createNotification(db, userId, type, message, cb) {
  db.query(
    `
    INSERT INTO notifications (user_id, type, message)
    VALUES (?, ?, ?)
    `,
    [userId, type, message],
    (err, result) => {
      if (err) return cb(err);

      cb(null, {
        id: result.insertId,
        user_id: userId,
        type,
        message,
        created_at: new Date(),
        is_read: 0
      });
    }
  );
}
