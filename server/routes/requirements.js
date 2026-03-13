const express = require("express");
const multer = require("multer");
const cheerio = require("cheerio");
const { getDb, logAudit } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/requirements
router.get("/", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM requirements ORDER BY rowid").all();
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
  const { title, description, acceptance_criteria, priority, status, module, tags } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req.params.reqId);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });

  db.prepare("UPDATE requirements SET title = ?, description = ?, acceptance_criteria = ?, priority = ?, status = ?, module = ?, tags = ?, updated_at = datetime('now') WHERE req_id = ?")
    .run(title || existing.title, description ?? existing.description, JSON.stringify(acceptance_criteria || JSON.parse(existing.acceptance_criteria)), priority || existing.priority, status || existing.status, module ?? existing.module, JSON.stringify(tags !== undefined ? tags : JSON.parse(existing.tags || "[]")), req.params.reqId);

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

// DELETE /api/requirements — clear all requirements
router.delete("/", requireRole("Admin", "QA Manager"), (req, res) => {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as count FROM requirements").get().count;
  db.prepare("DELETE FROM requirements").run();
  logAudit(req.session.name, "REQ_CLEAR_ALL", `Deleted all ${count} requirements`);
  res.json({ ok: true, deleted: count });
});

// POST /api/requirements/import-doc — import JAMA "All Item Details" .doc (MHT)
router.post("/import-doc", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const raw = req.file.buffer.toString("utf8");

    // Decode quoted-printable
    let decoded = raw.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Fix UTF-8 mojibake from windows-1252
    decoded = Buffer.from(decoded, "latin1").toString("utf8");

    // Extract HTML body
    const bodyMatch = decoded.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) return res.status(400).json({ error: "Could not parse document — no HTML body found" });

    const $ = cheerio.load(bodyMatch[1], { decodeEntities: true });
    const db = getDb();

    // Each requirement is in a div.Section1 (or there may be just one)
    // Each section has a main table.grid with fields, then a Relationships table
    const sections = $("div.Section1").length ? $("div.Section1").toArray() : [$("body").get(0)];

    const imported = [];
    const linked = [];

    for (const section of sections) {
      const $s = cheerio.load($.html(section), { decodeEntities: true });
      const tables = $s("table.grid");
      if (tables.length === 0) continue;

      // First table: requirement fields (2-column rows: label | value)
      const fieldTable = tables.eq(0);
      const fields = {};
      fieldTable.find("tr").each((_, row) => {
        const cells = $s(row).find("td");
        if (cells.length === 2) {
          const label = $s(cells[0]).text().trim().replace(/:$/, "");
          const valueHtml = $s(cells[1]).html() || "";
          const valueText = $s(cells[1]).text().trim();
          fields[label] = { text: valueText, html: valueHtml };
        }
      });

      // Extract the title from the header row (h3.formtitle)
      const headerH3 = fieldTable.find("h3.formtitle").first();
      let reqId = "";
      let title = "";
      if (headerH3.length) {
        const headerText = headerH3.clone().children("div").remove().end().text().trim();
        // Header format: "LFWM2-SubSys_Rqmt-155 Mobius Initiate WAT at any Time"
        const parts = headerText.split(/\s+/);
        reqId = parts[0] || "";
        // Title is also in the <a> tag
        const aTag = headerH3.find("a");
        title = aTag.length ? aTag.text().trim() : parts.slice(1).join(" ");
      }

      // Fallback to field values
      if (!reqId && fields["Project ID"]) reqId = fields["Project ID"].text;
      if (!title && fields["Short Name"]) title = fields["Short Name"].text;

      if (!reqId || !title) continue;

      // Parse requirement context table (nested table inside "Requirement Context" field)
      const reqContext = [];
      if (fields["Requirement Context"]) {
        const ctxHtml = fields["Requirement Context"].html;
        const $ctx = cheerio.load(ctxHtml, { decodeEntities: true });
        $ctx("tbody tr").each((_, row) => {
          const cells = $ctx(row).find("td");
          if (cells.length >= 2) {
            const field = $ctx(cells[0]).text().trim();
            // Get bullet points from the value cell
            const items = [];
            $ctx(cells[1]).find("li").each((_, li) => {
              const t = $ctx(li).text().trim();
              if (t) items.push(t);
            });
            if (field && items.length) reqContext.push({ field, items });
          }
        });
      }

      // Parse tags (br-separated in HTML, e.g. "mobius<br>mobius_Desktop<br>...")
      const tags = [];
      if (fields["Tags"]) {
        // Use HTML and split on <br> tags to properly separate concatenated tags
        const tagHtml = fields["Tags"].html || "";
        tagHtml.split(/<br\s*\/?>/i).forEach(t => {
          // Strip any remaining HTML tags and decode entities
          const tag = t.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
          if (tag) tags.push(tag);
        });
      }

      // Parse relationships from second table
      const relationships = [];
      if (tables.length > 1) {
        const relTable = tables.eq(1);
        relTable.find("tbody tr").each((_, row) => {
          const cells = $s(row).find("td");
          if (cells.length === 6) {
            const rel = {
              id: $s(cells[0]).text().trim(),
              name: $s(cells[1]).text().trim(),
              direction: $s(cells[2]).text().trim(),
              project: $s(cells[3]).text().trim(),
              group: $s(cells[4]).text().trim(),
              relationship: $s(cells[5]).text().trim(),
            };
            if (rel.id) relationships.push(rel);
          }
        });
      }

      // Build requirement object
      const reqData = {
        req_id: reqId,
        title,
        description: (fields["Requirement (EARS format)"] || fields["Description"] || {}).text || "",
        rationale: (fields["Rationale"] || {}).text || "",
        requirement_type: (fields["Requirement Type"] || {}).text || "",
        safety_level: (fields["Safety Level"] || {}).text || "",
        requirement_context: reqContext,
        verification_method: (fields["Verification Method (multi-select)"] || fields["Verification Method"] || {}).text || "",
        priority: (fields["Priority (MoSCoW)"] || fields["Priority"] || {}).text || "High",
        scheduled_release: (fields["Scheduled Release"] || {}).text || "",
        status: (fields["Status"] || {}).text || "Draft",
        external_id: (fields["External ID"] || {}).text || "",
        global_id: (fields["Global ID"] || {}).text || "",
        tags,
        relationships,
        source: "JAMA Import",
        module: "",
      };

      // Upsert into DB
      const existing = db.prepare("SELECT id FROM requirements WHERE req_id = ?").get(reqData.req_id);
      if (existing) {
        db.prepare(`UPDATE requirements SET title=?, description=?, rationale=?, requirement_type=?, safety_level=?,
          requirement_context=?, verification_method=?, priority=?, scheduled_release=?, status=?, external_id=?,
          global_id=?, tags=?, relationships=?, source=?, updated_at=datetime('now') WHERE req_id=?`)
          .run(reqData.title, reqData.description, reqData.rationale, reqData.requirement_type, reqData.safety_level,
            JSON.stringify(reqData.requirement_context), reqData.verification_method, reqData.priority,
            reqData.scheduled_release, reqData.status, reqData.external_id, reqData.global_id,
            JSON.stringify(reqData.tags), JSON.stringify(reqData.relationships), reqData.source, reqData.req_id);
      } else {
        db.prepare(`INSERT INTO requirements (req_id, title, description, rationale, requirement_type, safety_level,
          requirement_context, verification_method, priority, scheduled_release, status, external_id, global_id,
          tags, relationships, source, module) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(reqData.req_id, reqData.title, reqData.description, reqData.rationale, reqData.requirement_type,
            reqData.safety_level, JSON.stringify(reqData.requirement_context), reqData.verification_method,
            reqData.priority, reqData.scheduled_release, reqData.status, reqData.external_id, reqData.global_id,
            JSON.stringify(reqData.tags), JSON.stringify(reqData.relationships), reqData.source, reqData.module);
      }

      imported.push(reqData.req_id);

      // Auto-link: check if any relationship IDs match existing test cases
      const tcRels = relationships.filter(r =>
        r.group === "Verification Test Case" || r.direction === "Downstream"
      );
      for (const rel of tcRels) {
        const tc = db.prepare("SELECT tc_id, linked_req_ids FROM test_cases WHERE tc_id = ? OR project_id = ?").get(rel.id, rel.id);
        if (tc) {
          const linkedIds = JSON.parse(tc.linked_req_ids || "[]");
          if (!linkedIds.includes(reqData.req_id)) {
            linkedIds.push(reqData.req_id);
            db.prepare("UPDATE test_cases SET linked_req_ids = ? WHERE tc_id = ?").run(JSON.stringify(linkedIds), tc.tc_id);
            linked.push({ tc: tc.tc_id, req: reqData.req_id });
          }
        }
      }
    }

    logAudit(req.session.name, "REQ_IMPORTED", `Imported ${imported.length} requirements from JAMA doc. Auto-linked ${linked.length} test cases.`);
    res.json({ ok: true, imported: imported.length, linked: linked.length, reqIds: imported, linkedDetails: linked });

  } catch (err) {
    console.error("Requirement import error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
