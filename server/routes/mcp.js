const express = require("express");
const { getDb, logAudit, getMcpSettings, getMcpSettingById } = require("../db");
const { requireAuth, requireRole } = require("../auth");
const { encrypt, decrypt } = require("../crypto");

const router = express.Router();

// ─── GET /api/mcp/settings — List all MCP servers ──────────────────────────
// All authenticated users can VIEW (they need to know what's available),
// but only Admins can create/edit/delete.
router.get("/settings", requireAuth, (req, res) => {
  const settings = getMcpSettings();
  res.json(settings);
});

// ─── POST /api/mcp/settings — Add a new MCP server (Admin only) ────────────
router.post("/settings", requireRole("Admin"), (req, res) => {
  const { name, url, enabled, auth_type, auth_token, description } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: "Name and URL are required" });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const db = getDb();

  // Check for duplicate name
  const existing = db.prepare("SELECT id FROM mcp_settings WHERE name = ?").get(name);
  if (existing) {
    return res.status(400).json({ error: "An MCP server with this name already exists" });
  }

// Encrypt auth token at rest using AES-256-GCM (see server/crypto.js)

  const tokenToStore = auth_token ? encrypt(auth_token) : null;

  const result = db.prepare(`
    INSERT INTO mcp_settings (name, url, enabled, auth_type, auth_token_encrypted, description, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    url.trim(),
    enabled !== undefined ? (enabled ? 1 : 0) : 1,
    auth_type || "none",
    tokenToStore,
    description || "",
    req.session.name
  );

  logAudit(req.session.name, "MCP_CREATED", `Added MCP server "${name}" (${url})`);

  res.json({
    ok: true,
    id: result.lastInsertRowid,
    message: `MCP server "${name}" created`
  });
});

// ─── PUT /api/mcp/settings/:id — Update an MCP server (Admin only) ─────────
router.put("/settings/:id", requireRole("Admin"), (req, res) => {
  const { name, url, enabled, auth_type, auth_token, description } = req.body;
  const db = getDb();

  const existing = getMcpSettingById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "MCP server not found" });
  }

  if (url) {
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }
  }

  // Check for duplicate name (excluding current record)
  if (name && name !== existing.name) {
    const dup = db.prepare("SELECT id FROM mcp_settings WHERE name = ? AND id != ?").get(name, req.params.id);
    if (dup) {
      return res.status(400).json({ error: "An MCP server with this name already exists" });
    }
  }

  // Only update token if explicitly provided (empty string = clear token, undefined = keep existing)
  const tokenToStore = auth_token !== undefined ? (auth_token ? encrypt(auth_token) : null) : existing.auth_token_encrypted;

  db.prepare(`
    UPDATE mcp_settings
    SET name = ?, url = ?, enabled = ?, auth_type = ?, auth_token_encrypted = ?,
        description = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    (name || existing.name).trim(),
    (url || existing.url).trim(),
    enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    auth_type || existing.auth_type,
    tokenToStore,
    description !== undefined ? description : existing.description,
    req.session.name,
    req.params.id
  );

  const changes = [];
  if (name && name !== existing.name) changes.push(`name → "${name}"`);
  if (url && url !== existing.url) changes.push(`url → "${url}"`);
  if (enabled !== undefined && (enabled ? 1 : 0) !== existing.enabled) changes.push(enabled ? "enabled" : "disabled");
  if (auth_type && auth_type !== existing.auth_type) changes.push(`auth → ${auth_type}`);

  logAudit(
    req.session.name,
    "MCP_UPDATED",
    `Updated MCP server "${existing.name}"${changes.length ? `: ${changes.join(", ")}` : ""}`
  );

  res.json({ ok: true });
});

// ─── DELETE /api/mcp/settings/:id — Remove an MCP server (Admin only) ──────
router.delete("/settings/:id", requireRole("Admin"), (req, res) => {
  const db = getDb();
  const existing = getMcpSettingById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "MCP server not found" });
  }

  db.prepare("DELETE FROM mcp_settings WHERE id = ?").run(req.params.id);
  logAudit(req.session.name, "MCP_DELETED", `Removed MCP server "${existing.name}" (${existing.url})`);

  res.json({ ok: true });
});

// ─── POST /api/mcp/settings/:id/test — Test connection (Admin only) ────────
router.post("/settings/:id/test", requireRole("Admin"), async (req, res) => {
  const existing = getMcpSettingById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "MCP server not found" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers = {};
    if (existing.auth_type === "bearer" && existing.auth_token_encrypted) {
      headers["Authorization"] = `Bearer ${decrypt(existing.auth_token_encrypted)}`;
    } else if (existing.auth_type === "api_key" && existing.auth_token_encrypted) {
      headers["x-api-key"] = decrypt(existing.auth_token_encrypted);
    }

    const response = await fetch(existing.url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    logAudit(req.session.name, "MCP_TEST", `Tested "${existing.name}" — ${response.status} ${response.statusText}`);

    res.json({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      reachable: response.ok,
    });
  } catch (err) {
    logAudit(req.session.name, "MCP_TEST", `Tested "${existing.name}" — FAILED: ${err.message}`, "error");
    res.json({
      ok: false,
      error: err.name === "AbortError" ? "Connection timed out (5s)" : err.message,
      reachable: false,
    });
  }
});

// ─── PUT /api/mcp/settings/:id/toggle — Quick enable/disable (Admin only) ──
router.put("/settings/:id/toggle", requireRole("Admin"), (req, res) => {
  const db = getDb();
  const existing = getMcpSettingById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "MCP server not found" });
  }

  const newEnabled = existing.enabled ? 0 : 1;
  db.prepare("UPDATE mcp_settings SET enabled = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newEnabled, req.session.name, req.params.id);

  logAudit(req.session.name, "MCP_TOGGLED", `${newEnabled ? "Enabled" : "Disabled"} MCP server "${existing.name}"`);

  res.json({ ok: true, enabled: !!newEnabled });
});

module.exports = router;