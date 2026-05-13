import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, font, mono } from "../theme";
import { Card, Badge, Button, Input, ErrorBanner } from "./shared";

// ─── Wizard Steps ───────────────────────────────────────────────────────────
const STEPS = [
  { key: "prereqs", label: "Prerequisites" },
  { key: "token", label: "Create Token" },
  { key: "configure", label: "Configure Claude" },
  { key: "test", label: "Test Connection" },
];

// ─── All MCP Tools (updated) ────────────────────────────────────────────────
const MCP_TOOLS = [
  { tool: "list_requirements", desc: "List and filter all requirements", example: '"Show me all approved requirements in the Test Case Generation module"' },
  { tool: "get_requirement", desc: "Get full details, KB context, and linked TCs for a requirement", example: '"Get me the details for RS-001 including any related knowledge base entries"' },
  { tool: "create_requirement", desc: "Create a new requirement", example: '"Create a new requirement RS-008 for PDF accessibility compliance"' },
  { tool: "update_requirement", desc: "Update an existing requirement's fields", example: '"Update RS-001 to change the priority to High and add acceptance criteria"' },
  { tool: "save_test_cases", desc: "Generate and save test case drafts to the database", example: '"Generate comprehensive test cases for RS-005 and save them"' },
  { tool: "list_test_cases", desc: "List test cases with filters by requirement or status", example: '"Show me all draft test cases for RS-001"' },
  { tool: "review_test_case", desc: "Mark a test case as Reviewed or Rejected", example: '"Mark TC-RS-001-001 through TC-RS-001-004 as reviewed"' },
  { tool: "update_test_case", desc: "Update a test case's steps, description, or type", example: '"Update TC-RS-001-002 to add a boundary check step"' },
  { tool: "list_kb_sections", desc: "View all KB sections and subsections with entry counts", example: '"Show me the knowledge base structure"' },
  { tool: "search_knowledge_base", desc: "Search KB entries by keyword, requirement, type, or subsection", example: '"Search the knowledge base for anything related to PDF parsing"' },
  { tool: "create_kb_entry", desc: "Add a new knowledge base entry to a specific subsection", example: '"Create a KB entry about the session timeout edge case in the Auth subsection"' },
  { tool: "update_kb_entry", desc: "Update a KB entry's content, tags, or type", example: '"Update KB-E001 to add the RS-002 tag"' },
  { tool: "add_kb_images", desc: "Attach images to a KB entry (base64)", example: '"Add this screenshot to KB-E003"' },
  { tool: "remove_kb_image", desc: "Remove an image from a KB entry by index", example: '"Remove the first image from KB-E001"' },
  { tool: "get_coverage_summary", desc: "Get overall test coverage statistics", example: '"What is our current requirement coverage percentage?"' },
];

// ─── Example Workflows ──────────────────────────────────────────────────────
const WORKFLOWS = [
  { title: "Generate Test Cases", prompt: "Look at requirement RS-001 in TestForge, including any relevant knowledge base entries, and generate comprehensive test cases. Save them when done.", detail: "Claude reads the requirement and KB context, generates test cases, and saves them as drafts." },
  { title: "Check Coverage Gaps", prompt: "Show me all requirements in TestForge that don't have test cases yet.", detail: "Returns untested requirements so you know where to focus." },
  { title: "Review Test Cases", prompt: "Mark TC-RS-001-001 and TC-RS-001-002 as reviewed.", detail: "Updates the status from Draft to Reviewed." },
  { title: "Batch Generation", prompt: "For every approved requirement without test cases, generate standard-depth test cases and save them. Then summarize what was created.", detail: "Claude chains multiple tools together automatically." },
  { title: "Build Knowledge Base", prompt: "List the KB sections, then create a new entry in the Command subsection about the timeout behavior we just discovered.", detail: "Claude discovers the structure and places the entry in the right subsection." },
];

// ─── Troubleshooting ────────────────────────────────────────────────────────
const TROUBLESHOOTING = [
  { problem: '"Could not load app settings" on launch', solution: "Your config JSON is malformed. Open the file and validate it at jsonlint.com" },
  { problem: 'Claude says "no tools from TestForge"', solution: "Check Settings → Developer. If testforge isn't listed, the config file is in the wrong location" },
  { problem: "testforge shows in Developer but no tools", solution: "Check MCP logs in Claude's logs folder. Common cause: token expired (create a new one in TestForge)" },
  { problem: '"Invalid or missing MCP token"', solution: "Token was lost when Docker rebuilt. Create a new token in Settings & MCP and update your config" },
  { problem: "Config file not found by Claude", solution: "Windows Store installs use a different path. Use Settings → Developer → Edit Config to find the real location" },
];

// ═════════════════════════════════════════════════════════════════════════════

export const McpTokensView = ({ currentUser }) => {
  const COLORS = useTheme();

  // Data
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Wizard state
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Step 2: Token creation
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);

  // Step 3: Configuration
  const [bridgePath, setBridgePath] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [installOs, setInstallOs] = useState("windows");
  const [showConfig, setShowConfig] = useState("desktop");
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Step 4: Connection test
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Main view
  const [showGuide, setShowGuide] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const serverUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:3000";

  const loadTokens = useCallback(async () => {
    try { setTokens(await api.getMcpTokens()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

    const [allTokens, setAllTokens] = useState([]);
  const [allTokensLoading, setAllTokensLoading] = useState(false);
  const [adminConfirmRevoke, setAdminConfirmRevoke] = useState(null);

  const loadAllTokens = useCallback(async () => {
    if (currentUser?.role !== "Admin") return;
    setAllTokensLoading(true);
    try {
      setAllTokens(await api.getAllMcpTokens());
    } catch (err) {
      console.error("Failed to load all tokens:", err);
    } finally {
      setAllTokensLoading(false);
    }
  }, [currentUser?.role]);

  const adminRevokeToken = async (id) => {
    try {
      await api.adminRevokeMcpToken(id);
      loadAllTokens();
      loadTokens();
      setAdminConfirmRevoke(null);
    } catch (err) {
      console.error("Admin revoke failed:", err);
    }
  };

  useEffect(() => { loadTokens(); loadAllTokens(); }, [loadTokens, loadAllTokens]);

  // Auto-detect OS
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("mac")) setInstallOs("mac");
      else if (ua.includes("linux")) setInstallOs("linux");
      else setInstallOs("windows");
    }
  }, []);

  // Auto-launch wizard if no tokens exist (skip for Admins so they can see All User Tokens)
  useEffect(() => {
    if (!loading && tokens.length === 0 && !wizardActive && currentUser?.role !== "Admin") setWizardActive(true);
  }, [loading, tokens.length, wizardActive, currentUser?.role]);

  // ── Token actions ───────────────────────────────────────────────────────

  const createToken = async () => {
    setError(""); setCopied(false);
    if (!tokenName.trim()) { setError("Token name is required."); return; }
    try {
      const data = await api.createMcpToken(tokenName.trim());
      setNewToken(data);
      setTokenName("");
      loadTokens();
    } catch (err) { setError(err.message); }
  };

  const deleteToken = async (id) => {
    try { await api.deleteMcpToken(id); loadTokens(); setConfirmRevoke(null); }
    catch (err) { console.error(err); }
  };

  const copyToken = () => {
    if (newToken?.token) {
      navigator.clipboard.writeText(newToken.token).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 3000);
      });
    }
  };

  // ── Wizard navigation ──────────────────────────────────────────────────

  const startWizard = () => {
    setWizardActive(true);
    setWizardStep(0);
    setTokenName("");
    setNewToken(null);
    setBridgePath("");
    setCustomUrl("");
    setError("");
    setCopied(false);
    setCopiedCmd(false);
  };

  const finishWizard = () => {
    setWizardActive(false);
    setWizardStep(0);
    setNewToken(null);
    setBridgePath("");
    setError("");
  };

  // ── Config generation ──────────────────────────────────────────────────

  const effectiveUrl = customUrl || serverUrl;

  // Auto-append mcp-bridge.mjs to the folder path
  const fullBridgePath = (() => {
    const p = bridgePath.trim();
    if (!p) return "";
    const sep = p.includes("\\") ? "\\" : "/";
    const clean = p.endsWith(sep) ? p.slice(0, -1) : p;
    return `${clean}${sep}mcp-bridge.mjs`;
  })();

  const getDesktopConfigJson = (token, path) => JSON.stringify({
    mcpServers: {
      testforge: {
        command: "node",
        args: [path || "PATH_TO_MCP_BRIDGE"],
        env: { MCP_TOKEN: token || "tfmcp_your_token_here", TESTFORGE_URL: effectiveUrl }
      }
    }
  }, null, 2);

  const getFullDesktopConfig = (token, path) => JSON.stringify({
    preferences: { coworkScheduledTasksEnabled: true, ccdScheduledTasksEnabled: true, sidebarMode: "chat", coworkWebSearchEnabled: true },
    mcpServers: {
      testforge: {
        command: "node",
        args: [path || "PATH_TO_MCP_BRIDGE"],
        env: { MCP_TOKEN: token || "tfmcp_your_token_here", TESTFORGE_URL: effectiveUrl }
      }
    }
  }, null, 2);

  const downloadConfig = () => {
    if (!newToken?.token || !fullBridgePath) return;
    const json = getFullDesktopConfig(newToken.token, fullBridgePath);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "claude_desktop_config.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const getInstallCommand = (token, path) => {
    const configJson = getFullDesktopConfig(token, path);

    if (installOs === "windows") {
      const b64 = btoa(configJson);
      return `$storePath = Get-ChildItem "$env:LOCALAPPDATA\\Packages\\Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($storePath) { $configDir = Join-Path $storePath.FullName "LocalCache\\Roaming\\Claude" } else { $configDir = "$env:APPDATA\\Claude" }; if (!(Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }; $configPath = Join-Path $configDir "claude_desktop_config.json"; $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${b64}")); [System.IO.File]::WriteAllText($configPath, $json, [System.Text.UTF8Encoding]::new($false)); Write-Host "Config saved to $configPath" -ForegroundColor Green; Write-Host "Restart Claude Desktop to activate." -ForegroundColor Yellow`;
    } else if (installOs === "mac") {
      return `CONFIG_DIR="$HOME/Library/Application Support/Claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    } else {
      return `CONFIG_DIR="$HOME/.config/claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    }
  };

  const copyInstallCommand = () => {
    if (!newToken?.token || !fullBridgePath) return;
    navigator.clipboard.writeText(getInstallCommand(newToken.token, fullBridgePath)).then(() => {
      setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 3000);
    });
  };

  const configSnippets = {
    desktop: getDesktopConfigJson(newToken?.token, fullBridgePath || undefined),
    code: `# Claude Code — run in terminal
claude mcp add testforge \\
  --transport sse \\
  --url ${effectiveUrl}/mcp/sse \\
  --header "Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}"`,
    web: `URL:     ${effectiveUrl}/mcp/sse
Header:  Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}

In Claude.ai → Settings → Connected Apps → Add MCP Server
Paste the URL above and add the Authorization header.`,
  };

  // ── Render: Step indicator ─────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {STEPS.map((step, i) => {
        const isActive = i === wizardStep;
        const isComplete = i < wizardStep;
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, fontFamily: mono,
                background: isComplete ? COLORS.green : isActive ? COLORS.accent : COLORS.surface,
                color: isComplete || isActive ? "#fff" : COLORS.textMuted,
                border: `2px solid ${isComplete ? COLORS.green : isActive ? COLORS.accent : COLORS.border}`,
              }}>
                {isComplete ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? COLORS.textBright : COLORS.textMuted }}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: isComplete ? COLORS.green : COLORS.border, margin: "0 12px" }} />}
          </div>
        );
      })}
    </div>
  );

  // ── Render: Step 1 — Prerequisites ─────────────────────────────────────

  const renderPrereqs = () => (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>Before You Begin</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        Claude Desktop runs on your computer but connects to your TestForge server. A small bridge script handles this connection.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18, color: COLORS.green }}>◈</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>Node.js Installed</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6, paddingLeft: 28 }}>
            Run <span style={{ fontFamily: mono, fontSize: 11, background: COLORS.bg, padding: "2px 6px", borderRadius: 3 }}>node --version</span> in your terminal. You need Node.js 18 or later.
          </div>
        </div>

        <div style={{ padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.accent}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18, color: COLORS.accent }}>◧</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>Download the Bridge Script</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6, paddingLeft: 28, marginBottom: 10 }}>
            Download <span style={{ fontFamily: mono, fontSize: 11 }}>mcp-bridge.mjs</span> and save it to a folder on <span style={{ fontWeight: 600 }}>your computer</span> (not the server). Remember where you save it — you'll need the folder path in Step 3.
          </div>
          <div style={{ paddingLeft: 28, display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Button small onClick={() => {
              const a = document.createElement("a"); a.href = "/mcp-bridge.mjs"; a.download = "mcp-bridge.mjs";
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }}>Download mcp-bridge.mjs</Button>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>3 KB · zero dependencies</span>
          </div>
          <div style={{ paddingLeft: 28, fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6, padding: "8px 12px 8px 28px", background: COLORS.bg, borderRadius: 6, marginLeft: 28 }}>
            <div style={{ marginBottom: 4, fontWeight: 600, color: COLORS.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested location</div>
            {installOs === "windows"
              ? <div><span style={{ fontFamily: mono, color: COLORS.accent }}>C:\Users\you\Documents\mcp-bridge.mjs</span></div>
              : <div><span style={{ fontFamily: mono, color: COLORS.accent }}>~/Documents/mcp-bridge.mjs</span></div>
            }
            <div style={{ marginTop: 4, fontSize: 10 }}>Any folder works — just remember the location.</div>
          </div>
          <div style={{ paddingLeft: 28, marginTop: 10, fontSize: 10, color: COLORS.textMuted }}>
            Running TestForge locally? The file is already in your TestForge root folder — no download needed.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <Button variant="secondary" onClick={finishWizard}>Cancel</Button>
        <Button onClick={() => setWizardStep(1)}>I've Done This — Next</Button>
      </div>
    </Card>
  );

  // ── Render: Step 2 — Create Token ──────────────────────────────────────

  const renderCreateToken = () => (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>Create an Access Token</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        This token authenticates your Claude client with TestForge. It's tied to your account ({currentUser.name} / {currentUser.role}).
      </div>

      {!newToken ? <>
        <Input label="Token Name" value={tokenName} onChange={setTokenName}
          placeholder='e.g. My-Desktop, QA-Lab-Machine' />
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          This name is for your reference only — it helps you identify which token belongs to which machine
          or Claude client. Use something like <span style={{ fontFamily: mono, color: COLORS.accent }}>YourName-Desktop</span> or <span style={{ fontFamily: mono, color: COLORS.accent }}>YourName-Code</span>.
        </div>
        <ErrorBanner msg={error} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <Button variant="secondary" onClick={() => setWizardStep(0)}>Back</Button>
          <Button onClick={createToken} disabled={!tokenName.trim()}>Create Token</Button>
        </div>
      </> : <>
        <div style={{ padding: 14, background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 12, color: COLORS.amber, marginBottom: 16 }}>
          Copy this token now — it will not be shown again.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{
            flex: 1, fontFamily: mono, fontSize: 12, color: COLORS.accent,
            background: COLORS.bg, padding: "10px 14px", borderRadius: 6,
            border: `1px solid ${COLORS.border}`, wordBreak: "break-all", userSelect: "all",
          }}>
            {newToken.token}
          </div>
          <Button small onClick={copyToken}>{copied ? "Copied!" : "Copy"}</Button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <Button variant="secondary" onClick={() => setWizardStep(0)}>Back</Button>
        <Button onClick={() => setWizardStep(2)}>Next — Configure Claude</Button>
        </div>
      </>}
    </Card>
  );

  // ── Render: Step 3 — Configure Claude ──────────────────────────────────

  const renderConfigure = () => (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>Configure Your Claude Client</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        Provide your server URL and bridge path, then choose how to install the config.
      </div>

      {/* Server URL */}
      <div style={{ marginBottom: 16 }}>
        <Input
          label="TestForge Server URL"
          value={customUrl || serverUrl}
          onChange={setCustomUrl}
          mono
          placeholder={serverUrl}
          style={{ marginBottom: 4 }}
        />
        <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
          {effectiveUrl === serverUrl ? (
            <span>Auto-detected from your browser. <span style={{ color: COLORS.amber, fontWeight: 600 }}>If TestForge runs on a remote server, change this to the URL your machine can reach</span> (e.g. <span style={{ fontFamily: mono }}>https://testforge.yourcompany.com</span>).</span>
          ) : (
            <span>Using custom URL. The bridge script on your machine will connect to this address.</span>
          )}
        </div>
      </div>

      {/* Bridge path input — Desktop only */}
      {showConfig === "desktop" && (
        <div style={{ marginBottom: 16 }}>
          <Input
            label="Path to your TestForge folder"
            value={bridgePath}
            onChange={setBridgePath}
            mono
            placeholder={installOs === "windows"
              ? "C:\\Users\\you\\Documents\\testforge-ai"
              : "/Users/you/Documents/testforge-ai"}
            style={{ marginBottom: 4 }}
          />
          {bridgePath.trim() ? (
            <div style={{ marginTop: 6, padding: "8px 12px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Bridge script path (auto-generated)</div>
              <div style={{ fontSize: 11, fontFamily: mono, color: COLORS.accent, wordBreak: "break-all" }}>{fullBridgePath}</div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
              Enter the folder where TestForge is installed. The bridge script filename (<span style={{ fontFamily: mono }}>mcp-bridge.mjs</span>) will be appended automatically.
            </div>
          )}
        </div>
      )}

      {/* Client type tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { key: "desktop", label: "Claude Desktop" },
          { key: "code", label: "Claude Code" },
          { key: "web", label: "Claude Web" },
        ].map(tab => (
          <Button key={tab.key} small variant={showConfig === tab.key ? "primary" : "secondary"} onClick={() => setShowConfig(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── Claude Desktop config ── */}
      {showConfig === "desktop" && <>
        {!bridgePath.trim() ? (
          <div style={{ padding: 16, textAlign: "center", color: COLORS.textMuted, fontSize: 12, border: `1px dashed ${COLORS.border}`, borderRadius: 8 }}>
            Enter the folder path above to generate the config
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Option A: Terminal auto-install (recommended) */}
            <div style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.accent}33` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright }}>Auto-Install via Terminal</span>
                    <span style={{ fontSize: 9, fontFamily: mono, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "2px 6px", borderRadius: 3 }}>RECOMMENDED</span>
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>Detects config folder and writes the file automatically</div>
                </div>
                <Button small onClick={copyInstallCommand}>{copiedCmd ? "Copied!" : "Copy Command"}</Button>
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {[
                  { key: "windows", label: "PowerShell" },
                  { key: "mac", label: "macOS" },
                  { key: "linux", label: "Linux" },
                ].map(os => (
                  <Button key={os.key} small variant={installOs === os.key ? "primary" : "ghost"} onClick={() => { setInstallOs(os.key); setCopiedCmd(false); }} style={{ fontSize: 10, padding: "3px 10px" }}>
                    {os.label}
                  </Button>
                ))}
              </div>
              <pre style={{
                fontFamily: mono, fontSize: 10, color: COLORS.text, background: COLORS.bg,
                padding: 12, borderRadius: 6, border: `1px solid ${COLORS.border}`,
                overflow: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, maxHeight: 220,
              }}>
                {getInstallCommand(newToken?.token, fullBridgePath)}
              </pre>
              <div style={{ marginTop: 8, padding: "8px 12px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.6 }}>
                {installOs === "windows" ? (
                  <span>The long encoded string in this command is your config JSON encoded as <span style={{ fontFamily: mono, fontWeight: 600 }}>base64</span> — a standard encoding format, not encryption. This avoids formatting issues when pasting into PowerShell. You can verify the contents by running: <span style={{ fontFamily: mono, color: COLORS.accent }}>{'[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("paste_the_string_here"))'}</span></span>
                ) : (
                  <span>This command writes your config JSON directly to the Claude config folder using a heredoc. You can inspect the generated file afterward to verify its contents.</span>
                )}
              </div>
            </div>

            {/* Option B: Manual download */}
            <div style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>Manual Install — Download Config File</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    Download <span style={{ fontFamily: mono }}>claude_desktop_config.json</span> and place it in the correct folder below
                  </div>
                </div>
                <Button small variant="secondary" onClick={downloadConfig}>Download</Button>
              </div>
              {/* Config folder locations */}
              <div style={{ padding: "10px 12px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 10, lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, color: COLORS.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>Place the file in this folder:</div>
                <div style={{ color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>
                  <span style={{ fontFamily: mono, fontWeight: 600 }}>Windows (Standard):</span>{" "}
                  <span style={{ fontFamily: mono }}>%APPDATA%\Claude\</span>
                </div>
                <div style={{ color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>
                  <span style={{ fontFamily: mono, fontWeight: 600 }}>Windows (Store):</span>{" "}
                  <span style={{ fontFamily: mono }}>%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\</span>
                </div>
                <div style={{ color: installOs === "mac" ? COLORS.textBright : COLORS.textMuted }}>
                  <span style={{ fontFamily: mono, fontWeight: 600 }}>macOS:</span>{" "}
                  <span style={{ fontFamily: mono }}>~/Library/Application Support/Claude/</span>
                </div>
                <div style={{ color: installOs === "linux" ? COLORS.textBright : COLORS.textMuted }}>
                  <span style={{ fontFamily: mono, fontWeight: 600 }}>Linux:</span>{" "}
                  <span style={{ fontFamily: mono }}>~/.config/claude/</span>
                </div>
                <div style={{ marginTop: 6, color: COLORS.amber, fontSize: 10 }}>
                  Tip: In Claude Desktop, go to Settings → Developer → Edit Config to open the correct folder automatically.
                </div>
              </div>
            </div>

            <div style={{ padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber }}>
              After installing, fully quit Claude Desktop (system tray → Quit) and reopen it. Check Settings → Developer to verify "testforge" appears.
            </div>
          </div>
        )}
      </>}

      {/* ── Claude Code config ── */}
      {showConfig === "code" && (
        <div>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 10, lineHeight: 1.6 }}>
            Claude Code connects directly via SSE — no bridge script needed. Run this in your terminal:
          </div>
          <pre style={{
            fontFamily: mono, fontSize: 11, color: COLORS.text, background: COLORS.bg,
            padding: 14, borderRadius: 6, border: `1px solid ${COLORS.border}`,
            overflow: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
          }}>
            {configSnippets.code}
          </pre>
        </div>
      )}

      {/* ── Claude Web config ── */}
      {showConfig === "web" && (
        <div>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 10, lineHeight: 1.6 }}>
            In Claude.ai, go to Settings → Connected Apps → Add MCP Server:
          </div>
          <pre style={{
            fontFamily: mono, fontSize: 11, color: COLORS.text, background: COLORS.bg,
            padding: 14, borderRadius: 6, border: `1px solid ${COLORS.border}`,
            overflow: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
          }}>
            {configSnippets.web}
          </pre>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <Button variant="secondary" onClick={() => setWizardStep(1)}>Back</Button>
        <Button onClick={() => { setTestResult(null); setWizardStep(3); }}>Next — Test Connection</Button>
      </div>
    </Card>
  );

  // ── Render: Step 4 — Test Connection ─────────────────────────────────

  const runConnectionTest = async () => {
    if (!newToken?.token) {
      setTestResult({ ok: false, message: "No token available to test. Go back and create a token first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.verifyMcpToken(newToken.token);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: `Request failed: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const renderTestConnection = () => (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>Test Your Connection</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        Verify that your token can authenticate with TestForge before opening Claude Desktop.
      </div>

      {/* Test button */}
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <Button onClick={runConnectionTest} disabled={testing}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
      </div>

      {/* Result display */}
      {testResult && (
        <div style={{
          marginTop: 8,
          padding: "14px 18px",
          borderRadius: 8,
          border: `1px solid ${testResult.ok ? (COLORS.green || "#22c55e") + "60" : (COLORS.red || "#ef4444") + "60"}`,
          background: testResult.ok ? (COLORS.green || "#22c55e") + "10" : (COLORS.red || "#ef4444") + "10",
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: testResult.ok ? (COLORS.green || "#22c55e") : (COLORS.red || "#ef4444"),
            marginBottom: 6,
          }}>
            {testResult.ok ? "✓ Connection Successful" : "✗ Connection Failed"}
          </div>
          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.5 }}>
            {testResult.message}
          </div>
          {testResult.ok && testResult.user && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8, fontFamily: mono }}>
              Authenticated as: {testResult.user.name} (@{testResult.user.username}) · {testResult.user.role}
            </div>
          )}
          {!testResult.ok && testResult.reason === "inactive_user" && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
              Contact an Admin to activate your account, then try again.
            </div>
          )}
          {!testResult.ok && testResult.reason === "invalid" && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
              If the Docker container was recently rebuilt, the database may have been reset.
              Go back and create a new token.
            </div>
          )}
        </div>
      )}

      {/* Next steps hint on success */}
      {testResult?.ok && (
        <div style={{
          marginTop: 16,
          padding: "12px 16px",
          background: COLORS.surface,
          borderRadius: 8,
          border: `1px solid ${COLORS.border}`,
          fontSize: 12,
          color: COLORS.text,
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Next steps:</div>
          <div>1. Open Claude Desktop and fully restart it (quit from system tray → reopen)</div>
          <div>2. Go to Settings → Developer and confirm <span style={{ fontFamily: mono, color: COLORS.accent }}>testforge</span> appears</div>
          <div>3. Start a conversation and ask Claude to list your requirements</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <Button variant="secondary" onClick={() => setWizardStep(2)}>Back</Button>
        <Button onClick={finishWizard}>{testResult?.ok ? "Done" : "Skip & Finish"}</Button>
      </div>
    </Card>
  );

  // ── Render: Wizard ─────────────────────────────────────────────────────

  const renderWizard = () => (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Connect Claude to TestForge</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>
          {tokens.length > 0 ? "Setting up a new connection" : "First-time setup"}
        </p>
      </div>
      {renderStepIndicator()}
      {wizardStep === 0 && renderPrereqs()}
      {wizardStep === 1 && renderCreateToken()}
      {wizardStep === 2 && renderConfigure()}
      {wizardStep === 3 && renderTestConnection()}
    </div>
  );

  // ── Render: Main view ──────────────────────────────────────────────────

  const renderMainView = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>MCP Integration</h2>
          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>
            {tokens.length} token{tokens.length !== 1 ? "s" : ""} · {MCP_TOOLS.length} tools available
          </p>
        </div>
        <Button onClick={startWizard}>+ New Connection</Button>
      </div>

      {/* How it works — compact */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { icon: "◈", title: "No API Key Needed", desc: "Claude uses your own subscription" },
          { icon: "◧", title: "Your Billing", desc: "Requests billed to your Claude account" },
          { icon: "◨", title: "Full Tool Access", desc: `${MCP_TOOLS.length} tools for requirements, TCs, and KB` },
        ].map((item, i) => (
          <div key={i} style={{ padding: 12, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <span style={{ fontSize: 16, color: COLORS.accent, display: "block", marginBottom: 6 }}>{item.icon}</span>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>{item.title}</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* Tokens table */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 12 }}>Access Tokens</div>
        {loading ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>Loading...</div>
        ) : tokens.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No tokens yet. Click "New Connection" to get started.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Name", "Token", "Created", "Last Used", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 4 ? "right" : "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "10px", color: COLORS.textBright, fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 11, color: COLORS.textMuted }}>{t.token_preview}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>{t.last_used ? new Date(t.last_used).toLocaleString() : "Never"}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    {confirmRevoke === t.id ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Revoke?</span>
                        <Button small onClick={() => deleteToken(t.id)} style={{ background: COLORS.red || "#ef4444", color: "#fff" }}>Confirm</Button>
                        <Button small variant="ghost" onClick={() => setConfirmRevoke(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button small variant="danger" onClick={() => setConfirmRevoke(t.id)}>Revoke</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {currentUser?.role === "Admin" && (
  <Card style={{ marginBottom: 20 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>All User Tokens</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
          Admin view — manage MCP tokens across all users
        </div>
      </div>
      <Button small variant="ghost" onClick={loadAllTokens} disabled={allTokensLoading}>
        {allTokensLoading ? "Loading..." : "Refresh"}
      </Button>
    </div>

    {allTokensLoading ? (
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>Loading...</div>
    ) : allTokens.length === 0 ? (
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>
        No MCP tokens exist across any users.
      </div>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["User", "Status", "Token Name", "Token", "Created", "Last Used", ""].map((h, i) => (
              <th key={i} style={{
                textAlign: i === 6 ? "right" : "left",
                padding: "8px 10px",
                background: COLORS.surface,
                color: COLORS.textMuted,
                fontFamily: mono,
                fontSize: 10,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTokens.map(t => {
            const isInactive = t.user_status !== "Active";
            return (
              <tr key={t.id} style={{
                borderBottom: `1px solid ${COLORS.border}`,
                opacity: isInactive ? 0.6 : 1,
              }}>
                <td style={{ padding: "10px" }}>
                  <div style={{ color: COLORS.textBright, fontWeight: 600, fontSize: 12 }}>{t.user_name}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 10 }}>@{t.username} · {t.user_role}</div>
                </td>
                <td style={{ padding: "10px" }}>
                  <Badge color={isInactive ? (COLORS.red || "#ef4444") : (COLORS.green || "#22c55e")}>
                    {t.user_status}
                  </Badge>
                </td>
                <td style={{ padding: "10px", color: COLORS.text }}>{t.name}</td>
                <td style={{ padding: "10px", fontFamily: mono, fontSize: 11, color: COLORS.textMuted }}>
                  {t.token_preview}
                </td>
                <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                  {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                  {t.last_used ? new Date(t.last_used).toLocaleString() : "Never"}
                </td>
                <td style={{ padding: "10px", textAlign: "right" }}>
                  {adminConfirmRevoke === t.id ? (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>Revoke?</span>
                      <Button small onClick={() => adminRevokeToken(t.id)}
                        style={{ background: COLORS.red || "#ef4444", color: "#fff" }}>
                        Confirm
                      </Button>
                      <Button small variant="ghost" onClick={() => setAdminConfirmRevoke(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button small variant="danger" onClick={() => setAdminConfirmRevoke(t.id)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}

    {allTokens.some(t => t.user_status !== "Active") && (
      <div style={{
        marginTop: 12,
        padding: "10px 14px",
        background: `${COLORS.yellow || "#f59e0b"}15`,
        border: `1px solid ${COLORS.yellow || "#f59e0b"}40`,
        borderRadius: 6,
        fontSize: 11,
        color: COLORS.text,
        lineHeight: 1.5,
      }}>
        <strong style={{ color: COLORS.yellow || "#f59e0b" }}>Note:</strong> Tokens belonging to
        inactive users cannot authenticate but still exist in the database.
        Consider revoking them to keep the token list clean.
      </div>
    )}
  </Card>
)}

      {/* Available tools */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Available MCP Tools</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>Once connected, ask Claude in natural language. These tools run automatically.</div>
        {MCP_TOOLS.map((t, i) => (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < MCP_TOOLS.length - 1 ? `1px solid ${COLORS.border}` : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: COLORS.green, background: COLORS.greenDim, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 2 }}>
              {t.tool}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: COLORS.text }}>{t.desc}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 3 }}>Try: {t.example}</div>
            </div>
          </div>
        ))}
      </Card>

      {/* Workflows & Troubleshooting */}
      <Card>
        <div onClick={() => setShowGuide(prev => !prev)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>Example Workflows & Troubleshooting</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Prompt examples and common fixes</div>
          </div>
          <span style={{ fontSize: 18, color: COLORS.accent, transition: "transform 0.2s", transform: showGuide ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        </div>

        {showGuide && (
          <div style={{ marginTop: 20, fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, marginBottom: 12 }}>Example Workflows</div>
            {WORKFLOWS.map((ex, i) => (
              <div key={i} style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 6 }}>{ex.title}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent, background: COLORS.bg, padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, marginBottom: 6, lineHeight: 1.5, fontStyle: "italic" }}>"{ex.prompt}"</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{ex.detail}</div>
              </div>
            ))}

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, margin: "24px 0 12px" }}>Troubleshooting</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Problem</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Solution</th>
                </tr>
              </thead>
              <tbody>
                {TROUBLESHOOTING.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "8px 10px", color: COLORS.amber, fontFamily: mono, fontSize: 10 }}>{row.problem}</td>
                    <td style={{ padding: "8px 10px", color: COLORS.text }}>{row.solution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────

  return wizardActive ? renderWizard() : renderMainView();
};