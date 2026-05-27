// Once-per-user dismissable callouts. Use these to point out a brand-new
// UI surface that an existing user wouldn't recognize. The id is the
// dismissal key — stored in localStorage as a JSON-encoded array of ids
// — so future releases can reuse this component for new hints just by
// picking a fresh id.
//
// Usage:
//   <Callout id="jama-export-destination-step" title="New: per-run destination">
//     Pick a different Set without changing the profile default.
//   </Callout>
//
// If the user has previously dismissed an id, the component renders
// nothing. Dismissing writes the id into localStorage and unmounts.

import { useState, useCallback } from "react";
import { useTheme } from "../theme";

const STORAGE_KEY = "tf_callouts_dismissed";

function readDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeDismissed(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (_) {}
}

// Hook form — when you need to gate something other than the callout
// itself on the dismissal state (e.g. shifting layout). For the common
// case, just render <Callout> directly; it self-gates.
export function useCalloutDismissed(id) {
  const [dismissed, setDismissed] = useState(() => readDismissed().includes(id));
  const dismiss = useCallback(() => {
    const ids = readDismissed();
    if (!ids.includes(id)) {
      ids.push(id);
      writeDismissed(ids);
    }
    setDismissed(true);
  }, [id]);
  return [dismissed, dismiss];
}

export const Callout = ({
  id,
  title,
  children,
  variant = "info", // "info" | "tip" — only affects accent color
  style: styleOverride,
}) => {
  const T = useTheme();
  const [dismissed, dismiss] = useCalloutDismissed(id);
  if (dismissed) return null;

  const accent = variant === "tip" ? T.green : T.accent;
  const bg = variant === "tip" ? T.greenDim : T.accentDim || `${T.accent}22`;

  return (
    <div style={{
      padding: "10px 12px",
      background: bg,
      border: `1px solid ${accent}55`,
      borderRadius: 6,
      marginBottom: 12,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      ...styleOverride,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 4 }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>
          {children}
        </div>
      </div>
      <button
        onClick={dismiss}
        title="Got it — don't show this again"
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: T.textMuted,
          fontSize: 16,
          padding: "0 2px",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >×</button>
    </div>
  );
};
