// ═══════════════════════════════════════════════════════════════════════════
// Jama Browser Import — Schema & Migrations
// ═══════════════════════════════════════════════════════════════════════════
//
// Owns the two tables backing the browser-driven Jama import feature:
//   jama_profiles    — saved {project, filter} configs (admin-managed, shared)
//   jama_import_jobs — one row per attempted import, with status + log
//
// Called once from db.js initialize() via initializeJama(). Safe to call
// repeatedly — uses IF NOT EXISTS throughout.
//
// Both tables live in core.db, alongside other administrative/config data
// (mcp_settings, jama_export_log, audit_log).

const fs = require("fs");
const path = require("path");
const { getCoreDb } = require("../db");

// Pruning policy — applied on every server startup. Generous defaults
// since this is an internal tool, but tuned so the tables and the
// debug-screenshot directory don't grow unbounded over years of use.
const MAX_JOB_AGE_DAYS = 90;       // drop jobs older than this
const MAX_JOBS_PER_PROFILE = 50;   // keep only the N most recent jobs per profile

// Directory layout helpers (mirrors db.js logic).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const JAMA_DEBUG_DIR = path.join(DATA_DIR, "jama-debug");

function initializeJama() {
  const core = getCoreDb();

  // ── jama_profiles ────────────────────────────────────────────────
  // Saved import configurations. Admin + QA Manager can CRUD; any
  // authenticated user can run an existing profile. Names are globally
  // unique within the instance — profiles are a shared resource, not
  // per-user.
  //
  // project_id     — numeric Jama project id (e.g. 152), stable across
  //                  renames in Jama. Used in the navigation URL.
  // project_label  — human-readable name shown in the UI, captured at
  //                  profile-creation time. May drift from the live name
  //                  in Jama if the project is renamed; that's fine for
  //                  display but the import keys off project_id.
  // filter_name    — name of the sidebar filter (e.g. "*All Requirement
  //                  Types"), matched verbatim against the Jama sidebar
  //                  at import time.
  core.exec(`
    CREATE TABLE IF NOT EXISTS jama_profiles (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT    UNIQUE NOT NULL,
      project_id          INTEGER NOT NULL,
      project_url         TEXT,
      project_label       TEXT    NOT NULL,
      filter_name         TEXT    NOT NULL,
      created_by_user_id  TEXT    NOT NULL,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add project_url to existing installations. The bare
  // `/projects/<id>` URL renders blank in Jama — we need the full URL
  // with `/dashboard/<id>` to land on a view where the Filters sidebar
  // is wired up. Stored as the user-pasted URL verbatim.
  const profileCols = core.prepare("PRAGMA table_info(jama_profiles)").all().map(c => c.name);
  if (!profileCols.includes("project_url")) {
    core.exec("ALTER TABLE jama_profiles ADD COLUMN project_url TEXT");
  }

  // ── jama_import_jobs ─────────────────────────────────────────────
  // One row per import attempt. Lives for audit history even after the
  // browser session is torn down.
  //
  // Status transitions (forward-only):
  //   queued → authenticating → navigating → waiting_for_report →
  //   downloading → ingesting → done
  // Any state can transition to → failed (with error_message populated).
  //
  // log_json     — append-only array of {ts, level, message} entries.
  //                Written incrementally during the job; the SSE stream
  //                endpoint replays this to the frontend live log.
  //
  // imported_count / updated_count — populated when ingesting completes:
  //                imported_count = new req_ids inserted
  //                updated_count  = existing req_ids whose Jama-sourced
  //                                 fields were refreshed via upsert
  //
  // imported_req_ids_json — JSON array of req_ids that were newly
  //                inserted (not updated). Used by the Undo endpoint to
  //                know precisely which rows to delete on rollback.
  //                Updates are NOT rolled back — once a refresh has
  //                happened, the prior values are gone.
  //
  // user_id      — TEXT (USR-xxx), the user who ran this import. Used
  //                for audit, permission checks on Undo, and surfacing
  //                "last run by X" in the profile list UI.
  core.exec(`
    CREATE TABLE IF NOT EXISTS jama_import_jobs (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id            INTEGER NOT NULL REFERENCES jama_profiles(id),
      user_id               TEXT    NOT NULL,
      status                TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN (
                              'queued', 'authenticating', 'navigating',
                              'waiting_for_report', 'downloading',
                              'ingesting', 'done', 'failed'
                            )),
      status_message        TEXT,
      log_json              TEXT    NOT NULL DEFAULT '[]',
      imported_count        INTEGER,
      updated_count         INTEGER,
      imported_req_ids_json TEXT,
      error_message         TEXT,
      started_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at           TEXT
    );
  `);

  core.exec("CREATE INDEX IF NOT EXISTS idx_jama_jobs_profile ON jama_import_jobs(profile_id);");
  core.exec("CREATE INDEX IF NOT EXISTS idx_jama_jobs_user    ON jama_import_jobs(user_id);");
  core.exec("CREATE INDEX IF NOT EXISTS idx_jama_jobs_status  ON jama_import_jobs(status);");

  console.log("  ✓ Jama browser import tables initialized");

  // Prune old job history + orphan debug screenshots on every startup.
  pruneJamaHistory();
}

// ─────────────────────────────────────────────────────────────────────────
// Pruning — runs on every server startup to keep the jama_import_jobs
// table and the data/jama-debug/ screenshot directory from growing
// without bound.
//
//   1. Delete job rows older than MAX_JOB_AGE_DAYS
//   2. Within each profile, keep only the most recent MAX_JOBS_PER_PROFILE
//   3. Delete screenshot files whose corresponding job row no longer exists
//
// All steps are idempotent and safe to run on every boot. Errors during
// pruning are logged but never abort the server startup — the worst
// case is "we don't prune this time," not "the server won't start."
// ─────────────────────────────────────────────────────────────────────────
function pruneJamaHistory() {
  try {
    const core = getCoreDb();

    // 1. Age-based job pruning
    const aged = core.prepare(
      `DELETE FROM jama_import_jobs WHERE started_at < datetime('now', ?)`
    ).run(`-${MAX_JOB_AGE_DAYS} days`);

    // 2. Per-profile cap — keep only the N most recent jobs per profile.
    const profileIds = core.prepare("SELECT id FROM jama_profiles").all().map(r => r.id);
    let perProfile = 0;
    const perProfileStmt = core.prepare(`
      DELETE FROM jama_import_jobs
      WHERE profile_id = ?
        AND id NOT IN (
          SELECT id FROM jama_import_jobs
          WHERE profile_id = ?
          ORDER BY started_at DESC
          LIMIT ?
        )
    `);
    for (const pid of profileIds) {
      perProfile += perProfileStmt.run(pid, pid, MAX_JOBS_PER_PROFILE).changes;
    }

    // 3. Orphan-screenshot cleanup. After (1) and (2), any debug PNG
    //    whose job_id no longer exists in the table is unreferenced.
    let orphans = 0;
    if (fs.existsSync(JAMA_DEBUG_DIR)) {
      const liveJobIds = new Set(
        core.prepare("SELECT id FROM jama_import_jobs").all().map(r => String(r.id))
      );
      for (const file of fs.readdirSync(JAMA_DEBUG_DIR)) {
        const m = file.match(/^job-(\d+)\.png$/);
        if (!m) continue;
        if (liveJobIds.has(m[1])) continue;
        try {
          fs.unlinkSync(path.join(JAMA_DEBUG_DIR, file));
          orphans++;
        } catch (_) { /* keep going */ }
      }
    }

    const total = aged.changes + perProfile + orphans;
    if (total > 0) {
      console.log(
        `  ✓ Jama history pruned: ${aged.changes} aged, ${perProfile} excess, ${orphans} orphan screenshot(s)`
      );
    }
  } catch (e) {
    console.warn(`  ⚠ Jama history prune skipped: ${e.message}`);
  }
}

module.exports = { initializeJama, pruneJamaHistory };
