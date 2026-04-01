import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, ReqIdTag, EmptyState, DraftDisclaimer } from "./shared";

export const TestCaseLibraryView = ({ testCases, refresh }) => {
  const COLORS = useTheme();
  const [expandedTc, setExpandedTc] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [refiningTcId, setRefiningTcId] = useState(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [refineCopyState, setRefineCopyState] = useState("idle");
  const [tcSelectMode, setTcSelectMode] = useState(false);
  const [selectedTcIds, setSelectedTcIds] = useState(new Set());
  const [exampleTcId, setExampleTcId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | draft | reviewed | rejected
  const [editingTcId, setEditingTcId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    api.getExampleTc().then(d => { if (d.example_tc) setExampleTcId(d.example_tc.tc_id); }).catch(() => {});
  }, []);

  const sortedTcs = [...testCases].sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || ""));
  const filteredTcs = filter === "all" ? sortedTcs : sortedTcs.filter(tc => tc.status.toLowerCase() === filter);
  const rejectedCount = testCases.filter(tc => tc.status === "Rejected").length;

  const startEdit = (tc) => {
    let desc = { objective: "", scope: "", assumptions: [] };
    let setup = { preconditions: [], environment: [], equipment: [], testData: [] };
    try { if (typeof tc.description === "string" && tc.description.startsWith("{")) desc = JSON.parse(tc.description); else if (tc.description) desc.objective = tc.description; } catch {}
    try { if (typeof tc.preconditions === "string" && tc.preconditions.startsWith("{")) setup = JSON.parse(tc.preconditions); else if (tc.preconditions) setup.preconditions = [tc.preconditions]; } catch {}
    setEditForm({ title: tc.title || "", type: tc.type || "Happy Path", description: desc, setup, steps: tc.steps || [] });
    setEditingTcId(tc.tc_id);
  };

  const saveEdit = async (tcId) => {
    setEditSaving(true);
    try {
      await api.updateTestCase(tcId, { title: editForm.title, type: editForm.type, description: editForm.description, preconditions: editForm.setup, steps: editForm.steps });
      setEditingTcId(null);
      setEditForm(null);
      refresh();
    } catch (err) { console.error(err); }
    finally { setEditSaving(false); }
  };

  const updateStatus = async (tcId, status) => {
    try { await api.updateTcStatus(tcId, status); refresh(); } catch (err) { console.error(err); }
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

  const toggleTcSelect = (tcId) => setSelectedTcIds(prev => { const next = new Set(prev); next.has(tcId) ? next.delete(tcId) : next.add(tcId); return next; });
  const selectAllTcs = () => setSelectedTcIds(prev => prev.size === filteredTcs.length ? new Set() : new Set(filteredTcs.map(tc => tc.tc_id)));
  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); setTcSelectMode(false); setSelectedTcIds(new Set()); };

  const counts = {
    all: testCases.length,
    draft: testCases.filter(tc => tc.status === "Draft").length,
    reviewed: testCases.filter(tc => tc.status === "Reviewed").length,
    rejected: rejectedCount,
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Library</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
          {testCases.length} test case{testCases.length !== 1 ? "s" : ""} total
          {tcSelectMode && selectedTcIds.size > 0 ? ` · ${selectedTcIds.size} selected` : ""}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        {/* Filter tabs */}
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

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          {!tcSelectMode && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={testCases.length === 0}>Export XLSX</Button>}
          {!tcSelectMode && testCases.length > 0 && <Button variant="secondary" small onClick={() => { setTcSelectMode(true); setSelectedTcIds(new Set()); }}>Select</Button>}
          {tcSelectMode && <>
            <Button variant="secondary" small onClick={selectAllTcs}>{selectedTcIds.size === filteredTcs.length ? "Deselect All" : "Select All"}</Button>
            <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
            <Button variant="ghost" small onClick={() => { setTcSelectMode(false); setSelectedTcIds(new Set()); }}>Cancel</Button>
          </>}
          {rejectedCount > 0 && <Button variant="danger" small onClick={clearRejected}>Clear Rejected ({rejectedCount})</Button>}
          <Button variant="danger" small onClick={clearAll} disabled={testCases.length === 0 || clearing}>{clearing ? "Clearing..." : "Clear All"}</Button>
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
            const isExpanded = expandedTc === tc.tc_id;

            return (
              <Card key={tc.tc_id} style={{ marginBottom: 10, border: tcSelectMode && selectedTcIds.has(tc.tc_id) ? `1px solid ${COLORS.accent}` : undefined }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : setExpandedTc(isExpanded ? null : tc.tc_id)}>
                  {tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
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
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                    {isExpanded && <Button small variant="secondary" onClick={e => { e.stopPropagation(); editingTcId === tc.tc_id ? (setEditingTcId(null), setEditForm(null)) : startEdit(tc); }}>{editingTcId === tc.tc_id ? "Cancel" : "Edit"}</Button>}
                    <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}</Button>
                    <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Rejected"); }}>&#10007;</Button>
                    <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ marginLeft: 4 }}>{tc.status}</Badge>
                  </div>
                </div>

                {isExpanded && (() => {
                  const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                  const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                  const isEditing = editingTcId === tc.tc_id && editForm;
                  return (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                      {isEditing && (() => {
                        const lbl = (text) => <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono, letterSpacing: "0.06em", marginBottom: 4 }}>{text}</label>;
                        const inp = (val, onChange) => <input value={val} onChange={onChange} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 13, padding: "6px 10px", outline: "none" }} />;
                        const ta = (val, onChange, rows = 3) => <textarea value={val} onChange={onChange} rows={rows} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "6px 10px", resize: "vertical", outline: "none" }} />;
                        const arrVal = (arr) => (arr || []).join("\n");
                        const arrChange = (path, e) => {
                          const items = e.target.value.split("\n");
                          setEditForm(p => {
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
                                {inp(editForm.title, e => setEditForm(p => ({ ...p, title: e.target.value })))}
                              </div>
                              <div style={{ minWidth: 150 }}>
                                {lbl("Type")}
                                <select value={editForm.type} onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "6px 10px", outline: "none" }}>
                                  {["Happy Path", "Negative", "Boundary", "Edge Case"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                            {section("Description")}
                            <div>{lbl("Objective")}{ta(editForm.description?.objective || "", e => setEditForm(p => ({ ...p, description: { ...p.description, objective: e.target.value } })), 4)}</div>
                            <div>{lbl("Scope")}{ta(editForm.description?.scope || "", e => setEditForm(p => ({ ...p, description: { ...p.description, scope: e.target.value } })), 2)}</div>
                            <div>{lbl("Assumptions")}{arrHint}{ta(arrVal(editForm.description?.assumptions), e => arrChange("description.assumptions", e), 3)}</div>
                            {section("Setup")}
                            <div>{lbl("Preconditions")}{arrHint}{ta(arrVal(editForm.setup?.preconditions), e => arrChange("setup.preconditions", e), 3)}</div>
                            <div>{lbl("Environment")}{arrHint}{ta(arrVal(editForm.setup?.environment), e => arrChange("setup.environment", e), 2)}</div>
                            <div>{lbl("Equipment")}{arrHint}{ta(arrVal(editForm.setup?.equipment), e => arrChange("setup.equipment", e), 2)}</div>
                            <div>{lbl("Test Data")}{arrHint}{ta(arrVal(editForm.setup?.testData), e => arrChange("setup.testData", e), 2)}</div>
                            {section("Test Steps")}
                            {(editForm.steps || []).map((s, i) => (
                              <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${COLORS.border}` }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>Step {i + 1}</div>
                                <div style={{ marginBottom: 4 }}>{lbl("Action")}{ta(s.step, e => setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}</div>
                                <div>{lbl("Expected Result")}{ta(s.expectedResult, e => setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}</div>
                              </div>
                            ))}
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <Button small onClick={e => { e.stopPropagation(); saveEdit(tc.tc_id); }} disabled={editSaving || !editForm.title.trim()}>{editSaving ? "Saving..." : "Save"}</Button>
                              <Button small variant="ghost" onClick={e => { e.stopPropagation(); setEditingTcId(null); setEditForm(null); }}>Cancel</Button>
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
                        {desc.scope && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.scope}</span></div>}
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
                            <textarea
                              value={refineFeedback}
                              onChange={e => setRefineFeedback(e.target.value)}
                              placeholder="Describe improvements — e.g. 'Add a step to verify error message displays correctly' or 'Include boundary test for max input length'"
                              style={{ width: "100%", minHeight: 80, padding: 10, fontSize: 12, fontFamily: mono, background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, resize: "vertical", boxSizing: "border-box" }}
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
                            <Button small variant="ghost" onClick={async e => { e.stopPropagation(); try { await api.setExampleTc(tc.tc_id); setExampleTcId(tc.tc_id); } catch {} }}>
                              {exampleTcId === tc.tc_id ? "★ Example TC" : "Use as Example"}
                            </Button>
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
