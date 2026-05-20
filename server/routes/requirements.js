const express = require("express");
const multer = require("multer");
const { getReqDb, getTcDb, logAudit } = require("../db");
const { requireAuth, requireRole, requireMobileAuth } = require("../auth");
const { ingestJamaDocBuffer } = require("../jama/ingest");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/requirements
router.get("/", requireMobileAuth, (req, res) => {
  const rows = getReqDb().prepare("SELECT * FROM requirements ORDER BY rowid").all();
  res.json(rows.map(r => ({
    ...r,
    acceptance_criteria: JSON.parse(r.acceptance_criteria || "[]"),
    requirement_context: JSON.parse(r.requirement_context || "[]"),
    tags: JSON.parse(r.tags || "[]"),
    relationships: JSON.parse(r.relationships || "[]"),
  })));
});

// POST /api/requirements
router.post("/", requireAuth, (req, res) => {
  const { req_id, title, description, acceptance_criteria, priority, status, module } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: "req_id and title are required" });

  const db = getReqDb();
  const existing = db.prepare("SELECT id FROM requirements WHERE req_id = ?").get(req_id);
  if (existing) return res.status(400).json({ error: "Requirement ID already exists" });

  db.prepare("INSERT INTO requirements (req_id, title, description, acceptance_criteria, priority, status, source, module) VALUES (?, ?, ?, ?, ?, ?, 'Manual Entry', ?)")
    .run(req_id, title, description || "", JSON.stringify(acceptance_criteria || []), priority || "High", status || "Draft", module || "");

  logAudit(req.session.name, "REQ_CREATED", `Created requirement ${req_id}: ${title}`);
  res.json({ ok: true });
});

// PUT /api/requirements/:reqId
router.put("/:reqId", requireAuth, (req, res) => {
  const { title, description, acceptance_criteria, priority, status, module } = req.body;
  const db = getReqDb();
  const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req.params.reqId);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });

  db.prepare("UPDATE requirements SET title = ?, description = ?, acceptance_criteria = ?, priority = ?, status = ?, module = ?, updated_at = datetime('now') WHERE req_id = ?")
    .run(title || existing.title, description ?? existing.description, JSON.stringify(acceptance_criteria || JSON.parse(existing.acceptance_criteria)), priority || existing.priority, status || existing.status, module ?? existing.module, req.params.reqId);

  logAudit(req.session.name, "REQ_UPDATED", `Updated requirement ${req.params.reqId}`);
  res.json({ ok: true });
});

// DELETE /api/requirements/:reqId — QA Manager or Admin only
router.delete("/:reqId", requireRole("Admin", "QA Manager"), (req, res) => {
  const db = getReqDb();
  const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req.params.reqId);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });

  // Check if any test cases are linked to this requirement
  const linkedTcs = getTcDb().prepare("SELECT tc_id, linked_req_ids FROM test_cases").all()
    .filter(tc => JSON.parse(tc.linked_req_ids || "[]").includes(req.params.reqId));

  db.prepare("DELETE FROM requirements WHERE req_id = ?").run(req.params.reqId);
  logAudit(req.session.name, "REQ_DELETED", `Deleted requirement ${req.params.reqId}: ${existing.title}${linkedTcs.length > 0 ? ` (${linkedTcs.length} linked TCs now orphaned)` : ""}`);

  res.json({ ok: true, orphanedTcs: linkedTcs.length });
});

// DELETE /api/requirements — clear all requirements
router.delete("/", requireRole("Admin", "QA Manager"), (req, res) => {
  const db = getReqDb();
  const count = db.prepare("SELECT COUNT(*) as count FROM requirements").get().count;
  db.prepare("DELETE FROM requirements").run();
  logAudit(req.session.name, "REQ_CLEAR_ALL", `Deleted all ${count} requirements`);
  res.json({ ok: true, deleted: count });
});

// POST /api/requirements/import-doc — import JAMA "All Item Details" .doc (MHT)
//
// The parser + upsert + auto-link logic lives in server/jama/ingest.js so
// the upcoming browser-driven Jama import can share the same pipeline.
router.post("/import-doc", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const result = ingestJamaDocBuffer(req.file.buffer);

    logAudit(
      req.session.name,
      "REQ_IMPORTED",
      `Imported ${result.total} requirements from JAMA doc (${result.inserted} new, ${result.updated} refreshed). Auto-linked ${result.linked.length} test cases.`
    );

    // Response shape:
    //   imported     — total processed (inserted + updated), kept for the
    //                  existing frontend message
    //   inserted     — newly inserted req_ids count
    //   updated      — existing req_ids whose Jama fields were refreshed
    //   reqIds       — all req_ids touched (inserted + updated), kept for
    //                  the existing UI list-of-imports display
    //   linked       — count of auto-linked TC→req relationships
    res.json({
      ok: true,
      imported: result.total,
      inserted: result.inserted,
      updated: result.updated,
      reqIds: [...result.insertedReqIds, ...result.updatedReqIds],
      insertedReqIds: result.insertedReqIds,
      updatedReqIds: result.updatedReqIds,
      linked: result.linked.length,
      linkedDetails: result.linked,
    });
  } catch (err) {
    console.error("Requirement import error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
