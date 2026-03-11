const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb, logAudit, generateOtp, nextUserId } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

// GET /api/users — list all users (auth required)
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare("SELECT id, username, name, role, status, must_change_password, is_otp, failed_attempts, last_login, created_at FROM users ORDER BY rowid").all();
  res.json(users);
});

// POST /api/users — create user (Admin only)
router.post("/", requireRole("Admin"), (req, res) => {
  const { username, name, role } = req.body;
  if (!username || !name || !role) return res.status(400).json({ error: "Username, name, and role are required" });

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(400).json({ error: "Username already exists" });

  const otp = generateOtp();
  const hash = bcrypt.hashSync(otp, 10);
  const id = nextUserId();

  db.prepare("INSERT INTO users (id, username, name, role, password_hash, must_change_password, is_otp) VALUES (?, ?, ?, ?, ?, 1, 1)").run(id, username, name, role, hash);
  logAudit(req.session.name, "ACCOUNT_CREATED", `Created account "${username}" for ${name} (${role}) with one-time password`);

  res.json({ id, username, name, role, otp });
});

// PUT /api/users/:id/role — change role (Admin only)
router.put("/:id/role", requireRole("Admin"), (req, res) => {
  const { role } = req.body;
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.session.userId) return res.status(400).json({ error: "Cannot change your own role" });

  const oldRole = target.role;
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, target.id);
  logAudit(req.session.name, "ROLE_CHANGE", `${target.name}: ${oldRole} → ${role}`);
  res.json({ ok: true });
});

// PUT /api/users/:id/status — activate/deactivate (Admin only)
router.put("/:id/status", requireRole("Admin"), (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.session.userId) return res.status(400).json({ error: "Cannot deactivate yourself" });

  // Prevent deactivating the last active admin
  if (target.role === "Admin" && target.status === "Active") {
    const activeAdmins = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND status = 'Active'").get().count;
    if (activeAdmins <= 1) return res.status(400).json({ error: "Cannot deactivate the last active Admin" });
  }

  const newStatus = target.status === "Active" ? "Inactive" : "Active";
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(newStatus, target.id);
  logAudit(req.session.name, newStatus === "Inactive" ? "DEACTIVATED" : "REACTIVATED", `${target.name}: ${target.status} → ${newStatus}`);
  res.json({ ok: true, newStatus });
});

// PUT /api/users/:id/reset-password — issue new OTP (Admin only)
router.put("/:id/reset-password", requireRole("Admin"), (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  const otp = generateOtp();
  const hash = bcrypt.hashSync(otp, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, is_otp = 1, failed_attempts = 0 WHERE id = ?").run(hash, target.id);
  logAudit(req.session.name, "PASSWORD_RESET", `Reset password for ${target.name} — new one-time password issued`);
  res.json({ username: target.username, name: target.name, otp });
});

// PUT /api/users/:id/unlock — reset failed attempts (Admin only)
router.put("/:id/unlock", requireRole("Admin"), (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  db.prepare("UPDATE users SET failed_attempts = 0 WHERE id = ?").run(target.id);
  logAudit(req.session.name, "ACCOUNT_UNLOCKED", `Unlocked account for ${target.name}`);
  res.json({ ok: true });
});

module.exports = router;
