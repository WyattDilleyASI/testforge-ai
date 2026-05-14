// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Exemplar Test Cases
// ═══════════════════════════════════════════════════════════════════════════
//
// Exemplars are curated "gold standard" test cases — TCs that an
// engineer approved without edits, indicating the AI got it right.
// They get injected as few-shot examples into future generation prompts.
//
// WHY THIS MATTERS:
// Research (DSPy, PromptWizard) consistently shows that combining
// adaptive rules WITH carefully selected examples outperforms either
// approach alone. Rules tell the AI "do this differently." Exemplars
// show it "here's what good looks like." Together they form the
// adaptive layer of the prompt.
//
// HOW SELECTION WORKS:
// Two paths into the exemplar pool:
//   1. Automatic — when a TC is approved without edits (approved_unchanged
//      event), it's a candidate. The system can auto-promote it.
//   2. Manual — an admin or QA manager explicitly marks a TC as an
//      exemplar through the analytics UI.
//
// The exemplar_test_cases table is a lightweight reference — it stores
// the tc_id and metadata for filtering, not a copy of the TC content.
// At prompt-build time, the actual TC is fetched from test_cases and
// formatted for injection.
//
// PROMPT BUDGET:
// Each exemplar costs ~300-500 input tokens. At 2-3 exemplars per
// generation, that's 600-1500 tokens — a small premium that pays
// for itself by reducing regeneration rates (fewer wasted full calls).

const { getTcDb } = require("../db");

const MAX_EXEMPLARS = 50; // Pool cap — not all are used per prompt

// ─── Exemplar Management ────────────────────────────────────────────

/**
 * Mark a TC as an exemplar. Uses INSERT OR REPLACE so re-curating
 * an existing exemplar just refreshes its metadata and timestamp.
 *
 * @param {string} tcId - The test case ID to promote
 * @param {object} [opts]
 * @param {string} [opts.reqType]    - Requirement type for matching (e.g. "authentication")
 * @param {string} [opts.testType]   - TC type (Happy Path, Negative, Boundary, etc.)
 * @param {string} [opts.depth]      - Generation depth it was created at
 * @param {string} [opts.selectedBy] - "system" for auto-promotion, username for manual
 */
function addExemplar(tcId, { reqType, testType, depth, selectedBy } = {}) {
  const db = getTcDb();

  // Enforce pool cap — remove oldest exemplar if full
  const count = db.prepare(
    "SELECT COUNT(*) as count FROM exemplar_test_cases"
  ).get().count;

  if (count >= MAX_EXEMPLARS) {
    db.prepare(`
      DELETE FROM exemplar_test_cases
      WHERE id = (SELECT id FROM exemplar_test_cases ORDER BY curated_at ASC LIMIT 1)
    `).run();
  }

  db.prepare(`
    INSERT OR REPLACE INTO exemplar_test_cases
      (tc_id, req_type, test_type, depth, selected_by, curated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    tcId,
    reqType || null,
    testType || null,
    depth || "standard",
    selectedBy || "system"
  );
}

/**
 * Remove a TC from the exemplar pool.
 *
 * @param {string} tcId
 * @returns {boolean} True if a row was actually deleted
 */
function removeExemplar(tcId) {
  const result = getTcDb()
    .prepare("DELETE FROM exemplar_test_cases WHERE tc_id = ?")
    .run(tcId);
  return result.changes > 0;
}

/**
 * Check whether a TC is currently in the exemplar pool.
 *
 * @param {string} tcId
 * @returns {boolean}
 */
function isExemplar(tcId) {
  const row = getTcDb()
    .prepare("SELECT id FROM exemplar_test_cases WHERE tc_id = ?")
    .get(tcId);
  return !!row;
}

// ─── Exemplar Selection (for prompt building) ───────────────────────

/**
 * Select exemplar TC IDs for injection into a generation prompt.
 * Filters by test type and/or depth to find the most relevant
 * examples for the current generation context.
 *
 * Returns metadata rows only — the caller fetches the actual TC
 * content from test_cases and formats it for the prompt.
 *
 * Selection priority:
 *   1. Exact match on both testType and depth
 *   2. Match on testType only
 *   3. Match on depth only
 *   4. Any exemplar (newest first)
 *
 * @param {object} [opts]
 * @param {string} [opts.testType]  - Preferred test type to match
 * @param {string} [opts.depth]     - Preferred depth to match
 * @param {number} [opts.limit]     - Max exemplars to return (default 3)
 * @returns {object[]} Exemplar metadata rows
 */
function getExemplarsForGeneration({ testType, depth, limit } = {}) {
  const maxResults = limit || 3;

  // ── No filters → just return newest exemplars ──
  if (!testType && !depth) {
    return getTcDb()
      .prepare(
        "SELECT tc_id, req_type, test_type, depth FROM exemplar_test_cases ORDER BY curated_at DESC LIMIT ?"
      )
      .all(maxResults);
  }

  // ── Build relevance-ranked query ──
  // Score each exemplar: +2 for type match, +1 for depth match.
  // Explicit param array built step-by-step for clarity.
  const scoreParts = [];
  const params = [];

  if (testType) {
    scoreParts.push("(CASE WHEN COALESCE(test_type, '') = ? THEN 2 ELSE 0 END)");
    params.push(testType);
  }

  if (depth) {
    scoreParts.push("(CASE WHEN COALESCE(depth, '') = ? THEN 1 ELSE 0 END)");
    params.push(depth);
  }

  // At least one filter is present (we checked for neither above)
  const relevanceExpr = scoreParts.join(" + ");

  // LIMIT param is always last
  params.push(maxResults);

  return getTcDb()
    .prepare(`
      SELECT tc_id, req_type, test_type, depth,
        ${relevanceExpr} AS relevance
      FROM exemplar_test_cases
      ORDER BY relevance DESC, curated_at DESC
      LIMIT ?
    `)
    .all(...params);
}

/**
 * Fetch full TC content for a set of exemplar IDs, formatted and
 * ready for prompt injection.
 *
 * This joins the exemplar references back to the test_cases table
 * to get the actual steps, preconditions, and expected results.
 * Returns a structured array that the prompt builder can serialize.
 *
 * @param {string[]} tcIds - Exemplar TC IDs from getExemplarsForGeneration()
 * @returns {object[]} Full TC objects with title, steps, preconditions, etc.
 */
function getExemplarContent(tcIds) {
  if (!tcIds || tcIds.length === 0) return [];

  const placeholders = tcIds.map(() => "?").join(", ");
  return getTcDb()
    .prepare(`
      SELECT tc_id, title, type, steps, preconditions, description,
             depth, linked_req_ids
      FROM test_cases
      WHERE tc_id IN (${placeholders})
    `)
    .all(...tcIds);
}

/**
 * Convenience function that combines selection + content fetch.
 * Returns fully populated exemplar TCs ready for prompt serialization.
 *
 * @param {object} [opts] - Same options as getExemplarsForGeneration()
 * @returns {object[]} Full TC objects for the best-matching exemplars
 */
function getExemplarsWithContent(opts = {}) {
  const exemplars = getExemplarsForGeneration(opts);
  if (exemplars.length === 0) return [];
  return getExemplarContent(exemplars.map(e => e.tc_id));
}

// ─── Prompt Building Helper ─────────────────────────────────────────

/**
 * Format exemplar TCs as a text block ready to inject into the
 * Claude generation prompt. Companion to rules.formatRulesForPrompt().
 *
 * Returns an empty string if no exemplars exist — safe to
 * concatenate unconditionally.
 *
 * @param {object} [opts] - Filtering options (testType, depth, limit)
 * @returns {string} Formatted prompt section, or empty string
 */
function formatExemplarsForPrompt(opts = {}) {
  try {
    const exemplars = getExemplarsWithContent(opts);
    if (exemplars.length === 0) return "";

    const blocks = exemplars.map((tc, i) => {
      let steps;
      try { steps = JSON.parse(tc.steps || "[]"); } catch { steps = []; }

      const stepsText = steps.map((s, j) => {
        const action = s.action || s.step || "";
        const expected = s.expected || s.expectedResult || "";
        return `  Step ${j + 1}: ${action}${expected ? `\n    Expected: ${expected}` : ""}`;
      }).join("\n");

      return [
        `EXEMPLAR ${i + 1}: ${tc.title} [${tc.type || "General"}]`,
        `  TC ID: ${tc.tc_id}`,
        stepsText,
      ].join("\n");
    });

    return [
      "EXEMPLAR TEST CASES (approved by reviewers — use as quality reference):",
      ...blocks,
    ].join("\n\n");
  } catch (err) {
    console.warn("⚠ Exemplar injection skipped:", err.message);
    return "";
  }
}

// ─── Admin Queries ──────────────────────────────────────────────────

/**
 * Get all exemplars with their source TC details — for the admin
 * management UI. Includes title, type, status, and who selected it.
 */
function getAllExemplars() {
  return getTcDb()
    .prepare(`
      SELECT
        e.id, e.tc_id, e.req_type, e.test_type, e.depth,
        e.selected_by, e.curated_at,
        t.title, t.type AS tc_type, t.status, t.is_seeded
      FROM exemplar_test_cases e
      LEFT JOIN test_cases t ON t.tc_id = e.tc_id
      ORDER BY e.curated_at DESC
    `)
    .all();
}

/**
 * Get exemplar pool stats — for the analytics dashboard.
 *
 * @returns {object} { total, by_type: { ... }, by_depth: { ... },
 *                     by_selector: { system: N, manual: N } }
 */
function getExemplarStats() {
  const db = getTcDb();

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM exemplar_test_cases"
  ).get().count;

  const byType = db.prepare(`
    SELECT test_type, COUNT(*) as count
    FROM exemplar_test_cases
    WHERE test_type IS NOT NULL
    GROUP BY test_type
  `).all();

  const byDepth = db.prepare(`
    SELECT depth, COUNT(*) as count
    FROM exemplar_test_cases
    GROUP BY depth
  `).all();

  const bySelector = db.prepare(`
    SELECT
      SUM(CASE WHEN selected_by = 'system' THEN 1 ELSE 0 END) AS system_selected,
      SUM(CASE WHEN selected_by != 'system' THEN 1 ELSE 0 END) AS manual_selected
    FROM exemplar_test_cases
  `).get();

  return {
    total,
    max: MAX_EXEMPLARS,
    by_type: byType,
    by_depth: byDepth,
    system_selected: bySelector.system_selected || 0,
    manual_selected: bySelector.manual_selected || 0,
  };
}

module.exports = {
  // Constants
  MAX_EXEMPLARS,

  // Management
  addExemplar,
  removeExemplar,
  isExemplar,

  // Selection (prompt building)
  getExemplarsForGeneration,
  getExemplarContent,
  getExemplarsWithContent,
  formatExemplarsForPrompt,

  // Admin
  getAllExemplars,
  getExemplarStats,
};