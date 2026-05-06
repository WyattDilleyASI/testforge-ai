// ═══════════════════════════════════════════════════════════════════════════
// hybrid_client.js — Routes calls between AI and human players.
//
// Wraps an AI client (RealClaudeClient or FakeClaudeClient) and a
// HumanWaiter. On each call(), checks player.isHuman:
//   - true  → delegates to HumanWaiter, which emits human_input_needed
//             and waits for POST /respond
//   - false → delegates to AI client unchanged
//
// The orchestrator never sees this branching — it just calls client.call().
// ═══════════════════════════════════════════════════════════════════════════

class HybridClient {
  constructor({ aiClient, waiter }) {
    if (!aiClient) throw new Error("HybridClient: aiClient is required");
    if (!waiter) throw new Error("HybridClient: waiter is required");
    this.aiClient = aiClient;
    this.waiter = waiter;
    this._emit = null;
  }

  // Called by runGameStreaming once at the top of the loop. The orchestrator
  // detects HybridClient via the presence of this method.
  setEmit(emit) {
    this._emit = emit;
  }

  async call(player, state, task, options = {}) {
    if (player.isHuman) {
      if (!this._emit) {
        throw new Error(
          "HybridClient: setEmit() must be called before any human player acts. " +
          "The orchestrator should call client.setEmit(emit) at the start of the run."
        );
      }
      return await this.waiter.wait(player, state, task, this._emit);
    }
    return await this.aiClient.call(player, state, task, options);
  }
}

module.exports = { HybridClient };
