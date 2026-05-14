// ═══════════════════════════════════════════════════════════════════════════
// Baseline Seed Runner
// ═══════════════════════════════════════════════════════════════════════════
//
// Idempotent seed script that loads hand-curated adaptive rules and
// exemplar test cases into a fresh TestForge deployment. Runs at startup
// after database initialization. A version flag in app_settings prevents
// re-seeding once applied.
//
// To force a re-seed (e.g., after manual deletion of seed content):
//   1. Delete the 'baseline_seed_version' row from app_settings
//   2. Restart the server
//
// To ship updated baseline content:
//   1. Edit baseline-rules.json or baseline-exemplars.json
//   2. Bump the "version" string in BOTH files (e.g. "baseline-v1" -> "baseline-v2")
//   3. Restart — the new version will seed alongside any existing v1 content
//      admins have not yet purged.
//
// Failure isolation: seeding errors are caught and logged. Server startup
// continues regardless — a broken seed file should never bring TestForge down.

const fs = require("fs");
const path = require("path");
const {
  getCoreDb,
  getTcDb,
  getSetting,
  setSetting,
  logAudit,
} = require("../db");

const RULES_FILE     = path.join(__dirname, "baseline-rules.json");
const EXEMPLARS_FILE = path.join(__dirname, "baseline-exemplars.json");

// ─── File loading ───────────────────────────────────────────────────────────

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Seed file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ─── Rule seeding ───────────────────────────────────────────────────────────

function seedRules(rulesData) {
  const core = getCoreDb();
  const { defaults, rules } = rulesData;

  // Per-row idempotency: skip rules already present by rule_id.
  // Allows partial re-seed if a previous run failed mid-way.
  const existing = core
    .prepare("SELECT rule_id FROM adaptive_rules WHERE model_version = ?")
    .all(defaults.model_version);
  const existingIds = new Set(existing.map(r => r.rule_id));

  const stmt = core.prepare(`
    INSERT INTO adaptive_rules
      (rule_id, rule_text, category, scope,
       base_confidence, observation_count, half_life_days,
       model_version, last_reinforced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
  `);

  let inserted = 0;
  for (const rule of rules) {
    if (existingIds.has(rule.rule_id)) continue;
    stmt.run(
      rule.rule_id,
      rule.rule_text,
      rule.category || "general",
      rule.scope || "all",
      defaults.base_confidence,
      defaults.observation_count,
      defaults.half_life_days,
      defaults.model_version
    );
    inserted++;
  }

  return { inserted, total: rules.length };
}

// ─── Exemplar seeding ───────────────────────────────────────────────────────
//
// Each exemplar gets a row in test_cases (flagged is_seeded=1) PLUS a row
// in exemplar_test_cases that references it. Both must succeed together
// or the exemplar isn't usable — so we wrap in a transaction per exemplar.

function seedExemplars(exemplarsData) {
  const tcDb = getTcDb();
  const { defaults, exemplars } = exemplarsData;

  // Per-row idempotency by tc_id
  const existing = tcDb
    .prepare("SELECT tc_id FROM test_cases WHERE is_seeded = 1")
    .all();
  const existingIds = new Set(existing.map(r => r.tc_id));

  const tcInsert = tcDb.prepare(`
    INSERT INTO test_cases
      (tc_id, title, linked_req_ids, preconditions, steps, description,
       type, depth, req_attribute, kb_references, upstream_relationship,
       status, generated_by, is_seeded)
    VALUES (?, ?, '[]', ?, ?, ?, ?, ?, '', '[]', '[]', ?, ?, 1)
  `);

  const exemplarInsert = tcDb.prepare(`
    INSERT OR REPLACE INTO exemplar_test_cases
      (tc_id, req_type, test_type, depth, selected_by, curated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  let inserted = 0;
  for (const ex of exemplars) {
    if (existingIds.has(ex.tc_id)) continue;

    const txn = tcDb.transaction(() => {
      tcInsert.run(
        ex.tc_id,
        ex.title,
        JSON.stringify(ex.preconditions),
        JSON.stringify(ex.steps),
        JSON.stringify(ex.description),
        ex.type,
        ex.depth,
        defaults.status,
        defaults.generated_by
      );

      exemplarInsert.run(
        ex.tc_id,
        ex.req_type || null,
        ex.type || null,
        ex.depth || "standard",
        defaults.selected_by
      );
    });

    txn();
    inserted++;
  }

  return { inserted, total: exemplars.length };
}

// ─── Orchestration ──────────────────────────────────────────────────────────

function runBaselineSeed() {
  try {
    const rulesData     = loadJson(RULES_FILE);
    const exemplarsData = loadJson(EXEMPLARS_FILE);

    // Idempotency check via version flag
    const appliedVersion = getSetting("baseline_seed_version");
    if (
      appliedVersion === rulesData.version &&
      appliedVersion === exemplarsData.version
    ) {
      // Already seeded this version — nothing to do
      return;
    }

    // Version mismatch between files is a packaging bug
    if (rulesData.version !== exemplarsData.version) {
      console.warn(
        `⚠ Baseline seed: version mismatch between rules (${rulesData.version}) ` +
        `and exemplars (${exemplarsData.version}). Skipping seed.`
      );
      return;
    }

    console.log(`⟳ Running baseline seed (${rulesData.version})...`);

    const rulesResult     = seedRules(rulesData);
    const exemplarsResult = seedExemplars(exemplarsData);

    setSetting("baseline_seed_version", rulesData.version);

    logAudit(
      "System",
      "BASELINE_SEED_APPLIED",
      `Seeded ${rulesResult.inserted}/${rulesResult.total} rules and ` +
      `${exemplarsResult.inserted}/${exemplarsResult.total} exemplars ` +
      `(version: ${rulesData.version})`
    );

    console.log(
      `✓ Baseline seed complete: ${rulesResult.inserted} rules, ` +
      `${exemplarsResult.inserted} exemplars inserted`
    );
  } catch (err) {
    // Seed failure must NOT crash the server — log and continue
    console.error("⚠ Baseline seed failed:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

module.exports = { runBaselineSeed };