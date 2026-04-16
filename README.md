# ◈ TestForge AI

**v1.5** — AI-Powered Test Case Generation & Management

TestForge AI helps QA teams generate structured, traceable test cases faster. It ingests requirements (manually or from Jama Connect), leverages a Knowledge Base of historical defects and business rules, and uses the Claude API to produce draft test cases that engineers review, refine, and approve. An Adaptive Learning Engine captures feedback from every review cycle and folds it back into generation — so output quality improves over time without manual prompt tuning.

> **The workflow:** Jama Connect → TestForge (ingest, generate, review, approve) → Jama Connect (export)

---

## Table of Contents

- [Getting Started](#getting-started)
- [Page-by-Page Guide](#page-by-page-guide)
  - [Login](#login)
  - [Coverage Dashboard](#coverage-dashboard)
  - [Requirements](#requirements)
  - [Test Cases](#test-cases)
  - [SysML Traceability Diagram](#sysml-traceability-diagram)
  - [Knowledge Base](#knowledge-base)
  - [Adaptive Learning Engine](#adaptive-learning-engine)
  - [Settings](#settings)
  - [Deferred to v2](#deferred-to-v2)
- [Under the Hood](#under-the-hood)
  - [Architecture](#architecture)
  - [How the Adaptive Learning Engine Works](#how-the-adaptive-learning-engine-works)
  - [Authentication & RBAC](#authentication--rbac)
  - [MCP Integration](#mcp-integration)
  - [Security](#security)
- [API Reference](#api-reference)
- [Development & Deployment](#development--deployment)
- [FRD Traceability](#frd-traceability)

---

## Getting Started

### Docker (recommended)

```bash
git clone https://github.com/<your-org>/testforge-ai.git
cd testforge-ai
cp .env.example .env        # then edit — add ANTHROPIC_API_KEY, SESSION_SECRET, SERVER_ENCRYPTION_KEY
docker-compose up -d --build
```

Open **http://localhost:3000**. Data persists across rebuilds via the `testforge-data` named volume.

### Run Directly (Node.js)

```bash
git clone https://github.com/<your-org>/testforge-ai.git
cd testforge-ai
cp .env.example .env        # then edit
npm install && cd client && npm install && npm run build && cd ..
npm start
```

### Default Credentials

| Username | Password | Notes |
|----------|----------|-------|
| `admin` | `admin` | Must be changed on first login |

Admins create accounts and issue one-time passwords. Users set their own password on first sign-in.

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `SESSION_SECRET` | Yes | Secret for session encryption |
| `SERVER_ENCRYPTION_KEY` | Yes | AES-256 key for MCP token encryption at rest |
| `ANTHROPIC_MODEL` | No | Model override (default: `claude-sonnet-4-20250514`) |
| `PORT` | No | Server port (default: `3000`) |
| `TOKEN_BUDGET` | No | Monthly token budget limit for Claude API calls |

> **Docker note:** Variables in `.env` must also be declared in the `environment` block of `docker-compose.yml` to reach the container.

---

## Page-by-Page Guide

> All screenshots shown using the **Frutiger Aero** theme. TestForge ships with A LOT of built-in themes across dark, light, vibrant, animated, and accessibility categories — selectable from Settings → User Preferences.

---

### Login

<img width="2558" height="1282" alt="Login" src="https://github.com/user-attachments/assets/e74e1192-247e-4cb9-bd06-6dde45db34b4" />

A clean sign-in screen. No self-registration — accounts are provisioned by Admins. First-time users sign in with an Admin-issued one-time password and are immediately prompted to set their own. Accounts lock after 5 failed attempts (UM-008).

---

### Coverage Dashboard

<img width="2538" height="1248" alt="Coverage_Dashboard" src="https://github.com/user-attachments/assets/08ae1cb5-0455-499d-af77-987b10eca38e" />

The landing page after every login. At a glance: requirement coverage percentage, draft test cases awaiting review, approved count, and Knowledge Base entry count. Below that, Claude API usage metrics (tokens consumed, API calls, budget status) give visibility into generation costs. The bottom half lists every untested requirement sorted by priority so engineers know exactly where to focus next.

---

### Requirements

<img width="2560" height="1252" alt="Requirements" src="https://github.com/user-attachments/assets/decc1fd4-9821-4c24-9687-4d3750e13d65" />

All ingested requirements in a single searchable list. Each card shows the Jama ID, description, source badge, priority, approval status, and downstream traceability references to linked test cases. Requirements can be imported from Jama DOC files, added manually, or cleared in bulk. Inline editing is available for description and acceptance criteria. The system parses acceptance criteria into individual testable statements and flags ambiguous items.

---

### Test Cases

<img width="2554" height="1252" alt="Test Cases" src="https://github.com/user-attachments/assets/36a84fba-9c01-43e7-bb0e-ac57560cfa34" />

The core workflow. Select a requirement, choose generation depth (Basic 2–3 / Standard 4–6 / Comprehensive 7–10), and optionally filter by test focus areas (Safety Critical, UI/UX Validation, Boundary Analysis, Error Recovery, Regression). Click **Generate Drafts** and the Claude API produces structured test cases — each with a unique ID, requirement traceability link, and type badge (Happy Path, Negative, Boundary, Edge Case). A yellow DRAFT disclaimer reminds engineers that AI output requires human review.

The **Library** tab shows all test cases across every generation session, with search across TC ID, title, type, linked requirements, and description. The **Session View** tab isolates the current generation batch. Engineers can approve, reject (with reason tracking fed into the Adaptive Learning Engine), or edit inline.

Before generation, contextual hints from the Adaptive Learning Engine display approval rates and common edit patterns for the selected requirement, so engineers can adjust depth or focus accordingly.

**Additional capabilities:**
- **TestLink Import** — Upload a TestLink XML export, optionally enhance legacy test cases with KB context via the Claude API, and import them with original external IDs preserved.
- **Manual fallback** — When no API key is configured, a Copy Prompt / Import Response workflow lets teams use claude.ai directly.
- **XLSX export** — Export selected test cases for use outside TestForge.

---

### SysML Traceability Diagram

<img width="2566" height="1252" alt="SysML Traceability" src="https://github.com/user-attachments/assets/dd28f689-8cb1-40cb-a936-544f2cec8f8f" />

An interactive D3-powered visualization of the full requirements hierarchy — product, system, subsystem, and component levels — with containment edges, cross-references, and verify links to test cases. Toggle **TCs On** to overlay test case nodes on the diagram. The right-side Finder panel lists all nodes with search by ID or name.

The **TACO Assessment** section evaluates each requirement against four quality criteria — **T**estable, **A**tomic, **C**omplete, **O**bservable — and reports overall compliance percentage. Zoom, pan, fit-to-view, and SVG export controls are in the toolbar.

---

### Knowledge Base

<img width="2538" height="4825" alt="KB (2)" src="https://github.com/user-attachments/assets/22388afb-72b0-4441-8509-40db4ba42b65" />

A hierarchical knowledge base organized into **sections → subsections → entries** (two-level max). Sections represent product or system areas, subsections represent modules within them. Each entry has a structured ID, type badge (Defect History, System Behavior, Business Rule, Environment Constraint, Test Data Guideline), descriptive content, and linked tags for requirements, test cases, Jama IDs, and custom tags. Entries can include image attachments with descriptions for visual context. A usage counter tracks how many times each entry has been injected into generation prompts.

During test case generation, relevant KB entries matching the selected requirement's tags are automatically injected into the Claude prompt — giving the AI domain-specific context about known defects, system behaviors, and edge cases.

The UI features card-in-card nesting, toggle-mode drag-and-drop with labeled drop zones and auto-scroll for reorganization, inline editing, search/filter with auto-expand, and collapse/expand all controls.

---

### Adaptive Learning Engine

<img width="2538" height="1248" alt="AL_02" src="https://github.com/user-attachments/assets/d67aa28c-65b8-4c00-bcb5-f9bdeebdacf4" />

The analytics dashboard for TestForge's learning system. Five tabs provide visibility into generation quality and how the system adapts over time:

| Tab | Access | What it shows |
|-----|--------|---------------|
| **Overview** | All users | Generation stats, approval rates, monthly trends |
| **Feedback** | All users | Unprocessed event counts, field-level edit patterns |
| **Rules** | QA Manager+ | Active adaptive rules with confidence scores and evidence trails |
| **Exemplars** | QA Manager+ | Curated approved test cases used as few-shot examples in generation |
| **System** | Admin only | Health checks, maintenance controls, model version reset |

When engineers approve, reject, or edit a draft test case, the system passively captures that signal. Over time, patterns are distilled into adaptive rules (e.g., "always include timeout handling for API-related requirements") and curated exemplars that are injected into future generation prompts. See [How the Adaptive Learning Engine Works](#how-the-adaptive-learning-engine-works) for the full technical breakdown.

---

### Settings

Settings is divided into six sub-pages. User Preferences and Product Context are available to all users. User Management, MCP Server Setup, and Jama Connect are Admin-only.

#### User Preferences & Themes

<img width="1932" height="1240" alt="Settings_Themes" src="https://github.com/user-attachments/assets/330c027f-852d-42ae-b205-0bd9a9f11e58" />

The theme picker offers 116+ appearance options across five categories: Dark, Light, Vibrant, Animated, and Accessibility. Animated themes use canvas-based rendering for effects like particle fields, audio-reactive bars, and ambient animations.

#### Product Context

<img width="2556" height="1252" alt="Settings — Product Context" src="https://github.com/user-attachments/assets/c84f974f-1027-4bcf-99d9-87fc89db3406" />

Describe your product, who uses it, and what it does. This context is included in every AI generation prompt, giving Claude domain-specific vocabulary and awareness of your product's architecture. Key terms can be defined separately to ensure consistent terminology in generated test cases.

#### User Management

<img width="1898" height="1240" alt="Settings_User_Management" src="https://github.com/user-attachments/assets/c9d1ce4e-50f2-455e-bc4a-0b8c97d1c1de" />

Admin-only. Create, deactivate, and manage user accounts. Each user is assigned one of three roles (Admin, QA Manager, QA Engineer) that govern what they can access. Admins can issue one-time passwords for new users, reset passwords, and unlock accounts after failed login lockouts. An audit log tracks every authentication and role change event.

#### MCP Server Setup

<img width="2560" height="1248" alt="Settings — MCP Server Setup" src="https://github.com/user-attachments/assets/774d8609-f460-405c-a25c-e52a34e11808" />

Admin-only. A 4-step wizard (Prerequisites → Create Token → Configure Claude → Test Connection) for connecting Claude Desktop, Claude Code, or Claude Web to TestForge via the Model Context Protocol. No API key sharing required — each user's Claude billing stays on their own account. The wizard provides auto-install terminal commands and downloadable config files. Existing tokens are listed with creation date, last-used timestamp, and revoke controls.

The page also includes a complete MCP Tools Reference (all 15 available tools with descriptions and example prompts), Example Workflows for multi-tool chains, and a Troubleshooting section.

#### Jama Connect

<img width="2560" height="1252" alt="Settings — Jama Connect" src="https://github.com/user-attachments/assets/c1ac9d15-8ba8-40e7-a6bd-eebf6caf6631" />

Admin-only. Configure the Jama Connect integration endpoint and OAuth 2.0 credentials. The export panel shows all reviewed test cases eligible for export, with pre-export validation ensuring every TC has linked requirements and proper field mapping (JM-007). An export log tracks every sync attempt with timestamps and status.

**This only works with a Jama API key**

#### About

<img width="2538" height="1611" alt="Setting_About" src="https://github.com/user-attachments/assets/6b11efae-dc49-4e81-8719-010bc76d6d0b" />

Version info, the project mission statement, contributor credits, and a tech stack summary.

---

### Deferred to v2

<img width="2558" height="1248" alt="Deferred to v2" src="https://github.com/user-attachments/assets/9daa6a86-e7e9-403e-a02a-bf53dd44131c" />

A transparency page documenting features intentionally scoped out of v1. Each card shows a DEFERRED badge, feature name, FRD requirement IDs, and a brief explanation of what v1 provides versus what v2 will add. This ensures the FRD is fully traceable even for features not yet implemented.

---

## Under the Hood

### Architecture

```
testforge-ai/
├── server/
│   ├── index.js            Express entry point
│   ├── db.js               SQLite initialization (WAL mode, 4 databases)
│   ├── auth.js             Session auth + RBAC middleware
│   ├── crypto.js           AES-256-GCM encryption for MCP tokens
│   ├── mcp.js              MCP server (15 tools, SSE transport)
│   ├── al/                 Adaptive Learning Engine module
│   │   ├── schema.js       Table definitions & migrations
│   │   ├── feedback.js     Passive signal capture
│   │   ├── analytics.js    Dashboard aggregation
│   │   ├── rules.js        Adaptive rule CRUD & inference
│   │   ├── exemplars.js    Few-shot exemplar management
│   │   ├── maintenance.js  Retention, pruning, health checks
│   │   └── index.js        Barrel export
│   └── routes/
│       ├── auth.js         Login, logout, password flows
│       ├── data.js         Requirements, test cases, KB, Jama, product context
│       ├── testcases.js    Generation logic + AL integration
│       └── analytics.js    AL dashboard endpoints
├── client/src/
│   ├── App.jsx             Root shell, routing, theme provider
│   ├── theme.jsx           All 46+ theme definitions (single source of truth)
│   ├── api.js              Fetch wrapper for all endpoints
│   └── components/         One file per page/view
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

**Tech stack:** React 18 + Vite frontend, Node.js/Express backend, SQLite (4 databases: core, requirements, testcases, knowledge), Anthropic Claude API, MCP SDK, Docker Compose deployment.

---

### How the Adaptive Learning Engine Works

The AL Engine operates as a five-layer pipeline that turns passive engineer feedback into better generation prompts — no manual prompt tuning required.

**1. Signal Collection** — Every time an engineer approves, rejects, or edits a draft test case, the system captures the event with a structured diff of what changed. These raw events are stored in `feedback_events` with a `processed_at` flag for idempotent aggregation.

**2. Pattern Aggregation** — Processed feedback is distilled into field-level edit patterns (e.g., "engineers consistently add timeout handling to API test cases"). The system extracts signals from the noise by tracking frequency, consistency, and recency.

**3. Adaptive Rules** — Patterns that cross a confidence threshold become rules injected into the generation prompt (e.g., *"Always include error recovery steps for requirements involving network communication"*). Rules have confidence scores with half-life decay, a hard cap of 25 active rules, and automatic reset when the underlying Claude model changes.

**4. Few-Shot Exemplars** — Curated approved test cases are tagged for injection as examples in the generation prompt. Including 2–3 exemplars matching the requirement type dramatically improves first-pass quality.

**5. Data Retention & Decay** — Raw feedback events are retained for 90 days, then pruned. Rules persist indefinitely but decay in confidence over time. Orphaned exemplars are pruned automatically.

**Prompt composition** — Generation prompts are assembled from composable layers:

| Layer | Source | Updates |
|-------|--------|---------|
| Base instructions | Hand-tuned generation rules | Rarely |
| Domain context | Product Context + Knowledge Base | Per-generation |
| Adaptive rules | Active rules, scoped by category | Weekly/monthly |
| Exemplar test cases | Curated approved TCs | Weekly/monthly |
| Requirement content | The specific requirement being tested | Per-generation |

---

### Authentication & RBAC

Session-based authentication with a three-tier role model:

| Role | Capabilities |
|------|-------------|
| **Admin** | Full system access — user management, MCP settings, system maintenance, audit log |
| **QA Manager** | Requirement/TC management, Jama export, KB management, adaptive rule & exemplar management |
| **QA Engineer** | Requirement viewing, test case generation and review, KB viewing, analytics overview |

**Flow:** Default admin (`admin`/`admin`, must change on first login) → Admin creates user → OTP issued → User signs in → Sets own password. Accounts lock after 5 failed attempts; Admin unlock required.

---

### MCP Integration

TestForge exposes 15 tools via the Model Context Protocol, allowing Claude Desktop, Claude Code, and Claude Web to interact with TestForge directly. The integration uses SSE transport with a local `mcp-bridge.mjs` stdio-to-SSE bridge for Claude Desktop compatibility. Tokens are AES-256-GCM encrypted at rest.

Available tools include: listing/searching requirements, getting requirement details with KB context, generating test cases, saving test cases, managing KB entries, checking coverage status, and more. The MCP Server Setup wizard handles the full configuration flow.

---

### Security

- **Passwords** — bcrypt (cost factor 10); OTPs from a 54-character alphanumeric pool; plaintext never stored
- **Sessions** — encrypted with `SESSION_SECRET`, stored server-side in SQLite; cookies are `httpOnly` and `sameSite: lax`
- **HTTP headers** — Helmet.js (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
- **RBAC** — server-side middleware on every mutation; role escalation prevented at the API layer
- **API key isolation** — Anthropic key stored server-side only, never sent to the browser
- **MCP tokens** — AES-256-GCM at rest via `SERVER_ENCRYPTION_KEY`
- **Audit trail** — every login, password change, role change, generation, export, and MCP config change logged

---

## API Reference

All endpoints are prefixed with `/api` and require session authentication unless noted.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Current session info |
| `POST` | `/api/auth/change-password` | Change password |

### Requirements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/requirements` | List all |
| `POST` | `/api/requirements` | Create one |
| `PUT` | `/api/requirements/:id` | Update |
| `DELETE` | `/api/requirements/:id` | Delete |
| `DELETE` | `/api/requirements` | Clear all |
| `POST` | `/api/requirements/import-doc` | Import Jama DOC (multipart) |

### Test Cases

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/testcases` | List all |
| `POST` | `/api/testcases/generate` | Generate drafts for a requirement |
| `PUT` | `/api/testcases/:id/status` | Approve/reject (triggers AL feedback) |
| `PUT` | `/api/testcases/:id` | Edit fields (triggers AL feedback) |
| `DELETE` | `/api/testcases` | Bulk delete |
| `POST` | `/api/testcases/import-testlink` | Import TestLink XML |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kb` | List all entries |
| `POST` | `/api/kb` | Create entry |
| `PUT` | `/api/kb/:id` | Update entry |
| `DELETE` | `/api/kb` | Bulk delete |
| `GET` | `/api/kb/sections` | List sections/subsections |
| `POST` | `/api/kb/sections` | Create section |
| `POST` | `/api/kb/:id/images` | Upload image attachment |

### Adaptive Learning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/dashboard` | Dashboard metrics |
| `GET` | `/api/analytics/hints/:reqId` | Pre-generation hints for a requirement |
| `GET` | `/api/analytics/rules` | List all rules |
| `GET` | `/api/analytics/rules/active` | Active rules for prompt injection |
| `POST` | `/api/analytics/rules` | Create rule (Manager+) |
| `GET` | `/api/analytics/exemplars` | List exemplars |
| `POST` | `/api/analytics/exemplars` | Promote TC to exemplar (Manager+) |
| `GET` | `/api/analytics/feedback/stats` | Feedback event statistics |

### Users & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List users (Admin) |
| `POST` | `/api/users` | Create user (Admin) |
| `PUT` | `/api/users/:id/role` | Change role (Admin) |
| `PUT` | `/api/users/:id/unlock` | Unlock account (Admin) |
| `GET` | `/api/audit` | Audit log (Admin) |

### MCP & Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mcp/tokens` | List user's tokens |
| `POST` | `/api/mcp/tokens` | Create token |
| `DELETE` | `/api/mcp/tokens/:id` | Revoke token |
| `POST` | `/api/mcp/tokens/verify` | Verify a token |
| `GET` | `/api/product-context` | Get product context |
| `PUT` | `/api/product-context` | Update product context |
| `POST` | `/api/jama/export` | Export to Jama (Manager+) |
| `GET` | `/api/jama/log` | Export log |
| `GET` | `/api/usage/tokens` | Token usage stats |

---

## Development & Deployment

### Local Development

```bash
# Terminal 1 — Express server with auto-reload
npm run dev

# Terminal 2 — Vite dev server with hot reload
cd client && npm run dev
```

Vite runs on port **5173** and proxies `/api` to port **3000**.

| Command | Description |
|---------|-------------|
| `npm start` | Production server |
| `npm run dev` | Server with `--watch` |
| `npm run build:client` | Build the React SPA |
| `npm run setup` | Full install (server + client + build) |

### Production Deployment

1. **Firewall** — Open port 3000 and configure cloud security groups
2. **Reverse proxy** — Nginx or Caddy in front for SSL/TLS termination
3. **Session cookie** — Add `secure: true` when behind HTTPS
4. **CORS** — Lock `cors({ origin })` to your domain
5. **Secrets** — Ensure `SESSION_SECRET` and `SERVER_ENCRYPTION_KEY` are strong random values; never commit `.env`
6. **Backups** — The SQLite databases live in the `testforge-data` Docker volume at `/app/data`

### Development Notes

- **Vite resolution:** Vite resolves `.js` before `.jsx` — if both exist, `.js` shadows `.jsx`. Delete the competing file.
- **express.json() vs MCP:** Global JSON middleware consumes request bodies before MCP SSE transport can read them. The server conditionally skips this middleware for MCP routes.
- **SQLite on Docker/Windows:** Avoid bind mounts via `/mnt/c/` due to POSIX locking issues. Use named Docker volumes.
- **PowerShell .env files:** PowerShell's `Out-File` creates UTF-8 BOM, which can cause silent env var issues. Use `[System.IO.File]::WriteAllText()` instead.

---

## FRD Traceability

Every feature maps to specific FRD requirement IDs:

| Module | REQ IDs | Implementation |
|--------|---------|----------------|
| Requirement Ingestion | RS-001 – RS-007 | CRUD, acceptance criteria parsing, Jama DOC import |
| Test Case Generation | TC-001 – TC-009 | Claude API generation, Session View, Draft disclaimer, TestLink import |
| Knowledge Base | KB-001 – KB-006 | Hierarchical sections/subsections, tagged entries, KB-informed generation, image attachments |
| Adaptive Learning | AL-002 – AL-004 | Passive feedback capture, analytics dashboard, adaptive rules, exemplars |
| User Management | UM-001 – UM-009 | RBAC, OTP flow, audit log, lockout |
| Jama Integration | JM-001 – JM-009 | Pre-export validation, XLSX export, simulated sync |
| SysML Traceability | TC-007 | Interactive D3 diagram, TACO assessment, SVG export |
| MCP Server Config | Admin Config | Token CRUD, connection testing, encryption, 4-step setup wizard |
| Deferred (v2) | KB-007, UM-xxx | Documented in Deferred view |
