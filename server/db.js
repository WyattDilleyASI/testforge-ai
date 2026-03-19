const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

// ─── DATABASE PATHS ─────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");

const DB_PATHS = {
  core:         path.join(DATA_DIR, "core.db"),
  requirements: path.join(DATA_DIR, "requirements.db"),
  testcases:    path.join(DATA_DIR, "testcases.db"),
  knowledge:    path.join(DATA_DIR, "knowledge.db"),
};

// Legacy single-DB path (for migration)
const LEGACY_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "testforge.db");

// ─── DATABASE CONNECTIONS ───────────────────────────────────────────────────
const dbs = {};

function openDb(key) {
  if (!dbs[key]) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    dbs[key] = new Database(DB_PATHS[key]);
    dbs[key].pragma("journal_mode = WAL");
    dbs[key].pragma("foreign_keys = ON");
  }
  return dbs[key];
}

function getCoreDb()  { return openDb("core"); }
function getReqDb()   { return openDb("requirements"); }
function getTcDb()    { return openDb("testcases"); }
function getKbDb()    { return openDb("knowledge"); }

// Backward-compat alias — returns core DB (for audit, settings, etc.)
function getDb() { return getCoreDb(); }

// ─── IMAGE FILESYSTEM HELPERS ───────────────────────────────────────────────

function getImageDir(kbId) {
  const dir = path.join(IMAGES_DIR, kbId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveImage(kbId, name, base64Data) {
  const dir = getImageDir(kbId);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return safeName;
}

function readImage(kbId, fileName) {
  const filePath = path.join(IMAGES_DIR, kbId, fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

function readImageBase64(kbId, fileName) {
  const buf = readImage(kbId, fileName);
  return buf ? buf.toString("base64") : null;
}

function deleteImage(kbId, fileName) {
  const filePath = path.join(IMAGES_DIR, kbId, fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function deleteImageDir(kbId) {
  const dir = path.join(IMAGES_DIR, kbId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ─── SCHEMA ─────────────────────────────────────────────────────────────────

function initialize() {
  // Ensure images directory exists
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Run migration from legacy single DB if it exists
  migrateLegacyDb();

  // ── Core DB: users, auth, audit, settings, MCP ──
  const core = getCoreDb();
  core.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'QA Manager', 'QA Engineer')),
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      is_otp INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'success'
    );

    CREATE TABLE IF NOT EXISTS jama_export_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL,
      tc_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mcp_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none', 'bearer', 'api_key', 'oauth2')),
      auth_token_encrypted TEXT,
      description TEXT DEFAULT '',
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      user_name TEXT NOT NULL,
      req_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // ── Requirements DB ──
  const reqDb = getReqDb();
  reqDb.exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      acceptance_criteria TEXT DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'High',
      status TEXT NOT NULL DEFAULT 'Draft',
      version INTEGER NOT NULL DEFAULT 1,
      source TEXT DEFAULT 'Manual Entry',
      module TEXT,
      global_id TEXT,
      requirement_text TEXT,
      rationale TEXT,
      requirement_type TEXT,
      safety_level TEXT,
      requirement_context TEXT DEFAULT '[]',
      verification_method TEXT,
      scheduled_release TEXT,
      external_id TEXT,
      tags TEXT DEFAULT '[]',
      relationships TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations for requirements
  const reqCols = reqDb.prepare("PRAGMA table_info(requirements)").all().map(c => c.name);
  const newReqCols = [
    ["global_id", "TEXT"], ["requirement_text", "TEXT"], ["rationale", "TEXT"],
    ["requirement_type", "TEXT"], ["safety_level", "TEXT"], ["requirement_context", "TEXT DEFAULT '[]'"],
    ["verification_method", "TEXT"], ["scheduled_release", "TEXT"], ["external_id", "TEXT"],
    ["tags", "TEXT DEFAULT '[]'"], ["relationships", "TEXT DEFAULT '[]'"],
  ];
  for (const [col, type] of newReqCols) {
    if (!reqCols.includes(col)) reqDb.exec(`ALTER TABLE requirements ADD COLUMN ${col} ${type}`);
  }

  // ── Test Cases DB ──
  const tcDb = getTcDb();
  tcDb.exec(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tc_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT,
      linked_req_ids TEXT DEFAULT '[]',
      preconditions TEXT,
      steps TEXT DEFAULT '[]',
      description TEXT,
      type TEXT,
      depth TEXT,
      req_attribute TEXT,
      kb_references TEXT DEFAULT '[]',
      upstream_relationship TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'Draft',
      generated_by TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations for test_cases
  const tcCols = tcDb.prepare("PRAGMA table_info(test_cases)").all().map(c => c.name);
  if (!tcCols.includes("project_id")) tcDb.exec("ALTER TABLE test_cases ADD COLUMN project_id TEXT");
  if (!tcCols.includes("upstream_relationship")) tcDb.exec("ALTER TABLE test_cases ADD COLUMN upstream_relationship TEXT DEFAULT '[]'");
  if (tcCols.includes("pass_fail_criteria")) tcDb.exec("ALTER TABLE test_cases RENAME COLUMN pass_fail_criteria TO description");

  // ── Knowledge Base DB ──
  // NOTE: images column now stores metadata only [{name, media_type, description}]
  // Actual image files live in /data/images/{kb_id}/
  const kbDb = getKbDb();
  kbDb.exec(`
    CREATE TABLE IF NOT EXISTS kb_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      related_reqs TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations for kb_entries
  const kbCols = kbDb.prepare("PRAGMA table_info(kb_entries)").all().map(c => c.name);
  if (!kbCols.includes("images")) kbDb.exec("ALTER TABLE kb_entries ADD COLUMN images TEXT DEFAULT '[]'");
  if (!kbCols.includes("related_reqs")) kbDb.exec("ALTER TABLE kb_entries ADD COLUMN related_reqs TEXT DEFAULT '[]'");

  // ── Seed data ──
  const userCount = core.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const hash = bcrypt.hashSync("admin", 10);
    core.prepare(`
      INSERT INTO users (id, username, name, role, password_hash, must_change_password, is_otp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("USR-001", "admin", "Admin", "Admin", hash, 1, 0);
    logAudit("System", "SYSTEM_INIT", "Default admin account created (username: admin)");
  }

  const kbCount = kbDb.prepare("SELECT COUNT(*) as count FROM kb_entries").get().count;
  if (kbCount === 0) {
    const seedKb = [
      { kb_id: "KB-E001", title: "PDF parsing fails on scanned documents", type: "Defect History", content: "Historical defect: PDF ingestion module crashes when processing scanned (image-based) PDFs without OCR. Ensure test cases include scanned PDF variants.", tags: JSON.stringify(["PDF", "OCR"]), related_reqs: JSON.stringify(["RS-001"]) },
      { kb_id: "KB-E002", title: "Jama field mapping edge cases", type: "System Behavior", content: "Jama custom fields with special characters in names cause mapping failures. Test with non-alphanumeric field names.", tags: JSON.stringify(["Jama", "field-mapping"]), related_reqs: JSON.stringify(["JM-007", "JM-003"]) },
      { kb_id: "KB-E003", title: "Acceptance criteria parsing rules", type: "Business Rule", content: "Acceptance criteria should be parsed as individual testable statements. Criteria containing 'and' or 'or' should be split into separate assertions.", tags: JSON.stringify(["parsing", "acceptance-criteria"]), related_reqs: JSON.stringify(["RS-003", "TC-002"]) },
    ];
    const insert = kbDb.prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags, related_reqs) VALUES (?, ?, ?, ?, ?, ?)");
    for (const kb of seedKb) insert.run(kb.kb_id, kb.title, kb.type, kb.content, kb.tags, kb.related_reqs);
  }

  console.log("✓ Databases initialized:");
  console.log("  Core:         ", DB_PATHS.core);
  console.log("  Requirements: ", DB_PATHS.requirements);
  console.log("  Test Cases:   ", DB_PATHS.testcases);
  console.log("  Knowledge:    ", DB_PATHS.knowledge);
  console.log("  Images:       ", IMAGES_DIR);
}

// ─── LEGACY MIGRATION ───────────────────────────────────────────────────────
// If testforge.db exists and the split DBs don't, migrate data over.

function migrateLegacyDb() {
  if (!fs.existsSync(LEGACY_DB_PATH)) return;

  // Only migrate if at least one split DB is missing
  const allExist = Object.values(DB_PATHS).every(p => fs.existsSync(p));
  if (allExist) return;

  console.log("⟳ Migrating from legacy testforge.db...");
  const legacy = new Database(LEGACY_DB_PATH);
  legacy.pragma("journal_mode = WAL");

  const tables = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

  // ── Core tables ──
  const core = getCoreDb();
  const coreTables = ["users", "audit_log", "jama_export_log", "mcp_settings", "mcp_tokens", "token_usage", "app_settings"];
  for (const table of coreTables) {
    if (!tables.includes(table)) continue;
    const rows = legacy.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) continue;
    // Create table first (schema will be created by initialize() after this)
    // Just insert data — table must already exist
    core.exec(legacy.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`).get().sql);
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => "?").join(", ");
    const insert = core.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`);
    for (const row of rows) insert.run(...cols.map(c => row[c]));
    console.log(`  ✓ ${table}: ${rows.length} rows`);
  }

  // ── Requirements ──
  if (tables.includes("requirements")) {
    const reqDb = getReqDb();
    const rows = legacy.prepare("SELECT * FROM requirements").all();
    if (rows.length > 0) {
      reqDb.exec(legacy.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='requirements'").get().sql);
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => "?").join(", ");
      const insert = reqDb.prepare(`INSERT OR IGNORE INTO requirements (${cols.join(", ")}) VALUES (${placeholders})`);
      for (const row of rows) insert.run(...cols.map(c => row[c]));
      console.log(`  ✓ requirements: ${rows.length} rows`);
    }
  }

  // ── Test Cases ──
  if (tables.includes("test_cases")) {
    const tcDb = getTcDb();
    const rows = legacy.prepare("SELECT * FROM test_cases").all();
    if (rows.length > 0) {
      tcDb.exec(legacy.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='test_cases'").get().sql);
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => "?").join(", ");
      const insert = tcDb.prepare(`INSERT OR IGNORE INTO test_cases (${cols.join(", ")}) VALUES (${placeholders})`);
      for (const row of rows) insert.run(...cols.map(c => row[c]));
      console.log(`  ✓ test_cases: ${rows.length} rows`);
    }
  }

  // ── Knowledge Base (with image extraction) ──
  if (tables.includes("kb_entries")) {
    const kbDb = getKbDb();
    const rows = legacy.prepare("SELECT * FROM kb_entries").all();
    if (rows.length > 0) {
      kbDb.exec(legacy.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_entries'").get().sql);
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => "?").join(", ");
      const insert = kbDb.prepare(`INSERT OR IGNORE INTO kb_entries (${cols.join(", ")}) VALUES (${placeholders})`);

      for (const row of rows) {
        // Extract base64 images to filesystem
        let images = [];
        try { images = JSON.parse(row.images || "[]"); } catch {}

        const newImages = [];
        for (const img of images) {
          if (img.data) {
            // Save to filesystem
            const savedName = saveImage(row.kb_id, img.name, img.data);
            newImages.push({ name: savedName, media_type: img.media_type, description: img.description || null });
          } else {
            newImages.push({ name: img.name, media_type: img.media_type, description: img.description || null });
          }
        }

        // Update the images column to metadata-only
        const rowData = cols.map(c => c === "images" ? JSON.stringify(newImages) : row[c]);
        insert.run(...rowData);
      }
      console.log(`  ✓ kb_entries: ${rows.length} rows (images extracted to filesystem)`);
    }
  }

  legacy.close();

  // Rename legacy DB so migration doesn't run again
  const backupPath = LEGACY_DB_PATH.replace(".db", ".db.bak");
  fs.renameSync(LEGACY_DB_PATH, backupPath);
  // Also move WAL/SHM files if they exist
  if (fs.existsSync(LEGACY_DB_PATH + "-wal")) fs.renameSync(LEGACY_DB_PATH + "-wal", backupPath + "-wal");
  if (fs.existsSync(LEGACY_DB_PATH + "-shm")) fs.renameSync(LEGACY_DB_PATH + "-shm", backupPath + "-shm");

  console.log("✓ Migration complete. Legacy DB backed up to", backupPath);
}

// ─── AUDIT LOGGING ──────────────────────────────────────────────────────────

function logAudit(userName, action, details, status = "success") {
  getCoreDb().prepare("INSERT INTO audit_log (user_name, action, details, status) VALUES (?, ?, ?, ?)").run(userName, action, details, status);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateOtp() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let otp = "";
  for (let i = 0; i < 8; i++) otp += chars.charAt(Math.floor(Math.random() * chars.length));
  return otp;
}

function nextUserId() {
  const last = getCoreDb().prepare("SELECT id FROM users ORDER BY rowid DESC LIMIT 1").get();
  if (!last) return "USR-001";
  const num = parseInt(last.id.replace("USR-", "")) + 1;
  return `USR-${String(num).padStart(3, "0")}`;
}

function nextKbId() {
  const last = getKbDb().prepare("SELECT kb_id FROM kb_entries ORDER BY rowid DESC LIMIT 1").get();
  if (!last) return "KB-E001";
  const num = parseInt(last.kb_id.replace("KB-E", "")) + 1;
  return `KB-E${String(num).padStart(3, "0")}`;
}

// ─── MCP HELPERS ────────────────────────────────────────────────────────────

function getMcpSettings() {
  return getCoreDb()
    .prepare("SELECT id, name, url, enabled, auth_type, description, updated_by, created_at, updated_at FROM mcp_settings ORDER BY rowid")
    .all();
}

function getMcpSettingById(id) {
  return getCoreDb()
    .prepare("SELECT * FROM mcp_settings WHERE id = ?")
    .get(id);
}

function getMcpEnabledServers() {
  return getCoreDb()
    .prepare("SELECT id, name, url, auth_type, auth_token_encrypted FROM mcp_settings WHERE enabled = 1 ORDER BY rowid")
    .all();
}

function logTokenUsage(userName, reqId, inputTokens, outputTokens) {
  getCoreDb().prepare("INSERT INTO token_usage (user_name, req_id, input_tokens, output_tokens) VALUES (?, ?, ?, ?)").run(userName, reqId || null, inputTokens, outputTokens);
}

function getSetting(key) {
  const row = getCoreDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : "";
}

function setSetting(key, value) {
  getCoreDb().prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function getProductContext() {
  return {
    product_context: getSetting("product_context"),
    key_terms: getSetting("key_terms"),
  };
}

module.exports = {
  getDb, getCoreDb, getReqDb, getTcDb, getKbDb,
  initialize, logAudit, logTokenUsage, generateOtp, nextUserId, nextKbId,
  getMcpSettings, getMcpSettingById, getMcpEnabledServers,
  getSetting, setSetting, getProductContext,
  saveImage, readImage, readImageBase64, deleteImage, deleteImageDir, getImageDir,
  IMAGES_DIR,
};
