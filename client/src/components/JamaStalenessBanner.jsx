// JamaStalenessBanner — auto-prompts users to refresh their Jama
// requirements when any saved import profile hasn't been run in a while.
//
// Renders nothing when:
//   - No profiles exist at all
//   - All profiles have been imported within the staleness threshold
//   - The user already dismissed the banner this session
//
// Designed to live at the top of RequirementsView (where Jama-imported
// data shows up), but it's a self-contained component that could be
// dropped anywhere that's commonly visited after sign-in.

import { useEffect, useState } from "react";
import { api } from "../api";
import { useTheme } from "../theme";
import { Button } from "./shared";

// "Stale" = no successful import within this many milliseconds.
// One constant, in ms, so we can pick any unit. Display label is derived
// from the value at render time.
//
// Current value: 5 minutes (TESTING — bump back to 24 * 60 * 60 * 1000
// for production once verified).
const STALENESS_MS = 24 * 60 * 60 * 1000;  // 24h — production

function stalenessLabel(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / (60 * 60_000))}h`;
  return `${Math.round(ms / (24 * 60 * 60_000))}d`;
}

// sessionStorage key — clears when the user closes the tab so they get
// nudged again next session if the profiles are still stale.
const DISMISS_KEY = "tf_jama_staleness_dismissed";

export const JamaStalenessBanner = ({ onRefresh }) => {
  const T = useTheme();
  const [staleProfiles, setStaleProfiles] = useState([]);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1"
  );

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    api.getJamaProfiles().then((data) => {
      if (cancelled) return;
      const cutoff = Date.now() - STALENESS_MS;
      const stale = (data.profiles || []).filter(isStale(cutoff));
      setStaleProfiles(stale);
    }).catch(() => { /* silent — banner just won't show */ });
    return () => { cancelled = true; };
  }, [dismissed]);

  if (dismissed || staleProfiles.length === 0) return null;

  const onDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const count = staleProfiles.length;
  const previewNames = staleProfiles.slice(0, 3).map((p) => p.name).join(", ");
  const overflow = count > 3 ? ` and ${count - 3} more` : "";

  return (
    <div style={{
      marginBottom: 16, padding: "10px 14px", background: T.amberDim,
      borderRadius: 6, border: `1px solid ${T.amber}33`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ fontSize: 16, color: T.amber }}>⟳</div>
      <div style={{ flex: 1, fontSize: 12, color: T.text, lineHeight: 1.5 }}>
        {count === 1 ? (
          <>
            Jama profile <strong>{staleProfiles[0].name}</strong> hasn't been refreshed
            in over {stalenessLabel(STALENESS_MS)}. Run an import to pull the latest requirements.
          </>
        ) : (
          <>
            <strong>{count} Jama profiles</strong> ({previewNames}{overflow}) haven't been
            refreshed in over {stalenessLabel(STALENESS_MS)}. Run imports to pull the latest requirements.
          </>
        )}
      </div>
      <Button small onClick={onRefresh}>Refresh now</Button>
      <Button variant="ghost" small onClick={onDismiss}>Not now</Button>
    </div>
  );
};

// A profile is stale if it has never been imported, or its last successful
// import is older than `cutoff` (a Date.now() - ms value).
function isStale(cutoff) {
  return (p) => {
    if (!p.last_imported_at) return true;
    // SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS" (no T/Z).
    const iso = p.last_imported_at.includes("T")
      ? p.last_imported_at
      : p.last_imported_at.replace(" ", "T") + "Z";
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return true; // unparseable timestamp — treat as stale
    return ms < cutoff;
  };
}
