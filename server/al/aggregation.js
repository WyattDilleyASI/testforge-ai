// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Aggregation Job
// ═══════════════════════════════════════════════════════════════════════════
//
// Orchestrates the full feedback → rules pipeline:
//   1. Collect unprocessed feedback stats (local, no API)
//   2. Check minimum threshold — skip if not enough signal
//   3. Send pre-computed stats to Claude for rule synthesis
//   4. Parse response into rule candidates
//   5. Match against existing rules (reinforce) or create new ones
//   6. Mark consumed events as processed
//
// TWO MODES:
//   runAggregation()       — full pipeline with Claude API call
//   runLocalAggregation()  — stats-only, no API call, returns report
//
// TRIGGER: Admin button in the System tab, or future scheduled job.
// COST: ~500 input tokens + ~300 output tokens per run ≈ $0.03-0.05

const { getUnprocessedFeedbackStats, markFeedbackProcessed, getUnprocessedEventIds } = require("./analytics");
const { addAdaptiveRule, reinforceRule, getAllRules, RULE_CATEGORIES, RULE_SCOPES } = require("./rules");

// Minimum unprocessed events before we bother calling Claude.
// Below this threshold, there isn't enough signal to extract patterns.
const MIN_EVENTS_FOR_SYNTHESIS = 5;

// ─── Local Aggregation (no API) ─────────────────────────────────────

/**
 * Run local-only aggregation. Returns the pre-computed stats without
 * calling Claude. Useful for the dashboard and for previewing what
 * the synthesis job would see.
 *
 * @returns {object} Stats report from getUnprocessedFeedbackStats()
 */
function runLocalAggregation() {
  return getUnprocessedFeedbackStats();
}

// ─── Build Synthesis Prompt ─────────────────────────────────────────

/**
 * Construct the prompt that asks Claude to synthesize rules from
 * pre-computed feedback statistics. Keeps it short and structured
 * to minimize token cost.
 *
 * @param {object} stats - Output of getUnprocessedFeedbackStats()
 * @param {object[]} existingRules - Current active rules for context
 * @returns {string} The synthesis prompt
 */
function buildSynthesisPrompt(stats, existingRules) {
  const { event_totals, field_edit_counts, top_rejection_reasons, depth_approval_rates, unprocessed_count } = stats;

  // Format event totals
  const totalsStr = event_totals
    .map(t => `  ${t.event_type}: ${t.count}`)
    .join("\n");

  // Format field edit frequency
  const fieldEntries = Object.entries(field_edit_counts)
    .sort((a, b) => b[1] - a[1]);
  const fieldsStr = fieldEntries.length > 0
    ? fieldEntries.map(([field, count]) => `  ${field}: edited ${count} times`).join("\n")
    : "  (no edit data available)";

  // Format rejection reasons
  const rejectStr = top_rejection_reasons.length > 0
    ? top_rejection_reasons.map(r => `  ${r.rejection_reason}: ${r.count}`).join("\n")
    : "  (no rejections)";

  // Format depth stats
  const depthStr = depth_approval_rates.length > 0
    ? depth_approval_rates.map(d => {
        const rate = d.approved + d.rejected > 0
          ? Math.round((d.approved / (d.approved + d.rejected)) * 100)
          : null;
        return `  ${d.depth}: ${d.approved} approved, ${d.rejected} rejected${rate !== null ? ` (${rate}% approval)` : ""}`;
      }).join("\n")
    : "  (no depth data)";

  // Summarize existing rules so Claude avoids duplicates
  const existingStr = existingRules.length > 0
    ? existingRules.map(r => `  - [${r.category}] ${r.rule_text}`).join("\n")
    : "  (none yet)";

  return `You are analyzing QA test case generation feedback for an AI-powered test management tool. Engineers review AI-generated test cases and either approve them (with or without edits), reject them, or regenerate entirely.

FEEDBACK STATISTICS (${unprocessed_count} events):

Event types:
${totalsStr}

Most frequently edited fields (approved_with_edits events):
${fieldsStr}

Top rejection reasons:
${rejectStr}

Approval rates by generation depth:
${depthStr}

EXISTING RULES (avoid duplicating these):
${existingStr}

VALID CATEGORIES: ${RULE_CATEGORIES.join(", ")}
VALID SCOPES: ${RULE_SCOPES.join(", ")}

Based on these patterns, generate 1-5 concise, actionable generation rules that would improve first-pass test case quality. Each rule should directly address a weakness revealed by the data.

Respond ONLY with a JSON array. Each element must have:
- "rule_text": string — the instruction to inject into generation prompts (imperative, concise)
- "category": string — one of the valid categories above
- "scope": string — one of the valid scopes above, use "all" unless the pattern is domain-specific
- "confidence": number — between 0.3 and 1.0, higher if the pattern is strong and consistent
- "reasoning": string — brief explanation of which data points support this rule

No markdown, no preamble, no trailing text. JSON array only.`;
}

// ─── Full Aggregation with Claude ───────────────────────────────────

/**
 * Run the full aggregation pipeline:
 *   1. Compute local stats
 *   2. Check threshold
 *   3. Call Claude for rule synthesis
 *   4. Create/reinforce rules
 *   5. Mark events as processed
 *
 * @param {object} [opts]
 * @param {number} [opts.minEvents] - Override MIN_EVENTS_FOR_SYNTHESIS
 * @returns {object} Summary of aggregation results
 */
async function runAggregation({ minEvents } = {}) {
  const threshold = minEvents || MIN_EVENTS_FOR_SYNTHESIS;

  // Step 1: Local stats
  const stats = getUnprocessedFeedbackStats();

  if (stats.unprocessed_count === 0) {
    return {
      ok: true,
      skipped: true,
      reason: "No unprocessed feedback events",
      events_processed: 0,
      rules_created: 0,
      rules_reinforced: 0,
    };
  }

  if (stats.unprocessed_count < threshold) {
    return {
      ok: true,
      skipped: true,
      reason: `Only ${stats.unprocessed_count} events (minimum: ${threshold})`,
      events_processed: 0,
      rules_created: 0,
      rules_reinforced: 0,
      stats, // Return stats so the UI can still show them
    };
  }

  // Step 2: Get existing rules for duplicate avoidance
  const existingRules = getAllRules();

  // Step 3: Build prompt and call Claude
  const prompt = buildSynthesisPrompt(stats, existingRules);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured — cannot run synthesis");
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
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const text = data.content?.map(c => c.text || "").join("") || "";
  const tokenUsage = {
    input_tokens: data.usage?.input_tokens || 0,
    output_tokens: data.usage?.output_tokens || 0,
  };

  // Step 4: Parse rule candidates
  let candidates;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    candidates = JSON.parse(cleaned);
    if (!Array.isArray(candidates)) {
      throw new Error("Response is not an array");
    }
  } catch (parseErr) {
    throw new Error(`Failed to parse Claude response: ${parseErr.message}\nRaw: ${text.slice(0, 500)}`);
  }

  // Step 5: Create or reinforce rules
  const eventIds = getUnprocessedEventIds();
  let rulesCreated = 0;
  let rulesReinforced = 0;
  const ruleResults = [];

  for (const candidate of candidates) {
    if (!candidate.rule_text || typeof candidate.rule_text !== "string") continue;

    // Validate category and scope
    const category = RULE_CATEGORIES.includes(candidate.category)
      ? candidate.category : "general";
    const scope = RULE_SCOPES.includes(candidate.scope)
      ? candidate.scope : "all";
    const confidence = typeof candidate.confidence === "number"
      ? Math.max(0.3, Math.min(1.0, candidate.confidence)) : 0.5;

    // Check for existing rule that this might reinforce.
    // Simple heuristic: same category with similar text (>50% word overlap).
    const matchingRule = existingRules.find(existing => {
      if (existing.category !== category) return false;
      const existingWords = new Set(existing.rule_text.toLowerCase().split(/\s+/));
      const candidateWords = candidate.rule_text.toLowerCase().split(/\s+/);
      const overlap = candidateWords.filter(w => existingWords.has(w)).length;
      return overlap / candidateWords.length > 0.5;
    });

    if (matchingRule) {
      // Reinforce existing rule
      reinforceRule(matchingRule.rule_id, stats.unprocessed_count, eventIds);
      rulesReinforced++;
      ruleResults.push({
        action: "reinforced",
        rule_id: matchingRule.rule_id,
        rule_text: matchingRule.rule_text,
        reasoning: candidate.reasoning || "",
      });
    } else {
      // Create new rule
      const ruleId = addAdaptiveRule({
        ruleText: candidate.rule_text,
        category,
        scope,
        confidence,
        observationCount: stats.unprocessed_count,
        feedbackEventIds: eventIds,
      });
      rulesCreated++;
      ruleResults.push({
        action: "created",
        rule_id: ruleId,
        rule_text: candidate.rule_text,
        category,
        scope,
        confidence,
        reasoning: candidate.reasoning || "",
      });
    }
  }

  // Step 6: Mark events as processed
  markFeedbackProcessed(eventIds);

  return {
    ok: true,
    skipped: false,
    events_processed: eventIds.length,
    rules_created: rulesCreated,
    rules_reinforced: rulesReinforced,
    rules: ruleResults,
    stats,
    token_usage: tokenUsage,
    ran_at: new Date().toISOString(),
  };
}

module.exports = {
  MIN_EVENTS_FOR_SYNTHESIS,
  runLocalAggregation,
  buildSynthesisPrompt,
  runAggregation,
};