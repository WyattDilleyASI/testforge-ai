// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — API client
// ═══════════════════════════════════════════════════════════════════════════
//
// Wraps the 13 routes mounted under /api/kb/seeding. Exports a single
// `seedingApi` object that components import directly:
//
//   import { seedingApi } from "../api-seeding";
//   const job = await seedingApi.getJob("SEED-001");
//
// Kept separate from the main api.js to keep the seeding feature
// self-contained — drop the file in, import where needed, no edits
// to existing API surface.

const BASE = "/api/kb/seeding";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function multipartRequest(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ─── Exported API ───────────────────────────────────────────────────────────

export const seedingApi = {
  // ─── Job management ──────────────────────────────────────────────────────

  // POST /jobs  (multipart, async — returns 202 immediately)
  // params: { content?: string, files?: File[], defaultSubsectionId?: string }
  async createJob({ content, files, defaultSubsectionId } = {}) {
    const formData = new FormData();
    if (content && content.trim()) formData.append("content", content);
    if (defaultSubsectionId) {
      formData.append("default_subsection_id", defaultSubsectionId);
    }
    for (const file of files || []) {
      formData.append("files", file, file.name);
    }
    return multipartRequest("/jobs", formData);
  },

  // GET /jobs
  listJobs({ status, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/jobs${qs ? "?" + qs : ""}`);
  },

  // GET /jobs/:jobId
  getJob(jobId) {
    return request(`/jobs/${encodeURIComponent(jobId)}`);
  },

  // POST /jobs/:jobId/xref
  rerunXref(jobId) {
    return request(`/jobs/${encodeURIComponent(jobId)}/xref`, {
      method: "POST",
    });
  },

  // POST /jobs/:jobId/finalize
  finalizeJob(jobId) {
    return request(`/jobs/${encodeURIComponent(jobId)}/finalize`, {
      method: "POST",
    });
  },

  // DELETE /jobs/:jobId
  deleteJob(jobId) {
    return request(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  },

  // ─── Candidate operations ────────────────────────────────────────────────

  // GET /jobs/:jobId/candidates
  listCandidates(jobId, { status, limit = 200, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    const qs = params.toString();
    return request(
      `/jobs/${encodeURIComponent(jobId)}/candidates${qs ? "?" + qs : ""}`
    );
  },

  // GET /candidates/:candId
  getCandidate(candId) {
    return request(`/candidates/${encodeURIComponent(candId)}`);
  },

  // PATCH /candidates/:candId
  // updates: { title?, type?, content?, suggested_tags?, subsection_id?, pinned?, related_reqs? }
  updateCandidate(candId, updates) {
    return request(`/candidates/${encodeURIComponent(candId)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  // POST /candidates/:candId/accept
  acceptCandidate(candId) {
    return request(`/candidates/${encodeURIComponent(candId)}/accept`, {
      method: "POST",
    });
  },

  // POST /candidates/:candId/reject
  rejectCandidate(candId) {
    return request(`/candidates/${encodeURIComponent(candId)}/reject`, {
      method: "POST",
    });
  },

  // POST /candidates/bulk-accept
  bulkAccept(candidateIds) {
    return request(`/candidates/bulk-accept`, {
      method: "POST",
      body: JSON.stringify({ candidate_ids: candidateIds }),
    });
  },

  // POST /candidates/bulk-reject
  bulkReject(candidateIds) {
    return request(`/candidates/bulk-reject`, {
      method: "POST",
      body: JSON.stringify({ candidate_ids: candidateIds }),
    });
  },
};

// ─── Type code legend ───────────────────────────────────────────────────────
//
// Exported helper for components that need to display the 3-letter codes
// consistently. Until the Help/Glossary page is built, this is the single
// source of truth for what each code means.

export const KB_TYPE_CODES = {
  "Defect History":         "DEF",
  "System Behavior":        "BEH",
  "Environment Constraint": "ENV",
  "Business Rule":          "RUL",
  "Test Data Guideline":    "DAT",
};

export const KB_TYPE_COLORS = {
  "Defect History":         { bg: "#FCEBEB", fg: "#791F1F" }, // red
  "System Behavior":        { bg: "#E6F1FB", fg: "#0C447C" }, // blue
  "Environment Constraint": { bg: "#FAEEDA", fg: "#633806" }, // amber
  "Business Rule":          { bg: "#EEEDFE", fg: "#3C3489" }, // purple
  "Test Data Guideline":    { bg: "#E1F5EE", fg: "#085041" }, // teal
};
