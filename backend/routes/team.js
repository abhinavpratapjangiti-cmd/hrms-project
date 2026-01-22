const sdk = require("node-appwrite");

module.exports = async ({ req, res, log, error }) => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const users = new sdk.Users(client);
  const databases = new sdk.Databases(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const EMP_COL = process.env.EMP_COLLECTION_ID;
  const PRES_COL = process.env.PRESENCE_COLLECTION_ID;

  /* =========================
     AUTH
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  const userId = me.$id;
  const role = String(me.prefs?.role || "").toLowerCase();
  const HR_ROLES = new Set(["hr", "hr_admin", "people_ops"]);

  try {
    /* =========================
       EMPLOYEE CONTEXT
    ========================= */
    const empRes = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [sdk.Query.equal("user_id", userId)]
    );

    const meEmp = empRes.documents[0];
    if (!meEmp) {
      return res.json({ message: "Employee not found" }, 404);
    }

    const empId = meEmp.employee_id;
    const managerId = meEmp.manager_id;

    /* =========================
       LOAD ALL ACTIVE EMPLOYEES
    ========================= */
    const empAll = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [
        sdk.Query.equal("active", true),
        sdk.Query.limit(500)
      ]
    );

    /* =========================
       LOAD PRESENCE
    ========================= */
    const pres = await databases.listDocuments(
      DB_ID,
      PRES_COL,
      [sdk.Query.limit(500)]
    );

    const presenceMap = Object.fromEntries(
      pres.documents.map(p => [p.user_id, p])
    );

    /* =========================
       ONLINE COMPUTATION
    ========================= */
    const FIVE_MIN = 5 * 60 * 1000;
    const now = Date.now();

    const withPresence = empAll.documents.map(e => {
      const p = presenceMap[e.user_id];
      const lastSeen = p?.last_seen || null;

      const online =
        p?.is_logged_in === true &&
        lastSeen &&
        now - new Date(lastSeen).getTime() <= FIVE_MIN;

      return {
        ...e,
        last_seen: lastSeen,
        online: online ? 1 : 0
      };
    });

    /* =========================
       ROLE FILTERING
    ========================= */

    let visible = [];

    // Admin / HR → full org
    if (role === "admin" || HR_ROLES.has(role)) {
      visible = withPresence;
    }

    // Manager → self + subtree
    else if (role === "manager") {
      const subtree = new Set([empId]);

      let added;
      do {
        added = false;
        for (const e of withPresence) {
          if (e.manager_id && subtree.has(e.manager_id) && !subtree.has(e.employee_id)) {
            subtree.add(e.employee_id);
            added = true;
          }
        }
      } while (added);

      visible = withPresence.filter(e => subtree.has(e.employee_id));
    }

    // Employee → self + manager
    else {
      visible = withPresence.filter(
        e =>
          e.employee_id === empId ||
          (managerId && e.employee_id === managerId)
      );
    }

    /* =========================
       SORTING
    ========================= */
    const roleOrder = {
      hr: 1,
      manager: 2,
      employee: 3
    };

    visible.sort((a, b) => {
      const rA = roleOrder[a.role] || 99;
      const rB = roleOrder[b.role] || 99;
      if (rA !== rB) return rA - rB;
      return a.name.localeCompare(b.name);
    });

    return res.json(visible);

  } catch (err) {
    error(err);
    return res.json({ message: "Internal server error" }, 500);
  }
};
