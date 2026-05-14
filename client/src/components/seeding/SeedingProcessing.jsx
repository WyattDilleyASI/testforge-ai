// ═══════════════════════════════════════════════════════════════════════════
// SeedingProcessing — Step 2 of the wizard
// ═══════════════════════════════════════════════════════════════════════════
//
// Displayed while the job is in 'extracting' or 'cross_referencing' status.
// Polling is handled by the parent SeedingView; this component just renders
// whatever state the job is in. When status flips to 'review', the parent
// swaps in SeedingReview.

import { useTheme, mono } from "../../theme";
import { Card, Button } from "../shared";
import { UrlErrorsBanner } from "./UrlErrorsBanner";

export const SeedingProcessing = ({ job, onCancel, onBack }) => {
  const COLORS = useTheme();
  const summary = job.input_summary || {};
  const chunks = Array.isArray(summary.chunks) ? summary.chunks : [];
  const created = new Date(job.created_at);

  const passes = [
    {
      key: "extract",
      label: "Pass 1 — Extraction",
      description: "Identifying candidate KB entries from source material",
      state:
        job.status === "extracting"        ? "running"  :
        job.status === "cross_referencing" ? "complete" :
        job.status === "review"            ? "complete" :
        job.status === "completed"         ? "complete" :
        "pending",
    },
    {
      key: "xref",
      label: "Pass 2 — Cross-reference",
      description: "Suggesting requirement links for each candidate",
      state:
        job.status === "extracting"        ? "pending"  :
        job.status === "cross_referencing" ? "running"  :
        job.status === "review"            ? "complete" :
        job.status === "completed"         ? "complete" :
        "pending",
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: "transparent", border: "none", color: COLORS.textMuted,
              cursor: "pointer", fontSize: 12, padding: 4, fontFamily: mono,
            }}
          >
            ← Back
          </button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
              {job.job_id} · Processing
            </h2>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
              Started {created.toLocaleString()} by {job.created_by}
            </p>
          </div>
        </div>
        <Button onClick={onCancel}>Cancel job</Button>
      </div>

      <UrlErrorsBanner job={job} />

      <Card style={{ padding: 20, marginBottom: 16 }}>
        <SectionLabel COLORS={COLORS}>Input summary</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <Stat label="Chunks" value={chunks.length || "—"} COLORS={COLORS} />
          <Stat label="Total characters" value={(summary.total_chars || 0).toLocaleString()} COLORS={COLORS} />
          <Stat label="Source types" value={(summary.source_types || []).join(", ") || "—"} COLORS={COLORS} />
        </div>
      </Card>

      {passes.map((pass) => (
        <Card key={pass.key} style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <StateBadge state={pass.state} COLORS={COLORS} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright }}>
                  {pass.label}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                  {pass.description}
                </div>
              </div>
            </div>
            {pass.state === "running" && <Spinner COLORS={COLORS} />}
          </div>
        </Card>
      ))}

      <Card style={{ padding: 16, background: COLORS.surface, border: `1px dashed ${COLORS.border}` }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: mono, textAlign: "center" }}>
          Batch API typically completes in 2–10 minutes. You can leave this page —
          the job continues in the background. Auto-refreshing every 10 seconds.
        </div>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, COLORS }) => (
  <div>
    <div style={{
      fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
      fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
      marginBottom: 4,
    }}>
      {label}
    </div>
    <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.textBright }}>
      {value}
    </div>
  </div>
);

const StateBadge = ({ state, COLORS }) => {
  const config = {
    pending:  { fg: COLORS.textMuted, bg: "transparent",            label: "Pending",  border: COLORS.border },
    running:  { fg: COLORS.amber,     bg: COLORS.amberDim  || "transparent", label: "Running",  border: COLORS.amber },
    complete: { fg: COLORS.green,     bg: COLORS.greenDim  || "transparent", label: "Complete", border: COLORS.green },
  }[state] || { fg: COLORS.textMuted, bg: "transparent", label: state, border: COLORS.border };

  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: mono,
      textTransform: "uppercase", letterSpacing: "0.06em",
      color: config.fg, background: config.bg,
      padding: "3px 8px", borderRadius: 4,
      border: `1px solid ${config.border}`,
    }}>
      {config.label}
    </span>
  );
};

const Spinner = ({ COLORS }) => (
  <div style={{
    width: 16, height: 16,
    border: `2px solid ${COLORS.border}`,
    borderTopColor: COLORS.amber,
    borderRadius: "50%",
    animation: "tf-spin 0.8s linear infinite",
  }}>
    <style>{`@keyframes tf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

const SectionLabel = ({ COLORS, children }) => (
  <div style={{
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 12,
  }}>
    {children}
  </div>
);
