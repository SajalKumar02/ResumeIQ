// ---------- Config (must match server.js) ----------
const API_URL = "/api/analyze";

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const MAX_JD_LENGTH = 20000;
const MIN_JD_LENGTH = 30; // server rejects shorter
const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // Groq base64 limit ~4MB
const MAX_PDF_SIZE = 5 * 1024 * 1024; // matches server MAX_PDF_BYTES
const BREAKDOWN_MAX = {
  must_have_skills: 40,
  nice_to_have_skills: 15,
  experience_relevance: 25,
  ats_keywords: 10,
  clarity_impact: 10,
};

// ---------- DOM ----------
const form = document.querySelector("#analyze-form");
const jobDescription = document.querySelector("#job-description");
const jdCount = document.querySelector("#jd-count");
const fileInput = document.querySelector("#resume-file");
const dropzone = document.querySelector("#dropzone");
const dropzoneIdle = document.querySelector("#dropzone-idle");
const dropzoneFile = document.querySelector("#dropzone-file");
const fileName = document.querySelector("#file-name");
const fileSize = document.querySelector("#file-size");
const resumeError = document.querySelector("#resume-error");
const replaceButton = document.querySelector("#replace-file");
const removeButton = document.querySelector("#remove-file");
const analyzeButton = document.querySelector("#analyze-btn");
const formStatus = document.querySelector("#form-status");
const resultsEl = document.querySelector("#results");
const resultsErrorEl = document.querySelector("#results-error");
const errorMessageEl = document.querySelector("#error-message");
const errorImageQualityEl = document.querySelector("#error-image-quality");
const errorReadabilityEl = document.querySelector("#error-readability");
const errorIssuesEl = document.querySelector("#error-issues");

let resumeFile = null;
let isSubmitting = false;

// ---------- Helpers ----------
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value) {
  return value.toLocaleString("en-US");
}

function getExtension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

function isAcceptedFile(file) {
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.includes(
    getExtension(file.name),
  );
  const hasAcceptedType = !file.type || ACCEPTED_MIME_TYPES.includes(file.type);
  return hasAcceptedExtension && hasAcceptedType;
}

function isPdf(file) {
  return file.type === "application/pdf" || getExtension(file.name) === ".pdf";
}

function getMaxSize(file) {
  return isPdf(file) ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
}

function sizeMessage(file) {
  return isPdf(file)
    ? "PDF must be 5 MB or smaller."
    : "Image must be 3 MB or smaller.";
}

function emptyToArray(value) {
  return Array.isArray(value) ? value : [];
}

// ---------- Form state ----------
function setResumeError(message) {
  if (!message) {
    resumeError.hidden = true;
    resumeError.textContent = "";
    dropzone.classList.remove("is-invalid");
    return;
  }
  resumeError.hidden = false;
  resumeError.textContent = message;
  dropzone.classList.add("is-invalid");
}

function setStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.classList.remove("is-error", "is-success");
  if (type) formStatus.classList.add(type);
}

function updateCharCount() {
  jdCount.textContent = `${formatCount(jobDescription.value.length)} / ${formatCount(MAX_JD_LENGTH)}`;
}

function canSubmit() {
  return Boolean(jobDescription.value.trim() && resumeFile && !isSubmitting);
}

function updateSubmitState() {
  analyzeButton.disabled = !canSubmit();
}

function showSelectedFile(file) {
  resumeFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  dropzoneIdle.classList.add("is-hidden");
  dropzoneFile.classList.remove("is-hidden");
  dropzone.classList.add("is-filled");
  dropzone.classList.remove("is-invalid");
  setResumeError("");
  updateSubmitState();
}

function clearSelectedFile() {
  resumeFile = null;
  fileInput.value = "";
  fileName.textContent = "";
  fileSize.textContent = "";
  dropzoneIdle.classList.remove("is-hidden");
  dropzoneFile.classList.add("is-hidden");
  dropzone.classList.remove("is-filled", "is-invalid");
  setResumeError("");
  updateSubmitState();
}

function handleFiles(files) {
  const file = files?.[0];
  if (!file) return;

  if (!isAcceptedFile(file)) {
    clearSelectedFile();
    setResumeError("Use a PDF, PNG, JPG, or WEBP file.");
    return;
  }

  if (file.size > getMaxSize(file)) {
    clearSelectedFile();
    setResumeError(sizeMessage(file));
    return;
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  showSelectedFile(file);
}

function setLoading(isLoading) {
  isSubmitting = isLoading;
  analyzeButton.classList.toggle("is-loading", isLoading);
  analyzeButton.querySelector(".btn__label").textContent = isLoading
    ? "Analyzing…"
    : "Analyze Resume";
  analyzeButton.setAttribute("aria-busy", String(isLoading));
  jobDescription.disabled = isLoading;
  replaceButton.disabled = isLoading;
  removeButton.disabled = isLoading;
  dropzone.setAttribute("aria-disabled", String(isLoading));
  updateSubmitState();
}

function hidePanels() {
  resultsEl.hidden = true;
  resultsErrorEl.hidden = true;
}

// ---------- Rendering helpers ----------
function appendEmptyNote(container) {
  const note = document.createElement("p");
  note.className = "empty-note";
  note.textContent = "None found";
  container.append(note);
}

function renderTags(container, items, missing = false) {
  container.replaceChildren();
  const list = emptyToArray(items);

  if (list.length === 0) {
    appendEmptyNote(container);
    return;
  }

  for (const item of list) {
    const tag = document.createElement("span");
    tag.className = missing ? "tag is-missing" : "tag";
    tag.textContent = String(item);
    container.append(tag);
  }
}

function renderBulletList(container, items) {
  container.replaceChildren();
  const list = emptyToArray(items);

  if (list.length === 0) {
    appendEmptyNote(container);
    return;
  }

  for (const item of list) {
    const li = document.createElement("li");
    li.textContent = String(item);
    container.append(li);
  }
}

function verdictClass(verdict) {
  if (verdict === "Good Match") return "is-good";
  if (verdict === "Partial Match") return "is-partial";
  if (verdict === "Weak Match") return "is-weak";
  return "";
}

// ---------- Data flow ----------
// 1. validate
function validateInput() {
  const description = jobDescription.value.trim();

  if (!description || !resumeFile) {
    return { error: "Add a job description and a valid resume file." };
  }

  if (description.length < MIN_JD_LENGTH) {
    return {
      error: `Job description must be at least ${MIN_JD_LENGTH} characters.`,
    };
  }

  if (!isAcceptedFile(resumeFile)) {
    return { error: "Use a PDF, PNG, JPG, or WEBP file." };
  }

  if (resumeFile.size > getMaxSize(resumeFile)) {
    return { error: sizeMessage(resumeFile) };
  }

  return { jobDescription: description, file: resumeFile };
}

// 2. file -> base64 (no "data:" prefix; server adds it back)
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result);
      const commaIndex = dataUrl.indexOf(",");

      if (commaIndex === -1) {
        reject(new Error("Could not read the resume image."));
        return;
      }

      const header = dataUrl.slice(0, commaIndex);
      const base64 = dataUrl.slice(commaIndex + 1);
      const match = header.match(/^data:([^;]+);base64$/i);
      const media_type =
        file.type || MIME_BY_EXT[getExtension(file.name)] || match?.[1];

      if (!ACCEPTED_MIME_TYPES.includes(media_type)) {
        reject(new Error("Use a PDF, PNG, JPG, or WEBP file."));
        return;
      }

      resolve({ base64, media_type });
    };

    reader.onerror = () =>
      reject(new Error("Could not read the resume image."));
    reader.readAsDataURL(file);
  });
}

// 3. build payload -> { jd, images: [{ mediaType, data }] }
async function buildRequest(input) {
  const { base64, media_type } = await readImageAsBase64(input.file);

  return {
    jd: input.jobDescription,
    images: [{ mediaType: media_type, data: base64 }],
  };
}

// 4. call API (returns raw text so we can handle non-JSON replies)
async function callApi(payload) {
  let response;

  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the analysis service. Try again.");
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "The server returned an empty response."
        : `Request failed with status ${response.status}.`,
    );
  }

  return text;
}

// 5. strip fences + parse
function stripJsonFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseResponse(rawText) {
  try {
    return JSON.parse(stripJsonFences(rawText));
  } catch {
    throw new Error("The server returned an invalid response.");
  }
}

// 6. render
function renderError(message, payload = null) {
  hidePanels();
  errorMessageEl.textContent = message;
  errorIssuesEl.replaceChildren();

  const quality = payload?.image_quality;

  if (quality) {
    errorReadabilityEl.textContent = quality.readability || "Unknown";
    renderBulletList(errorIssuesEl, quality.issues);
    errorImageQualityEl.hidden = false;
  } else {
    errorReadabilityEl.textContent = "";
    errorImageQualityEl.hidden = true;
  }

  resultsErrorEl.hidden = false;
  setStatus(message, "is-error");
}

function renderResult(data) {
  hidePanels();

  document.querySelector("#overall-score").textContent = String(
    data.overall_score,
  );

  const verdictEl = document.querySelector("#verdict");
  verdictEl.textContent = data.verdict || "";
  verdictEl.classList.remove("is-good", "is-partial", "is-weak");
  const badgeClass = verdictClass(data.verdict);
  if (badgeClass) verdictEl.classList.add(badgeClass);

  document.querySelector("#summary").textContent = data.summary || "";

  const breakdown = data.breakdown || {};
  for (const row of document.querySelectorAll("#breakdown li")) {
    const key = row.dataset.key;
    const max = Number(row.dataset.max) || BREAKDOWN_MAX[key] || 0;
    const value = Number(breakdown[key] ?? 0);
    row.querySelector(".breakdown__value").textContent = `${value} / ${max}`;
    row.querySelector(".breakdown__fill").style.width = max
      ? `${Math.min(100, Math.max(0, (value / max) * 100))}%`
      : "0%";
  }

  renderTags(document.querySelector("#matched-skills"), data.matched_skills);
  renderTags(
    document.querySelector("#missing-must-have"),
    data.missing_must_have,
    true,
  );
  renderTags(
    document.querySelector("#missing-nice-to-have"),
    data.missing_nice_to_have,
    true,
  );
  renderBulletList(document.querySelector("#strengths"), data.strengths);
  renderBulletList(document.querySelector("#gaps"), data.gaps);

  const suggestionsEl = document.querySelector("#suggestions");
  suggestionsEl.replaceChildren();
  const suggestions = emptyToArray(data.suggestions);

  if (suggestions.length === 0) {
    appendEmptyNote(suggestionsEl);
  } else {
    for (const suggestion of suggestions) {
      const card = document.createElement("article");
      card.className = "suggestion-card";

      const title = document.createElement("h4");
      title.textContent = suggestion.section || "Suggestion";

      const issue = document.createElement("p");
      issue.textContent = suggestion.issue || "";

      const fix = document.createElement("p");
      fix.textContent = suggestion.fix || "";

      card.append(title, issue, fix);
      suggestionsEl.append(card);
    }
  }

  const quality = data.image_quality || {};
  document.querySelector("#image-readability").textContent =
    quality.readability || "Unknown";
  renderBulletList(document.querySelector("#image-issues"), quality.issues);

  resultsEl.hidden = false;
  setStatus("Analysis complete.", "is-success");
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Events ----------
jobDescription.addEventListener("input", () => {
  updateCharCount();
  updateSubmitState();
});

dropzone.addEventListener("click", () => {
  if (!isSubmitting) fileInput.click();
});

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!isSubmitting) fileInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!isSubmitting) dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  if (!isSubmitting) handleFiles(event.dataTransfer.files);
});

fileInput.addEventListener("change", () => handleFiles(fileInput.files));

replaceButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!isSubmitting) fileInput.click();
});

removeButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!isSubmitting) clearSelectedFile();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const input = validateInput();

  if (input.error) {
    setStatus(input.error, "is-error");
    return;
  }

  hidePanels();
  setLoading(true);
  setStatus("Analyzing resume…");

  try {
    const payload = await buildRequest(input);
    const raw = await callApi(payload);
    const data = parseResponse(raw);

    if (data.error != null || data.overall_score == null) {
      renderError(data.error || "The analysis did not return a score.", data);
      return;
    }

    renderResult(data);
  } catch (error) {
    renderError(error.message || "Could not complete the analysis. Try again.");
  } finally {
    setLoading(false);
  }
});

// ---------- Init ----------
updateCharCount();
updateSubmitState();
