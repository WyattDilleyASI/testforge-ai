// ═══════════════════════════════════════════════════════════════════════════
// RequirementMatch — one row in the related-requirements list
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders a single AI-suggested or auto-applied requirement link.
// Visual treatment differentiates auto-applied (filled background, badge)
// from suggested (dashed border, no badge). Justification is italicized
// and attached to its parent match via a left border.

import { mono } from "../../theme";

export const RequirementMatch = ({ match, checked, onToggle, readOnly, COLORS }) => {
  const isAuto = !!match.auto_applied;
  const isManual = match.user_decision === "manually_added";
  const conf = typeof match.confidence === "number" ? match.confidence.toFixed(2) : null;

  const containerStyle = isAuto
    ? {
        background: COLORS.surface,
        border: `1px solid transparent`,
      }
    : {
        background: "transparent",
        border: `1px dashed ${COLORS.border}`,
      };

  return (
    <label style={{
      display: "flex", gap: 8, padding: "8px 10px",
      borderRadius: 4, fontSize: 12, alignItems: "flex-start",
      cursor: readOnly ? "default" : "pointer",
      ...containerStyle,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={readOnly}
        style={{ marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: mono, fontWeight: 600,
            color: isAuto ? COLORS.textBright : COLORS.textMuted,
          }}>
            {match.req_id}
          </span>
          {match.req_module && (
            <span style={{ color: COLORS.textMuted }}>{match.req_module}</span>
          )}
          {match.req_title && (
            <span style={{
              color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", minWidth: 0, flex: 1,
            }}>
              · {match.req_title}
            </span>
          )}
          {conf && (
            <span style={{ fontFamily: mono, color: COLORS.textMuted }}>{conf}</span>
          )}
          {isAuto && (
            <span style={{
              background: "#EAF3DE", color: "#173404",
              fontSize: 10, padding: "1px 5px", borderRadius: 3, fontFamily: mono,
            }}>
              auto
            </span>
          )}
          {isManual && (
            <span style={{
              background: COLORS.accentDim || "transparent",
              color: COLORS.accent,
              fontSize: 10, padding: "1px 5px", borderRadius: 3, fontFamily: mono,
              border: `1px solid ${COLORS.accent}`,
            }}>
              manual
            </span>
          )}
          {!isAuto && !isManual && (
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono }}>
              suggested
            </span>
          )}
        </div>
        {match.justification && (
          <div style={{
            fontSize: 11, color: COLORS.textMuted, marginTop: 5,
            fontStyle: "italic", paddingLeft: 8,
            borderLeft: `2px solid ${COLORS.border}`,
            lineHeight: 1.5,
          }}>
            {match.justification}
          </div>
        )}
      </div>
    </label>
  );
};
