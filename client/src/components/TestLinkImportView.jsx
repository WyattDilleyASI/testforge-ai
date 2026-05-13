import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, AutoResizeTextarea } from "./shared";
import { useAsyncAction, useInlineEdit } from "../hooks";

export const TestLinkImportView = ({ refresh }) => {
  const COLORS = useTheme();

  const [tlParsed, setTlParsed] = useState(null);
  const [tlParsing, setTlParsing] = useState(false);
  const [tlParseError, setTlParseError] = useState("");
  const [tlSelected, setTlSelected] = useState(null);
  const [tlCurrentTcId, setTlCurrentTcId] = useState(null);
  const [tlCurrentTcData, setTlCurrentTcData] = useState(null);
  const [tlSaved, setTlSaved] = useState(new Set());
  const [tlKbSections, setTlKbSections] = useState([]);
  const [tlKbExpanded, setTlKbExpanded] = useState(new Set());
  const [tlKbSelected, setTlKbSelected] = useState(new Set());

  const edit = useInlineEdit();
  const [runEnhance, { loading: tlEnhancing, error: tlEnhanceError }] = useAsyncAction();
  const [runEdit, { loading: editSaving, error: editError, clearError: clearEditError }] = useAsyncAction();

  useEffect(() => {
    if (tlKbSections.length === 0) {
      api.getKbSections().then(sections => {
        api.getKbEntries().then(entries => {
          setTlKbSections(sections.map(sec => ({
            ...sec,
            entries: sec.is_default ? entries.filter(e => !e.subsection_id) : [],
            subsections: (sec.subsections || []).map(sub => ({
              ...sub,
              entries: entries.filter(e => e.subsection_id === sub.subsection_id),
            })),
          })));
        }).catch(() => {});
      }).catch(() => {});
    }
  }, []);

  const doTlParse = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTlParseError("");
    setTlParsed(null);
    setTlSelected(null);
    setTlCurrentTcId(null);
    setTlCurrentTcData(null);
    edit.cancelEdit();
    setTlParsing(true);
    try {
      const result = await api.parseTestLinkXml(file);
      setTlParsed(result.testcases);
    } catch (err) { setTlParseError(err.message); }
    finally { setTlParsing(false); e.target.value = ""; }
  };

  const doTlEnhance = async () => {
    if (!tlSelected) return;
    await runEnhance(async () => {
      const result = await api.enhanceTestLinkTc(tlSelected, [...tlKbSelected]);
      const enhanced = result.enhanced;
      const title = enhanced.title + (tlSelected?.externalId ? ` (AG-${tlSelected.externalId})` : "");
      const saved = await api.importTestLinkConfirmed(
        {
          ...enhanced,
          title,
          testlinkRequirements: tlSelected?.requirements || [],
          enhancedSnapshot: enhanced,
        },
        tlSelected?.externalId
      );
      setTlCurrentTcId(saved.tc_id);
      setTlCurrentTcData({ ...enhanced, title });
      setTlSaved(prev => new Set([...prev, tlSelected.externalId || tlSelected.internalId]));
      refresh();
    });
  };

  const doTlReEnhance = async () => {
    if (!tlSelected || !tlCurrentTcId) return;
    edit.cancelEdit();
    clearEditError();
    await runEnhance(async () => {
      const result = await api.enhanceTestLinkTc(tlSelected, [...tlKbSelected]);
      const enhanced = result.enhanced;
      const title = enhanced.title + (tlSelected?.externalId ? ` (AG-${tlSelected.externalId})` : "");
      await api.updateTestCase(tlCurrentTcId, {
        title,
        type: enhanced.type,
        description: enhanced.description,
        preconditions: enhanced.setup,
        steps: enhanced.steps,
      });
      setTlCurrentTcData({ ...enhanced, title });
      refresh();
    });
  };

  const startInlineEdit = () => {
    if (!tlCurrentTcData || !tlCurrentTcId) return;
    edit.startEdit(tlCurrentTcId, { ...tlCurrentTcData });
  };

  const doTlSaveEdit = async () => {
    if (!edit.editForm || !tlCurrentTcId) return;
    await runEdit(async () => {
      const f = edit.editForm;
      await api.updateTestCase(tlCurrentTcId, {
        title: f.title,
        type: f.type,
        description: f.description,
        preconditions: f.setup,
        steps: f.steps,
      });
      setTlCurrentTcData({ ...f });
      edit.cancelEdit();
      refresh();
    });
  };

  const doneWithTc = () => {
    setTlSelected(null);
    setTlCurrentTcId(null);
    setTlCurrentTcData(null);
    edit.cancelEdit();
    clearEditError();
  };

  const toggleTlSection = (sectionId) => {
    setTlKbExpanded(prev => { const n = new Set(prev); n.has(sectionId) ? n.delete(sectionId) : n.add(sectionId); return n; });
  };

  const toggleTlSectionEntries = (entries) => {
    setTlKbSelected(prev => {
      const n = new Set(prev);
      const ids = entries.map(e => e.kb_id);
      const allSelected = ids.every(id => n.has(id));
      if (!allSelected) ids.forEach(id => n.add(id));
      else ids.forEach(id => n.delete(id));
      return n;
    });
  };

  const toggleTlEntry = (kbId) => {
    setTlKbSelected(prev => { const n = new Set(prev); n.has(kbId) ? n.delete(kbId) : n.add(kbId); return n; });
  };

  // Shared KB selector — rendered in Step 3 and Step 4
  const renderKbSelector = () => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Knowledge Base Context</div>
      {tlKbSections.length === 0
        ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>No KB sections found.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto", padding: 4, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
            {tlKbSections.map(sec => {
              const allEntries = sec.is_default ? sec.entries : sec.subsections.flatMap(s => s.entries);
              const secExpanded = tlKbExpanded.has(sec.section_id);
              const secAllSelected = allEntries.length > 0 && allEntries.every(e => tlKbSelected.has(e.kb_id));
              return (
                <div key={sec.section_id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4, cursor: "pointer" }} onClick={() => toggleTlSection(sec.section_id)}>
                    <input type="checkbox" checked={secAllSelected} onChange={e => { e.stopPropagation(); toggleTlSectionEntries(allEntries); }} onClick={e => e.stopPropagation()} style={{ cursor: "pointer" }} />
                    <span style={{ fontSize: 11, color: COLORS.textBright, fontWeight: 600, flex: 1 }}>{sec.name}</span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>{allEntries.length}</span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>{secExpanded ? "▾" : "▸"}</span>
                  </div>
                  {secExpanded && (
                    <div style={{ paddingLeft: 12 }}>
                      {sec.is_default
                        ? sec.entries.map(e => (
                            <div key={e.kb_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px" }}>
                              <input type="checkbox" checked={tlKbSelected.has(e.kb_id)} onChange={() => toggleTlEntry(e.kb_id)} style={{ cursor: "pointer" }} />
                              <span style={{ fontSize: 11, color: COLORS.text }}>{e.title}</span>
                            </div>
                          ))
                        : sec.subsections.map(sub => (
                            <div key={sub.subsection_id}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px" }}>
                                <input type="checkbox" checked={sub.entries.length > 0 && sub.entries.every(e => tlKbSelected.has(e.kb_id))} onChange={() => toggleTlSectionEntries(sub.entries)} style={{ cursor: "pointer" }} />
                                <span style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic" }}>{sub.name} ({sub.entries.length})</span>
                              </div>
                              {sub.entries.map(e => (
                                <div key={e.kb_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 22px" }}>
                                  <input type="checkbox" checked={tlKbSelected.has(e.kb_id)} onChange={() => toggleTlEntry(e.kb_id)} style={{ cursor: "pointer" }} />
                                  <span style={{ fontSize: 11, color: COLORS.text }}>{e.title}</span>
                                </div>
                              ))}
                            </div>
                          ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );

  // Shared original TC view — rendered in Step 3 and Step 4
  const renderOriginalTc = () => (
    <div style={{ padding: 12, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12, color: COLORS.text }}>
      <div style={{ fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>{tlSelected.name}</div>
      {tlSelected.summary && <div style={{ marginBottom: 8, color: COLORS.textMuted }}>{tlSelected.summary}</div>}
      {tlSelected.requirements.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>TestLink Requirements</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {tlSelected.requirements.map((r, i) => (
              <li key={i} style={{ fontSize: 11, lineHeight: 1.6 }}>
                <span style={{ fontFamily: mono, fontWeight: 600, color: COLORS.accent }}>{r.doc_id}</span>
                {r.title ? <span style={{ color: COLORS.textMuted }}> — {r.title}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {tlSelected.preconditions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Preconditions</div>
          {tlSelected.preconditions.map((p, i) => <div key={i} style={{ paddingLeft: 8, borderLeft: `2px solid ${COLORS.border}`, marginBottom: 2 }}>{p}</div>)}
        </div>
      )}
      {tlSelected.steps.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Steps</div>
          {tlSelected.steps.map((s, i) => (
            <div key={i} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${COLORS.border}` }}>
              <div style={{ color: COLORS.textBright }}>{i + 1}. {s.step}</div>
              <div style={{ color: COLORS.textMuted, fontSize: 11 }}>→ {s.expectedResult}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>TestLink Import</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
          Upload a TestLink XML export, AI-enhance each test case using your Knowledge Base, and import as a Draft.
        </p>
      </div>

      <Card style={{ border: `1px solid ${COLORS.accent}33` }}>
        {/* Step 1 — upload */}
        {!tlParsed && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Step 1 — Upload XML</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Choose a TestLink XML export file to begin. Each test case will be reviewed and enhanced individually.</div>
            <label style={{ display: "inline-block", cursor: tlParsing ? "not-allowed" : "pointer" }}>
              <input type="file" accept=".xml" onChange={doTlParse} disabled={tlParsing} style={{ display: "none" }} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: mono, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, cursor: "pointer", opacity: tlParsing ? 0.5 : 1 }}>
                {tlParsing ? "Parsing..." : "Choose XML file"}
              </span>
            </label>
            {tlParseError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlParseError}</div>}
          </div>
        )}

        {/* Step 2 — list of parsed TCs */}
        {tlParsed && !tlSelected && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Step 2 — Select a Test Case</div>
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
                return (
                  <div key={i} onClick={() => !done && setTlSelected(tc)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, border: `1px solid ${done ? COLORS.green + "44" : COLORS.border}`, background: done ? COLORS.greenDim : COLORS.surface, cursor: done ? "default" : "pointer" }}>
                    <span style={{ fontSize: 16 }}>{done ? "✓" : "○"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: done ? COLORS.green : COLORS.textBright, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.name}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginTop: 2 }}>
                        {tc.externalId ? `ID: ${tc.externalId}` : ""}{tc.steps.length > 0 ? ` · ${tc.steps.length} steps` : ""}{tc.keywords.length > 0 ? ` · ${tc.keywords.join(", ")}` : ""}
                      </div>
                    </div>
                    {!done && <span style={{ fontSize: 11, color: COLORS.accent, fontFamily: mono }}>Review →</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3 — single TC review + KB selector + enhance (before first save) */}
        {tlSelected && !tlCurrentTcId && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Step 3 — Enhance &amp; Import</div>
            <button onClick={() => setTlSelected(null)} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontSize: 11, fontFamily: mono, marginBottom: 12, padding: 0 }}>← Back to list</button>

            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* Left — original TC */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Original (TestLink)</div>
                {renderOriginalTc()}
              </div>

              {/* Right — KB selector + enhance */}
              <div style={{ flex: 1, minWidth: 280 }}>
                {renderKbSelector()}
                <div style={{ marginTop: 8 }}>
                  <Button onClick={doTlEnhance} disabled={tlEnhancing}>{tlEnhancing ? "Enhancing..." : "✦ Enhance with AI"}</Button>
                  {tlKbSelected.size > 0 && <span style={{ marginLeft: 10, fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>{tlKbSelected.size} KB entr{tlKbSelected.size !== 1 ? "ies" : "y"} selected</span>}
                </div>
                {tlEnhanceError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlEnhanceError}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Step 4 — compare original + enhanced, with re-enhance capability */}
        {tlSelected && tlCurrentTcId && (
          <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: edit.isEditing(tlCurrentTcId) ? COLORS.accent : COLORS.green }}>
                  {edit.isEditing(tlCurrentTcId) ? "Editing" : `Saved as Draft — ${tlCurrentTcId}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {edit.isEditing(tlCurrentTcId) ? (
                  <>
                    <Button variant="secondary" small onClick={() => { edit.cancelEdit(); clearEditError(); }}>Cancel</Button>
                    <Button small onClick={doTlSaveEdit} disabled={editSaving}>{editSaving ? "Saving..." : "Save"}</Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" small onClick={startInlineEdit}>Edit</Button>
                    <Button small onClick={doneWithTc}>Done</Button>
                  </>
                )}
              </div>
            </div>

            {editError && <div style={{ marginBottom: 12, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{editError}</div>}

            {/* Re-enhance section (full width) */}
            <div style={{ marginBottom: 20, padding: "12px 16px", background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Re-enhance with AI</div>
              {renderKbSelector()}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <Button variant="secondary" onClick={doTlReEnhance} disabled={tlEnhancing || edit.isEditing(tlCurrentTcId)}>
                  {tlEnhancing ? "Enhancing..." : "✦ Re-enhance"}
                </Button>
                {edit.isEditing(tlCurrentTcId) && <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>Save or cancel your edit first</span>}
                {tlKbSelected.size > 0 && !edit.isEditing(tlCurrentTcId) && <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>{tlKbSelected.size} KB entr{tlKbSelected.size !== 1 ? "ies" : "y"} selected</span>}
              </div>
              {tlEnhanceError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlEnhanceError}</div>}
            </div>

            {/* Two-column: original (left) + enhanced view/edit (right) */}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
              {/* Left — original TC for cross-reference */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Original (TestLink)</div>
                {renderOriginalTc()}
              </div>

              {/* Right — enhanced TC view or edit form */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: edit.isEditing(tlCurrentTcId) ? COLORS.accent : COLORS.green, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  {edit.isEditing(tlCurrentTcId) ? "Editing Enhanced" : "Enhanced"}
                </div>
                <div style={{ padding: 12, background: COLORS.surface, borderRadius: 6, border: `1px solid ${edit.isEditing(tlCurrentTcId) ? COLORS.accent + "44" : COLORS.green + "33"}`, fontSize: 12, color: COLORS.text }}>
                  {edit.isEditing(tlCurrentTcId) ? (() => {
                    const f = edit.editForm;
                    const lbl = (text) => <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{text}</label>;
                    const inp = (val, onChange) => <input value={val} onChange={onChange} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 13, padding: "6px 10px", outline: "none" }} />;
                    const ta = (val, onChange, rows = 3) => <AutoResizeTextarea value={val} onChange={onChange} rows={rows} />;
                    const arrVal = (arr) => (arr || []).join("\n");
                    const arrHint = <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>One item per line</div>;
                    const section = (label) => <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: "0.06em", letterSpacing: "0.06em", marginTop: 16, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${COLORS.border}` }}>{label}</div>;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                          <div style={{ flex: 1 }}>
                            {lbl("Title")}
                            {inp(f?.title || "", e => edit.setEditForm(p => ({ ...p, title: e.target.value })))}
                          </div>
                          <div style={{ minWidth: 150 }}>
                            {lbl("Type")}
                            <select value={f?.type || "Happy Path"} onChange={e => edit.setEditForm(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "6px 10px", outline: "none" }}>
                              {["Happy Path", "Negative", "Boundary", "Edge Case"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>

                        {section("Description")}
                        <div>
                          {lbl("Objective")}
                          {ta(f?.description?.objective || "", e => edit.setEditForm(p => ({ ...p, description: { ...p.description, objective: e.target.value } })), 4)}
                        </div>
                        <div>
                          {lbl("Scope")}
                          {ta(Array.isArray(f?.description?.scope) ? f.description.scope.join("\n") : (f?.description?.scope || ""), e => edit.setEditForm(p => ({ ...p, description: { ...p.description, scope: e.target.value } })), 2)}
                        </div>
                        <div>
                          {lbl("Assumptions")}
                          {arrHint}
                          {ta(arrVal(f?.description?.assumptions), e => edit.setEditForm(p => ({ ...p, description: { ...p.description, assumptions: e.target.value.split("\n") } })), 3)}
                        </div>

                        {section("Setup")}
                        <div>
                          {lbl("Preconditions")}
                          {arrHint}
                          {ta(arrVal(f?.setup?.preconditions), e => edit.setEditForm(p => ({ ...p, setup: { ...p.setup, preconditions: e.target.value.split("\n") } })), 3)}
                        </div>
                        <div>
                          {lbl("Environment")}
                          {arrHint}
                          {ta(arrVal(f?.setup?.environment), e => edit.setEditForm(p => ({ ...p, setup: { ...p.setup, environment: e.target.value.split("\n") } })), 2)}
                        </div>
                        <div>
                          {lbl("Equipment")}
                          {arrHint}
                          {ta(arrVal(f?.setup?.equipment), e => edit.setEditForm(p => ({ ...p, setup: { ...p.setup, equipment: e.target.value.split("\n") } })), 2)}
                        </div>
                        <div>
                          {lbl("Test Data")}
                          {arrHint}
                          {ta(arrVal(f?.setup?.testData), e => edit.setEditForm(p => ({ ...p, setup: { ...p.setup, testData: e.target.value.split("\n") } })), 2)}
                        </div>

                        {section("Test Steps")}
                        {(f?.steps || []).map((s, i) => (
                          <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${COLORS.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>Step {i + 1}</div>
                            <div style={{ marginBottom: 4 }}>
                              {lbl("Action")}
                              {ta(s.step, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}
                            </div>
                            <div>
                              {lbl("Expected Result")}
                              {ta(s.expectedResult, e => edit.setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                  : (() => {
                    const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                    const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                    const tc = tlCurrentTcData;
                    return (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textBright, marginBottom: 4 }}>{tc.title}</div>
                        <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type || "Happy Path"}</Badge>
                        <SL>Description</SL>
                        {tc.description?.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{tc.description.objective}</span></div>}
                        {tlSelected?.requirements?.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>TestLink Requirements: </span>
                            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                              {tlSelected.requirements.map((r, i) => (
                                <li key={i} style={{ fontSize: 11, lineHeight: 1.6 }}>
                                  <span style={{ fontFamily: mono, fontWeight: 600, color: COLORS.accent }}>{r.doc_id}</span>
                                  {r.title ? <span style={{ color: COLORS.textMuted }}> — {r.title}</span> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
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
                </div>
              </div>
            </div>

          </div>
        )}
      </Card>
    </div>
  );
};
