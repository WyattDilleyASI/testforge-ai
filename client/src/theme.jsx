// ═══════════════════════════════════════════════════════════════════════════
// theme.jsx — All TestForge theme definitions, categories, shared constants,
//             and helpers.
//
// ** SINGLE SOURCE OF TRUTH ** — every component imports from this file.
//
// Usage:
//   import { THEMES, THEME_CATEGORIES, ThemeSwatch, ThemeContext, useTheme,
//            font, mono, DRAFT_DISCLAIMER, ROLE_PERMISSIONS } from "./theme";
//
//   // From components/ subdir:
//   import { useTheme, font, mono } from "../theme";
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext } from "react";

// ─── SHARED CONSTANTS ───────────────────────────────────────────────────────

export const font = "'DM Sans', 'Segoe UI', system-ui, sans-serif";
export const mono = "'JetBrains Mono', 'Fira Code', monospace";
export const DRAFT_DISCLAIMER = "These test cases are AI-generated drafts and represent a suggested starting point only. QA Engineer review, augmentation, and approval are required before use.";

export const ROLE_PERMISSIONS = {
  "QA Engineer": { label: "QA Engineer", color: "accent", permissions: ["Ingest & edit requirements", "Generate & edit test cases", "Add & tag KB entries", "View Traceability Matrix & Coverage Dashboard"], restricted: ["Approve TCs for export", "Modify Jama settings", "Access user management"] },
  "QA Manager": { label: "QA Manager", color: "amber", permissions: ["All QA Engineer permissions", "Approve or reject TCs for export", "Initiate & review Jama exports", "View user activity logs"], restricted: ["Create/edit/deactivate accounts", "Configure Jama API credentials", "Access full audit log"] },
  "Admin": { label: "Admin", color: "purple", permissions: ["All QA Manager permissions", "Create, edit, deactivate accounts", "Assign roles to users", "Configure Jama credentials", "Access full system audit log"], restricted: [] },
};

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

  // ── AURORA BOREALIS ──────────────────────────────────────────────────────
  aurora: {
    name: "Aurora Borealis", emoji: "🌌",
    _aurora: true,
    bg: "#050B18", surface: "#0A1628", surfaceRaised: "#102038",
    border: "#1A3050", text: "#A8C8D8", textMuted: "#5A7A8A",
    textBright: "#E0F0F8", accent: "#00E87E", accentDim: "rgba(0,232,126,0.14)",
    accentGlow: "rgba(0,232,126,0.28)", green: "#00E87E", greenDim: "rgba(0,232,126,0.12)",
    red: "#FF6B8A", redDim: "rgba(255,107,138,0.12)", amber: "#80E8C0",
    amberDim: "rgba(128,232,192,0.12)", purple: "#B480FF", purpleDim: "rgba(180,128,255,0.12)",
    hover: "rgba(0,232,126,0.06)",
  },

  // ── VAPORWAVE ────────────────────────────────────────────────────────────
  vaporwave: {
    name: "Vaporwave", emoji: "🌴",
    _vaporwave: true,
    bg: "#1A0A2E", surface: "#221438", surfaceRaised: "#2C1E44",
    border: "#4A2870", text: "#E0B0FF", textMuted: "#9060C0",
    textBright: "#FFE0FF", accent: "#FF71CE", accentDim: "rgba(255,113,206,0.14)",
    accentGlow: "rgba(255,113,206,0.30)", green: "#01CDFE", greenDim: "rgba(1,205,254,0.12)",
    red: "#FF6B9D", redDim: "rgba(255,107,157,0.12)", amber: "#FFFB96",
    amberDim: "rgba(255,251,150,0.12)", purple: "#B967FF", purpleDim: "rgba(185,103,255,0.12)",
    hover: "rgba(255,113,206,0.06)",
  },

  // ── FIREFLIES ────────────────────────────────────────────────────────────
  fireflies: {
    name: "Fireflies", emoji: "✨",
    _fireflies: true,
    bg: "#0A0E08", surface: "#121A0E", surfaceRaised: "#1A2416",
    border: "#2A3A22", text: "#B8C8A8", textMuted: "#6A8058",
    textBright: "#E8F0D8", accent: "#E8D44D", accentDim: "rgba(232,212,77,0.14)",
    accentGlow: "rgba(232,212,77,0.28)", green: "#7ACC68", greenDim: "rgba(122,204,104,0.12)",
    red: "#E87070", redDim: "rgba(232,112,112,0.12)", amber: "#E8D44D",
    amberDim: "rgba(232,212,77,0.12)", purple: "#C098E0", purpleDim: "rgba(192,152,224,0.12)",
    hover: "rgba(232,212,77,0.06)",
  },

  // ── LAVA LAMP ────────────────────────────────────────────────────────────
  lavaLamp: {
    name: "Lava Lamp", emoji: "🫠",
    _lavaLamp: true,
    bg: "#1A0A0A", surface: "#241212", surfaceRaised: "#2E1A1A",
    border: "#5A2A2A", text: "#E8C0B0", textMuted: "#A06858",
    textBright: "#FFF0E8", accent: "#FF6B35", accentDim: "rgba(255,107,53,0.14)",
    accentGlow: "rgba(255,107,53,0.28)", green: "#FFB347", greenDim: "rgba(255,179,71,0.12)",
    red: "#FF4444", redDim: "rgba(255,68,68,0.12)", amber: "#FFD700",
    amberDim: "rgba(255,215,0,0.12)", purple: "#FF6B9D", purpleDim: "rgba(255,107,157,0.12)",
    hover: "rgba(255,107,53,0.06)",
  },

  // ── SYNTHWAVE ────────────────────────────────────────────────────────────
  synthwave: {
    name: "Synthwave", emoji: "🎹",
    _synthwave: true,
    bg: "#0E0620", surface: "#16082E", surfaceRaised: "#1E0E3A",
    border: "#3A1870", text: "#D0B8E8", textMuted: "#8060A8",
    textBright: "#F0E0FF", accent: "#F72585", accentDim: "rgba(247,37,133,0.14)",
    accentGlow: "rgba(247,37,133,0.30)", green: "#4CC9F0", greenDim: "rgba(76,201,240,0.12)",
    red: "#FF4060", redDim: "rgba(255,64,96,0.12)", amber: "#F7B731",
    amberDim: "rgba(247,183,49,0.12)", purple: "#7209B7", purpleDim: "rgba(114,9,183,0.12)",
    hover: "rgba(247,37,133,0.06)",
  },

  // ── FISH TANK ────────────────────────────────────────────────────────────
  fishTank: {
    name: "Fish Tank", emoji: "🐠",
    _fishTank: true,
    bg: "#041428", surface: "#081E36", surfaceRaised: "#0C2844",
    border: "#1A4468", text: "#90C8E8", textMuted: "#4A8AAA",
    textBright: "#D0F0FF", accent: "#3ABEFF", accentDim: "rgba(58,190,255,0.14)",
    accentGlow: "rgba(58,190,255,0.28)", green: "#40E8A0", greenDim: "rgba(64,232,160,0.12)",
    red: "#FF7088", redDim: "rgba(255,112,136,0.12)", amber: "#FFD060",
    amberDim: "rgba(255,208,96,0.12)", purple: "#A080E0", purpleDim: "rgba(160,128,224,0.12)",
    hover: "rgba(58,190,255,0.06)",
  },

  // ── HOT DOG STAND ────────────────────────────────────────────────────────
  hotDog: {
    name: "Hot Dog Stand", emoji: "🌭",
    bg: "#CC0000", surface: "#E8B400", surfaceRaised: "#D4A300",
    border: "#FFDD00", text: "#FFFF00", textMuted: "#E8C800",
    textBright: "#FFFFFF", accent: "#FFD000", accentDim: "rgba(255,208,0,0.25)",
    accentGlow: "rgba(255,208,0,0.45)", green: "#FFE033", greenDim: "rgba(255,224,51,0.20)",
    red: "#FF0000", redDim: "rgba(255,0,0,0.20)", amber: "#FFEE55",
    amberDim: "rgba(255,238,85,0.20)", purple: "#FFD000", purpleDim: "rgba(255,208,0,0.20)",
    hover: "rgba(255,221,0,0.15)",
  },

  // ── ROSÉ PINE ────────────────────────────────────────────────────────────
  rosePine: {
    name: "Rosé Pine", emoji: "🌹",
    bg: "#191724", surface: "#1F1D2E", surfaceRaised: "#26233A",
    border: "#393552", text: "#E0DEF4", textMuted: "#6E6A86",
    textBright: "#E0DEF4", accent: "#EBBCBA", accentDim: "rgba(235,188,186,0.12)",
    accentGlow: "rgba(235,188,186,0.25)", green: "#9CCFD8", greenDim: "rgba(156,207,216,0.12)",
    red: "#EB6F92", redDim: "rgba(235,111,146,0.12)", amber: "#F6C177",
    amberDim: "rgba(246,193,119,0.12)", purple: "#C4A7E7", purpleDim: "rgba(196,167,231,0.12)",
    hover: "rgba(235,188,186,0.06)",
  },

  // ── GRUVBOX DARK ─────────────────────────────────────────────────────────
  gruvboxDark: {
    name: "Gruvbox Dark", emoji: "🍂",
    bg: "#282828", surface: "#32302F", surfaceRaised: "#3C3836",
    border: "#504945", text: "#EBDBB2", textMuted: "#928374",
    textBright: "#FBF1C7", accent: "#FE8019", accentDim: "rgba(254,128,25,0.12)",
    accentGlow: "rgba(254,128,25,0.25)", green: "#B8BB26", greenDim: "rgba(184,187,38,0.12)",
    red: "#FB4934", redDim: "rgba(251,73,52,0.12)", amber: "#FABD2F",
    amberDim: "rgba(250,189,47,0.12)", purple: "#D3869B", purpleDim: "rgba(211,134,155,0.12)",
    hover: "rgba(254,128,25,0.06)",
  },

  // ── TOKYO NIGHT ──────────────────────────────────────────────────────────
  tokyoNight: {
    name: "Tokyo Night", emoji: "🗼",
    bg: "#1A1B26", surface: "#1E2030", surfaceRaised: "#24283B",
    border: "#3B4261", text: "#A9B1D6", textMuted: "#565F89",
    textBright: "#C0CAF5", accent: "#7AA2F7", accentDim: "rgba(122,162,247,0.12)",
    accentGlow: "rgba(122,162,247,0.25)", green: "#9ECE6A", greenDim: "rgba(158,206,106,0.12)",
    red: "#F7768E", redDim: "rgba(247,118,142,0.12)", amber: "#E0AF68",
    amberDim: "rgba(224,175,104,0.12)", purple: "#BB9AF7", purpleDim: "rgba(187,154,247,0.12)",
    hover: "rgba(122,162,247,0.06)",
  },

  // ── MONOKAI ──────────────────────────────────────────────────────────────
  monokai: {
    name: "Monokai", emoji: "🎨",
    bg: "#272822", surface: "#2E2E28", surfaceRaised: "#383830",
    border: "#49483E", text: "#F8F8F2", textMuted: "#75715E",
    textBright: "#F8F8F0", accent: "#A6E22E", accentDim: "rgba(166,226,46,0.12)",
    accentGlow: "rgba(166,226,46,0.25)", green: "#A6E22E", greenDim: "rgba(166,226,46,0.12)",
    red: "#F92672", redDim: "rgba(249,38,114,0.12)", amber: "#E6DB74",
    amberDim: "rgba(230,219,116,0.12)", purple: "#AE81FF", purpleDim: "rgba(174,129,255,0.12)",
    hover: "rgba(166,226,46,0.06)",
  },

  // ── COBALT ───────────────────────────────────────────────────────────────
  cobalt: {
    name: "Cobalt", emoji: "💎",
    bg: "#132738", surface: "#193549", surfaceRaised: "#1F4062",
    border: "#2A5A7A", text: "#C0D8F0", textMuted: "#6A8EAA",
    textBright: "#FFFFFF", accent: "#FFC600", accentDim: "rgba(255,198,0,0.12)",
    accentGlow: "rgba(255,198,0,0.28)", green: "#3AD900", greenDim: "rgba(58,217,0,0.12)",
    red: "#FF628C", redDim: "rgba(255,98,140,0.12)", amber: "#FFC600",
    amberDim: "rgba(255,198,0,0.12)", purple: "#FF9D00", purpleDim: "rgba(255,157,0,0.12)",
    hover: "rgba(255,198,0,0.06)",
  },

  // ── SOLARIZED LIGHT ──────────────────────────────────────────────────────
  solarizedLight: {
    name: "Solarized Light", emoji: "🌤️",
    bg: "#FDF6E3", surface: "#EEE8D5", surfaceRaised: "#FFFFFF",
    border: "#D3CBB7", text: "#586E75", textMuted: "#93A1A1",
    textBright: "#073642", accent: "#268BD2", accentDim: "rgba(38,139,210,0.10)",
    accentGlow: "rgba(38,139,210,0.20)", green: "#859900", greenDim: "rgba(133,153,0,0.10)",
    red: "#DC322F", redDim: "rgba(220,50,47,0.10)", amber: "#B58900",
    amberDim: "rgba(181,137,0,0.10)", purple: "#6C71C4", purpleDim: "rgba(108,113,196,0.10)",
    hover: "rgba(38,139,210,0.06)",
  },

  // ── GRUVBOX LIGHT ────────────────────────────────────────────────────────
  gruvboxLight: {
    name: "Gruvbox Light", emoji: "🍁",
    bg: "#FBF1C7", surface: "#F2E5BC", surfaceRaised: "#FFFFFF",
    border: "#D5C4A1", text: "#504945", textMuted: "#928374",
    textBright: "#282828", accent: "#D65D0E", accentDim: "rgba(214,93,14,0.10)",
    accentGlow: "rgba(214,93,14,0.20)", green: "#79740E", greenDim: "rgba(121,116,14,0.10)",
    red: "#CC241D", redDim: "rgba(204,36,29,0.10)", amber: "#D79921",
    amberDim: "rgba(215,153,33,0.10)", purple: "#B16286", purpleDim: "rgba(177,98,134,0.10)",
    hover: "rgba(214,93,14,0.06)",
  },

  // ── PAPER ────────────────────────────────────────────────────────────────
  paper: {
    name: "Paper", emoji: "📄",
    bg: "#F8F5F0", surface: "#EFEBE4", surfaceRaised: "#FFFFFF",
    border: "#D8D0C4", text: "#433E38", textMuted: "#8C8478",
    textBright: "#1A1714", accent: "#5E81AC", accentDim: "rgba(94,129,172,0.10)",
    accentGlow: "rgba(94,129,172,0.20)", green: "#5A8A3C", greenDim: "rgba(90,138,60,0.10)",
    red: "#BF4040", redDim: "rgba(191,64,64,0.10)", amber: "#B8860B",
    amberDim: "rgba(184,134,11,0.10)", purple: "#7E6BAD", purpleDim: "rgba(126,107,173,0.10)",
    hover: "rgba(94,129,172,0.06)",
  },

  // ── NEON MINT ────────────────────────────────────────────────────────────
  neonMint: {
    name: "Neon Mint", emoji: "🍃",
    bg: "#0A1210", surface: "#0E1A16", surfaceRaised: "#142220",
    border: "#1E3A34", text: "#A8D8C8", textMuted: "#5A8A78",
    textBright: "#E0FFF4", accent: "#00FFAA", accentDim: "rgba(0,255,170,0.12)",
    accentGlow: "rgba(0,255,170,0.28)", green: "#00FFAA", greenDim: "rgba(0,255,170,0.12)",
    red: "#FF6B7A", redDim: "rgba(255,107,122,0.12)", amber: "#FFD166",
    amberDim: "rgba(255,209,102,0.12)", purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.12)",
    hover: "rgba(0,255,170,0.06)",
  },

  // ── COPPER ───────────────────────────────────────────────────────────────
  copper: {
    name: "Copper", emoji: "🪙",
    bg: "#1A1410", surface: "#221C16", surfaceRaised: "#2C241C",
    border: "#4A3C2E", text: "#D4C4AA", textMuted: "#8A7A64",
    textBright: "#F0E8D8", accent: "#D4845A", accentDim: "rgba(212,132,90,0.14)",
    accentGlow: "rgba(212,132,90,0.28)", green: "#88B878", greenDim: "rgba(136,184,120,0.12)",
    red: "#D46A6A", redDim: "rgba(212,106,106,0.12)", amber: "#D4A84A",
    amberDim: "rgba(212,168,74,0.12)", purple: "#B898C8", purpleDim: "rgba(184,152,200,0.12)",
    hover: "rgba(212,132,90,0.06)",
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

// ─── THEME CONTEXT ──────────────────────────────────────────────────────────

export const ThemeContext = createContext(THEMES.midnight);
export const useTheme = () => useContext(ThemeContext);

// ─── THEME CATEGORIES (for the picker UI) ───────────────────────────────────

export const THEME_CATEGORIES = [
  {
    label: "Dark",
    keys: [
      "midnight", "nord", "solarized", "catppuccin", "slateEmber",
      "dracula", "monochrome", "nautical",
      "rosePine", "gruvboxDark", "tokyoNight", "monokai", "cobalt", "copper",
    ],
  },
  {
    label: "Light",
    keys: [
      "light", "cherry", "lavender", "frutigerAero", "windowsXP", "pastel",
      "solarizedLight", "gruvboxLight", "paper",
    ],
  },
  {
    label: "Vibrant",
    keys: [
      "forest", "ocean", "sunset", "retro", "cyberpunk",
      "neonMint", "wacky", "eyebleed", "hotDog",
    ],
  },
  {
    label: "Animated",
    keys: [
      "chromawave", "hyperdrive", "aurora", "vaporwave",
      "fireflies", "lavaLamp", "synthwave", "fishTank",
    ],
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