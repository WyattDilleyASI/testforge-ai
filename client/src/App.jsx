import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { api } from "./api";

// ─── THEMES ─────────────────────────────────────────────────────────────────

const THEMES = {
  dark: {
    name: "Cyber Dark",
    swatch: "#22D3EE",
    bg: "#0B0E14", surface: "#121821", surfaceRaised: "#1A2233",
    border: "#243044", text: "#C8D6E5", textMuted: "#7A8BA3",
    textBright: "#EFF4F8", accent: "#22D3EE", accentDim: "rgba(34,211,238,0.12)",
    accentGlow: "rgba(34,211,238,0.25)", green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
    red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FBBF24",
    amberDim: "rgba(251,191,36,0.12)", purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.12)",
  },
  cherry: {
    name: "Cherry Blossom",
    swatch: "#D63384",
    bg: "#FEF6F8", surface: "#FFFFFF", surfaceRaised: "#FFF0F5",
    border: "#F0C0D0", text: "#5A2030", textMuted: "#A06070",
    textBright: "#2D0A18", accent: "#D63384", accentDim: "rgba(214,51,132,0.1)",
    accentGlow: "rgba(214,51,132,0.22)", green: "#2D8A5A", greenDim: "rgba(45,138,90,0.1)",
    red: "#C0392B", redDim: "rgba(192,57,43,0.1)", amber: "#B07020",
    amberDim: "rgba(176,112,32,0.1)", purple: "#7D3C98", purpleDim: "rgba(125,60,152,0.1)",
  },
  ocean: {
    name: "Ocean Depth",
    swatch: "#00B4D8",
    bg: "#04101A", surface: "#071828", surfaceRaised: "#0B2035",
    border: "#0E3050", text: "#A8C8E0", textMuted: "#507090",
    textBright: "#D0E8F5", accent: "#00B4D8", accentDim: "rgba(0,180,216,0.12)",
    accentGlow: "rgba(0,180,216,0.25)", green: "#00C896", greenDim: "rgba(0,200,150,0.12)",
    red: "#FF6B7A", redDim: "rgba(255,107,122,0.12)", amber: "#FFB347",
    amberDim: "rgba(255,179,71,0.12)", purple: "#C084FC", purpleDim: "rgba(192,132,252,0.12)",
  },
  slate: {
    name: "Slate",
    swatch: "#2563EB",
    bg: "#F5F7FA", surface: "#FFFFFF", surfaceRaised: "#EEF2F7",
    border: "#D0D8E4", text: "#374151", textMuted: "#6B7280",
    textBright: "#111827", accent: "#2563EB", accentDim: "rgba(37,99,235,0.1)",
    accentGlow: "rgba(37,99,235,0.2)", green: "#059669", greenDim: "rgba(5,150,105,0.1)",
    red: "#DC2626", redDim: "rgba(220,38,38,0.1)", amber: "#D97706",
    amberDim: "rgba(217,119,6,0.1)", purple: "#7C3AED", purpleDim: "rgba(124,58,237,0.1)",
  },
  forest: {
    name: "Forest",
    swatch: "#22C55E",
    bg: "#F0FAF4", surface: "#FFFFFF", surfaceRaised: "#E8F5ED",
    border: "#B8DFC4", text: "#1A3D2A", textMuted: "#5A8A6A",
    textBright: "#0A2015", accent: "#16A34A", accentDim: "rgba(22,163,74,0.1)",
    accentGlow: "rgba(22,163,74,0.2)", green: "#15803D", greenDim: "rgba(21,128,61,0.12)",
    red: "#DC2626", redDim: "rgba(220,38,38,0.1)", amber: "#CA8A04",
    amberDim: "rgba(202,138,4,0.1)", purple: "#7C3AED", purpleDim: "rgba(124,58,237,0.1)",
  },
  vaporwave: {
    name: "Vaporwave",
    swatch: "#FF71CE",
    bg: "#1A0033", surface: "#2D0054", surfaceRaised: "#3D0070",
    border: "#FF71CE", text: "#B967FF", textMuted: "#05FFA1",
    textBright: "#FFFB96", accent: "#FF71CE", accentDim: "rgba(255,113,206,0.18)",
    accentGlow: "rgba(255,113,206,0.4)", green: "#05FFA1", greenDim: "rgba(5,255,161,0.15)",
    red: "#FF6B9D", redDim: "rgba(255,107,157,0.15)", amber: "#FFFB96",
    amberDim: "rgba(255,251,150,0.15)", purple: "#01CDFE", purpleDim: "rgba(1,205,254,0.15)",
  },
  hotdog: {
    name: "Hot Dog Stand",
    swatch: "#FF0000",
    bg: "#FF0000", surface: "#FFFF00", surfaceRaised: "#FF6600",
    border: "#000000", text: "#000000", textMuted: "#8B0000",
    textBright: "#FFFFFF", accent: "#0000FF", accentDim: "rgba(0,0,255,0.2)",
    accentGlow: "rgba(0,0,255,0.4)", green: "#00FF00", greenDim: "rgba(0,255,0,0.2)",
    red: "#FFFFFF", redDim: "rgba(255,255,255,0.2)", amber: "#FF00FF",
    amberDim: "rgba(255,0,255,0.2)", purple: "#00FFFF", purpleDim: "rgba(0,255,255,0.2)",
  },
};

const ThemeContext = createContext(THEMES.dark);
const useTheme = () => useContext(ThemeContext);

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const font = "'DM Sans', 'Segoe UI', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const DRAFT_DISCLAIMER = "These test cases are AI-generated drafts and represent a suggested starting point only. QA Engineer review, augmentation, and approval are required before use.";

const ROLE_PERMISSIONS = {
  "QA Engineer": { label: "QA Engineer", color: "accent", permissions: ["Ingest & edit requirements", "Generate & edit test cases", "Add & tag KB entries", "View Traceability Matrix & Coverage Dashboard"], restricted: ["Approve TCs for export", "Modify Jama settings", "Access user management"] },
  "QA Manager": { label: "QA Manager", color: "amber", permissions: ["All QA Manager permissions", "Approve or reject TCs for export", "Initiate & review Jama exports", "View user activity logs"], restricted: ["Create/edit/deactivate accounts", "Configure Jama API credentials", "Access full audit log"] },
  "Admin": { label: "Admin", color: "purple", permissions: ["All QA Manager permissions", "Create, edit, deactivate accounts", "Assign roles to users", "Configure Jama credentials", "Access full system audit log"], restricted: [] },
};

// ─── UTILITY COMPONENTS ─────────────────────────────────────────────────────

const Badge = ({ color = "accent", children, style }) => {
  const COLORS = useTheme();
  const c = COLORS[color] || color;
  const dim = COLORS[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

const Button = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const COLORS = useTheme();
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = { primary: { ...base, background: COLORS.accent, color: COLORS.bg }, secondary: { ...base, background: COLORS.surfaceRaised, color: COLORS.text, border: `1px solid ${COLORS.border}` }, danger: { ...base, background: COLORS.redDim, color: COLORS.red, border: `1px solid ${COLORS.red}33` }, ghost: { ...base, background: "transparent", color: COLORS.textMuted } };
  return <button style={{ ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Card = ({ children, style, glow, ...rest }) => {
  const COLORS = useTheme();
  return <div style={{ background: COLORS.surfaceRaised, border: `1px solid ${glow ? COLORS.accent + "44" : COLORS.border}`, borderRadius: 10, padding: 20, boxShadow: glow ? `0 0 20px ${COLORS.accentGlow}` : "0 2px 8px rgba(0,0,0,0.12)", ...style }} {...rest}>{children}</div>;
};

const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => {
  const COLORS = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none", opacity: disabled ? 0.5 : 1 }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
    </div>
  );
};

const PasswordInput = ({ label, value, onChange, placeholder, style, onKeyDown }) => {
  const COLORS = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
      <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} style={{ fontFamily: font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none" }} />
    </div>
  );
};

const Select = ({ label, value, onChange, options, style, disabled }) => {
  const COLORS = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ fontFamily: font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </div>
  );
};

const ReqIdTag = ({ id }) => {
  const COLORS = useTheme();
  return <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.accent}33` }}>{id}</span>;
};

const Spinner = () => {
  const COLORS = useTheme();
  return <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.accent }}><div style={{ width: 18, height: 18, border: `2px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 13, fontFamily: mono }}>Generating drafts via Claude API...</span><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>;
};

const EmptyState = ({ icon, title, subtitle }) => {
  const COLORS = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: COLORS.textMuted, textAlign: "center" }}><span style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</span><span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{title}</span><span style={{ fontSize: 13 }}>{subtitle}</span></div>;
};

const DraftDisclaimer = ({ style }) => {
  const COLORS = useTheme();
  return <div style={{ padding: "10px 14px", background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber, lineHeight: 1.5, ...style }}><span style={{ fontFamily: mono, fontWeight: 700, marginRight: 6, fontSize: 10, textTransform: "uppercase" }}>TC-003a DRAFT</span>{DRAFT_DISCLAIMER}</div>;
};

const ErrorBanner = ({ msg }) => {
  const COLORS = useTheme();
  return msg ? <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.redDim, borderRadius: 6, border: `1px solid ${COLORS.red}33`, fontSize: 12, color: COLORS.red }}>{msg}</div> : null;
};

// ─── THEME PICKER ────────────────────────────────────────────────────────────

const ThemePicker = ({ currentTheme, onThemeChange }) => {
  const COLORS = useTheme();
  return (
    <div style={{ padding: "10px 16px", borderTop: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Theme</div>
      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        {Object.entries(THEMES).map(([key, theme]) => (
          <button
            key={key}
            title={theme.name}
            onClick={() => onThemeChange(key)}
            style={{
              width: 20, height: 20, borderRadius: "50%",
              background: theme.swatch,
              border: currentTheme === key ? `2px solid ${COLORS.textBright}` : "2px solid transparent",
              cursor: "pointer", padding: 0, flexShrink: 0,
              outline: currentTheme === key ? `2px solid ${COLORS.textMuted}` : "none",
              outlineOffset: 1,
              transition: "all 0.15s",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 9, fontFamily: mono, color: COLORS.accent, marginTop: 6 }}>{THEMES[currentTheme]?.name}</div>
    </div>
  );
};

// ─── LOGIN SCREEN ───────────────────────────────────────────────────────────

const LoginScreen = ({ onLogin }) => {
  const COLORS = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const data = await api.login(username, password);
      onLogin(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${COLORS.accent} !important; box-shadow: 0 0 0 2px ${COLORS.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: COLORS.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textBright }}>TestForge AI</span>
          <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI-Powered Test Creation Tool v1.2</div>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Sign In</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 20 }}>Enter your credentials to access the Tool</div>
          <Input label="Username" value={username} onChange={setUsername} placeholder="Enter username" style={{ marginBottom: 14 }} />
          <PasswordInput label="Password" value={password} onChange={setPassword} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ marginBottom: 20 }} />
          <ErrorBanner msg={error} />
          <Button onClick={handleLogin} disabled={!username || !password || loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Signing in..." : "Sign In"}</Button>
          <div style={{ marginTop: 16, fontSize: 10, color: COLORS.textMuted, textAlign: "center", fontFamily: mono }}>UM-008: Account locks after 5 failed attempts</div>
        </Card>
      </div>
    </div>
  );
};

// ─── PASSWORD CHANGE SCREEN ─────────────────────────────────────────────────

const PasswordChangeScreen = ({ userId, userName, isOtp, onComplete }) => {
  const COLORS = useTheme();
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (newPass.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (newPass !== confirmPass) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const data = await api.changePassword(userId, newPass);
      onComplete(data.user);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${COLORS.accent} !important; box-shadow: 0 0 0 2px ${COLORS.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: COLORS.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textBright }}>TestForge AI</span>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{isOtp ? "Create Your Password" : "Change Default Password"}</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>Welcome, {userName}.</div>
          <div style={{ padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber, marginBottom: 20 }}>
            {isOtp ? "You signed in with a one-time password. Please create your own password to continue." : "This is your first login. Please change the default password to continue."}
          </div>
          <PasswordInput label="New Password" value={newPass} onChange={setNewPass} placeholder="Create a password" style={{ marginBottom: 14 }} />
          <PasswordInput label="Confirm Password" value={confirmPass} onChange={setConfirmPass} placeholder="Confirm password" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ marginBottom: 20 }} />
          <ErrorBanner msg={error} />
          <Button onClick={handleSubmit} disabled={!newPass || !confirmPass || loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Setting..." : "Set Password & Continue"}</Button>
        </Card>
      </div>
    </div>
  );
};

// ─── NAVIGATION ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "dashboard", label: "Coverage Dashboard", icon: "◫", reqs: "RS-007" },
  { key: "requirements", label: "Requirements", icon: "◧", reqs: "RS-001 – RS-006" },
  { key: "testcases", label: "Test Cases", icon: "◨", reqs: "TC-001 – TC-009" },
  { key: "traceability", label: "Traceability Matrix", icon: "◩", reqs: "TC-007" },
  { key: "kb", label: "Knowledge Base", icon: "◪", reqs: "KB-001 – KB-006" },
  { key: "users", label: "User Management", icon: "◯", reqs: "UM-001 – UM-009" },
  { key: "jama", label: "Jama Connect", icon: "◭", reqs: "JM-001 – JM-009" },
  { key: "deferred", label: "Deferred to v2", icon: "◬", reqs: "AL-xxx · KB-007" },
];

const Sidebar = ({ active, onNavigate, currentUser, onLogout, currentTheme, onThemeChange }) => {
  const COLORS = useTheme();
  return (
    <div style={{ width: 250, minHeight: "100vh", background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", fontFamily: font, flexShrink: 0 }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20, color: COLORS.accent }}>◈</span><span style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright }}>TestForge AI</span></div>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Test Creation Tool v1.2</div>
      </div>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: COLORS.textBright, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
          <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>@{currentUser.username} · {currentUser.role}</div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 10, fontFamily: mono, padding: "4px 8px", borderRadius: 4 }}>Sign Out</button>
      </div>
      <nav style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const d = item.key === "deferred";
          return <button key={item.key} onClick={() => onNavigate(item.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", fontFamily: font, fontSize: 13, fontWeight: active === item.key ? 600 : 400, color: active === item.key ? COLORS.textBright : d ? COLORS.textMuted + "88" : COLORS.textMuted, background: active === item.key ? COLORS.accentDim : "transparent", borderLeft: active === item.key ? `2px solid ${COLORS.accent}` : "2px solid transparent", fontStyle: d ? "italic" : "normal" }}>
            <span style={{ fontSize: 15, opacity: d ? 0.3 : 0.7, width: 20, textAlign: "center" }}>{item.icon}</span>
            <div><div>{item.label}</div><div style={{ fontSize: 9, fontFamily: mono, color: COLORS.textMuted, opacity: 0.7, marginTop: 1 }}>{item.reqs}</div></div>
          </button>;
        })}
      </nav>
      <ThemePicker currentTheme={currentTheme} onThemeChange={onThemeChange} />
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>FRD v1.2 — 39 active REQs</div>
    </div>
  );
};

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

const DashboardView = ({ requirements, testCases, kbEntries }) => {
  const COLORS = useTheme();
  const covered = requirements.filter(r => testCases.some(tc => (tc.linked_req_ids || []).includes(r.req_id)));
  const untested = requirements.filter(r => !testCases.some(tc => (tc.linked_req_ids || []).includes(r.req_id)));
  const coveragePct = requirements.length ? Math.round((covered.length / requirements.length) * 100) : 0;
  const reviewed = testCases.filter(tc => tc.status === "Reviewed").length;
  const drafts = testCases.filter(tc => tc.status === "Draft").length;

  const Stat = ({ label, value, color, sub, reqId }) => (
    <Card style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}><span>{label}</span>{reqId && <span style={{ color: COLORS.accent, opacity: 0.6 }}>{reqId}</span>}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: COLORS[color] || COLORS.textBright, fontFamily: mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{sub}</div>}
    </Card>
  );

  return <div>
    <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Requirements Coverage Dashboard</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>REQ RS-007</p></div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
      <Stat label="Coverage" value={`${coveragePct}%`} color={coveragePct > 70 ? "green" : coveragePct > 40 ? "amber" : "red"} sub={`${covered.length} of ${requirements.length} REQs`} reqId="RS-007" />
      <Stat label="TC Drafts" value={drafts} color="amber" sub="Awaiting review" reqId="TC-003a" />
      <Stat label="TC Reviewed" value={reviewed} color="green" sub="Engineer-approved" reqId="TC-003a" />
      <Stat label="KB Entries" value={kbEntries.length} color="purple" sub={`${kbEntries.reduce((s, e) => s + (e.usage_count || 0), 0)} usages`} reqId="KB-001" />
    </div>
    {untested.length > 0 && <Card><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.amber, marginBottom: 12 }}>Untested Requirements</div>{untested.map(r => <div key={r.req_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${COLORS.border}` }}><ReqIdTag id={r.req_id} /><span style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{r.title}</span><Badge color="amber">{r.priority}</Badge></div>)}</Card>}
  </div>;
};

// ─── REQUIREMENTS ───────────────────────────────────────────────────────────

const RequirementsView = ({ requirements, refresh, currentUser }) => {
  const COLORS = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [addForm, setAddForm] = useState({ req_id: "", title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
  const [editForm, setEditForm] = useState({ req_id: "", title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const canDelete = currentUser?.role === "Admin" || currentUser?.role === "QA Manager";

  const startAdd = () => { setAddForm({ req_id: `REQ-${String(requirements.length + 1).padStart(3, "0")}`, title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" }); setShowAdd(true); setEditId(null); setError(""); setDeleteConfirm(null); };

  const startEdit = (r) => {
    if (editId === r.req_id) { setEditId(null); return; }
    setEditForm({ req_id: r.req_id, title: r.title, description: r.description || "", acceptanceCriteria: (r.acceptance_criteria || []).join("\n"), priority: r.priority, status: r.status, module: r.module || "" });
    setEditId(r.req_id); setShowAdd(false); setError(""); setDeleteConfirm(null);
  };

  const saveAdd = async () => {
    setError("");
    const data = { req_id: addForm.req_id, title: addForm.title, description: addForm.description, acceptance_criteria: addForm.acceptanceCriteria.split("\n").filter(s => s.trim()), priority: addForm.priority, status: addForm.status, module: addForm.module };
    try { await api.createRequirement(data); setShowAdd(false); refresh(); } catch (err) { setError(err.message); }
  };

  const saveEdit = async () => {
    setError("");
    const data = { title: editForm.title, description: editForm.description, acceptance_criteria: editForm.acceptanceCriteria.split("\n").filter(s => s.trim()), priority: editForm.priority, status: editForm.status, module: editForm.module };
    try { await api.updateRequirement(editId, data); setEditId(null); refresh(); } catch (err) { setError(err.message); }
  };

  const doDelete = async (reqId) => {
    setError("");
    try { await api.deleteRequirement(reqId); setEditId(null); setDeleteConfirm(null); refresh(); } catch (err) { setError(err.message); }
  };

  const renderForm = (form, setForm, isEdit) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Input label="REQ ID" value={form.req_id} onChange={v => setForm(p => ({ ...p, req_id: v }))} mono disabled={isEdit} />
        <Select label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))} options={["High", "Medium", "Low"].map(v => ({ value: v, label: v }))} />
        <Select label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={["Draft", "Review", "Approved", "Rejected"].map(v => ({ value: v, label: v }))} />
        <Select label="Module" value={form.module} onChange={v => setForm(p => ({ ...p, module: v }))} options={["Requirement Ingestion", "Test Case Generation", "Jama Integration", "User Management"].map(v => ({ value: v, label: v }))} />
      </div>
      <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} textarea style={{ marginBottom: 12 }} />
      <Input label="Acceptance Criteria (one per line)" value={form.acceptanceCriteria} onChange={v => setForm(p => ({ ...p, acceptanceCriteria: v }))} textarea mono style={{ marginBottom: 14 }} />
      <ErrorBanner msg={error} />
    </>
  );

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Requirements</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>RS-001 – RS-006</p></div>
      <Button onClick={startAdd}>+ Add Requirement</Button>
    </div>

    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 14 }}>Add Requirement</div>
      {renderForm(addForm, setAddForm, false)}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
        <Button onClick={saveAdd} disabled={!addForm.req_id || !addForm.title}>Save</Button>
      </div>
    </Card>}

    {requirements.map(r => {
      const isEditing = editId === r.req_id;
      return <Card key={r.req_id} style={{ marginBottom: 10, cursor: isEditing ? "default" : "pointer", borderColor: isEditing ? COLORS.accent + "44" : undefined, boxShadow: isEditing ? `0 0 20px ${COLORS.accentGlow}` : undefined }} onClick={() => !isEditing && startEdit(r)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <ReqIdTag id={r.req_id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{r.title}</div>
            {!isEditing && <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{r.description}</div>}
            {!isEditing && (r.acceptance_criteria || []).length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase" }}>Acceptance Criteria:</span>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}` }}>• {ac}</div>)}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}><Badge color={r.priority === "High" ? "red" : r.priority === "Medium" ? "amber" : "green"}>{r.priority}</Badge><Badge color={r.status === "Approved" ? "green" : r.status === "Review" ? "amber" : r.status === "Rejected" ? "red" : "textMuted"}>{r.status}</Badge></div>
        </div>

        {isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Editing</div>
          {renderForm(editForm, setEditForm, true)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {canDelete && deleteConfirm !== editId && (
              <Button variant="danger" small onClick={() => setDeleteConfirm(editId)} style={{ marginRight: "auto" }}>Delete</Button>
            )}
            {canDelete && deleteConfirm === editId && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
                <span style={{ fontSize: 11, color: COLORS.red }}>Delete? Linked TCs will be orphaned.</span>
                <Button variant="danger" small onClick={() => doDelete(editId)}>Confirm</Button>
                <Button variant="ghost" small onClick={() => setDeleteConfirm(null)}>No</Button>
              </div>
            )}
            <Button variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!editForm.title}>Save</Button>
          </div>
        </div>}
      </Card>;
    })}
  </div>;
};

// ─── TEST CASES ─────────────────────────────────────────────────────────────

const TestCaseView = ({ requirements, testCases, kbEntries, refresh }) => {
  const COLORS = useTheme();
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [generating, setGenerating] = useState(false);
  const [expandedTc, setExpandedTc] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [viewMode, setViewMode] = useState("library");
  const [copyState, setCopyState] = useState("idle"); // idle | copying | copied | error
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const visibleTcs = viewMode === "session" && sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : testCases;
  const isUnreviewed = tc => tc.status === "Draft";

  const generate = async () => {
    if (!selectedReqId) return;
    setGenerating(true); setApiError(null);
    try {
      const newTcs = await api.generateTestCases(selectedReqId, depth);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setViewMode("session");
      refresh();
    } catch (err) { setApiError(err.message); }
    finally { setGenerating(false); }
  };

  const copyPrompt = async () => {
    if (!selectedReqId) return;
    setCopyState("copying");
    try {
      const { prompt } = await api.getGenerationPrompt(selectedReqId, depth);
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch (err) {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  const doImport = async () => {
    setImportError("");
    let parsed;
    try {
      const cleaned = importJson.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error("Response must be a JSON array");
    } catch (err) {
      setImportError(`Invalid JSON: ${err.message}`);
      return;
    }
    setImporting(true);
    try {
      const newTcs = await api.importTestCases(selectedReqId, depth, parsed);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setViewMode("session");
      setShowImport(false);
      setImportJson("");
      refresh();
    } catch (err) { setImportError(err.message); }
    finally { setImporting(false); }
  };

  const updateStatus = async (tcId, status) => {
    try { await api.updateTcStatus(tcId, status); refresh(); } catch (err) { console.error(err); }
  };

  return <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Generation</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>TC-001 – TC-009</p></div>
    </div>
    <Card glow style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="Requirement" value={selectedReqId} onChange={setSelectedReqId} style={{ minWidth: 280 }} options={[{ value: "", label: "— Select —" }, ...requirements.map(r => ({ value: r.req_id, label: `${r.req_id} — ${r.title}` }))]} />
        <Select label="Depth" value={depth} onChange={setDepth} style={{ minWidth: 180 }} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
        <Button onClick={generate} disabled={!selectedReqId || generating}>{generating ? "Generating..." : "Generate Drafts"}</Button>
      </div>
      {generating && <div style={{ marginTop: 14 }}><Spinner /></div>}
      {apiError && <div style={{ marginTop: 10, fontSize: 12, color: COLORS.red, fontFamily: mono }}>{apiError}</div>}
    </Card>

    {/* Claude.ai manual workflow */}
    <Card style={{ marginBottom: 24, border: `1px solid ${COLORS.purple}33` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.purple, fontFamily: mono, textTransform: "uppercase", marginBottom: 3 }}>No API Key? Use Claude.ai Manually</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>Copy the prompt → paste into claude.ai → paste the JSON response back here</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            small
            disabled={!selectedReqId || copyState === "copying"}
            onClick={copyPrompt}
            style={{ borderColor: COLORS.purple + "66", color: copyState === "copied" ? COLORS.green : copyState === "error" ? COLORS.red : COLORS.purple }}
          >
            {copyState === "copying" ? "Fetching..." : copyState === "copied" ? "✓ Copied!" : copyState === "error" ? "✗ Failed" : "Copy Prompt"}
          </Button>
          <Button
            variant="secondary"
            small
            disabled={!selectedReqId}
            onClick={() => { setShowImport(!showImport); setImportError(""); }}
            style={{ borderColor: COLORS.purple + "66", color: COLORS.purple }}
          >
            {showImport ? "Cancel Import" : "Import Response"}
          </Button>
        </div>
      </div>

      {showImport && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
          Paste the JSON array from Claude.ai below. Include the <span style={{ fontFamily: mono, color: COLORS.purple }}>[ ]</span> brackets.
        </div>
        <textarea
          value={importJson}
          onChange={e => setImportJson(e.target.value)}
          placeholder={'[\n  {\n    "title": "...",\n    "type": "Happy Path",\n    "preconditions": "...",\n    "steps": [{ "step": "...", "expectedResult": "..." }],\n    "passFailCriteria": "..."\n  }\n]'}
          style={{ width: "100%", minHeight: 160, fontFamily: mono, fontSize: 11, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${importError ? COLORS.red : COLORS.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
        />
        {importError && <div style={{ marginTop: 6, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{importError}</div>}
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" small onClick={() => { setShowImport(false); setImportJson(""); setImportError(""); }}>Cancel</Button>
          <Button small disabled={!importJson.trim() || importing} onClick={doImport}
            style={{ background: COLORS.purple, color: COLORS.bg }}>
            {importing ? "Saving..." : "Save Test Cases"}
          </Button>
        </div>
      </div>}
    </Card>
    {testCases.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
      <Button small variant={viewMode === "library" ? "primary" : "secondary"} onClick={() => setViewMode("library")}>Library ({testCases.length})</Button>
      {sessionTcIds && <Button small variant={viewMode === "session" ? "primary" : "secondary"} onClick={() => setViewMode("session")}>Session ({sessionTcIds.length})</Button>}
      <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>TC-009</span>
    </div>}
    {visibleTcs.length === 0 ? <EmptyState icon="◨" title="No Test Cases" subtitle="Generate drafts above" /> : <>
      {visibleTcs.some(isUnreviewed) && <DraftDisclaimer style={{ marginBottom: 16 }} />}
      {visibleTcs.map(tc => <Card key={tc.tc_id} style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => setExpandedTc(expandedTc === tc.tc_id ? null : tc.tc_id)}>
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>{tc.tc_id}</span>
          <div style={{ flex: 1, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, display: "flex", alignItems: "center", gap: 8 }}>{tc.title}{isUnreviewed(tc) && <span style={{ fontSize: 9, fontFamily: mono, color: COLORS.amber, background: COLORS.amberDim, padding: "1px 6px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>Draft</span>}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>Traces to:</span>
              {(tc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}
              <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type}</Badge>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
            <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}</Button>
            <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Rejected"); }}>✗</Button>
            <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ marginLeft: 4 }}>{tc.status}</Badge>
          </div>
        </div>
        {expandedTc === tc.tc_id && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
          {isUnreviewed(tc) && <div style={{ marginBottom: 14, padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, fontSize: 10, color: COLORS.amber, fontFamily: mono }}>DRAFT — Review required</div>}
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 8 }}>PRECONDITIONS</div>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 14, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.preconditions}</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginBottom: 8 }}>TEST STEPS</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected</th></tr></thead>
            <tbody>{(tc.steps || []).map((s, i) => <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}><td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono }}>{i + 1}</td><td style={{ padding: "8px 10px", color: COLORS.text }}>{s.step}</td><td style={{ padding: "8px 10px", color: COLORS.green }}>{s.expectedResult}</td></tr>)}</tbody>
          </table>
          <div style={{ marginTop: 12 }}><span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>PASS/FAIL: </span><span style={{ fontSize: 12, color: COLORS.text }}>{tc.pass_fail_criteria}</span></div>
        </div>}
      </Card>)}
    </>}
    </div>
  </div>;
};

// ─── TRACEABILITY MATRIX ────────────────────────────────────────────────────

const TraceabilityView = ({ requirements, testCases }) => {
  const COLORS = useTheme();
  return <div>
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
  </div>;
};

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

const KbView = ({ kbEntries, refresh }) => {
  const COLORS = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", type: "Defect History", content: "", tags: "" });
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    try {
      await api.createKbEntry({ title: form.title, type: form.type, content: form.content, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      setShowAdd(false); setForm({ title: "", type: "Defect History", content: "", tags: "" }); refresh();
    } catch (err) { setError(err.message); }
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Knowledge Base</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>KB-001 – KB-006</p></div>
      <Button onClick={() => setShowAdd(!showAdd)}>+ Add Entry</Button>
    </div>
    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Select label="Type" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} style={{ marginBottom: 12 }} options={["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline"].map(t => ({ value: t, label: t }))} />
      <Input label="Content" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} textarea style={{ marginBottom: 12 }} />
      <Input label="Tagged REQ IDs (comma-separated)" value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} mono style={{ marginBottom: 14 }} />
      <ErrorBanner msg={error} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={save} disabled={!form.title || !form.content}>Save</Button></div>
    </Card>}
    {kbEntries.map(e => <Card key={e.kb_id} style={{ marginBottom: 10 }}><div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 8px", borderRadius: 4 }}>{e.kb_id}</span><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>{e.title}</div><div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>{e.content}</div><div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><Badge color="purple">{e.type}</Badge>{(e.tags || []).map(t => <ReqIdTag key={t} id={t} />)}<span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>Used {e.usage_count || 0}×</span></div></div></div></Card>)}
  </div>;
};

// ─── USER MANAGEMENT ────────────────────────────────────────────────────────

const UserManagementView = ({ currentUser, refreshAll }) => {
  const COLORS = useTheme();
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", role: "QA Engineer" });
  const [lastOtp, setLastOtp] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = currentUser.role === "Admin";

  const loadUsers = useCallback(async () => { try { setUsers(await api.getUsers()); } catch (e) {} }, []);
  const loadAudit = useCallback(async () => { if (isAdmin) try { setAuditLog(await api.getAuditLog()); } catch (e) {} }, [isAdmin]);
  useEffect(() => { loadUsers(); loadAudit(); }, [loadUsers, loadAudit]);

  const addUser = async () => {
    setError("");
    try {
      const data = await api.createUser(form.username, form.name, form.role);
      setLastOtp({ username: data.username, name: data.name, otp: data.otp });
      setShowAdd(false); setForm({ username: "", name: "", role: "QA Engineer" }); loadUsers(); loadAudit();
    } catch (err) { setError(err.message); }
  };

  const doChangeRole = async (id, role) => { try { await api.changeRole(id, role); loadUsers(); loadAudit(); } catch (e) {} };
  const doToggleStatus = async (id) => { try { await api.changeStatus(id); loadUsers(); loadAudit(); } catch (e) {} };
  const doResetPw = async (id) => { try { const d = await api.resetPassword(id); setLastOtp({ username: d.username, name: d.name, otp: d.otp }); loadUsers(); loadAudit(); } catch (e) {} };
  const doUnlock = async (id) => { try { await api.unlockUser(id); loadUsers(); loadAudit(); } catch (e) {} };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>User Management</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>UM-001 – UM-009</p></div>
      {isAdmin && <Button onClick={() => { setShowAdd(!showAdd); setLastOtp(null); }}>+ Create Account</Button>}
    </div>
    {!isAdmin && <Card style={{ marginBottom: 16, padding: "12px 16px" }}><div style={{ fontSize: 12, color: COLORS.amber }}>UM-005: Admin role required for user management.</div></Card>}

    {lastOtp && isAdmin && <Card glow style={{ marginBottom: 16, border: `1px solid ${COLORS.green}44` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, marginBottom: 10 }}>One-Time Password Generated</div>
      <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 8 }}>Provide these credentials to <span style={{ fontWeight: 600, color: COLORS.textBright }}>{lastOtp.name}</span>:</div>
      <div style={{ padding: "12px 16px", background: COLORS.surface, borderRadius: 6, display: "flex", gap: 24 }}>
        <div><div style={{ fontSize: 9, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase" }}>Username</div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: mono, color: COLORS.accent, marginTop: 2 }}>{lastOtp.username}</div></div>
        <div><div style={{ fontSize: 9, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase" }}>One-Time Password</div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: mono, color: COLORS.amber, marginTop: 2 }}>{lastOtp.otp}</div></div>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>This password will not be shown again.</div>
      <Button small variant="secondary" onClick={() => setLastOtp(null)} style={{ marginTop: 10 }}>Dismiss</Button>
    </Card>}

    {showAdd && isAdmin && <Card glow style={{ marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Input label="Username" value={form.username} onChange={v => setForm(p => ({ ...p, username: v }))} mono placeholder="jsmith" />
        <Input label="Full Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Jane Smith" />
        <Select label="Role" value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={["QA Engineer", "QA Manager", "Admin"].map(v => ({ value: v, label: v }))} />
      </div>
      <ErrorBanner msg={error} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={addUser} disabled={!form.username || !form.name}>Create & Generate OTP</Button></div>
    </Card>}

    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 14 }}>Accounts ({users.filter(u => u.status === "Active").length} active / {users.length} total)</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr><th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>User</th><th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Role</th><th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Status</th><th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Last Login</th>{isAdmin && <th style={{ textAlign: "right", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Actions</th>}</tr></thead>
        <tbody>{users.map(u => {
          const locked = u.failed_attempts >= 5;
          return <tr key={u.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <td style={{ padding: "10px" }}><div style={{ color: COLORS.textBright, fontWeight: 600 }}>{u.name}</div><div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>@{u.username}{u.must_change_password ? <span style={{ color: COLORS.amber, marginLeft: 6 }}>{u.is_otp ? "OTP" : "PW Change"}</span> : ""}</div></td>
            <td style={{ padding: "10px" }}>{isAdmin && u.id !== currentUser.id ? <select value={u.role} onChange={e => doChangeRole(u.id, e.target.value)} style={{ fontFamily: mono, fontSize: 11, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}><option>QA Engineer</option><option>QA Manager</option><option>Admin</option></select> : <Badge color={ROLE_PERMISSIONS[u.role]?.color || "accent"}>{u.role}</Badge>}</td>
            <td style={{ padding: "10px" }}><Badge color={u.status === "Active" ? (locked ? "red" : "green") : "textMuted"}>{locked ? "LOCKED" : u.status}</Badge></td>
            <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}</td>
            {isAdmin && <td style={{ padding: "10px", textAlign: "right" }}><div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {locked && <Button small variant="secondary" onClick={() => doUnlock(u.id)}>Unlock</Button>}
              <Button small variant="secondary" onClick={() => doResetPw(u.id)}>Reset PW</Button>
              {u.id !== currentUser.id && <Button small variant={u.status === "Active" ? "danger" : "secondary"} onClick={() => doToggleStatus(u.id)}>{u.status === "Active" ? "Deactivate" : "Reactivate"}</Button>}
            </div></td>}
          </tr>;
        })}</tbody>
      </table>
    </Card>

    {isAdmin ? <Card>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 14 }}>Audit Log <span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>UM-007</span></div>
      {auditLog.length === 0 ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No events yet.</div> :
      auditLog.slice(0, 20).map((l, i) => <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted, minWidth: 60 }}>{(l.timestamp || "").split("T")[1]?.slice(0, 8) || l.timestamp?.slice(11, 19)}</span>
        <Badge color={l.status === "success" ? "green" : "red"} style={{ minWidth: 50, justifyContent: "center" }}>{l.action?.slice(0, 14)}</Badge>
        <span style={{ color: COLORS.textMuted, fontFamily: mono, minWidth: 80 }}>{l.user_name}</span>
        <span style={{ color: COLORS.text, flex: 1 }}>{l.details}</span>
      </div>)}
    </Card> : <Card style={{ padding: "14px 16px" }}><div style={{ fontSize: 12, color: COLORS.textMuted }}>UM-005 / UM-007: Audit log is Admin-only.</div></Card>}
  </div>;
};

// ─── JAMA CONNECT ───────────────────────────────────────────────────────────

const JamaView = ({ testCases, requirements, currentUser }) => {
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

// ─── DEFERRED ───────────────────────────────────────────────────────────────

const DeferredView = () => {
  const COLORS = useTheme();
  return <div>
    <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Deferred to v2</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>FRD v1.2 Section 9</p></div>
    {[{ title: "Adaptive Learning Engine", sub: "AL-001 – AL-008", desc: "Descoped from v1 to keep the tool focused on assistive generation." },
      { title: "Confluence KB Import", sub: "KB-007", desc: "Manual entry only in v1. v2 implements Confluence REST API import." },
      { title: "SSO / External Identity", sub: "UM-xxx", desc: "v1 uses local accounts. v2 adds SAML/OAuth integration." }
    ].map((item, i) => <Card key={i} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Badge color="amber">DEFERRED</Badge><span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>{item.title}</span><span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{item.sub}</span></div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.7 }}>{item.desc}</div>
    </Card>)}
  </div>;
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPw, setPendingPw] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [themeName, setThemeName] = useState(() => localStorage.getItem("tfai-theme") || "dark");

  const [reqs, setReqs] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [kbEntries, setKbEntries] = useState([]);

  const activeTheme = THEMES[themeName] || THEMES.dark;

  // Sync body background and scrollbar colors to active theme
  useEffect(() => {
    document.body.style.background = activeTheme.bg;
    document.body.style.color = activeTheme.text;
    const style = document.getElementById("tfai-theme-style") || (() => {
      const s = document.createElement("style");
      s.id = "tfai-theme-style";
      document.head.appendChild(s);
      return s;
    })();
    style.textContent = `
      ::-webkit-scrollbar-track { background: ${activeTheme.bg}; }
      ::-webkit-scrollbar-thumb { background: ${activeTheme.border}; border-radius: 3px; }
      ::selection { background: ${activeTheme.accentGlow}; }
    `;
  }, [activeTheme]);

  const handleThemeChange = (key) => {
    setThemeName(key);
    localStorage.setItem("tfai-theme", key);
  };

  const loadData = useCallback(async () => {
    try { setReqs(await api.getRequirements()); }
    catch (e) {
      console.error("Failed to load requirements:", e.message);
      if (e.message?.includes("Not authenticated")) { setCurrentUser(null); setAuthState("login"); return; }
    }
    try { setTestCases(await api.getTestCases()); }
    catch (e) { console.error("Failed to load test cases:", e.message); }
    try { setKbEntries(await api.getKbEntries()); }
    catch (e) { console.error("Failed to load KB entries:", e.message); }
  }, []);

  useEffect(() => {
    api.me().then(data => { setCurrentUser(data.user); setAuthState("authenticated"); loadData(); }).catch(() => setAuthState("login"));
  }, [loadData]);

  const handleLogin = (data) => {
    if (data.mustChangePassword) {
      setPendingPw({ userId: data.user.id, name: data.user.name, isOtp: data.isOtp });
      setAuthState("changePassword");
    } else {
      setCurrentUser(data.user); setAuthState("authenticated"); loadData();
    }
  };

  const handlePwComplete = (user) => {
    setPendingPw(null); setCurrentUser(user); setAuthState("authenticated"); loadData();
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch (e) {}
    setCurrentUser(null); setAuthState("login"); setPage("dashboard");
  };

  const globalStyle = `input:focus, textarea:focus, select:focus { border-color: ${activeTheme.accent} !important; box-shadow: 0 0 0 2px ${activeTheme.accentDim}; } button:hover:not(:disabled) { filter: brightness(1.1); }`;

  if (authState === "loading") return (
    <ThemeContext.Provider value={activeTheme}>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: activeTheme.bg, color: activeTheme.accent, fontFamily: mono }}>Loading...</div>
    </ThemeContext.Provider>
  );

  if (authState === "login") return (
    <ThemeContext.Provider value={activeTheme}>
      <LoginScreen onLogin={handleLogin} />
    </ThemeContext.Provider>
  );

  if (authState === "changePassword" && pendingPw) return (
    <ThemeContext.Provider value={activeTheme}>
      <PasswordChangeScreen userId={pendingPw.userId} userName={pendingPw.name} isOtp={pendingPw.isOtp} onComplete={handlePwComplete} />
    </ThemeContext.Provider>
  );

  return (
    <ThemeContext.Provider value={activeTheme}>
      <div style={{ display: "flex", minHeight: "100vh", background: activeTheme.bg, fontFamily: font, color: activeTheme.text }}>
        <style>{globalStyle}</style>
        <Sidebar active={page} onNavigate={setPage} currentUser={currentUser} onLogout={handleLogout} currentTheme={themeName} onThemeChange={handleThemeChange} />
        <main style={{ flex: 1, padding: "28px 36px", maxWidth: 1100, overflowY: "auto" }}>
          {page === "dashboard" && <DashboardView requirements={reqs} testCases={testCases} kbEntries={kbEntries} />}
          {page === "requirements" && <RequirementsView requirements={reqs} refresh={loadData} currentUser={currentUser} />}
          {page === "testcases" && <TestCaseView requirements={reqs} testCases={testCases} kbEntries={kbEntries} refresh={loadData} />}
          {page === "traceability" && <TraceabilityView requirements={reqs} testCases={testCases} />}
          {page === "kb" && <KbView kbEntries={kbEntries} refresh={loadData} />}
          {page === "users" && <UserManagementView currentUser={currentUser} refreshAll={loadData} />}
          {page === "jama" && <JamaView testCases={testCases} requirements={reqs} currentUser={currentUser} />}
          {page === "deferred" && <DeferredView />}
        </main>
      </div>
    </ThemeContext.Provider>
  );
}
