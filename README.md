# ◈ TestForge AI — AI-Powered Test Case Generation Tool

**v1.3** — Accelerating QA through intelligent automation with full requirement traceability.

TestForge AI ingests requirements, leverages a hierarchical Knowledge Base of historical defects and business rules, and generates structured draft test cases via the Claude API — giving QA engineers a starting point, not a finished product. Every generated test case traces back to specific requirement IDs, ensuring complete coverage visibility from ingestion through export.

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

The landing page for every session. At a glance you see requirement coverage percentage, draft test cases awaiting review, engineer-approved test cases, and knowledge base entry count — each linking to the relevant FRD requirement ID (RS-007, TC-003A, KB-001). Below that, Claude API usage metrics (tokens consumed, API calls, budget status) give visibility into generation costs. The bottom half lists every untested requirement sorted by priority (MUST HAVE / SHOULD HAVE) so engineers know exactly where to focus next. Per-section KB coverage progress bars show how well each knowledge base section is populated relative to its linked requirements.

### Requirements

<img width="2557" height="1282" alt="Requirements" src="https://github.com/user-attachments/assets/7c6f9543-540a-452c-a7a2-eaa6a3e6fc61" />

All ingested requirements in a single scrollable list. Each card shows the requirement's Jama ID (e.g. `LFWM2-PRD_Rqmts-3`), full description text, source badge (JAMA), priority level (MUST HAVE), approval status (APPROVED), and downstream traceability references (TC: LFWM2-SYSRQ-xxx). Requirements can be imported directly from Jama DOC files, added manually, or cleared in bulk. The Edit button on each card opens an inline editor for description and acceptance criteria.

### Test Case Generation

<img width="2558" height="1291" alt="Test_Cases" src="https://github.com/user-attachments/assets/9babe6ca-15fb-48c7-b01a-b93330e00a54" />

The core workflow. Select a requirement from the dropdown, choose generation depth (Basic 2–3 / Standard 4–6 / Comprehensive 7–10), and optionally filter by test focus areas (Safety Critical, UI/UX Validation, Boundary Analysis, Error Recovery, Regression). Click **Generate Drafts** and the Claude API produces structured test cases — each with a unique ID (e.g. `TC-LFWM2-SubSys_Rqmt-186-001`), requirement traceability link, and test type badge (HAPPY PATH, NEGATIVE, BOUNDARY, EDGE CASE). A yellow DRAFT disclaimer banner reminds engineers that AI output requires human review. The Library / Session View tabs separate the full test case library from the current generation session. When no API key is configured, a fallback "Copy Prompt / Import Response" workflow lets teams use claude.ai manually. TestLink XML import is also supported — upload an XML export, optionally enhance legacy test cases with KB context via the Claude API, and import them into the library with original external IDs preserved.

### SysML Traceability Diagram

<img width="2558" height="1287" alt="SysML" src="https://github.com/user-attachments/assets/3a5fd845-2f9a-4ec3-97b7-d41cce4f83e2" />

A fully interactive D3-powered requirements diagram that visualizes the entire hierarchy — from product-level requirements down through system, subsystem, and component requirements — with containment edges, cross-references, and verify links to test cases. The right-side Finder panel lists all 191 nodes and supports search by ID or name. Toggle **TCs On** to overlay test case nodes on the diagram. The bottom TACO Assessment section evaluates each requirement against T (Testable), A (Atomic), C (Complete), and O (Observable) criteria, reporting overall compliance (e.g. 158/171 = 92% fully compliant). Zoom, pan, fit-to-view, and SVG export controls are in the top-right toolbar.

### Knowledge Base

<img width="2557" height="1280" alt="Knowledge_Base" src="https://github.com/user-attachments/assets/74e0e83b-1a6d-4baa-b115-031b8cbeda99" />

A hierarchical knowledge base organized into **sections → subsections → entries** (two-level max). Sections represent product or system areas (e.g. "Mobius", "VAI"), and subsections represent modules within them (e.g. "Command", "Maps", "PDF Processing"). Each entry has a structured ID (KB-E001+), type badge (DEFECT HISTORY, SYSTEM BEHAVIOR, BUSINESS RULE, ENVIRONMENT CONSTRAINT, TEST DATA GUIDELINE), descriptive content, and linked tags for requirements, test cases, Jama IDs, and custom tags. Entries can include attached images with descriptions — useful for capturing UI screenshots of historical defects or setup procedures. The usage counter tracks how many times each entry has been injected into generation prompts.

The UI features a card-in-card nested layout, toggle-mode drag-and-drop with labeled drop zones and auto-scroll for reorganization, inline entry editing, search/filter with auto-expand, collapse/expand all controls, and subsection descriptions visible when collapsed. Uncategorized entries appear in a default section for entries not yet placed into the hierarchy.

### Settings — User Preferences & Themes

<img width="2558" height="1283" alt="Settings" src="https://github.com/user-attachments/assets/ec99dc33-a8d3-4f84-8b8e-810b1981218f" />

The Settings page (Admin-only for MCP and User Management sub-pages) opens to User Preferences by default. The Theme picker offers 16 appearance options: Midnight, Cherry Blossom, Wacky, Eye Bleed, Forest, Ocean, Sunset, Lavender, Retro Terminal, Nord, Light, Frutiger Aero, Chromawave, Hyperdrive, Solarized Dark, and Catppuccin. Additional settings sub-pages include Product Context (domain terms and example test cases for prompt tuning), User Management (CRUD, role assignment, OTP reset, account lockout), MCP Server Setup (token CRUD, config download, Claude Desktop/Code/Web connection guides), and Jama Connect configuration.

### Settings — MCP Server Setup

<img width="2557" height="1283" alt="MCP_Setup" src="https://github.com/user-attachments/assets/0d4f9823-fcf1-4b1e-bdc1-569c1d859f41" />

The Admin-only MCP integration page, rebuilt as a **4-step wizard** (Prerequisites → Create Token → Configure Claude → Test Connection) optimized for remote server deployments. The Prerequisites step explains the value proposition (no API key needed, billing through the user's own Claude account) and walks through downloading the `mcp-bridge.mjs` bridge script and verifying the TestForge server URL. The Create Token step provides a form to name a token and enter the local path to the bridge script — the full token value is shown only once at creation time. The Configure Claude step provides auto-install terminal commands (PowerShell / bash) and downloadable config files for Claude Desktop, Claude Code, and Claude Web. The Test Connection step verifies the integration is working end-to-end. Existing tokens are listed in a table with name, masked preview, creation date, last-used timestamp, and a Revoke button.

The page also includes a complete **MCP Tools Reference** listing all 15 available tools with descriptions and example prompts, **Example Workflows** demonstrating multi-tool chains (e.g. "Generate test cases for all uncovered requirements and save them"), and a **Troubleshooting** section covering common issues like malformed config JSON, missing tools, expired tokens, and Windows Store config path differences.

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

> **Gotcha:** Variables in `.env` must also be explicitly declared in the `environment` block of `docker-compose.yml` to reach the container. If something works locally but not in Docker, check this first.

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
| `TOKEN_BUDGET` | No | `200000` | Monthly token budget for Claude API usage tracking |
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
│   ├── mcp.js              MCP server (15 tools for Claude Desktop/Code/Web)
│   └── routes/
│       ├── auth.js         Login, logout, password change
│       ├── users.js        User CRUD, role changes, OTP reset
│       ├── requirements.js Requirement ingestion and editing
│       ├── testcases.js    TC generation via Claude API, status updates, TestLink import
│       ├── mcp.js          MCP server configuration (Admin only)
│       └── data.js         Knowledge Base (sections, subsections, entries), audit log, Jama export
├── client/
│   ├── src/
│   │   ├── App.jsx         Root component with routing
│   │   ├── components/
│   │   │   ├── McpTokensView.jsx       MCP setup wizard (4-step)
│   │   │   ├── TestCaseView.jsx        Test case generation & library
│   │   │   ├── KnowledgeBaseView.jsx   Hierarchical KB management
│   │   │   ├── SysMLTraceability.jsx   Interactive D3 requirements diagram
│   │   │   └── shared.jsx             Reusable UI components
│   │   ├── api.js          API client helper
│   │   ├── theme.jsx       Theme definitions (16 themes)
│   │   └── main.jsx        Entry point
│   ├── index.html
│   └── vite.config.js      Build config with dev proxy
├── mcp-bridge.mjs          Stdio-to-SSE bridge for Claude Desktop
├── data/                   SQLite databases + KB images (auto-created)
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

### TestLink Import & Enhancement

Import legacy test cases from TestLink XML exports. The import pipeline parses the XML, preserves original external IDs, and optionally enhances each test case with Knowledge Base context via the Claude API before saving — bridging the gap between legacy test suites and TestForge's structured format.

### Knowledge Base–Informed Generation (KB-001 – KB-006)

The Knowledge Base uses a **hierarchical section → subsection → entry** structure. Sections represent product or system areas, subsections represent modules within them, and entries capture specific knowledge: defect history, system behaviors, business rules, environment constraints, and test data guidelines. Each entry is tagged with requirement IDs so that during test case generation, relevant KB context is automatically injected into the Claude prompt. Entries support image attachments with descriptions for visual context (e.g. UI screenshots of historical defects).

The KB UI features card-in-card nesting, toggle-mode drag-and-drop with labeled drop zones and auto-scroll, inline editing, search/filter with auto-expand, and collapse/expand all controls. Subsection descriptions are visible when collapsed for quick scanning.

### SysML Traceability Diagram (TC-007)

An interactive D3-powered visualization of the full requirements hierarchy — product, system, subsystem, and component levels — with containment edges, cross-references, and verify links to test cases. Includes TACO assessment (Testable, Atomic, Complete, Observable) scoring per requirement, a searchable Finder panel, SVG export, and zoom/pan controls.

### Coverage Dashboard (RS-007)

Real-time metrics across the entire requirement set: coverage percentage, draft count, reviewed count, KB entry count, Claude API token usage, and a prioritized list of untested requirements. Each metric card links to its governing FRD requirement ID. Per-section KB coverage progress bars show knowledge base completeness relative to linked requirements.

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

### MCP Tools (15 available)

The MCP server (`server/mcp.js`) exposes the following tools, all scoped to the authenticated user's role:

| Tool | Description |
|------|-------------|
| `list_requirements` | List and filter all requirements |
| `get_requirement` | Get full details, KB context, and linked TCs for a requirement |
| `create_requirement` | Create a new requirement |
| `update_requirement` | Update an existing requirement's fields |
| `save_test_cases` | Generate and save test case drafts to the database |
| `list_test_cases` | List test cases with filters by requirement or status |
| `review_test_case` | Mark a test case as Reviewed or Rejected |
| `update_test_case` | Update a test case's steps, description, or type |
| `list_kb_sections` | View all KB sections and subsections with entry counts |
| `search_knowledge_base` | Search KB entries by keyword, requirement, type, or subsection |
| `create_kb_entry` | Add a new KB entry to a specific subsection |
| `update_kb_entry` | Update a KB entry's content, tags, or type |
| `add_kb_images` | Attach images to a KB entry (base64) |
| `remove_kb_image` | Remove an image from a KB entry by index |
| `get_coverage_summary` | Get overall test coverage statistics |

### Setup Wizard

The MCP setup is managed through a **4-step wizard** under **Settings → MCP Tokens**:

1. **Prerequisites** — Verify Claude Desktop is installed, download `mcp-bridge.mjs` (3 KB, zero dependencies, Node.js 18+), and confirm the TestForge server URL is reachable
2. **Create Token** — Enter a token name and the full local path to `mcp-bridge.mjs`; the full token value is shown only once
3. **Configure Claude** — Auto-install terminal commands (PowerShell / bash) and downloadable config files for Claude Desktop, Claude Code, and Claude Web
4. **Test Connection** — Verify the integration is working end-to-end

The wizard also includes example workflows (batch generation, coverage gap analysis, KB building) and a troubleshooting section for common issues.

### Connecting Claude Desktop

TestForge uses a **stdio-to-SSE bridge** (`mcp-bridge.mjs`) for Claude Desktop compatibility.

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
- **PowerShell encoding:** `Out-File -Encoding utf8` adds a BOM that breaks JSON configs. The setup wizard uses `[System.IO.File]::WriteAllText()` for BOM-free output. Multi-line pastes are avoided via base64-encoded single-line commands.
- **Clipboard on HTTP:** `navigator.clipboard.writeText` is undefined on non-HTTPS origins. The app includes `document.execCommand("copy")` fallbacks for HTTP deployments.

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
| `GET` | `/api/testcases/export/xlsx` | Export to XLSX (optional `?ids=` filter) |
| `POST` | `/api/testcases/import-doc` | Import from document file |
| `POST` | `/api/testcases/parse-xml` | Parse TestLink XML export |
| `POST` | `/api/testcases/enhance-xml-tc` | Enhance a TestLink TC with KB context via Claude |
| `POST` | `/api/testcases/import-xml-confirmed` | Import an enhanced TestLink TC |

### Knowledge Base — Entries
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kb` | List all entries |
| `POST` | `/api/kb` | Create entry (with optional `subsection_id`) |
| `PUT` | `/api/kb/:kbId` | Update entry |
| `DELETE` | `/api/kb/:kbId` | Delete entry |

### Knowledge Base — Sections & Subsections
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kb/sections` | List all sections with subsections and entry counts |
| `POST` | `/api/kb/sections` | Create section |
| `PUT` | `/api/kb/sections/:sectionId` | Rename section |
| `DELETE` | `/api/kb/sections/:sectionId` | Delete section (moves entries to Uncategorized) |
| `POST` | `/api/kb/subsections` | Create subsection |
| `PUT` | `/api/kb/subsections/:subsectionId` | Rename or update subsection |
| `DELETE` | `/api/kb/subsections/:subsectionId` | Delete subsection |

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
| Test Case Generation | TC-001 – TC-009 | Claude API generation, Session View, Draft disclaimer, TestLink import |
| Knowledge Base | KB-001 – KB-006 | Hierarchical sections/subsections, tagged entries, KB-informed generation, image attachments |
| User Management | UM-001 – UM-009 | RBAC, OTP flow, audit log, lockout |
| Jama Integration | JM-001 – JM-009 | Pre-export validation, XLSX export, simulated sync |
| SysML Traceability | TC-007 | Interactive D3 diagram, TACO assessment, SVG export |
| MCP Server Config | Admin Config | Admin-only CRUD, connection testing, token encryption, 4-step setup wizard |
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

### Development Notes

- **Vite file resolution:** Vite resolves `.js` before `.jsx`. If a `theme.js` and `theme.jsx` both exist, the `.js` file will shadow the `.jsx`. Delete the competing file if you encounter unexpected import behavior.
- **`express.json()` vs MCP:** Global `express.json()` middleware consumes request bodies before the MCP SSE transport can read them on `/mcp/messages`. The server conditionally skips this middleware for MCP routes.
- **SQLite on Docker/Windows:** Avoid Windows bind mounts via `/mnt/c/` due to POSIX file locking issues with the 9P protocol. Use named Docker volumes instead.

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
