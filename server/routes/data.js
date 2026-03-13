const express = require("express");
const multer = require("multer");
const { getDb, logAudit, nextKbId } = require("../db");
const { requireAuth, requireRole } = require("../auth");

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
  const { title, type, content, tags } = req.body;

  if (!title || !content) return res.status(400).json({ error: "Title and content are required" });

  const kbId = nextKbId();
  getDb().prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags, related_reqs, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(kbId, title, type || "Defect History", content, JSON.stringify(tags || []), JSON.stringify(related_reqs || []), req.session.name);

  logAudit(req.session.name, "KB_CREATED", `Created KB entry ${kbId}: ${title}`);
  res.json({ ok: true, kb_id: kbId });
});

// POST /api/kb/:kbId/images — upload images to a KB entry
router.post("/kb/:kbId/images", requireAuth, upload.array("images", 10), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No images uploaded" });

  const db = getDb();
  const entry = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(req.params.kbId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  const existing = JSON.parse(entry.images || "[]");
  const newImages = req.files.map(f => ({
    name: f.originalname,
    media_type: f.mimetype,
    data: f.buffer.toString("base64"),
  }));

  const updated = [...existing, ...newImages];
  db.prepare("UPDATE kb_entries SET images = ? WHERE kb_id = ?").run(JSON.stringify(updated), req.params.kbId);

  logAudit(req.session.name, "KB_IMAGE_ADDED", `Added ${newImages.length} image(s) to ${req.params.kbId}`);
  res.json({ ok: true, imageCount: updated.length });
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

module.exports = router;
