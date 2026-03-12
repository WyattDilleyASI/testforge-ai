const express = require("express");
const { getDb } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

// POST /api/chat — conversational Claude chat with optional requirement context
router.post("/", requireAuth, async (req, res) => {
  const { messages, reqId } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "NO_API_KEY" });

  const db = getDb();

  let systemPrompt = `You are a senior QA engineer and testing expert embedded in TestForge AI, a test case management tool. Help the user think through test strategies, review test cases, analyze requirements, and answer QA questions. Be concise and practical.`;

  if (reqId) {
    const requirement = db.prepare("SELECT * FROM requirements WHERE req_id = ?").get(reqId);
    if (requirement) {
      const acceptanceCriteria = JSON.parse(requirement.acceptance_criteria || "[]");
      const allKb = db.prepare("SELECT * FROM kb_entries").all();
      const relevantKb = allKb.filter(kb => {
        const tags = JSON.parse(kb.tags || "[]");
        return tags.includes(reqId);
      });
      const linkedTcs = db.prepare("SELECT * FROM test_cases WHERE linked_req_ids LIKE ?").all(`%${reqId}%`);

      systemPrompt += `\n\nACTIVE REQUIREMENT CONTEXT:
- ID: ${requirement.req_id}
- Title: ${requirement.title}
- Description: ${requirement.description}
- Acceptance Criteria: ${acceptanceCriteria.join("; ")}
- Priority: ${requirement.priority}
${relevantKb.length > 0 ? `\nKNOWLEDGE BASE:\n${relevantKb.map(kb => `- [${kb.kb_id}] ${kb.title}: ${kb.content}`).join("\n")}` : ""}
${linkedTcs.length > 0 ? `\nEXISTING TEST CASES (${linkedTcs.length}):\n${linkedTcs.map(tc => `- ${tc.tc_id}: ${tc.title} [${tc.type}] [${tc.status}]`).join("\n")}` : ""}`;
    }
  }

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
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message || "Claude API error" });

    const text = data.content?.map(c => c.text || "").join("") || "";
    res.json({ response: text });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
