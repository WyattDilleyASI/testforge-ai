import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0B0E14", surface: "#121821", surfaceRaised: "#1A2233",
  border: "#243044", text: "#C8D6E5", textMuted: "#7A8BA3",
  textBright: "#EFF4F8", accent: "#22D3EE", accentDim: "rgba(34,211,238,0.12)",
  accentGlow: "rgba(34,211,238,0.25)", green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
  red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FBBF24",
  amberDim: "rgba(251,191,36,0.12)", purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.12)",
};
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
  const c = COLORS[color] || color;
  const dim = COLORS[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

const Button = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = { primary: { ...base, background: COLORS.accent, color: COLORS.bg }, secondary: { ...base, background: COLORS.surfaceRaised, color: COLORS.text, border: `1px solid ${COLORS.border}` }, danger: { ...base, background: COLORS.redDim, color: COLORS.red, border: `1px solid ${COLORS.red}33` }, ghost: { ...base, background: "transparent", color: COLORS.textMuted } };
  return <button style={{ ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Card = ({ children, style, glow, ...rest }) => <div style={{ background: COLORS.surfaceRaised, border: `1px solid ${glow ? COLORS.accent + "44" : COLORS.border}`, borderRadius: 10, padding: 20, boxShadow: glow ? `0 0 20px ${COLORS.accentGlow}` : "0 2px 8px rgba(0,0,0,0.3)", ...style }} {...rest}>{children}</div>;

const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none", opacity: disabled ? 0.5 : 1 }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
  </div>
);

const PasswordInput = ({ label, value, onChange, placeholder, style, onKeyDown }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} style={{ fontFamily: font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none" }} />
  </div>
);

const Select = ({ label, value, onChange, options, style, disabled }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ fontFamily: font, fontSize: 13, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>
);

const ReqIdTag = ({ id }) => <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.accent}33` }}>{id}</span>;

const Spinner = () => <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.accent }}><div style={{ width: 18, height: 18, border: `2px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 13, fontFamily: mono }}>Generating drafts via Claude API...</span><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>;

const EmptyState = ({ icon, title, subtitle }) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: COLORS.textMuted, textAlign: "center" }}><span style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</span><span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{title}</span><span style={{ fontSize: 13 }}>{subtitle}</span></div>;

const DraftDisclaimer = ({ style }) => <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber, lineHeight: 1.5, ...style }}><span style={{ fontFamily: mono, fontWeight: 700, marginRight: 6, fontSize: 10, textTransform: "uppercase" }}>TC-003a DRAFT</span>{DRAFT_DISCLAIMER}</div>;

const ErrorBanner = ({ msg }) => msg ? <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.redDim, borderRadius: 6, border: `1px solid ${COLORS.red}33`, fontSize: 12, color: COLORS.red }}>{msg}</div> : null;

// ─── LOGIN SCREEN ───────────────────────────────────────────────────────────

const LoginScreen = ({ onLogin }) => {
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
  { key: "mcp", label: "MCP Servers", icon: "◆", reqs: "Admin Config" },
  { key: "deferred", label: "Deferred to v2", icon: "◬", reqs: "AL-xxx · KB-007" },
  { key: "settings", label: "Settings & MCP", icon: "◇", reqs: "MCP" },
];

const Sidebar = ({ active, onNavigate, currentUser, onLogout }) => (
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
    <div style={{ padding: "14px 16px", borderTop: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>FRD v1.2 — 39 active REQs</div>
  </div>
);

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

const DashboardView = ({ requirements, testCases, kbEntries }) => {
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
  const [selectedReqId, setSelectedReqId] = useState("");
  const [depth, setDepth] = useState("standard");
  const [generating, setGenerating] = useState(false);
  const [expandedTc, setExpandedTc] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [sessionTcIds, setSessionTcIds] = useState(null);
  const [viewMode, setViewMode] = useState("library");

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

  const updateStatus = async (tcId, status) => {
    try { await api.updateTcStatus(tcId, status); refresh(); } catch (err) { console.error(err); }
  };

  return <div>
    <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Test Case Generation</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>TC-001 – TC-009</p></div>
    <Card glow style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase" }}>Generate TC Drafts</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="Requirement" value={selectedReqId} onChange={setSelectedReqId} style={{ minWidth: 280 }} options={[{ value: "", label: "— Select —" }, ...requirements.map(r => ({ value: r.req_id, label: `${r.req_id} — ${r.title}` }))]} />
        <Select label="Depth" value={depth} onChange={setDepth} style={{ minWidth: 180 }} options={[{ value: "basic", label: "Basic (2-3)" }, { value: "standard", label: "Standard (4-6)" }, { value: "comprehensive", label: "Comprehensive (6-10)" }]} />
        <Button onClick={generate} disabled={!selectedReqId || generating}>{generating ? "Generating..." : "Generate Drafts"}</Button>
      </div>
      {generating && <div style={{ marginTop: 14 }}><Spinner /></div>}
      {apiError && <div style={{ marginTop: 10, fontSize: 12, color: COLORS.red, fontFamily: mono }}>{apiError}</div>}
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
  </div>;
};

// ─── TRACEABILITY MATRIX ────────────────────────────────────────────────────

const TraceabilityView = ({ requirements, testCases }) => <div>
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

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

const KbView = ({ kbEntries, refresh }) => {
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

const DeferredView = () => <div>
  <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Deferred to v2</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>FRD v1.2 Section 9</p></div>
  {[{ title: "Adaptive Learning Engine", sub: "AL-001 – AL-008", desc: "Descoped from v1 to keep the tool focused on assistive generation." },
    { title: "Confluence KB Import", sub: "KB-007", desc: "Manual entry only in v1. v2 implements Confluence REST API import." },
    { title: "SSO / External Identity", sub: "UM-xxx", desc: "v1 uses local accounts. v2 adds SAML/OAuth integration." }
  ].map((item, i) => <Card key={i} style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Badge color="amber">DEFERRED</Badge><span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>{item.title}</span><span style={{ fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{item.sub}</span></div>
    <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.7 }}>{item.desc}</div>
  </Card>)}
</div>;

// ─── SETTINGS & MCP ─────────────────────────────────────────────────────────

const SettingsView = ({ currentUser }) => {
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

const McpSettingsView = ({ currentUser }) => {
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

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPw, setPendingPw] = useState(null);
  const [page, setPage] = useState("dashboard");

  const [requirements, setRequirements] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [kbEntries, setKbEntries] = useState([]);

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

  if (authState === "loading") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.accent, fontFamily: mono }}>Loading...</div>;
  if (authState === "login") return <LoginScreen onLogin={handleLogin} />;
  if (authState === "changePassword" && pendingPw) return <PasswordChangeScreen userId={pendingPw.userId} userName={pendingPw.name} isOtp={pendingPw.isOtp} onComplete={handlePwComplete} />;

  const globalStyle = `input:focus, textarea:focus, select:focus { border-color: ${COLORS.accent} !important; box-shadow: 0 0 0 2px ${COLORS.accentDim}; } button:hover:not(:disabled) { filter: brightness(1.15); }`;

  return <div style={{ display: "flex", minHeight: "100vh", background: COLORS.bg, fontFamily: font, color: COLORS.text }}>
    <style>{globalStyle}</style>
    <Sidebar active={page} onNavigate={setPage} currentUser={currentUser} onLogout={handleLogout} />
    <main style={{ flex: 1, padding: "28px 36px", maxWidth: 1100, overflowY: "auto" }}>
      {page === "dashboard" && <DashboardView requirements={requirements} testCases={testCases} kbEntries={kbEntries} />}
      {page === "requirements" && <RequirementsView requirements={requirements} refresh={loadData} currentUser={currentUser} />}
      {page === "testcases" && <TestCaseView requirements={requirements} testCases={testCases} kbEntries={kbEntries} refresh={loadData} />}
      {page === "traceability" && <TraceabilityView requirements={requirements} testCases={testCases} />}
      {page === "kb" && <KbView kbEntries={kbEntries} refresh={loadData} />}
      {page === "users" && <UserManagementView currentUser={currentUser} refreshAll={loadData} />}
      {page === "jama" && <JamaView testCases={testCases} requirements={requirements} currentUser={currentUser} />}
      {page === "mcp" && <McpSettingsView currentUser={currentUser} />}
      {page === "deferred" && <DeferredView />}
      {page === "settings" && <SettingsView currentUser={currentUser} />}
    </main>
  </div>;
}