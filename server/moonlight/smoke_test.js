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
const { HumanWaiter } = require("./human_waiter");
const { HybridClient } = require("./hybrid_client");

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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE A — multi-human engine plumbing
//
// These sections lock in the target behavior for the multiplayer refactor.
// They will FAIL against the current code until Phase A is complete; each
// failure points at the next required engine change.
// ═══════════════════════════════════════════════════════════════════════════

// ── Multi-human seat assignment ───────────────────────────────────────────

section("Multi-human seat assignment");

// Old single-human API still works — humanSeat stays as a back-compat alias.
const mhLegacy = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G", "H"],
  humanSeat: "C",
  rng: new SeededRng(123),
});
assertEq(mhLegacy.getPlayer("C").isHuman, true,
  "humanSeat (legacy singular) still flags the named player");
assertEq(mhLegacy.players.filter(p => p.isHuman).length, 1,
  "humanSeat results in exactly one human");

// New API: humanSeats accepts an array of names.
const mhPair = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G", "H"],
  humanSeats: ["B", "F"],
  rng: new SeededRng(123),
});
assertEq(mhPair.getPlayer("B").isHuman, true, "humanSeats flags first named seat");
assertEq(mhPair.getPlayer("F").isHuman, true, "humanSeats flags second named seat");
assertEq(mhPair.getPlayer("A").isHuman, false, "Unnamed seats remain AI");
assertEq(mhPair.players.filter(p => p.isHuman).length, 2,
  "humanSeats with two entries produces exactly two humans");

// Empty array → spectator mode (no humans).
const mhSpectator = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G"],
  humanSeats: [],
  rng: new SeededRng(123),
});
assertEq(mhSpectator.players.filter(p => p.isHuman).length, 0,
  "Empty humanSeats produces no humans (spectator mode)");

// If both are passed, the new field wins — legacy alias is ignored.
const mhBoth = GameState.fromConfig({
  playerNames: ["A", "B", "C", "D", "E", "F", "G"],
  humanSeat: "G",
  humanSeats: ["A", "B"],
  rng: new SeededRng(123),
});
assertEq(mhBoth.getPlayer("A").isHuman, true, "humanSeats wins over humanSeat: A");
assertEq(mhBoth.getPlayer("B").isHuman, true, "humanSeats wins over humanSeat: B");
assertEq(mhBoth.getPlayer("G").isHuman, false,
  "humanSeats wins over humanSeat: legacy humanSeat ignored when humanSeats given");

// Unknown name in humanSeats throws — same rule humanSeat already enforces.
assertRaises(
  () => GameState.fromConfig({
    playerNames: ["A", "B", "C", "D", "E", "F", "G"],
    humanSeats: ["A", "NotAPlayer"],
    rng: new SeededRng(1),
  }),
  "Rejects humanSeats containing a name not in playerNames",
);

// ── HybridClient registration ─────────────────────────────────────────────

section("HybridClient registration");

// Tiny stand-in for an AI client. Records each call for later inspection.
function makeStubAiClient() {
  const calls = [];
  return {
    calls,
    async call(player, state, task) {
      calls.push({ player: player.name, task });
      return { vote: null, target: null, speech: "", reasoning: "stub" };
    },
  };
}

const hc1 = new HybridClient({ aiClient: makeStubAiClient() });
assertEq(hc1.waiters.size, 0, "HybridClient starts with empty waiters map");

const wA = new HumanWaiter("session-test", "Alice");
hc1.registerWaiter("Alice", wA);
assertEq(hc1.waiters.size, 1, "registerWaiter adds one entry");
assertEq(hc1.waiters.get("Alice") === wA, true,
  "Waiter retrievable by player name");

const wB = new HumanWaiter("session-test", "Bob");
hc1.registerWaiter("Bob", wB);
assertEq(hc1.waiters.size, 2, "registerWaiter accepts a second distinct seat");

assertRaises(
  () => hc1.registerWaiter("Alice", new HumanWaiter("session-test", "Alice")),
  "Duplicate registerWaiter for the same player name throws",
);

assertRaises(
  () => new HybridClient({}),
  "HybridClient construction requires aiClient",
);

// ── Async test declarations ──────────────────────────────────────────────
//
// HybridClient.call() and cancelAll() return promises, so these sections
// run inside an async IIFE at the bottom of the file. Their assertions
// look like the sync ones — just wrapped in async/await.

async function testHybridRouting() {
  section("HybridClient routing");

  const routingState = GameState.fromConfig({
    playerNames: ["AI1", "Alice", "AI2", "Bob", "AI3", "AI4", "AI5"],
    humanSeats: ["Alice", "Bob"],
    rng: new SeededRng(50),
  });

  const stubAi = makeStubAiClient();
  const hc = new HybridClient({ aiClient: stubAi });
  const waiterAlice = new HumanWaiter("s", "Alice");
  const waiterBob = new HumanWaiter("s", "Bob");
  hc.registerWaiter("Alice", waiterAlice);
  hc.registerWaiter("Bob", waiterBob);

  // Collect emitted events so we can verify the waiter announced its
  // input request through the orchestrator's emit channel.
  const events = [];
  hc.setEmit((kind, data) => events.push({ kind, data }));

  // AI seat → routed to stub AI client.
  const ai1 = routingState.getPlayer("AI1");
  await hc.call(ai1, routingState, "vote");
  assertEq(stubAi.calls.length, 1, "AI seat routed to aiClient.call()");
  assertEq(stubAi.calls[0].player, "AI1", "Correct AI player was called");

  // Human seat → routed to that player's waiter, NOT the AI client.
  const alice = routingState.getPlayer("Alice");
  const alicePromise = hc.call(alice, routingState, "vote");
  // The call hasn't resolved yet — the waiter is now in pending state.
  assertEq(waiterAlice.isWaiting(), true, "Alice's waiter is pending after call()");
  assertEq(events.length, 1, "human_input_needed event was emitted");
  assertEq(events[0].kind, "human_input_needed",
    "Emitted event kind is human_input_needed");
  assertEq(events[0].data.speaker, "Alice", "Event identifies Alice as the speaker");

  // Resolve the waiter externally — simulates POST /respond firing.
  waiterAlice.resolve({ vote: "AI1", reasoning: "human input" });
  const aliceResult = await alicePromise;
  assertEq(aliceResult.vote, "AI1",
    "Alice's call() resolved with the submitted response");
  assertEq(stubAi.calls.length, 1,
    "AI client was NOT consulted for Alice's turn");

  // Bob's call resolves through Bob's waiter, not Alice's.
  const bob = routingState.getPlayer("Bob");
  const bobPromise = hc.call(bob, routingState, "vote");
  assertEq(waiterBob.isWaiting(), true, "Bob's waiter is pending");
  assertEq(waiterAlice.isWaiting(), false,
    "Alice's waiter is NOT pending (already resolved earlier)");
  waiterBob.resolve({ vote: "AI2", reasoning: "human input" });
  const bobResult = await bobPromise;
  assertEq(bobResult.vote, "AI2", "Bob's call() resolved through his own waiter");

  // Failure modes: human seat without a registered waiter.
  const orphanState = GameState.fromConfig({
    playerNames: ["A", "B", "C", "D", "E", "F", "G"],
    humanSeats: ["A"],
    rng: new SeededRng(99),
  });
  const orphanClient = new HybridClient({ aiClient: makeStubAiClient() });
  orphanClient.setEmit(() => {});
  let threwOrphan = false;
  try {
    await orphanClient.call(orphanState.getPlayer("A"), orphanState, "vote");
  } catch { threwOrphan = true; }
  assertEq(threwOrphan, true,
    "call() on human seat with no registered waiter throws");

  // Failure mode: human turn before setEmit() was called.
  const noEmitClient = new HybridClient({ aiClient: makeStubAiClient() });
  noEmitClient.registerWaiter("A", new HumanWaiter("s", "A"));
  let threwNoEmit = false;
  try {
    await noEmitClient.call(orphanState.getPlayer("A"), orphanState, "vote");
  } catch { threwNoEmit = true; }
  assertEq(threwNoEmit, true,
    "call() on human turn before setEmit() throws");
}

async function testCancelAll() {
  section("HybridClient cancellation");

  const cancelState = GameState.fromConfig({
    playerNames: ["A", "B", "C", "D", "E", "F", "G"],
    humanSeats: ["A", "B"],
    rng: new SeededRng(7),
  });

  const hc = new HybridClient({ aiClient: makeStubAiClient() });
  const wCancelA = new HumanWaiter("s", "A");
  const wCancelB = new HumanWaiter("s", "B");
  hc.registerWaiter("A", wCancelA);
  hc.registerWaiter("B", wCancelB);
  hc.setEmit(() => {});

  const callA = hc.call(cancelState.getPlayer("A"), cancelState, "vote");
  const callB = hc.call(cancelState.getPlayer("B"), cancelState, "vote");

  assertEq(wCancelA.isWaiting(), true, "Waiter A is pending before cancelAll()");
  assertEq(wCancelB.isWaiting(), true, "Waiter B is pending before cancelAll()");

  hc.cancelAll("Test cancellation");

  let aRejected = false;
  let bRejected = false;
  try { await callA; } catch { aRejected = true; }
  try { await callB; } catch { bRejected = true; }

  assertEq(aRejected, true, "cancelAll() rejects waiter A's pending promise");
  assertEq(bRejected, true, "cancelAll() rejects waiter B's pending promise");
}

// ── Done ───────────────────────────────────────────────────────────────────

(async () => {
  await testHybridRouting();
  await testCancelAll();

  console.log("\n" + "=".repeat(50));
  console.log("✓ All smoke tests passed.");
  console.log("=".repeat(50));
})().catch(err => {
  console.error("\n✗ Smoke test failed in async section:");
  console.error(err);
  process.exit(1);
});
