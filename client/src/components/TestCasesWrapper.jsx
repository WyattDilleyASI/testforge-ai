import { useState } from "react";
import { useTheme, mono, font } from "../theme";
import { useIsMobile } from "./shared";
import { TestCaseView } from "./TestCaseView";
import { TestCaseLibraryView } from "./TestCaseLibraryView";
import { TestLinkImportView } from "./TestLinkImportView";
import { PushToJamaView } from "./PushToJamaView";

const TC_SECTIONS = [
  { key: "generate", label: "Test Generation", icon: "✦" },
  { key: "library",  label: "Library",         icon: "▦" },
  { key: "pushjama", label: "Push to Jama",    icon: "↗" },
  { key: "testlink", label: "TestLink Import", icon: "⟲", desktopOnly: true },
];

export const TestCasesWrapper = ({ requirements, testCases, refresh, initialReqId, openJamaExport }) => {
  const COLORS = useTheme();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState("generate");

  const renderPanel = () => {
    switch (activeSection) {
      case "generate":
        return <TestCaseView requirements={requirements} testCases={testCases} refresh={refresh} initialReqId={initialReqId} />;
      case "library":
        return <TestCaseLibraryView testCases={testCases} requirements={requirements} refresh={refresh} openJamaExport={openJamaExport} />;
      case "pushjama":
        return <PushToJamaView testCases={testCases} refresh={refresh} onNavigateToConfigure={openJamaExport} />;
      case "testlink":
        return <TestLinkImportView refresh={refresh} />;
      default:
        return null;
    }
  };

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 120px)" }}>
        {/* Horizontal tab strip */}
        <div style={{
          display: "flex",
          overflowX: "auto",
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          gap: 2,
          padding: "4px 4px 0",
          flexShrink: 0,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          {TC_SECTIONS.filter(s => !s.desktopOnly || !isMobile).map(section => {
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", border: "none", cursor: "pointer",
                  fontFamily: font, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? COLORS.accent : COLORS.textMuted,
                  background: "transparent",
                  borderBottom: isActive ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                  borderRadius: "4px 4px 0 0",
                }}
              >
                <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5 }}>{section.icon}</span>
                {section.label}
              </button>
            );
          })}
        </div>
        {/* Panel */}
        <div style={{ flex: 1, padding: "20px 0", overflowY: "auto", minWidth: 0 }}>
          {renderPanel()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 60px)" }}>
      {/* Desktop left sub-nav */}
      <div style={{
        width: 200, minWidth: 200,
        borderRight: `1px solid ${COLORS.border}`,
        padding: "12px 8px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
          textTransform: "uppercase", letterSpacing: "0.06em",
          padding: "8px 12px 12px", fontFamily: mono,
        }}>
          Test Cases
        </div>
        {TC_SECTIONS.filter(s => !s.desktopOnly || !isMobile).map(section => {
          const isActive = activeSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 7, border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: font, fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? COLORS.accent : COLORS.text,
                background: isActive ? COLORS.accentDim : "transparent",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = COLORS.hover || COLORS.accentDim + "66"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5, width: 20, textAlign: "center" }}>{section.icon}</span>
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, padding: 24, overflowY: "auto", minWidth: 0 }}>
        {renderPanel()}
      </div>
    </div>
  );
};
