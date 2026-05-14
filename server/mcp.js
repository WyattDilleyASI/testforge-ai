// server/mcp.js — MCP Server for TestForge AI
// ═══════════════════════════════════════════════════════════════════════════
// Turns TestForge into an MCP server so Claude Desktop / Code / Web can
// interact with requirements, test cases, and the knowledge base directly.
// Users authenticate via personal MCP tokens generated in TestForge's UI.
// No Anthropic API key is needed — Claude does the reasoning natively.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const { getDb, getReqDb, getTcDb, getKbDb, logAudit, nextKbId } = require("./db");

// ─── CACHED ESM IMPORTS (MCP SDK is ESM-only) ──────────────────────────────

let _McpServer, _SSEServerTransport, _z;

async function ensureMcpImports() {
  if (_McpServer) return;
  const [mcpMod, sseMod, zodMod] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/mcp.js"),
    import("@modelcontextprotocol/sdk/server/sse.js"),
    import("zod"),
  ]);
  _McpServer = mcpMod.McpServer;
  _SSEServerTransport = sseMod.SSEServerTransport;
  _z = zodMod.z;
}

// ─── MCP TOKEN MANAGEMENT ──────────────────────────────────────────────────

function generateMcpToken() {
  return "tfmcp_" + crypto.randomBytes(32).toString("hex");
}

function validateToken(token) {
  if (!token) return { user: null, reason: "missing" };
  const db = getDb();
  const row = db.prepare(`
    SELECT t.*, u.username, u.name, u.role, u.status
    FROM mcp_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.token = ?
  `).get(token);

  if (!row) return { user: null, reason: "invalid" };
  if (row.status !== "Active") return { user: null, reason: "inactive_user", username: row.username };

  db.prepare("UPDATE mcp_tokens SET last_used = datetime('now') WHERE token = ?").run(token);
  return {
    user: { userId: row.user_id, username: row.username, name: row.name, role: row.role },
    reason: null,
  };
}

// ─── ACTIVE SESSION TRACKING ────────────────────────────────────────────────

const activeSessions = new Map();

// ─── MCP SERVER FACTORY ─────────────────────────────────────────────────────

async function createMcpServer(user) {
  await ensureMcpImports();
  const z = _z;

  const server = new _McpServer({
    name: "testforge-ai",
    version: "1.4.0",
  });

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: list_requirements
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "list_requirements",
    "List all requirements in TestForge with optional filters. Returns req_id, title, description, acceptance criteria, priority, status, and module for each.",
    {
      status: z.enum(["Draft", "Review", "Approved", "Rejected", "all"]).optional()
        .describe("Filter by status. Omit or pass 'all' to return everything."),
      module: z.string().optional()
        .describe("Filter by module name (case-insensitive partial match)"),
    },
    async ({ status, module }) => {
      const db = getReqDb();
      let rows = db.prepare("SELECT * FROM requirements ORDER BY rowid").all();

      if (status && status !== "all") rows = rows.filter(r => r.status === status);
      if (module) rows = rows.filter(r =>
        r.module && r.module.toLowerCase().includes(module.toLowerCase())
      );

      const result = rows.map(r => ({
        req_id: r.req_id,
        title: r.title,
        description: r.description,
        acceptance_criteria: JSON.parse(r.acceptance_criteria || "[]"),
        priority: r.priority,
        status: r.status,
        module: r.module,
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: get_requirement
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_requirement",
    "Get full details of a specific requirement including its acceptance criteria, related knowledge base entries, and any existing test cases linked to it. Use this to gather context before generating test cases.",
    {
      req_id: z.string().describe("The requirement ID, e.g. RS-001, TC-001, JM-004"),
    },
    async ({ req_id }) => {
      const req = getReqDb().prepare("SELECT * FROM requirements WHERE req_id = ?").get(req_id);
      if (!req) {
        return { content: [{ type: "text", text: `Requirement '${req_id}' not found.` }] };
      }

      // KB↔Requirement linkage canonically lives in kb_entries.related_reqs.
      // We also still match KBs whose tags include the req_id literally (legacy
      // convention, pre-migration data) so this tool keeps working on un-
      // migrated databases.
      const allKb = getKbDb().prepare("SELECT * FROM kb_entries").all();
      const relatedKb = allKb.filter(kb => {
        let related; try { related = JSON.parse(kb.related_reqs || "[]"); } catch { related = []; }
        let tags; try { tags = JSON.parse(kb.tags || "[]"); } catch { tags = []; }
        return (Array.isArray(related) && related.includes(req_id))
          || (Array.isArray(tags) && tags.includes(req_id));
      });

      const allTcs = getTcDb().prepare("SELECT tc_id, title, status, type, description FROM test_cases").all();
      const linkedTcs = allTcs.filter(tc => {
        const linked = JSON.parse(tc.linked_req_ids || "[]");
        return linked.includes(req_id);
      });

      const result = {
        req_id: req.req_id,
        title: req.title,
        description: req.description,
        acceptance_criteria: JSON.parse(req.acceptance_criteria || "[]"),
        priority: req.priority,
        status: req.status,
        module: req.module,
        source: req.source,
        related_kb_entries: relatedKb.map(kb => ({
          kb_id: kb.kb_id, title: kb.title, type: kb.type, content: kb.content,
        })),
        existing_test_cases: linkedTcs,
        existing_tc_count: linkedTcs.length,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: save_test_cases
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "save_test_cases",
    `Persist generated test cases into TestForge's database. Call this after you've analyzed a requirement and produced test cases. All saved TCs are marked as "Draft" and require human QA engineer review before use.

Each test case must include: title, type, preconditions, steps (with expected results), and pass/fail criteria. Optionally reference KB entries that informed the test.

IMPORTANT: You must call get_requirement first to understand the requirement and its KB context before generating test cases.`,
    {
      req_id: z.string().describe("Requirement ID these test cases validate"),
      depth: z.enum(["basic", "standard", "comprehensive"]).optional()
        .describe("Generation depth: basic (2-3 TCs), standard (4-6), comprehensive (6-10)"),
      test_cases: z.array(z.object({
        title: z.string().describe("Descriptive test case title"),
        type: z.enum(["Happy Path", "Negative", "Boundary", "Edge Case"])
          .describe("Test category"),
        preconditions: z.string()
          .describe("Setup conditions required before executing this test"),
        steps: z.array(z.object({
          step: z.string().describe("Action to perform"),
          expectedResult: z.string().describe("What should happen"),
        })).min(1).describe("Ordered test steps with expected results"),
        passFailCriteria: z.string()
          .describe("Unambiguous binary pass/fail statement"),
        reqAttribute: z.string().optional()
          .describe("Which specific acceptance criterion this TC validates"),
        kbReferences: z.array(z.string()).optional()
          .describe("KB entry IDs (e.g. KB-E001) that informed this test case"),
      })).min(1).describe("Array of test cases to save"),
    },
    async ({ req_id, depth, test_cases }) => {
      const requirement = getReqDb().prepare("SELECT req_id FROM requirements WHERE req_id = ?").get(req_id);
      if (!requirement) {
        return { content: [{ type: "text", text: `Error: Requirement '${req_id}' not found. Cannot save test cases.` }] };
      }

      const db = getTcDb();
      const currentCount = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
      const newTcIds = [];

      const insertStmt = db.prepare(`
        INSERT INTO test_cases
          (tc_id, title, linked_req_ids, preconditions, steps, description,
           type, depth, req_attribute, kb_references, status, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)
      `);

      const insertMany = db.transaction((tcs) => {
        for (const tc of tcs) {
          insertStmt.run(
            tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions,
            tc.steps, tc.description, tc.type, tc.depth,
            tc.req_attribute, tc.kb_references, tc.generated_by
          );
        }
      });

      const tcsToInsert = test_cases.map((tc, i) => {
        const tcId = `TC-${req_id}-${String(currentCount + i + 1).padStart(3, "0")}`;
        newTcIds.push(tcId);
        return {
          tc_id: tcId,
          title: tc.title,
          linked_req_ids: JSON.stringify([req_id]),
          preconditions: tc.preconditions || "",
          steps: JSON.stringify(tc.steps || []),
          description: tc.passFailCriteria || tc.description || "",
          type: tc.type,
          depth: depth || "standard",
          req_attribute: tc.reqAttribute || "",
          kb_references: JSON.stringify(tc.kbReferences || []),
          generated_by: `${user.name} (via MCP)`,
        };
      });

      insertMany(tcsToInsert);

      const allRefs = [...new Set(test_cases.flatMap(tc => tc.kbReferences || []))];
      if (allRefs.length > 0) {
        const updateKb = getKbDb().prepare("UPDATE kb_entries SET usage_count = usage_count + 1 WHERE kb_id = ?");
        for (const kbId of allRefs) updateKb.run(kbId);
      }

      logAudit(
        user.name, "TC_GENERATED_MCP",
        `Generated ${newTcIds.length} draft TCs for ${req_id} via MCP (depth: ${depth || "standard"})`
      );

      return {
        content: [{
          type: "text",
          text: [
            `✓ Saved ${newTcIds.length} draft test cases for ${req_id}:`,
            ...newTcIds.map(id => `  • ${id}`),
            "",
            "All test cases are marked as DRAFT — QA engineer review is required.",
            "View and review them in the TestForge UI under Test Cases → Library.",
          ].join("\n"),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: review_test_case
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "review_test_case",
    "Update a test case's review status. Use to mark a draft TC as Reviewed (approved) or Rejected.",
    {
      tc_id: z.string().describe("Test case ID, e.g. TC-RS-001-001"),
      status: z.enum(["Reviewed", "Rejected"]).describe("New status"),
      reason: z.string().optional().describe("Reason for the status change"),
    },
    async ({ tc_id, status, reason }) => {
      const db = getTcDb();
      const tc = db.prepare("SELECT tc_id, status FROM test_cases WHERE tc_id = ?").get(tc_id);
      if (!tc) {
        return { content: [{ type: "text", text: `Test case '${tc_id}' not found.` }] };
      }

      db.prepare("UPDATE test_cases SET status = ? WHERE tc_id = ?").run(status, tc_id);
      logAudit(user.name, "TC_STATUS_MCP",
        `${tc_id}: ${tc.status} → ${status}${reason ? ` — ${reason}` : ""} (via MCP)`
      );

      return {
        content: [{ type: "text", text: `${tc_id}: ${tc.status} → ${status}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: list_test_cases
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "list_test_cases",
    "List test cases with optional filters by requirement or status. Returns TC details including steps and pass/fail criteria.",
    {
      req_id: z.string().optional().describe("Show only TCs linked to this requirement ID"),
      status: z.enum(["Draft", "Reviewed", "Rejected", "all"]).optional()
        .describe("Filter by review status"),
    },
    async ({ req_id, status }) => {
      const db = getTcDb();
      // Exclude seeded baseline TCs — they're system content, not user-managed
      // test cases that MCP callers should be operating on.
      let rows = db.prepare("SELECT * FROM test_cases WHERE is_seeded = 0 OR is_seeded IS NULL ORDER BY rowid").all();

      if (req_id) {
        rows = rows.filter(tc => JSON.parse(tc.linked_req_ids || "[]").includes(req_id));
      }
      if (status && status !== "all") {
        rows = rows.filter(tc => tc.status === status);
      }

      const result = rows.map(tc => ({
        tc_id: tc.tc_id,
        title: tc.title,
        linked_req_ids: JSON.parse(tc.linked_req_ids || "[]"),
        type: tc.type,
        status: tc.status,
        preconditions: tc.preconditions,
        steps: JSON.parse(tc.steps || "[]"),
        description: tc.description,
        req_attribute: tc.req_attribute,
        kb_references: JSON.parse(tc.kb_references || "[]"),
        generated_by: tc.generated_by,
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: list_kb_sections
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "list_kb_sections",
    "List all knowledge base sections and their subsections. Use this to understand the KB structure before creating or searching for entries. Each section represents a product or system area, and subsections represent modules within it.",
    {},
    async () => {
      const db = getKbDb();
      const sections = db.prepare("SELECT * FROM kb_sections ORDER BY sort_order, rowid").all();
      const subsections = db.prepare("SELECT * FROM kb_subsections ORDER BY sort_order, rowid").all();

      // Entry counts
      const subCounts = db.prepare(`
        SELECT subsection_id, COUNT(*) as entry_count
        FROM kb_entries WHERE subsection_id IS NOT NULL
        GROUP BY subsection_id
      `).all();
      const countMap = Object.fromEntries(subCounts.map(r => [r.subsection_id, r.entry_count]));
      const uncatCount = db.prepare("SELECT COUNT(*) as count FROM kb_entries WHERE subsection_id IS NULL").get().count;

      const result = sections.map(sec => ({
        section_id: sec.section_id,
        name: sec.name,
        is_default: !!sec.is_default,
        ...(sec.is_default
          ? { entry_count: uncatCount, subsections: [] }
          : {
              subsections: subsections
                .filter(sub => sub.section_id === sec.section_id)
                .map(sub => ({
                  subsection_id: sub.subsection_id,
                  name: sub.name,
                  description: sub.description || "",
                  entry_count: countMap[sub.subsection_id] || 0,
                })),
            }
        ),
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: search_knowledge_base
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "search_knowledge_base",
    "Search the knowledge base for entries relevant to a requirement, topic, or defect history. Returns entries with their section and subsection context. KB entries inform better test case generation.",
    {
      query: z.string().optional()
        .describe("Free-text search across titles and content"),
      req_id: z.string().optional()
        .describe("Find entries tagged with this requirement ID"),
      type: z.enum(["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "all"]).optional()
        .describe("Filter by entry type"),
      subsection_id: z.string().optional()
        .describe("Filter to entries in a specific subsection (e.g. KB-SS001). Use list_kb_sections to find subsection IDs."),
    },
    async ({ query, req_id, type, subsection_id }) => {
      const db = getKbDb();
      let rows = db.prepare("SELECT * FROM kb_entries ORDER BY rowid").all();

      if (req_id) {
        rows = rows.filter(kb => JSON.parse(kb.tags || "[]").includes(req_id));
      }
      if (type && type !== "all") {
        rows = rows.filter(kb => kb.type === type);
      }
      if (subsection_id) {
        rows = rows.filter(kb => kb.subsection_id === subsection_id);
      }
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(kb =>
          kb.title.toLowerCase().includes(q) || kb.content.toLowerCase().includes(q)
        );
      }

      // Build lookup maps for section/subsection names
      const subsections = db.prepare("SELECT * FROM kb_subsections").all();
      const sections = db.prepare("SELECT * FROM kb_sections").all();
      const subMap = Object.fromEntries(subsections.map(s => [s.subsection_id, s]));
      const secMap = Object.fromEntries(sections.map(s => [s.section_id, s]));

      const result = rows.map(kb => {
        const images = JSON.parse(kb.images || "[]");
        const sub = kb.subsection_id ? subMap[kb.subsection_id] : null;
        const sec = sub ? secMap[sub.section_id] : sections.find(s => s.is_default);

        return {
          kb_id: kb.kb_id,
          title: kb.title,
          type: kb.type,
          content: kb.content,
          tags: JSON.parse(kb.tags || "[]"),
          usage_count: kb.usage_count,
          image_count: images.length,
          image_names: images.map(img => img.name),
          // Section/subsection context
          section: sec ? { section_id: sec.section_id, name: sec.name } : null,
          subsection: sub ? { subsection_id: sub.subsection_id, name: sub.name } : null,
        };
      });

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: create_kb_entry
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "create_kb_entry",
    "Add a new knowledge base entry. KB entries capture defect history, system behaviors, business rules, and other context that improves future test case generation. Optionally place the entry into a specific subsection — use list_kb_sections to discover available subsections.",
    {
      title: z.string().describe("Concise entry title"),
      type: z.enum([
        "Defect History", "System Behavior", "Environment Constraint",
        "Business Rule", "Test Data Guideline",
      ]).describe("Category of knowledge"),
      content: z.string().describe("Detailed content of the entry"),
      tags: z.array(z.string()).optional()
        .describe("Requirement IDs to associate with this entry (e.g. ['RS-001', 'TC-003'])"),
      subsection_id: z.string().optional()
        .describe("Place entry in a specific subsection (e.g. KB-SS001). Omit for Uncategorized. Use list_kb_sections to find IDs."),
    },
    async ({ title, type, content, tags, subsection_id }) => {
      const db = getKbDb();

      // Validate subsection if provided
      if (subsection_id) {
        const sub = db.prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?").get(subsection_id);
        if (!sub) {
          return { content: [{ type: "text", text: `Error: Subsection '${subsection_id}' not found. Use list_kb_sections to see available subsections.` }] };
        }
      }

      const kbId = nextKbId();

      db.prepare(
        "INSERT INTO kb_entries (kb_id, title, type, content, tags, images, subsection_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(kbId, title, type, content, JSON.stringify(tags || []), "[]", subsection_id || null, `${user.name} (via MCP)`);

      // Look up where it was placed for the response
      let locationMsg = "Uncategorized";
      if (subsection_id) {
        const sub = db.prepare("SELECT s.name as sub_name, sec.name as sec_name FROM kb_subsections s JOIN kb_sections sec ON s.section_id = sec.section_id WHERE s.subsection_id = ?").get(subsection_id);
        if (sub) locationMsg = `${sub.sec_name} → ${sub.sub_name}`;
      }

      logAudit(user.name, "KB_CREATED_MCP", `Created KB entry ${kbId}: ${title} in ${locationMsg} (via MCP)`);

      return {
        content: [{ type: "text", text: `✓ Created KB entry ${kbId}: "${title}" [${type}] in ${locationMsg}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: create_requirement
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "create_requirement",
    "Create a new requirement in TestForge. Requirements define what needs to be tested and serve as the basis for test case generation.",
    {
      req_id: z.string().describe("Unique requirement ID, e.g. RS-008, TC-010"),
      title: z.string().describe("Requirement title"),
      description: z.string().optional().describe("Detailed description"),
      acceptance_criteria: z.array(z.string()).optional()
        .describe("Testable acceptance criteria statements"),
      priority: z.enum(["High", "Medium", "Low"]).optional().describe("Priority (default: High)"),
      status: z.enum(["Draft", "Review", "Approved", "Rejected"]).optional()
        .describe("Status (default: Draft)"),
      module: z.string().optional()
        .describe("Module grouping, e.g. 'Requirement Ingestion', 'Test Case Generation'"),
    },
    async ({ req_id, title, description, acceptance_criteria, priority, status, module }) => {
      const db = getReqDb();
      const existing = db.prepare("SELECT req_id FROM requirements WHERE req_id = ?").get(req_id);
      if (existing) {
        return { content: [{ type: "text", text: `Error: Requirement '${req_id}' already exists.` }] };
      }

      db.prepare(`
        INSERT INTO requirements (req_id, title, description, acceptance_criteria, priority, status, source, module)
        VALUES (?, ?, ?, ?, ?, ?, 'MCP Entry', ?)
      `).run(
        req_id, title, description || "",
        JSON.stringify(acceptance_criteria || []),
        priority || "High", status || "Draft", module || ""
      );

      logAudit(user.name, "REQ_CREATED_MCP", `Created requirement ${req_id}: ${title} (via MCP)`);

      return {
        content: [{ type: "text", text: `✓ Created requirement ${req_id}: "${title}"` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: update_requirement
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "update_requirement",
    "Update an existing requirement's fields. Only provided fields are updated — omitted fields remain unchanged. Use this to refine descriptions, update acceptance criteria, change priority/status, or add tags.",
    {
      req_id: z.string().describe("The requirement ID to update, e.g. RS-001"),
      title: z.string().optional().describe("Updated title"),
      description: z.string().optional().describe("Updated description"),
      acceptance_criteria: z.array(z.string()).optional()
        .describe("Updated acceptance criteria (replaces existing)"),
      priority: z.enum(["High", "Medium", "Low"]).optional().describe("Updated priority"),
      status: z.enum(["Draft", "Review", "Approved", "Rejected"]).optional()
        .describe("Updated status"),
      module: z.string().optional().describe("Updated module grouping"),
      tags: z.array(z.string()).optional()
        .describe("Updated tags (replaces existing)"),
      rationale: z.string().optional().describe("Updated rationale"),
      verification_method: z.string().optional().describe("Updated verification method"),
    },
    async ({ req_id, title, description, acceptance_criteria, priority, status, module, tags, rationale, verification_method }) => {
      const db = getReqDb();
      const existing = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req_id);
      if (!existing) {
        return { content: [{ type: "text", text: `Requirement '${req_id}' not found.` }] };
      }

      const updates = [];
      const fields = {
        title: title ?? existing.title,
        description: description ?? existing.description,
        acceptance_criteria: acceptance_criteria ? JSON.stringify(acceptance_criteria) : existing.acceptance_criteria,
        priority: priority ?? existing.priority,
        status: status ?? existing.status,
        module: module ?? existing.module,
        tags: tags ? JSON.stringify(tags) : existing.tags,
        rationale: rationale ?? existing.rationale,
        verification_method: verification_method ?? existing.verification_method,
      };

      if (title !== undefined) updates.push("title");
      if (description !== undefined) updates.push("description");
      if (acceptance_criteria !== undefined) updates.push("acceptance_criteria");
      if (priority !== undefined) updates.push("priority");
      if (status !== undefined) updates.push("status");
      if (module !== undefined) updates.push("module");
      if (tags !== undefined) updates.push("tags");
      if (rationale !== undefined) updates.push("rationale");
      if (verification_method !== undefined) updates.push("verification_method");

      if (updates.length === 0) {
        return { content: [{ type: "text", text: `No fields provided to update for ${req_id}.` }] };
      }

      db.prepare(`
        UPDATE requirements SET title = ?, description = ?, acceptance_criteria = ?,
          priority = ?, status = ?, module = ?, tags = ?, rationale = ?,
          verification_method = ?, updated_at = datetime('now')
        WHERE req_id = ?
      `).run(
        fields.title, fields.description, fields.acceptance_criteria,
        fields.priority, fields.status, fields.module, fields.tags,
        fields.rationale, fields.verification_method, req_id
      );

      logAudit(user.name, "REQ_UPDATED_MCP", `Updated ${req_id}: ${updates.join(", ")} (via MCP)`);

      return {
        content: [{ type: "text", text: `Updated ${req_id}: ${updates.join(", ")}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: update_test_case
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "update_test_case",
    "Update an existing test case's fields. Only provided fields are updated — omitted fields remain unchanged. Use this to refine steps, update descriptions, change type, or modify setup conditions. Status is automatically reset to Draft when content changes.",
    {
      tc_id: z.string().describe("The test case ID to update, e.g. TC-RS-001-001"),
      title: z.string().optional().describe("Updated title"),
      type: z.enum(["Happy Path", "Negative", "Boundary", "Edge Case"]).optional()
        .describe("Updated test type"),
      description: z.object({
        objective: z.string().optional(),
        scope: z.string().optional(),
        assumptions: z.array(z.string()).optional(),
      }).optional().describe("Updated description object"),
      setup: z.object({
        preconditions: z.array(z.string()).optional(),
        environment: z.array(z.string()).optional(),
        equipment: z.array(z.string()).optional(),
        testData: z.array(z.string()).optional(),
      }).optional().describe("Updated setup/preconditions object"),
      steps: z.array(z.object({
        step: z.string().describe("Action to perform"),
        expectedResult: z.string().describe("What should happen"),
      })).optional().describe("Updated test steps (replaces existing)"),
      req_attribute: z.string().optional()
        .describe("Updated acceptance criterion this TC validates"),
    },
    async ({ tc_id, title, type, description, setup, steps, req_attribute }) => {
      const db = getTcDb();
      const existing = db.prepare("SELECT * FROM test_cases WHERE tc_id = ?").get(tc_id);
      if (!existing) {
        return { content: [{ type: "text", text: `Test case '${tc_id}' not found.` }] };
      }

      const updates = [];
      if (title !== undefined) updates.push("title");
      if (type !== undefined) updates.push("type");
      if (description !== undefined) updates.push("description");
      if (setup !== undefined) updates.push("setup");
      if (steps !== undefined) updates.push("steps");
      if (req_attribute !== undefined) updates.push("req_attribute");

      if (updates.length === 0) {
        return { content: [{ type: "text", text: `No fields provided to update for ${tc_id}.` }] };
      }

      db.prepare(`
        UPDATE test_cases SET title = ?, type = ?, description = ?,
          preconditions = ?, steps = ?, req_attribute = ?, status = 'Draft'
        WHERE tc_id = ?
      `).run(
        title ?? existing.title,
        type ?? existing.type,
        description ? JSON.stringify(description) : existing.description,
        setup ? JSON.stringify(setup) : existing.preconditions,
        steps ? JSON.stringify(steps) : existing.steps,
        req_attribute ?? existing.req_attribute,
        tc_id
      );

      logAudit(user.name, "TC_UPDATED_MCP", `Updated ${tc_id}: ${updates.join(", ")} (via MCP)`);

      return {
        content: [{ type: "text", text: `Updated ${tc_id}: ${updates.join(", ")} (status reset to Draft)` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: update_kb_entry
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "update_kb_entry",
    "Update an existing knowledge base entry. Only provided fields are updated — omitted fields remain unchanged. Use this to edit content, change tags, update related requirements, or modify the entry type.",
    {
      kb_id: z.string().describe("The KB entry ID to update, e.g. KB-E001"),
      title: z.string().optional().describe("Updated title"),
      type: z.enum([
        "Defect History", "System Behavior", "Environment Constraint",
        "Business Rule", "Test Data Guideline", "UI Reference",
      ]).optional().describe("Updated category"),
      content: z.string().optional().describe("Updated content"),
      tags: z.array(z.string()).optional()
        .describe("Updated tags (replaces existing)"),
      related_reqs: z.array(z.string()).optional()
        .describe("Updated related requirement IDs (replaces existing)"),
    },
    async ({ kb_id, title, type, content, tags, related_reqs }) => {
      const db = getKbDb();
      const existing = db.prepare("SELECT * FROM kb_entries WHERE kb_id = ?").get(kb_id);
      if (!existing) {
        return { content: [{ type: "text", text: `KB entry '${kb_id}' not found.` }] };
      }

      const updates = [];
      if (title !== undefined) updates.push("title");
      if (type !== undefined) updates.push("type");
      if (content !== undefined) updates.push("content");
      if (tags !== undefined) updates.push("tags");
      if (related_reqs !== undefined) updates.push("related_reqs");

      if (updates.length === 0) {
        return { content: [{ type: "text", text: `No fields provided to update for ${kb_id}.` }] };
      }

      db.prepare(`
        UPDATE kb_entries SET title = ?, type = ?, content = ?, tags = ?, related_reqs = ?
        WHERE kb_id = ?
      `).run(
        title ?? existing.title,
        type ?? existing.type,
        content ?? existing.content,
        tags ? JSON.stringify(tags) : existing.tags,
        related_reqs ? JSON.stringify(related_reqs) : existing.related_reqs,
        kb_id
      );

      logAudit(user.name, "KB_UPDATED_MCP", `Updated ${kb_id}: ${updates.join(", ")} (via MCP)`);

      return {
        content: [{ type: "text", text: `Updated ${kb_id}: ${updates.join(", ")}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: link_kb_to_requirement
  //
  // Attaches a KB entry to a requirement so the KB is auto-included as
  // context whenever test cases are generated for that requirement.
  //
  // Storage note: the linkage lives on the KB side, in kb_entries.related_reqs
  // (an array of req_ids). This tool is additive — it appends to the existing
  // array rather than replacing it, so Claude can attach KBs one-at-a-time
  // without fetching the current list first. For bulk/exact replacement, use
  // update_kb_entry's related_reqs field.
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "link_kb_to_requirement",
    "Attach a knowledge base entry to a requirement so it's auto-included as context when generating test cases for that requirement. Additive: existing links on the KB are preserved. Use this when you identify (e.g. during KB review) that a specific KB should have informed a specific requirement.",
    {
      req_id: z.string().describe("The requirement ID, e.g. RS-001"),
      kb_id: z.string().describe("The KB entry ID, e.g. KB-E001"),
    },
    async ({ req_id, kb_id }) => {
      const reqDb = getReqDb();
      const kbDb = getKbDb();

      const req = reqDb.prepare("SELECT req_id, title FROM requirements WHERE req_id = ?").get(req_id);
      if (!req) {
        return { content: [{ type: "text", text: `Requirement '${req_id}' not found.` }] };
      }

      const kb = kbDb.prepare("SELECT kb_id, title, related_reqs FROM kb_entries WHERE kb_id = ?").get(kb_id);
      if (!kb) {
        return { content: [{ type: "text", text: `KB entry '${kb_id}' not found.` }] };
      }

      let existing;
      try { existing = JSON.parse(kb.related_reqs || "[]"); } catch { existing = []; }
      if (!Array.isArray(existing)) existing = [];

      if (existing.includes(req_id)) {
        return { content: [{ type: "text", text: `${kb_id} is already linked to ${req_id}.` }] };
      }

      existing.push(req_id);
      kbDb.prepare("UPDATE kb_entries SET related_reqs = ? WHERE kb_id = ?")
        .run(JSON.stringify(existing), kb_id);

      logAudit(user.name, "KB_LINKED_MCP", `Linked ${kb_id} → ${req_id} (via MCP)`);

      return {
        content: [{ type: "text", text: `✓ Linked ${kb_id} ("${kb.title}") to ${req_id} ("${req.title}"). It will now be included in future test case generations for that requirement.` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: unlink_kb_from_requirement
  //
  // Removes a single KB↔requirement link without touching other links.
  // Symmetric counterpart to link_kb_to_requirement.
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "unlink_kb_from_requirement",
    "Remove the link between a knowledge base entry and a requirement. Only removes this one link — other links on the KB are preserved. Use this if a KB was attached in error or is no longer relevant.",
    {
      req_id: z.string().describe("The requirement ID, e.g. RS-001"),
      kb_id: z.string().describe("The KB entry ID, e.g. KB-E001"),
    },
    async ({ req_id, kb_id }) => {
      const kbDb = getKbDb();
      const kb = kbDb.prepare("SELECT kb_id, title, related_reqs FROM kb_entries WHERE kb_id = ?").get(kb_id);
      if (!kb) {
        return { content: [{ type: "text", text: `KB entry '${kb_id}' not found.` }] };
      }

      let existing;
      try { existing = JSON.parse(kb.related_reqs || "[]"); } catch { existing = []; }
      if (!Array.isArray(existing) || !existing.includes(req_id)) {
        return { content: [{ type: "text", text: `${kb_id} is not currently linked to ${req_id}.` }] };
      }

      const updated = existing.filter(r => r !== req_id);
      kbDb.prepare("UPDATE kb_entries SET related_reqs = ? WHERE kb_id = ?")
        .run(JSON.stringify(updated), kb_id);

      logAudit(user.name, "KB_UNLINKED_MCP", `Unlinked ${kb_id} ↛ ${req_id} (via MCP)`);

      return {
        content: [{ type: "text", text: `✓ Unlinked ${kb_id} from ${req_id}.` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: get_coverage_summary
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_coverage_summary",
    "Get a summary of requirement test coverage: which requirements have test cases, which are untested, and overall coverage percentage.",
    {},
    async () => {
      const reqs = getReqDb().prepare("SELECT * FROM requirements ORDER BY rowid").all();
      // Exclude seeded baseline TCs from coverage stats — they have no linked
      // requirements anyway, but excluding here keeps total_test_cases honest.
      const tcs = getTcDb().prepare("SELECT * FROM test_cases WHERE is_seeded = 0 OR is_seeded IS NULL ORDER BY rowid").all();

      const coverage = reqs.map(r => {
        const linked = tcs.filter(tc =>
          JSON.parse(tc.linked_req_ids || "[]").includes(r.req_id)
        );
        return {
          req_id: r.req_id,
          title: r.title,
          priority: r.priority,
          test_case_count: linked.length,
          reviewed: linked.filter(tc => tc.status === "Reviewed").length,
          drafts: linked.filter(tc => tc.status === "Draft").length,
          covered: linked.length > 0,
        };
      });

      const coveredCount = coverage.filter(c => c.covered).length;
      const pct = reqs.length > 0 ? Math.round((coveredCount / reqs.length) * 100) : 0;

      const summary = {
        coverage_percent: pct,
        covered_requirements: coveredCount,
        total_requirements: reqs.length,
        untested_requirements: coverage.filter(c => !c.covered).map(c => c.req_id),
        total_test_cases: tcs.length,
        reviewed_test_cases: tcs.filter(tc => tc.status === "Reviewed").length,
        draft_test_cases: tcs.filter(tc => tc.status === "Draft").length,
        by_requirement: coverage,
      };

      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  return server;
}

// ─── EXPRESS ROUTE MOUNTING ─────────────────────────────────────────────────

function mountMcpRoutes(app) {

  app.get("/mcp/sse", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { user: mcpUser, reason, username } = validateToken(token);

    if (!mcpUser) {
      const messages = {
        missing: "No MCP token provided. Generate one in TestForge → Settings → MCP Setup.",
        invalid: "MCP token not recognized. It may have been revoked or the database was rebuilt.",
        inactive_user: `Account "${username}" is not active. Complete the password setup flow or contact an Admin.`,
      };
      return res.status(401).json({
        error: messages[reason] || "Authentication failed.",
        reason,
        help: "Generate a token in TestForge → Settings → MCP Tokens.",
      });
    }

    try {
      // Disable timeouts — SSE connections must stay open indefinitely
      req.setTimeout(0);
      res.setTimeout(0);

      // Prevent proxy buffering (Caddy, Nginx, Azure load balancers)
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Cache-Control", "no-cache, no-transform");

      await ensureMcpImports();
      const server = await createMcpServer(mcpUser);
      const transport = new _SSEServerTransport("/mcp/messages", res);

      // SSE keepalive — send a comment every 25s to prevent connection drops
      const keepalive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(": keepalive\n\n");
        } else {
          clearInterval(keepalive);
        }
      }, 25000);

      activeSessions.set(transport.sessionId, { transport, server, user: mcpUser });

      res.on("close", () => {
        clearInterval(keepalive);
        activeSessions.delete(transport.sessionId);
        logAudit(mcpUser.name, "MCP_DISCONNECTED", `MCP session ended`);
      });

      await server.connect(transport);
      logAudit(mcpUser.name, "MCP_CONNECTED", `MCP session started from ${req.ip}`);
    } catch (err) {
      console.error("MCP SSE connection error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to establish MCP connection" });
      }
    }
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(400).json({ error: "Invalid or expired MCP session." });
    }

    try {
      await session.transport.handlePostMessage(req, res);
    } catch (err) {
      console.error("MCP message error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process MCP message" });
      }
    }
  });

  app.get("/api/mcp/tokens", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });

    const tokens = getDb().prepare(`
      SELECT id, name, substr(token, 1, 10) || '...' as token_preview,
             created_at, last_used
      FROM mcp_tokens WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.session.userId);

    res.json(tokens);
  });

  app.post("/api/mcp/tokens", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Token name is required" });

    // Check that the user's account is Active before allowing token creation
    const db = getDb();
    const user = db.prepare("SELECT status FROM users WHERE id = ?").get(req.session.userId);
    if (!user || user.status !== "Active") {
      return res.status(403).json({
        error: "Your account is not active. Complete password setup before creating MCP tokens.",
      });
    }

    const token = generateMcpToken();
    db.prepare(
      "INSERT INTO mcp_tokens (token, user_id, name) VALUES (?, ?, ?)"
    ).run(token, req.session.userId, name);

    logAudit(req.session.name, "MCP_TOKEN_CREATED", `Created MCP token "${name}"`);
    res.json({ token, name });
  });

  app.delete("/api/mcp/tokens/:id", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    const db = getDb();
    const existing = db.prepare(
      "SELECT * FROM mcp_tokens WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.session.userId);

    if (!existing) return res.status(404).json({ error: "Token not found" });

    db.prepare("DELETE FROM mcp_tokens WHERE id = ?").run(req.params.id);
    logAudit(req.session.name, "MCP_TOKEN_DELETED", `Deleted MCP token "${existing.name}"`);
    res.json({ ok: true });
  });

  // ─── GET /api/mcp/tokens/all — Admin: list ALL tokens across users ─────

  app.get("/api/mcp/tokens/all", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    if (req.session.role !== "Admin") return res.status(403).json({ error: "Requires role: Admin" });

    const tokens = getDb().prepare(`
      SELECT t.id, t.name, substr(t.token, 1, 10) || '...' as token_preview,
             t.created_at, t.last_used,
             u.id as user_id, u.name as user_name, u.username, u.role as user_role, u.status as user_status
      FROM mcp_tokens t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `).all();

    res.json(tokens);
  });


  // ─── DELETE /api/mcp/tokens/:id/admin — Admin: revoke ANY token ────────

  app.delete("/api/mcp/tokens/:id/admin", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    if (req.session.role !== "Admin") return res.status(403).json({ error: "Requires role: Admin" });

    const db = getDb();
    const existing = db.prepare(`
      SELECT t.*, u.name as user_name
      FROM mcp_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!existing) return res.status(404).json({ error: "Token not found" });

    db.prepare("DELETE FROM mcp_tokens WHERE id = ?").run(req.params.id);
    logAudit(
      req.session.name,
      "MCP_TOKEN_REVOKED_ADMIN",
      `Admin revoked MCP token "${existing.name}" belonging to ${existing.user_name}`
    );
    res.json({ ok: true });
  });

  // ─── POST /api/mcp/tokens/verify — Test if a token can authenticate ─────
  // Used by the wizard's connection test step. Runs the same validateToken
  // logic the SSE endpoint uses, without establishing an MCP session.

  app.post("/api/mcp/tokens/verify", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });

    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    const { user, reason, username } = validateToken(token);

    if (user) {
      return res.json({
        ok: true,
        message: `Token authenticated successfully as ${user.name} (${user.role}).`,
        user: { name: user.name, username: user.username, role: user.role },
      });
    }

    const messages = {
      missing: "No token provided.",
      invalid: "Token not recognized. It may have been revoked or the database was rebuilt after creation.",
      inactive_user: `Account "${username}" is not active. Complete the password setup flow or contact an Admin.`,
    };

    res.json({
      ok: false,
      reason,
      message: messages[reason] || "Authentication failed.",
    });
  });

  console.log("  ◈ MCP server mounted at /mcp/sse");
}

module.exports = { mountMcpRoutes, generateMcpToken, validateToken };