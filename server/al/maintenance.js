// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Maintenance & Housekeeping
// ═══════════════════════════════════════════════════════════════════════════
//
// Data retention, snapshot cleanup, model version resets, and health
// checks. These functions keep the AL engine lean over time.
//
// TWO WAYS TO RUN:
//   1. Admin button — "Run Maintenance" in the analytics settings panel.
//      Calls runFullMaintenance() and displays the results summary.
//   2. Scheduled — wire runFullMaintenance() into a setInterval in
//      index.js or a cron job. Weekly is plenty for most teams.
//
// RETENTION POLICY:
//   Hot (0-90 days)   — Raw feedback events with full diff_summary.
//                        Active learning window for pattern extraction.
//   Warm (90+ days)   — Processed events are pruned. Generation sessions
//                        persist indefinitely (tiny rows, ~200 bytes each)
//                        for long-term trend lines.
//   Snapshots         — Cleared 7 days after a TC leaves Draft status.
//                        Buffer period allows undo. After that, the diff
//                        has been captured in feedback_events and the
//                        raw snapshot is no longer needed.
//   Rules             — Indefinite, but subject to confidence decay.
//                        Rules below 0.1 effective_confidence are
//                        excluded from prompts by the view filter.
//   Exemplars         — Indefinite, but orphans (deleted source TCs)
//                        are pruned automatically.
//   Evidence          — Pruned when its parent rule is deleted or when
//                        the linked feedback event is pruned.

const { getCoreDb, getTcDb } = require("../db");

// ─── Feedback Event Retention ───────────────────────────────────────

/**
 * Delete processed feedback events older than the retention window.
 * Unprocessed events are NEVER pruned — they haven't been consumed
 * by the aggregation job yet, regardless of age.
 *
 * The aggregation job sets processed_at when it consumes an event.
 * This function only touches rows where processed_at IS NOT NULL.
 *
 * @param {number} [daysToKeep=90] - Retention period in days
 * @returns {number} Number of rows deleted
 */
function pruneOldFeedbackEvents(daysToKeep = 90) {
  const result = getTcDb().prepare(`
    DELETE FROM feedback_events
    WHERE processed_at IS NOT NULL
      AND created_at < datetime('now', '-' || ? || ' days')
  `).run(daysToKeep);
  return result.changes;
}

// ─── Snapshot Cleanup ───────────────────────────────────────────────

/**
 * Clear generated_snapshot on TCs that have left Draft status.
 * The buffer period allows an engineer to undo a review and
 * still have the snapshot available for re-diffing.
 *
 * After the buffer, the diff has already been captured in
 * feedback_events — the raw snapshot is dead weight.
 *
 * @param {number} [bufferDays=7] - Days after review before clearing
 * @returns {number} Number of snapshots cleared
 */
function clearStaleSnapshots(bufferDays = 7) {
  const result = getTcDb().prepare(`
    UPDATE test_cases
    SET generated_snapshot = NULL
    WHERE generated_snapshot IS NOT NULL
      AND status != 'Draft'
      AND generated_at < datetime('now', '-' || ? || ' days')
  `).run(bufferDays);
  return result.changes;
}

// ─── Exemplar Cleanup ───────────────────────────────────────────────

/**
 * Remove exemplars whose source TCs have been deleted from the
 * test_cases table. Without this, the exemplar pool accumulates
 * references to TCs that no longer exist, and prompt building
 * would silently produce empty exemplar blocks.
 *
 * @returns {number} Number of orphaned exemplars removed
 */
function pruneOrphanedExemplars() {
  const result = getTcDb().prepare(`
    DELETE FROM exemplar_test_cases
    WHERE tc_id NOT IN (SELECT tc_id FROM test_cases)
  `).run();
  return result.changes;
}

/**
 * Remove exemplars whose source TCs have been rejected.
 * A rejected TC shouldn't be held up as a "gold standard."
 *
 * @returns {number} Number of rejected exemplars removed
 */
function pruneRejectedExemplars() {
  const result = getTcDb().prepare(`
    DELETE FROM exemplar_test_cases
    WHERE tc_id IN (
      SELECT tc_id FROM test_cases WHERE status = 'Rejected'
    )
  `).run();
  return result.changes;
}

// ─── Evidence Cleanup ───────────────────────────────────────────────

/**
 * Remove evidence rows that reference feedback events which no
 * longer exist (pruned by pruneOldFeedbackEvents). Keeps the
 * rule_evidence table from accumulating dangling references.
 *
 * @returns {number} Number of orphaned evidence rows removed
 */
function pruneOrphanedEvidence() {
  // rule_evidence is in core.db, feedback_events is in testcases.db.
  // We can't do a cross-DB join, so we fetch surviving event IDs first.
  const tcDb = getTcDb();
  const coreDb = getCoreDb();

  const survivingIds = new Set(
    tcDb.prepare("SELECT id FROM feedback_events").all().map(r => r.id)
  );

  const allEvidence = coreDb
    .prepare("SELECT id, feedback_event_id FROM rule_evidence")
    .all();

  const orphanIds = allEvidence
    .filter(e => !survivingIds.has(e.feedback_event_id))
    .map(e => e.id);

  if (orphanIds.length === 0) return 0;

  const stmt = coreDb.prepare("DELETE FROM rule_evidence WHERE id = ?");
  const batch = coreDb.transaction((ids) => {
    for (const id of ids) stmt.run(id);
  });
  batch(orphanIds);

  return orphanIds.length;
}

// ─── Model Version Reset ────────────────────────────────────────────

/**
 * When ANTHROPIC_MODEL changes (e.g. from sonnet-4 to a future
 * model), halve all rule confidence scores. The new model may
 * behave differently, so rules derived from the old model's output
 * need to re-prove themselves.
 *
 * Also updates model_version on all rules so you can see which
 * model era each rule belongs to.
 *
 * Call this from the settings route when ANTHROPIC_MODEL is updated,
 * or detect it at startup by comparing the current env var against
 * the most recent rule's model_version.
 *
 * @param {string} newModelVersion - The new ANTHROPIC_MODEL value
 * @returns {number} Number of rules affected
 */
function resetRulesForModelChange(newModelVersion) {
  const result = getCoreDb().prepare(`
    UPDATE adaptive_rules
    SET base_confidence = base_confidence * 0.5,
        model_version = ?,
        updated_at = datetime('now')
  `).run(newModelVersion);
  return result.changes;
}

/**
 * Check whether the current ANTHROPIC_MODEL matches the model
 * version stored on existing rules. If not, the caller should
 * prompt the admin or auto-trigger resetRulesForModelChange().
 *
 * @returns {object} { current_model, rule_model, needs_reset }
 */
function checkModelVersionDrift() {
  const currentModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const latest = getCoreDb()
    .prepare(
      "SELECT model_version FROM adaptive_rules ORDER BY rowid DESC LIMIT 1"
    )
    .get();

  const ruleModel = latest?.model_version || null;

  return {
    current_model: currentModel,
    rule_model: ruleModel,
    needs_reset: ruleModel !== null && ruleModel !== currentModel,
  };
}

// ─── Health Check ───────────────────────────────────────────────────

/**
 * Quick health summary of the AL engine's data state.
 * Powers a status indicator in the admin panel.
 *
 * @returns {object} Counts and status indicators
 */
function getHealthStatus() {
  const coreDb = getCoreDb();
  const tcDb = getTcDb();

  const feedbackCount = tcDb
    .prepare("SELECT COUNT(*) as count FROM feedback_events")
    .get().count;
  const unprocessedCount = tcDb
    .prepare("SELECT COUNT(*) as count FROM feedback_events WHERE processed_at IS NULL")
    .get().count;
  const snapshotCount = tcDb
    .prepare("SELECT COUNT(*) as count FROM test_cases WHERE generated_snapshot IS NOT NULL")
    .get().count;
  const ruleCount = coreDb
    .prepare("SELECT COUNT(*) as count FROM adaptive_rules")
    .get().count;
  const activeRuleCount = coreDb
    .prepare(`SELECT COUNT(*) as count FROM adaptive_rules WHERE (base_confidence * POWER(0.5, (JULIANDAY('now') - JULIANDAY(last_reinforced_at)) / half_life_days)) >= 0.1`)
    .get().count;
  const exemplarCount = tcDb
    .prepare("SELECT COUNT(*) as count FROM exemplar_test_cases")
    .get().count;
  const sessionCount = coreDb
    .prepare("SELECT COUNT(*) as count FROM generation_sessions")
    .get().count;
  const evidenceCount = coreDb
    .prepare("SELECT COUNT(*) as count FROM rule_evidence")
    .get().count;

  const modelDrift = checkModelVersionDrift();

  return {
    feedback_events: {
      total: feedbackCount,
      unprocessed: unprocessedCount,
    },
    snapshots_pending: snapshotCount,
    rules: {
      total: ruleCount,
      active: activeRuleCount,
      max: 25,
    },
    exemplars: exemplarCount,
    generation_sessions: sessionCount,
    evidence_links: evidenceCount,
    model_version: modelDrift,
  };
}

// ─── Full Maintenance Run ───────────────────────────────────────────

/**
 * Run all maintenance tasks in sequence. Returns a summary of
 * what was cleaned up.
 *
 * Safe to call at any time — all operations are idempotent.
 * Typical runtime: <100ms even with thousands of rows.
 *
 * @param {object} [opts]
 * @param {number} [opts.feedbackRetentionDays=90]
 * @param {number} [opts.snapshotBufferDays=7]
 * @returns {object} Summary of all actions taken
 */
function runFullMaintenance({
  feedbackRetentionDays = 90,
  snapshotBufferDays = 7,
} = {}) {
  const feedbackPruned = pruneOldFeedbackEvents(feedbackRetentionDays);
  const snapshotsCleared = clearStaleSnapshots(snapshotBufferDays);
  const exemplarsPruned = pruneOrphanedExemplars();
  const rejectedExemplarsPruned = pruneRejectedExemplars();
  const evidencePruned = pruneOrphanedEvidence();
  const health = getHealthStatus();

  return {
    feedback_pruned: feedbackPruned,
    snapshots_cleared: snapshotsCleared,
    exemplars_pruned: exemplarsPruned,
    rejected_exemplars_pruned: rejectedExemplarsPruned,
    evidence_pruned: evidencePruned,
    health_after: health,
    ran_at: new Date().toISOString(),
  };
}

module.exports = {
  // Individual tasks
  pruneOldFeedbackEvents,
  clearStaleSnapshots,
  pruneOrphanedExemplars,
  pruneRejectedExemplars,
  pruneOrphanedEvidence,

  // Model version
  resetRulesForModelChange,
  checkModelVersionDrift,

  // Health & status
  getHealthStatus,

  // All-in-one
  runFullMaintenance,
};