// ═══════════════════════════════════════════════════════════════════════════
// human_waiter.js — Per-game pause/resume for a human player.
//
// When the orchestrator hits a turn where player.isHuman === true, the
// HybridClient delegates to an instance of this class. The waiter:
//   1. Emits a `human_input_needed` event over the SSE stream with all
//      the context the UI needs to render the right input widget.
//   2. Returns a Promise that resolves when POST /api/moonlight/respond
//      is called with the human's submitted response.
//
// The route module owns one HumanWaiter per game session, indexed by
// session ID, and resolves the waiter when /respond fires.
//
// Cancellation
// ------------
// If the SSE connection drops before the human responds, the route calls
// cancel(), which rejects the pending promise. The orchestrator catches
// this and ends the game.
// ═══════════════════════════════════════════════════════════════════════════

const { Channel } = require("./roles");

class HumanWaiter {
  constructor(sessionId, playerName = null) {
    this.sessionId = sessionId;
    this.playerName = playerName;   // optional, for log/error messages
    this.pending = null;            // { resolve, reject, task, player, state } | null
    this.cancelled = false;
  }

  // Called by HybridClient when it's the human's turn. Returns a Promise
  // that resolves with the human's submitted response.
  //
  // emit is the orchestrator's transcript emitter — using it means
  // human_input_needed events appear in the same SSE stream as game
  // events, in the right order.
  //
  // We capture player and state on this.pending so HybridClient.demoteToAi
  // can synthesize an AI response without needing them passed back in —
  // disconnect handling happens far from the original call site, so
  // having the args available here keeps the takeover API clean.
  async wait(player, state, task, emit) {
    if (this.cancelled) {
      throw new Error("Session was cancelled before human input could be collected");
    }
    if (this.pending) {
      throw new Error("HumanWaiter is already waiting for input — concurrent calls are not supported");
    }

    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, task, player, state };

      const payload = this._buildPayload(player, state, task);
      emit("human_input_needed", payload);
    });
  }

  // Called by POST /api/moonlight/respond. The response shape depends on
  // the task — same shape an AI client would return for that task. The
  // orchestrator's _normalize and _validateTarget will catch malformed
  // inputs (bad target names, etc), so we don't validate here.
  resolve(response) {
    if (!this.pending) {
      throw new Error("No pending input request to resolve");
    }
    const { resolve } = this.pending;
    this.pending = null;
    resolve(response);
  }

  // Reject the pending promise with an error. Used when the SSE stream
  // closes or the route cleans up the session.
  cancel(reason = "Session cancelled") {
    this.cancelled = true;
    if (this.pending) {
      const { reject } = this.pending;
      this.pending = null;
      reject(new Error(reason));
    }
  }

  isWaiting() {
    return this.pending !== null;
  }

  pendingTask() {
    return this.pending?.task || null;
  }

  // The player and state args that were passed to wait() when this waiter
  // went pending. Read by HybridClient.demoteToAi when a human disconnects
  // mid-turn — we need their player object and the current game state to
  // synthesize an AI response on their behalf.
  pendingPlayer() {
    return this.pending?.player || null;
  }

  pendingState() {
    return this.pending?.state || null;
  }

  // Builds the payload for the human_input_needed event. Includes
  // everything the UI needs to render the right input widget AND show
  // the human the appropriate context for their decision.
  _buildPayload(player, state, task) {
    const livingNames = state.livingNames();
    const livingOthers = livingNames.filter(n => n !== player.name);

    const payload = {
      speaker: player.name,
      role: player.role.name,
      task,
      day: state.day,
      phase: state.phase,
      livingPlayers: livingNames,
    };

    switch (task) {
      case "speak": {
        // Town square is rendered in the main transcript already.
        // No extra context payload needed.
        payload.validTargets = null;
        break;
      }

      case "vote": {
        payload.validTargets = livingOthers;
        break;
      }

      case "wolf_propose":
      case "wolf_consensus": {
        // Targets are living non-wolf players.
        payload.validTargets = livingOthers.filter(
          n => state.getPlayer(n).team !== "wolves"
        );
        // Wolves chat history (recent) so the human can see what their
        // fellow wolf has been saying.
        payload.privateContext = {
          wolvesChat: state.getChannel(Channel.WOLVES_CHAT, { recentDays: 2 }).map(e => ({
            speaker: e.speaker,
            text: e.text,
            day: e.day,
          })),
        };
        break;
      }

      case "investigate": {
        payload.validTargets = livingOthers;
        // Seer's investigation history.
        payload.privateContext = {
          notebook: state.getChannel(Channel.SEER_NOTEBOOK).map(e => e.text),
        };
        break;
      }

      case "protect": {
        // Cannot protect last_protected.
        payload.validTargets = livingNames.filter(n => n !== state.lastProtected);
        payload.privateContext = {
          lastProtected: state.lastProtected,
        };
        break;
      }

      default:
        throw new Error(`HumanWaiter: unknown task "${task}"`);
    }

    return payload;
  }
}

module.exports = { HumanWaiter };
