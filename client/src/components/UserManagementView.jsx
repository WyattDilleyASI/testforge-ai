import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, font, mono, ROLE_PERMISSIONS } from "../theme";
import { Card, Badge, Button, Input, Select, ErrorBanner } from "./shared";

export const UserManagementView = ({ currentUser, refreshAll }) => {
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
