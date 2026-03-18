const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { getDb, logAudit, nextKbId, getProductContext, setSetting } = require("../db");
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

// Describe multiple images in one API call with full KB context
async function describeImages(images, kbEntry) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return images.map(() => null);

  const content = [{ type: "text", text: buildDescribePrompt(kbEntry, images.map(img => img.name)) }];
  for (const img of images) {
    const resized = await resizeIfNeeded(img.data, img.media_type);
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
    // Find the next === marker or end of text
    const nextMarker = fullText.indexOf("===", contentStart + 1);
    const end = nextMarker !== -1 ? fullText.lastIndexOf("\n", nextMarker) : fullText.length;
    descriptions.push(fullText.slice(contentStart, end).trim() || null);
  }
  return descriptions;
}

// Describe a single image with full KB context (for regeneration)
async function describeSingleImage(image, kbEntry) {
  const results = await describeImages([image], kbEntry);
  return results[0];
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

// GET /api/kb
router.get("/kb", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM kb_entries ORDER BY rowid").all();
  res.json(rows.map(kb => ({
    ...kb,
    tags: JSON.parse(kb.tags || "[]"),
    related_reqs: JSON.parse(kb.related_reqs || "[]"),
    images: JSON.parse(kb.images || "[]"),
  })));
});

// POST /api/kb
router.post("/kb", requireAuth, (req, res) => {
  const { title, type, content, tags, related_reqs } = req.body;

  if (!title || !content) return res.status(400).json({ error: "Title and content are required" });

  const kbId = nextKbId();
  getDb().prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags, related_reqs, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(kbId, title, type || "Defect History", content, JSON.stringify(tags || []), JSON.stringify(related_reqs || []), req.session.name);

  logAudit(req.session.name, "KB_CREATED", `Created KB entry ${kbId}: ${title}`);
  res.json({ ok: true, kb_id: kbId });
});

// POST /api/kb/:kbId/images — upload images to a KB entry, auto-generate descriptions
router.post("/kb/:kbId/images", requireAuth, upload.array("images", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No images uploaded" });

  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const existing = JSON.parse(entry.images || "[]");
  const newImages = req.files.map(f => ({
    name: f.originalname,
    media_type: f.mimetype,
    data: f.buffer.toString("base64"),
    description: null,
  }));

  // Auto-generate descriptions in one batch call with full KB context
  try {
    const descriptions = await describeImages(newImages, entry);
    for (let i = 0; i < newImages.length; i++) {
      if (descriptions[i]) newImages[i].description = descriptions[i];
    }
  } catch (e) { console.error("Image describe failed:", e.message); }

  const updated = [...existing, ...newImages];
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(updated), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_ADDED", `Added ${newImages.length} image(s) to ${req.params.kbId}`);
  res.json({ ok: true, imageCount: updated.length, images: updated.map(img => ({ name: img.name, description: img.description || null })) });
});

// POST /api/kb/:kbId/images/describe-all — regenerate all image descriptions for a KB entry
// NOTE: must be registered before :index routes to avoid Express matching "describe-all" as :index
router.post("/kb/:kbId/images/describe-all", requireAuth, async (req, res) => {
  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  if (images.length === 0) return res.status(400).json({ error: "No images to describe" });

  const descriptions = await describeImages(images, entry);
  for (let i = 0; i < images.length; i++) {
    if (descriptions[i]) images[i].description = descriptions[i];
  }

  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);
  logAudit(req.session.name, "KB_IMAGE_DESC_GENERATED", `Regenerated all descriptions for ${req.params.kbId}`);
  res.json({ ok: true, descriptions: images.map(img => ({ name: img.name, description: img.description || null })) });
});

// DELETE /api/kb/:kbId/images/:index — remove an image from a KB entry
router.delete("/kb/:kbId/images/:index", requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  const removed = images.splice(idx, 1);
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_REMOVED", `Removed image "${removed[0].name}" from ${req.params.kbId}`);
  res.json({ ok: true, imageCount: images.length });
});

// PUT /api/kb/:kbId/images/:index/description — edit an image description
router.put("/kb/:kbId/images/:index/description", requireAuth, (req, res) => {
  const { description } = req.body;
  if (typeof description !== "string") return res.status(400).json({ error: "description is required" });

  const db = getDb();
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
  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const images = JSON.parse(entry.images || "[]");
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= images.length) return res.status(400).json({ error: "Invalid image index" });

  const img = images[idx];
  const description = await describeSingleImage(img, entry);
  if (!description) return res.status(500).json({ error: "Failed to generate description. Check ANTHROPIC_API_KEY." });

  images[idx].description = description;
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(images), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_DESC_GENERATED", `Regenerated description for image ${idx} in ${req.params.kbId}`);
  res.json({ ok: true, description });
});

// PUT /api/kb/:kbId — update KB entry tags and/or related requirements
router.put("/kb/:kbId", requireAuth, (req, res) => {
  const { tags, related_reqs } = req.body;
  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const updates = [];
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

  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM kb_entries WHERE kb_id = ?");
  const deleteMany = db.transaction((ids) => {
    for (const id of ids) deleteStmt.run(id);
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

// GET /api/usage/tokens
router.get("/usage/tokens", requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as call_count FROM token_usage").get();
  const budget = process.env.TOKEN_BUDGET ? parseInt(process.env.TOKEN_BUDGET) : null;
  const totalTokens = (row.total_input || 0) + (row.total_output || 0);
  res.json({
    input_tokens: row.total_input || 0,
    output_tokens: row.total_output || 0,
    total_tokens: totalTokens,
    call_count: row.call_count || 0,
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
  const db = getDb();

  // JM-004: Pre-export validation — check for orphaned TCs
  const allTcs = db.prepare("SELECT * FROM test_cases").all();
  const allReqIds = db.prepare("SELECT req_id FROM requirements").all().map(r => r.req_id);

  const orphaned = allTcs.filter(tc => {
    const linked = JSON.parse(tc.linked_req_ids || "[]");
    return linked.length === 0 || linked.every(rid => !allReqIds.includes(rid));
  });

  if (orphaned.length > 0) {
    db.prepare("INSERT INTO jama_export_log (user_name, action, details, status, tc_count) VALUES (?, ?, ?, ?, ?)")
      .run(req.session.name, "VALIDATION FAILED", `${orphaned.length} orphaned TC(s). Export blocked per JM-004.`, "error", 0);
    logAudit(req.session.name, "JAMA_EXPORT_BLOCKED", `Pre-export validation failed: ${orphaned.length} orphaned TCs`, "error");
    return res.json({ status: "error", details: `${orphaned.length} orphaned TC(s) detected. Export blocked per JM-004.` });
  }

  // Only export reviewed TCs
  const exportable = allTcs.filter(tc => {
    const linked = JSON.parse(tc.linked_req_ids || "[]");
    return linked.length > 0 && tc.status === "Reviewed";
  });

  db.prepare("INSERT INTO jama_export_log (user_name, action, details, status, tc_count) VALUES (?, ?, ?, ?, ?)")
    .run(req.session.name, "EXPORT TO JAMA", `${exportable.length} reviewed TCs exported with REQ links intact. JM-007 field mapping applied.`, "success", exportable.length);
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

module.exports = router;
