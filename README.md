# ◈ TestForge AI — Test Creation Tool v1.2

AI-powered test case generation with full requirement traceability, built to the FRD v1.2 specification.

This is a change

## Quick Start

## Branch Strategy
    Merge into Branch ***
    After Review we will merge into main-stg

### Option A: Run Directly (Node.js)

```bash
# 1. Clone/download and enter the directory
cd testforge-ai

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY, SESSION_SECRET, and SERVER_ENCRYPTION_KEY

# 3. Install everything and build the frontend
npm install
cd client && npm install && npm run build && cd ..

# 4. Start the server
npm start
```

Open **http://localhost:3000** and log in with:
- Username: `admin`
- Password: `admin`
- You will be prompted to change the password on first login.

### Option B: Docker (Recommended for Teams)

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY, SESSION_SECRET, and SERVER_ENCRYPTION_KEY

# 2. Build and run
docker-compose up -d --build
```

Open **http://localhost:3000**.

## Architecture

```
testforge-ai/
├── server/
│   ├── index.js          Express server (serves API + static frontend)
│   ├── db.js             SQLite database layer (schema, seeds, helpers)
│   ├── auth.js           Authentication middleware (session-based)
│   ├── crypto.js          AES-256-GCM encryption for MCP auth tokens
│   └── routes/
│       ├── auth.js       Login, logout, password change
│       ├── users.js      User CRUD, role changes, OTP reset
│       ├── requirements.js  Requirement ingestion and editing
│       ├── testcases.js  TC generation via Claude API, status updates
│       ├── mcp.js        MCP server configuration (Admin only)
│       └── data.js       Knowledge Base, audit log, Jama export
├── client/
│   ├── src/
│   │   ├── App.jsx       Full React frontend
│   │   ├── api.js        API client helper
│   │   └── main.jsx      Entry point
│   ├── index.html
│   └── vite.config.js    Build config with dev proxy
├── data/                 SQLite databases (auto-created)
├── .env.example          Environment template
├── Dockerfile            Container build
├── docker-compose.yml    One-command deployment
└── package.json          Server dependencies
```

## FRD Traceability

Every feature maps to specific FRD v1.2 requirement IDs:

| Module | REQ IDs | Implementation |
|--------|---------|----------------|
| Requirement Ingestion | RS-001 – RS-007 | CRUD + acceptance criteria parsing |
| Test Case Generation | TC-001 – TC-009 | Claude API generation, Session View, Draft disclaimer |
| Knowledge Base | KB-001 – KB-006 | Tagged entries, KB-informed generation |
| User Management | UM-001 – UM-009 | RBAC, OTP flow, audit log, lockout |
| Jama Integration | JM-001 – JM-009 | Pre-export validation, simulated sync |
| MCP Server Config | Admin Config | Admin-only CRUD, connection testing, token encryption |
| Deferred (v2) | AL-001 – AL-008, KB-007 | Documented in Deferred view |

## Authentication Flow

1. **Default admin** — `admin` / `admin`, must change password on first login
2. **New users** — Admin creates account → OTP generated → user signs in → prompted to set own password
3. **Password reset** — Admin issues new OTP for any user
4. **Account lockout** — 5 failed attempts locks the account (UM-008)
5. **Session timeout** — 60 minutes (UM-009)

## MCP Server Configuration

MCP (Model Context Protocol) server connections are managed through the admin UI and stored in the database. Only Admin users can create, edit, delete, or test MCP server connections. All authenticated users can view the configured servers (read-only).

### Access Control

| Role | Permissions |
|------|------------|
| Admin | Full CRUD on MCP servers, test connections, toggle enabled/disabled |
| QA Manager | View configured servers (read-only) |
| QA Engineer | View configured servers (read-only) |

### Auth Token Encryption

MCP server auth tokens are encrypted at rest using AES-256-GCM via `server/crypto.js`. This requires a `SERVER_ENCRYPTION_KEY` environment variable. If the key is not set, tokens are stored unencrypted and a warning is logged to the console.

To generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database Tables

The MCP feature adds two tables to the SQLite database:

- **`mcp_settings`** — Stores server name, URL, auth type, encrypted auth token, enabled state, and metadata
- **`mcp_tokens`** — Stores per-user MCP access tokens with a foreign key to the users table

Both tables are created automatically on server start via `CREATE TABLE IF NOT EXISTS`.

## API Endpoints

All endpoints require authentication (session cookie) unless noted.

### Auth
- `POST /api/auth/login` — Sign in
- `POST /api/auth/change-password` — Set new password
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Current session

### Users (Admin only for mutations)
- `GET /api/users` — List all users
- `POST /api/users` — Create user (returns OTP)
- `PUT /api/users/:id/role` — Change role
- `PUT /api/users/:id/status` — Activate/deactivate
- `PUT /api/users/:id/reset-password` — Issue new OTP
- `PUT /api/users/:id/unlock` — Reset failed attempts

### Requirements
- `GET /api/requirements` — List all
- `POST /api/requirements` — Create
- `PUT /api/requirements/:reqId` — Update
- `DELETE /api/requirements/:reqId` — Delete (Admin/Manager only)

### Test Cases
- `GET /api/testcases` — List all
- `POST /api/testcases/generate` — Generate via Claude API
- `PUT /api/testcases/:tcId/status` — Update status

### Knowledge Base
- `GET /api/kb` — List all
- `POST /api/kb` — Create entry

### MCP Settings
- `GET /api/mcp/settings` — List all MCP servers (all authenticated users)
- `POST /api/mcp/settings` — Add MCP server (Admin only)
- `PUT /api/mcp/settings/:id` — Update MCP server (Admin only)
- `DELETE /api/mcp/settings/:id` — Remove MCP server (Admin only)
- `POST /api/mcp/settings/:id/test` — Test connection (Admin only, 5s timeout)
- `PUT /api/mcp/settings/:id/toggle` — Quick enable/disable (Admin only)

### Audit & Jama
- `GET /api/audit` — Audit log (Admin only)
- `GET /api/jama/log` — Export log
- `POST /api/jama/export` — Simulate Jama export (Manager+)

## Development

```bash
# Terminal 1: Start server with auto-reload
npm run dev

# Terminal 2: Start Vite dev server with hot reload
cd client && npm run dev
```

The Vite dev server runs on port 5173 and proxies `/api` requests to port 3000.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key for TC generation |
| `SESSION_SECRET` | Yes | dev fallback | Session encryption secret |
| `SERVER_ENCRYPTION_KEY` | Recommended | — | AES-256-GCM key for MCP auth token encryption at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | No | 3000 | Server port |
| `ANTHROPIC_MODEL` | No | claude-sonnet-4-20250514 | Model for generation |
| `DB_PATH` | No | ./data/testforge.db | SQLite database path |

## Remote Access

To make TestForge accessible from a remote server:

1. **Firewall** — Open port 3000 (e.g. `sudo ufw allow 3000/tcp`) and configure cloud security groups if applicable
2. **Reverse proxy (recommended)** — Put Nginx or Caddy in front for SSL/TLS termination and domain handling
3. **Session security** — Add `secure: true` to the session cookie config in `server/index.js` when behind HTTPS
4. **CORS** — Lock down `cors({ origin: true })` in `server/index.js` to your specific domain
5. **Secrets** — Ensure `SESSION_SECRET` and `SERVER_ENCRYPTION_KEY` are strong random values, and that `.env` is never committed

## Audit Trail

All MCP configuration changes are logged to the audit trail with the following action types:

| Action | Trigger |
|--------|---------|
| `MCP_CREATED` | New MCP server added |
| `MCP_UPDATED` | Server settings modified (logs specific changes) |
| `MCP_DELETED` | Server removed |
| `MCP_TEST` | Connection test attempted (logs status or failure) |
| `MCP_TOGGLED` | Server enabled or disabled |
