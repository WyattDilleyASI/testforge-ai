import { useState } from "react";
import { api } from "../api";
import { useTheme, mono } from "../theme";
import { Card, Badge, Button, Input, Select, ErrorBanner } from "./shared";

export const KbView = ({ kbEntries, requirements, refresh }) => {
  const COLORS = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] });
  const [pendingImages, setPendingImages] = useState([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingTags, setEditingTags] = useState(null); // kb_id being edited
  const [tagInput, setTagInput] = useState("");
  const [editingReqs, setEditingReqs] = useState(null); // kb_id for related reqs editing
  const [editingDesc, setEditingDesc] = useState(null); // { kbId, index }
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descRegenerating, setDescRegenerating] = useState(null); // "kbId-index"
  const [expandedDescs, setExpandedDescs] = useState(new Set()); // "kbId-index" keys

  const save = async () => {
    setError("");
    try {
      const result = await api.createKbEntry({ title: form.title, type: form.type, content: form.content, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), related_reqs: form.related_reqs });
      if (pendingImages.length > 0 && result.kb_id) {
        await api.uploadKbImages(result.kb_id, pendingImages);
      }
      setShowAdd(false); setForm({ title: "", type: "Defect History", content: "", tags: "", related_reqs: [] }); setPendingImages([]); refresh();
    } catch (err) { setError(err.message); }
  };

  const handleImageUpload = async (kbId, files) => {
    setUploading(kbId);
    try {
      await api.uploadKbImages(kbId, files);
      refresh();
    } catch (err) { setError(err.message); }
    setUploading(null);
  };

  const handleDeleteImage = async (kbId, index) => {
    try {
      await api.deleteKbImage(kbId, index);
      refresh();
    } catch (err) { setError(err.message); }
  };

  const toggleSelect = (kbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId); else next.add(kbId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === kbEntries.length) setSelected(new Set());
    else setSelected(new Set(kbEntries.map(e => e.kb_id)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmDelete(false);
  };

  const handleDeleteSelected = async () => {
    try {
      await api.deleteKbEntries([...selected]);
      exitSelectMode();
      refresh();
    } catch (err) { setError(err.message); }
  };

  const addTag = async (kbId, tag) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry || !tag.trim() || entry.tags.includes(tag.trim())) return;
    try {
      await api.updateKbEntry(kbId, { tags: [...entry.tags, tag.trim()] });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const removeTag = async (kbId, tag) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry) return;
    try {
      await api.updateKbEntry(kbId, { tags: entry.tags.filter(t => t !== tag) });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const addRelatedReq = async (kbId, reqId) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry || (entry.related_reqs || []).includes(reqId)) return;
    try {
      await api.updateKbEntry(kbId, { related_reqs: [...(entry.related_reqs || []), reqId] });
      refresh();
    } catch (err) { setError(err.message); }
  };

  const saveImageDescription = async (kbId, index) => {
    setDescSaving(true);
    try {
      await api.updateImageDescription(kbId, index, descDraft);
      setEditingDesc(null); setDescDraft("");
      refresh();
    } catch (err) { setError(err.message); }
    setDescSaving(false);
  };

  const regenerateAllDescriptions = async (kbId) => {
    setDescRegenerating(kbId);
    try {
      await api.regenerateAllImageDescriptions(kbId);
      refresh();
    } catch (err) { setError(err.message); }
    setDescRegenerating(null);
  };

  const removeRelatedReq = async (kbId, reqId) => {
    const entry = kbEntries.find(e => e.kb_id === kbId);
    if (!entry) return;
    try {
      await api.updateKbEntry(kbId, { related_reqs: (entry.related_reqs || []).filter(r => r !== reqId) });
      refresh();
    } catch (err) { setError(err.message); }
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Knowledge Base</h2><p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>{kbEntries.length} entries{selectMode && selected.size > 0 ? ` · ${selected.size} selected` : ""}</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        {!selectMode && kbEntries.length > 0 && <Button variant="secondary" small onClick={() => setSelectMode(true)}>Select</Button>}
        {selectMode && <>
          <Button variant="secondary" small onClick={selectAll}>{selected.size === kbEntries.length ? "Deselect All" : "Select All"}</Button>
          {selected.size > 0 && !confirmDelete && <Button variant="secondary" small onClick={() => setConfirmDelete(true)} style={{ color: COLORS.red || "#ef4444" }}>Delete ({selected.size})</Button>}
          {confirmDelete && <>
            <Button variant="secondary" small onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button small onClick={handleDeleteSelected} style={{ background: COLORS.red || "#ef4444" }}>Confirm Delete</Button>
          </>}
          <Button variant="secondary" small onClick={exitSelectMode}>Done</Button>
        </>}
        <Button onClick={() => setShowAdd(!showAdd)}>+ Add Entry</Button>
      </div>
    </div>
    {showAdd && <Card glow style={{ marginBottom: 20 }}>
      <Input label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Select label="Type" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} style={{ marginBottom: 12 }} options={["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "UI Reference"].map(t => ({ value: t, label: t }))} />
      <Input label="Content" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} textarea style={{ marginBottom: 12 }} />
      <Input label="Tags (comma-separated, e.g. modules, keywords)" value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} mono style={{ marginBottom: 14 }} />
      {(requirements || []).length > 0 && <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Related Requirements</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          {form.related_reqs.map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
            {r}
            <button onClick={() => setForm(p => ({ ...p, related_reqs: p.related_reqs.filter(x => x !== r) }))} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }}>&times;</button>
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
            <input type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={ev => { if (ev.target.files.length) setPendingImages(prev => [...prev, ...Array.from(ev.target.files)]); ev.target.value = ""; }}
            />
          </label>
        </div>
      </div>
      <ErrorBanner msg={error} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => { setShowAdd(false); setPendingImages([]); }}>Cancel</Button><Button onClick={save} disabled={!form.title || !form.content}>Save</Button></div>
    </Card>}
    <ErrorBanner msg={error && !showAdd ? error : ""} />
    {kbEntries.map(e => <Card key={e.kb_id} style={{ marginBottom: 10, border: selectMode && selected.has(e.kb_id) ? `1px solid ${COLORS.accent}` : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {selectMode && <input type="checkbox" checked={selected.has(e.kb_id)} onChange={() => toggleSelect(e.kb_id)} style={{ marginTop: 2, cursor: "pointer", accentColor: COLORS.accent }} />}
        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 8px", borderRadius: 4 }}>{e.kb_id}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>{e.title}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>{e.content}</div>
          {(e.images || []).length > 0 && <div style={{ marginTop: 10 }}>
            {e.images.map((img, i) => {
              const isEditing = editingDesc && editingDesc.kbId === e.kb_id && editingDesc.index === i;
              const regenKey = `${e.kb_id}-${i}`;
              return <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: 8, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={`/api/kb/${e.kb_id}/images/${i}/file`}
                    alt={img.name}
                    style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                    onClick={() => setPreviewImg({ kbId: e.kb_id, index: i, name: img.name })}
                    title={img.name}
                  />
                  <button
                    onClick={() => handleDeleteImage(e.kb_id, i)}
                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: COLORS.red || "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: "18px", padding: 0, fontWeight: 700 }}
                    title="Remove image"
                  >&times;</button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, marginBottom: 4 }}>{img.name}</div>
                  {isEditing ? <div>
                    <textarea
                      value={descDraft}
                      onChange={ev => setDescDraft(ev.target.value)}
                      style={{ width: "100%", minHeight: 80, fontSize: 11, fontFamily: mono, padding: 8, background: COLORS.surfaceRaised, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4, resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <Button small onClick={() => saveImageDescription(e.kb_id, i)} disabled={descSaving}>{descSaving ? "Saving..." : "Save"}</Button>
                      <Button small variant="ghost" onClick={() => { setEditingDesc(null); setDescDraft(""); }}>Cancel</Button>
                    </div>
                  </div> : <div>
                    {img.description ? <>
                      <div onClick={() => setExpandedDescs(prev => { const next = new Set(prev); next.has(regenKey) ? next.delete(regenKey) : next.add(regenKey); return next; })} style={{ fontSize: 10, color: COLORS.accent, cursor: "pointer", fontWeight: 600, userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ display: "inline-block", transform: expandedDescs.has(regenKey) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9654;</span>
                        Description
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
              {t}
              {editingTags === e.kb_id && <button onClick={() => removeTag(e.kb_id, t)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Remove ${t}`}>&times;</button>}
            </span>)}
            <span onClick={() => { setEditingTags(editingTags === e.kb_id ? null : e.kb_id); setTagInput(""); }} style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", fontWeight: 600 }}>{editingTags === e.kb_id ? "Done" : "+ Tag"}</span>
            <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.textMuted }}>|</span>
            {(e.related_reqs || []).map(r => <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 10, fontWeight: 600, color: COLORS.purple, background: COLORS.purpleDim, padding: "2px 6px", borderRadius: 4 }}>
              {r}
              {editingReqs === e.kb_id && <button onClick={() => removeRelatedReq(e.kb_id, r)} style={{ background: "none", border: "none", color: COLORS.red || "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "0 2px", lineHeight: 1 }} title={`Unlink ${r}`}>&times;</button>}
            </span>)}
            <span onClick={() => setEditingReqs(editingReqs === e.kb_id ? null : e.kb_id)} style={{ fontSize: 11, color: COLORS.purple, cursor: "pointer", fontWeight: 600 }}>{editingReqs === e.kb_id ? "Done" : "+ Req"}</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: mono, marginLeft: 8 }}>Used {e.usage_count || 0}×</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>| {(e.images || []).length} image(s)</span>
            <label style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer", marginLeft: 8, fontWeight: 600 }}>
              {uploading === e.kb_id ? "Uploading..." : "+ Add Images"}
              <input type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={ev => { if (ev.target.files.length) handleImageUpload(e.kb_id, ev.target.files); ev.target.value = ""; }}
                disabled={uploading === e.kb_id}
              />
            </label>
            {(e.images || []).length > 0 && <span
              onClick={() => descRegenerating !== e.kb_id && regenerateAllDescriptions(e.kb_id)}
              style={{ fontSize: 11, color: COLORS.purple, cursor: descRegenerating === e.kb_id ? "not-allowed" : "pointer", marginLeft: 8, fontWeight: 600, opacity: descRegenerating === e.kb_id ? 0.5 : 1 }}
            >
              {descRegenerating === e.kb_id ? "Generating Descriptions..." : "Generate Descriptions"}
            </span>}
          </div>
          {editingTags === e.kb_id && <div style={{ marginTop: 8, padding: 10, background: COLORS.surface, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>Tags</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text" value={tagInput} onChange={ev => setTagInput(ev.target.value)}
                onKeyDown={ev => { if (ev.key === "Enter" && tagInput.trim()) { addTag(e.kb_id, tagInput); setTagInput(""); } }}
                placeholder="Type a tag and press Enter"
                style={{ flex: 1, fontSize: 12, fontFamily: mono, padding: "4px 8px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceRaised, color: COLORS.text, outline: "none" }}
              />
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
    </Card>)}
    {previewImg && <div onClick={() => setPreviewImg(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, cursor: "pointer" }}>
      <div style={{ maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={`/api/kb/${previewImg.kbId}/images/${previewImg.index}/file`} alt={previewImg.name} style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }} />
        <div style={{ textAlign: "center", color: "#fff", marginTop: 8, fontSize: 13 }}>{previewImg.name}</div>
      </div>
    </div>}
  </div>;
};
