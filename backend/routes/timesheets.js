const sdk = require("node-appwrite");

/* =====================================================
   HELPER: GENERATE CALENDAR FOR MONTH
===================================================== */
function generateCalendar(month) {
  const dates = [];
  const start = new Date(`${month}-01`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

module.exports = async ({ req, res, log, error }) => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const users = new sdk.Users(client);
  const databases = new sdk.Databases(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const TS_COL = process.env.APPWRITE_TS_COLLECTION_ID;
  const ATT_COL = process.env.APPWRITE_ATT_COLLECTION_ID;
  const HOL_COL = process.env.APPWRITE_HOLIDAY_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken)
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  const userId = me.$id;
  const role = me.prefs?.role;
  const employeeId = me.prefs?.employee_id;

  const route = `${req.method} ${req.path}`;

  try {

    /* =====================================================
       1️⃣ MY TIMESHEET CALENDAR
       GET /timesheets/my/calendar?month=YYYY-MM
    ===================================================== */
    if (route === "GET /timesheets/my/calendar") {
      const month = req.queryString?.month;

      if (!employeeId || !month) {
        return res.json({ message: "Employee or month missing" }, 400);
      }

      const dates = generateCalendar(month);

      const [attendance, timesheets, holidays] = await Promise.all([
        databases.listDocuments(DB_ID, ATT_COL, [
          sdk.Query.equal("employee_id", employeeId),
          sdk.Query.startsWith("date", month)
        ]),
        databases.listDocuments(DB_ID, TS_COL, [
          sdk.Query.equal("employee_id", employeeId),
          sdk.Query.startsWith("date", month)
        ]),
        databases.listDocuments(DB_ID, HOL_COL, [
          sdk.Query.startsWith("date", month)
        ])
      ]);

      const attMap = {};
      attendance.documents.forEach(d => (attMap[d.date] = d));

      const tsMap = {};
      timesheets.documents.forEach(d => (tsMap[d.date] = d));

      const holMap = {};
      holidays.documents.forEach(d => (holMap[d.date] = d));

      const calendar = dates.map(date => {
        const jsDate = new Date(date);
        const day = jsDate.toLocaleDateString("en-IN", { weekday: "short" });
        const dow = jsDate.getDay(); // 0=Sun

        if (holMap[date]) {
          return {
            work_date: date,
            day,
            type: "HOL",
            holiday: holMap[date].name
          };
        }

        if (dow === 0 || dow === 6) {
          return {
            work_date: date,
            day,
            type: "WO"
          };
        }

        if (tsMap[date]) {
          return {
            work_date: date,
            day,
            project: tsMap[date].project || "-",
            task: tsMap[date].task || "-",
            hours: tsMap[date].hours || 0,
            status: tsMap[date].status,
            type: tsMap[date].status === "APPROVED" ? "P" : ""
          };
        }

        return {
          work_date: date,
          day,
          type: ""
        };
      });

      return res.json(calendar);
    }

    /* =====================================================
       2️⃣ TEAM TIMESHEET APPROVAL LIST
       GET /timesheets/approval?month=YYYY-MM
    ===================================================== */
    if (route === "GET /timesheets/approval") {
      if (!["manager", "hr", "admin"].includes(role)) {
        return res.json({ message: "Forbidden" }, 403);
      }

      const month = req.queryString?.month;

      const result = await databases.listDocuments(DB_ID, TS_COL, [
        sdk.Query.equal("status", "SUBMITTED"),
        sdk.Query.startsWith("date", month)
      ]);

      return res.json(result.documents);
    }

    /* =====================================================
       3️⃣ UPDATE TIMESHEET STATUS
       PUT /timesheets/:id/status
    ===================================================== */
    if (
      req.method === "PUT" &&
      req.path.startsWith("/timesheets/") &&
      req.path.endsWith("/status")
    ) {
      if (!["manager", "hr", "admin"].includes(role)) {
        return res.json({ message: "Forbidden" }, 403);
      }

      const { status } = JSON.parse(req.body || "{}");
      const tsId = req.path.split("/")[2];

      if (!["APPROVED", "REJECTED"].includes(status)) {
        return res.json({ message: "Invalid status" }, 400);
      }

      await databases.updateDocument(DB_ID, TS_COL, tsId, {
        status,
        approved_by: userId,
        approved_at: new Date().toISOString()
      });

      return res.json({ success: true });
    }

    /* =====================================================
       4️⃣ PENDING TIMESHEETS COUNT (MY TEAM)
       GET /timesheets/pending/my-team
    ===================================================== */
    if (route === "GET /timesheets/pending/my-team") {
      if (!["manager", "hr", "admin"].includes(role)) {
        return res.json({ message: "Forbidden" }, 403);
      }

      const result = await databases.listDocuments(DB_ID, TS_COL, [
        sdk.Query.equal("status", "SUBMITTED")
      ]);

      return res.json({ count: result.total || 0 });
    }

    return res.json({ message: "Route not found" }, 404);

  } catch (err) {
    error(err);
    return res.json([], 500);
  }
};
