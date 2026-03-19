import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input } from "./shared";

export const JamaView = ({ testCases, requirements, currentUser }) => {
  const COLORS = useTheme();
  const [exportLog, setExportLog] = useState([]);
  const [config, setConfig] = useState({ url: "https://your-org.jamacloud.com", project: "AI-Test-Tool" });
  const isManager = currentUser.role === "QA Manager" || currentUser.role === "Admin";
  const exportable = testCases.filter(tc => (tc.linked_req_ids || []).length > 0 && tc.status === "Reviewed");

  useEffect(() => { api.getJamaLog().then(setExportLog).catch(() => {}); }, []);

  const doExport = async () => {
    try { const r = await api.exportToJama(); setExportLog(prev => [{ timestamp: new Date().toISOString(), action: r.status === "success" ? "EXPORT" : "BLOCKED", details: r.details, status: r.status }, ...prev]); } catch (e) {}
  };

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>Export to Jama</div><div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{exportable.length} reviewed TCs ready{!isManager && <span style={{ color: COLORS.amber, marginLeft: 8 }}>— Requires Manager+</span>}</div></div>
        <Button onClick={doExport} disabled={exportable.length === 0 || !isManager}>Validate & Export</Button>
      </div>
    </Card>
    <Card>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>Export Log <span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>JM-008</span></div>
      {exportLog.length === 0 ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No activity.</div> :
      exportLog.map((l, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 12, alignItems: "center" }}><Badge color={l.status === "success" ? "green" : "red"}>{l.status}</Badge><span style={{ fontSize: 12, color: COLORS.text }}>{l.details}</span></div>)}
    </Card>
  </div>;
};
