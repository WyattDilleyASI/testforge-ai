// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Feedback Collection (AL-002)
// ═══════════════════════════════════════════════════════════════════════════
//
// Passive feedback — no forms, no extra clicks. The system captures
// feedback automatically when engineers review TCs:
//
//   1. Engineer approves a TC without editing → "approved_unchanged"
//   2. Engineer edits a TC then approves     → "approved_with_edits" + diff
//   3. Engineer rejects a TC                 → "rejected" + reason category
//   4. Engineer re-runs generation           → "regenerated"
//
// The diff between the generated snapshot and the reviewed state is
// the highest-signal feedback. It tells us exactly what the AI got
// wrong without asking the engineer to describe it.
//
// Both functions are called from testcases.js — see integration patch.

const { getTcDb } = require("../db");

// ─── Rejection Reason Categories ────────────────────────────────────
// Displayed as a single-select picker in the rejection confirmation.
// Intentionally short — one tap, not a form.
//
// These are UI constants, not DB-stored values. The selected category
// string is stored in feedback_events.rejection_reason as-is.
//
// Exported so the route layer can validate incoming values and the
// UI can render the picker without hardcoding its own copy.
// ─────────────────────────────────────────────────────────────────────

const REJECTION_REASONS = [
  { key: "missing_edge_case",    label: "Missing edge case" },
  { key: "wrong_precondition",   label: "Wrong preconditions" },
  { key: "incomplete_steps",     label: "Incomplete steps" },
  { key: "unclear_expected",     label: "Unclear expected results" },
  { key: "duplicate_coverage",   label: "Duplicates another TC" },
  { key: "wrong_requirement",    label: "Doesn't test the requirement" },
  { key: "other",                label: "Other" },
];

// ─── Diff Computation ───────────────────────────────────────────────

/**
 * Compare the generated snapshot against the current (potentially edited)
 * TC state and produce a structured diff summary.
 *
 * This is the heart of passive feedback. The diff tells us:
 *   - How many steps were edited, added, or removed
 *   - Whether preconditions, description, or title changed
 *   - Which fields were touched (as a simple array for aggregation)
 *
 * Called when a TC status changes to "Reviewed". The result is stored
 * in feedback_events.diff_summary as JSON.
 *
 * @param {string} snapshot  - JSON string from test_cases.generated_snapshot
 * @param {object} current   - The current TC row from the database
 * @returns {object|null}    - Structured diff, or null if no snapshot exists
 */
function computeTcDiff(snapshot, current) {
  if (!snapshot) return null;

  // Parse the snapshot — if it's malformed, we can't diff
  let snap;
  try { snap = JSON.parse(snapshot); } catch { return null; }

  // Parse current TC fields — defensive against malformed JSON
  let currentSteps, currentPre, currentDesc;
  try { currentSteps = JSON.parse(current.steps || "[]"); } catch { currentSteps = []; }
  try { currentPre = JSON.parse(current.preconditions || "{}"); } catch { currentPre = {}; }
  try { currentDesc = JSON.parse(current.description || "{}"); } catch { currentDesc = {}; }

  // ── Step-level diff ──
  // Walk through both arrays position by position.
  // A step that exists in current but not snapshot = added.
  // A step that exists in snapshot but not current = removed.
  // A step that exists in both but differs = edited.
  const origSteps = snap.steps || [];
  const maxSteps = Math.max(origSteps.length, currentSteps.length);
  let stepsEdited = 0, stepsAdded = 0, stepsRemoved = 0;

  for (let i = 0; i < maxSteps; i++) {
    const orig = JSON.stringify(origSteps[i] || null);
    const curr = JSON.stringify(currentSteps[i] || null);

    if (!origSteps[i] && currentSteps[i]) stepsAdded++;
    else if (origSteps[i] && !currentSteps[i]) stepsRemoved++;
    else if (orig !== curr) stepsEdited++;
  }

  // ── Field-level diff ──
  // Deep-compare the JSON for each field. We don't need to know
  // *what* changed inside preconditions — just *whether* it changed.
  // The aggregation job looks at field_changed frequency, not content.
  const preconditionsChanged =
    JSON.stringify(snap.preconditions || {}) !== JSON.stringify(currentPre);
  const descriptionChanged =
    JSON.stringify(snap.description || {}) !== JSON.stringify(currentDesc);
  const titleChanged =
    (snap.title || "") !== (current.title || "");

  // Build the fields_changed array — used for aggregation queries like
  // "60% of edits touch preconditions" without parsing diff details.
  const fieldsChanged = [];
  if (stepsEdited > 0 || stepsAdded > 0 || stepsRemoved > 0) fieldsChanged.push("steps");
  if (preconditionsChanged) fieldsChanged.push("preconditions");
  if (descriptionChanged) fieldsChanged.push("description");
  if (titleChanged) fieldsChanged.push("title");

  return {
    steps_edited: stepsEdited,
    steps_added: stepsAdded,
    steps_removed: stepsRemoved,
    preconditions_changed: preconditionsChanged,
    description_changed: descriptionChanged,
    title_changed: titleChanged,
    fields_changed: fieldsChanged,
    has_changes: fieldsChanged.length > 0,
  };
}

// ─── Feedback Event Logging ─────────────────────────────────────────

/**
 * Record a feedback event. Called from the testcases.js status change
 * endpoint when a TC moves to Reviewed or Rejected.
 *
 * @param {object} params
 * @param {string} params.tcId          - The test case ID (e.g. "TC-RS-001-003")
 * @param {string} params.reqId         - The linked requirement ID
 * @param {string} params.eventType     - One of: approved_unchanged,
 *                                        approved_with_edits, rejected, regenerated
 * @param {object} [params.diffSummary] - Output of computeTcDiff() — only for
 *                                        approved_with_edits events
 * @param {string} [params.rejectionReason] - Key from REJECTION_REASONS — only
 *                                            for rejected events
 * @param {string} params.userId        - The reviewing engineer's user ID
 * @param {string} params.userName      - The reviewing engineer's display name
 * @param {string} [params.depth]       - Generation depth (basic/standard/comprehensive)
 * @param {string} [params.testType]    - TC type (Happy Path, Negative, Boundary, etc.)
 */
function logFeedbackEvent({
  tcId, reqId, eventType, diffSummary, rejectionReason,
  userId, userName, depth, testType,
}) {
  getTcDb().prepare(`
    INSERT INTO feedback_events
      (tc_id, req_id, event_type, diff_summary, rejection_reason,
       user_id, user_name, depth, test_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tcId,
    reqId || "",
    eventType,
    diffSummary ? JSON.stringify(diffSummary) : null,
    rejectionReason || null,
    userId,
    userName,
    depth || "standard",
    testType || null
  );
}

// ─── Discard Mode: Purge Feedback ───────────────────────────────────

/**
 * Remove all feedback events and exemplar entries associated with the given
 * test case IDs. Called from the discard delete path (?discard=true) so
 * discarded TCs don't pollute the next AL aggregation run or get injected
 * into future generation prompts as exemplars.
 *
 * NOTE: This does NOT unwind influence from events that have already been
 * aggregated (processed_at IS NOT NULL). Those events have already shaped
 * existing rules — those rules remain. Discard prevents *future* pollution;
 * it does not rewrite history. rule_evidence rows are intentionally left
 * alone so the audit trail of which events built which rules stays intact.
 *
 * Wrapped in a transaction so a failure mid-purge can't leave the AL tables
 * in a half-cleaned state.
 *
 * @param {string[]} tcIds - Test case IDs to purge (e.g. ["TC-RS-001-003"])
 * @returns {{ feedbackEvents: number, exemplars: number }} - Counts removed
 */
function purgeFeedbackForTestCases(tcIds) {
  if (!Array.isArray(tcIds) || tcIds.length === 0) {
    return { feedbackEvents: 0, exemplars: 0 };
  }

  const db = getTcDb();
  const placeholders = tcIds.map(() => "?").join(",");

  const txn = db.transaction((ids) => {
    const fb = db
      .prepare(`DELETE FROM feedback_events WHERE tc_id IN (${placeholders})`)
      .run(...ids);
    const ex = db
      .prepare(`DELETE FROM exemplar_test_cases WHERE tc_id IN (${placeholders})`)
      .run(...ids);
    return { feedbackEvents: fb.changes, exemplars: ex.changes };
  });

  return txn(tcIds);
}

/**
 * Preview what purgeFeedbackForTestCases would remove for the given TC IDs,
 * without actually deleting anything. Used by the discard confirmation dialog
 * to show the user exactly what feedback signal will be erased.
 *
 * Same array-input shape as the purge helper so a single-TC call passes
 * `[tcId]` and a future bulk preview can pass the full array.
 *
 * @param {string[]} tcIds - Test case IDs to count feedback for
 * @returns {{ feedbackEvents: number, exemplars: number }} - Counts that would be purged
 */
function getPurgePreviewForTestCases(tcIds) {
  if (!Array.isArray(tcIds) || tcIds.length === 0) {
    return { feedbackEvents: 0, exemplars: 0 };
  }

  const db = getTcDb();
  const placeholders = tcIds.map(() => "?").join(",");

  const fb = db
    .prepare(`SELECT COUNT(*) AS count FROM feedback_events WHERE tc_id IN (${placeholders})`)
    .get(...tcIds);
  const ex = db
    .prepare(`SELECT COUNT(*) AS count FROM exemplar_test_cases WHERE tc_id IN (${placeholders})`)
    .get(...tcIds);

  return {
    feedbackEvents: fb.count,
    exemplars: ex.count,
  };
}

module.exports = {
  REJECTION_REASONS,
  computeTcDiff,
  logFeedbackEvent,
  purgeFeedbackForTestCases,
  getPurgePreviewForTestCases,
};