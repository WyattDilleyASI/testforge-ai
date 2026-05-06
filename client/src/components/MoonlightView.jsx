// ═══════════════════════════════════════════════════════════════════════════
// MoonlightView.jsx — Multi-Agent Simulation Run (Pass A)
//
// Two modes:
//   - "fake"  Uses /api/moonlight/run, then reveals events on a timer.
//             ~50ms server time; client-side delay paces the reveal.
//             Free, instant, deterministic.
//   - "real"  Uses /api/moonlight/stream (SSE) with real Claude API.
//             Events arrive when Claude generates them; cost is real.
//             ~30-90s wall clock; transcript reads live.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme, font, mono } from "../theme";
import { Card, Button, Select } from "./shared";
import { api } from "../api";

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

function delayFor(kind, delays) {
  if (kind === "speech") return delays.speech;
  if (kind === "death" || kind === "game_over") return delays.death;
  return delays.beat;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const MoonlightView = ({ currentUser }) => {
  const COLORS = useTheme();

  const [mode, setMode] = useState("fake");
  const [presetKey, setPresetKey] = useState("standard");
  const [speed, setSpeed] = useState("normal");
  const [seed, setSeed] = useState("");

  const [phase, setPhase] = useState("configure");
  const [error, setError] = useState("");
  const [allEvents, setAllEvents] = useState([]);
  const [shownEvents, setShownEvents] = useState([]);
  const [runMeta, setRunMeta] = useState(null);
  const [paused, setPaused] = useState(false);
  const [budget, setBudget] = useState(null);

  const streamTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const cancelledRef = useRef(false);

  const transcriptRef = useRef(null);
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [shownEvents]);

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

  const handleBeginReal = () => {
    const preset = PRESETS.find(p => p.key === presetKey) || PRESETS[1];
    const params = new URLSearchParams();
    params.set("players", String(preset.players));
    params.set("rounds", String(preset.rounds));
    const seedNum = parseInt(seed, 10);
    if (!Number.isNaN(seedNum)) params.set("seed", String(seedNum));

    setError("");
    setAllEvents([]);
    setShownEvents([]);
    setRunMeta(null);
    setPaused(false);
    setPhase("running");
    cancelledRef.current = false;

    const url = `/api/moonlight/stream?${params.toString()}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener("config", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRunMeta({
          seed: d.seed, players: d.players, rounds: d.rounds,
          model: d.model, mode: "real",
        });
      } catch {}
    });

    es.addEventListener("budget", (e) => {
      try { setBudget(JSON.parse(e.data)); } catch {}
    });

    const gameEventKinds = [
      "game_start", "night_begins", "discussion_round", "wolves_decided",
      "night_action", "validator_correction", "night_resolution", "death",
      "no_death", "speech", "role_claim", "vote_cast", "vote_resolution",
      "max_days_hit", "game_over",
    ];
    for (const kind of gameEventKinds) {
      es.addEventListener(kind, (e) => {
        try {
          const ev = JSON.parse(e.data);
          setAllEvents(prev => [...prev, ev]);
          setShownEvents(prev => [...prev, ev]);
          if (kind === "game_over") {
            setRunMeta(prev => prev ? {
              ...prev,
              winner: ev.data?.winner,
              finalDay: ev.data?.finalDay,
            } : prev);
          }
        } catch {}
      });
    }

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
      setPhase("done");
    });
  };

  const handleBegin = () => (mode === "real" ? handleBeginReal() : handleBeginFake());

  const handleCancel = () => {
    cancelledRef.current = true;
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setPhase("configure");
    setShownEvents([]);
    setAllEvents([]);
    setRunMeta(null);
  };

  const handleRunAgain = () => {
    setPhase("configure");
    setShownEvents([]);
    setAllEvents([]);
    setRunMeta(null);
    setError("");
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
            Multi-Agent Simulation Run
          </h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
            Internal · v0.2
          </p>
        </div>
        {budget && <BudgetStrip COLORS={COLORS} budget={budget} />}
      </div>

      {error && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.red }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontFamily: mono }}>{error}</div>
        </Card>
      )}

      {phase !== "running" && (
        <ConfigCard
          COLORS={COLORS}
          mode={mode} setMode={setMode}
          presetKey={presetKey} setPresetKey={setPresetKey}
          speed={speed} setSpeed={setSpeed}
          seed={seed} setSeed={setSeed}
          onBegin={phase === "done" ? handleRunAgain : handleBegin}
          beginLabel={phase === "done" ? "Run again" : (mode === "real" ? "Begin run (real Claude)" : "Begin run")}
        />
      )}

      {phase === "running" && (
        <RunControlsCard
          COLORS={COLORS} mode={mode}
          paused={paused} setPaused={setPaused}
          onCancel={handleCancel}
          progress={allEvents.length > 0 ? shownEvents.length / allEvents.length : 0}
          shownCount={shownEvents.length}
        />
      )}

      {phase === "done" && runMeta && (
        <SummaryCard COLORS={COLORS} meta={runMeta} eventCount={allEvents.length} />
      )}

      {(phase === "running" || phase === "done") && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            {phase === "running" && (
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
          padding: "10px 12px", marginBottom: 14,
          background: COLORS.amberDim || (COLORS.amber + "18"),
          border: `1px solid ${COLORS.amber}55`,
          borderRadius: 6,
          fontSize: 11, color: COLORS.amber, fontFamily: mono, lineHeight: 1.5,
        }}>
          ⚠ Real Claude mode uses your ANTHROPIC_API_KEY. A typical Standard game costs $0.30-$1.50 in tokens. The server enforces a $3 per-game and $20 daily cap.
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

function SummaryCard({ COLORS, meta, eventCount }) {
  const winnerColor = meta.winner === "village" ? COLORS.green : meta.winner === "wolves" ? COLORS.red : COLORS.amber;
  const winnerLabel = meta.winner ? meta.winner.toUpperCase() : "INCONCLUSIVE";
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>
            Run complete · {meta.mode === "real" ? "real Claude" : "demo"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: winnerColor }}>
            {winnerLabel} {meta.winner ? "wins" : ""}
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
        fontSize: 10, fontWeight: 600, color: COLORS.textMuted,
        textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: mono,
      }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 700, color: COLORS.textBright,
        fontFamily: useMono ? mono : font, marginTop: 2,
      }}>{value}</div>
    </div>
  );
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
