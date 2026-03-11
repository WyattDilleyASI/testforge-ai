import { useState, useEffect, useCallback } from "react";

// ─── LIKE CHERRY BLOSSOMS / CONSTANTS BLOOM IN SILENCE / COLORS FILL THE VOID ──

const PETALS = {
  void: "#0B0E14", stone: "#121821", moss: "#1A2233",
  bark: "#243044", mist: "#C8D6E5", fog: "#7A8BA3",
  moon: "#EFF4F8", stream: "#22D3EE", streamDim: "rgba(34,211,238,0.12)",
  streamGlow: "rgba(34,211,238,0.25)", bamboo: "#34D399", bambooDim: "rgba(52,211,153,0.12)",
  ember: "#F87171", emberDim: "rgba(248,113,113,0.12)", lantern: "#FBBF24",
  lanternDim: "rgba(251,191,36,0.12)", wisteria: "#A78BFA", wisteriaDim: "rgba(167,139,250,0.12)",
};
const brushStroke = "'DM Sans', 'Segoe UI', system-ui, sans-serif";
const inkWell = "'JetBrains Mono', 'Fira Code', monospace";

// haiku: drafts are not yet done / engineer must review first / cherry blossoms fade
const DRAFT_HAIKU = "These test cases bloom as AI-generated drafts — mere seeds upon the wind. QA Engineer review, augmentation, and approval required before the harvest.";

// ─── ROLES LIKE SEASONS / EACH ONE HAS ITS OWN DOMAIN / PERMISSIONS FLOW ──

const SEASONS = {
  "QA Engineer": { label: "QA Engineer", color: "stream", canDo: ["Tend the garden of requirements", "Summon test case drafts", "Plant knowledge base seeds"], cannotDo: ["Approve exports to Jama", "Manage the temple of users"] },
  "QA Manager": { label: "QA Manager", color: "lantern", canDo: ["All engineer gifts", "Approve or reject harvest", "Initiate Jama journeys"], cannotDo: ["Create temple accounts", "Full audit scroll access"] },
  "Admin": { label: "Admin", color: "wisteria", canDo: ["All manager powers", "Create and tend accounts", "Read the full audit scroll"], cannotDo: [] },
};

// ─── MOCK DATA LIKE / SEEDS PLANTED IN SPRING SOIL / WAITING TO TAKE ROOT ──

const mockSeedsOfTruth = [
  { req_id: "RS-001", title: "Multi-format Requirement Ingestion", description: "The Tool shall accept requirements like rain accepts the earth — in plain text, markdown, JSON, CSV, and PDF.", acceptance_criteria: ["System accepts .txt, .md, .json, .csv, .pdf uploads", "Parsed requirements fill the schema like water fills a cup", "Bad formats show clear error, like thunder before rain"], priority: "High", status: "Approved", source: "FRD v1.2", module: "Requirement Ingestion" },
  { req_id: "RS-005", title: "Ambiguous Requirement Detection", description: "The Tool shall flag vague requirements like a crane flags the dawn.", acceptance_criteria: ["Requirements without criteria are flagged", "Vague terms trigger gentle warnings", "User refines before generation begins"], priority: "High", status: "Approved", source: "FRD v1.2", module: "Requirement Ingestion" },
  { req_id: "TC-001", title: "Complete Test Case Structure", description: "Each test case must contain all fields — like a haiku must have its syllables.", acceptance_criteria: ["Every TC includes all required fields", "Linked REQ ID never empty as a dry riverbed", "Pass/fail criteria: binary, unambiguous"], priority: "High", status: "Approved", source: "FRD v1.2", module: "Test Case Generation" },
  { req_id: "JM-004", title: "Pre-Export Validation", description: "Before export, validate all TCs have at least one Jama REQ link — no orphans in the storm.", acceptance_criteria: ["Export blocked if any TC lacks REQ link", "Validation lists orphaned TCs like fallen leaves", "User resolves before re-attempting"], priority: "High", status: "Approved", source: "FRD v1.2", module: "Jama Integration" },
  { req_id: "UM-003", title: "QA Engineer Role Permissions", description: "The QA Engineer walks a bounded path through the garden.", acceptance_criteria: ["Can ingest, edit requirements and generate TCs", "Cannot approve exports or modify Jama settings", "Cannot access the temple of user management"], priority: "High", status: "Approved", source: "FRD v1.2", module: "User Management" },
];

const mockHarvestOfTests = [
  { tc_id: "TC-RS-001-001", title: "Upload valid .txt file — water meets the stone", linked_req_ids: ["RS-001"], preconditions: "User is logged in, the morning dew is fresh", steps: [{ step: "Navigate to Requirements page", expectedResult: "Page loads like sunrise" }, { step: "Upload a valid .txt file", expectedResult: "File parsed, fields bloom correctly" }], pass_fail_criteria: "All fields populated — the cup is full", type: "Happy Path", depth: "standard", status: "Reviewed", kb_references: ["KB-E001"] },
  { tc_id: "TC-RS-001-002", title: "Upload unsupported .exe — the river rejects the stone", linked_req_ids: ["RS-001"], preconditions: "User is authenticated beneath the moon", steps: [{ step: "Attempt to upload a .exe file", expectedResult: "Error message appears like lightning" }, { step: "Verify no data corruption", expectedResult: "System remains still as a pond" }], pass_fail_criteria: "Clear error shown, no data disturbed", type: "Negative", depth: "standard", status: "Draft", kb_references: [] },
  { tc_id: "TC-RS-005-001", title: "Flag requirement without acceptance criteria — empty branch", linked_req_ids: ["RS-005"], preconditions: "At least one requirement exists without criteria", steps: [{ step: "Create requirement with empty acceptance criteria", expectedResult: "Ambiguity flag appears like a warning bell" }, { step: "Attempt to generate TCs", expectedResult: "Prompt to refine appears, gentle as spring rain" }], pass_fail_criteria: "Flagged before generation — the crane warns", type: "Boundary", depth: "standard", status: "Draft", kb_references: [] },
];

const mockScrollsOfWisdom = [
  { kb_id: "KB-E001", title: "PDF parsing fails on scanned scrolls", type: "Defect History", content: "Ancient defect: PDF module crumbles when processing image-based PDFs without OCR — like reading in darkness.", tags: ["RS-001"], usage_count: 3 },
  { kb_id: "KB-E002", title: "Jama field mapping — thorns in the path", type: "System Behavior", content: "Special characters in Jama field names cause mapping failures, like knots in bamboo.", tags: ["JM-007", "JM-003"], usage_count: 1 },
  { kb_id: "KB-E003", title: "Acceptance criteria — splitting the stream", type: "Business Rule", content: "Criteria with 'and'/'or' should be split into separate assertions — one pebble, one ripple.", tags: ["RS-003", "TC-002"], usage_count: 5 },
];

const mockTempleRecords = [
  { id: "USR-001", username: "admin", name: "Temple Keeper", role: "Admin", status: "Active", must_change_password: 0, is_otp: 0, failed_attempts: 0, last_login: "2025-06-01T09:15:00" },
  { id: "USR-002", username: "sakura", name: "Sakura Tanaka", role: "QA Manager", status: "Active", must_change_password: 0, is_otp: 0, failed_attempts: 0, last_login: "2025-06-01T14:30:00" },
  { id: "USR-003", username: "bamboo", name: "Bamboo Chen", role: "QA Engineer", status: "Active", must_change_password: 0, is_otp: 0, failed_attempts: 2, last_login: "2025-05-31T16:45:00" },
];

const mockAuditScroll = [
  { timestamp: "2025-06-01T14:30:12", user_name: "Sakura Tanaka", action: "LOGIN", details: "Entered the garden", status: "success" },
  { timestamp: "2025-06-01T14:31:05", user_name: "Sakura Tanaka", action: "TC_GENERATED", details: "Generated 3 draft TCs for RS-001 (depth: standard)", status: "success" },
  { timestamp: "2025-06-01T09:15:00", user_name: "Temple Keeper", action: "LOGIN", details: "The keeper arrives at dawn", status: "success" },
  { timestamp: "2025-05-31T16:45:22", user_name: "Bamboo Chen", action: "REQ_CREATED", details: "Planted requirement RS-005", status: "success" },
  { timestamp: "2025-05-31T11:00:00", user_name: "Temple Keeper", action: "ACCOUNT_CREATED", details: "Created account 'bamboo' for Bamboo Chen", status: "success" },
];

// ─── SMALL THINGS MATTER / UTILITY COMPONENTS SERVE / LIKE STONES IN A PATH ──

const Pebble = ({ color = "stream", children, style }) => {
  const c = PETALS[color] || color;
  const dim = PETALS[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: inkWell, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

const Ripple = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const base = { fontFamily: brushStroke, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const flows = {
    primary: { ...base, background: PETALS.stream, color: PETALS.void },
    secondary: { ...base, background: PETALS.moss, color: PETALS.mist, border: `1px solid ${PETALS.bark}` },
    danger: { ...base, background: PETALS.emberDim, color: PETALS.ember, border: `1px solid ${PETALS.ember}33` },
    ghost: { ...base, background: "transparent", color: PETALS.fog }
  };
  return <button style={{ ...flows[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Scroll = ({ children, style, glow }) => <div style={{ background: PETALS.moss, border: `1px solid ${glow ? PETALS.stream + "44" : PETALS.bark}`, borderRadius: 10, padding: 20, boxShadow: glow ? `0 0 20px ${PETALS.streamGlow}` : "0 2px 8px rgba(0,0,0,0.3)", ...style }}>{children}</div>;

const Brush = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: PETALS.fog, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontFamily: useMono ? inkWell : brushStroke, fontSize: 13, color: PETALS.moon, background: PETALS.stone, border: `1px solid ${PETALS.bark}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none", opacity: disabled ? 0.5 : 1 }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} style={{ fontFamily: useMono ? inkWell : brushStroke, fontSize: 13, color: PETALS.moon, background: PETALS.stone, border: `1px solid ${PETALS.bark}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
  </div>
);

const Chalice = ({ label, value, onChange, options, style, disabled }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: PETALS.fog, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ fontFamily: brushStroke, fontSize: 13, color: PETALS.moon, background: PETALS.stone, border: `1px solid ${PETALS.bark}`, borderRadius: 6, padding: "10px 12px", outline: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>
);

const SealOfReq = ({ id }) => <span style={{ fontFamily: inkWell, fontSize: 11, fontWeight: 700, color: PETALS.stream, background: PETALS.streamDim, padding: "2px 8px", borderRadius: 4, border: `1px solid ${PETALS.stream}33` }}>{id}</span>;

const WindSpinner = () => <div style={{ display: "flex", alignItems: "center", gap: 10, color: PETALS.stream }}><div style={{ width: 18, height: 18, border: `2px solid ${PETALS.bark}`, borderTopColor: PETALS.stream, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 13, fontFamily: inkWell }}>Wind carries the request to Claude...</span><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>;

const EmptyGarden = ({ icon, title, subtitle }) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: PETALS.fog, textAlign: "center" }}><span style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</span><span style={{ fontSize: 15, fontWeight: 600, color: PETALS.mist, marginBottom: 4 }}>{title}</span><span style={{ fontSize: 13 }}>{subtitle}</span></div>;

const DraftWarning = ({ style }) => <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", borderRadius: 6, border: `1px solid ${PETALS.lantern}33`, fontSize: 11, color: PETALS.lantern, lineHeight: 1.5, ...style }}><span style={{ fontFamily: inkWell, fontWeight: 700, marginRight: 6, fontSize: 10, textTransform: "uppercase" }}>DRAFT HAIKU</span>{DRAFT_HAIKU}</div>;

const StormBanner = ({ msg }) => msg ? <div style={{ marginBottom: 16, padding: "8px 12px", background: PETALS.emberDim, borderRadius: 6, border: `1px solid ${PETALS.ember}33`, fontSize: 12, color: PETALS.ember }}>{msg}</div> : null;

// ─── GATE OF THE TEMPLE / USERNAME AND PASSWORD FLOW / ENTER IF YOU DARE ──

const GateOfEntry = ({ onLogin }) => {
  const [travelerName, setTravelerName] = useState("");
  const [secretWord, setSecretWord] = useState("");
  const [storm, setStorm] = useState("");
  const [waiting, setWaiting] = useState(false);

  const knockOnGate = () => {
    setStorm(""); setWaiting(true);
    setTimeout(() => {
      if (travelerName === "admin" && secretWord === "haiku") {
        onLogin({ user: { id: "USR-001", username: "admin", name: "Temple Keeper", role: "Admin" }, mustChangePassword: false });
      } else if (travelerName === "sakura" && secretWord === "haiku") {
        onLogin({ user: { id: "USR-002", username: "sakura", name: "Sakura Tanaka", role: "QA Manager" }, mustChangePassword: false });
      } else if (travelerName === "bamboo" && secretWord === "haiku") {
        onLogin({ user: { id: "USR-003", username: "bamboo", name: "Bamboo Chen", role: "QA Engineer" }, mustChangePassword: false });
      } else { setStorm("The gate remains closed. Wrong path taken. (Hint: password is 'haiku')"); }
      setWaiting(false);
    }, 600);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PETALS.void, fontFamily: brushStroke }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } } input:focus { border-color: ${PETALS.stream} !important; box-shadow: 0 0 0 2px ${PETALS.streamDim}; outline: none; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
      <div style={{ animation: "fadeIn 0.4s ease-out", width: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontSize: 44, color: PETALS.stream, display: "block", marginBottom: 8 }}>🏯</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: PETALS.moon }}>TestForge AI</span>
          <div style={{ fontSize: 11, fontFamily: inkWell, color: PETALS.fog, marginTop: 6, letterSpacing: "0.08em" }}>— HAIKU EDITION —</div>
          <div style={{ fontSize: 12, color: PETALS.fog, marginTop: 12, fontStyle: "italic", lineHeight: 1.6 }}>
            Ancient gate awaits<br/>
            Type your name and secret word<br/>
            The garden opens
          </div>
        </div>
        <Scroll glow style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PETALS.moon, marginBottom: 4 }}>Approach the Gate</div>
          <div style={{ fontSize: 11, color: PETALS.fog, marginBottom: 20 }}>Speak your name to enter the temple grounds</div>
          <Brush label="Traveler Name" value={travelerName} onChange={setTravelerName} placeholder="admin, sakura, or bamboo" style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: PETALS.fog, textTransform: "uppercase", letterSpacing: "0.06em" }}>Secret Word</label>
            <input type="password" value={secretWord} onChange={e => setSecretWord(e.target.value)} placeholder="Whisper the password" onKeyDown={e => e.key === "Enter" && knockOnGate()} style={{ fontFamily: brushStroke, fontSize: 13, color: PETALS.moon, background: PETALS.stone, border: `1px solid ${PETALS.bark}`, borderRadius: 6, padding: "10px 12px", outline: "none" }} />
          </div>
          <StormBanner msg={storm} />
          <Ripple onClick={knockOnGate} disabled={!travelerName || !secretWord || waiting} style={{ width: "100%", justifyContent: "center" }}>{waiting ? "The gate creaks open..." : "Enter the Temple"}</Ripple>
          <div style={{ marginTop: 16, fontSize: 10, color: PETALS.fog, textAlign: "center", fontFamily: inkWell }}>Five failed attempts / and the gate locks for the night / UM-008 speaks</div>
        </Scroll>
      </div>
    </div>
  );
};

// ─── PATHS THROUGH GARDENS / NAVIGATION LIKE STEPPING / STONES ACROSS A STREAM ──

const GARDEN_PATHS = [
  { key: "dashboard", label: "Coverage Garden", icon: "🌸", haiku: "How much is covered?" },
  { key: "requirements", label: "Seeds of Truth", icon: "🌱", haiku: "RS-001 – RS-006" },
  { key: "testcases", label: "Harvest of Tests", icon: "🎋", haiku: "TC-001 – TC-009" },
  { key: "traceability", label: "Thread of Fate", icon: "🕸️", haiku: "TC-007" },
  { key: "kb", label: "Scrolls of Wisdom", icon: "📜", haiku: "KB-001 – KB-006" },
  { key: "users", label: "Temple Keepers", icon: "⛩️", haiku: "UM-001 – UM-009" },
  { key: "jama", label: "Bridge to Jama", icon: "🌉", haiku: "JM-001 – JM-009" },
  { key: "deferred", label: "Unwritten Verses", icon: "🍂", haiku: "Deferred to v2" },
];

const GardenPath = ({ active, onNavigate, soul, onLeave }) => (
  <div style={{ width: 260, minHeight: "100vh", background: PETALS.stone, borderRight: `1px solid ${PETALS.bark}`, display: "flex", flexDirection: "column", fontFamily: brushStroke, flexShrink: 0 }}>
    <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${PETALS.bark}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 22 }}>🏯</span><span style={{ fontSize: 15, fontWeight: 700, color: PETALS.moon }}>TestForge AI</span></div>
      <div style={{ fontSize: 10, color: PETALS.fog, marginTop: 4, fontFamily: inkWell, letterSpacing: "0.06em" }}>俳句 — Haiku Edition v1.2</div>
    </div>
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${PETALS.bark}`, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: PETALS.bamboo, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: PETALS.moon, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{soul.name}</div>
        <div style={{ fontSize: 10, fontFamily: inkWell, color: PETALS.fog }}>@{soul.username} · {soul.role}</div>
      </div>
      <button onClick={onLeave} style={{ background: "none", border: "none", color: PETALS.fog, cursor: "pointer", fontSize: 10, fontFamily: inkWell, padding: "4px 8px", borderRadius: 4 }}>Depart</button>
    </div>
    <nav style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
      {GARDEN_PATHS.map(p => {
        const d = p.key === "deferred";
        return <button key={p.key} onClick={() => onNavigate(p.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", fontFamily: brushStroke, fontSize: 13, fontWeight: active === p.key ? 600 : 400, color: active === p.key ? PETALS.moon : d ? PETALS.fog + "88" : PETALS.fog, background: active === p.key ? PETALS.streamDim : "transparent", borderLeft: active === p.key ? `2px solid ${PETALS.stream}` : "2px solid transparent", fontStyle: d ? "italic" : "normal" }}>
          <span style={{ fontSize: 16, opacity: d ? 0.3 : 0.85, width: 24, textAlign: "center" }}>{p.icon}</span>
          <div><div>{p.label}</div><div style={{ fontSize: 9, fontFamily: inkWell, color: PETALS.fog, opacity: 0.7, marginTop: 1 }}>{p.haiku}</div></div>
        </button>;
      })}
    </nav>
    <div style={{ padding: "14px 16px", borderTop: `1px solid ${PETALS.bark}`, fontSize: 10, color: PETALS.fog, fontFamily: inkWell, fontStyle: "italic" }}>Old pond — a frog leaps in / splash of test coverage</div>
  </div>
);

// ─── COVERAGE GARDEN / WHERE BLOSSOMS SHOW THEIR COUNT / METRICS LIKE DEW DROPS ──

const CoverageGarden = ({ seeds, harvest, scrolls }) => {
  const covered = seeds.filter(s => harvest.some(h => (h.linked_req_ids || []).includes(s.req_id)));
  const barren = seeds.filter(s => !harvest.some(h => (h.linked_req_ids || []).includes(s.req_id)));
  const coveragePct = seeds.length ? Math.round((covered.length / seeds.length) * 100) : 0;
  const reviewedCount = harvest.filter(h => h.status === "Reviewed").length;
  const draftCount = harvest.filter(h => h.status === "Draft").length;

  const DewDrop = ({ label, value, color, sub, verse }) => (
    <Scroll style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 10, fontFamily: inkWell, color: PETALS.fog, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}><span>{label}</span>{verse && <span style={{ color: PETALS.stream, opacity: 0.6 }}>{verse}</span>}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: PETALS[color] || PETALS.moon, fontFamily: inkWell }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: PETALS.fog, marginTop: 4 }}>{sub}</div>}
    </Scroll>
  );

  return <div>
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🌸 Coverage Garden</h2>
      <p style={{ fontSize: 12, color: PETALS.fog, margin: "6px 0 0", fontStyle: "italic" }}>How many blossoms bloom? / Count the petals on each branch / Coverage revealed</p>
    </div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
      <DewDrop label="Blossoms Covered" value={`${coveragePct}%`} color={coveragePct > 70 ? "bamboo" : coveragePct > 40 ? "lantern" : "ember"} sub={`${covered.length} of ${seeds.length} seeds`} verse="RS-007" />
      <DewDrop label="Draft Haiku" value={draftCount} color="lantern" sub="Awaiting the master's eye" verse="TC-003a" />
      <DewDrop label="Reviewed Verses" value={reviewedCount} color="bamboo" sub="Engineer-blessed" verse="TC-003a" />
      <DewDrop label="Wisdom Scrolls" value={scrolls.length} color="wisteria" sub={`${scrolls.reduce((s, e) => s + (e.usage_count || 0), 0)} consultations`} verse="KB-001" />
    </div>
    {barren.length > 0 && <Scroll>
      <div style={{ fontSize: 12, fontWeight: 600, color: PETALS.lantern, marginBottom: 12 }}>🍂 Barren Branches — Untested Requirements</div>
      {barren.map(s => <div key={s.req_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${PETALS.bark}` }}><SealOfReq id={s.req_id} /><span style={{ fontSize: 13, color: PETALS.mist, flex: 1 }}>{s.title}</span><Pebble color="lantern">{s.priority}</Pebble></div>)}
    </Scroll>}
  </div>;
};

// ─── SEEDS OF TRUTH / REQUIREMENTS PLANTED HERE / EACH ONE MAY BEAR FRUIT ──

const SeedsView = ({ seeds, setSeeds, soul }) => {
  const [showPlant, setShowPlant] = useState(false);
  const [editSeed, setEditSeed] = useState(null);
  const [plantForm, setPlantForm] = useState({ req_id: "", title: "", description: "", ac: "", priority: "High", status: "Draft", module: "Requirement Ingestion" });
  const [editForm, setEditForm] = useState({});
  const [storm, setStorm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const canUproot = soul?.role === "Admin" || soul?.role === "QA Manager";

  const beginPlanting = () => { setPlantForm({ req_id: `REQ-${String(seeds.length + 1).padStart(3, "0")}`, title: "", description: "", ac: "", priority: "High", status: "Draft", module: "Requirement Ingestion" }); setShowPlant(true); setEditSeed(null); setStorm(""); };

  const tendSeed = (s) => {
    if (editSeed === s.req_id) { setEditSeed(null); return; }
    setEditForm({ req_id: s.req_id, title: s.title, description: s.description || "", ac: (s.acceptance_criteria || []).join("\n"), priority: s.priority, status: s.status, module: s.module || "" });
    setEditSeed(s.req_id); setShowPlant(false); setStorm(""); setDeleteConfirm(null);
  };

  const plantSeed = () => {
    if (!plantForm.req_id || !plantForm.title) { setStorm("A seed needs at least an ID and a name to grow."); return; }
    if (seeds.find(s => s.req_id === plantForm.req_id)) { setStorm("This seed ID already exists in the garden."); return; }
    setSeeds(prev => [...prev, { req_id: plantForm.req_id, title: plantForm.title, description: plantForm.description, acceptance_criteria: plantForm.ac.split("\n").filter(Boolean), priority: plantForm.priority, status: plantForm.status, module: plantForm.module, source: "Haiku Entry" }]);
    setShowPlant(false);
  };

  const saveTending = () => {
    setSeeds(prev => prev.map(s => s.req_id === editSeed ? { ...s, title: editForm.title, description: editForm.description, acceptance_criteria: editForm.ac.split("\n").filter(Boolean), priority: editForm.priority, status: editForm.status, module: editForm.module } : s));
    setEditSeed(null);
  };

  const uprootSeed = (reqId) => { setSeeds(prev => prev.filter(s => s.req_id !== reqId)); setEditSeed(null); setDeleteConfirm(null); };

  const renderSoil = (form, setForm, isEdit) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Brush label="Seed ID" value={form.req_id} onChange={v => setForm(p => ({ ...p, req_id: v }))} mono disabled={isEdit} />
        <Chalice label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))} options={["High", "Medium", "Low"].map(v => ({ value: v, label: v }))} />
        <Chalice label="Status" value={form.status} onChange={v => setForm(p => ({ ...p, status: v }))} options={["Draft", "Review", "Approved", "Rejected"].map(v => ({ value: v, label: v }))} />
        <Chalice label="Garden" value={form.module} onChange={v => setForm(p => ({ ...p, module: v }))} options={["Requirement Ingestion", "Test Case Generation", "Jama Integration", "User Management"].map(v => ({ value: v, label: v }))} />
      </div>
      <Brush label="Title — name the seed" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Brush label="Description — what will it become?" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} textarea style={{ marginBottom: 12 }} />
      <Brush label="Acceptance Criteria (one truth per line)" value={form.ac} onChange={v => setForm(p => ({ ...p, ac: v }))} textarea mono style={{ marginBottom: 14 }} />
      <StormBanner msg={storm} />
    </>
  );

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🌱 Seeds of Truth</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Plant requirements here / each seed holds a truth within / waiting to be tested</p></div>
      <Ripple onClick={beginPlanting}>+ Plant a Seed</Ripple>
    </div>
    {showPlant && <Scroll glow style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: PETALS.stream, marginBottom: 14 }}>🌱 Plant New Seed</div>
      {renderSoil(plantForm, setPlantForm, false)}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Ripple variant="secondary" onClick={() => setShowPlant(false)}>Abandon</Ripple><Ripple onClick={plantSeed} disabled={!plantForm.req_id || !plantForm.title}>Plant</Ripple></div>
    </Scroll>}
    {seeds.map(s => {
      const isEditing = editSeed === s.req_id;
      return <Scroll key={s.req_id} style={{ marginBottom: 10, cursor: isEditing ? "default" : "pointer", borderColor: isEditing ? PETALS.stream + "44" : undefined, boxShadow: isEditing ? `0 0 20px ${PETALS.streamGlow}` : undefined }} onClick={() => !isEditing && tendSeed(s)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <SealOfReq id={s.req_id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: PETALS.moon, marginBottom: 4 }}>{s.title}</div>
            {!isEditing && <div style={{ fontSize: 12, color: PETALS.fog, lineHeight: 1.5 }}>{s.description}</div>}
            {!isEditing && (s.acceptance_criteria || []).length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, color: PETALS.fog, fontFamily: inkWell, textTransform: "uppercase" }}>Truths Within:</span>{s.acceptance_criteria.map((ac, i) => <div key={i} style={{ fontSize: 12, color: PETALS.mist, paddingLeft: 12, marginTop: 3, borderLeft: `2px solid ${PETALS.bark}` }}>• {ac}</div>)}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}><Pebble color={s.priority === "High" ? "ember" : s.priority === "Medium" ? "lantern" : "bamboo"}>{s.priority}</Pebble><Pebble color={s.status === "Approved" ? "bamboo" : s.status === "Review" ? "lantern" : s.status === "Rejected" ? "ember" : "fog"}>{s.status}</Pebble></div>
        </div>
        {isEditing && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${PETALS.bark}` }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PETALS.stream, marginBottom: 12, fontFamily: inkWell, textTransform: "uppercase" }}>Tending the Seed</div>
          {renderSoil(editForm, setEditForm, true)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {canUproot && deleteConfirm !== editSeed && <Ripple variant="danger" small onClick={() => setDeleteConfirm(editSeed)} style={{ marginRight: "auto" }}>Uproot</Ripple>}
            {canUproot && deleteConfirm === editSeed && <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}><span style={{ fontSize: 11, color: PETALS.ember }}>Uproot this seed? Linked tests become orphans in the storm.</span><Ripple variant="danger" small onClick={() => uprootSeed(editSeed)}>Confirm</Ripple><Ripple variant="ghost" small onClick={() => setDeleteConfirm(null)}>No</Ripple></div>}
            <Ripple variant="secondary" onClick={() => setEditSeed(null)}>Leave</Ripple>
            <Ripple onClick={saveTending} disabled={!editForm.title}>Save</Ripple>
          </div>
        </div>}
      </Scroll>;
    })}
  </div>;
};

// ─── HARVEST OF TESTS / AI GENERATES THE DRAFTS / ENGINEER MUST JUDGE ──

const HarvestView = ({ seeds, harvest, setHarvest, scrolls }) => {
  const [chosenSeed, setChosenSeed] = useState("");
  const [depth, setDepth] = useState("standard");
  const [summoning, setSummoning] = useState(false);
  const [openVerse, setOpenVerse] = useState(null);
  const [sessionIds, setSessionIds] = useState(null);
  const [viewMode, setViewMode] = useState("library");

  const visible = viewMode === "session" && sessionIds ? harvest.filter(h => sessionIds.includes(h.tc_id)) : harvest;
  const isDraft = tc => tc.status === "Draft";

  const summonDrafts = () => {
    if (!chosenSeed) return;
    setSummoning(true);
    const seed = seeds.find(s => s.req_id === chosenSeed);
    setTimeout(() => {
      const depthMap = { basic: 2, standard: 4, comprehensive: 7 };
      const types = ["Happy Path", "Negative", "Boundary", "Edge Case"];
      const newOnes = Array.from({ length: depthMap[depth] || 4 }, (_, i) => ({
        tc_id: `TC-${chosenSeed}-${String(harvest.length + i + 1).padStart(3, "0")}`,
        title: [`Verify ${seed?.title || "requirement"} — ${types[i % 4].toLowerCase()} path`, `Test ${types[i % 4].toLowerCase()} flow — ${seed?.title || "unknown"}`, `${types[i % 4]} — the ${["river", "mountain", "wind", "stone", "moon", "crane", "bamboo"][i % 7]} test`][i % 3],
        linked_req_ids: [chosenSeed], preconditions: "User walks the authenticated path, system is calm",
        steps: [{ step: `Navigate to the ${seed?.module || "relevant"} garden`, expectedResult: "The page blooms before you" }, { step: `Perform the ${types[i % 4].toLowerCase()} action`, expectedResult: types[i % 4] === "Happy Path" ? "Success flows like water" : types[i % 4] === "Negative" ? "Error appears, clear as thunder" : "Boundary holds firm as stone" }],
        pass_fail_criteria: types[i % 4] === "Happy Path" ? "All fields bloom correctly — the garden thrives" : "Error handled gracefully — the reed bends but does not break",
        type: types[i % 4], depth, status: "Draft", kb_references: [],
      }));
      setHarvest(prev => [...prev, ...newOnes]);
      setSessionIds(newOnes.map(t => t.tc_id));
      setViewMode("session");
      setSummoning(false);
    }, 2000);
  };

  const judgeVerse = (tcId, status) => { setHarvest(prev => prev.map(h => h.tc_id === tcId ? { ...h, status } : h)); };

  return <div>
    <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🎋 Harvest of Tests</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Ask the wind for drafts / Claude whispers test cases / review each one well</p></div>
    <Scroll glow style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: PETALS.stream, marginBottom: 12, fontFamily: inkWell, textTransform: "uppercase" }}>Summon Draft Haiku from Claude</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Chalice label="Choose a Seed" value={chosenSeed} onChange={setChosenSeed} style={{ minWidth: 280 }} options={[{ value: "", label: "— Select a requirement —" }, ...seeds.map(s => ({ value: s.req_id, label: `${s.req_id} — ${s.title}` }))]} />
        <Chalice label="Depth of Inquiry" value={depth} onChange={setDepth} style={{ minWidth: 200 }} options={[{ value: "basic", label: "🌿 Basic (2-3)" }, { value: "standard", label: "🌳 Standard (4-6)" }, { value: "comprehensive", label: "🌲 Comprehensive (6-10)" }]} />
        <Ripple onClick={summonDrafts} disabled={!chosenSeed || summoning}>{summoning ? "The wind carries..." : "Summon Drafts"}</Ripple>
      </div>
      {summoning && <div style={{ marginTop: 14 }}><WindSpinner /></div>}
    </Scroll>
    {harvest.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
      <Ripple small variant={viewMode === "library" ? "primary" : "secondary"} onClick={() => setViewMode("library")}>Full Garden ({harvest.length})</Ripple>
      {sessionIds && <Ripple small variant={viewMode === "session" ? "primary" : "secondary"} onClick={() => setViewMode("session")}>This Session ({sessionIds.length})</Ripple>}
      <span style={{ fontSize: 10, color: PETALS.fog, fontFamily: inkWell, marginLeft: 8 }}>TC-009: Session View</span>
    </div>}
    {visible.length === 0 ? <EmptyGarden icon="🎋" title="The garden is empty" subtitle="Summon drafts above to begin the harvest" /> : <>
      {visible.some(isDraft) && <DraftWarning style={{ marginBottom: 16 }} />}
      {visible.map(tc => <Scroll key={tc.tc_id} style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={() => setOpenVerse(openVerse === tc.tc_id ? null : tc.tc_id)}>
          <span style={{ fontFamily: inkWell, fontSize: 11, fontWeight: 700, color: PETALS.bamboo, background: PETALS.bambooDim, padding: "2px 8px", borderRadius: 4 }}>{tc.tc_id}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: PETALS.moon, display: "flex", alignItems: "center", gap: 8 }}>{tc.title}{isDraft(tc) && <span style={{ fontSize: 9, fontFamily: inkWell, color: PETALS.lantern, background: PETALS.lanternDim, padding: "1px 6px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>Draft</span>}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: PETALS.fog, fontFamily: inkWell }}>Traces to:</span>
              {(tc.linked_req_ids || []).map(rid => <SealOfReq key={rid} id={rid} />)}
              <Pebble color={tc.type === "Happy Path" ? "bamboo" : tc.type === "Negative" ? "ember" : tc.type === "Boundary" ? "lantern" : "wisteria"}>{tc.type}</Pebble>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
            <Ripple small variant={tc.status === "Reviewed" ? "primary" : "ghost"} onClick={e => { e.stopPropagation(); judgeVerse(tc.tc_id, "Reviewed"); }}>{tc.status === "Reviewed" ? "✓ Blessed" : "Bless"}</Ripple>
            <Ripple small variant={tc.status === "Rejected" ? "danger" : "ghost"} onClick={e => { e.stopPropagation(); judgeVerse(tc.tc_id, "Rejected"); }}>✗</Ripple>
            <Pebble color={tc.status === "Reviewed" ? "bamboo" : tc.status === "Rejected" ? "ember" : "lantern"} style={{ marginLeft: 4 }}>{tc.status}</Pebble>
          </div>
        </div>
        {openVerse === tc.tc_id && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${PETALS.bark}` }}>
          {isDraft(tc) && <div style={{ marginBottom: 14, padding: "8px 12px", background: PETALS.lanternDim, borderRadius: 6, fontSize: 10, color: PETALS.lantern, fontFamily: inkWell }}>DRAFT — The master's eye has not yet fallen here</div>}
          <div style={{ fontSize: 11, color: PETALS.fog, fontFamily: inkWell, marginBottom: 8 }}>PRECONDITIONS — THE PATH BEFORE</div>
          <div style={{ fontSize: 12, color: PETALS.mist, marginBottom: 14, paddingLeft: 12, borderLeft: `2px solid ${PETALS.bark}` }}>{tc.preconditions}</div>
          <div style={{ fontSize: 11, color: PETALS.fog, fontFamily: inkWell, marginBottom: 8 }}>STEPS — THE JOURNEY</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><th style={{ textAlign: "left", padding: "6px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>#</th><th style={{ textAlign: "left", padding: "6px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>The Step</th><th style={{ textAlign: "left", padding: "6px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>What Should Bloom</th></tr></thead>
            <tbody>{(tc.steps || []).map((s, i) => <tr key={i} style={{ borderBottom: `1px solid ${PETALS.bark}` }}><td style={{ padding: "8px 10px", color: PETALS.fog, fontFamily: inkWell }}>{i + 1}</td><td style={{ padding: "8px 10px", color: PETALS.mist }}>{s.step}</td><td style={{ padding: "8px 10px", color: PETALS.bamboo }}>{s.expectedResult}</td></tr>)}</tbody>
          </table>
          <div style={{ marginTop: 12 }}><span style={{ fontSize: 11, color: PETALS.fog, fontFamily: inkWell }}>JUDGMENT: </span><span style={{ fontSize: 12, color: PETALS.mist }}>{tc.pass_fail_criteria}</span></div>
        </div>}
      </Scroll>)}
    </>}
  </div>;
};

// ─── THREAD OF FATE / TRACEABILITY MATRIX HERE / WHICH SEED BEARS WHICH FRUIT ──

const ThreadOfFate = ({ seeds, harvest }) => <div>
  <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🕸️ Thread of Fate</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Each seed to its test / threads connect like spider silk / nothing is untied</p></div>
  <Scroll style={{ overflow: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr><th style={{ textAlign: "left", padding: "10px 14px", background: PETALS.stone, color: PETALS.stream, fontFamily: inkWell, fontSize: 11 }}>Seed</th><th style={{ textAlign: "left", padding: "10px 14px", background: PETALS.stone, color: PETALS.fog, fontSize: 11 }}>Requirement</th><th style={{ textAlign: "left", padding: "10px 14px", background: PETALS.stone, color: PETALS.fog, fontSize: 11 }}>Linked Harvest</th><th style={{ textAlign: "center", padding: "10px 14px", background: PETALS.stone, color: PETALS.fog, fontSize: 11 }}>Fate</th></tr></thead>
      <tbody>{seeds.map(s => {
        const linked = harvest.filter(h => (h.linked_req_ids || []).includes(s.req_id));
        const anyBlessed = linked.some(h => h.status === "Reviewed");
        return <tr key={s.req_id} style={{ borderBottom: `1px solid ${PETALS.bark}` }}>
          <td style={{ padding: "10px 14px" }}><SealOfReq id={s.req_id} /></td>
          <td style={{ padding: "10px 14px", color: PETALS.mist }}>{s.title}</td>
          <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{linked.length === 0 ? <span style={{ color: PETALS.ember, fontSize: 11, fontFamily: inkWell }}>— barren —</span> : linked.map(h => <span key={h.tc_id} style={{ fontFamily: inkWell, fontSize: 10, padding: "2px 6px", borderRadius: 3, color: h.status === "Reviewed" ? PETALS.bamboo : PETALS.lantern, background: h.status === "Reviewed" ? PETALS.bambooDim : PETALS.lanternDim }}>{h.tc_id}</span>)}</div></td>
          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 16 }}>{linked.length === 0 ? <span style={{ color: PETALS.ember }}>🍂</span> : anyBlessed ? <span style={{ color: PETALS.bamboo }}>🌸</span> : <span style={{ color: PETALS.lantern }}>🌗</span>}</td>
        </tr>;
      })}</tbody>
    </table>
  </Scroll>
</div>;

// ─── SCROLLS OF WISDOM / KNOWLEDGE BASE ENTRIES LIVE / LIKE MONKS PRESERVE TRUTH ──

const ScrollsView = ({ scrolls, setScrolls }) => {
  const [showInscribe, setShowInscribe] = useState(false);
  const [form, setForm] = useState({ title: "", type: "Defect History", content: "", tags: "" });
  const [storm, setStorm] = useState("");

  const inscribe = () => {
    if (!form.title || !form.content) { setStorm("A scroll needs title and content."); return; }
    const kbId = `KB-E${String(scrolls.length + 1).padStart(3, "0")}`;
    setScrolls(prev => [...prev, { kb_id: kbId, title: form.title, type: form.type, content: form.content, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), usage_count: 0 }]);
    setShowInscribe(false); setForm({ title: "", type: "Defect History", content: "", tags: "" });
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>📜 Scrolls of Wisdom</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Past bugs remembered / knowledge enriches new tests / wisdom never fades</p></div>
      <Ripple onClick={() => setShowInscribe(!showInscribe)}>+ Inscribe Scroll</Ripple>
    </div>
    {showInscribe && <Scroll glow style={{ marginBottom: 20 }}>
      <Brush label="Title of the Scroll" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} style={{ marginBottom: 12 }} />
      <Chalice label="Type of Wisdom" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} style={{ marginBottom: 12 }} options={["Defect History", "System Behavior", "Environment Constraint", "Business Rule", "Test Data Guideline"].map(t => ({ value: t, label: t }))} />
      <Brush label="The Wisdom Itself" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} textarea style={{ marginBottom: 12 }} />
      <Brush label="Tagged Seeds (comma-separated REQ IDs)" value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} mono style={{ marginBottom: 14 }} />
      <StormBanner msg={storm} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Ripple variant="secondary" onClick={() => setShowInscribe(false)}>Cancel</Ripple><Ripple onClick={inscribe} disabled={!form.title || !form.content}>Inscribe</Ripple></div>
    </Scroll>}
    {scrolls.map(e => <Scroll key={e.kb_id} style={{ marginBottom: 10 }}><div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span style={{ fontFamily: inkWell, fontSize: 11, fontWeight: 700, color: PETALS.wisteria, background: PETALS.wisteriaDim, padding: "2px 8px", borderRadius: 4 }}>{e.kb_id}</span><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: PETALS.moon }}>{e.title}</div><div style={{ fontSize: 12, color: PETALS.fog, marginTop: 4, lineHeight: 1.5 }}>{e.content}</div><div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><Pebble color="wisteria">{e.type}</Pebble>{(e.tags || []).map(t => <SealOfReq key={t} id={t} />)}<span style={{ fontSize: 10, color: PETALS.fog, fontFamily: inkWell, marginLeft: 8 }}>Consulted {e.usage_count || 0}×</span></div></div></div></Scroll>)}
  </div>;
};

// ─── TEMPLE KEEPERS / WHO GUARDS THE SACRED GATES / USERS MANAGED HERE ──

const TempleKeepers = ({ soul }) => {
  const [keepers] = useState(mockTempleRecords);
  const [auditScroll] = useState(mockAuditScroll);
  const isElder = soul.role === "Admin";
  const [lastOtp, setLastOtp] = useState(null);

  const issueOtp = (user) => { setLastOtp({ username: user.username, name: user.name, otp: "Hk" + Math.random().toString(36).slice(2, 8) }); };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>⛩️ Temple Keepers</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Who tends the garden? / Roles assigned like temple bells / each rings differently</p></div>
    </div>
    {!isElder && <Scroll style={{ marginBottom: 16, padding: "12px 16px" }}><div style={{ fontSize: 12, color: PETALS.lantern }}>UM-005: Only the Elder (Admin) may manage the temple keepers.</div></Scroll>}
    {lastOtp && <Scroll glow style={{ marginBottom: 16, border: `1px solid ${PETALS.bamboo}44` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: PETALS.bamboo, marginBottom: 10 }}>One-Time Password — Like a Falling Leaf</div>
      <div style={{ padding: "12px 16px", background: PETALS.stone, borderRadius: 6, display: "flex", gap: 24 }}>
        <div><div style={{ fontSize: 9, fontFamily: inkWell, color: PETALS.fog, textTransform: "uppercase" }}>Keeper</div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: inkWell, color: PETALS.stream, marginTop: 2 }}>{lastOtp.username}</div></div>
        <div><div style={{ fontSize: 9, fontFamily: inkWell, color: PETALS.fog, textTransform: "uppercase" }}>Secret Word</div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: inkWell, color: PETALS.lantern, marginTop: 2 }}>{lastOtp.otp}</div></div>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: PETALS.fog, fontFamily: inkWell }}>This leaf falls only once. It will not be shown again.</div>
      <Ripple small variant="secondary" onClick={() => setLastOtp(null)} style={{ marginTop: 10 }}>Dismiss</Ripple>
    </Scroll>}
    <Scroll style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: PETALS.mist, marginBottom: 14 }}>Keepers of the Garden ({keepers.filter(k => k.status === "Active").length} awake / {keepers.length} total)</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr><th style={{ textAlign: "left", padding: "8px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>Keeper</th><th style={{ textAlign: "left", padding: "8px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>Role</th><th style={{ textAlign: "left", padding: "8px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>Status</th><th style={{ textAlign: "left", padding: "8px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>Last Seen</th>{isElder && <th style={{ textAlign: "right", padding: "8px 10px", background: PETALS.stone, color: PETALS.fog, fontFamily: inkWell, fontSize: 10 }}>Actions</th>}</tr></thead>
        <tbody>{keepers.map(k => <tr key={k.id} style={{ borderBottom: `1px solid ${PETALS.bark}` }}>
          <td style={{ padding: "10px" }}><div style={{ color: PETALS.moon, fontWeight: 600 }}>{k.name}</div><div style={{ fontSize: 10, color: PETALS.fog, fontFamily: inkWell }}>@{k.username}</div></td>
          <td style={{ padding: "10px" }}><Pebble color={SEASONS[k.role]?.color || "stream"}>{k.role}</Pebble></td>
          <td style={{ padding: "10px" }}><Pebble color={k.status === "Active" ? (k.failed_attempts >= 5 ? "ember" : "bamboo") : "fog"}>{k.failed_attempts >= 5 ? "LOCKED" : k.status}</Pebble></td>
          <td style={{ padding: "10px", fontFamily: inkWell, fontSize: 10, color: PETALS.fog }}>{k.last_login ? new Date(k.last_login).toLocaleString() : "Never"}</td>
          {isElder && <td style={{ padding: "10px", textAlign: "right" }}><Ripple small variant="secondary" onClick={() => issueOtp(k)}>Reset PW</Ripple></td>}
        </tr>)}</tbody>
      </table>
    </Scroll>
    {isElder ? <Scroll>
      <div style={{ fontSize: 12, fontWeight: 600, color: PETALS.mist, marginBottom: 14 }}>Audit Scroll <span style={{ fontFamily: inkWell, fontSize: 10, color: PETALS.fog }}>UM-007 — all actions recorded</span></div>
      {auditScroll.map((l, i) => <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${PETALS.bark}`, display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
        <span style={{ fontFamily: inkWell, fontSize: 10, color: PETALS.fog, minWidth: 60 }}>{l.timestamp?.slice(11, 19)}</span>
        <Pebble color={l.status === "success" ? "bamboo" : "ember"} style={{ minWidth: 50, justifyContent: "center" }}>{l.action?.slice(0, 14)}</Pebble>
        <span style={{ color: PETALS.fog, fontFamily: inkWell, minWidth: 80 }}>{l.user_name}</span>
        <span style={{ color: PETALS.mist, flex: 1 }}>{l.details}</span>
      </div>)}
    </Scroll> : <Scroll style={{ padding: "14px 16px" }}><div style={{ fontSize: 12, color: PETALS.fog }}>The audit scroll is sealed — only Elders may read it.</div></Scroll>}
  </div>;
};

// ─── BRIDGE TO JAMA / EXPORT CROSSES THE WATER / TESTS REACH THE SHORE ──

const BridgeToJama = ({ harvest, seeds, soul }) => {
  const [exportScroll, setExportScroll] = useState([]);
  const isManager = soul.role === "QA Manager" || soul.role === "Admin";
  const readyToShip = harvest.filter(h => (h.linked_req_ids || []).length > 0 && h.status === "Reviewed");

  const crossBridge = () => {
    const orphaned = harvest.filter(h => { const linked = h.linked_req_ids || []; return linked.length === 0 || linked.every(r => !seeds.find(s => s.req_id === r)); });
    if (orphaned.length > 0) {
      setExportScroll(prev => [{ timestamp: new Date().toISOString(), action: "BLOCKED", details: `${orphaned.length} orphaned TCs — the bridge rejects them (JM-004)`, status: "error" }, ...prev]);
    } else {
      setExportScroll(prev => [{ timestamp: new Date().toISOString(), action: "EXPORT", details: `${readyToShip.length} blessed TCs crossed the bridge to Jama — REQ links intact`, status: "success" }, ...prev]);
    }
  };

  return <div>
    <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🌉 Bridge to Jama</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "4px 0 0", fontStyle: "italic" }}>Tests cross the bridge / validated before they go / Jama waits beyond</p></div>
    <Scroll style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Brush label="Jama Temple URL" value="https://your-org.jamacloud.com" onChange={() => {}} disabled={soul.role !== "Admin"} />
        <Brush label="Project Garden" value="AI-Test-Tool" onChange={() => {}} disabled={soul.role !== "Admin"} />
        <div><label style={{ fontSize: 11, fontWeight: 600, color: PETALS.fog, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Auth Seal</label><div style={{ fontFamily: inkWell, fontSize: 13, color: PETALS.bamboo, padding: "10px 12px", background: PETALS.bambooDim, borderRadius: 6 }}>OAuth 2.0 🔐</div></div>
      </div>
    </Scroll>
    <Scroll style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: PETALS.mist }}>Cross the Bridge</div><div style={{ fontSize: 11, color: PETALS.fog, marginTop: 4 }}>{readyToShip.length} blessed TCs ready to cross{!isManager && <span style={{ color: PETALS.lantern, marginLeft: 8 }}>— Requires Manager or Elder</span>}</div></div>
        <Ripple onClick={crossBridge} disabled={readyToShip.length === 0 || !isManager}>Validate & Export</Ripple>
      </div>
    </Scroll>
    <Scroll>
      <div style={{ fontSize: 12, fontWeight: 600, color: PETALS.mist, marginBottom: 12 }}>Bridge Crossing Log <span style={{ fontFamily: inkWell, fontSize: 10, color: PETALS.fog }}>JM-008</span></div>
      {exportScroll.length === 0 ? <div style={{ fontSize: 12, color: PETALS.fog, fontStyle: "italic" }}>No one has crossed yet. The bridge awaits.</div> :
      exportScroll.map((l, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${PETALS.bark}`, display: "flex", gap: 12, alignItems: "center" }}><Pebble color={l.status === "success" ? "bamboo" : "ember"}>{l.status}</Pebble><span style={{ fontSize: 12, color: PETALS.mist }}>{l.details}</span></div>)}
    </Scroll>
  </div>;
};

// ─── UNWRITTEN VERSES / FEATURES THAT WAIT FOR V2 / AUTUMN LEAVES DEFERRED ──

const UnwrittenVerses = () => <div>
  <div style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: PETALS.moon, margin: 0 }}>🍂 Unwritten Verses</h2><p style={{ fontSize: 12, color: PETALS.fog, margin: "6px 0 0", fontStyle: "italic" }}>Some poems wait still / not every verse finds its page / v2 will bring them</p></div>
  {[{ title: "Adaptive Learning Engine", sub: "AL-001 – AL-008", haiku: "The tool learns from past / patterns emerge like spring buds / descoped for focus" },
    { title: "Confluence KB Import", sub: "KB-007", haiku: "Wisdom locked away / in Confluence's deep waters / v2 frees the stream" },
    { title: "SSO / External Identity", sub: "UM-xxx", haiku: "One key for all doors / SAML and OAuth arrive / when winter has passed" }
  ].map((item, i) => <Scroll key={i} style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Pebble color="lantern">DEFERRED</Pebble><span style={{ fontSize: 14, fontWeight: 600, color: PETALS.moon }}>{item.title}</span><span style={{ fontFamily: inkWell, fontSize: 10, color: PETALS.fog }}>{item.sub}</span></div>
    <div style={{ fontSize: 12, color: PETALS.fog, lineHeight: 1.7, fontStyle: "italic" }}>{item.haiku}</div>
  </Scroll>)}
</div>;

// ─── THE WHOLE GARDEN / ALL PATHS CONVERGE RIGHT HERE / APP BLOOMS AT LAST ──

export default function HaikuForge() {
  const [gatePassed, setGatePassed] = useState(false);
  const [soul, setSoul] = useState(null);
  const [path, setPath] = useState("dashboard");

  // mutable state — like the seasons
  const [seeds, setSeeds] = useState(mockSeedsOfTruth);
  const [harvest, setHarvest] = useState(mockHarvestOfTests);
  const [scrolls, setScrolls] = useState(mockScrollsOfWisdom);

  const enterTemple = (data) => { setSoul(data.user); setGatePassed(true); };
  const leaveTemple = () => { setSoul(null); setGatePassed(false); setPath("dashboard"); };

  if (!gatePassed) return <GateOfEntry onLogin={enterTemple} />;

  return <div style={{ display: "flex", minHeight: "100vh", background: PETALS.void, fontFamily: brushStroke, color: PETALS.mist }}>
    <style>{`input:focus, textarea:focus, select:focus { border-color: ${PETALS.stream} !important; box-shadow: 0 0 0 2px ${PETALS.streamDim}; } button:hover:not(:disabled) { filter: brightness(1.15); }`}</style>
    <GardenPath active={path} onNavigate={setPath} soul={soul} onLeave={leaveTemple} />
    <main style={{ flex: 1, padding: "28px 36px", maxWidth: 1100, overflowY: "auto" }}>
      {path === "dashboard" && <CoverageGarden seeds={seeds} harvest={harvest} scrolls={scrolls} />}
      {path === "requirements" && <SeedsView seeds={seeds} setSeeds={setSeeds} soul={soul} />}
      {path === "testcases" && <HarvestView seeds={seeds} harvest={harvest} setHarvest={setHarvest} scrolls={scrolls} />}
      {path === "traceability" && <ThreadOfFate seeds={seeds} harvest={harvest} />}
      {path === "kb" && <ScrollsView scrolls={scrolls} setScrolls={setScrolls} />}
      {path === "users" && <TempleKeepers soul={soul} />}
      {path === "jama" && <BridgeToJama harvest={harvest} seeds={seeds} soul={soul} />}
      {path === "deferred" && <UnwrittenVerses />}
    </main>
  </div>;
}
