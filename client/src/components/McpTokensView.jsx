import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useTheme, font, mono } from "../theme";
import { Card, Badge, Button, Input, ErrorBanner } from "./shared";

export const McpTokensView = ({ currentUser }) => {
  const COLORS = useTheme();
  const [tokens, setTokens] = useState([]);
  const [tokenName, setTokenName] = useState("");
  const [bridgePath, setBridgePath] = useState("");
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState("desktop");
  const [installOs, setInstallOs] = useState("windows");
  const [showGuide, setShowGuide] = useState(false);

  const serverUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:3000";

  const loadTokens = useCallback(async () => {
    try {
      setTokens(await api.getMcpTokens());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("mac")) {
        setInstallOs("mac");
      } else if (ua.includes("linux")) {
        setInstallOs("linux");
      } else {
        setInstallOs("windows");
      }
    }
  }, []);

  const createToken = async () => {
    setError(""); setCopied(false); setCopiedCmd(false);
    if (!tokenName.trim()) { setError("Token name is required."); return; }
    if (!bridgePath.trim()) { setError("Path to mcp-bridge.mjs is required. Download the file first, then enter the full path to where you saved it."); return; }
    try {
      const data = await api.createMcpToken(tokenName.trim());
      setNewToken({ ...data, bridgePath: bridgePath.trim() });
      setTokenName("");
      loadTokens();
    } catch (err) { setError(err.message); }
  };

  const deleteToken = async (id) => {
    try { await api.deleteMcpToken(id); loadTokens(); if (newToken) setNewToken(null); }
    catch (err) { console.error(err); }
  };

  const copyToken = () => {
    if (newToken?.token) {
      navigator.clipboard.writeText(newToken.token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      });
    }
  };

  const getDesktopConfigJson = (token, path) => {
    return JSON.stringify({
      mcpServers: {
        testforge: {
          command: "node",
          args: [path || bridgePath],
          env: {
            MCP_TOKEN: token || "tfmcp_your_token_here",
            TESTFORGE_URL: serverUrl
          }
        }
      }
    }, null, 2);
  };

  const getFullDesktopConfig = (token, path) => {
    return JSON.stringify({
      preferences: {
        coworkScheduledTasksEnabled: true,
        ccdScheduledTasksEnabled: true,
        sidebarMode: "chat",
        coworkWebSearchEnabled: true
      },
      mcpServers: {
        testforge: {
          command: "node",
          args: [path || bridgePath],
          env: {
            MCP_TOKEN: token || "tfmcp_your_token_here",
            TESTFORGE_URL: serverUrl
          }
        }
      }
    }, null, 2);
  };

  const downloadConfig = () => {
    if (!newToken?.token) return;
    const json = getFullDesktopConfig(newToken.token, newToken.bridgePath);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude_desktop_config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getInstallCommand = (token, path) => {
    const configJson = getFullDesktopConfig(token || "tfmcp_your_token_here", path);

    if (installOs === "windows") {
      return `# PowerShell — Run as your user (not admin)
# Detect Claude config path (Windows Store vs standard install)
$storePath = Get-ChildItem "$env:LOCALAPPDATA\\Packages\\Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($storePath) {
  $configDir = Join-Path $storePath.FullName "LocalCache\\Roaming\\Claude"
} else {
  $configDir = "$env:APPDATA\\Claude"
}
if (!(Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
@'
${configJson}
'@ | Out-File "$configDir\\claude_desktop_config.json" -Encoding utf8
Write-Host "Config saved to $configDir\\claude_desktop_config.json" -ForegroundColor Green
Write-Host "Restart Claude Desktop to activate." -ForegroundColor Yellow`;
    } else if (installOs === "mac") {
      return `# Terminal (macOS)
CONFIG_DIR="$HOME/Library/Application Support/Claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    } else {
      return `# Terminal (Linux)
CONFIG_DIR="$HOME/.config/claude"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/claude_desktop_config.json" << 'MCPEOF'
${configJson}
MCPEOF
echo "\\033[32m✓ Config saved to $CONFIG_DIR/claude_desktop_config.json\\033[0m"
echo "\\033[33mRestart Claude Desktop to activate.\\033[0m"`;
    }
  };

  const copyInstallCommand = () => {
    if (!newToken?.token) return;
    navigator.clipboard.writeText(getInstallCommand(newToken.token, newToken.bridgePath)).then(() => {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 3000);
    });
  };

  const configSnippets = {
    desktop: getDesktopConfigJson(newToken?.token, newToken?.bridgePath),
    code: `# Claude Code — run in terminal
claude mcp add testforge \\
  --transport sse \\
  --url ${serverUrl}/mcp/sse \\
  --header "Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}"`,
    web: `URL:     ${serverUrl}/mcp/sse
Header:  Authorization: Bearer ${newToken?.token || "tfmcp_your_token_here"}

In Claude.ai → Settings → Connected Apps → Add MCP Server
Paste the URL above and add the Authorization header.`,
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>Settings & MCP Integration</h2>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", fontFamily: mono }}>Connect Claude Desktop, Claude Code, or Claude Web to TestForge</p>
      </div>

      {/* How it works */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 10 }}>How MCP Integration Works</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          Instead of TestForge calling the Claude API (which requires an API key), <span style={{ color: COLORS.accent, fontWeight: 600 }}>Claude calls TestForge</span> through the Model Context Protocol (MCP). This means:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
          {[
            { icon: "◈", title: "No API Key Needed", desc: "TestForge doesn't need an Anthropic API key. Claude uses your existing subscription." },
            { icon: "◧", title: "Your Claude, Your Billing", desc: "Requests are billed to your own Claude account — Desktop, Code, or Web." },
            { icon: "◨", title: "Full Tool Access", desc: "Claude can read requirements, generate test cases, search KB, and save results directly." },
          ].map((item, i) => (
            <div key={i} style={{ padding: 14, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <span style={{ fontSize: 18, color: COLORS.accent, display: "block", marginBottom: 8 }}>{item.icon}</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Prerequisites */}
      <Card style={{ marginBottom: 20, border: `1px solid ${COLORS.amber}33` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.amber, marginBottom: 8 }}>Prerequisites</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          Claude Desktop requires a small local bridge script to connect to TestForge. Before creating a token:
        </div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: COLORS.surface, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 10 }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>1.</span> <span style={{ fontWeight: 600 }}>Node.js</span> must be installed — run <span style={{ fontFamily: mono, fontSize: 11, background: COLORS.bg, padding: "2px 6px", borderRadius: 3 }}>node --version</span> in your terminal to verify
          </div>
          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 6 }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>2.</span> <span style={{ fontWeight: 600 }}>Download the bridge script</span> and save it somewhere permanent on your machine:
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 18, marginBottom: 10 }}>
            <Button small onClick={() => {
              const a = document.createElement("a");
              a.href = "/mcp-bridge.mjs";
              a.download = "mcp-bridge.mjs";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}>Download mcp-bridge.mjs</Button>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>
              3 KB · zero dependencies · requires Node.js 18+
            </span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 18, marginBottom: 10, lineHeight: 1.6 }}>
            Save it anywhere on your machine that Node.js can access. You'll provide the full file path below when creating a token.
          </div>
          <div style={{ fontSize: 12, color: COLORS.text }}>
            <span style={{ color: COLORS.green, fontWeight: 600 }}>3.</span> <span style={{ fontWeight: 600 }}>TestForge server</span> must be running at <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent }}>{serverUrl}</span>
          </div>
        </div>
      </Card>

      {/* Token creation */}
      <Card glow style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>MCP Access Tokens</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>
          Tokens authenticate your Claude client with TestForge. Each token is tied to your account ({currentUser.name} / {currentUser.role}).
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
          <Input
            label="Token Name"
            value={tokenName}
            onChange={setTokenName}
            placeholder='e.g. "My Claude Desktop", "VS Code"'
            style={{ flex: 1 }}
          />
          <Button onClick={createToken} disabled={!tokenName.trim() || !bridgePath.trim()}>Create Token</Button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="Path to mcp-bridge.mjs on your machine"
            value={bridgePath}
            onChange={setBridgePath}
            mono
            placeholder={installOs === "windows"
              ? "e.g. C:\\Users\\you\\testforge-ai\\mcp-bridge.mjs"
              : "e.g. /Users/you/testforge-ai/mcp-bridge.mjs"}
            style={{ marginBottom: 4 }}
          />
          <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
            Enter the full path to where you saved <span style={{ fontFamily: mono }}>mcp-bridge.mjs</span> in step 2 above.
            {installOs === "windows" && " Use double backslashes for Windows paths (e.g. C:\\\\Users\\\\...)."}
            {" "}This path is embedded in the generated config file.
          </div>
        </div>
        <ErrorBanner msg={error} />

        {newToken && (
          <div style={{ marginBottom: 16, padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.green}44` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, marginBottom: 10 }}>Token Created — Copy It Now</div>
            <div style={{ padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber, marginBottom: 12 }}>
              This token will not be shown again. Copy it or install before dismissing.
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                flex: 1, fontFamily: mono, fontSize: 12, color: COLORS.accent,
                background: COLORS.bg, padding: "10px 14px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, wordBreak: "break-all",
                userSelect: "all",
              }}>
                {newToken.token}
              </div>
              <Button small onClick={copyToken}>{copied ? "Copied!" : "Copy Token"}</Button>
            </div>

            <div style={{ marginBottom: 16, padding: "8px 12px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, fontFamily: mono, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Bridge Path (from your input above)</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: COLORS.textBright, wordBreak: "break-all" }}>{newToken.bridgePath}</div>
            </div>

            <div style={{
              padding: 16, background: COLORS.bg, borderRadius: 8,
              border: `1px solid ${COLORS.accent}33`, marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>Quick Install — Claude Desktop</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
                Claude Desktop uses a local bridge script that connects to your TestForge server.
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", background: COLORS.surfaceRaised, borderRadius: 6,
                border: `1px solid ${COLORS.border}`, marginBottom: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>Option A: Download Config File</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    Downloads <span style={{ fontFamily: mono }}>claude_desktop_config.json</span> — place it in the correct config folder
                  </div>
                </div>
                <Button small onClick={downloadConfig}>Download Config</Button>
              </div>

              <div style={{
                padding: "12px 14px", background: COLORS.surfaceRaised, borderRadius: 6,
                border: `1px solid ${COLORS.border}`, marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textBright, marginBottom: 2 }}>Option B: Auto-Install via Terminal</div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                      Auto-detects Claude's config folder (Windows Store or standard install)
                    </div>
                  </div>
                  <Button small onClick={copyInstallCommand}>
                    {copiedCmd ? "Copied!" : "Copy Command"}
                  </Button>
                </div>

                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  {[
                    { key: "windows", label: "PowerShell (Windows)" },
                    { key: "mac", label: "Terminal (macOS)" },
                    { key: "linux", label: "Terminal (Linux)" },
                  ].map(os => (
                    <Button
                      key={os.key}
                      small
                      variant={installOs === os.key ? "primary" : "ghost"}
                      onClick={() => { setInstallOs(os.key); setCopiedCmd(false); }}
                      style={{ fontSize: 10, padding: "3px 10px" }}
                    >
                      {os.label}
                    </Button>
                  ))}
                </div>

                <pre style={{
                  fontFamily: mono, fontSize: 10, color: COLORS.text,
                  background: COLORS.bg, padding: 12, borderRadius: 6,
                  border: `1px solid ${COLORS.border}`, overflow: "auto",
                  whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
                  maxHeight: 220,
                }}>
                  {getInstallCommand(newToken.token, newToken.bridgePath)}
                </pre>
              </div>

              <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.7, marginBottom: 10 }}>
                <span style={{ fontFamily: mono, color: COLORS.accent, fontWeight: 600 }}>Config file locations:</span>
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <div><span style={{ fontFamily: mono, color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>Windows (Store):</span> <span style={{ fontFamily: mono }}>%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "windows" ? COLORS.textBright : COLORS.textMuted }}>Windows (Standard):</span> <span style={{ fontFamily: mono }}>%APPDATA%\Claude\</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "mac" ? COLORS.textBright : COLORS.textMuted }}>macOS:</span> <span style={{ fontFamily: mono }}>~/Library/Application Support/Claude/</span></div>
                  <div><span style={{ fontFamily: mono, color: installOs === "linux" ? COLORS.textBright : COLORS.textMuted }}>Linux:</span> <span style={{ fontFamily: mono }}>~/.config/claude/</span></div>
                </div>
              </div>

              <div style={{
                padding: "8px 12px", background: COLORS.amberDim, borderRadius: 6,
                border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber,
              }}>
                After installing, fully quit Claude Desktop (system tray → Quit) and reopen it. Check Settings → Developer to verify "testforge" appears.
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, fontFamily: mono, textTransform: "uppercase" }}>Manual Config Reference</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                { key: "desktop", label: "Claude Desktop" },
                { key: "code", label: "Claude Code (VS Code)" },
                { key: "web", label: "Claude Web" },
              ].map(tab => (
                <Button
                  key={tab.key}
                  small
                  variant={showConfig === tab.key ? "primary" : "secondary"}
                  onClick={() => setShowConfig(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <pre style={{
              fontFamily: mono, fontSize: 11, color: COLORS.text,
              background: COLORS.bg, padding: 14, borderRadius: 6,
              border: `1px solid ${COLORS.border}`, overflow: "auto",
              whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
            }}>
              {configSnippets[showConfig]}
            </pre>

            {showConfig === "desktop" && (
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                Add this under <span style={{ fontFamily: mono, color: COLORS.accent }}>"mcpServers"</span> in your existing <span style={{ fontFamily: mono }}>claude_desktop_config.json</span>. If the file has a <span style={{ fontFamily: mono }}>"preferences"</span> section, keep it and add <span style={{ fontFamily: mono }}>"mcpServers"</span> alongside it.
              </div>
            )}
            {showConfig === "code" && (
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                Run this command in your terminal. Claude Code connects directly via SSE — no bridge script needed.
              </div>
            )}

            <Button small variant="secondary" onClick={() => setNewToken(null)} style={{ marginTop: 12 }}>Dismiss</Button>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>No tokens created yet. Create one above to connect Claude.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Token</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Created</th>
                <th style={{ textAlign: "left", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Last Used</th>
                <th style={{ textAlign: "right", padding: "8px 10px", background: COLORS.surface, color: COLORS.textMuted, fontFamily: mono, fontSize: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "10px", color: COLORS.textBright, fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 11, color: COLORS.textMuted }}>{t.token_preview}</td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: mono, fontSize: 10, color: COLORS.textMuted }}>
                    {t.last_used ? new Date(t.last_used).toLocaleString() : "Never"}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <Button small variant="danger" onClick={() => deleteToken(t.id)}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Available tools reference */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Available MCP Tools</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>Once connected, Claude can use these tools. Just ask in natural language.</div>
        {[
          { tool: "list_requirements", desc: "List and filter all requirements", example: '"Show me all approved requirements in the Test Case Generation module"' },
          { tool: "get_requirement", desc: "Get full details, KB context, and linked TCs for a requirement", example: '"Get me the details for RS-001 including any related knowledge base entries"' },
          { tool: "save_test_cases", desc: "Generate and save test case drafts to the database", example: '"Generate comprehensive test cases for RS-005 and save them"' },
          { tool: "review_test_case", desc: "Mark a test case as Reviewed or Rejected", example: '"Mark TC-RS-001-001 through TC-RS-001-004 as reviewed"' },
          { tool: "list_test_cases", desc: "List test cases with filters by requirement or status", example: '"Show me all draft test cases for RS-001"' },
          { tool: "search_knowledge_base", desc: "Search KB entries by keyword, requirement tag, or type", example: '"Search the knowledge base for anything related to PDF parsing"' },
          { tool: "create_kb_entry", desc: "Add a new knowledge base entry", example: '"Create a KB entry about the session timeout edge case we just found"' },
          { tool: "create_requirement", desc: "Create a new requirement", example: '"Create a new requirement RS-008 for PDF accessibility compliance"' },
          { tool: "get_coverage_summary", desc: "Get overall test coverage statistics", example: '"What is our current requirement coverage percentage?"' },
        ].map((t, i) => (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < 8 ? `1px solid ${COLORS.border}` : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{
              fontFamily: mono, fontSize: 10, fontWeight: 700, color: COLORS.green,
              background: COLORS.greenDim, padding: "3px 8px", borderRadius: 4,
              whiteSpace: "nowrap", marginTop: 2,
            }}>
              {t.tool}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: COLORS.text }}>{t.desc}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 3 }}>
                Try: {t.example}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* In-App User Guide */}
      <Card style={{ marginTop: 20 }}>
        <div
          onClick={() => setShowGuide(prev => !prev)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textBright }}>MCP User Guide</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Step-by-step setup, example prompts, tips, and troubleshooting</div>
          </div>
          <span style={{
            fontSize: 18, color: COLORS.accent, transition: "transform 0.2s",
            transform: showGuide ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
        </div>

        {showGuide && (
          <div style={{ marginTop: 20, fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, marginBottom: 8 }}>Getting Started</div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 1: Download & Place the Bridge Script</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Click <span style={{ fontWeight: 600 }}>Download mcp-bridge.mjs</span> in the Prerequisites section above.</div>
                <div>Save the file to a permanent location on your machine (e.g. your project folder).</div>
                <div>Note the <span style={{ fontWeight: 600 }}>full file path</span> — you'll need it in the next step.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 2: Create an MCP Token</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Enter a name for the token (e.g. "My Claude Desktop").</div>
                <div>Paste the full path to your <span style={{ fontFamily: mono, fontSize: 11 }}>mcp-bridge.mjs</span> file.</div>
                <div>Click <span style={{ fontWeight: 600 }}>Create Token</span>.</div>
                <div>Copy the <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent }}>tfmcp_...</span> token immediately — it won't be shown again.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 3: Install the Config</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div style={{ marginBottom: 6 }}><Badge color="green">Easiest</Badge> <span style={{ fontWeight: 600 }}>Download Config</span> — click the button, move the file to your Claude config folder.</div>
                <div style={{ marginBottom: 6 }}><Badge color="accent">Terminal</Badge> <span style={{ fontWeight: 600 }}>Auto-Install</span> — copy the PowerShell/bash command, paste and run. Auto-detects Windows Store vs standard install.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: COLORS.textBright, marginBottom: 4 }}>Step 4: Restart & Verify</div>
              <div style={{ paddingLeft: 14, borderLeft: `2px solid ${COLORS.border}` }}>
                <div>Fully quit Claude Desktop (system tray → <span style={{ fontWeight: 600 }}>Quit Claude</span>, not just close the window).</div>
                <div>Reopen and check <span style={{ fontWeight: 600 }}>Settings → Developer</span> — "testforge" should appear in the MCP servers list.</div>
                <div>Ask Claude: <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>"What tools do you have from TestForge?"</span></div>
              </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, margin: "24px 0 12px" }}>Example Workflows</div>

            {[
              { title: "Generate Test Cases", prompt: "Look at requirement RS-001 in TestForge, including any relevant knowledge base entries, and generate comprehensive test cases. Save them when done.", detail: "Claude reads the requirement and KB context, generates test cases, and saves them as drafts." },
              { title: "Check Coverage Gaps", prompt: "Show me all requirements in TestForge that don't have test cases yet.", detail: "Returns untested requirements so you know where to focus." },
              { title: "Review Test Cases", prompt: "Mark TC-RS-001-001 and TC-RS-001-002 as reviewed.", detail: "Updates the status from Draft to Reviewed." },
              { title: "Batch Generation", prompt: "For every approved requirement without test cases, generate standard-depth test cases and save them. Then summarize what was created.", detail: "Claude chains multiple tools together automatically." },
            ].map((ex, i) => (
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
                {[
                  { problem: '"Could not load app settings" on launch', solution: 'Your config JSON is malformed. Open the file and validate it at jsonlint.com' },
                  { problem: 'Claude says "no tools from TestForge"', solution: "Check Settings → Developer. If testforge isn't listed, the config file is in the wrong location" },
                  { problem: "testforge shows in Developer but no tools", solution: "Check MCP logs in Claude's logs folder. Common cause: token expired (create a new one in TestForge)" },
                  { problem: '"Invalid or missing MCP token"', solution: "Token was lost when Docker rebuilt. Create a new token in Settings & MCP and update your config" },
                  { problem: '"stream is not readable" in logs', solution: "The Express JSON middleware is intercepting MCP requests. Check that index.js skips /mcp/messages" },
                  { problem: "tools/list times out after 30s", solution: "Update mcp-bridge.mjs to v2 — the SSE parser needs multi-line data support" },
                  { problem: "Config file not found by Claude", solution: "Windows Store installs use a different path. Use Settings → Developer → Edit Config to find the real location" },
                ].map((row, i) => (
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
};
