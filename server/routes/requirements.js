const express = require("express");
const { getDb, logAudit } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

// GET /api/requirements
router.get("/", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM requirements ORDER BY rowid").all();
  res.json(rows.map(r => ({
    ...r,
    acceptance_criteria: JSON.parse(r.acceptance_criteria || "[]"),
  })));
});

// POST /api/requirements
router.post("/", requireAuth, (req, res) => {
  const { req_id, title, description, acceptance_criteria, priority, status, module } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: "req_id and title are required" });

  const db = getDb();
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
  const db = getDb();
  const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req.params.reqId);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });

  db.prepare("UPDATE requirements SET title = ?, description = ?, acceptance_criteria = ?, priority = ?, status = ?, module = ?, updated_at = datetime('now') WHERE req_id = ?")
    .run(title || existing.title, description ?? existing.description, JSON.stringify(acceptance_criteria || JSON.parse(existing.acceptance_criteria)), priority || existing.priority, status || existing.status, module ?? existing.module, req.params.reqId);

  logAudit(req.session.name, "REQ_UPDATED", `Updated requirement ${req.params.reqId}`);
  res.json({ ok: true });
});

// DELETE /api/requirements/:reqId — QA Manager or Admin only
router.delete("/:reqId", requireRole("Admin", "QA Manager"), (req, res) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req.params.reqId);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });

  // Check if any test cases are linked to this requirement
  const linkedTcs = db.prepare("SELECT tc_id, linked_req_ids FROM test_cases").all()
    .filter(tc => JSON.parse(tc.linked_req_ids || "[]").includes(req.params.reqId));

  db.prepare("DELETE FROM requirements WHERE req_id = ?").run(req.params.reqId);
  logAudit(req.session.name, "REQ_DELETED", `Deleted requirement ${req.params.reqId}: ${existing.title}${linkedTcs.length > 0 ? ` (${linkedTcs.length} linked TCs now orphaned)` : ""}`);

  res.json({ ok: true, orphanedTcs: linkedTcs.length });
});

module.exports = router;
