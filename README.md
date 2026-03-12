# ◈ TestForge AI — Test Creation Tool v1.2

AI-powered test case generation with full requirement traceability, built to the FRD v1.2 specification.

## Quick Start
# This is a test

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
│   ├── index.js          Express server (serves API + static frontend)
│   ├── db.js             SQLite database layer (schema, seeds, helpers)
│   ├── auth.js           Authentication middleware (session-based)
│   └── routes/
│       ├── auth.js       Login, logout, password change
│       ├── users.js      User CRUD, role changes, OTP reset
│       ├── requirements.js  Requirement ingestion and editing
│       ├── testcases.js  TC generation via Claude API, status updates
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
| Deferred (v2) | AL-001 – AL-008, KB-007 | Documented in Deferred view |

## Authentication Flow

1. **Default admin** — `admin` / `admin`, must change password on first login
2. **New users** — Admin creates account → OTP generated → user signs in → prompted to set own password
3. **Password reset** — Admin issues new OTP for any user
4. **Account lockout** — 5 failed attempts locks the account (UM-008)
5. **Session timeout** — 60 minutes (UM-009)

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
