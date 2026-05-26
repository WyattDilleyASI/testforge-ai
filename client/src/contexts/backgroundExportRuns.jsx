// Tracks Jama export runs after the user closes the dialog so we can
// fire a toast when each one finishes. The context exposes a single
// `monitor(runId, label)` function — call it just before unmounting the
// run flow if the run is still in progress. The provider polls each
// active run every 3 seconds, fires the completion callback on done /
// failed, and persists the active set in localStorage so a page
// refresh doesn't drop in-flight runs.

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api";

const STORAGE_KEY = "tf_bg_export_runs";
const POLL_INTERVAL_MS = 3_000;

const BackgroundExportRunsContext = createContext({
  monitor: () => {},
});

export const useBackgroundExportRuns = () => useContext(BackgroundExportRunsContext);

// Provider holds a map of runId → label (for the toast text). When a
// run reports status 'done' or 'failed', we invoke onComplete(payload)
// and drop it from the map.
export const BackgroundExportRunsProvider = ({ onComplete, children }) => {
  // active = { [runId]: { label, startedAt } }
  const [active, setActive] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  });
  // Stale-closure guard for the polling loop.
  const activeRef = useRef(active);
  activeRef.current = active;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Persist.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(active)); } catch (_) {}
  }, [active]);

  // Single shared poll loop.
  useEffect(() => {
    const tick = async () => {
      const ids = Object.keys(activeRef.current);
      if (ids.length === 0) return;
      for (const runIdStr of ids) {
        const runId = Number(runIdStr);
        try {
          const { run } = await api.getJamaExportRun(runId);
          if (!run) {
            // Run vanished — drop it.
            setActive((prev) => { const next = { ...prev }; delete next[runIdStr]; return next; });
            continue;
          }
          if (run.status === "done" || run.status === "failed") {
            const meta = activeRef.current[runIdStr] || {};
            setActive((prev) => { const next = { ...prev }; delete next[runIdStr]; return next; });
            onCompleteRef.current?.({
              runId,
              status: run.status,
              label: meta.label || `Run ${runId}`,
              createdCount: run.created_count || 0,
              updatedCount: run.updated_count || 0,
              errorMessage: run.error_message || "",
              destinationName: run.destination_name || "",
            });
          }
        } catch (_) { /* network blip; retry next tick */ }
      }
    };
    const t = setInterval(tick, POLL_INTERVAL_MS);
    // Run one tick immediately on mount to catch runs that finished
    // while the user was on another page or refreshed.
    tick();
    return () => clearInterval(t);
  }, []); // empty deps — refs handle current state

  const monitor = useCallback((runId, label) => {
    setActive((prev) => ({
      ...prev,
      [String(runId)]: { label, startedAt: Date.now() },
    }));
  }, []);

  return (
    <BackgroundExportRunsContext.Provider value={{ monitor }}>
      {children}
    </BackgroundExportRunsContext.Provider>
  );
};
