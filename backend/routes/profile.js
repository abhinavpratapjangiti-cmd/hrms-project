const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   HELPER: RESOLVE employee_id FROM JWT user.id
===================================================== */
async function resolveEmployeeId(userId, conn = db) {
  const [[emp]] = await conn.query(
    "SELECT id FROM employees WHERE user_id = ?",
    [userId]
  );
  return emp?.id || null;
}

/* =====================================================
   HELPER: SAFE JSON PARSE (NEVER THROW)
===================================================== */
function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/* =====================================================
   GET MY PROFILE
===================================================== */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req.user.id);
    if (!employeeId) {
      return res.status(404).json({ message: "Employee not found" });
    }

    /* ======================
       SUMMARY + CERTIFICATIONS
    ====================== */
    const [[profile]] = await db.query(
      `
      SELECT summary, certifications
      FROM employee_profile_extra
      WHERE employee_id = ?
      `,
      [employeeId]
    );

    /* ======================
       SKILLS (ALL SOURCES)
    ====================== */
    const [skills] = await db.query(
      `
      SELECT skill
      FROM employee_skills
      WHERE employee_id = ?
      `,
      [employeeId]
    );

    /* ======================
       CV (OPTIONAL)
    ====================== */
    const [[cv]] = await db.query(
      `
      SELECT file_name, uploaded_at, uploaded_by
      FROM employee_documents
      WHERE employee_id = ?
        AND doc_type = 'CV'
      LIMIT 1
      `,
      [employeeId]
    );

    res.json({
      summary: profile?.summary || "",
      certifications: safeJsonParse(profile?.certifications, []),
      skills: skills.map(s => s.skill),
      cv: cv || null
    });

  } catch (err) {
    console.error("GET /api/profile/me error:", err);
    res.status(500).json({ message: "Unable to load profile" });
  }
});

/* =====================================================
   SAVE PROFILE
===================================================== */
router.post("/save", verifyToken, async (req, res) => {
  let conn;

  try {
    conn = await db.getConnection();

    const employeeId = await resolveEmployeeId(req.user.id, conn);
    if (!employeeId) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { summary, certifications, skills } = req.body;

    /* ======================
       NORMALIZE INPUTS
    ====================== */
    const certificationsJson = JSON.stringify(
      Array.isArray(certifications) ? certifications : []
    );

    const skillList = Array.isArray(skills)
      ? skills
      : String(skills || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);

    await conn.beginTransaction();

    /* ======================
       SUMMARY + CERTIFICATIONS
    ====================== */
    await conn.query(
      `
      INSERT INTO employee_profile_extra
        (employee_id, summary, certifications)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        summary = VALUES(summary),
        certifications = VALUES(certifications),
        updated_at = CURRENT_TIMESTAMP
      `,
      [employeeId, summary || null, certificationsJson]
    );

    /* ======================
       SKILLS (SAFE UPSERT)
       - Preserve CV / HR
       - Avoid UNIQUE constraint failure
    ====================== */
    for (const skill of skillList) {
      const [[existing]] = await conn.query(
        `
        SELECT source
        FROM employee_skills
        WHERE employee_id = ?
          AND skill = ?
        LIMIT 1
        `,
        [employeeId, skill]
      );

      // Skill already exists (CV / HR / SELF) → DO NOTHING
      if (existing) continue;

      await conn.query(
        `
        INSERT INTO employee_skills (employee_id, skill, source)
        VALUES (?, ?, 'SELF')
        `,
        [employeeId, skill]
      );
    }

    await conn.commit();

    res.json({
      success: true,
      message: "Profile saved successfully"
    });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /api/profile/save error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to save profile"
    });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
/* =====================================================
   END profile.js
===================================================== */
