const express = require("express");
const { getDb, logAudit } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

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

  const prompt = `You are a senior QA engineer generating software test case DRAFTS. These are starting points for engineer review — not finished test coverage.

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
- preconditions: string
- steps: array of { step: string, expectedResult: string }
- passFailCriteria: string
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
        preconditions: tc.preconditions || "",
        steps: JSON.stringify(tc.steps || []),
        pass_fail_criteria: tc.passFailCriteria || "",
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

  const prompt = `You are a senior QA engineer generating software test case DRAFTS. These are starting points for engineer review — not finished test coverage.

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
- preconditions: string
- steps: array of { step: string, expectedResult: string }
- passFailCriteria: string
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

module.exports = router;
