import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, THEMES, font, mono } from "../theme";
import { Card, Badge, Button, Spinner } from "./shared";
import { UserManagementView } from "./UserManagementView";
import { McpTokensView } from "./McpTokensView";
import { JamaView } from "./JamaView";

const SETTINGS_SECTIONS = [
  { key: "preferences", label: "User Preferences", icon: "◎", adminOnly: false },
  { key: "product",     label: "Product Context",   icon: "◈", adminOnly: false },
  { key: "users",       label: "User Management",  icon: "◯", adminOnly: true },
  { key: "mcp",         label: "MCP Server Setup",  icon: "◆", adminOnly: true },
  { key: "jama",        label: "Jama Connect",      icon: "◭", adminOnly: true },
];

export const SettingsWrapper = ({ currentUser, currentTheme, onThemeChange, requirements, testCases, kbEntries }) => {
  const COLORS = useTheme();
  const [activeSection, setActiveSection] = useState("preferences");
  const isAdmin = currentUser.role === "Admin";

  const visibleSections = SETTINGS_SECTIONS.filter(s => !s.adminOnly || isAdmin);

  useEffect(() => {
    if (!visibleSections.find(s => s.key === activeSection)) {
      setActiveSection("preferences");
    }
  }, [isAdmin, activeSection]);

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
        Settings
      </div>

      {visibleSections.map(section => {
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
              if (!isActive) e.currentTarget.style.background = COLORS.hover;
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5, width: 20, textAlign: "center" }}>
              {section.icon}
            </span>
            <span>{section.label}</span>
            {section.adminOnly && (
              <span style={{
                marginLeft: "auto",
                fontSize: 9,
                fontFamily: mono,
                color: COLORS.amber,
                background: COLORS.amberDim,
                padding: "1px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}>
                ADMIN
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderPanel = () => {
    switch (activeSection) {
      case "preferences":
        return (
          <UserPreferencesPanel
            currentTheme={currentTheme}
            onThemeChange={onThemeChange}
          />
        );
      case "product":
        return <ProductContextPanel />;
      case "users":
        return <UserManagementView currentUser={currentUser} />;
      case "mcp":
        return <McpTokensView currentUser={currentUser} />;
      case "jama":
        return (
          <JamaView
            currentUser={currentUser}
            requirements={requirements}
            testCases={testCases}
          />
        );
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
      }}>
        {renderPanel()}
      </div>
    </div>
  );
};


const ProductContextPanel = () => {
  const COLORS = useTheme();
  const [productContext, setProductContext] = useState("");
  const [keyTerms, setKeyTerms] = useState("");
  const [exampleTc, setExampleTc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getProductContext(), api.getExampleTc()])
      .then(([ctx, ex]) => {
        setProductContext(ctx.product_context || "");
        setKeyTerms(ctx.key_terms || "");
        setExampleTc(ex.example_tc || null);
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.updateProductContext({ product_context: productContext, key_terms: keyTerms });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return <div>
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Product Context</h2>
      <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>
        Provide context about your product to improve AI-generated test cases and image descriptions.
      </p>
    </div>

    {loading ? <Spinner /> : <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Product Description</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
          Describe your product, who uses it, and what it does. This context is included in all AI prompts.
        </div>
        <textarea
          value={productContext}
          onChange={e => setProductContext(e.target.value)}
          placeholder={"e.g., Mobius is a desktop application for autonomous mower fleet management. It is used by field operators to plan mowing missions, monitor mower status, and manage waypoints across multiple job sites.\n\nKey subsystems include WAT (Wireless Acceptance Testing) and Offline Planner (mission path planning)."}
          style={{ width: "100%", minHeight: 120, fontSize: 12, fontFamily: mono, padding: 12, background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none" }}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Key Terms</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
          Define domain-specific terminology so the AI uses correct vocabulary. One term per line, in the format: <span style={{ fontFamily: mono, color: COLORS.accent }}>Term — Definition</span>
        </div>
        <textarea
          value={keyTerms}
          onChange={e => setKeyTerms(e.target.value)}
          placeholder={"e.g.,\nWAT — Wireless Acceptance Testing, validates RF communication between mower and base station\nResume Point — GPS coordinate where the mower returns after an interruption\nOffline Planner — Desktop module for creating mowing mission paths without connectivity\nGeofence — Virtual boundary that restricts mower operating area"}
          style={{ width: "100%", minHeight: 120, fontSize: 12, fontFamily: mono, padding: 12, background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none" }}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Example Test Case</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
          A real test case used as a few-shot example in generation prompts. Set this from any test case card using the "Use as Example" button.
        </div>
        {exampleTc ? <div style={{ background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}`, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>{exampleTc.tc_id}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 8 }}>{exampleTc.title}</div>
          {exampleTc.type && <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Type: {exampleTc.type}</div>}
          {(() => { try { const d = typeof exampleTc.description === "string" ? JSON.parse(exampleTc.description) : exampleTc.description; return d?.objective ? <div style={{ fontSize: 11, color: COLORS.text, marginBottom: 4 }}>Objective: {d.objective}</div> : null; } catch { return null; } })()}
          {(() => { try { const s = typeof exampleTc.steps === "string" ? JSON.parse(exampleTc.steps) : exampleTc.steps; return s?.length ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>{s.length} step(s)</div> : null; } catch { return null; } })()}
          <Button small variant="ghost" style={{ marginTop: 8 }} onClick={async () => { try { await api.clearExampleTc(); setExampleTc(null); } catch {} }}>Clear Example</Button>
        </div> : <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", padding: "12px 0" }}>
          No example set. Open any test case and click "Use as Example" to set one.
        </div>}
      </Card>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : saved ? "Saved!" : "Save"}</Button>
        {saved && <span style={{ fontSize: 12, color: COLORS.green, fontFamily: mono }}>Changes saved</span>}
      </div>
    </>}
  </div>;
};


const UserPreferencesPanel = ({ currentTheme, onThemeChange }) => {
  const COLORS = useTheme();

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
          User Preferences
        </h2>
        <p style={{
          fontSize: 12,
          color: COLORS.textMuted,
          margin: "6px 0 0",
          fontFamily: mono,
        }}>
          Personalization settings
        </p>
      </div>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>
          Theme
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Choose your preferred interface appearance.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
         {Object.entries(THEMES).filter(([, t]) => !t._hidden).map(([key, t]) => (
            <button
              key={key}
              onClick={() => onThemeChange(key)}
              style={{
                padding: "14px 16px",
                borderRadius: 8,
                border: `1.5px solid ${currentTheme === key ? COLORS.accent : COLORS.border}`,
                background: currentTheme === key ? COLORS.accentDim : COLORS.surface,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
                minWidth: 120,
              }}
            >
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: currentTheme === key ? COLORS.accent : COLORS.textBright,
                marginBottom: 4,
              }}>
                {t.emoji} {t.name}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>
          Language
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Interface language preference.
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: COLORS.bg,
          borderRadius: 8,
          border: `1px solid ${COLORS.border}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>
            English (US)
          </span>
          <span style={{
            marginLeft: "auto",
            fontSize: 10,
            fontFamily: mono,
            color: COLORS.textMuted,
            background: COLORS.surface,
            padding: "2px 8px",
            borderRadius: 4,
          }}>
            ONLY AVAILABLE LANGUAGE
          </span>
        </div>
      </Card>
    </div>
  );
};
