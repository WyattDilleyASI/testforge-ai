// ═══════════════════════════════════════════════════════════════════════════
// Jama "All Item Details" doc parser + upserter
// ═══════════════════════════════════════════════════════════════════════════
//
// Parses Jama's "All Item Details" Word export (which is MHT-wrapped HTML
// despite the .doc extension) and upserts each requirement into the
// requirements DB.
//
// Used by two callers:
//   • POST /api/requirements/import-doc  — user uploads the file by hand
//   • The Jama browser-import orchestrator — file downloaded by Playwright
//
// Both callers should receive identical behavior; this module owns the
// canonical parser+upsert logic.
//
// Upsert merge rule (settled during design):
//   On INSERT, every Jama-sourced field is populated.
//   On UPDATE, the same Jama-sourced fields are overwritten BUT the
//   Testforge-managed fields are intentionally NOT in the UPDATE statement:
//     • module                — preserved (Testforge categorization)
//     • acceptance_criteria   — preserved (Testforge-authored)
//     • linked_req_ids on TCs — preserved + extended by auto-link
//
// Returns a structured result instead of writing to res or audit_log —
// callers do their own response shaping and audit logging.

const cheerio = require("cheerio");
const { getReqDb, getTcDb } = require("../db");

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Parse a Jama "All Item Details" export buffer and upsert each requirement
 * into the DB. Auto-links test cases via Jama's relationships table.
 *
 * @param {Buffer} buffer  Raw file contents (MHT/MHTML payload, .doc extension)
 * @returns {{
 *   insertedReqIds: string[],   // req_ids that were newly inserted
 *   updatedReqIds:  string[],   // req_ids that already existed and were refreshed
 *   inserted:       number,
 *   updated:        number,
 *   total:          number,     // inserted + updated
 *   linked:         {tc: string, req: string}[],   // auto-linked TC/req pairs
 * }}
 * @throws Error if the document cannot be parsed (e.g. no HTML body found).
 */
function ingestJamaDocBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error("ingestJamaDocBuffer: empty buffer");
  }

  // Decode MHT: undo soft line breaks, then quoted-printable hex escapes.
  const raw = buffer.toString("utf8");
  let decoded = raw
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Fix UTF-8 mojibake from windows-1252 source
  decoded = Buffer.from(decoded, "latin1").toString("utf8");

  const bodyMatch = decoded.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error("Could not parse document — no HTML body found. Is this a Jama 'All Item Details' export?");
  }

  const $ = cheerio.load(bodyMatch[1], { decodeEntities: true });
  const db = getReqDb();
  const tcDb = getTcDb();

  // Each requirement lives in a div.Section1. Older single-item exports
  // skip the wrapper and put the tables directly under <body>.
  const sections = $("div.Section1").length
    ? $("div.Section1").toArray()
    : [$("body").get(0)];

  const insertedReqIds = [];
  const updatedReqIds = [];
  const linked = [];

  for (const section of sections) {
    const parsed = parseSection($, section);
    if (!parsed) continue;

    const wasInsert = upsertRequirement(db, parsed);
    if (wasInsert) insertedReqIds.push(parsed.req_id);
    else updatedReqIds.push(parsed.req_id);

    // Auto-link test cases via Jama relationships
    for (const rel of parsed.relationships) {
      if (rel.group !== "Verification Test Case" && rel.direction !== "Downstream") continue;
      const tc = tcDb.prepare(
        "SELECT tc_id, linked_req_ids FROM test_cases WHERE tc_id = ? OR project_id = ?"
      ).get(rel.id, rel.id);
      if (!tc) continue;

      const linkedIds = JSON.parse(tc.linked_req_ids || "[]");
      if (linkedIds.includes(parsed.req_id)) continue;

      linkedIds.push(parsed.req_id);
      tcDb.prepare("UPDATE test_cases SET linked_req_ids = ? WHERE tc_id = ?")
        .run(JSON.stringify(linkedIds), tc.tc_id);
      linked.push({ tc: tc.tc_id, req: parsed.req_id });
    }
  }

  return {
    insertedReqIds,
    updatedReqIds,
    inserted: insertedReqIds.length,
    updated: updatedReqIds.length,
    total: insertedReqIds.length + updatedReqIds.length,
    linked,
  };
}

// ─── Internals ────────────────────────────────────────────────────────────

// Parse one requirement section (a div.Section1, or the whole body for
// single-item exports). Returns the parsed requirement object, or null
// if the section doesn't contain a recognizable requirement.
function parseSection($, section) {
  const $s = cheerio.load($.html(section), { decodeEntities: true });
  const tables = $s("table.grid");
  if (tables.length === 0) return null;

  // First grid table = requirement fields (two-column label/value rows)
  const fieldTable = tables.eq(0);
  const fields = {};
  fieldTable.find("tr").each((_, row) => {
    const cells = $s(row).find("td");
    if (cells.length !== 2) return;
    const label = $s(cells[0]).text().trim().replace(/:$/, "");
    fields[label] = {
      text: $s(cells[1]).text().trim(),
      html: $s(cells[1]).html() || "",
    };
  });

  // Title: from <h3 class="formtitle"> header row.
  // Format: "LFWM2-SubSys_Rqmt-155 Mobius Initiate WAT at any Time"
  const headerH3 = fieldTable.find("h3.formtitle").first();
  let reqId = "";
  let title = "";
  if (headerH3.length) {
    const headerText = headerH3.clone().children("div").remove().end().text().trim();
    const parts = headerText.split(/\s+/);
    reqId = parts[0] || "";
    const aTag = headerH3.find("a");
    title = aTag.length ? aTag.text().trim() : parts.slice(1).join(" ");
  }

  // Fallback: field values
  if (!reqId && fields["Project ID"]) reqId = fields["Project ID"].text;
  if (!title && fields["Short Name"]) title = fields["Short Name"].text;
  if (!reqId || !title) return null;

  const reqContext = parseRequirementContext(fields["Requirement Context"]);
  const tags = parseTags(fields["Tags"]);
  const relationships = parseRelationships($s, tables);

  return {
    req_id: reqId,
    title,
    description: get(fields, ["Requirement (EARS format)", "Description"]),
    rationale: get(fields, ["Rationale"]),
    requirement_type: get(fields, ["Requirement Type"]),
    safety_level: get(fields, ["Safety Level"]),
    requirement_context: reqContext,
    verification_method: get(fields, ["Verification Method (multi-select)", "Verification Method"]),
    priority: get(fields, ["Priority (MoSCoW)", "Priority"]) || "High",
    scheduled_release: get(fields, ["Scheduled Release"]),
    status: get(fields, ["Status"]) || "Draft",
    external_id: get(fields, ["External ID"]),
    global_id: get(fields, ["Global ID"]),
    tags,
    relationships,
    source: "JAMA Import",
  };
}

function parseRequirementContext(field) {
  if (!field) return [];
  const $ctx = cheerio.load(field.html, { decodeEntities: true });
  const result = [];
  $ctx("tbody tr").each((_, row) => {
    const cells = $ctx(row).find("td");
    if (cells.length < 2) return;
    const fieldName = $ctx(cells[0]).text().trim();
    const items = [];
    $ctx(cells[1]).find("li").each((_, li) => {
      const t = $ctx(li).text().trim();
      if (t) items.push(t);
    });
    if (fieldName && items.length) result.push({ field: fieldName, items });
  });
  return result;
}

function parseTags(field) {
  if (!field) return [];
  const $t = cheerio.load(field.html, { decodeEntities: true });
  const liItems = $t("li").toArray();
  if (liItems.length > 0) {
    return liItems.map(li => $t(li).text().trim()).filter(Boolean);
  }
  // Fallback: <br>-separated text
  const $t2 = cheerio.load(field.html.replace(/<br\s*\/?>/gi, "\n"), { decodeEntities: true });
  return $t2("body").text().split("\n").map(s => s.trim()).filter(Boolean);
}

function parseRelationships($s, tables) {
  const result = [];
  if (tables.length <= 1) return result;
  const relTable = tables.eq(1);
  relTable.find("tbody tr").each((_, row) => {
    const cells = $s(row).find("td");
    if (cells.length !== 6) return;
    const rel = {
      id:           $s(cells[0]).text().trim(),
      name:         $s(cells[1]).text().trim(),
      direction:    $s(cells[2]).text().trim(),
      project:      $s(cells[3]).text().trim(),
      group:        $s(cells[4]).text().trim(),
      relationship: $s(cells[5]).text().trim(),
    };
    if (rel.id) result.push(rel);
  });
  return result;
}

// Pick the first non-empty value from fields[] for the given label list.
function get(fields, labels) {
  for (const label of labels) {
    if (fields[label] && fields[label].text) return fields[label].text;
  }
  return "";
}

// Insert or update a requirement. Returns true if a new row was inserted,
// false if an existing row was updated.
//
// IMPORTANT — merge rule: the UPDATE statement omits Testforge-managed
// fields (module, acceptance_criteria) so they are preserved across
// re-imports. The INSERT sets module="" and acceptance_criteria='[]' as
// initial defaults.
function upsertRequirement(db, r) {
  const existing = db.prepare("SELECT id FROM requirements WHERE req_id = ?").get(r.req_id);
  if (existing) {
    db.prepare(`
      UPDATE requirements SET
        title              = ?,
        description        = ?,
        rationale          = ?,
        requirement_type   = ?,
        safety_level       = ?,
        requirement_context= ?,
        verification_method= ?,
        priority           = ?,
        scheduled_release  = ?,
        status             = ?,
        external_id        = ?,
        global_id          = ?,
        tags               = ?,
        relationships      = ?,
        source             = ?,
        updated_at         = datetime('now')
      WHERE req_id = ?
    `).run(
      r.title, r.description, r.rationale, r.requirement_type, r.safety_level,
      JSON.stringify(r.requirement_context), r.verification_method, r.priority,
      r.scheduled_release, r.status, r.external_id, r.global_id,
      JSON.stringify(r.tags), JSON.stringify(r.relationships), r.source,
      r.req_id
    );
    return false;
  } else {
    db.prepare(`
      INSERT INTO requirements (
        req_id, title, description, rationale, requirement_type, safety_level,
        requirement_context, verification_method, priority, scheduled_release,
        status, external_id, global_id, tags, relationships, source, module
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      r.req_id, r.title, r.description, r.rationale, r.requirement_type,
      r.safety_level, JSON.stringify(r.requirement_context), r.verification_method,
      r.priority, r.scheduled_release, r.status, r.external_id, r.global_id,
      JSON.stringify(r.tags), JSON.stringify(r.relationships), r.source,
      "" // module starts empty; preserved on subsequent updates
    );
    return true;
  }
}

module.exports = { ingestJamaDocBuffer };
