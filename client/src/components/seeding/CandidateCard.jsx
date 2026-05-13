// ═══════════════════════════════════════════════════════════════════════════
// CandidateCard — one row in the review screen, collapsed or expanded
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders three visual states based on candidate.status + expanded prop:
//   1. Pending + collapsed   — compact row, scan view
//   2. Pending + expanded    — full editor with content, tags, matches
//   3. Accepted              — dimmed row with KB-E link
//   4. Rejected              — dimmed row, struck through
//
// Edits to title/content/tags propagate via debounced auto-save on blur.
// Match selections (kept/removed) propagate immediately.

import { useState, useEffect, useRef } from "react";
import { useTheme, mono } from "../../theme";
import { KB_TYPE_CODES, KB_TYPE_COLORS } from "../../api-seeding";
import { RequirementMatch } from "./RequirementMatch";

export const CandidateCard = ({
  candidate,
  expanded,
  selected,
  readOnly,
  requirements,
  onToggleExpand,
  onToggleSelect,
  onAccept,
  onReject,
  onEdit,
}) => {
  const COLORS = useTheme();
  const code = KB_TYPE_CODES[candidate.type] || "???";
  const colors = KB_TYPE_COLORS[candidate.type] || { bg: COLORS.surface, fg: COLORS.text };
  const confidence = candidate.extraction_confidence?.toFixed(2) || "—";

  // ─── Accepted / Rejected (terminal) states ─────────────────────────────
  if (candidate.status === "accepted" || candidate.status === "edited_accepted") {
    return (
      <div style={{
        border: `1px solid ${COLORS.border}`, borderRadius: 6,
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
        opacity: 0.55, background: COLORS.surface,
      }}>
        <span style={{ color: COLORS.green, fontSize: 14 }}>✓</span>
        <span style={badgeStyle(colors)}>{code}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {candidate.title}
        </div>
        {candidate.final_kb_id && (
          <span style={{ fontSize: 11, color: COLORS.green, fontFamily: mono }}>
            → {candidate.final_kb_id}
          </span>
        )}
      </div>
    );
  }

  if (candidate.status === "rejected") {
    return (
      <div style={{
        border: `1px solid ${COLORS.border}`, borderRadius: 6,
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
        opacity: 0.45,
      }}>
        <span style={{ color: COLORS.textMuted, fontSize: 14 }}>✕</span>
        <span style={badgeStyle(colors)}>{code}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMuted, textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {candidate.title}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>rejected</span>
      </div>
    );
  }

  // ─── Pending: collapsed state ──────────────────────────────────────────
  if (!expanded) {
    const matchCount = (candidate.xref_matches || []).filter(
      (m) => m.user_decision === "kept" || m.user_decision === "manually_added"
    ).length;
    const source = candidate.source_input_ref?.source_name;
    const section = candidate.source_input_ref?.section_heading;

    return (
      <div style={{
        border: `1px solid ${COLORS.border}`, borderRadius: 6,
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
        background: COLORS.background || COLORS.surface,
      }}>
        {!readOnly && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            style={{ margin: 0 }}
          />
        )}
        <span style={{ ...badgeStyle(colors), fontWeight: 600 }}>{code} · {confidence}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {candidate.title}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, marginTop: 2 }}>
            {matchCount} req{matchCount !== 1 ? "s" : ""} linked
            {source && ` · ${source}`}
            {section && ` › "${section}"`}
          </div>
        </div>
        {!readOnly && (
          <>
            <IconButton onClick={onReject} title="Reject" COLORS={COLORS}>✕</IconButton>
            <IconButton onClick={onAccept} title="Accept" COLORS={COLORS}>✓</IconButton>
          </>
        )}
        <IconButton onClick={onToggleExpand} title="Expand" COLORS={COLORS}>▾</IconButton>
      </div>
    );
  }

  // ─── Pending: expanded state ───────────────────────────────────────────
  return (
    <ExpandedCard
      candidate={candidate}
      selected={selected}
      readOnly={readOnly}
      requirements={requirements}
      code={code}
      colors={colors}
      confidence={confidence}
      onToggleExpand={onToggleExpand}
      onToggleSelect={onToggleSelect}
      onAccept={onAccept}
      onReject={onReject}
      onEdit={onEdit}
      COLORS={COLORS}
    />
  );
};

// ─── Expanded form ──────────────────────────────────────────────────────────
const ExpandedCard = ({
  candidate, selected, readOnly, requirements,
  code, colors, confidence,
  onToggleExpand, onToggleSelect, onAccept, onReject, onEdit, COLORS,
}) => {
  // Local edit state — buffered until blur or chip action
  const [title, setTitle]     = useState(candidate.title || "");
  const [content, setContent] = useState(candidate.content || "");
  const [tags, setTags]       = useState(candidate.suggested_tags || []);
  const [newTag, setNewTag]   = useState("");
  const [addReqOpen, setAddReqOpen] = useState(false);
  const [reqSearch, setReqSearch]   = useState("");

  // Re-sync local state if the underlying candidate changes (after a save)
  useEffect(() => { setTitle(candidate.title || ""); }, [candidate.title]);
  useEffect(() => { setContent(candidate.content || ""); }, [candidate.content]);
  useEffect(() => { setTags(candidate.suggested_tags || []); }, [candidate.suggested_tags]);

  const matches = candidate.xref_matches || [];
  const linkedReqIds = new Set(
    matches
      .filter((m) => m.user_decision === "kept" || m.user_decision === "manually_added")
      .map((m) => m.req_id)
  );

  const autoApplied  = matches.filter((m) => m.auto_applied && m.user_decision === "kept").length;
  const suggested    = matches.filter((m) => !m.auto_applied && m.user_decision !== "removed").length;

  const saveField = (field, value) => {
    if (readOnly) return;
    if (candidate[field] === value) return;
    onEdit({ [field]: value });
  };

  const saveTagsAndMaybeMore = (nextTags) => {
    setTags(nextTags);
    if (readOnly) return;
    onEdit({ suggested_tags: nextTags });
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    if (tags.includes(t)) { setNewTag(""); return; }
    saveTagsAndMaybeMore([...tags, t]);
    setNewTag("");
  };

  const removeTag = (t) => {
    saveTagsAndMaybeMore(tags.filter((x) => x !== t));
  };

  const reconcileReqIds = (nextSet) => {
    if (readOnly) return;
    onEdit({ related_reqs: [...nextSet] });
  };

  const toggleMatch = (reqId, currentlyKept) => {
    const next = new Set(linkedReqIds);
    if (currentlyKept) next.delete(reqId);
    else next.add(reqId);
    reconcileReqIds(next);
  };

  const addManualReq = (reqId) => {
    const next = new Set(linkedReqIds);
    next.add(reqId);
    reconcileReqIds(next);
    setAddReqOpen(false);
    setReqSearch("");
  };

  const source = candidate.source_input_ref?.source_name;
  const section = candidate.source_input_ref?.section_heading;
  const sourceUrl = candidate.source_url;

  // Filter for the "Add requirement" picker — exclude already linked ones
  const reqOptions = (requirements || [])
    .filter((r) => !linkedReqIds.has(r.req_id))
    .filter((r) => {
      const q = reqSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        r.req_id?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.module?.toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  return (
    <div style={{
      border: `1px solid ${COLORS.borderHover || COLORS.border}`,
      borderRadius: 6, padding: "14px 16px",
      background: COLORS.background || COLORS.surface,
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {!readOnly && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ margin: 0 }} />
        )}
        <span style={{ ...badgeStyle(colors), fontWeight: 600 }}>{code} · {confidence}</span>
        <div style={{ flex: 1 }} />
        <IconButton onClick={onToggleExpand} title="Collapse" COLORS={COLORS}>▴</IconButton>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => saveField("title", title)}
        disabled={readOnly}
        style={{
          width: "100%", fontSize: 16, fontWeight: 500, height: 40,
          marginBottom: 14, padding: "8px 12px",
          color: COLORS.textBright,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          boxSizing: "border-box", outline: "none",
        }}
      />

      {/* Content */}
      <Label COLORS={COLORS}>Content</Label>
      <textarea
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => saveField("content", content)}
        disabled={readOnly}
        style={{
          width: "100%", fontSize: 13, lineHeight: 1.55, padding: 10,
          background: COLORS.surface, color: COLORS.text,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          resize: "vertical", boxSizing: "border-box", outline: "none",
          fontFamily: mono, marginBottom: 14,
        }}
      />

      {/* Tags */}
      <Label COLORS={COLORS}>Tags</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 14 }}>
        {tags.map((t) => (
          <span
            key={t}
            style={{
              background: COLORS.surface, color: COLORS.text,
              padding: "3px 8px", borderRadius: 3, fontSize: 11, fontFamily: mono,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            {t}
            {!readOnly && (
              <button
                onClick={() => removeTag(t)}
                style={{ background: "transparent", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          <>
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="+ add tag"
              style={{
                fontSize: 11, padding: "3px 8px", fontFamily: mono,
                background: "transparent", color: COLORS.text,
                border: `1px dashed ${COLORS.border}`, borderRadius: 3,
                outline: "none", width: 100,
              }}
            />
          </>
        )}
      </div>

      {/* Related requirements */}
      <Label COLORS={COLORS}>
        Related requirements · {autoApplied} auto-applied, {suggested} suggested
      </Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {matches
          .filter((m) => m.user_decision !== "removed")
          .map((match) => (
            <RequirementMatch
              key={match.match_id || match.req_id}
              match={match}
              checked={linkedReqIds.has(match.req_id)}
              onToggle={() => toggleMatch(match.req_id, linkedReqIds.has(match.req_id))}
              readOnly={readOnly}
              COLORS={COLORS}
            />
          ))}

        {!readOnly && !addReqOpen && (
          <button
            onClick={() => setAddReqOpen(true)}
            style={{
              fontSize: 11, padding: "3px 10px", alignSelf: "flex-start",
              background: "transparent", color: COLORS.textMuted,
              border: `1px solid ${COLORS.border}`, borderRadius: 4,
              cursor: "pointer", fontFamily: mono,
            }}
          >
            + Add requirement
          </button>
        )}

        {!readOnly && addReqOpen && (
          <div style={{
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            background: COLORS.surface, padding: 8,
          }}>
            <input
              autoFocus
              type="text"
              value={reqSearch}
              onChange={(e) => setReqSearch(e.target.value)}
              placeholder="Search requirements by ID, title, module…"
              style={{
                width: "100%", fontSize: 12, padding: "6px 8px",
                background: COLORS.background || COLORS.surface,
                color: COLORS.text, border: `1px solid ${COLORS.border}`,
                borderRadius: 4, outline: "none", boxSizing: "border-box",
                fontFamily: mono, marginBottom: 6,
              }}
            />
            {reqOptions.length === 0 && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, padding: 6, fontFamily: mono }}>
                {requirements?.length ? "No matches" : "Loading requirements…"}
              </div>
            )}
            {reqOptions.map((r) => (
              <div
                key={r.req_id}
                onClick={() => addManualReq(r.req_id)}
                style={{
                  padding: "5px 8px", fontSize: 12, cursor: "pointer",
                  borderRadius: 4, fontFamily: mono,
                  display: "flex", alignItems: "center", gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontWeight: 600, color: COLORS.textBright }}>{r.req_id}</span>
                <span style={{ color: COLORS.textMuted }}>{r.module}</span>
                <span style={{ color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </span>
              </div>
            ))}
            <div style={{ textAlign: "right", marginTop: 4 }}>
              <button
                onClick={() => { setAddReqOpen(false); setReqSearch(""); }}
                style={{
                  background: "transparent", border: "none",
                  color: COLORS.textMuted, cursor: "pointer",
                  fontSize: 11, fontFamily: mono, padding: 4,
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer: provenance + actions */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 14, borderTop: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sourceUrl
            ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.textMuted }}>{source || sourceUrl}</a>
            : (source || "—")}
          {section && ` › "${section}"`}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onReject}
              style={{
                fontSize: 12, padding: "5px 12px", fontFamily: mono,
                background: "transparent", color: COLORS.text,
                border: `1px solid ${COLORS.border}`, borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Reject
            </button>
            <button
              onClick={onAccept}
              style={{
                fontSize: 12, padding: "5px 14px", fontFamily: mono,
                background: COLORS.accentDim || COLORS.surface,
                color: COLORS.accent,
                border: `1px solid ${COLORS.accent}`, borderRadius: 4,
                cursor: "pointer", fontWeight: 600,
              }}
            >
              Accept
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Small reusable bits ────────────────────────────────────────────────────

const badgeStyle = (colors) => ({
  background: colors.bg, color: colors.fg,
  fontSize: 10, padding: "2px 6px", borderRadius: 3,
  fontFamily: "monospace", letterSpacing: "0.02em",
});

const Label = ({ COLORS, children }) => (
  <div style={{
    fontSize: 10, color: COLORS.textMuted, fontFamily: mono,
    textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 6,
  }}>
    {children}
  </div>
);

const IconButton = ({ onClick, title, COLORS, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    style={{
      padding: "4px 8px", minWidth: 0, fontSize: 13,
      background: "transparent", color: COLORS.textMuted,
      border: `1px solid ${COLORS.border}`, borderRadius: 4,
      cursor: "pointer", fontFamily: mono, lineHeight: 1,
    }}
  >
    {children}
  </button>
);
