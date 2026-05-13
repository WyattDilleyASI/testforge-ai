// ═══════════════════════════════════════════════════════════════════════════
// server/routes/moonlight.js — Express routes for the Moonlight feature.
//
// Phase B: lobby-based multiplayer. Players join a named room, host clicks
// start when ready, AI fills empty seats, mid-game disconnects fall back to
// AI silently. The lobby module owns room lifecycle (lobby.js); these
// handlers are HTTP-shaped subscribers and forwarders — they don't run the
// game themselves, they just plumb events between HTTP and lobby.
//
// Mounted in server/index.js:
//   app.use("/api/moonlight", require("./routes/moonlight"));
//
// Endpoints:
//   POST /api/moonlight/run                  — Synchronous, fake client. Demo only.
//   POST /api/moonlight/rooms                — Create a room (host's create+join).
//   GET  /api/moonlight/rooms                — List all active rooms.
//   GET  /api/moonlight/rooms/:name          — Get a room's current state.
//   POST /api/moonlight/rooms/:name/join     — Join an existing room.
//   POST /api/moonlight/rooms/:name/start    — Host starts the game.
//   GET  /api/moonlight/rooms/:name/stream   — Per-player SSE subscription.
//   POST /api/moonlight/rooms/:name/respond  — Submit a human player's input.
//   GET  /api/moonlight/health               — Liveness check.
//   GET  /api/moonlight/budget               — Today's spend / daily cap.
//
// Per-player SSE protocol
// -----------------------
// First event is always "config" (room snapshot, who-am-I). Last is "done"
// after either "game_finished" or "terminated". Public events fan out to
// every subscriber; "you_are" and "human_input_needed" are filtered to
// only the player they concern.
// ═══════════════════════════════════════════════════════════════════════════

const express = require("express");
const path = require("path");

const moonlightDir = path.join(__dirname, "..", "moonlight");
const { SeededRng } = require(path.join(moonlightDir, "game_state"));
const { runGame } = require(path.join(moonlightDir, "orchestrator"));
const { runGameStreaming } = require(path.join(moonlightDir, "orchestrator_streaming"));
const { FakeClaudeClient } = require(path.join(moonlightDir, "fake_claude"));
const { RealClaudeClient } = require(path.join(moonlightDir, "claude_client"));
const { CostTracker, BudgetExceeded, todayKey } = require(path.join(moonlightDir, "cost_tracker"));
const {
  createRoom,
  getRoom,
  listRooms,
  buildGameState,
  sanitizePlayerName,
} = require(path.join(moonlightDir, "lobby"));

let requireAuth;
try {
  ({ requireAuth } = require("../auth"));
} catch {
  requireAuth = (req, res, next) => next();
}

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

const VALID_PLAYER_COUNTS = [7, 8, 9];
const MAX_ROUNDS = 5;
const MIN_ROUNDS = 1;

// Validate the /run endpoint's config body (fake demo only).
function validateRunConfig(body) {
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

// Build the AI client for a real-Claude game. Used by /rooms/:name/start.
function buildAiClient({ apiKey, costTracker }) {
  return new RealClaudeClient({
    apiKey,
    costTracker,
    model: process.env.MOONLIGHT_MODEL,
    logger: (entry) => {
      if (entry.kind === "claude_retry") {
        console.warn(`[moonlight] retry ${entry.attempt} for ${entry.task}: ${entry.error}`);
      }
    },
  });
}

// Run the orchestrator to completion in the background. Called by /start
// after room.start() succeeds. Resolves into either room.finish() (natural
// completion) or room.terminate() (any error). Never throws back out — we
// don't want unhandled rejections from background tasks.
async function runGameInBackground(room) {
  try {
    await runGameStreaming(
      room.gameState,
      room.hybridClient,
      { discussionRounds: room.config.rounds },
      (ev) => room.emitGameEvent(ev),
    );
    room.finish({ winner: room.gameState.winner, finalDay: room.gameState.day });
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      console.warn(`[room ${room.name}] budget exceeded:`, err.message);
      room.terminate(`Budget exceeded: ${err.message}`);
    } else {
      console.error(`[room ${room.name}] game crashed:`, err);
      room.terminate(`Runtime error: ${err.message}`);
    }
  }
}

// Lightweight serializer for room status responses. Strips internal refs
// (gameState, hybridClient, waiters) — those are only useful inside the
// process and shouldn't leak over HTTP.
function roomSummary(room) {
  return {
    name: room.name,
    host: room.host,
    status: room.status,
    config: room.config,
    playerCount: room.players.size,
    maxPlayers: room.config.players,
    roster: room.roster,
  };
}

// ─── POST /api/moonlight/run ──────────────────────────────────────────────
//
// Fake demo, unchanged in spirit from Phase A. Synchronous; returns the
// full transcript. AI-only — no humans, no lobby, no real API calls.

router.post("/run", requireAuth, (req, res) => {
  const t0 = process.hrtime.bigint();
  const cfg = validateRunConfig(req.body || {});
  if (cfg.error) return res.status(400).json({ error: cfg.error });

  try {
    const state = buildGameState({
      seed: cfg.seed,
      totalSeats: cfg.players,
      humanNames: [],
      rng: new SeededRng(cfg.seed),
    });
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

// ─── POST /api/moonlight/rooms ────────────────────────────────────────────
//
// Create a room. The caller becomes the host AND the first player on the
// roster. Body: { name, hostName, config: { players, rounds, seed? } }.

router.post("/rooms", requireAuth, (req, res) => {
  const { name, hostName, config } = req.body || {};
  if (!name || !hostName) {
    return res.status(400).json({ error: "name and hostName are required" });
  }
  try {
    const room = createRoom({ rawName: name, rawHostName: hostName, config: config || {} });
    return res.status(201).json({ room: roomSummary(room) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/moonlight/rooms ─────────────────────────────────────────────
//
// List all active rooms. Used for debugging and observability.

router.get("/rooms", requireAuth, (req, res) => {
  res.json({ rooms: listRooms() });
});

// ─── GET /api/moonlight/rooms/:name ───────────────────────────────────────
//
// Get a room's current state. Used by the client to check existence
// before joining and to render the lobby roster.

router.get("/rooms/:name", requireAuth, (req, res) => {
  const room = getRoom(req.params.name);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ room: roomSummary(room) });
});

// ─── POST /api/moonlight/rooms/:name/join ─────────────────────────────────
//
// Join an existing room. Body: { playerName }. Returns the seat name the
// player was assigned (sanitized — may differ slightly from the raw input).

router.post("/rooms/:name/join", requireAuth, (req, res) => {
  const room = getRoom(req.params.name);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const { playerName } = req.body || {};
  if (!playerName) return res.status(400).json({ error: "playerName is required" });

  try {
    const seatedName = room.addPlayer(playerName);
    return res.json({ playerName: seatedName, room: roomSummary(room) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/moonlight/rooms/:name/start ────────────────────────────────
//
// Host starts the game. Body: { hostName } — identity-by-name verifies the
// caller is the host (no real auth in Phase B). Empty seats fill with AI.
// The orchestrator runs in the background; events flow to SSE subscribers
// via the room's event emitter.

router.post("/rooms/:name/start", requireAuth, async (req, res) => {
  const room = getRoom(req.params.name);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const { hostName } = req.body || {};
  if (hostName !== room.host) {
    return res.status(403).json({ error: "Only the host can start the game" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  // Cost-tracker preflight before we commit to any further construction.
  const costTracker = new CostTracker();
  try {
    costTracker.preflightCheck();
  } catch (err) {
    return res.status(400).json({ error: "budget", message: err.message });
  }

  const aiClient = buildAiClient({ apiKey, costTracker });

  try {
    room.start({ costTracker, aiClient });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Fire off the orchestrator. Runs ~30-60s; we don't await — the response
  // returns immediately and clients watch progress via SSE.
  runGameInBackground(room);

  return res.json({ ok: true, seed: room.seed });
});

// ─── GET /api/moonlight/rooms/:name/stream ────────────────────────────────
//
// Per-player SSE subscription. Query: ?playerName=X identifies the seat.
// Subscribes to room events and forwards to this connection. Private
// events (you_are, human_input_needed) are filtered so each player only
// sees their own.
//
// On disconnect, calls room.demote(playerName): lobby phase → remove,
// running phase → AI takeover.

router.get("/rooms/:name/stream", requireAuth, (req, res) => {
  const room = getRoom(req.params.name);
  if (!room) return res.status(404).json({ error: "Room not found" });

  let playerName;
  try {
    playerName = sanitizePlayerName(req.query.playerName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!room.players.has(playerName)) {
    return res.status(403).json({ error: `You are not in room "${room.name}"` });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (res.flushHeaders) res.flushHeaders();

  let connectionOpen = true;

  function sendEvent(name, data) {
    if (!connectionOpen) return;
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // SSE keepalive — prevents intermediaries from killing the connection
  // during long player deliberation pauses. ":" is a comment line.
  const keepalive = setInterval(() => {
    if (connectionOpen) res.write(":\n\n");
  }, 25000);

  // ── Subscribers ────────────────────────────────────────────────────
  //
  // Named handler functions so we can remove them on cleanup. Removing
  // listeners by reference avoids accidentally tearing down OTHER
  // connections' subscriptions on the same room.

  const onRosterChanged = (ev) => sendEvent("roster_changed", ev);
  const onGameStarted = (ev) => sendEvent("game_started", ev);
  const onPlayerDemoted = (ev) => sendEvent("player_demoted", ev);
  const onGameFinished = (ev) => sendEvent("game_finished", ev);

  const onGameEvent = (ev) => {
    // human_input_needed is private — only forward to the player named in
    // ev.data.speaker. The orchestrator emits one event per turn; without
    // this filter, every connection would render an input card.
    if (ev.kind === "human_input_needed") {
      if (ev.data?.speaker !== playerName) return;
    }

    sendEvent(ev.kind, ev);

    // Right after game_start, send this player's private you_are.
    if (ev.kind === "game_start") {
      const player = room.gameState?.players.find(p => p.name === playerName);
      if (player) {
        sendEvent("you_are", { name: player.name, role: player.role.name });
      }
    }

    // Budget snapshots on the same key events as Phase A.
    if (
      (ev.kind === "speech" || ev.kind === "vote_resolution" || ev.kind === "night_resolution")
      && room.costTracker
    ) {
      sendEvent("budget", room.costTracker.summary());
    }
  };

  const onTerminated = (ev) => {
    sendEvent("terminated", ev);
    sendEvent("done", {});
    cleanup();
    if (connectionOpen) {
      connectionOpen = false;
      res.end();
    }
  };

  room.on("roster_changed", onRosterChanged);
  room.on("game_started", onGameStarted);
  room.on("game_event", onGameEvent);
  room.on("player_demoted", onPlayerDemoted);
  room.on("game_finished", onGameFinished);
  room.on("terminated", onTerminated);

  function cleanup() {
    clearInterval(keepalive);
    room.off("roster_changed", onRosterChanged);
    room.off("game_started", onGameStarted);
    room.off("game_event", onGameEvent);
    room.off("player_demoted", onPlayerDemoted);
    room.off("game_finished", onGameFinished);
    room.off("terminated", onTerminated);
  }

  req.on("close", () => {
    connectionOpen = false;
    cleanup();
    // Tell the room this player dropped. Lobby phase → remove from roster.
    // Running phase → demoteToAi keeps the game flowing.
    room.demote(playerName);
  });

  // ── Initial snapshot ───────────────────────────────────────────────
  //
  // First event tells the client who they are, what room they're in, and
  // what state things are in. Always sent immediately on connect.

  sendEvent("config", {
    name: room.name,
    host: room.host,
    status: room.status,
    config: room.config,
    roster: room.roster,
    playerName,
    isHost: playerName === room.host,
  });

  // If the game is already running when this player connects (e.g., they
  // just reloaded the page mid-game), send their role immediately.
  // No event replay — Phase B accepts that late-joiners miss past events.
  if (room.status === "running" && room.gameState) {
    const player = room.gameState.players.find(p => p.name === playerName);
    if (player) {
      sendEvent("you_are", { name: player.name, role: player.role.name });
    }
    if (room.costTracker) {
      sendEvent("budget", room.costTracker.summary());
    }
  }
});

// ─── POST /api/moonlight/rooms/:name/respond ──────────────────────────────
//
// Submit a human player's input for a pending turn. Body: { playerName,
// response }. Returns 409 if the seat isn't currently waiting for input.

router.post("/rooms/:name/respond", requireAuth, (req, res) => {
  const room = getRoom(req.params.name);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const { playerName, response } = req.body || {};
  if (!playerName) return res.status(400).json({ error: "playerName is required" });
  if (!response || typeof response !== "object") {
    return res.status(400).json({ error: "response object is required" });
  }

  if (!room.waiters) {
    return res.status(409).json({ error: "Game has not started" });
  }
  const waiter = room.waiters.get(playerName);
  if (!waiter) {
    return res.status(404).json({ error: `No human seat named "${playerName}" in this room` });
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
    version: "0.4.0",
    realClaudeAvailable: !!process.env.ANTHROPIC_API_KEY,
    activeRooms: listRooms().length,
  });
});

module.exports = router;