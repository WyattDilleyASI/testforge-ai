// ═══════════════════════════════════════════════════════════════════════════
// game_state.js — The single source of truth for a Moonlight game.
//
// Ported from /python-source/game_state.py. Same architecture:
//
// - All mutation goes through methods on GameState, not direct field writes.
// - Channels are append-only logs of (speaker, text, day, phase) entries.
// - Resolution functions (resolveNight, resolveVote) return structured
//   results AND mutate state. The orchestrator uses the return value for
//   the transcript.
//
// JS-specific notes
// -----------------
// - Replaced Python's random.Random with a seeded mulberry32 PRNG so games
//   are reproducible. See SeededRng class below.
// - "Frozen" Role from roles.js is treated as immutable; the Player wrapper
//   is mutable.
// ═══════════════════════════════════════════════════════════════════════════

const {
  Channel,
  NightAction,
  Team,
  defaultDistribution,
  getRole,
  validateRoleDistribution,
} = require("./roles");

// ─── Phase ─────────────────────────────────────────────────────────────────

const Phase = Object.freeze({
  SETUP: "setup",
  NIGHT: "night",
  DAY: "day",
  GAME_OVER: "game_over",
});

// ─── Seeded RNG ────────────────────────────────────────────────────────────
//
// JS's Math.random isn't seedable. mulberry32 is a tiny 32-bit PRNG that's
// good enough for game randomness (not crypto, not statistics). Same seed
// produces same sequence — reproducible games for free.

class SeededRng {
  constructor(seed) {
    this.state = (seed | 0) || 1; // Coerce to 32-bit int, never 0
  }

  // Returns a float in [0, 1)
  random() {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Pick a random element from an array.
  choice(arr) {
    if (arr.length === 0) {
      throw new Error("choice() called on empty array");
    }
    return arr[Math.floor(this.random() * arr.length)];
  }

  // Fisher-Yates shuffle, in place. Returns the array for chaining.
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ─── Player ────────────────────────────────────────────────────────────────

class Player {
  constructor({
    name,
    role,
    isHuman = false,
    personality = null,
    alive = true,
    deathDay = null,
    deathCause = null,
    claimedRole = null,
  }) {
    this.name = name;
    this.role = role;            // frozen Role from roles.js
    this.isHuman = isHuman;
    this.personality = personality;
    this.alive = alive;
    this.deathDay = deathDay;
    this.deathCause = deathCause;
    this.claimedRole = claimedRole;
  }

  get team() {
    return this.role.team;
  }

  // Useful for debugging; never shown to agents.
  toString() {
    const status = this.alive ? "alive" : `dead d${this.deathDay}`;
    return `Player(${this.name}, ${this.role.name}, ${status})`;
  }
}

// ─── Channel entry ─────────────────────────────────────────────────────────

class ChannelEntry {
  constructor({ speaker, text, day, phase }) {
    this.speaker = speaker;
    this.text = text;
    this.day = day;
    this.phase = phase;
    Object.freeze(this); // Once said, stays said.
  }
}

// ─── Resolution result types ───────────────────────────────────────────────
//
// Plain objects rather than classes — they're DTOs, not behaviors.

function makeNightResolution({
  wolvesTarget,
  bodyguardTarget,
  seerTarget,
  seerResult,
  killed,
  protected_, // 'protected' is a reserved word in strict mode
}) {
  return Object.freeze({
    wolvesTarget,
    bodyguardTarget,
    seerTarget,
    seerResult,
    killed,
    protected: protected_,
  });
}

function makeVoteResolution({ tally, eliminated, tied }) {
  return Object.freeze({ tally, eliminated, tied });
}

// ─── GameState ─────────────────────────────────────────────────────────────

class GameState {
  constructor({ players }) {
    this.players = players;
    this.phase = Phase.SETUP;
    this.day = 0;
    this.channels = {
      [Channel.TOWN_SQUARE]: [],
      [Channel.WOLVES_CHAT]: [],
      [Channel.SEER_NOTEBOOK]: [],
    };
    this.lastProtected = null;
    this.winner = null;
  }

  // ── Construction ──────────────────────────────────────────────────────────

  static fromConfig({
    playerNames,
    roleCounts = null,
    humanSeat = null,
    personalities = null,
    rng = null,
  }) {
    const _rng = rng || new SeededRng(Date.now());

    const _roleCounts = roleCounts || defaultDistribution(playerNames.length);
    validateRoleDistribution(_roleCounts);

    const totalRoles = Object.values(_roleCounts).reduce((a, b) => a + b, 0);
    if (totalRoles !== playerNames.length) {
      throw new Error(
        `Role count total (${totalRoles}) does not match player count (${playerNames.length}).`
      );
    }

    if (humanSeat !== null && !playerNames.includes(humanSeat)) {
      throw new Error(
        `humanSeat=${JSON.stringify(humanSeat)} not in playerNames=${JSON.stringify(playerNames)}`
      );
    }

    // Build the role pool, shuffle, and assign in order.
    const rolePool = [];
    for (const [roleName, count] of Object.entries(_roleCounts)) {
      const role = getRole(roleName);
      for (let i = 0; i < count; i++) rolePool.push(role);
    }
    _rng.shuffle(rolePool);

    const _personalities = personalities || {};
    const players = playerNames.map((name, i) => new Player({
      name,
      role: rolePool[i],
      isHuman: name === humanSeat,
      personality: _personalities[name] || null,
    }));

    return new GameState({ players });
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getPlayer(name) {
    const p = this.players.find(p => p.name === name);
    if (!p) {
      throw new Error(`No player named ${JSON.stringify(name)}`);
    }
    return p;
  }

  // Take an options object so callers can pass { team } or {} interchangeably.
  livingPlayers({ team = null } = {}) {
    let result = this.players.filter(p => p.alive);
    if (team !== null) result = result.filter(p => p.team === team);
    return result;
  }

  livingNames() {
    return this.players.filter(p => p.alive).map(p => p.name);
  }

  livingCount({ team = null } = {}) {
    return this.livingPlayers({ team }).length;
  }

  playersWithRole(roleName) {
    return this.players.filter(p => p.role.name === roleName);
  }

  livingWithAction(action) {
    return this.players.filter(p => p.alive && p.role.nightAction === action);
  }

  // ── Channel access ────────────────────────────────────────────────────────

  appendToChannel(channel, speaker, text) {
    this.channels[channel].push(new ChannelEntry({
      speaker,
      text,
      day: this.day,
      phase: this.phase,
    }));
  }

  getChannel(channel, { recentDays = null } = {}) {
    const entries = this.channels[channel];
    if (recentDays === null) return [...entries];
    const cutoff = this.day - recentDays;
    return entries.filter(e => e.day > cutoff);
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  advanceToNight() {
    if (this.phase !== Phase.SETUP && this.phase !== Phase.DAY) {
      throw new Error(`Cannot advance to night from phase ${this.phase}`);
    }
    this.phase = Phase.NIGHT;
  }

  advanceToDay() {
    if (this.phase !== Phase.NIGHT) {
      throw new Error(`Cannot advance to day from phase ${this.phase}`);
    }
    this.phase = Phase.DAY;
    this.day += 1;
  }

  // ── Night resolution ──────────────────────────────────────────────────────

  resolveNight({ wolvesTarget, bodyguardTarget, seerTarget }) {
    if (this.phase !== Phase.NIGHT) {
      throw new Error("resolveNight called outside NIGHT phase");
    }

    // Validate each target exists and is alive (defensive belt-and-suspenders).
    for (const [name, label] of [
      [wolvesTarget, "wolvesTarget"],
      [bodyguardTarget, "bodyguardTarget"],
      [seerTarget, "seerTarget"],
    ]) {
      if (name !== null && name !== undefined) {
        const player = this.getPlayer(name);
        if (!player.alive) {
          throw new Error(
            `${label}=${JSON.stringify(name)} is not alive — orchestrator ` +
            `should have caught this before resolution.`
          );
        }
      }
    }

    // Bodyguard rule: can't protect same player two nights in a row.
    if (
      bodyguardTarget !== null && bodyguardTarget !== undefined
      && this.lastProtected !== null
      && bodyguardTarget === this.lastProtected
    ) {
      throw new Error(
        `Bodyguard cannot protect ${JSON.stringify(bodyguardTarget)} two nights ` +
        `in a row. Validator should have caught this.`
      );
    }

    // Resolve the kill.
    const isProtected = (
      wolvesTarget !== null && wolvesTarget !== undefined
      && bodyguardTarget !== null && bodyguardTarget !== undefined
      && wolvesTarget === bodyguardTarget
    );
    let killed = null;
    if (wolvesTarget !== null && wolvesTarget !== undefined && !isProtected) {
      const victim = this.getPlayer(wolvesTarget);
      victim.alive = false;
      victim.deathDay = this.day;
      victim.deathCause = "wolves";
      killed = wolvesTarget;
    }

    // Seer reads team off ground truth — orchestrator looks up the role,
    // the agent never gets to "answer" about themselves.
    let seerResult = null;
    if (seerTarget !== null && seerTarget !== undefined) {
      // If seer was killed this same night, no result.
      const aliveSeers = this.livingWithAction(NightAction.INVESTIGATE);
      if (aliveSeers.length > 0) {
        seerResult = this.getPlayer(seerTarget).team;
      }
    }

    this.lastProtected = bodyguardTarget ?? null;

    return makeNightResolution({
      wolvesTarget: wolvesTarget ?? null,
      bodyguardTarget: bodyguardTarget ?? null,
      seerTarget: seerTarget ?? null,
      seerResult,
      killed,
      protected_: isProtected,
    });
  }

  // ── Vote resolution ───────────────────────────────────────────────────────

  resolveVote(votes, { tiebreak = "no_elimination", rng = null } = {}) {
    if (this.phase !== Phase.DAY) {
      throw new Error("resolveVote called outside DAY phase");
    }

    // Validate every voter and target.
    for (const [voter, target] of Object.entries(votes)) {
      const voterP = this.getPlayer(voter);
      const targetP = this.getPlayer(target);
      if (!voterP.alive) throw new Error(`Dead voter ${JSON.stringify(voter)} cannot vote.`);
      if (!targetP.alive) throw new Error(`Cannot vote for dead player ${JSON.stringify(target)}.`);
    }

    // Tally.
    const tally = {};
    for (const target of Object.values(votes)) {
      tally[target] = (tally[target] || 0) + 1;
    }

    if (Object.keys(tally).length === 0) {
      return makeVoteResolution({ tally: {}, eliminated: null, tied: false });
    }

    const maxVotes = Math.max(...Object.values(tally));
    const leaders = Object.entries(tally)
      .filter(([, c]) => c === maxVotes)
      .map(([name]) => name);

    let eliminated = null;
    const tied = leaders.length > 1;

    if (tied) {
      if (tiebreak === "no_elimination") {
        // eliminated stays null
      } else if (tiebreak === "random") {
        if (!rng) throw new Error("tiebreak=random requires an rng");
        eliminated = rng.choice(leaders);
      } else if (tiebreak === "runoff") {
        // caller handles re-vote; we just report
      } else {
        throw new Error(`Unknown tiebreak rule: ${JSON.stringify(tiebreak)}`);
      }
    } else {
      eliminated = leaders[0];
    }

    if (eliminated !== null) {
      const victim = this.getPlayer(eliminated);
      victim.alive = false;
      victim.deathDay = this.day;
      victim.deathCause = "vote";
    }

    return makeVoteResolution({
      tally,
      eliminated,
      tied: tied && eliminated === null,
    });
  }

  // ── Win check ─────────────────────────────────────────────────────────────

  isOver() {
    if (this.phase === Phase.GAME_OVER) return true;

    // Check both teams. If both fire (last villager and last wolf killed
    // simultaneously), wolves win — they reach parity at the moment of the kill.
    for (const team of [Team.WOLVES, Team.VILLAGE]) {
      const player = this.players.find(p => p.team === team);
      if (player && player.role.winCondition(this)) {
        this.winner = team;
        this.phase = Phase.GAME_OVER;
        return true;
      }
    }

    return false;
  }
}

module.exports = {
  Phase,
  Player,
  ChannelEntry,
  GameState,
  SeededRng,
  makeNightResolution,
  makeVoteResolution,
};
