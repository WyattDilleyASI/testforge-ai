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
  generateTestCases: (reqId, depth, focuses) => request("/testcases/generate", { method: "POST", body: { reqId, depth, focuses } }),
  updateTcStatus: (tcId, status) => request(`/testcases/${tcId}/status`, { method: "PUT", body: { status } }),
  getPrompt: (reqId, depth, focuses) => {
    const params = new URLSearchParams({ reqId, depth: depth || "standard" });
    if (focuses && focuses.length > 0) params.set("focuses", focuses.join(","));
    return request(`/testcases/prompt?${params}`);
  },
  importTestCases: (reqId, depth, tcs) => request("/testcases/import", { method: "POST", body: { reqId, depth, tcs } }),
  refineTestCase: (tcId, feedback) => request(`/testcases/${tcId}/refine`, { method: "POST", body: { feedback } }),
  refinePrompt: (tcId, feedback) => request(`/testcases/${tcId}/refine-prompt`, { method: "POST", body: { feedback } }),
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

  // Knowledge Base
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
  deleteKbEntries: (kbIds) => request("/kb", { method: "DELETE", body: { kbIds } }),

  // Product Context
  getProductContext: () => request("/product-context"),
  updateProductContext: (data) => request("/product-context", { method: "PUT", body: data }),

  // Example Test Case
  getExampleTc: () => request("/example-tc"),
  setExampleTc: (tc_id) => request("/example-tc", { method: "PUT", body: { tc_id } }),
  clearExampleTc: () => request("/example-tc", { method: "PUT", body: {} }),

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

  // MCP Settings
  getMcpSettings: () => request("/mcp/settings"),
  createMcpServer: (data) => request("/mcp/settings", { method: "POST", body: data }),
  updateMcpServer: (id, data) => request(`/mcp/settings/${id}`, { method: "PUT", body: data }),
  deleteMcpServer: (id) => request(`/mcp/settings/${id}`, { method: "DELETE" }),
  testMcpServer: (id) => request(`/mcp/settings/${id}/test`, { method: "POST" }),
  toggleMcpServer: (id) => request(`/mcp/settings/${id}/toggle`, { method: "PUT" }),
};
