import { useTheme, mono } from "../theme";
import { Card, ReqIdTag } from "./shared";

export const TraceabilityView = ({ requirements, testCases }) => { const COLORS = useTheme(); return <div>
  <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Traceability Matrix</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>TC-007</p></div>
  <Card style={{ overflow: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr><th style={{ textAlign: "left", padding: "10px 14px", background: COLORS.surface, color: COLORS.accent, fontFamily: mono, fontSize: 11 }}>REQ ID</th><th style={{ textAlign: "left", padding: "10px 14px", background: COLORS.surface, color: COLORS.textMuted, fontSize: 11 }}>Requirement</th><th style={{ textAlign: "left", padding: "10px 14px", background: COLORS.surface, color: COLORS.textMuted, fontSize: 11 }}>Linked TCs</th><th style={{ textAlign: "center", padding: "10px 14px", background: COLORS.surface, color: COLORS.textMuted, fontSize: 11 }}>Status</th></tr></thead>
      <tbody>{requirements.map(req => {
        const linked = testCases.filter(tc => (tc.linked_req_ids || []).includes(req.req_id));
        const hasReviewed = linked.some(tc => tc.status === "Reviewed");
        return <tr key={req.req_id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <td style={{ padding: "10px 14px" }}><ReqIdTag id={req.req_id} /></td>
          <td style={{ padding: "10px 14px", color: COLORS.text }}>{req.title}</td>
          <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{linked.length === 0 ? <span style={{ color: COLORS.red, fontSize: 11, fontFamily: mono }}>— NONE —</span> : linked.map(tc => <span key={tc.tc_id} style={{ fontFamily: mono, fontSize: 10, padding: "2px 6px", borderRadius: 3, color: tc.status === "Reviewed" ? COLORS.green : COLORS.amber, background: tc.status === "Reviewed" ? COLORS.greenDim : COLORS.amberDim }}>{tc.tc_id}</span>)}</div></td>
          <td style={{ padding: "10px 14px", textAlign: "center" }}>{linked.length === 0 ? <span style={{ color: COLORS.red }}>○</span> : hasReviewed ? <span style={{ color: COLORS.green }}>●</span> : <span style={{ color: COLORS.amber }}>◐</span>}</td>
        </tr>;
      })}</tbody>
    </table>
  </Card>
</div>; };
