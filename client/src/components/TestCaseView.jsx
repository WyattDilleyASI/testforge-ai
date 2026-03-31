import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Select, ReqIdTag, Spinner, EmptyState } from "./shared";

export const TestCaseView = ({ requirements, testCases, refresh }) => {
  const COLORS = useTheme();
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [focuses, setFocuses] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [expandedTc, setExpandedTc] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  const [htmlImportResult, setHtmlImportResult] = useState(null);
  const [htmlImporting, setHtmlImporting] = useState(false);
  const [htmlImportError, setHtmlImportError] = useState("");
  const [tcSelectMode, setTcSelectMode] = useState(false);
  const [selectedTcIds, setSelectedTcIds] = useState(new Set());

  const sessionTcs = sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : [];
  const sessionRejectedCount = sessionTcs.filter(tc => tc.status === "Rejected").length;

  const toggleFocus = (f) => setFocuses(prev => { const next = new Set(prev); next.has(f) ? next.delete(f) : next.add(f); return next; });
  const focusArray = [...focuses];

  const generate = async () => {
    if (!selectedReqId) return;
    setGenerating(true); setApiError(null);
    try {
      const newTcs = await api.generateTestCases(selectedReqId, depth, focusArray);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      refresh();
    } catch (err) { setApiError(err.message); }
    finally { setGenerating(false); }
  };

  const updateStatus = async (tcId, status) => {
    try { await api.updateTcStatus(tcId, status); refresh(); } catch (err) { console.error(err); }
  };

  const copyPrompt = async () => {
    if (!selectedReqId) return;
    setCopyState("copying");
    try {
      const data = await api.getPrompt(selectedReqId, depth, focusArray);
      await navigator.clipboard.writeText(data.prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch { setCopyState("error"); setTimeout(() => setCopyState("idle"), 2000); }
  };

  const doImport = async () => {
    if (!importJson.trim() || !selectedReqId) return;
    setImportError(""); setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const result = await api.importTestCases(selectedReqId, depth, parsed);
      setSessionTcIds(result.map(tc => tc.tc_id));
      setShowImport(false); setImportJson("");
      refresh();
    } catch (err) { setImportError(err.message); }
    finally { setImporting(false); }
  };

  const clearRejected = async () => {
    if (!window.confirm(`Delete ${sessionRejectedCount} rejected test case${sessionRejectedCount !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try { await api.clearRejectedTestCases(); refresh(); } catch (err) { alert(`Failed: ${err.message}`); }
  };

  const doDocImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setHtmlImportError(""); setHtmlImportResult(null); setHtmlImporting(true);
    try {
      const result = await api.importTestCasesDoc(file);
      setHtmlImportResult(result);
      refresh();
    } catch (err) { setHtmlImportError(err.message); }
    finally { setHtmlImporting(false); e.target.value = ""; }
  };

  const toggleTcSelect = (tcId) => setSelectedTcIds(prev => { const next = new Set(prev); next.has(tcId) ? next.delete(tcId) : next.add(tcId); return next; });
  const selectAllTcs = () => setSelectedTcIds(prev => prev.size === sessionTcs.length ? new Set() : new Set(sessionTcs.map(tc => tc.tc_id)));
  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); setTcSelectMode(false); setSelectedTcIds(new Set()); };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Generation</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
          Generate draft test cases from requirements, then approve or reject below.
        </p>
      </div>

      {/* JAMA DOC import */}
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" small onClick={() => { setShowHtmlImport(v => !v); setHtmlImportResult(null); setHtmlImportError(""); }}>
          Import from JAMA DOC
        </Button>
      </div>
      {showHtmlImport && (
        <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.accent}33` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Import JAMA Test Cases</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Upload a .docx (Verification Test Cases) or .doc (All Item Details) export from JAMA. Duplicates are skipped.</div>
          <label style={{ display: "inline-block", cursor: htmlImporting ? "not-allowed" : "pointer" }}>
            <input type="file" accept=".doc,.docx" onChange={doDocImport} disabled={htmlImporting} style={{ display: "none" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: mono, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, cursor: "pointer", opacity: htmlImporting ? 0.5 : 1 }}>
              {htmlImporting ? "Importing..." : "Choose DOC/DOCX file"}
            </span>
          </label>
          {htmlImportError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{htmlImportError}</div>}
          {htmlImportResult && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>
              Imported <strong>{htmlImportResult.imported}</strong> test case{htmlImportResult.imported !== 1 ? "s" : ""}{htmlImportResult.skipped > 0 ? ` · ${htmlImportResult.skipped} duplicate${htmlImportResult.skipped !== 1 ? "s" : ""} skipped` : ""}.
            </div>
          )}
        </Card>
      )}

      {/* Generator */}
      <Card glow style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Select label="Requirement" value={selectedReqId} onChange={setSelectedReqId} style={{ minWidth: 280 }} options={[{ value: "", label: "— Select —" }, ...requirements.map(r => ({ value: r.req_id, label: `${r.req_id} — ${r.title}` }))]} />
          <Select label="Depth" value={depth} onChange={setDepth} style={{ minWidth: 180 }} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
          <Button onClick={generate} disabled={!selectedReqId || generating}>{generating ? "Generating..." : "Generate Drafts"}</Button>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Test Focus</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "safety_critical", label: "Safety Critical" },
              { key: "ui_ux_validation", label: "UI/UX Validation" },
              { key: "boundary_analysis", label: "Boundary Analysis" },
              { key: "error_recovery", label: "Error Recovery" },
              { key: "regression", label: "Regression" },
            ].map(f => {
              const active = focuses.has(f.key);
              return (
                <span key={f.key} onClick={() => toggleFocus(f.key)} style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, cursor: "pointer", userSelect: "none",
                  background: active ? COLORS.accentDim : COLORS.surface,
                  color: active ? COLORS.accent : COLORS.textMuted,
                  border: `1px solid ${active ? COLORS.accent + "66" : COLORS.border}`,
                }}>{f.label}</span>
              );
            })}
          </div>
        </div>
        {generating && <div style={{ marginTop: 14 }}><Spinner /></div>}
        {apiError && <div style={{ marginTop: 10, fontSize: 12, color: COLORS.red, fontFamily: mono }}>{apiError}</div>}
      </Card>

      {/* Claude.ai manual workflow */}
      <Card style={{ marginBottom: 24, border: `1px solid ${COLORS.purple}33` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.purple, fontFamily: mono, textTransform: "uppercase", marginBottom: 3 }}>No API Key? Use Claude.ai Manually</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Copy the prompt → paste into claude.ai → paste the JSON response back here</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" small disabled={!selectedReqId || copyState === "copying"} onClick={copyPrompt}
              style={{ borderColor: COLORS.purple + "66", color: copyState === "copied" ? COLORS.green : copyState === "error" ? COLORS.red : COLORS.purple }}>
              {copyState === "copying" ? "Fetching..." : copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy Prompt"}
            </Button>
            <Button variant="secondary" small disabled={!selectedReqId} onClick={() => { setShowImport(!showImport); setImportError(""); }}
              style={{ borderColor: COLORS.purple + "66", color: COLORS.purple }}>
              {showImport ? "Cancel Import" : "Import Response"}
            </Button>
          </div>
        </div>
        {showImport && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
              Paste the JSON array from Claude.ai below. Include the <span style={{ fontFamily: mono, color: COLORS.purple }}>[ ]</span> brackets.
            </div>
            <textarea value={importJson} onChange={e => setImportJson(e.target.value)}
              placeholder={'[\n  {\n    "title": "...",\n    "type": "Happy Path",\n    "description": { "objective": "...", "scope": "...", "assumptions": [] },\n    "setup": { "preconditions": [], "environment": [], "equipment": [], "testData": [] },\n    "steps": [{ "step": "...", "expectedResult": "..." }],\n    "reqAttribute": "..."\n  }\n]'}
              style={{ width: "100%", minHeight: 160, fontFamily: mono, fontSize: 11, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${importError ? COLORS.red : COLORS.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
            {importError && <div style={{ marginTop: 6, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{importError}</div>}
            <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" small onClick={() => { setShowImport(false); setImportJson(""); setImportError(""); }}>Cancel</Button>
              <Button small disabled={!importJson.trim() || importing} onClick={doImport} style={{ background: COLORS.purple, color: COLORS.bg }}>
                {importing ? "Saving..." : "Save Test Cases"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Session draft queue */}
      {sessionTcIds === null ? (
        <EmptyState icon="◨" title="No Active Session" subtitle="Generate drafts above to begin reviewing" />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>
              Session Drafts
              <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>
                {sessionTcs.filter(tc => tc.status === "Draft").length} pending · {sessionTcs.filter(tc => tc.status === "Reviewed").length} approved · {sessionTcs.filter(tc => tc.status === "Rejected").length} rejected
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!tcSelectMode && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={sessionTcs.length === 0}>Export XLSX</Button>}
              {!tcSelectMode && sessionTcs.length > 0 && <Button variant="secondary" small onClick={() => { setTcSelectMode(true); setSelectedTcIds(new Set()); }}>Select</Button>}
              {tcSelectMode && <>
                <Button variant="secondary" small onClick={selectAllTcs}>{selectedTcIds.size === sessionTcs.length ? "Deselect All" : "Select All"}</Button>
                <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
                <Button variant="ghost" small onClick={() => { setTcSelectMode(false); setSelectedTcIds(new Set()); }}>Cancel</Button>
              </>}
              {sessionRejectedCount > 0 && (
                <Button variant="danger" small onClick={clearRejected}>Clear Rejected ({sessionRejectedCount})</Button>
              )}
            </div>
          </div>

          {sessionTcs.length === 0 ? (
            <EmptyState icon="◨" title="Session Empty" subtitle="All test cases have been cleared" />
          ) : (
            sessionTcs.map(tc => {
              let desc = null, setup = null;
              try { desc = typeof tc.description === "string" && tc.description.startsWith("{") ? JSON.parse(tc.description) : null; } catch {}
              try { setup = typeof tc.preconditions === "string" && tc.preconditions.startsWith("{") ? JSON.parse(tc.preconditions) : null; } catch {}
              const isExpanded = expandedTc === tc.tc_id;
              return (
                <Card key={tc.tc_id} style={{ marginBottom: 10, border: tcSelectMode && selectedTcIds.has(tc.tc_id) ? `1px solid ${COLORS.accent}` : tc.status === "Reviewed" ? `1px solid ${COLORS.green}44` : tc.status === "Rejected" ? `1px solid ${COLORS.red}44` : undefined }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : setExpandedTc(isExpanded ? null : tc.tc_id)}>
                    {tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
                    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>{tc.tc_id}</span>
                    <div style={{ flex: 1, cursor: "pointer" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>{tc.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {(tc.linked_req_ids || []).length > 0 && <><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>Traces to:</span>{(tc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}</>}
                        <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type}</Badge>
                        <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"}>{tc.status}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>
                        {tc.status === "Reviewed" ? "✓ Approved" : "Approve"}
                      </Button>
                      <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Rejected"); }}>&#10007;</Button>
                    </div>
                  </div>

                  {isExpanded && (() => {
                    const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                    const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                    return (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                        {desc ? <>
                          <SL>Description</SL>
                          {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
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
                          <tbody>{(tc.steps || []).map((s, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                              <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                              <td style={{ padding: "8px 10px", color: COLORS.text, verticalAlign: "top" }}>{s.step}</td>
                              <td style={{ padding: "8px 10px", color: COLORS.green, verticalAlign: "top" }}>{s.expectedResult}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    );
                  })()}
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
};
