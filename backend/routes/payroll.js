const sdk = require("node-appwrite");
const PDFDocument = require("pdfkit");
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
  const BUCKET_ID = process.env.PAYSLIP_BUCKET_ID;

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
  const route = `${req.method} ${req.path}`;

  /* =========================
     FETCH EMPLOYEE
  ========================= */
  const empRes = await databases.listDocuments(
    DB_ID,
    EMP_COL,
    [sdk.Query.equal("user_id", userId)]
  );

  const employee = empRes.documents[0];
  if (!employee) return res.json([], 200);

  const empId = employee.employee_id;

  try {

    /* =========================
       LIST PAYSLIP MONTHS
       GET /payslips/my/months
    ========================= */
    if (route === "GET /payslips/my/months") {
      const result = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", empId),
          sdk.Query.orderDesc("month"),
          sdk.Query.limit(50)
        ]
      );

      const months = [
        ...new Set(result.documents.map(d => d.month))
      ];

      return res.json(months);
    }

    /* =========================
       GET PAYSLIP DATA
       GET /payslips/my/:month
    ========================= */
    if (req.method === "GET" && req.path.startsWith("/payslips/my/") && !req.path.endsWith("/pdf")) {
      const month = req.path.split("/")[3];

      const result = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", empId),
          sdk.Query.equal("month", month),
          sdk.Query.limit(1)
        ]
      );

      return res.json(result.documents[0] || {});
    }

    /* =========================
       PAYSLIP PDF
       GET /payslips/my/:month/pdf
    ========================= */
    if (req.method === "GET" && req.path.endsWith("/pdf")) {
      const month = req.path.split("/")[3];

      const result = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", empId),
          sdk.Query.equal("month", month),
          sdk.Query.limit(1)
        ]
      );

      if (!result.documents.length) {
        return res.json({ message: "Payslip not found" }, 404);
      }

      const p = result.documents[0];
      const tmpFile = `/tmp/Payslip-${empId}-${month}.pdf`;
      const doc = new PDFDocument({ margin: 40 });
      const stream = fs.createWriteStream(tmpFile);

      doc.pipe(stream);

      doc.fontSize(18).text("Salary Payslip", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(11);
      doc.text(`Employee Name : ${employee.name}`);
      doc.text(`Payslip Month : ${month}`);
      doc.moveDown(2);

      doc.font("Helvetica-Bold").text("Earnings");
      doc.font("Helvetica");
      doc.text(`Basic : ₹ ${p.basic || 0}`);
      doc.text(`HRA   : ₹ ${p.hra || 0}`);
      doc.text(`DA    : ₹ ${p.da || 0}`);
      doc.text(`LTA   : ₹ ${p.lta || 0}`);
      doc.text(`Special Allowance : ₹ ${p.special_allowance || 0}`);

      doc.moveDown(1);
      doc.font("Helvetica-Bold").text("Deductions");
      doc.font("Helvetica");
      doc.text(`PF  : ₹ ${p.pf || 0}`);
      doc.text(`ESI : ₹ ${p.esi || 0}`);
      doc.text(`TDS : ₹ ${p.tds || 0}`);
      doc.text(`Other : ₹ ${p.other_deductions || 0}`);

      doc.moveDown(2);
      doc.font("Helvetica-Bold").text(`Net Pay : ₹ ${p.net_pay || 0}`, { align: "right" });

      doc.end();

      await new Promise(resolve => stream.on("finish", resolve));

      const uploaded = await storage.createFile(
        BUCKET_ID,
        sdk.ID.unique(),
        fs.createReadStream(tmpFile)
      );

      fs.unlinkSync(tmpFile);

      return res.json({
        downloadUrl: storage.getFileDownload(
          BUCKET_ID,
          uploaded.$id
        )
      });
    }

    return res.json({ message: "Route not found" }, 404);

  } catch (err) {
    error(err);
    return res.json({ message: "Payslip failed" }, 500);
  }
};
