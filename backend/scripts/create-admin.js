require("dotenv").config();
const sdk = require("node-appwrite");

(async () => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const users = new sdk.Users(client);
  const databases = new sdk.Databases(client);

  const EMAIL = "admin@123gmail.com";
  const PASSWORD = "MyStrongPassword123";

  try {
    let user;

    /* =========================
       1️⃣ CREATE / FETCH AUTH USER
    ========================= */
    try {
      user = await users.create(
        sdk.ID.unique(),
        EMAIL,
        undefined,
        PASSWORD,
        "Admin User"
      );
      console.log("✅ Auth user created:", user.$id);
    } catch (e) {
      if (e.code === 409) {
        const list = await users.list([
          sdk.Query.equal("email", EMAIL)
        ]);
        user = list.users[0];
        console.log("ℹ️ Auth user already exists:", user.$id);
      } else {
        throw e;
      }
    }

    /* =========================
       2️⃣ CHECK EMPLOYEE RECORD
    ========================= */
    const empCheck = await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      "employees",               // ✅ collection ID
      [sdk.Query.equal("user_id", user.$id)]
    );

    if (empCheck.total === 0) {
      await databases.createDocument(
        process.env.APPWRITE_DB_ID,
        "employees",
        sdk.ID.unique(),
        {
          user_id: user.$id,
          Name: "Admin User",     // ✅ CAPITAL N (matches schema)
          Email: EMAIL,           // ✅ matches schema
          role: "admin",
          department: "HR",
          is_active: 1,
          created_at: new Date().toISOString()
        }
      );

      console.log("✅ Employee record created");
    } else {
      console.log("ℹ️ Employee record already exists");
    }

    console.log("🎉 Admin bootstrap complete");

  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
})();
