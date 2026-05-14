// ═══════════════════════════════════════════════════════════════════════════
// UrlErrorsBanner — surfaces URLs that failed to fetch during seeding
// ═══════════════════════════════════════════════════════════════════════════
//
// Reads url_errors out of job.input_summary. Renders nothing if absent or
// empty. Collapsed by default; click to expand the per-URL failure list.

import { useState } from "react";
import { useTheme, mono } from "../../theme";
import { Card } from "../shared";

export const UrlErrorsBanner = ({ job }) => {
  const COLORS = useTheme();
  const [expanded, setExpanded] = useState(false);

  const errors = job?.input_summary?.url_errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const count = errors.length;

  return (
    <Card
      style={{
        marginBottom: 16,
        padding: 12,
        borderColor: COLORS.amber,
        background: COLORS.amberDim || "transparent",
      }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: "transparent", border: "none", padding: 0,
          cursor: "pointer", width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: COLORS.amber, fontSize: 13, fontWeight: 600, fontFamily: mono,
        }}
      >
        <span>
          ⚠ {count} URL{count === 1 ? "" : "s"} couldn't be fetched
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          {expanded ? "Hide ▲" : "Show details ▼"}
        </span>
      </button>

      {expanded && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${COLORS.border}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontFamily: mono, fontSize: 11 }}>
              <div style={{ color: COLORS.text, wordBreak: "break-all" }}>
                {e.url}
              </div>
              <div style={{ color: COLORS.textMuted, marginTop: 2 }}>
                {e.error}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};