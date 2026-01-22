const express = require("express");
const router = express.Router();
const multer = require("multer");
const { verifyToken } = require("../middleware/auth");

const { Query } = require("node-appwrite");
const databases = require("../lib/appwrite").databases;
const storage = require("../lib/appwrite").storage;

/* =========================
   ENV
========================= */
const DB_ID = process.env.APPWRITE_DB_ID;
const DOC_COL = process.env.APPWRITE_EMP_DOC_COLLECTION_ID;
const CV_BUCKET = process.env.APPWRITE_CV_BUCKET_ID;

/* =========================
   MULTER (MEMORY)
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

/* ======================================================
   UPLOAD / REPLACE CV (EMPLOYEE)
====================================================== */
router.post("/cv", verifyToken, upload.single("cv"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const employeeId = req.user.employee_id;

    /* 1️⃣ DELETE OLD CV (if exists) */
    const existing = await databases.listDocuments(
      DB_ID,
      DOC_COL,
      [
        Query.equal("employee_id", employeeId),
        Query.equal("doc_type", "CV"),
        Query.limit(1)
      ]
    );

    if (existing.total) {
      const old = existing.documents[0];

      try {
        await storage.deleteFile(CV_BUCKET, old.file_id);
      } catch (_) {}

      await databases.deleteDocument(DB_ID, DOC_COL, old.$id);
    }

    /* 2️⃣ UPLOAD FILE TO APPWRITE */
    const file = await storage.createFile(
      CV_BUCKET,
      "unique()",
      req.file.buffer,
      req.file.originalname
    );

    /* 3️⃣ SAVE METADATA */
    await databases.createDocument(
      DB_ID,
      DOC_COL,
      "unique()",
      {
        employee_id: employeeId,
        doc_type: "CV",
        file_id: file.$id,
        file_name: req.file.originalname,
        uploaded_by: "employee",
        uploaded_at: new Date().toISOString()
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.error("CV upload error:", err.message);
    res.status(500).json({ message: "Upload failed" });
  }
});

/* ======================================================
   VIEW / DOWNLOAD OWN CV
====================================================== */
router.get("/cv/my", verifyToken, async (req, res) => {
  try {
    const result = await databases.listDocuments(
      DB_ID,
      DOC_COL,
      [
        Query.equal("employee_id", req.user.employee_id),
        Query.equal("doc_type", "CV"),
        Query.limit(1)
      ]
    );

    if (!result.total) {
      return res.status(404).json({ message: "CV not found" });
    }

    const doc = result.documents[0];

    const file = await storage.getFileDownload(
      CV_BUCKET,
      doc.file_id
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.file_name}"`
    );

    file.pipe(res);

  } catch (err) {
    console.error("CV fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   LIST ALL CVs (HR / ADMIN)
====================================================== */
router.get("/cv/list", verifyToken, async (req, res) => {
  const role = String(req.user.role || "").toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      DOC_COL,
      [Query.equal("doc_type", "CV")]
    );

    const rows = result.documents.map(d => ({
      employee_id: d.employee_id,
      file_name: d.file_name,
      uploaded_at: d.uploaded_at,
      url: `/api/documents/cv/${d.employee_id}`
    }));

    res.json(rows);

  } catch (err) {
    console.error("CV list error:", err.message);
    res.json([]);
  }
});

/* ======================================================
   DOWNLOAD CV BY EMPLOYEE (HR / ADMIN / SELF)
====================================================== */
router.get("/cv/:employeeId", verifyToken, async (req, res) => {
  const employeeId = Number(req.params.employeeId);

  if (
    req.user.role === "employee" &&
    req.user.employee_id !== employeeId
  ) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const result = await databases.listDocuments(
      DB_ID,
      DOC_COL,
      [
        Query.equal("employee_id", employeeId),
        Query.equal("doc_type", "CV"),
        Query.limit(1)
      ]
    );

    if (!result.total) {
      return res.status(404).json({ message: "CV not found" });
    }

    const doc = result.documents[0];

    const file = await storage.getFileDownload(
      CV_BUCKET,
      doc.file_id
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.file_name}"`
    );

    file.pipe(res);

  } catch (err) {
    console.error("CV download error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

/* ======================================================
   END routes/documents.js (APPWRITE)
====================================================== */
