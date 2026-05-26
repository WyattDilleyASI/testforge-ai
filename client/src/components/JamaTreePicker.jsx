// JamaTreePicker — shared destination-picker UI for Jama exports.
//
// Extracted from JamaImportView so both the import side (which used to
// host this for testing) and the export side can render the same tree
// UI from the cached jama_project_trees payload. The picker is purely
// visual; the caller wires it to whatever destination-saving flow it
// needs (e.g. "save as default destination on this export profile").

import { useTheme, mono } from "../theme";
import { Button } from "./shared";

export const JamaTreePicker = ({
  T: TProp,
  profile,
  tree,
  expanded,
  selected,
  onToggleExpand,
  onSelectNode,
  onCancel,
  onConfirm,
  // Override the default copy when the caller's flow is something other
  // than "pick a destination for test cases exported from <profile>".
  intro,
  confirmLabel = "Use this destination",
}) => {
  const T = TProp || useTheme();
  const setSelected = selected && selected.type === "set";

  return (
    <div>
      {intro ?? (
        <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>
          Pick a destination for test cases exported from <strong>{profile?.name}</strong>.
        </div>
      )}
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        Only <span style={{ color: T.green, fontWeight: 600 }}>green "Set" nodes</span> are valid
        destinations. Click folders / components to expand them.
      </div>

      {!tree ? (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
          Loading tree...
        </div>
      ) : (
        <div style={{
          maxHeight: 420, overflowY: "auto", padding: "6px 4px",
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
          marginBottom: 12, fontFamily: mono, fontSize: 12,
        }}>
          <TreeNodeRow
            T={T}
            node={tree}
            level={0}
            expanded={expanded}
            selected={selected}
            onToggleExpand={onToggleExpand}
            onSelectNode={onSelectNode}
          />
        </div>
      )}

      {selected && (
        <div style={{
          marginBottom: 12, padding: "10px 12px",
          background: setSelected ? T.greenDim : T.amberDim,
          borderRadius: 6,
          border: `1px solid ${(setSelected ? T.green : T.amber)}33`,
        }}>
          <div style={{ fontSize: 11, color: setSelected ? T.green : T.amber, fontWeight: 600 }}>
            {setSelected ? "Selected destination" : "Not a valid destination"}
          </div>
          <div style={{ fontSize: 12, color: T.text, marginTop: 4 }}>
            {selected.name}
            <span style={{ color: T.textMuted, marginLeft: 8, fontSize: 11 }}>
              ({selected.icon_title} · {selected.jama_id})
            </span>
          </div>
          {!setSelected && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              Pick a Set node (green) to enable the {confirmLabel} button.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" small onClick={onCancel}>Cancel</Button>
        <Button small onClick={onConfirm} disabled={!setSelected}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
};

// ─── Internal ─────────────────────────────────────────────────────────────

const TreeNodeRow = ({ T, node, level, expanded, selected, onToggleExpand, onSelectNode }) => {
  const isExpanded = expanded.has(node.jama_id);
  const hasChildren = (node.children || []).length > 0;
  const isSet = node.type === "set";
  const isSelected = selected?.jama_id === node.jama_id;
  const isClickable = hasChildren || isSet;

  const handleRowClick = () => {
    if (hasChildren) onToggleExpand(node.jama_id);
    if (isSet) onSelectNode(node);
  };

  const rowStyle = {
    paddingLeft: 6 + level * 16,
    paddingTop: 3,
    paddingBottom: 3,
    paddingRight: 8,
    cursor: isClickable ? "pointer" : "default",
    background: isSelected ? `${T.accent}22` : "transparent",
    borderLeft: isSelected ? `3px solid ${T.accent}` : "3px solid transparent",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    gap: 4,
    userSelect: "none",
  };

  const caret = hasChildren ? (isExpanded ? "▼" : "▶") : "·";
  const nameColor = isSet ? T.green : (node.type === "project" ? T.textBright : T.text);
  const nameWeight = isSet || node.type === "project" ? 600 : 400;

  return (
    <>
      <div style={rowStyle} onClick={handleRowClick}>
        <span style={{ color: T.textMuted, fontSize: 10, width: 12, textAlign: "center" }}>
          {caret}
        </span>
        <span style={{ color: nameColor, fontWeight: nameWeight, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name || "(unnamed)"}
        </span>
        {isSet && (
          <span style={{
            fontSize: 10, color: T.green, background: T.greenDim,
            padding: "1px 6px", borderRadius: 3, fontWeight: 600,
          }}>SET</span>
        )}
      </div>
      {isExpanded && (node.children || []).map((child) => (
        <TreeNodeRow
          key={child.jama_id}
          T={T}
          node={child}
          level={level + 1}
          expanded={expanded}
          selected={selected}
          onToggleExpand={onToggleExpand}
          onSelectNode={onSelectNode}
        />
      ))}
    </>
  );
};
