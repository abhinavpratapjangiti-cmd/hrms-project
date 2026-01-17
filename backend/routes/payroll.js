const express = require("express");
const router = express.Router();
const db = require("../db");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");

/* =========================
   LIST PAYSLIP MONTHS
   GET /api/payslips/my/months
========================= */
router.get("/my/months", verifyToken, async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT DISTINCT month
      FROM payroll
      WHERE employee_id = ?
      ORDER BY month DESC
      `,
      [empId]
    );

    res.json(rows.map(r => r.month));

  } catch (err) {
    console.error("Payslip months error:", err);
    res.json([]);
  }
});

/* =========================
   GET PAYSLIP DATA (UI)
   GET /api/payslips/my/:month
========================= */
router.get("/my/:month", verifyToken, async (req, res) => {
  try {
    const empId = req.user.employee_id;
    const { month } = req.params;

    if (!empId) return res.json({});

    const [rows] = await db.query(
      `
      SELECT *
      FROM payroll
      WHERE employee_id = ?
        AND month = ?
      LIMIT 1
      `,
      [empId, month]
    );

    res.json(rows[0] || {});

  } catch (err) {
    console.error("Payslip fetch error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   PAYSLIP PDF (SIMPLE)
   GET /api/payslips/my/:month/pdf
========================= */
router.get("/my/:month/pdf", verifyToken, async (req, res) => {
  try {
    const empId = req.user.employee_id;
    const { month } = req.params;

    if (!empId) return res.status(404).send("Employee not found");

    const [rows] = await db.query(
      `
      SELECT p.*, e.name
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.employee_id = ?
        AND p.month = ?
      LIMIT 1
      `,
      [empId, month]
    );

    if (!rows.length) {
      return res.status(404).send("Payslip not found");
    }

    const p = rows[0];
    const doc = new PDFDocument({ margin: 40 });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Payslip-${month}.pdf`
    );
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    /* ===== LOGO ===== */
    const logoPath = path.join(__dirname, "../public/assets/logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 30, { width: 80 });
    }

    doc
      .fontSize(10)
      .text(
        "Lovas IT Solutions\nKakinada, Andhra Pradesh\nwww.lovasit.com",
        350,
        30,
        { align: "right" }
      );

    doc.moveDown(4);
    doc.fontSize(18).text("Salary Payslip", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Employee Name : ${p.name}`);
    doc.text(`Payslip Month : ${month}`);
    doc.moveDown(2);

    /* ===== EARNINGS ===== */
    doc.font("Helvetica-Bold").text("Earnings");
    doc.font("Helvetica");
    doc.text(`Basic : ₹ ${p.basic || 0}`);
    doc.text(`HRA   : ₹ ${p.hra || 0}`);
    doc.text(`DA    : ₹ ${p.da || 0}`);
    doc.text(`LTA   : ₹ ${p.lta || 0}`);
    doc.text(`Special Allowance : ₹ ${p.special_allowance || 0}`);

    doc.moveDown(1);

    /* ===== DEDUCTIONS ===== */
    doc.font("Helvetica-Bold").text("Deductions");
    doc.font("Helvetica");
    doc.text(`PF  : ₹ ${p.pf || 0}`);
    doc.text(`ESI : ₹ ${p.esi || 0}`);
    doc.text(`TDS : ₹ ${p.tds || 0}`);
    doc.text(`Other : ₹ ${p.other_deductions || 0}`);

    doc.moveDown(2);

    /* ===== NET PAY ===== */
    doc.font("Helvetica-Bold");
    doc.text(`Net Pay : ₹ ${p.net_pay || 0}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(9).text(
      "This is a system generated payslip and does not require a signature.",
      { align: "center" }
    );

    doc.end();

  } catch (err) {
    console.error("Payslip PDF error:", err);
    res.status(500).send("Payslip generation failed");
  }
});

module.exports = router;
/* =========================
   END routes/payroll.js
========================= */