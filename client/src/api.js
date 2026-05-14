const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),
  changePassword: (userId, newPassword) => request("/auth/change-password", { method: "POST", body: { userId, newPassword } }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  // Users
  getUsers: () => request("/users"),
  createUser: (username, name, role) => request("/users", { method: "POST", body: { username, name, role } }),
  changeRole: (id, role) => request(`/users/${id}/role`, { method: "PUT", body: { role } }),
  changeStatus: (id) => request(`/users/${id}/status`, { method: "PUT" }),
  resetPassword: (id) => request(`/users/${id}/reset-password`, { method: "PUT" }),
  unlockUser: (id) => request(`/users/${id}/unlock`, { method: "PUT" }),

  // Requirements
  getRequirements: () => request("/requirements"),
  createRequirement: (data) => request("/requirements", { method: "POST", body: data }),
  updateRequirement: (reqId, data) => request(`/requirements/${reqId}`, { method: "PUT", body: data }),
  deleteRequirement: (reqId) => request(`/requirements/${reqId}`, { method: "DELETE" }),
  clearRequirements: () => request("/requirements", { method: "DELETE" }),
  importRequirementsDoc: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/requirements/import-doc`, { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  // Test Cases
  getTestCases: () => request("/testcases"),
  generateTestCases: (reqId, depth, focuses, kbEntryIds) => request("/testcases/generate", { method: "POST", body: { reqId, depth, focuses, kbEntryIds } }),
  updateTcStatus: (tcId, status, rejectionReason) => request(`/testcases/${tcId}/status`, { method: "PUT", body: { status, ...(rejectionReason && { rejectionReason }) } }),
  updateTestCase: (tcId, data) => request(`/testcases/${tcId}`, { method: "PUT", body: data }),
  getPrompt: (reqId, depth, focuses) => {
    const params = new URLSearchParams({ reqId, depth: depth || "standard" });
    if (focuses && focuses.length > 0) params.set("focuses", focuses.join(","));
    return request(`/testcases/prompt?${params}`);
  },
  importTestCases: (reqId, depth, tcs) => request("/testcases/import", { method: "POST", body: { reqId, depth, tcs } }),
  refineTestCase: (tcId, feedback) => request(`/testcases/${tcId}/refine`, { method: "POST", body: { feedback } }),
  refinePrompt: (tcId, feedback) => request(`/testcases/${tcId}/refine-prompt`, { method: "POST", body: { feedback } }),
  deleteTestCases: (ids) => request("/testcases/bulk", { method: "DELETE", body: { ids } }),
  discardTestCase: (tcId) => request("/testcases/bulk?discard=true", { method: "DELETE", body: { ids: [tcId] } }),
  discardTestCases: (ids) => request("/testcases/bulk?discard=true", { method: "DELETE", body: { ids } }),
  getPurgePreview: (tcId) => request(`/testcases/${tcId}/purge-preview`),
  clearTestCases: () => request("/testcases", { method: "DELETE" }),
  clearRejectedTestCases: () => request("/testcases/rejected", { method: "DELETE" }),
  exportTestCasesXlsx: (tcIds) => {
    const a = document.createElement("a");
    const params = tcIds && tcIds.length > 0 ? `?ids=${tcIds.join(",")}` : "";
    a.href = `${BASE}/testcases/export/xlsx${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
  importTestCasesDoc: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/testcases/import-doc`, { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  parseTestLinkXml: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/testcases/parse-xml`, { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  enhanceTestLinkTc: (testcase, kbEntryIds) => request("/testcases/enhance-xml-tc", { method: "POST", body: { testcase, kbEntryIds } }),
  importTestLinkConfirmed: (testcase, originalExternalId) => request("/testcases/import-xml-confirmed", { method: "POST", body: { testcase, originalExternalId } }),

  getMatchedKbEntries: (reqId) => request(`/kb/matched/${reqId}`),
  // Knowledge Base — Sections & Subsections
  getKbSections: () => request("/kb/sections"),
  createKbSection: (name) => request("/kb/sections", { method: "POST", body: { name } }),
  renameKbSection: (sectionId, name) => request(`/kb/sections/${sectionId}`, { method: "PUT", body: { name } }),
  deleteKbSection: (sectionId) => request(`/kb/sections/${sectionId}`, { method: "DELETE" }),
  createKbSubsection: (section_id, name, description) => request("/kb/subsections", { method: "POST", body: { section_id, name, description } }),
  renameKbSubsection: (subsectionId, name) => request(`/kb/subsections/${subsectionId}`, { method: "PUT", body: { name } }),
  updateKbSubsection: (subsectionId, data) => request(`/kb/subsections/${subsectionId}`, { method: "PUT", body: data }),
  deleteKbSubsection: (subsectionId) => request(`/kb/subsections/${subsectionId}`, { method: "DELETE" }),
  moveKbEntry: (kbId, subsection_id) => request(`/kb/${kbId}/move`, { method: "PUT", body: { subsection_id } }),

  // Knowledge Base — Entries
  exportKbJson: () => {
    const a = document.createElement("a");
    a.href = `${BASE}/kb/export`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
  importKbJson: async (file, mode) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    const res = await fetch(`${BASE}/kb/import`, { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  getKbEntries: () => request("/kb"),
  createKbEntry: (data) => request("/kb", { method: "POST", body: data }),
  uploadKbImages: async (kbId, files) => {
    const form = new FormData();
    for (const f of files) form.append("images", f);
    const res = await fetch(`${BASE}/kb/${kbId}/images`, { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  deleteKbImage: (kbId, index) => request(`/kb/${kbId}/images/${index}`, { method: "DELETE" }),
  updateImageDescription: (kbId, index, description) => request(`/kb/${kbId}/images/${index}/description`, { method: "PUT", body: { description } }),
  regenerateImageDescription: (kbId, index) => request(`/kb/${kbId}/images/${index}/describe`, { method: "POST" }),
  regenerateAllImageDescriptions: (kbId) => request(`/kb/${kbId}/images/describe-all`, { method: "POST" }),
  updateKbEntry: (kbId, data) => request(`/kb/${kbId}`, { method: "PUT", body: data }),
  pinKbEntry: (kbId) => request(`/kb/${kbId}/pin`, { method: "PUT" }),
  deleteKbEntries: (kbIds) => request("/kb", { method: "DELETE", body: { kbIds } }),
  clearAllKb: () => request("/kb/all", { method: "DELETE" }),
  migrateKbTagsToRelatedReqs: () => request("/kb/migrate-req-tags", { method: "POST" }),

  // Product Context
  getProductContext: () => request("/product-context"),
  updateProductContext: (data) => request("/product-context", { method: "PUT", body: data }),

  // Token Usage
  getTokenUsage: () => request("/usage/tokens"),

  // Audit (Admin only)
  getAuditLog: () => request("/audit"),

  // Jama
  getJamaLog: () => request("/jama/log"),
  exportToJama: () => request("/jama/export", { method: "POST" }),

  // MCP Tokens
  getMcpTokens: () => request("/mcp/tokens"),
  createMcpToken: (name) => request("/mcp/tokens", { method: "POST", body: { name } }),
  deleteMcpToken: (id) => request(`/mcp/tokens/${id}`, { method: "DELETE" }),

  // MCP Tokens — Admin oversight
  getAllMcpTokens: () => request("/mcp/tokens/all"),
  adminRevokeMcpToken: (id) => request(`/mcp/tokens/${id}/admin`, { method: "DELETE" }),
  verifyMcpToken: (token) => request("/mcp/tokens/verify", { method: "POST", body: { token } }),

  // MCP Settings
  getMcpSettings: () => request("/mcp/settings"),
  createMcpServer: (data) => request("/mcp/settings", { method: "POST", body: data }),
  updateMcpServer: (id, data) => request(`/mcp/settings/${id}`, { method: "PUT", body: data }),
  deleteMcpServer: (id) => request(`/mcp/settings/${id}`, { method: "DELETE" }),
  testMcpServer: (id) => request(`/mcp/settings/${id}/test`, { method: "POST" }),
  toggleMcpServer: (id) => request(`/mcp/settings/${id}/toggle`, { method: "PUT" }),

  // ── Adaptive Learning Engine ──
  // Dashboard (all auth users)
  getAnalyticsDashboard: () => request("/analytics/dashboard"),
  getAnalyticsSessions: (limit) => request(`/analytics/sessions${limit ? `?limit=${limit}` : ""}`),
  getAnalyticsHints: (reqId) => request(`/analytics/hints/${reqId}`),
  getRejectionReasons: () => request("/analytics/rejection-reasons"),
  getFeedbackStats: () => request("/analytics/feedback/stats"),

  // Rules (Admin + QA Manager)
  getAnalyticsRules: () => request("/analytics/rules"),
  getActiveRules: (scope) => request(`/analytics/rules/active${scope ? `?scope=${scope}` : ""}`),
  getRulesMetadata: () => request("/analytics/rules/metadata"),
  getRule: (ruleId) => request(`/analytics/rules/${ruleId}`),
  createRule: (data) => request("/analytics/rules", { method: "POST", body: data }),
  updateRule: (ruleId, data) => request(`/analytics/rules/${ruleId}`, { method: "PUT", body: data }),
  deleteRule: (ruleId) => request(`/analytics/rules/${ruleId}`, { method: "DELETE" }),

  // Exemplars (Admin + QA Manager)
  getExemplars: () => request("/analytics/exemplars"),
  addExemplar: (tcId, data) => request("/analytics/exemplars", { method: "POST", body: { tcId, ...data } }),
  removeExemplar: (tcId) => request(`/analytics/exemplars/${tcId}`, { method: "DELETE" }),

  // Maintenance (Admin only)
  getAnalyticsHealth: () => request("/analytics/health"),
  runMaintenance: (opts) => request("/analytics/maintenance", { method: "POST", body: opts || {} }),
  resetModelVersion: () => request("/analytics/model-reset", { method: "POST" }),
  runAggregation: (opts) => request("/analytics/aggregate", { method: "POST", body: opts || {} }),

  // KB Review (Phase 1+2) — counters + Claude-synthesized suggestions for KB content gaps
  getKbReviewCounters: () => request("/analytics/kb-review/counters"),
  getKbSuggestions: (status) => request(`/analytics/kb-review/suggestions${status ? `?status=${status}` : ""}`),
  getKbSuggestion: (id) => request(`/analytics/kb-review/suggestions/${id}`),
  runKbReviewSynthesis: () => request("/analytics/kb-review/synthesize", { method: "POST" }),
  approveKbSuggestion: (id, note) => request(`/analytics/kb-review/suggestions/${id}/approve`, { method: "POST", body: { note } }),
  rejectKbSuggestion: (id, note) => request(`/analytics/kb-review/suggestions/${id}/reject`, { method: "POST", body: { note } }),

  // Whiteboard (shared drawing)
  getWhiteboardStrokes: () => request("/whiteboard"),
  getWhiteboardCount: () => request("/whiteboard/count"),
  saveWhiteboardStroke: (stroke) => request("/whiteboard/stroke", { method: "POST", body: stroke }),
  clearWhiteboard: () => request("/whiteboard/clear", { method: "DELETE" }),

  // Insights
  getCoverageGapInsight: () => request("/insights/coverage-gaps"),
  refreshCoverageGapInsight: () => request("/insights/coverage-gaps/refresh", { method: "POST" }),

  // Moonlight (hidden feature)
  runMoonlightGame: (config) => request("/moonlight/run", { method: "POST", body: config }),
  // Lobby — Phase B multiplayer
  createMoonlightRoom: (name, hostName, config) =>
    request("/moonlight/rooms", { method: "POST", body: { name, hostName, config } }),
  getMoonlightRoom: (name) =>
    request(`/moonlight/rooms/${encodeURIComponent(name)}`),
  listMoonlightRooms: () => request("/moonlight/rooms"),
  joinMoonlightRoom: (name, playerName) =>
    request(`/moonlight/rooms/${encodeURIComponent(name)}/join`, { method: "POST", body: { playerName } }),
  startMoonlightRoom: (name, hostName) =>
    request(`/moonlight/rooms/${encodeURIComponent(name)}/start`, { method: "POST", body: { hostName } }),
  respondToMoonlight: (roomName, playerName, response) =>
    request(`/moonlight/rooms/${encodeURIComponent(roomName)}/respond`, { method: "POST", body: { playerName, response } }),
};
