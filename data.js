const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { getDb, getKbDb, getTcDb, getReqDb, logAudit, nextKbId, nextSectionId, nextSubsectionId, getProductContext, setSetting, getSetting, saveImage, readImageBase64, readImage, deleteImage, deleteImageDir } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const MAX_DESCRIBE_DIM = 1568;

async function resizeIfNeeded(base64Data, mediaType) {
  const buf = Buffer.from(base64Data, "base64");
  const metadata = await sharp(buf).metadata();
  if (metadata.width > MAX_DESCRIBE_DIM || metadata.height > MAX_DESCRIBE_DIM) {
    const resized = await sharp(buf)
      .resize({ width: MAX_DESCRIBE_DIM, height: MAX_DESCRIBE_DIM, fit: "inside", withoutEnlargement: true })
      .toFormat(mediaType === "image/png" ? "png" : "jpeg")
      .toBuffer();
    return resized.toString("base64");
  }
  return base64Data;
}

function buildDescribePrompt(kbEntry, imageNames) {
  const { product_context, key_terms } = getProductContext();

  let prompt = `You are helping a QA engineer by describing UI screenshots so they can be used as context for test case generation.`;

  if (product_context) prompt += `\n\nProduct context:\n${product_context}`;
  if (key_terms) prompt += `\n\nKey terms (use these in your descriptions where applicable):\n${key_terms}`;

  if (kbEntry) {
    prompt += `\n\nThese images belong to the following knowledge base entry:`;
    prompt += `\nTitle: ${kbEntry.title}`;
    prompt += `\nType: ${kbEntry.type}`;
    const tags = typeof kbEntry.tags === "string" ? JSON.parse(kbEntry.tags || "[]") : (kbEntry.tags || []);
    if (tags.length) prompt += `\nTags: ${tags.join(", ")}`;
    if (kbEntry.content) {
      prompt += `\n\nFull entry content (references images by filename — numbered lists in the content correspond to numbered callouts visible in the screenshots):\n${kbEntry.content}`;
    }
  }

  const nameList = imageNames.map((n, i) => `Image ${i + 1}: ${n}`).join("\n");
  prompt += `\n\nYou are describing ${imageNames.length} image(s):\n${nameList}`;
  prompt += `\nFor each image, find where its filename is referenced in the content above. Numbered list items near that reference correspond to numbered callouts or UI elements visible in that screenshot.`;

  prompt += `\n\nFor EACH image, provide a description in this format (use the image filename as a separator):

=== [image filename] ===
Screen: [Name of the screen, dialog, or UI section shown]
Purpose: [What this screen/section is used for, in one sentence]
Key Elements:
- [Element name]: [Type (button, field, dropdown, etc.)] — [What it does or its current state]
Callout Mapping (include ONLY if numbered callouts are visible in the image):
1. [What callout 1 points to] — [Its meaning from the entry content]
2. [What callout 2 points to] — [Its meaning from the entry content]
...
Navigation: [How a user reaches this screen]
Notable States: [Any visible states, selections, errors, or data shown]`;

  return prompt;
}

// Load image data from filesystem for API calls
function loadImageData(kbId, img) {
  const data = readImageBase64(kbId, img.name);
  return data ? { name: img.name, media_type: img.media_type, data } : null;
}

// Describe multiple images in one API call with full KB context
async function describeImages(kbId, images, kbEntry) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return images.map(() => null);

  const content = [{ type: "text", text: buildDescribePrompt(kbEntry, images.map(img => img.name)) }];
  for (const img of images) {
    const data = img.data || readImageBase64(kbId, img.name);
    if (!data) continue;
    const resized = await resizeIfNeeded(data, img.media_type);
    content.push({ type: "text", text: `Image: ${img.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: resized } });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 2000 * images.length,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await response.json();
  if (data.error) return images.map(() => null);

  const fullText = data.content?.map(c => c.text || "").join("") || "";

  // Parse out individual descriptions by === filename === separators
  const descriptions = [];
  for (let i = 0; i < images.length; i++) {
    const name = images[i].name;
    const marker = `=== ${name} ===`;
    const start = fullText.indexOf(marker);
    if (start === -1) { descriptions.push(null); continue; }

    const contentStart = start + marker.length;
    const nextMarker = fullText.indexOf("===", contentStart + 1);
    const end = nextMarker !== -1 ? fullText.lastIndexOf("\n", nextMarker) : fullText.length;
    descriptions.push(fullText.slice(contentStart, end).trim() || null);
  }
  return descriptions;
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── KB SECTIONS & SUBSECTIONS ──────────────────────────────────────────────
// NOTE: These routes are registered BEFORE /kb/:kbId routes so Express
// doesn't match "sections" or "subsections" as a :kbId parameter.

// GET /api/kb/sections — full hierarchy: sections → subsections → entry counts
router.get("/kb/sections", requireAuth, (req, res) => {
  const db = getKbDb();
  const sections = db.prepare("SELECT * FROM kb_sections ORDER BY sort_order, rowid").all();
  const subsections = db.prepare("SELECT * FROM kb_subsections ORDER BY sort_order, rowid").all();

  // Count entries per subsection
  const subCounts = db.prepare(`
    SELECT subsection_id, COUNT(*) as entry_count
    FROM kb_entries
    WHERE subsection_id IS NOT NULL
    GROUP BY subsection_id
  `).all();
  const countMap = Object.fromEntries(subCounts.map(r => [r.subsection_id, r.entry_count]));

  // Count uncategorized entries (subsection_id IS NULL)
  const uncatCount = db.prepare("SELECT COUNT(*) as count FROM kb_entries WHERE subsection_id IS NULL").get().count;

  const result = sections.map(sec => ({
    section_id: sec.section_id,
    name: sec.name,
    is_default: !!sec.is_default,
    sort_order: sec.sort_order,
    created_by: sec.created_by,
    created_at: sec.created_at,
    // Default section gets uncategorized count instead of subsections
    ...(sec.is_default
      ? { entry_count: uncatCount, subsections: [] }
      : {
          subsections: subsections
            .filter(sub => sub.section_id === sec.section_id)
            .map(sub => ({
              subsection_id: sub.subsection_id,
              section_id: sub.section_id,
              name: sub.name,
              description: sub.description || "",
              sort_order: sub.sort_order,
              entry_count: countMap[sub.subsection_id] || 0,
              created_by: sub.created_by,
              created_at: sub.created_at,
            })),
        }
    ),
  }));

  res.json(result);
});

// POST /api/kb/sections — create a new section
router.post("/kb/sections", requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Section name is required" });

  const db = getKbDb();
  const sectionId = nextSectionId();

  // sort_order: place after all existing sections
  const maxOrder = db.prepare("SELECT MAX(sort_order) as max FROM kb_sections").get().max || 0;

  db.prepare("INSERT INTO kb_sections (section_id, name, sort_order, created_by) VALUES (?, ?, ?, ?)")
    .run(sectionId, name.trim(), maxOrder + 1, req.session.name);

  logAudit(req.session.name, "KB_SECTION_CREATED", `Created section ${sectionId}: ${name.trim()}`);
  res.json({ ok: true, section_id: sectionId });
});

// PUT /api/kb/sections/:sectionId — rename a section
router.put("/kb/sections/:sectionId", requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Section name is required" });

  const db = getKbDb();
  const section = db.prepare("SELECT * FROM kb_sections WHERE section_id = ?").get(req.params.sectionId);
  if (!section) return res.status(404).json({ error: "Section not found" });
  if (section.is_default) return res.status(403).json({ error: "Cannot rename the default section" });

  db.prepare("UPDATE kb_sections SET name = ? WHERE section_id = ?").run(name.trim(), req.params.sectionId);
  logAudit(req.session.name, "KB_SECTION_RENAMED", `Renamed section ${req.params.sectionId}: "${section.name}" → "${name.trim()}"`);
  res.json({ ok: true });
});

// DELETE /api/kb/sections/:sectionId — delete a section (must be empty)
router.delete("/kb/sections/:sectionId", requireAuth, (req, res) => {
  const db = getKbDb();
  const section = db.prepare("SELECT * FROM kb_sections WHERE section_id = ?").get(req.params.sectionId);
  if (!section) return res.status(404).json({ error: "Section not found" });
  if (section.is_default) return res.status(403).json({ error: "Cannot delete the default section" });

  // Block if section has subsections
  const subCount = db.prepare("SELECT COUNT(*) as count FROM kb_subsections WHERE section_id = ?").get(req.params.sectionId).count;
  if (subCount > 0) return res.status(400).json({ error: `Section has ${subCount} subsection(s). Remove them first.` });

  db.prepare("DELETE FROM kb_sections WHERE section_id = ?").run(req.params.sectionId);
  logAudit(req.session.name, "KB_SECTION_DELETED", `Deleted section ${req.params.sectionId}: ${section.name}`);
  res.json({ ok: true });
});

// POST /api/kb/subsections — create a new subsection
router.post("/kb/subsections", requireAuth, (req, res) => {
  const { section_id, name, description } = req.body;
  if (!section_id) return res.status(400).json({ error: "section_id is required" });
  if (!name || !name.trim()) return res.status(400).json({ error: "Subsection name is required" });

  const db = getKbDb();

  const section = db.prepare("SELECT * FROM kb_sections WHERE section_id = ?").get(section_id);
  if (!section) return res.status(404).json({ error: "Parent section not found" });
  if (section.is_default) return res.status(400).json({ error: "Cannot add subsections to the default section" });

  const subsectionId = nextSubsectionId();
  const maxOrder = db.prepare("SELECT MAX(sort_order) as max FROM kb_subsections WHERE section_id = ?").get(section_id).max || 0;

  db.prepare("INSERT INTO kb_subsections (subsection_id, section_id, name, description, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(subsectionId, section_id, name.trim(), (description || "").trim(), maxOrder + 1, req.session.name);

  logAudit(req.session.name, "KB_SUBSECTION_CREATED", `Created subsection ${subsectionId} in ${section_id}: ${name.trim()}`);
  res.json({ ok: true, subsection_id: subsectionId });
});

// PUT /api/kb/subsections/:subsectionId — update a subsection (name and/or description)
router.put("/kb/subsections/:subsectionId", requireAuth, (req, res) => {
  const { name, description } = req.body;

  const db = getKbDb();
  const sub = db.prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?").get(req.params.subsectionId);
  if (!sub) return res.status(404).json({ error: "Subsection not found" });

  const updates = [];
  if (name !== undefined && name.trim()) {
    db.prepare("UPDATE kb_subsections SET name = ? WHERE subsection_id = ?").run(name.trim(), req.params.subsectionId);
    updates.push(`name: "${sub.name}" → "${name.trim()}"`);
  }
  if (description !== undefined) {
    db.prepare("UPDATE kb_subsections SET description = ? WHERE subsection_id = ?").run(description.trim(), req.params.subsectionId);
    updates.push("description updated");
  }
  if (updates.length > 0) {
    logAudit(req.session.name, "KB_SUBSECTION_UPDATED", `Updated subsection ${req.params.subsectionId}: ${updates.join("; ")}`);
  }
  res.json({ ok: true });
});

// DELETE /api/kb/subsections/:subsectionId — delete a subsection (must have no entries)
router.delete("/kb/subsections/:subsectionId", requireAuth, (req, res) => {
  const db = getKbDb();
  const sub = db.prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?").get(req.params.subsectionId);
  if (!sub) return res.status(404).json({ error: "Subsection not found" });

  // Block if subsection has entries
  const entryCount = db.prepare("SELECT COUNT(*) as count FROM kb_entries WHERE subsection_id = ?").get(req.params.subsectionId).count;
  if (entryCount > 0) return res.status(400).json({ error: `Subsection has ${entryCount} KB entry/entries. Move or delete them first.` });

  db.prepare("DELETE FROM kb_subsections WHERE subsection_id = ?").run(req.params.subsectionId);
  logAudit(req.session.name, "KB_SUBSECTION_DELETED", `Deleted subsection ${req.params.subsectionId}: ${sub.name}`);
  res.json({ ok: true });
});

// PUT /api/kb/:kbId/move — move a KB entry to a different subsection (or to Uncategorized)
router.put("/kb/:kbId/move", requireAuth, (req, res) => {
  const { subsection_id } = req.body;
  // subsection_id = null → move to Uncategorized
  // subsection_id = "KB-SS001" → move to that subsection

  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  if (subsection_id !== null && subsection_id !== undefined) {
    const sub = db.prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?").get(subsection_id);
    if (!sub) return res.status(404).json({ error: "Target subsection not found" });
  }

  const targetId = subsection_id || null;
  db.prepare("UPDATE kb_entries SET subsection_id = ? WHERE kb_id = ?").run(targetId, req.params.kbId);

  const dest = targetId ? targetId : "Uncategorized";
  logAudit(req.session.name, "KB_ENTRY_MOVED", `Moved ${req.params.kbId} to ${dest}`);
  res.json({ ok: true });
});

// ─── KNOWLEDGE BASE ENTRIES ─────────────────────────────────────────────────

// GET /api/kb/export — full export with base64-embedded images
router.get("/kb/export", requireAuth, (req, res) => {
  const rows = getKbDb().prepare("SELECT * FROM kb_entries ORDER BY rowid").all();
  const entries = rows.map(kb => {
    const images = JSON.parse(kb.images || "[]").map(img => {
      const b64 = readImageBase64(kb.kb_id, img.name);
      return { ...img, data: b64 ? `data:${img.media_type};base64,${b64}` : null };
    });
    return {
      ...kb,
      tags: JSON.parse(kb.tags || "[]"),
      related_reqs: JSON.parse(kb.related_reqs || "[]"),
      images,
      subsection_id: kb.subsection_id || null,
    };
  });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="kb-export-${date}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(entries, null, 2));
});

// POST /api/kb/import — restore from a JSON export
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post("/kb/import", requireAuth, importUpload.single("file"), (req, res) => {
  try {
    const mode = req.body.mode;
    if (!["merge", "replace"].includes(mode)) return res.status(400).json({ error: "mode must be 'merge' or 'replace'" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let entries;
    try {
      entries = JSON.parse(req.file.buffer.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON file" });
    }

    if (!Array.isArray(entries)) return res.status(400).json({ error: "entries must be an array" });
    if (!Array.isArray(entries)) return res.status(400).json({ error: "entries must be an array" });
    if (!["merge", "replace"].includes(mode)) return res.status(400).json({ error: "mode must be 'merge' or 'replace'" });

    const db = getKbDb();

    if (mode === "replace") {
      const existing = db.prepare("SELECT kb_id FROM kb_entries").all();
      for (const { kb_id } of existing) deleteImageDir(kb_id);
      db.prepare("DELETE FROM kb_entries").run();
    }

    const insertStmt = db.prepare(
      "INSERT INTO kb_entries (kb_id, title, type, content, tags, related_reqs, images, subsection_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      const { kb_id, title, type, content, tags, related_reqs, images, subsection_id, created_by, created_at } = entry;
      if (!title || !content) { skipped++; continue; }

      if (mode === "merge" && kb_id) {
        const exists = db.prepare("SELECT 1 FROM kb_entries WHERE kb_id = ?").get(kb_id);
        if (exists) { skipped++; continue; }
      }

      const useId = kb_id || nextKbId();

      try {
        const savedImages = [];
        for (const img of (images || [])) {
          if (img.data) {
            const b64 = img.data.replace(/^data:[^;]+;base64,/, "");
            const savedName = saveImage(useId, img.name, b64);
            savedImages.push({ name: savedName, media_type: img.media_type, description: img.description || "" });
          } else if (img.name) {
            savedImages.push({ name: img.name, media_type: img.media_type, description: img.description || "" });
          }
        }
        insertStmt.run(
          useId,
          title,
          type || "Defect History",
          content,
          JSON.stringify(Array.isArray(tags) ? tags : []),
          JSON.stringify(Array.isArray(related_reqs) ? related_reqs : []),
          JSON.stringify(savedImages),
          subsection_id || null,
          created_by || req.session.name,
          created_at || new Date().toISOString()
        );
        imported++;
      } catch {
        skipped++;
      }
    }

    logAudit(req.session.name, "KB_IMPORTED", `Imported ${imported} KB entries (mode: ${mode}), skipped ${skipped}`);
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    console.error("KB import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kb
router.get("/kb", requireAuth, (req, res) => {
  const rows = getKbDb().prepare("SELECT * FROM kb_entries ORDER BY rowid").all();
  res.json(rows.map(kb => ({
    ...kb,
    tags: JSON.parse(kb.tags || "[]"),
    related_reqs: JSON.parse(kb.related_reqs || "[]"),
    images: JSON.parse(kb.images || "[]"),
    subsection_id: kb.subsection_id || null,
  })));
});

// GET /api/kb/matched/:reqId — return KB entries that match a requirement (by tags or related_reqs)
// Used by the SysML diagram context menu to show relevant KB context before generation
router.get("/kb/matched/:reqId", requireAuth, (req, res) => {
  const reqId = req.params.reqId;

  // Look up the requirement's tags
  const requirement = getReqDb().prepare("SELECT * FROM requirements WHERE req_id = ?").get(reqId);
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });

  const reqTags = JSON.parse(requirement.tags || "[]");

  // Find KB entries that share a tag with this requirement OR list it in related_reqs
  const allKb = getKbDb().prepare("SELECT * FROM kb_entries ORDER BY rowid").all();
  const matched = allKb.filter(kb => {
    const kbTags = JSON.parse(kb.tags || "[]");
    const kbRelReqs = JSON.parse(kb.related_reqs || "[]");
    return kbTags.some(t => reqTags.includes(t)) || kbRelReqs.includes(reqId);
  });

  res.json(matched.map(kb => ({
    kb_id: kb.kb_id,
    title: kb.title,
    type: kb.type,
    subsection_id: kb.subsection_id || null,
  })));
});

// POST /api/kb
router.post("/kb", requireAuth, (req, res) => {
  const { title, type, content, tags, related_reqs, subsection_id } = req.body;

  if (!title || !content) return res.status(400).json({ error: "Title and content are required" });

  // Validate subsection exists if provided
  if (subsection_id) {
    const sub = getKbDb().prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?").get(subsection_id);
    if (!sub) return res.status(400).json({ error: "Invalid subsection_id" });
  }

  const kbId = nextKbId();
  getKbDb().prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags, related_reqs, subsection_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(kbId, title, type || "Defect History", content, JSON.stringify(tags || []), JSON.stringify(related_reqs || []), subsection_id || null, req.session.name);

  logAudit(req.session.name, "KB_CREATED", `Created KB entry ${kbId}: ${title}${subsection_id ? ` in ${subsection_id}` : ""}`);
  res.json({ ok: true, kb_id: kbId });
});

// GET /api/kb/:kbId/images/:index/file — serve an image file
router.get("/kb/:kbId/images/:index/file", requireAuth, (req, res) => {
  const db = getKbDb();
  const entry = db.prepare("SELECT images FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  const img = images[idx];
  const buf = readImage(req.params.kbId, img.name);
  if (!buf) return res.status(404).json({ error: "Image file not found" });

  res.set("Content-Type", img.media_type);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(buf);
});

// POST /api/kb/:kbId/images — upload images to a KB entry, auto-generate descriptions
router.post("/kb/:kbId/images", requireAuth, upload.array("images", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No images uploaded" });

  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const existing = JSON.parse(entry.images || "[]");
  const kbId = req.params.kbId;

  // Save files to disk and build metadata
  const newImages = req.files.map(f => {
    const savedName = saveImage(kbId, f.originalname, f.buffer.toString("base64"));
    return { name: savedName, media_type: f.mimetype, description: null };
  });

  // Auto-generate descriptions — pass raw base64 for new uploads (still in memory)
  const imagesWithData = req.files.map((f, i) => ({
    name: newImages[i].name,
    media_type: f.mimetype,
    data: f.buffer.toString("base64"),
  }));

  try {
    const descriptions = await describeImages(kbId, imagesWithData, entry);
    for (let i = 0; i < newImages.length; i++) {
      if (descriptions[i]) newImages[i].description = descriptions[i];
    }
  } catch (e) { console.error("Image describe failed:", e.message); }

  const updated = [...existing, ...newImages];
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(updated), kbId);

  logAudit(req.session.name, "KB_IMAGE_ADDED", `Added ${newImages.length} image(s) to ${kbId}`);
  res.json({ ok: true, imageCount: updated.length, images: updated.map(img => ({ name: img.name, description: img.description || null })) });
});

// POST /api/kb/:kbId/images/describe-all — regenerate all image descriptions for a KB entry
// NOTE: must be registered before :index routes to avoid Express matching "describe-all" as :index
router.post("/kb/:kbId/images/describe-all", requireAuth, async (req, res) => {
  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  if (images.length === 0) return res.status(400).json({ error: "No images to describe" });

  const descriptions = await describeImages(req.params.kbId, images, entry);
  for (let i = 0; i < images.length; i++) {
    if (descriptions[i]) images[i].description = descriptions[i];
  }

  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);
  logAudit(req.session.name, "KB_IMAGE_DESC_GENERATED", `Regenerated all descriptions for ${req.params.kbId}`);
  res.json({ ok: true, descriptions: images.map(img => ({ name: img.name, description: img.description || null })) });
});

// DELETE /api/kb/:kbId/images/:index — remove an image from a KB entry
router.delete("/kb/:kbId/images/:index", requireAuth, (req, res) => {
  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  const removed = images.splice(idx, 1);
  deleteImage(req.params.kbId, removed[0].name);
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_REMOVED", `Removed image "${removed[0].name}" from ${req.params.kbId}`);
  res.json({ ok: true, imageCount: images.length });
});

// PUT /api/kb/:kbId/images/:index/description — edit an image description
router.put("/kb/:kbId/images/:index/description", requireAuth, (req, res) => {
  const { description } = req.body;
  if (typeof description !== "string") return res.status(400).json({ error: "description is required" });

  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  images[idx].description = description;
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_DESC_EDITED", `Edited description for image ${idx} in ${req.params.kbId}`);
  res.json({ ok: true });
});

// POST /api/kb/:kbId/images/:index/describe — regenerate an image description via Claude
router.post("/kb/:kbId/images/:index/describe", requireAuth, async (req, res) => {
  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  const img = images[idx];
  const results = await describeImages(req.params.kbId, [img], entry);
  const description = results[0];
  if (!description) return res.status(500).json({ error: "Failed to generate description. Check ANTHROPIC_API_KEY." });

  images[idx].description = description;
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_DESC_GENERATED", `Regenerated description for image ${idx} in ${req.params.kbId}`);
  res.json({ ok: true, description });
});

// PUT /api/kb/:kbId — update KB entry fields (title, type, content, tags, related_reqs)
router.put("/kb/:kbId", requireAuth, (req, res) => {
  const { title, type, content, tags, related_reqs } = req.body;
  const db = getKbDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const updates = [];
  if (title !== undefined && title.trim()) {
    db.prepare("UPDATE kb_entries SET title = ? WHERE kb_id = ?").run(title.trim(), req.params.kbId);
    updates.push(`title: "${title.trim()}"`);
  }
  if (type !== undefined) {
    db.prepare("UPDATE kb_entries SET type = ? WHERE kb_id = ?").run(type, req.params.kbId);
    updates.push(`type: ${type}`);
  }
  if (content !== undefined && content.trim()) {
    db.prepare("UPDATE kb_entries SET content = ? WHERE kb_id = ?").run(content.trim(), req.params.kbId);
    updates.push("content updated");
  }
  if (tags !== undefined) {
    db.prepare("UPDATE kb_entries SET tags = ? WHERE kb_id = ?").run(JSON.stringify(tags), req.params.kbId);
    updates.push(`tags: ${tags.join(", ")}`);
  }
  if (related_reqs !== undefined) {
    db.prepare("UPDATE kb_entries SET related_reqs = ? WHERE kb_id = ?").run(JSON.stringify(related_reqs), req.params.kbId);
    updates.push(`related_reqs: ${related_reqs.join(", ")}`);
  }
  if (updates.length > 0) {
    logAudit(req.session.name, "KB_UPDATED", `Updated ${req.params.kbId}: ${updates.join("; ")}`);
  }

  res.json({ ok: true });
});

// DELETE /api/kb — delete selected KB entries
router.delete("/kb", requireAuth, (req, res) => {
  const { kbIds } = req.body;
  if (!Array.isArray(kbIds) || kbIds.length === 0) return res.status(400).json({ error: "kbIds array is required" });

  const db = getKbDb();
  const deleteStmt = db.prepare("DELETE FROM kb_entries WHERE kb_id = ?");
  const deleteMany = db.transaction((ids) => {
    for (const id of ids) {
      deleteStmt.run(id);
      deleteImageDir(id);
    }
  });
  deleteMany(kbIds);

  logAudit(req.session.name, "KB_DELETED", `Deleted ${kbIds.length} KB entries: ${kbIds.join(", ")}`);
  res.json({ ok: true, deleted: kbIds.length });
});

// ─── AUDIT LOG ──────────────────────────────────────────────────────────────

// GET /api/audit — Admin only (UM-005 / UM-007)
router.get("/audit", requireRole("Admin"), (req, res) => {
  const rows = getDb().prepare("SELECT * FROM audit_log ORDER BY rowid DESC LIMIT 100").all();
  res.json(rows);
});

// ─── TOKEN USAGE ─────────────────────────────────────────────────────────────

// Pricing per 1M tokens (USD) — update if model changes
const MODEL_PRICING = {
  "claude-opus-4-6":              { input: 15.00, output: 75.00 },
  "claude-sonnet-4-6":            { input:  3.00, output: 15.00 },
  "claude-sonnet-4-20250514":     { input:  3.00, output: 15.00 },
  "claude-haiku-4-5-20251001":    { input:  0.80, output:  4.00 },
};
const DEFAULT_PRICING = { input: 3.00, output: 15.00 }; // sonnet fallback

function computeCost(inputTokens, outputTokens) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// GET /api/usage/tokens
router.get("/usage/tokens", requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as call_count FROM token_usage").get();
  const budget = process.env.TOKEN_BUDGET ? parseInt(process.env.TOKEN_BUDGET) : null;
  const inputTokens = row.total_input || 0;
  const outputTokens = row.total_output || 0;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = computeCost(inputTokens, outputTokens);
  res.json({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    call_count: row.call_count || 0,
    cost_usd: costUsd,
    budget: budget,
    remaining: budget !== null ? Math.max(0, budget - totalTokens) : null,
  });
});

// ─── JAMA EXPORT ────────────────────────────────────────────────────────────

// GET /api/jama/log — export activity log
router.get("/jama/log", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM jama_export_log ORDER BY rowid DESC LIMIT 50").all();
  res.json(rows);
});

// POST /api/jama/export — simulate Jama export (QA Manager+ per UM-004)
router.post("/jama/export", requireRole("Admin", "QA Manager"), (req, res) => {
  const coreDb = getDb();
  const tcDb = getTcDb();
  const reqDb = getReqDb();

  // JM-004: Pre-export validation — check for orphaned TCs
  const allTcs = tcDb.prepare("SELECT * FROM test_cases").all();
  const allReqIds = reqDb.prepare("SELECT req_id FROM requirements").all().map(r => r.req_id);

  const hasReqLink = (tc) => {
    const linked = JSON.parse(tc.linked_req_ids || "[]");
    const tlReqs = JSON.parse(tc.testlink_requirements || "[]");
    return (linked.length > 0 && linked.some(rid => allReqIds.includes(rid))) || tlReqs.length > 0;
  };

  const orphaned = allTcs.filter(tc => !hasReqLink(tc));

  if (orphaned.length > 0) {
    coreDb.prepare("INSERT INTO jama_export_log (user_name, action, details, status, tc_count) VALUES (?, ?, ?, ?, ?)")
      .run(req.session.name, "VALIDATION FAILED", `${orphaned.length} orphaned TC(s). Export blocked per JM-004.`, "error", 0);
    logAudit(req.session.name, "JAMA_EXPORT_BLOCKED", `Pre-export validation failed: ${orphaned.length} orphaned TCs`, "error");
    return res.json({ status: "error", details: `${orphaned.length} orphaned TC(s) detected. Export blocked per JM-004.` });
  }

  // Only export reviewed TCs
  const exportable = allTcs.filter(tc => hasReqLink(tc) && tc.status === "Reviewed");

  const tlCount = exportable.filter(tc => JSON.parse(tc.testlink_requirements || "[]").length > 0).length;
  const reqLinkedCount = exportable.length - tlCount;
  const detailParts = [];
  if (reqLinkedCount > 0) detailParts.push(`${reqLinkedCount} with Testforge REQ links`);
  if (tlCount > 0) detailParts.push(`${tlCount} with TestLink requirements`);
  const details = `${exportable.length} reviewed TCs exported (${detailParts.join(", ")}). JM-007 field mapping applied.`;

  coreDb.prepare("INSERT INTO jama_export_log (user_name, action, details, status, tc_count) VALUES (?, ?, ?, ?, ?)")
    .run(req.session.name, "EXPORT TO JAMA", details, "success", exportable.length);
  logAudit(req.session.name, "JAMA_EXPORT", `Exported ${exportable.length} reviewed TCs to Jama`);

  res.json({ status: "success", details: `${exportable.length} reviewed TCs exported.`, count: exportable.length });
});

// ─── PRODUCT CONTEXT SETTINGS ───────────────────────────────────────────────

// GET /api/product-context
router.get("/product-context", requireAuth, (req, res) => {
  res.json(getProductContext());
});

// PUT /api/product-context
router.put("/product-context", requireAuth, (req, res) => {
  const { product_context, key_terms } = req.body;
  if (product_context !== undefined) setSetting("product_context", product_context);
  if (key_terms !== undefined) setSetting("key_terms", key_terms);
  logAudit(req.session.name, "PRODUCT_CONTEXT_UPDATED", "Updated product context settings");
  res.json({ ok: true });
});

// GET /api/example-tc — get the example test case for few-shot prompting
router.get("/example-tc", requireAuth, (req, res) => {
  const raw = getSetting("example_tc");
  res.json({ example_tc: raw ? JSON.parse(raw) : null });
});

// PUT /api/example-tc — set a test case as the example
router.put("/example-tc", requireAuth, (req, res) => {
  const { tc_id } = req.body;
  if (!tc_id) {
    // Clear the example
    setSetting("example_tc", "");
    logAudit(req.session.name, "EXAMPLE_TC_CLEARED", "Cleared example test case");
    return res.json({ ok: true });
  }

  const tc = getTcDb().prepare("SELECT * FROM test_cases WHERE tc_id = ?").get(tc_id);
  if (!tc) return res.status(404).json({ error: "Test case not found" });

  // Store a clean version with only prompt-relevant fields
  const example = {
    tc_id: tc.tc_id,
    title: tc.title,
    type: tc.type,
    description: tc.description,
    preconditions: tc.preconditions,
    steps: tc.steps,
    req_attribute: tc.req_attribute,
  };
  setSetting("example_tc", JSON.stringify(example));
  logAudit(req.session.name, "EXAMPLE_TC_SET", `Set example test case: ${tc.tc_id} — ${tc.title}`);
  res.json({ ok: true, example_tc: example });
});

module.exports = router;