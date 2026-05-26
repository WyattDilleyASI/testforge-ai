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

const LAST_USERNAME_KEY = "tf_last_jama_username";

export const JamaExportRunFlow = ({
  selectedTestCases,        // array of TC rows from the library (need .tc_id + .jama_id)
  onClose,
  onExportComplete,
}) => {
  const T = useTheme();
  const tcIds = selectedTestCases.map((tc) => tc.tc_id);

  // mode: loading_profiles | no_profiles | pick_profile | preflight |
  //       creds | running | done | failed
  const [mode, setMode] = useState("loading_profiles");
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
  const goToCreds = () => {
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
        profile.id, credsForm.username, credsForm.password, tcIds
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

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Card style={{ marginBottom: 16, padding: 16 }}>
      <Header T={T} mode={mode} tcCount={tcIds.length} onClose={mode !== "running" ? onClose : null} />
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
          onContinue={goToCreds}
          onCancel={onClose}
        />
      )}

      {mode === "creds" && profile && (
        <CredsView
          T={T}
          title={`Sign in to Jama to push to "${profile.default_destination_name}"`}
          credsForm={credsForm}
          setCredsForm={setCredsForm}
          onSubmit={submitCreds}
          onCancel={() => setMode("preflight")}
          submitLabel="Sign in & push"
          busy={busy}
        />
      )}

      {mode === "running" && (
        <RunningView
          T={T}
          status={runStatus}
          log={runLog}
          profile={profile}
          tcCount={tcIds.length}
        />
      )}

      {mode === "done" && (
        <DoneView
          T={T}
          status={runStatus}
          profile={profile}
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

const RunningView = ({ T, status, log, profile, tcCount }) => (
  <div>
    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
      Pushing {tcCount} test case{tcCount === 1 ? "" : "s"} to {profile?.default_destination_name} — {status?.status_message || "Starting..."}
    </div>
    <StatusBadge T={T} status={status?.status} />
    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
      Created so far: <strong>{status?.created_count ?? 0}</strong> ·
      Updated: <strong>{status?.updated_count ?? 0}</strong>
    </div>
    <LogPane T={T} log={log} style={{ marginTop: 12 }} />
  </div>
);

const DoneView = ({ T, status, profile, log, onDone }) => {
  const created = status?.created_count ?? 0;
  const updated = status?.updated_count ?? 0;
  return (
    <div>
      <div style={{
        padding: "12px", background: T.greenDim, borderRadius: 6,
        border: `1px solid ${T.green}33`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
          ✓ Pushed to {profile?.default_destination_name}
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
