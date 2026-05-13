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
const {
  createRoom,
  getRoom,
  validateRoomName,
  sanitizePlayerName,
  _clearAllRooms,
} = require("./lobby");

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

// ── Async test: AI takeover on disconnect ────────────────────────────────
//
// When a human player drops mid-game, the HybridClient.demoteToAi(player)
// path should:
//   - Flip player.isHuman to false so future turns route to AI
//   - Remove the waiter from its map
//   - If the player was mid-turn (waiter pending), synthesize an AI
//     response and resolve the waiter so the orchestrator's awaited
//     call() returns cleanly instead of hanging forever
//   - Be idempotent: re-demoting an already-demoted player is a no-op

async function testAiTakeover() {
  section("AI takeover on disconnect");

  // ── Case 1: demote while NOT pending ────────────────────────────────
  const state1 = GameState.fromConfig({
    playerNames: ["AI1", "Alice", "AI2", "AI3", "AI4", "AI5", "AI6"],
    humanSeats: ["Alice"],
    rng: new SeededRng(33),
  });
  const stubAi1 = makeStubAiClient();
  const hc1 = new HybridClient({ aiClient: stubAi1 });
  const waiterAlice = new HumanWaiter("s", "Alice");
  hc1.registerWaiter("Alice", waiterAlice);
  hc1.setEmit(() => {});

  const alice = state1.getPlayer("Alice");
  assertEq(alice.isHuman, true, "Alice starts flagged as human");
  assertEq(waiterAlice.isWaiting(), false,
    "Alice's waiter is not pending (no turn in progress)");

  await hc1.demoteToAi(alice);

  assertEq(alice.isHuman, false,
    "demoteToAi flips isHuman to false");
  assertEq(hc1.waiters.has("Alice"), false,
    "demoteToAi removes the waiter from the map");

  // Subsequent calls for Alice route to AI.
  await hc1.call(alice, state1, "vote");
  assertEq(stubAi1.calls.length, 1,
    "Post-demote calls route to AI");
  assertEq(stubAi1.calls[0].player, "Alice",
    "AI was called on Alice's behalf");

  // ── Case 2: idempotent demote ───────────────────────────────────────
  await hc1.demoteToAi(alice);   // already demoted — no-op
  assertEq(stubAi1.calls.length, 1,
    "Re-demoting an already-demoted player is a silent no-op");

  // ── Case 3: demoting a player who was never human is a no-op ────────
  const ai1 = state1.getPlayer("AI1");
  await hc1.demoteToAi(ai1);
  assertEq(stubAi1.calls.length, 1,
    "Demoting a player who was never human is a silent no-op");

  // ── Case 4: demote WHILE pending — AI resolves the pending turn ─────
  const state2 = GameState.fromConfig({
    playerNames: ["AI1", "Bob", "AI2", "AI3", "AI4", "AI5", "AI6"],
    humanSeats: ["Bob"],
    rng: new SeededRng(34),
  });
  const stubAi2 = makeStubAiClient();
  const hc2 = new HybridClient({ aiClient: stubAi2 });
  const waiterBob = new HumanWaiter("s", "Bob");
  hc2.registerWaiter("Bob", waiterBob);
  hc2.setEmit(() => {});

  const bob = state2.getPlayer("Bob");
  // Kick off Bob's turn but don't await — waiter goes pending.
  const bobCall = hc2.call(bob, state2, "vote");
  assertEq(waiterBob.isWaiting(), true,
    "Bob's waiter is pending after call() (mid-turn)");

  // Bob disconnects right now. The pending promise must resolve, not hang.
  await hc2.demoteToAi(bob);

  const bobResult = await bobCall;
  assertEq(bobResult.reasoning, "stub",
    "Pending call resolves with the AI's response, not a rejection");
  assertEq(bob.isHuman, false,
    "demoteToAi (while pending) also flipped isHuman");
  assertEq(stubAi2.calls.length, 1,
    "AI was called once to satisfy the pending turn");
  assertEq(stubAi2.calls[0].player, "Bob",
    "AI was called for the demoted player, not someone else");
  assertEq(hc2.waiters.has("Bob"), false,
    "demoteToAi (while pending) also removed the waiter from the map");
}

// ── Async test: lobby module ─────────────────────────────────────────────
//
// Exercises RoomState lifecycle (lobby → running → finished), the
// registry (create / lookup / dedup / auto-cleanup), name validators,
// and event emission. No HTTP, no real Claude — pure state-and-behavior.

async function testLobby() {
  // ─── Room name validation ────────────────────────────────────────────
  section("Lobby — room name validation");

  assertEq(validateRoomName("wyatts-game"), "wyatts-game",
    "Simple valid name passes through");
  assertEq(validateRoomName("Wyatts-Game"), "wyatts-game",
    "Names are lowercased");
  assertEq(validateRoomName("wyatt's game"), "wyatts-game",
    "Apostrophe stripped, space becomes hyphen");
  assertEq(validateRoomName("  tuesday night  "), "tuesday-night",
    "Whitespace trimmed and normalized");
  assertEq(validateRoomName("game--007"), "game-007",
    "Repeated hyphens collapsed");

  assertRaises(() => validateRoomName("ab"),
    "Names shorter than 3 chars throw");
  assertRaises(() => validateRoomName("a".repeat(31)),
    "Names longer than 30 chars throw");
  assertRaises(() => validateRoomName(""),
    "Empty name throws");
  assertRaises(() => validateRoomName("!!!"),
    "All-special-character name throws");

  // ─── Player name sanitization ────────────────────────────────────────
  section("Lobby — player name sanitization");

  assertEq(sanitizePlayerName("Wyatt"), "Wyatt",
    "Valid player name unchanged");
  assertEq(sanitizePlayerName("  Sarah  "), "Sarah",
    "Trims surrounding whitespace");
  assertEq(sanitizePlayerName("My  Name"), "My Name",
    "Collapses internal whitespace");
  assertEq(sanitizePlayerName("Bob!@#"), "Bob",
    "Strips disallowed characters");
  assertEq(sanitizePlayerName("X".repeat(30)), "X".repeat(20),
    "Caps at 20 characters");

  assertRaises(() => sanitizePlayerName(""),
    "Empty player name throws");
  assertRaises(() => sanitizePlayerName("!!!"),
    "All-special player name throws");

  // ─── Room creation and registry ──────────────────────────────────────
  section("Lobby — room creation and registry");
  _clearAllRooms();

  const room1 = createRoom({
    rawName: "test-room-1",
    rawHostName: "Wyatt",
    config: { players: 7, rounds: 2 },
  });
  assertEq(room1.name, "test-room-1", "Room stores normalized name");
  assertEq(room1.host, "Wyatt", "Host name stored");
  assertEq(room1.status, "lobby", "Starts in lobby status");
  assertEq(room1.roster, ["Wyatt"], "Host is first player on the roster");
  assertEq(room1.config.players, 7, "Config seat count stored");
  assertEq(room1.config.rounds, 2, "Config rounds stored");

  assertEq(getRoom("test-room-1"), room1, "Registry returns the room by name");
  assertEq(getRoom("does-not-exist"), null, "Unknown rooms return null");

  assertRaises(
    () => createRoom({
      rawName: "test-room-1",
      rawHostName: "Other",
      config: { players: 7, rounds: 2 },
    }),
    "Duplicate room name throws",
  );

  assertRaises(
    () => createRoom({
      rawName: "x",   // too short
      rawHostName: "Other",
      config: { players: 7, rounds: 2 },
    }),
    "Invalid room name throws",
  );

  assertRaises(
    () => createRoom({
      rawName: "valid-name",
      rawHostName: "Alice",   // pool name
      config: { players: 7, rounds: 2 },
    }),
    "Host name colliding with NAME_POOL throws",
  );

  _clearAllRooms();

  // ─── Joining players ────────────────────────────────────────────────
  section("Lobby — joining players");

  const room2 = createRoom({
    rawName: "join-test",
    rawHostName: "Host",
    config: { players: 7, rounds: 2 },
  });

  let rosterEvent = null;
  room2.on("roster_changed", (ev) => { rosterEvent = ev; });

  room2.addPlayer("Friend1");
  assertEq(room2.roster, ["Host", "Friend1"], "Player added to roster");
  assertEq(rosterEvent?.joined, "Friend1",
    "roster_changed fires with joined name");

  room2.addPlayer("Friend2");
  assertEq(room2.roster.length, 3, "Multiple players accumulate");

  assertRaises(
    () => room2.addPlayer("Friend1"),
    "Duplicate player name throws",
  );

  assertRaises(
    () => room2.addPlayer("Alice"),
    "Pool-collision player name throws",
  );

  // Fill to capacity (5 more, total 7).
  room2.addPlayer("P4");
  room2.addPlayer("P5");
  room2.addPlayer("P6");
  room2.addPlayer("P7");
  assertEq(room2.roster.length, 7, "Roster fills to seat count");

  assertRaises(
    () => room2.addPlayer("P8"),
    "Joining a full room throws",
  );

  _clearAllRooms();

  // ─── Removing players in lobby phase ────────────────────────────────
  section("Lobby — removing players in lobby phase");

  const room3 = createRoom({
    rawName: "remove-test",
    rawHostName: "Host",
    config: { players: 8, rounds: 2 },
  });
  room3.addPlayer("Friend1");
  room3.addPlayer("Friend2");

  rosterEvent = null;
  room3.on("roster_changed", (ev) => { rosterEvent = ev; });
  room3.removePlayer("Friend1");
  assertEq(room3.roster, ["Host", "Friend2"],
    "Non-host removal updates roster");
  assertEq(rosterEvent?.left, "Friend1",
    "roster_changed fires with left name");

  rosterEvent = null;
  room3.removePlayer("Nobody");
  assertEq(rosterEvent, null,
    "Removing an unknown player is a silent no-op");

  // Host leaving the lobby terminates the room.
  let terminatedReason = null;
  room3.on("terminated", (ev) => { terminatedReason = ev.reason; });
  room3.removePlayer("Host");
  assertEq(room3.status, "finished",
    "Host removal transitions to finished");
  assertEq(terminatedReason !== null, true,
    "terminated event fires with a reason");
  assertEq(getRoom("remove-test"), null,
    "Terminated room is removed from the registry");

  _clearAllRooms();

  // ─── Starting a game ─────────────────────────────────────────────────
  section("Lobby — starting a game");

  const room4 = createRoom({
    rawName: "start-test",
    rawHostName: "Host",
    config: { players: 7, rounds: 1 },
  });
  room4.addPlayer("Friend1");
  room4.addPlayer("Friend2");

  let startedEvent = null;
  room4.on("game_started", (ev) => { startedEvent = ev; });

  const stubCostTracker = { summary: () => ({}) };
  const stubAi4 = makeStubAiClient();

  room4.start({ costTracker: stubCostTracker, aiClient: stubAi4 });

  assertEq(room4.status, "running",
    "Status transitions to running after start()");
  assertEq(startedEvent !== null, true,
    "game_started event fires");
  assertEq(room4.gameState !== null, true,
    "GameState is built and attached");
  assertEq(room4.hybridClient !== null, true,
    "HybridClient is built and attached");
  assertEq(room4.gameState.players.length, 7,
    "GameState has full seat count (7), not roster count (3)");

  const humansInGame = room4.gameState.players.filter(p => p.isHuman);
  assertEq(humansInGame.length, 3,
    "Three players flagged as human in GameState");
  const humanNamesSorted = humansInGame.map(p => p.name).sort();
  assertEq(humanNamesSorted, ["Friend1", "Friend2", "Host"],
    "Human seat names match the lobby roster");

  assertEq(room4.waiters.size, 3,
    "One HumanWaiter registered per human seat");

  assertRaises(
    () => room4.start({ costTracker: stubCostTracker, aiClient: stubAi4 }),
    "Starting an already-running room throws",
  );

  assertRaises(
    () => room4.addPlayer("Latecomer"),
    "Joining after start() throws",
  );

  _clearAllRooms();

  // ─── Mid-game demotion ───────────────────────────────────────────────
  section("Lobby — mid-game demotion");

  const room5 = createRoom({
    rawName: "demote-test",
    rawHostName: "Host",
    config: { players: 7, rounds: 1 },
  });
  room5.addPlayer("Friend");
  const stubAi5 = makeStubAiClient();
  room5.start({ costTracker: stubCostTracker, aiClient: stubAi5 });

  let demoteEvent = null;
  room5.on("player_demoted", (ev) => { demoteEvent = ev; });

  room5.demote("Friend");
  await Promise.resolve();   // let any async tails settle

  assertEq(demoteEvent?.name, "Friend",
    "player_demoted event fires with the demoted player's name");
  const friendInGame = room5.gameState.getPlayer("Friend");
  assertEq(friendInGame.isHuman, false,
    "Demoted player's isHuman is flipped via HybridClient.demoteToAi");

  // Demote on unknown name is a no-op (race-safe).
  room5.demote("NotAPlayer");
  assertEq(room5.status, "running",
    "Demoting an unknown name doesn't change status");

  // Host disconnect mid-game terminates the room.
  let hostTerminate = null;
  room5.on("terminated", (ev) => { hostTerminate = ev; });
  room5.demote("Host");
  assertEq(room5.status, "finished",
    "Host disconnect mid-game transitions to finished");
  assertEq(hostTerminate !== null, true,
    "terminated event fires when host disconnects mid-game");

  _clearAllRooms();

  // ─── Finish and termination ──────────────────────────────────────────
  section("Lobby — finish and termination");

  const room6 = createRoom({
    rawName: "finish-test",
    rawHostName: "Host",
    config: { players: 7, rounds: 1 },
  });
  const stubAi6 = makeStubAiClient();
  room6.start({ costTracker: stubCostTracker, aiClient: stubAi6 });

  let finishedEvent = null;
  let terminatedEvent = null;
  room6.on("game_finished", (ev) => { finishedEvent = ev; });
  room6.on("terminated", (ev) => { terminatedEvent = ev; });

  room6.finish({ winner: "village", finalDay: 3 });

  assertEq(finishedEvent?.winner, "village",
    "game_finished fires with winner");
  assertEq(finishedEvent?.finalDay, 3,
    "game_finished fires with finalDay");
  assertEq(terminatedEvent !== null, true,
    "terminated also fires after game_finished");
  assertEq(room6.status, "finished",
    "Status is finished after game completion");
  assertEq(getRoom("finish-test"), null,
    "Finished room is removed from the registry");

  // Idempotent — calling finish again is silent.
  finishedEvent = null;
  room6.finish({ winner: "wolves", finalDay: 99 });
  assertEq(finishedEvent, null,
    "finish() on already-finished room is a no-op");

  _clearAllRooms();
}

// ── Done ───────────────────────────────────────────────────────────────────

(async () => {
  await testHybridRouting();
  await testCancelAll();
  await testAiTakeover();
  await testLobby();

  console.log("\n" + "=".repeat(50));
  console.log("✓ All smoke tests passed.");
  console.log("=".repeat(50));
})().catch(err => {
  console.error("\n✗ Smoke test failed in async section:");
  console.error(err);
  process.exit(1);
});
