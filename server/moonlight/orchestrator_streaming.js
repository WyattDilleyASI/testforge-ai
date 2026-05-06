// ═══════════════════════════════════════════════════════════════════════════
// orchestrator_streaming.js — Event-emitting variant of runGame.
//
// Same game logic as orchestrator.js, but:
//   - Async (the client is async)
//   - Emits each transcript event via an onEvent callback as it happens
//   - Awaits each Claude call so latency is visible to the SSE consumer
//
// The fake-client orchestrator (orchestrator.js) is kept untouched for
// fast batch testing. This file is for real-Claude games served over SSE.
//
// Field-name adapter
// ------------------
// The fake client returned camelCase fields (privateReasoning, claimRole).
// The real-Claude tool schemas use snake_case (private_reasoning, claim_role)
// because LLMs handle snake_case more reliably. _normalize() bridges the gap
// so the orchestrator code reads cleanly with one field naming convention.
// ═══════════════════════════════════════════════════════════════════════════

const { Phase } = require("./game_state");
const { Channel, NightAction, Team } = require("./roles");

// ─── Default config ──────────────────────────────────────────────────────

const DEFAULT_CONFIG = Object.freeze({
  discussionRounds: 2,
  tiebreak: "no_elimination",
  maxDays: 10,
  wolfNegotiation: "chat",
});

// ─── Field name adapter ──────────────────────────────────────────────────
//
// Real Claude returns: { speech, private_reasoning, claim_role }
// Fake Claude returns: { speech, privateReasoning, claimRole }
// Orchestrator reads:  speech / privateReasoning / claimRole / target / vote / reasoning
//
// This wrapper accepts either, returns canonical camelCase.

function _normalize(response) {
  if (!response || typeof response !== "object") return {};
  return {
    target: response.target,
    vote: response.vote,
    speech: response.speech,
    reasoning: response.reasoning,
    privateReasoning: response.private_reasoning ?? response.privateReasoning,
    claimRole: response.claim_role ?? response.claimRole,
  };
}

// ─── Public entry point ──────────────────────────────────────────────────

async function runGameStreaming(state, client, configOverride = {}, onEvent = () => {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverride };
  const events = [];

  function emit(kind, data = {}) {
    const ev = {
      kind,
      day: state.day,
      phase: state.phase,
      data,
    };
    events.push(ev);
    try {
      onEvent(ev);
    } catch (err) {
      // Don't let a buggy listener crash the game.
      console.error("[streaming] onEvent listener threw:", err.message);
    }
  }

  emit("game_start", {
    playerCount: state.players.length,
    roles: Object.fromEntries(state.players.map(p => [p.name, p.role.name])),
  });

  while (!state.isOver()) {
    if (state.day >= config.maxDays) {
      emit("max_days_hit");
      break;
    }

    // ─── NIGHT ────────────────────────────────────────────────────────
    state.advanceToNight();
    emit("night_begins");

    const wolvesTarget = await _runWolfPhase(state, client, emit, config);
    const bodyguardTarget = await _runRolePhase(
      state, client, emit, NightAction.PROTECT, "protect"
    );
    const seerTarget = await _runRolePhase(
      state, client, emit, NightAction.INVESTIGATE, "investigate"
    );

    const result = state.resolveNight({ wolvesTarget, bodyguardTarget, seerTarget });
    _emitNightResolution(emit, result);

    if (seerTarget !== null && result.seerResult !== null) {
      const seers = state.livingWithAction(NightAction.INVESTIGATE);
      for (const _seer of seers) {
        state.appendToChannel(
          Channel.SEER_NOTEBOOK,
          "narrator",
          `Night ${state.day}: ${seerTarget} is ${result.seerResult.toUpperCase()}.`,
        );
      }
    }

    if (state.isOver()) break;

    // ─── DAY ──────────────────────────────────────────────────────────
    state.advanceToDay();
    _announceDay(state, emit, result);

    for (let r = 0; r < config.discussionRounds; r++) {
      emit("discussion_round", { round: r + 1 });
      for (const player of state.livingPlayers()) {
        await _doSpeech(player, state, client, emit);
      }
    }

    const votes = await _collectVotes(state, client, emit);
    const voteResult = state.resolveVote(votes, { tiebreak: config.tiebreak });
    _emitVoteResolution(state, emit, voteResult);
  }

  emit("game_over", {
    winner: state.winner,
    finalDay: state.day,
    survivors: state.livingPlayers().map(p => p.name),
  });

  return { events, winner: state.winner };
}

// ─── Phase helpers ────────────────────────────────────────────────────────

async function _runWolfPhase(state, client, emit, config) {
  const wolves = state.livingWithAction(NightAction.KILL);
  if (wolves.length === 0) return null;

  if (config.wolfNegotiation === "majority_vote") {
    const proposals = [];
    for (const wolf of wolves) {
      const response = _normalize(await client.call(wolf, state, "wolf_propose"));
      const target = _validateTarget(response.target, state);
      proposals.push(target);
      state.appendToChannel(
        Channel.WOLVES_CHAT,
        wolf.name,
        `PROPOSE: ${target}. ${response.reasoning || ""}`,
      );
    }
    const counts = {};
    for (const p of proposals) counts[p] = (counts[p] || 0) + 1;
    const target = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    emit("wolves_decided", { target, method: "majority" });
    return target;
  }

  // "chat" mode — propose then consensus.
  for (const wolf of wolves) {
    const response = _normalize(await client.call(wolf, state, "wolf_propose"));
    const target = _validateTarget(response.target, state);
    state.appendToChannel(
      Channel.WOLVES_CHAT,
      wolf.name,
      `PROPOSE: ${target}. ${response.reasoning || ""}`,
    );
  }

  let finalTarget = null;
  for (const wolf of wolves) {
    const response = _normalize(await client.call(wolf, state, "wolf_consensus"));
    const target = _validateTarget(response.target, state);
    state.appendToChannel(
      Channel.WOLVES_CHAT,
      wolf.name,
      `AGREE: ${target}. ${response.reasoning || ""}`,
    );
    finalTarget = target;
  }

  emit("wolves_decided", { target: finalTarget, method: "chat" });
  return finalTarget;
}

async function _runRolePhase(state, client, emit, action, task) {
  const actors = state.livingWithAction(action);
  if (actors.length === 0) return null;

  const actor = actors[0];
  const response = _normalize(await client.call(actor, state, task));
  let target = _validateTarget(response.target, state);

  if (action === NightAction.PROTECT && target === state.lastProtected) {
    const candidates = state.livingPlayers()
      .filter(p => p.name !== target)
      .map(p => p.name);
    if (candidates.length > 0) {
      const fallback = candidates[0];
      emit("validator_correction", {
        actor: actor.name,
        reason: "bodyguard_repeat_protect",
        original: target,
        fallback,
      });
      target = fallback;
    }
  }

  emit("night_action", {
    actor: actor.name,
    role: actor.role.name,
    target,
    reasoning: response.reasoning || "",
  });
  return target;
}

function _validateTarget(target, state) {
  if (target === null || target === undefined) return null;
  if (typeof target !== "string") {
    throw new Error(`Target must be a string, got ${typeof target}`);
  }
  // Try exact match first.
  let player;
  try {
    player = state.getPlayer(target);
  } catch {
    // Loose match: case-insensitive, trim whitespace. LLMs sometimes
    // produce "alice" or " Alice ".
    const normalized = target.trim().toLowerCase();
    player = state.players.find(p => p.name.toLowerCase() === normalized);
    if (!player) {
      throw new Error(`Target ${JSON.stringify(target)} is not a player in this game`);
    }
  }
  if (!player.alive) {
    throw new Error(`Target ${JSON.stringify(target)} is dead — cannot be selected`);
  }
  return player.name;  // canonical capitalization
}

// ─── Day phase helpers ────────────────────────────────────────────────────

function _announceDay(state, emit, nightResult) {
  if (nightResult.killed) {
    const victim = nightResult.killed;
    const role = state.getPlayer(victim).role.name;
    const msg = `Day ${state.day} dawns. ${victim} was found dead. They were a ${role}.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    emit("death", { victim, cause: "wolves", roleRevealed: role });
  } else {
    const msg = `Day ${state.day} dawns. Nobody died last night.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    emit("no_death");
  }
}

async function _doSpeech(player, state, client, emit) {
  const response = _normalize(await client.call(player, state, "speak"));
  const speech = response.speech || "";
  const claim = response.claimRole;

  state.appendToChannel(Channel.TOWN_SQUARE, player.name, speech);

  if (claim !== null && claim !== undefined) {
    player.claimedRole = claim;
    emit("role_claim", {
      speaker: player.name,
      claimed: claim,
      actual: player.role.name,
    });
  }

  emit("speech", {
    speaker: player.name,
    text: speech,
    privateReasoning: response.privateReasoning || "",
  });
}

async function _collectVotes(state, client, emit) {
  const rawVotes = {};
  for (const player of state.livingPlayers()) {
    const response = _normalize(await client.call(player, state, "vote"));
    let target = _validateTarget(response.vote, state);
    if (target === null || target === player.name) {
      const others = state.livingPlayers()
        .filter(p => p.name !== player.name)
        .map(p => p.name);
      if (others.length > 0) target = others[0];
    }
    rawVotes[player.name] = target;
  }
  for (const [voter, target] of Object.entries(rawVotes)) {
    emit("vote_cast", { voter, target });
  }
  return rawVotes;
}

// ─── Resolution emitters ──────────────────────────────────────────────────

function _emitNightResolution(emit, result) {
  emit("night_resolution", {
    wolvesTarget: result.wolvesTarget,
    bodyguardTarget: result.bodyguardTarget,
    seerTarget: result.seerTarget,
    seerResult: result.seerResult,
    killed: result.killed,
    protected: result.protected,
  });
}

function _emitVoteResolution(state, emit, result) {
  emit("vote_resolution", {
    tally: result.tally,
    eliminated: result.eliminated,
    tied: result.tied,
  });
  if (result.eliminated) {
    const role = state.getPlayer(result.eliminated).role.name;
    const msg = `The town has voted. ${result.eliminated} is eliminated. They were a ${role}.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    emit("death", {
      victim: result.eliminated,
      cause: "vote",
      roleRevealed: role,
    });
  }
}

module.exports = { runGameStreaming };
