// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Adaptive Rules (AL-004 Foundation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Adaptive rules are distilled "lessons learned" that get injected
// into the Claude generation prompt. They're the output of the
// feedback → aggregation → rule pipeline.
//
// Example rules:
//   "When generating for numeric input requirements, always include
//    boundary tests at min-1, min, max, max+1."
//   "Avoid preconditions that assume a specific user role unless the
//    requirement explicitly specifies one."
//   "For API validation requirements, include an authentication failure
//    test case even at basic depth."
//
// KEY BEHAVIORS:
//   - Hard cap (25 rules) — prevents prompt bloat. When full, the
//     weakest rule is evicted before a new one is inserted.
//   - Confidence decay — the effective_confidence generated column in
//     SQLite auto-decays based on half-life. Rules that aren't
//     reinforced by new evidence fade out naturally.
//   - Model version tracking — when ANTHROPIC_MODEL changes, all rule
//     confidences are halved because the new model may behave
//     differently. Old rules need to re-prove themselves.
//   - Evidence trail — every rule links back to the feedback events
//     that generated it via the rule_evidence join table. Admins can
//     always answer "why does this rule exist?"

const { getCoreDb } = require("../db");

// ─── Constants ──────────────────────────────────────────────────────

const MAX_ADAPTIVE_RULES = 25;
const EFFECTIVE_CONF_SQL = `base_confidence * POWER(0.5, (JULIANDAY('now') - JULIANDAY(last_reinforced_at)) / half_life_days)`;

// Rule categories — used for scoping rules to specific generation
// contexts. A rule with category "preconditions" is only relevant
// when the aggregation job identifies precondition-related edit
// patterns. "general" rules apply to all generations.
const RULE_CATEGORIES = [
  "general",
  "steps",
  "preconditions",
  "expected_results",
  "boundary",
  "edge_case",
  "negative",
  "coverage",
];

// Rule scope — controls which requirement types a rule applies to.
// "all" means it's injected into every generation prompt.
// Specific scopes let you have rules that only fire for certain
// requirement types (e.g. safety_critical, api_validation).
const RULE_SCOPES = [
  "all",
  "safety_critical",
  "api_validation",
  "ui_ux",
  "data_processing",
  "authentication",
  "integration",
];

// ─── ID Generator ───────────────────────────────────────────────────

function nextRuleId() {
  const last = getCoreDb()
    .prepare("SELECT rule_id FROM adaptive_rules ORDER BY rowid DESC LIMIT 1")
    .get();
  if (!last) return "AR-001";
  const num = parseInt(last.rule_id.replace("AR-", "")) + 1;
  return `AR-${String(num).padStart(3, "0")}`;
}

// ─── Rule Creation ──────────────────────────────────────────────────

/**
 * Add a new adaptive rule. If the hard cap is reached, the lowest-
 * confidence rule is evicted first (along with its evidence links).
 *
 * Called by the aggregation job after it synthesizes patterns from
 * feedback events into a prose rule. Can also be called manually
 * by an admin via the analytics API.
 *
 * @param {object} params
 * @param {string} params.ruleText          - The instruction to inject into prompts
 * @param {string} [params.category]        - From RULE_CATEGORIES (default "general")
 * @param {string} [params.scope]           - From RULE_SCOPES (default "all")
 * @param {number} [params.confidence]      - Initial base_confidence (default 1.0)
 * @param {number} [params.observationCount]- Number of feedback events supporting this
 * @param {number[]} [params.feedbackEventIds] - IDs from feedback_events for audit trail
 * @returns {string} The new rule_id (e.g. "AR-007")
 */
function addAdaptiveRule({
  ruleText, category, scope, confidence, observationCount, feedbackEventIds,
}) {
  const db = getCoreDb();
  const currentCount = db.prepare(
    "SELECT COUNT(*) as count FROM adaptive_rules"
  ).get().count;

  // Enforce hard cap — evict the weakest rule to make room
  if (currentCount >= MAX_ADAPTIVE_RULES) {
    const weakest = db.prepare(
      `SELECT id, rule_id FROM adaptive_rules ORDER BY ${EFFECTIVE_CONF_SQL} ASC LIMIT 1`
    ).get();
    if (weakest) {
      db.prepare("DELETE FROM rule_evidence WHERE rule_id = ?").run(weakest.rule_id);
      db.prepare("DELETE FROM adaptive_rules WHERE id = ?").run(weakest.id);
    }
  }

  const ruleId = nextRuleId();
  const modelVersion = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  db.prepare(`
    INSERT INTO adaptive_rules
      (rule_id, rule_text, category, scope, base_confidence,
       observation_count, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    ruleId,
    ruleText,
    category || "general",
    scope || "all",
    confidence || 1.0,
    observationCount || 1,
    modelVersion
  );

  // Link to source feedback events for audit trail
  if (feedbackEventIds && feedbackEventIds.length > 0) {
    const stmt = db.prepare(
      "INSERT INTO rule_evidence (rule_id, feedback_event_id) VALUES (?, ?)"
    );
    for (const eventId of feedbackEventIds) {
      stmt.run(ruleId, eventId);
    }
  }

  return ruleId;
}

// ─── Rule Reinforcement ─────────────────────────────────────────────

/**
 * Reinforce an existing rule — bump its confidence and reset the
 * decay clock. Called when the aggregation job sees a pattern that
 * matches a rule that already exists.
 *
 * The confidence increment is 0.1 per observation, capped at 5.0.
 * This means a rule needs ~40 reinforcing observations to reach
 * max confidence, which prevents a single noisy batch from
 * over-inflating a rule.
 *
 * Resetting last_reinforced_at restarts the half-life decay timer,
 * so frequently-reinforced rules stay strong while neglected ones
 * fade naturally.
 *
 * @param {string} ruleId                  - The rule to reinforce
 * @param {number} [additionalObservations=1] - How many new observations support this
 * @param {number[]} [feedbackEventIds]    - New evidence to link
 */
function reinforceRule(ruleId, additionalObservations = 1, feedbackEventIds = []) {
  getCoreDb().prepare(`
    UPDATE adaptive_rules
    SET observation_count = observation_count + ?,
        base_confidence = MIN(base_confidence + (? * 0.1), 5.0),
        last_reinforced_at = datetime('now'),
        updated_at = datetime('now')
    WHERE rule_id = ?
  `).run(additionalObservations, additionalObservations, ruleId);

  // Link new evidence
  if (feedbackEventIds.length > 0) {
    const stmt = getCoreDb().prepare(
      "INSERT INTO rule_evidence (rule_id, feedback_event_id) VALUES (?, ?)"
    );
    for (const eventId of feedbackEventIds) {
      stmt.run(ruleId, eventId);
    }
  }
}

// ─── Rule Queries ───────────────────────────────────────────────────

/**
 * Get active rules for prompt injection, ordered by effective_confidence.
 * This is what the prompt builder calls during test case generation.
 *
 * The v_active_rules_ranked view already filters out rules below the
 * 0.1 confidence threshold, so everything returned here is "alive."
 *
 * @param {number} [limit=15] - Max rules to inject into the prompt
 * @returns {object[]} Active rules sorted by confidence
 */
function getActiveRules(limit = 15) {
  return getCoreDb()
    .prepare("SELECT * FROM v_active_rules_ranked LIMIT ?")
    .all(limit);
}

/**
 * Get active rules filtered by scope — for generation contexts where
 * only domain-specific rules are relevant.
 *
 * @param {string} scope  - e.g. "safety_critical", "api_validation"
 * @param {number} [limit=10]
 * @returns {object[]} Matching rules + all "all"-scoped rules
 */
function getActiveRulesForScope(scope, limit = 10) {
  return getCoreDb()
    .prepare(`
      SELECT * FROM v_active_rules_ranked
      WHERE scope = 'all' OR scope = ?
      LIMIT ?
    `)
    .all(scope, limit);
}

/**
 * Get ALL rules including decayed ones — for the admin management UI.
 * Includes effective_confidence so admins can see which rules are
 * fading and may need reinforcement or manual removal.
 */
function getAllRules() {
  return getCoreDb()
    .prepare(
      `SELECT *, ${EFFECTIVE_CONF_SQL} AS effective_confidence FROM adaptive_rules ORDER BY effective_confidence DESC`
    )
    .all();
}

/**
 * Get a single rule by ID with full detail.
 *
 * @param {string} ruleId
 * @returns {object|undefined} The rule row, or undefined if not found
 */
function getRuleById(ruleId) {
  return getCoreDb()
    .prepare(`SELECT *, ${EFFECTIVE_CONF_SQL} AS effective_confidence FROM adaptive_rules WHERE rule_id = ?`)
    .get(ruleId);
}

/**
 * Get the evidence trail for a rule — feedback event IDs that
 * generated or reinforced it. Admin drill-down feature.
 *
 * Note: The returned feedback_event_id values reference rows in
 * testcases.db, not core.db. The admin UI fetches those separately.
 *
 * @param {string} ruleId
 * @returns {object[]} Evidence rows with feedback_event_id and created_at
 */
function getRuleEvidence(ruleId) {
  return getCoreDb()
    .prepare(
      "SELECT * FROM rule_evidence WHERE rule_id = ? ORDER BY created_at DESC"
    )
    .all(ruleId);
}

// ─── Rule Editing ───────────────────────────────────────────────────

/**
 * Update a rule's text, category, or scope. For admin manual tuning.
 * Does NOT reset confidence — the rule keeps its earned trust.
 *
 * @param {string} ruleId
 * @param {object} updates
 * @param {string} [updates.ruleText]
 * @param {string} [updates.category]
 * @param {string} [updates.scope]
 */
function updateRule(ruleId, { ruleText, category, scope } = {}) {
  const db = getCoreDb();
  if (ruleText !== undefined) {
    db.prepare(
      "UPDATE adaptive_rules SET rule_text = ?, updated_at = datetime('now') WHERE rule_id = ?"
    ).run(ruleText, ruleId);
  }
  if (category !== undefined) {
    db.prepare(
      "UPDATE adaptive_rules SET category = ?, updated_at = datetime('now') WHERE rule_id = ?"
    ).run(category, ruleId);
  }
  if (scope !== undefined) {
    db.prepare(
      "UPDATE adaptive_rules SET scope = ?, updated_at = datetime('now') WHERE rule_id = ?"
    ).run(scope, ruleId);
  }
}

/**
 * Delete a rule and all its evidence links. Admin manual override
 * for when a rule is wrong or no longer relevant.
 *
 * @param {string} ruleId
 */
function deleteRule(ruleId) {
  const db = getCoreDb();
  db.prepare("DELETE FROM rule_evidence WHERE rule_id = ?").run(ruleId);
  db.prepare("DELETE FROM adaptive_rules WHERE rule_id = ?").run(ruleId);
}

// ─── Prompt Building Helper ─────────────────────────────────────────

/**
 * Format active rules as a text block ready to inject into the
 * Claude generation prompt. This is a convenience function that
 * the prompt builder in testcases.js can call directly.
 *
 * Returns an empty string if no active rules exist — safe to
 * concatenate unconditionally.
 *
 * @param {string} [scope]  - Optional scope filter
 * @param {number} [limit=10] - Max rules to include
 * @returns {string} Formatted prompt section, or empty string
 */
function formatRulesForPrompt(scope, limit = 10) {
  const rules = scope
    ? getActiveRulesForScope(scope, limit)
    : getActiveRules(limit);

  if (rules.length === 0) return "";

  const lines = rules.map(
    (r, i) => `${i + 1}. [${r.category}] ${r.rule_text}`
  );

  return [
    "ADAPTIVE GENERATION RULES (learned from reviewer feedback):",
    ...lines,
  ].join("\n");
}

module.exports = {
  // Constants
  MAX_ADAPTIVE_RULES,
  RULE_CATEGORIES,
  RULE_SCOPES,

  // CRUD
  nextRuleId,
  addAdaptiveRule,
  updateRule,
  deleteRule,

  // Reinforcement
  reinforceRule,

  // Queries
  getActiveRules,
  getActiveRulesForScope,
  getAllRules,
  getRuleById,
  getRuleEvidence,

  // Prompt building
  formatRulesForPrompt,
};