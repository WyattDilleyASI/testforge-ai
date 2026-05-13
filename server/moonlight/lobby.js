// ═══════════════════════════════════════════════════════════════════════════
// lobby.js — Named-room state and lifecycle for Moonlight multiplayer.
//
// A "room" is a named container that goes through three phases:
//
//   lobby   → players join, host configures, no game yet
//   running → host clicked start; orchestrator running in the route layer
//   finished → game ended naturally OR host disconnected OR room aborted
//
// The route layer treats RoomState as a state-and-events object. It calls
// methods (addPlayer, start, demote, finish, terminate) when HTTP events
// arrive, and subscribes to the EventEmitter for things to push back out
// over SSE streams. The lobby module itself never touches res/req — that
// separation is enforced; it makes the smoke tests clean and means the
// lobby can be reasoned about without HTTP context.
//
// Module-level registry: rooms are keyed by name. Names are validated and
// normalized on creation; duplicates throw. Rooms auto-remove from the
// registry when their 'terminated' event fires.
// ═══════════════════════════════════════════════════════════════════════════

const { EventEmitter } = require("events");
const { GameState, SeededRng } = require("./game_state");
const { HumanWaiter } = require("./human_waiter");
const { HybridClient } = require("./hybrid_client");
const { pickPersona } = require("./prompts");

// ─── Constants ────────────────────────────────────────────────────────────

// AI character pool. Player names that collide with this list are rejected
// at join time rather than transparently renamed — keeping lobby roster
// names identical to seat names eliminates a bug class in the route layer.
const NAME_POOL = ["Alice", "Bob", "Carol", "Diana", "Eli", "Frank", "Grace", "Henry", "Iris"];

const VALID_SEAT_COUNTS = [7, 8, 9];
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;
const MIN_ROOM_NAME_LEN = 3;
const MAX_ROOM_NAME_LEN = 30;
const MAX_PLAYER_NAME_LEN = 20;

// ─── Module-level registry ────────────────────────────────────────────────

const rooms = new Map();

// ─── Validators ───────────────────────────────────────────────────────────

// Normalize a raw room name into the canonical form:
//   - lowercase
//   - whitespace → hyphens
//   - strip everything outside [a-z0-9-]
//   - collapse repeated hyphens
//   - trim leading/trailing hyphens
// Then enforce length bounds. Throws on invalid input.
function validateRoomName(raw) {
  if (typeof raw !== "string") {
    throw new Error("Room name must be a string");
  }
  const normalized = raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalized.length < MIN_ROOM_NAME_LEN || normalized.length > MAX_ROOM_NAME_LEN) {
    throw new Error(
      `Room names use lowercase letters, numbers, and hyphens ` +
      `(${MIN_ROOM_NAME_LEN}–${MAX_ROOM_NAME_LEN} characters, e.g., "tuesday-game").`
    );
  }
  return normalized;
}

// Sanitize a player display name. Allows letters/digits/spaces, trims,
// collapses internal whitespace, caps length. Throws on empty result.
function sanitizePlayerName(raw) {
  const cleaned = String(raw || "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PLAYER_NAME_LEN);
  if (!cleaned) {
    throw new Error("Player name cannot be empty (use letters, numbers, and spaces).");
  }
  return cleaned;
}

// Validate and normalize a room config. Defaults are conservative.
function validateConfig(config) {
  const players = Number.isInteger(config?.players) ? config.players : 8;
  const rounds = Number.isInteger(config?.rounds) ? config.rounds : 2;
  if (!VALID_SEAT_COUNTS.includes(players)) {
    throw new Error(`players must be one of ${VALID_SEAT_COUNTS.join(", ")}`);
  }
  if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    throw new Error(`rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}`);
  }
  const seed = Number.isInteger(config?.seed) ? config.seed : null;
  return { players, rounds, seed };
}

// ─── Game state construction ──────────────────────────────────────────────
//
// Replaces the buildState helper that used to live in routes/moonlight.js.
// Same slot-by-random-seat algorithm; humans go into random positions in
// the seat list, AI persona names fill the rest.

function _buildGameState({ seed, totalSeats, humanNames, rng }) {
  const names = NAME_POOL.slice(0, totalSeats);
  const slottedSeats = [];

  for (const rawName of humanNames) {
    const finalName = rawName;
    // (Pool collisions are rejected at join time, so finalName === rawName.)
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

// ─── RoomState ────────────────────────────────────────────────────────────

class RoomState extends EventEmitter {
  constructor({ name, host, config }) {
    super();
    // With up to 9 connected players each subscribing to several events,
    // the default cap of 10 listeners is too tight.
    this.setMaxListeners(50);

    this.name = name;
    this.host = host;
    this.config = config;

    // Lobby roster — name → { joinedAt }. Host is always the first entry.
    this.players = new Map();
    this.players.set(host, { joinedAt: Date.now() });

    this.status = "lobby";       // lobby | running | finished
    this.gameState = null;
    this.hybridClient = null;
    this.waiters = null;         // Map<name, HumanWaiter>; populated at start
    this.costTracker = null;
    this.seed = null;
    this.createdAt = Date.now();
  }

  get roster() {
    return [...this.players.keys()];
  }

  // ── Lobby phase ──────────────────────────────────────────────────────

  addPlayer(rawName) {
    if (this.status !== "lobby") {
      throw new Error(`Cannot join: room is ${this.status}`);
    }
    const name = sanitizePlayerName(rawName);
    if (NAME_POOL.includes(name)) {
      throw new Error(`Player name "${name}" is reserved for AI characters. Pick another.`);
    }
    if (this.players.has(name)) {
      throw new Error(`A player named "${name}" is already in this room`);
    }
    if (this.players.size >= this.config.players) {
      throw new Error(`Room is full (${this.config.players} seats)`);
    }
    this.players.set(name, { joinedAt: Date.now() });
    this.emit("roster_changed", { roster: this.roster, joined: name });
    return name;
  }

  removePlayer(name) {
    if (this.status === "finished") return;
    if (this.status === "running") {
      // During the game, removal is a demote — different semantics.
      this.demote(name);
      return;
    }
    if (!this.players.has(name)) return;   // idempotent for unknowns

    this.players.delete(name);

    if (name === this.host) {
      // Host leaving the lobby kills the room — there's nobody to start.
      this.terminate("Host left the lobby");
      return;
    }
    this.emit("roster_changed", { roster: this.roster, left: name });
  }

  // ── Start the game ───────────────────────────────────────────────────
  //
  // Builds the GameState, HybridClient, and one HumanWaiter per human
  // seat, then transitions to 'running'. The orchestrator runs OUTSIDE
  // this method — the route owns invoking runGameStreaming and feeding
  // events back via emitGameEvent.
  //
  // costTracker and aiClient are dependency-injected: the route owns
  // their lifecycle (cost tracker preflight, API key, etc); the lobby
  // just holds the references and uses them.

  start({ costTracker, aiClient }) {
    if (this.status !== "lobby") {
      throw new Error(`Cannot start: room is ${this.status}`);
    }
    if (this.players.size === 0) {
      throw new Error(`Cannot start: room is empty`);
    }
    if (!costTracker) throw new Error("start() requires a costTracker");
    if (!aiClient) throw new Error("start() requires an aiClient");

    this.costTracker = costTracker;

    const seed = this.config.seed ?? Math.floor(Math.random() * 1e6);
    const rng = new SeededRng(seed);
    this.gameState = _buildGameState({
      seed,
      totalSeats: this.config.players,
      humanNames: this.roster,
      rng,
    });

    this.hybridClient = new HybridClient({ aiClient });
    this.waiters = new Map();
    const humanPlayers = this.gameState.players.filter(p => p.isHuman);
    for (const player of humanPlayers) {
      const w = new HumanWaiter(this.name, player.name);
      this.waiters.set(player.name, w);
      this.hybridClient.registerWaiter(player.name, w);
    }

    this.status = "running";
    this.seed = seed;
    this.emit("game_started", { seed, roster: this.roster });
  }

  // ── Running phase ────────────────────────────────────────────────────

  // Called by the route when the orchestrator emits a game event. Just
  // re-emits as 'game_event' for SSE-fanout subscribers to pick up.
  emitGameEvent(ev) {
    this.emit("game_event", ev);
  }

  // Called by the route when a connected player's SSE drops. Behavior
  // depends on phase:
  //   lobby  → treat as removePlayer
  //   running → AI takes over their seat (host drop terminates the room)
  //   finished → silent no-op
  demote(playerName) {
    if (this.status === "lobby") {
      this.removePlayer(playerName);
      return;
    }
    if (this.status !== "running") return;

    if (playerName === this.host) {
      this.terminate("Host disconnected mid-game");
      return;
    }

    if (!this.gameState) return;
    let player;
    try {
      player = this.gameState.getPlayer(playerName);
    } catch {
      return;   // player not in this game; silent no-op (race-safe)
    }

    // Fire-and-forget: the takeover's pending-turn AI call can take time.
    // Errors get logged but don't block the room.
    this.hybridClient.demoteToAi(player).catch(err => {
      console.error(`[room ${this.name}] demoteToAi failed for ${playerName}:`, err);
    });
    this.emit("player_demoted", { name: playerName });
  }

  // Called by the route when runGameStreaming returns naturally. Emits
  // game_finished (so SSE subscribers can show game-over UI) then
  // terminate (so the room cleans up).
  finish({ winner, finalDay }) {
    if (this.status !== "running") return;
    this.emit("game_finished", { winner, finalDay });
    this.terminate("Game completed");
  }

  // ── Termination ──────────────────────────────────────────────────────
  //
  // Always-fires end-of-room signal. Cleans up any pending waiters so
  // the orchestrator's awaited calls unstall. Idempotent.

  terminate(reason = "Room terminated") {
    if (this.status === "finished") return;

    const wasRunning = this.status === "running";
    this.status = "finished";

    if (wasRunning && this.hybridClient) {
      try { this.hybridClient.cancelAll(reason); } catch {}
    }

    this.emit("terminated", { reason });
  }
}

// ─── Registry operations ──────────────────────────────────────────────────

function createRoom({ rawName, rawHostName, config }) {
  const name = validateRoomName(rawName);
  if (rooms.has(name)) {
    throw new Error(`A room named "${name}" already exists`);
  }

  const hostName = sanitizePlayerName(rawHostName);
  if (NAME_POOL.includes(hostName)) {
    throw new Error(`Player name "${hostName}" is reserved for AI characters. Pick another.`);
  }

  const validConfig = validateConfig(config);

  const room = new RoomState({ name, host: hostName, config: validConfig });
  rooms.set(name, room);

  // Auto-remove from registry when the room ends, however it ends.
  room.once("terminated", () => {
    rooms.delete(name);
  });

  return room;
}

function getRoom(name) {
  return rooms.get(name) || null;
}

function listRooms() {
  return [...rooms.values()].map(r => ({
    name: r.name,
    host: r.host,
    playerCount: r.players.size,
    maxPlayers: r.config.players,
    status: r.status,
  }));
}

// For tests only — wipe the registry and terminate all open rooms.
function _clearAllRooms() {
  for (const room of rooms.values()) {
    try { room.terminate("Cleared for testing"); } catch {}
  }
  rooms.clear();
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  RoomState,
  createRoom,
  getRoom,
  listRooms,
  validateRoomName,
  sanitizePlayerName,
  NAME_POOL,
  buildGameState: _buildGameState,
  _clearAllRooms,
};