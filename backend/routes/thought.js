const sdk = require("node-appwrite");

/* =========================
   OPTIONAL OPENAI (LAZY LOAD)
========================= */
let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;

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

module.exports = async ({ req, res, log, error }) => {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setJWT(req.headers["x-appwrite-jwt"]);

  const users = new sdk.Users(client);
  const databases = new sdk.Databases(client);

  const DB_ID = process.env.APPWRITE_DB_ID;
  const THOUGHT_COL = process.env.APPWRITE_THOUGHT_COLLECTION_ID;

  /* =========================
     AUTH (verifyToken)
  ========================= */
  try {
    await users.get("me");
  } catch {
    return res.json({ thought: getFallbackThought() }, 401);
  }

  /* =========================
     ROUTE CHECK
     GET /thought/today
  ========================= */
  if (req.method !== "GET" || req.path !== "/thought/today") {
    return res.json({ message: "Route not found" }, 404);
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    /* =========================
       1️⃣ CHECK DB FIRST
    ========================= */
    const existing = await databases.listDocuments(
      DB_ID,
      THOUGHT_COL,
      [
        sdk.Query.equal("active_date", today),
        sdk.Query.limit(1)
      ]
    );

    if (existing.documents.length) {
      return res.json({ thought: existing.documents[0].thought });
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
        log("OpenAI unavailable, fallback used");
      }
    }

    /* =========================
       3️⃣ SAVE RESULT (BEST EFFORT)
    ========================= */
    try {
      await databases.createDocument(
        DB_ID,
        THOUGHT_COL,
        sdk.ID.unique(),
        {
          thought,
          author: "SYSTEM",
          source,
          active_date: today
        }
      );
    } catch (insertErr) {
      log("Thought insert skipped");
    }

    return res.json({ thought });

  } catch (err) {
    error(err);
    return res.json({ thought: getFallbackThought() });
  }
};
