// ═══════════════════════════════════════════════════════════════════════════
// server/routes/moonlight.js — Express routes for the Moonlight feature.
//
// Mounted in server/index.js:
//   app.use("/api/moonlight", require("./routes/moonlight"));
//
// Endpoints:
//   POST /api/moonlight/run      — Synchronous, fake client. Pass-1 demo.
//   GET  /api/moonlight/stream   — SSE, real Claude (or Real+human player).
//   POST /api/moonlight/respond  — Human player's response to a pending input.
//   GET  /api/moonlight/health   — Liveness check.
//   GET  /api/moonlight/budget   — Today's spend / daily cap.
//
// SSE endpoint protocol
// ---------------------
// One named event per game event. Event name = ev.kind. Data = JSON of ev.
// Client just listens with EventSource and routes by event type.
// First message is always "game_start". Last is "game_over" or "error",
// followed by "done" so the client can cleanly close.
//
// When human=true on /stream:
//   - The first config event includes a sessionId.
//   - Right after game_start, a "you_are" event tells the human their role.
//   - Whenever the orchestrator hits the human's turn, a "human_input_needed"
//     event is emitted. The orchestrator pauses; the client POSTs to /respond.
// ═══════════════════════════════════════════════════════════════════════════

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const moonlightDir = path.join(__dirname, "..", "moonlight");
const { GameState, SeededRng } = require(path.join(moonlightDir, "game_state"));
const { runGame } = require(path.join(moonlightDir, "orchestrator"));
const { runGameStreaming } = require(path.join(moonlightDir, "orchestrator_streaming"));
const { FakeClaudeClient } = require(path.join(moonlightDir, "fake_claude"));
const { RealClaudeClient } = require(path.join(moonlightDir, "claude_client"));
const { CostTracker, BudgetExceeded, todayKey } = require(path.join(moonlightDir, "cost_tracker"));
const { pickPersona } = require(path.join(moonlightDir, "prompts"));
const { HumanWaiter } = require(path.join(moonlightDir, "human_waiter"));
const { HybridClient } = require(path.join(moonlightDir, "hybrid_client"));

let requireAuth;
try {
  ({ requireAuth } = require("../auth"));
} catch {
  requireAuth = (req, res, next) => next();
}

const router = express.Router();

const NAME_POOL = ["Alice", "Bob", "Carol", "Diana", "Eli", "Frank", "Grace", "Henry", "Iris"];
const VALID_PLAYER_COUNTS = [7, 8, 9];
const MAX_ROUNDS = 5;
const MIN_ROUNDS = 1;
const MAX_HUMAN_NAME_LEN = 20;

// Active human-play sessions. One entry per game with a human player; deleted
// when the SSE connection closes or the game finishes.
const humanSessions = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────

// Sanitize a human's display name for use as a player slot. Strips anything
// outside [A-Za-z0-9 ], trims, caps length, falls back to "You" if empty.
function sanitizeHumanName(raw) {
  const cleaned = String(raw || "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_HUMAN_NAME_LEN);
  return cleaned || "You";
}

function buildState(seed, players, rng, options = {}) {
  const names = NAME_POOL.slice(0, players);
  const humanNames = options.humanNames || [];

  // Slot each human into a distinct random seat. Name collisions with the
  // fixed pool are resolved by appending "*" — only happens when a user's
  // display name matches one of the AI persona names (Alice, Bob, etc).
  const slottedSeats = [];
  for (const rawName of humanNames) {
    let finalName = rawName;
    while (names.includes(finalName)) finalName = finalName + "*";

    // Skip seats already taken by previously slotted humans this call.
    const takenIdx = new Set(slottedSeats.map(s => names.indexOf(s)));
    const candidates = [];
    for (let i = 0; i < names.length; i++) {
      if (!takenIdx.has(i)) candidates.push(i);
    }
    const idx = candidates[Math.floor(rng.random() * candidates.length)];
    names[idx] = finalName;
    slottedSeats.push(finalName);
  }

  const personas = {};
  const taken = new Set();
  for (const name of names) {
    let p;
    do { p = pickPersona(rng); } while (taken.has(p.name));
    taken.add(p.name);
    personas[name] = p.description;
  }

  return GameState.fromConfig({
    playerNames: names,
    rng: new SeededRng(seed),
    personalities: personas,
    humanSeats: slottedSeats,
  });
}

function validateConfig(body) {
  const seed = Number.isInteger(body.seed) ? body.seed : Math.floor(Math.random() * 1e6);
  const players = Number.isInteger(body.players) ? body.players : 8;
  const rounds = Number.isInteger(body.rounds) ? body.rounds : 2;
  if (!VALID_PLAYER_COUNTS.includes(players)) {
    return { error: `players must be one of ${VALID_PLAYER_COUNTS.join(", ")}` };
  }
  if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    return { error: `rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}` };
  }
  return { seed, players, rounds };
}

// ─── POST /api/moonlight/run ──────────────────────────────────────────────

router.post("/run", requireAuth, (req, res) => {
  const t0 = process.hrtime.bigint();
  const cfg = validateConfig(req.body || {});
  if (cfg.error) return res.status(400).json({ error: cfg.error });

  try {
    const state = buildState(cfg.seed, cfg.players, new SeededRng(cfg.seed));
    const client = new FakeClaudeClient(new SeededRng(cfg.seed + 1));
    const { transcript, winner } = runGame(state, client, { discussionRounds: cfg.rounds });
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    return res.json({
      mode: "fake",
      seed: cfg.seed,
      players: cfg.players,
      rounds: cfg.rounds,
      winner,
      finalDay: state.day,
      durationMs,
      transcript: transcript.events,
    });
  } catch (err) {
    console.error("[moonlight] fake game failed:", err);
    return res.status(500).json({ error: "game_failed", message: err.message });
  }
});

// ─── GET /api/moonlight/stream ────────────────────────────────────────────

router.get("/stream", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  const body = {
    seed: req.query.seed !== undefined ? parseInt(req.query.seed, 10) : undefined,
    players: req.query.players !== undefined ? parseInt(req.query.players, 10) : undefined,
    rounds: req.query.rounds !== undefined ? parseInt(req.query.rounds, 10) : undefined,
  };
  for (const k of Object.keys(body)) if (Number.isNaN(body[k])) delete body[k];

  const cfg = validateConfig(body);
  if (cfg.error) return res.status(400).json({ error: cfg.error });

  // Human-play params. When human=true, the user is slotted into one random
  // seat and the orchestrator pauses on that seat's turns. Phase A still
  // accepts only one playerName from the query — humanNames is an array now
  // but the route surface stays single-human until the Phase B lobby lands.
  const isHuman = req.query.human === "true";
  const humanNames = isHuman ? [sanitizeHumanName(req.query.playerName)] : [];

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (res.flushHeaders) res.flushHeaders();

  let connectionOpen = true;
  let sessionId = null;
  let sessionEntry = null;

  // Cleanup helper — idempotent; safe to call from req.close, finally, etc.
  function cleanupSession(reason) {
    if (sessionEntry?.hybridClient) {
      try { sessionEntry.hybridClient.cancelAll(reason); } catch {}
    }
    if (sessionId) {
      humanSessions.delete(sessionId);
      sessionId = null;
      sessionEntry = null;
    }
  }

  req.on("close", () => {
    connectionOpen = false;
    cleanupSession("Client disconnected");
  });

  function sendEvent(name, data) {
    if (!connectionOpen) return;
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const costTracker = new CostTracker();
  try {
    costTracker.preflightCheck();
  } catch (err) {
    sendEvent("error", { kind: "budget", message: err.message });
    sendEvent("done", {});
    return res.end();
  }

  let state;
  try {
    state = buildState(
      cfg.seed,
      cfg.players,
      new SeededRng(cfg.seed),
      { humanNames },
    );
  } catch (err) {
    sendEvent("error", { kind: "setup", message: err.message });
    sendEvent("done", {});
    return res.end();
  }

  // Find every human seat the engine assigned. In Phase A this list has
  // 0 or 1 entries (the route still accepts only one playerName from the
  // query). Phase B's lobby will populate it with N.
  const humanPlayers = state.players.filter(p => p.isHuman);
  if (humanNames.length > 0 && humanPlayers.length === 0) {
    sendEvent("error", { kind: "setup", message: "Human seat assignment failed" });
    sendEvent("done", {});
    return res.end();
  }

  // Build the AI client. Every seat that isn't human routes through this.
  const aiClient = new RealClaudeClient({
    apiKey,
    costTracker,
    model: process.env.MOONLIGHT_MODEL,
    logger: (entry) => {
      if (entry.kind === "claude_retry") {
        console.warn(`[moonlight] retry attempt ${entry.attempt} for ${entry.task}: ${entry.error}`);
      }
    },
  });

  // If any humans were seated, wrap the AI client in a HybridClient and
  // register one waiter per human seat. Both the route (via sessionEntry)
  // and the HybridClient (via its internal map) hold references to the
  // same waiter instances, so /respond can resolve them by name.
  let client;
  if (humanPlayers.length > 0) {
    sessionId = crypto.randomUUID();
    const hybridClient = new HybridClient({ aiClient });
    const waiters = new Map();
    for (const player of humanPlayers) {
      const w = new HumanWaiter(sessionId, player.name);
      waiters.set(player.name, w);
      hybridClient.registerWaiter(player.name, w);
    }
    sessionEntry = { waiters, hybridClient };
    humanSessions.set(sessionId, sessionEntry);
    client = hybridClient;
  } else {
    client = aiClient;
  }

  sendEvent("config", {
    mode: "real",
    seed: cfg.seed,
    players: cfg.players,
    rounds: cfg.rounds,
    model: process.env.MOONLIGHT_MODEL || "claude-sonnet-4-5",
    sessionId,                                  // null in spectator mode
    playingAs: humanPlayers.map(p => p.name),   // always an array; empty when spectating
  });
  sendEvent("budget", costTracker.summary());

  try {
    await runGameStreaming(state, client, { discussionRounds: cfg.rounds }, (ev) => {
      sendEvent(ev.kind, ev);

      // Right after game_start, tell each human their role. The SSE stream
      // is per-connection, so this stays private to whoever is on it.
      // Phase A: at most one human per connection. Phase B: per-player streams.
      if (ev.kind === "game_start") {
        for (const p of humanPlayers) {
          sendEvent("you_are", { name: p.name, role: p.role.name });
        }
      }

      if (ev.kind === "speech" || ev.kind === "vote_resolution" || ev.kind === "night_resolution") {
        sendEvent("budget", costTracker.summary());
      }
    });
    sendEvent("budget", costTracker.summary());
    sendEvent("done", { winner: state.winner, finalDay: state.day });
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      sendEvent("error", { kind: "budget", message: err.message });
    } else {
      console.error("[moonlight] real game failed:", err);
      sendEvent("error", { kind: "runtime", message: err.message });
    }
    sendEvent("budget", costTracker.summary());
    sendEvent("done", {});
  } finally {
    cleanupSession("Game ended");
    res.end();
  }
});

// ─── POST /api/moonlight/respond ──────────────────────────────────────────
//
// The human player POSTs their response here.
// Body: { sessionId, playerName, response }.
//
// playerName names which seat in the session this response is for. Phase A
// always has one human per session, but the field is required now so the
// Phase B lobby (with N humans per game) doesn't need a breaking API change.
//
// Response shape depends on the task — same shape an AI client would return:
//   speak:           { speech: "..." }
//   vote:            { vote: "PlayerName", reasoning: "..." }
//   wolf_propose,    { target: "PlayerName", reasoning: "..." }
//   wolf_consensus,
//   investigate,
//   protect:
//
// The orchestrator's _normalize and _validateTarget handle bad targets, so
// validation here is just basic shape checking.

router.post("/respond", requireAuth, (req, res) => {
  const { sessionId, playerName, response } = req.body || {};
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "sessionId is required" });
  }
  if (!playerName || typeof playerName !== "string") {
    return res.status(400).json({ error: "playerName is required" });
  }
  if (!response || typeof response !== "object") {
    return res.status(400).json({ error: "response object is required" });
  }

  const session = humanSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found or already completed" });
  }
  const waiter = session.waiters.get(playerName);
  if (!waiter) {
    return res.status(404).json({ error: `No human seat named "${playerName}" in this session` });
  }
  if (!waiter.isWaiting()) {
    return res.status(409).json({ error: "No pending input request for this seat" });
  }

  try {
    waiter.resolve(response);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/moonlight/budget ────────────────────────────────────────────

router.get("/budget", requireAuth, (req, res) => {
  const tracker = new CostTracker();
  res.json({
    today: todayKey(),
    ...tracker.summary(),
  });
});

// ─── GET /api/moonlight/health ────────────────────────────────────────────

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    feature: "moonlight",
    version: "0.3.0",
    realClaudeAvailable: !!process.env.ANTHROPIC_API_KEY,
    activeHumanSessions: humanSessions.size,
  });
});

module.exports = router;
