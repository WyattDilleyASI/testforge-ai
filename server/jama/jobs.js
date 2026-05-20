// ═══════════════════════════════════════════════════════════════════════════
// Jama import job orchestration
// ═══════════════════════════════════════════════════════════════════════════
//
// One function — runImportJob() — drives a single import end-to-end:
//
//   create JamaSession → signIn → openProject → clickSidebarFilter →
//   runExportReport → waitForReportInHistory → downloadReport →
//   ingestJamaDocBuffer → finish (success or failure) → dispose session
//
// The orchestrator updates the jama_import_jobs row at every status
// transition. The route layer pokes the row (or streams via SSE) to
// surface progress to the frontend.
//
// Fire-and-forget shape: the HTTP route creates a job row, calls
// runImportJob() without awaiting, and returns the job id. The function
// catches everything internally — errors become a 'failed' row, not an
// unhandled promise rejection.
//
// Browser context + downloaded .docx are torn down in the finally block
// regardless of outcome — no persistent state after a job completes.

const fs = require("fs");
const path = require("path");
const { getCoreDb } = require("../db");
const { JamaSession } = require("./browser");
const navigate = require("./navigate");
const { ingestJamaDocBuffer } = require("./ingest");
const { JamaError, ExportFailed } = require("./errors");

// Where failure screenshots get saved. One file per job, overwritten on
// each retry/run. Living under data/ means it's part of the existing
// volume mount, accessible via the same path Testforge already persists.
const DEBUG_DIR = path.join(
  process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"),
  "jama-debug"
);
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
}
function screenshotPathFor(jobId) {
  return path.join(DEBUG_DIR, `job-${jobId}.png`);
}

// ─── Job lifecycle helpers ────────────────────────────────────────────────

// Create a new queued job row, return its id.
function createJob({ profileId, userId }) {
  const db = getCoreDb();
  const result = db.prepare(`
    INSERT INTO jama_import_jobs (profile_id, user_id, status, log_json)
    VALUES (?, ?, 'queued', '[]')
  `).run(profileId, userId);
  return result.lastInsertRowid;
}

// Read a job's full state for polling/SSE. Returns null if not found.
function getJob(jobId) {
  const db = getCoreDb();
  const row = db.prepare("SELECT * FROM jama_import_jobs WHERE id = ?").get(jobId);
  if (!row) return null;
  return {
    ...row,
    log: JSON.parse(row.log_json),
    imported_req_ids: row.imported_req_ids_json
      ? JSON.parse(row.imported_req_ids_json)
      : [],
  };
}

// ─── Per-job logger ───────────────────────────────────────────────────────
//
// Wraps the DB writes for status + log entries. All log appends use
// json_insert with the '$[#]' append-token so multiple in-flight writes
// for the same job (status writer + nested onLog calls) don't clobber
// each other via read-modify-write races.

class JobLogger {
  constructor(jobId) {
    this.jobId = jobId;
    this.db = getCoreDb();
  }

  log(level, message) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
    });
    // Atomic append at $[#]
    this.db.prepare(
      "UPDATE jama_import_jobs SET log_json = json_insert(log_json, '$[#]', json(?)) WHERE id = ?"
    ).run(entry, this.jobId);
  }

  setStatus(status, statusMessage = null) {
    if (statusMessage) this.log("info", statusMessage);
    this.db.prepare(
      "UPDATE jama_import_jobs SET status = ?, status_message = ? WHERE id = ?"
    ).run(status, statusMessage, this.jobId);
  }

  finishOk({ inserted, updated, insertedReqIds }) {
    this.db.prepare(`
      UPDATE jama_import_jobs SET
        status = 'done',
        imported_count = ?,
        updated_count = ?,
        imported_req_ids_json = ?,
        finished_at = datetime('now')
      WHERE id = ?
    `).run(inserted, updated, JSON.stringify(insertedReqIds), this.jobId);
  }

  finishFailed(errorMessage) {
    this.db.prepare(`
      UPDATE jama_import_jobs SET
        status = 'failed',
        error_message = ?,
        finished_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, this.jobId);
  }
}

// ─── Navigation + export with one-shot retry ──────────────────────────────

// Runs the deterministic part of an import: open project, click filter,
// open Export dialog, configure, click Run. If Jama's "Export failed"
// toast appears (surfaced by runExportReport as ExportFailed), reload the
// page once and try the whole sequence again. A second failure
// propagates — that's a "something is genuinely wrong" signal.
//
// Returns the ISO timestamp captured at the moment of clicking Run, used
// to match our row in the Reports History table.
async function runExportWithRetry(session, profile, log) {
  if (!profile.project_url) {
    throw new Error(
      `Profile "${profile.name}" was created before the URL field existed. ` +
      `Delete and recreate it using the current "+ New profile" flow.`
    );
  }
  const attempt = async () => {
    await navigate.openProject(session, profile.project_url);
    await navigate.clickSidebarFilter(session, profile.filter_name);
    return await navigate.runExportReport(session);
  };

  try {
    return await attempt();
  } catch (e) {
    if (!(e instanceof ExportFailed)) throw e;
    log.log(
      "warn",
      "Jama reported 'Export failed'. Reloading the page and retrying once..."
    );
    await session.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    return await attempt(); // throws if it fails again
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────

/**
 * Run an import job to completion. Called by the route layer in
 * fire-and-forget mode — never throws to the caller; all failure paths
 * land in a 'failed' DB row.
 *
 * @param {object} args
 * @param {number}  args.jobId      Pre-created jama_import_jobs.id
 * @param {object}  args.profile    Row from jama_profiles
 * @param {string}  args.username   Jama credentials (transient; discarded
 * @param {string}  args.password   immediately after signIn)
 * @param {string}  args.baseUrl    Jama base URL (https://<tenant>.jamacloud.com)
 */
async function runImportJob({ jobId, profile, username, password, baseUrl }) {
  const log = new JobLogger(jobId);
  let session = null;
  let downloadPath = null;

  try {
    log.setStatus("authenticating", "Signing in to Jama...");
    session = await JamaSession.create({
      baseUrl,
      onLog: (level, message) => log.log(level, message),
    });
    await session.signIn(username, password);
    // Wipe creds out of the closure ASAP. Best-effort — JS strings are
    // immutable, but dropping our references lets the GC reclaim them.
    username = null;
    password = null;

    log.setStatus("navigating", `Opening project ${profile.project_label}...`);

    // Navigation + export, with one auto-retry after a page reload if
    // Jama's "Export failed" toast appears. We retry exactly once: if
    // the second attempt also fails, the error propagates up so users
    // know something is genuinely wrong and can investigate (or just
    // try the whole import again).
    const submittedAt = await runExportWithRetry(session, profile, log);

    log.setStatus(
      "waiting_for_report",
      "Waiting for Jama to finish generating the report..."
    );
    const matcher = {
      projectLabel: profile.project_label,
      filterName: profile.filter_name,
      submittedAt,
    };
    const rowHandle = await navigate.waitForReportInHistory(session, matcher);

    log.setStatus("downloading", "Downloading report...");
    downloadPath = await navigate.downloadReport(session, rowHandle);

    log.setStatus("ingesting", "Importing requirements into Testforge...");
    const buffer = fs.readFileSync(downloadPath);
    const result = ingestJamaDocBuffer(buffer);

    log.log(
      "info",
      `Done. ${result.inserted} new, ${result.updated} refreshed, ` +
      `${result.linked.length} auto-linked test case(s).`
    );
    log.finishOk({
      inserted: result.inserted,
      updated: result.updated,
      insertedReqIds: result.insertedReqIds,
    });
  } catch (e) {
    // Map our typed errors to user-visible messages; everything else falls
    // through as the raw error message (which gets shown verbatim in the
    // UI — fine for an internal tool, swap to a generic "internal error"
    // string if this ever ships externally).
    const userMessage =
      e instanceof JamaError ? e.message : `Unexpected error: ${e.message}`;
    log.log("error", userMessage);

    // Capture a screenshot of the failing page for diagnosis. Best-effort:
    // session/page might already be torn down, the page might be in a
    // weird state — none of those should mask the original error.
    //
    // SECURITY: skip the screenshot if the failure occurred during the
    // 'authenticating' phase. At that point the page is still on Jama's
    // login form with the username field visible (and potentially a
    // half-typed password — masked but still in the DOM). The screenshot
    // would be readable by the job owner and Admin/QA Manager, but
    // surfacing the login UI in any stored artifact is more attack
    // surface than we need for a typically-unhelpful screenshot.
    if (session && !session._disposed) {
      const currentJob = getJob(jobId);
      const inAuthPhase = currentJob && currentJob.status === "authenticating";
      if (inAuthPhase) {
        log.log(
          "info",
          "Skipping failure screenshot — failure occurred during authentication (sensitive page state)."
        );
      } else {
        try {
          ensureDebugDir();
          const outPath = screenshotPathFor(jobId);
          await session.page.screenshot({ path: outPath, fullPage: true });
          log.log("info", `Saved failure screenshot to ${outPath}`);
        } catch (shotErr) {
          log.log("warn", `Could not capture failure screenshot: ${shotErr.message}`);
        }
      }
    }

    log.finishFailed(userMessage);
  } finally {
    if (session) await session.dispose();
    if (downloadPath) {
      try { fs.unlinkSync(downloadPath); } catch (_) {}
    }
  }
}

// ─── Undo support ─────────────────────────────────────────────────────────

/**
 * Roll back the inserts from a successful import job. Deletes only the
 * req_ids that were NEWLY inserted by this job — does not touch existing
 * requirements that were merely refreshed (their pre-update values are
 * gone and we can't reconstruct them).
 *
 * Rejects with an error if any of the imported req_ids are now linked
 * from one or more test cases — that link work would be lost on delete,
 * and users should remove those links first.
 *
 * @returns {{ deleted: number, blockedReqIds: string[] }}
 */
function rollbackImportJob(jobId) {
  const { getReqDb, getTcDb } = require("../db");
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== "done") {
    throw new Error(`Job ${jobId} is not in a state that can be rolled back (status=${job.status})`);
  }
  const insertedReqIds = job.imported_req_ids;
  if (insertedReqIds.length === 0) {
    return { deleted: 0, blockedReqIds: [] };
  }

  const reqDb = getReqDb();
  const tcDb = getTcDb();

  // Block rollback if any TCs are now linked to these req_ids
  const linkedTCs = tcDb.prepare(
    "SELECT tc_id, linked_req_ids FROM test_cases WHERE linked_req_ids != '[]'"
  ).all();
  const blocked = new Set();
  for (const tc of linkedTCs) {
    const ids = JSON.parse(tc.linked_req_ids || "[]");
    for (const reqId of ids) {
      if (insertedReqIds.includes(reqId)) blocked.add(reqId);
    }
  }
  if (blocked.size > 0) {
    return { deleted: 0, blockedReqIds: Array.from(blocked) };
  }

  // Safe to delete
  const stmt = reqDb.prepare("DELETE FROM requirements WHERE req_id = ?");
  let deleted = 0;
  for (const reqId of insertedReqIds) {
    const r = stmt.run(reqId);
    deleted += r.changes;
  }
  return { deleted, blockedReqIds: [] };
}

module.exports = {
  createJob,
  getJob,
  runImportJob,
  rollbackImportJob,
};
