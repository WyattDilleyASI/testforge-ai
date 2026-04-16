import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input, Select, ErrorBanner, AutoResizeTextarea } from "./shared";

// ─── localStorage helpers for collapse state ────────────────────────────────
const COLLAPSE_KEY = "testforge_kb_collapsed";

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}"); } catch { return {}; }
}

function saveCollapsed(obj) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(obj));
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const KbView = ({ kbEntries, requirements, refresh }) => {
  const COLORS = useTheme();

  // Section hierarchy state
  const [sections, setSections] = useState([]);
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  // Section/subsection CRUD state
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSubTo, setAddingSubTo] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const [renamingSec, setRenamingSec] = useState(null);
  const [renameSecName, setRenameSecName] = useState("");
  const [renamingSub, setRenamingSub] = useState(null);
  const [renameSubName, setRenameSubName] = useState("");
  const [confirmDeleteSec, setConfirmDeleteSec] = useState(null);
  const [confirmDeleteSub, setConfirmDeleteSub] = useState(null);
  const [editingSubDesc, setEditingSubDesc] = useState(null);
  const [subDescDraft, setSubDescDraft] = useState("");

  // Entry add state
  const [addingEntryTo, setAddingEntryTo] = useState(null);
  const [form, setForm] = useState({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] });
  const [pendingImages, setPendingImages] = useState([]);

  // Drag and drop state
  const [dragMode, setDragMode] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const dragCounter = useRef({});
  const scrollAnimRef = useRef(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Entry-level state
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);
  const [editingTags, setEditingTags] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [editingReqs, setEditingReqs] = useState(null);
  const [editingDesc, setEditingDesc] = useState(null);
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descRegenerating, setDescRegenerating] = useState(null);
  const [expandedDescs, setExpandedDescs] = useState(new Set());
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", type: "", content: "" });
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null); // kb_id

  // Import state
  const importFileRef = useRef(null);
  const [importPending, setImportPending] = useState(null); // { entries, fileName }
  const [importMode, setImportMode] = useState("merge");
  const [importWorking, setImportWorking] = useState(false);
  const [importResult, setImportResult] = useState(null); // { imported, skipped }

  // ── Fetch sections ──────────────────────────────────────────────────────

  const refreshSections = useCallback(async () => {
    try { setSections(await api.getKbSections()); } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { refreshSections(); }, [refreshSections]);

  // ── Collapse toggle (persisted) ─────────────────────────────────────────

  const toggle = (id) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  };

  const expandTarget = (id) => {
    setCollapsed(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev, [id]: false };
      saveCollapsed(next);
      return next;
    });
  };

  const isItemCollapsed = (id) => collapsed[id] && !isSearching;

  // Collapse all / Expand all
  const allCollapsibleIds = [
    ...sections.map(s => s.section_id),
    ...sections.flatMap(s => (s.subsections || []).map(sub => sub.subsection_id)),
  ];
  const allAreCollapsed = allCollapsibleIds.length > 0 && allCollapsibleIds.every(id => collapsed[id]);

  const toggleAll = () => {
    setCollapsed(prev => {
      const next = { ...prev };
      const shouldCollapse = !allAreCollapsed;
      for (const id of allCollapsibleIds) next[id] = shouldCollapse;
      saveCollapsed(next);
      return next;
    });
  };

  // ── Drag and drop handlers ──────────────────────────────────────────────

  const handleDragStart = (e, kbId) => {
    setDraggingId(kbId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", kbId);

    const entry = kbEntries.find(x => x.kb_id === kbId);
    const ghost = document.createElement("div");
    ghost.textContent = `${kbId}  ${entry?.title || ""}`;
    ghost.style.cssText = `
      position: fixed; top: -1000px; left: -1000px;
      padding: 8px 14px; background: #fff; border: 1px solid #ccc;
      border-radius: 6px; font-size: 12px; font-weight: 600;
      max-width: 500px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: system-ui, sans-serif;
    `;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 14, 14);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverTarget(null);
    dragCounter.current = {};
  };

  const handleDragEnter = (e, targetId) => {
    e.preventDefault();
    dragCounter.current[targetId] = (dragCounter.current[targetId] || 0) + 1;
    setDragOverTarget(targetId);
  };

  const handleDragLeave = (e, targetId) => {
    e.preventDefault();
    dragCounter.current[targetId] = (dragCounter.current[targetId] || 0) - 1;
    if (dragCounter.current[targetId] <= 0) {
      dragCounter.current[targetId] = 0;
      if (dragOverTarget === targetId) setDragOverTarget(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    const kbId = e.dataTransfer.getData("text/plain");
    if (!kbId) return;

    const subsectionId = targetId === "uncategorized" ? null : targetId;
    const entry = kbEntries.find(x => x.kb_id === kbId);
    const currentSub = entry?.subsection_id || null;

    if (currentSub === subsectionId) {
      handleDragEnd();
      return;
    }

    try {
      await api.moveKbEntry(kbId, subsectionId);
      if (targetId !== "uncategorized") expandTarget(targetId);
      refresh();
      refreshSections();
    } catch (err) { setError(err.message); }

    handleDragEnd();
  };

  const handleImportFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const entries = JSON.parse(ev.target.result);
        if (!Array.isArray(entries)) throw new Error("Expected a JSON array");
        setImportPending({ file, entries, fileName: file.name });
        setImportResult(null);
      } catch (err) {
        setError("Invalid JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importPending) return;
    setImportWorking(true);
    try {
      const result = await api.importKbJson(importPending.file, importMode);
      setImportResult(result);
      setImportPending(null);
      refresh();
      refreshSections();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportWorking(false);
    }
  };

  const exitDragMode = () => {
    setDragMode(false);
    setDraggingId(null);
    setDragOverTarget(null);
    dragCounter.current = {};
    cancelAnimationFrame(scrollAnimRef.current);
  };

  useEffect(() => {
    if (!dragMode || !draggingId) {
      cancelAnimationFrame(scrollAnimRef.current);
      return;
    }

    const SCROLL_ZONE = 100;
    const MAX_SPEED = 18;

    const onDragOver = (e) => {
      const y = e.clientY;
      const h = window.innerHeight;
      cancelAnimationFrame(scrollAnimRef.current);
      let speed = 0;
      if (y < SCROLL_ZONE) speed = -MAX_SPEED * (1 - y / SCROLL_ZONE);
      else if (y > h - SCROLL_ZONE) speed = MAX_SPEED * (1 - (h - y) / SCROLL_ZONE);
      if (speed !== 0) {
        const tick = () => { window.scrollBy(0, speed); scrollAnimRef.current = requestAnimationFrame(tick); };
        scrollAnimRef.current = requestAnimationFrame(tick);
      }
    };

    document.addEventListener("dragover", onDragOver);
    return () => { document.removeEventListener("dragover", onDragOver); cancelAnimationFrame(scrollAnimRef.current); };
  }, [dragMode, draggingId]);

  const dropZoneProps = (targetId) => {
    if (!dragMode || !draggingId) return {};
    return {
      onDragEnter: (e) => handleDragEnter(e, targetId),
      onDragLeave: (e) => handleDragLeave(e, targetId),
      onDragOver: handleDragOver,
      onDrop: (e) => handleDrop(e, targetId),
    };
  };

  const isDragSource = (targetId) => {
    if (!draggingId) return false;
    const entry = kbEntries.find(x => x.kb_id === draggingId);
    if (targetId === "uncategorized") return !entry?.subsection_id;
    return entry?.subsection_id === targetId;
  };

  // ── Section CRUD ────────────────────────────────────────────────────────

  const createSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await api.createKbSection(newSectionName.trim());
      setAddingSection(false); setNewSectionName("");
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const renameSection = async (sectionId) => {
    if (!renameSecName.trim()) return;
    try {
      await api.renameKbSection(sectionId, renameSecName.trim());
      setRenamingSec(null); setRenameSecName("");
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const deleteSection = async (sectionId) => {
    try {
      await api.deleteKbSection(sectionId);
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  // ── Subsection CRUD ─────────────────────────────────────────────────────

  const createSubsection = async (sectionId) => {
    if (!newSubName.trim()) return;
    try {
      await api.createKbSubsection(sectionId, newSubName.trim());
      setAddingSubTo(null); setNewSubName("");
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const renameSubsection = async (subId) => {
    if (!renameSubName.trim()) return;
    try {
      await api.renameKbSubsection(subId, renameSubName.trim());
      setRenamingSub(null); setRenameSubName("");
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const deleteSubsection = async (subId) => {
    try {
      await api.deleteKbSubsection(subId);
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const saveSubDesc = async (subId) => {
    try {
      await api.updateKbSubsection(subId, { description: subDescDraft });
      setEditingSubDesc(null); setSubDescDraft("");
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  // ── Entry CRUD ──────────────────────────────────────────────────────────

  const resetForm = () => {
    setAddingEntryTo(null);
    setForm({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] });
    setPendingImages([]);
  };

  const saveEntry = async () => {
    setError("");
    try {
      const subsectionId = addingEntryTo === "uncategorized" ? null : addingEntryTo;
      const result = await api.createKbEntry({
        title: form.title, type: form.type, content: form.content,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        related_reqs: form.related_reqs,
        subsection_id: subsectionId,
      });
      if (pendingImages.length > 0 && result.kb_id) {
        await api.uploadKbImages(result.kb_id, pendingImages);
      }
      resetForm();
      refresh();
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  const handleImageUpload = async (kbId, files) => {
    setUploading(kbId);
    try { await api.uploadKbImages(kbId, files); refresh(); } catch (err) { setError(err.message); }
    setUploading(null);
  };

  const handleDeleteImage = async (kbId, index) => {
    try { await api.deleteKbImage(kbId, index); refresh(); } catch (err) { setError(err.message); }
  };

  // Tags
  const addTag = async (kbId, tag) => { const e = kbEntries.find(x => x.kb_id === kbId); if (!e || !tag.trim() || e.tags.includes(tag.trim())) return; try { await api.updateKbEntry(kbId, { tags: [...e.tags, tag.trim()] }); refresh(); } catch (err) { setError(err.message); } };
  const removeTag = async (kbId, tag) => { const e = kbEntries.find(x => x.kb_id === kbId); if (!e) return; try { await api.updateKbEntry(kbId, { tags: e.tags.filter(t => t !== tag) }); refresh(); } catch (err) { setError(err.message); } };

  // Related reqs
  const addRelatedReq = async (kbId, reqId) => { const e = kbEntries.find(x => x.kb_id === kbId); if (!e || (e.related_reqs || []).includes(reqId)) return; try { await api.updateKbEntry(kbId, { related_reqs: [...(e.related_reqs || []), reqId] }); refresh(); } catch (err) { setError(err.message); } };
  const removeRelatedReq = async (kbId, reqId) => { const e = kbEntries.find(x => x.kb_id === kbId); if (!e) return; try { await api.updateKbEntry(kbId, { related_reqs: (e.related_reqs || []).filter(r => r !== reqId) }); refresh(); } catch (err) { setError(err.message); } };

  // Image descriptions
  const saveImageDescription = async (kbId, index) => { setDescSaving(true); try { await api.updateImageDescription(kbId, index, descDraft); setEditingDesc(null); setDescDraft(""); refresh(); } catch (err) { setError(err.message); } setDescSaving(false); };
  const regenerateAllDescriptions = async (kbId) => { setDescRegenerating(kbId); try { await api.regenerateAllImageDescriptions(kbId); refresh(); } catch (err) { setError(err.message); } setDescRegenerating(null); };

  // Entry editing
  const startEdit = (entry) => { setEditingEntry(entry.kb_id); setEditForm({ title: entry.title, type: entry.type, content: entry.content }); setConfirmDeleteEntry(null); };
  const cancelEdit = () => { setEditingEntry(null); setEditForm({ title: "", type: "", content: "" }); setConfirmDeleteEntry(null); };
  const saveEdit = async () => {
    if (!editForm.title.trim() || !editForm.content.trim()) return;
    try {
      await api.updateKbEntry(editingEntry, { title: editForm.title, type: editForm.type, content: editForm.content });
      cancelEdit();
      refresh();
    } catch (err) { setError(err.message); }
  };

  // Single entry delete (from edit mode)
  const deleteEntry = async (kbId) => {
    try {
      await api.deleteKbEntries([kbId]);
      cancelEdit();
      refresh();
      refreshSections();
    } catch (err) { setError(err.message); }
  };

  // ── Search & derived data ───────────────────────────────────────────────

  const searchLower = searchQuery.toLowerCase().trim();
  const isSearching = searchLower.length > 0;

  const matchesSearch = (e) => {
    if (!isSearching) return true;
    return (
      e.kb_id.toLowerCase().includes(searchLower) ||
      e.title.toLowerCase().includes(searchLower) ||
      e.content.toLowerCase().includes(searchLower) ||
      e.type.toLowerCase().includes(searchLower) ||
      (e.tags || []).some(t => t.toLowerCase().includes(searchLower)) ||
      (e.related_reqs || []).some(r => r.toLowerCase().includes(searchLower))
    );
  };

  const uncatEntries = kbEntries.filter(e => !e.subsection_id && matchesSearch(e));
  const entriesBySub = (subId) => kbEntries.filter(e => e.subsection_id === subId && matchesSearch(e));
  const matchCount = isSearching ? kbEntries.filter(matchesSearch).length : kbEntries.length;

  // ── Render: Drop Zone Strip ─────────────────────────────────────────────

  const renderDropZone = (targetId, label) => {
    if (!dragMode || !draggingId || isDragSource(targetId)) return null;
    const isOver = dragOverTarget === targetId;
    return (
      <div
        {...dropZoneProps(targetId)}
        style={{
          margin: "8px 0 4px", padding: isOver ? "18px 16px" : "12px 16px", borderRadius: 8,
          border: `2px dashed ${isOver ? COLORS.accent : COLORS.textMuted}`,
          background: isOver ? (COLORS.accentDim || COLORS.accent + "18") : "transparent",
          textAlign: "center", fontSize: 12, fontWeight: 600,
          color: isOver ? COLORS.accent : COLORS.textMuted,
          transition: "all 0.15s ease", userSelect: "none",
        }}
      >
        {isOver ? `Drop here → ${label}` : `Move to ${label}`}
      </div>
    );
  };

  // ── Render: Add Entry Form ──────────────────────────────────────────────

  const renderAddForm = (target) => {
    if (addingEntryTo !== target) return null;
    return (
      <Card glow style={{ marginTop: 10, marginBottom: 10 }}>
        <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
        <Select label="Type" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} style={{ marginBottom: 12 }} options={["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "UI Reference"].map(t => ({ value: t, label: t }))} />
        <Input label="Content" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} textarea style={{ marginBottom: 12 }} />
        <Input label="Tags (comma-separated)" value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} mono style={{ marginBottom: 14 }} />
        {(requirements || []).length > 0 && <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Related Requirements</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            {form.related_reqs.map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
              {r}<button onClick={() => setForm(p => ({ ...p, related_reqs: p.related_reqs.filter(x => x !== r) }))} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }}>&times;</button>
            </span>)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 80, overflowY: "auto" }}>
            {(requirements || []).filter(r => !form.related_reqs.includes(r.req_id)).map(r =>
              <button key={r.req_id} onClick={() => setForm(p => ({ ...p, related_reqs: [...p.related_reqs, r.req_id] }))} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.purple, cursor: "pointer", whiteSpace: "nowrap" }} title={r.title}>{r.req_id}</button>
            )}
          </div>
        </div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Images</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {pendingImages.map((f, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: mono, padding: "3px 8px", borderRadius: 4, background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 3 }} />
              {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
              <button onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, lineHeight: 1 }}>&times;</button>
            </span>)}
            <label style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>
              + Add Images
              <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={ev => { if (ev.target.files.length) setPendingImages(prev => [...prev, ...Array.from(ev.target.files)]); ev.target.value = ""; }} />
            </label>
          </div>
        </div>
        <ErrorBanner msg={error} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={resetForm}>Cancel</Button>
          <Button onClick={saveEntry} disabled={!form.title || !form.content}>Save</Button>
        </div>
      </Card>
    );
  };

  // ── Render: Entry Card ──────────────────────────────────────────────────

  const renderEntry = (e) => {
    const isDragging = draggingId === e.kb_id;
    const isEditing = editingEntry === e.kb_id;
    return (
      <div
        key={e.kb_id}
        draggable={dragMode}
        onDragStart={dragMode ? (ev) => handleDragStart(ev, e.kb_id) : undefined}
        onDragEnd={dragMode ? handleDragEnd : undefined}
        style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s" }}
      >
        <Card style={{
          marginBottom: 8,
          cursor: dragMode ? "grab" : undefined,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            {dragMode && <span style={{ color: COLORS.textMuted, fontSize: 14, cursor: "grab", userSelect: "none", lineHeight: "20px", flexShrink: 0, padding: "0 2px" }} title="Drag to move">⠿</span>}
            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 8px", borderRadius: 4 }}>{e.kb_id}</span>
            <div style={{ flex: 1 }}>
              {isEditing ? <div>
                <input type="text" value={editForm.title} onChange={ev => setEditForm(p => ({ ...p, title: ev.target.value }))} style={{ width: "100%", fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 4, border: `1px solid ${COLORS.accent}`, background: COLORS.surfaceRaised, color: COLORS.textBright, outline: "none", marginBottom: 8, boxSizing: "border-box", fontFamily: "inherit" }} />
                <select value={editForm.type} onChange={ev => setEditForm(p => ({ ...p, type: ev.target.value }))} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.text, outline: "none", marginBottom: 8, fontFamily: "inherit" }}>
                  {["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "UI Reference"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <AutoResizeTextarea value={editForm.content} onChange={ev => setEditForm(p => ({ ...p, content: ev.target.value }))} rows={3} />
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  <Button small onClick={saveEdit} disabled={!editForm.title.trim() || !editForm.content.trim()}>Save</Button>
                  <Button small variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <div style={{ flex: 1 }} />
                  {confirmDeleteEntry === e.kb_id ? <>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>Delete this entry?</span>
                    <Button small onClick={() => deleteEntry(e.kb_id)} style={{ background: COLORS.red || "#ef4444", color: "#fff" }}>Confirm</Button>
                    <Button small variant="ghost" onClick={() => setConfirmDeleteEntry(null)}>Cancel</Button>
                  </> : (
                    <span onClick={() => setConfirmDeleteEntry(e.kb_id)} style={{ fontSize: 11, color: COLORS.red || "#ef4444", cursor: "pointer", fontWeight: 600 }}>Delete</span>
                  )}
                </div>
              </div> : <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, flex: 1 }}>{e.title}</div>
                  {!dragMode && <span onClick={() => startEdit(e)} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>Edit</span>}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>{e.content}</div>
              </div>}

              {(e.images || []).length > 0 && <div style={{ marginTop: 10 }}>
                {e.images.map((img, i) => {
                  const isEditingImg = editingDesc && editingDesc.kbId === e.kb_id && editingDesc.index === i;
                  const regenKey = `${e.kb_id}-${i}`;
                  return <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: 8, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <img src={`/api/kb/${e.kb_id}/images/${i}/file`} alt={img.name} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={() => setPreviewImg({ kbId: e.kb_id, index: i, name: img.name })} title={img.name} />
                      <button onClick={() => handleDeleteImage(e.kb_id, i)} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: COLORS.red || "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: "18px", padding: 0, fontWeight: 700 }} title="Remove image">&times;</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, marginBottom: 4 }}>{img.name}</div>
                      {isEditingImg ? <div>
                        <AutoResizeTextarea value={descDraft} onChange={ev => setDescDraft(ev.target.value)} rows={3} mono />
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <Button small onClick={() => saveImageDescription(e.kb_id, i)} disabled={descSaving}>{descSaving ? "Saving..." : "Save"}</Button>
                          <Button small variant="ghost" onClick={() => { setEditingDesc(null); setDescDraft(""); }}>Cancel</Button>
                        </div>
                      </div> : <div>
                        {img.description ? <>
                          <div onClick={() => setExpandedDescs(prev => { const next = new Set(prev); next.has(regenKey) ? next.delete(regenKey) : next.add(regenKey); return next; })} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600, userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ display: "inline-block", transform: expandedDescs.has(regenKey) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9654;</span>Description
                          </div>
                          {expandedDescs.has(regenKey) && <div style={{ fontSize: 11, color: COLORS.text, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 4, paddingLeft: 14 }}>{img.description}</div>}
                        </> : <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic" }}>No description generated</div>}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <span onClick={() => { setEditingDesc({ kbId: e.kb_id, index: i }); setDescDraft(img.description || ""); }} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>Edit</span>
                        </div>
                      </div>}
                    </div>
                  </div>;
                })}
              </div>}

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Badge color="purple">{e.type}</Badge>
                {(e.tags || []).map(t => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.accent, background: COLORS.accentDim || (COLORS.accent + "22"), padding: "2px 6px", borderRadius: 4 }}>
                  {t}{editingTags === e.kb_id && <button onClick={() => removeTag(e.kb_id, t)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Remove ${t}`}>&times;</button>}
                </span>)}
                <span onClick={() => { setEditingTags(editingTags === e.kb_id ? null : e.kb_id); setTagInput(""); }} style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>{editingTags === e.kb_id ? "Done" : "+ Tag"}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.textMuted }}>|</span>
                {(e.related_reqs || []).map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
                  {r}{editingReqs === e.kb_id && <button onClick={() => removeRelatedReq(e.kb_id, r)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Unlink ${r}`}>&times;</button>}
                </span>)}
                <span onClick={() => setEditingReqs(editingReqs === e.kb_id ? null : e.kb_id)} style={{ fontSize: 11, color: COLORS.purple, cursor: "pointer", fontWeight: 600 }}>{editingReqs === e.kb_id ? "Done" : "+ Req"}</span>
                <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>Used {e.usage_count || 0}×</span>
                <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>| {(e.images || []).length} image(s)</span>
                <label style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", marginLeft: 8, fontWeight: 600 }}>
                  {uploading === e.kb_id ? "Uploading..." : "+ Add Images"}
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={ev => { if (ev.target.files.length) handleImageUpload(e.kb_id, ev.target.files); ev.target.value = ""; }} disabled={uploading === e.kb_id} />
                </label>
                {(e.images || []).length > 0 && <span onClick={() => descRegenerating !== e.kb_id && regenerateAllDescriptions(e.kb_id)} style={{ fontSize: 11, color: COLORS.purple, cursor: descRegenerating === e.kb_id ? "not-allowed" : "pointer", marginLeft: 8, fontWeight: 600, opacity: descRegenerating === e.kb_id ? 0.5 : 1 }}>
                  {descRegenerating === e.kb_id ? "Generating Descriptions..." : "Generate Descriptions"}
                </span>}
              </div>

              {editingTags === e.kb_id && <div style={{ marginTop: 8, padding: 10, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>Tags</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="text" value={tagInput} onChange={ev => setTagInput(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter" && tagInput.trim()) { addTag(e.kb_id, tagInput); setTagInput(""); } }} placeholder="Type a tag and press Enter" style={{ flex: 1, fontSize: 12, fontFamily: mono, padding: "4px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.text, outline: "none" }} />
                  <button onClick={() => { if (tagInput.trim()) { addTag(e.kb_id, tagInput); setTagInput(""); } }} disabled={!tagInput.trim()} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "none", background: COLORS.accent, color: "#fff", cursor: tagInput.trim() ? "pointer" : "default", opacity: tagInput.trim() ? 1 : 0.5 }}>Add</button>
                </div>
              </div>}

              {editingReqs === e.kb_id && <div style={{ marginTop: 8, padding: 10, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>Related Requirements</div>
                {(requirements || []).length > 0 ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 100, overflowY: "auto" }}>
                  {(requirements || []).filter(r => !(e.related_reqs || []).includes(r.req_id)).map(r =>
                    <button key={r.req_id} onClick={() => addRelatedReq(e.kb_id, r.req_id)} style={{ fontSize: 10, fontFamily: mono, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.purple, cursor: "pointer", whiteSpace: "nowrap" }} title={r.title}>{r.req_id}</button>
                  )}
                  {(requirements || []).filter(r => !(e.related_reqs || []).includes(r.req_id)).length === 0 && <span style={{ fontSize: 11, color: COLORS.textMuted }}>All requirements already linked</span>}
                </div> : <span style={{ fontSize: 11, color: COLORS.textMuted }}>No requirements available</span>}
              </div>}
            </div>
          </div>
        </Card>
      </div>
    );
  };

  // ── Render: Subsection ──────────────────────────────────────────────────

  const renderSubsection = (sub) => {
    const entries = entriesBySub(sub.subsection_id);
    const isCollapsed = isItemCollapsed(sub.subsection_id);
    const isRenaming = renamingSub === sub.subsection_id;

    if (isSearching && entries.length === 0) return null;

    const collapsedDropProps = (dragMode && draggingId && isCollapsed && !isDragSource(sub.subsection_id))
      ? dropZoneProps(sub.subsection_id) : {};
    const collapsedIsOver = dragMode && draggingId && isCollapsed && dragOverTarget === sub.subsection_id && !isDragSource(sub.subsection_id);

    return (
      <div key={sub.subsection_id} style={{
        marginBottom: 10, border: `1px solid ${COLORS.border}`, borderRadius: 8,
        background: COLORS.surface, overflow: "hidden",
      }}>
        <div
          {...collapsedDropProps}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
            background: collapsedIsOver ? (COLORS.accentDim || COLORS.accent + "18") : COLORS.surfaceRaised,
            borderBottom: isCollapsed && !sub.description ? "none" : `1px solid ${COLORS.border}`,
            cursor: dragMode && draggingId ? "default" : "pointer",
            transition: "background 0.15s",
            ...(collapsedIsOver ? { outline: `2px dashed ${COLORS.accent}`, outlineOffset: -2 } : {}),
          }}
          onClick={dragMode && draggingId ? undefined : () => toggle(sub.subsection_id)}
        >
          <span style={{ fontSize: 10, color: COLORS.textMuted, userSelect: "none", display: "inline-block", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.15s" }}>&#9654;</span>
          {isRenaming ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={ev => ev.stopPropagation()}>
              <input type="text" value={renameSubName} onChange={ev => setRenameSubName(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") renameSubsection(sub.subsection_id); if (ev.key === "Escape") setRenamingSub(null); }} autoFocus style={{ fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${COLORS.accent}`, background: COLORS.surface, color: COLORS.textBright, outline: "none", flex: 1 }} />
              <Button small onClick={() => renameSubsection(sub.subsection_id)}>Save</Button>
              <Button small variant="ghost" onClick={() => setRenamingSub(null)}>Cancel</Button>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, color: entries.length > 0 ? COLORS.textBright : COLORS.textMuted }}>{sub.name}</span>
              <span style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted }}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
              {collapsedIsOver && <span style={{ fontSize: 11, color: COLORS.accent, fontWeight: 600, marginLeft: 8 }}>Drop here</span>}
              {!dragMode && <span onClick={ev => { ev.stopPropagation(); setRenamingSub(sub.subsection_id); setRenameSubName(sub.name); }} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", marginLeft: "auto" }}>Rename</span>}
              {!dragMode && entries.length === 0 && (
                confirmDeleteSub === sub.subsection_id
                  ? <><span onClick={ev => { ev.stopPropagation(); deleteSubsection(sub.subsection_id); setConfirmDeleteSub(null); }} style={{ fontSize: 10, color: COLORS.red || "#ef4444", cursor: "pointer", fontWeight: 600 }}>Confirm</span><span onClick={ev => { ev.stopPropagation(); setConfirmDeleteSub(null); }} style={{ fontSize: 10, color: COLORS.textMuted, cursor: "pointer", marginLeft: 4 }}>Cancel</span></>
                  : <span onClick={ev => { ev.stopPropagation(); setConfirmDeleteSub(sub.subsection_id); }} style={{ fontSize: 10, color: COLORS.red || "#ef4444", cursor: "pointer" }}>Delete</span>
              )}
            </>
          )}
        </div>

        {/* Subsection description */}
        {(sub.description || editingSubDesc === sub.subsection_id || (!dragMode && !isSearching)) && (
          <div style={{ padding: "0 14px", borderBottom: !isCollapsed ? `1px solid ${COLORS.border}` : "none" }}>
            {editingSubDesc === sub.subsection_id ? (
              <div style={{ padding: "8px 0" }}>
                <AutoResizeTextarea value={subDescDraft} onChange={ev => setSubDescDraft(ev.target.value)} placeholder="Describe what this subsection covers..." rows={2} />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Button small onClick={() => saveSubDesc(sub.subsection_id)}>Save</Button>
                  <Button small variant="ghost" onClick={() => { setEditingSubDesc(null); setSubDescDraft(""); }}>Cancel</Button>
                </div>
              </div>
            ) : sub.description ? (
              <div onClick={!dragMode && !isSearching ? () => { setEditingSubDesc(sub.subsection_id); setSubDescDraft(sub.description); } : undefined} style={{ padding: "6px 0", fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5, cursor: !dragMode && !isSearching ? "pointer" : "default" }} title={!dragMode && !isSearching ? "Click to edit description" : undefined}>{sub.description}</div>
            ) : !dragMode && !isSearching ? (
              <div onClick={() => { setEditingSubDesc(sub.subsection_id); setSubDescDraft(""); }} style={{ padding: "6px 0", fontSize: 11, color: COLORS.accent, cursor: "pointer", opacity: 0.6, fontWeight: 600 }}>+ Description</div>
            ) : null}
          </div>
        )}

        {!isCollapsed && <div style={{ padding: "10px 14px 6px" }}>
          {entries.map(renderEntry)}
          {renderDropZone(sub.subsection_id, sub.name)}
          {!dragMode && renderAddForm(sub.subsection_id)}
          {!dragMode && addingEntryTo !== sub.subsection_id && (
            <div onClick={() => { resetForm(); setAddingEntryTo(sub.subsection_id); }} style={{ padding: "8px 0", textAlign: "center", fontSize: 12, color: COLORS.accent, cursor: "pointer", fontWeight: 600, opacity: 0.7 }}>+ Add Entry</div>
          )}
        </div>}
      </div>
    );
  };

  // ── Render: Section ─────────────────────────────────────────────────────

  const renderSection = (sec) => {
    const isCollapsed_ = isItemCollapsed(sec.section_id);
    const isDefault = sec.is_default;
    const isRenaming = renamingSec === sec.section_id;
    const entries = isDefault ? uncatEntries : [];
    const totalEntries = isDefault ? uncatEntries.length : (sec.subsections || []).reduce((sum, s) => sum + entriesBySub(s.subsection_id).length, 0);

    if (isSearching && totalEntries === 0 && !isDefault) return null;

    return (
      <div key={sec.section_id} style={{
        marginBottom: 16, border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
        background: COLORS.bg, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
          background: COLORS.surfaceRaised,
          borderBottom: isCollapsed_ ? "none" : `1.5px solid ${COLORS.border}`,
          cursor: dragMode && draggingId ? "default" : "pointer",
        }} onClick={dragMode && draggingId ? undefined : () => toggle(sec.section_id)}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, userSelect: "none", display: "inline-block", transform: isCollapsed_ ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.15s" }}>&#9654;</span>
          {isRenaming ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={ev => ev.stopPropagation()}>
              <input type="text" value={renameSecName} onChange={ev => setRenameSecName(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") renameSection(sec.section_id); if (ev.key === "Escape") setRenamingSec(null); }} autoFocus style={{ fontSize: 15, fontWeight: 700, padding: "2px 10px", borderRadius: 4, border: `1px solid ${COLORS.accent}`, background: COLORS.surface, color: COLORS.textBright, outline: "none", flex: 1, fontFamily: "inherit" }} />
              <Button small onClick={() => renameSection(sec.section_id)}>Save</Button>
              <Button small variant="ghost" onClick={() => setRenamingSec(null)}>Cancel</Button>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright }}>{sec.name}</span>
              {isDefault && <Badge color="purple" style={{ fontSize: 9 }}>DEFAULT</Badge>}
              <span style={{ fontSize: 11, fontFamily: mono, color: COLORS.textMuted }}>{totalEntries} {totalEntries === 1 ? "entry" : "entries"}{!isDefault && ` · ${(sec.subsections || []).length} subsection(s)`}</span>
              {!dragMode && !isDefault && <span onClick={ev => { ev.stopPropagation(); setRenamingSec(sec.section_id); setRenameSecName(sec.name); }} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", marginLeft: "auto" }}>Rename</span>}
              {!dragMode && !isDefault && totalEntries === 0 && (sec.subsections || []).length === 0 && (
                confirmDeleteSec === sec.section_id
                  ? <><span onClick={ev => { ev.stopPropagation(); deleteSection(sec.section_id); setConfirmDeleteSec(null); }} style={{ fontSize: 10, color: COLORS.red || "#ef4444", cursor: "pointer", fontWeight: 600 }}>Confirm</span><span onClick={ev => { ev.stopPropagation(); setConfirmDeleteSec(null); }} style={{ fontSize: 10, color: COLORS.textMuted, cursor: "pointer", marginLeft: 4 }}>Cancel</span></>
                  : <span onClick={ev => { ev.stopPropagation(); setConfirmDeleteSec(sec.section_id); }} style={{ fontSize: 10, color: COLORS.red || "#ef4444", cursor: "pointer" }}>Delete</span>
              )}
            </>
          )}
        </div>

        {!isCollapsed_ && <div style={{ padding: "12px 18px 14px" }}>
          {isDefault ? <>
            {entries.map(renderEntry)}
            {renderDropZone("uncategorized", "Uncategorized")}
            {!dragMode && renderAddForm("uncategorized")}
            {!dragMode && addingEntryTo !== "uncategorized" && (
              <div onClick={() => { resetForm(); setAddingEntryTo("uncategorized"); }} style={{ padding: "8px 0", textAlign: "center", fontSize: 12, color: COLORS.accent, cursor: "pointer", fontWeight: 600, opacity: 0.7 }}>+ Add Entry</div>
            )}
          </> : <>
            {(sec.subsections || []).map(renderSubsection)}
            {!dragMode && addingSubTo === sec.section_id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px" }}>
                <input type="text" value={newSubName} onChange={ev => setNewSubName(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") createSubsection(sec.section_id); if (ev.key === "Escape") { setAddingSubTo(null); setNewSubName(""); } }} placeholder="Subsection name" autoFocus style={{ fontSize: 12, padding: "6px 10px", borderRadius: 4, border: `1px solid ${COLORS.accent}`, background: COLORS.surfaceRaised, color: COLORS.text, outline: "none", flex: 1, fontFamily: "inherit" }} />
                <Button small onClick={() => createSubsection(sec.section_id)} disabled={!newSubName.trim()}>Add</Button>
                <Button small variant="ghost" onClick={() => { setAddingSubTo(null); setNewSubName(""); }}>Cancel</Button>
              </div>
            ) : !dragMode && (
              <div onClick={() => { setAddingSubTo(sec.section_id); setNewSubName(""); }} style={{ padding: "10px 0", textAlign: "center", fontSize: 12, color: COLORS.accent, cursor: "pointer", fontWeight: 600, opacity: 0.7 }}>+ Add Subsection</div>
            )}
          </>}
        </div>}
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Knowledge Base</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
          {isSearching ? `${matchCount} of ${kbEntries.length} entries` : `${kbEntries.length} entries`} · {sections.length} section(s)
          {dragMode && " · Drag mode active"}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {!dragMode && !isSearching && sections.length > 0 && (
          <Button variant="secondary" small onClick={toggleAll}>{allAreCollapsed ? "Expand All" : "Collapse All"}</Button>
        )}
        {!dragMode && kbEntries.length > 0 && (
          <Button variant="secondary" small onClick={() => api.exportKbJson()}>Export JSON</Button>
        )}
        {!dragMode && (
          <Button variant="secondary" small onClick={() => importFileRef.current?.click()}>Import JSON</Button>
        )}
        {!dragMode && kbEntries.length > 0 && (
          <Button variant="secondary" small onClick={() => { setDragMode(true); setAddingEntryTo(null); resetForm(); cancelEdit(); }}>Rearrange</Button>
        )}
        {dragMode && (
          <Button small onClick={exitDragMode} style={{ background: COLORS.accent }}>Done Rearranging</Button>
        )}
      </div>
    </div>

    <input
      ref={importFileRef}
      type="file"
      accept=".json,application/json"
      style={{ display: "none" }}
      onChange={handleImportFileChange}
    />

    {importPending && (
      <div style={{
        marginBottom: 12, padding: "12px 16px", borderRadius: 8,
        background: COLORS.surfaceRaised, border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 13, color: COLORS.textBright, fontWeight: 600 }}>
          {importPending.entries.length} entries found in {importPending.fileName}
        </span>
        <select
          value={importMode}
          onChange={e => setImportMode(e.target.value)}
          style={{
            fontSize: 12, padding: "4px 8px", borderRadius: 6,
            border: `1px solid ${COLORS.border}`, background: COLORS.surface,
            color: COLORS.text, cursor: "pointer",
          }}
        >
          <option value="merge">Merge (skip duplicates)</option>
          <option value="replace">Replace (clear existing)</option>
        </select>
        <Button small onClick={confirmImport} disabled={importWorking}
          style={{ background: COLORS.accent, color: "#fff" }}>
          {importWorking ? "Importing…" : "Confirm Import"}
        </Button>
        <Button small variant="ghost" onClick={() => setImportPending(null)} disabled={importWorking}>Cancel</Button>
      </div>
    )}

    {importResult && (
      <div style={{
        marginBottom: 12, padding: "10px 16px", borderRadius: 8,
        background: COLORS.surfaceRaised, border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 13, color: COLORS.textBright }}>
          Import complete — {importResult.imported} imported, {importResult.skipped} skipped
        </span>
        <Button small variant="ghost" onClick={() => setImportResult(null)}>Dismiss</Button>
      </div>
    )}

    <div style={{ marginBottom: 16, position: "relative" }}>
      <input
        type="text" value={searchQuery} onChange={ev => setSearchQuery(ev.target.value)}
        placeholder="Search by title, content, type, tag, or ID..."
        style={{
          width: "100%", fontSize: 13, padding: "10px 14px", paddingRight: searchQuery ? 36 : 14,
          borderRadius: 8, border: `1px solid ${isSearching ? COLORS.accent : COLORS.border}`,
          background: COLORS.surfaceRaised, color: COLORS.text, outline: "none",
          boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.15s",
        }}
      />
      {searchQuery && (
        <button onClick={() => setSearchQuery("")} style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", color: COLORS.textMuted,
          cursor: "pointer", fontSize: 16, fontWeight: 700, padding: "0 4px", lineHeight: 1,
        }} title="Clear search">&times;</button>
      )}
    </div>

    <ErrorBanner msg={error} />

    {isSearching && matchCount === 0 && (
      <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.textMuted, fontSize: 13 }}>
        No entries match "{searchQuery}"
      </div>
    )}

    {sections.map(renderSection)}

    {!dragMode && !isSearching && (addingSection ? (
      <Card style={{ marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" value={newSectionName} onChange={ev => setNewSectionName(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") createSection(); if (ev.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }} placeholder="Section name (e.g. Mobius, VAI)" autoFocus style={{ fontSize: 14, fontWeight: 600, padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.accent}`, background: COLORS.surfaceRaised, color: COLORS.textBright, outline: "none", flex: 1, fontFamily: "inherit" }} />
          <Button onClick={createSection} disabled={!newSectionName.trim()}>Create</Button>
          <Button variant="secondary" onClick={() => { setAddingSection(false); setNewSectionName(""); }}>Cancel</Button>
        </div>
      </Card>
    ) : !isSearching && (
      <div onClick={() => setAddingSection(true)} style={{
        marginTop: 8, padding: "16px 0", textAlign: "center", fontSize: 13, color: COLORS.accent, cursor: "pointer", fontWeight: 600,
        border: `2px dashed ${COLORS.textMuted}`, borderRadius: 10, opacity: 0.6, transition: "opacity 0.15s",
      }} onMouseEnter={ev => ev.currentTarget.style.opacity = 1} onMouseLeave={ev => ev.currentTarget.style.opacity = 0.6}>+ Create New Section</div>
    ))}

    {previewImg && <div onClick={() => setPreviewImg(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, cursor: "pointer" }}>
      <div style={{ maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={`/api/kb/${previewImg.kbId}/images/${previewImg.index}/file`} alt={previewImg.name} style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }} />
        <div style={{ textAlign: "center", color: "#fff", marginTop: 8, fontSize: 13 }}>{previewImg.name}</div>
      </div>
    </div>}
  </div>;
};