// ═══════════════════════════════════════════════════════════════════════════
// MoonlightView.jsx — Multi-Agent Simulation Run (Phase B: named-room lobby)
//
// Modes of play:
//   - "fake"  — /api/moonlight/run, replayed with delays. AI-only, free.
//   - "real"  — lobby-based multiplayer. Create or join a named room, host
//               clicks start, AI fills empty seats. Mid-game disconnects
//               fall back to AI silently.
//
// Phase state machine:
//   configure   — initial; pick mode + preset
//   lobby-entry — real-Claude path: create/join form
//   in-lobby    — waiting for host to start (host or joiner view)
//   running     — game is live; orchestrator events fanning in via SSE
//   done        — game over, show summary
//
// SSE events (Phase B, per-player room stream):
//   config           — { name, host, status, config, roster, playerName, isHost }
//   roster_changed   — { roster, joined?|left? }
//   game_started     — { seed, roster }
//   game_event:<k>   — every orchestrator event (game_start, speech, etc)
//   you_are          — { name, role }                  (private to this player)
//   human_input_needed — { speaker, task, day, ... }   (private)
//   player_demoted   — { name }
//   game_finished    — { winner, finalDay }
//   terminated       — { reason }
//   done             — {}                              (last event; close SSE)
//
// Speech protocol (real mode, unchanged from Phase A):
//   speech_start  { speaker }
//   speech_chunk  { speaker, delta }
//   speech        { speaker, text }
//
// Visibility (client-side filtering, unchanged from Phase A):
//   When humanRole is set, the renderer skips/redacts events that the
//   human's role wouldn't have access to. (human_input_needed is server-
//   side filtered in Phase B; the other private events are still
//   client-filtered.)
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme, font, mono } from "../theme";
import { Card, Button, Select } from "./shared";
import { api } from "../api";
import { MoonlightLobbyView } from "./MoonlightLobbyView";

// ─── Presets ───────────────────────────────────────────────────────────────

const PRESETS = [
  { key: "quick",     label: "Quick",     players: 7, rounds: 1, hint: "~30 events · cheapest" },
  { key: "standard",  label: "Standard",  players: 8, rounds: 2, hint: "~70 events · recommended" },
  { key: "cinematic", label: "Cinematic", players: 9, rounds: 3, hint: "~120 events · expensive" },
];

const SPEED_OPTIONS = [
  { value: "fast",   label: "Fast",   delays: { speech: 150, beat: 80,  death: 300 } },
  { value: "normal", label: "Normal", delays: { speech: 350, beat: 150, death: 600 } },
  { value: "drama",  label: "Drama",  delays: { speech: 700, beat: 300, death: 1200 } },
];

const MODE_OPTIONS = [
  { value: "fake", label: "Demo (instant, free)" },
  { value: "real", label: "Real Claude (live, costs API tokens)" },
];

const ROLE_LABELS = {
  villager:  { name: "VILLAGER",  team: "village", desc: "No special powers. Your voice and your vote." },
  werewolf:  { name: "WEREWOLF",  team: "wolves",  desc: "Each night, agree on one player to kill." },
  seer:      { name: "SEER",      team: "village", desc: "Each night, learn one player's team." },
  bodyguard: { name: "BODYGUARD", team: "village", desc: "Each night, protect one player from the wolves." },
};

const TASK_LABELS = {
  speak:           "Your turn to speak",
  vote:            "Time to vote",
  wolf_propose:    "Propose tonight's kill",
  wolf_consensus:  "Confirm tonight's kill",
  investigate:     "Investigate a player",
  protect:         "Protect a player",
};

function delayFor(kind, delays) {
  if (kind === "speech") return delays.speech;
  if (kind === "death" || kind === "game_over") return delays.death;
  return delays.beat;
}

function filterEventForHuman(ev, humanRole, humanName) {
  if (!humanRole) return ev;
  switch (ev.kind) {
    case "wolves_decided":
      return humanRole === "werewolf" ? ev : null;
    case "night_action":
      return ev.data?.actor === humanName ? ev : null;
    case "validator_correction":
      return ev.data?.actor === humanName ? ev : null;
    case "night_resolution":
      if (humanRole !== "seer" && (ev.data?.seerTarget || ev.data?.seerResult)) {
        return { ...ev, data: { ...ev.data, seerTarget: null, seerResult: null } };
      }
      return ev;
    default:
      return ev;
  }
}

// Pre-fill display name from currentUser (cleaned), or fall back to "".
function defaultDisplayName(currentUser) {
  const raw = currentUser?.display_name || currentUser?.name || "";
  return String(raw).replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 20);
}

// ─── Component ─────────────────────────────────────────────────────────────

export const MoonlightView = ({ currentUser }) => {
  const COLORS = useTheme();

  const [mode, setMode] = useState("fake");
  const [presetKey, setPresetKey] = useState("standard");
  const [speed, setSpeed] = useState("normal");
  const [seed, setSeed] = useState("");

  // Phase: configure → (fake → running) | (lobby-entry → in-lobby → running) → done
  const [phase, setPhase] = useState("configure");
  const [error, setError] = useState("");
  const [allEvents, setAllEvents] = useState([]);
  const [shownEvents, setShownEvents] = useState([]);
  const [runMeta, setRunMeta] = useState(null);
  const [paused, setPaused] = useState(false);
  const [budget, setBudget] = useState(null);
  const [streamingSpeech, setStreamingSpeech] = useState(null);

  // Human play state — populated by the you_are event during the game.
  const [humanRole, setHumanRole] = useState(null);
  const [humanName, setHumanName] = useState(null);
  const humanRoleRef = useRef(null);
  const humanNameRef = useRef(null);

  // Lobby state — populated by config + roster_changed events.
  const [roomName, setRoomName] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [roster, setRoster] = useState([]);
  const [roomConfig, setRoomConfig] = useState(null);
  const [lobbySubmitting, setLobbySubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const roomNameRef = useRef(null);

  const [pendingInput, setPendingInput] = useState(null);

  const streamTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const cancelledRef = useRef(false);

  const transcriptRef = useRef(null);
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [shownEvents, streamingSpeech, pendingInput]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (eventSourceRef.current) eventSourceRef.current.close();
  }, []);

  useEffect(() => {
    fetch("/api/moonlight/budget", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b) setBudget(b); })
      .catch(() => {});
  }, []);

  const fakeStreamEvents = useCallback((events) => {
    cancelledRef.current = false;
    let i = 0;
    const speedConfig = SPEED_OPTIONS.find(s => s.value === speed) || SPEED_OPTIONS[1];
    const tick = () => {
      if (cancelledRef.current) return;
      if (i >= events.length) {
        setPhase("done");
        return;
      }
      const ev = events[i];
      setShownEvents(prev => [...prev, ev]);
      i++;
      const delay = delayFor(ev.kind, speedConfig.delays);
      streamTimerRef.current = setTimeout(tick, delay);
    };
    tick();
  }, [speed]);

  useEffect(() => {
    if (phase !== "running" || mode !== "fake") return;
    if (paused) {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    } else if (allEvents.length > 0 && shownEvents.length < allEvents.length) {
      const remaining = allEvents.slice(shownEvents.length);
      fakeStreamEvents(remaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, mode]);

  // Reset every kind of transient state. Called on begin/cancel/run-again.
  const resetAll = () => {
    setHumanRole(null);
    setHumanName(null);
    setPendingInput(null);
    humanRoleRef.current = null;
    humanNameRef.current = null;
    setRoomName(null);
    setIsHost(false);
    setRoster([]);
    setRoomConfig(null);
    roomNameRef.current = null;
    setLobbySubmitting(false);
    setStarting(false);
  };

  // ── Fake demo path ────────────────────────────────────────────────────

  const handleBeginFake = async () => {
    const preset = PRESETS.find(p => p.key === presetKey) || PRESETS[1];
    const body = { players: preset.players, rounds: preset.rounds };
    const seedNum = parseInt(seed, 10);
    if (!Number.isNaN(seedNum)) body.seed = seedNum;

    setError("");
    setAllEvents([]);
    setShownEvents([]);
    setRunMeta(null);
    setPaused(false);
    setStreamingSpeech(null);
    resetAll();
    setPhase("running");

    try {
      const result = await api.runMoonlightGame(body);
      if (cancelledRef.current) return;
      setAllEvents(result.transcript);
      setRunMeta({
        seed: result.seed, players: result.players, rounds: result.rounds,
        winner: result.winner, finalDay: result.finalDay, mode: "fake",
      });
      fakeStreamEvents(result.transcript);
    } catch (err) {
      setError(err.message || "Run failed");
      setPhase("configure");
    }
  };

  // ── Real-Claude path: lobby flow ──────────────────────────────────────

  // Step 1: clicking Begin in real mode transitions to the create/join form.
  const handleBeginReal = () => {
    setError("");
    setAllEvents([]);
    setShownEvents([]);
    setRunMeta(null);
    setPaused(false);
    setStreamingSpeech(null);
    resetAll();
    setPhase("lobby-entry");
  };

  // Open the per-player SSE stream for a room. Shared by Create and Join.
  const openRoomStream = useCallback((rmName, plName) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    cancelledRef.current = false;

    const params = new URLSearchParams({ playerName: plName });
    const url = `/api/moonlight/rooms/${encodeURIComponent(rmName)}/stream?${params.toString()}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    // ── Lobby events ────────────────────────────────────────────────

    es.addEventListener("config", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRoomName(d.name);
        roomNameRef.current = d.name;
        setHumanName(d.playerName);
        humanNameRef.current = d.playerName;
        setIsHost(!!d.isHost);
        setRoster(d.roster || []);
        setRoomConfig(d.config || null);
        setRunMeta({
          seed: d.config?.seed,
          players: d.config?.players,
          rounds: d.config?.rounds,
          mode: "real",
          playingAs: [d.playerName],
        });
        // Phase reflects the room's current status.
        if (d.status === "lobby") setPhase("in-lobby");
        else if (d.status === "running") setPhase("running");
        else if (d.status === "finished") setPhase("done");
      } catch {}
    });

    es.addEventListener("roster_changed", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (Array.isArray(d.roster)) setRoster(d.roster);
      } catch {}
    });

    es.addEventListener("game_started", () => {
      // Host clicked start. Move the UI into running phase; the orchestrator
      // events will flow shortly via game_event:<kind>.
      setAllEvents([]);
      setShownEvents([]);
      setStreamingSpeech(null);
      setPhase("running");
    });

    es.addEventListener("player_demoted", () => {
      // No visible UI in Phase B (Phase C could add a transcript banner).
    });

    es.addEventListener("game_finished", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRunMeta(prev => prev
          ? { ...prev, winner: d.winner, finalDay: d.finalDay }
          : { winner: d.winner, finalDay: d.finalDay, mode: "real" });
      } catch {}
    });

    es.addEventListener("terminated", (e) => {
      try {
        const d = JSON.parse(e.data);
        // "Game completed" is normal; anything else is worth surfacing.
        if (d.reason && d.reason !== "Game completed") {
          setError(`Room closed: ${d.reason}`);
        }
      } catch {}
    });

    // ── Budget ──────────────────────────────────────────────────────

    es.addEventListener("budget", (e) => {
      try { setBudget(JSON.parse(e.data)); } catch {}
    });

    // ── Private events ──────────────────────────────────────────────

    es.addEventListener("you_are", (e) => {
      try {
        const d = JSON.parse(e.data);
        humanRoleRef.current = d.role;
        humanNameRef.current = d.name;
        setHumanRole(d.role);
        setHumanName(d.name);
      } catch {}
    });

    es.addEventListener("human_input_needed", (e) => {
      try {
        const ev = JSON.parse(e.data);
        setPendingInput(ev.data);
      } catch {}
    });

    // ── Game events ─────────────────────────────────────────────────

    const handleGameEvent = (ev, kind) => {
      if (kind === "speech_start") {
        setStreamingSpeech({ speaker: ev.data?.speaker || "", text: "" });
        return;
      }
      if (kind === "speech_chunk") {
        const speaker = ev.data?.speaker || "";
        const delta = ev.data?.delta || "";
        setStreamingSpeech(prev =>
          prev && prev.speaker === speaker
            ? { ...prev, text: prev.text + delta }
            : { speaker, text: delta }
        );
        return;
      }
      if (kind === "speech") {
        setStreamingSpeech(null);
      }

      const filtered = filterEventForHuman(ev, humanRoleRef.current, humanNameRef.current);
      if (!filtered) return;

      setAllEvents(prev => [...prev, filtered]);
      setShownEvents(prev => [...prev, filtered]);

      if (kind === "game_over") {
        setRunMeta(prev => prev ? {
          ...prev,
          winner: ev.data?.winner,
          finalDay: ev.data?.finalDay,
        } : prev);
      }
    };

    const gameEventKinds = [
      "game_start", "night_begins", "discussion_round", "wolves_decided",
      "night_action", "validator_correction", "night_resolution", "death",
      "no_death",
      "speech_start", "speech_chunk", "speech",
      "role_claim", "vote_cast", "vote_resolution",
      "max_days_hit", "game_over",
    ];
    for (const kind of gameEventKinds) {
      es.addEventListener(kind, (e) => {
        try {
          const ev = JSON.parse(e.data);
          handleGameEvent(ev, kind);
        } catch {}
      });
    }

    // ── Error & done ────────────────────────────────────────────────

    es.addEventListener("error", (e) => {
      try {
        const d = e.data ? JSON.parse(e.data) : null;
        if (d) setError(`${d.kind || "error"}: ${d.message || "unknown error"}`);
        else setError("Connection lost. The game may have ended early.");
      } catch {
        setError("Connection lost.");
      }
    });

    es.addEventListener("done", () => {
      es.close();
      eventSourceRef.current = null;
      setStreamingSpeech(null);
      setPendingInput(null);
      setPhase("done");
    });
  }, []);

  // Create a new room (host's create+join action).
  const handleCreateRoom = async (rmName, displayName) => {
    setError("");
    setLobbySubmitting(true);
    try {
      const preset = PRESETS.find(p => p.key === presetKey) || PRESETS[1];
      const config = { players: preset.players, rounds: preset.rounds };
      const seedNum = parseInt(seed, 10);
      if (!Number.isNaN(seedNum)) config.seed = seedNum;

      const result = await api.createMoonlightRoom(rmName, displayName, config);
      // Server returns the sanitized room/seat names; use them.
      const seatedName = result.room?.host || displayName;
      const finalRoomName = result.room?.name || rmName;
      openRoomStream(finalRoomName, seatedName);
    } catch (err) {
      setError(err.message || "Failed to create room");
      setLobbySubmitting(false);
    }
  };

  // Join an existing room.
  const handleJoinRoom = async (rmName, displayName) => {
    setError("");
    setLobbySubmitting(true);
    try {
      const result = await api.joinMoonlightRoom(rmName, displayName);
      const seatedName = result.playerName || displayName;
      const finalRoomName = result.room?.name || rmName;
      openRoomStream(finalRoomName, seatedName);
    } catch (err) {
      setError(err.message || "Failed to join room");
      setLobbySubmitting(false);
    }
  };

  // Reset submitting flag once the config event lands (we're in the lobby now).
  useEffect(() => {
    if (phase === "in-lobby" || phase === "running") {
      setLobbySubmitting(false);
    }
  }, [phase]);

  // Host clicks Start in the waiting room.
  const handleStartLobbyGame = async () => {
    if (!roomNameRef.current || !humanNameRef.current) return;
    setError("");
    setStarting(true);
    try {
      await api.startMoonlightRoom(roomNameRef.current, humanNameRef.current);
      // Phase transition happens when the game_started SSE event arrives.
    } catch (err) {
      setError(err.message || "Failed to start game");
      setStarting(false);
    }
  };

  // ── Human-input submission (running game) ─────────────────────────────

  const handleHumanSubmit = async (response) => {
    const rmName = roomNameRef.current;
    const plName = humanNameRef.current;
    if (!rmName || !plName) {
      setError("No active session. Try starting a new game.");
      return;
    }
    try {
      await api.respondToMoonlight(rmName, plName, response);
      setPendingInput(null);
    } catch (err) {
      setError(`Failed to submit input: ${err.message}`);
    }
  };

  // ── Cancel / leave / run again ────────────────────────────────────────

  const handleCancel = () => {
    cancelledRef.current = true;
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (eventSourceRef.current) {
      // Closing the SSE triggers room.demote() server-side: lobby phase
      // removes us from the roster; running phase swaps us out for AI.
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setPhase("configure");
    setShownEvents([]);
    setAllEvents([]);
    setRunMeta(null);
    setStreamingSpeech(null);
    resetAll();
  };

  const handleRunAgain = () => {
    setPhase("configure");
    setShownEvents([]);
    setAllEvents([]);
    setRunMeta(null);
    setStreamingSpeech(null);
    resetAll();
    setError("");
  };

  // ── Begin button dispatcher ──────────────────────────────────────────

  const handleBegin = () => (mode === "real" ? handleBeginReal() : handleBeginFake());

  // ── Render ───────────────────────────────────────────────────────────

  const currentPreset = PRESETS.find(p => p.key === presetKey) || PRESETS[1];

  return (
    <div>
      <div style={{
        marginBottom: 24, display: "flex",
        justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
            Multi-Agent Simulation Run
          </h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
            Internal · v0.4
          </p>
        </div>
        {budget && <BudgetStrip COLORS={COLORS} budget={budget} />}
      </div>

      {/* Configure phase: choose mode/preset/speed/seed */}
      {phase === "configure" && (
        <>
          {error && (
            <Card style={{ marginBottom: 16, borderColor: COLORS.red }}>
              <div style={{ fontSize: 12, color: COLORS.red, fontFamily: mono }}>{error}</div>
            </Card>
          )}
          <ConfigCard
            COLORS={COLORS}
            mode={mode} setMode={setMode}
            presetKey={presetKey} setPresetKey={setPresetKey}
            speed={speed} setSpeed={setSpeed}
            seed={seed} setSeed={setSeed}
            onBegin={handleBegin}
            beginLabel={
              mode === "real" ? "Continue to lobby" : "Begin run"
            }
          />
        </>
      )}

      {/* Lobby phases (entry form + waiting room) */}
      {(phase === "lobby-entry" || phase === "in-lobby") && (
        <MoonlightLobbyView
          COLORS={COLORS}
          view={phase === "lobby-entry" ? "entry" : "in-lobby"}
          defaultName={defaultDisplayName(currentUser)}
          preset={currentPreset}
          seed={seed}
          onCreate={handleCreateRoom}
          onJoin={handleJoinRoom}
          onCancel={handleCancel}
          submitting={lobbySubmitting}
          roomName={roomName}
          playerName={humanName}
          isHost={isHost}
          roster={roster}
          roomConfig={roomConfig}
          onStart={handleStartLobbyGame}
          onLeave={handleCancel}
          starting={starting}
          error={error}
        />
      )}

      {/* Running phase: live game */}
      {phase === "running" && (
        <RunControlsCard
          COLORS={COLORS} mode={mode}
          paused={paused} setPaused={setPaused}
          onCancel={handleCancel}
          progress={allEvents.length > 0 ? shownEvents.length / allEvents.length : 0}
          shownCount={shownEvents.length}
        />
      )}

      {/* Done phase: summary */}
      {phase === "done" && runMeta && (
        <SummaryCard COLORS={COLORS} meta={runMeta} eventCount={allEvents.length} humanRole={humanRole} />
      )}
      {phase === "done" && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={handleRunAgain}>Run again</Button>
          </div>
        </Card>
      )}

      {/* Role badge — visible whenever the player has been assigned a role */}
      {humanRole && (phase === "running" || phase === "done") && (
        <RoleBadge COLORS={COLORS} role={humanRole} name={humanName} />
      )}

      {/* In-game error banner (separate from configure-phase error) */}
      {error && phase === "running" && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.red }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontFamily: mono }}>{error}</div>
        </Card>
      )}

      {/* Pending input card */}
      {pendingInput && phase === "running" && (
        <HumanInputCard
          COLORS={COLORS}
          pendingInput={pendingInput}
          onSubmit={handleHumanSubmit}
        />
      )}

      {/* Transcript — visible during running and done phases */}
      {(phase === "running" || phase === "done") && (
        <Card style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: COLORS.textBright,
            marginBottom: 12, display: "flex",
            justifyContent: "space-between", alignItems: "center",
          }}>
            <span>Transcript</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
              {shownEvents.length}{allEvents.length > 0 && mode === "fake" ? ` / ${allEvents.length}` : ""} events
            </span>
          </div>
          <div ref={transcriptRef} style={{
            maxHeight: "55vh", overflowY: "auto", padding: "8px 4px",
            background: COLORS.bg, borderRadius: 6,
            border: `1px solid ${COLORS.border}`, fontFamily: font,
          }}>
            {shownEvents.map((ev, i) => (
              <TranscriptLine key={i} event={ev} COLORS={COLORS} />
            ))}
            {streamingSpeech && streamingSpeech.text.length > 0 && (
              <StreamingSpeechLine
                speaker={streamingSpeech.speaker}
                text={streamingSpeech.text}
                COLORS={COLORS}
              />
            )}
            {phase === "running" && !streamingSpeech && !pendingInput && (
              <div style={{ padding: "6px 12px", fontSize: 11, color: COLORS.textMuted, fontFamily: mono, fontStyle: "italic" }}>
                {paused ? "paused" : (mode === "real" ? "waiting for Claude..." : "...")}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────

function BudgetStrip({ COLORS, budget }) {
  const today = budget.todayTotal || 0;
  const dailyCap = budget.caps?.dailyUsd || 0;
  const pct = dailyCap > 0 ? Math.min(100, (today / dailyCap) * 100) : 0;
  const thisGame = budget.thisGame || 0;

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", fontFamily: mono, fontSize: 11 }}>
      {thisGame > 0 && (
        <div>
          <div style={{ color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>
            this game
          </div>
          <div style={{ color: COLORS.accent, fontWeight: 700, fontSize: 13 }}>
            ${thisGame.toFixed(3)}
          </div>
        </div>
      )}
      <div>
        <div style={{ color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>
          today · ${today.toFixed(2)} / ${dailyCap.toFixed(0)}
        </div>
        <div style={{ width: 120, height: 4, background: COLORS.surface, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%",
            background: pct > 80 ? COLORS.red : pct > 50 ? COLORS.amber : COLORS.green,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ COLORS, mode, setMode, presetKey, setPresetKey, speed, setSpeed, seed, setSeed, onBegin, beginLabel }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 8, fontFamily: mono,
      }}>
        Mode
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {MODE_OPTIONS.map(m => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              style={{
                padding: "10px 14px", borderRadius: 7,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                background: active ? COLORS.accentDim : COLORS.surface,
                color: active ? COLORS.accent : COLORS.textBright,
                cursor: "pointer", textAlign: "left",
                fontFamily: font, fontSize: 12, fontWeight: active ? 700 : 500,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 8, fontFamily: mono,
      }}>
        Preset
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {PRESETS.map(p => {
          const active = presetKey === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setPresetKey(p.key)}
              style={{
                padding: "12px 14px", borderRadius: 7,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                background: active ? COLORS.accentDim : COLORS.surface,
                color: COLORS.textBright,
                cursor: "pointer", textAlign: "left",
                fontFamily: font, transition: "all 0.15s ease",
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? COLORS.accent : COLORS.textBright, marginBottom: 2,
              }}>{p.label}</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>
                {p.players} agents · {p.rounds} rounds
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginTop: 2 }}>
                {p.hint}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            display: "block", marginBottom: 5, fontFamily: mono,
          }}>
            Playback speed {mode === "real" && <span style={{ color: COLORS.textMuted, fontWeight: 400 }}>(demo only)</span>}
          </label>
          <Select
            value={speed}
            onChange={setSpeed}
            options={SPEED_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
            disabled={mode === "real"}
          />
        </div>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            display: "block", marginBottom: 5, fontFamily: mono,
          }}>
            Seed (optional)
          </label>
          <input
            value={seed}
            onChange={e => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="random"
            style={{
              width: "100%", boxSizing: "border-box",
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              color: COLORS.textBright, fontSize: 12, padding: "8px 12px",
              fontFamily: mono, outline: "none",
            }}
          />
        </div>
      </div>

      {mode === "real" && (
        <div style={{
          padding: "10px 12px", marginBottom: 16,
          background: COLORS.amber + "15",
          border: `1px solid ${COLORS.amber}55`,
          borderRadius: 6,
          fontSize: 11, color: COLORS.amber, fontFamily: mono, lineHeight: 1.5,
        }}>
          ⚠ Real Claude mode uses your ANTHROPIC_API_KEY. A typical Standard game costs $0.30–$1.50 in tokens. The server enforces a $3 per-game and $20 daily cap. You'll create or join a room next.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={onBegin}>{beginLabel}</Button>
      </div>
    </Card>
  );
}

function RunControlsCard({ COLORS, mode, paused, setPaused, onCancel, progress, shownCount }) {
  const showProgressBar = mode === "fake";
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 6 }}>
            {mode === "real"
              ? `Live · ${shownCount} events received`
              : `Running simulation · ${Math.round(progress * 100)}%`
            }
          </div>
          {showProgressBar && (
            <div style={{ height: 6, borderRadius: 3, background: COLORS.surface, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${Math.round(progress * 100)}%`,
                background: COLORS.accent, transition: "width 0.2s ease",
              }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {mode === "fake" && (
            <Button variant="secondary" small onClick={() => setPaused(p => !p)}>
              {paused ? "Resume" : "Pause"}
            </Button>
          )}
          <Button variant="ghost" small onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({ COLORS, meta, eventCount, humanRole }) {
  const winnerColor = meta.winner === "village" ? COLORS.green : meta.winner === "wolves" ? COLORS.red : COLORS.amber;
  const winnerLabel = meta.winner ? meta.winner.toUpperCase() : "INCONCLUSIVE";
  const youWon = humanRole && meta.winner === ROLE_LABELS[humanRole]?.team;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>
            Run complete · {meta.mode === "real" ? "real Claude" : "demo"}
            {humanRole && ` · you played as ${humanRole}`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: winnerColor }}>
            {winnerLabel} {meta.winner ? "wins" : ""}
            {humanRole && (
              <span style={{ marginLeft: 12, fontSize: 13, color: youWon ? COLORS.green : COLORS.red }}>
                ({youWon ? "you won" : "you lost"})
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Stat label="Day" value={meta.finalDay ?? "?"} COLORS={COLORS} />
          <Stat label="Events" value={eventCount} COLORS={COLORS} />
          <Stat label="Agents" value={meta.players} COLORS={COLORS} />
          <Stat label="Seed" value={meta.seed} COLORS={COLORS} useMono />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, COLORS, useMono }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 700, color: COLORS.textBright,
        fontFamily: useMono ? mono : font, marginTop: 2,
      }}>{value}</div>
    </div>
  );
}

function RoleBadge({ COLORS, role, name }) {
  const info = ROLE_LABELS[role] || { name: role.toUpperCase(), team: "?", desc: "" };
  const color = info.team === "wolves" ? COLORS.red : info.team === "village" ? COLORS.green : COLORS.accent;
  return (
    <Card style={{
      marginBottom: 14,
      borderColor: color,
      background: color + "10",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            You are {name && `· ${name}`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>
            {info.name}
          </div>
        </div>
        <div style={{ flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 1.5, minWidth: 200 }}>
          {info.desc}
        </div>
      </div>
    </Card>
  );
}

function HumanInputCard({ COLORS, pendingInput, onSubmit }) {
  const { task, validTargets, privateContext, livingPlayers } = pendingInput;
  const [draft, setDraft] = useState({ speech: "", target: "", reasoning: "" });
  const [submitting, setSubmitting] = useState(false);

  // Reset draft when a new input request arrives.
  useEffect(() => {
    setDraft({ speech: "", target: "", reasoning: "" });
    setSubmitting(false);
  }, [task, pendingInput?.day, pendingInput?.phase]);

  const taskLabel = TASK_LABELS[task] || `Action: ${task}`;
  const isSpeech = task === "speak";
  const isWolfChat = task === "wolf_propose" || task === "wolf_consensus";
  const isTarget = !isSpeech;

  let canSubmit = false;
  let response = null;
  if (isSpeech) {
    canSubmit = draft.speech.trim().length > 0;
    response = { speech: draft.speech.trim() };
  } else if (task === "vote") {
    canSubmit = !!draft.target;
    response = { vote: draft.target, reasoning: draft.reasoning || "" };
  } else {
    canSubmit = !!draft.target;
    response = { target: draft.target, reasoning: draft.reasoning || "" };
  }

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    await onSubmit(response);
  };

  return (
    <Card style={{ marginBottom: 14, borderColor: COLORS.accent }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Your turn · day {pendingInput.day} · {pendingInput.phase}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accent, marginTop: 2 }}>
          {taskLabel}
        </div>
      </div>

      {/* Private context display */}
      {privateContext && Object.keys(privateContext).length > 0 && (
        <PrivateContext COLORS={COLORS} task={task} context={privateContext} />
      )}

      {/* Input fields */}
      {isSpeech && (
        <textarea
          value={draft.speech}
          onChange={e => setDraft({ ...draft, speech: e.target.value })}
          placeholder="What do you say to the village? (1–2 sentences)"
          rows={3}
          autoFocus
          style={{
            width: "100%", boxSizing: "border-box",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            color: COLORS.textBright, fontSize: 13, padding: "10px 12px",
            fontFamily: font, outline: "none", resize: "vertical",
            marginBottom: 10,
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      )}

      {isTarget && (
        <TargetPicker
          COLORS={COLORS}
          targets={validTargets || []}
          selected={draft.target}
          onPick={t => setDraft({ ...draft, target: t })}
        />
      )}

      {isWolfChat && (
        <textarea
          value={draft.reasoning}
          onChange={e => setDraft({ ...draft, reasoning: e.target.value })}
          placeholder="Why? (Visible only to your fellow wolf)"
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            color: COLORS.textBright, fontSize: 13, padding: "10px 12px",
            fontFamily: font, outline: "none", resize: "vertical",
            marginTop: 10, marginBottom: 10,
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
          {isSpeech ? "Ctrl+Enter to submit" : ""}
        </div>
        <Button onClick={submit} disabled={!canSubmit || submitting}>
          {submitting ? "Sending..." : "Submit"}
        </Button>
      </div>
    </Card>
  );
}

function TargetPicker({ COLORS, targets, selected, onPick }) {
  if (!targets || targets.length === 0) {
    return (
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>
        No valid targets.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 10 }}>
      {targets.map(name => {
        const active = selected === name;
        return (
          <button
            key={name}
            onClick={() => onPick(name)}
            style={{
              padding: "10px 12px", borderRadius: 6,
              border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
              background: active ? COLORS.accentDim : COLORS.surface,
              color: active ? COLORS.accent : COLORS.textBright,
              cursor: "pointer", textAlign: "center",
              fontFamily: font, fontSize: 13,
              fontWeight: active ? 700 : 500,
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function PrivateContext({ COLORS, task, context }) {
  // Wolves chat history
  if ((task === "wolf_propose" || task === "wolf_consensus") && context.wolvesChat) {
    if (context.wolvesChat.length === 0) {
      return (
        <div style={{
          padding: "10px 12px", marginBottom: 12,
          background: COLORS.red + "10", border: `1px solid ${COLORS.red}40`,
          borderRadius: 6, fontSize: 11, color: COLORS.textMuted, fontFamily: mono,
          fontStyle: "italic",
        }}>
          Wolves chat is empty so far.
        </div>
      );
    }
    return (
      <div style={{
        padding: "10px 12px", marginBottom: 12,
        background: COLORS.red + "10", border: `1px solid ${COLORS.red}40`,
        borderRadius: 6,
      }}>
        <div style={{
          fontSize: 10, color: COLORS.red, fontFamily: mono,
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
        }}>
          Wolves' private chat
        </div>
        {context.wolvesChat.map((entry, i) => (
          <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, marginRight: 6 }}>{entry.speaker}:</span>
            {entry.text}
          </div>
        ))}
      </div>
    );
  }

  // Seer notebook
  if (task === "investigate" && context.notebook) {
    if (context.notebook.length === 0) {
      return (
        <div style={{
          padding: "10px 12px", marginBottom: 12,
          background: COLORS.purple ? COLORS.purple + "10" : COLORS.accent + "10",
          border: `1px solid ${(COLORS.purple || COLORS.accent) + "40"}`,
          borderRadius: 6, fontSize: 11, color: COLORS.textMuted, fontFamily: mono,
          fontStyle: "italic",
        }}>
          Notebook is empty — first investigation.
        </div>
      );
    }
    const purple = COLORS.purple || COLORS.accent;
    return (
      <div style={{
        padding: "10px 12px", marginBottom: 12,
        background: purple + "10", border: `1px solid ${purple}40`,
        borderRadius: 6,
      }}>
        <div style={{
          fontSize: 10, color: purple, fontFamily: mono,
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
        }}>
          Your notebook
        </div>
        {context.notebook.map((line, i) => (
          <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 2, fontFamily: mono }}>
            {line}
          </div>
        ))}
      </div>
    );
  }

  // Bodyguard last_protected
  if (task === "protect") {
    return (
      <div style={{
        padding: "8px 12px", marginBottom: 12,
        background: COLORS.green + "10", border: `1px solid ${COLORS.green}40`,
        borderRadius: 6, fontSize: 12, color: COLORS.text,
      }}>
        {context.lastProtected
          ? <>Last night you protected <strong>{context.lastProtected}</strong>. You can't protect them again tonight.</>
          : <>This is your first night — you can protect anyone.</>}
      </div>
    );
  }

  return null;
}

function TranscriptLine({ event, COLORS }) {
  const ev = event;
  if (ev.kind === "night_begins") {
    return <PhaseHeader text={`NIGHT ${ev.day}`} color={COLORS.purple || COLORS.accent} COLORS={COLORS} />;
  }
  if (ev.kind === "discussion_round" && ev.data?.round === 1) {
    return <PhaseHeader text={`DAY ${ev.day} — discussion`} color={COLORS.amber} COLORS={COLORS} />;
  }
  if (ev.kind === "discussion_round" && ev.data?.round > 1) {
    return (
      <div style={{ padding: "8px 14px 4px", fontSize: 10, color: COLORS.textMuted, fontFamily: mono, fontStyle: "italic" }}>
        — round {ev.data.round} —
      </div>
    );
  }
  if (ev.kind === "speech") {
    return (
      <div style={{ padding: "4px 14px", fontSize: 13, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700, color: COLORS.textBright, marginRight: 8 }}>{ev.data.speaker}</span>
        <span style={{ color: COLORS.textMuted, marginRight: 6 }}>»</span>
        <span style={{ color: COLORS.text }}>{ev.data.text}</span>
      </div>
    );
  }
  if (ev.kind === "role_claim") {
    const truthful = ev.data.claimed === ev.data.actual;
    const color = truthful ? COLORS.green : COLORS.red;
    return (
      <div style={{ padding: "0 14px 4px", marginLeft: 16, fontSize: 10, fontFamily: mono, color }}>
        ↑ {ev.data.speaker} claims {ev.data.claimed} ({truthful ? "TRUE" : "BLUFF"})
      </div>
    );
  }
  if (ev.kind === "wolves_decided") {
    return (
      <div style={{ padding: "6px 14px", fontSize: 12, color: COLORS.red, fontFamily: mono }}>
        Wolves agree to kill <strong>{ev.data.target}</strong>
      </div>
    );
  }
  if (ev.kind === "night_action") {
    const role = ev.data.role || "";
    const color = role === "seer" ? (COLORS.purple || COLORS.accent) : COLORS.green;
    const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
    return (
      <div style={{ padding: "4px 14px", fontSize: 12, color, fontFamily: mono }}>
        {roleTitle} ({ev.data.actor}) → {ev.data.target}
      </div>
    );
  }
  if (ev.kind === "night_resolution") {
    const lines = [];
    if (ev.data.seerResult) {
      const teamColor = ev.data.seerResult === "wolves" ? COLORS.red : COLORS.green;
      lines.push(
        <div key="seer" style={{ padding: "4px 14px", fontSize: 12, color: COLORS.purple || COLORS.accent, fontFamily: mono }}>
          Seer learns: {ev.data.seerTarget} is{" "}
          <span style={{ color: teamColor, fontWeight: 700 }}>{ev.data.seerResult.toUpperCase()}</span>
        </div>
      );
    }
    if (ev.data.protected) {
      lines.push(
        <div key="prot" style={{ padding: "4px 14px", fontSize: 12, color: COLORS.green, fontFamily: mono }}>
          Bodyguard saves the night — no death.
        </div>
      );
    }
    return lines.length > 0 ? <>{lines}</> : null;
  }
  if (ev.kind === "no_death") {
    return (
      <div style={{ padding: "6px 14px", fontSize: 12, color: COLORS.textMuted, fontFamily: mono, fontStyle: "italic" }}>
        The night passed quietly — nobody died.
      </div>
    );
  }
  if (ev.kind === "death") {
    const wasWolf = ev.data.roleRevealed === "werewolf";
    const roleColor = wasWolf ? COLORS.red : COLORS.green;
    const banner = ev.data.cause === "wolves" ? COLORS.red : COLORS.amber;
    const icon = ev.data.cause === "wolves" ? "☾" : "☼";
    const label = ev.data.cause === "wolves" ? "killed by wolves" : "voted out";
    return (
      <div style={{
        margin: "8px 8px", padding: "8px 12px",
        background: banner + "15", borderLeft: `3px solid ${banner}`,
        borderRadius: 4, fontSize: 13,
      }}>
        <span style={{ color: banner, fontWeight: 700 }}>{icon} {ev.data.victim}</span>
        <span style={{ color: COLORS.text }}> was {label}.</span>
        <span style={{ color: COLORS.textMuted, marginLeft: 8, fontSize: 11, fontFamily: mono }}>
          (was <span style={{ color: roleColor }}>{ev.data.roleRevealed}</span>)
        </span>
      </div>
    );
  }
  if (ev.kind === "vote_resolution") {
    const tallyStr = Object.entries(ev.data.tally || {})
      .sort((a, b) => b[1] - a[1])
      .map(([n, c]) => `${n}:${c}`).join("  ");
    return (
      <div style={{ padding: "6px 14px", fontSize: 11, color: COLORS.amber, fontFamily: mono }}>
        Tally: {tallyStr}
        {ev.data.tied && (
          <span style={{ marginLeft: 12, color: COLORS.textMuted, fontStyle: "italic" }}>tied — no elimination</span>
        )}
      </div>
    );
  }
  if (ev.kind === "validator_correction") {
    return (
      <div style={{ padding: "4px 14px", fontSize: 10, color: COLORS.amber, fontFamily: mono, fontStyle: "italic" }}>
        [validator] {ev.data.actor} corrected ({ev.data.reason})
      </div>
    );
  }
  if (ev.kind === "game_over") {
    const winner = ev.data.winner;
    const color = winner === "village" ? COLORS.green : winner === "wolves" ? COLORS.red : COLORS.amber;
    return (
      <div style={{
        margin: "12px 8px 6px", padding: "12px 14px",
        background: color + "18", border: `1px solid ${color}`,
        borderRadius: 6, textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>
          GAME OVER
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>
          {(winner || "no").toUpperCase()} wins on day {ev.data.finalDay}
        </div>
      </div>
    );
  }
  if (ev.kind === "vote_cast") {
    return (
      <div style={{ padding: "1px 14px", fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>
        {ev.data.voter} → {ev.data.target}
      </div>
    );
  }
  return null;
}

function StreamingSpeechLine({ speaker, text, COLORS }) {
  return (
    <div style={{ padding: "4px 14px", fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 700, color: COLORS.textBright, marginRight: 8 }}>{speaker}</span>
      <span style={{ color: COLORS.textMuted, marginRight: 6 }}>»</span>
      <span style={{ color: COLORS.text }}>{text}</span>
      <span style={{
        color: COLORS.accent, marginLeft: 1,
        opacity: 0.7, fontFamily: mono,
      }}>▋</span>
    </div>
  );
}

function PhaseHeader({ text, color, COLORS }) {
  return (
    <div style={{
      margin: "12px 0 4px", padding: "6px 14px",
      borderTop: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.surface,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, fontFamily: mono,
        color, textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        — {text} —
      </span>
    </div>
  );
}
