// ═══════════════════════════════════════════════════════════════════════════
// orchestrator.js — The main game loop for Moonlight.
//
// Drives a GameState through alternating night/day phases by asking each
// agent (via a Claude client) for actions, validating them, applying them,
// and writing everything to a transcript.
//
// Designed to work with the FakeClaudeClient OR a future RealClaudeClient.
// The client interface is:
//
//     client.call(player, state, task) -> object
//
// Where the object has structured fields like {target, reasoning} or
// {speech, privateReasoning, claimRole}.
//
// runGame() is sync. When the real Claude client arrives, callers will
// want a streaming variant — runGameStream(), generator-based — that
// yields each transcript event as it happens. That refactor is small and
// deferred to the SSE work in the next pass.
// ═══════════════════════════════════════════════════════════════════════════

const { Phase, GameState } = require("./game_state");
const { Channel, NightAction, Team } = require("./roles");

// ─── Transcript ────────────────────────────────────────────────────────────

class Transcript {
  constructor() {
    this.events = [];
  }

  add(kind, state, data = {}) {
    this.events.push({
      kind,
      day: state.day,
      phase: state.phase,
      data,
    });
  }
}

// ─── Default config ────────────────────────────────────────────────────────

const DEFAULT_CONFIG = Object.freeze({
  discussionRounds: 2,
  tiebreak: "no_elimination", // "no_elimination" | "random" | "runoff"
  maxDays: 10,
  wolfNegotiation: "chat",    // "chat" | "majority_vote"
});

// ─── Public entry point ────────────────────────────────────────────────────

function runGame(state, client, configOverride = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverride };
  const transcript = new Transcript();

  transcript.add("game_start", state, {
    playerCount: state.players.length,
    roles: Object.fromEntries(state.players.map(p => [p.name, p.role.name])),
  });

  while (!state.isOver()) {
    if (state.day >= config.maxDays) {
      transcript.add("max_days_hit", state);
      break;
    }

    // ─── NIGHT ──────────────────────────────────────────────────────────
    state.advanceToNight();
    transcript.add("night_begins", state);

    const wolvesTarget = _runWolfPhase(state, client, transcript, config);
    const bodyguardTarget = _runRolePhase(
      state, client, transcript, NightAction.PROTECT, "protect"
    );
    const seerTarget = _runRolePhase(
      state, client, transcript, NightAction.INVESTIGATE, "investigate"
    );

    const result = state.resolveNight({ wolvesTarget, bodyguardTarget, seerTarget });
    _recordNightResolution(state, transcript, result);

    // Hand the seer their result via their notebook.
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

    // ─── DAY ────────────────────────────────────────────────────────────
    state.advanceToDay();
    _announceDay(state, transcript, result);

    for (let r = 0; r < config.discussionRounds; r++) {
      transcript.add("discussion_round", state, { round: r + 1 });
      for (const player of state.livingPlayers()) {
        _doSpeech(player, state, client, transcript);
      }
    }

    const votes = _collectVotes(state, client, transcript);
    const voteResult = state.resolveVote(votes, { tiebreak: config.tiebreak });
    _recordVoteResolution(state, transcript, voteResult);
  }

  transcript.add("game_over", state, {
    winner: state.winner,
    finalDay: state.day,
    survivors: state.livingPlayers().map(p => p.name),
  });

  return { transcript, winner: state.winner };
}

// ─── Night phase helpers ───────────────────────────────────────────────────

function _runWolfPhase(state, client, transcript, config) {
  const wolves = state.livingWithAction(NightAction.KILL);
  if (wolves.length === 0) return null;

  if (config.wolfNegotiation === "majority_vote") {
    const proposals = [];
    for (const wolf of wolves) {
      const response = client.call(wolf, state, "wolf_propose");
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
    transcript.add("wolves_decided", state, { target, method: "majority" });
    return target;
  }

  // "chat" mode: each wolf proposes, then each consensuses.
  for (const wolf of wolves) {
    const response = client.call(wolf, state, "wolf_propose");
    const target = _validateTarget(response.target, state);
    state.appendToChannel(
      Channel.WOLVES_CHAT,
      wolf.name,
      `PROPOSE: ${target}. ${response.reasoning || ""}`,
    );
  }

  let finalTarget = null;
  for (const wolf of wolves) {
    const response = client.call(wolf, state, "wolf_consensus");
    const target = _validateTarget(response.target, state);
    state.appendToChannel(
      Channel.WOLVES_CHAT,
      wolf.name,
      `AGREE: ${target}. ${response.reasoning || ""}`,
    );
    finalTarget = target;
  }

  transcript.add("wolves_decided", state, { target: finalTarget, method: "chat" });
  return finalTarget;
}

function _runRolePhase(state, client, transcript, action, task) {
  const actors = state.livingWithAction(action);
  if (actors.length === 0) return null;

  // For now one actor per role; if we add multiple seers later, this
  // is where aggregation happens.
  const actor = actors[0];
  const response = client.call(actor, state, task);
  let target = _validateTarget(response.target, state);

  // Bodyguard rule fallback — recover, don't crash.
  if (action === NightAction.PROTECT && target === state.lastProtected) {
    const candidates = state.livingPlayers()
      .filter(p => p.name !== target)
      .map(p => p.name);
    if (candidates.length > 0) {
      const fallback = candidates[0];
      transcript.add("validator_correction", state, {
        actor: actor.name,
        reason: "bodyguard_repeat_protect",
        original: target,
        fallback,
      });
      target = fallback;
    }
  }

  transcript.add("night_action", state, {
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
  let player;
  try {
    player = state.getPlayer(target);
  } catch {
    throw new Error(`Target ${JSON.stringify(target)} is not a player in this game`);
  }
  if (!player.alive) {
    throw new Error(`Target ${JSON.stringify(target)} is dead — cannot be selected`);
  }
  return target;
}

// ─── Day phase helpers ─────────────────────────────────────────────────────

function _announceDay(state, transcript, nightResult) {
  if (nightResult.killed) {
    const victim = nightResult.killed;
    const role = state.getPlayer(victim).role.name;
    const msg = `Day ${state.day} dawns. ${victim} was found dead. They were a ${role}.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    transcript.add("death", state, {
      victim,
      cause: "wolves",
      roleRevealed: role,
    });
  } else {
    const msg = `Day ${state.day} dawns. Nobody died last night.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    transcript.add("no_death", state);
  }
}

function _doSpeech(player, state, client, transcript) {
  const response = client.call(player, state, "speak");
  const speech = response.speech || "";
  const claim = response.claimRole;

  state.appendToChannel(Channel.TOWN_SQUARE, player.name, speech);

  if (claim !== null && claim !== undefined) {
    player.claimedRole = claim;
    transcript.add("role_claim", state, {
      speaker: player.name,
      claimed: claim,
      actual: player.role.name,
    });
  }

  transcript.add("speech", state, {
    speaker: player.name,
    text: speech,
    privateReasoning: response.privateReasoning || "",
  });
}

function _collectVotes(state, client, transcript) {
  const rawVotes = {};
  for (const player of state.livingPlayers()) {
    const response = client.call(player, state, "vote");
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
    transcript.add("vote_cast", state, { voter, target });
  }
  return rawVotes;
}

// ─── Resolution recorders ──────────────────────────────────────────────────

function _recordNightResolution(state, transcript, result) {
  transcript.add("night_resolution", state, {
    wolvesTarget: result.wolvesTarget,
    bodyguardTarget: result.bodyguardTarget,
    seerTarget: result.seerTarget,
    seerResult: result.seerResult,
    killed: result.killed,
    protected: result.protected,
  });
}

function _recordVoteResolution(state, transcript, result) {
  transcript.add("vote_resolution", state, {
    tally: result.tally,
    eliminated: result.eliminated,
    tied: result.tied,
  });
  if (result.eliminated) {
    const role = state.getPlayer(result.eliminated).role.name;
    const msg = `The town has voted. ${result.eliminated} is eliminated. They were a ${role}.`;
    state.appendToChannel(Channel.TOWN_SQUARE, "narrator", msg);
    transcript.add("death", state, {
      victim: result.eliminated,
      cause: "vote",
      roleRevealed: role,
    });
  }
}

module.exports = { runGame, Transcript, DEFAULT_CONFIG };
