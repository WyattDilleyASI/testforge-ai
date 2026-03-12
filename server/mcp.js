// server/mcp.js — MCP Server for TestForge AI
// ═══════════════════════════════════════════════════════════════════════════
// Turns TestForge into an MCP server so Claude Desktop / Code / Web can
// interact with requirements, test cases, and the knowledge base directly.
// Users authenticate via personal MCP tokens generated in TestForge's UI.
// No Anthropic API key is needed — Claude does the reasoning natively.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const { getDb, logAudit, nextKbId } = require("./db");

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
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT t.*, u.username, u.name, u.role, u.status
    FROM mcp_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.token = ?
  `).get(token);

  if (!row || row.status !== "Active") return null;

  db.prepare("UPDATE mcp_tokens SET last_used = datetime('now') WHERE token = ?").run(token);
  return { userId: row.user_id, username: row.username, name: row.name, role: row.role };
}

// ─── ACTIVE SESSION TRACKING ────────────────────────────────────────────────

const activeSessions = new Map();

// ─── MCP SERVER FACTORY ─────────────────────────────────────────────────────
// Creates a fresh MCP server instance per connection, scoped to the
// authenticated user. Each tool operates on TestForge's SQLite database.

async function createMcpServer(user) {
  await ensureMcpImports();
  const z = _z;

  const server = new _McpServer({
    name: "testforge-ai",
    version: "1.2.0",
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
      const db = getDb();
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
      const db = getDb();
      const req = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(req_id);
      if (!req) {
        return { content: [{ type: "text", text: `Requirement '${req_id}' not found.` }] };
      }

      // Related KB entries (tagged with this req_id)
      const allKb = db.prepare("SELECT * FROM kb_entries").all();
      const relatedKb = allKb.filter(kb => {
        const tags = JSON.parse(kb.tags || "[]");
        return tags.includes(req_id);
      });

      // Existing linked test cases
      const allTcs = db.prepare("SELECT tc_id, title, status, type, pass_fail_criteria FROM test_cases").all();
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
      const db = getDb();

      // Validate requirement exists
      const requirement = db.prepare("SELECT req_id FROM requirements WHERE req_id = ?").get(req_id);
      if (!requirement) {
        return { content: [{ type: "text", text: `Error: Requirement '${req_id}' not found. Cannot save test cases.` }] };
      }

      const currentCount = db.prepare("SELECT COUNT(*) as count FROM test_cases").get().count;
      const newTcIds = [];

      const insertStmt = db.prepare(`
        INSERT INTO test_cases
          (tc_id, title, linked_req_ids, preconditions, steps, pass_fail_criteria,
           type, depth, req_attribute, kb_references, status, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)
      `);

      const insertMany = db.transaction((tcs) => {
        for (const tc of tcs) {
          insertStmt.run(
            tc.tc_id, tc.title, tc.linked_req_ids, tc.preconditions,
            tc.steps, tc.pass_fail_criteria, tc.type, tc.depth,
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
          pass_fail_criteria: tc.passFailCriteria || "",
          type: tc.type,
          depth: depth || "standard",
          req_attribute: tc.reqAttribute || "",
          kb_references: JSON.stringify(tc.kbReferences || []),
          generated_by: `${user.name} (via MCP)`,
        };
      });

      insertMany(tcsToInsert);

      // Update KB usage counts
      const allRefs = [...new Set(test_cases.flatMap(tc => tc.kbReferences || []))];
      if (allRefs.length > 0) {
        const updateKb = db.prepare("UPDATE kb_entries SET usage_count = usage_count + 1 WHERE kb_id = ?");
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
      const db = getDb();
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
      const db = getDb();
      let rows = db.prepare("SELECT * FROM test_cases ORDER BY rowid").all();

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
        pass_fail_criteria: tc.pass_fail_criteria,
        req_attribute: tc.req_attribute,
        kb_references: JSON.parse(tc.kb_references || "[]"),
        generated_by: tc.generated_by,
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: search_knowledge_base
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "search_knowledge_base",
    "Search the knowledge base for entries relevant to a requirement, topic, or defect history. KB entries inform better test case generation.",
    {
      query: z.string().optional()
        .describe("Free-text search across titles and content"),
      req_id: z.string().optional()
        .describe("Find entries tagged with this requirement ID"),
      type: z.enum(["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline", "all"]).optional()
        .describe("Filter by entry type"),
    },
    async ({ query, req_id, type }) => {
      const db = getDb();
      let rows = db.prepare("SELECT * FROM kb_entries ORDER BY rowid").all();

      if (req_id) {
        rows = rows.filter(kb => JSON.parse(kb.tags || "[]").includes(req_id));
      }
      if (type && type !== "all") {
        rows = rows.filter(kb => kb.type === type);
      }
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(kb =>
          kb.title.toLowerCase().includes(q) || kb.content.toLowerCase().includes(q)
        );
      }

      const result = rows.map(kb => ({
        kb_id: kb.kb_id,
        title: kb.title,
        type: kb.type,
        content: kb.content,
        tags: JSON.parse(kb.tags || "[]"),
        usage_count: kb.usage_count,
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // TOOL: create_kb_entry
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "create_kb_entry",
    "Add a new knowledge base entry. KB entries capture defect history, system behaviors, business rules, and other context that improves future test case generation.",
    {
      title: z.string().describe("Concise entry title"),
      type: z.enum([
        "Defect History", "System Behavior", "Environment Constraint",
        "Business Rule", "Test Data Guideline",
      ]).describe("Category of knowledge"),
      content: z.string().describe("Detailed content of the entry"),
      tags: z.array(z.string()).optional()
        .describe("Requirement IDs to associate with this entry (e.g. ['RS-001', 'TC-003'])"),
    },
    async ({ title, type, content, tags }) => {
      const kbId = nextKbId();
      getDb().prepare(
        "INSERT INTO kb_entries (kb_id, title, type, content, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(kbId, title, type, content, JSON.stringify(tags || []), `${user.name} (via MCP)`);

      logAudit(user.name, "KB_CREATED_MCP", `Created KB entry ${kbId}: ${title} (via MCP)`);

      return {
        content: [{ type: "text", text: `✓ Created KB entry ${kbId}: "${title}" [${type}]` }],
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
      const db = getDb();
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
  // TOOL: get_coverage_summary
  // ════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_coverage_summary",
    "Get a summary of requirement test coverage: which requirements have test cases, which are untested, and overall coverage percentage.",
    {},
    async () => {
      const db = getDb();
      const reqs = db.prepare("SELECT * FROM requirements ORDER BY rowid").all();
      const tcs = db.prepare("SELECT * FROM test_cases ORDER BY rowid").all();

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
// Adds /mcp/sse and /mcp/messages to the Express app for MCP transport,
// plus /api/mcp/tokens/* for token management in the TestForge UI.

function mountMcpRoutes(app) {

  // ── SSE endpoint: Claude clients connect here ─────────────────────────

  app.get("/mcp/sse", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const mcpUser = validateToken(token);

    if (!mcpUser) {
      return res.status(401).json({
        error: "Invalid or missing MCP token.",
        help: "Generate a token in TestForge → Settings → MCP Tokens.",
      });
    }

    try {
      await ensureMcpImports();
      const server = await createMcpServer(mcpUser);
      const transport = new _SSEServerTransport("/mcp/messages", res);

      activeSessions.set(transport.sessionId, { transport, server, user: mcpUser });

      res.on("close", () => {
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

  // ── Message endpoint: receives JSON-RPC from Claude ───────────────────

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

  // ── Token management API (used by TestForge UI) ───────────────────────

  // List current user's tokens (masked)
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

  // Create a new token
  app.post("/api/mcp/tokens", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Token name is required" });

    const token = generateMcpToken();
    getDb().prepare(
      "INSERT INTO mcp_tokens (token, user_id, name) VALUES (?, ?, ?)"
    ).run(token, req.session.userId, name);

    logAudit(req.session.name, "MCP_TOKEN_CREATED", `Created MCP token "${name}"`);

    // Full token returned ONLY at creation time
    res.json({ token, name });
  });

  // Delete a token
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

  console.log("  ◈ MCP server mounted at /mcp/sse");
}

module.exports = { mountMcpRoutes, generateMcpToken, validateToken };
