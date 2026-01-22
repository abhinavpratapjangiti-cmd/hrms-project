const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

const { Query } = require("node-appwrite");
const databases = require("../lib/appwrite").databases;

/* =========================
   ENV
========================= */
const DB_ID = process.env.APPWRITE_DB_ID;
const EMP_COL = process.env.APPWRITE_EMP_COLLECTION_ID;
const ROLE_HISTORY_COL = process.env.APPWRITE_EMP_ROLE_HISTORY_COLLECTION_ID;

/* =========================
   HELPER: USER → EMPLOYEE
========================= */
async function getEmployeeByUser(userId) {
  const res = await databases.listDocuments(
    DB_ID,
    EMP_COL,
    [
      Query.equal("user_id", userId),
      Query.limit(1)
    ]
  );

  if (!res.total) throw new Error("Employee not found");
  return res.documents[0];
}

/* =========================
   EMPLOYEE SEARCH
========================= */
router.get("/search", verifyToken, async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.user.role?.toLowerCase();

  if (q.length < 2) return res.json([]);
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json([]);
  }

  try {
    const queries = [
      Query.or([
        Query.search("name", q),
        Query.search("emp_code", q)
      ]),
      Query.limit(10)
    ];

    if (role === "manager") {
      const mgr = await getEmployeeByUser(req.user.id);
      queries.push(Query.equal("manager_id", mgr.$id));
    }

    const result = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      queries
    );

    res.json(
      result.documents.map(e => ({
        id: e.$id,
        name: e.name,
        emp_code: e.emp_code,
        designation: e.designation,
        department: e.department
      }))
    );

  } catch (err) {
    console.error("EMP SEARCH ERROR:", err.message);
    res.json([]);
  }
});

/* =========================
   GET ALL EMPLOYEES
========================= */
router.get("/", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [Query.orderAsc("name")]
    );

    res.json(
      result.documents.map(e => ({
        id: e.$id,
        name: e.name,
        email: e.email,
        role: e.role,
        department: e.department,
        manager_id: e.manager_id,
        active: e.active
      }))
    );

  } catch (err) {
    console.error("EMP LIST ERROR:", err.message);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   GET MY PROFILE
========================= */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const emp = await getEmployeeByUser(req.user.id);

    let managerName = null;
    if (emp.manager_id) {
      const mgr = await databases.getDocument(
        DB_ID,
        EMP_COL,
        emp.manager_id
      );
      managerName = mgr.name;
    }

    res.json({
      id: emp.$id,
      name: emp.name,
      email: emp.email,
      employment_type: emp.employment_type,
      role: req.user.role,
      department: emp.department,
      client_name: emp.client_name,
      work_location: emp.work_location,
      designation: emp.designation,
      date_of_joining: emp.date_of_joining?.slice(0, 10),
      manager_id: emp.manager_id,
      manager_name: managerName,
      active: emp.active,
      status: emp.active ? "Active" : "Inactive"
    });

  } catch (err) {
    console.error("GET /employees/me ERROR:", err.message);
    res.status(404).json({ message: "Employee not found" });
  }
});

/* =========================
   MY TIMELINE
========================= */
router.get("/me/timeline", verifyToken, async (req, res) => {
  try {
    const emp = await getEmployeeByUser(req.user.id);
    const timeline = [];

    if (emp.date_of_joining) {
      timeline.push({
        label: "Joined LovasIT",
        date: emp.date_of_joining.slice(0, 10)
      });
    }

    const history = await databases.listDocuments(
      DB_ID,
      ROLE_HISTORY_COL,
      [
        Query.equal("employee_id", emp.$id),
        Query.orderAsc("changed_at")
      ]
    );

    history.documents.forEach(h => {
      timeline.push({
        label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
        date: h.changed_at.slice(0, 10)
      });
    });

    res.json(timeline);

  } catch (err) {
    console.error("ME TIMELINE ERROR:", err.message);
    res.json([]);
  }
});

/* =========================
   GET EMPLOYEE BY ID
========================= */
router.get("/:id", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const emp = await databases.getDocument(
      DB_ID,
      EMP_COL,
      req.params.id
    );

    if (role === "manager") {
      const mgr = await getEmployeeByUser(req.user.id);
      if (emp.manager_id !== mgr.$id) {
        return res.status(404).json({ message: "Employee not found" });
      }
    }

    res.json(emp);

  } catch (err) {
    console.error("GET EMPLOYEE ERROR:", err.message);
    res.status(404).json({ message: "Employee not found" });
  }
});

/* =========================
   EMPLOYEE TIMELINE BY ID
========================= */
router.get("/:id/timeline", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const emp = await databases.getDocument(
      DB_ID,
      EMP_COL,
      req.params.id
    );

    const timeline = [];

    if (emp.date_of_joining) {
      timeline.push({
        label: "Joined LovasIT",
        date: emp.date_of_joining.slice(0, 10)
      });
    }

    const history = await databases.listDocuments(
      DB_ID,
      ROLE_HISTORY_COL,
      [
        Query.equal("employee_id", emp.$id),
        Query.orderAsc("changed_at")
      ]
    );

    history.documents.forEach(h => {
      timeline.push({
        label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
        date: h.changed_at.slice(0, 10)
      });
    });

    res.json(timeline);

  } catch (err) {
    console.error("EMP TIMELINE ERROR:", err.message);
    res.json([]);
  }
});

/* =========================
   UPDATE EMPLOYEE ROLE
========================= */
router.put("/:id/role", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { newDesignation } = req.body;
  if (!newDesignation) {
    return res.status(400).json({ message: "New designation required" });
  }

  try {
    const emp = await databases.getDocument(
      DB_ID,
      EMP_COL,
      req.params.id
    );

    if (emp.designation === newDesignation) {
      return res.status(400).json({ message: "No change detected" });
    }

    await databases.updateDocument(
      DB_ID,
      EMP_COL,
      emp.$id,
      { designation: newDesignation }
    );

    await databases.createDocument(
      DB_ID,
      ROLE_HISTORY_COL,
      "unique()",
      {
        employee_id: emp.$id,
        old_designation: emp.designation,
        new_designation: newDesignation,
        changed_by: req.user.id,
        changed_at: new Date().toISOString()
      }
    );

    res.json({ message: "Role updated successfully" });

  } catch (err) {
    console.error("ROLE UPDATE ERROR:", err.message);
    res.status(500).json({ message: "Update failed" });
  }
});

module.exports = router;

/* ======================================================
   END routes/employee.js (APPWRITE)
====================================================== */
