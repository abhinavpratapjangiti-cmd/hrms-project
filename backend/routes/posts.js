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
  const POSTS_COL = process.env.APPWRITE_POSTS_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken)
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  /* =========================
     ROUTE
     GET /posts/me
  ========================= */
  if (req.method !== "GET" || req.path !== "/posts/me") {
    return res.json({ message: "Route not found" }, 404);
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      POSTS_COL,
      [
        sdk.Query.equal("user_id", me.$id),
        sdk.Query.orderDesc("created_at"),
        sdk.Query.limit(100) // safety cap
      ]
    );

    return res.json(result.documents);

  } catch (err) {
    error(err);
    return res.json({ message: "DB error" }, 500);
  }
};
