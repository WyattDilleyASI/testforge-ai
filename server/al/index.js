// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Barrel Export
// ═══════════════════════════════════════════════════════════════════════════
//
// Single import point for all AL functionality.
//
// Usage:
//   const al = require("./al");
//   al.logFeedbackEvent({ ... });
//   al.getActiveRules(10);
//   al.formatRulesForPrompt("safety_critical");
//
// Consumers never need to know which internal file a function lives in.
// If a function exists in the AL engine, it's available through this export.

const schema      = require("./schema");
const feedback    = require("./feedback");
const analytics   = require("./analytics");
const rules       = require("./rules");
const exemplars   = require("./exemplars");
const maintenance = require("./maintenance");
const aggregation = require("./aggregation");

module.exports = {

  // ── Schema ──────────────────────────────────────────────────────────
  initializeAL: schema.initializeAL,

  // ── Feedback (AL-002) ──────────────────────────────────────────────
  REJECTION_REASONS:            feedback.REJECTION_REASONS,
  computeTcDiff:                feedback.computeTcDiff,
  logFeedbackEvent:             feedback.logFeedbackEvent,
  purgeFeedbackForTestCases:    feedback.purgeFeedbackForTestCases,
  getPurgePreviewForTestCases:  feedback.getPurgePreviewForTestCases,

  // ── Analytics (AL-003) ─────────────────────────────────────────────
  // Session tracking
  logGenerationSession:     analytics.logGenerationSession,
  updateSessionCountsForTc: analytics.updateSessionCountsForTc,
  // Dashboard queries
  getGenerationSummary:     analytics.getGenerationSummary,
  getRecentSessions:        analytics.getRecentSessions,
  getOverallStats:          analytics.getOverallStats,
  // Contextual hints
  getApprovalRateForReq:    analytics.getApprovalRateForReq,
  getEditPatternsForReq:    analytics.getEditPatternsForReq,
  // Local aggregation
  getUnprocessedFeedbackStats: analytics.getUnprocessedFeedbackStats,
  markFeedbackProcessed:       analytics.markFeedbackProcessed,
  getUnprocessedEventIds:      analytics.getUnprocessedEventIds,

  // ── Rules (AL-004 foundation) ──────────────────────────────────────
  // Constants
  MAX_ADAPTIVE_RULES: rules.MAX_ADAPTIVE_RULES,
  RULE_CATEGORIES:    rules.RULE_CATEGORIES,
  RULE_SCOPES:        rules.RULE_SCOPES,
  // CRUD
  addAdaptiveRule:    rules.addAdaptiveRule,
  updateRule:         rules.updateRule,
  deleteRule:         rules.deleteRule,
  // Reinforcement
  reinforceRule:      rules.reinforceRule,
  // Queries
  getActiveRules:        rules.getActiveRules,
  getActiveRulesForScope: rules.getActiveRulesForScope,
  getAllRules:            rules.getAllRules,
  getRuleById:           rules.getRuleById,
  getRuleEvidence:       rules.getRuleEvidence,
  // Prompt building
  formatRulesForPrompt:  rules.formatRulesForPrompt,

  // ── Aggregation ────────────────────────────────────────────────────
  MIN_EVENTS_FOR_SYNTHESIS: aggregation.MIN_EVENTS_FOR_SYNTHESIS,
  runLocalAggregation:      aggregation.runLocalAggregation,
  runAggregation:           aggregation.runAggregation,

  // ── Exemplars ──────────────────────────────────────────────────────
  // Constants
  MAX_EXEMPLARS:      exemplars.MAX_EXEMPLARS,
  // Management
  addExemplar:        exemplars.addExemplar,
  removeExemplar:     exemplars.removeExemplar,
  isExemplar:         exemplars.isExemplar,
  // Selection (prompt building)
  getExemplarsForGeneration: exemplars.getExemplarsForGeneration,
  getExemplarContent:        exemplars.getExemplarContent,
  getExemplarsWithContent:   exemplars.getExemplarsWithContent,
  formatExemplarsForPrompt:  exemplars.formatExemplarsForPrompt,
  // Admin
  getAllExemplars:     exemplars.getAllExemplars,
  getExemplarStats:   exemplars.getExemplarStats,

  // ── Maintenance ────────────────────────────────────────────────────
  // Individual tasks
  pruneOldFeedbackEvents:  maintenance.pruneOldFeedbackEvents,
  clearStaleSnapshots:     maintenance.clearStaleSnapshots,
  pruneOrphanedExemplars:  maintenance.pruneOrphanedExemplars,
  pruneRejectedExemplars:  maintenance.pruneRejectedExemplars,
  pruneOrphanedEvidence:   maintenance.pruneOrphanedEvidence,
  // Model version
  resetRulesForModelChange: maintenance.resetRulesForModelChange,
  checkModelVersionDrift:   maintenance.checkModelVersionDrift,
  // Health & status
  getHealthStatus:          maintenance.getHealthStatus,
  // All-in-one
  runFullMaintenance:       maintenance.runFullMaintenance,
};