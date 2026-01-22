const sdk = require("node-appwrite");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const money = v => Number(v || 0).toFixed(2);

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
     GET EMPLOYEE
  ========================= */
  const empRes = await databases.listDocuments(
    DB_ID,
    EMP_COL,
    [sdk.Query.equal("user_id", userId)]
  );

  const emp = empRes.documents[0];
  if (!emp) return res.json([]);

  try {

    /* =========================
       LIST PAYSLIP MONTHS
       GET /payslips/my/months
    ========================= */
    if (route === "GET /payslips/my/months") {
      const r = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", emp.employee_id),
          sdk.Query.orderDesc("month"),
          sdk.Query.limit(50)
        ]
      );

      return res.json([...new Set(r.documents.map(d => d.month))]);
    }

    /* =========================
       GET PAYSLIP JSON
       GET /payslips/my/:month
    ========================= */
    if (
      req.method === "GET" &&
      req.path.startsWith("/payslips/my/") &&
      !req.path.endsWith("/pdf")
    ) {
      const month = req.path.split("/")[3];

      const r = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", emp.employee_id),
          sdk.Query.equal("month", month),
          sdk.Query.limit(1)
        ]
      );

      if (!r.documents.length) return res.json({});

      const p = r.documents[0];

      const earnings =
        Number(p.basic || 0) +
        Number(p.hra || 0) +
        Number(p.da || 0) +
        Number(p.lta || 0) +
        Number(p.special_allowance || 0);

      const deductions =
        Number(p.pf || 0) +
        Number(p.pt || 0) +
        Number(p.other_deductions || 0);

      return res.json({
        ...p,
        deductions,
        net_pay: earnings - deductions
      });
    }

    /* =========================
       PAYSLIP PDF
       GET /payslips/my/:month/pdf
    ========================= */
    if (req.method === "GET" && req.path.endsWith("/pdf")) {
      const month = req.path.split("/")[3];

      const r = await databases.listDocuments(
        DB_ID,
        PAYROLL_COL,
        [
          sdk.Query.equal("employee_id", emp.employee_id),
          sdk.Query.equal("month", month),
          sdk.Query.limit(1)
        ]
      );

      if (!r.documents.length) {
        return res.json({ message: "Payslip not found" }, 404);
      }

      const p = r.documents[0];

      const earnings =
        Number(p.basic || 0) +
        Number(p.hra || 0) +
        Number(p.da || 0) +
        Number(p.lta || 0) +
        Number(p.special_allowance || 0);

      const deductions =
        Number(p.pf || 0) +
        Number(p.pt || 0) +
        Number(p.other_deductions || 0);

      const netPay = earnings - deductions;

      /* ===== LOAD HTML TEMPLATE ===== */
      const templatePath = path.join(__dirname, "payslip.html");
      let html = fs.readFileSync(templatePath, "utf8");

      html = html
        .replace(/{{EMP_NAME}}/g, emp.name)
        .replace(/{{MONTH}}/g, month)
        .replace(/{{EMP_ID}}/g, emp.emp_code || "-")
        .replace(/{{DEPARTMENT}}/g, emp.department || "-")
        .replace(/{{DESIGNATION}}/g, emp.designation || "-")
        .replace(/{{LOCATION}}/g, emp.work_location || "-")
        .replace(/{{PAN}}/g, emp.pan || "-")
        .replace(/{{UAN_NO}}/g, emp.uan || "-")
        .replace(/{{PF_NO}}/g, emp.pf_number || "-")
        .replace(/{{BASIC}}/g, money(p.basic))
        .replace(/{{HRA}}/g, money(p.hra))
        .replace(/{{SPECIAL}}/g, money(p.special_allowance))
        .replace(/{{PF_AMOUNT}}/g, money(p.pf))
        .replace(/{{PT_AMOUNT}}/g, money(p.pt))
        .replace(/{{OTHER_DEDUCTIONS}}/g, money(p.other_deductions))
        .replace(/{{TOTAL_EARNINGS}}/g, money(earnings))
        .replace(/{{TOTAL_DEDUCTIONS}}/g, money(deductions))
        .replace(/{{NET_PAY}}/g, money(netPay));

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true
      });

      await browser.close();

      const fileId = sdk.ID.unique();
      await storage.createFile(
        BUCKET_ID,
        fileId,
        pdfBuffer
      );

      return res.json({
        downloadUrl: storage.getFileDownload(BUCKET_ID, fileId)
      });
    }

    return res.json({ message: "Route not found" }, 404);

  } catch (err) {
    error(err);
    return res.json({ message: "Payslip failed" }, 500);
  }
};
