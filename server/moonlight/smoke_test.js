// ═══════════════════════════════════════════════════════════════════════════
// smoke_test.js — Exercises roles.js + game_state.js end to end, no API calls.
// Ported from /python-source/smoke_test.py. Same checks, same order.
// ═══════════════════════════════════════════════════════════════════════════

const {
  Channel,
  ROLES,
  Team,
  canRead,
  defaultDistribution,
  getRole,
  validateRoleDistribution,
} = require("./roles");

const { GameState, Phase, SeededRng } = require("./game_state");

function deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEq(v, b[i]));
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  if (!ka.every((k, i) => k === kb[i])) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}

function assertEq(actual, expected, msg) {
  if (!deepEq(actual, expected)) {
    console.log(`  ✗ FAIL: ${msg}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

function assertRaises(fn, msg) {
  try {
    fn();
  } catch (e) {
    console.log(`  ✓ ${msg}`);
    return;
  }
  console.log(`  ✗ FAIL: ${msg} — did not throw`);
  process.exit(1);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── Role catalog ───────────────────────────────────────────────────────────

section("Role catalog");
assertEq(Object.keys(ROLES).sort(), ["bodyguard", "seer", "villager", "werewolf"],
  "Catalog has the four expected roles");
assertEq(getRole("werewolf").team, Team.WOLVES, "Werewolf is on the wolves team");
assertEq(getRole("seer").team, Team.VILLAGE, "Seer is on the village team");
assertEq(canRead(getRole("seer"), Channel.SEER_NOTEBOOK), true,
  "Seer can read seer notebook");
assertEq(canRead(getRole("villager"), Channel.WOLVES_CHAT), false,
  "Villager cannot read wolves chat");
assertEq(canRead(getRole("werewolf"), Channel.WOLVES_CHAT), true,
  "Werewolf can read wolves chat");
assertEq(canRead(getRole("werewolf"), Channel.SEER_NOTEBOOK), false,
  "Werewolf cannot read seer notebook");

// ── Distribution validation ────────────────────────────────────────────────

section("Distribution validation");
validateRoleDistribution(defaultDistribution(8));
console.log("  ✓ Default 8-player distribution is valid");

assertRaises(() => validateRoleDistribution(
  { villager: 7, werewolf: 0, seer: 0, bodyguard: 0 }),
  "Rejects distribution with no wolves");

assertRaises(() => validateRoleDistribution(
  { villager: 1, werewolf: 4, seer: 1, bodyguard: 1 }),
  "Rejects distribution where wolves >= villagers");

assertRaises(() => validateRoleDistribution(
  { hunter: 7 }),
  "Rejects unknown role names");

// ── GameState construction ─────────────────────────────────────────────────

section("GameState construction");
const names = ["Alice", "Bob", "Carol", "Diana", "Eli", "Frank", "Grace", "Henry"];
const rng = new SeededRng(42);
const state = GameState.fromConfig({
  playerNames: names,
  humanSeat: "Diana",
  rng,
});

assertEq(state.players.length, 8, "8 players created");
assertEq(state.phase, Phase.SETUP, "Starts in SETUP phase");
assertEq(state.day, 0, "Day counter starts at 0");
assertEq(state.getPlayer("Diana").isHuman, true, "Diana is the human");
assertEq(state.getPlayer("Alice").isHuman, false, "Alice is not the human");

const roleCounts = {};
for (const p of state.players) {
  roleCounts[p.role.name] = (roleCounts[p.role.name] || 0) + 1;
}
assertEq(roleCounts, { werewolf: 2, seer: 1, bodyguard: 1, villager: 4 },
  "Role distribution matches default for 8 players");

// ── Night resolution: simple kill ──────────────────────────────────────────

section("Night resolution — kill succeeds");
const wolves = state.playersWithRole("werewolf");
const seers = state.playersWithRole("seer");
const bodyguards = state.playersWithRole("bodyguard");
const villagers = state.players.filter(p => p.role.name === "villager");

state.advanceToNight();
assertEq(state.phase, Phase.NIGHT, "Advanced to NIGHT");

const targetVillager = villagers[0].name;
const protectTarget = villagers[1].name;
const investigateTarget = wolves[0].name;

const result1 = state.resolveNight({
  wolvesTarget: targetVillager,
  bodyguardTarget: protectTarget,
  seerTarget: investigateTarget,
});

assertEq(result1.killed, targetVillager, "Targeted villager was killed");
assertEq(result1.protected, false, "Bodyguard did NOT block the kill");
assertEq(result1.seerResult, Team.WOLVES, "Seer correctly identified wolf");
assertEq(state.getPlayer(targetVillager).alive, false, "Victim is dead");
assertEq(state.getPlayer(targetVillager).deathCause, "wolves",
  "Death cause recorded as wolves");

// ── Night resolution: bodyguard saves ──────────────────────────────────────

section("Night resolution — bodyguard saves");
state.advanceToDay();
state.advanceToNight();

const targetVillager2 = villagers[2].name;
const result2 = state.resolveNight({
  wolvesTarget: targetVillager2,
  bodyguardTarget: targetVillager2,
  seerTarget: wolves[1].name,
});

assertEq(result2.killed, null, "No one died — bodyguard saved them");
assertEq(result2.protected, true, "Protection flag set");
assertEq(state.getPlayer(targetVillager2).alive, true, "Targeted player still alive");

// ── Bodyguard repeat-protection rule ───────────────────────────────────────

section("Bodyguard repeat-protection rule");
state.advanceToDay();
state.advanceToNight();
assertRaises(
  () => state.resolveNight({
    wolvesTarget: villagers[3].name,
    bodyguardTarget: targetVillager2,
    seerTarget: null,
  }),
  "Rejects protecting the same player two nights in a row",
);

state.resolveNight({
  wolvesTarget: villagers[3].name,
  bodyguardTarget: villagers[0].alive ? villagers[0].name : seers[0].name,
  seerTarget: null,
});

// ── Vote resolution: clean elimination ─────────────────────────────────────

section("Vote resolution — clean elimination");
state.advanceToDay();
const livingNamesNow = state.livingNames();
const voteTarget = wolves[0].alive ? wolves[0].name : livingNamesNow[0];
const votes = {};
for (const voter of livingNamesNow) {
  if (voter !== voteTarget) votes[voter] = voteTarget;
}
votes[voteTarget] = livingNamesNow[0] !== voteTarget ? livingNamesNow[0] : livingNamesNow[1];

const result3 = state.resolveVote(votes);
console.log(`  · Tally: ${JSON.stringify(result3.tally)}`);
assertEq(result3.eliminated, voteTarget, `${voteTarget} eliminated`);
assertEq(state.getPlayer(voteTarget).alive, false, "Eliminated player is dead");
assertEq(state.getPlayer(voteTarget).deathCause, "vote",
  "Death cause recorded as vote");

// ── Vote resolution: tie ───────────────────────────────────────────────────

section("Vote resolution — tie with no_elimination");
const tieState = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G"],
  rng: new SeededRng(7),
});
tieState.advanceToNight();
tieState.advanceToDay();

// A: 3, B: 3, C: 1 — tie at 3
const tieVotes = { A: "B", C: "B", D: "B", B: "A", E: "A", F: "A", G: "C" };

const result4 = tieState.resolveVote(tieVotes);
console.log(`  · Tally: ${JSON.stringify(result4.tally)}`);
assertEq(result4.eliminated, null, "Tie produces no elimination");
assertEq(result4.tied, true, "Tied flag set");
assertEq(tieState.getPlayer("A").alive, true, "A still alive after tie");
assertEq(tieState.getPlayer("B").alive, true, "B still alive after tie");

// ── Win conditions ─────────────────────────────────────────────────────────

section("Win conditions");
const winState = GameState.fromConfig({
  playerNames: ["W1", "W2", "V1", "V2", "V3", "V4", "V5"],
  roleCounts: { werewolf: 2, seer: 1, bodyguard: 1, villager: 3 },
  rng: new SeededRng(1),
});
for (const p of winState.players) {
  if (p.role.team === Team.WOLVES) {
    p.alive = false;
    p.deathDay = 1;
    p.deathCause = "vote";
  }
}
winState.advanceToNight();
assertEq(winState.isOver(), true, "Game over when all wolves dead");
assertEq(winState.winner, Team.VILLAGE, "Villagers win");

const parityState = GameState.fromConfig({
  playerNames: ["W1", "W2", "V1", "V2", "V3", "V4", "V5"],
  roleCounts: { werewolf: 2, seer: 1, bodyguard: 1, villager: 3 },
  rng: new SeededRng(2),
});
const villagePlayers = parityState.players.filter(p => p.role.team === Team.VILLAGE);
for (const p of villagePlayers.slice(0, 3)) {
  p.alive = false;
  p.deathDay = 1;
  p.deathCause = "wolves";
}
parityState.advanceToNight();
assertEq(parityState.isOver(), true, "Game over at wolf-village parity");
assertEq(parityState.winner, Team.WOLVES, "Wolves win at parity");

// ── Channel access ─────────────────────────────────────────────────────────

section("Channel access");
const chState = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G"],
  rng: new SeededRng(99),
});
chState.appendToChannel(Channel.TOWN_SQUARE, "narrator", "Day 1 begins.");
chState.advanceToNight();
chState.advanceToDay();
chState.appendToChannel(Channel.TOWN_SQUARE, "A", "I think B is suspicious.");

const entries = chState.getChannel(Channel.TOWN_SQUARE);
assertEq(entries.length, 2, "Two entries logged in town square");
assertEq(entries[0].speaker, "narrator", "First entry from narrator");
assertEq(entries[0].day, 0, "First entry was on day 0 (setup)");
assertEq(entries[1].day, 1, "Second entry on day 1");
assertEq(entries[1].phase, Phase.DAY, "Second entry during DAY phase");

// ── Done ───────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log("✓ All smoke tests passed.");
console.log("=".repeat(50));
