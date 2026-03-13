const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "testforge.db");

let db;

function getDb() {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

// ─── SCHEMA ─────────────────────────────────────────────────────────────────

function initialize() {
  const db = getDb();

  db.exec(`
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

    CREATE TABLE IF NOT EXISTS kb_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
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
      user_id TEXT NOT NULL REFERENCES users(id),
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
  `);

  // Migration: add project_id column if missing (for existing DBs)
  const tcCols = db.prepare("PRAGMA table_info(test_cases)").all().map(c => c.name);
  if (!tcCols.includes("project_id")) db.exec("ALTER TABLE test_cases ADD COLUMN project_id TEXT");
  if (!tcCols.includes("upstream_relationship")) db.exec("ALTER TABLE test_cases ADD COLUMN upstream_relationship TEXT DEFAULT '[]'");
  if (tcCols.includes("pass_fail_criteria")) db.exec("ALTER TABLE test_cases RENAME COLUMN pass_fail_criteria TO description");

  // Migration: add new requirement columns for JAMA import
  const reqCols = db.prepare("PRAGMA table_info(requirements)").all().map(c => c.name);
  const newReqCols = [
    ["global_id", "TEXT"], ["requirement_text", "TEXT"], ["rationale", "TEXT"],
    ["requirement_type", "TEXT"], ["safety_level", "TEXT"], ["requirement_context", "TEXT DEFAULT '[]'"],
    ["verification_method", "TEXT"], ["scheduled_release", "TEXT"], ["external_id", "TEXT"],
    ["tags", "TEXT DEFAULT '[]'"], ["relationships", "TEXT DEFAULT '[]'"],
  ];
  for (const [col, type] of newReqCols) {
    if (!reqCols.includes(col)) db.exec(`ALTER TABLE requirements ADD COLUMN ${col} ${type}`);
  }

  // Migration: add images column to kb_entries if missing
  const kbCols = db.prepare("PRAGMA table_info(kb_entries)").all().map(c => c.name);
  if (!kbCols.includes("images")) db.exec("ALTER TABLE kb_entries ADD COLUMN images TEXT DEFAULT '[]'");

  // Seed default admin if no users exist
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const hash = bcrypt.hashSync("admin", 10);
    db.prepare(`
      INSERT INTO users (id, username, name, role, password_hash, must_change_password, is_otp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("USR-001", "admin", "Admin", "Admin", hash, 1, 0);

    logAudit("System", "SYSTEM_INIT", "Default admin account created (username: admin)");
  }

  // (No seed requirements — requirements come from JAMA imports)

  // Seed sample KB entries if none exist
  const kbCount = db.prepare("SELECT COUNT(*) as count FROM kb_entries").get().count;
  if (kbCount === 0) {
    const seedKb = [
      { kb_id: "KB-E001", title: "PDF parsing fails on scanned documents", type: "Defect History", content: "Historical defect: PDF ingestion module crashes when processing scanned (image-based) PDFs without OCR. Ensure test cases include scanned PDF variants.", tags: JSON.stringify(["RS-001"]) },
      { kb_id: "KB-E002", title: "Jama field mapping edge cases", type: "System Behavior", content: "Jama custom fields with special characters in names cause mapping failures. Test with non-alphanumeric field names.", tags: JSON.stringify(["JM-007", "JM-003"]) },
      { kb_id: "KB-E003", title: "Acceptance criteria parsing rules", type: "Business Rule", content: "Acceptance criteria should be parsed as individual testable statements. Criteria containing 'and' or 'or' should be split into separate assertions.", tags: JSON.stringify(["RS-003", "TC-002"]) },
    ];
    const insert = db.prepare("INSERT INTO kb_entries (kb_id, title, type, content, tags) VALUES (?, ?, ?, ?, ?)");
    for (const kb of seedKb) insert.run(kb.kb_id, kb.title, kb.type, kb.content, kb.tags);
  }

  console.log("✓ Database initialized at", DB_PATH);
}

// ─── AUDIT LOGGING ──────────────────────────────────────────────────────────

function logAudit(userName, action, details, status = "success") {
  getDb().prepare("INSERT INTO audit_log (user_name, action, details, status) VALUES (?, ?, ?, ?)").run(userName, action, details, status);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateOtp() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let otp = "";
  for (let i = 0; i < 8; i++) otp += chars.charAt(Math.floor(Math.random() * chars.length));
  return otp;
}

function nextUserId() {
  const last = getDb().prepare("SELECT id FROM users ORDER BY rowid DESC LIMIT 1").get();
  if (!last) return "USR-001";
  const num = parseInt(last.id.replace("USR-", "")) + 1;
  return `USR-${String(num).padStart(3, "0")}`;
}

function nextKbId() {
  const last = getDb().prepare("SELECT kb_id FROM kb_entries ORDER BY rowid DESC LIMIT 1").get();
  if (!last) return "KB-E001";
  const num = parseInt(last.kb_id.replace("KB-E", "")) + 1;
  return `KB-E${String(num).padStart(3, "0")}`;
}

// ─── MCP HELPERS ────────────────────────────────────────────────────────────

function getMcpSettings() {
  return getDb()
    .prepare("SELECT id, name, url, enabled, auth_type, description, updated_by, created_at, updated_at FROM mcp_settings ORDER BY rowid")
    .all();
}

function getMcpSettingById(id) {
  return getDb()
    .prepare("SELECT * FROM mcp_settings WHERE id = ?")
    .get(id);
}

function getMcpEnabledServers() {
  return getDb()
    .prepare("SELECT id, name, url, auth_type, auth_token_encrypted FROM mcp_settings WHERE enabled = 1 ORDER BY rowid")
    .all();
}

function logTokenUsage(userName, reqId, inputTokens, outputTokens) {
  getDb().prepare("INSERT INTO token_usage (user_name, req_id, input_tokens, output_tokens) VALUES (?, ?, ?, ?)").run(userName, reqId || null, inputTokens, outputTokens);
}

module.exports = {
  getDb, initialize, logAudit, logTokenUsage, generateOtp, nextUserId, nextKbId,
  getMcpSettings, getMcpSettingById, getMcpEnabledServers
};
