import { useTheme, font, mono } from "../theme";

const NAV_ITEMS = [
  { key: "dashboard",     label: "Coverage Dashboard",   icon: "◫", reqs: "RS-007" },
  { key: "requirements",  label: "Requirements",         icon: "◧", reqs: "RS-001 – RS-006" },
  { key: "testcases",     label: "Test Cases",           icon: "◨", reqs: "TC-001 – TC-009" },
  { key: "traceability",  label: "SysML Traceability",   icon: "◈", reqs: "TC-007" },
  { key: "kb",            label: "Knowledge Base",       icon: "◪", reqs: "KB-001 – KB-006" },
  { key: "settings",      label: "Settings",             icon: "⚙", reqs: "UM · JM · MCP" },
  { key: "deferred",      label: "Deferred to v2",       icon: "◬", reqs: "AL-xxx · KB-007" },
];

export const Sidebar = ({ active, onNavigate, currentUser, onLogout, currentTheme, onThemeChange }) => {
  const T = useTheme();
  return <div style={{ width: 250, minHeight: "100vh", background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", fontFamily: font, flexShrink: 0 }}>
    <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20, color: T.accent }}>◈</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.textBright }}>TestForge AI</span>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Test Creation Tool v1.2</div>
    </div>
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
        <div style={{ fontSize: 10, fontFamily: mono, color: T.textMuted }}>@{currentUser.username} · {currentUser.role}</div>
      </div>
      <button onClick={onLogout} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 10, fontFamily: mono, padding: "4px 8px", borderRadius: 4 }}>Sign Out</button>
    </div>
    <nav style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV_ITEMS
        .filter(item => !item.adminOnly || currentUser.role === "Admin")
        .map(item => {
          const d = item.key === "deferred";
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 7, border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: font,
                fontSize: 13,
                fontWeight: active === item.key ? 600 : 400,
                color: active === item.key ? T.textBright : d ? T.textMuted + "88" : T.textMuted,
                background: active === item.key ? T.accentDim : "transparent",
                borderLeft: active === item.key ? `2px solid ${T.accent}` : "2px solid transparent",
                fontStyle: d ? "italic" : "normal",
              }}
            >
              <span style={{ fontSize: 15, opacity: d ? 0.3 : 0.7, width: 20, textAlign: "center" }}>{item.icon}</span>
              <div>
                <div>{item.label}</div>
                <div style={{ fontSize: 9, fontFamily: mono, color: T.textMuted, opacity: 0.7, marginTop: 1 }}>{item.reqs}</div>
              </div>
            </button>
          );
        })}
    </nav>
    <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.textMuted, fontFamily: mono }}>FRD v1.2 — 39 active REQs</div>
  </div>;
};
