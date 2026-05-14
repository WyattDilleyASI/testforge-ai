// ═══════════════════════════════════════════════════════════════════════════
// SeedingUploadForm — Step 1 of the wizard
// ═══════════════════════════════════════════════════════════════════════════
//
// Accepts pasted text and/or uploaded files. Optional default subsection
// for accepted candidates to land in. Submits to POST /jobs and hands
// the resulting job_id back to the parent for the processing screen.

import { useState, useEffect, useRef } from "react";
import { useTheme, mono } from "../../theme";
import { Card, Button } from "../shared";
import { seedingApi } from "../../api-seeding";
import { api } from "../../api";

const MAX_TOTAL_CHARS = 1024 * 1024; // mirrors server-side cap (text only)
const ACCEPTED_EXTENSIONS = ".txt,.md,.markdown,.html,.htm,.docx,.png,.jpg,.jpeg,.webp";
const MAX_URLS = 20; // mirrors server-side MAX_URLS_PER_JOB

const isImageFile = (file) => {
  if (!file) return false;
  if ((file.type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name || "");
};

// Thumbnail badge for file list rows. Images get a blue "IMG" badge;
// text files get a neutral badge with their uppercase extension.
const getFileBadge = (file, COLORS) => {
  if (isImageFile(file)) {
    return { label: "IMG", bg: "#E6F1FB", fg: "#185FA5" };
  }
  const name = (file?.name || "").toLowerCase();
  const ext = (name.split(".").pop() || "FILE").toUpperCase();
  return {
    label: ext.slice(0, 4),
    bg: COLORS.surface,
    fg: COLORS.textMuted,
  };
};

export const SeedingUploadForm = ({ onCancel, onCreated }) => {
  const COLORS = useTheme();
  const [tab, setTab] = useState("paste");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState("");
  const [sectionTree, setSectionTree] = useState([]);
  const [defaultSubsectionId, setDefaultSubsectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getKbSections()
      .then((sections) => {
        // Keep only sections that have at least one subsection — bare
        // sections aren't valid destinations (entries must live in a
        // subsection or in Uncategorized, which "— No default —" covers).
        const tree = (sections || []).filter(s => (s.subsections || []).length > 0);
        setSectionTree(tree);
      })
      .catch(() => setSectionTree([]));
  }, []);

  // Text-like files contribute to the text char budget; images don't
  // (their byte size doesn't represent characters and the server checks
  // them against MAX_FILE_SIZE per-file, not the total-chars cap).
  const totalTextChars = content.length + files
    .filter((f) => !isImageFile(f))
    .reduce((sum, f) => sum + f.size, 0);
  const imageCount = files.filter(isImageFile).length;
  const overLimit = totalTextChars > MAX_TOTAL_CHARS;

  // URL list: one per line, stripped + non-empty. Validity is a syntactic
  // prefix check only — the server does real DNS / SSRF / content-type checks.
  const urlLines = urls
    .split(/[\r\n]+/)
    .map(u => u.trim())
    .filter(u => u.length > 0);
  const validUrls = urlLines.filter(u => /^https?:\/\//i.test(u));
  const invalidUrlCount = urlLines.length - validUrls.length;
  const overUrlLimit = validUrls.length > MAX_URLS;

  const canSubmit = !submitting && !overLimit && !overUrlLimit &&
    (content.trim().length > 0 ||
     files.length > 0 ||
     validUrls.length > 0);

  const handleFiles = (incoming) => {
    const added = Array.from(incoming || []);
    setFiles((existing) => [...existing, ...added]);
  };

  const removeFile = (idx) => {
    setFiles((existing) => existing.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await seedingApi.createJob({
        content: tab === "paste"  ? content   : undefined,
        files:   tab === "upload" ? files     : undefined,
        urls:    tab === "urls"   ? validUrls : undefined,
        defaultSubsectionId: defaultSubsectionId || undefined,
      });
      onCreated(result.job_id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{ background: "transparent", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, padding: 4, fontFamily: mono }}
          >
            ← Back
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
            New seeding job
          </h2>
        </div>
      </div>

      {error && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: "#E24B4A" }}>
          <div style={{ fontSize: 12, color: "#E24B4A" }}>{error}</div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
          <TabButton active={tab === "paste"} onClick={() => setTab("paste")} COLORS={COLORS}>
            Paste text
          </TabButton>
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")} COLORS={COLORS}>
            Upload files {files.length > 0 && `(${files.length})`}
          </TabButton>
          <TabButton active={tab === "urls"} onClick={() => setTab("urls")} COLORS={COLORS}>
            Add URLs {validUrls.length > 0 && `(${validUrls.length})`}
          </TabButton>
        </div>

        <div style={{ padding: 16 }}>
          {tab === "paste" && (
            <>
              <SectionLabel COLORS={COLORS}>Source material</SectionLabel>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Paste anything that contains testable knowledge — defect notes, tribal knowledge, Confluence exports, meeting transcripts, business rules.

Claude will extract candidate KB entries and cross-reference them against your existing requirements. You'll review each one before it lands in the KB.`}
                disabled={submitting}
                style={{
                  width: "100%", minHeight: 280, fontSize: 13, lineHeight: 1.55,
                  fontFamily: mono, padding: 12, background: COLORS.surface,
                  color: COLORS.text, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none",
                }}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textMuted, fontFamily: mono, textAlign: "right" }}>
                {content.length.toLocaleString()} characters
              </div>
            </>
          )}

          {tab === "upload" && (
            <>
              <SectionLabel COLORS={COLORS}>Files to extract from</SectionLabel>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                style={{
                  border: `2px dashed ${COLORS.border}`, borderRadius: 8,
                  padding: 32, textAlign: "center", cursor: "pointer",
                  background: COLORS.surface, marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 14, color: COLORS.textBright, marginBottom: 4 }}>
                  Click to choose, or drop files here
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
                  .txt · .md · .html · .docx · .png · .jpg · .webp · 10 MB per file
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={submitting}
                  style={{ display: "none" }}
                />
              </div>

              {files.length > 0 && (
                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
                  {files.map((file, idx) => {
                    const badge = getFileBadge(file, COLORS);
                    const isImg = isImageFile(file);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px",
                          borderBottom: idx < files.length - 1 ? `1px solid ${COLORS.border}` : "none",
                        }}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: 4,
                          background: badge.bg, color: badge.fg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, fontFamily: mono,
                          flexShrink: 0, letterSpacing: "0.05em",
                        }}>
                          {badge.label}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {file.name}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
                            {(file.size / 1024).toFixed(1)} KB
                            {isImg ? " · vision describe" : " · text extraction"}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(idx)}
                          disabled={submitting}
                          style={{ background: "transparent", border: "none", color: COLORS.textMuted, cursor: "pointer", padding: 4, fontSize: 12, fontFamily: mono }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "urls" && (
            <>
              <SectionLabel COLORS={COLORS}>URLs to fetch (one per line)</SectionLabel>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={`https://confluence.example.com/x/AbCdEf
https://docs.example.com/api/auth
https://wiki.example.com/known-issues

URLs are fetched server-side. Public HTML/text pages only — no PDFs, no authenticated pages, no internal addresses.`}
                disabled={submitting}
                style={{
                  width: "100%", minHeight: 220, fontSize: 13, lineHeight: 1.55,
                  fontFamily: mono, padding: 12, background: COLORS.surface,
                  color: COLORS.text, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none",
                }}
              />
              <div style={{
                marginTop: 6, fontSize: 11, fontFamily: mono,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              }}>
                <div style={{ color: COLORS.textMuted }}>
                  {invalidUrlCount > 0 && (
                    <span style={{ color: "#E2A04B" }}>
                      {invalidUrlCount} line{invalidUrlCount === 1 ? "" : "s"} without http(s):// — will be skipped
                    </span>
                  )}
                </div>
                <div style={{ color: overUrlLimit ? "#E24B4A" : COLORS.textMuted }}>
                  {validUrls.length} of {MAX_URLS} URLs
                  {overUrlLimit && " — exceeds limit"}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <SectionLabel COLORS={COLORS}>Default destination (optional)</SectionLabel>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>
          Where accepted candidates land in the KB by default. Can be overridden per-candidate during review.
        </div>
        <select
          value={defaultSubsectionId}
          onChange={(e) => setDefaultSubsectionId(e.target.value)}
          disabled={submitting}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13,
            background: COLORS.surface, color: COLORS.text,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            fontFamily: mono, outline: "none",
          }}
        >
          <option value="">— No default —</option>
          {sectionTree.map((sec) => (
            <optgroup key={sec.section_id} label={sec.name}>
              {sec.subsections.map((sub) => (
                <option key={sub.subsection_id} value={sub.subsection_id}>
                  {sub.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: overLimit ? "#E24B4A" : COLORS.textMuted, fontFamily: mono }}>
          {totalTextChars.toLocaleString()} / {MAX_TOTAL_CHARS.toLocaleString()} text chars
          {imageCount > 0 && ` · ${imageCount} image${imageCount !== 1 ? "s" : ""}`}
          {overLimit && " — exceeds limit, split into multiple jobs"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? "Starting…" : "Start seeding"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, COLORS, children }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: active ? 600 : 400,
      color: active ? COLORS.textBright : COLORS.textMuted,
      background: active ? COLORS.surface : "transparent",
      border: "none",
      borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
      cursor: "pointer", fontFamily: mono, letterSpacing: "0.02em",
    }}
  >
    {children}
  </button>
);

const SectionLabel = ({ COLORS, children }) => (
  <div style={{
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 8,
  }}>
    {children}
  </div>
);
