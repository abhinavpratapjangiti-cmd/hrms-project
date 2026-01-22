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
  const OFFICE_COL = process.env.APPWRITE_OFFICE_LOC_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken)
  ========================= */
  try {
    await users.get("me"); // validates JWT
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  /* =========================
     ROUTE CHECK
     GET /office-locations/active
  ========================= */
  if (req.method !== "GET" || req.path !== "/office-locations/active") {
    return res.json({ message: "Route not found" }, 404);
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      OFFICE_COL,
      [
        sdk.Query.equal("active", true),
        sdk.Query.limit(1)
      ]
    );

    return res.json(result.documents[0] || null);

  } catch (err) {
    error(err);
    return res.json({ message: "DB error" }, 500);
  }
};
