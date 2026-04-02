import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, mono, font } from "../theme";
import { Card, Badge, Button, Input, Select, ErrorBanner } from "./shared";

// ─── Stat Card ──────────────────────────────────────────────────────────────

const Stat = ({ label, value, sub, color, COLORS }) => (
  <div style={{
    flex: "1 1 140px", padding: "14px 16px", borderRadius: 8,
    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
  }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: COLORS[color] || COLORS.textBright, fontFamily: mono }}>{value ?? "—"}</div>
    {sub && <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginTop: 4 }}>{sub}</div>}
  </div>
);

// ─── Tab Bar ────────────────────────────────────────────────────────────────

const TabBar = ({ tabs, active, onChange, COLORS }) => (
  <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 0 }}>
    {tabs.map(t => (
      <button key={t.key} onClick={() => onChange(t.key)} style={{
        fontFamily: font, fontSize: 12, fontWeight: active === t.key ? 600 : 400,
        color: active === t.key ? COLORS.accent : COLORS.textMuted,
        background: "transparent", border: "none", cursor: "pointer",
        padding: "8px 16px", borderBottom: active === t.key ? `2px solid ${COLORS.accent}` : "2px solid transparent",
        marginBottom: -1,
      }}>{t.label}</button>
    ))}
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export const AnalyticsView = ({ currentUser }) => {
  const COLORS = useTheme();
  const isManager = currentUser?.role === "Admin" || currentUser?.role === "QA Manager";
  const isAdmin = currentUser?.role === "Admin";

  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);

  // Rules state
  const [rules, setRules] = useState([]);
  const [rulesMeta, setRulesMeta] = useState(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ ruleText: "", category: "general", scope: "all" });
  const [editingRule, setEditingRule] = useState(null);
  const [ruleError, setRuleError] = useState("");

  // Exemplars state
  const [exemplars, setExemplars] = useState([]);

  // Health state
  const [health, setHealth] = useState(null);
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [runningMaintenance, setRunningMaintenance] = useState(false);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "feedback", label: "Feedback" },
    ...(isManager ? [{ key: "rules", label: "Rules" }] : []),
    ...(isManager ? [{ key: "exemplars", label: "Exemplars" }] : []),
    ...(isAdmin ? [{ key: "system", label: "System" }] : []),
  ];

  // ── Data Loading ────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      setError("");
      const data = await api.getAnalyticsDashboard();
      setDashboard(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadRules = useCallback(async () => {
    if (!isManager) return;
    try {
      const [r, m] = await Promise.all([api.getAnalyticsRules(), api.getRulesMetadata()]);
      setRules(r);
      setRulesMeta(m);
    } catch (e) { console.error("Rules load error:", e); }
  }, [isManager]);

  const loadExemplars = useCallback(async () => {
    if (!isManager) return;
    try { setExemplars(await api.getExemplars()); }
    catch (e) { console.error("Exemplars load error:", e); }
  }, [isManager]);

  const loadHealth = useCallback(async () => {
    if (!isAdmin) return;
    try { setHealth(await api.getAnalyticsHealth()); }
    catch (e) { console.error("Health load error:", e); }
  }, [isAdmin]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === "rules") loadRules(); }, [tab, loadRules]);
  useEffect(() => { if (tab === "exemplars") loadExemplars(); }, [tab, loadExemplars]);
  useEffect(() => { if (tab === "system") loadHealth(); }, [tab, loadHealth]);

  // ── Rule Actions ────────────────────────────────────────────────────

  const createRule = async () => {
    if (!newRule.ruleText.trim()) { setRuleError("Rule text is required"); return; }
    try {
      setRuleError("");
      await api.createRule(newRule);
      setNewRule({ ruleText: "", category: "general", scope: "all" });
      setShowAddRule(false);
      loadRules();
      loadDashboard();
    } catch (e) { setRuleError(e.message); }
  };

  const saveRuleEdit = async () => {
    if (!editingRule) return;
    try {
      setRuleError("");
      await api.updateRule(editingRule.rule_id, {
        ruleText: editingRule.rule_text,
        category: editingRule.category,
        scope: editingRule.scope,
      });
      setEditingRule(null);
      loadRules();
    } catch (e) { setRuleError(e.message); }
  };

  const deleteRule = async (ruleId) => {
    try {
      await api.deleteRule(ruleId);
      loadRules();
      loadDashboard();
    } catch (e) { setRuleError(e.message); }
  };

  // ── Exemplar Actions ────────────────────────────────────────────────

  const removeExemplar = async (tcId) => {
    try {
      await api.removeExemplar(tcId);
      loadExemplars();
      loadDashboard();
    } catch (e) { console.error(e); }
  };

  // ── Maintenance Actions ─────────────────────────────────────────────

  const runMaintenance = async () => {
    setRunningMaintenance(true);
    setMaintenanceResult(null);
    try {
      const result = await api.runMaintenance();
      setMaintenanceResult(result);
      loadHealth();
      loadDashboard();
    } catch (e) { setMaintenanceResult({ error: e.message }); }
    finally { setRunningMaintenance(false); }
  };

  const resetModel = async () => {
    try {
      const result = await api.resetModelVersion();
      loadHealth();
      loadRules();
      alert(result.rules_affected > 0
        ? `Reset ${result.rules_affected} rule(s): ${result.previous_model} → ${result.current_model}`
        : "No reset needed — model version matches.");
    } catch (e) { alert(e.message); }
  };

  // ── Loading / Error States ──────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>Loading analytics...</div>;
  if (error) return <div style={{ padding: 40 }}><ErrorBanner message={error} /></div>;

  const d = dashboard;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Overview Tab
  // ═══════════════════════════════════════════════════════════════════

  const renderOverview = () => (
    <>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat COLORS={COLORS} label="Generation Sessions" value={d.overall.total_sessions} color="accent" sub="All-time total" />
        <Stat COLORS={COLORS} label="TCs Generated" value={d.overall.total_tcs} color="purple" sub={`${d.overall.total_approved} approved · ${d.overall.total_rejected} rejected`} />
        <Stat COLORS={COLORS} label="Approval Rate" value={d.overall.overall_approval_rate !== null ? `${d.overall.overall_approval_rate}%` : "—"} color={d.overall.overall_approval_rate >= 70 ? "green" : d.overall.overall_approval_rate >= 40 ? "amber" : "red"} sub="Reviewed ÷ (Reviewed + Rejected)" />
        <Stat COLORS={COLORS} label="Active Rules" value={d.active_rule_count} color="accent" sub={`of ${25} max`} />
        <Stat COLORS={COLORS} label="Exemplars" value={d.exemplars.total} color="purple" sub={`${d.exemplars.system_selected} auto · ${d.exemplars.manual_selected} manual`} />
      </div>

      {/* Monthly summary */}
      {d.monthly.length > 0 && <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Monthly Summary</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, fontFamily: mono, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {["Month", "Depth", "Sessions", "TCs", "Approved", "Rejected", "Rate", "Tokens"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: COLORS.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.monthly.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                  <td style={{ padding: "8px 10px", color: COLORS.textBright }}>{row.month}</td>
                  <td style={{ padding: "8px 10px" }}><Badge color="accent">{row.depth}</Badge></td>
                  <td style={{ padding: "8px 10px", color: COLORS.text }}>{row.session_count}</td>
                  <td style={{ padding: "8px 10px", color: COLORS.text }}>{row.total_tcs}</td>
                  <td style={{ padding: "8px 10px", color: COLORS.green }}>{row.total_approved}</td>
                  <td style={{ padding: "8px 10px", color: COLORS.red }}>{row.total_rejected}</td>
                  <td style={{ padding: "8px 10px", color: row.approval_rate_pct >= 70 ? COLORS.green : row.approval_rate_pct >= 40 ? COLORS.amber : COLORS.red, fontWeight: 600 }}>
                    {row.approval_rate_pct !== null ? `${row.approval_rate_pct}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", color: COLORS.textMuted }}>{((row.total_input_tokens || 0) + (row.total_output_tokens || 0)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>}

      {/* Recent sessions */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Recent Generation Sessions</div>
        {d.recent_sessions.length === 0
          ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>No generation sessions recorded yet. Generate test cases to start collecting data.</div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, fontFamily: mono, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {["Session", "Requirement", "Depth", "TCs", "✓", "✗", "By", "Date"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: COLORS.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.recent_sessions.map((s, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                      <td style={{ padding: "8px 10px", color: COLORS.accent, fontWeight: 600 }}>{s.session_id}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textBright }}>{s.req_id}{s.req_title ? ` — ${s.req_title}` : ""}</td>
                      <td style={{ padding: "8px 10px" }}><Badge color="accent">{s.depth}</Badge></td>
                      <td style={{ padding: "8px 10px", color: COLORS.text }}>{s.tc_count}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.green }}>{s.approved_count}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.red }}>{s.rejected_count}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textMuted }}>{s.generated_by}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textMuted }}>{s.created_at?.slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Card>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Feedback Tab
  // ═══════════════════════════════════════════════════════════════════

  const renderFeedback = () => {
    const fb = d.feedback;
    const totalEvents = fb.unprocessed_count;
    const editFields = Object.entries(fb.field_edit_counts).sort((a, b) => b[1] - a[1]);
    const maxFieldCount = editFields.length > 0 ? editFields[0][1] : 1;

    return <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat COLORS={COLORS} label="Unprocessed Events" value={totalEvents} color="accent" sub="Awaiting aggregation" />
        {fb.event_totals.map(et => (
          <Stat key={et.event_type} COLORS={COLORS} label={et.event_type.replace(/_/g, " ")} value={et.count}
            color={et.event_type.includes("approved") ? "green" : et.event_type === "rejected" ? "red" : "amber"} />
        ))}
      </div>

      {/* Field edit frequency */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Most Edited Fields</div>
        {editFields.length === 0
          ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No edit data yet — approve some test cases with changes to see patterns.</div>
          : editFields.map(([field, count]) => (
              <div key={field} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, width: 120 }}>{field}</span>
                <div style={{ flex: 1, height: 8, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(count / maxFieldCount) * 100}%`, height: "100%", background: COLORS.accent, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: mono, color: COLORS.textMuted, minWidth: 40, textAlign: "right" }}>{count}×</span>
              </div>
            ))
        }
      </Card>

      {/* Top rejection reasons */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Top Rejection Reasons</div>
        {fb.top_rejection_reasons.length === 0
          ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No rejections recorded yet.</div>
          : fb.top_rejection_reasons.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
                <span style={{ fontSize: 12, color: COLORS.text }}>{r.rejection_reason?.replace(/_/g, " ") || "No reason"}</span>
                <Badge color="red">{r.count}</Badge>
              </div>
            ))
        }
      </Card>

      {/* Depth approval rates */}
      {fb.depth_approval_rates.length > 0 && <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Approval Rate by Depth</div>
        {fb.depth_approval_rates.map((dr, i) => {
          const rate = dr.approved + dr.rejected > 0 ? Math.round((dr.approved / (dr.approved + dr.rejected)) * 100) : null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
              <Badge color="accent" style={{ width: 100, justifyContent: "center" }}>{dr.depth}</Badge>
              <div style={{ flex: 1, height: 8, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                {rate !== null && <div style={{ width: `${rate}%`, height: "100%", background: rate >= 70 ? COLORS.green : rate >= 40 ? COLORS.amber : COLORS.red, borderRadius: 4 }} />}
              </div>
              <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, color: rate >= 70 ? COLORS.green : rate >= 40 ? COLORS.amber : COLORS.red, minWidth: 50, textAlign: "right" }}>
                {rate !== null ? `${rate}%` : "—"}
              </span>
              <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, minWidth: 80, textAlign: "right" }}>{dr.approved}✓ {dr.rejected}✗</span>
            </div>
          );
        })}
      </Card>}
    </>;
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Rules Tab
  // ═══════════════════════════════════════════════════════════════════

  const renderRules = () => (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: mono }}>{rules.length} / {rulesMeta?.max_rules || 25} rules</div>
        <Button small onClick={() => { setShowAddRule(!showAddRule); setEditingRule(null); setRuleError(""); }}>
          {showAddRule ? "Cancel" : "+ Add Rule"}
        </Button>
      </div>

      {ruleError && <div style={{ fontSize: 12, color: COLORS.red, marginBottom: 12 }}>{ruleError}</div>}

      {/* Add rule form */}
      {showAddRule && <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 12 }}>New Adaptive Rule</div>
        <div style={{ marginBottom: 10 }}>
          <Input label="Rule Text" value={newRule.ruleText} onChange={v => setNewRule(p => ({ ...p, ruleText: v }))} textarea placeholder="When generating for [context], always [instruction]..." />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <Select label="Category" value={newRule.category} onChange={v => setNewRule(p => ({ ...p, category: v }))} options={(rulesMeta?.categories || ["general"]).map(c => ({ value: c, label: c }))} style={{ flex: 1 }} />
          <Select label="Scope" value={newRule.scope} onChange={v => setNewRule(p => ({ ...p, scope: v }))} options={(rulesMeta?.scopes || ["all"]).map(s => ({ value: s, label: s }))} style={{ flex: 1 }} />
        </div>
        <Button onClick={createRule}>Create Rule</Button>
      </Card>}

      {/* Rules list */}
      {rules.length === 0
        ? <Card><div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>No adaptive rules yet. Rules are created from feedback patterns or manually above.</div></Card>
        : rules.map(rule => (
          <Card key={rule.rule_id} style={{ marginBottom: 10 }}>
            {editingRule?.rule_id === rule.rule_id ? (
              /* Editing mode */
              <>
                <div style={{ marginBottom: 10 }}>
                  <Input label="Rule Text" value={editingRule.rule_text} onChange={v => setEditingRule(p => ({ ...p, rule_text: v }))} textarea />
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <Select label="Category" value={editingRule.category} onChange={v => setEditingRule(p => ({ ...p, category: v }))} options={(rulesMeta?.categories || []).map(c => ({ value: c, label: c }))} style={{ flex: 1 }} />
                  <Select label="Scope" value={editingRule.scope} onChange={v => setEditingRule(p => ({ ...p, scope: v }))} options={(rulesMeta?.scopes || []).map(s => ({ value: s, label: s }))} style={{ flex: 1 }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button small onClick={saveRuleEdit}>Save</Button>
                  <Button small variant="secondary" onClick={() => setEditingRule(null)}>Cancel</Button>
                </div>
              </>
            ) : (
              /* Display mode */
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: COLORS.accent }}>{rule.rule_id}</span>
                      <Badge color="purple">{rule.category}</Badge>
                      {rule.scope !== "all" && <Badge color="amber">{rule.scope}</Badge>}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{rule.rule_text}</div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>
                      <span>confidence: {rule.effective_confidence?.toFixed(3) ?? "—"}</span>
                      <span>observations: {rule.observation_count}</span>
                      <span>reinforced: {rule.last_reinforced_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <Button small variant="ghost" onClick={() => { setEditingRule({ ...rule }); setShowAddRule(false); setRuleError(""); }}>Edit</Button>
                    <Button small variant="danger" onClick={() => deleteRule(rule.rule_id)}>Delete</Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        ))
      }
    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Exemplars Tab
  // ═══════════════════════════════════════════════════════════════════

  const renderExemplars = () => (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat COLORS={COLORS} label="Exemplar Pool" value={d.exemplars.total} color="purple" sub={`of ${d.exemplars.max} max`} />
        <Stat COLORS={COLORS} label="Auto-Selected" value={d.exemplars.system_selected} color="accent" sub="Approved unchanged" />
        <Stat COLORS={COLORS} label="Manual" value={d.exemplars.manual_selected} color="green" sub="Curated by team" />
      </div>

      {/* Type distribution */}
      {d.exemplars.by_type.length > 0 && <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 10 }}>By Test Type</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.exemplars.by_type.map(t => (
            <Badge key={t.test_type} color="purple">{t.test_type}: {t.count}</Badge>
          ))}
        </div>
      </Card>}

      {/* Exemplar list */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Exemplar Test Cases</div>
        {exemplars.length === 0
          ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
              No exemplars yet. Test cases approved without edits are candidates for auto-promotion.
            </div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, fontFamily: mono, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {["TC ID", "Title", "Type", "Depth", "Selected By", "Date", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: COLORS.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exemplars.map((e, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                      <td style={{ padding: "8px 10px", color: COLORS.accent, fontWeight: 600 }}>{e.tc_id}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textBright }}>{e.title || "—"}</td>
                      <td style={{ padding: "8px 10px" }}><Badge color="purple">{e.tc_type || e.test_type || "—"}</Badge></td>
                      <td style={{ padding: "8px 10px", color: COLORS.text }}>{e.depth}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textMuted }}>{e.selected_by}</td>
                      <td style={{ padding: "8px 10px", color: COLORS.textMuted }}>{e.curated_at?.slice(0, 10)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <Button small variant="danger" onClick={() => removeExemplar(e.tc_id)}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Card>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: System Tab (Admin only)
  // ═══════════════════════════════════════════════════════════════════

  const renderSystem = () => (
    <>
      {/* Health status */}
      {health && <>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <Stat COLORS={COLORS} label="Feedback Events" value={health.feedback_events.total} color="accent" sub={`${health.feedback_events.unprocessed} unprocessed`} />
          <Stat COLORS={COLORS} label="Pending Snapshots" value={health.snapshots_pending} color="amber" sub="Awaiting review" />
          <Stat COLORS={COLORS} label="Active Rules" value={`${health.rules.active} / ${health.rules.max}`} color="purple" sub={`${health.rules.total} total`} />
          <Stat COLORS={COLORS} label="Exemplars" value={health.exemplars} color="green" />
          <Stat COLORS={COLORS} label="Sessions" value={health.generation_sessions} color="accent" />
          <Stat COLORS={COLORS} label="Evidence Links" value={health.evidence_links} color="textMuted" />
        </div>

        {/* Model version */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 10 }}>Model Version</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <span style={{ fontFamily: mono, color: COLORS.text }}>{health.model_version.current_model}</span>
            {health.model_version.needs_reset
              ? <Badge color="amber">DRIFT DETECTED</Badge>
              : <Badge color="green">IN SYNC</Badge>
            }
          </div>
          {health.model_version.needs_reset && <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
              Rules were created with {health.model_version.rule_model}. Current model is {health.model_version.current_model}. Reset will halve all rule confidences.
            </div>
            <Button small variant="danger" onClick={resetModel}>Reset Rule Confidence</Button>
          </div>}
        </Card>
      </>}

      {/* Maintenance */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>Maintenance</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Prune old data, clear stale snapshots, remove orphaned records</div>
          </div>
          <Button onClick={runMaintenance} disabled={runningMaintenance}>
            {runningMaintenance ? "Running..." : "Run Maintenance"}
          </Button>
        </div>

        {maintenanceResult && !maintenanceResult.error && <div style={{
          marginTop: 12, padding: 14, background: COLORS.surface, borderRadius: 6,
          border: `1px solid ${COLORS.green}33`, fontSize: 12, fontFamily: mono,
        }}>
          <div style={{ color: COLORS.green, fontWeight: 600, marginBottom: 8 }}>Maintenance Complete — {maintenanceResult.ran_at?.slice(0, 19)}</div>
          <div style={{ color: COLORS.text, lineHeight: 1.8 }}>
            Feedback pruned: {maintenanceResult.feedback_pruned} · 
            Snapshots cleared: {maintenanceResult.snapshots_cleared} · 
            Exemplars pruned: {maintenanceResult.exemplars_pruned + maintenanceResult.rejected_exemplars_pruned} · 
            Evidence pruned: {maintenanceResult.evidence_pruned}
          </div>
        </div>}
        {maintenanceResult?.error && <div style={{ marginTop: 12, fontSize: 12, color: COLORS.red }}>{maintenanceResult.error}</div>}
      </Card>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Adaptive Learning Engine</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>AL-002 · AL-003 · AL-004</p>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} COLORS={COLORS} />

      {tab === "overview" && renderOverview()}
      {tab === "feedback" && renderFeedback()}
      {tab === "rules" && renderRules()}
      {tab === "exemplars" && renderExemplars()}
      {tab === "system" && renderSystem()}
    </div>
  );
};