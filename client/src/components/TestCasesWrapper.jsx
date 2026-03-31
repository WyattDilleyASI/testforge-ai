import { useState } from "react";
import { useTheme, mono, font } from "../theme";
import { TestCaseView } from "./TestCaseView";
import { TestCaseLibraryView } from "./TestCaseLibraryView";
import { TestLinkImportView } from "./TestLinkImportView";

const TC_SECTIONS = [
  { key: "generate", label: "Test Generation", icon: "✦" },
  { key: "library",  label: "Library",         icon: "▦" },
  { key: "testlink", label: "TestLink Import",  icon: "⟲" },
];

export const TestCasesWrapper = ({ requirements, testCases, refresh }) => {
  const COLORS = useTheme();
  const [activeSection, setActiveSection] = useState("generate");

  const SubNav = () => (
    <div style={{
      width: 200,
      minWidth: 200,
      borderRight: `1px solid ${COLORS.border}`,
      padding: "12px 8px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: COLORS.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "8px 12px 12px",
        fontFamily: mono,
      }}>
        Test Cases
      </div>

      {TC_SECTIONS.map(section => {
        const isActive = activeSection === section.key;
        return (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: font,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? COLORS.accent : COLORS.text,
              background: isActive ? COLORS.accentDim : "transparent",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = COLORS.hover || COLORS.accentDim + "66";
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5, width: 20, textAlign: "center" }}>
              {section.icon}
            </span>
            <span>{section.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderPanel = () => {
    switch (activeSection) {
      case "generate":
        return <TestCaseView requirements={requirements} testCases={testCases} refresh={refresh} />;
      case "library":
        return <TestCaseLibraryView testCases={testCases} refresh={refresh} />;
      case "testlink":
        return <TestLinkImportView refresh={refresh} />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      display: "flex",
      height: "100%",
      minHeight: "calc(100vh - 60px)",
    }}>
      <SubNav />
      <div style={{
        flex: 1,
        padding: 24,
        overflowY: "auto",
        minWidth: 0,
      }}>
        {renderPanel()}
      </div>
    </div>
  );
};
