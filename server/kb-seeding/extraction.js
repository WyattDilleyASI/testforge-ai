// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — Pass 1: extraction
// ═══════════════════════════════════════════════════════════════════════════
//
// Submits chunked source text to Claude via the Batch API and ingests the
// resulting candidate KB entries. The extraction prompt is tuned to:
//   - Identify content that maps to one of TestForge's 5 KB entry types
//   - Skip content that isn't testable knowledge (org charts, fluff, plans)
//   - Return structured JSON with a confidence score per candidate
//
// Exports:
//   submitExtractionBatch(jobId, chunks)  — submit batch, persist metadata
//   ingestExtractionResults(jobId)        — parse results, insert candidates

const { getKbDb, logTokenUsage } = require("../db");
const { submitBatch, getBatchResults } = require("./batch");

// ─── Constants ──────────────────────────────────────────────────────────────

const EXTRACTION_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const EXTRACTION_MAX_TOKENS = 8000;
const MIN_CANDIDATE_CONFIDENCE = 0.3;

const VALID_KB_TYPES = new Set([
  "Defect History",
  "System Behavior",
  "Environment Constraint",
  "Business Rule",
  "Test Data Guideline",
]);

// ─── Extraction prompt ──────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are extracting Knowledge Base candidate entries from source material for a QA test case generation system called TestForge. Each candidate becomes a piece of curated context that informs future test case generation.

EXTRACT entries that capture testable knowledge about the system:

- "Defect History" — past bugs, regressions, or edge cases discovered in production or testing (e.g., "PDF parser crashes on scanned PDFs without embedded text")
- "System Behavior" — how the system actually works, especially non-obvious behavior (e.g., "Login sessions expire after 8 hours of inactivity, not 8 hours total")
- "Environment Constraint" — deployment, infrastructure, or operational requirements (e.g., "Reports module requires Crystal Reports runtime; not installed on QA VMs by default")
- "Business Rule" — domain logic, policy, or validation rules the system enforces (e.g., "Refunds over $500 require manager approval via the approval queue")
- "Test Data Guideline" — how to construct realistic test data, what boundary values matter (e.g., "Customer IDs are 9 digits; first digit cannot be 0")

SKIP content that isn't testable knowledge:
- Org charts, contact lists, meeting logistics, status updates
- Generic introductions, getting-started guides, marketing material
- End-user tutorials (unless they describe verifiable system behavior)
- Roadmap items, future plans, hypothetical scenarios
- Anything you cannot anchor to a specific, verifiable claim about how the system behaves today

OUTPUT FORMAT — return ONLY a JSON array, no preamble, no markdown fences. Each element is an object:

{
  "title": "concise (5-15 words), specific to what the entry covers",
  "type": "one of the 5 types above (exact string match)",
  "content": "condensed 2-4 sentence restatement in your own words; include specifics (what fails, what triggers it, what the system does instead)",
  "suggested_tags": ["general keywords", "feature areas", "component names"],
  "extraction_confidence": 0.0,
  "source_hint": "section heading or surrounding context if identifiable, else null"
}

NOTES ON suggested_tags:
- General keywords only (e.g., "authentication", "pdf-parsing", "session-management")
- Do NOT include requirement IDs (RS-001, TC-002, etc.) — those are added in a separate later pass.
- Aim for 2-5 tags. Skip if no obvious tags apply.

extraction_confidence GUIDANCE:
- 1.0 = unambiguously a useful knowledge entry, specific and verifiable
- 0.7 = clearly knowledge, but somewhat vague or general
- 0.5 = ambiguous, might or might not be useful
- 0.3 = stretch; better to skip than fabricate
- Anything below 0.3 should be omitted entirely

QUALITY STANDARDS:
- One distinct piece of knowledge per entry. Don't merge unrelated topics.
- Be specific. Vague entries ("PDF parsing has a bug") are useless; specific entries ("PDF parser crashes on scanned PDFs without OCR") are valuable.
- Don't invent details not present in the source. If a detail is missing, note it as unknown rather than guessing.
- Skip rather than guess. We can review lower-confidence candidates, but we cannot un-fabricate content.

If the source contains no extractable knowledge, return an empty array: []`;

// ─── Request builder ────────────────────────────────────────────────────────

// Build one Batch API request for a single chunk.
// custom_id format: extract_{jobId}_{globalIndex} — parsed in ingestion
// to map results back to chunk metadata.
function buildExtractionRequest(jobId, chunk, globalIndex) {
  const userContent = chunk.source_name
    ? `Source: ${chunk.source_name}\n\nContent:\n${chunk.text}`
    : `Content:\n${chunk.text}`;

  return {
    custom_id: `extract_${jobId}_${globalIndex}`,
    params: {
      model: EXTRACTION_MODEL,
      max_tokens: EXTRACTION_MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    },
  };
}

// ─── submitExtractionBatch (exported) ───────────────────────────────────────

/**
 * Build extraction requests, submit to the Batch API, and persist
 * chunk metadata + batch_id_extract to kb_seeding_jobs.input_summary
 * in a single atomic UPDATE.
 *
 * @param {string} jobId
 * @param {Array<{text: string, source_name: string, chunk_index: number, source_url: string|null}>} chunks
 * @returns {Promise<string>} batch_id
 */
async function submitExtractionBatch(jobId, chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("submitExtractionBatch: no chunks provided");
  }

  const db = getKbDb();
  const jobRow = db
    .prepare("SELECT input_summary FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!jobRow) throw new Error(`Job ${jobId} not found`);

  // Build batch requests
  const requests = chunks.map((chunk, idx) =>
    buildExtractionRequest(jobId, chunk, idx)
  );

  // Submit to Anthropic
  const batchId = await submitBatch(requests);

  // Build chunk metadata for persistence (text body NOT persisted)
  const chunkMeta = chunks.map((c, idx) => ({
    global_index: idx,
    source_name: c.source_name || null,
    chunk_index: c.chunk_index ?? null,
    source_url: c.source_url || null,
    chars: (c.text || "").length,
  }));

  // Merge into existing input_summary
  let summary = {};
  try {
    summary = JSON.parse(jobRow.input_summary || "{}");
  } catch {
    /* fall through with empty */
  }
  summary.chunks = chunkMeta;

  db.prepare(`
    UPDATE kb_seeding_jobs
    SET batch_id_extract = ?, input_summary = ?
    WHERE job_id = ?
  `).run(batchId, JSON.stringify(summary), jobId);

  return batchId;
}

// ─── Output parsing ─────────────────────────────────────────────────────────

// Strip optional markdown fences and parse as JSON array.
// Returns [] on any parse failure (logged but not thrown).
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
        `Extraction output was ${typeof parsed}, expected array`
      );
      return [];
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to parse extraction output: ${err.message}`);
    console.error(`Output preview: ${cleaned.slice(0, 200)}`);
    return [];
  }
}

// Validate + normalize a single candidate. Returns null if the candidate
// is structurally invalid or below the confidence floor.
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

// CAND-{jobNumber}-{seq} — e.g. CAND-001-014.
// Caller passes the running count of already-inserted candidates for
// this job (avoids N+1 SELECTs inside the insert loop).
function buildCandidateId(jobId, runningCount) {
  const jobNum = jobId.replace(/^SEED-/, "");
  return `CAND-${jobNum}-${String(runningCount + 1).padStart(3, "0")}`;
}

// ─── ingestExtractionResults (exported) ─────────────────────────────────────

/**
 * Fetch batch results, parse Claude's per-chunk JSON output, validate
 * each candidate, and insert valid candidates into kb_seeding_candidates.
 *
 * Idempotent: skips if candidates already exist for this job (covers
 * concurrent polling).
 *
 * @param {string} jobId
 * @returns {Promise<void>}
 */
async function ingestExtractionResults(jobId) {
  const db = getKbDb();
  const job = db
    .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (!job.batch_id_extract) {
    throw new Error(`Job ${jobId} has no extraction batch ID`);
  }

  // Idempotency guard — if text candidates exist, this has already run.
  // Filter on media_type IS NULL so we don't false-trigger on image
  // candidates that landed earlier in a mixed job.
  const existing = db
    .prepare(
      "SELECT COUNT(*) AS c FROM kb_seeding_candidates " +
        "WHERE job_id = ? AND media_type IS NULL"
    )
    .get(jobId);
  if (existing.c > 0) {
    console.log(
      `Job ${jobId} already has ${existing.c} text candidates; skipping ingestion`
    );
    return;
  }

  // Pull chunk metadata for result-to-source mapping
  let chunkMeta = [];
  try {
    const summary = JSON.parse(job.input_summary || "{}");
    chunkMeta = Array.isArray(summary.chunks) ? summary.chunks : [];
  } catch {
    /* chunkMeta stays empty */
  }

  // Fetch batch results
  const results = await getBatchResults(job.batch_id_extract);

  let succeededChunks = 0;
  let erroredChunks = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Build normalized candidate list before inserting
  const candidatesToInsert = [];

  for (const result of results) {
    const match = /^extract_(.+)_(\d+)$/.exec(result.custom_id || "");
    if (!match) {
      console.warn(`Unexpected custom_id format: ${result.custom_id}`);
      continue;
    }
    const globalIndex = parseInt(match[2], 10);
    const meta = chunkMeta[globalIndex] || {};

    if (result.result?.type !== "succeeded") {
      erroredChunks++;
      console.error(
        `Chunk ${result.custom_id} failed:`,
        result.result?.error?.message || result.result?.type
      );
      continue;
    }
    succeededChunks++;

    // Token accounting
    const usage = result.result.message?.usage;
    if (usage) {
      totalInputTokens += usage.input_tokens || 0;
      totalOutputTokens += usage.output_tokens || 0;
    }

    // Extract text content blocks
    const text = (result.result.message?.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("\n");

    // Parse + validate each candidate
    const raws = parseExtractionOutput(text);
    for (const raw of raws) {
      const normalized = validateCandidate(raw);
      if (!normalized) continue;
      candidatesToInsert.push({ ...normalized, meta });
    }
  }

  // Insert candidates in a transaction
  if (candidatesToInsert.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO kb_seeding_candidates
        (candidate_id, job_id, title, type, content, suggested_tags,
         subsection_id, pinned, extraction_confidence, source_input_ref,
         source_url, status, original_extracted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'pending_review', ?)
    `);

    const txn = db.transaction(() => {
      // Start after any image candidates already inserted in this job.
      // Read inside the transaction for a consistent snapshot.
      let runningCount = db
        .prepare(
          "SELECT COUNT(*) AS c FROM kb_seeding_candidates WHERE job_id = ?"
        )
        .get(jobId).c;
      for (const c of candidatesToInsert) {
        const candId = buildCandidateId(jobId, runningCount);

        const sourceInputRef = {
          source_name: c.meta.source_name || null,
          chunk_index: c.meta.chunk_index ?? null,
          section_heading: c.source_hint,
        };

        const originalExtracted = {
          title: c.title,
          type: c.type,
          content: c.content,
          suggested_tags: c.suggested_tags,
        };

        insertStmt.run(
          candId,
          jobId,
          c.title,
          c.type,
          c.content,
          JSON.stringify(c.suggested_tags),
          job.default_subsection_id,
          c.extraction_confidence,
          JSON.stringify(sourceInputRef),
          c.meta.source_url || null,
          JSON.stringify(originalExtracted)
        );
        runningCount++;
      }
    });
    txn();
  }

  // Token usage attributed to the seeding initiator
  if (totalInputTokens || totalOutputTokens) {
    logTokenUsage(
      `${job.created_by} (seeding-extract)`,
      null, // not requirement-scoped
      totalInputTokens,
      totalOutputTokens
    );
  }

  // Surface systemic failure: every chunk failed, nothing extracted
  if (succeededChunks === 0 && erroredChunks > 0) {
    throw new Error(
      `All ${erroredChunks} extraction chunks failed — see server logs`
    );
  }

  console.log(
    `Job ${jobId} extraction: ${candidatesToInsert.length} candidates from ` +
      `${succeededChunks} chunks (${erroredChunks} errored)`
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  submitExtractionBatch,
  ingestExtractionResults,
};
