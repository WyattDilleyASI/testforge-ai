// JamaImportView — browser-driven Jama import flow.
//
// Renders as an inline panel below the RequirementsView header (similar
// pattern to JamaImportPanel for .doc uploads). Internal state machine
// handles: list profiles, run import, create new profile (with live
// discovery), edit/delete profiles, live progress via SSE, result.
//
// Per the design decisions:
//   • Credentials are entered fresh for every import or discovery
//     operation — never persisted.
//   • Only the username gets cached in localStorage for convenience.
//   • Admin + QA Manager can create/edit/delete profiles. Any authed
//     user can run an existing profile.

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input, ErrorBanner } from "./shared";

const LAST_USERNAME_KEY = "tf_last_jama_username";

export const JamaImportView = ({ currentUser, onClose, onImportComplete }) => {
  const T = useTheme();
  const canManage = currentUser.role === "Admin" || currentUser.role === "QA Manager";
  const isAdmin = currentUser.role === "Admin";

  // ── State ────────────────────────────────────────────────────────────
  // mode: list | creds_import | creds_discover | discover_form |
  //       running | done | failed | edit_profile | confirm_delete
  const [mode, setMode] = useState("list");
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // For run-import flow
  const [selectedProfile, setSelectedProfile] = useState(null);

  // Credentials form (transient — cleared after submission)
  const [credsForm, setCredsForm] = useState({
    username: localStorage.getItem(LAST_USERNAME_KEY) || "",
    password: "",
  });

  // Discovery flow state
  // Profile creation is now a two-step flow:
  //   1. creds_discover: enter username/password + paste a Jama project URL
  //   2. discover_form: confirm scraped project_label + type filter_name + profile name
  // No more project/filter dropdown scraping — too fragile against Jama DOM.
  const [urlInput, setUrlInput] = useState("");
  const [newProfileForm, setNewProfileForm] = useState({
    name: "",
    project_id: "",
    project_url: "",
    project_label: "",
    filter_name: "",
  });

  // Edit profile state
  const [editForm, setEditForm] = useState({ id: null, name: "" });
  const [profileToDelete, setProfileToDelete] = useState(null);

  // Base URL config state (first-run setup for admins)
  const [baseUrl, setBaseUrl] = useState(null);  // null = not yet loaded, "" = unset
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  // Running-import state (driven by SSE)
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobLog, setJobLog] = useState([]);
  const [jobStatus, setJobStatus] = useState(null);
  const eventSourceRef = useRef(null);

  // ── Effects ──────────────────────────────────────────────────────────
  useEffect(() => { refreshProfiles(); loadBaseUrl(); }, []);

  // Open SSE when we have an activeJobId, close on unmount/change.
  useEffect(() => {
    if (!activeJobId) return;
    const es = new EventSource(`/api/jama/imports/${activeJobId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("log", (e) => {
      try {
        const entry = JSON.parse(e.data);
        setJobLog((prev) => [...prev, entry]);
      } catch {}
    });
    es.addEventListener("status", (e) => {
      try {
        const update = JSON.parse(e.data);
        setJobStatus(update);
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
      // Custom server-side error events carry data; connection errors don't.
      if (e?.data) {
        try {
          const err = JSON.parse(e.data);
          setError(err.error || "SSE error");
        } catch {}
      }
    });
    return () => { es.close(); eventSourceRef.current = null; };
  }, [activeJobId]);

  // ── Loaders ──────────────────────────────────────────────────────────
  const refreshProfiles = async () => {
    try {
      const data = await api.getJamaProfiles();
      setProfiles(data.profiles || []);
    } catch (e) { setError(e.message); }
  };

  const loadBaseUrl = async () => {
    try {
      const data = await api.getJamaBaseUrl();
      setBaseUrl(data.base_url || "");
      setBaseUrlInput(data.base_url || "");
    } catch (e) { setError(e.message); }
  };

  const saveBaseUrl = async () => {
    if (!baseUrlInput.trim()) {
      setError("Jama URL is required");
      return;
    }
    setError(""); setSavingBaseUrl(true);
    try {
      const { base_url } = await api.setJamaBaseUrl(baseUrlInput.trim());
      setBaseUrl(base_url);
      setBaseUrlInput(base_url);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingBaseUrl(false);
    }
  };

  // ── Run-import flow ──────────────────────────────────────────────────
  const startImportFlow = (profile) => {
    setSelectedProfile(profile);
    setError("");
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds_import");
  };

  const submitImportCreds = async () => {
    if (!credsForm.username || !credsForm.password) {
      setError("Username and password are required");
      return;
    }
    setError(""); setBusy(true);
    try {
      localStorage.setItem(LAST_USERNAME_KEY, credsForm.username);
      const { job_id } = await api.startJamaImport(
        selectedProfile.id, credsForm.username, credsForm.password
      );
      // Wipe the password ASAP — server already has what it needs.
      setCredsForm((f) => ({ ...f, password: "" }));
      setJobLog([]); setJobStatus(null);
      setActiveJobId(job_id);
      setMode("running");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Profile creation flow (URL paste) ────────────────────────────────
  const startNewProfileFlow = () => {
    setError("");
    setUrlInput("");
    setNewProfileForm({ name: "", project_id: "", project_url: "", project_label: "", filter_name: "" });
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds_discover");
  };

  // Step 1: sign in + resolve the pasted project URL into {project_id, project_label}.
  const submitDiscoveryCreds = async () => {
    if (!credsForm.username || !credsForm.password) {
      setError("Username and password are required");
      return;
    }
    if (!urlInput.trim()) {
      setError("Jama project URL is required");
      return;
    }
    if (!/\/projects\/\d+/.test(urlInput)) {
      setError("That doesn't look like a Jama project URL. Expected something like 'https://<tenant>.jamacloud.com/perspective.req#/projects/<id>/...'");
      return;
    }
    setError(""); setBusy(true);
    try {
      localStorage.setItem(LAST_USERNAME_KEY, credsForm.username);
      const trimmedUrl = urlInput.trim();
      const { project_id, project_label } = await api.discoverJamaProjectByUrl(
        credsForm.username, credsForm.password, trimmedUrl
      );
      setCredsForm((f) => ({ ...f, password: "" }));
      setNewProfileForm((f) => ({
        ...f,
        project_id,
        project_url: trimmedUrl,  // store the working URL — used verbatim for imports
        project_label,
      }));
      setMode("discover_form");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 2: user confirms/edits project label, types filter name + profile name.
  const saveNewProfile = async () => {
    const f = newProfileForm;
    if (!f.name.trim()) {
      setError("Profile name is required");
      return;
    }
    if (!f.project_id || !f.project_label.trim()) {
      setError("Project label is required");
      return;
    }
    if (!f.filter_name.trim()) {
      setError("Filter name is required");
      return;
    }
    setError(""); setBusy(true);
    try {
      await api.createJamaProfile({
        name: f.name.trim(),
        project_id: f.project_id,
        project_url: f.project_url,
        project_label: f.project_label.trim(),
        filter_name: f.filter_name.trim(),
      });
      await refreshProfiles();
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Edit / delete profile ────────────────────────────────────────────
  const startEditProfile = (profile) => {
    setEditForm({ id: profile.id, name: profile.name });
    setError("");
    setMode("edit_profile");
  };

  const saveProfileRename = async () => {
    if (!editForm.name.trim()) {
      setError("Profile name cannot be empty");
      return;
    }
    setError(""); setBusy(true);
    try {
      await api.updateJamaProfile(editForm.id, { name: editForm.name.trim() });
      await refreshProfiles();
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const askDeleteProfile = (profile) => {
    setProfileToDelete(profile);
    setError("");
    setMode("confirm_delete");
  };

  const confirmDeleteProfile = async () => {
    setError(""); setBusy(true);
    try {
      await api.deleteJamaProfile(profileToDelete.id);
      setProfileToDelete(null);
      await refreshProfiles();
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Done / undo ──────────────────────────────────────────────────────
  const undoImport = async () => {
    if (!activeJobId) return;
    setError(""); setBusy(true);
    try {
      const { deleted } = await api.rollbackJamaImport(activeJobId);
      onImportComplete?.();
      // After undo, the panel goes back to list — user can re-run if they want.
      await refreshProfiles();
      setActiveJobId(null);
      setJobLog([]); setJobStatus(null);
      setMode("list");
      setError(`Rolled back. Deleted ${deleted} requirement(s).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const finishDone = () => {
    onImportComplete?.();
    onClose?.();
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Card style={{ marginBottom: 16, padding: 16 }}>
      <Header T={T} mode={mode} onClose={onClose} />
      <ErrorBanner msg={error} />

      {mode === "list" && baseUrl === "" && (
        <BaseUrlSetupBanner
          T={T}
          isAdmin={isAdmin}
          baseUrlInput={baseUrlInput}
          setBaseUrlInput={setBaseUrlInput}
          onSave={saveBaseUrl}
          busy={savingBaseUrl}
        />
      )}

      {mode === "list" && (
        <ProfileListView
          T={T}
          profiles={profiles}
          canManage={canManage}
          baseUrlReady={!!baseUrl}
          onRun={startImportFlow}
          onEdit={startEditProfile}
          onDelete={askDeleteProfile}
          onNew={startNewProfileFlow}
          onClose={onClose}
        />
      )}

      {mode === "creds_import" && (
        <CredsView
          T={T}
          title={`Sign in to Jama to run "${selectedProfile?.name}"`}
          credsForm={credsForm}
          setCredsForm={setCredsForm}
          onSubmit={submitImportCreds}
          onCancel={() => setMode("list")}
          submitLabel="Sign in & import"
          busy={busy}
        />
      )}

      {mode === "creds_discover" && (
        <CredsView
          T={T}
          title="Sign in to Jama"
          subtitle="We'll sign in, look up your project, then sign back out."
          credsForm={credsForm}
          setCredsForm={setCredsForm}
          onSubmit={submitDiscoveryCreds}
          onCancel={() => setMode("list")}
          submitLabel="Sign in & continue"
          busy={busy}
          extras={
            <Input
              label="Jama project URL (paste from your browser's address bar)"
              value={urlInput}
              onChange={setUrlInput}
              placeholder="https://your-tenant.jamacloud.com/perspective.req#/projects/152/..."
              mono
              style={{ marginBottom: 14 }}
            />
          }
        />
      )}

      {mode === "discover_form" && (
        <DiscoverFormView
          T={T}
          form={newProfileForm}
          setForm={setNewProfileForm}
          onSave={saveNewProfile}
          onCancel={() => setMode("list")}
          busy={busy}
        />
      )}

      {mode === "running" && (
        <RunningView
          T={T}
          status={jobStatus}
          log={jobLog}
          profile={selectedProfile}
        />
      )}

      {mode === "done" && (
        <DoneView
          T={T}
          status={jobStatus}
          profile={selectedProfile}
          onUndo={canManage ? undoImport : null}
          onDone={finishDone}
          busy={busy}
        />
      )}

      {mode === "failed" && (
        <FailedView
          T={T}
          status={jobStatus}
          log={jobLog}
          jobId={activeJobId}
          onRetry={() => { setActiveJobId(null); setMode("creds_import"); }}
          onClose={onClose}
        />
      )}

      {mode === "edit_profile" && (
        <EditProfileView
          T={T}
          form={editForm}
          setForm={setEditForm}
          onSave={saveProfileRename}
          onCancel={() => setMode("list")}
          busy={busy}
        />
      )}

      {mode === "confirm_delete" && (
        <ConfirmDeleteView
          T={T}
          profile={profileToDelete}
          onConfirm={confirmDeleteProfile}
          onCancel={() => { setProfileToDelete(null); setMode("list"); }}
          busy={busy}
        />
      )}
    </Card>
  );
};

// ─── Sub-views ──────────────────────────────────────────────────────────

const Header = ({ T, mode, onClose }) => {
  const titles = {
    list: "Import from Jama",
    creds_import: "Sign in to Jama",
    creds_discover: "Sign in to Jama",
    discover_form: "New import profile",
    running: "Importing from Jama",
    done: "Import complete",
    failed: "Import failed",
    edit_profile: "Rename profile",
    confirm_delete: "Delete profile",
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>
        {titles[mode] || "Jama Import"}
      </div>
      {onClose && mode !== "running" && (
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

const BaseUrlSetupBanner = ({ T, isAdmin, baseUrlInput, setBaseUrlInput, onSave, busy }) => (
  <div style={{
    marginBottom: 14, padding: "10px 12px", background: T.amberDim, borderRadius: 6,
    border: `1px solid ${T.amber}33`,
  }}>
    <div style={{ fontSize: 12, color: T.amber, fontWeight: 600, marginBottom: 6 }}>
      Jama URL not configured
    </div>
    {isAdmin ? (
      <>
        <div style={{ fontSize: 12, color: T.text, marginBottom: 10 }}>
          Set the URL of your Jama instance so imports know where to sign in. Required once per Testforge deployment.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            placeholder="https://your-tenant.jamacloud.com"
            style={{
              flex: 1, padding: "6px 10px", fontSize: 12,
              background: T.bg, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: 4,
              fontFamily: mono, outline: "none",
            }}
            disabled={busy}
          />
          <Button small onClick={onSave} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      </>
    ) : (
      <div style={{ fontSize: 12, color: T.text }}>
        Ask an Admin to set the Jama URL here before running an import.
      </div>
    )}
  </div>
);

const ProfileListView = ({ T, profiles, canManage, baseUrlReady, onRun, onEdit, onDelete, onNew, onClose }) => (
  <>
    {profiles.length === 0 ? (
      <div style={{
        padding: "20px 12px", textAlign: "center", color: T.textMuted, fontSize: 13,
        border: `1px dashed ${T.border}`, borderRadius: 6, marginBottom: 12,
      }}>
        No saved Jama import profiles yet.
        {canManage
          ? " Create one to get started."
          : " Ask an Admin or QA Manager to create one."}
      </div>
    ) : (
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
        {profiles.map((p, i) => (
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
                Project {p.project_label} · Filter <span style={{ fontFamily: mono }}>{p.filter_name}</span>
                {p.last_imported_at && (
                  <span style={{ marginLeft: 8 }}>· last run {relativeTime(p.last_imported_at)}</span>
                )}
              </div>
            </div>
            <Button small onClick={() => onRun(p)} disabled={!baseUrlReady}>Run</Button>
            {canManage && (
              <>
                <Button small variant="ghost" onClick={() => onEdit(p)}>Rename</Button>
                <Button small variant="ghost" onClick={() => onDelete(p)}>Delete</Button>
              </>
            )}
          </div>
        ))}
      </div>
    )}

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      {canManage && (
        <Button variant="ghost" small onClick={onNew} disabled={!baseUrlReady}>+ New profile</Button>
      )}
      <div style={{ flex: 1 }} />
      <Button variant="ghost" small onClick={onClose}>Close</Button>
    </div>
  </>
);

const CredsView = ({ T, title, subtitle, credsForm, setCredsForm, onSubmit, onCancel, submitLabel, busy, extras }) => (
  <form
    onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}
    autoComplete="on"
  >
    {subtitle && (
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>{subtitle}</div>
    )}
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
      Use your Jama credentials. They are never stored — held only long enough to complete this operation.
    </div>

    <Input
      label="Jama username"
      value={credsForm.username}
      onChange={(v) => setCredsForm((f) => ({ ...f, username: v }))}
      style={{ marginBottom: 10 }}
    />
    <Input
      label="Jama password"
      type="password"
      value={credsForm.password}
      onChange={(v) => setCredsForm((f) => ({ ...f, password: v }))}
      style={{ marginBottom: extras ? 10 : 14 }}
    />
    {extras}

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button small onClick={onSubmit} disabled={busy}>
        {busy ? "Working..." : submitLabel}
      </Button>
    </div>
  </form>
);

const DiscoverFormView = ({ T, form, setForm, onSave, onCancel, busy }) => (
  <div>
    <div style={{
      fontSize: 11, color: T.green, marginBottom: 12,
      padding: "8px 10px", background: T.greenDim, borderRadius: 4,
      border: `1px solid ${T.green}33`,
    }}>
      ✓ Found project #{form.project_id}. Confirm the details below.
    </div>

    <Input
      label="Project label"
      value={form.project_label}
      onChange={(v) => setForm((f) => ({ ...f, project_label: v }))}
      style={{ marginBottom: 4 }}
    />
    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 12 }}>
      Must match what Jama shows for this project in its UI — Testforge uses this to find the right report in Jama's history.
    </div>

    <Input
      label="Filter name"
      value={form.filter_name}
      onChange={(v) => setForm((f) => ({ ...f, filter_name: v }))}
      placeholder="*All Requirement Types"
      mono
      style={{ marginBottom: 4 }}
    />
    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 12 }}>
      Type the exact filter name as shown in your Jama project sidebar (including any leading <span style={{ fontFamily: mono }}>*</span>).
    </div>

    <Input
      label="Profile name"
      value={form.name}
      onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      placeholder="e.g. Fairway 2.0 — All Reqs"
      style={{ marginBottom: 14 }}
    />

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button small onClick={onSave} disabled={busy}>
        {busy ? "Saving..." : "Save profile"}
      </Button>
    </div>
  </div>
);

const RunningView = ({ T, status, log, profile }) => (
  <div>
    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
      Running "{profile?.name}" — {status?.status_message || "Starting..."}
    </div>
    <StatusBadge T={T} status={status?.status} />
    <LogPane T={T} log={log} style={{ marginTop: 12 }} />
  </div>
);

const DoneView = ({ T, status, profile, onUndo, onDone, busy }) => {
  const inserted = status?.imported_count ?? 0;
  const updated = status?.updated_count ?? 0;
  return (
    <div>
      <div style={{
        padding: "12px", background: T.greenDim, borderRadius: 6,
        border: `1px solid ${T.green}33`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
          ✓ Imported "{profile?.name}"
        </div>
        <div style={{ fontSize: 12, color: T.text, marginTop: 6 }}>
          {inserted} new requirement{inserted === 1 ? "" : "s"} added · {updated} existing requirement{updated === 1 ? "" : "s"} refreshed
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {onUndo && inserted > 0 && (
          <Button variant="ghost" small onClick={onUndo} disabled={busy}>
            Undo (delete {inserted} new)
          </Button>
        )}
        <Button small onClick={onDone} disabled={busy}>Done</Button>
      </div>
    </div>
  );
};

const FailedView = ({ T, status, log, jobId, onRetry, onClose }) => (
  <div>
    <div style={{
      padding: "12px", background: T.redDim, borderRadius: 6,
      border: `1px solid ${T.red}33`, marginBottom: 12,
    }}>
      <div style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>Import failed</div>
      <div style={{ fontSize: 12, color: T.text, marginTop: 6, fontFamily: mono }}>
        {status?.error_message || "Unknown error"}
      </div>
      {jobId && (
        <div style={{ marginTop: 10, fontSize: 11 }}>
          <a
            href={`/api/jama/imports/${jobId}/screenshot`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: T.accent, textDecoration: "underline" }}
          >View screenshot of failure page →</a>
          <div style={{ color: T.textMuted, marginTop: 4 }}>
            Shows what Jama looked like when the import failed. Useful for figuring out which selector broke.
          </div>
        </div>
      )}
    </div>
    <LogPane T={T} log={log} style={{ marginBottom: 12 }} />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onClose}>Close</Button>
      <Button small onClick={onRetry}>Try again</Button>
    </div>
  </div>
);

const EditProfileView = ({ T, form, setForm, onSave, onCancel, busy }) => (
  <div>
    <Input
      label="Profile name"
      value={form.name}
      onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      style={{ marginBottom: 14 }}
    />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button small onClick={onSave} disabled={busy}>
        {busy ? "Saving..." : "Save"}
      </Button>
    </div>
  </div>
);

const ConfirmDeleteView = ({ T, profile, onConfirm, onCancel, busy }) => (
  <div>
    <div style={{ fontSize: 13, color: T.text, marginBottom: 14 }}>
      Delete profile <strong>{profile?.name}</strong>? This cannot be undone.
      Imports already run with this profile will keep their history.
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="danger" small onClick={onConfirm} disabled={busy}>
        {busy ? "Deleting..." : "Delete"}
      </Button>
    </div>
  </div>
);

// ─── Small bits ─────────────────────────────────────────────────────────

const StatusBadge = ({ T, status }) => {
  if (!status) return null;
  const colors = {
    queued: "amber", authenticating: "amber", navigating: "amber",
    waiting_for_report: "amber", downloading: "amber", ingesting: "amber",
    done: "green", failed: "red",
  };
  return <Badge color={colors[status] || "accent"}>{status.replace(/_/g, " ")}</Badge>;
};

const LogPane = ({ T, log, style }) => (
  <div
    style={{
      maxHeight: 240, overflowY: "auto", padding: "8px 10px",
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
      fontFamily: mono, fontSize: 11, lineHeight: 1.6, ...style,
    }}
  >
    {log.length === 0 && <span style={{ color: T.textMuted }}>Waiting for log entries...</span>}
    {log.map((entry, i) => (
      <div key={i} style={{ color: levelColor(T, entry.level) }}>
        <span style={{ color: T.textMuted }}>{(entry.ts || "").replace("T", " ").replace(/\.\d+Z$/, "")}</span>
        {" "}
        {entry.message}
      </div>
    ))}
  </div>
);

function levelColor(T, level) {
  if (level === "error") return T.red;
  if (level === "warn") return T.amber;
  return T.text;
}

function relativeTime(iso) {
  if (!iso) return "";
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
