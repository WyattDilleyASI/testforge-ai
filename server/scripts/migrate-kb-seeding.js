// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — schema migration
// ═══════════════════════════════════════════════════════════════════════════
//
// Adds the schema required for the KB Seeding Wizard feature:
//
//   kb_entries (existing)
//     + source                — provenance category (manual/seeded/etc)
//     + source_url            — original URL if applicable
//     + source_ref            — JSON: structured provenance details
//
//   kb_seeding_jobs           — one row per seeding session
//   kb_seeding_candidates     — extracted candidates pending review
//   kb_seeding_xref_matches   — candidate × requirement link suggestions
//
// Idempotent: safe to run multiple times. Wraps all DDL in a single
// transaction so partial failures roll back cleanly.
//
// Usage:
//   node server/scripts/migrate-kb-seeding.js

const { getKbDb } = require("../db");

// ─── Helpers ────────────────────────────────────────────────────────────────

function columnExists(db, table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some(c => c.name === column);
}

function tableExists(db, table) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  return !!row;
}

function indexExists(db, indexName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  return !!row;
}

function addColumnIfMissing(db, table, column, definition) {
  if (columnExists(db, table, column)) {
    console.log(`  · ${table}.${column} already exists, skipping`);
    return false;
  }
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  console.log(`  + Added column ${table}.${column}`);
  return true;
}

function createTableIfMissing(db, table, ddl) {
  if (tableExists(db, table)) {
    console.log(`  · Table ${table} already exists, skipping`);
    return false;
  }
  db.prepare(ddl).run();
  console.log(`  + Created table ${table}`);
  return true;
}

function createIndexIfMissing(db, indexName, ddl) {
  if (indexExists(db, indexName)) {
    console.log(`  · Index ${indexName} already exists, skipping`);
    return false;
  }
  db.prepare(ddl).run();
  console.log(`  + Created index ${indexName}`);
  return true;
}

// ─── Migration ──────────────────────────────────────────────────────────────

function migrate() {
  const db = getKbDb();

  // Sanity check — kb_entries must already exist for this migration to apply
  if (!tableExists(db, "kb_entries")) {
    throw new Error(
      "kb_entries does not exist in the knowledge database. " +
      "This migration extends the existing KB schema — run the base " +
      "TestForge schema setup first."
    );
  }

  const work = db.transaction(() => {
    // ─── kb_entries: provenance columns ──────────────────────────────────
    console.log("\nUpdating kb_entries:");
    addColumnIfMissing(db, "kb_entries", "source",     "TEXT DEFAULT 'manual'");
    addColumnIfMissing(db, "kb_entries", "source_url", "TEXT");
    addColumnIfMissing(db, "kb_entries", "source_ref", "TEXT");

    // ─── kb_seeding_jobs ─────────────────────────────────────────────────
    console.log("\nCreating kb_seeding_jobs:");
    createTableIfMissing(db, "kb_seeding_jobs", `
      CREATE TABLE kb_seeding_jobs (
        job_id                TEXT PRIMARY KEY,
        created_by            TEXT NOT NULL,
        created_at            TEXT NOT NULL,
        status                TEXT NOT NULL,
        input_summary         TEXT,
        default_subsection_id TEXT,
        batch_id_extract      TEXT,
        batch_id_xref         TEXT,
        model_version         TEXT,
        stats                 TEXT,
        error                 TEXT,
        completed_at          TEXT
      )
    `);

    // ─── kb_seeding_candidates ───────────────────────────────────────────
    console.log("\nCreating kb_seeding_candidates:");
    createTableIfMissing(db, "kb_seeding_candidates", `
      CREATE TABLE kb_seeding_candidates (
        candidate_id          TEXT PRIMARY KEY,
        job_id                TEXT NOT NULL REFERENCES kb_seeding_jobs(job_id),
        title                 TEXT NOT NULL,
        type                  TEXT NOT NULL,
        content               TEXT NOT NULL,
        suggested_tags        TEXT,
        subsection_id         TEXT,
        pinned                INTEGER DEFAULT 0,
        extraction_confidence REAL,
        source_input_ref      TEXT,
        source_url            TEXT,
        status                TEXT NOT NULL DEFAULT 'pending_review',
        final_kb_id           TEXT,
        user_edits            TEXT,
        original_extracted    TEXT,
        reviewed_at           TEXT,
        reviewed_by           TEXT
      )
    `);

    createIndexIfMissing(db, "idx_seeding_candidates_job_status", `
      CREATE INDEX idx_seeding_candidates_job_status
      ON kb_seeding_candidates(job_id, status)
    `);

    // ─── kb_seeding_xref_matches ─────────────────────────────────────────
    console.log("\nCreating kb_seeding_xref_matches:");
    createTableIfMissing(db, "kb_seeding_xref_matches", `
      CREATE TABLE kb_seeding_xref_matches (
        match_id        INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id    TEXT NOT NULL REFERENCES kb_seeding_candidates(candidate_id),
        req_id          TEXT NOT NULL,
        confidence      REAL NOT NULL,
        justification   TEXT,
        auto_applied    INTEGER DEFAULT 0,
        user_decision   TEXT DEFAULT 'pending'
      )
    `);

    createIndexIfMissing(db, "idx_xref_candidate", `
      CREATE INDEX idx_xref_candidate
      ON kb_seeding_xref_matches(candidate_id)
    `);

    createIndexIfMissing(db, "idx_xref_req_conf", `
      CREATE INDEX idx_xref_req_conf
      ON kb_seeding_xref_matches(req_id, confidence DESC)
    `);
  });

  console.log("KB Seeding migration starting...");
  work();
  console.log("\n✓ Migration complete.\n");
}

// ─── Run ────────────────────────────────────────────────────────────────────

try {
  migrate();
  process.exit(0);
} catch (err) {
  console.error("\n✗ Migration failed:", err.message);
  console.error(err.stack);
  process.exit(1);
}
