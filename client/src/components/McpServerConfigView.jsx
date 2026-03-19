import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, font, mono } from "../theme";
import { Card, Badge, Button, Input, Select, EmptyState, ErrorBanner } from "./shared";

export const McpServerConfigView = ({ currentUser }) => {
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
