const express = require("express");
const { getDb, logAudit, nextKbId } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

// GET /api/kb
router.get("/", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM kb_entries ORDER BY rowid").all();
  res.json(rows.map(kb => ({ ...kb, tags: JSON.parse(kb.tags || "[]") })));
});

// POST /api/kb
router.post("/", requireAuth, (req, res) => {
  const { title, type, content, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: "Title and content are required" });

  const kbId = nextKbId();
  getDb().prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(kbId, title, type || "Defect History", content, JSON.stringify(tags || []), req.session.name);

  logAudit(req.session.name, "KB_CREATED", `Created KB entry ${kbId}: ${title}`);
  res.json({ ok: true, kb_id: kbId });
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
