const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb, logAudit } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ error: "User not found." });
  if (user.status === "Inactive") return res.status(401).json({ error: "Account is deactivated. Contact an administrator." });
  if (user.failed_attempts >= 5) return res.status(401).json({ error: "Account is locked after 5 failed attempts (UM-008). Contact an administrator." });

  if (!bcrypt.compareSync(password, user.password_hash)) {
    const newAttempts = user.failed_attempts + 1;
    db.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?").run(newAttempts, user.id);
    logAudit(user.name, "FAILED_LOGIN", `Invalid password (attempt ${newAttempts} of 5)`, "error");
    if (newAttempts >= 5) return res.status(401).json({ error: "Account locked after 5 failed attempts (UM-008)." });
    return res.status(401).json({ error: `Invalid password. Attempt ${newAttempts} of 5.` });
  }

  // Successful auth
  db.prepare("UPDATE users SET failed_attempts = 0, last_login = datetime('now') WHERE id = ?").run(user.id);
  logAudit(user.name, "LOGIN", "Successful login");

  // Set session
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.name = user.name;
  req.session.role = user.role;

  res.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    mustChangePassword: !!user.must_change_password,
    isOtp: !!user.is_otp,
  });
});

// POST /api/auth/change-password
router.post("/change-password", (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) return res.status(400).json({ error: "Missing fields" });
  if (newPassword.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.username === "admin" && newPassword === "admin") return res.status(400).json({ error: "Please choose a password other than the default." });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, is_otp = 0 WHERE id = ?").run(hash, userId);
  logAudit(user.name, "PASSWORD_CHANGED", user.is_otp ? "One-time password replaced with user-created password" : "Default password changed at first login");

  // Set session now that password is changed
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.name = user.name;
  req.session.role = user.role;

  res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (req, res) => {
  logAudit(req.session.name, "LOGOUT", "User signed out");
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/auth/me — check current session
router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: { id: req.session.userId, username: req.session.username, name: req.session.name, role: req.session.role } });
});

module.exports = router;
