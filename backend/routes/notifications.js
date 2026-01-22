const sdk = require("node-appwrite");

module.exports = async ({ req, res, log, error }) => {
  /* =========================
     APPWRITE CLIENT
  ========================= */
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const databases = new sdk.Databases(client);
  const users = new sdk.Users(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const COL_ID = process.env.APPWRITE_NOTIFICATION_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken replacement)
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json([], 401);
  }

  const userId = me.$id;
  const route = `${req.method} ${req.path}`;

  try {

    /* =========================
       🔔 GET UNREAD NOTIFICATIONS
       GET /notifications
    ========================= */
    if (route === "GET /notifications") {
      const result = await databases.listDocuments(DB_ID, COL_ID, [
        sdk.Query.equal("user_id", userId),
        sdk.Query.equal("is_read", false),
        sdk.Query.orderDesc("created_at"),
        sdk.Query.limit(20)
      ]);

      return res.json(result.documents || []);
    }

    /* =========================
       📥 UNREAD COUNT
       GET /notifications/inbox/count
    ========================= */
    if (route === "GET /notifications/inbox/count") {
      const result = await databases.listDocuments(DB_ID, COL_ID, [
        sdk.Query.equal("user_id", userId),
        sdk.Query.equal("is_read", false),
        sdk.Query.limit(1) // count only
      ]);

      return res.json({ count: result.total || 0 });
    }

    /* =========================
       ✅ MARK ALL AS READ
       PUT /notifications/read-all
    ========================= */
    if (route === "PUT /notifications/read-all") {
      const result = await databases.listDocuments(DB_ID, COL_ID, [
        sdk.Query.equal("user_id", userId),
        sdk.Query.equal("is_read", false),
        sdk.Query.limit(100)
      ]);

      await Promise.allSettled(
        result.documents.map(doc =>
          databases.updateDocument(
            DB_ID,
            COL_ID,
            doc.$id,
            { is_read: true }
          )
        )
      );

      return res.json({ success: true });
    }

    /* =========================
       ✅ MARK SINGLE AS READ
       PUT /notifications/:id/read
    ========================= */
    if (
      req.method === "PUT" &&
      req.path.startsWith("/notifications/") &&
      req.path.endsWith("/read")
    ) {
      const [, , notifId] = req.path.split("/");

      const doc = await databases.getDocument(
        DB_ID,
        COL_ID,
        notifId
      );

      // 🔐 ownership check
      if (doc.user_id !== userId) {
        return res.json({ success: false }, 403);
      }

      await databases.updateDocument(
        DB_ID,
        COL_ID,
        notifId,
        { is_read: true }
      );

      return res.json({ success: true });
    }

    return res.json({ message: "Route not found" }, 404);

  } catch (err) {
    error(err);
    return res.json({ success: false }, 500);
  }
};
