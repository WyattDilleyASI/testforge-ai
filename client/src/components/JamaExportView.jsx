// JamaExportView — browser-driven Jama export profile management.
//
// Parallel of JamaImportView, but for the export side:
//   • An "export profile" pairs a Jama project with an optional default
//     destination node (a Set inside the V&V subtree) where exported
//     test cases will land.
//   • Refresh project tree (background scrape via SSE), then pick a
//     destination from the cached tree.
//   • Credentials are entered fresh for every operation — never persisted.
//
// The actual TC export run isn't wired here yet — this view is the
// configuration surface (profiles + destinations). Future work hooks the
// "Export to Jama" button from the TC library into a chosen profile.

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Button, Input, ErrorBanner } from "./shared";
import { JamaTreePicker } from "./JamaTreePicker";
import {
  CredsView, StatusBadge, LogPane,
  BaseUrlSetupBanner, relativeTime,
} from "./JamaImportView";

const LAST_USERNAME_KEY = "tf_last_jama_username";

export const JamaExportView = ({ currentUser, onClose, embedded = false }) => {
  const T = useTheme();
  const canManage = currentUser.role === "Admin" || currentUser.role === "QA Manager";
  const isAdmin = currentUser.role === "Admin";

  // mode: list | creds_discover | discover_form | edit_profile |
  //       confirm_delete | creds_tree | scraping_tree | picker
  const [mode, setMode] = useState("list");
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [selectedProfile, setSelectedProfile] = useState(null);

  const [credsForm, setCredsForm] = useState({
    username: localStorage.getItem(LAST_USERNAME_KEY) || "",
    password: "",
  });

  // New-profile creation (paste URL → discover → confirm)
  const [urlInput, setUrlInput] = useState("");
  const [newProfileForm, setNewProfileForm] = useState({
    name: "",
    project_id: "",
    project_url: "",
    project_label: "",
    import_mapping_name: "Testforge Auto Import",
    scrape_subtree_name: "Verification & Validation",
  });

  const [editForm, setEditForm] = useState({
    id: null, name: "", import_mapping_name: "", scrape_subtree_name: "",
  });
  const [profileToDelete, setProfileToDelete] = useState(null);

  // Base URL config (shared setting with import side — same key on server)
  const [baseUrl, setBaseUrl] = useState(null);
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  // Tree-scrape SSE state
  const [activeTreeJobId, setActiveTreeJobId] = useState(null);
  const [treeJobLog, setTreeJobLog] = useState([]);
  const [treeJobStatus, setTreeJobStatus] = useState(null);
  const treeEventSourceRef = useRef(null);

  // Picker state (uses the cached project tree)
  const [pickerTree, setPickerTree] = useState(null);
  const [pickerExpanded, setPickerExpanded] = useState(new Set());
  const [pickerSelected, setPickerSelected] = useState(null);

  // ── Effects ──────────────────────────────────────────────────────────
  useEffect(() => { refreshProfiles(); loadBaseUrl(); }, []);

  useEffect(() => {
    if (!activeTreeJobId) return;
    const es = new EventSource(`/api/jama/export-tree-jobs/${activeTreeJobId}/stream`);
    treeEventSourceRef.current = es;

    es.addEventListener("log", (e) => {
      try {
        const entry = JSON.parse(e.data);
        setTreeJobLog((prev) => [...prev, entry]);
      } catch {}
    });
    es.addEventListener("status", (e) => {
      try {
        const update = JSON.parse(e.data);
        setTreeJobStatus(update);
        if (update.status === "done") {
          es.close();
          (async () => {
            await refreshProfiles();
            setError(`✓ Scraped ${update.node_count} nodes. Click "Pick destination" to choose where exported TCs should land.`);
            setActiveTreeJobId(null);
            setTreeJobLog([]);
            setTreeJobStatus(null);
            setMode("list");
          })();
        } else if (update.status === "failed") {
          es.close();
          setError(update.error_message || "Tree scrape failed");
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
    return () => { es.close(); treeEventSourceRef.current = null; };
  }, [activeTreeJobId]);

  // ── Loaders ──────────────────────────────────────────────────────────
  const refreshProfiles = async () => {
    try {
      const data = await api.getJamaExportProfiles();
      setProfiles(data.profiles || []);
    } catch (e) { setError(e.message); }
  };

  // Broadcast after any profile mutation so other views (Push to Jama,
  // anywhere else with a stale profile list) can re-fetch. Fire-and-forget;
  // anyone interested listens via window.addEventListener.
  const notifyProfilesChanged = () => {
    window.dispatchEvent(new CustomEvent("testforge:jama-export-profiles-changed"));
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

  // ── New-profile flow ─────────────────────────────────────────────────
  const startNewProfileFlow = () => {
    setError("");
    setUrlInput("");
    setNewProfileForm({
      name: "",
      project_id: "",
      project_url: "",
      project_label: "",
      import_mapping_name: "Testforge Auto Import",
      scrape_subtree_name: "Verification & Validation",
    });
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds_discover");
  };

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
        project_url: trimmedUrl,
        project_label,
      }));
      setMode("discover_form");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

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
    setError(""); setBusy(true);
    try {
      await api.createJamaExportProfile({
        name: f.name.trim(),
        project_id: f.project_id,
        project_url: f.project_url,
        project_label: f.project_label.trim(),
        import_mapping_name: (f.import_mapping_name || "Testforge Auto Import").trim(),
        scrape_subtree_name: (f.scrape_subtree_name || "Verification & Validation").trim(),
      });
      await refreshProfiles();
      notifyProfilesChanged();
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Refresh tree flow ────────────────────────────────────────────────
  const startTreeRefreshFlow = (profile) => {
    setSelectedProfile(profile);
    setError("");
    setCredsForm((f) => ({ ...f, password: "" }));
    setMode("creds_tree");
  };

  const submitTreeRefreshCreds = async () => {
    if (!credsForm.username || !credsForm.password) {
      setError("Username and password are required");
      return;
    }
    setError(""); setBusy(true);
    try {
      localStorage.setItem(LAST_USERNAME_KEY, credsForm.username);
      const { job_id } = await api.refreshJamaExportProjectTree(
        selectedProfile.id, credsForm.username, credsForm.password
      );
      setCredsForm((f) => ({ ...f, password: "" }));
      setTreeJobLog([]);
      setTreeJobStatus(null);
      setActiveTreeJobId(job_id);
      setMode("scraping_tree");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Picker flow (set default destination on a profile) ───────────────
  // The picker only shows the "Verification & Validation" subtree —
  // test-case destinations always land somewhere inside V&V, and the
  // other top-level components (Requirements, Risk Items, etc.) just
  // add noise. We scope the rendered tree down here at open time so
  // the cached project tree on the server stays whole.
  const startPickerFlow = async (profile) => {
    setSelectedProfile(profile);
    setError("");
    setPickerTree(null);
    setPickerExpanded(new Set());
    setPickerSelected(null);
    setMode("picker");
    try {
      const data = await api.getJamaExportProjectTree(profile.id);
      const subtreeName = profile.scrape_subtree_name || "Verification & Validation";
      const subtree = (data.tree.children || []).find((c) => c.name === subtreeName);
      if (!subtree) {
        setError(
          `This project's cached tree has no "${subtreeName}" component, so there's ` +
          `nowhere to put exported test cases. Refresh the tree, or update the ` +
          `profile's "Subtree to scrape" field to match an actual top-level component name in Jama.`
        );
        setMode("list");
        return;
      }
      setPickerTree(subtree);
      const auto = new Set([subtree.jama_id]);
      // Pre-select the saved default if it's still inside the subtree.
      if (profile.default_destination_jama_id) {
        const found = findNodeById(subtree, profile.default_destination_jama_id);
        if (found) {
          setPickerSelected(found);
          for (const ancestorId of pathTo(subtree, profile.default_destination_jama_id)) {
            auto.add(ancestorId);
          }
        }
      }
      setPickerExpanded(auto);
    } catch (e) {
      if (/not cached|not yet|404/i.test(e.message)) {
        setError(`No tree cached for this profile yet. Click "Refresh tree" on the profile row first.`);
      } else {
        setError(e.message);
      }
    }
  };

  const togglePickerExpand = (jamaId) => {
    setPickerExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jamaId)) next.delete(jamaId);
      else next.add(jamaId);
      return next;
    });
  };

  const confirmPickerSelection = async () => {
    if (!pickerSelected || pickerSelected.type !== "set" || !selectedProfile) return;
    setError(""); setBusy(true);
    try {
      await api.updateJamaExportProfile(selectedProfile.id, {
        default_destination_jama_id: pickerSelected.jama_id,
        default_destination_name: pickerSelected.name,
      });
      await refreshProfiles();
      notifyProfilesChanged();
      setError(`✓ Set default destination for "${selectedProfile.name}": ${pickerSelected.name} (${pickerSelected.jama_id}).`);
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Edit / delete ────────────────────────────────────────────────────
  const startEditProfile = (profile) => {
    setEditForm({
      id: profile.id,
      name: profile.name,
      import_mapping_name: profile.import_mapping_name || "Testforge Auto Import",
      scrape_subtree_name: profile.scrape_subtree_name || "Verification & Validation",
    });
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
      await api.updateJamaExportProfile(editForm.id, {
        name: editForm.name.trim(),
        import_mapping_name: (editForm.import_mapping_name || "Testforge Auto Import").trim(),
        scrape_subtree_name: (editForm.scrape_subtree_name || "Verification & Validation").trim(),
      });
      await refreshProfiles();
      notifyProfilesChanged();
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
      await api.deleteJamaExportProfile(profileToDelete.id);
      setProfileToDelete(null);
      await refreshProfiles();
      notifyProfilesChanged();
      setMode("list");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  // When `embedded` (e.g. mounted inside Push to Jama) we skip the outer
  // Card chrome and the title bar — the host already provides them.
  const Wrapper = embedded
    ? ({ children }) => <div>{children}</div>
    : ({ children }) => <Card style={{ marginBottom: 16, padding: 16 }}>{children}</Card>;
  return (
    <Wrapper>
      {!embedded && <Header T={T} mode={mode} onClose={onClose} />}
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
          onEdit={startEditProfile}
          onDelete={askDeleteProfile}
          onNew={startNewProfileFlow}
          onRefreshTree={startTreeRefreshFlow}
          onPickDestination={startPickerFlow}
          onClose={onClose}
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

      {mode === "creds_tree" && (
        <CredsView
          T={T}
          title="Sign in to Jama"
          subtitle={`We'll sign in, scrape the Explorer sidebar for "${selectedProfile?.name}", then sign back out. This can take a couple minutes for a large project.`}
          credsForm={credsForm}
          setCredsForm={setCredsForm}
          onSubmit={submitTreeRefreshCreds}
          onCancel={() => setMode("list")}
          submitLabel="Sign in & scrape"
          busy={busy}
        />
      )}

      {mode === "scraping_tree" && (
        <TreeScrapingView
          T={T}
          status={treeJobStatus}
          log={treeJobLog}
          profile={selectedProfile}
        />
      )}

      {mode === "picker" && (
        <JamaTreePicker
          T={T}
          profile={selectedProfile}
          tree={pickerTree}
          expanded={pickerExpanded}
          selected={pickerSelected}
          onToggleExpand={togglePickerExpand}
          onSelectNode={setPickerSelected}
          onCancel={() => setMode("list")}
          onConfirm={confirmPickerSelection}
          confirmLabel={busy ? "Saving..." : "Save as default destination"}
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
    </Wrapper>
  );
};

// ─── Sub-views ──────────────────────────────────────────────────────────

const Header = ({ T, mode, onClose }) => {
  const titles = {
    list: "Export to Jama",
    creds_discover: "Sign in to Jama",
    discover_form: "New export profile",
    creds_tree: "Sign in to Jama (refresh project tree)",
    scraping_tree: "Scraping Jama project tree",
    picker: "Pick a default destination",
    edit_profile: "Rename profile",
    confirm_delete: "Delete export profile",
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>
        {titles[mode] || "Jama Export"}
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

const ProfileListView = ({
  T, profiles, canManage, baseUrlReady,
  onEdit, onDelete, onNew, onRefreshTree, onPickDestination, onClose,
}) => (
  <>
    {profiles.length === 0 ? (
      <div style={{
        padding: "16px 16px", color: T.text, fontSize: 13,
        border: `1px dashed ${T.border}`, borderRadius: 6, marginBottom: 12,
        background: T.surface,
      }}>
        <div style={{ fontWeight: 600, color: T.textBright, marginBottom: 6 }}>
          No saved Jama export profiles yet
        </div>
        {canManage ? (
          <>
            <div style={{ color: T.text, lineHeight: 1.6 }}>
              An export profile pairs Testforge with a Jama project so test cases can be pushed straight in. Do these steps in order — the Jama mapping setup (step 1) is a prerequisite and only needs to be done once per Jama project, not per Testforge profile:
            </div>
            <ol style={{ color: T.text, lineHeight: 1.7, paddingLeft: 22, marginTop: 8, marginBottom: 6 }}>
              <li>
                <strong>In Jama (once per project):</strong> right-click any Set in your test-case area → <strong>Import</strong> → upload a Testforge-exported XLSX (download one from Library → Export → XLSX) → configure field mappings → on the final wizard step click <strong>"Save This As New Document Mapping"</strong>. Note the name you save it under.
              </li>
              <li>
                Click <strong>"New profile"</strong> below. Paste the Jama project URL (the dashboard URL with <code style={{ fontFamily: mono, fontSize: 11 }}>/dashboard/&lt;id&gt;</code>), confirm the "Subtree to scrape" name matches your project's top-level test-case component (default: <code style={{ fontFamily: mono, fontSize: 11 }}>Verification &amp; Validation</code>), and enter the saved-mapping name from step 1 exactly.
              </li>
              <li>
                Click <strong>"Refresh tree"</strong> on the profile row to cache the project's Set structure.
              </li>
              <li>
                Click <strong>"Pick destination"</strong> to set the default Set new pushes land in (users can override per-run from the push flow).
              </li>
            </ol>
          </>
        ) : (
          <div style={{ color: T.textMuted, lineHeight: 1.6 }}>
            Ask an Admin or QA Manager to set one up. They'll need to (1) save a field mapping in Jama via a one-time manual import, then (2) create the profile here pointing at the Jama project, refresh the tree, and pick a default destination Set.
          </div>
        )}
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
                Project {p.project_label}
                {p.default_destination_name ? (
                  <>
                    {" "}· Destination{" "}
                    <span style={{ color: T.green, fontFamily: mono }}>
                      {p.default_destination_name}
                    </span>
                  </>
                ) : (
                  <span style={{ color: T.amber, marginLeft: 6 }}>· no destination set</span>
                )}
                {p.tree_scraped_at && (
                  <span style={{ marginLeft: 8 }}>
                    · tree scraped {relativeTime(p.tree_scraped_at)} ({p.tree_node_count} nodes)
                  </span>
                )}
              </div>
            </div>
            {canManage && (
              <>
                <Button
                  small
                  variant="ghost"
                  onClick={() => onRefreshTree(p)}
                  disabled={!baseUrlReady}
                  title="Sign in to Jama and scrape this project's Explorer sidebar so the destination picker has fresh data."
                >
                  Refresh tree
                </Button>
                <Button
                  small
                  onClick={() => onPickDestination(p)}
                  title="Open the cached project tree and choose a default destination Set node."
                >
                  Pick destination
                </Button>
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
        <Button variant="ghost" small onClick={onNew} disabled={!baseUrlReady}>+ New export profile</Button>
      )}
      <div style={{ flex: 1 }} />
      <Button variant="ghost" small onClick={onClose}>Close</Button>
    </div>
  </>
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

    <PrerequisiteBanner T={T} />

    <Input
      label="Project label"
      value={form.project_label}
      onChange={(v) => setForm((f) => ({ ...f, project_label: v }))}
      style={{ marginBottom: 4 }}
    />
    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 12 }}>
      Human-readable name shown in the export UI. Doesn't need to match Jama's name exactly.
    </div>

    <Input
      label="Profile name"
      value={form.name}
      onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      placeholder="e.g. Fairway 2.0 — TC Export"
      style={{ marginBottom: 6 }}
    />
    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
      You'll pick a default destination Set inside the subtree (below) after
      the profile is created, by running "Refresh tree" then "Pick destination".
    </div>

    <Input
      label="Subtree to scrape (contains your test-case Sets)"
      value={form.scrape_subtree_name}
      onChange={(v) => setForm((f) => ({ ...f, scrape_subtree_name: v }))}
      placeholder="Verification & Validation"
      mono
      style={{ marginBottom: 6 }}
    />
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
      Name of the top-level component in this Jama project that contains the Sets
      you push test cases into. Default <code style={{ fontFamily: mono }}>Verification &amp; Validation</code> matches the ASI
      Landscaping project — change this if your team uses a different name (e.g.
      <code style={{ fontFamily: mono }}> Test Cases</code>). Must match the Jama component name exactly, including spacing
      and the &amp; ampersand. Open this project in Jama and copy the name from
      the Explorer sidebar to be sure.
    </div>

    <Input
      label="Jama saved-mapping name"
      value={form.import_mapping_name}
      onChange={(v) => setForm((f) => ({ ...f, import_mapping_name: v }))}
      placeholder="Testforge Auto Import"
      mono
      style={{ marginBottom: 6 }}
    />
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
      Match the mapping name you saved in Jama during the prerequisite step above.
      Testforge picks this mapping from the dropdown on every push so the import
      doesn't need re-configuring.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button small onClick={onSave} disabled={busy}>
        {busy ? "Saving..." : "Save profile"}
      </Button>
    </div>
  </div>
);

// Shared prerequisite banner shown at the top of the create form and
// the edit form. The order of operations is non-obvious — the Jama
// mapping has to exist BEFORE the first push, otherwise the saved-
// mapping name we type into the form won't match anything in Jama's
// dropdown. Pinning this at the top makes the sequence unmistakable.
const PrerequisiteBanner = ({ T }) => (
  <div style={{
    fontSize: 12, color: T.text, marginBottom: 16, lineHeight: 1.6,
    padding: "12px 14px", background: T.amberDim, borderRadius: 6,
    border: `1px solid ${T.amber}55`,
  }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 6 }}>
      One-time setup in Jama (do this once per Jama project — before your first push)
    </div>
    <ol style={{ margin: 0, paddingLeft: 22, color: T.text }}>
      <li>Open Testforge → Library → select any test case → use the "Export → XLSX" button to download a sample Testforge-exported file.</li>
      <li>In Jama, right-click on the Set you'll push test cases to → <strong>Import</strong> → upload that XLSX.</li>
      <li>Walk through the Data Import Wizard, configure the field mappings (Name → Name, Description → Description, Step Action → Step Action, etc.).</li>
      <li>On the final wizard step click <strong>"Save This As New Document Mapping"</strong> and give it a memorable name.</li>
      <li>Enter that exact name into the <em>Jama saved-mapping name</em> field below.</li>
    </ol>
    <div style={{ marginTop: 8, fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
      Skipping this means every push will fail to find the mapping in Jama's dropdown.
      You only need to do it once per Jama project, not per Testforge profile.
    </div>
  </div>
);

const TreeScrapingView = ({ T, status, log, profile }) => (
  <div>
    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
      Scraping tree for "{profile?.name}" — {status?.status_message || "Starting..."}
    </div>
    <StatusBadge T={T} status={status?.status} />
    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>
      Large projects can take a couple minutes — each collapsed node is expanded
      and then the virtualized list is walked top-to-bottom to capture every
      row. Watch the log below for live progress; you can also close this
      panel and re-open it later (the scrape keeps running on the server).
    </div>
    <LogPane T={T} log={log} style={{ marginTop: 12 }} />
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

    <Input
      label="Subtree to scrape (contains your test-case Sets)"
      value={form.scrape_subtree_name}
      onChange={(v) => setForm((f) => ({ ...f, scrape_subtree_name: v }))}
      placeholder="Verification & Validation"
      mono
      style={{ marginBottom: 6 }}
    />
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
      Name of the top-level component in this Jama project that contains the Sets
      you push test cases into. Must match the Jama component name exactly. If you
      change this, click "Refresh tree" on the profile afterwards so the destination
      picker reflects the new subtree.
    </div>

    <Input
      label="Jama saved-mapping name"
      value={form.import_mapping_name}
      onChange={(v) => setForm((f) => ({ ...f, import_mapping_name: v }))}
      placeholder="Testforge Auto Import"
      mono
      style={{ marginBottom: 6 }}
    />
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
      Match the mapping name you saved in Jama (see the prerequisite below if you
      haven't done that yet — it has to be done once per Jama project before any
      push will work).
    </div>

    <PrerequisiteBanner T={T} />

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
      Delete export profile <strong>{profile?.name}</strong>? This cannot be undone.
      The cached project tree stays — it's keyed on the Jama project, not the profile.
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost" small onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="danger" small onClick={onConfirm} disabled={busy}>
        {busy ? "Deleting..." : "Delete"}
      </Button>
    </div>
  </div>
);

// ─── Helpers ────────────────────────────────────────────────────────────

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
