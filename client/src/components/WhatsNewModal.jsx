// Centered modal that surfaces unseen release notes on login. The
// list of entries is owned by `client/src/whatsNew.js`; this component
// is purely presentational. Dismissal is the caller's responsibility
// (they update localStorage and unmount us).

import { useEffect } from "react";
import { useTheme, font, mono } from "../theme";
import { Button } from "./shared";

export const WhatsNewModal = ({ entries, onDismiss }) => {
  const T = useTheme();

  // Escape-key closes the modal — same affordance as the [Got it] button.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onDismiss?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (!entries || entries.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        animation: "whatsNewFade 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          color: T.text,
          fontFamily: font,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          maxWidth: 560,
          width: "100%",
          maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div style={{
          padding: "18px 22px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 id="whats-new-title" style={{
            fontSize: 16, fontWeight: 700, color: T.textBright, margin: 0,
            letterSpacing: "0.02em",
          }}>
            What's new
          </h2>
          <button
            onClick={onDismiss}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: T.textMuted, fontSize: 22, padding: 0, lineHeight: 1,
            }}
            title="Close"
            aria-label="Close"
          >×</button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 22px", flex: 1 }}>
          {entries.map((entry, i) => (
            <div key={entry.id} style={{ marginBottom: i < entries.length - 1 ? 24 : 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>
                  {entry.title}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, fontFamily: mono }}>
                  {entry.date}
                </div>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: T.text }}>
                {entry.bullets.map((b, bi) => (
                  <li key={bi} style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 6 }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          padding: "12px 22px 18px",
          borderTop: `1px solid ${T.border}`,
          display: "flex", justifyContent: "flex-end",
        }}>
          <Button small onClick={onDismiss}>Got it</Button>
        </div>
      </div>

      <style>{`
        @keyframes whatsNewFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
