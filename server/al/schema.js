// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Learning Engine — Schema & Migrations
// ═══════════════════════════════════════════════════════════════════════════
//
// Owns all AL table creation, indexes, views, and migrations.
// Called once from db.js initialize() via initializeAL().
// Safe to call repeatedly — uses IF NOT EXISTS throughout.

const { getCoreDb, getTcDb, getKbDb } = require("../db");

function initializeAL() {
  const core = getCoreDb();
  const tcDb = getTcDb();
  const kbDb = getKbDb();

  // ── Migration: updated_at on kb_entries ───────────────────────────
  // Used by the KB Review engine for lazy counter invalidation — when a
  // KB entry is edited (manually or via an approved suggestion), counters
  // accumulated before that edit are stale and get reset on next sync.
  //
  // NOTE: SQLite's ALTER TABLE ADD COLUMN does NOT allow expression defaults
  // like `DEFAULT (datetime('now'))`. We add the column with no default,
  // then backfill existing rows with their created_at (or current time as
  // a fallback). New rows will get the default-current-timestamp behavior
  // applied at the route layer when content is edited.
  const kbCols = kbDb.prepare("PRAGMA table_info(kb_entries)").all().map(c => c.name);
  if (!kbCols.includes("updated_at")) {
    kbDb.exec("ALTER TABLE kb_entries ADD COLUMN updated_at TEXT");
    kbDb.exec("UPDATE kb_entries SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL");
  }

  // ── Migration: snapshot column on test_cases ──────────────────────
  // Stores the original generated state of a TC before any human edits.
  // Populated at generation time, diffed when reviewed, then NULLed out.
  const tcCols = tcDb.prepare("PRAGMA table_info(test_cases)").all().map(c => c.name);
  if (!tcCols.includes("generated_snapshot")) {
    tcDb.exec("ALTER TABLE test_cases ADD COLUMN generated_snapshot TEXT DEFAULT NULL");
  }

  // ── feedback_events (testcases.db) ────────────────────────────────
  // Captures engineer interactions with generated TCs:
  //   approved_unchanged  — approved without editing (strong positive signal)
  //   approved_with_edits — edited then approved (diff is the signal)
  //   rejected            — rejected entirely (rejection_reason captured)
  //   regenerated         — re-ran generation (implicit negative)
  //
  // diff_summary: structured JSON computed at write time in the Express
  // route, describing what changed between snapshot and reviewed state.
  //
  // processed_at: NULL until the aggregation job consumes this event.
  // Makes aggregation idempotent — failed runs leave events waiting.
  tcDb.exec(`
    CREATE TABLE IF NOT EXISTS feedback_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tc_id            TEXT    NOT NULL,
      req_id           TEXT    NOT NULL,
      event_type       TEXT    NOT NULL CHECK (event_type IN (
                         'approved_unchanged', 'approved_with_edits',
                         'rejected', 'regenerated'
                       )),
      diff_summary     TEXT    DEFAULT NULL,
      rejection_reason TEXT    DEFAULT NULL,
      user_id          TEXT    NOT NULL,
      user_name        TEXT    NOT NULL,
      depth            TEXT    DEFAULT 'standard',
      test_type        TEXT    DEFAULT NULL,
      processed_at     TEXT    DEFAULT NULL,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_feedback_tc   ON feedback_events(tc_id);");
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_feedback_req  ON feedback_events(req_id);");
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_events(event_type);");
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_feedback_unprocessed ON feedback_events(processed_at) WHERE processed_at IS NULL;");

  // ── exemplar_test_cases (testcases.db) ────────────────────────────
  // Curated "gold standard" TCs injected as few-shot examples in the
  // generation prompt. Lightweight reference table — actual TC content
  // is fetched from test_cases at prompt-build time.
  tcDb.exec(`
    CREATE TABLE IF NOT EXISTS exemplar_test_cases (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tc_id       TEXT    UNIQUE NOT NULL,
      req_type    TEXT    DEFAULT NULL,
      test_type   TEXT    DEFAULT NULL,
      depth       TEXT    DEFAULT 'standard',
      selected_by TEXT    NOT NULL DEFAULT 'system',
      curated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── generation_sessions (core.db) ─────────────────────────────────
  // Structured record of every generation event. The backbone of
  // AL-003 analytics — queryable by depth, user, date, requirement,
  // and approval rate. Replaces the flat audit_log string for analytics.
  core.exec(`
    CREATE TABLE IF NOT EXISTS generation_sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT    UNIQUE NOT NULL,
      req_id          TEXT    NOT NULL,
      req_title       TEXT    DEFAULT '',
      depth           TEXT    NOT NULL DEFAULT 'standard',
      tc_count        INTEGER NOT NULL DEFAULT 0,
      tc_ids          TEXT    NOT NULL DEFAULT '[]',
      approved_count  INTEGER NOT NULL DEFAULT 0,
      rejected_count  INTEGER NOT NULL DEFAULT 0,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      diff_summary_agg TEXT   DEFAULT NULL,
      generated_by    TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  core.exec("CREATE INDEX IF NOT EXISTS idx_gen_sessions_req_id ON generation_sessions(req_id);");
  core.exec("CREATE INDEX IF NOT EXISTS idx_gen_sessions_user   ON generation_sessions(generated_by);");
  core.exec("CREATE INDEX IF NOT EXISTS idx_gen_sessions_date   ON generation_sessions(created_at);");

  // ── adaptive_rules (core.db) ──────────────────────────────────────
  // Distilled "lessons learned" injected into the Claude generation
  // prompt. Each rule is a concise instruction derived from feedback
  // patterns.
  //
  // effective_confidence is a GENERATED STORED column — it auto-decays
  // base_confidence using a half-life formula. No cron job needed;
  // the ranking is always current at query time.
  //
  // Hard cap: 25 rules max. Lowest confidence evicted when full.
  // NOTE: effective_confidence is NOT stored on the row — SQLite
  // prohibits non-deterministic functions (JULIANDAY('now')) in
  // generated columns. Instead, it's computed at query time in
  // v_active_rules_ranked and via the EFFECTIVE_CONF_SQL expression
  // used in rules.js queries.
  core.exec(`
    CREATE TABLE IF NOT EXISTS adaptive_rules (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id             TEXT    UNIQUE NOT NULL,
      rule_text           TEXT    NOT NULL,
      category            TEXT    NOT NULL DEFAULT 'general',
      scope               TEXT    NOT NULL DEFAULT 'all',
      base_confidence     REAL    NOT NULL DEFAULT 1.0,
      observation_count   INTEGER NOT NULL DEFAULT 1,
      half_life_days      INTEGER NOT NULL DEFAULT 45,
      last_reinforced_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      model_version       TEXT    DEFAULT NULL,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  core.exec("CREATE INDEX IF NOT EXISTS idx_rules_category ON adaptive_rules(category);");

  // ── rule_evidence (core.db) ───────────────────────────────────────
  // Join table linking rules to the feedback events that generated them.
  // Audit trail — "why does this rule exist?"
  //
  // Note: feedback_event_id references a row in testcases.db, not
  // core.db. Cross-DB reference stored as a plain integer. Drill-down
  // requires a second query, which is fine for infrequent admin use.
  core.exec(`
    CREATE TABLE IF NOT EXISTS rule_evidence (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id            TEXT    NOT NULL,
      feedback_event_id  INTEGER NOT NULL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  core.exec("CREATE INDEX IF NOT EXISTS idx_evidence_rule ON rule_evidence(rule_id);");

  // ── Views (core.db) ──────────────────────────────────────────────
  // v_active_rules_ranked: The view the prompt builder queries.
  //   Only rules above minimum confidence, ordered by strength.
  // effective_confidence is computed here at query time using the
  // half-life decay formula. This avoids the SQLite restriction on
  // non-deterministic generated columns while giving identical results.
  core.exec(`
    CREATE VIEW IF NOT EXISTS v_active_rules_ranked AS
    SELECT
      rule_id, rule_text, category, scope,
      base_confidence, observation_count,
      base_confidence * POWER(0.5,
        (JULIANDAY('now') - JULIANDAY(last_reinforced_at)) / half_life_days
      ) AS effective_confidence,
      last_reinforced_at, model_version
    FROM adaptive_rules
    WHERE base_confidence * POWER(0.5,
        (JULIANDAY('now') - JULIANDAY(last_reinforced_at)) / half_life_days
      ) >= 0.1
    ORDER BY effective_confidence DESC;
  `);

  // v_generation_summary: Aggregated analytics for the dashboard.
  //   Groups by month + depth with approval rates and token costs.
  core.exec(`
    CREATE VIEW IF NOT EXISTS v_generation_summary AS
    SELECT
      strftime('%Y-%m', created_at) AS month,
      depth,
      COUNT(*)                      AS session_count,
      SUM(tc_count)                 AS total_tcs,
      SUM(approved_count)           AS total_approved,
      SUM(rejected_count)           AS total_rejected,
      CASE
        WHEN SUM(approved_count + rejected_count) > 0
        THEN ROUND(
          CAST(SUM(approved_count) AS REAL) /
          SUM(approved_count + rejected_count) * 100, 1
        )
        ELSE NULL
      END                           AS approval_rate_pct,
      SUM(input_tokens)             AS total_input_tokens,
      SUM(output_tokens)            AS total_output_tokens,
      generated_by
    FROM generation_sessions
    GROUP BY month, depth, generated_by
    ORDER BY month DESC, depth;
  `);

  // ── kb_edit_counters (testcases.db) ───────────────────────────────
  // Tracks how many times each KB entry has been referenced by a TC
  // that was subsequently edited in a particular field. Bumped from the
  // feedback recording path whenever an "approved_with_edits" event fires
  // for a TC that used one or more KB entries.
  //
  // status:
  //   accumulating         — still below threshold
  //   ready_for_synthesis  — hit threshold, awaiting Claude synthesis
  //   synthesized          — suggestion has been generated; counter is
  //                          frozen until KB entry is updated
  //
  // sample_tc_ids: bounded JSON array (max 3 TCs) used as evidence for
  // the synthesis prompt. We keep at most 3 to limit prompt cost; the
  // counter itself records the true count.
  //
  // first_seen: used for lazy invalidation. If kb_entries.updated_at >
  // first_seen, the counter is stale and gets reset on next visit.
  tcDb.exec(`
    CREATE TABLE IF NOT EXISTS kb_edit_counters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id         TEXT    NOT NULL,
      edit_field    TEXT    NOT NULL,
      count         INTEGER NOT NULL DEFAULT 0,
      sample_tc_ids TEXT    NOT NULL DEFAULT '[]',
      status        TEXT    NOT NULL DEFAULT 'accumulating' CHECK (status IN (
                      'accumulating', 'ready_for_synthesis', 'synthesized'
                    )),
      first_seen    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_seen     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kb_id, edit_field)
    );
  `);
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_kb_counters_status ON kb_edit_counters(status);");
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_kb_counters_kb     ON kb_edit_counters(kb_id);");

  // ── kb_suggestions (testcases.db) ─────────────────────────────────
  // Claude-synthesized suggestions to update a KB entry's content,
  // generated when an edit counter hits the threshold. Always require
  // manual approval before applying — KB drives all future generation,
  // so bad auto-applies could cascade.
  //
  // current_content: snapshot of the KB entry's content at synthesis
  // time. Lets the reviewer see what was being suggested against, even
  // if the KB entry was edited in the meantime.
  //
  // claude_input / claude_output: raw prompt + response, for debugging
  // and audit. Optional — null if we don't want to retain.
  tcDb.exec(`
    CREATE TABLE IF NOT EXISTS kb_suggestions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id            TEXT    NOT NULL,
      edit_field       TEXT    NOT NULL,
      evidence_tc_ids  TEXT    NOT NULL DEFAULT '[]',
      current_content  TEXT,
      proposed_content TEXT,
      rationale        TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending', 'approved', 'rejected'
                       )),
      decision_by      TEXT,
      decision_at      TEXT,
      decision_note    TEXT,
      claude_input     TEXT,
      claude_output    TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_kb_suggestions_status ON kb_suggestions(status);");
  tcDb.exec("CREATE INDEX IF NOT EXISTS idx_kb_suggestions_kb     ON kb_suggestions(kb_id);");

  console.log("  ✓ Adaptive Learning Engine tables initialized");
}

module.exports = { initializeAL };