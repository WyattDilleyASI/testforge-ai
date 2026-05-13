import { useRef, useState } from "react";
import { useTheme, font, mono } from "../theme";

export const NAV_ITEMS = [
  { key: "dashboard",     label: "Coverage Dashboard",   icon: "◫" },
  { key: "requirements",  label: "Requirements",         icon: "◧" },
  { key: "testcases",     label: "Test Cases",           icon: "◨" },
  { key: "traceability",  label: "SysML Traceability",   icon: "◈" },
  { key: "kb",            label: "Knowledge Base",       icon: "◪" },
  { key: "analytics",     label: "Learning Engine",      icon: "◉" },
  { key: "settings",      label: "Settings",             icon: "⚙" },
  { key: "deferred",      label: "Deferred to v2",       icon: "◬" },
];

export const Sidebar = ({ active, onNavigate, currentUser, onLogout, currentTheme, onThemeChange, isMobile = false, isOpen = false, onClose, collapsed: collapsedProp = false, onToggleCollapse }) => {
  const T = useTheme();
  // Hover-expand: when the user has collapsed the sidebar, hovering temporarily
  // re-expands it without toggling the parent's `collapsed` state. The sidebar
  // becomes fixed-positioned and overlays page content (rather than pushing it)
  // so there's no layout shift when the user grazes in/out. A small leave-delay
  // prevents accidental edge-cross collapses. Disabled on mobile (uses slide-in).
  const [isHovering, setIsHovering] = useState(false);
  const leaveTimerRef = useRef(null);
  const collapsed = collapsedProp && !isHovering;
  const w = collapsed ? 56 : 250;
  const useOverlay = !isMobile && collapsedProp;

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsHovering(true);
  };
  const handleMouseLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setIsHovering(false);
      leaveTimerRef.current = null;
    }, 150);
  };

  const sidebar = <div
    onMouseEnter={useOverlay ? handleMouseEnter : undefined}
    onMouseLeave={useOverlay ? handleMouseLeave : undefined}
    style={{
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
    } : useOverlay ? {
      position: "fixed",
      top: 0, left: 0,
      height: "100vh",
      zIndex: 100,
      transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease",
      boxShadow: isHovering ? "6px 0 28px rgba(0,0,0,0.4)" : "none",
    } : {
      position: "sticky",
      top: 0,
      height: "100vh",
      transition: "width 0.2s ease",
    }),
  }}>

    {/* Header — padding stays stable; text fades */}
    <div style={{
      padding: "22px 18px 18px",
      borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      gap: 12,
    }}>
      <span style={{ fontSize: 20, color: T.accent, flexShrink: 0, width: 20, textAlign: "center" }}>◈</span>
      <div style={{
        flex: 1, minWidth: 0,
        opacity: collapsed ? 0 : 1,
        transition: "opacity 0.18s ease",
        pointerEvents: collapsed ? "none" : "auto",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright, whiteSpace: "nowrap" }}>TestForge AI</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Test Creation Tool v1.5</div>
      </div>
      {isMobile && !collapsed && (
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 18, lineHeight: 1, padding: "4px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
      )}
    </div>

    {/* User info — same stable-spacing treatment */}
    <div style={{
      padding: "10px 18px",
      borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      gap: 12,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, flexShrink: 0, marginLeft: 6 }} />
      <div style={{
        flex: 1, minWidth: 0,
        opacity: collapsed ? 0 : 1,
        transition: "opacity 0.18s ease",
        pointerEvents: collapsed ? "none" : "auto",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
          <div style={{ fontSize: 10, fontFamily: mono, color: T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{currentUser.username} · {currentUser.role}</div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 10, fontFamily: mono, padding: "4px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0 }}>Sign Out</button>
      </div>
    </div>

    {/* Nav items — stable padding and gap; label fades */}
    <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
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
                gap: 12,
                padding: "10px 8px",
                borderRadius: 7, border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: font,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? T.textBright : d ? T.textMuted + "88" : T.textMuted,
                background: isActive ? T.accentDim : "transparent",
                borderLeft: isActive ? `2px solid ${T.accent}` : "2px solid transparent",
                fontStyle: d ? "italic" : "normal",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 15, opacity: d ? 0.3 : 0.7, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              <div style={{
                opacity: collapsed ? 0 : 1,
                transition: "opacity 0.18s ease",
                whiteSpace: "nowrap",
                pointerEvents: collapsed ? "none" : "auto",
              }}>{item.label}</div>
            </button>
          );
        })}
    </nav>

    {/* Footer + collapse toggle */}
    <div style={{
      padding: "10px 16px",
      borderTop: `1px solid ${T.border}`,
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    }}>
      <span style={{
        fontSize: 10, color: T.textMuted, fontFamily: mono, whiteSpace: "nowrap",
        opacity: collapsed ? 0 : 1,
        transition: "opacity 0.18s ease",
        pointerEvents: collapsed ? "none" : "auto",
        flex: 1, minWidth: 0, overflow: "hidden",
      }}>FRD v1.2 — 39 active REQs</span>
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

  // When overlaying, render an in-flow placeholder that reserves the collapsed
  // width so the page content doesn't shift as the sidebar grows on hover.
  return useOverlay ? <>
    <div style={{ width: 56, flexShrink: 0 }} aria-hidden />
    {sidebar}
  </> : sidebar;
};
