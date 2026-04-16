import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input, Select, ReqIdTag, ErrorBanner, JamaImportPanel, useIsMobile } from "./shared";
import { useAsyncAction, useExpandCollapse, useInlineEdit, useSelection } from "../hooks";

export const RequirementsView = ({ requirements, refresh, currentUser }) => {
  const COLORS = useTheme();
  const isMobile = useIsMobile();

  const { isExpanded, toggle: toggleExpand } = useExpandCollapse();
  const edit = useInlineEdit();
  const [runAsync, { error, clearError }] = useAsyncAction();

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ req_id: "", title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [showJamaHelp, setShowJamaHelp] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedIds: selectedReqIds, toggle: toggleReqSelect, toggleAll: selectAllReqs, isSelected, allSelected, selectMode: reqSelectMode, enterSelectMode, exitSelectMode } = useSelection(requirements, r => r.req_id);

  const canDelete = currentUser?.role === "Admin" || currentUser?.role === "QA Manager";

  const handleClearAll = async () => {
    await runAsync(async () => {
      await api.clearRequirements();
      setClearAllConfirm(false);
      refresh();
    });
  };

  const handleImportDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true); setImportMsg("");
    await runAsync(async () => {
      const result = await api.importRequirementsDoc(file);
      setImportMsg(`Imported ${result.imported} requirement(s). Auto-linked ${result.linked} test case(s).`);
      refresh();
    });
    setImporting(false);
  };

  const startAdd = () => {
    setAddForm({ req_id: `REQ-${String(requirements.length + 1).padStart(3, "0")}`, title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
    setShowAdd(true);
    edit.cancelEdit();
    setDeleteConfirm(null);
    clearError();
  };

  const startEdit = (r) => {
    if (edit.isEditing(r.req_id)) { edit.cancelEdit(); return; }
    edit.startEdit(r.req_id, {
      req_id: r.req_id, title: r.title, description: r.description || "",
      acceptanceCriteria: (r.acceptance_criteria || []).join("\n"),
      priority: r.priority, status: r.status, module: r.module || "",
    });
    setShowAdd(false);
    setDeleteConfirm(null);
    clearError();
  };

  const saveAdd = async () => {
    const data = { req_id: addForm.req_id, title: addForm.title, description: addForm.description, acceptance_criteria: addForm.acceptanceCriteria.split("\n").filter(s => s.trim()), priority: addForm.priority, status: addForm.status, module: addForm.module };
    await runAsync(async () => {
      await api.createRequirement(data);
      setShowAdd(false);
      refresh();
    });
  };

  const saveEdit = async () => {
    const data = { title: edit.editForm.title, description: edit.editForm.description, acceptance_criteria: edit.editForm.acceptanceCriteria.split("\n").filter(s => s.trim()), priority: edit.editForm.priority, status: edit.editForm.status, module: edit.editForm.module };
    await runAsync(async () => {
      await api.updateRequirement(edit.editingId, data);
      edit.cancelEdit();
      refresh();
    });
  };

  const doDelete = async (reqId) => {
    await runAsync(async () => {
      await api.deleteRequirement(reqId);
      edit.cancelEdit();
      setDeleteConfirm(null);
      refresh();
    });
  };

  const deleteSelected = async () => {
    const count = selectedReqIds.size;
    if (!window.confirm(`Delete ${count} selected requirement${count !== 1 ? "s" : ""}? Linked test cases will be orphaned.`)) return;
    await runAsync(async () => {
      await Promise.all([...selectedReqIds].map(id => api.deleteRequirement(id)));
      exitSelectMode();
      refresh();
    });
  };

  const renderForm = (form, setForm, isEdit) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Input label="REQ ID" value={form.req_id} onChange={v => setForm(p => ({ ...p, req_id: v }))} mono disabled={isEdit} />
        <Select label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))} options={["High", "Medium", "Low"].map(v => ({ value: v, label: v }))} />
        <Select label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={["Draft", "Review", "Approved", "Rejected"].map(v => ({ value: v, label: v }))} />
        <Select label="Module" value={form.module} onChange={v => setForm(p => ({ ...p, module: v }))} options={["Requirement Ingestion", "Test Case Generation", "Jama Integration", "User Management"].map(v => ({ value: v, label: v }))} />
      </div>
      <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Input label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} textarea style={{ marginBottom: 12 }} />
      <Input label="Acceptance Criteria (one per line)" value={form.acceptanceCriteria} onChange={v => setForm(p => ({ ...p, acceptanceCriteria: v }))} textarea mono style={{ marginBottom: 14 }} />
      <ErrorBanner msg={error} />
    </>
  );

  return <div>
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 0, marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Requirements</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>RS-001 – RS-006</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!reqSelectMode && <>
          {canDelete && !clearAllConfirm && requirements.length > 0 && <Button variant="danger" small onClick={() => setClearAllConfirm(true)}>Clear All</Button>}
          {clearAllConfirm && <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.red }}>Delete all {requirements.length} requirements?</span>
            <Button variant="danger" small onClick={handleClearAll}>Confirm</Button>
            <Button variant="ghost" small onClick={() => setClearAllConfirm(false)}>Cancel</Button>
          </div>}
          <Button variant="secondary" small onClick={() => setShowJamaHelp(v => !v)} disabled={importing}>
            {importing ? "Importing..." : "Import JAMA Requirements"}
          </Button>
          {canDelete && requirements.length > 0 && <Button variant="secondary" small onClick={() => { enterSelectMode(); edit.cancelEdit(); }}>Select</Button>}
          <Button onClick={startAdd}>+ Add Requirement</Button>
        </>}
        {reqSelectMode && <>
          <Button variant="secondary" small onClick={selectAllReqs}>{allSelected ? "Deselect All" : "Select All"}</Button>
          <Button variant="danger" small onClick={deleteSelected} disabled={selectedReqIds.size === 0}>Delete Selected ({selectedReqIds.size})</Button>
          <Button variant="ghost" small onClick={exitSelectMode}>Cancel</Button>
        </>}
      </div>
    </div>
    
    {/* Jama Import Help — shown when "Import JAMA Requirements" is clicked */}
    {showJamaHelp && (
      <JamaImportPanel
        title="How to export requirements from Jama"
        accept=".doc"
        importing={importing}
        steps={[
          { step: "Go to Advanced Search in Jama.", detail: "" },
          { step: "Create a new filter.", detail: "Set the match to Any of the following conditions, with Item Type equal to: Product Requirements, System Requirements, Subsystem Requirements, and Component Requirements." },
          { step: "Click View in List", detail: "to see the filtered results." },
          { step: "Click Export → View All Export Options → All Item Details.", detail: "Select Word format, check Include Relationships and Include Tags, then click Run." },
          { step: "Download the report using the link in the notification,", detail: "then upload the file below." },
        ]}
        onFile={file => { setShowJamaHelp(false); handleImportDoc({ target: { files: [file], value: "" } }); }}
        onCancel={() => setShowJamaHelp(false)}
      />
    )}

    {/* Search */}
    <div style={{ marginBottom: 16, maxWidth: 420 }}>
      <input
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search by ID, title, description, priority, or status..."
        style={{
          width: "100%", boxSizing: "border-box", background: COLORS.surface,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          color: COLORS.textBright, fontSize: 12, padding: "6px 12px",
          fontFamily: mono, outline: "none",
        }}
      />
    </div>

    {importMsg && <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>{importMsg}</div>}

    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 14 }}>Add Requirement</div>
      {renderForm(addForm, setAddForm, false)}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
        <Button onClick={saveAdd} disabled={!addForm.req_id || !addForm.title}>Save</Button>
      </div>
    </Card>}

    {(() => {
      const q = searchQuery.toLowerCase().trim();
      const filtered = !q ? requirements : requirements.filter(r => {
        if (r.req_id?.toLowerCase().includes(q)) return true;
        if (r.title?.toLowerCase().includes(q)) return true;
        if (r.description?.toLowerCase().includes(q)) return true;
        if (r.priority?.toLowerCase().includes(q)) return true;
        if (r.status?.toLowerCase().includes(q)) return true;
        if (r.module?.toLowerCase().includes(q)) return true;
        if ((r.acceptance_criteria || []).some(ac => ac.toLowerCase().includes(q))) return true;
        return false;
      });
      return filtered;
    })().map(r => {
      const expanded = isExpanded(r.req_id);
      const isEditing = edit.isEditing(r.req_id);
      const isJama = r.source === "JAMA Import";
      const SectionLabel = ({ children }) => <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 12, marginBottom: 4 }}>{children}</div>;
      const rels = r.relationships || [];
      const tcRels = rels.filter(rel => rel.group === "Verification Test Case" || rel.direction === "Downstream");
      const reqRels = rels.filter(rel => rel.group !== "Verification Test Case" && rel.direction !== "Downstream");

      return <Card key={r.req_id} style={{ marginBottom: 10, cursor: isEditing ? "default" : "pointer", borderColor: isEditing ? COLORS.accent + "44" : reqSelectMode && isSelected(r.req_id) ? COLORS.accent : undefined, boxShadow: isEditing ? `0 0 20px ${COLORS.accentGlow}` : undefined }} onClick={() => { if (reqSelectMode) { toggleReqSelect(r.req_id); return; } if (!isEditing) { edit.cancelEdit(); toggleExpand(r.req_id); } }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {reqSelectMode && <input type="checkbox" checked={isSelected(r.req_id)} onChange={() => toggleReqSelect(r.req_id)} onClick={e => e.stopPropagation()} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
          <ReqIdTag id={r.req_id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{r.title}</div>
            {!isEditing && !expanded && <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{r.description}</div>}
            {!isEditing && !expanded && (r.acceptance_criteria || []).length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase" }}>Acceptance Criteria:</span>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}` }}>• {ac}</div>)}</div>}
            {!isEditing && !expanded && rels.length > 0 && <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tcRels.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.green }}>TC: {tcRels.map(r => r.id).join(", ")}</span>}
              {reqRels.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.purple, marginLeft: tcRels.length ? 8 : 0 }}>REQ: {reqRels.map(r => r.id).join(", ")}</span>}
            </div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
            {isJama && <Badge color="purple">JAMA</Badge>}
            <Badge color={r.priority === "High" || r.priority === "Must Have" ? "red" : r.priority === "Medium" || r.priority === "Should Have" ? "amber" : "green"}>{r.priority}</Badge>
            <Badge color={r.status === "Approved" ? "green" : r.status === "Review" ? "amber" : r.status === "Rejected" ? "red" : "textMuted"}>{r.status}</Badge>
            {!isEditing && !reqSelectMode && <button onClick={e => { e.stopPropagation(); startEdit(r); }} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, fontFamily: mono, padding: "2px 6px" }}>Edit</button>}
          </div>
        </div>

        {expanded && !isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          {r.description && <><SectionLabel>Requirement (EARS)</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{r.description}</div></>}
          {r.rationale && <><SectionLabel>Rationale</SectionLabel><div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>{r.rationale}</div></>}
          {(r.acceptance_criteria || []).length > 0 && <><SectionLabel>Acceptance Criteria</SectionLabel>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}` }}>• {ac}</div>)}</>}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {r.requirement_type && <div><SectionLabel>Type</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.requirement_type}</div></div>}
            {r.verification_method && <div><SectionLabel>Verification</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.verification_method}</div></div>}
            {r.safety_level && <div><SectionLabel>Safety Level</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.safety_level}</div></div>}
            {r.scheduled_release && <div><SectionLabel>Release</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.scheduled_release}</div></div>}
            {r.global_id && <div><SectionLabel>Global ID</SectionLabel><div style={{ fontSize: 12, fontFamily: mono, color: COLORS.textMuted }}>{r.global_id}</div></div>}
            {r.source && <div><SectionLabel>Source</SectionLabel><div style={{ fontSize: 12, color: COLORS.text }}>{r.source}</div></div>}
          </div>
          {(r.requirement_context || []).length > 0 && <><SectionLabel>Requirement Context</SectionLabel>{r.requirement_context.map((ctx, i) => <div key={i} style={{ marginTop: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{ctx.field}</div>{ctx.items.map((item, j) => <div key={j} style={{ fontSize: 12, color: COLORS.text, paddingLeft: 12, marginTop: 2, borderLeft: `2px solid ${COLORS.border}` }}>• {item}</div>)}</div>)}</>}
          {(r.tags || []).length > 0 && <><SectionLabel>Tags</SectionLabel><div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>{r.tags.map((tag, i) => <span key={i} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}22` }}>{tag}</span>)}</div></>}
          {rels.length > 0 && <><SectionLabel>Relationships</SectionLabel>
            <div style={{ marginTop: 4 }}>
              {rels.map((rel, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < rels.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: rel.direction === "Downstream" ? COLORS.green : COLORS.purple }}>{rel.id}</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>
                <span style={{ fontSize: 12, color: COLORS.text, flex: 1 }}>{rel.name}</span>
                <Badge color={rel.direction === "Downstream" ? "green" : "purple"}>{rel.direction}</Badge>
                <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>{rel.group}</span>
              </div>)}
            </div>
          </>}
        </div>}

        {isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Editing</div>
          {renderForm(edit.editForm, edit.setEditForm, true)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {canDelete && deleteConfirm !== edit.editingId && (
              <Button variant="danger" small onClick={() => setDeleteConfirm(edit.editingId)} style={{ marginRight: "auto" }}>Delete</Button>
            )}
            {canDelete && deleteConfirm === edit.editingId && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
                <span style={{ fontSize: 11, color: COLORS.red }}>Delete? Linked TCs will be orphaned.</span>
                <Button variant="danger" small onClick={() => doDelete(edit.editingId)}>Confirm</Button>
                <Button variant="ghost" small onClick={() => setDeleteConfirm(null)}>No</Button>
              </div>
            )}
            <Button variant="secondary" onClick={() => edit.cancelEdit()}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!edit.editForm?.title}>Save</Button>
          </div>
        </div>}
      </Card>;
    })}
  </div>;
};
