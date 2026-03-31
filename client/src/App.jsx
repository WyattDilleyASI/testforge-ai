import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import SysMLTraceability from "./SysMLTraceability";
import { THEMES, ThemeContext, useTheme, font, mono } from "./theme";
import { Badge, Button, Card } from "./components/shared";
import { LoginScreen, PasswordChangeScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { RequirementsView } from "./components/RequirementsView";
import { TestCaseView } from "./components/TestCaseView";
import { TraceabilityView } from "./components/TraceabilityView";
import { KbView } from "./components/KbView";
import { DeferredView } from "./components/DeferredView";
import { SettingsWrapper } from "./components/SettingsWrapper";
import { EasterEggToast, EasterEggResetButton, StarfieldCanvas, MatrixRainCanvas, AuroraCanvas, VaporwaveCanvas, FirefliesCanvas, FishTankCanvas } from "./components/EasterEggs";

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPw, setPendingPw] = useState(null);
  const [themeName, setThemeName] = useState(() => localStorage.getItem("tf-theme") || "midnight");

  // Parse page and optional family ID from the URL hash.
  // Supported formats:
  //   #traceability/family/REQ-ID  → traceability page, auto-open family view for REQ-ID
  //   #traceability                → traceability page, full view
  //   #dashboard (etc.)            → named page, full view
  const parseHash = () => {
    const hash = window.location.hash.replace(/^#/, "");
    const parts = hash.split("/");
    const pg = parts[0] || "dashboard";
    const familyId = parts[0] === "traceability" && parts[1] === "family" && parts[2]
      ? decodeURIComponent(parts[2])
      : null;
    return { pg, familyId };
  };

  const [page, setPage] = useState(() => parseHash().pg);
  const [initialFamilyId, setInitialFamilyId] = useState(() => parseHash().familyId);

  // Wrap navigation so that clicking the sidebar also updates the URL hash.
  const navigate = useCallback((newPage) => {
    window.location.hash = newPage;
    setPage(newPage);
    setInitialFamilyId(null);
  }, []);

  // Keep React in sync if the user presses the browser Back/Forward buttons.
  useEffect(() => {
    const onHashChange = () => {
      const { pg, familyId } = parseHash();
      setPage(pg);
      setInitialFamilyId(familyId);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [requirements, setRequirements] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [kbEntries, setKbEntries] = useState([]);
  const [tokenUsage, setTokenUsage] = useState(null);

  const activeTheme = THEMES[themeName] || THEMES.midnight;

  const [easterEggToast, setEasterEggToast] = useState(null);
  const [preEasterEggTheme, setPreEasterEggTheme] = useState(null);

  const handleThemeChange = (key) => {
    setThemeName(key);
    localStorage.setItem("tf-theme", key);
  };

  // Easter egg keyboard listener
useEffect(() => {
  let buffer = "";
  const KONAMI = "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba";
  const TRIGGERS = {
    afterdark: { theme: "afterdark", message: "🌌 After Dark activated — enjoy the stars" },
    matrix:    { theme: "matrix",    message: "💊 You took the red pill..." },
  };

  const handleKey = (e) => {
    // Escape key resets to previous theme
    if (e.key === "Escape" && preEasterEggTheme) {
      handleThemeChange(preEasterEggTheme);
      setPreEasterEggTheme(null);
      setEasterEggToast("↩️ Theme restored");
      return;
    }

    buffer += e.key;

    if (buffer.endsWith(KONAMI)) {
      if (!activeTheme._hidden) setPreEasterEggTheme(themeName);
      handleThemeChange("konami");
      setEasterEggToast("🔓 CLASSIFIED — Konami Code accepted");
      buffer = "";
      return;
    }
    for (const [trigger, config] of Object.entries(TRIGGERS)) {
      if (buffer.toLowerCase().endsWith(trigger)) {
        if (!activeTheme._hidden) setPreEasterEggTheme(themeName);
        handleThemeChange(config.theme);
        setEasterEggToast(config.message);
        buffer = "";
        return;
      }
    }
    if (buffer.length > 100) buffer = buffer.slice(-50);
  };

  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [preEasterEggTheme, themeName, activeTheme._hidden]);

  const loadData = useCallback(async () => {
    try { setRequirements(await api.getRequirements()); }
    catch (e) {
      console.error("Failed to load requirements:", e.message);
      if (e.message?.includes("Not authenticated")) { setCurrentUser(null); setAuthState("login"); return; }
    }
    try { setTestCases(await api.getTestCases()); }
    catch (e) { console.error("Failed to load test cases:", e.message); }
    try { setKbEntries(await api.getKbEntries()); }
    catch (e) { console.error("Failed to load KB entries:", e.message); }
    try { setTokenUsage(await api.getTokenUsage()); }
    catch (e) { console.error("Failed to load token usage:", e.message); }
  }, []);

  useEffect(() => {
    api.me().then(data => { setCurrentUser(data.user); setAuthState("authenticated"); loadData(); }).catch(() => setAuthState("login"));
  }, [loadData]);

  const handleLogin = (data) => {
    if (data.mustChangePassword) {
      setPendingPw({ userId: data.user.id, name: data.user.name, isOtp: data.isOtp });
      setAuthState("changePassword");
    } else {
      setCurrentUser(data.user); setAuthState("authenticated"); loadData();
    }
  };

  const handlePwComplete = (user) => {
    setPendingPw(null); setCurrentUser(user); setAuthState("authenticated"); loadData();
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch (e) {}
    setCurrentUser(null); setAuthState("login");
    window.location.hash = "dashboard";
    setPage("dashboard");
    setInitialFamilyId(null);
  };

  if (authState === "loading") return <ThemeContext.Provider value={activeTheme}><div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: activeTheme.bg, color: activeTheme.accent, fontFamily: mono }}>Loading...</div></ThemeContext.Provider>;
  if (authState === "login") return <ThemeContext.Provider value={activeTheme}><LoginScreen onLogin={handleLogin} /></ThemeContext.Provider>;
  if (authState === "changePassword" && pendingPw) return <ThemeContext.Provider value={activeTheme}><PasswordChangeScreen userId={pendingPw.userId} userName={pendingPw.name} isOtp={pendingPw.isOtp} onComplete={handlePwComplete} /></ThemeContext.Provider>;

  const isCycling = !!activeTheme._cycleSpeed;
  const isAero = activeTheme._aero || false;
  const isXP = activeTheme._xpStyle || false;
  const isLavaLamp = activeTheme._lavaLamp || false;
  const isSynthwave = activeTheme._synthwave || false;

  const globalStyle = `
    input:focus, textarea:focus, select:focus {
      border-color: ${activeTheme.accent} !important;
      box-shadow: 0 0 0 2px ${activeTheme.accentDim};
    }
    button:hover:not(:disabled) { filter: brightness(1.15); }

    ${isCycling ? `
    @keyframes chromawave {
      0%   { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    @keyframes hyperdriveBg {
      0%   { background-color: #FF0044; }
      16%  { background-color: #FF8800; }
      33%  { background-color: #FFFF00; }
      50%  { background-color: #00FF66; }
      66%  { background-color: #0088FF; }
      83%  { background-color: #AA00FF; }
      100% { background-color: #FF0044; }
    }
    ` : ""}

    ${isAero ? `
    @keyframes aeroShimmer {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}

    ${isXP ? `
    @keyframes xpGradient {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}
        ${isLavaLamp ? `
    @keyframes lavaLamp {
      0%   { background-position: 0% 50%; }
      25%  { background-position: 50% 100%; }
      50%  { background-position: 100% 50%; }
      75%  { background-position: 50% 0%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}

    ${isSynthwave ? `
    @keyframes synthwaveShift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    ` : ""}
  `;

  return <ThemeContext.Provider value={activeTheme}>
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: activeTheme.bg,
      fontFamily: font,
      color: activeTheme.text,
      ...(isCycling ? {
        animation: `chromawave ${activeTheme._cycleSpeed} linear infinite${activeTheme._hyperdriveBg ? `, hyperdriveBg ${activeTheme._cycleSpeed} linear infinite` : ""}`,
      } : {}),
      ...(isAero ? {
        background: "linear-gradient(135deg, #E8F4FD 0%, #D5F0E8 35%, #EAF0FA 70%, #F0F8FF 100%)",
        backgroundSize: "200% 200%",
        animation: "aeroShimmer 12s ease-in-out infinite",
      } : {}),
      ...(isXP ? {
        background: "linear-gradient(180deg, #0055E5 0%, #2E8AE6 8%, #ECE9D8 8%, #ECE9D8 100%)",
      } : {}),
      ...(activeTheme._upsideDown ? {
        transform: "rotate(180deg)",
      } : {}),
      ...(isLavaLamp ? {
        background: "linear-gradient(-45deg, #1A0A0A, #2A0A1A, #1A1A0A, #0A1A1A, #2A0A0A)",
        backgroundSize: "400% 400%",
        animation: "lavaLamp 20s ease infinite",
      } : {}),
      ...(isSynthwave ? {
        background: "linear-gradient(135deg, #0E0620, #1A0640, #2D0A5A, #1A0640, #0E0620)",
        backgroundSize: "300% 300%",
        animation: "synthwaveShift 10s ease infinite",
      } : {}),
    }}>
      <style>{globalStyle}</style>
      {activeTheme._starfield && <StarfieldCanvas />}
      {activeTheme._matrixRain && <MatrixRainCanvas />}
      {activeTheme._aurora && <AuroraCanvas />}
      {activeTheme._vaporwave && <VaporwaveCanvas />}
      {activeTheme._fireflies && <FirefliesCanvas />}
      {activeTheme._fishTank && <FishTankCanvas />}
      {easterEggToast && <EasterEggToast message={easterEggToast} onDone={() => setEasterEggToast(null)} />}
      {activeTheme._hidden && <EasterEggResetButton onReset={() => {
        handleThemeChange(preEasterEggTheme || "midnight");
        setPreEasterEggTheme(null);
        setEasterEggToast("↩️ Theme restored");
      }} />}
      <Sidebar active={page} onNavigate={navigate} currentUser={currentUser} onLogout={handleLogout} currentTheme={themeName} onThemeChange={handleThemeChange} />
      <main style={{ flex: 1, padding: page === "traceability" ? 0 : "28px 36px", maxWidth: page === "traceability" ? "none" : 1100, overflowY: page === "traceability" ? "hidden" : "auto", display: page === "traceability" ? "flex" : "block", flexDirection: "column" }}>
        {page === "dashboard" && <DashboardView requirements={requirements} testCases={testCases} kbEntries={kbEntries} tokenUsage={tokenUsage} />}
        {page === "requirements" && <RequirementsView requirements={requirements} refresh={loadData} currentUser={currentUser} />}
        {page === "testcases" && <TestCaseView requirements={requirements} testCases={testCases} kbEntries={kbEntries} refresh={loadData} />}
        {page === "traceability" && <SysMLTraceability requirements={requirements} testCases={testCases} useTheme={useTheme} Badge={Badge} Card={Card} Button={Button} mono={mono} font={font} refresh={loadData} initialFamilyId={initialFamilyId} />}
        {page === "kb" && <KbView kbEntries={kbEntries} requirements={requirements} refresh={loadData} />}
        {page === "deferred" && <DeferredView />}
        {page === "settings" && <SettingsWrapper currentUser={currentUser} currentTheme={themeName} onThemeChange={handleThemeChange} requirements={requirements} testCases={testCases} kbEntries={kbEntries} />}
      </main>
    </div>
  </ThemeContext.Provider>;
}
