import "dotenv/config";
import express from "express";
import { Groq } from "groq-sdk";
import { pdf } from "pdf-to-img";
import { fileURLToPath } from "url";
import path from "path";
import { system_prompt } from "./prompts.js";

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PORT = process.env.PORT || 5000; // Render injects PORT
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const VISION_MODEL = "qwen/qwen3.8-27b";
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_IMAGES = 5; // per-request image cap
const MAX_PDF_PAGES = 3; // resumes are rarely longer
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_B64_CHARS = 4_000_000; // ~4MB base64 limit per image

app.use(express.json({ limit: "15mb" })); // base64 files are big
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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 📄 PDF (base64) -> PNG pages (base64)
async function pdfToImages(base64) {
  const buf = Buffer.from(base64, "base64");

  if (buf.length > MAX_PDF_BYTES)
    throw new HttpError(400, "PDF is too large (max 5 MB).");

  if (buf.subarray(0, 5).toString() !== "%PDF-")
    throw new HttpError(400, "File is not a valid PDF.");

  const pages = [];
  try {
    const doc = await pdf(buf, { scale: 1.5 });
    for await (const page of doc) {
      pages.push({ mediaType: "image/png", data: page.toString("base64") });
      if (pages.length >= MAX_PDF_PAGES) break;
    }
  } catch (err) {
    console.error("PDF convert error:", err.message);
    throw new HttpError(
      400,
      "Could not read this PDF. It may be encrypted or corrupted.",
    );
  }

  if (pages.length === 0)
    throw new HttpError(400, "PDF has no readable pages.");

  return pages;
}

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
      return fail(res, 400, `Send 1 to ${MAX_IMAGES} resume files.`);

    for (const img of images) {
      if (
        !ALLOWED_TYPES.includes(img?.mediaType) ||
        typeof img?.data !== "string"
      )
        return fail(res, 400, "Invalid file. Use PDF, JPEG, PNG, or WebP.");
    }

    // 📄 Normalize: PDFs become PNG pages, images pass through
    const finalImages = [];
    for (const img of images) {
      if (img.mediaType === "application/pdf") {
        finalImages.push(...(await pdfToImages(img.data)));
      } else {
        finalImages.push(img);
      }
    }

    if (finalImages.length > MAX_IMAGES)
      return fail(res, 400, `Too many pages. Max ${MAX_IMAGES} in total.`);

    if (finalImages.some((i) => i.data.length > MAX_B64_CHARS))
      return fail(res, 400, "A page image is too large. Try a smaller file.");

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
            ...finalImages.map((img) => ({
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
    if (err instanceof HttpError) return fail(res, err.status, err.message);
    return fail(res, 500, "Analysis failed. Please try again.");
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});