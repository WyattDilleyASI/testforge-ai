// ═══════════════════════════════════════════════════════════════════════════
// Jama test-case export orchestration
// ═══════════════════════════════════════════════════════════════════════════
//
// Drives a single "Export to Jama" batch via Jama's XLSX Import Wizard:
//   1. Sign in via JamaSession
//   2. Open the export profile's project + drill the Explorer sidebar
//      down to the chosen Set node
//   3. Build a Jama-formatted XLSX of the selected test cases and write
//      it to a temp file
//   4. Right-click the Set → Import → upload XLSX → pick the saved
//      field mapping → walk wizard → submit
//   5. Read back "You have imported N items" from the wizard summary
//
// We pivoted from the per-TC new-item-form flow because Jama's step
// cells have a row-data binding we couldn't reach from the DOM — the
// XLSX import goes through Jama's official server-side import pipeline
// which handles steps correctly. See
//   memory/project_jama_step_export_dead_end.md
// for the dead-end notes.
//
// All progress (status transitions + log entries) is persisted to
// jama_export_runs so the frontend can subscribe via SSE.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { getCoreDb, getTcDb } = require("../db");
const { JamaSession } = require("./browser");
const {
  navigateToSetNode,
  importTestCasesXlsx,
} = require("./navigate-export");
const { buildJamaXlsxBuffer } = require("./build-xlsx");
const { JamaError } = require("./errors");

// Failure-screenshot config — mirrors the import side. One PNG per run,
// overwritten on rerun. Skipped during the 'authenticating' phase to
// avoid persisting the Jama login form with the username still visible.
const DEBUG_DIR = path.join(
  process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"),
  "jama-debug"
);
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
}
function screenshotPathForRun(runId) {
  return path.join(DEBUG_DIR, `export-run-${runId}.png`);
}

// ─── Run lifecycle ────────────────────────────────────────────────────────

function createExportRun({ exportProfile, userId, tcIds }) {
  const db = getCoreDb();
  const r = db.prepare(`
    INSERT INTO jama_export_runs (
      export_profile_id, user_id,
      destination_jama_id, destination_name,
      tc_ids_json, total_count, log_json
    ) VALUES (?, ?, ?, ?, ?, ?, '[]')
  `).run(
    exportProfile.id,
    userId,
    exportProfile.default_destination_jama_id,
    exportProfile.default_destination_name,
    JSON.stringify(tcIds),
    tcIds.length,
  );
  return r.lastInsertRowid;
}

function getExportRun(runId) {
  const row = getCoreDb()
    .prepare("SELECT * FROM jama_export_runs WHERE id = ?")
    .get(runId);
  if (!row) return null;
  return {
    ...row,
    log: JSON.parse(row.log_json),
    tc_ids: JSON.parse(row.tc_ids_json),
  };
}

class ExportRunLogger {
  constructor(runId) {
    this.runId = runId;
    this.db = getCoreDb();
  }
  log(level, message) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
    });
    this.db.prepare(
      "UPDATE jama_export_runs SET log_json = json_insert(log_json, '$[#]', json(?)) WHERE id = ?"
    ).run(entry, this.runId);
  }
  setStatus(status, statusMessage = null) {
    if (statusMessage) this.log("info", statusMessage);
    this.db.prepare(
      "UPDATE jama_export_runs SET status = ?, status_message = ? WHERE id = ?"
    ).run(status, statusMessage, this.runId);
  }
  incCounts({ created = 0, updated = 0 } = {}) {
    if (!created && !updated) return;
    this.db.prepare(`
      UPDATE jama_export_runs
         SET created_count = created_count + ?,
             updated_count = updated_count + ?
       WHERE id = ?
    `).run(created, updated, this.runId);
  }
  finishOk() {
    this.db.prepare(`
      UPDATE jama_export_runs
         SET status = 'done',
             finished_at = datetime('now')
       WHERE id = ?
    `).run(this.runId);
  }
  finishFailed(errorMessage, failedTcId) {
    this.db.prepare(`
      UPDATE jama_export_runs
         SET status = 'failed',
             error_message = ?,
             failed_tc_id = ?,
             finished_at = datetime('now')
       WHERE id = ?
    `).run(errorMessage, failedTcId, this.runId);
  }
}

// ─── TC row helpers ───────────────────────────────────────────────────────

// Mark a TC as having been pushed to Jama. Called after a successful
// import-wizard run. We can't stamp a per-TC jama_id because the bulk
// import doesn't surface individual Jama IDs in the wizard summary —
// just a count. Re-export idempotency comes from the saved Jama field
// mapping handling duplicates server-side, not our jama_id column.
function bumpExportedAt(tcId) {
  getTcDb().prepare(`
    UPDATE test_cases SET jama_exported_at = datetime('now') WHERE tc_id = ?
  `).run(tcId);
}

// Resolve the click path from the cached project tree to the destination
// Set. Returns an array of jama_ids from root (inclusive) to the
// destination (inclusive), or null if the destination isn't in the tree.
function resolveDestinationPath(projectId, destinationJamaId) {
  const row = getCoreDb()
    .prepare("SELECT tree_json FROM jama_project_trees WHERE project_id = ?")
    .get(projectId);
  if (!row) return null;

  let tree;
  try { tree = JSON.parse(row.tree_json); } catch (_) { return null; }
  return findPath(tree, destinationJamaId);
}

function findPath(node, targetId, trail = []) {
  if (!node) return null;
  const here = [...trail, node.jama_id];
  if (node.jama_id === targetId) return here;
  for (const child of node.children || []) {
    const sub = findPath(child, targetId, here);
    if (sub) return sub;
  }
  return null;
}

// ─── Main orchestrator ────────────────────────────────────────────────────

async function runExportJob({ runId, exportProfile, userId, username, password, baseUrl, tcIds }) {
  const log = new ExportRunLogger(runId);
  let session = null;

  try {
    if (!exportProfile.default_destination_jama_id) {
      throw new JamaError(
        "This export profile has no default destination — open 'Configure Jama export' and pick one first.",
        "JAMA_EXPORT_NO_DESTINATION"
      );
    }

    log.setStatus(
      "authenticating",
      `Signing in to Jama as ${username} (exporting ${tcIds.length} test case${tcIds.length === 1 ? "" : "s"} → ${exportProfile.default_destination_name})...`
    );
    session = await JamaSession.create({
      baseUrl,
      onLog: (level, message) => log.log(level, message),
    });
    await session.signIn(username, password);
    username = null;
    password = null;

    // Compute the click path from the cached project tree. The
    // navigate layer needs the explicit ancestor chain so it can
    // expand each level in order — there's no way to derive the
    // path from just the destination's jama_id without it.
    const pathToSet = resolveDestinationPath(
      exportProfile.project_id,
      exportProfile.default_destination_jama_id,
    );
    if (!pathToSet) {
      throw new JamaError(
        `Destination "${exportProfile.default_destination_name}" not found in the ` +
        `cached project tree. Refresh the tree from the Export panel and try again.`,
        "JAMA_EXPORT_DESTINATION_STALE"
      );
    }

    log.setStatus("navigating", `Opening project and navigating to "${exportProfile.default_destination_name}"...`);
    await navigateToSetNode(
      session,
      exportProfile.project_url,
      pathToSet,
      exportProfile.default_destination_name,
    );

    // Build an XLSX containing exactly the selected TCs, in the
    // Jama-import shape (one row per step, columns matching the saved
    // field mapping). Save to a temp file so Playwright can upload it.
    log.setStatus("exporting", `Building XLSX for ${tcIds.length} test case${tcIds.length === 1 ? "" : "s"}...`);
    const { buffer, testCaseCount, stepRowCount } = buildJamaXlsxBuffer(tcIds);
    if (testCaseCount === 0) {
      throw new JamaError(
        "None of the selected test cases were found in Testforge — were they deleted between selection and run?",
        "JAMA_EXPORT_TC_MISSING"
      );
    }
    const tmpPath = path.join(os.tmpdir(), `testforge-jama-export-${runId}.xlsx`);
    fs.writeFileSync(tmpPath, buffer);
    log.log("info", `Wrote XLSX with ${testCaseCount} TC(s) / ${stepRowCount} step row(s) to ${tmpPath}`);

    let xlsxCleanup = () => {
      try { fs.unlinkSync(tmpPath); } catch (_) { /* best effort */ }
    };

    let importSummary;
    try {
      const mappingName = exportProfile.import_mapping_name || "Testforge Auto Import";
      log.setStatus("exporting", `Driving Jama Import Wizard (mapping: "${mappingName}")...`);
      importSummary = await importTestCasesXlsx(
        session,
        exportProfile.default_destination_jama_id,
        tmpPath,
        mappingName,
      );
    } finally {
      xlsxCleanup();
    }

    log.incCounts({ created: importSummary.count });
    log.log("info", `Jama reported ${importSummary.count} item(s) imported.`);

    // Mark every TC as exported (timestamp only — we don't have per-TC
    // Jama IDs from the bulk import; re-export idempotency comes from
    // Jama's mapping handling, not our jama_id column).
    for (const tcId of tcIds) {
      bumpExportedAt(tcId);
    }

    log.log("info", `Export complete — ${tcIds.length} test case${tcIds.length === 1 ? "" : "s"} pushed.`);
    log.finishOk();
  } catch (e) {
    const userMessage =
      e instanceof JamaError ? e.message : `Unexpected error: ${e.message}`;
    log.log("error", userMessage);
    await captureFailureScreenshot(session, runId, log);
    log.finishFailed(userMessage, null);
  } finally {
    if (session) await session.dispose();
  }
}

// Capture a full-page screenshot of the failing state. Best-effort —
// session may already be torn down. SECURITY: skip when the current
// run state is 'authenticating' so we don't persist the Jama login
// form (username still visible in the DOM).
async function captureFailureScreenshot(session, runId, log) {
  if (!session || session._disposed) return;
  const current = getExportRun(runId);
  if (current && current.status === "authenticating") {
    log.log(
      "info",
      "Skipping failure screenshot — failure occurred during authentication (sensitive page state)."
    );
    return;
  }
  try {
    ensureDebugDir();
    const outPath = screenshotPathForRun(runId);
    await session.page.screenshot({ path: outPath, fullPage: true });
    log.log("info", `Saved failure screenshot to ${outPath}`);
  } catch (e) {
    log.log("warn", `Could not capture failure screenshot: ${e.message}`);
  }
}

module.exports = {
  createExportRun,
  getExportRun,
  runExportJob,
};
