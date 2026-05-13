// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — KB Review (Phase 1+2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Closes the feedback loop on knowledge base quality. The original AL engine
// tells the prompt builder how to compensate for KB gaps; this module
// identifies *which* KB entries need fixing and proposes specific changes.
//
// Pipeline:
//   1. Edit happens to a TC. recordEditAgainstKbs() bumps a counter for
//      each (kb_id, edit_field) pair derived from the TC's kb_references
//      and the diff's fields_changed.
//   2. When a counter hits THRESHOLD, status flips to "ready_for_synthesis".
//   3. synthesizePending() pulls ready counters, fetches the current KB
//      content + sample edited TCs, asks Claude to propose a content
//      revision, stores it in kb_suggestions for human review.
//   4. Reviewer approves → KB content updated, kb_entries.updated_at bumped,
//      counters for that kb_id reset (lazy invalidation).
//
// Tracked fields (from the diff's fields_changed array):
//   - "steps"         — edits to test steps; highest-signal KB indicator
//   - "preconditions" — edits to setup fields (preconditions/environment/
//                       equipment/testData are all bucketed under this in
//                       the diff)
//
// Not tracked: "title", "description" — too often shaped by requirement
// framing rather than KB content.

const { getTcDb, getKbDb, getSetting, setSetting } = require("../db");

// ─── Constants ──────────────────────────────────────────────────────

const KB_TRACKED_FIELDS = ["steps", "preconditions"];
const THRESHOLD = 3;             // Edits per (kb_id, field) before synthesis for normal KBs
const MAX_EVIDENCE_TCS = 3;      // Max sample TCs stored on a counter
// Claude max_tokens for synthesis. Must be large enough to contain a fully
// rewritten KB entry's content (some are several thousand tokens). Setting
// too low truncates the JSON response mid-stream and parsing fails.
const MAX_TOKENS = 8000;

// ─── Virtual KBs ────────────────────────────────────────────────────
// Product Context and Key Terms aren't rows in kb_entries — they're settings
// in core.db that get injected into every TC generation prompt. To track
// edits against them with the same counter/synthesis machinery, we reserve
// two synthetic "kb_id" values and route reads/writes through getSetting/
// setSetting instead of kb_entries.
//
// Universal application means a higher signal threshold (5+ vs 3) — every
// generation reads them, so attribution per single edit is weaker.
const PRODUCT_CONTEXT_ID = "__PRODUCT_CONTEXT__";
const KEY_TERMS_ID       = "__KEY_TERMS__";
const VIRTUAL_THRESHOLD  = 5;
const VIRTUAL_KBS = {
  [PRODUCT_CONTEXT_ID]: { label: "Product Context", settingKey: "product_context" },
  [KEY_TERMS_ID]:       { label: "Key Terms",       settingKey: "key_terms" },
};
const isVirtualKb = (id) => Object.prototype.hasOwnProperty.call(VIRTUAL_KBS, id);
const thresholdFor = (id) => isVirtualKb(id) ? VIRTUAL_THRESHOLD : THRESHOLD;

// ─── Counter Bumping (called from feedback hook) ────────────────────

/**
 * Record that an edited TC referenced these KB entries. For each
 * (kb_id, edit_field) pair where edit_field is one of KB_TRACKED_FIELDS
 * that appears in fieldsChanged, increment a counter. When a counter hits
 * THRESHOLD it's marked ready_for_synthesis on the next synthesizePending()
 * run.
 *
 * Safe to call with empty/missing data — returns early without erroring.
 *
 * @param {object} params
 * @param {string} params.tcId          - TC ID that was edited
 * @param {string[]} params.kbIds       - kb_references on that TC
 * @param {string[]} params.fieldsChanged - diff.fields_changed array
 */
function recordEditAgainstKbs({ tcId, kbIds, fieldsChanged }) {
  if (!tcId) return;
  if (!Array.isArray(fieldsChanged) || fieldsChanged.length === 0) return;

  const trackedFields = fieldsChanged.filter(f => KB_TRACKED_FIELDS.includes(f));
  if (trackedFields.length === 0) return;

  // Append virtual KBs (Product Context, Key Terms) — these apply to every
  // generation, so every KB-related edit gives some signal. Higher threshold
  // (5+) keeps noise bounded. Only included if the corresponding setting is
  // actually populated.
  const universal = [];
  if ((getSetting(VIRTUAL_KBS[PRODUCT_CONTEXT_ID].settingKey) || "").trim()) {
    universal.push(PRODUCT_CONTEXT_ID);
  }
  if ((getSetting(VIRTUAL_KBS[KEY_TERMS_ID].settingKey) || "").trim()) {
    universal.push(KEY_TERMS_ID);
  }

  const allKbs = [...(Array.isArray(kbIds) ? kbIds : []), ...universal];
  if (allKbs.length === 0) return;

  const db = getTcDb();
  const txn = db.transaction(() => {
    for (const kbId of allKbs) {
      for (const field of trackedFields) {
        bumpCounter(db, kbId, field, tcId);
      }
    }
  });
  txn();
}

/**
 * Upsert a counter row. If it doesn't exist, insert with count=1.
 * If it does, increment count and append tcId to sample_tc_ids (capped
 * at MAX_EVIDENCE_TCS). When count reaches THRESHOLD, flip status to
 * ready_for_synthesis (only if currently accumulating).
 */
function bumpCounter(db, kbId, field, tcId) {
  const existing = db.prepare(
    "SELECT id, count, sample_tc_ids, status FROM kb_edit_counters WHERE kb_id = ? AND edit_field = ?"
  ).get(kbId, field);

  if (!existing) {
    db.prepare(`
      INSERT INTO kb_edit_counters (kb_id, edit_field, count, sample_tc_ids)
      VALUES (?, ?, 1, ?)
    `).run(kbId, field, JSON.stringify([tcId]));
    return;
  }

  let samples;
  try { samples = JSON.parse(existing.sample_tc_ids || "[]"); } catch { samples = []; }
  if (!samples.includes(tcId) && samples.length < MAX_EVIDENCE_TCS) {
    samples.push(tcId);
  }

  const newCount = existing.count + 1;
  const shouldFlip = newCount >= thresholdFor(kbId) && existing.status === "accumulating";

  db.prepare(`
    UPDATE kb_edit_counters
       SET count = ?,
           sample_tc_ids = ?,
           last_seen = datetime('now'),
           status = CASE WHEN ? THEN 'ready_for_synthesis' ELSE status END
     WHERE id = ?
  `).run(newCount, JSON.stringify(samples), shouldFlip ? 1 : 0, existing.id);
}

// ─── Lazy Invalidation ──────────────────────────────────────────────

/**
 * Reset all counters for a kb_id. Called when:
 *  - A suggestion for that kb is approved (content has just changed)
 *  - The KB entry is manually edited and we detect first_seen < updated_at
 *
 * "Reset" means delete; the counters will start fresh from any future edits.
 */
function resetCountersForKb(kbId) {
  if (!kbId) return 0;
  const result = getTcDb().prepare("DELETE FROM kb_edit_counters WHERE kb_id = ?").run(kbId);
  return result.changes;
}

/**
 * Walk all counters and reset any whose KB entry has been updated after the
 * counter's first_seen. Cheap to run as a guard before synthesis. Returns
 * the number of counters invalidated.
 */
function invalidateStaleCounters() {
  const counters = getTcDb().prepare("SELECT id, kb_id, first_seen FROM kb_edit_counters").all();
  if (counters.length === 0) return 0;

  const kbIds = [...new Set(counters.map(c => c.kb_id))];
  const placeholders = kbIds.map(() => "?").join(",");
  const kbUpdates = getKbDb()
    .prepare(`SELECT kb_id, updated_at FROM kb_entries WHERE kb_id IN (${placeholders})`)
    .all(...kbIds);
  const updatedAtByKb = Object.fromEntries(kbUpdates.map(r => [r.kb_id, r.updated_at]));

  const stale = counters.filter(c => {
    const kbUpdatedAt = updatedAtByKb[c.kb_id];
    return kbUpdatedAt && kbUpdatedAt > c.first_seen;
  });

  if (stale.length === 0) return 0;
  const staleIds = stale.map(c => c.id);
  const inList = staleIds.map(() => "?").join(",");
  getTcDb().prepare(`DELETE FROM kb_edit_counters WHERE id IN (${inList})`).run(...staleIds);
  return stale.length;
}

// ─── Read Queries ───────────────────────────────────────────────────

function getReadyCounters() {
  return getTcDb()
    .prepare("SELECT * FROM kb_edit_counters WHERE status = 'ready_for_synthesis' ORDER BY count DESC, last_seen ASC")
    .all();
}

function listSuggestions(status) {
  const db = getTcDb();
  if (status) {
    return db.prepare("SELECT * FROM kb_suggestions WHERE status = ? ORDER BY created_at DESC").all(status);
  }
  return db.prepare("SELECT * FROM kb_suggestions ORDER BY created_at DESC").all();
}

function getSuggestion(id) {
  return getTcDb().prepare("SELECT * FROM kb_suggestions WHERE id = ?").get(id);
}

function getCounterStats() {
  return getTcDb().prepare(`
    SELECT status, COUNT(*) AS cnt FROM kb_edit_counters GROUP BY status
  `).all();
}

// ─── Claude Synthesis ───────────────────────────────────────────────

/**
 * Generate a Claude-driven suggestion for one ready counter. Pulls:
 *   - The current KB entry (title + content)
 *   - Sample edited TCs with their generated snapshots (what AI produced)
 *     and reviewed states (what the human shipped)
 *   - The requirements those TCs trace to
 *
 * Asks Claude to propose specific additions/changes to the KB content.
 * Stores the result in kb_suggestions and flips the counter status to
 * synthesized. Returns the new suggestion row, or null if synthesis was
 * skipped (e.g., KB no longer exists, no sample TCs available).
 *
 * Throws on Claude API errors so callers can decide whether to retry.
 */
async function synthesizeSuggestion(counter) {
  const kbDb = getKbDb();
  const tcDb = getTcDb();

  // Resolve the "current entry" — either a kb_entries row or a virtual KB
  // backed by core.db settings. Virtual KBs (Product Context, Key Terms) get
  // a synthetic kb-shaped object so the rest of the pipeline doesn't branch.
  let kb;
  if (isVirtualKb(counter.kb_id)) {
    const virt = VIRTUAL_KBS[counter.kb_id];
    const content = getSetting(virt.settingKey) || "";
    if (!content.trim()) {
      // Setting was cleared — counter is stale.
      tcDb.prepare("DELETE FROM kb_edit_counters WHERE id = ?").run(counter.id);
      return null;
    }
    kb = {
      kb_id: counter.kb_id,
      title: virt.label,
      type: virt.label,
      content,
      images: "[]",
      _virtual: true,
    };
  } else {
    kb = kbDb.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(counter.kb_id);
    if (!kb) {
      tcDb.prepare("DELETE FROM kb_edit_counters WHERE id = ?").run(counter.id);
      return null;
    }
  }

  // Fetch sample TCs (with their snapshots) for evidence.
  let sampleIds;
  try { sampleIds = JSON.parse(counter.sample_tc_ids || "[]"); } catch { sampleIds = []; }
  if (sampleIds.length === 0) return null;

  const placeholders = sampleIds.map(() => "?").join(",");
  const sampleTcs = tcDb.prepare(`
    SELECT tc_id, title, steps, preconditions, description, type,
           generated_snapshot, linked_req_ids
      FROM test_cases
     WHERE tc_id IN (${placeholders})
  `).all(...sampleIds);

  if (sampleTcs.length === 0) return null;

  // Fetch the requirements those TCs trace to, for context.
  const reqIds = [...new Set(sampleTcs.flatMap(tc => {
    try { return JSON.parse(tc.linked_req_ids || "[]"); } catch { return []; }
  }))];
  const reqs = reqIds.length > 0
    ? require("../db").getReqDb()
        .prepare(`SELECT req_id, title, description FROM requirements WHERE req_id IN (${reqIds.map(() => "?").join(",")})`)
        .all(...reqIds)
    : [];

  const prompt = buildSynthesisPrompt(kb, counter.edit_field, sampleTcs, reqs);
  const { text, tokenUsage } = await callClaude(prompt);

  let parsed;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Claude response: ${err.message}\nRaw: ${text.slice(0, 500)}`);
  }

  if (!parsed || typeof parsed.proposed_content !== "string" || typeof parsed.rationale !== "string") {
    throw new Error(`Invalid Claude response shape (need proposed_content + rationale): ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  const result = tcDb.prepare(`
    INSERT INTO kb_suggestions
      (kb_id, edit_field, evidence_tc_ids, current_content, proposed_content,
       rationale, claude_input, claude_output)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    counter.kb_id,
    counter.edit_field,
    counter.sample_tc_ids,
    kb.content,
    parsed.proposed_content,
    parsed.rationale,
    prompt,
    text
  );

  // Mark counter synthesized so we don't re-synthesize the same evidence.
  tcDb.prepare("UPDATE kb_edit_counters SET status = 'synthesized' WHERE id = ?").run(counter.id);

  return {
    suggestion_id: result.lastInsertRowid,
    kb_id: counter.kb_id,
    edit_field: counter.edit_field,
    tokens: tokenUsage,
  };
}

/**
 * Walk all ready_for_synthesis counters and produce suggestions for each.
 * Invalidates stale counters first. Returns a summary array.
 *
 * Callers should expect individual synthesis calls to throw; this swallows
 * per-counter errors and aggregates them in the result so one bad counter
 * doesn't block the rest.
 */
async function synthesizePending() {
  invalidateStaleCounters();
  const ready = getReadyCounters();
  const results = [];

  for (const counter of ready) {
    try {
      const result = await synthesizeSuggestion(counter);
      if (result) results.push({ ok: true, ...result });
    } catch (err) {
      results.push({ ok: false, counter_id: counter.id, kb_id: counter.kb_id, error: err.message });
    }
  }

  return results;
}

// ─── Approve / Reject ───────────────────────────────────────────────

/**
 * Apply a pending suggestion: update the KB entry's content with the
 * proposed_content, bump kb_entries.updated_at, mark suggestion approved,
 * and reset counters for that kb_id (lazy invalidation pattern).
 *
 * Throws if the suggestion isn't pending or the KB entry no longer exists.
 */
function approveSuggestion(id, userName, note) {
  const tcDb = getTcDb();
  const kbDb = getKbDb();

  const sug = tcDb.prepare("SELECT * FROM kb_suggestions WHERE id = ?").get(id);
  if (!sug) throw new Error(`Suggestion ${id} not found`);
  if (sug.status !== "pending") throw new Error(`Suggestion ${id} is already ${sug.status}`);

  // Apply to the right backing store: kb_entries.content for normal KBs,
  // core.db settings for virtual KBs (Product Context, Key Terms).
  if (isVirtualKb(sug.kb_id)) {
    const virt = VIRTUAL_KBS[sug.kb_id];
    setSetting(virt.settingKey, sug.proposed_content);
  } else {
    const kb = kbDb.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(sug.kb_id);
    if (!kb) throw new Error(`KB entry ${sug.kb_id} no longer exists`);
    kbDb.prepare("UPDATE kb_entries SET content = ?, updated_at = datetime('now') WHERE kb_id = ?")
      .run(sug.proposed_content, sug.kb_id);
  }

  tcDb.prepare(`
    UPDATE kb_suggestions
       SET status = 'approved',
           decision_by = ?,
           decision_at = datetime('now'),
           decision_note = ?
     WHERE id = ?
  `).run(userName || "system", note || null, id);

  resetCountersForKb(sug.kb_id);

  return { ok: true, kb_id: sug.kb_id };
}

function rejectSuggestion(id, userName, note) {
  const tcDb = getTcDb();
  const sug = tcDb.prepare("SELECT * FROM kb_suggestions WHERE id = ?").get(id);
  if (!sug) throw new Error(`Suggestion ${id} not found`);
  if (sug.status !== "pending") throw new Error(`Suggestion ${id} is already ${sug.status}`);

  tcDb.prepare(`
    UPDATE kb_suggestions
       SET status = 'rejected',
           decision_by = ?,
           decision_at = datetime('now'),
           decision_note = ?
     WHERE id = ?
  `).run(userName || "system", note || null, id);

  return { ok: true };
}

// ─── Prompt Building ────────────────────────────────────────────────

function buildSynthesisPrompt(kb, editField, sampleTcs, reqs) {
  const fieldLabel = editField === "steps"
    ? "test steps (step actions and expected results)"
    : "test setup (preconditions, environment, equipment, test data)";

  const reqMap = Object.fromEntries(reqs.map(r => [r.req_id, r]));

  // Surface image descriptions as additional KB context — they often describe
  // UI elements, diagrams, or workflows that drive how testers write steps.
  // Undescribed images are noted by count only; we don't ship raw bytes here
  // (the synthesis call stays text-only for cost/simplicity).
  let images = [];
  try { images = JSON.parse(kb.images || "[]"); } catch {}
  const describedImages = images.filter(img => img && img.description);
  const undescribedCount = images.length - describedImages.length;

  let imageBlock = "";
  if (describedImages.length > 0) {
    imageBlock = `\n\nAttached image references (descriptions only):\n${describedImages.map(img => `  [${img.name}] ${img.description.replace(/\n/g, "\n    ")}`).join("\n")}`;
  }
  if (undescribedCount > 0) {
    imageBlock += `\n\n(${undescribedCount} additional image${undescribedCount === 1 ? "" : "s"} attached to this entry without text descriptions — not visible in this synthesis.)`;
  }

  const tcBlocks = sampleTcs.map((tc, idx) => {
    let snap = null;
    try { snap = tc.generated_snapshot ? JSON.parse(tc.generated_snapshot) : null; } catch {}

    const reqIds = (() => { try { return JSON.parse(tc.linked_req_ids || "[]"); } catch { return []; } })();
    const reqBlocks = reqIds.map(rid => {
      const r = reqMap[rid];
      return r ? `- ${rid}: ${r.title}\n  ${r.description || ""}` : `- ${rid}`;
    }).join("\n");

    const before = editField === "steps"
      ? formatSteps(snap?.steps)
      : formatSetup(snap?.preconditions);
    const after = editField === "steps"
      ? formatSteps(safeParse(tc.steps))
      : formatSetup(safeParse(tc.preconditions));

    return `### Sample ${idx + 1}: ${tc.tc_id} — ${tc.title}
Requirement(s):
${reqBlocks || "  (none)"}

BEFORE (AI-generated, ${fieldLabel}):
${before}

AFTER (human-edited ${fieldLabel}):
${after}`;
  }).join("\n\n");

  // Frame the prompt differently for virtual KBs (Product Context, Key Terms).
  // They aren't typical KB entries — they're settings injected into every
  // generation, so the prompt acknowledges their universal scope and the
  // tradeoff of being more conservative when revising them.
  if (kb._virtual) {
    const sourceLabel = kb.title;
    const description = kb.kb_id === PRODUCT_CONTEXT_ID
      ? "general descriptive context about the product (terminology, structure, key concepts)"
      : "a glossary of key terms used across the product";

    return `You are reviewing the **${sourceLabel}** that is injected into every test case generation prompt. It contains ${description}. The same content has been a contributing context for ${sampleTcs.length} test cases that were subsequently edited by human reviewers — specifically in their ${fieldLabel}. This suggests the ${sourceLabel} may be missing information, ambiguous, or out-of-date with how testers actually describe the system.

Below is the current ${sourceLabel} followed by the test-case edits that flagged it.

# Current ${sourceLabel}
${kb.content}

# Evidence: Edits Made to Test Cases Generated With This Context
${tcBlocks}

# Your Task
Identify what knowledge appears to be missing, ambiguous, or wrong in the current ${sourceLabel} based on these edits. Propose a specific revision that, if applied, would have led the AI to generate test cases closer to the human-edited versions on the first try.

Constraints on your proposed revision:
- The ${sourceLabel} applies to EVERY generation across the whole product, not just the requirements shown here. Revisions must be broadly useful — do not encode requirement-specific details.
- Keep what's working; add or clarify only what the edits demonstrate is missing.
- If the issue looks like AI hallucination (correct terminology already exists but was ignored), say so in the rationale and consider adding "AVOID:" callouts in the proposed content to suppress the wrong term.

Respond in this JSON format ONLY (no surrounding prose, no markdown fences):
{
  "rationale": "Brief explanation (2-3 sentences) of what was missing/unclear and how the proposed revision addresses it.",
  "proposed_content": "The full revised ${sourceLabel}. Plain text matching the style of the existing content."
}`;
  }

  return `You are reviewing a knowledge base entry that is used as context when generating test cases. The same KB entry has been referenced by ${sampleTcs.length} test cases that were subsequently edited by human reviewers — specifically in their ${fieldLabel}. This suggests the KB entry is missing information, is ambiguous, or has details that conflict with what testers actually need.

Below is the current KB entry followed by the test-case edits that flagged it.

# Current KB Entry
Title: ${kb.title}
Type: ${kb.type}

Content:
${kb.content}${imageBlock}

# Evidence: Edits Made to Test Cases Using This KB
${tcBlocks}

# Your Task
Identify what knowledge appears to be missing, unclear, or wrong in the current KB entry based on these edits. Propose a specific revision to the entry's content that, if applied, would have led the AI to generate test cases closer to the human-edited versions on the first try.

Constraints on your proposed revision:
- Revise ONLY the textual "Content" field shown above. Image attachments and their descriptions are managed separately and must NOT be referenced as if you were editing them. You may, however, reference described UI elements by name in the revised content.
- Keep what's working; add or clarify only what the edits demonstrate is missing.

Respond in this JSON format ONLY (no surrounding prose, no markdown fences):
{
  "rationale": "Brief explanation (2-3 sentences) of what was missing/unclear and how the proposed revision addresses it.",
  "proposed_content": "The full revised content for this KB entry. Plain text or markdown, matching the style of the existing content."
}`;
}

function formatSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return "  (no steps)";
  return steps.map((s, i) => `  ${i + 1}. ACTION: ${s.step || ""}\n     EXPECTED: ${s.expectedResult || ""}`).join("\n");
}

function formatSetup(setup) {
  if (!setup || typeof setup !== "object") return "  (no setup)";
  const sections = [];
  for (const key of ["preconditions", "environment", "equipment", "testData"]) {
    const items = setup[key];
    if (Array.isArray(items) && items.length > 0) {
      sections.push(`  ${key}:\n${items.map(it => `    - ${it}`).join("\n")}`);
    }
  }
  return sections.length > 0 ? sections.join("\n") : "  (no setup)";
}

function safeParse(json) {
  try { return JSON.parse(json || "null"); } catch { return null; }
}

// ─── Claude API ─────────────────────────────────────────────────────

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured — cannot run KB synthesis");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  // Surface truncation explicitly so callers don't see a confusing JSON parse error.
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      `Claude response was truncated (max_tokens=${MAX_TOKENS} reached). ` +
      `Increase MAX_TOKENS in kb_review.js or trim the KB entry before retrying.`
    );
  }

  return {
    text: data.content?.map(c => c.text || "").join("") || "",
    tokenUsage: {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    },
  };
}

module.exports = {
  // Constants
  KB_TRACKED_FIELDS,
  THRESHOLD,
  VIRTUAL_THRESHOLD,
  VIRTUAL_KBS,
  PRODUCT_CONTEXT_ID,
  KEY_TERMS_ID,
  // Counter management
  recordEditAgainstKbs,
  resetCountersForKb,
  invalidateStaleCounters,
  getReadyCounters,
  getCounterStats,
  // Synthesis
  synthesizeSuggestion,
  synthesizePending,
  // Suggestions
  listSuggestions,
  getSuggestion,
  approveSuggestion,
  rejectSuggestion,
};
