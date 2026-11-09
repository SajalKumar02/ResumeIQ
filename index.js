import "dotenv/config";
import express from "express";
import { Groq } from "groq-sdk";
import { fileURLToPath } from "url";
import path from "path";
import { system_prompt } from "./prompts.js";

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PORT = 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const VISION_MODEL = "qwen/qwen3.8-27b";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 5;

app.use(express.json({ limit: "15mb" })); // base64 images are big
app.use(express.static(publicDir));

// Always present for render servers
app.get("/health", (_req, res) => {
    res.sendStatus(200);
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const fail = (res, status, msg) =>
  res.status(status).json({ error: msg, overall_score: null });

app.post("/api/analyze", async (req, res) => {
  try {
    const { jd, images } = req.body ?? {};

    // ✅ Validate input
    if (typeof jd !== "string" || jd.trim().length < 30)
      return fail(res, 400, "Job description is too short.");

    if (
      !Array.isArray(images) ||
      images.length === 0 ||
      images.length > MAX_IMAGES
    )
      return fail(res, 400, `Send 1 to ${MAX_IMAGES} resume images.`);

    for (const img of images) {
      if (
        !ALLOWED_TYPES.includes(img?.mediaType) ||
        typeof img?.data !== "string"
      )
        return fail(res, 400, "Invalid image. Use JPEG, PNG, or WebP.");
    }

    // 🤖 Call Groq (vision + JSON mode)
    const completion = await groq.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system_prompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `JOB DESCRIPTION:\n${jd}\n\nThe resume is in the attached image(s). Respond in JSON only.`,
            },
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mediaType};base64,${img.data}` },
            })),
          ],
        },
      ],
    });

    // 🧹 Clean + parse
    const raw = completion.choices[0]?.message?.content ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    return res.json(result);
  } catch (err) {
    console.error("Analyze error:", err.message);
    return fail(res, 500, "Analysis failed. Please try again.");
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
