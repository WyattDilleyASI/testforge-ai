import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input } from "./shared";

export const JamaView = ({ testCases, requirements, currentUser }) => {
  const COLORS = useTheme();
  const [exportLog, setExportLog] = useState([]);
  const [config, setConfig] = useState({ url: "https://your-org.jamacloud.com", project: "AI-Test-Tool" });
  const [expandedTc, setExpandedTc] = useState(null);
  const isManager = currentUser.role === "QA Manager" || currentUser.role === "Admin";
  const exportable = testCases.filter(tc =>
    tc.status === "Reviewed" &&
    ((tc.linked_req_ids || []).length > 0 || (tc.testlink_requirements || []).length > 0)
  );

  useEffect(() => { api.getJamaLog().then(setExportLog).catch(() => {}); }, []);

  const doExport = async () => {
    try { const r = await api.exportToJama(); setExportLog(prev => [{ timestamp: new Date().toISOString(), action: r.status === "success" ? "EXPORT" : "BLOCKED", details: r.details, status: r.status }, ...prev]); } catch (e) {}
  };

  const SL = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>
  );
  const BL = ({ items }) => items?.length > 0
    ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul>
    : null;

  return <div>
    <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Jama Connect</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>JM-001 – JM-009 (simulated)</p></div>
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Jama URL" value={config.url} onChange={v => setConfig(p => ({ ...p, url: v }))} disabled={currentUser.role !== "Admin"} />
        <Input label="Project" value={config.project} onChange={v => setConfig(p => ({ ...p, project: v }))} disabled={currentUser.role !== "Admin"} />
        <div><label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Auth</label><div style={{ fontFamily: mono, fontSize: 13, color: COLORS.green, padding: "10px 12px", background: COLORS.greenDim, borderRadius: 6 }}>OAuth 2.0</div></div>
      </div>
    </Card>
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: exportable.length > 0 ? 16 : 0 }}>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>Export to Jama</div><div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{exportable.length} reviewed TCs ready{!isManager && <span style={{ color: COLORS.amber, marginLeft: 8 }}>— Requires Manager+</span>}</div></div>
        <Button onClick={doExport} disabled={exportable.length === 0 || !isManager}>Validate & Export</Button>
      </div>
      {exportable.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {exportable.map(tc => {
            const isExpanded = expandedTc === tc.tc_id;
            let desc = null;
            let setup = null;
            try { if (typeof tc.description === "string" && tc.description.startsWith("{")) desc = JSON.parse(tc.description); } catch {}
            try { if (typeof tc.preconditions === "string" && tc.preconditions.startsWith("{")) setup = JSON.parse(tc.preconditions); } catch {}
            const linkedReqs = requirements.filter(r => (tc.linked_req_ids || []).includes(r.req_id));
            const tlReqs = tc.testlink_requirements || [];
            return (
              <div key={tc.tc_id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedTc(isExpanded ? null : tc.tc_id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", background: COLORS.surface }}
                >
                  <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4 }}>{tc.tc_id}</span>
                  <span style={{ fontSize: 12, color: COLORS.textBright, flex: 1 }}>{tc.title}</span>
                  <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type || "Happy Path"}</Badge>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: "12px 16px", background: COLORS.bg }}>
                    {desc ? <>
                      <SL>Description</SL>
                      {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
                      {tlReqs.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>TestLink Requirements: </span>
                          <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                            {tlReqs.map((r, i) => (
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
                    </> : tc.description ? <><SL>Description</SL><div style={{ fontSize: 12, color: COLORS.text }}>{tc.description}</div></> : null}
                    {setup ? <>
                      <SL>Setup</SL>
                      {setup.preconditions?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BL items={setup.preconditions} /></>}
                      {setup.environment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BL items={setup.environment} /></>}
                      {setup.equipment?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BL items={setup.equipment} /></>}
                      {setup.testData?.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BL items={setup.testData} /></>}
                    </> : null}
                    {(tc.steps || []).length > 0 && <>
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
                            <td style={{ padding: "8px 10px", color: COLORS.text, verticalAlign: "top" }}>{typeof s === "string" ? s : s.step}</td>
                            <td style={{ padding: "8px 10px", color: COLORS.green, verticalAlign: "top" }}>{typeof s === "string" ? "" : s.expectedResult}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </>}
                    {linkedReqs.length > 0 && <>
                      <SL>Linked Requirements</SL>
                      {linkedReqs.map(r => (
                        <div key={r.req_id} style={{ fontSize: 12, marginBottom: 4 }}>
                          <span style={{ fontFamily: mono, fontWeight: 600, color: COLORS.accent }}>{r.req_id}</span>
                          <span style={{ color: COLORS.textMuted }}> — {r.title}</span>
                        </div>
                      ))}
                    </>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
    <Card>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>Export Log <span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>JM-008</span></div>
      {exportLog.length === 0 ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No activity.</div> :
      exportLog.map((l, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 12, alignItems: "center" }}><Badge color={l.status === "success" ? "green" : "red"}>{l.status}</Badge><span style={{ fontSize: 12, color: COLORS.text }}>{l.details}</span></div>)}
    </Card>
  </div>;
};
