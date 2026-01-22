const sdk = require("node-appwrite");

/**
 * Create a notification (Appwrite)
 * --------------------------------
 * Equivalent to:
 * INSERT INTO notifications (user_id, type, message)
 *
 * @param {sdk.Databases} databases  Appwrite Databases instance
 * @param {string} dbId              Appwrite Database ID
 * @param {string} collectionId      Notifications Collection ID
 * @param {string} userId            Target user ID
 * @param {string} type              Notification type (e.g. "timesheet")
 * @param {string} message           Notification message
 *
 * @returns {Promise<Object>}        Created notification object
 */
async function createNotification(
  databases,
  dbId,
  collectionId,
  userId,
  type,
  message
) {
  try {
    const doc = await databases.createDocument(
      dbId,
      collectionId,
      sdk.ID.unique(),
      {
        user_id: userId,
        type,
        message,
        created_at: new Date().toISOString(),
        is_read: false
      }
    );

    // Return object equivalent to MySQL version
    return {
      id: doc.$id,
      user_id: doc.user_id,
      type: doc.type,
      message: doc.message,
      created_at: doc.created_at,
      is_read: doc.is_read
    };
  } catch (err) {
    console.error("Create notification failed:", err.message);
    throw err;
  }
}

module.exports = {
  createNotification
};
