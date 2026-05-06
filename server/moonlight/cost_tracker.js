// ═══════════════════════════════════════════════════════════════════════════
// cost_tracker.js — Token accounting and budget enforcement.
//
// Every Claude API call goes through here. We track input/output tokens,
// compute cost based on the model's pricing, and enforce per-game and
// daily caps. If a cap is exceeded, the next call throws — the orchestrator
// catches it and ends the game gracefully.
//
// Storage
// -------
// Daily totals persist to a small JSON file at server/moonlight/.budget.json
// so caps survive server restarts. Per-game totals are in-memory only.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

// ─── Pricing ───────────────────────────────────────────────────────────────
//
// Per-million-token rates in USD. Update if Anthropic changes pricing.
// These are the rates as of pass-A authoring. The cost tracker logs the
// rate it used per call so we can audit retroactively.

const PRICING = {
  // Claude Sonnet — our default for Moonlight agents.
  "claude-sonnet-4-5": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  // Cheaper alternative if we ever want to use Haiku for villagers.
  "claude-haiku-4-5": { input: 1.00, output: 5.00 },
  // Default fallback if the model isn't recognized.
  default: { input: 3.00, output: 15.00 },
};

function pricingFor(model) {
  return PRICING[model] || PRICING.default;
}

// ─── Caps ──────────────────────────────────────────────────────────────────

const DEFAULT_CAPS = Object.freeze({
  perGameUsd: 3.00,    // single-game ceiling
  dailyUsd: 20.00,     // total today across all games
});

// ─── Persistence ───────────────────────────────────────────────────────────

const BUDGET_FILE = path.join(__dirname, ".budget.json");

function todayKey() {
  // YYYY-MM-DD in UTC. Consistent across timezones, which matters for
  // a server that might serve users in different zones.
  return new Date().toISOString().slice(0, 10);
}

function loadBudget() {
  try {
    const raw = fs.readFileSync(BUDGET_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveBudget(budget) {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
  } catch (err) {
    // Don't crash the game if we can't persist — just log it.
    console.error("[moonlight] could not persist budget:", err.message);
  }
}

// ─── BudgetExceeded error ──────────────────────────────────────────────────

class BudgetExceeded extends Error {
  constructor(scope, spent, cap) {
    super(`Budget cap exceeded (${scope}): $${spent.toFixed(4)} >= $${cap.toFixed(2)}`);
    this.name = "BudgetExceeded";
    this.scope = scope;
    this.spent = spent;
    this.cap = cap;
  }
}

// ─── CostTracker ───────────────────────────────────────────────────────────
//
// One instance per game. Construct, pass to the Claude client, query
// after each game. Daily total persists across instances via the JSON file.

class CostTracker {
  constructor(caps = {}) {
    this.caps = { ...DEFAULT_CAPS, ...caps };
    this.gameSpent = 0;
    this.callCount = 0;
    this.calls = [];  // detailed log
  }

  // Record a call's cost. Returns the cost of this call.
  // Throws BudgetExceeded if either cap would be crossed.
  record({ model, inputTokens, outputTokens, task }) {
    const rate = pricingFor(model);
    const cost = (inputTokens * rate.input + outputTokens * rate.output) / 1e6;

    // Project the new totals BEFORE writing them, so we can refuse the
    // call rather than recording an over-budget event.
    const projectedGame = this.gameSpent + cost;
    if (projectedGame > this.caps.perGameUsd) {
      throw new BudgetExceeded("per-game", projectedGame, this.caps.perGameUsd);
    }

    const budget = loadBudget();
    const today = todayKey();
    const projectedToday = (budget[today] || 0) + cost;
    if (projectedToday > this.caps.dailyUsd) {
      throw new BudgetExceeded("daily", projectedToday, this.caps.dailyUsd);
    }

    // OK — record the spend.
    this.gameSpent = projectedGame;
    this.callCount += 1;
    this.calls.push({
      task,
      model,
      inputTokens,
      outputTokens,
      cost,
      ts: new Date().toISOString(),
    });

    budget[today] = projectedToday;
    saveBudget(budget);

    return cost;
  }

  // Pre-flight check before starting a new game. Throws if the daily cap
  // is already exceeded so we don't burn an API call only to have it
  // reject mid-game.
  preflightCheck() {
    const budget = loadBudget();
    const today = budget[todayKey()] || 0;
    if (today >= this.caps.dailyUsd) {
      throw new BudgetExceeded("daily-preflight", today, this.caps.dailyUsd);
    }
  }

  // Read-only summary, safe to send to the client.
  summary() {
    const budget = loadBudget();
    return {
      thisGame: this.gameSpent,
      todayTotal: budget[todayKey()] || 0,
      callCount: this.callCount,
      caps: { ...this.caps },
    };
  }
}

module.exports = { CostTracker, BudgetExceeded, pricingFor, todayKey };
