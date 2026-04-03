import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import SysMLTraceability from "./SysMLTraceability";
import { THEMES, ThemeContext, useTheme, font, mono } from "./theme";
import { Badge, Button, Card } from "./components/shared";
import { LoginScreen, PasswordChangeScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { RequirementsView } from "./components/RequirementsView";
import { TestCasesWrapper } from "./components/TestCasesWrapper";
import { KbView } from "./components/KbView";
import { DeferredView } from "./components/DeferredView";
import { SettingsWrapper } from "./components/SettingsWrapper";
import { AnalyticsView } from "./components/AnalyticsView";
import { EasterEggToast, EasterEggResetButton, StarfieldCanvas, MatrixRainCanvas, AuroraCanvas, VaporwaveCanvas, FirefliesCanvas, FishTankCanvas, HotDogCanvas, RainstormCanvas,
  StarfieldParallaxCanvas,
  CampfireCanvas,
  SnowfallCanvas,
  DeepSeaCanvas,
  CRTCanvas,
  AudioVisualizerCanvas,
  AmbientCanvas,
  CloudyCanvas,
  ThunderstormCanvas,
  FogCanvas,
  WeatherInfoCard,
 } from "./components/EasterEggs";

// WMO weather code → theme key (palette + canvas flag)
const WMO_TO_THEME = {
  0: "starfieldTheme", 1: "starfieldTheme",
  2: "cloudy",         3: "cloudy",
  45: "fog",           48: "fog",
  51: "rainstorm",     53: "rainstorm",     55: "rainstorm",
  61: "rainstorm",     63: "rainstorm",     65: "rainstorm",
  71: "snowfall",      73: "snowfall",      75: "snowfall",   77: "snowfall",
  80: "rainstorm",     81: "rainstorm",     82: "rainstorm",
  85: "snowfall",      86: "snowfall",
  95: "thunderstorm",  96: "thunderstorm",  99: "thunderstorm",
};

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

  const [weatherData, setWeatherData] = useState(null);

  useEffect(() => {
    if (themeName !== "weather") { setWeatherData(null); return; }
    let cancelled = false;
    const fetchWeather = async (lat, lon) => {
      try {
        const [wRes, gRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&timezone=auto&temperature_unit=fahrenheit`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "User-Agent": "TestForgeAI/1.0" } }),
        ]);
        const wData = await wRes.json();
        const gData = await gRes.json();
        if (!cancelled) {
          const addr = gData.address || {};
          setWeatherData({
            code: wData.current?.weather_code ?? 0,
            temp: wData.current?.temperature_2m,
            city: addr.city || addr.town || addr.village || addr.county || "",
            state: addr.state_code || addr.state || "",
          });
        }
      } catch {
        if (!cancelled) setWeatherData({ code: 0, temp: null, city: "", state: "" });
      }
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => { if (!cancelled) setWeatherData({ code: 0, temp: null, city: "", state: "" }); },
        { timeout: 8000 }
      );
    } else {
      setWeatherData({ code: 0, temp: null, city: "", state: "" });
    }
    return () => { cancelled = true; };
  }, [themeName]);

  const resolvedThemeName = themeName === "weather" && weatherData
    ? (WMO_TO_THEME[weatherData.code] ?? "starfieldTheme")
    : themeName;
  const activeTheme = THEMES[resolvedThemeName] || THEMES[themeName] || THEMES.midnight;

  const [easterEggToast, setEasterEggToast] = useState(null);
  const [preEasterEggTheme, setPreEasterEggTheme] = useState(null);
  const [hotDogOverlay, setHotDogOverlay] = useState(false);

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
    // Escape key resets to previous theme and clears hot dog overlay
    if (e.key === "Escape") {
      if (preEasterEggTheme) {
        handleThemeChange(preEasterEggTheme);
        setPreEasterEggTheme(null);
        setEasterEggToast("↩️ Theme restored");
      }
      setHotDogOverlay(false);
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
    if (buffer.toLowerCase().endsWith("hotdog")) {
      setHotDogOverlay(prev => {
        const next = !prev;
        setEasterEggToast(next ? "🌭 Hot dogs incoming!" : "🌭 Hot dogs cleared");
        return next;
      });
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
}, [preEasterEggTheme, themeName, activeTheme._hidden, hotDogOverlay]);

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
  const isBlueprint = activeTheme._blueprint || false;
  const isNewspaper = activeTheme._newspaper || false;

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

    ${isBlueprint ? `
    @keyframes blueprintPulse {
      0%   { opacity: 0.08; }
      50%  { opacity: 0.12; }
      100% { opacity: 0.08; }
    }
    ` : ""}

    ${isNewspaper ? `
    @keyframes paperAge {
      0%   { background-position: 0% 0%; }
      100% { background-position: 100% 100%; }
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
      ...(isBlueprint ? {
        backgroundImage: `
          linear-gradient(rgba(42,96,144,0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(42,96,144,0.12) 1px, transparent 1px),
          linear-gradient(rgba(42,96,144,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(42,96,144,0.06) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px, 60px 60px, 12px 12px, 12px 12px",
        backgroundColor: "#0A2A4A",
      } : {}),

      // Newspaper: subtle paper texture via noise gradient
      ...(isNewspaper ? {
        backgroundImage: `
          radial-gradient(ellipse at 20% 50%, rgba(200,180,140,0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(180,160,120,0.06) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 80%, rgba(190,170,130,0.05) 0%, transparent 50%)
        `,
        backgroundColor: "#F0E8D8",
      } : {}),
    }}>
      <style>{globalStyle}</style>
      {activeTheme._starfield && <StarfieldCanvas />}
      {activeTheme._matrixRain && <MatrixRainCanvas />}
      {activeTheme._aurora && <AuroraCanvas />}
      {activeTheme._vaporwave && <VaporwaveCanvas />}
      {activeTheme._fireflies && <FirefliesCanvas />}
      {activeTheme._fishTank && <FishTankCanvas />}
      {(activeTheme._hotDogs || hotDogOverlay) && <HotDogCanvas />}
      {activeTheme._rainstorm && <RainstormCanvas />}
      {activeTheme._starfieldTheme && <StarfieldParallaxCanvas />}
      {activeTheme._campfire && <CampfireCanvas />}
      {activeTheme._snowfall && <SnowfallCanvas />}
      {activeTheme._deepSea && <DeepSeaCanvas />}
      {activeTheme._crt && <CRTCanvas />}
      {activeTheme._audioVisualizer && <AudioVisualizerCanvas />}
      {activeTheme._cloudy && <CloudyCanvas />}
      {activeTheme._thunderstorm && <ThunderstormCanvas />}
      {activeTheme._fog && <FogCanvas />}
      {!(activeTheme._starfield || activeTheme._matrixRain || activeTheme._aurora ||
         activeTheme._vaporwave || activeTheme._fireflies || activeTheme._fishTank ||
         activeTheme._hotDogs || hotDogOverlay || activeTheme._rainstorm ||
         activeTheme._starfieldTheme || activeTheme._campfire || activeTheme._snowfall ||
         activeTheme._deepSea || activeTheme._crt || activeTheme._audioVisualizer ||
         activeTheme._cloudy || activeTheme._thunderstorm || activeTheme._fog) && <AmbientCanvas />}
      {themeName === "weather" && <WeatherInfoCard weatherData={weatherData} />}
      {easterEggToast && <EasterEggToast message={easterEggToast} onDone={() => setEasterEggToast(null)} />}
      {activeTheme._hidden && <EasterEggResetButton onReset={() => {
        handleThemeChange(preEasterEggTheme || "midnight");
        setPreEasterEggTheme(null);
        setEasterEggToast("↩️ Theme restored");
      }} />}
      <Sidebar active={page} onNavigate={navigate} currentUser={currentUser} onLogout={handleLogout} currentTheme={themeName} onThemeChange={handleThemeChange} />
      <main style={{ flex: 1, padding: page === "traceability" ? 0 : "28px 36px", overflowY: page === "traceability" ? "hidden" : "auto", display: page === "traceability" ? "flex" : "block", flexDirection: "column" }}>
        {page === "dashboard" && <DashboardView requirements={requirements} testCases={testCases} kbEntries={kbEntries} tokenUsage={tokenUsage} />}
        {page === "requirements" && <RequirementsView requirements={requirements} refresh={loadData} currentUser={currentUser} />}
        {page === "testcases" && <TestCasesWrapper requirements={requirements} testCases={testCases} kbEntries={kbEntries} refresh={loadData} />}
        {page === "traceability" && <SysMLTraceability requirements={requirements} testCases={testCases} useTheme={useTheme} Badge={Badge} Card={Card} Button={Button} mono={mono} font={font} refresh={loadData} initialFamilyId={initialFamilyId} />}
        {page === "kb" && <KbView kbEntries={kbEntries} requirements={requirements} refresh={loadData} />}
        {page === "analytics" && <AnalyticsView currentUser={currentUser} />}
        {page === "deferred" && <DeferredView />}
        {page === "settings" && <SettingsWrapper currentUser={currentUser} currentTheme={themeName} onThemeChange={handleThemeChange} requirements={requirements} testCases={testCases} kbEntries={kbEntries} />}
      </main>
    </div>
  </ThemeContext.Provider>;
}
