const sdk = require("node-appwrite");

module.exports = async ({ req, res, log, error }) => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const databases = new sdk.Databases(client);
  const users = new sdk.Users(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const EMP_COL = process.env.EMP_COLLECTION_ID;
  const ATT_COL = process.env.ATT_COLLECTION_ID;
  const LEAVE_COL = process.env.LEAVE_COLLECTION_ID;
  const TS_COL = process.env.TS_COLLECTION_ID;
  const NOTIF_COL = process.env.NOTIF_COLLECTION_ID;

  /* =========================
     AUTH
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  const role = me.prefs?.role;
  const userId = me.$id;

  /* =========================
     GET EMPLOYEE RECORD
  ========================= */
  const empRes = await databases.listDocuments(
    DB_ID,
    EMP_COL,
    [sdk.Query.equal("user_id", userId)]
  );

  const employee = empRes.documents[0];
  if (!employee) {
    return res.json({ message: "Employee mapping missing" }, 400);
  }

  const empId = employee.employee_id;

  const route = `${req.method} ${req.path}`;

  try {

    /* =========================
       MANAGER SUMMARY
       GET /manager/summary
    ========================= */
    if (route === "GET /manager/summary") {
      if (role !== "manager") {
        return res.json({ message: "Forbidden" }, 403);
      }

      const today = new Date().toISOString().slice(0, 10);

      const present = await databases.listDocuments(
        DB_ID,
        ATT_COL,
        [
          sdk.Query.equal("manager_employee_id", empId),
          sdk.Query.equal("date", today)
        ]
      );

      const total = await databases.listDocuments(
        DB_ID,
        EMP_COL,
        [sdk.Query.equal("manager_id", empId)]
      );

      const onLeave = await databases.listDocuments(
        DB_ID,
        LEAVE_COL,
        [
          sdk.Query.equal("manager_employee_id", empId),
          sdk.Query.equal("status", "Approved"),
          sdk.Query.lessThanEqual("from_date", today),
          sdk.Query.greaterThanEqual("to_date", today)
        ]
      );

      const pending = await databases.listDocuments(
        DB_ID,
        TS_COL,
        [
          sdk.Query.equal("manager_employee_id", empId),
          sdk.Query.equal("status", "Submitted")
        ]
      );

      return res.json({
        present: present.total,
        total: total.total,
        on_leave: onLeave.total,
        pending_timesheets: pending.total
      });
    }

    /* =========================
       PENDING TIMESHEETS
       GET /manager/timesheets/pending
    ========================= */
    if (route === "GET /manager/timesheets/pending") {
      if (!["manager", "hr", "admin"].includes(role)) {
        return res.json({ message: "Forbidden" }, 403);
      }

      const queries = [
        sdk.Query.equal("status", "Submitted"),
        sdk.Query.orderDesc("work_date")
      ];

      if (role === "manager") {
        queries.push(
          sdk.Query.equal("manager_employee_id", empId)
        );
      }

      const ts = await databases.listDocuments(
        DB_ID,
        TS_COL,
        queries
      );

      return res.json(
        ts.documents.map(t => ({
          id: t.$id,
          work_date: t.work_date,
          hours: t.hours,
          employee: t.employee_name
        }))
      );
    }

    /* =========================
       APPROVE / REJECT TIMESHEET
       POST /manager/timesheets/:id/:action
    ========================= */
    if (req.method === "POST" && req.path.startsWith("/manager/timesheets/")) {
      if (!["manager", "hr", "admin"].includes(role)) {
        return res.json({ message: "Forbidden" }, 403);
      }

      const [, , , tsId, action] = req.path.split("/");
      const status = action === "approve" ? "Approved" : "Rejected";

      const ts = await databases.getDocument(DB_ID, TS_COL, tsId);

      if (role === "manager" && ts.employee_id === empId) {
        return res.json({ message: "Self approval not allowed" }, 403);
      }

      if (role === "manager" && ts.manager_employee_id !== empId) {
        return res.json({ message: "Not your reportee" }, 403);
      }

      await databases.updateDocument(
        DB_ID,
        TS_COL,
        tsId,
        {
          status,
          approved_by: userId,
          approved_at: new Date().toISOString()
        }
      );

      await databases.createDocument(
        DB_ID,
        NOTIF_COL,
        sdk.ID.unique(),
        {
          user_id: ts.employee_user_id,
          type: "timesheet",
          message: `Your timesheet for ${ts.work_date} was ${status}`,
          is_read: false
        }
      );

      return res.json({ success: true });
    }

    return res.json({ message: "Route not found" }, 404);

  } catch (err) {
    error(err);
    return res.json({ message: "Server error" }, 500);
  }
};
