// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — image support migration
// ═══════════════════════════════════════════════════════════════════════════
//
// Adds the schema required for importing images (PNG/JPG/WEBP) through
// the KB Seeding Wizard:
//
//   kb_seeding_candidates (existing)
//     + media_type    — MIME type for image candidates (e.g. "image/png")
//                       NULL for text-derived candidates
//     + image_file    — saved filename in data/seeding-images/{job_id}/
//                       NULL for text-derived candidates
//
// Idempotent: safe to run multiple times. Wraps all DDL in a single
// transaction so partial failures roll back cleanly.
//
// Usage:
//   node server/scripts/migrate-kb-seeding-images.js

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

function addColumnIfMissing(db, table, column, definition) {
  if (columnExists(db, table, column)) {
    console.log(`  · ${table}.${column} already exists, skipping`);
    return false;
  }
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  console.log(`  + Added column ${table}.${column}`);
  return true;
}

// ─── Migration ──────────────────────────────────────────────────────────────

function migrate() {
  const db = getKbDb();

  // Sanity check — kb_seeding_candidates must already exist
  if (!tableExists(db, "kb_seeding_candidates")) {
    throw new Error(
      "kb_seeding_candidates does not exist in the knowledge database. " +
      "This migration extends the seeding schema — run " +
      "migrate-kb-seeding.js first."
    );
  }

  const work = db.transaction(() => {
    console.log("\nUpdating kb_seeding_candidates:");
    addColumnIfMissing(db, "kb_seeding_candidates", "media_type", "TEXT");
    addColumnIfMissing(db, "kb_seeding_candidates", "image_file", "TEXT");
  });

  console.log("KB Seeding image migration starting...");
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