import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Select, ReqIdTag, Spinner, EmptyState, DraftDisclaimer } from "./shared";

export const TestCaseView = ({ requirements, testCases, kbEntries, refresh }) => {
  const COLORS = useTheme();
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [focuses, setFocuses] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [expandedTc, setExpandedTc] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [viewMode, setViewMode] = useState("library");
  const [copyState, setCopyState] = useState("idle"); // idle | copying | copied | error
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  const [htmlImportResult, setHtmlImportResult] = useState(null);
  const [htmlImporting, setHtmlImporting] = useState(false);
  const [htmlImportError, setHtmlImportError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [refiningTcId, setRefiningTcId] = useState(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [refineCopyState, setRefineCopyState] = useState("idle");
  const [tcSelectMode, setTcSelectMode] = useState(false);
  const [selectedTcIds, setSelectedTcIds] = useState(new Set());
  const [exampleTcId, setExampleTcId] = useState(null);

  useEffect(() => { api.getExampleTc().then(d => { if (d.example_tc) setExampleTcId(d.example_tc.tc_id); }).catch(() => {}); }, []);

  const visibleTcs = viewMode === "session" && sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : testCases;
  const isUnreviewed = tc => tc.status === "Draft";

  const toggleFocus = (f) => setFocuses(prev => { const next = new Set(prev); next.has(f) ? next.delete(f) : next.add(f); return next; });
  const focusArray = [...focuses];

  const generate = async () => {
    if (!selectedReqId) return;
    setGenerating(true); setApiError(null);
    try {
      const newTcs = await api.generateTestCases(selectedReqId, depth, focusArray);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setViewMode("session");
      refresh();
    } catch (err) { setApiError(err.message); }
    finally { setGenerating(false); }
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
    } catch (err) { setRefineCopyState("error"); setTimeout(() => setRefineCopyState("idle"), 2000); }
  };

  const copyPrompt = async () => {
    if (!selectedReqId) return;
    setCopyState("copying");
    try {
      const data = await api.getPrompt(selectedReqId, depth, focusArray);
      await navigator.clipboard.writeText(data.prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) { setCopyState("error"); setTimeout(() => setCopyState("idle"), 2000); }
  };

  const doImport = async () => {
    if (!importJson.trim() || !selectedReqId) return;
    setImportError(""); setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const result = await api.importTestCases(selectedReqId, depth, parsed);
      setSessionTcIds(result.map(tc => tc.tc_id));
      setViewMode("session");
      setShowImport(false); setImportJson("");
      refresh();
    } catch (err) { setImportError(err.message); }
    finally { setImporting(false); }
  };

  const clearAll = async () => {
    if (!window.confirm(`Delete all ${testCases.length} test case${testCases.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setClearing(true);
    try { await api.clearTestCases(); setSessionTcIds(null); setViewMode("library"); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
    finally { setClearing(false); }
  };

  const rejectedCount = testCases.filter(tc => tc.status === "Rejected").length;
  const clearRejected = async () => {
    if (!window.confirm(`Delete ${rejectedCount} rejected test case${rejectedCount !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try { await api.clearRejectedTestCases(); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
  };

  const toggleTcSelect = (tcId) => setSelectedTcIds(prev => { const next = new Set(prev); next.has(tcId) ? next.delete(tcId) : next.add(tcId); return next; });
  const selectAllTcs = () => setSelectedTcIds(prev => prev.size === visibleTcs.length ? new Set() : new Set(visibleTcs.map(tc => tc.tc_id)));
  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); setTcSelectMode(false); setSelectedTcIds(new Set()); };

  // ── TestLink import state ────────────────────────────────────────────────
  const [showTlImport, setShowTlImport] = useState(false);
  const [tlParsed, setTlParsed] = useState(null);          // array of parsed TCs from XML
  const [tlParsing, setTlParsing] = useState(false);
  const [tlParseError, setTlParseError] = useState("");
  const [tlSelected, setTlSelected] = useState(null);      // single TC being reviewed
  const [tlEnhanced, setTlEnhanced] = useState(null);      // AI-enhanced version
  const [tlEnhancing, setTlEnhancing] = useState(false);
  const [tlEnhanceError, setTlEnhanceError] = useState("");
  const [tlSaving, setTlSaving] = useState(false);
  const [tlSaved, setTlSaved] = useState(new Set());       // tc externalIds confirmed
  const [tlKbSections, setTlKbSections] = useState([]);    // full section hierarchy
  const [tlKbExpanded, setTlKbExpanded] = useState(new Set());
  const [tlKbSelected, setTlKbSelected] = useState(new Set()); // selected kb_ids
  const [tlEditMode, setTlEditMode] = useState(false);
  const [tlEdited, setTlEdited] = useState(null);          // editable copy of enhanced TC

  useEffect(() => {
    if (showTlImport && tlKbSections.length === 0) {
      api.getKbSections().then(sections => {
        // Fetch all KB entries to build section → entries map
        api.getKbEntries().then(entries => {
          setTlKbSections(sections.map(sec => ({
            ...sec,
            entries: sec.is_default
              ? entries.filter(e => !e.subsection_id)
              : [],
            subsections: (sec.subsections || []).map(sub => ({
              ...sub,
              entries: entries.filter(e => e.subsection_id === sub.subsection_id),
            })),
          })));
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [showTlImport]);

  const doTlParse = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTlParseError(""); setTlParsed(null); setTlSelected(null); setTlEnhanced(null); setTlParsing(true);
    try {
      const result = await api.parseTestLinkXml(file);
      setTlParsed(result.testcases);
    } catch (err) { setTlParseError(err.message); }
    finally { setTlParsing(false); e.target.value = ""; }
  };

  const doTlEnhance = async () => {
    if (!tlSelected) return;
    setTlEnhancing(true); setTlEnhanceError(""); setTlEnhanced(null); setTlEdited(null); setTlEditMode(false);
    try {
      const result = await api.enhanceTestLinkTc(tlSelected, [...tlKbSelected]);
      setTlEnhanced(result.enhanced);
      setTlEdited(result.enhanced);
    } catch (err) { setTlEnhanceError(err.message); }
    finally { setTlEnhancing(false); }
  };

  const doTlSave = async () => {
    const tcToSave = tlEditMode ? tlEdited : tlEnhanced;
    if (!tcToSave) return;
    setTlSaving(true);
    try {
      await api.importTestLinkConfirmed(tcToSave, tlSelected?.externalId);
      setTlSaved(prev => new Set([...prev, tlSelected.externalId || tlSelected.internalId]));
      setTlSelected(null); setTlEnhanced(null); setTlEdited(null); setTlEditMode(false);
      refresh();
    } catch (err) { alert(`Save failed: ${err.message}`); }
    finally { setTlSaving(false); }
  };

  const toggleTlSection = (sectionId) => {
    setTlKbExpanded(prev => { const n = new Set(prev); n.has(sectionId) ? n.delete(sectionId) : n.add(sectionId); return n; });
  };

  const toggleTlSectionEntries = (entries, forceOn) => {
    setTlKbSelected(prev => {
      const n = new Set(prev);
      const ids = entries.map(e => e.kb_id);
      const allSelected = ids.every(id => n.has(id));
      if (forceOn !== undefined ? forceOn : !allSelected) ids.forEach(id => n.add(id));
      else ids.forEach(id => n.delete(id));
      return n;
    });
  };

  const toggleTlEntry = (kbId) => {
    setTlKbSelected(prev => { const n = new Set(prev); n.has(kbId) ? n.delete(kbId) : n.add(kbId); return n; });
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

  return <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Generation</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>{testCases.length} test cases{tcSelectMode && selectedTcIds.size > 0 ? ` · ${selectedTcIds.size} selected` : ""}</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" small onClick={() => { setShowTlImport(v => !v); setTlParsed(null); setTlSelected(null); setTlEnhanced(null); }}>Import from TestLink</Button>
        <Button variant="secondary" small onClick={() => { setShowHtmlImport(v => !v); setHtmlImportResult(null); setHtmlImportError(""); }}>Import from JAMA DOC</Button>
        {!tcSelectMode && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={testCases.length === 0}>Export XLSX</Button>}
        {!tcSelectMode && testCases.length > 0 && <Button variant="secondary" small onClick={() => { setTcSelectMode(true); setSelectedTcIds(new Set()); }}>Select</Button>}
        {tcSelectMode && <>
          <Button variant="secondary" small onClick={selectAllTcs}>{selectedTcIds.size === visibleTcs.length ? "Deselect All" : "Select All"}</Button>
          <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
          <Button variant="ghost" small onClick={() => { setTcSelectMode(false); setSelectedTcIds(new Set()); }}>Cancel</Button>
        </>}
        {rejectedCount > 0 && <Button variant="danger" small onClick={clearRejected}>Delete Rejected ({rejectedCount})</Button>}
        <Button variant="danger" small onClick={clearAll} disabled={testCases.length === 0 || clearing}>{clearing ? "Clearing..." : "Clear All"}</Button>
      </div>
    </div>
    {showTlImport && <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.accent}33` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Import from TestLink</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Upload a TestLink XML export. Review and AI-enhance each test case individually before importing.</div>

      {/* Step 1 — upload */}
      {!tlParsed && <label style={{ display: "inline-block", cursor: tlParsing ? "not-allowed" : "pointer" }}>
        <input type="file" accept=".xml" onChange={doTlParse} disabled={tlParsing} style={{ display: "none" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: mono, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, cursor: "pointer", opacity: tlParsing ? 0.5 : 1 }}>
          {tlParsing ? "Parsing..." : "Choose XML file"}
        </span>
      </label>}
      {tlParseError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlParseError}</div>}

      {/* Step 2 — list of parsed TCs */}
      {tlParsed && !tlSelected && <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>{tlParsed.length} test case{tlParsed.length !== 1 ? "s" : ""} found — click one to review</div>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept=".xml" onChange={doTlParse} style={{ display: "none" }} />
            <span style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontFamily: mono }}>← Load different file</span>
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tlParsed.map((tc, i) => {
            const key = tc.externalId || tc.internalId;
            const done = tlSaved.has(key);
            return <div key={i} onClick={() => !done && setTlSelected(tc)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, border: `1px solid ${done ? COLORS.green + "44" : COLORS.border}`, background: done ? COLORS.greenDim : COLORS.surface, cursor: done ? "default" : "pointer" }}>
              <span style={{ fontSize: 16 }}>{done ? "✓" : "○"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: done ? COLORS.green : COLORS.textBright, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.name}</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginTop: 2 }}>
                  {tc.externalId ? `ID: ${tc.externalId}` : ""}{tc.steps.length > 0 ? ` · ${tc.steps.length} steps` : ""}{tc.keywords.length > 0 ? ` · ${tc.keywords.join(", ")}` : ""}
                </div>
              </div>
              {!done && <span style={{ fontSize: 11, color: COLORS.accent, fontFamily: mono }}>Review →</span>}
            </div>;
          })}
        </div>
      </div>}

      {/* Step 3 — single TC review + KB selector + enhance */}
      {tlSelected && <div>
        <button onClick={() => { setTlSelected(null); setTlEnhanced(null); setTlEdited(null); setTlEditMode(false); }} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontSize: 11, fontFamily: mono, marginBottom: 12, padding: 0 }}>← Back to list</button>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Left — original TestLink content */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 8 }}>Original (TestLink)</div>
            <div style={{ padding: 12, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12, color: COLORS.text }}>
              <div style={{ fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>{tlSelected.name}</div>
              {tlSelected.summary && <div style={{ marginBottom: 8, color: COLORS.textMuted }}>{tlSelected.summary}</div>}
              {tlSelected.preconditions.length > 0 && <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Preconditions</div>
                {tlSelected.preconditions.map((p, i) => <div key={i} style={{ paddingLeft: 8, borderLeft: `2px solid ${COLORS.border}`, marginBottom: 2 }}>{p}</div>)}
              </div>}
              {tlSelected.steps.length > 0 && <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Steps</div>
                {tlSelected.steps.map((s, i) => <div key={i} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${COLORS.border}` }}>
                  <div style={{ color: COLORS.textBright }}>{i + 1}. {s.step}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 11 }}>→ {s.expectedResult}</div>
                </div>)}
              </div>}
              {tlSelected.requirements.length > 0 && <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>TestLink Requirements</div>
                {tlSelected.requirements.map((r, i) => <div key={i} style={{ fontSize: 11, color: COLORS.accent, fontFamily: mono }}>{r.doc_id}: {r.title}</div>)}
              </div>}
            </div>
          </div>

          {/* Right — KB selector + enhanced output */}
          <div style={{ flex: 1, minWidth: 280 }}>
            {/* KB section picker */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Knowledge Base Context</div>
              {tlKbSections.length === 0
                ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>No KB sections found.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto", padding: 4, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    {tlKbSections.map(sec => {
                      const allEntries = sec.is_default ? sec.entries : sec.subsections.flatMap(s => s.entries);
                      const secExpanded = tlKbExpanded.has(sec.section_id);
                      const secAllSelected = allEntries.length > 0 && allEntries.every(e => tlKbSelected.has(e.kb_id));
                      return <div key={sec.section_id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4, cursor: "pointer" }} onClick={() => toggleTlSection(sec.section_id)}>
                          <input type="checkbox" checked={secAllSelected} onChange={e => { e.stopPropagation(); toggleTlSectionEntries(allEntries); }} onClick={e => e.stopPropagation()} style={{ cursor: "pointer" }} />
                          <span style={{ fontSize: 11, color: COLORS.textBright, fontWeight: 600, flex: 1 }}>{sec.name}</span>
                          <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>{allEntries.length}</span>
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{secExpanded ? "▾" : "▸"}</span>
                        </div>
                        {secExpanded && <div style={{ paddingLeft: 12 }}>
                          {sec.is_default
                            ? sec.entries.map(e => <div key={e.kb_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px" }}>
                                <input type="checkbox" checked={tlKbSelected.has(e.kb_id)} onChange={() => toggleTlEntry(e.kb_id)} style={{ cursor: "pointer" }} />
                                <span style={{ fontSize: 11, color: COLORS.text }}>{e.title}</span>
                              </div>)
                            : sec.subsections.map(sub => <div key={sub.subsection_id}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px" }}>
                                  <input type="checkbox" checked={sub.entries.length > 0 && sub.entries.every(e => tlKbSelected.has(e.kb_id))} onChange={() => toggleTlSectionEntries(sub.entries)} style={{ cursor: "pointer" }} />
                                  <span style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic" }}>{sub.name} ({sub.entries.length})</span>
                                </div>
                                {sub.entries.map(e => <div key={e.kb_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 22px" }}>
                                  <input type="checkbox" checked={tlKbSelected.has(e.kb_id)} onChange={() => toggleTlEntry(e.kb_id)} style={{ cursor: "pointer" }} />
                                  <span style={{ fontSize: 11, color: COLORS.text }}>{e.title}</span>
                                </div>)}
                              </div>)
                          }
                        </div>}
                      </div>;
                    })}
                  </div>
              }
              <div style={{ marginTop: 8 }}>
                <Button onClick={doTlEnhance} disabled={tlEnhancing}>{tlEnhancing ? "Enhancing..." : "✦ Enhance with AI"}</Button>
                {tlKbSelected.size > 0 && <span style={{ marginLeft: 10, fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>{tlKbSelected.size} KB entr{tlKbSelected.size !== 1 ? "ies" : "y"} selected</span>}
              </div>
              {tlEnhanceError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlEnhanceError}</div>}
            </div>

            {/* Enhanced output */}
            {tlEnhanced && <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, fontFamily: mono, textTransform: "uppercase" }}>Enhanced</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="secondary" small onClick={() => setTlEditMode(v => !v)}>{tlEditMode ? "View" : "Edit"}</Button>
                  <Button variant="primary" small onClick={doTlSave} disabled={tlSaving}>{tlSaving ? "Saving..." : "Import as Draft"}</Button>
                </div>
              </div>
              <div style={{ padding: 12, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.text, maxHeight: 420, overflowY: "auto" }}>
                {tlEditMode ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div><label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono }}>Title</label><input value={tlEdited?.title || ""} onChange={e => setTlEdited(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "4px 8px", marginTop: 2 }} /></div>
                  <div><label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono }}>Objective</label><textarea value={tlEdited?.description?.objective || ""} onChange={e => setTlEdited(p => ({ ...p, description: { ...p.description, objective: e.target.value } }))} rows={3} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "4px 8px", marginTop: 2, resize: "vertical" }} /></div>
                  <div>
                    <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono }}>Steps</label>
                    {(tlEdited?.steps || []).map((s, i) => <div key={i} style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${COLORS.border}` }}>
                      <input value={s.step} onChange={e => setTlEdited(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) }))} placeholder="Action" style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 11, padding: "3px 6px", marginBottom: 2 }} />
                      <input value={s.expectedResult} onChange={e => setTlEdited(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) }))} placeholder="Expected result" style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textMuted, fontSize: 11, padding: "3px 6px" }} />
                    </div>)}
                  </div>
                </div>
                : (() => {
                  const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                  const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                  const tc = tlEnhanced;
                  return <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textBright, marginBottom: 4 }}>{tc.title}</div>
                    <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type || "Happy Path"}</Badge>
                    <SL>Description</SL>
                    {tc.description?.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{tc.description.objective}</span></div>}
                    {tc.description?.scope?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{Array.isArray(tc.description.scope) ? tc.description.scope.join(", ") : tc.description.scope}</span></div>}
                    {tc.description?.assumptions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Assumptions:</span><BL items={tc.description.assumptions} /></>}
                    <SL>Setup</SL>
                    {tc.setup?.preconditions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BL items={tc.setup.preconditions} /></>}
                    {tc.setup?.environment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BL items={tc.setup.environment} /></>}
                    {tc.setup?.equipment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BL items={tc.setup.equipment} /></>}
                    {tc.setup?.testData?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BL items={tc.setup.testData} /></>}
                    <SL>Test Steps</SL>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr>
                        <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step Action</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected Result</th>
                      </tr></thead>
                      <tbody>{(tc.steps || []).map((s, i) => <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                        <td style={{ padding: "8px 10px", color: COLORS.text, verticalAlign: "top" }}>{s.step}</td>
                        <td style={{ padding: "8px 10px", color: COLORS.green, verticalAlign: "top" }}>{s.expectedResult}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>;
                })()}
              </div>
            </div>}
          </div>
        </div>
      </div>}
    </Card>}

    {showHtmlImport && <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.accent}33` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Import JAMA Test Cases</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Upload a .docx (Verification Test Cases) or .doc (All Item Details) export from JAMA. Test cases will be imported with their Project ID, steps, description, and upstream relationships. Duplicates are skipped.</div>
      <label style={{ display: "inline-block", cursor: htmlImporting ? "not-allowed" : "pointer" }}>
        <input type="file" accept=".doc,.docx" onChange={doDocImport} disabled={htmlImporting} style={{ display: "none" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: mono, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, cursor: "pointer", opacity: htmlImporting ? 0.5 : 1 }}>
          {htmlImporting ? "Importing..." : "Choose DOC/DOCX file"}
        </span>
      </label>
      {htmlImportError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{htmlImportError}</div>}
      {htmlImportResult && <div style={{ marginTop: 10, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>
        Imported <strong>{htmlImportResult.imported}</strong> test case{htmlImportResult.imported !== 1 ? "s" : ""}{htmlImportResult.skipped > 0 ? ` · ${htmlImportResult.skipped} duplicate${htmlImportResult.skipped !== 1 ? "s" : ""} skipped` : ""}.
      </div>}
    </Card>}
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
            return <span key={f.key} onClick={() => toggleFocus(f.key)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, cursor: "pointer", userSelect: "none",
              background: active ? COLORS.accentDim : COLORS.surface,
              color: active ? COLORS.accent : COLORS.textMuted,
              border: `1px solid ${active ? COLORS.accent + "66" : COLORS.border}`,
            }}>{f.label}</span>;
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
          <Button
            variant="secondary"
            small
            disabled={!selectedReqId || copyState === "copying"}
            onClick={copyPrompt}
            style={{ borderColor: COLORS.purple + "66", color: copyState === "copied" ? COLORS.green : copyState === "error" ? COLORS.red : COLORS.purple }}
          >
            {copyState === "copying" ? "Fetching..." : copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy Prompt"}
          </Button>
          <Button
            variant="secondary"
            small
            disabled={!selectedReqId}
            onClick={() => { setShowImport(!showImport); setImportError(""); }}
            style={{ borderColor: COLORS.purple + "66", color: COLORS.purple }}
          >
            {showImport ? "Cancel Import" : "Import Response"}
          </Button>
        </div>
      </div>

      {showImport && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
          Paste the JSON array from Claude.ai below. Include the <span style={{ fontFamily: mono, color: COLORS.purple }}>[ ]</span> brackets.
        </div>
        <textarea
          value={importJson}
          onChange={e => setImportJson(e.target.value)}
          placeholder={'[\n  {\n    "title": "...",\n    "type": "Happy Path",\n    "description": { "objective": "...", "scope": "...", "assumptions": [] },\n    "setup": { "preconditions": [], "environment": [], "equipment": [], "testData": [] },\n    "steps": [{ "step": "...", "expectedResult": "..." }],\n    "reqAttribute": "..."\n  }\n]'}
          style={{ width: "100%", minHeight: 160, fontFamily: mono, fontSize: 11, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${importError ? COLORS.red : COLORS.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
        />
        {importError && <div style={{ marginTop: 6, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{importError}</div>}
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" small onClick={() => { setShowImport(false); setImportJson(""); setImportError(""); }}>Cancel</Button>
          <Button small disabled={!importJson.trim() || importing} onClick={doImport}
            style={{ background: COLORS.purple, color: COLORS.bg }}>
            {importing ? "Saving..." : "Save Test Cases"}
          </Button>
        </div>
      </div>}
    </Card>
    {testCases.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
      <Button small variant={viewMode === "library" ? "primary" : "secondary"} onClick={() => setViewMode("library")}>Library ({testCases.length})</Button>
      {sessionTcIds && <Button small variant={viewMode === "session" ? "primary" : "secondary"} onClick={() => setViewMode("session")}>Session ({sessionTcIds.length})</Button>}
      <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>TC-009</span>
    </div>}
    {visibleTcs.length === 0 ? <EmptyState icon="◨" title="No Test Cases" subtitle="Generate drafts above" /> : <>
      {visibleTcs.some(isUnreviewed) && <DraftDisclaimer style={{ marginBottom: 16 }} />}
      {visibleTcs.map(tc => <Card key={tc.tc_id} style={{ marginBottom: 10, border: tcSelectMode && selectedTcIds.has(tc.tc_id) ? `1px solid ${COLORS.accent}` : undefined }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : setExpandedTc(expandedTc === tc.tc_id ? null : tc.tc_id)}>
          {tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>{tc.tc_id}</span>
          <div style={{ flex: 1, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, display: "flex", alignItems: "center", gap: 8 }}>{tc.title}{isUnreviewed(tc) && <span style={{ fontSize: 9, fontFamily: mono, color: COLORS.amber, background: COLORS.amberDim, padding: "1px 6px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>Draft</span>}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              {tc.project_id && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Project ID: <span style={{ color: COLORS.accent }}>{tc.project_id}</span></span>}
              {tc.upstream_relationship && tc.upstream_relationship.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Upstream: {tc.upstream_relationship.map(u => <span key={u.id} style={{ color: COLORS.purple, marginRight: 4 }}>{u.id}</span>)}</span>}
              {(tc.linked_req_ids || []).length > 0 && <><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>Traces to:</span>{(tc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}</>}
              <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type}</Badge>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
            <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}</Button>
            <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Rejected"); }}>&#10007;</Button>
            <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ marginLeft: 4 }}>{tc.status}</Badge>
          </div>
        </div>
        {expandedTc === tc.tc_id && (() => {
          let desc = null, setup = null;
          try { desc = typeof tc.description === "string" && tc.description.startsWith("{") ? JSON.parse(tc.description) : null; } catch {}
          try { setup = typeof tc.preconditions === "string" && tc.preconditions.startsWith("{") ? JSON.parse(tc.preconditions) : null; } catch {}
          const SectionLabel = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
          const BulletList = ({ items }) => items && items.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
          return <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
            {isUnreviewed(tc) && <div style={{ marginBottom: 14, padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, fontSize: 10, color: COLORS.amber, fontFamily: mono }}>DRAFT — Review required</div>}
            {desc ? <>
              <SectionLabel>Description</SectionLabel>
              {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
              {desc.scope && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.scope}</span></div>}
              {desc.assumptions && desc.assumptions.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Assumptions:</span><BulletList items={desc.assumptions} /></>}
            </> : tc.description ? <><SectionLabel>Description</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.description}</div></> : null}
            {setup ? <>
              <SectionLabel>Setup</SectionLabel>
              {setup.preconditions && setup.preconditions.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BulletList items={setup.preconditions} /></>}
              {setup.environment && setup.environment.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BulletList items={setup.environment} /></>}
              {setup.equipment && setup.equipment.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BulletList items={setup.equipment} /></>}
              {setup.testData && setup.testData.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BulletList items={setup.testData} /></>}
            </> : tc.preconditions ? <><SectionLabel>Setup</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.preconditions}</div></> : null}
            <SectionLabel>Test Steps</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step Action</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected Result</th></tr></thead>
              <tbody>{(tc.steps || []).map((s, i) => {
                const hasHtml = c => typeof c === "string" && c.includes("<img");
                const renderCell = (content, color) => hasHtml(content)
                  ? <span style={{ color }} dangerouslySetInnerHTML={{ __html: content }} />
                  : <span style={{ color }}>{content}</span>;
                return <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.step, COLORS.text)}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.expectedResult, COLORS.green)}</td>
                </tr>;
              })}</tbody>
            </table>
            {tc.upstream_relationship && tc.upstream_relationship.length > 0 && <>
              <SectionLabel>Upstream Relationships</SectionLabel>
              {tc.upstream_relationship.map((u, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${COLORS.accent}44` }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: COLORS.accent }}>{u.id}</span>
                <span style={{ color: COLORS.textMuted, margin: "0 6px" }}>—</span>
                <span>{u.name}</span>
              </div>)}
            </>}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
              {refiningTcId === tc.tc_id ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionLabel>Refine Test Case</SectionLabel>
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
              </div> : <div style={{ display: "flex", gap: 8 }}>
                <Button small variant="secondary" onClick={e => { e.stopPropagation(); setRefiningTcId(tc.tc_id); setRefineFeedback(""); setRefineError(""); setRefineCopyState("idle"); }}>Refine</Button>
                <Button small variant="ghost" onClick={async e => { e.stopPropagation(); try { await api.setExampleTc(tc.tc_id); setExampleTcId(tc.tc_id); } catch {} }}>
                  {exampleTcId === tc.tc_id ? "Example TC" : "Use as Example"}
                </Button>
              </div>}
            </div>
          </div>;
        })()}
      </Card>)}
    </>}
  </div>
  </div>;
};
