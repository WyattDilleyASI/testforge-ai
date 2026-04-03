import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, AutoResizeTextarea } from "./shared";

export const TestLinkImportView = ({ refresh }) => {
  const COLORS = useTheme();

  const [tlParsed, setTlParsed] = useState(null);
  const [tlParsing, setTlParsing] = useState(false);
  const [tlParseError, setTlParseError] = useState("");
  const [tlSelected, setTlSelected] = useState(null);
  const [tlEnhanced, setTlEnhanced] = useState(null);
  const [tlEnhancing, setTlEnhancing] = useState(false);
  const [tlEnhanceError, setTlEnhanceError] = useState("");
  const [tlSaving, setTlSaving] = useState(false);
  const [tlSaved, setTlSaved] = useState(new Set());
  const [tlKbSections, setTlKbSections] = useState([]);
  const [tlKbExpanded, setTlKbExpanded] = useState(new Set());
  const [tlKbSelected, setTlKbSelected] = useState(new Set());
  const [tlEditMode, setTlEditMode] = useState(false);
  const [tlEdited, setTlEdited] = useState(null);

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
      await api.importTestLinkConfirmed(
        {
          ...tcToSave,
          title: tcToSave.title + (tlSelected?.externalId ? ` (AG-${tlSelected.externalId})` : ""),
          testlinkRequirements: tlSelected?.requirements || [],
          enhancedSnapshot: tlEnhanced,
        },
        tlSelected?.externalId
      );
      setTlSaved(prev => new Set([...prev, tlSelected.externalId || tlSelected.internalId]));
      setTlSelected(null); setTlEnhanced(null); setTlEdited(null); setTlEditMode(false);
      refresh();
    } catch (err) { alert(`Save failed: ${err.message}`); }
    finally { setTlSaving(false); }
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
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Step 1 — Upload XML</div>
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
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Step 2 — Select a Test Case</div>
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

        {/* Step 3 — single TC review + KB selector + enhance */}
        {tlSelected && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Step 3 — Enhance &amp; Import</div>
            <button onClick={() => { setTlSelected(null); setTlEnhanced(null); setTlEdited(null); setTlEditMode(false); }} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontSize: 11, fontFamily: mono, marginBottom: 12, padding: 0 }}>← Back to list</button>

            {/* Top row — original + KB selector */}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: tlEnhanced ? 16 : 0 }}>

              {/* Left — original TestLink content (hidden while editing) */}
              <div style={{ flex: 1, minWidth: 280, display: tlEditMode ? "none" : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 8 }}>Original (TestLink)</div>
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
              </div>

              {/* Right — KB selector */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Knowledge Base Context</div>
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
                  <div style={{ marginTop: 8 }}>
                    <Button onClick={doTlEnhance} disabled={tlEnhancing}>{tlEnhancing ? "Enhancing..." : "✦ Enhance with AI"}</Button>
                    {tlKbSelected.size > 0 && <span style={{ marginLeft: 10, fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>{tlKbSelected.size} KB entr{tlKbSelected.size !== 1 ? "ies" : "y"} selected</span>}
                  </div>
                  {tlEnhanceError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{tlEnhanceError}</div>}
                </div>
              </div>
            </div>

            {/* Enhanced output — full width */}
            {tlEnhanced && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, fontFamily: mono, textTransform: "uppercase" }}>Enhanced</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="secondary" small onClick={() => setTlEditMode(v => !v)}>{tlEditMode ? "View" : "Edit"}</Button>
                    <Button variant="primary" small onClick={doTlSave} disabled={tlSaving}>{tlSaving ? "Saving..." : "Import as Draft"}</Button>
                  </div>
                </div>
                <div style={{ padding: 12, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.text }}>
                  {tlEditMode ? (() => {
                        const lbl = (text) => <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", fontFamily: mono, letterSpacing: "0.06em", marginBottom: 4 }}>{text}</label>;
                        const inp = (val, onChange) => <input value={val} onChange={onChange} style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 13, padding: "6px 10px", outline: "none" }} />;
                        const ta = (val, onChange, rows = 3) => <AutoResizeTextarea value={val} onChange={onChange} rows={rows} />;
                        // Array fields: one item per line
                        const arrVal = (arr) => (arr || []).join("\n");
                        const arrChange = (path, e) => {
                          const items = e.target.value.split("\n");
                          setTlEdited(p => {
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
                            {/* Title + Type */}
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                              <div style={{ flex: 1 }}>
                                {lbl("Title")}
                                {inp(tlEdited?.title || "", e => setTlEdited(p => ({ ...p, title: e.target.value })))}
                              </div>
                              <div style={{ minWidth: 150 }}>
                                {lbl("Type")}
                                <select value={tlEdited?.type || "Happy Path"} onChange={e => setTlEdited(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textBright, fontSize: 12, padding: "6px 10px", outline: "none" }}>
                                  {["Happy Path", "Negative", "Boundary", "Edge Case"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>

                            {section("Description")}
                            <div>
                              {lbl("Objective")}
                              {ta(tlEdited?.description?.objective || "", e => setTlEdited(p => ({ ...p, description: { ...p.description, objective: e.target.value } })), 4)}
                            </div>
                            <div>
                              {lbl("Scope")}
                              {ta(tlEdited?.description?.scope || "", e => setTlEdited(p => ({ ...p, description: { ...p.description, scope: e.target.value } })), 2)}
                            </div>
                            <div>
                              {lbl("Assumptions")}
                              {arrHint}
                              {ta(arrVal(tlEdited?.description?.assumptions), e => arrChange("description.assumptions", e), 3)}
                            </div>

                            {section("Setup")}
                            <div>
                              {lbl("Preconditions")}
                              {arrHint}
                              {ta(arrVal(tlEdited?.setup?.preconditions), e => arrChange("setup.preconditions", e), 3)}
                            </div>
                            <div>
                              {lbl("Environment")}
                              {arrHint}
                              {ta(arrVal(tlEdited?.setup?.environment), e => arrChange("setup.environment", e), 2)}
                            </div>
                            <div>
                              {lbl("Equipment")}
                              {arrHint}
                              {ta(arrVal(tlEdited?.setup?.equipment), e => arrChange("setup.equipment", e), 2)}
                            </div>
                            <div>
                              {lbl("Test Data")}
                              {arrHint}
                              {ta(arrVal(tlEdited?.setup?.testData), e => arrChange("setup.testData", e), 2)}
                            </div>

                            {section("Test Steps")}
                            {(tlEdited?.steps || []).map((s, i) => (
                              <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${COLORS.border}` }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, marginBottom: 4 }}>Step {i + 1}</div>
                                <div style={{ marginBottom: 4 }}>
                                  {lbl("Action")}
                                  {ta(s.step, e => setTlEdited(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}
                                </div>
                                <div>
                                  {lbl("Expected Result")}
                                  {ta(s.expectedResult, e => setTlEdited(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                      : (() => {
                        const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
                        const BL = ({ items }) => items?.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
                        const tc = tlEnhanced;
                        return (
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textBright, marginBottom: 4 }}>
                              {tc.title}{tlSelected?.externalId ? <span style={{ fontFamily: mono, fontWeight: 400, fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>(AG-{tlSelected.externalId})</span> : null}
                            </div>
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
                )}
          </div>
        )}
      </Card>
    </div>
  );
};
