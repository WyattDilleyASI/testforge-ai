const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const cheerio = require("cheerio");
const { getDb, logAudit, logTokenUsage } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/testcases
router.get("/", requireAuth, (req, res) => {
  const rows = getDb().prepare("SELECT * FROM test_cases ORDER BY rowid").all();
  res.json(rows.map(tc => ({
    ...tc,
    linked_req_ids: JSON.parse(tc.linked_req_ids || "[]"),
    steps: JSON.parse(tc.steps || "[]"),
    kb_references: JSON.parse(tc.kb_references || "[]"),
  })));
});

// POST /api/testcases/generate — call Claude API server-side
router.post("/generate", requireAuth, async (req, res) => {
  const { reqId, depth } = req.body;
  if (!reqId) return res.status(400).json({ error: "reqId is required" });

  const db = getDb();
  const requirement = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(reqId);
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });

  const acceptanceCriteria = JSON.parse(requirement.acceptance_criteria || "[]");

  // Fetch relevant KB entries
  const allKb = db.prepare("SELECT * FROM kb_entries").all();
  const relevantKb = allKb.filter(kb => {
    const tags = JSON.parse(kb.tags || "[]");
    return tags.includes(reqId);
  });

  const prompt = `You are a senior QA engineer generating software test case DRAFTS in JAMA format. These are starting points for engineer review — not finished test coverage.

REQUIREMENT:
- ID: ${requirement.req_id}
- Title: ${requirement.title}
- Description: ${requirement.description}
- Acceptance Criteria: ${acceptanceCriteria.join("; ")}
- Priority: ${requirement.priority}

${relevantKb.length > 0 ? `KNOWLEDGE BASE CONTEXT:\n${relevantKb.map(kb => `- [${kb.kb_id}] ${kb.title}: ${kb.content}`).join("\n")}` : ""}

GENERATION DEPTH: ${depth || "standard"}
- basic: 2-3 test cases covering happy path and one negative case
- standard: 4-6 test cases covering happy path, negative, boundary conditions
- comprehensive: 6-10 test cases covering happy path, negative, boundary, edge cases, error recovery

Generate test cases as a JSON array. Each test case must have:
- title: string
- type: "Happy Path" | "Negative" | "Boundary" | "Edge Case"
- description: object with keys: objective (string), scope (string), assumptions (array of strings)
- setup: object with keys: preconditions (array of strings), environment (array of strings), equipment (array of strings), testData (array of strings)
- steps: array of { step: string, expectedResult: string }
- reqAttribute: which acceptance criterion or attribute this TC validates
${relevantKb.length > 0 ? "- kbReferences: array of KB entry IDs that informed this test case" : ""}

Respond ONLY with valid JSON array, no markdown, no preamble.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message || "Claude API error" });

    if (data.usage) {
      logTokenUsage(req.session.name, reqId, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
    }

    const text = data.content?.map(c => c.text || "").join("") || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    // Get current TC count for ID generation
    const currentCount = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
    const newTcs = [];

    const insertStmt = db.prepare("INSERT INTO test_cases (tc_id, title, linked_req_ids, preconditions, steps, pass_fail_criteria, type, depth, req_attribute, kb_references, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)");

    const insertMany = db.transaction((tcs) => {
      for (const tc of tcs) {
        insertStmt.run(tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions, tc.steps, tc.pass_fail_criteria, tc.type, tc.depth, tc.req_attribute, tc.kb_references, tc.generated_by);
      }
    });

    const tcsToInsert = parsed.map((tc, i) => {
      const tcId = `TC-${reqId}-${String(currentCount + i + 1).padStart(3, "0")}`;
      newTcs.push(tcId);
      return {
        tc_id: tcId,
        title: tc.title,
        linked_req_ids: JSON.stringify([reqId]),
        preconditions: tc.setup ? JSON.stringify(tc.setup) : "",
        steps: JSON.stringify(tc.steps || []),
        pass_fail_criteria: tc.description ? JSON.stringify(tc.description) : "",
        type: tc.type || "Happy Path",
        depth: depth || "standard",
        req_attribute: tc.reqAttribute || "",
        kb_references: JSON.stringify(tc.kbReferences || []),
        generated_by: req.session.name,
      };
    });

    insertMany(tcsToInsert);

    // Update KB usage counts
    if (relevantKb.length > 0) {
      const updateKb = db.prepare("UPDATE kb_entries SET usage_count = usage_count + 1 WHERE kb_id = ?");
      for (const kb of relevantKb) updateKb.run(kb.kb_id);
    }

    logAudit(req.session.name, "TC_GENERATED", `Generated ${newTcs.length} draft TCs for ${reqId} (depth: ${depth || "standard"})`);

    // Return the newly created TCs
    const created = db.prepare(`SELECT * FROM test_cases WHERE tc_id IN (${newTcs.map(() => "?").join(",")})`).all(...newTcs);
    res.json(created.map(tc => ({
      ...tc,
      linked_req_ids: JSON.parse(tc.linked_req_ids || "[]"),
      steps: JSON.parse(tc.steps || "[]"),
      kb_references: JSON.parse(tc.kb_references || "[]"),
    })));
  } catch (err) {
    console.error("TC generation error:", err);
    res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
});

// GET /api/testcases/prompt — build and return the generation prompt without calling Claude
router.get("/prompt", requireAuth, (req, res) => {
  const { reqId, depth } = req.query;
  if (!reqId) return res.status(400).json({ error: "reqId is required" });

  const db = getDb();
  const requirement = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(reqId);
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });

  const acceptanceCriteria = JSON.parse(requirement.acceptance_criteria || "[]");
  const allKb = db.prepare("SELECT * FROM kb_entries").all();
  const relevantKb = allKb.filter(kb => {
    const tags = JSON.parse(kb.tags || "[]");
    return tags.includes(reqId);
  });

  const prompt = `You are a senior QA engineer generating software test case DRAFTS in JAMA format. These are starting points for engineer review — not finished test coverage.

REQUIREMENT:
- ID: ${requirement.req_id}
- Title: ${requirement.title}
- Description: ${requirement.description}
- Acceptance Criteria: ${acceptanceCriteria.join("; ")}
- Priority: ${requirement.priority}

${relevantKb.length > 0 ? `KNOWLEDGE BASE CONTEXT:\n${relevantKb.map(kb => `- [${kb.kb_id}] ${kb.title}: ${kb.content}`).join("\n")}` : ""}

GENERATION DEPTH: ${depth || "standard"}
- basic: 2-3 test cases covering happy path and one negative case
- standard: 4-6 test cases covering happy path, negative, boundary conditions
- comprehensive: 6-10 test cases covering happy path, negative, boundary, edge cases, error recovery

Generate test cases as a JSON array. Each test case must have:
- title: string
- type: "Happy Path" | "Negative" | "Boundary" | "Edge Case"
- description: object with keys: objective (string), scope (string), assumptions (array of strings)
- setup: object with keys: preconditions (array of strings), environment (array of strings), equipment (array of strings), testData (array of strings)
- steps: array of { step: string, expectedResult: string }
- reqAttribute: which acceptance criterion or attribute this TC validates
${relevantKb.length > 0 ? "- kbReferences: array of KB entry IDs that informed this test case" : ""}

Respond ONLY with valid JSON array, no markdown, no preamble.`;

  res.json({ prompt, reqId, depth: depth || "standard" });
});

// POST /api/testcases/import — save pre-generated TC JSON from Claude.ai (no API key needed)
router.post("/import", requireAuth, (req, res) => {
  const { reqId, depth, tcs } = req.body;
  if (!reqId) return res.status(400).json({ error: "reqId is required" });
  if (!Array.isArray(tcs) || tcs.length === 0) return res.status(400).json({ error: "tcs must be a non-empty array" });

  const db = getDb();
  const requirement = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(reqId);
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });

  const currentCount = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
  const newTcs = [];

  const insertStmt = db.prepare("INSERT INTO test_cases (tc_id, title, linked_req_ids, preconditions, steps, pass_fail_criteria, type, depth, req_attribute, kb_references, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)");

  const insertMany = db.transaction((items) => {
    for (const tc of items) {
      insertStmt.run(tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions, tc.steps, tc.pass_fail_criteria, tc.type, tc.depth, tc.req_attribute, tc.kb_references, tc.generated_by);
    }
  });

  const tcsToInsert = tcs.map((tc, i) => {
    const tcId = `TC-${reqId}-${String(currentCount + i + 1).padStart(3, "0")}`;
    newTcs.push(tcId);
    return {
      tc_id: tcId,
      title: tc.title || "Untitled",
      linked_req_ids: JSON.stringify([reqId]),
      preconditions: tc.preconditions || "",
      steps: JSON.stringify(tc.steps || []),
      pass_fail_criteria: tc.passFailCriteria || tc.pass_fail_criteria || "",
      type: tc.type || "Happy Path",
      depth: depth || "standard",
      req_attribute: tc.reqAttribute || tc.req_attribute || "",
      kb_references: JSON.stringify(tc.kbReferences || tc.kb_references || []),
      generated_by: `${req.session.name} (Claude.ai import)`,
    };
  });

  try {
    insertMany(tcsToInsert);
    logAudit(req.session.name, "TC_IMPORTED", `Imported ${newTcs.length} draft TCs for ${reqId} from Claude.ai`);
    const created = db.prepare(`SELECT * FROM test_cases WHERE tc_id IN (${newTcs.map(() => "?").join(",")})`).all(...newTcs);
    res.json(created.map(tc => ({
      ...tc,
      linked_req_ids: JSON.parse(tc.linked_req_ids || "[]"),
      steps: JSON.parse(tc.steps || "[]"),
      kb_references: JSON.parse(tc.kb_references || "[]"),
    })));
  } catch (err) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// DELETE /api/testcases — clear all test cases
router.delete("/", requireAuth, (req, res) => {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
  db.prepare("DELETE FROM test_cases").run();
  logAudit(req.session.name, "TC_CLEAR_ALL", `Deleted all ${count} test cases`);
  res.json({ ok: true, deleted: count });
});


// PUT /api/testcases/:tcId/status — update TC status (Draft → Reviewed / Rejected)
router.put("/:tcId/status", requireAuth, (req, res) => {
  const { status } = req.body;
  if (!["Draft", "Reviewed", "Rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const db = getDb();
  const tc = db.prepare("SELECT * FROM test_cases WHERE tc_id = ?").get(req.params.tcId);
  if (!tc) return res.status(404).json({ error: "Test case not found" });

  db.prepare("UPDATE test_cases SET status = ? WHERE tc_id = ?").run(status, req.params.tcId);
  logAudit(req.session.name, "TC_STATUS", `${req.params.tcId}: ${tc.status} → ${status}`);
  res.json({ ok: true });
});

// GET /api/testcases/export/xlsx — export all test cases in JAMA xlsx format
router.get("/export/xlsx", requireAuth, (req, res) => {
  const db = getDb();
  const testCases = db.prepare("SELECT * FROM test_cases ORDER BY rowid").all();
  const requirements = db.prepare("SELECT * FROM requirements").all();
  const reqMap = {};
  for (const r of requirements) reqMap[r.req_id] = r;

  const headers = ["Name", "Description", "Setup", "Automation Tool", "Automated", "Step Action", "Step Expected Result", "", "Step Notes", "Priority"];
  const rows = [headers];

  for (const tc of testCases) {
    const steps = JSON.parse(tc.steps || "[]");
    const linkedReqIds = JSON.parse(tc.linked_req_ids || "[]");
    const priority = linkedReqIds.length > 0 && reqMap[linkedReqIds[0]] ? reqMap[linkedReqIds[0]].priority : "High";

    // Unpack structured description and setup if JSON, otherwise use plain text
    let descText = tc.pass_fail_criteria || "";
    try {
      const d = JSON.parse(tc.pass_fail_criteria || "");
      if (d && typeof d === "object") {
        const parts = [];
        if (d.objective) parts.push(`Objective:\n${d.objective}`);
        if (d.scope) parts.push(`Scope:\n${d.scope}`);
        if (d.assumptions && d.assumptions.length) parts.push(`Assumptions:\n${d.assumptions.map(a => `• ${a}`).join("\n")}`);
        descText = parts.join("\n\n");
      }
    } catch {}

    let setupText = tc.preconditions || "";
    try {
      const s = JSON.parse(tc.preconditions || "");
      if (s && typeof s === "object") {
        const parts = [];
        if (s.preconditions && s.preconditions.length) parts.push(`Preconditions:\n${s.preconditions.map(p => `• ${p}`).join("\n")}`);
        if (s.environment && s.environment.length) parts.push(`Environment:\n${s.environment.map(e => `• ${e}`).join("\n")}`);
        if (s.equipment && s.equipment.length) parts.push(`Equipment:\n${s.equipment.map(e => `• ${e}`).join("\n")}`);
        if (s.testData && s.testData.length) parts.push(`Test Data:\n${s.testData.map(t => `• ${t}`).join("\n")}`);
        setupText = parts.join("\n\n");
      }
    } catch {}

    if (steps.length === 0) {
      rows.push([tc.title, descText, setupText, "Manual", "No", "", "", "", "", priority]);
    } else {
      steps.forEach((step, i) => {
        rows.push([
          i === 0 ? tc.title : "",
          i === 0 ? descText : "",
          i === 0 ? setupText : "",
          i === 0 ? "Manual" : "",
          i === 0 ? "No" : "",
          step.step || "",
          step.expectedResult || "",
          "",
          "",
          i === 0 ? priority : "",
        ]);
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths matching the JAMA template style
  ws["!cols"] = [
    { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 16 }, { wch: 10 },
    { wch: 50 }, { wch: 50 }, { wch: 5 }, { wch: 20 }, { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  logAudit(req.session.name, "TC_EXPORT_XLSX", `Exported ${testCases.length} test cases to XLSX`);
  res.setHeader("Content-Disposition", `attachment; filename="testforge_export_${Date.now()}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// POST /api/testcases/import-doc — parse JAMA "All Item Details" .doc (MHT) and import as test cases
router.post("/import-doc", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  // Decode quoted-printable encoding used in Word MHT files
  function decodeQP(str) {
    return str
      .replace(/=\r\n/g, "")
      .replace(/=\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  // Walk a cheerio element, returning text with <img> src preserved as a placeholder
  // so the step regex can split on text while images survive into the stored HTML
  function textWithImagePlaceholders($, el) {
    let out = "";
    $(el).contents().each((_, node) => {
      const tag = node.tagName?.toLowerCase();
      if (node.type === "text") {
        // Strip HTML markup embedded as literal text (JAMA encodes step HTML as entities
        // which cheerio decodes back to < > characters in text nodes), decode any remaining
        // HTML entities (e.g. &nbsp; left from double-encoded &amp;nbsp;), and remove \r chars
        const text = node.data
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
          .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\r/g, "");
        out += text;
      } else if (tag === "img") {
        const src = $(node).attr("src") || "";
        if (/^https?:\/\//.test(src)) out += `[[IMG:${src}]]`;
      } else if (tag === "br") {
        out += " ";
      } else {
        out += textWithImagePlaceholders($, node);
      }
    });
    return out;
  }

  // Convert a step string (with [[IMG:...]] placeholders) to safe HTML
  function placeholdersToHtml(str) {
    const escaped = str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/\[\[IMG:(https?:\/\/[^\]]+)\]\]/g,
      (_, src) => `<img src="${src}" alt="" style="max-width:480px;display:block;margin:6px 0;" />`);
  }

  // Parse structured subsections: <p><strong>Label:</strong></p><ul><li>...</li></ul>
  function parseSubsections($, $cell) {
    const result = {};
    let currentKey = null;
    $cell.children().each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag === "p") {
        const strongText = $(el).find("strong").text().replace(/:$/, "").trim().toLowerCase();
        if (strongText) currentKey = strongText;
      } else if (tag === "ul" && currentKey) {
        const items = [];
        $(el).find("li").each((_, li) => {
          const text = $(li).text().replace(/\s+/g, " ").trim();
          if (text) items.push(text);
        });
        if (!result[currentKey]) result[currentKey] = [];
        result[currentKey].push(...items);
      }
    });
    return result;
  }

  // Read as latin1 (byte-preserving), QP-decode, then reinterpret as UTF-8
  // This fixes mojibake from inline UTF-8 bytes (e.g. • stored as E2 80 A2)
  const raw = req.file.buffer.toString("latin1");
  const decoded = decodeQP(raw);
  const html = Buffer.from(decoded, "latin1").toString("utf8");
  const $ = cheerio.load(html);
  const db = getDb();

  const imported = [];
  const skipped = [];

  $("div.Section1").each((_, section) => {
    try {
      const fieldMap = {};

      // Extract all label/value pairs from the two-column grid table
      $(section).find("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length === 2) {
          const label = $(cells[0]).find("b").text().replace(/:$/, "").trim();
          if (label) fieldMap[label] = $(cells[1]);
        }
      });

      // Only process sections that have a Project ID (actual test cases)
      const projectId = fieldMap["Project ID"] ? fieldMap["Project ID"].text().trim() : null;
      const title = fieldMap["Name"] ? fieldMap["Name"].text().trim() : null;
      if (!projectId || !title) return;

      // Check for duplicate
      const existing = db.prepare("SELECT tc_id FROM test_cases WHERE tc_id = ?").get(projectId);
      if (existing) { skipped.push(projectId); return; }

      // Parse structured Description → {objective, scope, assumptions[]}
      let descJson = "";
      if (fieldMap["Description"]) {
        const subs = parseSubsections($, fieldMap["Description"]);
        const obj = {
          objective: (subs["objective"] || []).join(" ").replace(/\s+/g, " ").trim(),
          scope: (subs["scope"] || []).join(" ").replace(/\s+/g, " ").trim(),
          assumptions: subs["assumptions"] || [],
        };
        if (obj.objective || obj.scope || obj.assumptions.length) {
          descJson = JSON.stringify(obj);
        } else {
          // Fallback to plain text if no structured subsections
          descJson = fieldMap["Description"].text().replace(/\s+/g, " ").trim();
        }
      }

      // Parse structured Setup → {preconditions[], environment[], equipment[], testData[]}
      let setupJson = "";
      if (fieldMap["Setup"]) {
        const subs = parseSubsections($, fieldMap["Setup"]);
        const obj = {
          preconditions: subs["preconditions"] || [],
          environment: subs["environment"] || [],
          equipment: subs["equipment"] || [],
          testData: subs["test data"] || [],
        };
        if (obj.preconditions.length || obj.environment.length || obj.equipment.length || obj.testData.length) {
          setupJson = JSON.stringify(obj);
        } else {
          setupJson = fieldMap["Setup"].text().replace(/\s+/g, " ").trim();
        }
      }

      const status = fieldMap["Status"] ? fieldMap["Status"].text().trim() : "Draft";

      // Parse steps: "1: action_text, expected_result\n2: ..."
      // Uses image-placeholder extraction so <img> URLs survive the text split
      const steps = [];
      if (fieldMap["Steps"]) {
        const rawText = textWithImagePlaceholders($, fieldMap["Steps"]);
        const stepMatches = [...rawText.matchAll(/(\d+):\s*([\s\S]*?)(?=\s*\d+:|$)/g)];
        for (const match of stepMatches) {
          const stepBody = match[2].trim();
          const commaIdx = stepBody.lastIndexOf(", ");
          if (commaIdx > -1) {
            steps.push({
              step: placeholdersToHtml(stepBody.substring(0, commaIdx).replace(/\s+/g, " ").trim()),
              expectedResult: placeholdersToHtml(stepBody.substring(commaIdx + 2).replace(/\s+/g, " ").trim()),
            });
          } else if (stepBody) {
            steps.push({ step: placeholdersToHtml(stepBody.replace(/\s+/g, " ").trim()), expectedResult: "" });
          }
        }
      }

      const tcStatus = status === "Approved" ? "Reviewed" : "Draft";

      db.prepare(
        "INSERT INTO test_cases (tc_id, title, project_id, linked_req_ids, preconditions, steps, pass_fail_criteria, type, depth, req_attribute, kb_references, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        projectId, title, projectId, "[]",
        setupJson, JSON.stringify(steps), descJson,
        "Happy Path", "standard", "",
        "[]", tcStatus,
        `${req.session.name} (JAMA DOC import)`
      );

      imported.push(projectId);
    } catch (err) {
      console.error("Error parsing section:", err.message);
    }
  });

  logAudit(req.session.name, "TC_IMPORT_DOC", `JAMA DOC import: ${imported.length} imported, ${skipped.length} skipped (duplicates)`);
  res.json({ imported: imported.length, skipped: skipped.length, tc_ids: imported });
});

module.exports = router;
