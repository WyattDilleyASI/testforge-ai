// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — Pass 2: cross-reference
// ═══════════════════════════════════════════════════════════════════════════
//
// For each pending candidate from a seeding job, identify which existing
// requirements would benefit from having this candidate as KB context
// during test case generation.
//
// Submits a single Batch API request containing all candidates and all
// requirements as input; Claude returns a relevance matrix. Matches
// above XREF_AUTO_THRESHOLD are pre-applied (user_decision='kept'),
// lower-confidence matches are surfaced as 'pending' suggestions.
//
// Exports:
//   submitXrefBatch(jobId)    — submit batch, return batch_id (or null
//                               if no candidates or no requirements)
//   ingestXrefResults(jobId)  — parse results, insert xref_matches rows
//
// Idempotent: re-running ingest clears existing matches for the job's
// pending candidates before inserting fresh ones. This supports manual
// re-xref after new requirements have been imported.

const { getKbDb, getReqDb, logTokenUsage } = require("../db");
const { submitBatch, getBatchResults } = require("./batch");

// ─── Constants ──────────────────────────────────────────────────────────────

const XREF_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const XREF_MAX_TOKENS = 16000;

// Confidence above this is auto-applied (user_decision='kept', auto_applied=1)
const XREF_AUTO_THRESHOLD = 0.7;

// Confidence floor — matches below this are dropped entirely
const MIN_XREF_CONFIDENCE = 0.4;

// Per-candidate match cap (sorted by confidence desc) — prevents one
// noisy candidate from creating dozens of marginal links
const MAX_MATCHES_PER_CANDIDATE = 10;

// Truncation caps for prompt construction
const MAX_CANDIDATE_CONTENT_CHARS = 400;
const MAX_REQ_DESCRIPTION_CHARS = 300;

// Soft scale warning threshold
const LARGE_REQ_COUNT_THRESHOLD = 500;

// ─── Cross-reference prompt ─────────────────────────────────────────────────

const XREF_SYSTEM_PROMPT = `You are cross-referencing extracted Knowledge Base candidates against existing requirements in TestForge. For each candidate, identify which requirements would benefit from having this knowledge as context during test case generation.

CONFIDENCE GUIDANCE:
- 1.0 = the candidate directly describes behavior, defects, or rules tested by this requirement
- 0.8 = strongly related: same feature area, overlapping concerns; would clearly inform test cases
- 0.6 = moderately related: shared component or domain; might be useful as context
- 0.4 = weakly related: tangential connection; surface for human review
- Below 0.4: do NOT include in output

OUTPUT FORMAT — return ONLY a JSON array, no preamble, no markdown fences:

[
  {
    "candidate_id": "CAND-XXX-NNN",
    "matches": [
      {
        "req_id": "EXACT-ID-FROM-INPUT",
        "confidence": 0.85,
        "justification": "One sentence stating why this requirement benefits from this knowledge."
      }
    ]
  }
]

RULES:
- Use the EXACT candidate_id and req_id strings as provided in the input lists. Do not invent IDs.
- A candidate may match zero, one, or many requirements. Candidates with no matches may be omitted from the output.
- Only include matches with confidence >= 0.4.
- Match on semantic content, not just keyword overlap. A KB entry mentioning "session" matches a requirement about authentication ONLY if the requirement's acceptance criteria involve session behavior.

MATCHING HEURISTICS BY KB TYPE:
- "Defect History" — match to requirements covering the area where the defect occurred, especially regression-critical ones
- "System Behavior" — match to requirements that test or depend on the described behavior
- "Environment Constraint" — match to requirements that exercise the constrained environment
- "Business Rule" — match to requirements that enforce or depend on the rule
- "Test Data Guideline" — match to requirements that involve the relevant data types or constraints

QUALITY OVER QUANTITY:
- It is better to surface fewer high-confidence matches than many low-confidence ones.
- A candidate matching nothing is acceptable; force-fit matches help no one.
- Do not lower your threshold to find matches for every candidate.`;

// ─── Prompt formatters ──────────────────────────────────────────────────────

function safeParseJsonArray(str) {
  try {
    const parsed = JSON.parse(str || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatCandidateForPrompt(candidate) {
  const tags = safeParseJsonArray(candidate.suggested_tags);
  const content = (candidate.content || "").slice(0, MAX_CANDIDATE_CONTENT_CHARS);
  const tagPart = tags.length ? ` [tags: ${tags.join(", ")}]` : "";
  return `- ${candidate.candidate_id} [${candidate.type}] ${candidate.title}: ${content}${tagPart}`;
}

function formatRequirementForPrompt(req) {
  const tags = safeParseJsonArray(req.tags);
  const desc = (req.description || "").slice(0, MAX_REQ_DESCRIPTION_CHARS);
  const modulePart = req.module ? ` [${req.module}]` : "";
  const tagPart = tags.length ? ` [tags: ${tags.join(", ")}]` : "";
  return `- ${req.req_id}${modulePart} ${req.title}: ${desc}${tagPart}`;
}

// ─── submitXrefBatch (exported) ─────────────────────────────────────────────

/**
 * Build and submit a cross-reference batch for the pending candidates of
 * a job. Returns the batch_id, or null if there's nothing to xref
 * (no pending candidates, or no requirements in the DB).
 *
 * Callers must persist the returned batch_id to kb_seeding_jobs.batch_id_xref
 * themselves — this function is pure with respect to the job row.
 *
 * @param {string} jobId
 * @returns {Promise<string | null>}
 */
async function submitXrefBatch(jobId) {
  const kbDb = getKbDb();
  const reqDb = getReqDb();

  // Load pending candidates
  const candidates = kbDb.prepare(`
    SELECT candidate_id, title, type, content, suggested_tags
    FROM kb_seeding_candidates
    WHERE job_id = ? AND status = 'pending_review'
    ORDER BY rowid ASC
  `).all(jobId);

  if (candidates.length === 0) {
    console.log(`Job ${jobId}: no pending candidates to cross-reference`);
    return null;
  }

  // Load all requirements
  const requirements = reqDb.prepare(`
    SELECT req_id, title, description, module, tags
    FROM requirements
    ORDER BY req_id ASC
  `).all();

  if (requirements.length === 0) {
    console.log(`Job ${jobId}: no requirements in DB; skipping cross-reference`);
    return null;
  }

  // Soft scale warning — prompt may approach context limits
  if (requirements.length > LARGE_REQ_COUNT_THRESHOLD) {
    console.warn(
      `Job ${jobId}: cross-referencing against ${requirements.length} requirements ` +
      `(threshold ${LARGE_REQ_COUNT_THRESHOLD}). Consider scoping by module if quality suffers.`
    );
  }

  // Build prompt body
  const candidatesBlock = candidates.map(formatCandidateForPrompt).join("\n");
  const requirementsBlock = requirements.map(formatRequirementForPrompt).join("\n");
  const userContent = `CANDIDATES:\n${candidatesBlock}\n\nREQUIREMENTS:\n${requirementsBlock}`;

  // Submit as a single-request batch
  const request = {
    custom_id: `xref_${jobId}`,
    params: {
      model: XREF_MODEL,
      max_tokens: XREF_MAX_TOKENS,
      system: XREF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    },
  };

  const batchId = await submitBatch([request]);
  return batchId;
}

// ─── Output parsing ─────────────────────────────────────────────────────────

function parseXrefOutput(text) {
  if (!text) return [];
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn(`Xref output was ${typeof parsed}, expected array`);
      return [];
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to parse xref output: ${err.message}`);
    console.error(`Output preview: ${cleaned.slice(0, 200)}`);
    return [];
  }
}

function validateMatch(raw) {
  if (!raw || typeof raw !== "object") return null;

  const reqId = String(raw.req_id || "").trim();
  if (!reqId) return null;

  const confidence =
    typeof raw.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : null;
  if (confidence === null || confidence < MIN_XREF_CONFIDENCE) return null;

  const justification =
    typeof raw.justification === "string"
      ? raw.justification.trim().slice(0, 500) || null
      : null;

  return { req_id: reqId, confidence, justification };
}

// ─── ingestXrefResults (exported) ───────────────────────────────────────────

/**
 * Fetch the xref batch results, validate matches, and write them to
 * kb_seeding_xref_matches. Auto-applies high-confidence matches by
 * setting user_decision='kept' (the auto_applied=1 flag records that
 * this decision was machine-driven, not user-confirmed).
 *
 * Idempotent / re-xref-safe: clears existing matches for the job's
 * currently-pending candidates before inserting fresh ones. Matches
 * tied to already-accepted or already-rejected candidates are
 * preserved.
 *
 * @param {string} jobId
 * @returns {Promise<void>}
 */
async function ingestXrefResults(jobId) {
  const db = getKbDb();
  const job = db
    .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (!job.batch_id_xref) {
    throw new Error(`Job ${jobId} has no cross-reference batch ID`);
  }

  // Fetch batch results
  const results = await getBatchResults(job.batch_id_xref);
  if (results.length === 0) {
    console.warn(`Job ${jobId}: xref batch returned no results`);
    return;
  }

  // Single-request batch; expect exactly one result
  const result = results[0];
  if (result.result?.type !== "succeeded") {
    throw new Error(
      `Xref batch failed: ${result.result?.error?.message || result.result?.type}`
    );
  }

  // Token accounting
  const usage = result.result.message?.usage;
  if (usage) {
    logTokenUsage(
      `${job.created_by} (seeding-xref)`,
      null,
      usage.input_tokens || 0,
      usage.output_tokens || 0
    );
  }

  // Warn if the output was truncated
  if (result.result.message?.stop_reason === "max_tokens") {
    console.warn(
      `Job ${jobId}: xref output truncated at max_tokens; some matches may be lost`
    );
  }

  // Parse and validate
  const text = (result.result.message?.content || [])
    .filter(c => c.type === "text")
    .map(c => c.text)
    .join("\n");
  const candidateMatchSets = parseXrefOutput(text);

  // Build lookup sets to reject hallucinated IDs
  const pendingCandidateIds = new Set(
    db.prepare(`
      SELECT candidate_id FROM kb_seeding_candidates
      WHERE job_id = ? AND status = 'pending_review'
    `).all(jobId).map(r => r.candidate_id)
  );

  if (pendingCandidateIds.size === 0) {
    console.log(`Job ${jobId}: no pending candidates remain; nothing to ingest`);
    return;
  }

  const validReqIds = new Set(
    getReqDb()
      .prepare("SELECT req_id FROM requirements")
      .all()
      .map(r => r.req_id)
  );

  // Clear existing matches for pending candidates (re-xref support).
  // Matches for accepted/rejected candidates are preserved.
  const candidateIdsList = [...pendingCandidateIds];
  const placeholders = candidateIdsList.map(() => "?").join(",");
  db.prepare(`
    DELETE FROM kb_seeding_xref_matches
    WHERE candidate_id IN (${placeholders})
  `).run(...candidateIdsList);

  // Counters for logging
  let totalMatches = 0;
  let autoApplied = 0;
  let skippedInvalidCandidate = 0;
  let skippedInvalidReq = 0;

  const insertStmt = db.prepare(`
    INSERT INTO kb_seeding_xref_matches
      (candidate_id, req_id, confidence, justification, auto_applied, user_decision)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    for (const entry of candidateMatchSets) {
      const candId = String(entry?.candidate_id || "").trim();
      if (!pendingCandidateIds.has(candId)) {
        if (candId) skippedInvalidCandidate++;
        continue;
      }

      // Validate, dedupe (Claude occasionally repeats the same req twice),
      // sort by confidence desc, cap at MAX_MATCHES_PER_CANDIDATE
      const rawMatches = Array.isArray(entry?.matches) ? entry.matches : [];
      const validatedByReq = new Map();
      for (const raw of rawMatches) {
        const v = validateMatch(raw);
        if (!v) continue;
        if (!validReqIds.has(v.req_id)) {
          skippedInvalidReq++;
          continue;
        }
        // Keep the highest-confidence instance of any duplicate
        const existing = validatedByReq.get(v.req_id);
        if (!existing || v.confidence > existing.confidence) {
          validatedByReq.set(v.req_id, v);
        }
      }

      const finalMatches = [...validatedByReq.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_MATCHES_PER_CANDIDATE);

      for (const m of finalMatches) {
        const isAuto = m.confidence >= XREF_AUTO_THRESHOLD;
        // Auto-applied matches are pre-kept; the auto_applied flag
        // distinguishes them from human-confirmed keeps later.
        const userDecision = isAuto ? "kept" : "pending";

        insertStmt.run(
          candId,
          m.req_id,
          m.confidence,
          m.justification,
          isAuto ? 1 : 0,
          userDecision
        );

        totalMatches++;
        if (isAuto) autoApplied++;
      }
    }
  });
  txn();

  console.log(
    `Job ${jobId} xref: ${totalMatches} matches across ${pendingCandidateIds.size} ` +
    `candidates (${autoApplied} auto-applied at ≥${XREF_AUTO_THRESHOLD} confidence; ` +
    `${skippedInvalidCandidate} hallucinated candidate refs, ${skippedInvalidReq} hallucinated req refs)`
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  submitXrefBatch,
  ingestXrefResults,
};
