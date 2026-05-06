// ═══════════════════════════════════════════════════════════════════════════
// roles.js — Role definitions for Moonlight (Werewolf with Claude agents).
//
// Ported from the Python reference at /python-source/roles.py — structure
// preserved deliberately so cross-referencing during debugging stays easy.
//
// Each role knows three things about itself:
//   1. Its team (villagers vs. wolves) — determines win condition.
//   2. Which channels it can read — enforced by the prompt builder, NOT by trust.
//   3. What night action it takes, if any.
//
// Design rules
// ------------
// - Roles are immutable value objects (frozen). A Player has a Role; the
//   Role itself never mutates.
// - Channel access lives here, not in the orchestrator, because it's a
//   property of the role itself. The prompt builder asks the role what
//   it can see.
// - Adding a new role (Witch, Hunter, Jester) means adding one entry to
//   ROLES below. Nothing else needs to change.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Teams ──────────────────────────────────────────────────────────────────

const Team = Object.freeze({
  VILLAGE: "village",
  WOLVES: "wolves",
});

// ─── Channels ──────────────────────────────────────────────────────────────

const Channel = Object.freeze({
  TOWN_SQUARE: "town_square",     // Public. Everyone reads.
  WOLVES_CHAT: "wolves_chat",     // Wolves only. Night coordination.
  SEER_NOTEBOOK: "seer_notebook", // Seer only. Investigation history.
});

// ─── Night actions ─────────────────────────────────────────────────────────

const NightAction = Object.freeze({
  NONE: "none",                   // Villagers just sleep.
  KILL: "kill",                   // Wolves pick a target collectively.
  INVESTIGATE: "investigate",     // Seer learns one player's team.
  PROTECT: "protect",             // Bodyguard blocks one kill that night.
});

// ─── Win conditions ────────────────────────────────────────────────────────
//
// Kept as named functions (not arrow inlines) so they show up in stack
// traces and so the role objects stay JSON-serializable if we strip them.

function villagersWin(state) {
  return state.livingCount({ team: Team.WOLVES }) === 0;
}

function wolvesWin(state) {
  const wolves = state.livingCount({ team: Team.WOLVES });
  const villagers = state.livingCount({ team: Team.VILLAGE });
  return wolves > 0 && wolves >= villagers;
}

// ─── Role catalog ──────────────────────────────────────────────────────────

const ROLES = Object.freeze({
  villager: Object.freeze({
    name: "villager",
    team: Team.VILLAGE,
    nightAction: NightAction.NONE,
    channels: Object.freeze([Channel.TOWN_SQUARE]),
    description:
      "You have no special abilities. Your only tool is your voice. " +
      "Read the room, share suspicions, vote carefully.",
    winCondition: villagersWin,
  }),
  werewolf: Object.freeze({
    name: "werewolf",
    team: Team.WOLVES,
    nightAction: NightAction.KILL,
    channels: Object.freeze([Channel.TOWN_SQUARE, Channel.WOLVES_CHAT]),
    description:
      "Each night, you and your fellow wolves agree on one player to " +
      "eliminate. By day you must blend in — accuse, deflect, defend. " +
      "If discovered, the village will vote you out.",
    winCondition: wolvesWin,
  }),
  seer: Object.freeze({
    name: "seer",
    team: Team.VILLAGE,
    nightAction: NightAction.INVESTIGATE,
    channels: Object.freeze([Channel.TOWN_SQUARE, Channel.SEER_NOTEBOOK]),
    description:
      "Each night, you secretly investigate one player and learn whether " +
      "they are a villager or a wolf. Reveal too early and the wolves " +
      "will target you next; reveal too late and they'll have won.",
    winCondition: villagersWin,
  }),
  bodyguard: Object.freeze({
    name: "bodyguard",
    team: Team.VILLAGE,
    nightAction: NightAction.PROTECT,
    channels: Object.freeze([Channel.TOWN_SQUARE]),
    description:
      "Each night, you secretly choose one player to protect. If the " +
      "wolves attack that player, the kill fails. You may protect " +
      "yourself, but not the same player two nights in a row.",
    winCondition: villagersWin,
  }),
});

// Channel access check — the SINGLE source of truth for who-sees-what.
function canRead(role, channel) {
  return role.channels.includes(channel);
}

// ─── Night phase ordering ──────────────────────────────────────────────────
//
// Order matters: bodyguard's protection is decided BEFORE the kill resolves,
// and the seer investigates LAST so their result reflects the latest state.

const NIGHT_ORDER = Object.freeze([
  NightAction.KILL,         // Wolves negotiate and pick a target.
  NightAction.PROTECT,      // Bodyguard picks who to shield.
  NightAction.INVESTIGATE,  // Seer investigates last — gets fresh info.
]);

// ─── Default role distributions ────────────────────────────────────────────

const DEFAULT_ROLE_COUNTS = Object.freeze({
  7: { werewolf: 2, seer: 1, bodyguard: 1, villager: 3 },
  8: { werewolf: 2, seer: 1, bodyguard: 1, villager: 4 },
  9: { werewolf: 2, seer: 1, bodyguard: 1, villager: 5 },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function getRole(name) {
  if (!(name in ROLES)) {
    throw new Error(
      `Unknown role: ${JSON.stringify(name)}. ` +
      `Known roles: ${Object.keys(ROLES).sort().join(", ")}`
    );
  }
  return ROLES[name];
}

function validateRoleDistribution(counts) {
  for (const [roleName, count] of Object.entries(counts)) {
    if (!(roleName in ROLES)) {
      throw new Error(`Unknown role in distribution: ${JSON.stringify(roleName)}`);
    }
    if (count < 0) {
      throw new Error(`Negative count for ${roleName}: ${count}`);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 7 || total > 9) {
    throw new Error(
      `Player count must be 7-9, got ${total}. ` +
      `Distribution: ${JSON.stringify(counts)}`
    );
  }

  const wolves = Object.entries(counts)
    .filter(([r]) => ROLES[r].team === Team.WOLVES)
    .reduce((sum, [, c]) => sum + c, 0);
  const villagers = total - wolves;

  if (wolves === 0) {
    throw new Error("Distribution has no wolves — game ends instantly.");
  }
  if (villagers === 0) {
    throw new Error("Distribution has no villagers — wolves auto-win.");
  }
  if (wolves >= villagers) {
    throw new Error(
      `Wolves (${wolves}) >= villagers (${villagers}) at start. ` +
      `Wolves would win on day 0. Reduce wolf count.`
    );
  }
}

function defaultDistribution(playerCount) {
  if (!(playerCount in DEFAULT_ROLE_COUNTS)) {
    throw new Error(
      `No default distribution for ${playerCount} players. ` +
      `Supported: ${Object.keys(DEFAULT_ROLE_COUNTS).sort().join(", ")}`
    );
  }
  return { ...DEFAULT_ROLE_COUNTS[playerCount] };
}

module.exports = {
  Team,
  Channel,
  NightAction,
  ROLES,
  NIGHT_ORDER,
  DEFAULT_ROLE_COUNTS,
  canRead,
  getRole,
  validateRoleDistribution,
  defaultDistribution,
};
