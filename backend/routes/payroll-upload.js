const sdk = require("node-appwrite");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

module.exports = async ({ req, res, log, error }) => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const users = new sdk.Users(client);
  const databases = new sdk.Databases(client);
  const storage = new sdk.Storage(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const EMP_COL = process.env.EMP_COLLECTION_ID;
  const PAYROLL_COL = process.env.PAYROLL_COLLECTION_ID;
  const BUCKET_ID = process.env.PAYROLL_BUCKET_ID;

  /* =========================
     AUTH
  ========================= */
  let me;
  try {
    me = await users.get("me");
  } catch {
    return res.json({ message: "Unauthorized" }, 401);
  }

  if (!["admin", "hr"].includes(me.prefs?.role)) {
    return res.json({ message: "Unauthorized" }, 403);
  }

  /* =========================
     INPUT
  ========================= */
  const { fileId } = JSON.parse(req.body || "{}");
  if (!fileId) {
    return res.json({ message: "fileId missing" }, 400);
  }

  try {
    /* =========================
       DOWNLOAD FILE
    ========================= */
    const tempPath = `/tmp/${fileId}`;
    const fileBuffer = await storage.getFileDownload(
      BUCKET_ID,
      fileId
    );

    fs.writeFileSync(tempPath, Buffer.from(fileBuffer));

    const ext = path.extname(fileId).replace(".", "").toLowerCase();
    let rows = [];

    /* =========================
       PARSE FILE
    ========================= */
    if (ext === "csv") {
      rows = await parseCSV(tempPath);
    } else if (ext === "xlsx") {
      const wb = XLSX.readFile(tempPath);
      const sheet = wb.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
    } else {
      return res.json({ message: "Unsupported file type" }, 400);
    }

    let uploaded = 0;
    const errors = [];

    /* =========================
       PROCESS ROWS
    ========================= */
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      try {
        if (!r.emp_code || !r.month) {
          errors.push(`Row ${i + 1}: emp_code or month missing`);
          continue;
        }

        const emp = await findEmployee(r.emp_code);
        if (!emp) {
          errors.push(`Row ${i + 1}: Invalid emp_code`);
          continue;
        }

        const exists = await payrollExists(emp.employee_id, r.month);
        if (exists) {
          errors.push(`Row ${i + 1}: Payroll already exists`);
          continue;
        }

        await databases.createDocument(
          DB_ID,
          PAYROLL_COL,
          sdk.ID.unique(),
          {
            employee_id: emp.employee_id,
            month: r.month,
            working_days: Number(r.working_days) || 0,
            paid_days: Number(r.paid_days) || 0,
            basic: Number(r.basic) || 0,
            hra: Number(r.hra) || 0,
            special_allowance: Number(r.special_allowance) || 0,
            deductions: Number(r.deductions) || 0,
            net_pay: Number(r.net_pay) || 0,
            locked: true
          }
        );

        uploaded++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }

    fs.unlinkSync(tempPath);
    return res.json({ uploaded, errors });

  } catch (err) {
    error(err);
    return res.json({ message: "Payroll upload failed" }, 500);
  }

  /* =========================
     HELPERS
  ========================= */
  async function findEmployee(code) {
    const res = await databases.listDocuments(
      DB_ID,
      EMP_COL,
      [sdk.Query.equal("emp_code", code)]
    );
    return res.documents[0] || null;
  }

  async function payrollExists(empId, month) {
    const res = await databases.listDocuments(
      DB_ID,
      PAYROLL_COL,
      [
        sdk.Query.equal("employee_id", empId),
        sdk.Query.equal("month", month),
        sdk.Query.limit(1)
      ]
    );
    return res.total > 0;
  }
};

/* =========================
   CSV PARSER
========================= */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", row => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}
