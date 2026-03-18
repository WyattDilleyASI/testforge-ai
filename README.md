# ◈ TestForge AI — AI-Powered Test Case Generation Tool

**v1.2** — Accelerating QA through intelligent automation with full requirement traceability.

TestForge AI ingests requirements, leverages a Knowledge Base of historical defects and business rules, and generates structured draft test cases via the Claude API — giving QA engineers a starting point, not a finished product. Every generated test case traces back to specific requirement IDs, ensuring complete coverage visibility from ingestion through export.

---

## Table of Contents

- [Screenshots](#screenshots)
- [Quick Start (Docker)](#quick-start-docker)
- [Alternative: Run Directly (Node.js)](#alternative-run-directly-nodejs)
- [Default Credentials](#default-credentials)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Core Capabilities](#core-capabilities)
- [Authentication & RBAC](#authentication--rbac)
- [MCP Integration](#mcp-integration)
- [API Reference](#api-reference)
- [FRD Traceability](#frd-traceability)
- [Security](#security)
- [Development](#development)
- [Remote Access & Production Hardening](#remote-access--production-hardening)

---

## Screenshots

> All screenshots shown using the **Frutiger Aero** theme. TestForge ships with 16 built-in themes selectable from Settings → User Preferences.

### Login

<img width="2558" height="1282" alt="Login" src="https://github.com/user-attachments/assets/e74e1192-247e-4cb9-bd06-6dde45db34b4" />

A clean, centered sign-in screen branded with the TestForge AI logo and version identifier. Username and password fields with a single Sign In button — no registration link, since accounts are provisioned by Admins. The footer references FRD requirement UM-008, reminding users that accounts lock after 5 failed attempts. First-time users sign in with an Admin-issued OTP and are immediately prompted to set their own password.

### Coverage Dashboard

<img width="2558" height="1283" alt="Dashboard" src="https://github.com/user-attachments/assets/4510e8ca-f358-46f0-9aa2-72ec1d6a4e7a" />

The landing page for every session. At a glance you see requirement coverage percentage, draft test cases awaiting review, engineer-approved test cases, and knowledge base entry count — each linking to the relevant FRD requirement ID (RS-007, TC-003A, KB-001). Below that, Claude API usage metrics (tokens consumed, API calls, budget status) give visibility into generation costs. The bottom half lists every untested requirement sorted by priority (MUST HAVE / SHOULD HAVE) so engineers know exactly where to focus next.

### Requirements

<img width="2557" height="1282" alt="Requirements" src="https://github.com/user-attachments/assets/7c6f9543-540a-452c-a7a2-eaa6a3e6fc61" />

All ingested requirements in a single scrollable list. Each card shows the requirement's Jama ID (e.g. `LFWM2-PRD_Rqmts-3`), full description text, source badge (JAMA), priority level (MUST HAVE), approval status (APPROVED), and downstream traceability references (TC: LFWM2-SYSRQ-xxx). Requirements can be imported directly from Jama DOC files, added manually, or cleared in bulk. The Edit button on each card opens an inline editor for description and acceptance criteria.

### Test Case Generation

<img width="2558" height="1291" alt="Test_Cases" src="https://github.com/user-attachments/assets/9babe6ca-15fb-48c7-b01a-b93330e00a54" />

The core workflow. Select a requirement from the dropdown, choose generation depth (Basic 2–3 / Standard 4–6 / Comprehensive 7–10), and optionally filter by test focus areas (Safety Critical, UI/UX Validation, Boundary Analysis, Error Recovery, Regression). Click **Generate Drafts** and the Claude API produces structured test cases — each with a unique ID (e.g. `TC-LFWM2-SubSys_Rqmt-186-001`), requirement traceability link, and test type badge (HAPPY PATH, NEGATIVE, BOUNDARY, EDGE CASE). A yellow DRAFT disclaimer banner reminds engineers that AI output requires human review. The Library / Session View tabs separate the full test case library from the current generation session. When no API key is configured, a fallback "Copy Prompt / Import Response" workflow lets teams use claude.ai manually.

### SysML Traceability Diagram

<img width="2558" height="1287" alt="SysML" src="https://github.com/user-attachments/assets/3a5fd845-2f9a-4ec3-97b7-d41cce4f83e2" />

A fully interactive D3-powered requirements diagram that visualizes the entire hierarchy — from product-level requirements down through system, subsystem, and component requirements — with containment edges, cross-references, and verify links to test cases. The right-side Finder panel lists all 191 nodes and supports search by ID or name. Toggle **TCs On** to overlay test case nodes on the diagram. The bottom TACO Assessment section evaluates each requirement against T (Testable), A (Atomic), C (Complete), and O (Observable) criteria, reporting overall compliance (e.g. 158/171 = 92% fully compliant). Zoom, pan, fit-to-view, and SVG export controls are in the top-right toolbar.

### Knowledge Base

<img width="2557" height="1280" alt="Knowledge_Base" src="https://github.com/user-attachments/assets/74e0e83b-1a6d-4baa-b115-031b8cbeda99" />

Tagged entries that inform AI test case generation. Each entry has a structured ID (KB-E001 – KB-E005+), type badge (DEFECT HISTORY, SYSTEM BEHAVIOR, BUSINESS RULE), descriptive content, and linked tags for requirements (e.g. RS-001, RS-003), test cases (TC-002), Jama IDs (JM-007, JM-003), and custom tags (PDF, OCR, field-mapping, parsing, acceptance-criteria). Entries can include attached images with descriptions — useful for capturing UI screenshots of historical defects or setup procedures. The usage counter tracks how many times each entry has been injected into generation prompts.

### Settings — User Preferences & Themes

<img width="2558" height="1283" alt="Settings" src="https://github.com/user-attachments/assets/ec99dc33-a8d3-4f84-8b8e-810b1981218f" />

The Settings page (Admin-only for MCP and User Management sub-pages) opens to User Preferences by default. The Theme picker offers 16 appearance options: Midnight, Cherry Blossom, Wacky, Eye Bleed, Forest, Ocean, Sunset, Lavender, Retro Terminal, Nord, Light, Frutiger Aero, Chromawave, Hyperdrive, Solarized Dark, and Catppuccin. Additional settings sub-pages include Product Context (domain terms and example test cases for prompt tuning), User Management (CRUD, role assignment, OTP reset, account lockout), MCP Server Setup (token CRUD, config download, Claude Desktop/Code/Web connection guides), and Jama Connect configuration.

### Settings — MCP Server Setup

<img width="2557" height="1283" alt="MCP_Setup" src="https://github.com/user-attachments/assets/0d4f9823-fcf1-4b1e-bdc1-569c1d859f41" />

The Admin-only MCP integration page. The top section explains the key value proposition: no API key needed, billing goes through the user's own Claude account, and Claude gets full tool access to read requirements, generate test cases, search the KB, and save results directly. The Prerequisites section walks through downloading the `mcp-bridge.mjs` bridge script (3 KB, zero dependencies, Node.js 18+) and verifying the TestForge server URL. Below that, the MCP Access Tokens panel provides a form to name a token, enter the local path to the bridge script, and generate a token — the full token value is shown only once at creation time. Existing tokens are listed in a table with name, masked preview, creation date, last-used timestamp, and a Revoke button. After token creation, auto-install terminal commands (PowerShell / bash) and downloadable config files are provided for Claude Desktop, Claude Code, and Claude Web.

### Deferred to v2

<img width="2557" height="1281" alt="Deferred" src="https://github.com/user-attachments/assets/550ccffb-5047-4a14-9f29-3d035937c3da" />

A transparency page documenting features intentionally scoped out of v1 and planned for v2. Each card shows a DEFERRED badge, feature name, FRD requirement IDs, and a brief explanation of what v1 provides versus what v2 will add. Current deferred items include the Adaptive Learning Engine (AL-001 – AL-008), Confluence KB Import (KB-007), and SSO / External Identity (UM-xxx). This page ensures the FRD is fully traceable even for features not yet implemented.

---

## Quick Start (Docker)

Docker is the recommended way to run TestForge. The entire stack — Express API, React SPA, and SQLite — runs in a single container with a persistent named volume for data.

```bash
# 1. Clone the repository
git clone https://github.com/<your-org>/testforge-ai.git
cd testforge-ai

# 2. Configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY, SESSION_SECRET, and SERVER_ENCRYPTION_KEY

# 3. Build and run
docker-compose up -d --build
```

Open **http://localhost:3000** — that's it.

### What Docker gives you

- **Persistent volume** (`testforge-data`) — SQLite database survives container restarts and rebuilds
- **Environment injection** — API keys and secrets passed via environment variables, never baked into the image
- **Auto-restart** — `restart: unless-stopped` keeps the service running through host reboots and crashes
- **Single container** — no database server or reverse proxy required for internal use
- **Configurable port** — default `3000:3000`, easily placed behind nginx, Traefik, or a cloud load balancer

> **Note:** Docker rebuilds wipe the container filesystem. Because the SQLite database lives on a named volume, your data persists — but MCP tokens stored only in the container's memory context (e.g. active sessions) will reset. Plan accordingly for deployment workflows.

---

## Alternative: Run Directly (Node.js)

If you prefer running without Docker (local development, etc.):

```bash
# 1. Clone and enter the directory
git clone https://github.com/<your-org>/testforge-ai.git
cd testforge-ai

# 2. Configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY, SESSION_SECRET, and SERVER_ENCRYPTION_KEY

# 3. Install dependencies and build the frontend
npm install
cd client && npm install && npm run build && cd ..

# 4. Start the server
npm start
```

Open **http://localhost:3000**.

---

## Default Credentials

| Username | Password | Notes |
|----------|----------|-------|
| `admin` | `admin` | You will be prompted to change the password on first login |

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** | — | Claude API key for test case generation |
| `SESSION_SECRET` | **Yes** | dev fallback | Session encryption secret — change in production |
| `SERVER_ENCRYPTION_KEY` | Recommended | — | AES-256-GCM key for MCP auth token encryption at rest |
| `PORT` | No | `3000` | Server port |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Model used for generation |
| `DB_PATH` | No | `./data/testforge.db` | SQLite database file path |

**Generate an encryption key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Architecture

```
testforge-ai/
├── server/
│   ├── index.js            Express server (serves API + static frontend)
│   ├── db.js               SQLite database layer (schema, seeds, helpers)
│   ├── auth.js             Authentication middleware (session-based)
│   ├── crypto.js           AES-256-GCM encryption for MCP auth tokens
│   ├── mcp.js              MCP server (9 tools for Claude Desktop/Code/Web)
│   └── routes/
│       ├── auth.js         Login, logout, password change
│       ├── users.js        User CRUD, role changes, OTP reset
│       ├── requirements.js Requirement ingestion and editing
│       ├── testcases.js    TC generation via Claude API, status updates
│       ├── mcp.js          MCP server configuration (Admin only)
│       └── data.js         Knowledge Base, audit log, Jama export
├── client/
│   ├── src/
│   │   ├── App.jsx         Full React frontend (single-file SPA)
│   │   ├── SysMLTraceability.jsx   Interactive D3 requirements diagram
│   │   ├── api.js          API client helper
│   │   └── main.jsx        Entry point
│   ├── index.html
│   └── vite.config.js      Build config with dev proxy
├── mcp-bridge.mjs          Stdio-to-SSE bridge for Claude Desktop
├── data/                   SQLite databases (auto-created)
├── .env.example            Environment template
├── Dockerfile              Container build (Node 20 Alpine)
├── docker-compose.yml      One-command deployment
└── package.json            Server dependencies
```

**Stack:** Node.js/Express · React 18 (Vite) · SQLite (better-sqlite3, WAL mode) · D3.js (SysML diagrams) · Claude API (`@anthropic-ai/sdk`) · MCP SDK (`@modelcontextprotocol/sdk`) · Docker

---

## Core Capabilities

### Requirement Ingestion (RS-001 – RS-007)

Ingest requirements via plain text, markdown, JSON, CSV, or PDF. Import directly from Jama DOC exports with automatic ID preservation and hierarchy mapping. The system parses acceptance criteria into individual testable statements and flags ambiguous or untestable requirements for clarification.

### AI Test Case Generation (TC-001 – TC-009)

Select a requirement, choose generation depth (basic / standard / comprehensive), and generate 2–10 draft test cases via the Claude API. Each test case includes a structured ID, title, linked requirement IDs, preconditions, steps, expected results, and pass/fail criteria. All AI-generated test cases are marked **DRAFT** with a disclaimer — engineers review, augment, then approve. Optional test focus filters (Safety Critical, UI/UX Validation, Boundary Analysis, Error Recovery, Regression) steer the AI toward specific coverage goals.

### Knowledge Base–Informed Generation (KB-001 – KB-006)

Tag Knowledge Base entries (defect history, business rules, environment constraints) to requirement IDs. During generation, relevant KB context is injected into the Claude prompt, producing test cases informed by organizational memory. Entries support image attachments with AI-generated descriptions for visual context (e.g. UI screenshots of historical defects).

### SysML Traceability Diagram (TC-007)

An interactive D3-powered visualization of the full requirements hierarchy — product, system, subsystem, and component levels — with containment edges, cross-references, and verify links to test cases. Includes TACO assessment (Testable, Atomic, Complete, Observable) scoring per requirement, a searchable Finder panel, SVG export, and zoom/pan controls.

### Coverage Dashboard (RS-007)

Real-time metrics across the entire requirement set: coverage percentage, draft count, reviewed count, KB entry count, Claude API token usage, and a prioritized list of untested requirements. Each metric card links to its governing FRD requirement ID.

### Review, Approve & Export (TC-003a, JM-001 – JM-009)

Only reviewed test cases with valid requirement links pass pre-export validation (JM-004) for Jama Connect sync. Export to XLSX is available for all test cases. The export pipeline includes a simulation mode and full audit logging.

---

## Authentication & RBAC

TestForge uses session-based authentication with a three-tier role model:

| Role | Capabilities |
|------|-------------|
| **Admin** | Full system access — user management, MCP settings, audit log, all mutations |
| **QA Manager** | Requirement and test case management, Jama export, KB management |
| **QA Engineer** | Requirement viewing, test case generation and review, KB viewing |

**Authentication flow:**

1. **Default admin** — `admin` / `admin`, must change password on first login
2. **New users** — Admin creates account → OTP generated → user signs in → prompted to set own password
3. **Password reset** — Admin issues a new OTP for any user
4. **Account lockout** — 5 failed login attempts locks the account (UM-008); Admin unlock required
5. **Session timeout** — 60-minute session expiry (UM-009)

---

## MCP Integration

TestForge exposes a Model Context Protocol (MCP) server so that **Claude calls TestForge** — no API key management on the client side. Claude Desktop, Claude Code, and Claude Web can interact with requirements, test cases, and the knowledge base directly.

### MCP Tools (9 available)

The MCP server (`server/mcp.js`) exposes tools for listing/searching requirements, listing/creating test cases, managing knowledge base entries, and checking coverage — all scoped to the authenticated user.

### Connecting Claude Desktop

TestForge uses a **stdio-to-SSE bridge** (`mcp-bridge.mjs`) for Claude Desktop compatibility. The full setup flow is managed through the admin UI under **Settings & MCP**:

1. **Download `mcp-bridge.mjs`** from the Settings page (or copy it from the repo root)
2. **Create an MCP token** — enter a name and the full path to `mcp-bridge.mjs` on your machine
3. **Install the config** — use the auto-install terminal command (PowerShell/bash) or download the `claude_desktop_config.json` file directly
4. **Restart Claude Desktop** — fully quit (system tray → Quit), reopen, and verify under Settings → Developer

**Claude Desktop config format (stdio):**

```json
{
  "mcpServers": {
    "testforge": {
      "command": "node",
      "args": ["/full/path/to/mcp-bridge.mjs"],
      "env": {
        "MCP_TOKEN": "tfmcp_your_token_here",
        "TESTFORGE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Connecting Claude Code

```bash
claude mcp add testforge \
  --transport sse \
  --url http://localhost:3000/mcp/sse \
  --header "Authorization: Bearer tfmcp_your_token_here"
```

### Connecting Claude Web

In Claude.ai → Settings → Connected Apps → Add MCP Server:

```
URL:     http://localhost:3000/mcp/sse
Header:  Authorization: Bearer tfmcp_your_token_here
```

### MCP Access Control

| Role | Permissions |
|------|------------|
| Admin | Full CRUD on MCP servers, test connections, toggle enabled/disabled, token management |
| QA Manager | View configured servers (read-only) |
| QA Engineer | View configured servers (read-only) |

### Auth Token Encryption

MCP auth tokens are encrypted at rest using AES-256-GCM via `server/crypto.js`. This requires the `SERVER_ENCRYPTION_KEY` environment variable. If the key is not set, tokens are stored unencrypted and a warning is logged.

### Known Considerations

- **Claude Desktop config path varies by install type:** Standard installer uses `%APPDATA%\Claude\`, Windows Store (MSIX) redirects to `%LOCALAPPDATA%\Packages\AnthropicPBC.Claude_<hash>\LocalCache\Roaming\Claude\`. The universal method is Settings → Developer → Edit Config inside Claude Desktop.
- **Absolute paths are more reliable** than PATH resolution in the MSIX version of Claude Desktop.
- **Docker rebuilds invalidate MCP tokens** — create new tokens after rebuilding the container if the database volume was not preserved.
- **The bridge script includes reconnect-with-backoff** (exponential, up to 30 retries) to survive container rebuilds and network interruptions.

---

## API Reference

All endpoints require authentication (session cookie) unless noted.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/change-password` | Set new password |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Current session |

### Users (Admin only for mutations)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create user (returns OTP) |
| `PUT` | `/api/users/:id/role` | Change role |
| `PUT` | `/api/users/:id/status` | Activate/deactivate |
| `PUT` | `/api/users/:id/reset-password` | Issue new OTP |
| `PUT` | `/api/users/:id/unlock` | Reset failed attempts |

### Requirements
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/requirements` | List all |
| `POST` | `/api/requirements` | Create |
| `PUT` | `/api/requirements/:reqId` | Update |
| `DELETE` | `/api/requirements/:reqId` | Delete (Admin/Manager only) |

### Test Cases
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/testcases` | List all |
| `POST` | `/api/testcases/generate` | Generate via Claude API |
| `PUT` | `/api/testcases/:tcId/status` | Update status |

### Knowledge Base
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kb` | List all entries |
| `POST` | `/api/kb` | Create entry |

### MCP Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mcp/settings` | List all MCP servers (all authenticated users) |
| `POST` | `/api/mcp/settings` | Add MCP server (Admin only) |
| `PUT` | `/api/mcp/settings/:id` | Update MCP server (Admin only) |
| `DELETE` | `/api/mcp/settings/:id` | Remove MCP server (Admin only) |
| `POST` | `/api/mcp/settings/:id/test` | Test connection (Admin only, 5s timeout) |
| `PUT` | `/api/mcp/settings/:id/toggle` | Quick enable/disable (Admin only) |

### MCP Transport
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/mcp/sse` | SSE endpoint for MCP connections |
| `POST` | `/mcp/messages` | JSON-RPC message relay |

### MCP Tokens
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mcp/tokens` | List current user's tokens (masked) |
| `POST` | `/api/mcp/tokens` | Create new token (full value returned once) |
| `DELETE` | `/api/mcp/tokens/:id` | Revoke a token |

### Audit & Jama
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/audit` | Audit log (Admin only) |
| `GET` | `/api/jama/log` | Export log |
| `POST` | `/api/jama/export` | Simulate Jama export (Manager+) |

---

## FRD Traceability

Every feature maps to specific FRD v1.2 requirement IDs:

| Module | REQ IDs | Implementation |
|--------|---------|----------------|
| Requirement Ingestion | RS-001 – RS-007 | CRUD + acceptance criteria parsing |
| Test Case Generation | TC-001 – TC-009 | Claude API generation, Session View, Draft disclaimer |
| Knowledge Base | KB-001 – KB-006 | Tagged entries, KB-informed generation, image attachments |
| User Management | UM-001 – UM-009 | RBAC, OTP flow, audit log, lockout |
| Jama Integration | JM-001 – JM-009 | Pre-export validation, XLSX export, simulated sync |
| SysML Traceability | TC-007 | Interactive D3 diagram, TACO assessment, SVG export |
| MCP Server Config | Admin Config | Admin-only CRUD, connection testing, token encryption |
| Deferred (v2) | AL-001 – AL-008, KB-007 | Documented in Deferred view |

---

## Security

TestForge implements defense-in-depth across every layer:

- **Password encryption** — bcrypt (cost factor 10); OTPs generated with a 54-character alphanumeric pool; plaintext passwords never stored or logged
- **Session security** — sessions encrypted with `SESSION_SECRET`, stored server-side in SQLite via `connect-sqlite3`; cookies are `httpOnly` and `sameSite: lax`
- **Helmet.js headers** — HTTP security headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.) applied globally
- **RBAC enforcement** — three-tier role model with server-side middleware checks on every mutation; role escalation prevented at the API layer
- **Account lockout** — 5 failed login attempts locks the account; Admin unlock required; failed attempts logged to the audit trail
- **API key isolation** — Anthropic API key stored server-side only, never sent to the browser; all Claude API calls happen on the Express backend
- **MCP token encryption** — AES-256-GCM at rest via `SERVER_ENCRYPTION_KEY`
- **Audit trail** — every login, password change, role change, TC generation, MCP config change, and export logged with timestamp, user, action, and status

### Audit Action Types

| Action | Trigger |
|--------|---------|
| `MCP_CREATED` | New MCP server added |
| `MCP_UPDATED` | Server settings modified (logs specific changes) |
| `MCP_DELETED` | Server removed |
| `MCP_TEST` | Connection test attempted (logs status or failure) |
| `MCP_TOGGLED` | Server enabled or disabled |
| `MCP_TOKEN_CREATED` | New MCP auth token generated |
| `MCP_TOKEN_DELETED` | MCP auth token revoked |

---

## Development

```bash
# Terminal 1 — Start the Express server with auto-reload
npm run dev

# Terminal 2 — Start the Vite dev server with hot reload
cd client && npm run dev
```

The Vite dev server runs on port **5173** and proxies `/api` requests to port **3000**.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the production server |
| `npm run dev` | Start with `--watch` for auto-reload |
| `npm run build:client` | Install client deps and build the React SPA |
| `npm run setup` | Full install (server + client + build) |

---

## Remote Access & Production Hardening

To make TestForge accessible from a remote server:

1. **Firewall** — open port 3000 (e.g. `sudo ufw allow 3000/tcp`) and configure cloud security groups if applicable
2. **Reverse proxy (recommended)** — put Nginx or Caddy in front for SSL/TLS termination and domain handling
3. **Session security** — add `secure: true` to the session cookie config in `server/index.js` when behind HTTPS
4. **CORS** — lock down `cors({ origin: true })` in `server/index.js` to your specific domain
5. **Secrets** — ensure `SESSION_SECRET` and `SERVER_ENCRYPTION_KEY` are strong random values, and that `.env` is never committed
6. **Default password** — change the `admin` password immediately after first deployment

---

## License

Internal tool — see your organization's licensing policy.
