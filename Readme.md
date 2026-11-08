# ResumeIQ

ATS-style resume analyzer. Upload a resume **image**, paste a **job description**, and get a match score with a skills breakdown, gaps, and actionable fixes.

```
Resume image + JD  →  Express API  →  Groq vision model  →  JSON  →  UI
```

## Features

- Resume as an image (PNG, JPG, WEBP), with no PDF parsing needed
- Overall match score (0-100) with a verdict: Strong, Good, Partial, or Weak
- Weighted breakdown: must-have skills, nice-to-have skills, experience, ATS keywords, clarity
- Matched and missing skills, strengths, gaps, and up to 5 prioritized suggestions
- Image quality check, so a blurry upload is flagged instead of silently mis-scored
- Strict JSON contract between the model and the UI
- Safe rendering: all API text goes through `textContent`, never `innerHTML`
- Hero canvas animation (resume nodes meet JD nodes) plus CSS-only section backgrounds

## Tech Stack

| Layer | Tech |
|---|---|
| Server | Node.js, Express |
| AI | Groq SDK (vision model, JSON mode) |
| Frontend | Vanilla HTML, CSS, JS (no framework) |
| Design | Apple-style tokens from `design.md` |
| Font | Inter (SF Pro substitute) |

## Project Structure

```
resumeiq/
├── server.js          # Express server + POST /api/analyze
├── prompts.js         # exports system_prompt
├── package.json
├── .env               # GROQ_API_KEY (never commit)
├── design.md          # design tokens (source of truth for style.css)
└── public/
    ├── index.html
    ├── style.css
    ├── index.js       # data flow: validate → base64 → API → render
    └── bg.js          # hero background animation (visual only)
```

## Getting Started

### 1. Install

```bash
npm install express groq-sdk dotenv
```

In `package.json`, enable ES modules:

```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js"
  }
}
```

### 2. Add your API key

Create `.env` in the project root:

```
GROQ_API_KEY=your_key_here
```

Add `.env` and `node_modules/` to `.gitignore`.

### 3. Run

```bash
npm start
```

Open http://localhost:5000

## How It Works

```
1. User picks an image + pastes a JD
2. index.js validates both, then reads the image as base64
3. POST /api/analyze  { jd, images: [{ mediaType, data }] }
4. server.js validates again, then calls Groq (vision + JSON mode)
5. Server strips code fences, parses JSON, returns it
6. index.js maps every field to a UI component
```

## API

### `POST /api/analyze`

**Request**

```json
{
  "jd": "Full job description text...",
  "images": [
    { "mediaType": "image/jpeg", "data": "<base64, no data: prefix>" }
  ]
}
```

**Success response**

```json
{
  "image_quality": { "readability": "High", "issues": [] },
  "overall_score": 62,
  "verdict": "Good Match",
  "summary": "Solid React foundation. Missing backend evidence.",
  "breakdown": {
    "must_have_skills": 24,
    "nice_to_have_skills": 6,
    "experience_relevance": 16,
    "ats_keywords": 8,
    "clarity_impact": 8
  },
  "matched_skills": ["React", "Tailwind CSS"],
  "missing_must_have": ["Node.js"],
  "missing_nice_to_have": ["Docker"],
  "strengths": ["..."],
  "gaps": ["..."],
  "suggestions": [
    { "section": "Projects", "issue": "...", "fix": "..." }
  ],
  "error": null
}
```

**Error response**

```json
{ "error": "Job description is too short.", "overall_score": null }
```

### Limits

| Rule | Value |
|---|---|
| Image types | PNG, JPG, WEBP |
| Image size (frontend) | 3 MB |
| Images per request (server) | 1 to 5 (the UI sends 1) |
| JD length | 30 to 20,000 characters |
| Request body | 15 MB |

### Score weights

| Category | Max |
|---|---|
| Must-have skills | 40 |
| Nice-to-have skills | 15 |
| Experience and projects | 25 |
| Keyword / ATS alignment | 10 |
| Clarity and impact | 10 |

Verdict bands: **80+** Strong, **60-79** Good, **40-59** Partial, **below 40** Weak.

## Customizing

| Want to change | Edit |
|---|---|
| Scoring rules, output schema | `prompts.js` |
| Model | `VISION_MODEL` in `server.js` |
| Colors, type, spacing | `:root` tokens in `public/style.css` (mirror `design.md`) |
| Animation density or speed | constants in `public/bg.js` |
| Size limits | `MAX_FILE_SIZE` and `MIN_JD_LENGTH` in `index.js`, and the matching checks in `server.js` |

Keep the frontend and server limits in sync, or users will see confusing errors.

## Troubleshooting

| Problem | Fix |
|---|---|
| `400 Invalid image` | Use JPEG, PNG, or WebP; send base64 without the `data:` prefix |
| `invalid response` in the UI | The server returned HTML (often a body-too-large error); compress the image |
| Model 404 | Groq renamed the vision model; check their docs and update `VISION_MODEL` |
| Changes not showing | Restart the server, then hard refresh (Ctrl+Shift+R) |
| Score missing or weird | Check the `image_quality` field; a blurry image lowers confidence |
| Server crashes on start | Make sure `prompts.js` exports `system_prompt` and escapes any backticks |

## Security Notes

- The API key lives only on the server, never in the frontend
- Uploaded resumes are sent to a third-party model; avoid real personal data when testing
- There is no rate limiting or auth yet; add both before deploying publicly

## Roadmap

- [ ] Multi-page resume upload (the server already supports it)
- [ ] PDF input
- [ ] Rate limiting and basic auth
- [ ] Save and compare past analyses
- [ ] Export the report as PDF
- [ ] Tests for `validateInput` and the response parser

## License

MIT (or your choice)