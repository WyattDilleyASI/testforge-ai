import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme, THEMES, THEME_CATEGORIES, ThemeSwatch, font, mono } from "../theme";
import { Card, Badge, Button, Input, Select, Spinner } from "./shared";
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

  // Filter sections by role
  const visibleSections = SETTINGS_SECTIONS.filter(s => !s.adminOnly || isAdmin);

  // If the active section becomes hidden (e.g. role change), reset to preferences
  useEffect(() => {
    if (!visibleSections.find(s => s.key === activeSection)) {
      setActiveSection("preferences");
    }
  }, [isAdmin, activeSection]);

  // ── Sub-nav renderer ──────────────────────────────────────────────────

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

  // ── Panel renderer ────────────────────────────────────────────────────

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

  // ── Layout ────────────────────────────────────────────────────────────

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


// ─── PRODUCT CONTEXT PANEL ──────────────────────────────────────────────────

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

// ── Upgraded UserPreferencesPanel ────────────────────────────────────────────

const UserPreferencesPanel = ({ currentTheme, onThemeChange }) => {
  const COLORS = useTheme();
  const [searchFilter, setSearchFilter] = useState("");

  // Filter themes by search
  const matchesSearch = (key, theme) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      theme.name.toLowerCase().includes(q)
    );
  };

  return (
    <div>
      {/* ── Header ── */}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>
            Theme
          </div>
          <div style={{ fontSize: 11, fontFamily: mono, color: COLORS.textMuted }}>
            {Object.keys(THEMES).filter(k => !THEMES[k]._hidden).length} themes
          </div>
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
          Choose your preferred interface appearance.
        </div>

        {/* ── Search / filter ── */}
        <div style={{ marginBottom: 18 }}>
          <input
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Search themes..."
            style={{
              fontFamily: mono,
              fontSize: 12,
              color: COLORS.textBright,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: "8px 12px",
              outline: "none",
              width: 220,
            }}
          />
        </div>

        {/* ── Categorized grid ── */}
        {THEME_CATEGORIES.map(cat => {
          const visibleThemes = cat.keys.filter(k =>
            THEMES[k] && !THEMES[k]._hidden && matchesSearch(k, THEMES[k])
          );
          if (visibleThemes.length === 0) return null;

          return (
            <div key={cat.label} style={{ marginBottom: 22 }}>
              {/* Category label */}
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: COLORS.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: mono,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: `1px solid ${COLORS.border}`,
              }}>
                {cat.label}
              </div>

              {/* Theme cards grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 10,
              }}>
                {visibleThemes.map(key => {
                  const t = THEMES[key];
                  const isActive = currentTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => onThemeChange(key)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 8,
                        border: `1.5px solid ${isActive ? COLORS.accent : COLORS.border}`,
                        background: isActive ? COLORS.accentDim : COLORS.surface,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                        position: "relative",
                      }}
                      onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.borderColor = COLORS.accent + "66";
                        if (!isActive) e.currentTarget.style.background = COLORS.hover || COLORS.accentDim;
                      }}
                      onMouseLeave={e => {
                        if (!isActive) e.currentTarget.style.borderColor = COLORS.border;
                        if (!isActive) e.currentTarget.style.background = COLORS.surface;
                      }}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div style={{
                          position: "absolute",
                          top: 8,
                          right: 10,
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: COLORS.accent,
                          boxShadow: `0 0 6px ${COLORS.accentGlow}`,
                        }} />
                      )}

                      {/* Theme name */}
                      <div style={{
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? COLORS.accent : COLORS.textBright,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        paddingRight: isActive ? 16 : 0,
                      }}>
                        {t.emoji} {t.name}
                      </div>

                      {/* Mini swatch preview */}
                      <ThemeSwatch theme={t} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── No results state ── */}
        {searchFilter && THEME_CATEGORIES.every(cat =>
          cat.keys.filter(k => THEMES[k] && !THEMES[k]._hidden && matchesSearch(k, THEMES[k])).length === 0
        ) && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: COLORS.textMuted,
            fontSize: 13,
            fontStyle: "italic",
          }}>
            No themes match "{searchFilter}"
          </div>
        )}
      </Card>

      {/* ── Language (placeholder) ── */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>
          Language
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Interface language preference.
        </div>
        <div style={{
          padding: "10px 14px",
          background: COLORS.surface,
          borderRadius: 6,
          border: `1px solid ${COLORS.border}`,
          fontSize: 12,
          color: COLORS.textMuted,
          fontStyle: "italic",
        }}>
          English (default) — additional languages coming soon.
        </div>
      </Card>
    </div>
  );
};
