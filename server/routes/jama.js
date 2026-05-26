// ═══════════════════════════════════════════════════════════════════════════
// /api/jama — Browser-driven Jama import
// ═══════════════════════════════════════════════════════════════════════════
//
// Routes split into four groups:
//
//   Profiles CRUD                  GET    /profiles
//                                  POST   /profiles            (Admin/QA Manager)
//                                  PUT    /profiles/:id        (Admin/QA Manager)
//                                  DELETE /profiles/:id        (Admin/QA Manager)
//
//   Discovery (live Jama lookup)   POST   /discover/projects   (Admin/QA Manager)
//                                  POST   /discover/filters    (Admin/QA Manager)
//                                  These spin up a temporary browser session,
//                                  sign in, read the requested list, dispose.
//
//   Imports                        POST   /profiles/:id/import (any authed user)
//                                  GET    /imports/:id         (status snapshot)
//                                  GET    /imports/:id/stream  (SSE live log)
//
//   Undo                           POST   /imports/:id/rollback (Admin/QA Manager)
//
// All routes that talk to Jama require credentials in the request body —
// they are never stored, only held in memory long enough to run the
// operation (re-auth-every-time policy).

const express = require("express");
const fs = require("fs");
const path = require("path");
const { getCoreDb, getSetting, setSetting, logAudit } = require("../db");
const { requireAuth, requireRole } = require("../auth");
const { JamaSession } = require("../jama/browser");
const { discoverProjectByUrl, scrapeProjectTree } = require("../jama/navigate");
const {
  createTreeJob,
  getTreeJob,
  runTreeScrapeJob,
  createExportTreeJob,
  getExportTreeJob,
  runExportTreeScrapeJob,
} = require("../jama/tree-jobs");
const {
  createJob,
  getJob,
  runImportJob,
  rollbackImportJob,
} = require("../jama/jobs");
const {
  createExportRun,
  getExportRun,
  runExportJob,
} = require("../jama/export-jobs");

const router = express.Router();

// Role guard for profile CRUD + discovery + rollback
const requireManager = requireRole("Admin", "QA Manager");

// Autonomous Solutions' Jama tenant. Single-tenant deployment, so hardcoded
// here as the default. Admins can still override via PUT /settings/base-url
// if they ever need to point at a different instance (e.g. for testing).
const DEFAULT_JAMA_BASE_URL = "https://autonomoussolutions.jamacloud.com";

// ─── Helpers ──────────────────────────────────────────────────────────────

function readBaseUrlOr400(res) {
  // Falls back to the hardcoded ASI tenant URL if no override is set.
  // Single-tenant deployment makes this safe; the setting still lets
  // admins point at a different instance for testing.
  const baseUrl = getSetting("jama_base_url") || DEFAULT_JAMA_BASE_URL;
  return baseUrl;
}

function readCredsOr400(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({
      error: "username and password are required",
      code: "JAMA_CREDS_MISSING",
    });
    return null;
  }
  return { username, password };
}

function profileById(id) {
  return getCoreDb()
    .prepare("SELECT * FROM jama_profiles WHERE id = ?")
    .get(id);
}

function exportProfileById(id) {
  return getCoreDb()
    .prepare("SELECT * FROM jama_export_profiles WHERE id = ?")
    .get(id);
}

// Map a JamaError to a JSON error response.
function errorResponse(res, e, fallbackStatus = 500) {
  const code = e.code || "JAMA_ERROR";
  // 4xx for things the user can fix; 5xx for our problems.
  const status =
    code === "JAMA_LOGIN_FAILED" ? 401 :
    code === "JAMA_PROFILE_NOT_FOUND" ? 404 :
    code === "JAMA_REPORT_TIMEOUT" || code === "JAMA_EXPORT_CONFIG_ERROR" ? 502 :
    fallbackStatus;
  res.status(status).json({ error: e.message, code });
}

// ─── Base URL setting ─────────────────────────────────────────────────────

// GET /api/jama/settings/base-url
// Returns the effective Jama URL (saved override OR the hardcoded default).
// Always returns a non-empty string now that we ship a default for the
// ASI tenant — the frontend's "Jama URL not configured" banner therefore
// never shows in practice.
router.get("/settings/base-url", requireAuth, (req, res) => {
  res.json({ base_url: getSetting("jama_base_url") || DEFAULT_JAMA_BASE_URL });
});

// PUT /api/jama/settings/base-url
// Admin only — this is a tenant-wide setting and shouldn't be changed
// casually. (QA Manager intentionally not included; this is a deployment
// config decision, not a workflow one.)
router.put("/settings/base-url", requireRole("Admin"), (req, res) => {
  const raw = (req.body && req.body.base_url) || "";
  if (!/^https?:\/\/.+/i.test(raw)) {
    return res.status(400).json({
      error: "base_url must be a full URL, e.g. https://your-tenant.jamacloud.com",
    });
  }
  // Strip trailing slash for path-join consistency.
  const cleaned = raw.replace(/\/+$/, "");
  setSetting("jama_base_url", cleaned);
  logAudit(req.session.name, "JAMA_BASE_URL_SET", `Set jama_base_url to ${cleaned}`);
  res.json({ ok: true, base_url: cleaned });
});

// ─── Project tree (for TC export destination picker) ─────────────────────

// POST /api/jama/profiles/:id/refresh-tree
// Body: { username, password }
// Kicks off a background tree-scrape job and returns the job_id
// immediately. Frontend polls /tree-jobs/:id or subscribes via
// /tree-jobs/:id/stream for live progress.
router.post("/profiles/:id/refresh-tree", requireManager, (req, res) => {
  const baseUrl = readBaseUrlOr400(res); if (!baseUrl) return;
  const creds = readCredsOr400(req, res); if (!creds) return;

  const profile = profileById(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  if (!profile.project_url) {
    return res.status(400).json({ error: "Profile has no project_url — recreate it from the current 'New profile' flow." });
  }

  const jobId = createTreeJob({ profileId: profile.id, userId: req.session.userId });
  logAudit(
    req.session.name,
    "JAMA_TREE_SCRAPE_STARTED",
    `Job ${jobId} for profile "${profile.name}" (project ${profile.project_label})`
  );

  // Fire and forget — orchestrator catches all errors and writes them
  // to the job row. The .catch is paranoia for exceptions that escape
  // the inner try.
  runTreeScrapeJob({
    jobId,
    profile,
    userId: req.session.userId,
    username: creds.username,
    password: creds.password,
    baseUrl,
  }).catch((e) => {
    console.error(`runTreeScrapeJob ${jobId} escaped:`, e);
  });

  res.status(202).json({ job_id: jobId });
});

// GET /api/jama/tree-jobs/:id
// One-shot status snapshot.
router.get("/tree-jobs/:id", requireAuth, (req, res) => {
  const job = getTreeJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

// GET /api/jama/tree-jobs/:id/stream
// Server-Sent Events stream — same shape as the import-job SSE.
router.get("/tree-jobs/:id/stream", requireAuth, (req, res) => {
  const jobId = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let lastLogLength = 0;
  let lastStatus = null;
  let done = false;

  const tick = () => {
    if (done) return;
    const job = getTreeJob(jobId);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Job not found" })}\n\n`);
      finish();
      return;
    }
    if (job.log.length > lastLogLength) {
      for (const entry of job.log.slice(lastLogLength)) {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      }
      lastLogLength = job.log.length;
    }
    if (job.status !== lastStatus) {
      res.write(`event: status\ndata: ${JSON.stringify({
        status: job.status,
        status_message: job.status_message,
        node_count: job.node_count,
        error_message: job.error_message,
      })}\n\n`);
      lastStatus = job.status;
    }
    if (job.status === "done" || job.status === "failed") finish();
  };
  const finish = () => {
    done = true;
    clearInterval(interval);
    try { res.end(); } catch (_) {}
  };
  const interval = setInterval(tick, 1000);
  tick();
  req.on("close", finish);
});

// GET /api/jama/profiles/:id/tree
// Returns the cached tree for this profile's project, or 404 if not yet
// scraped. Any authed user can read.
router.get("/profiles/:id/tree", requireAuth, (req, res) => {
  const profile = profileById(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: "Profile not found" });

  const row = getCoreDb()
    .prepare("SELECT tree_json, node_count, scraped_at FROM jama_project_trees WHERE project_id = ?")
    .get(profile.project_id);
  if (!row) {
    return res.status(404).json({
      error: "No cached tree for this project yet. Ask an Admin/QA Manager to run 'Refresh project tree'.",
      code: "JAMA_TREE_NOT_CACHED",
    });
  }

  let tree;
  try { tree = JSON.parse(row.tree_json); }
  catch (_) { return res.status(500).json({ error: "Cached tree is corrupted; refresh it." }); }

  res.json({
    tree,
    node_count: row.node_count,
    scraped_at: row.scraped_at,
  });
});

// ─── Profiles CRUD ────────────────────────────────────────────────────────

// GET /api/jama/profiles
router.get("/profiles", requireAuth, (req, res) => {
  const rows = getCoreDb().prepare(`
    SELECT p.*,
           (SELECT MAX(started_at) FROM jama_import_jobs j
              WHERE j.profile_id = p.id AND j.status = 'done') AS last_imported_at
      FROM jama_profiles p
     ORDER BY p.name
  `).all();
  res.json({ profiles: rows });
});

// POST /api/jama/profiles
// Body: { name, project_id, project_url, project_label, filter_name }
router.post("/profiles", requireManager, (req, res) => {
  const { name, project_id, project_url, project_label, filter_name } = req.body || {};
  if (!name || !project_id || !project_url || !project_label || !filter_name) {
    return res.status(400).json({
      error: "name, project_id, project_url, project_label, and filter_name are required",
    });
  }
  try {
    const result = getCoreDb().prepare(`
      INSERT INTO jama_profiles (name, project_id, project_url, project_label, filter_name, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, Number(project_id), project_url, project_label, filter_name, req.session.userId);
    const profile = profileById(result.lastInsertRowid);
    logAudit(req.session.name, "JAMA_PROFILE_CREATED",
      `Profile "${name}" (project ${project_label}, filter ${filter_name})`);
    res.status(201).json({ profile });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: `A profile named "${name}" already exists` });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/jama/profiles/:id
// Body: any subset of { name, project_id, project_label, filter_name }
router.put("/profiles/:id", requireManager, (req, res) => {
  const id = Number(req.params.id);
  const existing = profileById(id);
  if (!existing) return res.status(404).json({ error: "Profile not found" });

  const fields = {};
  for (const k of ["name", "project_id", "project_url", "project_label", "filter_name"]) {
    if (k in req.body) fields[k] = req.body[k];
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  try {
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(", ");
    const params = [...Object.values(fields), id];
    getCoreDb().prepare(
      `UPDATE jama_profiles SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
    ).run(...params);
    const profile = profileById(id);
    logAudit(req.session.name, "JAMA_PROFILE_UPDATED", `Profile #${id} (${existing.name})`);
    res.json({ profile });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: `A profile with that name already exists` });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/jama/profiles/:id
// Cascade-deletes any import jobs that reference this profile too —
// otherwise the FK constraint blocks the delete for any profile that's
// been used. Job history for deleted profiles isn't useful in practice;
// the imported requirements themselves are unaffected.
router.delete("/profiles/:id", requireManager, (req, res) => {
  const id = Number(req.params.id);
  const existing = profileById(id);
  if (!existing) return res.status(404).json({ error: "Profile not found" });

  const db = getCoreDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM jama_import_jobs WHERE profile_id = ?").run(id);
    db.prepare("DELETE FROM jama_profiles WHERE id = ?").run(id);
  });
  tx();

  logAudit(req.session.name, "JAMA_PROFILE_DELETED", `Profile "${existing.name}" (and its job history)`);
  res.json({ ok: true });
});

// ─── Discovery ────────────────────────────────────────────────────────────

// POST /api/jama/discover/project-by-url
// Body: { username, password, project_url }
// Used during profile creation: user pastes a Jama project URL, server
// signs in, opens the project, scrapes the project_label from page title,
// returns { project_id, project_label }.
//
// Replaces the older /discover/projects + /discover/filters scrape flow,
// which was unreliable because the Jama project list DOM didn't match
// what codegen captured for individual project clicks.
router.post("/discover/project-by-url", requireManager, async (req, res) => {
  const baseUrl = readBaseUrlOr400(res); if (!baseUrl) return;
  const creds = readCredsOr400(req, res); if (!creds) return;
  const { project_url } = req.body || {};
  if (!project_url) {
    return res.status(400).json({ error: "project_url is required" });
  }

  let session;
  try {
    session = await JamaSession.create({ baseUrl });
    await session.signIn(creds.username, creds.password);
    const result = await discoverProjectByUrl(session, project_url);
    res.json(result);
  } catch (e) {
    errorResponse(res, e);
  } finally {
    if (session) await session.dispose();
  }
});

// ─── Imports ──────────────────────────────────────────────────────────────

// POST /api/jama/profiles/:id/import
// Body: { username, password }
// Fires the import in the background, returns { job_id } immediately.
router.post("/profiles/:id/import", requireAuth, (req, res) => {
  const baseUrl = readBaseUrlOr400(res); if (!baseUrl) return;
  const creds = readCredsOr400(req, res); if (!creds) return;

  const profileId = Number(req.params.id);
  const profile = profileById(profileId);
  if (!profile) return res.status(404).json({ error: "Profile not found" });

  const jobId = createJob({ profileId, userId: req.session.userId });
  logAudit(
    req.session.name,
    "JAMA_IMPORT_STARTED",
    `Job ${jobId} for profile "${profile.name}"`
  );

  // Fire and forget — runImportJob catches all errors internally and
  // writes them to the job row. The .catch here is paranoia for an
  // exception that escapes the inner try/catch.
  runImportJob({
    jobId,
    profile,
    username: creds.username,
    password: creds.password,
    baseUrl,
  }).catch((e) => {
    console.error(`runImportJob ${jobId} escaped:`, e);
  });

  res.status(202).json({ job_id: jobId });
});

// GET /api/jama/imports/:id
// One-shot status read. For live updates the frontend should use /stream.
router.get("/imports/:id", requireAuth, (req, res) => {
  const job = getJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

// GET /api/jama/imports/:id/stream
// Server-Sent Events: pushes log entries + status transitions as they
// land in the DB. Polls the row every 1s; closes on terminal state.
router.get("/imports/:id/stream", requireAuth, (req, res) => {
  const jobId = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
  res.flushHeaders?.();

  let lastLogLength = 0;
  let lastStatus = null;
  let done = false;

  const tick = () => {
    if (done) return;
    const job = getJob(jobId);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Job not found" })}\n\n`);
      finish();
      return;
    }

    // New log entries
    if (job.log.length > lastLogLength) {
      for (const entry of job.log.slice(lastLogLength)) {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      }
      lastLogLength = job.log.length;
    }

    // Status changes (and the initial state)
    if (job.status !== lastStatus) {
      res.write(`event: status\ndata: ${JSON.stringify({
        status: job.status,
        status_message: job.status_message,
        imported_count: job.imported_count,
        updated_count: job.updated_count,
        error_message: job.error_message,
        imported_req_ids: job.imported_req_ids,
      })}\n\n`);
      lastStatus = job.status;
    }

    if (job.status === "done" || job.status === "failed") {
      finish();
    }
  };

  const finish = () => {
    done = true;
    clearInterval(interval);
    try { res.end(); } catch (_) {}
  };

  const interval = setInterval(tick, 1000);
  tick(); // immediate first tick so client gets initial state
  req.on("close", finish);
});

// GET /api/jama/imports/:id/screenshot
// Returns the PNG screenshot captured when a job failed (if any).
// Restricted to the user who ran the job, or Admin/QA Manager.
router.get("/imports/:id/screenshot", requireAuth, (req, res) => {
  const jobId = Number(req.params.id);
  const job = getCoreDb().prepare("SELECT user_id FROM jama_import_jobs WHERE id = ?").get(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const isOwner = job.user_id === req.session.userId;
  const isManager = req.session.role === "Admin" || req.session.role === "QA Manager";
  if (!isOwner && !isManager) {
    return res.status(403).json({ error: "Not your job" });
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
  const filePath = path.join(dataDir, "jama-debug", `job-${jobId}.png`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "No screenshot captured for this job" });
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="job-${jobId}-failure.png"`);
  fs.createReadStream(filePath).pipe(res);
});

// ─── Undo ─────────────────────────────────────────────────────────────────

// POST /api/jama/imports/:id/rollback
// Deletes the newly-inserted requirements from this job. Refused if any
// of those req_ids are now linked from test cases.
router.post("/imports/:id/rollback", requireManager, (req, res) => {
  const jobId = Number(req.params.id);
  try {
    const result = rollbackImportJob(jobId);
    if (result.blockedReqIds.length > 0) {
      return res.status(409).json({
        error: "Some requirements are linked from test cases. Remove those links first.",
        blockedReqIds: result.blockedReqIds,
      });
    }
    logAudit(
      req.session.name,
      "JAMA_IMPORT_ROLLED_BACK",
      `Job ${jobId} — deleted ${result.deleted} requirement(s)`
    );
    res.json({ ok: true, deleted: result.deleted });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Export profiles (test-case → Jama)
// ═══════════════════════════════════════════════════════════════════════════
//
// Parallel of the import-profile routes above, but:
//   - keyed off jama_export_profiles instead of jama_profiles
//   - no filter_name (TC export doesn't run a Jama report)
//   - tracks an optional default destination node inside the V&V subtree
//   - tree-scrape jobs live in jama_export_tree_scrape_jobs
//
// jama_project_trees is shared between import and export — both keyed on
// project_id — so the same Jama project's cached tree serves both sides.
// The "discover project by URL" endpoint is also shared (POST
// /discover/project-by-url above) since it has no profile-side state.

// ─── Export profiles CRUD ─────────────────────────────────────────────────

// GET /api/jama/export-profiles
router.get("/export-profiles", requireAuth, (req, res) => {
  const rows = getCoreDb().prepare(`
    SELECT p.*,
           t.scraped_at  AS tree_scraped_at,
           t.node_count  AS tree_node_count
      FROM jama_export_profiles p
      LEFT JOIN jama_project_trees t ON t.project_id = p.project_id
     ORDER BY p.name
  `).all();
  res.json({ profiles: rows });
});

// POST /api/jama/export-profiles
// Body: { name, project_id, project_url, project_label,
//         default_destination_jama_id?, default_destination_name?,
//         import_mapping_name? }
router.post("/export-profiles", requireManager, (req, res) => {
  const {
    name, project_id, project_url, project_label,
    default_destination_jama_id, default_destination_name,
    import_mapping_name,
  } = req.body || {};
  if (!name || !project_id || !project_url || !project_label) {
    return res.status(400).json({
      error: "name, project_id, project_url, and project_label are required",
    });
  }
  try {
    const result = getCoreDb().prepare(`
      INSERT INTO jama_export_profiles (
        name, project_id, project_url, project_label,
        default_destination_jama_id, default_destination_name,
        import_mapping_name, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      Number(project_id),
      project_url,
      project_label,
      default_destination_jama_id || null,
      default_destination_name || null,
      (import_mapping_name || "Testforge Auto Import").trim(),
      req.session.userId,
    );
    const profile = exportProfileById(result.lastInsertRowid);
    logAudit(req.session.name, "JAMA_EXPORT_PROFILE_CREATED",
      `Export profile "${name}" (project ${project_label})`);
    res.status(201).json({ profile });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: `An export profile named "${name}" already exists` });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/jama/export-profiles/:id
// Body: any subset of writable fields.
router.put("/export-profiles/:id", requireManager, (req, res) => {
  const id = Number(req.params.id);
  const existing = exportProfileById(id);
  if (!existing) return res.status(404).json({ error: "Export profile not found" });

  const fields = {};
  for (const k of [
    "name", "project_id", "project_url", "project_label",
    "default_destination_jama_id", "default_destination_name",
    "import_mapping_name",
  ]) {
    if (k in req.body) fields[k] = req.body[k];
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  try {
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(", ");
    const params = [...Object.values(fields), id];
    getCoreDb().prepare(
      `UPDATE jama_export_profiles SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
    ).run(...params);
    const profile = exportProfileById(id);
    logAudit(req.session.name, "JAMA_EXPORT_PROFILE_UPDATED",
      `Export profile #${id} (${existing.name})`);
    res.json({ profile });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: `An export profile with that name already exists` });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/jama/export-profiles/:id
// Cascade-deletes any tree-scrape jobs that reference this profile, same
// reasoning as the import-side delete.
router.delete("/export-profiles/:id", requireManager, (req, res) => {
  const id = Number(req.params.id);
  const existing = exportProfileById(id);
  if (!existing) return res.status(404).json({ error: "Export profile not found" });

  const db = getCoreDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM jama_export_tree_scrape_jobs WHERE profile_id = ?").run(id);
    db.prepare("DELETE FROM jama_export_profiles WHERE id = ?").run(id);
  });
  tx();

  logAudit(req.session.name, "JAMA_EXPORT_PROFILE_DELETED",
    `Export profile "${existing.name}" (and its scrape history)`);
  res.json({ ok: true });
});

// ─── Export-side project tree (refresh + fetch) ───────────────────────────

// POST /api/jama/export-profiles/:id/refresh-tree
// Same shape as the import-side refresh-tree: kicks off a background
// scrape job and returns the job_id.
router.post("/export-profiles/:id/refresh-tree", requireManager, (req, res) => {
  const baseUrl = readBaseUrlOr400(res); if (!baseUrl) return;
  const creds = readCredsOr400(req, res); if (!creds) return;

  const profile = exportProfileById(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: "Export profile not found" });
  if (!profile.project_url) {
    return res.status(400).json({ error: "Export profile has no project_url — recreate it." });
  }

  const jobId = createExportTreeJob({ profileId: profile.id, userId: req.session.userId });
  logAudit(
    req.session.name,
    "JAMA_EXPORT_TREE_SCRAPE_STARTED",
    `Job ${jobId} for export profile "${profile.name}" (project ${profile.project_label})`
  );

  runExportTreeScrapeJob({
    jobId,
    profile,
    userId: req.session.userId,
    username: creds.username,
    password: creds.password,
    baseUrl,
  }).catch((e) => {
    console.error(`runExportTreeScrapeJob ${jobId} escaped:`, e);
  });

  res.status(202).json({ job_id: jobId });
});

// GET /api/jama/export-tree-jobs/:id
router.get("/export-tree-jobs/:id", requireAuth, (req, res) => {
  const job = getExportTreeJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

// GET /api/jama/export-tree-jobs/:id/stream
// Same SSE shape as the import-side tree-job stream.
router.get("/export-tree-jobs/:id/stream", requireAuth, (req, res) => {
  const jobId = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let lastLogLength = 0;
  let lastStatus = null;
  let done = false;

  const tick = () => {
    if (done) return;
    const job = getExportTreeJob(jobId);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Job not found" })}\n\n`);
      finish();
      return;
    }
    if (job.log.length > lastLogLength) {
      for (const entry of job.log.slice(lastLogLength)) {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      }
      lastLogLength = job.log.length;
    }
    if (job.status !== lastStatus) {
      res.write(`event: status\ndata: ${JSON.stringify({
        status: job.status,
        status_message: job.status_message,
        node_count: job.node_count,
        error_message: job.error_message,
      })}\n\n`);
      lastStatus = job.status;
    }
    if (job.status === "done" || job.status === "failed") finish();
  };
  const finish = () => {
    done = true;
    clearInterval(interval);
    try { res.end(); } catch (_) {}
  };
  const interval = setInterval(tick, 1000);
  tick();
  req.on("close", finish);
});

// GET /api/jama/export-profiles/:id/tree
// Returns the cached project tree for this export profile's project, or
// 404 if not yet scraped. Same payload shape as the import-side endpoint.
router.get("/export-profiles/:id/tree", requireAuth, (req, res) => {
  const profile = exportProfileById(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: "Export profile not found" });

  const row = getCoreDb()
    .prepare("SELECT tree_json, node_count, scraped_at FROM jama_project_trees WHERE project_id = ?")
    .get(profile.project_id);
  if (!row) {
    return res.status(404).json({
      error: "No cached tree for this project yet. Run 'Refresh project tree' first.",
      code: "JAMA_TREE_NOT_CACHED",
    });
  }

  let tree;
  try { tree = JSON.parse(row.tree_json); }
  catch (_) { return res.status(500).json({ error: "Cached tree is corrupted; refresh it." }); }

  res.json({
    tree,
    node_count: row.node_count,
    scraped_at: row.scraped_at,
  });
});

// ─── Export runs (test cases → Jama) ─────────────────────────────────────

// POST /api/jama/export-profiles/:id/run
// Body: { username, password, tc_ids: [string] }
// Kicks off the export in the background, returns { run_id } immediately.
// Any authenticated user can run an existing profile — same policy as
// running an import. The profile's default destination must already be
// set (the orchestrator hard-fails otherwise).
router.post("/export-profiles/:id/run", requireAuth, (req, res) => {
  const baseUrl = readBaseUrlOr400(res); if (!baseUrl) return;
  const creds = readCredsOr400(req, res); if (!creds) return;

  const exportProfile = exportProfileById(Number(req.params.id));
  if (!exportProfile) return res.status(404).json({ error: "Export profile not found" });
  if (!exportProfile.default_destination_jama_id) {
    return res.status(400).json({
      error: "This export profile has no default destination — open 'Configure Jama export' and pick one first.",
      code: "JAMA_EXPORT_NO_DESTINATION",
    });
  }

  const tcIds = Array.isArray(req.body?.tc_ids) ? req.body.tc_ids : [];
  if (tcIds.length === 0) {
    return res.status(400).json({ error: "tc_ids must be a non-empty array of test-case ids" });
  }

  const runId = createExportRun({
    exportProfile,
    userId: req.session.userId,
    tcIds,
  });
  logAudit(
    req.session.name,
    "JAMA_EXPORT_RUN_STARTED",
    `Run ${runId} for export profile "${exportProfile.name}" — ${tcIds.length} TC(s) → ${exportProfile.default_destination_name}`
  );

  // Fire and forget — runExportJob captures all errors internally and
  // writes them to the run row. The .catch is paranoia for anything
  // that escapes the inner try.
  runExportJob({
    runId,
    exportProfile,
    userId: req.session.userId,
    username: creds.username,
    password: creds.password,
    baseUrl,
    tcIds,
  }).catch((e) => {
    console.error(`runExportJob ${runId} escaped:`, e);
  });

  res.status(202).json({ run_id: runId });
});

// GET /api/jama/export-runs/:id
// One-shot status snapshot.
router.get("/export-runs/:id", requireAuth, (req, res) => {
  const run = getExportRun(Number(req.params.id));
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json({ run });
});

// GET /api/jama/export-runs/:id/screenshot
// Returns the PNG screenshot captured when an export run failed (if
// any). Same access policy as the import-side screenshot route:
// restricted to the user who ran the export, or Admin/QA Manager.
router.get("/export-runs/:id/screenshot", requireAuth, (req, res) => {
  const runId = Number(req.params.id);
  const run = getCoreDb().prepare("SELECT user_id FROM jama_export_runs WHERE id = ?").get(runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const isOwner = run.user_id === req.session.userId;
  const isManager = req.session.role === "Admin" || req.session.role === "QA Manager";
  if (!isOwner && !isManager) {
    return res.status(403).json({ error: "Not your run" });
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
  const filePath = path.join(dataDir, "jama-debug", `export-run-${runId}.png`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "No screenshot captured for this run" });
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="export-run-${runId}-failure.png"`);
  fs.createReadStream(filePath).pipe(res);
});

// GET /api/jama/export-runs/:id/stream
// SSE — same shape as the import job stream.
router.get("/export-runs/:id/stream", requireAuth, (req, res) => {
  const runId = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let lastLogLength = 0;
  let lastStatus = null;
  let done = false;

  const tick = () => {
    if (done) return;
    const run = getExportRun(runId);
    if (!run) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Run not found" })}\n\n`);
      finish();
      return;
    }
    if (run.log.length > lastLogLength) {
      for (const entry of run.log.slice(lastLogLength)) {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      }
      lastLogLength = run.log.length;
    }
    if (run.status !== lastStatus) {
      res.write(`event: status\ndata: ${JSON.stringify({
        status: run.status,
        status_message: run.status_message,
        total_count: run.total_count,
        created_count: run.created_count,
        updated_count: run.updated_count,
        failed_tc_id: run.failed_tc_id,
        error_message: run.error_message,
      })}\n\n`);
      lastStatus = run.status;
    }
    if (run.status === "done" || run.status === "failed") finish();
  };
  const finish = () => {
    done = true;
    clearInterval(interval);
    try { res.end(); } catch (_) {}
  };
  const interval = setInterval(tick, 1000);
  tick();
  req.on("close", finish);
});

module.exports = router;
