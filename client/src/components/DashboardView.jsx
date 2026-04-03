import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, ReqIdTag } from "./shared";

export const DashboardView = ({ requirements, testCases, kbEntries, tokenUsage }) => {
  const COLORS = useTheme();

  // ── Section data for KB breakdown ───────────────────────────────────────
  const [sections, setSections] = useState([]);

  const refreshSections = useCallback(async () => {
    try { setSections(await api.getKbSections()); } catch { /* silent — dashboard is non-critical */ }
  }, []);

  useEffect(() => { refreshSections(); }, [refreshSections]);

  // ── Existing coverage metrics ───────────────────────────────────────────
  const covered = requirements.filter(r => testCases.some(tc => (tc.linked_req_ids || []).includes(r.req_id)));
  const untested = requirements.filter(r => !testCases.some(tc => (tc.linked_req_ids || []).includes(r.req_id)));
  const coveragePct = requirements.length ? Math.round((covered.length / requirements.length) * 100) : 0;
  const reviewed = testCases.filter(tc => tc.status === "Reviewed").length;
  const drafts = testCases.filter(tc => tc.status === "Draft").length;

  // ── KB section breakdown ────────────────────────────────────────────────
  const totalKbEntries = kbEntries.length;
  const maxEntries = Math.max(1, ...sections.map(sec => {
    if (sec.is_default) return sec.entry_count || 0;
    return (sec.subsections || []).reduce((sum, s) => sum + (s.entry_count || 0), 0);
  }));

  const Stat = ({ label, value, color, sub, reqId }) => (
    <Card style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}><span>{label}</span>{reqId && <span style={{ color: COLORS.accent, opacity: 0.6 }}>{reqId}</span>}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: COLORS[color] || COLORS.textBright, fontFamily: mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{sub}</div>}
    </Card>
  );

  return <div>
    <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Requirements Coverage Dashboard</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>REQ RS-007</p></div>

    {/* Top-level stats */}
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
      <Stat label="Coverage" value={`${coveragePct}%`} color={coveragePct > 70 ? "green" : coveragePct > 40 ? "amber" : "red"} sub={`${covered.length} of ${requirements.length} REQs`} reqId="RS-007" />
      <Stat label="TC Drafts" value={drafts} color="amber" sub="Awaiting review" reqId="TC-003a" />
      <Stat label="TC Reviewed" value={reviewed} color="green" sub="Engineer-approved" reqId="TC-003a" />
      <Stat label="KB Entries" value={kbEntries.length} color="purple" sub={`${kbEntries.reduce((s, e) => s + (e.usage_count || 0), 0)} usages`} reqId="KB-001" />
    </div>

    {/* Claude API Usage */}
    {tokenUsage && <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Claude API Usage</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Stat label="Est. Cost" value={`$${(tokenUsage.cost_usd || 0).toFixed(4)}`} color="accent" sub={`${tokenUsage.total_tokens.toLocaleString()} tokens · ${tokenUsage.input_tokens.toLocaleString()} in · ${tokenUsage.output_tokens.toLocaleString()} out`} />
        <Stat label="API Calls" value={tokenUsage.call_count} color="accent" sub="TC generation requests" />
        {tokenUsage.budget !== null
          ? <Stat label="Remaining Budget" value={tokenUsage.remaining.toLocaleString()} color={tokenUsage.remaining < tokenUsage.budget * 0.1 ? "red" : tokenUsage.remaining < tokenUsage.budget * 0.25 ? "amber" : "green"} sub={`of ${tokenUsage.budget.toLocaleString()} token budget`} />
          : <Stat label="Budget" value="No limit set" color="textMuted" sub="Set TOKEN_BUDGET in .env" />
        }
      </div>
    </div>}

    {/* KB Coverage by Section */}
    {sections.length > 0 && <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Knowledge Base by Section</div>
      <Card>
        {sections.map((sec, idx) => {
          const isDefault = sec.is_default;
          const entryCount = isDefault ? (sec.entry_count || 0) : (sec.subsections || []).reduce((sum, s) => sum + (s.entry_count || 0), 0);
          const subCount = isDefault ? 0 : (sec.subsections || []).length;
          const barPct = maxEntries > 0 ? Math.round((entryCount / maxEntries) * 100) : 0;
          const isEmpty = entryCount === 0;

          return (
            <div key={sec.section_id} style={{
              padding: "12px 0",
              borderBottom: idx < sections.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}>
              {/* Section header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: isEmpty ? COLORS.textMuted : COLORS.textBright, flex: 1 }}>
                  {sec.name}
                  {isDefault && <span style={{ fontSize: 9, fontFamily: mono, color: COLORS.purple, background: COLORS.purpleDim, padding: "1px 6px", borderRadius: 3, marginLeft: 8, fontWeight: 700 }}>DEFAULT</span>}
                </span>
                <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 700, color: isEmpty ? COLORS.textMuted : COLORS.purple, minWidth: 80, textAlign: "right" }}>
                  {entryCount} {entryCount === 1 ? "entry" : "entries"}
                </span>
              </div>

              {/* Bar + detail */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${barPct}%`,
                    height: "100%",
                    background: isEmpty ? "transparent" : COLORS.purple,
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, minWidth: 100, textAlign: "right" }}>
                  {isDefault ? (isEmpty ? "No entries" : `${entryCount} uncategorized`) : `${subCount} subsection${subCount !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Subsection breakdown (non-default sections with subsections) */}
              {!isDefault && subCount > 0 && (
                <div style={{ marginTop: 8, paddingLeft: 12 }}>
                  {(sec.subsections || []).map(sub => {
                    const subEmpty = (sub.entry_count || 0) === 0;
                    return (
                      <div key={sub.subsection_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                        <span style={{ fontSize: 11, color: subEmpty ? COLORS.textMuted : COLORS.text, flex: 1 }}>
                          {sub.name}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: mono, color: subEmpty ? COLORS.textMuted : COLORS.purple, fontWeight: 600 }}>
                          {sub.entry_count || 0}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>}

    {/* Untested Requirements */}
    {untested.length > 0 && <Card><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.amber, marginBottom: 12 }}>Untested Requirements</div>{untested.map(r => <div key={r.req_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${COLORS.border}` }}><ReqIdTag id={r.req_id} /><span style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{r.title}</span><Badge color="amber">{r.priority}</Badge></div>)}</Card>}
  </div>;
};