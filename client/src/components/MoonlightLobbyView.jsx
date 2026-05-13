// ═══════════════════════════════════════════════════════════════════════════
// MoonlightLobbyView.jsx — Lobby UI for Phase B multiplayer.
//
// Two views, switched via the `view` prop:
//   - "entry"     — create-or-join form (room name, display name)
//   - "in-lobby"  — waiting room (roster, start button, leave button)
//
// All state (roster, room name, isHost, etc) is owned by MoonlightView and
// passed down. This component is purely presentational — it renders the
// current state and emits callbacks; the parent does the API/SSE work.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { font, mono } from "../theme";
import { Card, Button } from "./shared";

export const MoonlightLobbyView = ({
  // Which sub-view to render.
  view,                     // "entry" | "in-lobby"

  // Entry-view props
  defaultName,              // pre-fill for display name field
  preset,                   // {label, players, rounds} from ConfigCard
  seed,
  onCreate,                 // (roomName, displayName) => void
  onJoin,                   // (roomName, displayName) => void
  onCancel,                 // back to ConfigCard
  submitting,               // disable buttons while request in flight

  // In-lobby props
  roomName,
  playerName,
  isHost,
  roster,                   // string[]
  roomConfig,               // {players, rounds, seed?}
  onStart,                  // host clicks start
  onLeave,                  // any player leaves the lobby
  starting,                 // disable start button while /start in flight

  // Common
  error,
  COLORS,
}) => {
  if (view === "entry") {
    return (
      <LobbyEntryForm
        COLORS={COLORS}
        defaultName={defaultName}
        preset={preset}
        seed={seed}
        onCreate={onCreate}
        onJoin={onJoin}
        onCancel={onCancel}
        submitting={submitting}
        error={error}
      />
    );
  }
  if (view === "in-lobby") {
    return (
      <LobbyWaitingRoom
        COLORS={COLORS}
        roomName={roomName}
        playerName={playerName}
        isHost={isHost}
        roster={roster}
        roomConfig={roomConfig}
        onStart={onStart}
        onLeave={onLeave}
        starting={starting}
        error={error}
      />
    );
  }
  return null;
};

// ─── LobbyEntryForm ───────────────────────────────────────────────────────

function LobbyEntryForm({ COLORS, defaultName, preset, seed, onCreate, onJoin, onCancel, submitting, error }) {
  const [subMode, setSubMode] = useState("create");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [displayName, setDisplayName] = useState(defaultName || "");

  const canSubmit = !submitting
    && roomNameInput.trim().length >= 3
    && displayName.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    if (subMode === "create") onCreate(roomNameInput.trim(), displayName.trim());
    else onJoin(roomNameInput.trim(), displayName.trim());
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
          textTransform: "uppercase", letterSpacing: "0.06em",
          marginBottom: 8, fontFamily: mono,
        }}>
          Multiplayer lobby
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
          Real Claude games run in named rooms. Create a new room or join an existing one with the room name your host shared.
        </div>
      </div>

      {/* Create / Join toggle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { value: "create", label: "Create new room" },
          { value: "join",   label: "Join existing room" },
        ].map(m => {
          const active = subMode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setSubMode(m.value)}
              style={{
                padding: "10px 14px", borderRadius: 7,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                background: active ? COLORS.accentDim : COLORS.surface,
                color: active ? COLORS.accent : COLORS.textBright,
                cursor: "pointer", textAlign: "center",
                fontFamily: font, fontSize: 12, fontWeight: active ? 700 : 500,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            display: "block", marginBottom: 5, fontFamily: mono,
          }}>
            Room name
          </label>
          <input
            value={roomNameInput}
            onChange={e => setRoomNameInput(e.target.value)}
            placeholder="tuesday-game"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              color: COLORS.textBright, fontSize: 13, padding: "8px 12px",
              fontFamily: mono, outline: "none",
            }}
          />
        </div>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            display: "block", marginBottom: 5, fontFamily: mono,
          }}>
            Your display name
          </label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              color: COLORS.textBright, fontSize: 13, padding: "8px 12px",
              fontFamily: font, outline: "none",
            }}
          />
        </div>
      </div>

      {/* Context info for create mode */}
      {subMode === "create" && preset && (
        <div style={{
          padding: "10px 12px", marginBottom: 14,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 6, fontSize: 11, color: COLORS.text, fontFamily: mono, lineHeight: 1.5,
        }}>
          You'll host a <strong>{preset.label}</strong> game ({preset.players} players, {preset.rounds} {preset.rounds === 1 ? "round" : "rounds"})
          {seed && <>, seed <strong>{seed}</strong></>}.
          Empty seats fill with AI when you start.
        </div>
      )}

      {/* Cost warning */}
      <div style={{
        padding: "10px 12px", marginBottom: 14,
        background: COLORS.amber + "15",
        border: `1px solid ${COLORS.amber}55`,
        borderRadius: 6,
        fontSize: 11, color: COLORS.amber, fontFamily: mono, lineHeight: 1.5,
      }}>
        ⚠ Real Claude mode uses your ANTHROPIC_API_KEY. Typical game costs $0.30–$1.50 in tokens. Daily and per-game caps apply.
      </div>

      {error && (
        <div style={{
          padding: "8px 12px", marginBottom: 14,
          background: COLORS.red + "15",
          border: `1px solid ${COLORS.red}55`,
          borderRadius: 6,
          fontSize: 12, color: COLORS.red, fontFamily: mono,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>Back</Button>
        <Button onClick={submit}>
          {submitting
            ? (subMode === "create" ? "Creating..." : "Joining...")
            : (subMode === "create" ? "Create room" : "Join room")}
        </Button>
      </div>
    </Card>
  );
}

// ─── LobbyWaitingRoom ─────────────────────────────────────────────────────

function LobbyWaitingRoom({ COLORS, roomName, playerName, isHost, roster, roomConfig, onStart, onLeave, starting, error }) {
  const seatsRemaining = roomConfig ? roomConfig.players - roster.length : 0;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{
        marginBottom: 16,
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 8,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            fontFamily: mono, marginBottom: 4,
          }}>
            Lobby · waiting{!isHost && " for host"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.textBright, fontFamily: mono }}>
            {roomName}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
            {roomConfig && (
              <>{roomConfig.players} seats · {roomConfig.rounds} {roomConfig.rounds === 1 ? "round" : "rounds"}</>
            )}
          </div>
        </div>
      </div>

      {/* Roster */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
          textTransform: "uppercase", letterSpacing: "0.06em",
          marginBottom: 8, fontFamily: mono,
        }}>
          Players ({roster.length}/{roomConfig?.players ?? "?"})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.map((name, idx) => {
            const isMe = name === playerName;
            const isRosterHost = idx === 0;
            return (
              <div key={name} style={{
                padding: "8px 12px", borderRadius: 6,
                background: isMe ? COLORS.accentDim : COLORS.surface,
                border: `1px solid ${isMe ? COLORS.accent : COLORS.border}`,
                fontSize: 13,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  fontFamily: mono,
                  color: isMe ? COLORS.accent : COLORS.textBright,
                  fontWeight: isMe ? 700 : 500,
                }}>
                  {name}
                </span>
                {isRosterHost && (
                  <span style={{
                    fontSize: 10, color: COLORS.amber,
                    fontFamily: mono, fontWeight: 700,
                  }}>
                    HOST
                  </span>
                )}
                {isMe && (
                  <span style={{
                    fontSize: 10, color: COLORS.textMuted, fontFamily: mono,
                  }}>
                    (you)
                  </span>
                )}
              </div>
            );
          })}
          {seatsRemaining > 0 && (
            <div style={{
              padding: "8px 12px", borderRadius: 6,
              background: COLORS.surface, border: `1px dashed ${COLORS.border}`,
              fontSize: 12, color: COLORS.textMuted, fontFamily: mono, fontStyle: "italic",
            }}>
              {seatsRemaining} empty {seatsRemaining === 1 ? "seat" : "seats"} · AI will fill when host starts
            </div>
          )}
        </div>
      </div>

      {/* Share hint for host */}
      {isHost && (
        <div style={{
          padding: "8px 12px", marginBottom: 14,
          background: COLORS.green + "10", border: `1px solid ${COLORS.green}40`,
          borderRadius: 6, fontSize: 12, color: COLORS.text, lineHeight: 1.5,
        }}>
          Share the room name{" "}
          <code style={{
            fontFamily: mono, fontWeight: 700,
            color: COLORS.green, background: COLORS.green + "15",
            padding: "1px 5px", borderRadius: 3,
          }}>
            {roomName}
          </code>
          {" "}with friends to invite them.
        </div>
      )}

      {error && (
        <div style={{
          padding: "8px 12px", marginBottom: 14,
          background: COLORS.red + "15",
          border: `1px solid ${COLORS.red}55`,
          borderRadius: 6,
          fontSize: 12, color: COLORS.red, fontFamily: mono,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Button variant="ghost" onClick={onLeave}>Leave lobby</Button>
        {isHost ? (
          <Button onClick={onStart}>
            {starting ? "Starting..." : "Start game"}
          </Button>
        ) : (
          <div style={{
            padding: "8px 12px", fontSize: 12,
            color: COLORS.textMuted, fontFamily: mono, fontStyle: "italic",
          }}>
            Waiting for host to start...
          </div>
        )}
      </div>
    </Card>
  );
}