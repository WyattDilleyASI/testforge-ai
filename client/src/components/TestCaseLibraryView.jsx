import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, ReqIdTag, EmptyState, DraftDisclaimer, AutoResizeTextarea, RejectionPicker, useIsMobile } from "./shared";
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
    if (!window.confirm(`Delete all ${testCases.length} test case${testCases.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setClearing(true);
    try { await api.clearTestCases(); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
    finally { setClearing(false); }
  };

  const clearRejected = async () => {
    if (!window.confirm(`Delete ${rejectedCount} rejected test case${rejectedCount !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try { await api.clearRejectedTestCases(); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
  };

  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); exitSelectMode(); };

  const deleteSelected = async () => {
    const count = selectedTcIds.size;
    if (!window.confirm(`Delete ${count} selected test case${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    await runAsync(async () => {
      await api.deleteTestCases([...selectedTcIds]);
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
            {testCases.length} test case{testCases.length !== 1 ? "s" : ""} total
            {tcSelectMode && selectedTcIds.size > 0 ? ` · ${selectedTcIds.size} selected` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!tcSelectMode && <>
            {rejectedCount > 0 && <Button variant="danger" small onClick={clearRejected}>Clear Rejected ({rejectedCount})</Button>}
            <Button variant="danger" small onClick={clearAll} disabled={testCases.length === 0 || clearing}>{clearing ? "Clearing..." : "Clear All"}</Button>
            {testCases.length > 0 && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={testCases.length === 0}>Export XLSX</Button>}
            {testCases.length > 0 && <Button variant="secondary" small onClick={enterSelectMode}>Select</Button>}
          </>}
          {tcSelectMode && <>
            <Button variant="secondary" small onClick={selectAllTcs}>{allSelected ? "Deselect All" : "Select All"}</Button>
            <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
            <Button variant="danger" small onClick={deleteSelected} disabled={selectedTcIds.size === 0 || asyncLoading}>Delete Selected ({selectedTcIds.size})</Button>
            <Button variant="ghost" small onClick={exitSelectMode}>Cancel</Button>
          </>}
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
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
        <div style={{ flex: "1 1 180px", maxWidth: 320, minWidth: 140 }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by ID, title, type, or requirement..."
            style={{
              width: "100%", boxSizing: "border-box", background: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              color: COLORS.textBright, fontSize: 12, padding: "6px 12px",
              fontFamily: mono, outline: "none",
            }}
          />
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
                </div>

                {expanded && (() => {
                  const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                  const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                  const isEditing = edit.isEditing(tc.tc_id) && edit.editForm;
                  return (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                      {isEditing && (() => {
                        const lbl = (text) => <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono, letterSpacing: "0.06em", marginBottom: 4 }}>{text}</label>;
                        const inp = (val, onChange) => <input value={val} onChange={onChange} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 13, padding: "6px 10px", outline: "none" }} />;
                        const ta = (val, onChange, rows = 3) => <AutoResizeTextarea value={val} onChange={onChange} rows={rows} />;
                        const arrVal = (arr) => (arr || []).join("\n");
                        const arrChange = (path, e) => {
                          const items = e.target.value.split("\n");
                          edit.setEditForm(p => {
                            const parts = path.split(".");
                            if (parts.length === 1) return { ...p, [parts[0]]: items };
                            if (parts[0] === "description") return { ...p, description: { ...p.description, [parts[1]]: items } };
                            if (parts[0] === "setup") return { ...p, setup: { ...p.setup, [parts[1]]: items } };
                            return p;
                          });
                        };
                        const arrHint = <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>One item per line</div>;
                        const section = (label) => <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 16, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${COLORS.border}` }}>{label}</div>;
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                              <div style={{ flex: 1 }}>
                                {lbl("Title")}
                                {inp(edit.editForm.title, e => edit.setEditForm(p => ({ ...p, title: e.target.value })))}
                              </div>
                              <div style={{ minWidth: 150 }}>
                                {lbl("Type")}
                                <select value={edit.editForm.type} onChange={e => edit.setEditForm(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "6px 10px", outline: "none" }}>
                                  {["Happy Path", "Negative", "Boundary", "Edge Case"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                            {section("Traced Requirements")}
                            <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.bg, overflow: "hidden" }}>
                              {/* Selected traces as chips */}
                              {(edit.editForm.linked_req_ids || []).length > 0 && (
                                <div style={{
                                  display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 8px 6px",
                                  borderBottom: `1px solid ${COLORS.border}`, background: COLORS.accentDim,
                                }}>
                                  {(edit.editForm.linked_req_ids || []).map(rid => (
                                    <span key={rid} style={{
                                      display: "inline-flex", alignItems: "center", gap: 4,
                                      background: COLORS.accent, color: COLORS.bg,
                                      fontSize: 10, fontFamily: mono, fontWeight: 700,
                                      padding: "2px 6px 2px 8px", borderRadius: 10,
                                    }}>
                                      {rid}
                                      <span
                                        role="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          edit.setEditForm(p => ({
                                            ...p,
                                            linked_req_ids: p.linked_req_ids.filter(id => id !== rid),
                                          }));
                                        }}
                                        style={{
                                          cursor: "pointer", fontSize: 13, lineHeight: 1,
                                          padding: "0 2px", borderRadius: "50%", opacity: 0.7,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                        onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                                      >
                                        ×
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Search input */}
                              <div style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}` }}>
                                <input
                                  value={traceSearch}
                                  onChange={e => setTraceSearch(e.target.value)}
                                  placeholder="Search requirements by ID or title..."
                                  style={{
                                    width: "100%", boxSizing: "border-box", background: COLORS.surface,
                                    border: `1px solid ${COLORS.border}`, borderRadius: 4,
                                    color: COLORS.textBright, fontSize: 12, padding: "6px 10px",
                                    fontFamily: mono, outline: "none",
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              {/* Requirement checklist */}
                              <div style={{ maxHeight: 180, overflowY: "auto", padding: 8 }}>
                                {requirements.length === 0 && (
                                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic" }}>No requirements loaded</div>
                                )}
                                {(() => {
                                  const linked = edit.editForm.linked_req_ids || [];
                                  const query = traceSearch.toLowerCase().trim();
                                  const filtered = requirements.filter(req => {
                                    const alreadyLinked = linked.includes(req.req_id);
                                    if (alreadyLinked) return true;
                                    if (!query) return true;
                                    return req.req_id.toLowerCase().includes(query)
                                      || (req.title || "").toLowerCase().includes(query);
                                  });
                                  const sorted = [...filtered].sort((a, b) => {
                                    const aLinked = linked.includes(a.req_id) ? 0 : 1;
                                    const bLinked = linked.includes(b.req_id) ? 0 : 1;
                                    if (aLinked !== bLinked) return aLinked - bLinked;
                                    return a.req_id.localeCompare(b.req_id);
                                  });
                                  if (sorted.length === 0) {
                                    return <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", padding: "4px 0" }}>No matches for "{traceSearch}"</div>;
                                  }
                                  return sorted.map(req => {
                                    const isLinked = linked.includes(req.req_id);
                                    return (
                                      <label key={req.req_id} style={{
                                        display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 6px",
                                        cursor: "pointer", fontSize: 12, color: COLORS.text,
                                        borderRadius: 4,
                                        background: isLinked ? `${COLORS.accent}11` : "transparent",
                                        borderLeft: isLinked ? `3px solid ${COLORS.accent}` : "3px solid transparent",
                                        transition: "background 0.3s ease, border-left 0.3s ease",
                                      }}>
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={() => {
                                            edit.setEditForm(p => ({
                                              ...p,
                                              linked_req_ids: isLinked
                                                ? p.linked_req_ids.filter(id => id !== req.req_id)
                                                : [...(p.linked_req_ids || []), req.req_id],
                                            }));
                                          }}
                                          style={{ marginTop: 2, accentColor: COLORS.accent }}
                                        />
                                        <span>
                                          <span style={{ fontFamily: mono, fontWeight: 600, color: isLinked ? COLORS.accent : COLORS.textMuted, transition: "color 0.3s ease" }}>{req.req_id}</span>
                                          {req.title && <span style={{ color: COLORS.textMuted }}> — {req.title}</span>}
                                        </span>
                                      </label>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                            {(edit.editForm.linked_req_ids || []).length > 0 && (
                              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontFamily: mono }}>
                                {edit.editForm.linked_req_ids.length} requirement{edit.editForm.linked_req_ids.length !== 1 ? "s" : ""} traced
                              </div>
                            )}
                            {section("Description")}
                            <div>{lbl("Objective")}{ta(edit.editForm.description?.objective || "", e => edit.setEditForm(p => ({ ...p, description: { ...p.description, objective: e.target.value } })), 4)}</div>
                            <div>{lbl("Scope")}{ta(edit.editForm.description?.scope || "", e => edit.setEditForm(p => ({ ...p, description: { ...p.description, scope: e.target.value } })), 2)}</div>
                            <div>{lbl("Assumptions")}{arrHint}{ta(arrVal(edit.editForm.description?.assumptions), e => arrChange("description.assumptions", e), 3)}</div>
                            {section("Setup")}
                            <div>{lbl("Preconditions")}{arrHint}{ta(arrVal(edit.editForm.setup?.preconditions), e => arrChange("setup.preconditions", e), 3)}</div>
                            <div>{lbl("Environment")}{arrHint}{ta(arrVal(edit.editForm.setup?.environment), e => arrChange("setup.environment", e), 2)}</div>
                            <div>{lbl("Equipment")}{arrHint}{ta(arrVal(edit.editForm.setup?.equipment), e => arrChange("setup.equipment", e), 2)}</div>
                            <div>{lbl("Test Data")}{arrHint}{ta(arrVal(edit.editForm.setup?.testData), e => arrChange("setup.testData", e), 2)}</div>
                            {section("Test Steps")}
                            {(edit.editForm.steps || []).map((s, i) => (
                              <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${COLORS.border}` }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono }}>Step {i + 1}</div>
                                  <button onClick={e => { e.stopPropagation(); edit.setEditForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) })); }} disabled={edit.editForm.steps.length <= 1} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red, fontFamily: mono, fontSize: 14, lineHeight: 1, padding: "0 2px", opacity: edit.editForm.steps.length <= 1 ? 0.25 : 0.6 }} title="Delete step">×</button>
                                </div>
                                <div style={{ marginBottom: 4 }}>{lbl("Action")}{ta(s.step, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}</div>
                                <div>{lbl("Expected Result")}{ta(s.expectedResult, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}</div>
                              </div>
                            ))}
                            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                              <Button small onClick={e => { e.stopPropagation(); saveEdit(tc.tc_id); }} disabled={editSaving || !edit.editForm.title.trim()}>{editSaving ? "Saving..." : "Save"}</Button>
                              <Button small variant="ghost" onClick={e => { e.stopPropagation(); edit.cancelEdit(); clearEditError(); }}>Cancel</Button>
                              {editError && <span style={{ fontSize: 11, color: COLORS.red, fontFamily: mono }}>{editError}</span>}
                            </div>
                          </div>
                        );
                      })()}
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
