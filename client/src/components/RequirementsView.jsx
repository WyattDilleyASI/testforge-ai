import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input, Select, ReqIdTag, ErrorBanner, JamaImportPanel, InlineConfirm, OverflowMenu, useIsMobile } from "./shared";
// JamaImportView + JamaStalenessBanner are now rendered globally from
// App.jsx so they're available on every page, not just here.
import { useAsyncAction, useExpandCollapse, useInlineEdit, useSelection } from "../hooks";

export const RequirementsView = ({ requirements, refresh, currentUser, openJamaImport }) => {
  const COLORS = useTheme();
  const isMobile = useIsMobile();

  const { isExpanded, toggle: toggleExpand } = useExpandCollapse();
  const edit = useInlineEdit();
  const [runAsync, { error, clearError }] = useAsyncAction();

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ req_id: "", title: "", description: "", acceptanceCriteria: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
  const [hoveredReqId, setHoveredReqId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [showJamaHelp, setShowJamaHelp] = useState(false);
  const [showPrefixConfig, setShowPrefixConfig] = useState(false);
  const [customPrefixes, setCustomPrefixes] = useState(() => {
    try {
      const s = localStorage.getItem("tf_custom_prefixes");
      const parsed = s ? JSON.parse(s) : {};
      return {
        prd:    parsed.prd?.length    ? parsed.prd    : [""],
        sys:    parsed.sys?.length    ? parsed.sys    : [""],
        subsys: parsed.subsys?.length ? parsed.subsys : [""],
        cmp:    parsed.cmp?.length    ? parsed.cmp    : [""],
      };
    } catch { return { prd: [""], sys: [""], subsys: [""], cmp: [""] }; }
  });
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

  const savePrefixesAndContinue = () => {
    const cleaned = {
      prd:    customPrefixes.prd.filter(p => p.trim()),
      sys:    customPrefixes.sys.filter(p => p.trim()),
      subsys: customPrefixes.subsys.filter(p => p.trim()),
      cmp:    customPrefixes.cmp.filter(p => p.trim()),
    };
    localStorage.setItem("tf_custom_prefixes", JSON.stringify(cleaned));
    setShowPrefixConfig(false);
    setShowJamaHelp(true);
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
    await runAsync(async () => {
      await Promise.all([...selectedReqIds].map(id => api.deleteRequirement(id)));
      setBulkDeleteConfirm(false);
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
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Requirements</h2></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!reqSelectMode && !clearAllConfirm && <>
          {requirements.length > 0 && (
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ID, title, description, priority, or status..."
              style={{
                width: isMobile ? "100%" : 280, boxSizing: "border-box",
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 6, color: COLORS.textBright, fontSize: 12,
                padding: "6px 12px", fontFamily: mono, outline: "none",
              }}
            />
          )}
          {canDelete && requirements.length > 0 && <Button variant="secondary" small onClick={() => { enterSelectMode(); edit.cancelEdit(); }}>Select</Button>}
          <OverflowMenu
            items={[
              { label: "Import from Jama (browser)", onClick: () => { setShowJamaHelp(false); setShowPrefixConfig(false); openJamaImport?.(); } },
              { label: importing ? "Importing..." : "Import JAMA Requirements", onClick: () => { setShowJamaHelp(false); setShowPrefixConfig(v => !v); }, disabled: importing },
              { label: "Clear All", onClick: () => setClearAllConfirm(true), severity: "danger", hidden: !canDelete || requirements.length === 0 },
            ]}
          />
        </>}
        {!reqSelectMode && clearAllConfirm && (
          <InlineConfirm
            prompt={`Delete all ${requirements.length} requirements?`}
            onConfirm={handleClearAll}
            onCancel={() => setClearAllConfirm(false)}
          />
        )}
        {reqSelectMode && (bulkDeleteConfirm ? (
          <InlineConfirm
            prompt={`Delete ${selectedReqIds.size} selected requirement${selectedReqIds.size !== 1 ? "s" : ""}? Linked test cases will be orphaned.`}
            onConfirm={deleteSelected}
            onCancel={() => setBulkDeleteConfirm(false)}
          />
        ) : <>
          <Button variant="secondary" small onClick={selectAllReqs}>{allSelected ? "Deselect All" : "Select All"}</Button>
          {selectedReqIds.size > 0 && (
            <Button variant="danger" small onClick={() => setBulkDeleteConfirm(true)}>Delete Selected ({selectedReqIds.size})</Button>
          )}
          <Button variant="ghost" small onClick={exitSelectMode}>Cancel</Button>
        </>)}
      </div>
    </div>
    
    {/* Prefix Configuration Panel — shown before the Jama file picker */}
    {showPrefixConfig && (
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Configure Requirement ID Prefixes</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
          The default Jama type prefixes (<span style={{ fontFamily: mono }}>PRD_Rqmts</span>, <span style={{ fontFamily: mono }}>SYSRQ</span>, <span style={{ fontFamily: mono }}>SubSys_Rqmt</span>, <span style={{ fontFamily: mono }}>CMPRQ</span>) are always recognised.
          Add any <strong style={{ color: COLORS.text }}>additional</strong> type prefixes your project uses below — they will be saved and applied to the SysML traceability diagram automatically.
        </div>
        {[
          { key: "prd",    label: "Additional Product Requirement ID Prefixes",    defaultVal: "PRD_Rqmts" },
          { key: "sys",    label: "Additional System Requirement ID Prefixes",     defaultVal: "SYSRQ" },
          { key: "subsys", label: "Additional Subsystem Requirement ID Prefixes",  defaultVal: "SubSys_Rqmt" },
          { key: "cmp",    label: "Additional Component Requirement ID Prefixes",  defaultVal: "CMPRQ" },
        ].map(({ key, label, defaultVal }) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              {label}
              <span style={{ fontFamily: mono, fontWeight: 400, color: COLORS.textMuted, opacity: 0.55, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>default: {defaultVal}</span>
            </div>
            {customPrefixes[key].map((val, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                <input
                  value={val}
                  onChange={e => {
                    const updated = [...customPrefixes[key]];
                    updated[i] = e.target.value;
                    setCustomPrefixes(p => ({ ...p, [key]: updated }));
                  }}
                  placeholder={`e.g. ${defaultVal}_V2`}
                  style={{ flex: 1, fontFamily: mono, fontSize: 12, color: COLORS.textBright, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "7px 10px", outline: "none" }}
                />
                <button
                  onClick={() => {
                    const updated = customPrefixes[key].filter((_, idx) => idx !== i);
                    setCustomPrefixes(p => ({ ...p, [key]: updated.length ? updated : [""] }));
                  }}
                  style={{ background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, cursor: "pointer", borderRadius: 4, padding: "4px 10px", fontSize: 14, lineHeight: 1 }}
                  title="Remove"
                >×</button>
              </div>
            ))}
            <button
              onClick={() => setCustomPrefixes(p => ({ ...p, [key]: [...p[key], ""] }))}
              style={{ fontSize: 11, color: COLORS.accent, background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: mono, opacity: 0.85 }}
            >+ Add prefix</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
          <Button variant="ghost" small onClick={() => setShowPrefixConfig(false)}>Cancel</Button>
          <Button small onClick={savePrefixesAndContinue}>Continue to File Import →</Button>
        </div>
      </Card>
    )}

    {/* JamaStalenessBanner + JamaImportView render globally from App.jsx
        so they're available above every page, not just this one. */}

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

    {importMsg && <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.greenDim, borderRadius: 6, border: `1px solid ${COLORS.green}33`, fontSize: 12, color: COLORS.green }}>{importMsg}</div>}

    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 14 }}>Add Requirement</div>
      {renderForm(addForm, setAddForm, false)}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
        <Button onClick={saveAdd} disabled={!addForm.req_id || !addForm.title}>Save</Button>
      </div>
    </Card>}

    {/* + Add Requirement placeholder — clickable card at top of list */}
    {!showAdd && !reqSelectMode && (
      <div
        onClick={startAdd}
        style={{
          marginBottom: 10, padding: "14px 18px", borderRadius: 10,
          border: `1.5px dashed ${COLORS.border}`,
          background: "transparent",
          display: "flex", alignItems: "center", gap: 10,
          color: COLORS.textMuted, cursor: "pointer",
          transition: "border-color 0.15s ease, color 0.15s ease, background 0.15s ease",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = COLORS.accent;
          e.currentTarget.style.color = COLORS.accent;
          e.currentTarget.style.background = COLORS.accentDim;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.color = COLORS.textMuted;
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 600 }}>+</span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Add Requirement</span>
      </div>
    )}

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
      const SectionLabel = ({ children, first }) => <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: first ? 0 : 20, marginBottom: 6 }}>{children}</div>;
      const rels = r.relationships || [];
      const tcRels = rels.filter(rel => rel.group === "Verification Test Case" || rel.direction === "Downstream");
      const reqRels = rels.filter(rel => rel.group !== "Verification Test Case" && rel.direction !== "Downstream");

      return <Card
        key={r.req_id}
        onMouseEnter={() => !isEditing && setHoveredReqId(r.req_id)}
        onMouseLeave={() => setHoveredReqId(null)}
        style={{
          marginBottom: 10,
          cursor: isEditing ? "default" : "pointer",
          borderColor: isEditing
            ? COLORS.accent + "44"
            : reqSelectMode && isSelected(r.req_id)
              ? COLORS.accent
              : hoveredReqId === r.req_id
                ? `${COLORS.accent}55`
                : undefined,
          boxShadow: isEditing ? `0 0 20px ${COLORS.accentGlow}` : undefined,
          transition: "border-color 0.15s ease",
        }}
        onClick={() => { if (reqSelectMode) { toggleReqSelect(r.req_id); return; } if (!isEditing) { edit.cancelEdit(); toggleExpand(r.req_id); } }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {reqSelectMode && <input type="checkbox" checked={isSelected(r.req_id)} onChange={() => toggleReqSelect(r.req_id)} onClick={e => e.stopPropagation()} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
          <ReqIdTag id={r.req_id} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textBright, marginBottom: 4, lineHeight: 1.35 }}>{r.title}</div>
            {!isEditing && !expanded && r.description && (
              <div style={{
                fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>{r.description}</div>
            )}
            {!isEditing && !expanded && (
              <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11, fontFamily: mono, color: COLORS.textMuted }}>
                {(r.acceptance_criteria || []).length > 0 && (
                  <span>{r.acceptance_criteria.length} AC criteri{r.acceptance_criteria.length === 1 ? "on" : "a"}</span>
                )}
                {tcRels.length > 0 && <span style={{ color: COLORS.green }}>{tcRels.length} TC link{tcRels.length !== 1 ? "s" : ""}</span>}
                {reqRels.length > 0 && <span style={{ color: COLORS.purple }}>{reqRels.length} REQ link{reqRels.length !== 1 ? "s" : ""}</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
            {isJama && <Badge color="purple">JAMA</Badge>}
            <Badge color={r.priority === "High" || r.priority === "Must Have" ? "red" : r.priority === "Medium" || r.priority === "Should Have" ? "amber" : "green"}>{r.priority}</Badge>
            <Badge color={r.status === "Approved" ? "green" : r.status === "Review" ? "amber" : r.status === "Rejected" ? "red" : "textMuted"}>{r.status}</Badge>
            {!isEditing && !reqSelectMode && <button onClick={e => { e.stopPropagation(); startEdit(r); }} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, fontFamily: mono, padding: "2px 6px" }}>Edit</button>}
          </div>
        </div>

        {expanded && !isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          {r.description && <><SectionLabel first>Requirement (EARS)</SectionLabel><div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.description}</div></>}
          {r.rationale && <><SectionLabel>Rationale</SectionLabel><div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.rationale}</div></>}
          {(r.acceptance_criteria || []).length > 0 && <><SectionLabel>Acceptance Criteria</SectionLabel>{r.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 13, color: COLORS.text, paddingLeft: 12, marginTop: i === 0 ? 0 : 4, borderLeft: `2px solid ${COLORS.border}`, lineHeight: 1.6 }}>• {ac}</div>)}</>}

          {/* Metadata — visually grouped to separate from content */}
          {(r.requirement_type || r.verification_method || r.safety_level || r.scheduled_release || r.global_id || r.source) && (
            <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 6, background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
                {r.requirement_type && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Type</div><div style={{ fontSize: 13, color: COLORS.text }}>{r.requirement_type}</div></div>}
                {r.verification_method && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Verification</div><div style={{ fontSize: 13, color: COLORS.text }}>{r.verification_method}</div></div>}
                {r.safety_level && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Safety Level</div><div style={{ fontSize: 13, color: COLORS.text }}>{r.safety_level}</div></div>}
                {r.scheduled_release && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Release</div><div style={{ fontSize: 13, color: COLORS.text }}>{r.scheduled_release}</div></div>}
                {r.global_id && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Global ID</div><div style={{ fontSize: 12, fontFamily: mono, color: COLORS.textMuted }}>{r.global_id}</div></div>}
                {r.source && <div><div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Source</div><div style={{ fontSize: 13, color: COLORS.text }}>{r.source}</div></div>}
              </div>
            </div>
          )}

          {(r.requirement_context || []).length > 0 && <><SectionLabel>Requirement Context</SectionLabel>{r.requirement_context.map((ctx, i) => <div key={i} style={{ marginTop: i === 0 ? 0 : 8 }}><div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{ctx.field}</div>{ctx.items.map((item, j) => <div key={j} style={{ fontSize: 13, color: COLORS.text, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${COLORS.border}`, lineHeight: 1.6 }}>• {item}</div>)}</div>)}</>}

          {(r.tags || []).length > 0 && <><SectionLabel>Tags</SectionLabel><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{r.tags.map((tag, i) => <span key={i} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}22` }}>{tag}</span>)}</div></>}

          {/* Relationships — grouped by direction */}
          {rels.length > 0 && (() => {
            const renderRel = (rel, i, list) => (
              <div key={`${rel.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < list.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: rel.direction === "Downstream" ? COLORS.green : COLORS.purple }}>{rel.id}</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>
                <span style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{rel.name}</span>
                <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>{rel.group}</span>
              </div>
            );
            const downstream = rels.filter(rel => rel.direction === "Downstream");
            const upstream = rels.filter(rel => rel.direction !== "Downstream");
            return <>
              {downstream.length > 0 && <>
                <SectionLabel>Downstream ({downstream.length})</SectionLabel>
                <div>{downstream.map((rel, i) => renderRel(rel, i, downstream))}</div>
              </>}
              {upstream.length > 0 && <>
                <SectionLabel>Upstream ({upstream.length})</SectionLabel>
                <div>{upstream.map((rel, i) => renderRel(rel, i, upstream))}</div>
              </>}
            </>;
          })()}
        </div>}

        {isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Editing</div>
          {renderForm(edit.editForm, edit.setEditForm, true)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {canDelete && deleteConfirm !== edit.editingId && (
              <Button variant="danger" small onClick={() => setDeleteConfirm(edit.editingId)} style={{ marginRight: "auto" }}>Delete</Button>
            )}
            {canDelete && deleteConfirm === edit.editingId && (
              <div style={{ marginRight: "auto" }}>
                <InlineConfirm
                  prompt="Delete? Linked TCs will be orphaned."
                  cancelLabel="No"
                  onConfirm={() => doDelete(edit.editingId)}
                  onCancel={() => setDeleteConfirm(null)}
                />
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
