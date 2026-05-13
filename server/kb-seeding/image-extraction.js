// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — Pass 1: image extraction (synchronous, via Claude vision)
// ═══════════════════════════════════════════════════════════════════════════
//
// Parallel to extraction.js but for image uploads. Each image becomes a
// single candidate KB entry, described via Claude vision in a synchronous
// Messages API call (no Batch API — images are typically few enough per
// job that batching adds latency without saving cost).
//
// Per-image error isolation: if vision fails for one image, the others
// still produce candidates. The image file is removed from disk if no
// candidate ends up being created.
//
// Exports:
//   processImageCandidates(jobId, parsedImages)
//     — Save each image to disk, describe via vision, insert candidates.
//       Returns { processed, candidates, errors }.

const {
  getKbDb,
  logTokenUsage,
  saveSeedingImage,
  deleteSeedingImage,
} = require("../db");

// ─── Constants ──────────────────────────────────────────────────────────────

const VISION_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const VISION_MAX_TOKENS = 2000;
const MIN_CANDIDATE_CONFIDENCE = 0.3;

const VALID_KB_TYPES = new Set([
  "Defect History",
  "System Behavior",
  "Environment Constraint",
  "Business Rule",
  "Test Data Guideline",
]);

// ─── Image vision prompt ────────────────────────────────────────────────────

const IMAGE_VISION_SYSTEM_PROMPT = `You are extracting a Knowledge Base candidate entry from an image uploaded to TestForge, a QA test case generation system. The image is typically one of:
- a screenshot of system UI in a particular state
- a captured error message, dialog, or unexpected behavior
- a system diagram or architecture sketch
- a defect observation captured for triage
- visible test data or configuration

Your job is to convert what you see into ONE curated KB entry that will inform future test case generation.

EXTRACT the image as ONE of these 5 types (use the exact string):

- "Defect History" — visible bugs, regressions, or edge cases (e.g., an error modal with a misleading message; a UI showing wrong data)
- "System Behavior" — non-obvious system state, especially state that's hard to describe in words (e.g., a settings panel showing a specific configuration; a dashboard in a particular state)
- "Environment Constraint" — deployment or infrastructure context visible in the image (e.g., a console showing a missing dependency; a browser dev tools panel showing a config issue)
- "Business Rule" — domain logic or validation visible in the UI (e.g., a form showing a specific validation error; an approval workflow state)
- "Test Data Guideline" — example data shape, boundary, or constraint (e.g., a form populated with edge-case input; a database row showing a specific format)

SKIP CRITERIA — if the image matches any of these, return an empty array []:
- Pure decoration (logos, marketing graphics, stock photos, memes)
- Charts or visualizations with no testable claim about the system
- Selfies, profile pictures, irrelevant photos
- Anything you cannot ground in a verifiable claim about how the system behaves

OUTPUT FORMAT — return ONLY a JSON array with EXACTLY ONE object, or [] to skip. No preamble, no markdown fences.

[{
  "title": "concise (5-15 words), specific to what's visible (e.g., 'Login modal shows generic error for locked accounts')",
  "type": "one of the 5 types above (exact string match)",
  "content": "2-4 sentence description of what's visible AND what it means for testing; include specifics (what UI element, what state, what error text)",
  "suggested_tags": ["general keywords", "feature areas", "component names"],
  "extraction_confidence": 0.0,
  "source_hint": "the screen, dialog, or context name if identifiable (e.g., 'login modal', 'PDF export dialog'), else null"
}]

NOTES ON suggested_tags:
- General keywords only (e.g., "authentication", "pdf-parsing", "session-management")
- Do NOT include requirement IDs (RS-001, TC-002, etc.) — those are added in a separate later pass.
- Aim for 2-5 tags.

extraction_confidence GUIDANCE:
- 1.0 = unambiguously shows specific, verifiable system state
- 0.7 = clearly testable knowledge, but somewhat ambiguous context
- 0.5 = partial — visible content is useful but interpretation requires guesses
- 0.3 = stretch; barely meets the bar
- Below 0.3 → skip entirely by returning []

QUALITY STANDARDS:
- Title should reference what's specifically visible, not generic
- Content should be grounded in what's literally in the image. Don't invent UI labels, error text, or details that aren't shown
- If text in the image is partially obscured or low-resolution, note "appears to read" rather than guessing
- Skip rather than guess

Return [] if the image contains no extractable testable knowledge.`;

// ─── Output parsing ─────────────────────────────────────────────────────────
//
// NOTE: parseExtractionOutput, validateCandidate, and buildCandidateId are
// duplicated from extraction.js for now. If a third extraction path lands
// (e.g., PDF), refactor to a shared kb-seeding/candidates.js module.

function parseExtractionOutput(text) {
  if (!text) return [];

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn(
        `Vision extraction output was ${typeof parsed}, expected array`
      );
      return [];
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to parse vision output: ${err.message}`);
    console.error(`Output preview: ${cleaned.slice(0, 200)}`);
    return [];
  }
}

function validateCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;

  const title = String(raw.title || "").trim();
  const type = String(raw.type || "").trim();
  const content = String(raw.content || "").trim();

  if (!title || !content) return null;
  if (!VALID_KB_TYPES.has(type)) return null;

  const confidence =
    typeof raw.extraction_confidence === "number"
      ? Math.max(0, Math.min(1, raw.extraction_confidence))
      : 0.5;
  if (confidence < MIN_CANDIDATE_CONFIDENCE) return null;

  const tags = Array.isArray(raw.suggested_tags)
    ? raw.suggested_tags
        .filter(t => typeof t === "string" && t.trim().length > 0)
        .map(t => t.trim())
        .slice(0, 10)
    : [];

  const sourceHint =
    typeof raw.source_hint === "string" && raw.source_hint.trim()
      ? raw.source_hint.trim()
      : null;

  return {
    title: title.slice(0, 300),
    type,
    content: content.slice(0, 5000),
    suggested_tags: tags,
    extraction_confidence: confidence,
    source_hint: sourceHint,
  };
}

// ─── Candidate ID generation ────────────────────────────────────────────────

// CAND-{jobNumber}-{seq}. Mirrors extraction.js — kept in sync so image
// and text candidates share one ID space within a job.
function buildCandidateId(jobId, runningCount) {
  const jobNum = jobId.replace(/^SEED-/, "");
  return `CAND-${jobNum}-${String(runningCount + 1).padStart(3, "0")}`;
}

// ─── Vision API call (internal) ─────────────────────────────────────────────

async function describeImageViaVision(parsedImage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const base64Data = parsedImage.buffer.toString("base64");

  const userContent = [
    {
      type: "text",
      text: `This image was uploaded as "${parsedImage.original_name}". Extract a KB candidate entry following the system prompt.`,
    },
    {
      type: "image",
      source: {
        type: "base64",
        media_type: parsedImage.media_type,
        data: base64Data,
      },
    },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: VISION_MAX_TOKENS,
      system: IMAGE_VISION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(
      `Claude vision error: ${data.error.message || data.error.type}`
    );
  }

  const text = (data.content || [])
    .filter(c => c.type === "text")
    .map(c => c.text)
    .join("\n");

  const usage = data.usage || {};

  return {
    text,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}

// ─── processImageCandidates (exported) ──────────────────────────────────────

/**
 * Process a list of parsed image files for a seeding job:
 *   1. Save each image to data/seeding-images/{jobId}/
 *   2. Call Claude vision to describe it as a KB candidate
 *   3. Insert a row into kb_seeding_candidates
 *
 * Each image is independent — a failure on one doesn't stop the others.
 * Images that fail vision OR produce no extractable candidate have their
 * saved file cleaned up so we don't leak storage.
 *
 * @param {string} jobId
 * @param {Array<{ buffer: Buffer, source_type: 'image', media_type: string, original_name: string }>} parsedImages
 * @returns {Promise<{ processed: number, candidates: number, errors: number }>}
 */
async function processImageCandidates(jobId, parsedImages) {
  if (!Array.isArray(parsedImages) || parsedImages.length === 0) {
    return { processed: 0, candidates: 0, errors: 0 };
  }

  const db = getKbDb();
  const job = db
    .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Start the CAND-xxx-NNN sequence after any candidates that already
  // exist for this job (mixed jobs may have text candidates already).
  let runningCount = db
    .prepare(
      "SELECT COUNT(*) AS c FROM kb_seeding_candidates WHERE job_id = ?"
    )
    .get(jobId).c;

  const insertStmt = db.prepare(`
    INSERT INTO kb_seeding_candidates
      (candidate_id, job_id, title, type, content, suggested_tags,
       subsection_id, pinned, extraction_confidence, source_input_ref,
       source_url, status, original_extracted,
       media_type, image_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'pending_review', ?, ?, ?)
  `);

  let processed = 0;
  let candidatesInserted = 0;
  let errors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const img of parsedImages) {
    processed++;

    // Save image to disk BEFORE the vision call so we have it on hand
    // if anything downstream needs to retry.
    let savedFilename;
    try {
      const base64Data = img.buffer.toString("base64");
      savedFilename = saveSeedingImage(jobId, img.original_name, base64Data);
    } catch (err) {
      console.error(
        `Job ${jobId}: failed to save image ${img.original_name}: ${err.message}`
      );
      errors++;
      continue;
    }

    // Vision API call
    let visionResult;
    try {
      visionResult = await describeImageViaVision(img);
    } catch (err) {
      console.error(
        `Job ${jobId}: vision failed for ${img.original_name}: ${err.message}`
      );
      try { deleteSeedingImage(jobId, savedFilename); } catch { /* best effort */ }
      errors++;
      continue;
    }

    totalInputTokens += visionResult.inputTokens;
    totalOutputTokens += visionResult.outputTokens;

    // Parse Claude's output
    const raws = parseExtractionOutput(visionResult.text);

    if (raws.length === 0) {
      console.warn(
        `Job ${jobId}: ${img.original_name} produced no candidates (image may not contain testable knowledge)`
      );
      try { deleteSeedingImage(jobId, savedFilename); } catch { /* best effort */ }
      continue;
    }

    if (raws.length > 1) {
      console.warn(
        `Job ${jobId}: ${img.original_name} produced ${raws.length} candidates from vision — using only first`
      );
    }

    const normalized = validateCandidate(raws[0]);
    if (!normalized) {
      console.warn(
        `Job ${jobId}: ${img.original_name} candidate failed validation`
      );
      try { deleteSeedingImage(jobId, savedFilename); } catch { /* best effort */ }
      continue;
    }

    // Insert candidate row
    const candId = buildCandidateId(jobId, runningCount);
    runningCount++;

    const sourceInputRef = {
      source_name: img.original_name,
      chunk_index: null,
      section_heading: normalized.source_hint,
    };

    const originalExtracted = {
      title: normalized.title,
      type: normalized.type,
      content: normalized.content,
      suggested_tags: normalized.suggested_tags,
    };

    insertStmt.run(
      candId,
      jobId,
      normalized.title,
      normalized.type,
      normalized.content,
      JSON.stringify(normalized.suggested_tags),
      job.default_subsection_id,
      normalized.extraction_confidence,
      JSON.stringify(sourceInputRef),
      null,                          // source_url
      JSON.stringify(originalExtracted),
      img.media_type,                // media_type
      savedFilename                  // image_file
    );
    candidatesInserted++;
  }

  // Token usage attributed to the seeding initiator
  if (totalInputTokens || totalOutputTokens) {
    logTokenUsage(
      `${job.created_by} (seeding-image)`,
      null, // not requirement-scoped
      totalInputTokens,
      totalOutputTokens
    );
  }

  console.log(
    `Job ${jobId} image extraction: ${candidatesInserted} candidates from ` +
      `${processed} images (${errors} errored)`
  );

  return { processed, candidates: candidatesInserted, errors };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  processImageCandidates,
};