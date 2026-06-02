// Top-level "Push to Jama" page: pick a profile + pick test cases + push,
// all in one place. Replaces the older two-step flow (go to Library →
// enter select mode → select TCs → click Push).
//
// On launch we render a small table of test cases (default-filtered to
// the ones not yet exported to Jama) with checkbox selection + a search
// box, alongside a profile picker. Hitting Push hands off to the
// existing JamaExportRunFlow with the chosen profile preset, so we get
// the destination step + creds + progress UI for free.

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Button, Input, ErrorBanner } from "./shared";
import { JamaExportRunFlow } from "./JamaExportRunFlow";
import { JamaExportView } from "./JamaExportView";

export const PushToJamaView = ({ testCases = [], refresh, currentUser }) => {
  const T = useTheme();

  // Profiles loaded on mount; empty list shows the prerequisite checklist.
  const [profiles, setProfiles] = useState(null); // null = loading, [] = none, [...] = loaded
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Whether the inline "Manage profiles" panel (the embedded
  // JamaExportView) is visible. Auto-opened when there are no profiles
  // yet so the user lands directly in the create flow.
  const [showProfileManager, setShowProfileManager] = useState(false);

  // TC table state.
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false); // false → hide already-exported
  const [selectedTcIds, setSelectedTcIds] = useState(() => new Set());

  // When the user clicks Push, we hand off to the existing flow.
  const [pushArgs, setPushArgs] = useState(null); // null | { selectedTestCases, profileId }

  const loadProfiles = async () => {
    try {
      const data = await api.getJamaExportProfiles();
      const list = data.profiles || [];
      setProfiles(list);
      // Pre-select the first profile if nothing is selected yet, or if
      // the previously-selected one has been deleted.
      setSelectedProfileId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
      // If there are no profiles yet, drop the user straight into the
      // creation flow so they don't have to hunt for a "New profile" button.
      if (list.length === 0) setShowProfileManager(true);
    } catch (e) {
      setLoadError(e.message);
      setProfiles([]);
    }
  };

  useEffect(() => {
    loadProfiles();
    // Re-fetch whenever JamaExportView (embedded here or used standalone
    // from the Library overlay) creates/edits/deletes a profile.
    const onChange = () => loadProfiles();
    window.addEventListener("testforge:jama-export-profiles-changed", onChange);
    return () => window.removeEventListener("testforge:jama-export-profiles-changed", onChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter pipeline:
  //   1. only Approved (status === "Reviewed") — hard rule, no override
  //   2. not-yet-exported unless `showAll` is on
  //   3. search across id/title/req-ids
  const filteredTcs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return testCases
      .filter((tc) => tc.status === "Reviewed")
      .filter((tc) => showAll || !tc.jama_exported_at)
      .filter((tc) => {
        if (!q) return true;
        const haystack = `${tc.tc_id} ${tc.title || ""} ${tc.linked_req_ids || ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || ""));
  }, [testCases, showAll, searchQuery]);

  // Drop any selected IDs that fall out of the visible filter — keeps the
  // counter honest and avoids "ghost selections" the user can't see.
  useEffect(() => {
    setSelectedTcIds((prev) => {
      const visibleIds = new Set(filteredTcs.map((tc) => tc.tc_id));
      const next = new Set();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [filteredTcs]);

  const toggleTc = (tcId) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredTcs.map((tc) => tc.tc_id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedTcIds.has(id));
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredTcs.length > 0 &&
    filteredTcs.every((tc) => selectedTcIds.has(tc.tc_id));

  const startPush = () => {
    if (selectedTcIds.size === 0 || !selectedProfileId) return;
    const selected = testCases.filter((tc) => selectedTcIds.has(tc.tc_id));
    setPushArgs({ selectedTestCases: selected, profileId: selectedProfileId });
  };

  const pushClosed = () => {
    setPushArgs(null);
  };

  const pushDone = () => {
    setPushArgs(null);
    setSelectedTcIds(new Set());
    refresh?.();
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (pushArgs) {
    return (
      <JamaExportRunFlow
        selectedTestCases={pushArgs.selectedTestCases}
        presetProfileId={pushArgs.profileId}
        onClose={pushClosed}
        onExportComplete={pushDone}
      />
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: T.textBright, margin: 0, marginBottom: 4 }}>
        Push to Jama
      </h2>
      <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 20px", fontFamily: mono }}>
        Select test cases and a destination profile, then push them straight into Jama.
      </p>

      <ErrorBanner msg={loadError} />

      {profiles === null && (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
          Loading profiles...
        </div>
      )}

      {profiles && profiles.length === 0 && (
        <NoProfilesEmptyState T={T} />
      )}

      {/* Inline profile manager — embedded JamaExportView. Auto-opens
          when there are no profiles, and can be toggled by the user
          from the picker section once profiles exist. */}
      {profiles && showProfileManager && (
        <Card style={{ padding: 16, marginBottom: 16, border: `1px solid ${T.accent}55` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {profiles.length === 0 ? "Set up your first profile" : "Manage profiles"}
            </div>
            {profiles.length > 0 && (
              <button
                onClick={() => setShowProfileManager(false)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: T.textMuted, fontSize: 11, padding: 0,
                }}
                title="Hide profile manager"
              >Hide</button>
            )}
          </div>
          <JamaExportView
            currentUser={currentUser}
            onClose={() => {
              // Only allow closing the inline panel once at least one
              // profile exists — otherwise hiding it would leave the user
              // staring at an empty Push view.
              if ((profiles?.length || 0) > 0) setShowProfileManager(false);
            }}
            embedded
          />
        </Card>
      )}

      {profiles && profiles.length > 0 && (
        <>
          <ProfilePicker
            T={T}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onPick={setSelectedProfileId}
            showProfileManager={showProfileManager}
            onToggleProfileManager={() => setShowProfileManager((v) => !v)}
          />

          <TcTable
            T={T}
            testCases={testCases}
            filteredTcs={filteredTcs}
            selectedTcIds={selectedTcIds}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showAll={showAll}
            setShowAll={setShowAll}
            allVisibleSelected={allVisibleSelected}
            toggleTc={toggleTc}
            toggleAllVisible={toggleAllVisible}
          />

          <div style={{
            position: "sticky", bottom: 0, padding: "12px 0", background: T.bg,
            borderTop: `1px solid ${T.border}`, marginTop: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontSize: 12, color: T.text }}>
              <strong>{selectedTcIds.size}</strong> test case{selectedTcIds.size === 1 ? "" : "s"} selected
            </div>
            <Button
              small
              onClick={startPush}
              disabled={selectedTcIds.size === 0 || !selectedProfileId}
            >
              Push {selectedTcIds.size > 0 ? `(${selectedTcIds.size})` : ""} to Jama →
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────

const ProfilePicker = ({ T, profiles, selectedProfileId, onPick, showProfileManager, onToggleProfileManager }) => {
  const selected = profiles.find((p) => p.id === selectedProfileId);
  return (
    <Card style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: profiles.length > 1 ? 8 : 0 }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Destination profile
        </div>
        {onToggleProfileManager && (
          <button
            onClick={onToggleProfileManager}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: T.accent, fontSize: 11, padding: 0, textDecoration: "underline",
            }}
          >
            {showProfileManager ? "Hide profile manager" : "Manage profiles"}
          </button>
        )}
      </div>

      {profiles.length === 1 ? (
        <div style={{ fontSize: 13, color: T.text }}>
          <strong style={{ color: T.textBright }}>{selected.name}</strong>
          {" "}— pushes to{" "}
          <span style={{ color: T.green, fontFamily: mono, fontWeight: 600 }}>
            {selected.default_destination_name || "(no destination set)"}
          </span>
          {!selected.default_destination_name && (
            <span style={{ color: T.amber, marginLeft: 8 }}>
              ⚠ no default destination — set one in Manage profiles
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {profiles.map((p) => {
            const isSelected = p.id === selectedProfileId;
            const hasDest = !!p.default_destination_jama_id;
            return (
              <label
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "8px 10px", borderRadius: 4,
                  background: isSelected ? `${T.accent}11` : "transparent",
                  border: `1px solid ${isSelected ? T.accent : T.border}`,
                }}
              >
                <input
                  type="radio"
                  name="profile"
                  checked={isSelected}
                  onChange={() => onPick(p.id)}
                  style={{ accentColor: T.accent, cursor: "pointer" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textBright }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                    {p.project_label}
                    {hasDest ? (
                      <> · Destination <span style={{ color: T.green, fontFamily: mono }}>{p.default_destination_name}</span></>
                    ) : (
                      <span style={{ color: T.amber, marginLeft: 6 }}>· no destination set</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Card>
  );
};

const TcTable = ({
  T, testCases, filteredTcs, selectedTcIds, searchQuery, setSearchQuery,
  showAll, setShowAll,
  allVisibleSelected, toggleTc, toggleAllVisible,
}) => {
  const approvedCount = testCases.filter((tc) => tc.status === "Reviewed").length;
  const exportedCount = testCases.filter((tc) => tc.jama_exported_at && tc.status === "Reviewed").length;

  return (
    <Card style={{ padding: 0, marginBottom: 8 }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Approved test cases
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, fontFamily: mono }}>
          {filteredTcs.length} of {approvedCount} shown · {exportedCount} already pushed
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            style={{ accentColor: T.accent, cursor: "pointer" }}
          />
          Show already-pushed
        </label>
      </div>

      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
        <Input
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by id, title, or requirement..."
          style={{ marginBottom: 0 }}
        />
      </div>

      {filteredTcs.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 12, lineHeight: 1.6 }}>
          {testCases.length === 0 ? (
            "No test cases in Testforge yet. Generate some from the Requirements page first."
          ) : approvedCount === 0 ? (
            <>No <strong>approved</strong> test cases yet. Approve some in the Library tab to make them eligible for Jama push.</>
          ) : !showAll && approvedCount === exportedCount ? (
            <>All approved test cases have already been pushed. Toggle "Show already-pushed" to see them again.</>
          ) : searchQuery ? (
            "No approved test cases match your search."
          ) : (
            "No approved test cases match the current filters."
          )}
        </div>
      ) : (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          <div style={{
            padding: "8px 14px", borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 8,
            position: "sticky", top: 0, background: T.surface, zIndex: 1,
          }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              style={{ accentColor: T.accent, cursor: "pointer" }}
            />
            <span style={{ fontSize: 11, color: T.textMuted }}>
              {allVisibleSelected ? "Deselect all visible" : "Select all visible"}
            </span>
          </div>
          {filteredTcs.map((tc) => (
            <TcRow
              key={tc.tc_id}
              T={T}
              tc={tc}
              checked={selectedTcIds.has(tc.tc_id)}
              onToggle={() => toggleTc(tc.tc_id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
};

const TcRow = ({ T, tc, checked, onToggle }) => {
  const alreadyExported = !!tc.jama_exported_at;
  return (
    <label
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 14px", borderBottom: `1px solid ${T.border}`,
        cursor: "pointer",
        background: checked ? `${T.accent}11` : "transparent",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ marginTop: 2, accentColor: T.accent, cursor: "pointer" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: T.textMuted }}>{tc.tc_id}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.textBright, flex: 1, minWidth: 0 }}>
            {tc.title || "(untitled)"}
          </span>
          {tc.status && (
            <span style={{
              fontSize: 10, color: T.textMuted, padding: "2px 6px",
              border: `1px solid ${T.border}`, borderRadius: 3, fontFamily: mono,
            }}>
              {tc.status}
            </span>
          )}
          {alreadyExported && (
            <span style={{
              fontSize: 10, color: T.green, padding: "2px 6px",
              background: T.greenDim, borderRadius: 3, fontFamily: mono,
            }}>
              ✓ pushed
            </span>
          )}
        </div>
      </div>
    </label>
  );
};

const NoProfilesEmptyState = ({ T }) => (
  <div style={{
    padding: "10px 14px", marginBottom: 12,
    background: T.amberDim, borderRadius: 6,
    border: `1px solid ${T.amber}33`,
    fontSize: 12, color: T.text, lineHeight: 1.5,
  }}>
    <strong style={{ color: T.amber }}>No export profiles yet.</strong> Set one
    up below to start pushing test cases to Jama. (Admin / QA Manager only.)
  </div>
);
