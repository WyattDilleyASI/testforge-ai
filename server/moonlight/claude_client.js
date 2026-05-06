// ═══════════════════════════════════════════════════════════════════════════
// claude_client.js — Real Anthropic API client.
//
// Drop-in replacement for FakeClaudeClient. Same interface:
//
//     await client.call(player, state, task)
//
// Key differences from the fake client:
//   - Async (returns a Promise)
//   - Uses Anthropic API tool use for structured output — Claude is forced
//     to fill in a JSON schema, eliminating most parsing failures
//   - Goes through CostTracker; throws BudgetExceeded if caps hit
//   - Has retry logic for transient API errors (5xx, 429, network)
//
// The orchestrator's main loop becomes async to support this — runGame
// becomes runGameAsync. The synchronous version stays for fake-client tests.
//
// Network: this uses node's built-in fetch (Node 18+). No axios/got dependency.
// ═══════════════════════════════════════════════════════════════════════════

const { buildPrompt, schemaForTask } = require("./prompts");

// ─── Constants ─────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 1024;

// Retry config — for transport errors only (5xx, 429, network).
// Validation errors (400, schema mismatch) don't get retried; they get logged.
const RETRY_CONFIG = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
});

// ─── RealClaudeClient ──────────────────────────────────────────────────────

class RealClaudeClient {
  constructor({ apiKey, costTracker, model = DEFAULT_MODEL, logger = null }) {
    if (!apiKey) {
      throw new Error("RealClaudeClient: apiKey is required");
    }
    if (!costTracker) {
      throw new Error("RealClaudeClient: costTracker is required");
    }
    this.apiKey = apiKey;
    this.costTracker = costTracker;
    this.model = model;
    this.logger = logger || (() => {});
  }

  // Main entry point. Same shape as FakeClaudeClient.call.
  async call(player, state, task) {
    const prompt = buildPrompt(player, state, task);
    const schema = schemaForTask(task);

    const requestBody = {
      model: this.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: prompt.system,
      messages: prompt.messages,
      tools: [{
        name: schema.name,
        description: schema.description,
        input_schema: schema.input_schema,
      }],
      // Force the model to use the tool — guarantees structured output.
      tool_choice: { type: "tool", name: schema.name },
    };

    const apiResponse = await this._callWithRetry(requestBody, task);

    // Record cost.
    const usage = apiResponse.usage || { input_tokens: 0, output_tokens: 0 };
    this.costTracker.record({
      model: this.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      task,
    });

    // Extract the tool use block. Should always be present given tool_choice.
    const toolUse = (apiResponse.content || []).find(
      block => block.type === "tool_use"
    );
    if (!toolUse) {
      throw new Error(
        `Claude did not produce a tool_use block for task "${task}". ` +
        `Stop reason: ${apiResponse.stop_reason}.`
      );
    }

    this.logger({
      kind: "claude_call",
      task,
      player: player.name,
      role: player.role.name,
      input: toolUse.input,
      tokens: usage,
    });

    return toolUse.input;
  }

  // ── Internal: HTTP with retry on transient errors ──────────────────────

  async _callWithRetry(body, task) {
    let lastError = null;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await this._callOnce(body);
      } catch (err) {
        lastError = err;
        if (!this._isRetryable(err)) {
          // Validation errors, auth errors, etc. — don't retry, just throw.
          throw err;
        }
        if (attempt === RETRY_CONFIG.maxAttempts - 1) break;
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        this.logger({
          kind: "claude_retry",
          task,
          attempt: attempt + 1,
          delayMs: delay,
          error: err.message,
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error(`Claude API failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError?.message || lastError}`);
  }

  async _callOnce(body) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      const err = new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return res.json();
  }

  _isRetryable(err) {
    // Retry on 5xx, 429, and network errors (no status code).
    if (err.status == null) return true;       // network / fetch failure
    if (err.status === 429) return true;       // rate limited
    if (err.status >= 500) return true;        // server error
    return false;
  }
}

module.exports = { RealClaudeClient };
