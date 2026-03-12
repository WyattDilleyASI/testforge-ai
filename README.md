# ◈ TestForge AI — Test Creation Tool v1.2

AI-powered test case generation with full requirement traceability, built to the FRD v1.2 specification. This branch adds **MCP (Model Context Protocol) server integration**, allowing Claude Desktop, Claude Code, and other MCP-compatible clients to interact with TestForge directly.

## Quick Start

### Option A: Run Directly (Node.js)

```bash
# 1. Clone/download and enter the directory
cd testforge-ai

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY and change SESSION_SECRET

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
# Edit .env — add your ANTHROPIC_API_KEY and change SESSION_SECRET

# 2. Build and run
docker-compose up -d --build
```

Open **http://localhost:3000**.

## Architecture

```
testforge-ai/
├── server/
│   ├── index.js              Express server (serves API + static frontend + MCP)
│   ├── db.js                 SQLite database layer (schema, seeds, helpers)
│   ├── auth.js               Authentication middleware (session-based)
│   ├── mcp.js                MCP server (SSE transport, tools, token auth)
│   └── routes/
│       ├── auth.js           Login, logout, password change
│       ├── users.js          User CRUD, role changes, OTP reset
│       ├── requirements.js   Requirement ingestion and editing
│       ├── testcases.js      TC generation via Claude API, status updates
│       └── data.js           Knowledge Base, audit log, Jama export
├── client/
│   ├── src/
│   │   ├── App.jsx           Full React frontend
│   │   ├── api.js            API client helper
│   │   └── main.jsx          Entry point
│   ├── index.html
│   └── vite.config.js        Build config with dev proxy
├── mcp-bridge.mjs            Downloadable MCP bridge script for local clients
├── data/                     SQLite databases (auto-created)
├── .env.example              Environment template
├── Dockerfile                Container build
├── docker-compose.yml        One-command deployment
└── package.json              Server dependencies
```

## MCP Server Integration

TestForge exposes an MCP server over SSE, enabling Claude Desktop, Claude Code, and other MCP-compatible clients to manage requirements, generate test cases, query the knowledge base, and review coverage — all without leaving the AI assistant.

### How It Works

1. **Generate an MCP token** in the TestForge UI (Settings → MCP Tokens) or via the API.
2. **Configure your MCP client** to connect to `http://localhost:3000/mcp/sse` with the token as a Bearer credential.
3. Claude gains access to nine tools that operate directly on TestForge's database.

### MCP Authentication

MCP connections use **personal API tokens** (not session cookies). Each token is bound to a TestForge user account and inherits that user's identity for audit logging. Tokens are prefixed with `tfmcp_` and are shown only once at creation time.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_requirements` | List all requirements with optional status/module filters |
| `get_requirement` | Get full requirement details including related KB entries and linked test cases |
| `create_requirement` | Create a new requirement in TestForge |
| `save_test_cases` | Persist AI-generated test cases into the database as drafts |
| `list_test_cases` | List test cases with optional requirement/status filters |
| `review_test_case` | Update a test case's status (Draft → Reviewed or Rejected) |
| `search_knowledge_base` | Search KB entries by query, requirement tag, or type |
| `create_kb_entry` | Add a new knowledge base entry |
| `get_coverage_summary` | Get requirement coverage statistics and untested requirement list |

### Typical MCP Workflow

A typical interaction through an MCP client follows this pattern:

1. `list_requirements` — browse what needs testing
2. `get_requirement` — fetch full context (acceptance criteria, KB entries, existing TCs)
3. Claude reasons over the requirement and generates test cases
4. `save_test_cases` — persist the drafts into TestForge
5. `review_test_case` — mark TCs as Reviewed or Rejected after human review
6. `get_coverage_summary` — check overall coverage progress

All test cases saved via MCP are marked as **Draft** and tagged with `(via MCP)` in the `generated_by` field. QA engineer review is always required before use.

### MCP Client Configuration Example

For Claude Desktop, add to your MCP configuration:

```json
{
  "mcpServers": {
    "testforge": {
      "url": "http://localhost:3000/mcp/sse",
      "headers": {
        "Authorization": "Bearer tfmcp_your_token_here"
      }
    }
  }
}
```

### MCP Bridge

A downloadable bridge script is available at `GET /mcp-bridge.mjs` for local MCP client setups that require a stdio-to-SSE adapter.

## FRD Traceability

Every feature maps to specific FRD v1.2 requirement IDs:

| Module | REQ IDs | Implementation |
|--------|---------|----------------|
| Requirement Ingestion | RS-001 – RS-007 | CRUD + acceptance criteria parsing |
| Test Case Generation | TC-001 – TC-009 | Claude API generation, Session View, Draft disclaimer |
| Knowledge Base | KB-001 – KB-006 | Tagged entries, KB-informed generation |
| User Management | UM-001 – UM-009 | RBAC, OTP flow, audit log, lockout |
| Jama Integration | JM-001 – JM-009 | Pre-export validation, simulated sync |
| MCP Integration | — | SSE server, token auth, nine tools |
| Deferred (v2) | AL-001 – AL-008, KB-007 | Documented in Deferred view |

## Authentication Flow

1. **Default admin** — `admin` / `admin`, must change password on first login
2. **New users** — Admin creates account → OTP generated → user signs in → prompted to set own password
3. **Password reset** — Admin issues new OTP for any user
4. **Account lockout** — 5 failed attempts locks the account (UM-008)
5. **Session timeout** — 60 minutes (UM-009)
6. **MCP tokens** — Personal bearer tokens for MCP client connections, scoped to a user account

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
- `DELETE /api/requirements/:reqId` — Delete (Manager+ only)

### Test Cases
- `GET /api/testcases` — List all
- `POST /api/testcases/generate` — Generate via Claude API
- `PUT /api/testcases/:tcId/status` — Update status

### Knowledge Base
- `GET /api/kb` — List all
- `POST /api/kb` — Create entry

### Audit & Jama
- `GET /api/audit` — Audit log (Admin only)
- `GET /api/jama/log` — Export log
- `POST /api/jama/export` — Simulate Jama export (Manager+)

### MCP Token Management
- `GET /api/mcp/tokens` — List current user's tokens (masked)
- `POST /api/mcp/tokens` — Create a new MCP token (full token returned only at creation)
- `DELETE /api/mcp/tokens/:id` — Revoke a token

### MCP Transport
- `GET /mcp/sse` — SSE endpoint for MCP clients (Bearer token required)
- `POST /mcp/messages` — JSON-RPC message endpoint (session-scoped)
- `GET /mcp-bridge.mjs` — Download the MCP bridge adapter script

## Database Schema

### Core Tables
- `users` — Accounts with RBAC, lockout tracking, OTP state
- `requirements` — Requirements with acceptance criteria, priority, status, module
- `test_cases` — Generated test cases linked to requirements with step-level detail
- `kb_entries` — Knowledge base entries tagged to requirements
- `audit_log` — Timestamped event log for all significant actions
- `jama_export_log` — Jama export activity tracking

### MCP Table
- `mcp_tokens` — Personal MCP authentication tokens linked to user accounts; tracks creation time and last usage

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
| `PORT` | No | 3000 | Server port |
| `ANTHROPIC_MODEL` | No | claude-sonnet-4-20250514 | Model for generation |
| `DB_PATH` | No | ./data/testforge.db | SQLite database path |

## Dependencies

### Server
- `express` — HTTP server and routing
- `better-sqlite3` — SQLite database driver
- `bcryptjs` — Password hashing
- `express-session` + `connect-sqlite3` — Session management
- `@modelcontextprotocol/sdk` — MCP server SDK (SSE transport)
- `zod` — Schema validation for MCP tool parameters
- `helmet`, `cors`, `morgan`, `dotenv` — Security, logging, configuration

### Client
- `react` + `react-dom` — UI framework
- `vite` + `@vitejs/plugin-react` — Build tooling
