require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

const { initialize } = require("./db");

// Ensure data directory exists before session store or DB init
const fs = require("fs");
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DATABASE INIT (must run before middleware) ─────────────────────────────

initialize();

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("short"));
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (req.path === "/mcp/messages") return next();
  express.json({ limit: "10mb" })(req, res, next);
});

// Session store — persisted to SQLite (UM-009: 60min timeout)
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "..", "data") }),
  secret: process.env.SESSION_SECRET || "testforge-dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000, // 60 minutes per UM-009
    httpOnly: true,
    sameSite: "lax",
  },
}));

// ─── API ROUTES ─────────────────────────────────────────────────────────────

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/requirements", require("./routes/requirements"));
app.use("/api/testcases", require("./routes/testcases"));
app.use("/api", require("./routes/data")); // KB, audit, jama
app.use("/api/mcp", require("./routes/mcp"));
const { mountMcpRoutes } = require("./mcp");
mountMcpRoutes(app);

// ─── MCP BRIDGE DOWNLOAD ────────────────────────────────────────────

app.get("/mcp-bridge.mjs", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "mcp-bridge.mjs"));
});

// ─── STATIC FRONTEND ───────────────────────────────────────────────────────

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(clientDist, "index.html"));
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ◈ TestForge AI v1.2 — Server running
  ─────────────────────────────────────
  Local:   http://localhost:${PORT}
  API:     http://localhost:${PORT}/api
  
  Default admin login:
    username: admin
    password: admin
    (must be changed on first login)
  `);
});
