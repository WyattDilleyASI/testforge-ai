// ═══════════════════════════════════════════════════════════════════════════
// Jama-compatible XLSX builder for test cases
// ═══════════════════════════════════════════════════════════════════════════
//
// Extracted from server/routes/testcases.js so both the download route
// (GET /api/testcases/export/xlsx) and the browser-driven Jama import
// orchestrator can build the same file shape.
//
// Output shape matches Jama's "Import Test Cases" wizard defaults:
//   - Worksheet name: "Test Cases"
//   - Header row at row 1
//   - One row per STEP (TC fields repeated; Step Number column distinguishes)
//   - Header names match Jama's Item Field labels so a single saved
//     "Testforge Auto Import" mapping covers every TC export
//
// Returns a Buffer. Callers decide whether to stream it as an HTTP
// response or save it to a temp file for Playwright file upload.

const XLSX = require("xlsx");
const { getTcDb, getReqDb } = require("../db");

const HEADERS = [
  "Name",
  "Description",
  "Setup",
  "Automation Tool",
  "Automated",
  "Step Number",
  "Step Action",
  "Step Expected Result",
  "Step Notes",
  "Priority",
  "Upstream Relationship",
];

const COL_WIDTHS = [
  { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 16 }, { wch: 10 },
  { wch: 10 }, { wch: 50 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 50 },
];

// Strip HTML tags + decode common entities so Excel cells hold plain text.
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

// Build a Jama-import-ready XLSX Buffer for the given TC ids. If
// `tcIds` is null/undefined, exports every non-seeded TC.
function buildJamaXlsxBuffer(tcIds = null) {
  const tcDb = getTcDb();
  let testCases;
  if (Array.isArray(tcIds) && tcIds.length > 0) {
    const placeholders = tcIds.map(() => "?").join(",");
    testCases = tcDb.prepare(
      `SELECT * FROM test_cases WHERE tc_id IN (${placeholders}) ORDER BY rowid`
    ).all(...tcIds);
  } else {
    // Exclude seeded baseline TCs from "export all" — they're internal
    // training content, not deliverable test cases.
    testCases = tcDb.prepare(
      "SELECT * FROM test_cases WHERE is_seeded = 0 OR is_seeded IS NULL ORDER BY rowid"
    ).all();
  }

  const requirements = getReqDb().prepare("SELECT * FROM requirements").all();
  const reqMap = {};
  for (const r of requirements) reqMap[r.req_id] = r;

  const rows = [HEADERS];

  for (const tc of testCases) {
    const steps = JSON.parse(tc.steps || "[]");
    const linkedReqIds = JSON.parse(tc.linked_req_ids || "[]");
    const priority = linkedReqIds.length > 0 && reqMap[linkedReqIds[0]]
      ? reqMap[linkedReqIds[0]].priority
      : "High";

    // Upstream relationship: "REQ-001 - Title; REQ-002 - Title"
    let upstreamText = "";
    if (linkedReqIds.length > 0) {
      upstreamText = linkedReqIds.map((id) => {
        const r = reqMap[id];
        return r && r.title ? `${id} - ${r.title}` : id;
      }).join("; ");
    } else {
      try {
        const ups = JSON.parse(tc.upstream_relationship || "[]");
        if (Array.isArray(ups) && ups.length > 0) {
          upstreamText = ups.map((u) => `${u.id} - ${u.name}`).join("; ");
        }
      } catch (_) { /* ignore */ }
    }

    // Description JSON → flattened text.
    const tlReqs = JSON.parse(tc.testlink_requirements || "[]");
    let descText = tc.description || "";
    try {
      const d = JSON.parse(tc.description || "");
      if (d && typeof d === "object") {
        const parts = [];
        if (d.objective) parts.push(`Objective:\n${d.objective}`);
        if (tlReqs.length > 0) {
          parts.push(`TestLink Requirements:\n${tlReqs.map((r) => `• ${r.doc_id}${r.title ? ` — ${r.title}` : ""}`).join("\n")}`);
        }
        if (d.scope?.length > 0) {
          parts.push(`Scope:\n${Array.isArray(d.scope) ? d.scope.join(", ") : d.scope}`);
        }
        if (d.assumptions?.length) {
          parts.push(`Assumptions:\n${d.assumptions.map((a) => `• ${a}`).join("\n")}`);
        }
        descText = parts.join("\n\n");
      }
    } catch (_) { /* ignore */ }

    // Setup JSON → flattened text.
    let setupText = tc.preconditions || "";
    try {
      const s = JSON.parse(tc.preconditions || "");
      if (s && typeof s === "object") {
        const parts = [];
        if (s.preconditions?.length) parts.push(`Preconditions:\n${s.preconditions.map((p) => `• ${p}`).join("\n")}`);
        if (s.environment?.length)   parts.push(`Environment:\n${s.environment.map((e) => `• ${e}`).join("\n")}`);
        if (s.equipment?.length)     parts.push(`Equipment:\n${s.equipment.map((e) => `• ${e}`).join("\n")}`);
        if (s.testData?.length)      parts.push(`Test Data:\n${s.testData.map((t) => `• ${t}`).join("\n")}`);
        setupText = parts.join("\n\n");
      }
    } catch (_) { /* ignore */ }

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
  ws["!cols"] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");

  return {
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
    testCaseCount: testCases.length,
    stepRowCount: rows.length - 1, // minus header
  };
}

module.exports = {
  buildJamaXlsxBuffer,
  HEADERS,
  stripHtmlForXlsx,
};
