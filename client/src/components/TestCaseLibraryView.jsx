import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, ReqIdTag, EmptyState, DraftDisclaimer, AutoResizeTextarea, RejectionPicker, PurgeConfirmation, TestCaseEditForm, InlineConfirm, OverflowMenu, useIsMobile } from "./shared";
import { useAsyncAction, useSelection, useExpandCollapse, useInlineEdit } from "../hooks";

export const TestCaseLibraryView = ({ testCases, requirements = [], refresh }) => {
  const COLORS = useTheme();
  const isMobile = useIsMobile();

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { isExpanded, toggle: toggleExpand } = useExpandCollapse();
  const edit = useInlineEdit();
  const [runAsync, { loading: asyncLoading }] = useAsyncAction();
  const [runEdit, { loading: editSaving, error: editError, clearError: clearEditError }] = useAsyncAction();

  // ── Local state ────────────────────────────────────────────────────────────
  const [clearing, setClearing] = useState(false);
  const [refiningTcId, setRefiningTcId] = useState(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [refineCopyState, setRefineCopyState] = useState("idle");

  const [filter, setFilter] = useState("all"); // all | draft | reviewed | rejected
  const [searchQuery, setSearchQuery] = useState("");
  const [rejectingTcId, setRejectingTcId] = useState(null);
  const [purgingTcId, setPurgingTcId] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);   // null | "delete" | "purge"
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearRejectedConfirm, setClearRejectedConfirm] = useState(false);
  const [traceSearch, setTraceSearch] = useState("");

  const sortedTcs = [...testCases].sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || ""));
  const statusFiltered = filter === "all" ? sortedTcs : sortedTcs.filter(tc => tc.status.toLowerCase() === filter);
  const filteredTcs = !searchQuery.trim() ? statusFiltered : (() => {
    const q = searchQuery.toLowerCase().trim();
    return statusFiltered.filter(tc => {
      if (tc.tc_id?.toLowerCase().includes(q)) return true;
      if (tc.title?.toLowerCase().includes(q)) return true;
      if (tc.type?.toLowerCase().includes(q)) return true;
      // Search linked requirement IDs
      const reqs = Array.isArray(tc.linked_req_ids) ? tc.linked_req_ids : (() => { try { return JSON.parse(tc.linked_req_ids || "[]"); } catch { return []; } })();
      if (reqs.some(r => r.toLowerCase().includes(q))) return true;
      // Search description objective
      try { const d = typeof tc.description === "string" && tc.description.startsWith("{") ? JSON.parse(tc.description) : null; if (d?.objective?.toLowerCase().includes(q)) return true; } catch {}
      return false;
    });
  })();
  const rejectedCount = testCases.filter(tc => tc.status === "Rejected").length;

  // Selection operates on the filtered list so "Select All" matches what's visible
  const { selectedIds: selectedTcIds, toggle: toggleTcSelect, toggleAll: selectAllTcs, isSelected, allSelected, selectMode: tcSelectMode, enterSelectMode, exitSelectMode } = useSelection(filteredTcs, tc => tc.tc_id);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const parseEditForm = (tc) => {
    let desc = { objective: "", scope: "", assumptions: [] };
    let setup = { preconditions: [], environment: [], equipment: [], testData: [] };
    try { if (typeof tc.description === "string" && tc.description.startsWith("{")) desc = JSON.parse(tc.description); else if (tc.description) desc.objective = tc.description; } catch {}
    try { if (typeof tc.preconditions === "string" && tc.preconditions.startsWith("{")) setup = JSON.parse(tc.preconditions); else if (tc.preconditions) setup.preconditions = [tc.preconditions]; } catch {}
    let linkedReqs = [];
    try { linkedReqs = Array.isArray(tc.linked_req_ids) ? tc.linked_req_ids : JSON.parse(tc.linked_req_ids || "[]"); } catch {}
    return { title: tc.title || "", type: tc.type || "Happy Path", description: desc, setup, steps: tc.steps || [], linked_req_ids: linkedReqs };
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveEdit = async (tcId) => {
    await runEdit(async () => {
      await api.updateTestCase(tcId, { title: edit.editForm.title, type: edit.editForm.type, description: edit.editForm.description, preconditions: edit.editForm.setup, steps: edit.editForm.steps, linked_req_ids: edit.editForm.linked_req_ids });
      edit.cancelEdit();
      setTraceSearch("");
      refresh();
    });
  };

  const updateStatus = async (tcId, status, rejectionReason) => {
    try {
      await api.updateTcStatus(tcId, status, rejectionReason);
      setRejectingTcId(null);
      refresh();
    } catch (err) { console.error(err); }
  };

  // Called by PurgeConfirmation when the user confirms. Errors propagate up
  // so the PurgeConfirmation panel can surface them inline; on success we
  // close the panel and refresh.
  const confirmPurge = async (tcId) => {
    await api.discardTestCase(tcId);
    setPurgingTcId(null);
    refresh();
  };

  const refineTestCase = async (tcId) => {
    if (!refineFeedback.trim()) return;
    setRefineLoading(true); setRefineError("");
    try {
      await api.refineTestCase(tcId, refineFeedback.trim());
      setRefiningTcId(null); setRefineFeedback(""); refresh();
    } catch (err) { setRefineError(err.message); }
    finally { setRefineLoading(false); }
  };

  const copyRefinePrompt = async (tcId) => {
    if (!refineFeedback.trim()) return;
    setRefineCopyState("copying");
    try {
      const data = await api.refinePrompt(tcId, refineFeedback.trim());
      await navigator.clipboard.writeText(data.prompt);
      setRefineCopyState("copied");
      setTimeout(() => setRefineCopyState("idle"), 2000);
    } catch { setRefineCopyState("error"); setTimeout(() => setRefineCopyState("idle"), 2000); }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await api.clearTestCases();
      setClearAllConfirm(false);
      refresh();
    } catch (err) { alert(`Failed: ${err.message}`); }
    finally { setClearing(false); }
  };

  const clearRejected = async () => {
    try {
      await api.clearRejectedTestCases();
      setClearRejectedConfirm(false);
      refresh();
    } catch (err) { alert(`Failed: ${err.message}`); }
  };

  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); exitSelectMode(); };

  const deleteSelected = async () => {
    await runAsync(async () => {
      await api.deleteTestCases([...selectedTcIds]);
      setBulkConfirm(null);
      exitSelectMode();
      refresh();
    });
  };

  const purgeSelected = async () => {
    await runAsync(async () => {
      await api.discardTestCases([...selectedTcIds]);
      setBulkConfirm(null);
      exitSelectMode();
      refresh();
    });
  };

  const counts = {
    all: testCases.length,
    draft: testCases.filter(tc => tc.status === "Draft").length,
    reviewed: testCases.filter(tc => tc.status === "Reviewed").length,
    rejected: rejectedCount,
  };

  return (
    <div>
      {/* Header row — title left, actions right */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 0, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Library</h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
            {tcSelectMode && selectedTcIds.size === 0
              ? "Select test cases to export, delete, or purge"
              : <>{testCases.length} test case{testCases.length !== 1 ? "s" : ""} total{tcSelectMode && selectedTcIds.size > 0 ? ` · ${selectedTcIds.size} selected` : ""}</>
            }
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!tcSelectMode && !clearRejectedConfirm && !clearAllConfirm && <>
            {testCases.length > 0 && (
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by ID, title, type, or requirement..."
                style={{
                  width: isMobile ? "100%" : 280, boxSizing: "border-box",
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, color: COLORS.textBright, fontSize: 12,
                  padding: "6px 12px", fontFamily: mono, outline: "none",
                }}
              />
            )}
            {testCases.length > 0 && <Button variant="secondary" small onClick={enterSelectMode}>Select</Button>}
            <OverflowMenu
              items={[
                { label: "Export XLSX", onClick: () => api.exportTestCasesXlsx(), disabled: testCases.length === 0 },
                { label: `Clear Rejected (${rejectedCount})`, onClick: () => setClearRejectedConfirm(true), severity: "danger", hidden: rejectedCount === 0 },
                { label: "Clear All", onClick: () => setClearAllConfirm(true), severity: "danger", disabled: testCases.length === 0 },
              ]}
            />
          </>}
          {!tcSelectMode && clearRejectedConfirm && (
            <InlineConfirm
              prompt={`Delete ${rejectedCount} rejected test case${rejectedCount !== 1 ? "s" : ""}?`}
              onConfirm={clearRejected}
              onCancel={() => setClearRejectedConfirm(false)}
            />
          )}
          {!tcSelectMode && clearAllConfirm && (
            <InlineConfirm
              prompt={`Delete all ${testCases.length} test case${testCases.length !== 1 ? "s" : ""}?`}
              onConfirm={clearAll}
              onCancel={() => setClearAllConfirm(false)}
            />
          )}
          {tcSelectMode && (bulkConfirm === "purge" ? (
            <InlineConfirm
              prompt={`⚠ Purge ${selectedTcIds.size} test case${selectedTcIds.size !== 1 ? "s" : ""}? Their feedback will also be erased from the learning engine.`}
              severity="warning"
              onConfirm={purgeSelected}
              onCancel={() => setBulkConfirm(null)}
            />
          ) : bulkConfirm === "delete" ? (
            <InlineConfirm
              prompt={`Delete ${selectedTcIds.size} selected test case${selectedTcIds.size !== 1 ? "s" : ""}?`}
              onConfirm={deleteSelected}
              onCancel={() => setBulkConfirm(null)}
            />
          ) : (
            <>
              <Button variant="secondary" small onClick={selectAllTcs}>{allSelected ? "Deselect All" : "Select All"}</Button>
              {selectedTcIds.size > 0 && <>
                <Button variant="primary" small onClick={exportSelected}>Export Selected ({selectedTcIds.size})</Button>
                <Button variant="danger" small onClick={() => setBulkConfirm("delete")} disabled={asyncLoading}>Delete Selected ({selectedTcIds.size})</Button>
                <Button variant="warning" small onClick={() => setBulkConfirm("purge")} disabled={asyncLoading}>Purge Selected ({selectedTcIds.size})</Button>
              </>}
              <Button variant="ghost" small onClick={exitSelectMode}>Cancel</Button>
            </>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "All"], ["draft", "Draft"], ["reviewed", "Reviewed"], ["rejected", "Rejected"]].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: "5px 12px", borderRadius: 6, border: `1px solid ${filter === key ? COLORS.accent : COLORS.border}`,
              background: filter === key ? COLORS.accentDim : "transparent", cursor: "pointer",
              fontSize: 12, fontFamily: mono, fontWeight: filter === key ? 600 : 400,
              color: filter === key ? COLORS.accent : COLORS.textMuted,
            }}>
              {label} <span style={{ opacity: 0.6 }}>({counts[key]})</span>
            </button>
          ))}
        </div>
      </div>

      {filteredTcs.length === 0 ? (
        <EmptyState icon="◨" title="No Test Cases" subtitle={filter === "all" ? "Generate drafts on the Generate page" : `No ${filter} test cases`} />
      ) : (
        <>
          {filteredTcs.some(tc => tc.status === "Draft") && <DraftDisclaimer style={{ marginBottom: 16 }} />}
          {filteredTcs.map(tc => {
            let desc = null, setup = null;
            try { desc = typeof tc.description === "string" && tc.description.startsWith("{") ? JSON.parse(tc.description) : null; } catch {}
            try { setup = typeof tc.preconditions === "string" && tc.preconditions.startsWith("{") ? JSON.parse(tc.preconditions) : null; } catch {}
            const expanded = isExpanded(tc.tc_id);

            return (
              <Card key={tc.tc_id} style={{ marginBottom: 10, border: tcSelectMode && isSelected(tc.tc_id) ? `1px solid ${COLORS.accent}` : undefined }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : toggleExpand(tc.tc_id)}>
                  {tcSelectMode && <input type="checkbox" checked={isSelected(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
                  <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>{tc.tc_id}</span>
                  <div style={{ flex: 1, cursor: "pointer" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, display: "flex", alignItems: "center", gap: 8 }}>
                      {tc.title}
                      {tc.status === "Draft" && <span style={{ fontSize: 9, fontFamily: mono, color: COLORS.amber, background: COLORS.amberDim, padding: "1px 6px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>Draft</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {tc.project_id && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Project ID: <span style={{ color: COLORS.accent }}>{tc.project_id}</span></span>}
                      {tc.upstream_relationship?.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Upstream: {tc.upstream_relationship.map(u => <span key={u.id} style={{ color: COLORS.purple, marginRight: 4 }}>{u.id}</span>)}</span>}
                      {(tc.linked_req_ids || []).length > 0 && <><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>Traces to:</span>{(tc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}</>}
                      <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type}</Badge>
                    </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                    {expanded && <Button small variant="secondary" onClick={e => { e.stopPropagation(); edit.isEditing(tc.tc_id) ? edit.cancelEdit() : edit.startEdit(tc.tc_id, parseEditForm(tc)); }}>{edit.isEditing(tc.tc_id) ? "Cancel" : "Edit"}</Button>}
                    <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}</Button>
                    <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); setRejectingTcId(rejectingTcId === tc.tc_id ? null : tc.tc_id); }}> &#10007;</Button>
                    <Button small variant="warning" onClick={e => { e.stopPropagation(); setPurgingTcId(purgingTcId === tc.tc_id ? null : tc.tc_id); }} title="Purge — removes the TC and erases its feedback from the learning engine">⚠ Purge</Button>
                    <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ marginLeft: 4 }}>{tc.status}</Badge>
                  </div>
                </div>

                {/* Rejection reason picker — full-width below header */}
                {rejectingTcId === tc.tc_id && (
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <RejectionPicker
                      onReject={(reason) => updateStatus(tc.tc_id, "Rejected", reason)}
                      onCancel={() => setRejectingTcId(null)}
                    />
                  </div>
                )}

                {/* Purge confirmation panel — full-width below header */}
                {purgingTcId === tc.tc_id && (
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <PurgeConfirmation
                      tcId={tc.tc_id}
                      onConfirm={confirmPurge}
                      onCancel={() => setPurgingTcId(null)}
                    />
                  </div>
                )}
                </div>

                {expanded && (() => {
                  const SL = ({ children }) => <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                  const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                  const isEditing = edit.isEditing(tc.tc_id) && edit.editForm;
                  return (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                      {isEditing && (
                        <TestCaseEditForm
                          editForm={edit.editForm}
                          setEditForm={edit.setEditForm}
                          onSave={() => saveEdit(tc.tc_id)}
                          onCancel={() => { edit.cancelEdit(); clearEditError(); }}
                          saving={editSaving}
                          error={editError}
                          requirements={requirements}
                          traceSearch={traceSearch}
                          setTraceSearch={setTraceSearch}
                          stopPropagation
                        />
                      )}
                      {!isEditing && <>
                      {tc.status === "Draft" && <div style={{ marginBottom: 14, padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, fontSize: 10, color: COLORS.amber, fontFamily: mono }}>DRAFT — Review required</div>}

                      {desc ? <>
                        <SL>Description</SL>
                        {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
                        {tc.testlink_requirements?.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>TestLink Requirements: </span>
                            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                              {tc.testlink_requirements.map((r, i) => (
                                <li key={i} style={{ fontSize: 11, lineHeight: 1.6 }}>
                                  <span style={{ fontFamily: mono, fontWeight: 600, color: COLORS.accent }}>{r.doc_id}</span>
                                  {r.title ? <span style={{ color: COLORS.textMuted }}> — {r.title}</span> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {desc.scope?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{Array.isArray(desc.scope) ? desc.scope.join(", ") : desc.scope}</span></div>}
                        {desc.assumptions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Assumptions:</span><BL items={desc.assumptions} /></>}
                      </> : tc.description ? <><SL>Description</SL><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.description}</div></> : null}

                      {setup ? <>
                        <SL>Setup</SL>
                        {setup.preconditions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BL items={setup.preconditions} /></>}
                        {setup.environment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BL items={setup.environment} /></>}
                        {setup.equipment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BL items={setup.equipment} /></>}
                        {setup.testData?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BL items={setup.testData} /></>}
                      </> : tc.preconditions ? <><SL>Setup</SL><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.preconditions}</div></> : null}

                      <SL>Test Steps</SL>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step Action</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected Result</th>
                        </tr></thead>
                        <tbody>{(tc.steps || []).map((s, i) => {
                          const hasHtml = c => typeof c === "string" && c.includes("<img");
                          const renderCell = (content, color) => hasHtml(content)
                            ? <span style={{ color }} dangerouslySetInnerHTML={{ __html: content }} />
                            : <span style={{ color }}>{content}</span>;
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                              <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                              <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.step, COLORS.text)}</td>
                              <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.expectedResult, COLORS.green)}</td>
                            </tr>
                          );
                        })}</tbody>
                      </table>

                      {tc.upstream_relationship?.length > 0 && <>
                        <SL>Upstream Relationships</SL>
                        {tc.upstream_relationship.map((u, i) => (
                          <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${COLORS.accent}44` }}>
                            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: COLORS.accent }}>{u.id}</span>
                            <span style={{ color: COLORS.textMuted, margin: "0 6px" }}>—</span>
                            <span>{u.name}</span>
                          </div>
                        ))}
                      </>}

                      {/* Refine */}
                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
                        {refiningTcId === tc.tc_id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <SL>Refine Test Case</SL>
                            <AutoResizeTextarea
                              value={refineFeedback}
                              onChange={e => setRefineFeedback(e.target.value)}
                              placeholder="Describe improvements — e.g. 'Add a step to verify error message displays correctly' or 'Include boundary test for max input length'"
                              rows={3}
                              mono
                            />
                            {refineError && <div style={{ fontSize: 11, color: COLORS.red }}>{refineError}</div>}
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Button small variant="primary" disabled={refineLoading || !refineFeedback.trim()} onClick={e => { e.stopPropagation(); refineTestCase(tc.tc_id); }}>
                                {refineLoading ? "Refining..." : "Submit Refinement"}
                              </Button>
                              <Button small variant="secondary" disabled={refineLoading || !refineFeedback.trim() || refineCopyState === "copying"} onClick={e => { e.stopPropagation(); copyRefinePrompt(tc.tc_id); }}>
                                {refineCopyState === "copying" ? "Copying..." : refineCopyState === "copied" ? "Copied!" : refineCopyState === "error" ? "Failed" : "Copy Prompt"}
                              </Button>
                              <Button small variant="ghost" disabled={refineLoading} onClick={e => { e.stopPropagation(); setRefiningTcId(null); setRefineFeedback(""); setRefineError(""); setRefineCopyState("idle"); }}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button small variant="secondary" onClick={e => { e.stopPropagation(); setRefiningTcId(tc.tc_id); setRefineFeedback(""); setRefineError(""); setRefineCopyState("idle"); }}>Refine</Button>
                          </div>
                        )}
                      </div>
                      </>}
                    </div>
                  );
                })()}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
};
