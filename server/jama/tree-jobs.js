// ═══════════════════════════════════════════════════════════════════════════
// Jama project-tree scrape orchestration (Layer 1 of TC export)
// ═══════════════════════════════════════════════════════════════════════════
//
// Mirrors the import-job pattern in jobs.js but for tree scrapes.
// Tree scraping can take several minutes for a large project (~hundreds
// of nodes through a virtualized list), so running it synchronously
// from the HTTP route leaves the user staring at a spinner with no
// feedback. This orchestrator runs scrapes in the background, persists
// progress to a job row, and lets the frontend stream live updates via
// SSE (same as imports).
//
// Two job tables share this orchestrator:
//   jama_tree_scrape_jobs         — keyed off jama_profiles (import)
//   jama_export_tree_scrape_jobs  — keyed off jama_export_profiles (export)
// Same status grid, same log shape; the table name is the only difference.

const { getCoreDb } = require("../db");
const { JamaSession } = require("./browser");
const { scrapeProjectTree } = require("./navigate");
const { JamaError } = require("./errors");

const IMPORT_TABLE = "jama_tree_scrape_jobs";
const EXPORT_TABLE = "jama_export_tree_scrape_jobs";

// ─── Job lifecycle (parameterized by table name) ──────────────────────────

function createTreeJobIn(table, { profileId, userId }) {
  const db = getCoreDb();
  const r = db.prepare(
    `INSERT INTO ${table} (profile_id, user_id, status, log_json)
     VALUES (?, ?, 'queued', '[]')`
  ).run(profileId, userId);
  return r.lastInsertRowid;
}

function getTreeJobFrom(table, jobId) {
  const row = getCoreDb()
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .get(jobId);
  if (!row) return null;
  return { ...row, log: JSON.parse(row.log_json) };
}

// Atomic-append logger (uses json_insert so concurrent SSE reads don't
// race the write). Same pattern as JobLogger in jobs.js.
class TreeJobLogger {
  constructor(table, jobId) {
    this.table = table;
    this.jobId = jobId;
    this.db = getCoreDb();
  }
  log(level, message) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
    });
    this.db.prepare(
      `UPDATE ${this.table} SET log_json = json_insert(log_json, '$[#]', json(?)) WHERE id = ?`
    ).run(entry, this.jobId);
  }
  setStatus(status, statusMessage = null) {
    if (statusMessage) this.log("info", statusMessage);
    this.db.prepare(
      `UPDATE ${this.table} SET status = ?, status_message = ? WHERE id = ?`
    ).run(status, statusMessage, this.jobId);
  }
  finishOk(nodeCount) {
    this.db.prepare(
      `UPDATE ${this.table} SET
         status = 'done',
         node_count = ?,
         finished_at = datetime('now')
       WHERE id = ?`
    ).run(nodeCount, this.jobId);
  }
  finishFailed(errorMessage) {
    this.db.prepare(
      `UPDATE ${this.table} SET
         status = 'failed',
         error_message = ?,
         finished_at = datetime('now')
       WHERE id = ?`
    ).run(errorMessage, this.jobId);
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────

async function runTreeScrapeJobIn(table, { jobId, profile, userId, username, password, baseUrl }) {
  const log = new TreeJobLogger(table, jobId);
  let session = null;

  try {
    log.setStatus("authenticating", "Signing in to Jama...");
    session = await JamaSession.create({
      baseUrl,
      onLog: (level, message) => log.log(level, message),
    });
    await session.signIn(username, password);
    username = null;
    password = null;

    log.setStatus("expanding", "Expanding tree nodes...");
    const { tree, nodeCount } = await scrapeProjectTree(session, profile.project_url);

    log.setStatus("saving", "Saving tree to database...");
    getCoreDb().prepare(`
      INSERT INTO jama_project_trees (project_id, tree_json, node_count, scraped_by_user_id, scraped_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project_id) DO UPDATE SET
        tree_json = excluded.tree_json,
        node_count = excluded.node_count,
        scraped_by_user_id = excluded.scraped_by_user_id,
        scraped_at = excluded.scraped_at
    `).run(profile.project_id, JSON.stringify(tree), nodeCount, userId);

    log.log("info", `Saved ${nodeCount} nodes to project ${profile.project_id}.`);
    log.finishOk(nodeCount);
  } catch (e) {
    const userMessage =
      e instanceof JamaError ? e.message : `Unexpected error: ${e.message}`;
    log.log("error", userMessage);
    log.finishFailed(userMessage);
  } finally {
    if (session) await session.dispose();
  }
}

// ─── Thin wrappers per profile type ───────────────────────────────────────

const createTreeJob       = (args) => createTreeJobIn(IMPORT_TABLE, args);
const getTreeJob          = (id)   => getTreeJobFrom(IMPORT_TABLE, id);
const runTreeScrapeJob    = (args) => runTreeScrapeJobIn(IMPORT_TABLE, args);

const createExportTreeJob    = (args) => createTreeJobIn(EXPORT_TABLE, args);
const getExportTreeJob       = (id)   => getTreeJobFrom(EXPORT_TABLE, id);
const runExportTreeScrapeJob = (args) => runTreeScrapeJobIn(EXPORT_TABLE, args);

module.exports = {
  createTreeJob,
  getTreeJob,
  runTreeScrapeJob,
  createExportTreeJob,
  getExportTreeJob,
  runExportTreeScrapeJob,
};
