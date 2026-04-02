import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Select, ReqIdTag, Spinner, EmptyState, AutoResizeTextarea, RejectionPicker } from "./shared";

export const TestCaseView = ({ requirements, testCases, refresh }) => {
  const COLORS = useTheme();

  // Generator state
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [focuses, setFocuses] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [selectedSessionTc, setSelectedSessionTc] = useState(null);

  // KB selector state
  const [kbSections, setKbSections] = useState([]);
  const [kbExpanded, setKbExpanded] = useState(new Set());
  const [kbSelected, setKbSelected] = useState(new Set());
  const [allKbEntries, setAllKbEntries] = useState([]);

  // Manual import / copy state
  const [copyState, setCopyState] = useState("idle");
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  // JAMA doc import state
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  const [htmlImportResult, setHtmlImportResult] = useState(null);
  const [htmlImporting, setHtmlImporting] = useState(false);
  const [htmlImportError, setHtmlImportError] = useState("");

  // Export select state
  const [tcSelectMode, setTcSelectMode] = useState(false);
  const [selectedTcIds, setSelectedTcIds] = useState(new Set());

  // Adaptive Learning Engine Stuff
  const [rejectingTcId, setRejectingTcId] = useState(null);
  const [genHint, setGenHint] = useState(null);

  const sessionTcs = sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : [];
  const sessionRejectedCount = sessionTcs.filter(tc => tc.status === "Rejected").length;
  const focusArray = [...focuses];

  // Load KB on mount
  useEffect(() => {
    Promise.all([api.getKbSections(), api.getKbEntries()]).then(([sections, entries]) => {
      setAllKbEntries(entries);
      setKbSections(sections.map(sec => ({
        ...sec,
        entries: sec.is_default ? entries.filter(e => !e.subsection_id) : [],
        subsections: (sec.subsections || []).map(sub => ({
          ...sub,
          entries: entries.filter(e => e.subsection_id === sub.subsection_id),
        })),
      })));
    }).catch(() => {});
  }, []);

  // Pre-select tag-matched KB entries when requirement changes
  useEffect(() => {
    if (!selectedReqId) { setKbSelected(new Set()); return; }
    const req = requirements.find(r => r.req_id === selectedReqId);
    if (!req) return;
    const reqTags = Array.isArray(req.tags) ? req.tags : JSON.parse(req.tags || "[]");
    const matched = new Set(
      allKbEntries
        .filter(kb => {
          const kbTags = Array.isArray(kb.tags) ? kb.tags : JSON.parse(kb.tags || "[]");
          const kbRelReqs = Array.isArray(kb.related_reqs) ? kb.related_reqs : JSON.parse(kb.related_reqs || "[]");
          return kbTags.some(t => reqTags.includes(t)) || kbRelReqs.includes(selectedReqId);
        })
        .map(kb => kb.kb_id)
    );
    setKbSelected(matched);
    // Auto-expand sections that have matched entries
    setKbExpanded(new Set(
      kbSections
        .filter(sec => {
          const allEntries = sec.is_default ? sec.entries : sec.subsections.flatMap(s => s.entries);
          return allEntries.some(e => matched.has(e.kb_id));
        })
        .map(sec => sec.section_id)
    ));
  }, [selectedReqId, allKbEntries]);

  // ── AL: Fetch contextual hints when requirement changes ──
  useEffect(() => {
    setGenHint(null);
    if (!selectedReqId) return;
    api.getAnalyticsHints(selectedReqId)
      .then(data => { if (data.hasHistory) setGenHint(data); })
      .catch(() => {});
  }, [selectedReqId]);

  // KB toggle helpers
  const toggleKbEntry = (kbId) => setKbSelected(prev => { const n = new Set(prev); n.has(kbId) ? n.delete(kbId) : n.add(kbId); return n; });
  const toggleKbSection = (sec) => {
    const allEntries = sec.is_default ? sec.entries : sec.subsections.flatMap(s => s.entries);
    const allSelected = allEntries.length > 0 && allEntries.every(e => kbSelected.has(e.kb_id));
    setKbSelected(prev => {
      const n = new Set(prev);
      allEntries.forEach(e => allSelected ? n.delete(e.kb_id) : n.add(e.kb_id));
      return n;
    });
  };
  const toggleKbSubsection = (entries) => {
    const allSelected = entries.length > 0 && entries.every(e => kbSelected.has(e.kb_id));
    setKbSelected(prev => {
      const n = new Set(prev);
      entries.forEach(e => allSelected ? n.delete(e.kb_id) : n.add(e.kb_id));
      return n;
    });
  };

  const toggleFocus = (f) => setFocuses(prev => { const next = new Set(prev); next.has(f) ? next.delete(f) : next.add(f); return next; });

  const generate = async () => {
    if (!selectedReqId) return;
    setGenerating(true); setApiError(null); setSelectedSessionTc(null);
    try {
      const newTcs = await api.generateTestCases(selectedReqId, depth, focusArray, [...kbSelected]);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setSelectedSessionTc(newTcs[0]?.tc_id || null);
      refresh();
    } catch (err) { setApiError(err.message); }
    finally { setGenerating(false); }
  };

  const updateStatus = async (tcId, status, rejectionReason) => {
    try {
      await api.updateTcStatus(tcId, status, rejectionReason);
      setRejectingTcId(null);
      refresh();
    } catch (err) { console.error(err); }
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

  const selectedTc = selectedSessionTc ? testCases.find(tc => tc.tc_id === selectedSessionTc) : null;

  const SL = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>
  );
  const BL = ({ items }) => items?.length > 0
    ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul>
    : null;

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

      {/* Generator — two-panel */}
      <Card glow style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
        <div style={{ display: "flex", gap: 20 }}>

          {/* Left: controls */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 12 }}>
              <Select label="Requirement" value={selectedReqId} onChange={setSelectedReqId} options={[{ value: "", label: "— Select —" }, ...requirements.map(r => ({ value: r.req_id, label: `${r.req_id} — ${r.title}` }))]} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Select label="Depth" value={depth} onChange={setDepth} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
            </div>
            <div style={{ marginBottom: 14 }}>
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
            {genHint && (
              <div style={{
                padding: "10px 14px", borderRadius: 6, marginBottom: 12,
                background: COLORS.accentDim,
                border: `1px solid ${COLORS.accent}33`,
                fontSize: 12, color: COLORS.text, lineHeight: 1.6,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: COLORS.accent,
                  fontFamily: mono, textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}>
                  Generation History
                </span>
                <div style={{ marginTop: 4 }}>
                  {genHint.approval && (
                    <span>
                      {genHint.approval.session_count} prior generation{genHint.approval.session_count !== 1 ? "s" : ""}
                      {genHint.approval.approval_rate !== null && (
                        <span style={{
                          marginLeft: 6, fontWeight: 600,
                          color: genHint.approval.approval_rate >= 70
                            ? COLORS.green
                            : genHint.approval.approval_rate >= 40
                              ? COLORS.amber
                              : COLORS.red,
                        }}>
                          {genHint.approval.approval_rate}% approval rate
                        </span>
                      )}
                    </span>
                  )}
                  {genHint.edits && genHint.edits.total_edits > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: COLORS.textMuted }}>
                      Most edited: {Object.entries(genHint.edits.field_counts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([field, count]) => `${field} (${count}×)`)
                        .join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
            <Button onClick={generate} disabled={!selectedReqId || generating}>
              {generating ? "Generating..." : "Generate Drafts"}
            </Button>
            {generating && <div style={{ marginTop: 14 }}><Spinner /></div>}
            {apiError && <div style={{ marginTop: 10, fontSize: 12, color: COLORS.red, fontFamily: mono }}>{apiError}</div>}
          </div>

          {/* Right: KB selector */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>
              Knowledge Base Context
              {kbSelected.size > 0 && <span style={{ color: COLORS.accent, marginLeft: 6 }}>({kbSelected.size} selected)</span>}
            </div>
            {kbSections.length === 0
              ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>No KB entries found.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto", padding: 4, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                  {kbSections.map(sec => {
                    const allEntries = sec.is_default ? sec.entries : sec.subsections.flatMap(s => s.entries);
                    const secExpanded = kbExpanded.has(sec.section_id);
                    const secAllSelected = allEntries.length > 0 && allEntries.every(e => kbSelected.has(e.kb_id));
                    const secSomeSelected = allEntries.some(e => kbSelected.has(e.kb_id));
                    return (
                      <div key={sec.section_id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", cursor: "pointer", borderRadius: 4, background: secSomeSelected ? COLORS.accentDim + "44" : "transparent" }}>
                          <span onClick={() => setKbExpanded(prev => { const n = new Set(prev); n.has(sec.section_id) ? n.delete(sec.section_id) : n.add(sec.section_id); return n; })}
                            style={{ fontSize: 10, color: COLORS.textMuted, width: 10, flexShrink: 0 }}>{secExpanded ? "▾" : "▸"}</span>
                          <input type="checkbox" checked={secAllSelected} onChange={() => toggleKbSection(sec)}
                            style={{ accentColor: COLORS.accent, cursor: "pointer", flexShrink: 0 }}
                            ref={el => { if (el) el.indeterminate = !secAllSelected && secSomeSelected; }} />
                          <span onClick={() => setKbExpanded(prev => { const n = new Set(prev); n.has(sec.section_id) ? n.delete(sec.section_id) : n.add(sec.section_id); return n; })}
                            style={{ fontSize: 11, fontWeight: 600, color: COLORS.textBright, flex: 1 }}>{sec.name}</span>
                        </div>
                        {secExpanded && (
                          sec.is_default
                            ? sec.entries.map(e => (
                              <div key={e.kb_id} onClick={() => toggleKbEntry(e.kb_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 22px", cursor: "pointer", borderRadius: 4, background: kbSelected.has(e.kb_id) ? COLORS.accentDim + "33" : "transparent" }}>
                                <input type="checkbox" checked={kbSelected.has(e.kb_id)} onChange={() => toggleKbEntry(e.kb_id)} style={{ accentColor: COLORS.accent, cursor: "pointer" }} onClick={ev => ev.stopPropagation()} />
                                <span style={{ fontSize: 11, color: COLORS.text, flex: 1 }}>{e.title}</span>
                              </div>
                            ))
                            : sec.subsections.map(sub => {
                              const subAllSelected = sub.entries.length > 0 && sub.entries.every(e => kbSelected.has(e.kb_id));
                              const subSomeSelected = sub.entries.some(e => kbSelected.has(e.kb_id));
                              return (
                                <div key={sub.subsection_id}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 16px", cursor: "pointer", borderRadius: 4, background: subSomeSelected ? COLORS.accentDim + "22" : "transparent" }}>
                                    <input type="checkbox" checked={subAllSelected} onChange={() => toggleKbSubsection(sub.entries)}
                                      style={{ accentColor: COLORS.accent, cursor: "pointer" }}
                                      ref={el => { if (el) el.indeterminate = !subAllSelected && subSomeSelected; }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, flex: 1 }}>{sub.name}</span>
                                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>{sub.entries.length}</span>
                                  </div>
                                  {sub.entries.map(e => (
                                    <div key={e.kb_id} onClick={() => toggleKbEntry(e.kb_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 32px", cursor: "pointer", borderRadius: 4, background: kbSelected.has(e.kb_id) ? COLORS.accentDim + "33" : "transparent" }}>
                                      <input type="checkbox" checked={kbSelected.has(e.kb_id)} onChange={() => toggleKbEntry(e.kb_id)} style={{ accentColor: COLORS.accent, cursor: "pointer" }} onClick={ev => ev.stopPropagation()} />
                                      <span style={{ fontSize: 11, color: COLORS.text, flex: 1 }}>{e.title}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
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
            <AutoResizeTextarea
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
              placeholder={'[\n  {\n    "title": "...",\n    "type": "Happy Path",\n    "description": { "objective": "...", "scope": [], "assumptions": [] },\n    "setup": { "preconditions": [], "environment": [], "equipment": [], "testData": [] },\n    "steps": [{ "step": "...", "expectedResult": "..." }],\n    "reqAttribute": "..."\n  }\n]'}
              rows={8}
              mono
              error={!!importError}
              style={{ borderRadius: 6, padding: "10px 12px" }}
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

      {/* Session results */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* TC list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sessionTcs.map(tc => {
                  const isSelected = selectedSessionTc === tc.tc_id;
                  return (
                    <div
                      key={tc.tc_id}
                      onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : setSelectedSessionTc(isSelected ? null : tc.tc_id)}
                      style={{
                        padding: "8px 12px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                        border: `1px solid ${isSelected ? COLORS.accent : tcSelectMode && selectedTcIds.has(tc.tc_id) ? COLORS.accent : tc.status === "Reviewed" ? COLORS.green + "44" : tc.status === "Rejected" ? COLORS.red + "44" : COLORS.border}`,
                        background: isSelected ? COLORS.accentDim + "33" : COLORS.surfaceRaised,
                      }}
                    >
                      {tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ accentColor: COLORS.accent }} onClick={e => e.stopPropagation()} />}
                      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{tc.tc_id}</span>
                      <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ fontSize: 9, flexShrink: 0 }}>{tc.status}</Badge>
                      <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"} style={{ fontSize: 9, flexShrink: 0 }}>{tc.type}</Badge>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.title}</div>
                    </div>
                  );
                })}
              </div>

              {/* TC preview — full width */}
              {!selectedTc ? (
                <div style={{ padding: 32, textAlign: "center", color: COLORS.textMuted, fontSize: 12 }}>Select a test case above to preview</div>
              ) : (() => {
                  let desc = null, setup = null;
                  try { desc = typeof selectedTc.description === "string" && selectedTc.description.startsWith("{") ? JSON.parse(selectedTc.description) : null; } catch {}
                  try { setup = typeof selectedTc.preconditions === "string" && selectedTc.preconditions.startsWith("{") ? JSON.parse(selectedTc.preconditions) : null; } catch {}
                  return (
                    <Card>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>{selectedTc.title}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <Badge color={selectedTc.type === "Happy Path" ? "green" : selectedTc.type === "Negative" ? "red" : selectedTc.type === "Boundary" ? "amber" : "purple"}>{selectedTc.type}</Badge>
                            <Badge color={selectedTc.status === "Reviewed" ? "green" : selectedTc.status === "Rejected" ? "red" : "amber"}>{selectedTc.status}</Badge>
                            {(selectedTc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <Button small variant={selectedTc.status === "Reviewed" ? "primary" : "ghost"} onClick={() => updateStatus(selectedTc.tc_id, "Reviewed")}>
                            {selectedTc.status === "Reviewed" ? "✓ Approved" : "Approve"}
                          </Button>
                          <Button small variant={selectedTc.status === "Rejected" ? "danger" : "ghost"}
                            onClick={() => setRejectingTcId(rejectingTcId === selectedTc.tc_id ? null : selectedTc.tc_id)}>
                            &#10007; Reject
                          </Button>
                        </div>
                      </div>

                      {rejectingTcId === selectedTc.tc_id && (
                        <RejectionPicker
                          onReject={(reason) => updateStatus(selectedTc.tc_id, "Rejected", reason)}
                          onCancel={() => setRejectingTcId(null)}
                        />
                      )}

                      {desc ? <>
                        <SL>Description</SL>
                        {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
                        {desc.scope?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{Array.isArray(desc.scope) ? desc.scope.join(", ") : desc.scope}</span></div>}
                        {desc.assumptions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Assumptions:</span><BL items={desc.assumptions} /></>}
                      </> : selectedTc.description ? <><SL>Description</SL><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{selectedTc.description}</div></> : null}

                      {setup ? <>
                        <SL>Setup</SL>
                        {setup.preconditions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BL items={setup.preconditions} /></>}
                        {setup.environment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BL items={setup.environment} /></>}
                        {setup.equipment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BL items={setup.equipment} /></>}
                        {setup.testData?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BL items={setup.testData} /></>}
                      </> : selectedTc.preconditions ? <><SL>Setup</SL><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{selectedTc.preconditions}</div></> : null}

                      <SL>Test Steps</SL>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step Action</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected Result</th>
                        </tr></thead>
                        <tbody>{(selectedTc.steps || []).map((s, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                            <td style={{ padding: "8px 10px", color: COLORS.text, verticalAlign: "top" }}>{s.step}</td>
                            <td style={{ padding: "8px 10px", color: COLORS.green, verticalAlign: "top" }}>{s.expectedResult}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </Card>
                  );
                })()}
            </div>
          )}
        </>
      )}
    </div>
  );
};
