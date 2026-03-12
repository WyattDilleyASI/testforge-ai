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

  // Test Cases
  getTestCases: () => request("/testcases"),
  generateTestCases: (reqId, depth) => request("/testcases/generate", { method: "POST", body: { reqId, depth } }),
  getGenerationPrompt: (reqId, depth) => request(`/testcases/prompt?reqId=${encodeURIComponent(reqId)}&depth=${encodeURIComponent(depth)}`),
  importTestCases: (reqId, depth, tcs) => request("/testcases/import", { method: "POST", body: { reqId, depth, tcs } }),
  updateTcStatus: (tcId, status) => request(`/testcases/${tcId}/status`, { method: "PUT", body: { status } }),

  // Knowledge Base
  getKbEntries: () => request("/kb"),
  createKbEntry: (data) => request("/kb", { method: "POST", body: data }),

  // Audit (Admin only)
  getAuditLog: () => request("/audit"),

  // Jama
  getJamaLog: () => request("/jama/log"),
  exportToJama: () => request("/jama/export", { method: "POST" }),
};
