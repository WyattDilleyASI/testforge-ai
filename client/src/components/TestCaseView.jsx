import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Select, ReqIdTag, Spinner, EmptyState, AutoResizeTextarea, RejectionPicker, JamaImportPanel, useIsMobile } from "./shared";
import { useAsyncAction, useSelection, useInlineEdit } from "../hooks";

export const TestCaseView = ({ requirements, testCases, refresh, initialReqId }) => {
  const COLORS = useTheme();
  const isMobile = useIsMobile();

  // Generator state
  const [selectedReqId, setSelectedReqId] = useState(initialReqId || "");
  const [reqSearch, setReqSearch] = useState("");
  const [reqDropdownOpen, setReqDropdownOpen] = useState(false);
  const [depth, setDepth] = useState("standard");
  const [focuses, setFocuses] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [budgetWarning, setBudgetWarning] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [selectedSessionTc, setSelectedSessionTc] = useState(null);

  // KB selector state
  const [kbSections, setKbSections] = useState([]);
  const [kbExpanded, setKbExpanded] = useState(new Set());
  const [kbSelected, setKbSelected] = useState(new Set());
  const [allKbEntries, setAllKbEntries] = useState([]);

  // KB drawer — opens as an overlay from the right
  const [kbDrawerOpen, setKbDrawerOpen] = useState(false);

  // Generator card auto-collapses to a summary strip once a session exists
  const [generatorExpanded, setGeneratorExpanded] = useState(true);

  // Claude.ai manual workflow card — collapsed by default
  const [claudeCardOpen, setClaudeCardOpen] = useState(false);

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

  // Adaptive Learning Engine Stuff
  const [rejectingTcId, setRejectingTcId] = useState(null);
  const [genHint, setGenHint] = useState(null);

  // Edit state — via hooks
  const edit = useInlineEdit();
  const [runEdit, { loading: editSaving, error: editError, clearError: clearEditError }] = useAsyncAction();

  const sessionTcs = sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : [];
  const sessionRejectedCount = sessionTcs.filter(tc => tc.status === "Rejected").length;
  const focusArray = [...focuses];

  // Selection operates on the current session TCs
  const { selectedIds: selectedTcIds, toggle: toggleTcSelect, toggleAll: selectAllTcs, clear: clearTcSelection, allSelected: allTcsSelected } = useSelection(sessionTcs, tc => tc.tc_id);

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
    setGenerating(true); setApiError(null); setSelectedSessionTc(null); setBudgetWarning(null);
    try {
      const result = await api.generateTestCases(selectedReqId, depth, focusArray, [...kbSelected]);
      const newTcs = result.testcases || result; // Handle wrapped or plain array response
      if (result.budget_warning) setBudgetWarning(result.budget_warning);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setSelectedSessionTc(newTcs[0]?.tc_id || null);
      setGeneratorExpanded(false);
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

  const startEdit = (tc) => {
    let desc = { objective: "", scope: "", assumptions: [] };
    let setup = { preconditions: [], environment: [], equipment: [], testData: [] };
    try { if (typeof tc.description === "string" && tc.description.startsWith("{")) desc = JSON.parse(tc.description); else if (tc.description) desc.objective = tc.description; } catch {}
    try { if (typeof tc.preconditions === "string" && tc.preconditions.startsWith("{")) setup = JSON.parse(tc.preconditions); else if (tc.preconditions) setup.preconditions = [tc.preconditions]; } catch {}
    edit.startEdit(tc.tc_id, { title: tc.title || "", type: tc.type || "Happy Path", description: desc, setup, steps: tc.steps || [] });
  };

  const saveEdit = async (tcId) => {
    await runEdit(async () => {
      await api.updateTestCase(tcId, { title: edit.editForm.title, type: edit.editForm.type, description: edit.editForm.description, preconditions: edit.editForm.setup, steps: edit.editForm.steps });
      await refresh();
      edit.cancelEdit();
    });
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

  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); setTcSelectMode(false); clearTcSelection(); };

  const selectedTc = selectedSessionTc ? testCases.find(tc => tc.tc_id === selectedSessionTc) : null;

  // Count of KB entries explicitly assigned to the selected requirement via related_reqs
  const assignedKbCount = selectedReqId
    ? allKbEntries.filter(kb => {
        const kbRelReqs = Array.isArray(kb.related_reqs) ? kb.related_reqs : (() => { try { return JSON.parse(kb.related_reqs || "[]"); } catch { return []; } })();
        return kbRelReqs.includes(selectedReqId);
      }).length
    : 0;

  const SL = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>
  );
  const BL = ({ items }) => items?.length > 0
    ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul>
    : null;

  return (
    <div>
      {/* Header row — title left, actions right */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 0, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Generation</h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
            Generate draft test cases from requirements, then approve or reject below.
          </p>
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="secondary" small onClick={() => { setShowHtmlImport(v => !v); setHtmlImportResult(null); setHtmlImportError(""); }}>
              Import from JAMA DOC
            </Button>
          </div>
        )}
      </div>

      {/* JAMA DOC import panel — desktop only */}
      {!isMobile && showHtmlImport && (
          <JamaImportPanel
            title="How to export test cases from Jama"
            accept=".doc,.docx"
            importing={htmlImporting}
            steps={[
              { step: "Navigate to the desired Test Case Directory in Jama.", detail: "e.g. Manual Test Cases, Mobius Test Cases, etc." },
              { step: "Open the Verification Test Cases set", detail: "to view all test cases in that directory." },
              { step: "Click Export → View All Export Options → All Item Details.", detail: "" },
              { step: "Select Word format,", detail: "then check Include Relationships and Include Tags." },
              { step: "Click Run.", detail: "A notification will appear confirming your report is being generated." },
              { step: "Download the report using the link in the notification,", detail: "then upload the file below." },
            ]}
            onFile={file => { setShowHtmlImport(false); doDocImport({ target: { files: [file], value: "" } }); }}
            onCancel={() => { setShowHtmlImport(false); setHtmlImportError(""); }}
            error={htmlImportError}
            result={htmlImportResult && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>
                Imported <strong>{htmlImportResult.imported}</strong> test case{htmlImportResult.imported !== 1 ? "s" : ""}{htmlImportResult.skipped > 0 ? ` · ${htmlImportResult.skipped} duplicate${htmlImportResult.skipped !== 1 ? "s" : ""} skipped` : ""}.
              </div>
            )}
          />
      )}

      {/* Generator — collapses to a summary strip after a session is generated */}
      {!generatorExpanded && selectedReqId ? (() => {
        const req = requirements.find(r => r.req_id === selectedReqId);
        const depthLabel = depth === "basic" ? "Basic" : depth === "comprehensive" ? "Comprehensive" : "Standard";
        const focusLabels = [...focuses].slice(0, 2).join(", ");
        const moreFocuses = focuses.size > 2 ? ` +${focuses.size - 2}` : "";
        return (
          <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Generator</span>
                {req && <ReqIdTag id={req.req_id} />}
                {req?.title && <span style={{ fontSize: 12, color: COLORS.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "100%" : 280 }}>{req.title}</span>}
                <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>· {depthLabel}</span>
                {focuses.size > 0 && <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>· {focusLabels}{moreFocuses}</span>}
                {kbSelected.size > 0 && <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>· {kbSelected.size} KB</span>}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Button small variant="secondary" onClick={() => setGeneratorExpanded(true)}>Edit</Button>
                <Button small onClick={generate} disabled={!selectedReqId || generating}>
                  {generating ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
            </div>
          </Card>
        );
      })() : <Card glow style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
          {sessionTcIds !== null && (
            <span onClick={() => setGeneratorExpanded(false)} style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, cursor: "pointer", userSelect: "none" }} title="Collapse">▴</span>
          )}
        </div>
        <div>
          {/* Controls */}
          <div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Requirement</div>
              <div style={{ position: "relative" }}>
                <input
                  value={reqDropdownOpen ? reqSearch : (requirements.find(r => r.req_id === selectedReqId) ? `${selectedReqId} — ${requirements.find(r => r.req_id === selectedReqId).title}` : "")}
                  onChange={e => setReqSearch(e.target.value)}
                  onFocus={() => { setReqDropdownOpen(true); setReqSearch(""); }}
                  onBlur={() => setTimeout(() => { setReqDropdownOpen(false); setReqSearch(""); }, 150)}
                  placeholder="Search requirements..."
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: 4, color: COLORS.textBright, fontSize: 12,
                    padding: "6px 28px 6px 10px", fontFamily: mono, outline: "none",
                  }}
                />
                {selectedReqId && !reqDropdownOpen && (
                  <span
                    onMouseDown={e => { e.preventDefault(); setSelectedReqId(""); setReqSearch(""); }}
                    style={{
                      position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                      cursor: "pointer", color: COLORS.textMuted, fontSize: 16, lineHeight: 1,
                      userSelect: "none",
                    }}
                    title="Clear selection"
                  >×</span>
                )}
                {reqDropdownOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: 4, marginTop: 2, maxHeight: 200, overflowY: "auto",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                  }}>
                    {(() => {
                      const q = reqSearch.toLowerCase().trim();
                      const filtered = requirements.filter(r =>
                        !q || r.req_id.toLowerCase().includes(q) || (r.title || "").toLowerCase().includes(q)
                      );
                      if (filtered.length === 0) return (
                        <div style={{ padding: "8px 10px", fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>
                          No matches for "{reqSearch}"
                        </div>
                      );
                      return filtered.map(req => {
                        const isSelected = req.req_id === selectedReqId;
                        return (
                          <div
                            key={req.req_id}
                            onMouseDown={() => { setSelectedReqId(req.req_id); setReqDropdownOpen(false); setReqSearch(""); }}
                            style={{
                              padding: "7px 10px", cursor: "pointer", fontSize: 12,
                              background: isSelected ? `${COLORS.accent}18` : "transparent",
                              borderLeft: `3px solid ${isSelected ? COLORS.accent : "transparent"}`,
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${COLORS.accent}0a`; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ fontFamily: mono, fontWeight: 600, color: isSelected ? COLORS.accent : COLORS.textBright }}>{req.req_id}</span>
                            {req.title && <span style={{ color: COLORS.textMuted }}> — {req.title}</span>}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
            {/* Depth + Test Focus row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 22, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
              <div style={{ width: isMobile ? "100%" : 200, flexShrink: 0 }}>
                <Select label="Depth" value={depth} onChange={setDepth} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Test Focus</div>
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
            </div>

            {/* Requirement Details — always visible, no border, no collapse */}
            {selectedReqId && (() => {
              const req = requirements.find(r => r.req_id === selectedReqId);
              if (!req) return null;
              const acList = Array.isArray(req.acceptance_criteria) ? req.acceptance_criteria : [];
              const priorityColor = req.priority === "High" ? "red" : req.priority === "Medium" ? "amber" : "green";
              const statusColor = req.status === "Approved" ? "green" : req.status === "Rejected" ? "red" : "amber";
              return (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Requirement Details
                  </div>
                  {req.title && (
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textBright, lineHeight: 1.35, marginBottom: 6 }}>
                      {req.title}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: mono, fontWeight: 600, color: COLORS.accent, fontSize: 11 }}>{req.req_id}</span>
                    {req.priority && <Badge color={priorityColor} style={{ fontSize: 9 }}>{req.priority}</Badge>}
                    {req.status && <Badge color={statusColor} style={{ fontSize: 9 }}>{req.status}</Badge>}
                  </div>
                  {req.description && (
                    <div style={{ marginTop: 10, fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {req.description}
                    </div>
                  )}
                  {req.rationale && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Rationale</div>
                      <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{req.rationale}</div>
                    </div>
                  )}
                  {acList.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Acceptance Criteria</div>
                      {acList.map((ac, i) => (
                        <div key={i} style={{ fontSize: 13, color: COLORS.text, paddingLeft: 12, marginTop: 4, borderLeft: `2px solid ${COLORS.border}`, lineHeight: 1.6 }}>• {ac}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Knowledge Base Context
                {selectedReqId && assignedKbCount > 0 && (
                  <span style={{ color: COLORS.accent, marginLeft: 6, fontWeight: 700 }}>
                    · {assignedKbCount} assigned to this requirement
                  </span>
                )}
              </div>
              <Button variant="secondary" small onClick={() => setKbDrawerOpen(true)}>
                Edit Knowledge Base context{kbSelected.size > 0 ? ` (${kbSelected.size} selected)` : ""}
              </Button>
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
            {budgetWarning && (
              <div style={{
                marginTop: 10, padding: "10px 12px", borderRadius: 6, fontSize: 12, fontFamily: mono,
                background: budgetWarning.overridden ? `${COLORS.red}18` : `${COLORS.amber}18`,
                border: `1px solid ${budgetWarning.overridden ? COLORS.red : COLORS.amber}40`,
                color: budgetWarning.overridden ? COLORS.red : COLORS.amber,
              }}>
                {budgetWarning.overridden
                  ? `⚠ Budget exceeded — generated via admin override. ${budgetWarning.remaining.toLocaleString()} of ${budgetWarning.budget.toLocaleString()} tokens remaining.`
                  : `⚠ Token budget ${budgetWarning.percent}% used — ${budgetWarning.remaining.toLocaleString()} of ${budgetWarning.budget.toLocaleString()} tokens remaining.`
                }
              </div>
            )}
          </div>
        </div>
      </Card>}

      {/* Claude.ai manual workflow — collapsed header strip, desktop only */}
      {!isMobile && (
        <Card style={{ marginBottom: 24, border: `1px solid ${COLORS.purple}33`, padding: claudeCardOpen ? "12px 20px" : "8px 14px" }}>
          <div
            onClick={() => setClaudeCardOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.purple, fontFamily: mono, textTransform: "uppercase" }}>No API Key? Use Claude.ai Manually</span>
              {!claudeCardOpen && <span style={{ fontSize: 11, color: COLORS.textMuted }}>Copy prompt · paste response</span>}
            </div>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{claudeCardOpen ? "▴" : "▾"}</span>
          </div>
          {claudeCardOpen && (
            <>
              <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textMuted }}>Copy the prompt → paste into claude.ai → paste the JSON response back here</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Button variant="secondary" small disabled={!selectedReqId || copyState === "copying"} onClick={copyPrompt}
                  style={{ borderColor: COLORS.purple + "66", color: copyState === "copied" ? COLORS.green : copyState === "error" ? COLORS.red : COLORS.purple }}>
                  {copyState === "copying" ? "Fetching..." : copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy Prompt"}
                </Button>
                <Button variant="secondary" small disabled={!selectedReqId} onClick={() => { setShowImport(!showImport); setImportError(""); }}
                  style={{ borderColor: COLORS.purple + "66", color: COLORS.purple }}>
                  {showImport ? "Cancel Import" : "Import Response"}
                </Button>
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
            </>
          )}
        </Card>
      )}

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
              {!isMobile && !tcSelectMode && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={sessionTcs.length === 0}>Export XLSX</Button>}
              {!isMobile && !tcSelectMode && sessionTcs.length > 0 && <Button variant="secondary" small onClick={() => { setTcSelectMode(true); clearTcSelection(); }}>Select</Button>}
              {!isMobile && tcSelectMode && <>
                <Button variant="secondary" small onClick={selectAllTcs}>{allTcsSelected ? "Deselect All" : "Select All"}</Button>
                <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
                <Button variant="ghost" small onClick={() => { setTcSelectMode(false); clearTcSelection(); }}>Cancel</Button>
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
                  const borderColor = isSelected ? COLORS.accent
                    : tc.status === "Reviewed" ? COLORS.green + "44"
                    : tc.status === "Rejected" ? COLORS.red + "44"
                    : COLORS.border;
                  return (
                    <div
                      key={tc.tc_id}
                      onClick={() => { setSelectedSessionTc(isSelected ? null : tc.tc_id); edit.cancelEdit(); clearEditError(); }}
                      style={{
                        padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                        display: "flex", flexDirection: isMobile ? "column" : "row",
                        alignItems: isMobile ? "flex-start" : "center",
                        gap: isMobile ? 4 : 10,
                        border: `1px solid ${borderColor}`,
                        background: isSelected ? COLORS.accentDim + "33" : COLORS.surfaceRaised,
                      }}
                    >
                      {!isMobile && tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ accentColor: COLORS.accent }} onClick={e => e.stopPropagation()} />}
                      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{tc.tc_id}</span>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, flex: isMobile ? "none" : 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "normal" : "nowrap" }}>{tc.title}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ fontSize: 9, flexShrink: 0 }}>{tc.status}</Badge>
                        <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"} style={{ fontSize: 9, flexShrink: 0 }}>{tc.type}</Badge>
                      </div>
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
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", marginBottom: rejectingTcId === selectedTc.tc_id ? 0 : 12, gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>{selectedTc.title}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <Badge color={selectedTc.type === "Happy Path" ? "green" : selectedTc.type === "Negative" ? "red" : selectedTc.type === "Boundary" ? "amber" : "purple"}>{selectedTc.type}</Badge>
                            <Badge color={selectedTc.status === "Reviewed" ? "green" : selectedTc.status === "Rejected" ? "red" : "amber"}>{selectedTc.status}</Badge>
                            {(selectedTc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <Button small variant="secondary" onClick={() => edit.isEditing(selectedTc.tc_id) ? (edit.cancelEdit(), clearEditError()) : startEdit(selectedTc)} style={isMobile ? { flex: 1, justifyContent: "center" } : {}}>
                            {edit.isEditing(selectedTc.tc_id) ? "Cancel" : "Edit"}
                          </Button>
                          <Button small variant={selectedTc.status === "Reviewed" ? "primary" : "ghost"} onClick={() => updateStatus(selectedTc.tc_id, "Reviewed")} style={isMobile ? { flex: 1, justifyContent: "center" } : {}}>
                            {selectedTc.status === "Reviewed" ? "✓ Approved" : "Approve"}
                          </Button>
                          <Button small variant={selectedTc.status === "Rejected" ? "danger" : "ghost"}
                            onClick={() => setRejectingTcId(rejectingTcId === selectedTc.tc_id ? null : selectedTc.tc_id)}
                            style={isMobile ? { flex: 1, justifyContent: "center" } : {}}>
                            &#10007; Reject
                          </Button>
                        </div>
                      </div>

                      {rejectingTcId === selectedTc.tc_id && (
                        <div style={{ marginBottom: 12 }}>
                          <RejectionPicker
                            onReject={(reason) => updateStatus(selectedTc.tc_id, "Rejected", reason)}
                            onCancel={() => setRejectingTcId(null)}
                          />
                        </div>
                      )}

                      {edit.isEditing(selectedTc.tc_id) && edit.editForm ? (() => {
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
                          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
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
                                  <button onClick={() => edit.setEditForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }))} disabled={edit.editForm.steps.length <= 1} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red, fontFamily: mono, fontSize: 14, lineHeight: 1, padding: "0 2px", opacity: edit.editForm.steps.length <= 1 ? 0.25 : 0.6 }} title="Delete step">×</button>
                                </div>
                                <div style={{ marginBottom: 4 }}>{lbl("Action")}{ta(s.step, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}</div>
                                <div>{lbl("Expected Result")}{ta(s.expectedResult, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}</div>
                              </div>
                            ))}
                            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                              <Button small onClick={() => saveEdit(selectedTc.tc_id)} disabled={editSaving || !edit.editForm.title.trim()}>{editSaving ? "Saving..." : "Save"}</Button>
                              <Button small variant="ghost" onClick={() => { edit.cancelEdit(); clearEditError(); }}>Cancel</Button>
                              {editError && <span style={{ fontSize: 11, color: COLORS.red, fontFamily: mono }}>{editError}</span>}
                            </div>
                          </div>
                        );
                      })() : <>
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
                      </>}
                    </Card>
                  );
                })()}
            </div>
          )}
        </>
      )}

      {/* KB Context drawer — slides in from the right */}
      {kbDrawerOpen && (
        <>
          <div
            onClick={() => setKbDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              zIndex: 999,
            }}
          />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: isMobile ? "100%" : 360,
            background: COLORS.bg, borderLeft: `1px solid ${COLORS.border}`,
            zIndex: 1000, display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 24px rgba(0,0,0,0.4)",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Knowledge Base Context</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {kbSelected.size > 0 ? `${kbSelected.size} selected` : "Pick entries to include in the prompt"}
                </div>
              </div>
              <span
                onClick={() => setKbDrawerOpen(false)}
                style={{ fontSize: 22, lineHeight: 1, color: COLORS.textMuted, cursor: "pointer", userSelect: "none", padding: "0 4px" }}
                title="Close"
              >×</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {kbSections.length === 0 ? (
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>No KB entries found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                            style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, flex: 1 }}>{sec.name}</span>
                        </div>
                        {secExpanded && (
                          sec.is_default
                            ? sec.entries.map(e => (
                              <div key={e.kb_id} onClick={() => toggleKbEntry(e.kb_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 22px", cursor: "pointer", borderRadius: 4, background: kbSelected.has(e.kb_id) ? COLORS.accentDim + "33" : "transparent" }}>
                                <input type="checkbox" checked={kbSelected.has(e.kb_id)} onChange={() => toggleKbEntry(e.kb_id)} style={{ accentColor: COLORS.accent, cursor: "pointer" }} onClick={ev => ev.stopPropagation()} />
                                <span style={{ fontSize: 12, color: COLORS.text, flex: 1 }}>{e.title}</span>
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
                                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, flex: 1 }}>{sub.name}</span>
                                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>{sub.entries.length}</span>
                                  </div>
                                  {sub.entries.map(e => (
                                    <div key={e.kb_id} onClick={() => toggleKbEntry(e.kb_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 32px", cursor: "pointer", borderRadius: 4, background: kbSelected.has(e.kb_id) ? COLORS.accentDim + "33" : "transparent" }}>
                                      <input type="checkbox" checked={kbSelected.has(e.kb_id)} onChange={() => toggleKbEntry(e.kb_id)} style={{ accentColor: COLORS.accent, cursor: "pointer" }} onClick={ev => ev.stopPropagation()} />
                                      <span style={{ fontSize: 12, color: COLORS.text, flex: 1 }}>{e.title}</span>
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
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "flex-end" }}>
              <Button small onClick={() => setKbDrawerOpen(false)}>Done</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
