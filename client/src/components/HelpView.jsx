// ═══════════════════════════════════════════════════════════════════════════
// HelpView.jsx — In-app Help / documentation, mirrored from README.md.
//
// Layout follows SettingsWrapper: a left sub-nav (grouped, with ADMIN badges)
// on desktop, a grouped <select> on mobile, and a scrolling content panel.
//
// Visibility: "Getting Started" and the "Page-by-Page Guide" group are open to
// all roles. The technical material — "Under the Hood", "API Reference",
// "Development & Deployment", "FRD Traceability" — is gated to Admin via the
// same `adminOnly` filter the rest of the app uses (currentUser.role === "Admin").
// NOTE: this is a client-side visibility gate, not a hard security boundary —
// the text still ships in the client bundle. Appropriate for internal tooling.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useTheme, font, mono } from "../theme";
import { useIsMobile } from "./shared";

// ─── CONTENT PRIMITIVES ──────────────────────────────────────────────────────

const PageHead = ({ title, subtitle }) => {
  const T = useTheme();
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: T.textBright, margin: 0 }}>{title}</h2>
      {subtitle && (
        <p style={{ fontSize: 12, color: T.textMuted, margin: "6px 0 0", fontFamily: mono }}>{subtitle}</p>
      )}
    </div>
  );
};

const P = ({ children }) => {
  const T = useTheme();
  return <p style={{ fontSize: 13, color: T.text, lineHeight: 1.7, margin: "0 0 12px" }}>{children}</p>;
};

const H3 = ({ children }) => {
  const T = useTheme();
  return <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright, margin: "22px 0 8px" }}>{children}</div>;
};

const Lead = ({ children }) => {
  const T = useTheme();
  return <span style={{ fontWeight: 700, color: T.textBright }}>{children}</span>;
};

const Mono = ({ children }) => {
  const T = useTheme();
  return (
    <span style={{ fontFamily: mono, fontSize: "0.92em", color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4 }}>
      {children}
    </span>
  );
};

const Bullets = ({ items }) => {
  const T = useTheme();
  return (
    <ul style={{ margin: "0 0 14px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{it}</li>
      ))}
    </ul>
  );
};

const Numbered = ({ items }) => {
  const T = useTheme();
  return (
    <ol style={{ margin: "0 0 14px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{it}</li>
      ))}
    </ol>
  );
};

const Code = ({ children }) => {
  const T = useTheme();
  return (
    <pre style={{
      fontFamily: mono, fontSize: 12, lineHeight: 1.6, color: T.text,
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: 14, overflowX: "auto", margin: "0 0 14px", whiteSpace: "pre",
    }}>{children}</pre>
  );
};

const Note = ({ children }) => {
  const T = useTheme();
  return (
    <div style={{
      fontSize: 12, color: T.textMuted, lineHeight: 1.6,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: "10px 12px", margin: "0 0 14px",
    }}>{children}</div>
  );
};

const Table = ({ cols, rows, monoCols = [] }) => {
  const T = useTheme();
  return (
    <div style={{ overflowX: "auto", margin: "0 0 16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} style={{
                textAlign: "left", padding: "8px 10px", color: T.textMuted,
                fontFamily: mono, fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.05em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "8px 10px", verticalAlign: "top", lineHeight: 1.5,
                  borderBottom: `1px solid ${T.border}55`,
                  color: monoCols.includes(ci) ? T.accent : T.text,
                  fontFamily: monoCols.includes(ci) ? mono : font,
                  whiteSpace: monoCols.includes(ci) ? "nowrap" : "normal",
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── SECTION CONTENT (keyed; each returns the panel body incl. its header) ────

const SECTION_CONTENT = {
  "getting-started": () => (
    <>
      <PageHead title="Getting Started" subtitle="Install, configure, and launch TestForge" />
      <H3>Docker (recommended)</H3>
      <Code>{`git clone https://github.com/WyattDilleyASI/testforge-ai.git
cd testforge-ai
cp .env.example .env        # then edit — add ANTHROPIC_API_KEY, SESSION_SECRET, SERVER_ENCRYPTION_KEY
docker-compose up -d --build`}</Code>
      <P>Open <Mono>http://localhost:3000</Mono>. Data persists across rebuilds via the <Mono>testforge-data</Mono> named volume.</P>
      <H3>Run Directly (Node.js)</H3>
      <Code>{`git clone https://github.com/<your-org>/testforge-ai.git
cd testforge-ai
cp .env.example .env        # then edit
npm install && cd client && npm install && npm run build && cd ..
npm start`}</Code>
      <H3>Default Credentials</H3>
      <Table
        cols={["Username", "Password", "Notes"]}
        monoCols={[0, 1]}
        rows={[["admin", "admin", "Must be changed on first login"]]}
      />
      <P>Admins create accounts and issue one-time passwords. Users set their own password on first sign-in.</P>
      <H3>Configuration</H3>
      <Table
        cols={["Variable", "Required", "Description"]}
        monoCols={[0]}
        rows={[
          ["ANTHROPIC_API_KEY", "Yes", "Anthropic API key for Claude"],
          ["SESSION_SECRET", "Yes", "Secret for session encryption"],
          ["SERVER_ENCRYPTION_KEY", "Yes", "AES-256 key for MCP token encryption at rest"],
          ["ANTHROPIC_MODEL", "No", "Model override (default: claude-sonnet-4-20250514)"],
          ["PORT", "No", "Server port (default: 3000)"],
          ["TOKEN_BUDGET", "No", "Monthly token budget limit for Claude API calls"],
        ]}
      />
      <Note>
        <Lead>Docker note:</Lead> Variables in <Mono>.env</Mono> must also be declared in the <Mono>environment</Mono> block of <Mono>docker-compose.yml</Mono> to reach the container.
      </Note>
    </>
  ),

  "login": () => (
    <>
      <PageHead title="Login" subtitle="Signing in to TestForge" />
      <P>A clean sign-in screen. No self-registration — accounts are provisioned by Admins. First-time users sign in with an Admin-issued one-time password and are immediately prompted to set their own. Accounts lock after 5 failed attempts (UM-008).</P>
    </>
  ),

  "dashboard": () => (
    <>
      <PageHead title="Coverage Dashboard" subtitle="Your landing page" />
      <P>The landing page after every login. At a glance: requirement coverage percentage, draft test cases awaiting review, approved count, and Knowledge Base entry count. Below that, Claude API usage metrics (tokens consumed, API calls, budget status) give visibility into generation costs. The bottom half lists every untested requirement sorted by priority so engineers know exactly where to focus next.</P>
    </>
  ),

  "requirements": () => (
    <>
      <PageHead title="Requirements" subtitle="Managing requirements" />
      <P>All ingested requirements in a single searchable list. Each card shows the Jama ID, description, source badge, priority, approval status, and downstream traceability references to linked test cases. Requirements can be imported from Jama DOC files, added manually, or cleared in bulk. Inline editing is available for description and acceptance criteria. The system parses acceptance criteria into individual testable statements and flags ambiguous items.</P>
    </>
  ),

  "testcases": () => (
    <>
      <PageHead title="Test Cases" subtitle="Generating & reviewing test cases" />
      <P>The core workflow. Select a requirement, choose generation depth (Basic 2–3 / Standard 4–6 / Comprehensive 7–10), and optionally filter by test focus areas (Safety Critical, UI/UX Validation, Boundary Analysis, Error Recovery, Regression). Click <Lead>Generate Drafts</Lead> and the Claude API produces structured test cases — each with a unique ID, requirement traceability link, and type badge (Happy Path, Negative, Boundary, Edge Case). A yellow DRAFT disclaimer reminds engineers that AI output requires human review.</P>
      <P>The <Lead>Library</Lead> tab shows all test cases across every generation session, with search across TC ID, title, type, linked requirements, and description. The <Lead>Session View</Lead> tab isolates the current generation batch. Engineers can approve, reject (with reason tracking fed into the Adaptive Learning Engine), or edit inline.</P>
      <P>Before generation, contextual hints from the Adaptive Learning Engine display approval rates and common edit patterns for the selected requirement, so engineers can adjust depth or focus accordingly.</P>
      <H3>Additional capabilities</H3>
      <Bullets items={[
        <><Lead>TestLink Import</Lead> — Upload a TestLink XML export, optionally enhance legacy test cases with KB context via the Claude API, and import them with original external IDs preserved.</>,
        <><Lead>Manual fallback</Lead> — When no API key is configured, a Copy Prompt / Import Response workflow lets teams use claude.ai directly.</>,
        <><Lead>XLSX export</Lead> — Export selected test cases for use outside TestForge.</>,
      ]} />
    </>
  ),

  "sysml": () => (
    <>
      <PageHead title="SysML Traceability Diagram" subtitle="Requirements traceability visualization" />
      <P>An interactive D3-powered visualization of the full requirements hierarchy — product, system, subsystem, and component levels — with containment edges, cross-references, and verify links to test cases. Toggle <Lead>TCs On</Lead> to overlay test case nodes on the diagram. The right-side Finder panel lists all nodes with search by ID or name.</P>
      <P>The <Lead>TACO Assessment</Lead> section evaluates each requirement against four quality criteria — <Lead>T</Lead>estable, <Lead>A</Lead>tomic, <Lead>C</Lead>omplete, <Lead>O</Lead>bservable — and reports overall compliance percentage. Zoom, pan, fit-to-view, and SVG export controls are in the toolbar.</P>
    </>
  ),

  "kb": () => (
    <>
      <PageHead title="Knowledge Base" subtitle="Historical context for generation" />
      <P>A hierarchical knowledge base organized into <Lead>sections → subsections → entries</Lead> (two-level max). Sections represent product or system areas, subsections represent modules within them. Each entry has a structured ID, type badge (Defect History, System Behavior, Business Rule, Environment Constraint, Test Data Guideline), descriptive content, and linked tags for requirements, test cases, Jama IDs, and custom tags. Entries can include image attachments with descriptions for visual context. A usage counter tracks how many times each entry has been injected into generation prompts.</P>
      <P>During test case generation, relevant KB entries matching the selected requirement's tags are automatically injected into the Claude prompt — giving the AI domain-specific context about known defects, system behaviors, and edge cases.</P>
      <P>The UI features card-in-card nesting, toggle-mode drag-and-drop with labeled drop zones and auto-scroll for reorganization, inline editing, search/filter with auto-expand, and collapse/expand all controls.</P>
    </>
  ),

  "ale": () => (
    <>
      <PageHead title="Adaptive Learning Engine" subtitle="Analytics for the learning system" />
      <P>The analytics dashboard for TestForge's learning system. Five tabs provide visibility into generation quality and how the system adapts over time:</P>
      <Table
        cols={["Tab", "Access", "What it shows"]}
        rows={[
          ["Overview", "All users", "Generation stats, approval rates, monthly trends"],
          ["Feedback", "All users", "Unprocessed event counts, field-level edit patterns"],
          ["Rules", "QA Manager+", "Active adaptive rules with confidence scores and evidence trails"],
          ["Exemplars", "QA Manager+", "Curated approved test cases used as few-shot examples in generation"],
          ["System", "Admin only", "Health checks, maintenance controls, model version reset"],
        ]}
      />
      <P>When engineers approve, reject, or edit a draft test case, the system passively captures that signal. Over time, patterns are distilled into adaptive rules (e.g., "always include timeout handling for API-related requirements") and curated exemplars that are injected into future generation prompts. See <Lead>How the Adaptive Learning Engine Works</Lead> (under "Under the Hood", Admin) for the full technical breakdown.</P>
    </>
  ),

  "settings": () => (
    <>
      <PageHead title="Settings" subtitle="Configuration & preferences" />
      <P>Settings is divided into six sub-pages. User Preferences and Product Context are available to all users. User Management, MCP Server Setup, and Jama Connect are Admin-only.</P>
      <H3>User Preferences &amp; Themes</H3>
      <P>The theme picker offers 116+ appearance options across five categories: Dark, Light, Vibrant, Animated, and Accessibility. Animated themes use canvas-based rendering for effects like particle fields, audio-reactive bars, and ambient animations.</P>
      <H3>Product Context</H3>
      <P>Describe your product, who uses it, and what it does. This context is included in every AI generation prompt, giving Claude domain-specific vocabulary and awareness of your product's architecture. Key terms can be defined separately to ensure consistent terminology in generated test cases.</P>
      <H3>User Management</H3>
      <P>Admin-only. Create, deactivate, and manage user accounts. Each user is assigned one of three roles (Admin, QA Manager, QA Engineer) that govern what they can access. Admins can issue one-time passwords for new users, reset passwords, and unlock accounts after failed login lockouts. An audit log tracks every authentication and role change event.</P>
      <H3>MCP Server Setup</H3>
      <P>Admin-only. A 4-step wizard (Prerequisites → Create Token → Configure Claude → Test Connection) for connecting Claude Desktop, Claude Code, or Claude Web to TestForge via the Model Context Protocol. No API key sharing required — each user's Claude billing stays on their own account. The wizard provides auto-install terminal commands and downloadable config files. Existing tokens are listed with creation date, last-used timestamp, and revoke controls.</P>
      <P>The page also includes a complete MCP Tools Reference (all 15 available tools with descriptions and example prompts), Example Workflows for multi-tool chains, and a Troubleshooting section.</P>
      <H3>Jama Connect</H3>
      <P>Admin-only. Configure the Jama Connect integration endpoint and OAuth 2.0 credentials. The export panel shows all reviewed test cases eligible for export, with pre-export validation ensuring every TC has linked requirements and proper field mapping (JM-007). An export log tracks every sync attempt with timestamps and status.</P>
      <Note><Lead>This only works with a Jama API key.</Lead></Note>
      <H3>About</H3>
      <P>Version info, the project mission statement, contributor credits, and a tech stack summary.</P>
    </>
  ),

  "deferred": () => (
    <>
      <PageHead title="Deferred to v2" subtitle="Features scoped out of v1" />
      <P>A transparency page documenting features intentionally scoped out of v1. Each card shows a DEFERRED badge, feature name, FRD requirement IDs, and a brief explanation of what v1 provides versus what v2 will add. This ensures the FRD is fully traceable even for features not yet implemented.</P>
    </>
  ),

  "architecture": () => (
    <>
      <PageHead title="Architecture" subtitle="How the codebase fits together" />
      <Code>{`testforge-ai/
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
└── .env.example`}</Code>
      <P><Lead>Tech stack:</Lead> React 18 + Vite frontend, Node.js/Express backend, SQLite (4 databases: core, requirements, testcases, knowledge), Anthropic Claude API, MCP SDK, Docker Compose deployment.</P>
    </>
  ),

  "how-ale": () => (
    <>
      <PageHead title="How the Adaptive Learning Engine Works" subtitle="The five-layer learning pipeline" />
      <P>The AL Engine operates as a five-layer pipeline that turns passive engineer feedback into better generation prompts — no manual prompt tuning required.</P>
      <Bullets items={[
        <><Lead>1. Signal Collection</Lead> — Every time an engineer approves, rejects, or edits a draft test case, the system captures the event with a structured diff of what changed. These raw events are stored in <Mono>feedback_events</Mono> with a <Mono>processed_at</Mono> flag for idempotent aggregation.</>,
        <><Lead>2. Pattern Aggregation</Lead> — Processed feedback is distilled into field-level edit patterns (e.g., "engineers consistently add timeout handling to API test cases"). The system extracts signals from the noise by tracking frequency, consistency, and recency.</>,
        <><Lead>3. Adaptive Rules</Lead> — Patterns that cross a confidence threshold become rules injected into the generation prompt (e.g., "Always include error recovery steps for requirements involving network communication"). Rules have confidence scores with half-life decay, a hard cap of 25 active rules, and automatic reset when the underlying Claude model changes.</>,
        <><Lead>4. Few-Shot Exemplars</Lead> — Curated approved test cases are tagged for injection as examples in the generation prompt. Including 2–3 exemplars matching the requirement type dramatically improves first-pass quality.</>,
        <><Lead>5. Data Retention &amp; Decay</Lead> — Raw feedback events are retained for 90 days, then pruned. Rules persist indefinitely but decay in confidence over time. Orphaned exemplars are pruned automatically.</>,
      ]} />
      <H3>Prompt composition</H3>
      <P>Generation prompts are assembled from composable layers:</P>
      <Table
        cols={["Layer", "Source", "Updates"]}
        rows={[
          ["Base instructions", "Hand-tuned generation rules", "Rarely"],
          ["Domain context", "Product Context + Knowledge Base", "Per-generation"],
          ["Adaptive rules", "Active rules, scoped by category", "Weekly/monthly"],
          ["Exemplar test cases", "Curated approved TCs", "Weekly/monthly"],
          ["Requirement content", "The specific requirement being tested", "Per-generation"],
        ]}
      />
    </>
  ),

  "auth-rbac": () => (
    <>
      <PageHead title="Authentication & RBAC" subtitle="Sessions & role-based access" />
      <P>Session-based authentication with a three-tier role model:</P>
      <Table
        cols={["Role", "Capabilities"]}
        rows={[
          [<Lead>Admin</Lead>, "Full system access — user management, MCP settings, system maintenance, audit log"],
          [<Lead>QA Manager</Lead>, "Requirement/TC management, Jama export, KB management, adaptive rule & exemplar management"],
          [<Lead>QA Engineer</Lead>, "Requirement viewing, test case generation and review, KB viewing, analytics overview"],
        ]}
      />
      <P><Lead>Flow:</Lead> Default admin (<Mono>admin</Mono>/<Mono>admin</Mono>, must change on first login) → Admin creates user → OTP issued → User signs in → Sets own password. Accounts lock after 5 failed attempts; Admin unlock required.</P>
    </>
  ),

  "mcp": () => (
    <>
      <PageHead title="MCP Integration" subtitle="Model Context Protocol tools" />
      <P>TestForge exposes 15 tools via the Model Context Protocol, allowing Claude Desktop, Claude Code, and Claude Web to interact with TestForge directly. The integration uses SSE transport with a local <Mono>mcp-bridge.mjs</Mono> stdio-to-SSE bridge for Claude Desktop compatibility. Tokens are AES-256-GCM encrypted at rest.</P>
      <P>Available tools include: listing/searching requirements, getting requirement details with KB context, generating test cases, saving test cases, managing KB entries, checking coverage status, and more. The MCP Server Setup wizard handles the full configuration flow.</P>
    </>
  ),

  "security": () => (
    <>
      <PageHead title="Security" subtitle="How TestForge protects data" />
      <Bullets items={[
        <><Lead>Passwords</Lead> — bcrypt (cost factor 10); OTPs from a 54-character alphanumeric pool; plaintext never stored</>,
        <><Lead>Sessions</Lead> — encrypted with <Mono>SESSION_SECRET</Mono>, stored server-side in SQLite; cookies are <Mono>httpOnly</Mono> and <Mono>sameSite: lax</Mono></>,
        <><Lead>HTTP headers</Lead> — Helmet.js (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)</>,
        <><Lead>RBAC</Lead> — server-side middleware on every mutation; role escalation prevented at the API layer</>,
        <><Lead>API key isolation</Lead> — Anthropic key stored server-side only, never sent to the browser</>,
        <><Lead>MCP tokens</Lead> — AES-256-GCM at rest via <Mono>SERVER_ENCRYPTION_KEY</Mono></>,
        <><Lead>Audit trail</Lead> — every login, password change, role change, generation, export, and MCP config change logged</>,
      ]} />
      <H3>Jama credential handling (browser-driven import)</H3>
      <P>The browser-driven Jama import accepts the user's Jama username and password for the duration of a <Lead>single operation only</Lead> — one import or one profile-creation discovery. Concretely:</P>
      <Bullets items={[
        <>Credentials are POST'd in the request body and held in server memory only long enough to drive Playwright through Jama's login form. As soon as sign-in succeeds, our references are dropped (<Mono>username = null; password = null</Mono>).</>,
        <>They are <Lead>never</Lead> written to disk, the database, the audit log, the per-job log, or the job's stored error message. Job rows record what happened, not how it authenticated.</>,
        <>The Playwright browser context is created fresh per operation and disposed when the operation ends. The Jama session cookie does not survive past the request.</>,
        <>Only the username is cached in browser <Mono>localStorage</Mono> (for convenience pre-filling the form). The password is never persisted client-side beyond React component state.</>,
        <>Errors that escape the sign-in flow are <Lead>sanitized</Lead> to redact any literal occurrence of the username or password before being stored or surfaced to the UI.</>,
        <>Failure screenshots are <Lead>not</Lead> captured if the failure occurred during the authentication phase (avoids any chance of surfacing the login page in a downloadable artifact).</>,
        <><Lead>Production must terminate TLS in front of Testforge.</Lead> Credentials traverse the network in the request body; HTTPS is required to prevent in-flight interception.</>,
      ]} />
    </>
  ),

  "api-reference": () => (
    <>
      <PageHead title="API Reference" subtitle="All /api endpoints" />
      <P>All endpoints are prefixed with <Mono>/api</Mono> and require session authentication unless noted.</P>
      <H3>Auth</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["POST", "/api/auth/login", "Sign in"],
        ["POST", "/api/auth/logout", "Sign out"],
        ["GET", "/api/auth/me", "Current session info"],
        ["POST", "/api/auth/change-password", "Change password"],
      ]} />
      <H3>Requirements</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/requirements", "List all"],
        ["POST", "/api/requirements", "Create one"],
        ["PUT", "/api/requirements/:id", "Update"],
        ["DELETE", "/api/requirements/:id", "Delete"],
        ["DELETE", "/api/requirements", "Clear all"],
        ["POST", "/api/requirements/import-doc", "Import Jama DOC (multipart)"],
      ]} />
      <H3>Test Cases</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/testcases", "List all"],
        ["POST", "/api/testcases/generate", "Generate drafts for a requirement"],
        ["PUT", "/api/testcases/:id/status", "Approve/reject (triggers AL feedback)"],
        ["PUT", "/api/testcases/:id", "Edit fields (triggers AL feedback)"],
        ["DELETE", "/api/testcases", "Bulk delete"],
        ["POST", "/api/testcases/import-testlink", "Import TestLink XML"],
      ]} />
      <H3>Knowledge Base</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/kb", "List all entries"],
        ["POST", "/api/kb", "Create entry"],
        ["PUT", "/api/kb/:id", "Update entry"],
        ["DELETE", "/api/kb", "Bulk delete"],
        ["GET", "/api/kb/sections", "List sections/subsections"],
        ["POST", "/api/kb/sections", "Create section"],
        ["POST", "/api/kb/:id/images", "Upload image attachment"],
      ]} />
      <H3>Adaptive Learning</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/analytics/dashboard", "Dashboard metrics"],
        ["GET", "/api/analytics/hints/:reqId", "Pre-generation hints for a requirement"],
        ["GET", "/api/analytics/rules", "List all rules"],
        ["GET", "/api/analytics/rules/active", "Active rules for prompt injection"],
        ["POST", "/api/analytics/rules", "Create rule (Manager+)"],
        ["GET", "/api/analytics/exemplars", "List exemplars"],
        ["POST", "/api/analytics/exemplars", "Promote TC to exemplar (Manager+)"],
        ["GET", "/api/analytics/feedback/stats", "Feedback event statistics"],
      ]} />
      <H3>Users &amp; Admin</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/users", "List users (Admin)"],
        ["POST", "/api/users", "Create user (Admin)"],
        ["PUT", "/api/users/:id/role", "Change role (Admin)"],
        ["PUT", "/api/users/:id/unlock", "Unlock account (Admin)"],
        ["GET", "/api/audit", "Audit log (Admin)"],
      ]} />
      <H3>MCP &amp; Integration</H3>
      <Table cols={["Method", "Endpoint", "Description"]} monoCols={[0, 1]} rows={[
        ["GET", "/api/mcp/tokens", "List user's tokens"],
        ["POST", "/api/mcp/tokens", "Create token"],
        ["DELETE", "/api/mcp/tokens/:id", "Revoke token"],
        ["POST", "/api/mcp/tokens/verify", "Verify a token"],
        ["GET", "/api/product-context", "Get product context"],
        ["PUT", "/api/product-context", "Update product context"],
        ["POST", "/api/jama/export", "Export to Jama (Manager+)"],
        ["GET", "/api/jama/log", "Export log"],
        ["GET", "/api/usage/tokens", "Token usage stats"],
      ]} />
    </>
  ),

  "development": () => (
    <>
      <PageHead title="Development & Deployment" subtitle="Local dev & production deployment" />
      <H3>Local Development</H3>
      <Code>{`# Terminal 1 — Express server with auto-reload
npm run dev

# Terminal 2 — Vite dev server with hot reload
cd client && npm run dev`}</Code>
      <P>Vite runs on port <Mono>5173</Mono> and proxies <Mono>/api</Mono> to port <Mono>3000</Mono>.</P>
      <Table cols={["Command", "Description"]} monoCols={[0]} rows={[
        ["npm start", "Production server"],
        ["npm run dev", "Server with --watch"],
        ["npm run build:client", "Build the React SPA"],
        ["npm run setup", "Full install (server + client + build)"],
      ]} />
      <H3>Production Deployment</H3>
      <Numbered items={[
        <><Lead>Firewall</Lead> — Open port 3000 and configure cloud security groups</>,
        <><Lead>Reverse proxy</Lead> — Nginx or Caddy in front for SSL/TLS termination</>,
        <><Lead>Session cookie</Lead> — Add <Mono>secure: true</Mono> when behind HTTPS</>,
        <><Lead>CORS</Lead> — Lock <Mono>cors(&#123; origin &#125;)</Mono> to your domain</>,
        <><Lead>Secrets</Lead> — Ensure <Mono>SESSION_SECRET</Mono> and <Mono>SERVER_ENCRYPTION_KEY</Mono> are strong random values; never commit <Mono>.env</Mono></>,
        <><Lead>Backups</Lead> — The SQLite databases live in the <Mono>testforge-data</Mono> Docker volume at <Mono>/app/data</Mono></>,
      ]} />
      <H3>Development Notes</H3>
      <Bullets items={[
        <><Lead>Vite resolution:</Lead> Vite resolves <Mono>.js</Mono> before <Mono>.jsx</Mono> — if both exist, <Mono>.js</Mono> shadows <Mono>.jsx</Mono>. Delete the competing file.</>,
        <><Lead>express.json() vs MCP:</Lead> Global JSON middleware consumes request bodies before MCP SSE transport can read them. The server conditionally skips this middleware for MCP routes.</>,
        <><Lead>SQLite on Docker/Windows:</Lead> Avoid bind mounts via <Mono>/mnt/c/</Mono> due to POSIX locking issues. Use named Docker volumes.</>,
        <><Lead>PowerShell .env files:</Lead> PowerShell's <Mono>Out-File</Mono> creates UTF-8 BOM, which can cause silent env var issues. Use <Mono>[System.IO.File]::WriteAllText()</Mono> instead.</>,
      ]} />
    </>
  ),

  "frd": () => (
    <>
      <PageHead title="FRD Traceability" subtitle="Requirement-to-feature mapping" />
      <P>Every feature maps to specific FRD requirement IDs:</P>
      <Table
        cols={["Module", "REQ IDs", "Implementation"]}
        monoCols={[1]}
        rows={[
          ["Requirement Ingestion", "RS-001 – RS-007", "CRUD, acceptance criteria parsing, Jama DOC import"],
          ["Test Case Generation", "TC-001 – TC-009", "Claude API generation, Session View, Draft disclaimer, TestLink import"],
          ["Knowledge Base", "KB-001 – KB-006", "Hierarchical sections/subsections, tagged entries, KB-informed generation, image attachments"],
          ["Adaptive Learning", "AL-002 – AL-004", "Passive feedback capture, analytics dashboard, adaptive rules, exemplars"],
          ["User Management", "UM-001 – UM-009", "RBAC, OTP flow, audit log, lockout"],
          ["Jama Integration", "JM-001 – JM-009", "Pre-export validation, XLSX export, simulated sync"],
          ["SysML Traceability", "TC-007", "Interactive D3 diagram, TACO assessment, SVG export"],
          ["MCP Server Config", "Admin Config", "Token CRUD, connection testing, encryption, 4-step setup wizard"],
          ["Deferred (v2)", "KB-007, UM-xxx", "Documented in Deferred view"],
        ]}
      />
    </>
  ),
};

// ─── NAV MODEL ───────────────────────────────────────────────────────────────
// `type: "item"` = standalone row. `type: "group"` = labelled heading + children.
// `adminOnly` on a group hides the whole group (label + children) from non-Admins.

const HELP_NAV = [
  { type: "item", key: "getting-started", label: "Getting Started", icon: "◰", adminOnly: false },
  {
    type: "group", label: "Page-by-Page Guide", adminOnly: false, items: [
      { key: "login", label: "Login", icon: "◱" },
      { key: "dashboard", label: "Coverage Dashboard", icon: "◫" },
      { key: "requirements", label: "Requirements", icon: "◧" },
      { key: "testcases", label: "Test Cases", icon: "◨" },
      { key: "sysml", label: "SysML Traceability", icon: "◈" },
      { key: "kb", label: "Knowledge Base", icon: "◪" },
      { key: "ale", label: "Adaptive Learning Engine", icon: "◉" },
      { key: "settings", label: "Settings", icon: "⚙" },
      { key: "deferred", label: "Deferred to v2", icon: "◬" },
    ],
  },
  {
    type: "group", label: "Under the Hood", adminOnly: true, items: [
      { key: "architecture", label: "Architecture", icon: "◲" },
      { key: "how-ale", label: "How the AL Engine Works", icon: "◴" },
      { key: "auth-rbac", label: "Authentication & RBAC", icon: "◵" },
      { key: "mcp", label: "MCP Integration", icon: "◆" },
      { key: "security", label: "Security", icon: "◶" },
    ],
  },
  { type: "item", key: "api-reference", label: "API Reference", icon: "◳", adminOnly: true },
  { type: "item", key: "development", label: "Development & Deployment", icon: "◷", adminOnly: true },
  { type: "item", key: "frd", label: "FRD Traceability", icon: "▦", adminOnly: true },
];

const AdminBadge = () => {
  const T = useTheme();
  return (
    <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: mono, color: T.amber, background: T.amberDim, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
      ADMIN
    </span>
  );
};

// Flatten the nav (respecting role) into the ordered list of visible keys.
const visibleKeys = (isAdmin) => {
  const keys = [];
  for (const node of HELP_NAV) {
    if (node.adminOnly && !isAdmin) continue;
    if (node.type === "group") keys.push(...node.items.map(i => i.key));
    else keys.push(node.key);
  }
  return keys;
};

// ─── MAIN VIEW ───────────────────────────────────────────────────────────────

export const HelpView = ({ currentUser }) => {
  const T = useTheme();
  const isMobile = useIsMobile();
  const isAdmin = currentUser?.role === "Admin";
  const [active, setActive] = useState("getting-started");

  // If the role can't see the active section (e.g. role changed), snap back.
  useEffect(() => {
    if (!visibleKeys(isAdmin).includes(active)) setActive("getting-started");
  }, [isAdmin, active]);

  const renderContent = () => {
    const body = SECTION_CONTENT[active];
    return body ? body() : null;
  };

  const navRow = (item, indented) => {
    const isActive = active === item.key;
    return (
      <button
        key={item.key}
        onClick={() => setActive(item.key)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: indented ? "9px 12px 9px 22px" : "10px 12px",
          borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left",
          fontFamily: font, fontSize: 13, width: "100%",
          fontWeight: isActive ? 600 : 400,
          color: isActive ? T.accent : T.text,
          background: isActive ? T.accentDim : "transparent",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.hover || T.accentDim; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
      </button>
    );
  };

  // ── Mobile: grouped <select> + content ──
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 120px)" }}>
        <div style={{ padding: "4px 0 12px", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
          <select
            value={active}
            onChange={e => setActive(e.target.value)}
            style={{ width: "100%", fontFamily: font, fontSize: 14, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none" }}
          >
            {HELP_NAV.map(node => {
              if (node.adminOnly && !isAdmin) return null;
              if (node.type === "group") {
                return (
                  <optgroup key={node.label} label={node.adminOnly ? `${node.label} (Admin)` : node.label}>
                    {node.items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </optgroup>
                );
              }
              return <option key={node.key} value={node.key}>{node.adminOnly ? `${node.label} (Admin)` : node.label}</option>;
            })}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{renderContent()}</div>
      </div>
    );
  }

  // ── Desktop: left sub-nav + content ──
  return (
    <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 60px)" }}>
      <div style={{ width: 230, minWidth: 230, borderRight: `1px solid ${T.border}`, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px 12px", fontFamily: mono }}>
          Help
        </div>
        {HELP_NAV.map(node => {
          if (node.adminOnly && !isAdmin) return null;
          if (node.type === "group") {
            return (
              <div key={node.label} style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: mono }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{node.label}</span>
                  {node.adminOnly && <AdminBadge />}
                </div>
                {node.items.map(item => navRow(item, true))}
              </div>
            );
          }
          // standalone item — show ADMIN badge inline when gated
          const isActive = active === node.key;
          return (
            <button
              key={node.key}
              onClick={() => setActive(node.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left",
                fontFamily: font, fontSize: 13, width: "100%",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? T.accent : T.text,
                background: isActive ? T.accentDim : "transparent",
                marginTop: 8, transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.hover || T.accentDim; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5, width: 20, textAlign: "center", flexShrink: 0 }}>{node.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{node.label}</span>
              {node.adminOnly && <AdminBadge />}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, padding: 24, overflowY: "auto", maxWidth: 900 }}>
        {renderContent()}
      </div>
    </div>
  );
};
