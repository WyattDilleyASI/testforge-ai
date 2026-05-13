import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, mono, font } from "../theme";
import { Card, Badge, Button, Input, Select, ErrorBanner, useIsMobile, MobileWarningBanner } from "./shared";

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
  const isMobile = useIsMobile();
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
  const [showAddExemplar, setShowAddExemplar] = useState(false);
  const [newExemplarTcId, setNewExemplarTcId] = useState("");
  const [exemplarError, setExemplarError] = useState("");

  // Health state
  const [health, setHealth] = useState(null);
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [runningMaintenance, setRunningMaintenance] = useState(false);

  // Aggregation state
  const [aggregating, setAggregating] = useState(false);
  const [aggResult, setAggResult] = useState(null);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "feedback", label: "Feedback" },
    ...(isManager ? [{ key: "rules", label: "Rules" }] : []),
    ...(isManager ? [{ key: "exemplars", label: "Exemplars" }] : []),
    ...(isAdmin ? [{ key: "system", label: "System" }] : []),
    { key: "guide", label: "Guide" },
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

  const addExemplar = async () => {
    const tcId = newExemplarTcId.trim();
    if (!tcId) { setExemplarError("TC ID is required"); return; }
    try {
      setExemplarError("");
      await api.addExemplar(tcId);
      setNewExemplarTcId("");
      setShowAddExemplar(false);
      loadExemplars();
      loadDashboard();
    } catch (e) { setExemplarError(e.message); }
  };

  const removeExemplar = async (tcId) => {
    try {
      await api.removeExemplar(tcId);
      loadExemplars();
      loadDashboard();
    } catch (e) { console.error(e); }
  };

// ── Aggregation Actions ─────────────────────────────────────────────

  const runAggregation = async () => {
    setAggregating(true);
    setAggResult(null);
    try {
      const result = await api.runAggregation();
      setAggResult(result);
      if (!result.skipped) {
        loadHealth();
        loadDashboard();
        loadRules();
      }
    } catch (e) { setAggResult({ ok: false, error: e.message }); }
    finally { setAggregating(false); }
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

  // ── Accordion Component (local to AnalyticsView) ──────────────────

  const Accordion = ({ items }) => {
    const [openIndex, setOpenIndex] = useState(null);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} style={{
              border: `1px solid ${isOpen ? COLORS.accent + "44" : COLORS.border}`,
              borderRadius: 8, overflow: "hidden",
              background: isOpen ? COLORS.accentDim + "22" : COLORS.surface,
              transition: "all 0.2s ease",
            }}>
              <button onClick={() => setOpenIndex(isOpen ? null : i)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", border: "none", cursor: "pointer",
                background: "transparent", fontFamily: font, textAlign: "left",
              }}>
                <span style={{
                  fontSize: 16, color: COLORS.accent, flexShrink: 0,
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                  display: "inline-block",
                }}>▸</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, flex: 1 }}>
                  {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
                  {item.title}
                </span>
                {item.badge && (
                  <span style={{
                    fontSize: 10, fontFamily: mono, padding: "2px 8px",
                    borderRadius: 4, background: COLORS.accentDim,
                    color: COLORS.accent, fontWeight: 600,
                  }}>{item.badge}</span>
                )}
              </button>
              {isOpen && (
                <div style={{
                  padding: "0 16px 16px 44px",
                  fontSize: 13, color: COLORS.text, lineHeight: 1.8,
                }}>
                  {item.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };


  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Guide Tab
  // ═══════════════════════════════════════════════════════════════════

  const renderGuide = () => {
    const arrow = (label, color) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "0 4px" }}>
        <div style={{ fontSize: 18, color: COLORS[color] || COLORS.accent, lineHeight: 1 }}>↓</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", maxWidth: 80 }}>{label}</div>
      </div>
    );

    const loopNode = (icon, title, desc, color, highlight) => (
      <div style={{
        flex: "1 1 0", minWidth: 140, padding: "16px 14px", borderRadius: 10,
        background: highlight ? COLORS[color + "Dim"] || COLORS.accentDim : COLORS.surface,
        border: `2px solid ${COLORS[color] || COLORS.accent}${highlight ? "" : "44"}`,
        textAlign: "center", transition: "all 0.2s ease",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>{icon}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS[color] || COLORS.textBright, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>{desc}</div>
      </div>
    );

    return <>
      {/* Hero */}
      <Card style={{ marginBottom: 24, textAlign: "center", padding: "32px 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.textBright, marginBottom: 8 }}>
          Adaptive Learning Engine
        </div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, maxWidth: 600, margin: "0 auto", lineHeight: 1.8 }}>
          TestForge learns from how your team reviews test cases and uses those patterns to generate better drafts over time. No machine learning, no training data, no black boxes — just structured feedback that makes every generation smarter than the last.
        </div>
      </Card>

      {/* Visual Feedback Loop */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 6 }}>How It Works</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 20 }}>
          The engine follows a continuous cycle. Your everyday actions — approving, editing, rejecting — are the fuel.
        </div>

        {/* Loop diagram — horizontal flow */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, flexWrap: "wrap", padding: "12px 0",
        }}>
          {loopNode("⚡", "Generate", "Claude creates test case drafts using your requirements + KB context", "accent", true)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 2px" }}>
            <div style={{ fontSize: 20, color: COLORS.accent }}>→</div>
          </div>
          {loopNode("✏️", "Review", "Engineers approve, edit, or reject each draft — this is the feedback", "purple", false)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 2px" }}>
            <div style={{ fontSize: 20, color: COLORS.purple }}>→</div>
          </div>
          {loopNode("🔍", "Learn", "The engine detects patterns: which fields get edited, why TCs are rejected", "amber", false)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 2px" }}>
            <div style={{ fontSize: 20, color: COLORS.amber }}>→</div>
          </div>
          {loopNode("🎯", "Improve", "Rules & exemplars are injected into the next generation prompt", "green", true)}
        </div>

        {/* Loop-back arrow */}
        <div style={{
          textAlign: "center", marginTop: 8, padding: "8px 0",
          fontSize: 11, fontFamily: mono, color: COLORS.textMuted,
        }}>
          <span style={{ fontSize: 14, color: COLORS.green }}>↩</span>{" "}
          Improved prompts feed back into the next generation cycle
        </div>
      </Card>

      {/* What the engine is NOT */}
      <Card style={{ marginBottom: 24, borderLeft: `3px solid ${COLORS.amber}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>
              This is not machine learning
            </div>
            <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>
              The AI model (Claude) doesn't learn or change. It's stateless — every generation starts fresh.
              What <em>does</em> change is the <strong>recipe</strong>: the instructions, rules, and examples we
              include in the prompt. Think of it like a chef reading customer feedback cards and adjusting
              the recipe, not retraining their palate.
            </div>
          </div>
        </div>
      </Card>

      {/* Core Concepts — expandable */}
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 12 }}>Core Concepts</div>
      <div style={{ marginBottom: 24 }}>
        <Accordion items={[
          {
            icon: "📸", title: "Passive Feedback (Zero Extra Work)",
            badge: "AUTOMATIC",
            content: (
              <div>
                <p>Every time you review a test case, the engine silently captures what happened:</p>
                <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                  <div><span style={{ color: COLORS.green, fontWeight: 600 }}>Approved unchanged</span> — strong positive signal. The AI got it right.</div>
                  <div><span style={{ color: COLORS.amber, fontWeight: 600 }}>Approved with edits</span> — the diff between the original and your version is captured. This tells the engine exactly what needs improvement.</div>
                  <div><span style={{ color: COLORS.red, fontWeight: 600 }}>Rejected</span> — the reason category you pick tells the engine what went wrong.</div>
                </div>
                <p>You don't fill out forms or rate anything. You just review test cases like you normally would. The engine reads between the lines.</p>
              </div>
            ),
          },
          {
            icon: "📏", title: "Adaptive Rules",
            badge: isManager ? "YOU CAN MANAGE THESE" : "AUTO-MANAGED",
            content: (
              <div>
                <p>Rules are concise instructions that get injected into the generation prompt. They're the "lessons learned" from reviewer feedback. Examples:</p>
                <div style={{
                  padding: "10px 14px", background: COLORS.surface, borderRadius: 6,
                  margin: "10px 0", fontSize: 12, fontStyle: "italic", lineHeight: 1.8,
                  color: COLORS.textMuted, borderLeft: `2px solid ${COLORS.accent}`,
                }}>
                  "When generating for numeric input requirements, always include boundary tests at min-1, min, max, max+1."
                  <br />
                  "Avoid preconditions that assume a specific user role unless the requirement explicitly specifies one."
                </div>
                <p>Rules have a <strong>confidence score</strong> that decays over time. If a rule isn't reinforced by new feedback, it fades out naturally. There's a hard cap of 25 rules to prevent prompt bloat.</p>
                {isManager && <p style={{ color: COLORS.accent, fontWeight: 600 }}>As an {currentUser?.role}, you can create, edit, and delete rules in the Rules tab.</p>}
              </div>
            ),
          },
          {
            icon: "⭐", title: "Exemplar Test Cases",
            badge: "FEW-SHOT EXAMPLES",
            content: (
              <div>
                <p>Exemplars are "gold standard" test cases — ones that reviewers approved without making any changes. They get injected into the generation prompt as concrete examples of what good looks like.</p>
                <p>Research shows that combining written rules with real examples produces better AI output than either approach alone. Rules say <em>"do this differently."</em> Exemplars show <em>"here's what good looks like."</em></p>
                <p>Each exemplar costs roughly 300–500 input tokens. At 2–3 exemplars per generation, that's a small premium that pays for itself by reducing regeneration rates.</p>
                {isManager && <p style={{ color: COLORS.accent, fontWeight: 600 }}>Manage the exemplar pool in the Exemplars tab.</p>}
              </div>
            ),
          },
          {
            icon: "⏳", title: "Confidence Decay & Data Retention",
            content: (
              <div>
                <p>The engine is designed to stay sharp, not accumulate cruft:</p>
                <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                  <div><strong>Rule confidence</strong> decays with a 45-day half-life. Rules that aren't reinforced by new feedback gradually lose influence.</div>
                  <div><strong>Feedback events</strong> are retained for 90 days, then pruned. Generation session summaries are kept indefinitely for trend data.</div>
                  <div><strong>Snapshots</strong> (the original generated state of a TC) are cleared 7 days after review. The diff has already been captured.</div>
                  <div><strong>Model version reset</strong> — when the underlying AI model changes, all rule confidences are halved. Old rules need to re-prove themselves against the new model's behavior.</div>
                </div>
              </div>
            ),
          },
          {
            icon: "📊", title: "Contextual Hints (Before Generation)",
            content: (
              <div>
                <p>When you select a requirement on the Generate page, the engine checks its history. If previous generations exist for that requirement, you'll see a hint banner showing:</p>
                <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                  <div>• How many prior generations exist</div>
                  <div>• The approval rate (color-coded: green ≥ 70%, amber ≥ 40%, red below)</div>
                  <div>• Which fields engineers edit most often (e.g., "preconditions edited 60% of the time")</div>
                </div>
                <p>This helps you decide whether to adjust KB context, change depth, or add focus areas before generating.</p>
              </div>
            ),
          },
        ]} />
      </div>

      {/* Role-specific guidance */}
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 12 }}>What Should I Do?</div>
      <Accordion items={[
        {
          icon: "🔧", title: "I'm a QA Engineer",
          badge: "MOST IMPORTANT",
          content: (
            <div>
              <p><strong>You are the engine's primary input.</strong> Every edit you make and every rejection reason you select teaches the system. Here's how to maximize your impact:</p>
              <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                <div><strong>Edit before approving</strong> — Don't just reject a so-so test case. Fix it and approve it. The diff between the original and your version is the highest-quality feedback the engine receives.</div>
                <div><strong>Pick rejection reasons carefully</strong> — When you do reject, the category you select matters. "Missing edge case" teaches something different than "Doesn't test the requirement."</div>
                <div><strong>Check the hint banner</strong> — Before generating, glance at the Generation History hint on the Generate page. If preconditions keep getting edited, maybe the KB needs better environment context.</div>
              </div>
              <p>That's it. No forms, no dashboards, no extra steps. Just review test cases like you normally would.</p>
            </div>
          ),
        },
        {
          icon: "📋", title: "I'm a QA Manager",
          content: (
            <div>
              <p>You have access to the <strong>Rules</strong> and <strong>Exemplars</strong> tabs. Here's how to use them:</p>
              <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                <div><strong>Monitor the Feedback tab</strong> — Check which fields get edited most and what the top rejection reasons are. If "incomplete steps" keeps appearing, consider adding a rule about step detail.</div>
                <div><strong>Create rules proactively</strong> — If you know your domain has specific testing patterns (e.g., "always test timeout behavior for network operations"), add them as rules before waiting for feedback to surface them.</div>
                <div><strong>Curate exemplars</strong> — Promote your best test cases to the exemplar pool. A well-chosen exemplar is worth more than several rules.</div>
                <div><strong>Review the Overview tab monthly</strong> — Watch your approval rate trend. If it's climbing, the engine is working. If it's flat, you may need to add or refine rules.</div>
              </div>
            </div>
          ),
        },
        {
          icon: "⚙️", title: "I'm an Admin",
          content: (
            <div>
              <p>You have everything a QA Manager does, plus the <strong>System</strong> tab:</p>
              <div style={{ padding: "10px 14px", background: COLORS.surface, borderRadius: 6, margin: "10px 0", fontSize: 12, lineHeight: 2 }}>
                <div><strong>Run aggregation when feedback accumulates</strong> — This is the key action. When unprocessed feedback events build up (minimum 5), hit "Run Aggregation" to analyze patterns and synthesize adaptive rules via Claude. The engine looks at which fields get edited most, what gets rejected, and which generation depths perform best — then creates or reinforces rules automatically. Each run costs roughly $0.03–0.05 in tokens.</div>
                <div><strong>Review what aggregation created</strong> — After running, the results panel shows each new or reinforced rule with Claude's reasoning. Check the Rules tab to verify the new rules make sense. You can edit or delete any rule that doesn't fit.</div>
                <div><strong>Run maintenance periodically</strong> — Hit "Run Maintenance" monthly (or more often during heavy use). It prunes old processed feedback, clears stale snapshots, and removes orphaned records. This is cleanup — it does not create rules or process feedback.</div>
                <div><strong>Watch for model drift</strong> — When the AI model in .env changes (e.g., a new Claude version), the System tab will show "DRIFT DETECTED." Reset rule confidence so old rules re-prove themselves against the new model.</div>
                <div><strong>Monitor health numbers</strong> — Unprocessed feedback events should stay manageable. If they pile up past 50+, run aggregation. If snapshots pile up, engineers aren't reviewing their drafts.</div>
              </div>
              <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>
                <strong>Typical cadence:</strong> Run aggregation whenever you see 10+ unprocessed events (roughly every 1–2 weeks during active use). Run maintenance monthly. Check for model drift after any .env update.
              </p>
            </div>
          ),
        },
      ]} />
    </>;
  };

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

      {/* Add exemplar toggle + form */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: mono }}>
          {exemplars.length} / {d.exemplars.max} exemplars
        </div>
        <Button small onClick={() => { setShowAddExemplar(!showAddExemplar); setExemplarError(""); }}>
          {showAddExemplar ? "Cancel" : "+ Add Exemplar"}
        </Button>
      </div>

      {exemplarError && <div style={{ fontSize: 12, color: COLORS.red, marginBottom: 12 }}>{exemplarError}</div>}

      {showAddExemplar && <Card glow style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 12 }}>Promote Test Case to Exemplar</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          Enter the ID of a reviewed test case to add it to the exemplar pool.
          Exemplars are injected as few-shot examples into future generation prompts.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Test Case ID"
              value={newExemplarTcId}
              onChange={v => setNewExemplarTcId(v)}
              mono
              placeholder="e.g. TC-RS-001-001"
            />
          </div>
          <Button onClick={addExemplar} disabled={!newExemplarTcId.trim()}>
            Add to Pool
          </Button>
        </div>
      </Card>}

      {/* Exemplar list */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 14 }}>Exemplar Test Cases</div>
        {exemplars.length === 0
          ? <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
              No exemplars yet. Test cases approved without edits are auto-promoted, or use the button above to add manually.
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

      {/* Aggregation */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: aggResult ? 0 : undefined }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>Aggregation</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              Analyze {health?.feedback_events?.unprocessed || 0} unprocessed feedback events, synthesize adaptive rules via Claude
            </div>
          </div>
          <Button
            onClick={runAggregation}
            disabled={aggregating || (health?.feedback_events?.unprocessed || 0) === 0}
          >
            {aggregating ? "Analyzing..." : "Run Aggregation"}
          </Button>
        </div>

        {aggResult && (
          <div style={{
            marginTop: 12, padding: 14, background: COLORS.surface, borderRadius: 6,
            border: `1px solid ${aggResult.error ? COLORS.red : aggResult.skipped ? COLORS.yellow : COLORS.green}33`,
            fontSize: 12, fontFamily: mono,
          }}>
            {aggResult.error ? (
              <div style={{ color: COLORS.red }}>{aggResult.error}</div>
            ) : aggResult.skipped ? (
              <div style={{ color: COLORS.yellow }}>{aggResult.reason}</div>
            ) : (
              <>
                <div style={{ color: COLORS.green, fontWeight: 600, marginBottom: 8 }}>
                  Aggregation Complete — {aggResult.ran_at?.slice(0, 19)}
                </div>
                <div style={{ color: COLORS.text, lineHeight: 1.8 }}>
                  Events processed: {aggResult.events_processed} ·
                  Rules created: {aggResult.rules_created} ·
                  Rules reinforced: {aggResult.rules_reinforced} ·
                  Tokens: {aggResult.token_usage?.input_tokens || 0} in / {aggResult.token_usage?.output_tokens || 0} out
                </div>
                {aggResult.rules?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.border}33`, paddingTop: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
                      Rule Details
                    </div>
                    {aggResult.rules.map((r, i) => (
                      <div key={i} style={{ marginBottom: 6, lineHeight: 1.6 }}>
                        <span style={{ color: r.action === "created" ? COLORS.green : COLORS.accent, fontWeight: 600 }}>
                          {r.action === "created" ? "NEW" : "REINFORCED"}
                        </span>
                        {" "}<span style={{ color: COLORS.textBright }}>{r.rule_id}</span>
                        {" — "}<span style={{ color: COLORS.text }}>{r.rule_text}</span>
                        {r.reasoning && (
                          <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2, paddingLeft: 12 }}>
                            ↳ {r.reasoning}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

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
      {isMobile && (
        <MobileWarningBanner message="Charts and data tables are best viewed on a larger screen. Some content may be cramped on mobile." />
      )}
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
      {tab === "guide" && renderGuide()}
    </div>
  );
};