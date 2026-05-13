// ═══════════════════════════════════════════════════════════════════════════
// hybrid_client.js — Routes calls between AI and human players.
//
// Wraps an AI client (RealClaudeClient or FakeClaudeClient) and a set of
// HumanWaiters, one per human-controlled seat. On each call(), checks
// player.isHuman:
//   - true  → looks up the waiter for player.name, delegates to it
//             (waiter emits human_input_needed and awaits POST /respond)
//   - false → delegates to AI client unchanged
//
// Waiters are registered after construction via registerWaiter(). This
// two-step setup lets the route build the client first, then walk the
// state.players list adding one waiter per isHuman seat. Construction
// happens before the route knows how many humans the game has.
//
// The orchestrator never sees the branching — it just calls client.call().
// ═══════════════════════════════════════════════════════════════════════════

class HybridClient {
  constructor({ aiClient }) {
    if (!aiClient) throw new Error("HybridClient: aiClient is required");
    this.aiClient = aiClient;
    this.waiters = new Map();   // Map<playerName, HumanWaiter>
    this._emit = null;
  }

  // Register a waiter for a specific human-controlled seat. Call once per
  // human player before the orchestrator starts. Throws on duplicate names
  // to catch accidental double-registration in the route.
  registerWaiter(playerName, waiter) {
    if (!playerName) throw new Error("HybridClient: playerName is required");
    if (!waiter) throw new Error("HybridClient: waiter is required");
    if (this.waiters.has(playerName)) {
      throw new Error(
        `HybridClient: waiter already registered for "${playerName}"`
      );
    }
    this.waiters.set(playerName, waiter);
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
      const waiter = this.waiters.get(player.name);
      if (!waiter) {
        throw new Error(
          `HybridClient: player "${player.name}" is flagged isHuman but no ` +
          `waiter is registered. Did the route forget to call registerWaiter()?`
        );
      }
      return await waiter.wait(player, state, task, this._emit);
    }
    return await this.aiClient.call(player, state, task, options);
  }

  // Cancel every registered waiter at once. Used in the route's cleanup
  // path when the SSE connection drops mid-game; saves the caller from
  // looping themselves.
  cancelAll(reason = "Session cancelled") {
    for (const waiter of this.waiters.values()) {
      try { waiter.cancel(reason); } catch {}
    }
  }
}

module.exports = { HybridClient };