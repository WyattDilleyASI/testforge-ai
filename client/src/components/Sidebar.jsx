import { useTheme, font, mono } from "../theme";

export const NAV_ITEMS = [
  { key: "dashboard",     label: "Coverage Dashboard",   icon: "◫", reqs: "RS-007" },
  { key: "requirements",  label: "Requirements",         icon: "◧", reqs: "RS-001 – RS-006" },
  { key: "testcases",     label: "Test Cases",           icon: "◨", reqs: "TC-001 – TC-009" },
  { key: "traceability",  label: "SysML Traceability",   icon: "◈", reqs: "TC-007" },
  { key: "kb",            label: "Knowledge Base",       icon: "◪", reqs: "KB-001 – KB-006" },
  { key: "analytics",     label: "Learning Engine",      icon: "◉", reqs: "AL-002 – AL-004" },
  { key: "settings",      label: "Settings",             icon: "⚙", reqs: "UM · JM · MCP" },
  { key: "deferred",      label: "Deferred to v2",       icon: "◬", reqs: "AL-xxx · KB-007" },
];

export const Sidebar = ({ active, onNavigate, currentUser, onLogout, currentTheme, onThemeChange, isMobile = false, isOpen = false, onClose, collapsed = false, onToggleCollapse }) => {
  const T = useTheme();
  const w = collapsed ? 56 : 250;

  return <div style={{
    width: w,
    background: T.surface,
    borderRight: `1px solid ${T.border}`,
    display: "flex",
    flexDirection: "column",
    fontFamily: font,
    flexShrink: 0,
    overflow: "hidden",
    ...(isMobile ? {
      position: "fixed",
      top: 0, left: 0, bottom: 0,
      zIndex: 200,
      width: 250,
      transform: isOpen ? "translateX(0)" : "translateX(-100%)",
      transition: "transform 0.25s ease",
      boxShadow: isOpen ? "4px 0 24px rgba(0,0,0,0.35)" : "none",
    } : {
      position: "sticky",
      top: 0,
      height: "100vh",
      transition: "width 0.2s ease",
    }),
  }}>

    {/* Header */}
    <div style={{
      padding: collapsed ? "22px 0 18px" : "22px 20px 18px",
      borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      justifyContent: collapsed ? "center" : "flex-start",
      gap: 8,
    }}>
      <span style={{ fontSize: 20, color: T.accent, flexShrink: 0 }}>◈</span>
      {!collapsed && <>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright, whiteSpace: "nowrap" }}>TestForge AI</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Test Creation Tool v1.5</div>
        </div>
        {isMobile && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 18, lineHeight: 1, padding: "4px 6px", borderRadius: 4 }}>✕</button>
        )}
      </>}
    </div>

    {/* User info */}
    <div style={{
      padding: collapsed ? "12px 0" : "10px 16px",
      borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      justifyContent: collapsed ? "center" : "flex-start",
      gap: 8,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
      {!collapsed && <>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
          <div style={{ fontSize: 10, fontFamily: mono, color: T.textMuted }}>@{currentUser.username} · {currentUser.role}</div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 10, fontFamily: mono, padding: "4px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>Sign Out</button>
      </>}
    </div>

    {/* Nav items */}
    <nav style={{ padding: collapsed ? "12px 6px" : "12px 10px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV_ITEMS
        .filter(item => !item.adminOnly || currentUser.role === "Admin")
        .map(item => {
          const d = item.key === "deferred";
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: collapsed ? 0 : 10,
                padding: collapsed ? "10px 0" : "10px 12px",
                borderRadius: 7, border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: font,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? T.textBright : d ? T.textMuted + "88" : T.textMuted,
                background: isActive ? T.accentDim : "transparent",
                borderLeft: !collapsed && isActive ? `2px solid ${T.accent}` : "2px solid transparent",
                fontStyle: d ? "italic" : "normal",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 15, opacity: d ? 0.3 : 0.7, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && (
                <div>
                  <div>{item.label}</div>
                  <div style={{ fontSize: 9, fontFamily: mono, color: T.textMuted, opacity: 0.7, marginTop: 1 }}>{item.reqs}</div>
                </div>
              )}
            </button>
          );
        })}
    </nav>

    {/* Footer + collapse toggle */}
    <div style={{
      padding: collapsed ? "10px 0" : "10px 16px",
      borderTop: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      justifyContent: collapsed ? "center" : "space-between",
    }}>
      {!collapsed && <span style={{ fontSize: 10, color: T.textMuted, fontFamily: mono, whiteSpace: "nowrap" }}>FRD v1.2 — 39 active REQs</span>}
      {!isMobile && (
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px", borderRadius: 4 }}
        >
          {collapsed ? "›" : "‹"}
        </button>
      )}
    </div>

  </div>;
};
