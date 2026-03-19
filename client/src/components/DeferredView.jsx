import { useTheme, mono } from "../theme";
import { Card, Badge } from "./shared";

export const DeferredView = () => { const COLORS = useTheme(); return <div>
  <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Deferred to v2</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>FRD v1.2 Section 9</p></div>
  {[{ title: "Adaptive Learning Engine", sub: "AL-001 – AL-008", desc: "Descoped from v1 to keep the tool focused on assistive generation." },
    { title: "Confluence KB Import", sub: "KB-007", desc: "Manual entry only in v1. v2 implements Confluence REST API import." },
    { title: "SSO / External Identity", sub: "UM-xxx", desc: "v1 uses local accounts. v2 adds SAML/OAuth integration." }
  ].map((item, i) => <Card key={i} style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Badge color="amber">DEFERRED</Badge><span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>{item.title}</span><span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{item.sub}</span></div>
    <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.7 }}>{item.desc}</div>
  </Card>)}
</div>; };
