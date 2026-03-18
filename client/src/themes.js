// ═══════════════════════════════════════════════════════════════════════════
// themes.js — All TestForge theme definitions, categories, and helpers.
//
// Extracted from App.jsx to keep theme data self-contained and maintainable.
// Usage in App.jsx:
//   import { THEMES, THEME_CATEGORIES, ThemeSwatch } from "./themes";
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext } from "react";

// ─── THEME CONTEXT ──────────────────────────────────────────────────────────

export const ThemeContext = createContext(null); // default set after THEMES defined
export const useTheme = () => useContext(ThemeContext);

// ─── THEME DEFINITIONS ──────────────────────────────────────────────────────

export const THEMES = {

  // ── MIDNIGHT ─────────────────────────────────────────────────────────────
  midnight: {
    name: "Midnight", emoji: "🌙",
    bg: "#0B0E14", surface: "#121821", surfaceRaised: "#1A2233",
    border: "#243044", text: "#C8D6E5", textMuted: "#7A8BA3",
    textBright: "#EFF4F8", accent: "#22D3EE", accentDim: "rgba(34,211,238,0.12)",
    accentGlow: "rgba(34,211,238,0.25)", green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
    red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FBBF24",
    amberDim: "rgba(251,191,36,0.12)", purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.12)",
  },

  // ── CHERRY BLOSSOM ───────────────────────────────────────────────────────
  cherry: {
    name: "Cherry Blossom", emoji: "🌸",
    bg: "#FFF5F7", surface: "#FFF0F3", surfaceRaised: "#FFFFFF",
    border: "#F5C6D0", text: "#5C3D4E", textMuted: "#9E7389",
    textBright: "#2D1B25", accent: "#E8457C", accentDim: "rgba(232,69,124,0.10)",
    accentGlow: "rgba(232,69,124,0.20)", green: "#38A169", greenDim: "rgba(56,161,105,0.10)",
    red: "#E53E3E", redDim: "rgba(229,62,62,0.10)", amber: "#D69E2E",
    amberDim: "rgba(214,158,46,0.10)", purple: "#9F7AEA", purpleDim: "rgba(159,122,234,0.10)",
  },

  // ── WACKY ────────────────────────────────────────────────────────────────
  wacky: {
    name: "Wacky", emoji: "🤪",
    bg: "#1A0033", surface: "#2D004D", surfaceRaised: "#3D0066",
    border: "#FF6600", text: "#00FF99", textMuted: "#FFD700",
    textBright: "#FF00FF", accent: "#00FFFF", accentDim: "rgba(0,255,255,0.15)",
    accentGlow: "rgba(0,255,255,0.35)", green: "#39FF14", greenDim: "rgba(57,255,20,0.15)",
    red: "#FF1493", redDim: "rgba(255,20,147,0.15)", amber: "#FFD700",
    amberDim: "rgba(255,215,0,0.15)", purple: "#BF00FF", purpleDim: "rgba(191,0,255,0.15)",
  },

  // ── EYE BLEED ────────────────────────────────────────────────────────────
  eyebleed: {
    name: "Eye Bleed", emoji: "💀",
    bg: "#FF0000", surface: "#00FF00", surfaceRaised: "#FFFF00",
    border: "#FF00FF", text: "#0000FF", textMuted: "#FF6600",
    textBright: "#FFFFFF", accent: "#00FFFF", accentDim: "rgba(0,255,255,0.30)",
    accentGlow: "rgba(255,0,255,0.50)", green: "#FF1493", greenDim: "rgba(255,20,147,0.25)",
    red: "#00FF00", redDim: "rgba(0,255,0,0.25)", amber: "#FF00FF",
    amberDim: "rgba(255,0,255,0.25)", purple: "#FFFF00", purpleDim: "rgba(255,255,0,0.25)",
  },

  // ── FOREST ───────────────────────────────────────────────────────────────
  forest: {
    name: "Forest", emoji: "🌲",
    bg: "#0A1F0A", surface: "#122712", surfaceRaised: "#1A331A",
    border: "#2D5A2D", text: "#B8D4B8", textMuted: "#6B946B",
    textBright: "#E8F5E8", accent: "#4ADE80", accentDim: "rgba(74,222,128,0.12)",
    accentGlow: "rgba(74,222,128,0.25)", green: "#22C55E", greenDim: "rgba(34,197,94,0.12)",
    red: "#FB7185", redDim: "rgba(251,113,133,0.12)", amber: "#FACC15",
    amberDim: "rgba(250,204,21,0.12)", purple: "#C084FC", purpleDim: "rgba(192,132,252,0.12)",
  },

  // ── OCEAN ────────────────────────────────────────────────────────────────
  ocean: {
    name: "Ocean", emoji: "🌊",
    bg: "#0A192F", surface: "#0D2137", surfaceRaised: "#112B45",
    border: "#1E4976", text: "#A8C8E8", textMuted: "#5E8AB4",
    textBright: "#E0F0FF", accent: "#38BDF8", accentDim: "rgba(56,189,248,0.12)",
    accentGlow: "rgba(56,189,248,0.25)", green: "#2DD4BF", greenDim: "rgba(45,212,191,0.12)",
    red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FDE68A",
    amberDim: "rgba(253,230,138,0.12)", purple: "#818CF8", purpleDim: "rgba(129,140,248,0.12)",
  },

  // ── SUNSET ───────────────────────────────────────────────────────────────
  sunset: {
    name: "Sunset", emoji: "🌅",
    bg: "#1A0A0A", surface: "#261210", surfaceRaised: "#331A16",
    border: "#5C3028", text: "#E8C8B8", textMuted: "#B47A64",
    textBright: "#FFF0E8", accent: "#FB923C", accentDim: "rgba(251,146,60,0.12)",
    accentGlow: "rgba(251,146,60,0.25)", green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
    red: "#EF4444", redDim: "rgba(239,68,68,0.12)", amber: "#FBBF24",
    amberDim: "rgba(251,191,36,0.12)", purple: "#E879F9", purpleDim: "rgba(232,121,249,0.12)",
  },

  // ── LAVENDER ─────────────────────────────────────────────────────────────
  lavender: {
    name: "Lavender", emoji: "💜",
    bg: "#F5F0FF", surface: "#EDE5FF", surfaceRaised: "#FFFFFF",
    border: "#D4C4F0", text: "#4A3668", textMuted: "#8B72AA",
    textBright: "#1E0A3C", accent: "#8B5CF6", accentDim: "rgba(139,92,246,0.10)",
    accentGlow: "rgba(139,92,246,0.20)", green: "#10B981", greenDim: "rgba(16,185,129,0.10)",
    red: "#EF4444", redDim: "rgba(239,68,68,0.10)", amber: "#F59E0B",
    amberDim: "rgba(245,158,11,0.10)", purple: "#7C3AED", purpleDim: "rgba(124,58,237,0.10)",
  },

  // ── RETRO TERMINAL ───────────────────────────────────────────────────────
  retro: {
    name: "Retro Terminal", emoji: "📟",
    bg: "#0C0C0C", surface: "#1A1A1A", surfaceRaised: "#222222",
    border: "#333333", text: "#33FF33", textMuted: "#1A991A",
    textBright: "#66FF66", accent: "#33FF33", accentDim: "rgba(51,255,51,0.10)",
    accentGlow: "rgba(51,255,51,0.25)", green: "#33FF33", greenDim: "rgba(51,255,51,0.12)",
    red: "#FF3333", redDim: "rgba(255,51,51,0.12)", amber: "#FFCC00",
    amberDim: "rgba(255,204,0,0.12)", purple: "#CC66FF", purpleDim: "rgba(204,102,255,0.12)",
  },

  // ── NORD ─────────────────────────────────────────────────────────────────
  nord: {
    name: "Nord", emoji: "❄️",
    bg: "#2E3440", surface: "#3B4252", surfaceRaised: "#434C5E",
    border: "#4C566A", text: "#D8DEE9", textMuted: "#8FBCBB",
    textBright: "#ECEFF4", accent: "#88C0D0", accentDim: "rgba(136,192,208,0.12)",
    accentGlow: "rgba(136,192,208,0.25)", green: "#A3BE8C", greenDim: "rgba(163,190,140,0.12)",
    red: "#BF616A", redDim: "rgba(191,97,106,0.12)", amber: "#EBCB8B",
    amberDim: "rgba(235,203,139,0.12)", purple: "#B48EAD", purpleDim: "rgba(180,142,173,0.12)",
  },

  // ── LIGHT ────────────────────────────────────────────────────────────────
  // Clean, professional light theme with soft grays and a blue accent.
  light: {
    name: "Light", emoji: "☀️",
    bg: "#F7F8FA", surface: "#FFFFFF", surfaceRaised: "#FFFFFF",
    border: "#DDE1E8", text: "#3D4752", textMuted: "#8893A0",
    textBright: "#111820", accent: "#2563EB", accentDim: "rgba(37,99,235,0.08)",
    accentGlow: "rgba(37,99,235,0.18)", green: "#16A34A", greenDim: "rgba(22,163,74,0.08)",
    red: "#DC2626", redDim: "rgba(220,38,38,0.08)", amber: "#D97706",
    amberDim: "rgba(217,119,6,0.08)", purple: "#7C3AED", purpleDim: "rgba(124,58,237,0.08)",
    hover: "rgba(37,99,235,0.06)",
  },

  // ── FRUTIGER AERO ────────────────────────────────────────────────────────
  // Glossy, translucent, nature-infused UI aesthetic of ~2006-2013.
  frutigerAero: {
    name: "Frutiger Aero", emoji: "🫧",
    bg: "#E8F4FD", surface: "#F0F8FF", surfaceRaised: "#FFFFFF",
    border: "#B8D8EC", text: "#2E5062", textMuted: "#6A9BB5",
    textBright: "#0C2D3F", accent: "#0099DD", accentDim: "rgba(0,153,221,0.10)",
    accentGlow: "rgba(0,153,221,0.22)", green: "#2EAA4F", greenDim: "rgba(46,170,79,0.10)",
    red: "#E04848", redDim: "rgba(224,72,72,0.10)", amber: "#E6A817",
    amberDim: "rgba(230,168,23,0.10)", purple: "#8862D0", purpleDim: "rgba(136,98,208,0.10)",
    hover: "rgba(0,153,221,0.06)",
    _aero: true,
  },

  // ── CHROMAWAVE (color-cycling) ───────────────────────────────────────────
  chromawave: {
    name: "Chromawave", emoji: "🌈",
    bg: "#0D0D1A", surface: "#161625", surfaceRaised: "#1F1F33",
    border: "#2E2E50", text: "#D0D0F0", textMuted: "#8888BB",
    textBright: "#F0F0FF", accent: "#FF6EC7", accentDim: "rgba(255,110,199,0.14)",
    accentGlow: "rgba(255,110,199,0.30)", green: "#7AFF8E", greenDim: "rgba(122,255,142,0.12)",
    red: "#FF6B6B", redDim: "rgba(255,107,107,0.12)", amber: "#FFD93D",
    amberDim: "rgba(255,217,61,0.12)", purple: "#B476FF", purpleDim: "rgba(180,118,255,0.12)",
    hover: "rgba(255,110,199,0.08)",
    _cycling: "8s",
  },

  // ── HYPERDRIVE (fast color-cycling) ──────────────────────────────────────
  hyperdrive: {
    name: "Hyperdrive", emoji: "⚡",
    bg: "#220044", surface: "#330055", surfaceRaised: "#440066",
    border: "#FF00FF", text: "#FF66FF", textMuted: "#CC33CC",
    textBright: "#FFFFFF", accent: "#00FF00", accentDim: "rgba(0,255,0,0.18)",
    accentGlow: "rgba(0,255,0,0.40)", green: "#39FF14", greenDim: "rgba(57,255,20,0.18)",
    red: "#FF073A", redDim: "rgba(255,7,58,0.18)", amber: "#FFE700",
    amberDim: "rgba(255,231,0,0.18)", purple: "#BF00FF", purpleDim: "rgba(191,0,255,0.18)",
    hover: "rgba(0,255,0,0.10)",
    _cycleSpeed: "0.4s",
    _hyperdriveBg: true,
  },

  // ── SOLARIZED DARK ───────────────────────────────────────────────────────
  solarized: {
    name: "Solarized Dark", emoji: "🔆",
    bg: "#002B36", surface: "#073642", surfaceRaised: "#0A3F4C",
    border: "#586E75", text: "#839496", textMuted: "#657B83",
    textBright: "#FDF6E3", accent: "#268BD2", accentDim: "rgba(38,139,210,0.12)",
    accentGlow: "rgba(38,139,210,0.25)", green: "#859900", greenDim: "rgba(133,153,0,0.12)",
    red: "#DC322F", redDim: "rgba(220,50,47,0.12)", amber: "#B58900",
    amberDim: "rgba(181,137,0,0.12)", purple: "#6C71C4", purpleDim: "rgba(108,113,196,0.12)",
    hover: "rgba(38,139,210,0.06)",
  },

  // ── CATPPUCCIN ───────────────────────────────────────────────────────────
  catppuccin: {
    name: "Catppuccin", emoji: "🐱",
    bg: "#1E1E2E", surface: "#242437", surfaceRaised: "#313244",
    border: "#45475A", text: "#CDD6F4", textMuted: "#7F849C",
    textBright: "#F5E0DC", accent: "#CBA6F7", accentDim: "rgba(203,166,247,0.12)",
    accentGlow: "rgba(203,166,247,0.25)", green: "#A6E3A1", greenDim: "rgba(166,227,161,0.12)",
    red: "#F38BA8", redDim: "rgba(243,139,168,0.12)", amber: "#F9E2AF",
    amberDim: "rgba(249,226,175,0.12)", purple: "#B4BEFE", purpleDim: "rgba(180,190,254,0.12)",
    hover: "rgba(203,166,247,0.06)",
  },

  // ── WINDOWS XP ───────────────────────────────────────────────────────────
  // Luna blue: silver-bodied, blue-accented UI of Windows XP circa 2001.
  windowsXP: {
    name: "Windows XP", emoji: "🪟",
    bg: "#ECE9D8", surface: "#F5F3E8", surfaceRaised: "#FFFFFF",
    border: "#ACA899", text: "#1C1C1C", textMuted: "#716F64",
    textBright: "#000000", accent: "#0055E5", accentDim: "rgba(0,85,229,0.10)",
    accentGlow: "rgba(0,85,229,0.22)", green: "#22B14C", greenDim: "rgba(34,177,76,0.10)",
    red: "#ED1C24", redDim: "rgba(237,28,36,0.10)", amber: "#FF7F27",
    amberDim: "rgba(255,127,39,0.10)", purple: "#A349A4", purpleDim: "rgba(163,73,164,0.10)",
    hover: "rgba(0,85,229,0.06)",
    _xpStyle: true,
  },

  // ── SLATE & EMBER ────────────────────────────────────────────────────────
  // Cool navy-slate base with warm coral accent.
  // Palette: #2D3142 · #4F5D75 · #BFC0C0 · #FFFFFF · #EF8354
  slateEmber: {
    name: "Slate & Ember", emoji: "🔥",
    bg: "#2D3142", surface: "#3A3F54", surfaceRaised: "#464C65",
    border: "#5A6177", text: "#BFC0C0", textMuted: "#8A8D96",
    textBright: "#FFFFFF", accent: "#EF8354", accentDim: "rgba(239,131,84,0.14)",
    accentGlow: "rgba(239,131,84,0.28)", green: "#6FCF97", greenDim: "rgba(111,207,151,0.12)",
    red: "#EB5757", redDim: "rgba(235,87,87,0.12)", amber: "#F2C94C",
    amberDim: "rgba(242,201,76,0.12)", purple: "#BB6BD9", purpleDim: "rgba(187,107,217,0.12)",
    hover: "rgba(239,131,84,0.06)",
  },

  // ── HIGH CONTRAST ────────────────────────────────────────────────────────
  // WCAG AAA–friendly. Pure black/white with high-vis yellow accent.
  highContrast: {
    name: "High Contrast", emoji: "♿",
    bg: "#000000", surface: "#0A0A0A", surfaceRaised: "#1A1A1A",
    border: "#FFFFFF", text: "#FFFFFF", textMuted: "#CCCCCC",
    textBright: "#FFFFFF", accent: "#FFD700", accentDim: "rgba(255,215,0,0.18)",
    accentGlow: "rgba(255,215,0,0.35)", green: "#00FF00", greenDim: "rgba(0,255,0,0.15)",
    red: "#FF0000", redDim: "rgba(255,0,0,0.15)", amber: "#FFD700",
    amberDim: "rgba(255,215,0,0.15)", purple: "#FF80FF", purpleDim: "rgba(255,128,255,0.15)",
    hover: "rgba(255,215,0,0.08)",
  },

  // ── MONOCHROME ───────────────────────────────────────────────────────────
  // Pure grayscale — zero chromatic color. Distraction-free, ink-on-paper feel.
  monochrome: {
    name: "Monochrome", emoji: "🖤",
    bg: "#141414", surface: "#1E1E1E", surfaceRaised: "#2A2A2A",
    border: "#3D3D3D", text: "#B0B0B0", textMuted: "#737373",
    textBright: "#E8E8E8", accent: "#D4D4D4", accentDim: "rgba(212,212,212,0.12)",
    accentGlow: "rgba(212,212,212,0.20)", green: "#A0A0A0", greenDim: "rgba(160,160,160,0.12)",
    red: "#999999", redDim: "rgba(153,153,153,0.12)", amber: "#C0C0C0",
    amberDim: "rgba(192,192,192,0.12)", purple: "#8A8A8A", purpleDim: "rgba(138,138,138,0.12)",
    hover: "rgba(212,212,212,0.06)",
  },

  // ── DRACULA ──────────────────────────────────────────────────────────────
  // Rich dark purple base with vivid pink, green, and cyan accents.
  dracula: {
    name: "Dracula", emoji: "🧛",
    bg: "#282A36", surface: "#2E303E", surfaceRaised: "#383A4A",
    border: "#44475A", text: "#F8F8F2", textMuted: "#6272A4",
    textBright: "#F8F8F2", accent: "#BD93F9", accentDim: "rgba(189,147,249,0.12)",
    accentGlow: "rgba(189,147,249,0.25)", green: "#50FA7B", greenDim: "rgba(80,250,123,0.12)",
    red: "#FF5555", redDim: "rgba(255,85,85,0.12)", amber: "#F1FA8C",
    amberDim: "rgba(241,250,140,0.12)", purple: "#FF79C6", purpleDim: "rgba(255,121,198,0.12)",
    hover: "rgba(189,147,249,0.06)",
  },

  // ── CYBERPUNK ────────────────────────────────────────────────────────────
  // Neon noir — dark city base with electric pink and cyan accents.
  cyberpunk: {
    name: "Cyberpunk", emoji: "🌃",
    bg: "#0A0A12", surface: "#12121E", surfaceRaised: "#1A1A2C",
    border: "#2A2A44", text: "#C0C0D8", textMuted: "#6A6A8E",
    textBright: "#EEEEF8", accent: "#FF2E97", accentDim: "rgba(255,46,151,0.14)",
    accentGlow: "rgba(255,46,151,0.30)", green: "#00FFB2", greenDim: "rgba(0,255,178,0.12)",
    red: "#FF3560", redDim: "rgba(255,53,96,0.12)", amber: "#FFB800",
    amberDim: "rgba(255,184,0,0.12)", purple: "#00D4FF", purpleDim: "rgba(0,212,255,0.12)",
    hover: "rgba(255,46,151,0.06)",
  },

  // ── PASTEL ───────────────────────────────────────────────────────────────
  // Soft candy colors on a near-white base. Light and playful.
  pastel: {
    name: "Pastel", emoji: "🍬",
    bg: "#FDF8FB", surface: "#FFF5FA", surfaceRaised: "#FFFFFF",
    border: "#E8D5E0", text: "#5C4A56", textMuted: "#A08E9A",
    textBright: "#2C1F28", accent: "#E87EBF", accentDim: "rgba(232,126,191,0.10)",
    accentGlow: "rgba(232,126,191,0.20)", green: "#7EC8A4", greenDim: "rgba(126,200,164,0.10)",
    red: "#E87E7E", redDim: "rgba(232,126,126,0.10)", amber: "#E8C87E",
    amberDim: "rgba(232,200,126,0.10)", purple: "#A87EE8", purpleDim: "rgba(168,126,232,0.10)",
    hover: "rgba(232,126,191,0.06)",
  },

  // ── NAUTICAL ─────────────────────────────────────────────────────────────
  // Ocean teals, sandy cream, burnt-orange accent.
  // Palette: #91C6BC · #4B9DA9 · #F6F3C2 · #E37434
  nautical: {
    name: "Nautical", emoji: "⚓",
    bg: "#1B3A40", surface: "#224248", surfaceRaised: "#2C5058",
    border: "#4B9DA9", text: "#C8DDD8", textMuted: "#7AADA4",
    textBright: "#F6F3C2", accent: "#E37434", accentDim: "rgba(227,116,52,0.14)",
    accentGlow: "rgba(227,116,52,0.28)", green: "#91C6BC", greenDim: "rgba(145,198,188,0.12)",
    red: "#E05A4A", redDim: "rgba(224,90,74,0.12)", amber: "#F6F3C2",
    amberDim: "rgba(246,243,194,0.12)", purple: "#A08CC0", purpleDim: "rgba(160,140,192,0.12)",
    hover: "rgba(227,116,52,0.06)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIDDEN EASTER EGG THEMES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── KONAMI (↑↑↓↓←→←→BA) ─────────────────────────────────────────────────
  konami: {
    name: "Classified", emoji: "🔓",
    _hidden: true,
    _upsideDown: true,
    bg: "#0C0C0C", surface: "#1A1A1A", surfaceRaised: "#222222",
    border: "#FF0000", text: "#FF3333", textMuted: "#993333",
    textBright: "#FFFFFF", accent: "#FF0000", accentDim: "rgba(255,0,0,0.12)",
    accentGlow: "rgba(255,0,0,0.30)", green: "#FF0000", greenDim: "rgba(255,0,0,0.12)",
    red: "#FF0000", redDim: "rgba(255,0,0,0.12)", amber: "#FF3300",
    amberDim: "rgba(255,51,0,0.12)", purple: "#FF0066", purpleDim: "rgba(255,0,102,0.12)",
    hover: "rgba(255,0,0,0.06)",
  },

  // ── AFTER DARK (type "afterdark") ────────────────────────────────────────
  afterdark: {
    name: "After Dark", emoji: "🌌",
    _hidden: true,
    _starfield: true,
    bg: "#000008", surface: "#080816", surfaceRaised: "#101024",
    border: "#1E1E3A", text: "#A0A0CC", textMuted: "#6060AA",
    textBright: "#E0E0FF", accent: "#FFD700", accentDim: "rgba(255,215,0,0.12)",
    accentGlow: "rgba(255,215,0,0.25)", green: "#66FF66", greenDim: "rgba(102,255,102,0.12)",
    red: "#FF6666", redDim: "rgba(255,102,102,0.12)", amber: "#FFD700",
    amberDim: "rgba(255,215,0,0.12)", purple: "#CC88FF", purpleDim: "rgba(204,136,255,0.12)",
    hover: "rgba(255,215,0,0.06)",
  },

  // ── MATRIX (type "matrix") ───────────────────────────────────────────────
  matrix: {
    name: "Matrix", emoji: "💊",
    _hidden: true,
    _matrixRain: true,
    bg: "#000800", surface: "#001200", surfaceRaised: "#001A00",
    border: "#003300", text: "#00CC00", textMuted: "#008800",
    textBright: "#00FF41", accent: "#00FF41", accentDim: "rgba(0,255,65,0.12)",
    accentGlow: "rgba(0,255,65,0.30)", green: "#00FF41", greenDim: "rgba(0,255,65,0.12)",
    red: "#FF0000", redDim: "rgba(255,0,0,0.12)", amber: "#00FF41",
    amberDim: "rgba(0,255,65,0.12)", purple: "#00CC00", purpleDim: "rgba(0,204,0,0.12)",
    hover: "rgba(0,255,65,0.06)",
  },
};

// Set the context default now that THEMES is defined
ThemeContext._currentValue = THEMES.midnight;

// ─── THEME CATEGORIES (for the picker UI) ───────────────────────────────────

export const THEME_CATEGORIES = [
  {
    label: "Dark",
    keys: ["midnight", "nord", "solarized", "catppuccin", "slateEmber", "dracula", "monochrome", "nautical"],
  },
  {
    label: "Light",
    keys: ["light", "cherry", "lavender", "frutigerAero", "windowsXP", "pastel"],
  },
  {
    label: "Vibrant",
    keys: ["forest", "ocean", "sunset", "retro", "cyberpunk", "wacky", "eyebleed"],
  },
  {
    label: "Animated",
    keys: ["chromawave", "hyperdrive"],
  },
  {
    label: "Accessibility",
    keys: ["highContrast"],
  },
];

// ─── THEME SWATCH (mini color preview for picker cards) ─────────────────────

export const ThemeSwatch = ({ theme }) => {
  const colors = [theme.bg, theme.surface, theme.accent, theme.green, theme.red];
  return (
    <div style={{
      display: "flex",
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
      marginTop: 8,
    }}>
      {colors.map((c, i) => (
        <div key={i} style={{
          flex: 1,
          background: c,
          borderRight: i < colors.length - 1 ? "1px solid rgba(128,128,128,0.15)" : "none",
        }} />
      ))}
    </div>
  );
};