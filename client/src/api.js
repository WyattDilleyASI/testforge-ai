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
  generateTestCases: (reqId, depth) => request("/testcases/generate", { method: "POST", body: { reqId, depth } }),
  updateTcStatus: (tcId, status) => request(`/testcases/${tcId}/status`, { method: "PUT", body: { status } }),
  getPrompt: (reqId, depth) => request(`/testcases/prompt?reqId=${encodeURIComponent(reqId)}&depth=${encodeURIComponent(depth || "standard")}`),
  importTestCases: (reqId, depth, tcs) => request("/testcases/import", { method: "POST", body: { reqId, depth, tcs } }),
  clearTestCases: () => request("/testcases", { method: "DELETE" }),
  exportTestCasesXlsx: () => {
    const a = document.createElement("a");
    a.href = `${BASE}/testcases/export/xlsx`;
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
