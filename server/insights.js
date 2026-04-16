const { getReqDb, getTcDb, getKbDb, getInsightCache, setInsightCache, logTokenUsage } = require("./db");

async function computeCoverageGaps() {
  // 1. All requirements
  const allReqs = getReqDb()
    .prepare("SELECT req_id, title, priority, tags FROM requirements ORDER BY rowid")
    .all();

  // 2. Set of req_ids that already have at least one test case
  const coveredReqIds = new Set(
    getTcDb()
      .prepare("SELECT linked_req_ids FROM test_cases")
      .all()
      .flatMap(row => {
        try { return JSON.parse(row.linked_req_ids || "[]"); } catch { return []; }
      })
  );

  // 3. Untested requirements
  const untestedReqs = allReqs.filter(r => !coveredReqIds.has(r.req_id));

  // 4. All KB entries (only the columns needed for matching)
  const allKbRows = getKbDb()
    .prepare("SELECT tags, related_reqs FROM kb_entries")
    .all();

  // 5. Count KB matches per untested requirement (same logic as /api/kb/matched/:reqId)
  function countMatchingKb(req) {
    const reqTags = (() => { try { return JSON.parse(req.tags || "[]"); } catch { return []; } })();
    return allKbRows.filter(kb => {
      const kbTags = (() => { try { return JSON.parse(kb.tags || "[]"); } catch { return []; } })();
      const kbRelReqs = (() => { try { return JSON.parse(kb.related_reqs || "[]"); } catch { return []; } })();
      return kbTags.some(t => reqTags.includes(t)) || kbRelReqs.includes(req.req_id);
    }).length;
  }

  // 6. Sort by KB match count desc (reqs with KB context float to top), take top 5
  const gaps = untestedReqs
    .map(r => ({ req_id: r.req_id, title: r.title, priority: r.priority, kb_match_count: countMatchingKb(r) }))
    .sort((a, b) => b.kb_match_count - a.kb_match_count)
    .slice(0, 5);

  // 7. Claude summary (skip if no API key or no gaps)
  let summary = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && gaps.length > 0) {
    try {
      const userContent = `The following requirements have NO test cases but have the most matching Knowledge Base context, making them the most "ready to test". Provide a brief insight for the QA team about what to prioritize and why.\n\nTop coverage gaps (sorted by KB context richness):\n${gaps.map((g, i) => `${i + 1}. [${g.req_id}] ${g.title} (priority: ${g.priority || "—"}, KB matches: ${g.kb_match_count})`).join("\n")}\n\nSummary (2-3 sentences, plain prose, no markdown):`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
          max_tokens: 200,
          system: "You are a QA assistant summarizing test coverage gaps for a software team. Be concise and practical. Write 2-3 sentences maximum. Plain prose only, no bullet points or markdown.",
          messages: [{ role: "user", content: userContent }],
        }),
      });

      const data = await res.json();
      if (data.content?.[0]?.text) {
        summary = data.content[0].text.trim();
        logTokenUsage("system:insights", null,
          data.usage?.input_tokens || 0,
          data.usage?.output_tokens || 0);
      }
    } catch (err) {
      console.error("[Insights] Claude summary failed:", err.message);
    }
  }

  return {
    gaps,
    summary,
    generated_at: new Date().toISOString(),
    total_untested: untestedReqs.length,
    total_requirements: allReqs.length,
  };
}

async function getOrComputeInsight({ force = false } = {}) {
  const todayKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (!force) {
    const cached = getInsightCache(todayKey);
    if (cached) return { ...cached, from_cache: true };
  }
  const payload = await computeCoverageGaps();
  setInsightCache(todayKey, payload);
  return { ...payload, from_cache: false };
}

module.exports = { computeCoverageGaps, getOrComputeInsight };
