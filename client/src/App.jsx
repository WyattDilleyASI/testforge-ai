import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import SysMLTraceability from "./SysMLTraceability";
import { THEMES, THEME_CATEGORIES, ThemeSwatch, ThemeContext, useTheme } from "./themes";


// Legacy alias so existing component code keeps working
const COLORS = THEMES.midnight;
const font = "'DM Sans', 'Segoe UI', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const DRAFT_DISCLAIMER = "These test cases are AI-generated drafts and represent a suggested starting point only. QA Engineer review, augmentation, and approval are required before use.";

const ROLE_PERMISSIONS = {
  "QA Engineer": { label: "QA Engineer", color: "accent", permissions: ["Ingest & edit requirements", "Generate & edit test cases", "Add & tag KB entries", "View Traceability Matrix & Coverage Dashboard"], restricted: ["Approve TCs for export", "Modify Jama settings", "Access user management"] },
  "QA Manager": { label: "QA Manager", color: "amber", permissions: ["All QA Engineer permissions", "Approve or reject TCs for export", "Initiate & review Jama exports", "View user activity logs"], restricted: ["Create/edit/deactivate accounts", "Configure Jama API credentials", "Access full audit log"] },
  "Admin": { label: "Admin", color: "purple", permissions: ["All QA Manager permissions", "Create, edit, deactivate accounts", "Assign roles to users", "Configure Jama credentials", "Access full system audit log"], restricted: [] },
};

// ─── UTILITY COMPONENTS ─────────────────────────────────────────────────────

const Badge = ({ color = "accent", children, style }) => {
  const T = useTheme();
  const c = T[color] || color;
  const dim = T[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

const Button = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const T = useTheme();
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = { primary: { ...base, background: T.accent, color: T.bg }, secondary: { ...base, background: T.surfaceRaised, color: T.text, border: `1px solid ${T.border}` }, danger: { ...base, background: T.redDim, color: T.red, border: `1px solid ${T.red}33` }, ghost: { ...base, background: "transparent", color: T.textMuted } };
  return <button style={{ ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Card = ({ children, style, glow, ...rest }) => {
  const T = useTheme();
  const isAeroTheme = T._aero || false;

  return (
    <div
      style={{
        background: isAeroTheme
          ? "rgba(255, 255, 255, 0.55)"
          : T.surfaceRaised,
        border: `1px solid ${glow ? T.accent + "44" : T.border}`,
        borderRadius: 10,
        padding: 20,
        boxShadow: glow
          ? `0 0 20px ${T.accentGlow}`
          : isAeroTheme
            ? "0 4px 24px rgba(0, 80, 140, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
            : "0 2px 8px rgba(0,0,0,0.3)",
        ...(isAeroTheme ? {
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none", opacity: disabled ? 0.5 : 1 }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
  </div>;
};

const PasswordInput = ({ label, value, onChange, placeholder, style, onKeyDown }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} style={{ fontFamily: font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none" }} />
  </div>;
};

const Select = ({ label, value, onChange, options, style, disabled }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ fontFamily: font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>;
};

const ReqIdTag = ({ id }) => { const T = useTheme(); return <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 4, border: `1px solid ${T.accent}33` }}>{id}</span>; };

const Spinner = () => { const T = useTheme(); return <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.accent }}><div style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 13, fontFamily: mono }}>Generating drafts via Claude API...</span><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>; };

const EmptyState = ({ icon, title, subtitle }) => { const T = useTheme(); return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: T.textMuted, textAlign: "center" }}><span style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</span><span style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 4 }}>{title}</span><span style={{ fontSize: 13 }}>{subtitle}</span></div>; };

const DraftDisclaimer = ({ style }) => { const T = useTheme(); return <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", borderRadius: 6, border: `1px solid ${T.amber}33`, fontSize: 11, color: T.amber, lineHeight: 1.5, ...style }}><span style={{ fontFamily: mono, fontWeight: 700, marginRight: 6, fontSize: 10, textTransform: "uppercase" }}>TC-003a DRAFT</span>{DRAFT_DISCLAIMER}</div>; };

const ErrorBanner = ({ msg }) => { const T = useTheme(); return msg ? <div style={{ marginBottom: 16, padding: "8px 12px", background: T.redDim, borderRadius: 6, border: `1px solid ${T.red}33`, fontSize: 12, color: T.red }}>{msg}</div> : null; };

// ─── LOGIN SCREEN ───────────────────────────────────────────────────────────

const LoginScreen = ({ onLogin }) => {
  const T = useTheme();
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 2px ${T.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: T.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.textBright }}>TestForge AI</span>
          <div style={{ fontSize: 10, fontFamily: mono, color: T.textMuted, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI-Powered Test Creation Tool v1.2</div>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textBright, marginBottom: 4 }}>Sign In</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 20 }}>Enter your credentials to access the Tool</div>
          <Input label="Username" value={username} onChange={setUsername} placeholder="Enter username" style={{ marginBottom: 14 }} />
          <PasswordInput label="Password" value={password} onChange={setPassword} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ marginBottom: 20 }} />
          <ErrorBanner msg={error} />
          <Button onClick={handleLogin} disabled={!username || !password || loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Signing in..." : "Sign In"}</Button>
          <div style={{ marginTop: 16, fontSize: 10, color: T.textMuted, textAlign: "center", fontFamily: mono }}>UM-008: Account locks after 5 failed attempts</div>
        </Card>
      </div>
    </div>
  );
};

// ─── PASSWORD CHANGE SCREEN ─────────────────────────────────────────────────

const PasswordChangeScreen = ({ userId, userName, isOtp, onComplete }) => {
  const T = useTheme();
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: font }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 2px ${T.accentDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 40, color: T.accent, display: "block", marginBottom: 8 }}>◈</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.textBright }}>TestForge AI</span>
        </div>
        <Card glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textBright, marginBottom: 4 }}>{isOtp ? "Create Your Password" : "Change Default Password"}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>Welcome, {userName}.</div>
          <div style={{ padding: "8px 12px", background: T.amberDim, borderRadius: 6, border: `1px solid ${T.amber}33`, fontSize: 11, color: T.amber, marginBottom: 20 }}>
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
  { key: "dashboard",     label: "Coverage Dashboard",   icon: "◫", reqs: "RS-007" },
  { key: "requirements",  label: "Requirements",         icon: "◧", reqs: "RS-001 – RS-006" },
  { key: "testcases",     label: "Test Cases",           icon: "◨", reqs: "TC-001 – TC-009" },
  { key: "traceability",  label: "SysML Traceability",   icon: "◈", reqs: "TC-007" },
  { key: "kb",            label: "Knowledge Base",       icon: "◪", reqs: "KB-001 – KB-006" },
  { key: "settings",      label: "Settings",             icon: "⚙", reqs: "UM · JM · MCP" },
  { key: "deferred",      label: "Deferred to v2",       icon: "◬", reqs: "AL-xxx · KB-007" },
];

const Sidebar = ({ active, onNavigate, currentUser, onLogout, currentTheme, onThemeChange }) => {
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

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

const DashboardView = ({ requirements, testCases, kbEntries, tokenUsage }) => {
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
    {tokenUsage && <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Claude API Usage</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Stat label="Tokens Used" value={tokenUsage.total_tokens.toLocaleString()} color="accent" sub={`${tokenUsage.input_tokens.toLocaleString()} in · ${tokenUsage.output_tokens.toLocaleString()} out`} />
        <Stat label="API Calls" value={tokenUsage.call_count} color="accent" sub="TC generation requests" />
        {tokenUsage.budget !== null
          ? <Stat label="Remaining Budget" value={tokenUsage.remaining.toLocaleString()} color={tokenUsage.remaining < tokenUsage.budget * 0.1 ? "red" : tokenUsage.remaining < tokenUsage.budget * 0.25 ? "amber" : "green"} sub={`of ${tokenUsage.budget.toLocaleString()} token budget`} />
          : <Stat label="Budget" value="No limit set" color="textMuted" sub="Set TOKEN_BUDGET in .env" />
        }
      </div>
    </div>}
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
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [expandedReq, setExpandedReq] = useState(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  const canDelete = currentUser?.role === "Admin" || currentUser?.role === "QA Manager";

  const handleClearAll = async () => {
    setError("");
    try { await api.clearRequirements(); setClearAllConfirm(false); refresh(); } catch (err) { setError(err.message); }
  };

  const handleImportDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true); setImportMsg(""); setError("");
    try {
      const result = await api.importRequirementsDoc(file);
      setImportMsg(`Imported ${result.imported} requirement(s). Auto-linked ${result.linked} test case(s).`);
      refresh();
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  };

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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {canDelete && !clearAllConfirm && requirements.length > 0 && <Button variant="danger" small onClick={() => setClearAllConfirm(true)}>Clear All</Button>}
        {clearAllConfirm && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: COLORS.red }}>Delete all {requirements.length} requirements?</span>
          <Button variant="danger" small onClick={handleClearAll}>Confirm</Button>
          <Button variant="ghost" small onClick={() => setClearAllConfirm(false)}>Cancel</Button>
        </div>}
        <label style={{ cursor: importing ? "not-allowed" : "pointer" }}>
          <input type="file" accept=".doc" style={{ display: "none" }} onChange={handleImportDoc} disabled={importing} />
          <Button variant="secondary" small onClick={undefined} style={{ pointerEvents: "none" }}>{importing ? "Importing..." : "Import JAMA Requirements"}</Button>
        </label>
        <Button onClick={startAdd}>+ Add Requirement</Button>
      </div>
    </div>
    {importMsg && <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>{importMsg}</div>}

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
      const isExpanded = expandedReq === r.req_id;
      const isJama = r.source === "JAMA Import";
      const SectionLabel = ({ children }) => <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 12, marginBottom: 4 }}>{children}</div>;
      const rels = r.relationships || [];
      const tcRels = rels.filter(rel => rel.group === "Verification Test Case" || rel.direction === "Downstream");
      const reqRels = rels.filter(rel => rel.group !== "Verification Test Case" && rel.direction !== "Downstream");

      return <Card key={r.req_id} style={{ marginBottom: 10, cursor: isEditing ? "default" : "pointer", borderColor: isEditing ? COLORS.accent + "44" : undefined, boxShadow: isEditing ? `0 0 20px ${COLORS.accentGlow}` : undefined }} onClick={() => { if (!isEditing) { if (isExpanded) setExpandedReq(null); else { setExpandedReq(r.req_id); setEditId(null); } } }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <ReqIdTag id={r.req_id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{r.title}</div>
            {!isEditing && !isExpanded && <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{r.description}</div>}
            {!isEditing && !isExpanded && (r.acceptance_criteria || []).length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase" }}>Acceptance Criteria:</span>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}` }}>• {ac}</div>)}</div>}
            {!isEditing && !isExpanded && rels.length > 0 && <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tcRels.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.green }}>TC: {tcRels.map(r => r.id).join(", ")}</span>}
              {reqRels.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.purple, marginLeft: tcRels.length ? 8 : 0 }}>REQ: {reqRels.map(r => r.id).join(", ")}</span>}
            </div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {isJama && <Badge color="purple">JAMA</Badge>}
            <Badge color={r.priority === "High" || r.priority === "Must Have" ? "red" : r.priority === "Medium" || r.priority === "Should Have" ? "amber" : "green"}>{r.priority}</Badge>
            <Badge color={r.status === "Approved" ? "green" : r.status === "Review" ? "amber" : r.status === "Rejected" ? "red" : "textMuted"}>{r.status}</Badge>
            {!isEditing && <button onClick={e => { e.stopPropagation(); startEdit(r); }} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, fontFamily: mono, padding: "2px 6px" }}>Edit</button>}
          </div>
        </div>

        {isExpanded && !isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          {r.description && <><SectionLabel>Requirement (EARS)</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{r.description}</div></>}
          {r.rationale && <><SectionLabel>Rationale</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{r.rationale}</div></>}
          {(r.acceptance_criteria || []).length > 0 && <><SectionLabel>Acceptance Criteria</SectionLabel>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}` }}>• {ac}</div>)}</>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {r.requirement_type && <div><SectionLabel>Type</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.requirement_type}</div></div>}
            {r.verification_method && <div><SectionLabel>Verification</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.verification_method}</div></div>}
            {r.safety_level && <div><SectionLabel>Safety Level</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.safety_level}</div></div>}
            {r.scheduled_release && <div><SectionLabel>Release</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.scheduled_release}</div></div>}
            {r.global_id && <div><SectionLabel>Global ID</SectionLabel><div style={{ fontSize: 12, fontFamily: mono, color: COLORS.textMuted }}>{r.global_id}</div></div>}
            {r.source && <div><SectionLabel>Source</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.source}</div></div>}
          </div>
          {(r.requirement_context || []).length > 0 && <><SectionLabel>Requirement Context</SectionLabel>{r.requirement_context.map((ctx, i) => <div key={i} style={{ marginTop: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{ctx.field}</div>{ctx.items.map((item, j) => <div key={j} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 2, borderLeft: `2px solid ${COLORS.border}` }}>• {item}</div>)}</div>)}</>}
          {(r.tags || []).length > 0 && <><SectionLabel>Tags</SectionLabel><div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>{r.tags.map((tag, i) => <span key={i} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}22` }}>{tag}</span>)}</div></>}
          {rels.length > 0 && <><SectionLabel>Relationships</SectionLabel>
            <div style={{ marginTop: 4 }}>
              {rels.map((rel, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < rels.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: rel.direction === "Downstream" ? COLORS.green : COLORS.purple }}>{rel.id}</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>
                <span style={{ fontSize: 12, color: COLORS.text, flex: 1 }}>{rel.name}</span>
                <Badge color={rel.direction === "Downstream" ? "green" : "purple"}>{rel.direction}</Badge>
                <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>{rel.group}</span>
              </div>)}
            </div>
          </>}
        </div>}

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

const EasterEggToast = ({ message, onDone }) => {
  const T = useTheme();
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 99999, padding: "12px 24px", borderRadius: 8,
      background: T.accent, color: T.bg, fontFamily: font,
      fontSize: 14, fontWeight: 700, boxShadow: `0 4px 24px ${T.accentGlow}`,
      animation: "toastIn 0.3s ease-out",
    }}>
      {message}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

const EasterEggResetButton = ({ onReset }) => {
  const T = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onReset}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 8,
        border: `1px solid ${T.accent}66`,
        background: hovered ? T.accent : T.surface,
        color: hovered ? T.bg : T.textBright,
        fontFamily: font,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 12px ${T.accentGlow}`,
        transition: "all 0.2s ease",
        // Flip it back upright if the UI is upside down
        ...(T._upsideDown ? { transform: "rotate(180deg)" } : {}),
      }}
    >
      <span style={{ fontSize: 16 }}>↩️</span>
      <span>Reset Theme</span>
      <span style={{
        fontSize: 10,
        fontFamily: mono,
        opacity: 0.7,
        padding: "2px 6px",
        background: hovered ? `${T.bg}33` : `${T.accent}22`,
        borderRadius: 4,
      }}>
        ESC
      </span>
    </button>
  );
};

const StarfieldCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const stars = [];
    const STAR_COUNT = 200;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize stars at random positions with depth
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width - canvas.width / 2,
        y: Math.random() * canvas.height - canvas.height / 2,
        z: Math.random() * canvas.width,
      });
    }

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 8, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (const star of stars) {
        star.z -= 1.5;
        if (star.z <= 0) {
          star.x = Math.random() * canvas.width - cx;
          star.y = Math.random() * canvas.height - cy;
          star.z = canvas.width;
        }
        const sx = (star.x / star.z) * cx + cx;
        const sy = (star.y / star.z) * cy + cy;
        const r = Math.max(0, (1 - star.z / canvas.width) * 2.5);
        const brightness = Math.max(0, (1 - star.z / canvas.width));
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};

const MatrixRainCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const fontSize = 14;
    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
    let columns, drops;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(1);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.fillStyle = "rgba(0, 8, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00FF41";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Bright head character
        ctx.fillStyle = "#AAFFAA";
        ctx.fillText(char, x, y);

        // Dimmer trail
        ctx.fillStyle = "#00FF41";
        if (y > fontSize) {
          const trailChar = chars[Math.floor(Math.random() * chars.length)];
          ctx.globalAlpha = 0.6;
          ctx.fillText(trailChar, x, y - fontSize);
          ctx.globalAlpha = 1.0;
        }

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);
}
// ── AURORA BOREALIS ──────────────────────────────────────────────────────────
// Renders slow-flowing translucent waves of green/purple/teal across the sky.

const AuroraCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const colors = [
        { r: 0, g: 232, b: 126, a: 0.08 },   // green
        { r: 100, g: 80, b: 255, a: 0.06 },   // purple
        { r: 0, g: 180, b: 220, a: 0.05 },    // teal
        { r: 0, g: 255, b: 180, a: 0.04 },    // mint
      ];

      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const yBase = H * 0.15 + i * H * 0.08;
        const speed = 0.0003 + i * 0.0001;
        const amplitude = H * 0.12 + i * 20;

        ctx.beginPath();
        ctx.moveTo(0, H);

        for (let x = 0; x <= W; x += 4) {
          const wave1 = Math.sin(x * 0.002 + time * speed * 6 + i * 1.5) * amplitude;
          const wave2 = Math.sin(x * 0.004 + time * speed * 4 + i * 0.8) * amplitude * 0.5;
          const wave3 = Math.sin(x * 0.001 + time * speed * 2) * amplitude * 0.3;
          const y = yBase + wave1 + wave2 + wave3;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(W, H);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, yBase - amplitude, 0, yBase + amplitude * 2);
        grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${c.a * 1.5})`);
        grad.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${c.a})`);
        grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      time++;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};


// ── VAPORWAVE GRID ───────────────────────────────────────────────────────────
// Renders a retro 80s sunset with a scrolling perspective grid.

const VaporwaveCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      const horizon = H * 0.45;

      // ── Sky gradient ──────────────────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#0E0620");
      sky.addColorStop(0.4, "#2D1050");
      sky.addColorStop(0.75, "#6A2080");
      sky.addColorStop(1, "#FF71CE55");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);

      // ── Sun ───────────────────────────────────────────────────────
      const sunX = W / 2;
      const sunY = horizon - 30;
      const sunR = 55;

      // Draw the full sun circle with gradient
      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.clip();

      const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
      sunGrad.addColorStop(0, "#FFDD44");
      sunGrad.addColorStop(0.4, "#FF8844");
      sunGrad.addColorStop(0.7, "#FF4488");
      sunGrad.addColorStop(1, "#CC22AA");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

      // Retro scanline gaps — thin transparent slices through the lower half
      ctx.globalCompositeOperation = "destination-out";
      const gapCount = 7;
      for (let i = 0; i < gapCount; i++) {
        const t = i / gapCount;
        const gapY = sunY + sunR * 0.05 + t * sunR * 0.9;
        const gapH = 1.5 + t * 2.5; // gaps get wider toward bottom
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(sunX - sunR, gapY, sunR * 2, gapH);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // Sun glow
      const glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, sunR * 2.5);
      glowGrad.addColorStop(0, "rgba(255,113,206,0.15)");
      glowGrad.addColorStop(0.5, "rgba(255,80,180,0.06)");
      glowGrad.addColorStop(1, "rgba(255,80,180,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // ── Ground plane ──────────────────────────────────────────────
      const ground = ctx.createLinearGradient(0, horizon, 0, H);
      ground.addColorStop(0, "#2A1050");
      ground.addColorStop(0.3, "#1A0A3A");
      ground.addColorStop(1, "#0E0620");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, W, H - horizon);

      // ── Horizontal grid lines — scroll toward viewer ──────────────
      const hLineCount = 30;
      const scrollSpeed = 0.004;
      const scrollPhase = (time * scrollSpeed) % 1;

      ctx.lineWidth = 1;
      for (let i = 0; i < hLineCount; i++) {
        // t goes 0→1 with scroll offset, quadratic spacing for perspective
        let t = ((i / hLineCount) + scrollPhase) % 1;
        const y = horizon + (H - horizon) * (t * t);
        const alpha = 0.05 + t * 0.35;

        ctx.strokeStyle = `rgba(255,113,206,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // ── Vertical grid lines — converge at horizon vanishing point ─
      const vLineCount = 28;
      ctx.lineWidth = 1;

      for (let i = -vLineCount / 2; i <= vLineCount / 2; i++) {
        const spread = (i / (vLineCount / 2));
        const bottomX = W / 2 + spread * W * 0.9;
        const topX = W / 2; // all lines converge to center at horizon
        const alpha = 0.06 + (1 - Math.abs(spread)) * 0.12;

        ctx.strokeStyle = `rgba(185,103,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(topX, horizon);
        ctx.lineTo(bottomX, H);
        ctx.stroke();
      }

      time++;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};


// ── FIREFLIES ────────────────────────────────────────────────────────────────
// Floating warm-toned particles that drift, pulse, and softly glow.

const FirefliesCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const particles = [];
    const COUNT = 45;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        radius: 1.5 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.02,
        hue: 40 + Math.random() * 30, // warm yellow-amber range
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase * 0.7) * 0.15;
        p.y += p.vy + Math.cos(p.phase * 0.5) * 0.1;

        // Wrap around
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        const glow = 0.3 + Math.sin(p.phase) * 0.3 + 0.2;
        const r = p.radius * (1 + Math.sin(p.phase) * 0.3);

        // Outer glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 8);
        grad.addColorStop(0, `hsla(${p.hue}, 90%, 65%, ${glow * 0.25})`);
        grad.addColorStop(0.3, `hsla(${p.hue}, 80%, 55%, ${glow * 0.08})`);
        grad.addColorStop(1, `hsla(${p.hue}, 70%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 8, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `hsla(${p.hue}, 95%, 80%, ${glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};

const FishTankCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    // ── Bubbles ─────────────────────────────────────────────────────
    const bubbles = [];
    const BUBBLE_COUNT = 35;
    const spawnBubble = (W, H) => ({
      x: Math.random() * W,
      y: H + Math.random() * 100,
      r: 2 + Math.random() * 6,
      speed: 0.4 + Math.random() * 0.8,
      wobbleAmp: 0.3 + Math.random() * 0.8,
      wobbleFreq: 0.02 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.15 + Math.random() * 0.25,
    });

    // ── Fish ────────────────────────────────────────────────────────
    const fish = [];
    const FISH_COUNT = 6;
    const spawnFish = (W, H) => {
      const goingRight = Math.random() > 0.5;
      return {
        x: goingRight ? -60 : W + 60,
        y: H * 0.15 + Math.random() * H * 0.55,
        speed: (0.5 + Math.random() * 1.0) * (goingRight ? 1 : -1),
        size: 12 + Math.random() * 18,
        bodyHue: [0, 30, 45, 180, 200, 280, 320][Math.floor(Math.random() * 7)],
        bodySat: 60 + Math.random() * 30,
        tailPhase: Math.random() * Math.PI * 2,
        tailSpeed: 0.08 + Math.random() * 0.06,
        wobbleY: Math.random() * Math.PI * 2,
      };
    };

    // ── Seaweed strands ─────────────────────────────────────────────
    const seaweed = [];
    const SEAWEED_COUNT = 10;
    const initSeaweed = (W, H) => {
      seaweed.length = 0;
      for (let i = 0; i < SEAWEED_COUNT; i++) {
        seaweed.push({
          x: W * 0.05 + Math.random() * W * 0.9,
          baseY: H,
          height: 60 + Math.random() * 100,
          segments: 6 + Math.floor(Math.random() * 4),
          phase: Math.random() * Math.PI * 2,
          hue: 120 + Math.random() * 40, // green range
          width: 3 + Math.random() * 4,
        });
      }
    };

    // ── Light rays ──────────────────────────────────────────────────
    const rays = [];
    const RAY_COUNT = 5;
    for (let i = 0; i < RAY_COUNT; i++) {
      rays.push({
        x: Math.random(),
        width: 0.03 + Math.random() * 0.06,
        alpha: 0.02 + Math.random() * 0.03,
        drift: 0.0002 + Math.random() * 0.0003,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Re-init position-dependent elements
      initSeaweed(canvas.width, canvas.height);
      bubbles.length = 0;
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const b = spawnBubble(canvas.width, canvas.height);
        b.y = Math.random() * canvas.height; // spread them out initially
        bubbles.push(b);
      }
      fish.length = 0;
      for (let i = 0; i < FISH_COUNT; i++) {
        const f = spawnFish(canvas.width, canvas.height);
        f.x = Math.random() * canvas.width; // spread initially
        fish.push(f);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Water gradient background tint ────────────────────────────
      const waterGrad = ctx.createLinearGradient(0, 0, 0, H);
      waterGrad.addColorStop(0, "rgba(10,60,120,0.06)");
      waterGrad.addColorStop(0.5, "rgba(4,20,40,0.03)");
      waterGrad.addColorStop(1, "rgba(4,15,30,0.08)");
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Light rays from surface ───────────────────────────────────
      for (const ray of rays) {
        const rx = (ray.x + Math.sin(time * ray.drift + ray.phase) * 0.05) * W;
        const rw = ray.width * W;
        const pulseAlpha = ray.alpha * (0.7 + Math.sin(time * 0.008 + ray.phase) * 0.3);

        const grad = ctx.createLinearGradient(0, 0, 0, H * 0.8);
        grad.addColorStop(0, `rgba(120,200,255,${pulseAlpha * 2})`);
        grad.addColorStop(0.3, `rgba(80,180,255,${pulseAlpha})`);
        grad.addColorStop(1, "rgba(40,100,200,0)");
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(rx - rw * 0.3, 0);
        ctx.lineTo(rx + rw * 0.3, 0);
        ctx.lineTo(rx + rw * 1.5, H * 0.8);
        ctx.lineTo(rx - rw * 1.5, H * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      // ── Seaweed ───────────────────────────────────────────────────
      for (const sw of seaweed) {
        const segH = sw.height / sw.segments;
        ctx.strokeStyle = `hsla(${sw.hue}, 55%, 28%, 0.6)`;
        ctx.lineWidth = sw.width;
        ctx.lineCap = "round";
        ctx.beginPath();

        let px = sw.x;
        let py = sw.baseY;
        ctx.moveTo(px, py);

        for (let seg = 1; seg <= sw.segments; seg++) {
          const t = seg / sw.segments;
          const sway = Math.sin(time * 0.012 + sw.phase + seg * 0.5) * (8 + t * 15);
          py = sw.baseY - seg * segH;
          px = sw.x + sway;
          ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Leaves at some segments
        for (let seg = 2; seg < sw.segments; seg += 2) {
          const t = seg / sw.segments;
          const sway = Math.sin(time * 0.012 + sw.phase + seg * 0.5) * (8 + t * 15);
          const lx = sw.x + sway;
          const ly = sw.baseY - seg * segH;
          const leafDir = seg % 4 === 0 ? 1 : -1;
          const leafLen = 8 + Math.random() * 4;

          ctx.strokeStyle = `hsla(${sw.hue + 10}, 50%, 32%, 0.4)`;
          ctx.lineWidth = sw.width * 0.6;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.quadraticCurveTo(
            lx + leafDir * leafLen,
            ly - leafLen * 0.3,
            lx + leafDir * leafLen * 1.3,
            ly + 4
          );
          ctx.stroke();
        }
      }

      // ── Fish ──────────────────────────────────────────────────────
      for (let fi = 0; fi < fish.length; fi++) {
        const f = fish[fi];
        f.x += f.speed;
        f.tailPhase += f.tailSpeed;
        f.wobbleY += 0.015;

        const fy = f.y + Math.sin(f.wobbleY) * 8;
        const dir = f.speed > 0 ? 1 : -1;
        const sz = f.size;
        const tailSwing = Math.sin(f.tailPhase) * sz * 0.35;

        ctx.save();
        ctx.translate(f.x, fy);
        ctx.scale(dir, 1);

        // Body
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 55%, 0.7)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Belly highlight
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat - 10}%, 75%, 0.3)`;
        ctx.beginPath();
        ctx.ellipse(sz * 0.1, sz * 0.1, sz * 0.6, sz * 0.2, 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 48%, 0.6)`;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.8, 0);
        ctx.lineTo(-sz * 1.4, -sz * 0.35 + tailSwing * 0.5);
        ctx.lineTo(-sz * 1.4, sz * 0.35 + tailSwing * 0.5);
        ctx.closePath();
        ctx.fill();

        // Dorsal fin
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 45%, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.1, -sz * 0.4);
        ctx.lineTo(sz * 0.3, -sz * 0.7);
        ctx.lineTo(sz * 0.5, -sz * 0.35);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(sz * 0.55, -sz * 0.08, sz * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.beginPath();
        ctx.arc(sz * 0.58, -sz * 0.08, sz * 0.06, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Respawn off-screen fish
        if ((f.speed > 0 && f.x > W + 80) || (f.speed < 0 && f.x < -80)) {
          fish[fi] = spawnFish(W, H);
        }
      }

      // ── Bubbles ──────────────────────────────────────────────────
      for (let bi = 0; bi < bubbles.length; bi++) {
        const b = bubbles[bi];
        b.y -= b.speed;
        b.phase += b.wobbleFreq;
        b.x += Math.sin(b.phase) * b.wobbleAmp;

        // Bubble body
        ctx.strokeStyle = `rgba(140,210,255,${b.opacity})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();

        // Highlight
        ctx.fillStyle = `rgba(200,240,255,${b.opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Soft glow
        const bGlow = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r * 3);
        bGlow.addColorStop(0, `rgba(80,180,255,${b.opacity * 0.15})`);
        bGlow.addColorStop(1, "rgba(80,180,255,0)");
        ctx.fillStyle = bGlow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Respawn at bottom when off top
        if (b.y < -b.r * 4) {
          bubbles[bi] = spawnBubble(W, H);
        }
      }

      // ── Surface caustic shimmer at top ────────────────────────────
      const causticH = H * 0.04;
      for (let x = 0; x < W; x += 3) {
        const wave = Math.sin(x * 0.02 + time * 0.015) * 0.5
                   + Math.sin(x * 0.035 + time * 0.008) * 0.3;
        const alpha = 0.03 + wave * 0.025;
        ctx.fillStyle = `rgba(150,220,255,${Math.max(0, alpha)})`;
        ctx.fillRect(x, 0, 3, causticH * (0.6 + wave * 0.4));
      }

      time++;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};

// ─── TEST CASES ─────────────────────────────────────────────────────────────

const TestCaseView = ({ requirements, testCases, kbEntries, refresh }) => {
  const COLORS = useTheme();
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [focuses, setFocuses] = useState(new Set());
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
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  const [htmlImportResult, setHtmlImportResult] = useState(null);
  const [htmlImporting, setHtmlImporting] = useState(false);
  const [htmlImportError, setHtmlImportError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [refiningTcId, setRefiningTcId] = useState(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [refineCopyState, setRefineCopyState] = useState("idle");
  const [tcSelectMode, setTcSelectMode] = useState(false);
  const [selectedTcIds, setSelectedTcIds] = useState(new Set());
  const [exampleTcId, setExampleTcId] = useState(null);

  useEffect(() => { api.getExampleTc().then(d => { if (d.example_tc) setExampleTcId(d.example_tc.tc_id); }).catch(() => {}); }, []);

  const visibleTcs = viewMode === "session" && sessionTcIds ? testCases.filter(tc => sessionTcIds.includes(tc.tc_id)) : testCases;
  const isUnreviewed = tc => tc.status === "Draft";

  const toggleFocus = (f) => setFocuses(prev => { const next = new Set(prev); next.has(f) ? next.delete(f) : next.add(f); return next; });
  const focusArray = [...focuses];

  const generate = async () => {
    if (!selectedReqId) return;
    setGenerating(true); setApiError(null);
    try {
      const newTcs = await api.generateTestCases(selectedReqId, depth, focusArray);
      setSessionTcIds(newTcs.map(tc => tc.tc_id));
      setViewMode("session");
      refresh();
    } catch (err) { setApiError(err.message); }
    finally { setGenerating(false); }
  };

  const updateStatus = async (tcId, status) => {
    try { await api.updateTcStatus(tcId, status); refresh(); } catch (err) { console.error(err); }
  };

  const refineTestCase = async (tcId) => {
    if (!refineFeedback.trim()) return;
    setRefineLoading(true); setRefineError("");
    try {
      await api.refineTestCase(tcId, refineFeedback.trim());
      setRefiningTcId(null); setRefineFeedback(""); refresh();
    } catch (err) { setRefineError(err.message); }
    finally { setRefineLoading(false); }
  };

  const copyRefinePrompt = async (tcId) => {
    if (!refineFeedback.trim()) return;
    setRefineCopyState("copying");
    try {
      const data = await api.refinePrompt(tcId, refineFeedback.trim());
      await navigator.clipboard.writeText(data.prompt);
      setRefineCopyState("copied");
      setTimeout(() => setRefineCopyState("idle"), 2000);
    } catch (err) { setRefineCopyState("error"); setTimeout(() => setRefineCopyState("idle"), 2000); }
  };

  const copyPrompt = async () => {
    if (!selectedReqId) return;
    setCopyState("copying");
    try {
      const data = await api.getPrompt(selectedReqId, depth, focusArray);
      await navigator.clipboard.writeText(data.prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) { setCopyState("error"); setTimeout(() => setCopyState("idle"), 2000); }
  };

  const doImport = async () => {
    if (!importJson.trim() || !selectedReqId) return;
    setImportError(""); setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const result = await api.importTestCases(selectedReqId, depth, parsed);
      setSessionTcIds(result.map(tc => tc.tc_id));
      setViewMode("session");
      setShowImport(false); setImportJson("");
      refresh();
    } catch (err) { setImportError(err.message); }
    finally { setImporting(false); }
  };

  const clearAll = async () => {
    if (!window.confirm(`Delete all ${testCases.length} test case${testCases.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setClearing(true);
    try { await api.clearTestCases(); setSessionTcIds(null); setViewMode("library"); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
    finally { setClearing(false); }
  };

  const rejectedCount = testCases.filter(tc => tc.status === "Rejected").length;
  const clearRejected = async () => {
    if (!window.confirm(`Delete ${rejectedCount} rejected test case${rejectedCount !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try { await api.clearRejectedTestCases(); refresh(); }
    catch (err) { alert(`Failed: ${err.message}`); }
  };

  const toggleTcSelect = (tcId) => setSelectedTcIds(prev => { const next = new Set(prev); next.has(tcId) ? next.delete(tcId) : next.add(tcId); return next; });
  const selectAllTcs = () => setSelectedTcIds(prev => prev.size === visibleTcs.length ? new Set() : new Set(visibleTcs.map(tc => tc.tc_id)));
  const exportSelected = () => { api.exportTestCasesXlsx([...selectedTcIds]); setTcSelectMode(false); setSelectedTcIds(new Set()); };

  const doDocImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setHtmlImportError(""); setHtmlImportResult(null); setHtmlImporting(true);
    try {
      const result = await api.importTestCasesDoc(file);
      setHtmlImportResult(result);
      refresh();
    } catch (err) { setHtmlImportError(err.message); }
    finally { setHtmlImporting(false); e.target.value = ""; }
  };

  return <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Generation</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>{testCases.length} test cases{tcSelectMode && selectedTcIds.size > 0 ? ` · ${selectedTcIds.size} selected` : ""}</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" small onClick={() => { setShowHtmlImport(v => !v); setHtmlImportResult(null); setHtmlImportError(""); }}>Import from JAMA DOC</Button>
        {!tcSelectMode && <Button variant="secondary" small onClick={() => api.exportTestCasesXlsx()} disabled={testCases.length === 0}>Export XLSX</Button>}
        {!tcSelectMode && testCases.length > 0 && <Button variant="secondary" small onClick={() => { setTcSelectMode(true); setSelectedTcIds(new Set()); }}>Select</Button>}
        {tcSelectMode && <>
          <Button variant="secondary" small onClick={selectAllTcs}>{selectedTcIds.size === visibleTcs.length ? "Deselect All" : "Select All"}</Button>
          <Button variant="primary" small onClick={exportSelected} disabled={selectedTcIds.size === 0}>Export Selected ({selectedTcIds.size})</Button>
          <Button variant="ghost" small onClick={() => { setTcSelectMode(false); setSelectedTcIds(new Set()); }}>Cancel</Button>
        </>}
        {rejectedCount > 0 && <Button variant="danger" small onClick={clearRejected}>Delete Rejected ({rejectedCount})</Button>}
        <Button variant="danger" small onClick={clearAll} disabled={testCases.length === 0 || clearing}>{clearing ? "Clearing..." : "Clear All"}</Button>
      </div>
    </div>
    {showHtmlImport && <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.accent}33` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Import JAMA Test Cases</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Upload a .docx (Verification Test Cases) or .doc (All Item Details) export from JAMA. Test cases will be imported with their Project ID, steps, description, and upstream relationships. Duplicates are skipped.</div>
      <label style={{ display: "inline-block", cursor: htmlImporting ? "not-allowed" : "pointer" }}>
        <input type="file" accept=".doc,.docx" onChange={doDocImport} disabled={htmlImporting} style={{ display: "none" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: mono, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, cursor: "pointer", opacity: htmlImporting ? 0.5 : 1 }}>
          {htmlImporting ? "Importing..." : "Choose DOC/DOCX file"}
        </span>
      </label>
      {htmlImportError && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red, fontFamily: mono }}>{htmlImportError}</div>}
      {htmlImportResult && <div style={{ marginTop: 10, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>
        Imported <strong>{htmlImportResult.imported}</strong> test case{htmlImportResult.imported !== 1 ? "s" : ""}{htmlImportResult.skipped > 0 ? ` · ${htmlImportResult.skipped} duplicate${htmlImportResult.skipped !== 1 ? "s" : ""} skipped` : ""}.
      </div>}
    </Card>}
    <Card glow style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="Requirement" value={selectedReqId} onChange={setSelectedReqId} style={{ minWidth: 280 }} options={[{ value: "", label: "— Select —" }, ...requirements.map(r => ({ value: r.req_id, label: `${r.req_id} — ${r.title}` }))]} />
        <Select label="Depth" value={depth} onChange={setDepth} style={{ minWidth: 180 }} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
        <Button onClick={generate} disabled={!selectedReqId || generating}>{generating ? "Generating..." : "Generate Drafts"}</Button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>Test Focus</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "safety_critical", label: "Safety Critical" },
            { key: "ui_ux_validation", label: "UI/UX Validation" },
            { key: "boundary_analysis", label: "Boundary Analysis" },
            { key: "error_recovery", label: "Error Recovery" },
            { key: "regression", label: "Regression" },
          ].map(f => {
            const active = focuses.has(f.key);
            return <span key={f.key} onClick={() => toggleFocus(f.key)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, cursor: "pointer", userSelect: "none",
              background: active ? COLORS.accentDim : COLORS.surface,
              color: active ? COLORS.accent : COLORS.textMuted,
              border: `1px solid ${active ? COLORS.accent + "66" : COLORS.border}`,
            }}>{f.label}</span>;
          })}
        </div>
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
            {copyState === "copying" ? "Fetching..." : copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy Prompt"}
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
          placeholder={'[\n  {\n    "title": "...",\n    "type": "Happy Path",\n    "description": { "objective": "...", "scope": "...", "assumptions": [] },\n    "setup": { "preconditions": [], "environment": [], "equipment": [], "testData": [] },\n    "steps": [{ "step": "...", "expectedResult": "..." }],\n    "reqAttribute": "..."\n  }\n]'}
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
      {visibleTcs.map(tc => <Card key={tc.tc_id} style={{ marginBottom: 10, border: tcSelectMode && selectedTcIds.has(tc.tc_id) ? `1px solid ${COLORS.accent}` : undefined }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => tcSelectMode ? toggleTcSelect(tc.tc_id) : setExpandedTc(expandedTc === tc.tc_id ? null : tc.tc_id)}>
          {tcSelectMode && <input type="checkbox" checked={selectedTcIds.has(tc.tc_id)} onChange={() => toggleTcSelect(tc.tc_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>{tc.tc_id}</span>
          <div style={{ flex: 1, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, display: "flex", alignItems: "center", gap: 8 }}>{tc.title}{isUnreviewed(tc) && <span style={{ fontSize: 9, fontFamily: mono, color: COLORS.amber, background: COLORS.amberDim, padding: "1px 6px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>Draft</span>}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              {tc.project_id && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Project ID: <span style={{ color: COLORS.accent }}>{tc.project_id}</span></span>}
              {tc.upstream_relationship && tc.upstream_relationship.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>Upstream: {tc.upstream_relationship.map(u => <span key={u.id} style={{ color: COLORS.purple, marginRight: 4 }}>{u.id}</span>)}</span>}
              {(tc.linked_req_ids || []).length > 0 && <><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>Traces to:</span>{(tc.linked_req_ids || []).map(rid => <ReqIdTag key={rid} id={rid} />)}</>}
              <Badge color={tc.type === "Happy Path" ? "green" : tc.type === "Negative" ? "red" : tc.type === "Boundary" ? "amber" : "purple"}>{tc.type}</Badge>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
            <Button small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}</Button>
            <Button small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); updateStatus(tc.tc_id, "Rejected"); }}>✗</Button>
            <Badge color={tc.status === "Reviewed" ? "green" : tc.status === "Rejected" ? "red" : "amber"} style={{ marginLeft: 4 }}>{tc.status}</Badge>
          </div>
        </div>
        {expandedTc === tc.tc_id && (() => {
          let desc = null, setup = null;
          try { desc = typeof tc.description === "string" && tc.description.startsWith("{") ? JSON.parse(tc.description) : null; } catch {}
          try { setup = typeof tc.preconditions === "string" && tc.preconditions.startsWith("{") ? JSON.parse(tc.preconditions) : null; } catch {}
          const SectionLabel = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 14 }}>{children}</div>;
          const BulletList = ({ items }) => items && items.length > 0 ? <ul style={{ margin: "0 0 4px 0", paddingLeft: 18 }}>{items.map((item, i) => <li key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{item}</li>)}</ul> : null;
          return <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
            {isUnreviewed(tc) && <div style={{ marginBottom: 14, padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, fontSize: 10, color: COLORS.amber, fontFamily: mono }}>DRAFT — Review required</div>}
            {desc ? <>
              <SectionLabel>Description</SectionLabel>
              {desc.objective && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Objective: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.objective}</span></div>}
              {desc.scope && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Scope: </span><span style={{ fontSize: 12, color: COLORS.text }}>{desc.scope}</span></div>}
              {desc.assumptions && desc.assumptions.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Assumptions:</span><BulletList items={desc.assumptions} /></>}
            </> : tc.description ? <><SectionLabel>Description</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.description}</div></> : null}
            {setup ? <>
              <SectionLabel>Setup</SectionLabel>
              {setup.preconditions && setup.preconditions.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Preconditions:</span><BulletList items={setup.preconditions} /></>}
              {setup.environment && setup.environment.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Environment:</span><BulletList items={setup.environment} /></>}
              {setup.equipment && setup.equipment.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Equipment:</span><BulletList items={setup.equipment} /></>}
              {setup.testData && setup.testData.length > 0 && <><span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>Test Data:</span><BulletList items={setup.testData} /></>}
            </> : tc.preconditions ? <><SectionLabel>Setup</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, borderLeft: `2px solid ${COLORS.border}` }}>{tc.preconditions}</div></> : null}
            <SectionLabel>Test Steps</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>#</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Step Action</th><th style={{ textAlign: "left", padding: "6px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Expected Result</th></tr></thead>
              <tbody>{(tc.steps || []).map((s, i) => {
                const hasHtml = c => typeof c === "string" && c.includes("<img");
                const renderCell = (content, color) => hasHtml(content)
                  ? <span style={{ color }} dangerouslySetInnerHTML={{ __html: content }} />
                  : <span style={{ color }}>{content}</span>;
                return <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "8px 10px", color: COLORS.textMuted, fontFamily: mono, verticalAlign: "top" }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.step, COLORS.text)}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top" }}>{renderCell(s.expectedResult, COLORS.green)}</td>
                </tr>;
              })}</tbody>
            </table>
            {tc.upstream_relationship && tc.upstream_relationship.length > 0 && <>
              <SectionLabel>Upstream Relationships</SectionLabel>
              {tc.upstream_relationship.map((u, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${COLORS.accent}44` }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: COLORS.accent }}>{u.id}</span>
                <span style={{ color: COLORS.textMuted, margin: "0 6px" }}>—</span>
                <span>{u.name}</span>
              </div>)}
            </>}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
              {refiningTcId === tc.tc_id ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionLabel>Refine Test Case</SectionLabel>
                <textarea
                  value={refineFeedback}
                  onChange={e => setRefineFeedback(e.target.value)}
                  placeholder="Describe improvements — e.g. 'Add a step to verify error message displays correctly' or 'Include boundary test for max input length'"
                  style={{ width: "100%", minHeight: 80, padding: 10, fontSize: 12, fontFamily: mono, background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, resize: "vertical", boxSizing: "border-box" }}
                />
                {refineError && <div style={{ fontSize: 11, color: COLORS.red }}>{refineError}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Button small variant="primary" disabled={refineLoading || !refineFeedback.trim()} onClick={e => { e.stopPropagation(); refineTestCase(tc.tc_id); }}>
                    {refineLoading ? "Refining..." : "Submit Refinement"}
                  </Button>
                  <Button small variant="secondary" disabled={refineLoading || !refineFeedback.trim() || refineCopyState === "copying"} onClick={e => { e.stopPropagation(); copyRefinePrompt(tc.tc_id); }}>
                    {refineCopyState === "copying" ? "Copying..." : refineCopyState === "copied" ? "Copied!" : refineCopyState === "error" ? "Failed" : "Copy Prompt"}
                  </Button>
                  <Button small variant="ghost" disabled={refineLoading} onClick={e => { e.stopPropagation(); setRefiningTcId(null); setRefineFeedback(""); setRefineError(""); setRefineCopyState("idle"); }}>Cancel</Button>
                </div>
              </div> : <div style={{ display: "flex", gap: 8 }}>
                <Button small variant="secondary" onClick={e => { e.stopPropagation(); setRefiningTcId(tc.tc_id); setRefineFeedback(""); setRefineError(""); setRefineCopyState("idle"); }}>Refine</Button>
                <Button small variant="ghost" onClick={async e => { e.stopPropagation(); try { await api.setExampleTc(tc.tc_id); setExampleTcId(tc.tc_id); } catch {} }}>
                  {exampleTcId === tc.tc_id ? "Example TC" : "Use as Example"}
                </Button>
              </div>}
            </div>
          </div>;
        })()}
      </Card>)}
    </>}
  </div>
  </div>;
};

// ─── TRACEABILITY MATRIX ────────────────────────────────────────────────────

const TraceabilityView = ({ requirements, testCases }) => { const COLORS = useTheme(); return <div>
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

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

const KbView = ({ kbEntries, requirements, refresh }) => {
  const COLORS = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] });
  const [pendingImages, setPendingImages] = useState([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingTags, setEditingTags] = useState(null); // kb_id being edited
  const [tagInput, setTagInput] = useState("");
  const [editingReqs, setEditingReqs] = useState(null); // kb_id for related reqs editing
  const [editingDesc, setEditingDesc] = useState(null); // { kbId, index }
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descRegenerating, setDescRegenerating] = useState(null); // "kbId-index"
  const [expandedDescs, setExpandedDescs] = useState(new Set()); // "kbId-index" keys

  const save = async () => {
    setError("");
    try {
      const result = await api.createKbEntry({ title: form.title, type: form.type, content: form.content, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), related_reqs: form.related_reqs });
      if (pendingImages.length > 0 && result.kb_id) {
        await api.uploadKbImages(result.kb_id, pendingImages);
      }
      setShowAdd(false); setForm({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] }); setPendingImages([]); refresh();
    } catch (err) { setError(err.message); }
  };

  const handleImageUpload = async (kbId, files) => {
    setUploading(kbId);
    try {
      await api.uploadKbImages(kbId, files);
      refresh();
    } catch (err) { setError(err.message); }
    setUploading(null);
  };

  const handleDeleteImage = async (kbId, index) => {
    try {
      await api.deleteKbImage(kbId, index);
      refresh();
    } catch (err) { setError(err.message); }
  };

  const toggleSelect = (kbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId); else next.add(kbId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === kbEntries.length) setSelected(new Set());
    else setSelected(new Set(kbEntries.map(e => e.kb_id)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmDelete(false);
  };

  const handleDeleteSelected = async () => {
    try {
      await api.deleteKbEntries([...selected]);
      exitSelectMode();
      refresh();
    } catch (err) { setError(err.message); }
  };

  const addTag = async (kbId, tag) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry || !tag.trim() || entry.tags.includes(tag.trim())) return;
    try {
      await api.updateKbEntry(kbId, { tags: [...entry.tags, tag.trim()] });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const removeTag = async (kbId, tag) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry) return;
    try {
      await api.updateKbEntry(kbId, { tags: entry.tags.filter(t => t !== tag) });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const addRelatedReq = async (kbId, reqId) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry || (entry.related_reqs || []).includes(reqId)) return;
    try {
      await api.updateKbEntry(kbId, { related_reqs: [...(entry.related_reqs || []), reqId] });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const saveImageDescription = async (kbId, index) => {
    setDescSaving(true);
    try {
      await api.updateImageDescription(kbId, index, descDraft);
      setEditingDesc(null); setDescDraft("");
      refresh();
    } catch (err) { setError(err.message); }
    setDescSaving(false);
  };

  const regenerateAllDescriptions = async (kbId) => {
    setDescRegenerating(kbId);
    try {
      await api.regenerateAllImageDescriptions(kbId);
      refresh();
    } catch (err) { setError(err.message); }
    setDescRegenerating(null);
  };

  const removeRelatedReq = async (kbId, reqId) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry) return;
    try {
      await api.updateKbEntry(kbId, { related_reqs: (entry.related_reqs || []).filter(r => r !== reqId) });
      refresh();
    } catch (err) { setError(err.message); }
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Knowledge Base</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>{kbEntries.length} entries{selectMode && selected.size > 0 ? ` · ${selected.size} selected` : ""}</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        {!selectMode && kbEntries.length > 0 && <Button variant="secondary" small onClick={() => setSelectMode(true)}>Select</Button>}
        {selectMode && <>
          <Button variant="secondary" small onClick={selectAll}>{selected.size === kbEntries.length ? "Deselect All" : "Select All"}</Button>
          {selected.size > 0 && !confirmDelete && <Button variant="secondary" small onClick={() => setConfirmDelete(true)} style={{ color: COLORS.red || "#ef4444" }}>Delete ({selected.size})</Button>}
          {confirmDelete && <>
            <Button variant="secondary" small onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button small onClick={handleDeleteSelected} style={{ background: COLORS.red || "#ef4444" }}>Confirm Delete</Button>
          </>}
          <Button variant="secondary" small onClick={exitSelectMode}>Done</Button>
        </>}
        <Button onClick={() => setShowAdd(!showAdd)}>+ Add Entry</Button>
      </div>
    </div>
    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Select label="Type" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} style={{ marginBottom: 12 }} options={["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "UI Reference"].map(t => ({ value: t, label: t }))} />
      <Input label="Content" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} textarea style={{ marginBottom: 12 }} />
      <Input label="Tags (comma-separated, e.g. modules, keywords)" value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} mono style={{ marginBottom: 14 }} />
      {(requirements || []).length > 0 && <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Related Requirements</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          {form.related_reqs.map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
            {r}
            <button onClick={() => setForm(p => ({ ...p, related_reqs: p.related_reqs.filter(x => x !== r) }))} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }}>&times;</button>
          </span>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 80, overflowY: "auto" }}>
          {(requirements || []).filter(r => !form.related_reqs.includes(r.req_id)).map(r =>
            <button key={r.req_id} onClick={() => setForm(p => ({ ...p, related_reqs: [...p.related_reqs, r.req_id] }))} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.purple, cursor: "pointer", whiteSpace: "nowrap" }} title={r.title}>{r.req_id}</button>
          )}
        </div>
      </div>}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Images</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {pendingImages.map((f, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: mono, padding: "3px 8px", borderRadius: 4, background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
            <img src={URL.createObjectURL(f)} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 3 }} />
            {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
            <button onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, lineHeight: 1 }}>&times;</button>
          </span>)}
          <label style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>
            + Add Images
            <input type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={ev => { if (ev.target.files.length) setPendingImages(prev => [...prev, ...Array.from(ev.target.files)]); ev.target.value = ""; }}
            />
          </label>
        </div>
      </div>
      <ErrorBanner msg={error} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => { setShowAdd(false); setPendingImages([]); }}>Cancel</Button><Button onClick={save} disabled={!form.title || !form.content}>Save</Button></div>
    </Card>}
    <ErrorBanner msg={error && !showAdd ? error : ""} />
    {kbEntries.map(e => <Card key={e.kb_id} style={{ marginBottom: 10, border: selectMode && selected.has(e.kb_id) ? `1px solid ${COLORS.accent}` : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {selectMode && <input type="checkbox" checked={selected.has(e.kb_id)} onChange={() => toggleSelect(e.kb_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 8px", borderRadius: 4 }}>{e.kb_id}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>{e.title}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>{e.content}</div>
          {(e.images || []).length > 0 && <div style={{ marginTop: 10 }}>
            {e.images.map((img, i) => {
              const isEditing = editingDesc && editingDesc.kbId === e.kb_id && editingDesc.index === i;
              const regenKey = `${e.kb_id}-${i}`;
              return <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: 8, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={`/api/kb/${e.kb_id}/images/${i}/file`}
                    alt={img.name}
                    style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                    onClick={() => setPreviewImg({ kbId: e.kb_id, index: i, name: img.name })}
                    title={img.name}
                  />
                  <button
                    onClick={() => handleDeleteImage(e.kb_id, i)}
                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: COLORS.red || "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: "18px", padding: 0, fontWeight: 700 }}
                    title="Remove image"
                  >&times;</button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, marginBottom: 4 }}>{img.name}</div>
                  {isEditing ? <div>
                    <textarea
                      value={descDraft}
                      onChange={ev => setDescDraft(ev.target.value)}
                      style={{ width: "100%", minHeight: 80, fontSize: 11, fontFamily: mono, padding: 8, background: COLORS.surfaceRaised, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4, resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <Button small onClick={() => saveImageDescription(e.kb_id, i)} disabled={descSaving}>{descSaving ? "Saving..." : "Save"}</Button>
                      <Button small variant="ghost" onClick={() => { setEditingDesc(null); setDescDraft(""); }}>Cancel</Button>
                    </div>
                  </div> : <div>
                    {img.description ? <>
                      <div onClick={() => setExpandedDescs(prev => { const next = new Set(prev); next.has(regenKey) ? next.delete(regenKey) : next.add(regenKey); return next; })} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600, userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ display: "inline-block", transform: expandedDescs.has(regenKey) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9654;</span>
                        Description
                      </div>
                      {expandedDescs.has(regenKey) && <div style={{ fontSize: 11, color: COLORS.text, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 4, paddingLeft: 14 }}>{img.description}</div>}
                    </> : <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic" }}>No description generated</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <span onClick={() => { setEditingDesc({ kbId: e.kb_id, index: i }); setDescDraft(img.description || ""); }} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>Edit</span>
                    </div>
                  </div>}
                </div>
              </div>;
            })}
          </div>}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge color="purple">{e.type}</Badge>
            {(e.tags || []).map(t => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.accent, background: COLORS.accentDim || (COLORS.accent + "22"), padding: "2px 6px", borderRadius: 4 }}>
              {t}
              {editingTags === e.kb_id && <button onClick={() => removeTag(e.kb_id, t)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Remove ${t}`}>&times;</button>}
            </span>)}
            <span onClick={() => { setEditingTags(editingTags === e.kb_id ? null : e.kb_id); setTagInput(""); }} style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>{editingTags === e.kb_id ? "Done" : "+ Tag"}</span>
            <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.textMuted }}>|</span>
            {(e.related_reqs || []).map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
              {r}
              {editingReqs === e.kb_id && <button onClick={() => removeRelatedReq(e.kb_id, r)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Unlink ${r}`}>&times;</button>}
            </span>)}
            <span onClick={() => setEditingReqs(editingReqs === e.kb_id ? null : e.kb_id)} style={{ fontSize: 11, color: COLORS.purple, cursor: "pointer", fontWeight: 600 }}>{editingReqs === e.kb_id ? "Done" : "+ Req"}</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>Used {e.usage_count || 0}×</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>| {(e.images || []).length} image(s)</span>
            <label style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", marginLeft: 8, fontWeight: 600 }}>
              {uploading === e.kb_id ? "Uploading..." : "+ Add Images"}
              <input type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={ev => { if (ev.target.files.length) handleImageUpload(e.kb_id, ev.target.files); ev.target.value = ""; }}
                disabled={uploading === e.kb_id}
              />
            </label>
            {(e.images || []).length > 0 && <span
              onClick={() => descRegenerating !== e.kb_id && regenerateAllDescriptions(e.kb_id)}
              style={{ fontSize: 11, color: COLORS.purple, cursor: descRegenerating === e.kb_id ? "not-allowed" : "pointer", marginLeft: 8, fontWeight: 600, opacity: descRegenerating === e.kb_id ? 0.5 : 1 }}
            >
              {descRegenerating === e.kb_id ? "Generating Descriptions..." : "Generate Descriptions"}
            </span>}
          </div>
          {editingTags === e.kb_id && <div style={{ marginTop: 8, padding: 10, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>Tags</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text" value={tagInput} onChange={ev => setTagInput(ev.target.value)}
                onKeyDown={ev => { if (ev.key === "Enter" && tagInput.trim()) { addTag(e.kb_id, tagInput); setTagInput(""); } }}
                placeholder="Type a tag and press Enter"
                style={{ flex: 1, fontSize: 12, fontFamily: mono, padding: "4px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.text, outline: "none" }}
              />
              <button onClick={() => { if (tagInput.trim()) { addTag(e.kb_id, tagInput); setTagInput(""); } }} disabled={!tagInput.trim()} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "none", background: COLORS.accent, color: "#fff", cursor: tagInput.trim() ? "pointer" : "default", opacity: tagInput.trim() ? 1 : 0.5 }}>Add</button>
            </div>
          </div>}
          {editingReqs === e.kb_id && <div style={{ marginTop: 8, padding: 10, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>Related Requirements</div>
            {(requirements || []).length > 0 ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 100, overflowY: "auto" }}>
              {(requirements || []).filter(r => !(e.related_reqs || []).includes(r.req_id)).map(r =>
                <button key={r.req_id} onClick={() => addRelatedReq(e.kb_id, r.req_id)} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.purple, cursor: "pointer", whiteSpace: "nowrap" }} title={r.title}>{r.req_id}</button>
              )}
              {(requirements || []).filter(r => !(e.related_reqs || []).includes(r.req_id)).length === 0 && <span style={{ fontSize: 11, color: COLORS.textMuted }}>All requirements already linked</span>}
            </div> : <span style={{ fontSize: 11, color: COLORS.textMuted }}>No requirements available</span>}
          </div>}
        </div>
      </div>
    </Card>)}
    {previewImg && <div onClick={() => setPreviewImg(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, cursor: "pointer" }}>
      <div style={{ maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={`/api/kb/${previewImg.kbId}/images/${previewImg.index}/file`} alt={previewImg.name} style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }} />
        <div style={{ textAlign: "center", color: "#fff", marginTop: 8, fontSize: 13 }}>{previewImg.name}</div>
      </div>
    </div>}
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

const DeferredView = () => { const COLORS = useTheme(); return <div>
  <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Deferred to v2</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>FRD v1.2 Section 9</p></div>
  {[{ title: "Adaptive Learning Engine", sub: "AL-001 – AL-008", desc: "Descoped from v1 to keep the tool focused on assistive generation." },
    { title: "Confluence KB Import", sub: "KB-007", desc: "Manual entry only in v1. v2 implements Confluence REST API import." },
    { title: "SSO / External Identity", sub: "UM-xxx", desc: "v1 uses local accounts. v2 adds SAML/OAuth integration." }
  ].map((item, i) => <Card key={i} style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Badge color="amber">DEFERRED</Badge><span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>{item.title}</span><span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{item.sub}</span></div>
    <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.7 }}>{item.desc}</div>
  </Card>)}
</div>; };

// ─── SETTINGS & MCP ─────────────────────────────────────────────────────────

const McpTokensView = ({ currentUser }) => {
  const COLORS = useTheme();
  const [tokens, setTokens] = useState([]);
  const [tokenName, setTokenName] = useState("");
  const [bridgePath, setBridgePath] = useState("");
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState("desktop");
  const [installOs, setInstallOs] = useState("windows");
  const [showGuide, setShowGuide] = useState(false);

  const serverUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:3000";

  const loadTokens = useCallback(async () => {
    try {
      setTokens(await api.getMcpTokens());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  // Auto-detect OS for install command tabs
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("mac")) {
        setInstallOs("mac");
      } else if (ua.includes("linux")) {
        setInstallOs("linux");
      } else {
        setInstallOs("windows");
      }
    }
  }, []);

  const createToken = async () => {
    setError(""); setCopied(false); setCopiedCmd(false);
    if (!tokenName.trim()) { setError("Token name is required."); return; }
    if (!bridgePath.trim()) { setError("Path to mcp-bridge.mjs is required. Download the file first, then enter the full path to where you saved it."); return; }
    try {
      const data = await api.createMcpToken(tokenName.trim());
      setNewToken({ ...data, bridgePath: bridgePath.trim() });
      setTokenName("");
      // Keep bridgePath so the user can reuse it for another token
      loadTokens();
    } catch (err) { setError(err.message); }
  };

  const deleteToken = async (id) => {
    try { await api.deleteMcpToken(id); loadTokens(); if (newToken) setNewToken(null); }
    catch (err) { console.error(err); }
  };

  const copyToken = () => {
    if (newToken?.token) {
      navigator.clipboard.writeText(newToken.token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      });
    }
  };

  // ── Config generation — uses the bridgePath captured at creation time ──

  const getDesktopConfigJson = (token, path) => {
    return JSON.stringify({
      mcpServers: {
        testforge: {
          command: "node",
          args: [path || bridgePath],
          env: {
            MCP_TOKEN: token || "tfmcp_your_token_here",
            TESTFORGE_URL: serverUrl
          }
        }
      }
    }, null, 2);
  };

  const getFullDesktopConfig = (token, path) => {
    return JSON.stringify({
      preferences: {
        coworkScheduledTasksEnabled: true,
        ccdScheduledTasksEnabled: true,
        sidebarMode: "chat",
        coworkWebSearchEnabled: true
      },
      mcpServers: {
        testforge: {
          command: "node",
          args: [path || bridgePath],
          env: {
            MCP_TOKEN: token || "tfmcp_your_token_here",
            TESTFORGE_URL: serverUrl
          }
        }
      }
    }, null, 2);
  };

  const downloadConfig = () => {
    if (!newToken?.token) return;
    const json = getFullDesktopConfig(newToken.token, newToken.bridgePath);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude_desktop_config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getInstallCommand = (token, path) => {
    const configJson = getFullDesktopConfig(token || "tfmcp_your_token_here", path);

    if (installOs === "windows") {
      return `# PowerShell — Run as your user (not admin)
# Detect Claude config path (Windows Store vs standard install)
$storePath = Get-ChildItem "$env:LOCALAPPDATA\\Packages\\Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($storePath) {
  $configDir = Join-Path $storePath.FullName "LocalCache\\Roaming\\Claude"
} else {
  $configDir = "$env:APPDATA\\Claude"
}
if (!(Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
@'
${configJson}
'@ | Out-File "$configDir\\claude_desktop_config.json" -Encoding utf8
Write-Host "Config saved to $configDir\\claude_desktop_config.json" -ForegroundColor Green
Write-Host "Restart Claude Desktop to activate." -ForegroundColor Yellow`;
    } else if (installOs === "mac") {
      return `# Terminal (macOS)
CONFIG_DIR="$HOME/Library/Application Support/Claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    } else {
      return `# Terminal (Linux)
CONFIG_DIR="$HOME/.config/claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    }
  };

  const copyInstallCommand = () => {
    if (!newToken?.token) return;
    navigator.clipboard.writeText(getInstallCommand(newToken.token, newToken.bridgePath)).then(() => {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 3000);
    });
  };

  // Config snippets use the path captured at token creation time
  const configSnippets = {
    desktop: getDesktopConfigJson(newToken?.token, newToken?.bridgePath),
    code: `# Claude Code — run in terminal
claude mcp add testforge \\
  --transport sse \\
  --url ${serverUrl}/mcp/sse \\
  --header "Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}"`,
    web: `URL:     ${serverUrl}/mcp/sse
Header:  Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}

In Claude.ai → Settings → Connected Apps → Add MCP Server
Paste the URL above and add the Authorization header.`,
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Settings & MCP Integration</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>Connect Claude Desktop, Claude Code, or Claude Web to TestForge</p>
      </div>

      {/* How it works */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 10 }}>How MCP Integration Works</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          Instead of TestForge calling the Claude API (which requires an API key), <span style={{ color: COLORS.accent, fontWeight: 600 }}>Claude calls TestForge</span> through the Model Context Protocol (MCP). This means:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
          {[
            { icon: "◈", title: "No API Key Needed", desc: "TestForge doesn't need an Anthropic API key. Claude uses your existing subscription." },
            { icon: "◧", title: "Your Claude, Your Billing", desc: "Requests are billed to your own Claude account — Desktop, Code, or Web." },
            { icon: "◨", title: "Full Tool Access", desc: "Claude can read requirements, generate test cases, search KB, and save results directly." },
          ].map((item, i) => (
            <div key={i} style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <span style={{ fontSize: 18, color: COLORS.accent, display: "block", marginBottom: 8 }}>{item.icon}</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Prerequisites */}
      <Card style={{ marginBottom: 20, border: `1px solid ${COLORS.amber}33` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.amber, marginBottom: 8 }}>Prerequisites</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          Claude Desktop requires a small local bridge script to connect to TestForge. Before creating a token:
        </div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: COLORS.surface, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 10 }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>1.</span> <span style={{ fontWeight: 600 }}>Node.js</span> must be installed — run <span style={{ fontFamily: mono, fontSize: 11, background: COLORS.bg, padding: "2px 6px", borderRadius: 3 }}>node --version</span> in your terminal to verify
          </div>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 6 }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>2.</span> <span style={{ fontWeight: 600 }}>Download the bridge script</span> and save it somewhere permanent on your machine:
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 18, marginBottom: 10 }}>
            <Button small onClick={() => {
              const a = document.createElement("a");
              a.href = "/mcp-bridge.mjs";
              a.download = "mcp-bridge.mjs";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}>Download mcp-bridge.mjs</Button>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>
              3 KB · zero dependencies · requires Node.js 18+
            </span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 18, marginBottom: 10, lineHeight: 1.6 }}>
            Save it anywhere on your machine that Node.js can access. You'll provide the full file path below when creating a token.
          </div>
          <div style={{ fontSize: 12, color: COLORS.text }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>3.</span> <span style={{ fontWeight: 600 }}>TestForge server</span> must be running at <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent }}>{serverUrl}</span>
          </div>
        </div>
      </Card>

      {/* Token creation */}
      <Card glow style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>MCP Access Tokens</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>
          Tokens authenticate your Claude client with TestForge. Each token is tied to your account ({currentUser.name} / {currentUser.role}).
        </div>

        {/* Create new token — name + bridge path + button */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
          <Input
            label="Token Name"
            value={tokenName}
            onChange={setTokenName}
            placeholder='e.g. "My Claude Desktop", "VS Code"'
            style={{ flex: 1 }}
          />
          <Button onClick={createToken} disabled={!tokenName.trim() || !bridgePath.trim()}>Create Token</Button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="Path to mcp-bridge.mjs on your machine"
            value={bridgePath}
            onChange={setBridgePath}
            mono
            placeholder={installOs === "windows"
              ? "e.g. C:\\Users\\you\\testforge-ai\\mcp-bridge.mjs"
              : "e.g. /Users/you/testforge-ai/mcp-bridge.mjs"}
            style={{ marginBottom: 4 }}
          />
          <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
            Enter the full path to where you saved <span style={{ fontFamily: mono }}>mcp-bridge.mjs</span> in step 2 above.
            {installOs === "windows" && " Use double backslashes for Windows paths (e.g. C:\\\\Users\\\\...)."}
            {" "}This path is embedded in the generated config file.
          </div>
        </div>
        <ErrorBanner msg={error} />

        {/* ══ New token display — shown only once ══ */}
        {newToken && (
          <div style={{ marginBottom: 16, padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.green}44` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, marginBottom: 10 }}>Token Created — Copy It Now</div>
            <div style={{ padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber, marginBottom: 12 }}>
              This token will not be shown again. Copy it or install before dismissing.
            </div>

            {/* Token value */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                flex: 1, fontFamily: mono, fontSize: 12, color: COLORS.accent,
                background: COLORS.bg, padding: "10px 14px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, wordBreak: "break-all",
                userSelect: "all",
              }}>
                {newToken.token}
              </div>
              <Button small onClick={copyToken}>{copied ? "Copied!" : "Copy Token"}</Button>
            </div>

            {/* Show the path that was captured */}
            <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Bridge Path (from your input above)</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: COLORS.textBright, wordBreak: "break-all" }}>{newToken.bridgePath}</div>
            </div>

            {/* ── Quick Install section ── */}
            <div style={{
              padding: 16, background: COLORS.bg, borderRadius: 8,
              border: `1px solid ${COLORS.accent}33`, marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>Quick Install — Claude Desktop</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
                Claude Desktop uses a local bridge script that connects to your TestForge server.
              </div>

              {/* Method A: Download */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", background: COLORS.surfaceRaised, borderRadius: 6,
                border: `1px solid ${COLORS.border}`, marginBottom: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>Option A: Download Config File</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    Downloads <span style={{ fontFamily: mono }}>claude_desktop_config.json</span> — place it in the correct config folder
                  </div>
                </div>
                <Button small onClick={downloadConfig}>Download Config</Button>
              </div>

              {/* Method B: Terminal command */}
              <div style={{
                padding: "12px 14px", background: COLORS.surfaceRaised, borderRadius: 6,
                border: `1px solid ${COLORS.border}`, marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>Option B: Auto-Install via Terminal</div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                      Auto-detects Claude's config folder (Windows Store or standard install)
                    </div>
                  </div>
                  <Button small onClick={copyInstallCommand}>
                    {copiedCmd ? "Copied!" : "Copy Command"}
                  </Button>
                </div>

                {/* OS selector */}
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  {[
                    { key: "windows", label: "PowerShell (Windows)" },
                    { key: "mac", label: "Terminal (macOS)" },
                    { key: "linux", label: "Terminal (Linux)" },
                  ].map(os => (
                    <Button
                      key={os.key}
                      small
                      variant={installOs === os.key ? "primary" : "ghost"}
                      onClick={() => { setInstallOs(os.key); setCopiedCmd(false); }}
                      style={{ fontSize: 10, padding: "3px 10px" }}
                    >
                      {os.label}
                    </Button>
                  ))}
                </div>

                <pre style={{
                  fontFamily: mono, fontSize: 10, color: COLORS.text,
                  background: COLORS.bg, padding: 12, borderRadius: 6,
                  border: `1px solid ${COLORS.border}`, overflow: "auto",
                  whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
                  maxHeight: 220,
                }}>
                  {getInstallCommand(newToken.token, newToken.bridgePath)}
                </pre>
              </div>

              {/* Config folder reference */}
              <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.7, marginBottom: 10 }}>
                <span style={{ fontFamily: mono, color: COLORS.accent, fontWeight: 600 }}>Config file locations:</span>
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <div><span style={{ fontFamily: mono, color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>Windows (Store):</span> <span style={{ fontFamily: mono }}>%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>Windows (Standard):</span> <span style={{ fontFamily: mono }}>%APPDATA%\Claude\</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "mac" ? COLORS.textBright : COLORS.textMuted }}>macOS:</span> <span style={{ fontFamily: mono }}>~/Library/Application Support/Claude/</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "linux" ? COLORS.textBright : COLORS.textMuted }}>Linux:</span> <span style={{ fontFamily: mono }}>~/.config/claude/</span></div>
                </div>
              </div>

              <div style={{
                padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6,
                border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber,
              }}>
                After installing, fully quit Claude Desktop (system tray → Quit) and reopen it. Check Settings → Developer to verify "testforge" appears.
              </div>
            </div>

            {/* ── Manual config reference ── */}
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, fontFamily: mono, textTransform: "uppercase" }}>Manual Config Reference</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                { key: "desktop", label: "Claude Desktop" },
                { key: "code", label: "Claude Code (VS Code)" },
                { key: "web", label: "Claude Web" },
              ].map(tab => (
                <Button
                  key={tab.key}
                  small
                  variant={showConfig === tab.key ? "primary" : "secondary"}
                  onClick={() => setShowConfig(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <pre style={{
              fontFamily: mono, fontSize: 11, color: COLORS.text,
              background: COLORS.bg, padding: 14, borderRadius: 6,
              border: `1px solid ${COLORS.border}`, overflow: "auto",
              whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
            }}>
              {configSnippets[showConfig]}
            </pre>

            {showConfig === "desktop" && (
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                Add this under <span style={{ fontFamily: mono, color: COLORS.accent }}>"mcpServers"</span> in your existing <span style={{ fontFamily: mono }}>claude_desktop_config.json</span>. If the file has a <span style={{ fontFamily: mono }}>"preferences"</span> section, keep it and add <span style={{ fontFamily: mono }}>"mcpServers"</span> alongside it.
              </div>
            )}
            {showConfig === "code" && (
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                Run this command in your terminal. Claude Code connects directly via SSE — no bridge script needed.
              </div>
            )}

            <Button small variant="secondary" onClick={() => setNewToken(null)} style={{ marginTop: 12 }}>Dismiss</Button>
          </div>
        )}

        {/* ══ Existing tokens list ══ */}
        {loading ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No tokens created yet. Create one above to connect Claude.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Token</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Created</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Last Used</th>
                <th style={{ textAlign: "right", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "10px", color: COLORS.textBright, fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 11, color: COLORS.textMuted }}>{t.token_preview}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                    {t.last_used ? new Date(t.last_used).toLocaleString() : "Never"}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <Button small variant="danger" onClick={() => deleteToken(t.id)}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Available tools reference */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Available MCP Tools</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>Once connected, Claude can use these tools. Just ask in natural language.</div>
        {[
          { tool: "list_requirements", desc: "List and filter all requirements", example: '"Show me all approved requirements in the Test Case Generation module"' },
          { tool: "get_requirement", desc: "Get full details, KB context, and linked TCs for a requirement", example: '"Get me the details for RS-001 including any related knowledge base entries"' },
          { tool: "save_test_cases", desc: "Generate and save test case drafts to the database", example: '"Generate comprehensive test cases for RS-005 and save them"' },
          { tool: "review_test_case", desc: "Mark a test case as Reviewed or Rejected", example: '"Mark TC-RS-001-001 through TC-RS-001-004 as reviewed"' },
          { tool: "list_test_cases", desc: "List test cases with filters by requirement or status", example: '"Show me all draft test cases for RS-001"' },
          { tool: "search_knowledge_base", desc: "Search KB entries by keyword, requirement tag, or type", example: '"Search the knowledge base for anything related to PDF parsing"' },
          { tool: "create_kb_entry", desc: "Add a new knowledge base entry", example: '"Create a KB entry about the session timeout edge case we just found"' },
          { tool: "create_requirement", desc: "Create a new requirement", example: '"Create a new requirement RS-008 for PDF accessibility compliance"' },
          { tool: "get_coverage_summary", desc: "Get overall test coverage statistics", example: '"What is our current requirement coverage percentage?"' },
        ].map((t, i) => (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < 8 ? `1px solid ${COLORS.border}` : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{
              fontFamily: mono, fontSize: 10, fontWeight: 700, color: COLORS.green,
              background: COLORS.greenDim, padding: "3px 8px", borderRadius: 4,
              whiteSpace: "nowrap", marginTop: 2,
            }}>
              {t.tool}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: COLORS.text }}>{t.desc}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 3 }}>
                Try: {t.example}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* ══ In-App User Guide ══ */}
      <Card style={{ marginTop: 20 }}>
        <div
          onClick={() => setShowGuide(prev => !prev)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>MCP User Guide</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Step-by-step setup, example prompts, tips, and troubleshooting</div>
          </div>
          <span style={{
            fontSize: 18, color: COLORS.accent, transition: "transform 0.2s",
            transform: showGuide ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
        </div>

        {showGuide && (
          <div style={{ marginTop: 20, fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, marginBottom: 8 }}>Getting Started</div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 1: Download & Place the Bridge Script</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Click <span style={{ fontWeight: 600 }}>Download mcp-bridge.mjs</span> in the Prerequisites section above.</div>
                <div>Save the file to a permanent location on your machine (e.g. your project folder).</div>
                <div>Note the <span style={{ fontWeight: 600 }}>full file path</span> — you'll need it in the next step.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 2: Create an MCP Token</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Enter a name for the token (e.g. "My Claude Desktop").</div>
                <div>Paste the full path to your <span style={{ fontFamily: mono, fontSize: 11 }}>mcp-bridge.mjs</span> file.</div>
                <div>Click <span style={{ fontWeight: 600 }}>Create Token</span>.</div>
                <div>Copy the <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent }}>tfmcp_...</span> token immediately — it won't be shown again.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 3: Install the Config</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div style={{ marginBottom: 6 }}><Badge color="green">Easiest</Badge> <span style={{ fontWeight: 600 }}>Download Config</span> — click the button, move the file to your Claude config folder.</div>
                <div style={{ marginBottom: 6 }}><Badge color="accent">Terminal</Badge> <span style={{ fontWeight: 600 }}>Auto-Install</span> — copy the PowerShell/bash command, paste and run. Auto-detects Windows Store vs standard install.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 4: Restart & Verify</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Fully quit Claude Desktop (system tray → <span style={{ fontWeight: 600 }}>Quit Claude</span>, not just close the window).</div>
                <div>Reopen and check <span style={{ fontWeight: 600 }}>Settings → Developer</span> — "testforge" should appear in the MCP servers list.</div>
                <div>Ask Claude: <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>"What tools do you have from TestForge?"</span></div>
              </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, margin: "24px 0 12px" }}>Example Workflows</div>

            {[
              { title: "Generate Test Cases", prompt: "Look at requirement RS-001 in TestForge, including any relevant knowledge base entries, and generate comprehensive test cases. Save them when done.", detail: "Claude reads the requirement and KB context, generates test cases, and saves them as drafts." },
              { title: "Check Coverage Gaps", prompt: "Show me all requirements in TestForge that don't have test cases yet.", detail: "Returns untested requirements so you know where to focus." },
              { title: "Review Test Cases", prompt: "Mark TC-RS-001-001 and TC-RS-001-002 as reviewed.", detail: "Updates the status from Draft to Reviewed." },
              { title: "Batch Generation", prompt: "For every approved requirement without test cases, generate standard-depth test cases and save them. Then summarize what was created.", detail: "Claude chains multiple tools together automatically." },
            ].map((ex, i) => (
              <div key={i} style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 6 }}>{ex.title}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent, background: COLORS.bg, padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, marginBottom: 6, lineHeight: 1.5, fontStyle: "italic" }}>"{ex.prompt}"</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{ex.detail}</div>
              </div>
            ))}

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, margin: "24px 0 12px" }}>Troubleshooting</div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Problem</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Solution</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { problem: '"Could not load app settings" on launch', solution: 'Your config JSON is malformed. Open the file and validate it at jsonlint.com' },
                  { problem: 'Claude says "no tools from TestForge"', solution: "Check Settings → Developer. If testforge isn't listed, the config file is in the wrong location" },
                  { problem: "testforge shows in Developer but no tools", solution: "Check MCP logs in Claude's logs folder. Common cause: token expired (create a new one in TestForge)" },
                  { problem: '"Invalid or missing MCP token"', solution: "Token was lost when Docker rebuilt. Create a new token in Settings & MCP and update your config" },
                  { problem: '"stream is not readable" in logs', solution: "The Express JSON middleware is intercepting MCP requests. Check that index.js skips /mcp/messages" },
                  { problem: "tools/list times out after 30s", solution: "Update mcp-bridge.mjs to v2 — the SSE parser needs multi-line data support" },
                  { problem: "Config file not found by Claude", solution: "Windows Store installs use a different path. Use Settings → Developer → Edit Config to find the real location" },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "8px 10px", color: COLORS.amber, fontFamily: mono, fontSize: 10 }}>{row.problem}</td>
                    <td style={{ padding: "8px 10px", color: COLORS.text }}>{row.solution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── MCP SERVER SETTINGS ────────────────────────────────────────────────────

const McpServerConfigView = ({ currentUser }) => {
  const COLORS = useTheme();
  const [servers, setServers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState({
    name: "", url: "", auth_type: "none", auth_token: "", description: "", enabled: true,
  });
  const [editForm, setEditForm] = useState({
    name: "", url: "", auth_type: "none", auth_token: "", description: "", enabled: true,
  });

  const isAdmin = currentUser.role === "Admin";

  const loadServers = useCallback(async () => {
    try { setServers(await api.getMcpSettings()); } catch (e) {}
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  const startAdd = () => {
    setAddForm({ name: "", url: "", auth_type: "none", auth_token: "", description: "", enabled: true });
    setShowAdd(true); setEditId(null); setError(""); setDeleteConfirm(null);
  };

  const startEdit = (s) => {
    if (editId === s.id) { setEditId(null); return; }
    setEditForm({
      name: s.name, url: s.url, auth_type: s.auth_type,
      auth_token: "", description: s.description || "", enabled: !!s.enabled,
    });
    setEditId(s.id); setShowAdd(false); setError(""); setDeleteConfirm(null);
  };

  const saveAdd = async () => {
    setError("");
    try {
      await api.createMcpServer(addForm);
      setShowAdd(false); loadServers();
    } catch (err) { setError(err.message); }
  };

  const saveEdit = async () => {
    setError("");
    const payload = { ...editForm };
    // Only send auth_token if the user typed something (avoid clearing on edit)
    if (!payload.auth_token) delete payload.auth_token;
    try {
      await api.updateMcpServer(editId, payload);
      setEditId(null); loadServers();
    } catch (err) { setError(err.message); }
  };

  const doDelete = async (id) => {
    try { await api.deleteMcpServer(id); setDeleteConfirm(null); setEditId(null); loadServers(); }
    catch (err) { setError(err.message); }
  };

  const doToggle = async (id) => {
    try { await api.toggleMcpServer(id); loadServers(); } catch (e) {}
  };

  const doTest = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: { testing: true } }));
    try {
      const result = await api.testMcpServer(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, error: err.message } }));
    }
  };

  const renderForm = (form, setForm) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Input label="Server Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))}
          placeholder="e.g. Jira MCP, GitHub MCP" />
        <Input label="Server URL" value={form.url} onChange={v => setForm(p => ({ ...p, url: v }))}
          placeholder="https://mcp.example.com/sse" mono />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Select label="Auth Type" value={form.auth_type}
          onChange={v => setForm(p => ({ ...p, auth_type: v }))}
          options={[
            { value: "none", label: "None" },
            { value: "bearer", label: "Bearer Token" },
            { value: "api_key", label: "API Key" },
            { value: "oauth2", label: "OAuth 2.0" },
          ]} />
        {form.auth_type !== "none" && (
          <Input label="Auth Token / Secret" value={form.auth_token}
            onChange={v => setForm(p => ({ ...p, auth_token: v }))}
            placeholder={editId ? "(leave blank to keep existing)" : "Enter token"}
            type="password" mono />
        )}
      </div>
      <Input label="Description" value={form.description}
        onChange={v => setForm(p => ({ ...p, description: v }))}
        placeholder="What this server provides (optional)" style={{ marginBottom: 14 }} />
      <ErrorBanner msg={error} />
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>MCP Server Configuration</h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
            Model Context Protocol Connections — Admin Only
          </p>
        </div>
        {isAdmin && <Button onClick={startAdd}>+ Add Server</Button>}
      </div>

      {!isAdmin && (
        <Card style={{ marginBottom: 16, padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: COLORS.amber }}>
            Admin role required to configure MCP servers. Contact an administrator to add or modify connections.
          </div>
        </Card>
      )}

      {/* Add form */}
      {showAdd && isAdmin && (
        <Card glow style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 14 }}>Add MCP Server</div>
          {renderForm(addForm, setAddForm)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={!addForm.name || !addForm.url}>Save</Button>
          </div>
        </Card>
      )}

      {/* Server list */}
      {servers.length === 0 && !showAdd && (
        <EmptyState icon="◆" title="No MCP Servers Configured"
          subtitle={isAdmin ? "Add a server connection above" : "An administrator needs to configure MCP servers"} />
      )}

      {servers.map(s => {
        const isEditing = editId === s.id;
        const test = testResults[s.id];

        return (
          <Card key={s.id} style={{
            marginBottom: 10,
            cursor: isAdmin && !isEditing ? "pointer" : "default",
            borderColor: isEditing ? COLORS.accent + "44" : !s.enabled ? COLORS.border + "88" : undefined,
            boxShadow: isEditing ? `0 0 20px ${COLORS.accentGlow}` : undefined,
            opacity: s.enabled ? 1 : 0.6,
          }}
            onClick={() => isAdmin && !isEditing && startEdit(s)}>

            {/* Read-only header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{
                fontFamily: mono, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                color: s.enabled ? COLORS.green : COLORS.textMuted,
                background: s.enabled ? COLORS.greenDim : COLORS.surface,
              }}>
                {s.enabled ? "ACTIVE" : "DISABLED"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 12, fontFamily: mono, color: COLORS.textMuted }}>{s.url}</div>
                {s.description && !isEditing && (
                  <div style={{ fontSize: 12, color: COLORS.text, marginTop: 6 }}>{s.description}</div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge color="purple">{s.auth_type === "none" ? "No Auth" : s.auth_type.toUpperCase()}</Badge>
                  {s.updated_by && (
                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>
                      Updated by {s.updated_by}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}
                onClick={e => e.stopPropagation()}>
                {isAdmin && (
                  <>
                    <Button small variant="secondary" onClick={() => doTest(s.id)}
                      disabled={test?.testing}>
                      {test?.testing ? "Testing..." : "Test"}
                    </Button>
                    <Button small variant={s.enabled ? "ghost" : "secondary"} onClick={() => doToggle(s.id)}>
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Test result banner */}
            {test && !test.testing && (
              <div style={{
                marginTop: 10, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontFamily: mono,
                background: test.reachable ? COLORS.greenDim : COLORS.redDim,
                color: test.reachable ? COLORS.green : COLORS.red,
                border: `1px solid ${test.reachable ? COLORS.green : COLORS.red}33`,
              }}
                onClick={e => e.stopPropagation()}>
                {test.reachable
                  ? `Connection OK — ${test.status} ${test.statusText}`
                  : `Connection Failed — ${test.error || `${test.status} ${test.statusText}`}`}
              </div>
            )}

            {/* Inline edit form */}
            {isEditing && isAdmin && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}
                onClick={e => e.stopPropagation()}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12,
                  fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>Editing</div>
                {renderForm(editForm, setEditForm)}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                  {deleteConfirm !== s.id ? (
                    <Button variant="danger" small onClick={() => setDeleteConfirm(s.id)}
                      style={{ marginRight: "auto" }}>Delete</Button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
                      <span style={{ fontSize: 11, color: COLORS.red }}>Remove this server?</span>
                      <Button variant="danger" small onClick={() => doDelete(s.id)}>Confirm</Button>
                      <Button variant="ghost" small onClick={() => setDeleteConfirm(null)}>No</Button>
                    </div>
                  )}
                  <Button variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
                  <Button onClick={saveEdit} disabled={!editForm.name || !editForm.url}>Save</Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Role permissions reference */}
      <Card style={{ marginTop: 24, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, fontFamily: mono, marginBottom: 8, textTransform: "uppercase" }}>
          Access Control
        </div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>
          <span style={{ color: COLORS.purple, fontWeight: 600 }}>Admin</span> — Full CRUD on MCP servers, test connections, toggle enabled/disabled
          <br />
          <span style={{ color: COLORS.amber, fontWeight: 600 }}>QA Manager</span> — View configured servers (read-only)
          <br />
          <span style={{ color: COLORS.accent, fontWeight: 600 }}>QA Engineer</span> — View configured servers (read-only)
        </div>
      </Card>
    </div>
  );
};

// ─── SETTINGS (Unified wrapper) ─────────────────────────────────────────────
//
// Replaces the old standalone UsersView, JamaView, and SettingsView (MCP)
// nav items with a single Settings page containing a vertical sub-nav.
//
// Sub-sections:
//   - User Preferences  → All authenticated users (Themes, Language)
//   - User Management   → Admin only (existing UsersView code)
//   - MCP Server Setup  → Admin only (existing MCP SettingsView code)
//   - Jama Connect      → Admin only (existing JamaView code)
//
// Props expected:
//   currentUser, currentTheme, onThemeChange,
//   + any props the child views need (requirements, testCases, kbEntries, etc.)
//

const SETTINGS_SECTIONS = [
  { key: "preferences", label: "User Preferences", icon: "◎", adminOnly: false },
  { key: "product",     label: "Product Context",   icon: "◈", adminOnly: false },
  { key: "users",       label: "User Management",  icon: "◯", adminOnly: true },
  { key: "mcp",         label: "MCP Server Setup",  icon: "◆", adminOnly: true },
  { key: "jama",        label: "Jama Connect",      icon: "◭", adminOnly: true },
];

const SettingsWrapper = ({ currentUser, currentTheme, onThemeChange, requirements, testCases, kbEntries }) => {
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

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPw, setPendingPw] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [themeName, setThemeName] = useState(() => localStorage.getItem("tf-theme") || "midnight");

  const [requirements, setRequirements] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [kbEntries, setKbEntries] = useState([]);
  const [tokenUsage, setTokenUsage] = useState(null);

  const activeTheme = THEMES[themeName] || THEMES.midnight;

  const [easterEggToast, setEasterEggToast] = useState(null);
  const [preEasterEggTheme, setPreEasterEggTheme] = useState(null);

  const handleThemeChange = (key) => {
    setThemeName(key);
    localStorage.setItem("tf-theme", key);
  };

  // Easter egg keyboard listener
useEffect(() => {
  let buffer = "";
  const KONAMI = "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba";
  const TRIGGERS = {
    afterdark: { theme: "afterdark", message: "🌌 After Dark activated — enjoy the stars" },
    matrix:    { theme: "matrix",    message: "💊 You took the red pill..." },
  };

  const handleKey = (e) => {
    // Escape key resets to previous theme
    if (e.key === "Escape" && preEasterEggTheme) {
      handleThemeChange(preEasterEggTheme);
      setPreEasterEggTheme(null);
      setEasterEggToast("↩️ Theme restored");
      return;
    }

    buffer += e.key;

    if (buffer.endsWith(KONAMI)) {
      if (!activeTheme._hidden) setPreEasterEggTheme(themeName);
      handleThemeChange("konami");
      setEasterEggToast("🔓 CLASSIFIED — Konami Code accepted");
      buffer = "";
      return;
    }
    for (const [trigger, config] of Object.entries(TRIGGERS)) {
      if (buffer.toLowerCase().endsWith(trigger)) {
        if (!activeTheme._hidden) setPreEasterEggTheme(themeName);
        handleThemeChange(config.theme);
        setEasterEggToast(config.message);
        buffer = "";
        return;
      }
    }
    if (buffer.length > 100) buffer = buffer.slice(-50);
  };

  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [preEasterEggTheme, themeName, activeTheme._hidden]);

  const loadData = useCallback(async () => {
    try { setRequirements(await api.getRequirements()); }
    catch (e) {
      console.error("Failed to load requirements:", e.message);
      if (e.message?.includes("Not authenticated")) { setCurrentUser(null); setAuthState("login"); return; }
    }
    try { setTestCases(await api.getTestCases()); }
    catch (e) { console.error("Failed to load test cases:", e.message); }
    try { setKbEntries(await api.getKbEntries()); }
    catch (e) { console.error("Failed to load KB entries:", e.message); }
    try { setTokenUsage(await api.getTokenUsage()); }
    catch (e) { console.error("Failed to load token usage:", e.message); }
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

  if (authState === "loading") return <ThemeContext.Provider value={activeTheme}><div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: activeTheme.bg, color: activeTheme.accent, fontFamily: mono }}>Loading...</div></ThemeContext.Provider>;
  if (authState === "login") return <ThemeContext.Provider value={activeTheme}><LoginScreen onLogin={handleLogin} /></ThemeContext.Provider>;
  if (authState === "changePassword" && pendingPw) return <ThemeContext.Provider value={activeTheme}><PasswordChangeScreen userId={pendingPw.userId} userName={pendingPw.name} isOtp={pendingPw.isOtp} onComplete={handlePwComplete} /></ThemeContext.Provider>;

  const isCycling = !!activeTheme._cycleSpeed;
  const isAero = activeTheme._aero || false;
  const isXP = activeTheme._xpStyle || false;
  const isLavaLamp = activeTheme._lavaLamp || false;
  const isSynthwave = activeTheme._synthwave || false;

  const globalStyle = `
    input:focus, textarea:focus, select:focus {
      border-color: ${activeTheme.accent} !important;
      box-shadow: 0 0 0 2px ${activeTheme.accentDim};
    }
    button:hover:not(:disabled) { filter: brightness(1.15); }

    ${isCycling ? `
    @keyframes chromawave {
      0%   { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    @keyframes hyperdriveBg {
      0%   { background-color: #FF0044; }
      16%  { background-color: #FF8800; }
      33%  { background-color: #FFFF00; }
      50%  { background-color: #00FF66; }
      66%  { background-color: #0088FF; }
      83%  { background-color: #AA00FF; }
      100% { background-color: #FF0044; }
    }
    ` : ""}

    ${isAero ? `
    @keyframes aeroShimmer {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}
    
    ${isXP ? `
    @keyframes xpGradient {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}
        ${isLavaLamp ? `
    @keyframes lavaLamp {
      0%   { background-position: 0% 50%; }
      25%  { background-position: 50% 100%; }
      50%  { background-position: 100% 50%; }
      75%  { background-position: 50% 0%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}

    ${isSynthwave ? `
    @keyframes synthwaveShift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}
  `;

  return <ThemeContext.Provider value={activeTheme}>
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: activeTheme.bg,
      fontFamily: font,
      color: activeTheme.text,
      ...(isCycling ? {
        animation: `chromawave ${activeTheme._cycleSpeed} linear infinite${activeTheme._hyperdriveBg ? `, hyperdriveBg ${activeTheme._cycleSpeed} linear infinite` : ""}`,
      } : {}),
      ...(isAero ? {
        background: "linear-gradient(135deg, #E8F4FD 0%, #D5F0E8 35%, #EAF0FA 70%, #F0F8FF 100%)",
        backgroundSize: "200% 200%",
        animation: "aeroShimmer 12s ease-in-out infinite",
      } : {}),
      ...(isXP ? {
        background: "linear-gradient(180deg, #0055E5 0%, #2E8AE6 8%, #ECE9D8 8%, #ECE9D8 100%)",
      } : {}),
      ...(activeTheme._upsideDown ? {
        transform: "rotate(180deg)",
      } : {}),
      ...(isLavaLamp ? {
        background: "linear-gradient(-45deg, #1A0A0A, #2A0A1A, #1A1A0A, #0A1A1A, #2A0A0A)",
        backgroundSize: "400% 400%",
        animation: "lavaLamp 20s ease infinite",
      } : {}),
      ...(isSynthwave ? {
        background: "linear-gradient(135deg, #0E0620, #1A0640, #2D0A5A, #1A0640, #0E0620)",
        backgroundSize: "300% 300%",
        animation: "synthwaveShift 10s ease infinite",
      } : {}),
    }}>
      <style>{globalStyle}</style>
      {activeTheme._starfield && <StarfieldCanvas />}
      {activeTheme._matrixRain && <MatrixRainCanvas />}
      {activeTheme._aurora && <AuroraCanvas />}
      {activeTheme._vaporwave && <VaporwaveCanvas />}
      {activeTheme._fireflies && <FirefliesCanvas />}
      {activeTheme._fishTank && <FishTankCanvas />}
      {easterEggToast && <EasterEggToast message={easterEggToast} onDone={() => setEasterEggToast(null)} />}
      {activeTheme._hidden && <EasterEggResetButton onReset={() => {
        handleThemeChange(preEasterEggTheme || "midnight");
        setPreEasterEggTheme(null);
        setEasterEggToast("↩️ Theme restored");
      }} />}
      <Sidebar active={page} onNavigate={setPage} currentUser={currentUser} onLogout={handleLogout} currentTheme={themeName} onThemeChange={handleThemeChange} />
      <main style={{ flex: 1, padding: page === "traceability" ? 0 : "28px 36px", maxWidth: page === "traceability" ? "none" : 1100, overflowY: page === "traceability" ? "hidden" : "auto", display: page === "traceability" ? "flex" : "block", flexDirection: "column" }}>
        {page === "dashboard" && <DashboardView requirements={requirements} testCases={testCases} kbEntries={kbEntries} tokenUsage={tokenUsage} />}
        {page === "requirements" && <RequirementsView requirements={requirements} refresh={loadData} currentUser={currentUser} />}
        {page === "testcases" && <TestCaseView requirements={requirements} testCases={testCases} kbEntries={kbEntries} refresh={loadData} />}
        {page === "traceability" && <SysMLTraceability requirements={requirements} testCases={testCases} useTheme={useTheme} Badge={Badge} Card={Card} Button={Button} mono={mono} font={font} refresh={loadData} />}
        {page === "kb" && <KbView kbEntries={kbEntries} requirements={requirements} refresh={loadData} />}
        {page === "deferred" && <DeferredView />}
        {page === "settings" && <SettingsWrapper currentUser={currentUser} currentTheme={themeName} onThemeChange={handleThemeChange} requirements={requirements} testCases={testCases} kbEntries={kbEntries} />}
      </main>
    </div>
  </ThemeContext.Provider>;
}
