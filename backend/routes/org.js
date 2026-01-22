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
  const EMP_COL = process.env.APPWRITE_EMPLOYEE_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken replacement)
  ========================= */
  try {
    await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  /* =========================
     ROUTE CHECK
     GET /org
  ========================= */
  if (req.method !== "GET" || req.path !== "/org") {
    return res.json({ message: "Route not found" }, 404);
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [
        sdk.Query.orderAsc("manager_name"),
        sdk.Query.orderAsc("name"),
        sdk.Query.limit(500) // safety cap
      ]
    );

    return res.json(
      result.documents.map(e => ({
        id: e.employee_id,
        name: e.name,
        role: e.role,
        manager_id: e.manager_id || null,
        manager_name: e.manager_name || null
      }))
    );

  } catch (err) {
    error(err);
    return res.json({ message: "DB error" }, 500);
  }
};
