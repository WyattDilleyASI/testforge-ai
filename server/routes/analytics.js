// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — API Routes
// ═══════════════════════════════════════════════════════════════════════════
//
// Mounted at /api/analytics in server/index.js
//
// ACCESS CONTROL:
//   All authenticated     → dashboard, sessions, hints, feedback stats
//   Admin + QA Manager    → rules CRUD, exemplar management
//   Admin only            → maintenance, health
//
// Every endpoint uses the al barrel export — no direct DB access here.

const express = require("express");
const { requireAuth, requireRole } = require("../auth");
const { logAudit } = require("../db");
const al = require("../al");

const router = express.Router();


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — Available to all authenticated users
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/dashboard
// Returns everything the analytics dashboard needs in a single call:
// overall stats, monthly summary, and recent sessions.
router.get("/dashboard", requireAuth, (req, res) => {
  try {
    const overall = al.getOverallStats();
    const monthly = al.getGenerationSummary();
    const recent = al.getRecentSessions(10);
    const feedbackStats = al.getUnprocessedFeedbackStats();
    const exemplarStats = al.getExemplarStats();
    const ruleCount = al.getActiveRules(100).length;

    res.json({
      overall,
      monthly,
      recent_sessions: recent,
      feedback: feedbackStats,
      exemplars: exemplarStats,
      active_rule_count: ruleCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/sessions
// Paginated session history for the session list table.
router.get("/sessions", requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  try {
    const sessions = al.getRecentSessions(limit);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// CONTEXTUAL HINTS — Available to all authenticated users
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/hints/:reqId
// Returns approval rate and edit patterns for a specific requirement.
// The UI calls this before generation to show contextual guidance like:
//   "Last 3 generations had 60% edit rate on preconditions."
router.get("/hints/:reqId", requireAuth, (req, res) => {
  try {
    const approvalRate = al.getApprovalRateForReq(req.params.reqId);
    const editPatterns = al.getEditPatternsForReq(req.params.reqId);

    if (!approvalRate && editPatterns.total_edits === 0) {
      return res.json({ hasHistory: false });
    }

    res.json({
      hasHistory: true,
      approval: approvalRate,
      edits: editPatterns,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK — Available to all authenticated users
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/feedback/stats
// Aggregated feedback stats for the dashboard — no raw event data exposed.
router.get("/feedback/stats", requireAuth, (req, res) => {
  try {
    const stats = al.getUnprocessedFeedbackStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rejection-reasons
// Returns the list of rejection reason categories for the UI picker.
router.get("/rejection-reasons", requireAuth, (req, res) => {
  res.json(al.REJECTION_REASONS);
});


// ═══════════════════════════════════════════════════════════════════════════
// RULES — Admin + QA Manager
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/rules
// Returns all rules (including decayed) for admin management.
router.get("/rules", requireRole("Admin", "QA Manager"), (req, res) => {
  try {
    const rules = al.getAllRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rules/active
// Returns only active rules above the confidence threshold.
// Available to all auth users — useful for "what rules are affecting my generations?"
router.get("/rules/active", requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const scope = req.query.scope || null;
    const rules = scope
      ? al.getActiveRulesForScope(scope, limit)
      : al.getActiveRules(limit);
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rules/metadata
// Returns available categories and scopes for the rule creation form.
router.get("/rules/metadata", requireRole("Admin", "QA Manager"), (req, res) => {
  res.json({
    categories: al.RULE_CATEGORIES,
    scopes: al.RULE_SCOPES,
    max_rules: al.MAX_ADAPTIVE_RULES,
  });
});

// GET /api/analytics/rules/:ruleId
// Returns a single rule with its evidence trail.
router.get("/rules/:ruleId", requireRole("Admin", "QA Manager"), (req, res) => {
  try {
    const rule = al.getRuleById(req.params.ruleId);
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    const evidence = al.getRuleEvidence(req.params.ruleId);
    res.json({ rule, evidence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/rules
// Create a new adaptive rule manually.
router.post("/rules", requireRole("Admin", "QA Manager"), (req, res) => {
  const { ruleText, category, scope, confidence } = req.body;
  if (!ruleText || !ruleText.trim()) {
    return res.status(400).json({ error: "ruleText is required" });
  }

  try {
    const ruleId = al.addAdaptiveRule({
      ruleText: ruleText.trim(),
      category: category || "general",
      scope: scope || "all",
      confidence: confidence || 1.0,
      observationCount: 1,
    });

    logAudit(req.session.name, "AL_RULE_CREATED", `Created adaptive rule ${ruleId}: "${ruleText.trim().slice(0, 80)}..."`);
    const rule = al.getRuleById(ruleId);
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/analytics/rules/:ruleId
// Update a rule's text, category, or scope.
router.put("/rules/:ruleId", requireRole("Admin", "QA Manager"), (req, res) => {
  const { ruleText, category, scope } = req.body;

  try {
    const existing = al.getRuleById(req.params.ruleId);
    if (!existing) return res.status(404).json({ error: "Rule not found" });

    al.updateRule(req.params.ruleId, { ruleText, category, scope });
    logAudit(req.session.name, "AL_RULE_UPDATED", `Updated adaptive rule ${req.params.ruleId}`);

    const updated = al.getRuleById(req.params.ruleId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/analytics/rules/:ruleId
// Delete a rule and its evidence trail.
router.delete("/rules/:ruleId", requireRole("Admin", "QA Manager"), (req, res) => {
  try {
    const existing = al.getRuleById(req.params.ruleId);
    if (!existing) return res.status(404).json({ error: "Rule not found" });

    al.deleteRule(req.params.ruleId);
    logAudit(req.session.name, "AL_RULE_DELETED", `Deleted adaptive rule ${req.params.ruleId}: "${existing.rule_text.slice(0, 80)}"`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLARS — Admin + QA Manager
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/exemplars
// Returns all exemplars with source TC details.
router.get("/exemplars", requireRole("Admin", "QA Manager"), (req, res) => {
  try {
    const exemplars = al.getAllExemplars();
    res.json(exemplars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/exemplars
// Manually promote a TC to the exemplar pool.
// Auto-lookups TC metadata (type, depth, linked reqs) when not provided,
// so the exemplar gets proper relevance scoring in prompt selection.
router.post("/exemplars", requireRole("Admin", "QA Manager"), (req, res) => {
  const { tcId } = req.body;
  if (!tcId) return res.status(400).json({ error: "tcId is required" });

  try {
    // Look up the TC to validate it exists and extract metadata
    const { getTcDb } = require("../db");
    const tc = getTcDb()
      .prepare("SELECT tc_id, type, depth, linked_req_ids, status FROM test_cases WHERE tc_id = ?")
      .get(tcId);

    if (!tc) return res.status(404).json({ error: `Test case '${tcId}' not found` });

    if (tc.status === "Rejected") {
      return res.status(400).json({ error: `Cannot promote a rejected test case (${tcId} is ${tc.status})` });
    }

    // Derive reqType from the first linked requirement ID (e.g. "RS-001" → "RS")
    let reqType = req.body.reqType || null;
    if (!reqType) {
      try {
        const linkedReqs = JSON.parse(tc.linked_req_ids || "[]");
        if (linkedReqs[0]) reqType = linkedReqs[0].replace(/-\d+$/, "");
      } catch { /* skip */ }
    }

    al.addExemplar(tcId, {
      reqType,
      testType: req.body.testType || tc.type || null,
      depth: req.body.depth || tc.depth || "standard",
      selectedBy: req.session.name,
    });

    logAudit(req.session.name, "AL_EXEMPLAR_ADDED", `Promoted ${tcId} to exemplar pool`);
    res.json({ ok: true, tcId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/analytics/exemplars/:tcId
// Remove a TC from the exemplar pool.
router.delete("/exemplars/:tcId", requireRole("Admin", "QA Manager"), (req, res) => {
  try {
    const removed = al.removeExemplar(req.params.tcId);
    if (!removed) return res.status(404).json({ error: "Exemplar not found" });

    logAudit(req.session.name, "AL_EXEMPLAR_REMOVED", `Removed ${req.params.tcId} from exemplar pool`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE — Admin only
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/health
// Quick health status of the AL engine.
router.get("/health", requireRole("Admin"), (req, res) => {
  try {
    const health = al.getHealthStatus();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/maintenance
// Run all maintenance tasks. Returns a summary of what was cleaned up.
router.post("/maintenance", requireRole("Admin"), (req, res) => {
  const feedbackRetentionDays = parseInt(req.body.feedbackRetentionDays) || 90;
  const snapshotBufferDays = parseInt(req.body.snapshotBufferDays) || 7;

  try {
    const result = al.runFullMaintenance({
      feedbackRetentionDays,
      snapshotBufferDays,
    });

    logAudit(req.session.name, "AL_MAINTENANCE", `Full maintenance: pruned ${result.feedback_pruned} feedback, ${result.snapshots_cleared} snapshots, ${result.exemplars_pruned + result.rejected_exemplars_pruned} exemplars, ${result.evidence_pruned} evidence`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/model-reset
// Reset rule confidence after a model version change.
router.post("/model-reset", requireRole("Admin"), (req, res) => {
  try {
    const drift = al.checkModelVersionDrift();
    if (!drift.needs_reset) {
      return res.json({
        ok: true,
        message: "No reset needed — model version matches",
        ...drift,
      });
    }

    const affected = al.resetRulesForModelChange(drift.current_model);
    logAudit(req.session.name, "AL_MODEL_RESET", `Reset ${affected} rule confidences for model change: ${drift.rule_model} → ${drift.current_model}`);

    res.json({
      ok: true,
      rules_affected: affected,
      previous_model: drift.rule_model,
      current_model: drift.current_model,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/aggregate
// Run the full feedback → rules aggregation pipeline.
// Calls Claude to synthesize rules from unprocessed feedback stats.
router.post("/aggregate", requireRole("Admin"), async (req, res) => {
  const minEvents = parseInt(req.body.minEvents) || undefined;

  try {
    const result = await al.runAggregation({ minEvents });

    if (!result.skipped) {
      logAudit(
        req.session.name,
        "AL_AGGREGATION",
        `Aggregation: ${result.events_processed} events → ${result.rules_created} new rules, ${result.rules_reinforced} reinforced`
      );
    }

    res.json(result);
  } catch (err) {
    console.error("Aggregation error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;