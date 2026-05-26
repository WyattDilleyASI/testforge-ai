// JamaExportRunFlow — push selected TCs from the library into a Jama Set.
//
// Triggered from TestCaseLibraryView's bulk action bar ("Push to Jama").
// Internal state machine:
//   loading_profiles → no_profiles
//                    → pick_profile  (only if >1 profile)
//                    → preflight     (shows split: new vs update)
//                    → creds
//                    → running       (SSE log)
//                    → done | failed
//
// Credentials are entered fresh (same as imports) and never persisted.

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Button, ErrorBanner } from "./shared";
import { CredsView, StatusBadge, LogPane } from "./JamaImportView";
import { JamaTreePicker } from "./JamaTreePicker";
import { useBackgroundExportRuns } from "../contexts/backgroundExportRuns";

const LAST_USERNAME_KEY = "tf_last_jama_username";

export const JamaExportRunFlow = ({
  selectedTestCases,        // array of TC rows from the library (need .tc_id + .jama_id)
  onClose,
  onExportComplete,
}) => {
  const T = useTheme();
  const { monitor: monitorBackgroundRun } = useBackgroundExportRuns();
  const tcIds = selectedTestCases.map((tc) => tc.tc_id);

  // mode: loading_profiles | no_profiles | pick_profile | preflight |
  //       destination | creds | running | done | failed
  const [mode, setMode] = useState("loading_profiles");
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Destination override state — null until the user confirms, then either
  // { jama_id, name } if they picked a non-default Set, or "use_default" to
  // signal they explicitly kept the default (so we don't show "Change" again).
  // Effective destination for display = override ?? profile default.
  const [destinationOverride, setDestinationOverride] = useState(null);
  const effectiveDestination = destinationOverride
    ? { jama_id: destinationOverride.jama_id, name: destinationOverride.name }
    : profile ? { jama_id: profile.default_destination_jama_id, name: profile.default_destination_name } : null;

  // Tree picker state for the destination step.
  const [destTree, setDestTree] = useState(null);          // V&V subtree, or null
  const [destExpanded, setDestExpanded] = useState(new Set());
  const [destSelected, setDestSelected] = useState(null);  // selected tree node
  const [destLoading, setDestLoading] = useState(false);
  const [destLoadError, setDestLoadError] = useState("");

  // Start both fields empty so the browser's autofill can populate
  // username AND password as a pair. Programmatically pre-filling the
  // username trips Chrome's "this is a fresh login, fill both" heuristic,
  // resulting in only the username being filled.
  const [credsForm, setCredsForm] = useState({ username: "", password: "" });

  const [activeRunId, setActiveRunId] = useState(null);
  const [runLog, setRunLog] = useState([]);
  const [runStatus, setRunStatus] = useState(null);
  const eventSourceRef = useRef(null);

  // Preflight split — how many of the selected TCs are new vs updates.
  const splitCounts = (() => {
    let create = 0, update = 0;
    for (const tc of selectedTestCases) {
      if (tc.jama_id) update++;
      else create++;
    }
    return { create, update };
  })();

  // ── Effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getJamaExportProfiles();
        const all = data.profiles || [];
        setProfiles(all);
        if (all.length === 0) { setMode("no_profiles"); return; }
        if (all.length === 1) {
          setProfile(all[0]);
          setMode("preflight");
        } else {
          setMode("pick_profile");
        }
      } catch (e) {
        setError(e.message);
        setMode("no_profiles");
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    const es = new EventSource(`/api/jama/export-runs/${activeRunId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("log", (e) => {
      try {
        const entry = JSON.parse(e.data);
        setRunLog((prev) => [...prev, entry]);
      } catch {}
    });
    es.addEventListener("status", (e) => {
      try {
        const update = JSON.parse(e.data);
        setRunStatus(update);
        if (update.status === "done") {
          es.close();
          setMode("done");
        } else if (update.status === "failed") {
          es.close();
          setMode("failed");
        }
      } catch {}
    });
    es.addEventListener("error", (e) => {
      if (e?.data) {
        try {
          const err = JSON.parse(e.data);
          setError(err.error || "SSE error");
        } catch {}
      }
    });
    return () => { es.close(); eventSourceRef.current = null; };
  }, [activeRunId]);

  // ── Actions ──────────────────────────────────────────────────────────
  const pickProfile = (p) => { setProfile(p); setError(""); setMode("preflight"); };

  // Load the cached project tree for the destination picker. Pre-expands the
  // path down to the current default destination and pre-selects it.
  const goToDestination = async () => {
    setError("");
    setMode("destination");
    if (destTree) return; // already loaded for this profile
    setDestLoading(true);
    setDestLoadError("");
    try {
      const data = await api.getJamaExportProjectTree(profile.id);
      const vv = (data.tree.children || []).find((c) => c.name === "Verification & Validation");
      if (!vv) {
        setDestLoadError(
          'This project\'s cached tree has no "Verification & Validation" component. ' +
          "Refresh the tree from Configure Jama export and try again, or continue with the saved default."
        );
        return;
      }
      setDestTree(vv);
      const auto = new Set([vv.jama_id]);
      const defaultId = effectiveDestination?.jama_id;
      if (defaultId) {
        const found = findNodeById(vv, defaultId);
        if (found) {
          setDestSelected(found);
          for (const ancestorId of (pathTo(vv, defaultId) || [])) auto.add(ancestorId);
        }
      }
      setDestExpanded(auto);
    } catch (e) {
      if (/not cached|not yet|404/i.test(e.message)) {
        setDestLoadError(
          "No tree cached for this profile yet. Refresh it from Configure Jama export first, " +
          "or continue with the saved default."
        );
      } else {
        setDestLoadError(e.message);
      }
    } finally {
      setDestLoading(false);
    }
  };

  const toggleDestExpand = (jamaId) => {
    setDestExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jamaId)) next.delete(jamaId); else next.add(jamaId);
      return next;
    });
  };

  const confirmDestination = () => {
    // If the user picked a Set that differs from the profile default, store
    // an override. If it matches the default, clear the override (cleaner
    // for the server's audit-log line).
    if (destSelected && destSelected.type === "set") {
      const isDefault = destSelected.jama_id === profile.default_destination_jama_id;
      setDestinationOverride(isDefault ? null : { jama_id: destSelected.jama_id, name: destSelected.name });
    } else {
      setDestinationOverride(null);
    }
    setError("");
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds");
  };

  // Keeping the default without opening the picker (when tree fetch fails).
  const skipDestinationPicker = () => {
    setDestinationOverride(null);
    setError("");
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds");
  };

  const submitCreds = async () => {
    if (!credsForm.username || !credsForm.password) {
      setError("Username and password are required");
      return;
    }
    setError(""); setBusy(true);
    try {
      localStorage.setItem(LAST_USERNAME_KEY, credsForm.username);
      const { run_id } = await api.startJamaExportRun(
        profile.id, credsForm.username, credsForm.password, tcIds, destinationOverride
      );
      // Wipe password ASAP.
      setCredsForm((f) => ({ ...f, password: "" }));
      setRunLog([]); setRunStatus(null);
      setActiveRunId(run_id);
      setMode("running");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const finishDone = () => {
    onExportComplete?.();
    onClose?.();
  };

  // Close the dialog without cancelling the run. Hands the runId off to
  // the background monitor so a toast fires when Jama finishes (or
  // fails). The server-side job is already independent of the SSE
  // stream — closing just stops our local subscription.
  const closeKeepRunning = () => {
    if (activeRunId) {
      const label = effectiveDestination?.name || profile?.name || "";
      monitorBackgroundRun(activeRunId, label);
    }
    onClose?.();
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Card style={{ marginBottom: 16, padding: 16 }}>
      <Header T={T} mode={mode} tcCount={tcIds.length} onClose={mode === "running" ? closeKeepRunning : onClose} />
      <ErrorBanner msg={error} />

      {mode === "loading_profiles" && (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
          Loading export profiles...
        </div>
      )}

      {mode === "no_profiles" && (
        <NoProfilesView T={T} onClose={onClose} />
      )}

      {mode === "pick_profile" && (
        <PickProfileView
          T={T}
          profiles={profiles}
          onPick={pickProfile}
          onCancel={onClose}
        />
      )}

      {mode === "preflight" && profile && (
        <PreflightView
          T={T}
          profile={profile}
          tcCount={tcIds.length}
          splitCounts={splitCounts}
          onContinue={goToDestination}
          onCancel={onClose}
        />
      )}

      {mode === "destination" && profile && (
        <DestinationView
          T={T}
          profile={profile}
          tree={destTree}
          expanded={destExpanded}
          selected={destSelected}
          loading={destLoading}
          loadError={destLoadError}
          onToggleExpand={toggleDestExpand}
          onSelectNode={setDestSelected}
          onConfirm={confirmDestination}
          onSkip={skipDestinationPicker}
          onCancel={() => setMode("preflight")}
        />
      )}

      {mode === "creds" && profile && (
        <CredsView
          T={T}
          title={`Sign in to Jama to push to "${effectiveDestination?.name || ""}"`}
          credsForm={credsForm}
          setCredsForm={setCredsForm}
          onSubmit={submitCreds}
          onCancel={() => setMode("destination")}
          submitLabel="Sign in & push"
          busy={busy}
        />
      )}

      {mode === "running" && (
        <RunningView
          T={T}
          status={runStatus}
          log={runLog}
          destinationName={effectiveDestination?.name}
          tcCount={tcIds.length}
          onCloseKeepRunning={closeKeepRunning}
        />
      )}

      {mode === "done" && (
        <DoneView
          T={T}
          status={runStatus}
          destinationName={effectiveDestination?.name}
          log={runLog}
          onDone={finishDone}
        />
      )}

      {mode === "failed" && (
        <FailedView
          T={T}
          status={runStatus}
          log={runLog}
          runId={activeRunId}
          onRetry={() => { setActiveRunId(null); setMode("creds"); }}
          onClose={onClose}
        />
      )}
    </Card>
  );
};

// ─── Sub-views ──────────────────────────────────────────────────────────

const Header = ({ T, mode, tcCount, onClose }) => {
  const titles = {
    loading_profiles: "Push to Jama",
    no_profiles:      "Push to Jama",
    pick_profile:     "Pick an export profile",
    preflight:        `Push ${tcCount} test case${tcCount === 1 ? "" : "s"} to Jama`,
    destination:      "Where should this push go?",
    creds:            "Sign in to Jama",
    running:          "Pushing to Jama",
    done:             "Push complete",
    failed:           "Push failed",
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>
        {titles[mode] || "Push to Jama"}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: T.textMuted, fontSize: 18, padding: 4,
          }}
          title="Close"
        >×</button>
      )}
    </div>
  );
};

const NoProfilesView = ({ T, onClose }) => (
  <div>
    <div style={{
      padding: "12px", background: T.amberDim, borderRadius: 6,
      border: `1px solid ${T.amber}33`, marginBottom: 12,
    }}>
      <div style={{ fontSize: 13, color: T.amber, fontWeight: 600 }}>
        No export profiles configured
      </div>
      <div style={{ fontSize: 12, color: T.text, marginTop: 6 }}>
        Set up a Jama export profile first (and pick a default destination Set)
        from the Library overflow menu → "Configure Jama export".
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button small onClick={onClose}>OK</Button>
    </div>
  </div>
);

const PickProfileView = ({ T, profiles, onPick, onCancel }) => (
  <div>
    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
      Multiple export profiles exist — pick which Jama project to push to.
    </div>
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
      {profiles.map((p, i) => {
        const hasDest = !!p.default_destination_jama_id;
        return (
          <div
            key={p.id}
            style={{
              display: "flex", alignItems: "center", padding: "10px 12px",
              gap: 12, borderBottom: i < profiles.length - 1 ? `1px solid ${T.border}` : "none",
              background: T.surface,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.textBright }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                Project {p.project_label}
                {hasDest ? (
                  <> · Destination <span style={{ color: T.green, fontFamily: mono }}>{p.default_destination_name}</span></>
                ) : (
                  <span style={{ color: T.amber, marginLeft: 6 }}>· no destination set</span>
                )}
              </div>
            </div>
            <Button small onClick={() => onPick(p)} disabled={!hasDest}>
              Use this
            </Button>
          </div>
        );
      })}
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button variant="ghost" small onClick={onCancel}>Cancel</Button>
    </div>
  </div>
);

const PreflightView = ({ T, profile, tcCount, splitCounts, onContinue, onCancel }) => {
  const hasDest = !!profile.default_destination_jama_id;
  return (
    <div>
      <div style={{
        padding: "10px 12px", background: T.surface, borderRadius: 6,
        border: `1px solid ${T.border}`, marginBottom: 12, fontSize: 12, color: T.text, lineHeight: 1.6,
      }}>
        <div>
          <strong>{tcCount}</strong> test case{tcCount === 1 ? "" : "s"} selected
          ({splitCounts.create} new, {splitCounts.update} update{splitCounts.update === 1 ? "" : "s"}).
        </div>
        <div style={{ marginTop: 6, color: T.textMuted }}>
          Destination:{" "}
          {hasDest ? (
            <span style={{ color: T.green, fontFamily: mono, fontWeight: 600 }}>
              {profile.default_destination_name}
            </span>
          ) : (
            <span style={{ color: T.amber, fontWeight: 600 }}>
              ⚠ Not set — open Configure Jama export and pick a destination first.
            </span>
          )}
          {hasDest && (
            <span style={{ marginLeft: 8, color: T.textMuted, fontSize: 11 }}>
              ({profile.default_destination_jama_id})
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, color: T.textMuted }}>
          Project: {profile.project_label}
        </div>
      </div>
      {splitCounts.update > 0 && (
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
          The {splitCounts.update} update{splitCounts.update === 1 ? "" : "s"} already have a stored Jama id from a prior push and will be edited in place. The {splitCounts.create} new test case{splitCounts.create === 1 ? " gets" : "s get"} added under the destination Set.
        </div>
      )}
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        If any test case fails to push, the run stops immediately. Test cases pushed before the failure stay in Jama and won't be re-created on the next run.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" small onClick={onCancel}>Cancel</Button>
        <Button small onClick={onContinue} disabled={!hasDest}>
          Continue
        </Button>
      </div>
    </div>
  );
};

const DestinationView = ({
  T, profile, tree, expanded, selected, loading, loadError,
  onToggleExpand, onSelectNode, onConfirm, onSkip, onCancel,
}) => {
  const defaultName = profile?.default_destination_name;
  const defaultId = profile?.default_destination_jama_id;
  const selectedIsDefault = selected?.type === "set" && selected.jama_id === defaultId;
  const selectedIsValid = selected?.type === "set";

  return (
    <div>
      <div style={{ fontSize: 12, color: T.text, marginBottom: 6 }}>
        Default destination for <strong>{profile?.name}</strong>:{" "}
        <span style={{ color: T.green, fontFamily: mono, fontWeight: 600 }}>{defaultName}</span>
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        Keep the default, or pick a different Set below. This choice applies to this push only — the profile's saved default is unchanged.
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
          Loading project tree...
        </div>
      )}

      {!loading && loadError && (
        <>
          <div style={{
            padding: "10px 12px", background: T.amberDim, borderRadius: 6,
            border: `1px solid ${T.amber}33`, marginBottom: 12, fontSize: 12, color: T.amber, lineHeight: 1.5,
          }}>
            {loadError}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" small onClick={onCancel}>Back</Button>
            <Button small onClick={onSkip}>Continue with default</Button>
          </div>
        </>
      )}

      {!loading && !loadError && tree && (
        <JamaTreePicker
          T={T}
          profile={profile}
          tree={tree}
          expanded={expanded}
          selected={selected}
          onToggleExpand={onToggleExpand}
          onSelectNode={onSelectNode}
          intro={null}
          confirmLabel={selectedIsDefault ? "Continue with default" : "Use this destination"}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
};

const RunningView = ({ T, status, log, destinationName, tcCount, onCloseKeepRunning }) => (
  <div>
    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
      Pushing {tcCount} test case{tcCount === 1 ? "" : "s"} to {destinationName} — {status?.status_message || "Starting..."}
    </div>
    <StatusBadge T={T} status={status?.status} />
    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
      Created so far: <strong>{status?.created_count ?? 0}</strong> ·
      Updated: <strong>{status?.updated_count ?? 0}</strong>
    </div>
    <LogPane T={T} log={log} style={{ marginTop: 12 }} />
    {onCloseKeepRunning && (
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <Button variant="ghost" small onClick={onCloseKeepRunning} title="Close this dialog. The push keeps running in the background; a toast will appear when it finishes.">
          Close (keep running)
        </Button>
      </div>
    )}
  </div>
);

const DoneView = ({ T, status, destinationName, log, onDone }) => {
  const created = status?.created_count ?? 0;
  const updated = status?.updated_count ?? 0;
  return (
    <div>
      <div style={{
        padding: "12px", background: T.greenDim, borderRadius: 6,
        border: `1px solid ${T.green}33`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
          ✓ Pushed to {destinationName}
        </div>
        <div style={{ fontSize: 12, color: T.text, marginTop: 6 }}>
          {created} test case{created === 1 ? "" : "s"} created · {updated} updated in place
        </div>
      </div>
      {log && log.length > 0 && (
        <LogPane T={T} log={log} style={{ marginBottom: 12 }} />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button small onClick={onDone}>Done</Button>
      </div>
    </div>
  );
};

const FailedView = ({ T, status, log, runId, onRetry, onClose }) => {
  const msg = status?.error_message || "Unknown error";
  const failedTcId = status?.failed_tc_id;
  const created = status?.created_count ?? 0;
  const updated = status?.updated_count ?? 0;
  const isCredentialError =
    /did not accept the credentials|rejected the sign-?in|sign in to jama failed|username and password are required/i.test(msg);
  return (
    <div>
      <div style={{
        padding: "12px", background: T.redDim, borderRadius: 6,
        border: `1px solid ${T.red}33`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>
          {isCredentialError ? "🔒 Sign-in failed" : "Push to Jama failed"}
        </div>
        <div style={{ fontSize: 12, color: T.text, marginTop: 6, fontFamily: isCredentialError ? "inherit" : mono }}>
          {msg}
        </div>
        {failedTcId && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
            Stopped on test case <span style={{ fontFamily: mono, color: T.text }}>{failedTcId}</span>.
            {(created + updated) > 0 && (
              <> Already pushed before the failure: {created} created, {updated} updated. Those stay in Jama; re-running skips them.</>
            )}
          </div>
        )}
        {!isCredentialError && runId && (
          <div style={{ marginTop: 10, fontSize: 11 }}>
            <a
              href={`/api/jama/export-runs/${runId}/screenshot`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: T.accent, textDecoration: "underline" }}
            >View screenshot of failure page →</a>
            <div style={{ color: T.textMuted, marginTop: 4 }}>
              Shows what Jama looked like when the push failed. Useful for figuring out which selector broke.
            </div>
          </div>
        )}
      </div>
      <LogPane T={T} log={log} style={{ marginBottom: 12 }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" small onClick={onClose}>Close</Button>
        <Button small onClick={onRetry}>
          {isCredentialError ? "Try again with different credentials" : "Try again"}
        </Button>
      </div>
    </div>
  );
};

// ─── Tree helpers ───────────────────────────────────────────────────────

function findNodeById(node, jamaId) {
  if (!node) return null;
  if (node.jama_id === jamaId) return node;
  for (const child of node.children || []) {
    const found = findNodeById(child, jamaId);
    if (found) return found;
  }
  return null;
}

// Returns the chain of ancestor jama_ids leading to the target (exclusive
// of the target itself) so we can pre-expand the picker to show it.
function pathTo(node, targetId, trail = []) {
  if (!node) return null;
  if (node.jama_id === targetId) return trail;
  for (const child of node.children || []) {
    const sub = pathTo(child, targetId, [...trail, node.jama_id]);
    if (sub) return sub;
  }
  return null;
}
