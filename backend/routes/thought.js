const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   OPTIONAL OPENAI (LAZY LOAD)
========================= */
let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    const OpenAI = require("openai");
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return openaiClient;
}

/* =========================
   STATIC FALLBACK THOUGHTS
========================= */
const FALLBACK_THOUGHTS = [
  "Make today count.",
  "Small progress is still progress.",
  "Consistency beats motivation.",
  "Focus on what you can control.",
  "Your effort today builds your future."
];

function getFallbackThought() {
  return FALLBACK_THOUGHTS[
    Math.floor(Math.random() * FALLBACK_THOUGHTS.length)
  ];
}

/* =========================
   GET THOUGHT OF THE DAY
   GET /api/thought/today
========================= */
router.get("/today", verifyToken, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  try {
    /* =========================
       1️⃣ CHECK DB FIRST
    ========================= */
    const [rows] = await db.query(
      `
      SELECT thought
      FROM thought_of_the_day
      WHERE active_date = ?
      LIMIT 1
      `,
      [today]
    );

    if (rows.length) {
      return res.json({ thought: rows[0].thought });
    }

    /* =========================
       2️⃣ TRY AI (OPTIONAL)
    ========================= */
    let thought = getFallbackThought();
    let source = "SYSTEM";

    const openai = getOpenAIClient();

    if (openai) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Generate one short, professional, workplace-safe motivational thought. Max 15 words."
            }
          ],
          temperature: 0.6
        });

        const aiThought =
          response.choices?.[0]?.message?.content?.trim();

        if (aiThought) {
          thought = aiThought;
          source = "AI";
        }
      } catch (aiErr) {
        console.warn(
          "OpenAI unavailable, fallback used:",
          aiErr.code || aiErr.message
        );
      }
    }

    /* =========================
       3️⃣ SAVE RESULT (NON-BLOCKING)
    ========================= */
    try {
      await db.query(
        `
        INSERT INTO thought_of_the_day
        (thought, author, source, active_date)
        VALUES (?, 'SYSTEM', ?, ?)
        `,
        [thought, source, today]
      );
    } catch (insertErr) {
      console.error("Thought insert error:", insertErr);
    }

    return res.json({ thought });

  } catch (err) {
    console.error("Thought DB error:", err);
    return res.json({ thought: getFallbackThought() });
  }
});

module.exports = router;
/* =========================
   END routes/thought.js
========================= */