// ═══════════════════════════════════════════════════════════════════════════
// server/routes/moonlight.js — Express routes for the Moonlight feature.
//
// Mounted in server/index.js:
//   app.use("/api/moonlight", require("./routes/moonlight"));
//
// Endpoints:
//   POST /api/moonlight/run     — Synchronous, fake client. Pass-1 demo.
//   GET  /api/moonlight/stream  — SSE, real Claude. Pass-A demo.
//   GET  /api/moonlight/health  — Liveness check.
//   GET  /api/moonlight/budget  — Today's spend / daily cap.
//
// SSE endpoint protocol
// ---------------------
// One named event per game event. Event name = ev.kind. Data = JSON of ev.
// Client just listens with EventSource and routes by event type.
// First message is always "game_start". Last is "game_over" or "error",
// followed by "done" so the client can cleanly close.
// ═══════════════════════════════════════════════════════════════════════════

const express = require("express");
const path = require("path");

const moonlightDir = path.join(__dirname, "..", "moonlight");
const { GameState, SeededRng } = require(path.join(moonlightDir, "game_state"));
const { runGame } = require(path.join(moonlightDir, "orchestrator"));
const { runGameStreaming } = require(path.join(moonlightDir, "orchestrator_streaming"));
const { FakeClaudeClient } = require(path.join(moonlightDir, "fake_claude"));
const { RealClaudeClient } = require(path.join(moonlightDir, "claude_client"));
const { CostTracker, BudgetExceeded, todayKey } = require(path.join(moonlightDir, "cost_tracker"));
const { pickPersona } = require(path.join(moonlightDir, "prompts"));

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildState(seed, players, rng) {
  const names = NAME_POOL.slice(0, players);

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

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (res.flushHeaders) res.flushHeaders();

  let connectionOpen = true;
  req.on("close", () => { connectionOpen = false; });

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
    state = buildState(cfg.seed, cfg.players, new SeededRng(cfg.seed));
  } catch (err) {
    sendEvent("error", { kind: "setup", message: err.message });
    sendEvent("done", {});
    return res.end();
  }

  sendEvent("config", {
    mode: "real",
    seed: cfg.seed,
    players: cfg.players,
    rounds: cfg.rounds,
    model: process.env.MOONLIGHT_MODEL || "claude-sonnet-4-5",
  });
  sendEvent("budget", costTracker.summary());

  const client = new RealClaudeClient({
    apiKey,
    costTracker,
    model: process.env.MOONLIGHT_MODEL,
    logger: (entry) => {
      if (entry.kind === "claude_retry") {
        console.warn(`[moonlight] retry attempt ${entry.attempt} for ${entry.task}: ${entry.error}`);
      }
    },
  });

  try {
    await runGameStreaming(state, client, { discussionRounds: cfg.rounds }, (ev) => {
      sendEvent(ev.kind, ev);
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
    res.end();
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
    version: "0.2.0",
    realClaudeAvailable: !!process.env.ANTHROPIC_API_KEY,
  });
});

module.exports = router;
