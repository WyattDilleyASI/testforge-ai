const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const cheerio = require("cheerio");
const mammoth = require("mammoth");
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
    upstream_relationship: JSON.parse(tc.upstream_relationship || "[]"),
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

    const insertStmt = db.prepare("INSERT INTO test_cases (tc_id, title, linked_req_ids, preconditions, steps, description, type, depth, req_attribute, kb_references, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)");

    const insertMany = db.transaction((tcs) => {
      for (const tc of tcs) {
        insertStmt.run(tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions, tc.steps, tc.description, tc.type, tc.depth, tc.req_attribute, tc.kb_references, tc.generated_by);
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
        description: tc.description ? JSON.stringify(tc.description) : "",
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
      upstream_relationship: JSON.parse(tc.upstream_relationship || "[]"),
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

  const insertStmt = db.prepare("INSERT INTO test_cases (tc_id, title, linked_req_ids, preconditions, steps, description, type, depth, req_attribute, kb_references, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)");

  const insertMany = db.transaction((items) => {
    for (const tc of items) {
      insertStmt.run(tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions, tc.steps, tc.description, tc.type, tc.depth, tc.req_attribute, tc.kb_references, tc.generated_by);
    }
  });

  const tcsToInsert = tcs.map((tc, i) => {
    const tcId = `TC-${reqId}-${String(currentCount + i + 1).padStart(3, "0")}`;
    newTcs.push(tcId);
    return {
      tc_id: tcId,
      title: tc.title || "Untitled",
      linked_req_ids: JSON.stringify([reqId]),
      preconditions: tc.setup ? JSON.stringify(tc.setup) : "",
      steps: JSON.stringify(tc.steps || []),
      description: tc.description ? JSON.stringify(tc.description) : "",
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
      upstream_relationship: JSON.parse(tc.upstream_relationship || "[]"),
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

// Strip HTML tags and decode entities for plain-text XLSX cells
function stripHtmlForXlsx(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

// GET /api/testcases/export/xlsx — export all test cases in JAMA xlsx format
router.get("/export/xlsx", requireAuth, (req, res) => {
  const db = getDb();
  const testCases = db.prepare("SELECT * FROM test_cases ORDER BY rowid").all();
  const requirements = db.prepare("SELECT * FROM requirements").all();
  const reqMap = {};
  for (const r of requirements) reqMap[r.req_id] = r;

  const headers = ["Name", "Description", "Setup", "Automation Tool", "Automated", "Step Number", "Step Action", "Step Expected Result", "Step Notes", "Priority", "Upstream Relationship"];
  const rows = [headers];

  for (const tc of testCases) {
    const steps = JSON.parse(tc.steps || "[]");
    const linkedReqIds = JSON.parse(tc.linked_req_ids || "[]");
    const priority = linkedReqIds.length > 0 && reqMap[linkedReqIds[0]] ? reqMap[linkedReqIds[0]].priority : "High";

    // Format upstream relationships as "ID - Name; ID - Name"
    let upstreamText = "";
    try {
      const ups = JSON.parse(tc.upstream_relationship || "[]");
      if (Array.isArray(ups) && ups.length > 0) {
        upstreamText = ups.map(u => `${u.id} - ${u.name}`).join("; ");
      }
    } catch {}

    // Unpack structured description and setup if JSON, otherwise use plain text
    let descText = tc.description || "";
    try {
      const d = JSON.parse(tc.description || "");
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
      rows.push([tc.title, descText, setupText, "Manual", "No", "", "", "", "", priority, upstreamText]);
    } else {
      steps.forEach((step, i) => {
        rows.push([
          tc.title,
          descText,
          setupText,
          "Manual",
          "No",
          i + 1,
          stripHtmlForXlsx(step.step),
          stripHtmlForXlsx(step.expectedResult),
          "",
          priority,
          upstreamText,
        ]);
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths matching the JAMA template style
  ws["!cols"] = [
    { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 16 }, { wch: 10 },
    { wch: 10 }, { wch: 50 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  logAudit(req.session.name, "TC_EXPORT_XLSX", `Exported ${testCases.length} test cases to XLSX`);
  res.setHeader("Content-Disposition", `attachment; filename="testforge_export_${Date.now()}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// POST /api/testcases/import-doc — parse JAMA Verification Test Cases .docx or "All Item Details" .doc (MHT)
router.post("/import-doc", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const db = getDb();
  const imported = [];
  const skipped = [];

  // Detect file format: .docx starts with PK (zip), .doc MHT starts with MIME-Version
  const isDocx = req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4B;

  if (isDocx) {
    // ─── DOCX format (Verification Test Cases export) ──────────────────────
    try {
      const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
      const $ = cheerio.load(result.value);

      // Find the main data table (the one with the most rows)
      let mainTable = null;
      let maxRows = 0;
      $("table").each((_, t) => {
        if ($(t).parents("table").length === 0) {
          const rowCount = $(t).find("tr").length;
          if (rowCount > maxRows) { maxRows = rowCount; mainTable = t; }
        }
      });
      if (!mainTable) return res.status(400).json({ error: "No data table found in DOCX" });

      const rows = $(mainTable).find("tr");
      const tcIdPattern = /^[A-Z0-9]+-[A-Z_a-z0-9]+-\d+$/;

      // Parse description cell HTML: <strong>Objective:</strong> <ul><li>...</li></ul> etc.
      function parseDescriptionCell($, cell) {
        const obj = { objective: "", scope: "", assumptions: [] };
        let currentKey = null;

        $(cell).children().each((_, el) => {
          const tag = el.tagName?.toLowerCase();
          if (tag === "p") {
            const strongText = $(el).find("strong").text().replace(/:$/, "").trim().toLowerCase();
            if (strongText) currentKey = strongText;
          } else if (tag === "ul" && currentKey) {
            const items = [];
            $(el).find("li").each((_, li) => {
              const text = $(li).text().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();
              if (text) items.push(text);
            });
            if (currentKey === "objective") obj.objective = items.join(" ");
            else if (currentKey === "scope") obj.scope = items.join(" ");
            else if (currentKey === "assumptions") obj.assumptions.push(...items);
          }
        });

        if (obj.objective || obj.scope || obj.assumptions.length) return JSON.stringify(obj);
        // Fallback to plain text
        return $(cell).text().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();
      }

      // Parse upstream relationships: "Upstream Relationships: ID1 Name1ID2 Name2"
      function parseUpstream(text) {
        const after = text.replace(/^Upstream Relationships:\s*/i, "").trim();
        if (!after) return "[]";
        // Match JAMA IDs (e.g. LFWM2-SYSRQ-292) followed by their name
        const matches = [...after.matchAll(/([A-Z0-9]+-[\w]+-\d+)\s+([\s\S]*?)(?=[A-Z0-9]+-[\w]+-\d+|$)/g)];
        if (matches.length === 0) return "[]";
        const rels = matches.map(m => ({ id: m[1].trim(), name: m[2].trim() }));
        return JSON.stringify(rels);
      }

      // Walk through rows, grouping by TC boundaries
      let currentTc = null;
      let state = "idle"; // idle | desc | verification | steps_pending | steps_header | steps

      function saveTc() {
        if (!currentTc) return;
        const existing = db.prepare("SELECT tc_id FROM test_cases WHERE tc_id = ?").get(currentTc.tcId);
        if (existing) { skipped.push(currentTc.tcId); return; }

        db.prepare(
          "INSERT INTO test_cases (tc_id, title, project_id, linked_req_ids, preconditions, steps, description, type, depth, req_attribute, kb_references, upstream_relationship, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)"
        ).run(
          currentTc.tcId, currentTc.title, currentTc.tcId, "[]",
          "", JSON.stringify(currentTc.steps), currentTc.descJson,
          "Happy Path", "standard", "",
          "[]", currentTc.upstream,
          `${req.session.name} (JAMA DOCX import)`
        );
        imported.push(currentTc.tcId);
      }

      rows.each((_, row) => {
        const cells = $(row).children("td");
        const cellCount = cells.length;
        const firstCellText = cells.eq(0).text().replace(/\xa0/g, " ").trim();

        // TC header row: 2 cells, first cell matches ID pattern
        if (cellCount === 2 && tcIdPattern.test(firstCellText)) {
          saveTc();
          currentTc = {
            tcId: firstCellText,
            title: cells.eq(1).text().replace(/\xa0/g, " ").trim(),
            descJson: "",
            steps: [],
            upstream: "[]",
          };
          state = "desc";
          return;
        }

        if (!currentTc) return;

        // Description row: 1 cell after header
        if (state === "desc" && cellCount === 1) {
          currentTc.descJson = parseDescriptionCell($, cells.eq(0));
          state = "verification";
          return;
        }

        // Verification Method row
        if (state === "verification" && firstCellText.startsWith("Verification Method")) {
          state = "steps_pending";
          return;
        }

        // "Steps" label row
        if (state === "steps_pending" && firstCellText === "Steps") {
          state = "steps_header";
          return;
        }

        // Steps column header row: "Action", "Expected Results", "Notes"
        if (state === "steps_header" && firstCellText === "Action") {
          state = "steps";
          return;
        }

        // Step data rows: 3 cells
        if (state === "steps" && cellCount === 3) {
          const action = cells.eq(0).text().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();
          const expected = cells.eq(1).text().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();
          if (action || expected) {
            currentTc.steps.push({ step: action, expectedResult: expected });
          }
          return;
        }

        // Upstream Relationships row: 1 cell starting with "Upstream Relationships"
        if (cellCount === 1 && firstCellText.startsWith("Upstream Relationships")) {
          currentTc.upstream = parseUpstream(firstCellText);
          saveTc();
          currentTc = null;
          state = "idle";
          return;
        }

        // Skip single-cell rows in steps state (nested table duplicates from mammoth)
        if (state === "steps" && cellCount === 1) return;
      });

      // Save last TC if no upstream row terminated it
      saveTc();

    } catch (err) {
      console.error("DOCX import error:", err);
      return res.status(500).json({ error: `DOCX import failed: ${err.message}` });
    }
  } else {
    // ─── MHT .doc format (All Item Details export) ────────────────────────

    function decodeQP(str) {
      return str
        .replace(/=\r\n/g, "")
        .replace(/=\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }

    function textWithImagePlaceholders($, el) {
      let out = "";
      $(el).contents().each((_, node) => {
        const tag = node.tagName?.toLowerCase();
        if (node.type === "text") {
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

    function placeholdersToHtml(str) {
      const escaped = str
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return escaped.replace(/\[\[IMG:(https?:\/\/[^\]]+)\]\]/g,
        (_, src) => `<img src="${src}" alt="" style="max-width:480px;display:block;margin:6px 0;" />`);
    }

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

    const raw = req.file.buffer.toString("latin1");
    const decoded = decodeQP(raw);
    const html = Buffer.from(decoded, "latin1").toString("utf8");
    const $ = cheerio.load(html);

    $("div.Section1").each((_, section) => {
      try {
        const fieldMap = {};
        $(section).find("tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length === 2) {
            const label = $(cells[0]).find("b").text().replace(/:$/, "").trim();
            if (label) fieldMap[label] = $(cells[1]);
          }
        });

        const projectId = fieldMap["Project ID"] ? fieldMap["Project ID"].text().trim() : null;
        const title = fieldMap["Name"] ? fieldMap["Name"].text().trim() : null;
        if (!projectId || !title) return;

        const existing = db.prepare("SELECT tc_id FROM test_cases WHERE tc_id = ?").get(projectId);
        if (existing) { skipped.push(projectId); return; }

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
            descJson = fieldMap["Description"].text().replace(/\s+/g, " ").trim();
          }
        }

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

        // Parse upstream relationship from MHT if available
        let upstream = "[]";
        if (fieldMap["Upstream Relationships"]) {
          const text = fieldMap["Upstream Relationships"].text().trim();
          const matches = [...text.matchAll(/([A-Z0-9]+-[\w]+-\d+)\s+([\s\S]*?)(?=[A-Z0-9]+-[\w]+-\d+|$)/g)];
          if (matches.length > 0) {
            upstream = JSON.stringify(matches.map(m => ({ id: m[1].trim(), name: m[2].trim() })));
          }
        }

        const tcStatus = status === "Approved" ? "Reviewed" : "Draft";

        db.prepare(
          "INSERT INTO test_cases (tc_id, title, project_id, linked_req_ids, preconditions, steps, description, type, depth, req_attribute, kb_references, upstream_relationship, status, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          projectId, title, projectId, "[]",
          setupJson, JSON.stringify(steps), descJson,
          "Happy Path", "standard", "",
          "[]", upstream, tcStatus,
          `${req.session.name} (JAMA DOC import)`
        );

        imported.push(projectId);
      } catch (err) {
        console.error("Error parsing section:", err.message);
      }
    });
  }

  logAudit(req.session.name, "TC_IMPORT_DOC", `JAMA DOC import: ${imported.length} imported, ${skipped.length} skipped (duplicates)`);
  res.json({ imported: imported.length, skipped: skipped.length, tc_ids: imported });
});

module.exports = router;
