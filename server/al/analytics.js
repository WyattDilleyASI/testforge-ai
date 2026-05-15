// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Generation Analytics (AL-003)
// ═══════════════════════════════════════════════════════════════════════════
//
// Two responsibilities:
//
//   1. SESSION TRACKING — Record structured data about every generation
//      event (who, what requirement, what depth, how many TCs, token cost).
//      Called from testcases.js generate endpoint.
//
//   2. QUERY HELPERS — Power the analytics dashboard and contextual hints.
//      These are the functions that answer questions like:
//        "What's our approval rate by depth level this month?"
//        "Which fields do engineers edit most often?"
//        "How is this requirement's generation quality trending?"
//
// Local-first aggregation: The getUnprocessedFeedbackStats() function
// does pattern extraction algorithmically — counting diffs, grouping
// rejection reasons — without any Claude API call. This is where most
// of the signal comes from. The optional Claude Batch API synthesis
// (not in this file — that's a future aggregation job) only kicks in
// to turn those stats into prose rules for the adaptive_rules table.

const { getCoreDb, getTcDb } = require("../db");

// ═══════════════════════════════════════════════════════════════════════════
// SESSION TRACKING
// ═══════════════════════════════════════════════════════════════════════════

// ─── Session ID Generator ───────────────────────────────────────────
// Pattern: GEN-YYYYMMDD-XXX (e.g. GEN-20260402-001)
// Resets the counter daily. Human-readable in the analytics UI and
// in audit log references.

function nextSessionId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `GEN-${today}-`;
  const last = getCoreDb()
    .prepare(
      "SELECT session_id FROM generation_sessions WHERE session_id LIKE ? ORDER BY rowid DESC LIMIT 1"
    )
    .get(`${prefix}%`);

  if (!last) return `${prefix}001`;
  const num = parseInt(last.session_id.replace(prefix, "")) + 1;
  return `${prefix}${String(num).padStart(3, "0")}`;
}

// ─── Session Logging ────────────────────────────────────────────────

/**
 * Record a generation session. Called from testcases.js right after
 * the new TCs are inserted into the database.
 *
 * This creates the structured record that the analytics dashboard
 * queries. It captures everything the flat audit_log string doesn't:
 * depth as a filterable column, token cost as integers, TC IDs as
 * a JSON array for drill-down.
 *
 * @param {object} params
 * @param {string} params.reqId         - The requirement that was generated against
 * @param {string} [params.reqTitle]    - Requirement title (denormalized for display)
 * @param {string} [params.depth]       - basic | standard | comprehensive
 * @param {string[]} params.tcIds       - Array of generated TC IDs
 * @param {number} [params.inputTokens] - Claude API input token count
 * @param {number} [params.outputTokens]- Claude API output token count
 * @param {string} params.generatedBy   - Username of the engineer who triggered generation
 * @returns {string} The generated session_id (e.g. "GEN-20260402-003")
 */
function logGenerationSession({
  reqId, reqTitle, depth, tcIds, inputTokens, outputTokens, generatedBy,
}) {
  const sessionId = nextSessionId();
  getCoreDb().prepare(`
    INSERT INTO generation_sessions
      (session_id, req_id, req_title, depth, tc_count, tc_ids,
       input_tokens, output_tokens, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    reqId,
    reqTitle || "",
    depth || "standard",
    tcIds.length,
    JSON.stringify(tcIds),
    inputTokens || 0,
    outputTokens || 0,
    generatedBy
  );
  return sessionId;
}

/**
 * Increment the approved or rejected count on the generation session
 * that contains this TC. Called from testcases.js when a TC status changes.
 *
 * Scans all sessions to find which one owns this TC ID. At current
 * scale (hundreds of sessions) this is fast. If it ever becomes a
 * bottleneck, add a session_id column to test_cases for direct lookup.
 *
 * @param {string} tcId      - The test case ID being reviewed
 * @param {string} newStatus - "Reviewed" or "Rejected"
 */
function updateSessionCountsForTc(tcId, newStatus) {
  const sessions = getCoreDb()
    .prepare("SELECT id, tc_ids FROM generation_sessions")
    .all();

  for (const session of sessions) {
    const ids = JSON.parse(session.tc_ids || "[]");
    if (ids.includes(tcId)) {
      if (newStatus === "Reviewed") {
        getCoreDb().prepare(
          "UPDATE generation_sessions SET approved_count = approved_count + 1 WHERE id = ?"
        ).run(session.id);
      } else if (newStatus === "Rejected") {
        getCoreDb().prepare(
          "UPDATE generation_sessions SET rejected_count = rejected_count + 1 WHERE id = ?"
        ).run(session.id);
      }
      break; // A TC belongs to at most one session
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Monthly generation summary from the v_generation_summary view.
 * Powers the main analytics dashboard chart — approval rates, TC
 * volume, and token costs grouped by month and depth.
 */
function getGenerationSummary() {
  return getCoreDb()
    .prepare("SELECT * FROM v_generation_summary")
    .all();
}

/**
 * Recent generation sessions with full detail.
 * Powers the session history table in the analytics view.
 *
 * @param {number} [limit=20] - Max rows to return
 */
function getRecentSessions(limit = 20) {
  return getCoreDb()
    .prepare("SELECT * FROM generation_sessions ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

/**
 * Overall stats across all sessions — top-level numbers for the
 * analytics dashboard header cards.
 *
 * @returns {object} { total_sessions, total_tcs, total_approved,
 *                     total_rejected, overall_approval_rate,
 *                     total_input_tokens, total_output_tokens }
 */
function getOverallStats() {
  const row = getCoreDb().prepare(`
    SELECT
      COUNT(*)              AS total_sessions,
      SUM(tc_count)         AS total_tcs,
      SUM(approved_count)   AS total_approved,
      SUM(rejected_count)   AS total_rejected,
      SUM(input_tokens)     AS total_input_tokens,
      SUM(output_tokens)    AS total_output_tokens
    FROM generation_sessions
  `).get();

  const reviewed = (row.total_approved || 0) + (row.total_rejected || 0);
  return {
    ...row,
    total_tcs: row.total_tcs || 0,
    total_approved: row.total_approved || 0,
    total_rejected: row.total_rejected || 0,
    total_input_tokens: row.total_input_tokens || 0,
    total_output_tokens: row.total_output_tokens || 0,
    overall_approval_rate: reviewed > 0
      ? Math.round((row.total_approved / reviewed) * 100)
      : null,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// CONTEXTUAL HINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Approval rate and edit patterns for a specific requirement.
 * Shown as a contextual hint BEFORE generation — e.g.:
 *   "Last 3 generations for RS-003 had 60% edit rate on preconditions.
 *    Consider adding environment details to the KB."
 *
 * Returns null if there's no generation history for this requirement.
 *
 * @param {string} reqId - The requirement ID
 * @returns {object|null} Stats for this requirement, or null
 */
function getApprovalRateForReq(reqId) {
  const row = getCoreDb().prepare(`
    SELECT
      COUNT(*)              AS session_count,
      SUM(tc_count)         AS total_generated,
      SUM(approved_count)   AS approved,
      SUM(rejected_count)   AS rejected
    FROM generation_sessions
    WHERE req_id = ?
  `).get(reqId);

  if (!row || row.session_count === 0) return null;

  const reviewed = (row.approved || 0) + (row.rejected || 0);
  return {
    session_count: row.session_count,
    total_generated: row.total_generated || 0,
    approved: row.approved || 0,
    rejected: row.rejected || 0,
    approval_rate: reviewed > 0
      ? Math.round((row.approved / reviewed) * 100)
      : null,
  };
}

/**
 * Most commonly edited fields for a specific requirement.
 * Complements getApprovalRateForReq() with diff-level detail.
 *
 * @param {string} reqId - The requirement ID
 * @returns {object} { field_counts: { steps: 5, preconditions: 3, ... }, total_edits: 8 }
 */
function getEditPatternsForReq(reqId) {
  const rows = getTcDb().prepare(`
    SELECT diff_summary
    FROM feedback_events
    WHERE req_id = ?
      AND event_type = 'approved_with_edits'
      AND diff_summary IS NOT NULL
  `).all(reqId);

  const fieldCounts = {};
  for (const row of rows) {
    try {
      const diff = JSON.parse(row.diff_summary);
      for (const field of (diff.fields_changed || [])) {
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
    } catch { /* skip malformed */ }
  }

  return {
    field_counts: fieldCounts,
    total_edits: rows.length,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// LOCAL AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════
// These functions do pattern extraction algorithmically — no Claude API.
// They power contextual hints immediately and also produce the pre-computed
// stats that feed into the (optional) Claude Batch API rule synthesis.

/**
 * Aggregate unprocessed feedback events into actionable stats.
 * This is the "local-first" aggregation — no API call, pure SQL + JS.
 *
 * Returns:
 *   event_totals        — count by event type
 *   field_edit_counts   — which fields get edited most often
 *   top_rejection_reasons — ranked list of rejection categories
 *   depth_approval_rates  — approval rate broken down by generation depth
 *   unprocessed_count   — total events waiting for processing
 *
 * Used by: analytics dashboard, future aggregation job input
 */
function getUnprocessedFeedbackStats() {
  const tcDb = getTcDb();

  // Count by event type
  const totals = tcDb.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM feedback_events
    WHERE processed_at IS NULL
    GROUP BY event_type
  `).all();

  // Which fields get edited most often?
  const editRows = tcDb.prepare(`
    SELECT diff_summary
    FROM feedback_events
    WHERE processed_at IS NULL
      AND event_type = 'approved_with_edits'
      AND diff_summary IS NOT NULL
  `).all();

  const fieldCounts = {};
  for (const row of editRows) {
    try {
      const diff = JSON.parse(row.diff_summary);
      for (const field of (diff.fields_changed || [])) {
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
    } catch { /* skip malformed */ }
  }

  // Top rejection reasons
  const rejections = tcDb.prepare(`
    SELECT rejection_reason, COUNT(*) as count
    FROM feedback_events
    WHERE processed_at IS NULL
      AND event_type = 'rejected'
      AND rejection_reason IS NOT NULL
    GROUP BY rejection_reason
    ORDER BY count DESC
  `).all();

  // Approval rates by depth (unprocessed events only)
  const depthStats = tcDb.prepare(`
    SELECT
      depth,
      SUM(CASE WHEN event_type IN ('approved_unchanged', 'approved_with_edits') THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN event_type = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      COUNT(*) AS total
    FROM feedback_events
    WHERE processed_at IS NULL
    GROUP BY depth
  `).all();

  return {
    event_totals: totals,
    field_edit_counts: fieldCounts,
    top_rejection_reasons: rejections,
    depth_approval_rates: depthStats,
    unprocessed_count: totals.reduce((sum, t) => sum + t.count, 0),
  };
}

/**
 * Mark feedback events as processed after aggregation consumes them.
 * The aggregation job calls getUnprocessedFeedbackStats(), extracts
 * patterns, creates/reinforces rules, then calls this to mark those
 * events as consumed.
 *
 * @param {number[]} eventIds - IDs from the feedback_events table
 */
function markFeedbackProcessed(eventIds) {
  if (!eventIds || eventIds.length === 0) return;
  const tcDb = getTcDb();
  const stmt = tcDb.prepare(
    "UPDATE feedback_events SET processed_at = datetime('now') WHERE id = ?"
  );
  const batch = tcDb.transaction((ids) => {
    for (const id of ids) stmt.run(id);
  });
  batch(eventIds);
}

/**
 * Get the raw unprocessed event IDs — used by the aggregation job
 * so it knows which IDs to pass to markFeedbackProcessed() after
 * successfully creating rules.
 *
 * @param {number} [limit=500] - Max events to return per batch
 * @returns {number[]} Array of feedback event IDs
 */
function getUnprocessedEventIds(limit = 500) {
  return getTcDb()
    .prepare("SELECT id FROM feedback_events WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT ?")
    .all(limit)
    .map(r => r.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE IMPACT MEASUREMENT
//
// Honest take: this is correlation, not causation. Splitting generation
// outcomes around a rule's created_at can be confounded by KB edits,
// requirement churn, model drift, and other rules created near the same
// time. The numbers are directional — useful for "this rule looks like it
// helped / hurt" — but should not be cited as proof.
//
// Computation per rule:
//   1. Take the rule's created_at timestamp.
//   2. Bucket every generation_session into "before" or "after" that moment.
//      (For v1 we do NOT filter by scope; effectively we measure "did
//      anything change around the time this rule was added?" Future v2
//      can filter by scope when generation_sessions records req_type.)
//   3. For each bucket: sum approved_count and rejected_count; derive
//      approval_rate = approved / (approved + rejected).
//   4. Edit rate = (sessions with diff_summary_agg indicating any edits)
//      / total sessions in that bucket. Approximated as approved-with-
//      edits / approved + rejected.
//   5. Delta = after - before.
//
// Reliability flags:
//   - MIN_AFTER_SESSIONS guard: if fewer than N post-rule sessions exist,
//     return insufficient_data: true so the UI can show "—" instead of a
//     misleading delta.
// ═══════════════════════════════════════════════════════════════════════════

const MIN_AFTER_SESSIONS = 10;

function _bucketStatsForRule(createdAt) {
  // Returns aggregated stats split by created_at vs the provided timestamp.
  // SQLite stores timestamps as ISO-8601 strings; lexicographic comparison
  // works correctly because of the format. Both buckets are computed in one
  // query for a single table scan.
  const row = getCoreDb().prepare(`
    SELECT
      SUM(CASE WHEN created_at <  ? THEN 1               ELSE 0 END) AS before_sessions,
      SUM(CASE WHEN created_at <  ? THEN approved_count ELSE 0 END) AS before_approved,
      SUM(CASE WHEN created_at <  ? THEN rejected_count ELSE 0 END) AS before_rejected,
      SUM(CASE WHEN created_at >= ? THEN 1               ELSE 0 END) AS after_sessions,
      SUM(CASE WHEN created_at >= ? THEN approved_count ELSE 0 END) AS after_approved,
      SUM(CASE WHEN created_at >= ? THEN rejected_count ELSE 0 END) AS after_rejected
    FROM generation_sessions
  `).get(createdAt, createdAt, createdAt, createdAt, createdAt, createdAt) || {};

  const rate = (a, r) => {
    const total = (a || 0) + (r || 0);
    return total === 0 ? null : (a || 0) / total;
  };

  const before = {
    sessions: row.before_sessions || 0,
    approved: row.before_approved || 0,
    rejected: row.before_rejected || 0,
    approval_rate: rate(row.before_approved, row.before_rejected),
  };
  const after = {
    sessions: row.after_sessions || 0,
    approved: row.after_approved || 0,
    rejected: row.after_rejected || 0,
    approval_rate: rate(row.after_approved, row.after_rejected),
  };
  return { before, after };
}

/**
 * Compute impact for a single rule. Returns null if rule not found.
 *
 * @param {string} ruleId
 * @returns {object|null} {
 *   rule_id, created_at,
 *   before:  { sessions, approved, rejected, approval_rate },
 *   after:   { sessions, approved, rejected, approval_rate },
 *   delta_approval_rate: number|null,
 *   insufficient_data: boolean,
 *   notes: string[]
 * }
 */
function getRuleImpact(ruleId) {
  const rule = getCoreDb()
    .prepare("SELECT rule_id, created_at FROM adaptive_rules WHERE rule_id = ?")
    .get(ruleId);
  if (!rule) return null;

  const { before, after } = _bucketStatsForRule(rule.created_at);
  const delta = (before.approval_rate !== null && after.approval_rate !== null)
    ? after.approval_rate - before.approval_rate
    : null;

  const notes = [];
  if (before.sessions === 0) notes.push("No sessions existed before this rule was created.");
  if (after.sessions < MIN_AFTER_SESSIONS) notes.push(`Only ${after.sessions} session(s) since rule creation — needs at least ${MIN_AFTER_SESSIONS} for a trusted reading.`);

  return {
    rule_id: rule.rule_id,
    created_at: rule.created_at,
    before,
    after,
    delta_approval_rate: delta,
    insufficient_data: after.sessions < MIN_AFTER_SESSIONS,
    notes,
  };
}

/**
 * Compute impact for every rule. Returns array (one entry per rule).
 *
 * Implementation note: each rule does its own SUM query for clarity. With
 * the 25-rule cap and an indexed generation_sessions table, this is fine
 * up to thousands of sessions. If perf ever becomes an issue, the queries
 * can be batched.
 */
function getAllRuleImpacts() {
  const rules = getCoreDb()
    .prepare("SELECT rule_id, created_at FROM adaptive_rules ORDER BY created_at DESC")
    .all();
  return rules.map(r => getRuleImpact(r.rule_id)).filter(Boolean);
}

module.exports = {
  // Session tracking
  nextSessionId,
  logGenerationSession,
  updateSessionCountsForTc,

  // Dashboard queries
  getGenerationSummary,
  getRecentSessions,
  getOverallStats,

  // Contextual hints
  getApprovalRateForReq,
  getEditPatternsForReq,

  // Local aggregation
  getUnprocessedFeedbackStats,
  markFeedbackProcessed,
  getUnprocessedEventIds,

  // Rule impact measurement
  getRuleImpact,
  getAllRuleImpacts,
  MIN_AFTER_SESSIONS,
};