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
const { discoverProjectByUrl } = require("../jama/navigate");
const {
  createJob,
  getJob,
  runImportJob,
  rollbackImportJob,
} = require("../jama/jobs");

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

module.exports = router;
