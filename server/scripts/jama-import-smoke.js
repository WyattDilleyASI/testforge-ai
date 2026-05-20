// ═══════════════════════════════════════════════════════════════════════════
// End-to-end smoke test for the Jama browser-driven import pipeline.
// ═══════════════════════════════════════════════════════════════════════════
//
// Runs the full backend directly (createJob → runImportJob) against a real
// Jama tenant without needing the frontend or HTTP server. Streams the
// job's log to stdout as it progresses, prints a summary at the end, and
// exits 0 on success, 1 on failure.
//
// ── Required env vars ────────────────────────────────────────────────────
//   JAMA_USERNAME    your Jama login
//   JAMA_PASSWORD    your Jama password
//
// ── Profile selection (pick ONE path) ────────────────────────────────────
//
// Path A: reuse an existing profile by id
//   PROFILE_ID=1
//
// Path B: auto-create a one-shot "smoke:..." profile from project/filter
//   PROJECT_ID=152
//   PROJECT_LABEL="Landscaping - Fairway Mowing 2.0"
//   FILTER_NAME="*All Requirement Types"
//
// ── Optional ─────────────────────────────────────────────────────────────
//   JAMA_BASE_URL    overrides app_settings.jama_base_url for this run.
//                    If neither is set, the script bails with a clear error.
//
// ── PowerShell example ───────────────────────────────────────────────────
//
//   $env:JAMA_USERNAME = "nate.wagstaff"
//   $env:JAMA_PASSWORD = "your-password"
//   $env:JAMA_BASE_URL = "https://autonomoussolutions.jamacloud.com"
//   $env:PROJECT_ID    = "152"
//   $env:PROJECT_LABEL = "Landscaping - Fairway Mowing 2.0"
//   $env:FILTER_NAME   = "*All Requirement Types"
//   node server/scripts/jama-import-smoke.js
//
// ── Notes ─────────────────────────────────────────────────────────────────
//
// • This writes to your real Testforge databases — newly imported reqs
//   land in data/requirements.db just like a production import would.
//   If you only want to dry-run, point DATA_DIR at a throwaway path:
//     $env:DATA_DIR = "C:\Temp\testforge-smoke-data"
//
// • The job row stays in data/core.db.jama_import_jobs after the script
//   exits — useful for inspecting the full log afterwards.

const { initialize, getCoreDb, getSetting, setSetting } = require("../db");
const { createJob, getJob, runImportJob } = require("../jama/jobs");

async function main() {
  const username = process.env.JAMA_USERNAME;
  const password = process.env.JAMA_PASSWORD;
  if (!username || !password) {
    bail("JAMA_USERNAME and JAMA_PASSWORD env vars are required.");
  }

  console.log("[smoke] initializing databases...");
  initialize();

  // Base URL: env var wins; otherwise fall back to app_settings;
  // otherwise the hardcoded ASI tenant URL (single-tenant deployment).
  if (process.env.JAMA_BASE_URL) {
    setSetting("jama_base_url", process.env.JAMA_BASE_URL);
  }
  const baseUrl = getSetting("jama_base_url") || "https://autonomoussolutions.jamacloud.com";
  console.log(`[smoke] Jama base URL: ${baseUrl}`);

  const profile = resolveProfile();
  console.log(
    `[smoke] using profile #${profile.id} "${profile.name}" — ` +
    `project ${profile.project_id} (${profile.project_label}), ` +
    `filter "${profile.filter_name}"`
  );

  const jobId = createJob({
    profileId: profile.id,
    userId: "smoke-script",
  });
  console.log(`[smoke] created job #${jobId}\n`);
  console.log("─".repeat(72));

  // Poll the DB in parallel with runImportJob. Prints new log entries +
  // status transitions as soon as they're written.
  let lastLogLen = 0;
  let lastStatus = null;
  const poll = () => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status !== lastStatus) {
      console.log(`\n▶ status: ${job.status}` + (job.status_message ? ` — ${job.status_message}` : ""));
      lastStatus = job.status;
    }
    if (job.log.length > lastLogLen) {
      for (const entry of job.log.slice(lastLogLen)) {
        const ts = entry.ts.replace("T", " ").replace(/\.\d+Z$/, "");
        const lvl = entry.level.toUpperCase().padEnd(5);
        console.log(`  [${lvl}] ${ts}  ${entry.message}`);
      }
      lastLogLen = job.log.length;
    }
  };
  const interval = setInterval(poll, 400);

  try {
    await runImportJob({ jobId, profile, username, password, baseUrl });
  } finally {
    // One last poll to flush any final log entries written between the
    // last tick and now, then stop polling.
    poll();
    clearInterval(interval);
  }

  console.log("\n" + "─".repeat(72));
  const final = getJob(jobId);
  console.log("[smoke] final status:    ", final.status);
  if (final.status === "done") {
    console.log("[smoke] inserted:        ", final.imported_count, "requirement(s)");
    console.log("[smoke] updated:         ", final.updated_count, "requirement(s)");
    if (final.imported_req_ids.length > 0) {
      const preview = final.imported_req_ids.slice(0, 5).join(", ");
      const more = final.imported_req_ids.length > 5
        ? ` (+${final.imported_req_ids.length - 5} more)`
        : "";
      console.log("[smoke] new req_ids:     ", preview + more);
    }
  } else {
    console.log("[smoke] error:           ", final.error_message);
  }
  console.log("[smoke] job row:          data/core.db → jama_import_jobs.id =", jobId);
  console.log("[smoke] total elapsed:    ",
    final.finished_at
      ? `${secondsBetween(final.started_at, final.finished_at)}s`
      : "(unfinished)"
  );

  process.exit(final.status === "done" ? 0 : 1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function bail(msg) {
  console.error("[smoke] FAIL —", msg);
  process.exit(1);
}

function resolveProfile() {
  const db = getCoreDb();

  if (process.env.PROFILE_ID) {
    const id = parseInt(process.env.PROFILE_ID, 10);
    const profile = db.prepare("SELECT * FROM jama_profiles WHERE id = ?").get(id);
    if (!profile) bail(`PROFILE_ID=${id} not found in jama_profiles`);
    return profile;
  }

  const projectId = parseInt(process.env.PROJECT_ID || "", 10);
  const projectLabel = process.env.PROJECT_LABEL;
  const filterName = process.env.FILTER_NAME;
  if (!projectId || !projectLabel || !filterName) {
    bail("Set PROFILE_ID, or all of PROJECT_ID + PROJECT_LABEL + FILTER_NAME.");
  }

  // Reuse a previous smoke profile if one already exists for this combo,
  // otherwise create one. The "smoke:" prefix marks them as throwaway.
  const name = `smoke:${projectId}:${filterName}`;
  let profile = db.prepare("SELECT * FROM jama_profiles WHERE name = ?").get(name);
  if (!profile) {
    const result = db.prepare(`
      INSERT INTO jama_profiles (name, project_id, project_label, filter_name, created_by_user_id)
      VALUES (?, ?, ?, ?, 'smoke-script')
    `).run(name, projectId, projectLabel, filterName);
    profile = db.prepare("SELECT * FROM jama_profiles WHERE id = ?").get(result.lastInsertRowid);
    console.log(`[smoke] created throwaway profile: ${name}`);
  }
  return profile;
}

function secondsBetween(startIso, endIso) {
  // SQLite's datetime('now') returns 'YYYY-MM-DD HH:MM:SS' (no T/Z) so
  // we have to be a little forgiving.
  const parse = (s) => Date.parse(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return Math.round((parse(endIso) - parse(startIso)) / 1000);
}

main().catch((e) => {
  console.error("\n[smoke] uncaught exception:", e);
  process.exit(1);
});
