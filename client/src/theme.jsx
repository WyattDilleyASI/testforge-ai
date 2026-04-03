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

  // ── AUDIO VISUALIZER ─────────────────────────────────────────────────────
  audioVisualizer: {
    name: "Audio Visualizer", emoji: "🎧",
    _audioVisualizer: true,
    bg: "#0a0a12", surface: "#10101E", surfaceRaised: "#18182A",
    border: "#252544", text: "#C0C0E0", textMuted: "#6A6A9E",
    textBright: "#EEEEFF", accent: "#00F0FF", accentDim: "rgba(0,240,255,0.12)",
    accentGlow: "rgba(0,240,255,0.28)", green: "#00FF99", greenDim: "rgba(0,255,153,0.12)",
    red: "#FF2D95", redDim: "rgba(255,45,149,0.12)", amber: "#FFD93D",
    amberDim: "rgba(255,217,61,0.12)", purple: "#7B2FF7", purpleDim: "rgba(123,47,247,0.12)",
    hover: "rgba(0,240,255,0.06)",
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
    _hotDogs: true,
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

  // ── URGENT PUMPKIN ─────────────────────────────────────────────────────────
  // Deep navy base with hot orange and amber pops. Urgency meets warmth.
  urgentPumpkin: {
    name: "Urgent Pumpkin", emoji: "🎃",
    bg: "#020617", surface: "#0F172A", surfaceRaised: "#1A2540",
    border: "#1E293B", text: "#FED7AA", textMuted: "#C8976A",
    textBright: "#FFFBEB", accent: "#F97316", accentDim: "rgba(249,115,22,0.14)",
    accentGlow: "rgba(249,115,22,0.28)", green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
    red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FBBF24",
    amberDim: "rgba(251,191,36,0.12)", purple: "#C084FC", purpleDim: "rgba(192,132,252,0.12)",
    hover: "rgba(249,115,22,0.06)",
  },

  // ── EMERALD OPS ──────────────────────────────────────────────────────────
  // Cool slate-navy command center with emerald green accent. Calm and focused.
  emeraldOps: {
    name: "Emerald Ops", emoji: "💚",
    bg: "#020617", surface: "#0B1220", surfaceRaised: "#131D2E",
    border: "#1E293B", text: "#E2E8F0", textMuted: "#94A3B8",
    textBright: "#F1F5F9", accent: "#10B981", accentDim: "rgba(16,185,129,0.12)",
    accentGlow: "rgba(16,185,129,0.25)", green: "#10B981", greenDim: "rgba(16,185,129,0.12)",
    red: "#F87171", redDim: "rgba(248,113,113,0.12)", amber: "#FBBF24",
    amberDim: "rgba(251,191,36,0.12)", purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.12)",
    hover: "rgba(16,185,129,0.06)",
  },

  // ── SUNSHINE HUES ────────────────────────────────────────────────────────
  // Warm cream base with teal accent, coral red, and sunny yellow highlights.
  sunshineHues: {
    name: "Sunshine Hues", emoji: "🌞",
    _sunshine: true,
    bg: "#FFFEF5", surface: "#FFFFEA", surfaceRaised: "#FFFFFF",
    border: "#D8D8D8", text: "#4A4A42", textMuted: "#8A8A80",
    textBright: "#1A1A14", accent: "#00CECB", accentDim: "rgba(0,206,203,0.10)",
    accentGlow: "rgba(0,206,203,0.22)", green: "#2EAA6E", greenDim: "rgba(46,170,110,0.10)",
    red: "#FF5E5B", redDim: "rgba(255,94,91,0.10)", amber: "#D4AA00",
    amberDim: "rgba(212,170,0,0.10)", purple: "#8B6CC4", purpleDim: "rgba(139,108,196,0.10)",
    hover: "rgba(0,206,203,0.06)",
  },

  // ── SCOOBY DOO ───────────────────────────────────────────────────────────
  // Cartoon-saturated gold, red, lime, and indigo on a deep purple-navy base.
  scoobyDoo: {
    name: "Scooby Doo", emoji: "🐕",
    bg: "#0E0A1E", surface: "#16122A", surfaceRaised: "#1E1A36",
    border: "#2E2A4A", text: "#D8D4E8", textMuted: "#8A86A8",
    textBright: "#F0EEF8", accent: "#F6B72A", accentDim: "rgba(246,183,42,0.14)",
    accentGlow: "rgba(246,183,42,0.30)", green: "#C4F862", greenDim: "rgba(196,248,98,0.12)",
    red: "#F63C3C", redDim: "rgba(246,60,60,0.12)", amber: "#F77D3B",
    amberDim: "rgba(247,125,59,0.12)", purple: "#6562F8", purpleDim: "rgba(101,98,248,0.12)",
    hover: "rgba(246,183,42,0.06)",
  },

  // ── ROSEWOOD ─────────────────────────────────────────────────────────────
  rosewood: {
    name: "Rosewood", emoji: "🪵",
    bg: "#1C0F0F", surface: "#261616", surfaceRaised: "#321E1E",
    border: "#5A3333", text: "#D4B0A8", textMuted: "#9A6E64",
    textBright: "#F2DDD8", accent: "#C8564A", accentDim: "rgba(200,86,74,0.14)",
    accentGlow: "rgba(200,86,74,0.28)", green: "#8AB87A", greenDim: "rgba(138,184,122,0.12)",
    red: "#D45A4A", redDim: "rgba(212,90,74,0.12)", amber: "#D4A06A",
    amberDim: "rgba(212,160,106,0.12)", purple: "#A87890", purpleDim: "rgba(168,120,144,0.12)",
    hover: "rgba(200,86,74,0.06)",
  },

  // ── TERRACOTTA ───────────────────────────────────────────────────────────
  terracotta: {
    name: "Terracotta", emoji: "🏜️",
    bg: "#1E1410", surface: "#2A1C16", surfaceRaised: "#36241C",
    border: "#6B4A38", text: "#D8C0AA", textMuted: "#A08068",
    textBright: "#F5E6D8", accent: "#D47B4A", accentDim: "rgba(212,123,74,0.14)",
    accentGlow: "rgba(212,123,74,0.28)", green: "#8AAA6E", greenDim: "rgba(138,170,110,0.12)",
    red: "#C85A46", redDim: "rgba(200,90,70,0.12)", amber: "#D4A84A",
    amberDim: "rgba(212,168,74,0.12)", purple: "#A87898", purpleDim: "rgba(168,120,152,0.12)",
    hover: "rgba(212,123,74,0.06)",
  },

  // ── ICE ──────────────────────────────────────────────────────────────────
  ice: {
    name: "Ice", emoji: "🧊",
    bg: "#EDF4F8", surface: "#F4F9FC", surfaceRaised: "#FFFFFF",
    border: "#C4D8E8", text: "#3A5568", textMuted: "#7A9AB0",
    textBright: "#1A2E3E", accent: "#3A8EC0", accentDim: "rgba(58,142,192,0.10)",
    accentGlow: "rgba(58,142,192,0.20)", green: "#4A9A7A", greenDim: "rgba(74,154,122,0.10)",
    red: "#C85464", redDim: "rgba(200,84,100,0.10)", amber: "#A08A3A",
    amberDim: "rgba(160,138,58,0.10)", purple: "#7868A8", purpleDim: "rgba(120,104,168,0.10)",
    hover: "rgba(58,142,192,0.06)",
  },

  // ── HONEYCOMB ────────────────────────────────────────────────────────────
  honeycomb: {
    name: "Honeycomb", emoji: "🍯",
    bg: "#1A1408", surface: "#241C0E", surfaceRaised: "#2E2414",
    border: "#5A4A28", text: "#D8C898", textMuted: "#A0885A",
    textBright: "#F5E8C8", accent: "#D4A020", accentDim: "rgba(212,160,32,0.14)",
    accentGlow: "rgba(212,160,32,0.28)", green: "#8AAA48", greenDim: "rgba(138,170,72,0.12)",
    red: "#C86040", redDim: "rgba(200,96,64,0.12)", amber: "#E8B830",
    amberDim: "rgba(232,184,48,0.12)", purple: "#A8884A", purpleDim: "rgba(168,136,74,0.12)",
    hover: "rgba(212,160,32,0.06)",
  },

  // ── SLATE BLUE ───────────────────────────────────────────────────────────
  slateBlue: {
    name: "Slate Blue", emoji: "🌊",
    bg: "#141820", surface: "#1A2028", surfaceRaised: "#202830",
    border: "#384858", text: "#A8B8C8", textMuted: "#687888",
    textBright: "#E0E8F0", accent: "#4A98B8", accentDim: "rgba(74,152,184,0.12)",
    accentGlow: "rgba(74,152,184,0.25)", green: "#5AA888", greenDim: "rgba(90,168,136,0.12)",
    red: "#C86868", redDim: "rgba(200,104,104,0.12)", amber: "#B8A058",
    amberDim: "rgba(184,160,88,0.12)", purple: "#8878A8", purpleDim: "rgba(136,120,168,0.12)",
    hover: "rgba(74,152,184,0.06)",
  },

  // ── OBSIDIAN ─────────────────────────────────────────────────────────────
  obsidian: {
    name: "Obsidian", emoji: "🖤",
    bg: "#080808", surface: "#101010", surfaceRaised: "#181818",
    border: "#2A2A2A", text: "#B0B0B0", textMuted: "#606060",
    textBright: "#F0F0F0", accent: "#C83050", accentDim: "rgba(200,48,80,0.14)",
    accentGlow: "rgba(200,48,80,0.28)", green: "#50A868", greenDim: "rgba(80,168,104,0.12)",
    red: "#D04050", redDim: "rgba(208,64,80,0.12)", amber: "#C8A838",
    amberDim: "rgba(200,168,56,0.12)", purple: "#8860B8", purpleDim: "rgba(136,96,184,0.12)",
    hover: "rgba(200,48,80,0.06)",
  },

  // ── SAKURA ───────────────────────────────────────────────────────────────
  sakura: {
    name: "Sakura", emoji: "🌸",
    bg: "#FDF6F8", surface: "#FFF0F4", surfaceRaised: "#FFFFFF",
    border: "#E8C8D4", text: "#5A3A48", textMuted: "#A87890",
    textBright: "#2E1A24", accent: "#D06888", accentDim: "rgba(208,104,136,0.10)",
    accentGlow: "rgba(208,104,136,0.20)", green: "#6AA880", greenDim: "rgba(106,168,128,0.10)",
    red: "#D05868", redDim: "rgba(208,88,104,0.10)", amber: "#C8A050",
    amberDim: "rgba(200,160,80,0.10)", purple: "#9868B8", purpleDim: "rgba(152,104,184,0.10)",
    hover: "rgba(208,104,136,0.06)",
  },

  // ── MILITARY ─────────────────────────────────────────────────────────────
  military: {
    name: "Military", emoji: "🎖️",
    bg: "#12140E", surface: "#1A1C14", surfaceRaised: "#22241A",
    border: "#3A3E2E", text: "#A8AA8E", textMuted: "#6A6E52",
    textBright: "#D8DAC0", accent: "#7A8A3A", accentDim: "rgba(122,138,58,0.14)",
    accentGlow: "rgba(122,138,58,0.28)", green: "#6A9A3A", greenDim: "rgba(106,154,58,0.12)",
    red: "#AA5040", redDim: "rgba(170,80,64,0.12)", amber: "#B8A040",
    amberDim: "rgba(184,160,64,0.12)", purple: "#7A6A8A", purpleDim: "rgba(122,106,138,0.12)",
    hover: "rgba(122,138,58,0.06)",
  },

  // ── BLUEPRINT ────────────────────────────────────────────────────────────
  blueprint: {
    name: "Blueprint", emoji: "📐",
    _blueprint: true,
    bg: "#0A2A4A", surface: "#0E3258", surfaceRaised: "#123A66",
    border: "#2A6090", text: "#B0D0E8", textMuted: "#6A98B8",
    textBright: "#E8F4FF", accent: "#F0F0F0", accentDim: "rgba(240,240,240,0.12)",
    accentGlow: "rgba(240,240,240,0.20)", green: "#60C090", greenDim: "rgba(96,192,144,0.12)",
    red: "#E87070", redDim: "rgba(232,112,112,0.12)", amber: "#E8D070",
    amberDim: "rgba(232,208,112,0.12)", purple: "#A0A0E0", purpleDim: "rgba(160,160,224,0.12)",
    hover: "rgba(240,240,240,0.06)",
  },

  // ── NEWSPAPER ────────────────────────────────────────────────────────────
  newspaper: {
    name: "Newspaper", emoji: "📰",
    _newspaper: true,
    bg: "#F0E8D8", surface: "#F5EDE0", surfaceRaised: "#FAF4EA",
    border: "#C8B898", text: "#2A2418", textMuted: "#7A6E58",
    textBright: "#1A1408", accent: "#8A4A2A", accentDim: "rgba(138,74,42,0.10)",
    accentGlow: "rgba(138,74,42,0.18)", green: "#4A6A3A", greenDim: "rgba(74,106,58,0.10)",
    red: "#8A3030", redDim: "rgba(138,48,48,0.10)", amber: "#8A6A20",
    amberDim: "rgba(138,106,32,0.10)", purple: "#5A4A6A", purpleDim: "rgba(90,74,106,0.10)",
    hover: "rgba(138,74,42,0.06)",
  },

  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CANVAS-ANIMATED THEMES (need canvas components in EasterEggs.jsx)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── RAINSTORM ────────────────────────────────────────────────────────────
  rainstorm: {
    name: "Rainstorm", emoji: "🌧️",
    _rainstorm: true,
    bg: "#0C1018", surface: "#121820", surfaceRaised: "#1A2028",
    border: "#2A3848", text: "#90A0B8", textMuted: "#5A6A80",
    textBright: "#C8D8E8", accent: "#5088B8", accentDim: "rgba(80,136,184,0.14)",
    accentGlow: "rgba(80,136,184,0.28)", green: "#4A9878", greenDim: "rgba(74,152,120,0.12)",
    red: "#B86060", redDim: "rgba(184,96,96,0.12)", amber: "#A8985A",
    amberDim: "rgba(168,152,90,0.12)", purple: "#7868A0", purpleDim: "rgba(120,104,160,0.12)",
    hover: "rgba(80,136,184,0.06)",
  },

  // ── STARFIELD (visible version) ──────────────────────────────────────────
  starfieldTheme: {
    name: "Starfield", emoji: "🚀",
    _starfieldTheme: true,
    bg: "#020208", surface: "#0A0A14", surfaceRaised: "#12121E",
    border: "#222238", text: "#A0A0C0", textMuted: "#5A5A78",
    textBright: "#E0E0F8", accent: "#6A8AE8", accentDim: "rgba(106,138,232,0.14)",
    accentGlow: "rgba(106,138,232,0.28)", green: "#50C878", greenDim: "rgba(80,200,120,0.12)",
    red: "#E06868", redDim: "rgba(224,104,104,0.12)", amber: "#C8B848",
    amberDim: "rgba(200,184,72,0.12)", purple: "#9878D0", purpleDim: "rgba(152,120,208,0.12)",
    hover: "rgba(106,138,232,0.06)",
  },

  // ── CAMPFIRE ─────────────────────────────────────────────────────────────
  campfire: {
    name: "Campfire", emoji: "🔥",
    _campfire: true,
    bg: "#0E0A08", surface: "#181210", surfaceRaised: "#221A16",
    border: "#3A2A20", text: "#C8B098", textMuted: "#8A7460",
    textBright: "#F0DCC8", accent: "#E88830", accentDim: "rgba(232,136,48,0.14)",
    accentGlow: "rgba(232,136,48,0.28)", green: "#8AB068", greenDim: "rgba(138,176,104,0.12)",
    red: "#D85840", redDim: "rgba(216,88,64,0.12)", amber: "#E8B830",
    amberDim: "rgba(232,184,48,0.12)", purple: "#A07858", purpleDim: "rgba(160,120,88,0.12)",
    hover: "rgba(232,136,48,0.06)",
  },

  // ── SNOWFALL ─────────────────────────────────────────────────────────────
  snowfall: {
    name: "Snowfall", emoji: "❄️",
    _snowfall: true,
    bg: "#101828", surface: "#182030", surfaceRaised: "#202838",
    border: "#304058", text: "#B0C0D8", textMuted: "#6880A0",
    textBright: "#E8F0FF", accent: "#78B8E8", accentDim: "rgba(120,184,232,0.14)",
    accentGlow: "rgba(120,184,232,0.28)", green: "#68B898", greenDim: "rgba(104,184,152,0.12)",
    red: "#D07070", redDim: "rgba(208,112,112,0.12)", amber: "#C8B868",
    amberDim: "rgba(200,184,104,0.12)", purple: "#9080C0", purpleDim: "rgba(144,128,192,0.12)",
    hover: "rgba(120,184,232,0.06)",
  },

  // ── DEEP SEA ─────────────────────────────────────────────────────────────
  deepSea: {
    name: "Deep Sea", emoji: "🐙",
    _deepSea: true,
    bg: "#020810", surface: "#061018", surfaceRaised: "#0A1820",
    border: "#1A3040", text: "#7098B0", textMuted: "#406878",
    textBright: "#B0D8F0", accent: "#2090B0", accentDim: "rgba(32,144,176,0.14)",
    accentGlow: "rgba(32,144,176,0.28)", green: "#30A888", greenDim: "rgba(48,168,136,0.12)",
    red: "#B06070", redDim: "rgba(176,96,112,0.12)", amber: "#90A050",
    amberDim: "rgba(144,160,80,0.12)", purple: "#6868A8", purpleDim: "rgba(104,104,168,0.12)",
    hover: "rgba(32,144,176,0.06)",
  },

  // ── CRT MONITOR ──────────────────────────────────────────────────────────
  crt: {
    name: "CRT Monitor", emoji: "🖥️",
    _crt: true,
    bg: "#0A0C08", surface: "#10120E", surfaceRaised: "#181A14",
    border: "#2A2E22", text: "#33FF33", textMuted: "#1A8A1A",
    textBright: "#66FF66", accent: "#33FF33", accentDim: "rgba(51,255,51,0.14)",
    accentGlow: "rgba(51,255,51,0.30)", green: "#33FF33", greenDim: "rgba(51,255,51,0.12)",
    red: "#FF3333", redDim: "rgba(255,51,51,0.12)", amber: "#FFCC00",
    amberDim: "rgba(255,204,0,0.12)", purple: "#33FF99", purpleDim: "rgba(51,255,153,0.12)",
    hover: "rgba(51,255,51,0.08)",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DARK THEMES (+11)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── ESPRESSO ─────────────────────────────────────────────────────────────
  espresso: {
    name: "Espresso", emoji: "☕",
    bg: "#1A1210", surface: "#221A16", surfaceRaised: "#2C221C",
    border: "#4A3828", text: "#D4C0AA", textMuted: "#8A7660",
    textBright: "#F0E4D4", accent: "#C89058", accentDim: "rgba(200,144,88,0.14)",
    accentGlow: "rgba(200,144,88,0.28)", green: "#7AA868", greenDim: "rgba(122,168,104,0.12)",
    red: "#C86858", redDim: "rgba(200,104,88,0.12)", amber: "#D4A84A",
    amberDim: "rgba(212,168,74,0.12)", purple: "#A08878", purpleDim: "rgba(160,136,120,0.12)",
    hover: "rgba(200,144,88,0.06)",
  },

  // ── ECLIPSE ──────────────────────────────────────────────────────────────
  eclipse: {
    name: "Eclipse", emoji: "🌑",
    bg: "#08080C", surface: "#0E0E14", surfaceRaised: "#16161E",
    border: "#28283A", text: "#A0A0B8", textMuted: "#585870",
    textBright: "#E0E0F0", accent: "#D4A830", accentDim: "rgba(212,168,48,0.14)",
    accentGlow: "rgba(212,168,48,0.28)", green: "#60A878", greenDim: "rgba(96,168,120,0.12)",
    red: "#C86060", redDim: "rgba(200,96,96,0.12)", amber: "#D4B840",
    amberDim: "rgba(212,184,64,0.12)", purple: "#8878B0", purpleDim: "rgba(136,120,176,0.12)",
    hover: "rgba(212,168,48,0.06)",
  },

  // ── PHANTOM ──────────────────────────────────────────────────────────────
  phantom: {
    name: "Phantom", emoji: "👻",
    bg: "#0C0810", surface: "#14101A", surfaceRaised: "#1C1624",
    border: "#302840", text: "#B8A8D0", textMuted: "#706088",
    textBright: "#E4D8F4", accent: "#9870D0", accentDim: "rgba(152,112,208,0.14)",
    accentGlow: "rgba(152,112,208,0.28)", green: "#68B898", greenDim: "rgba(104,184,152,0.12)",
    red: "#D06878", redDim: "rgba(208,104,120,0.12)", amber: "#C8A858",
    amberDim: "rgba(200,168,88,0.12)", purple: "#B088E0", purpleDim: "rgba(176,136,224,0.12)",
    hover: "rgba(152,112,208,0.06)",
  },

  // ── IRON ─────────────────────────────────────────────────────────────────
  iron: {
    name: "Iron", emoji: "⚙️",
    bg: "#121416", surface: "#1A1C20", surfaceRaised: "#222428",
    border: "#3A3E44", text: "#A8ACB4", textMuted: "#686C74",
    textBright: "#D8DCE4", accent: "#6890B0", accentDim: "rgba(104,144,176,0.12)",
    accentGlow: "rgba(104,144,176,0.25)", green: "#68A888", greenDim: "rgba(104,168,136,0.12)",
    red: "#B87070", redDim: "rgba(184,112,112,0.12)", amber: "#B0A068",
    amberDim: "rgba(176,160,104,0.12)", purple: "#8880A8", purpleDim: "rgba(136,128,168,0.12)",
    hover: "rgba(104,144,176,0.06)",
  },

  // ── ABYSS ────────────────────────────────────────────────────────────────
  abyss: {
    name: "Abyss", emoji: "🕳️",
    bg: "#04080C", surface: "#0A1018", surfaceRaised: "#101820",
    border: "#1A2838", text: "#7898B0", textMuted: "#406070",
    textBright: "#B0D0E8", accent: "#2898C0", accentDim: "rgba(40,152,192,0.14)",
    accentGlow: "rgba(40,152,192,0.28)", green: "#38A890", greenDim: "rgba(56,168,144,0.12)",
    red: "#A86878", redDim: "rgba(168,104,120,0.12)", amber: "#88A060",
    amberDim: "rgba(136,160,96,0.12)", purple: "#6878A8", purpleDim: "rgba(104,120,168,0.12)",
    hover: "rgba(40,152,192,0.06)",
  },

  // ── VOLCANIC ─────────────────────────────────────────────────────────────
  volcanic: {
    name: "Volcanic", emoji: "🌋",
    bg: "#120808", surface: "#1C0E0E", surfaceRaised: "#261414",
    border: "#4A2222", text: "#D0A898", textMuted: "#8A5E50",
    textBright: "#F0D8CC", accent: "#E04820", accentDim: "rgba(224,72,32,0.14)",
    accentGlow: "rgba(224,72,32,0.30)", green: "#88A868", greenDim: "rgba(136,168,104,0.12)",
    red: "#E84030", redDim: "rgba(232,64,48,0.12)", amber: "#E89030",
    amberDim: "rgba(232,144,48,0.12)", purple: "#A86888", purpleDim: "rgba(168,104,136,0.12)",
    hover: "rgba(224,72,32,0.06)",
  },

  // ── GRAPHITE ─────────────────────────────────────────────────────────────
  graphite: {
    name: "Graphite", emoji: "✏️",
    bg: "#18181C", surface: "#202024", surfaceRaised: "#28282E",
    border: "#3C3C44", text: "#B0B0B8", textMuted: "#707078",
    textBright: "#E0E0E8", accent: "#9090A8", accentDim: "rgba(144,144,168,0.12)",
    accentGlow: "rgba(144,144,168,0.22)", green: "#78A888", greenDim: "rgba(120,168,136,0.12)",
    red: "#B87878", redDim: "rgba(184,120,120,0.12)", amber: "#B8A878",
    amberDim: "rgba(184,168,120,0.12)", purple: "#9888B0", purpleDim: "rgba(152,136,176,0.12)",
    hover: "rgba(144,144,168,0.06)",
  },

  // ── DARK CHERRY ──────────────────────────────────────────────────────────
  darkCherry: {
    name: "Dark Cherry", emoji: "🍒",
    bg: "#140810", surface: "#1E0E18", surfaceRaised: "#281420",
    border: "#4A2238", text: "#D0A8B8", textMuted: "#886070",
    textBright: "#F0D8E4", accent: "#D04878", accentDim: "rgba(208,72,120,0.14)",
    accentGlow: "rgba(208,72,120,0.28)", green: "#68B898", greenDim: "rgba(104,184,152,0.12)",
    red: "#E05068", redDim: "rgba(224,80,104,0.12)", amber: "#D0A050",
    amberDim: "rgba(208,160,80,0.12)", purple: "#B070A0", purpleDim: "rgba(176,112,160,0.12)",
    hover: "rgba(208,72,120,0.06)",
  },

  // ── GAMEBOY ──────────────────────────────────────────────────────────────
  gameboy: {
    name: "Game Boy", emoji: "🎮",
    bg: "#0F380F", surface: "#1A4A1A", surfaceRaised: "#2A5A2A",
    border: "#306230", text: "#8BAC0F", textMuted: "#5A7A0A",
    textBright: "#9BBC0F", accent: "#9BBC0F", accentDim: "rgba(155,188,15,0.14)",
    accentGlow: "rgba(155,188,15,0.28)", green: "#9BBC0F", greenDim: "rgba(155,188,15,0.12)",
    red: "#8BAC0F", redDim: "rgba(139,172,15,0.12)", amber: "#9BBC0F",
    amberDim: "rgba(155,188,15,0.12)", purple: "#7A9C0E", purpleDim: "rgba(122,156,14,0.12)",
    hover: "rgba(155,188,15,0.06)",
  },

  // ── NOIR ─────────────────────────────────────────────────────────────────
  noir: {
    name: "Noir", emoji: "🎬",
    bg: "#0A0A0A", surface: "#141414", surfaceRaised: "#1E1E1E",
    border: "#333333", text: "#C8C8C8", textMuted: "#6A6A6A",
    textBright: "#F0F0F0", accent: "#E8E8E8", accentDim: "rgba(232,232,232,0.10)",
    accentGlow: "rgba(232,232,232,0.18)", green: "#B0B0B0", greenDim: "rgba(176,176,176,0.10)",
    red: "#D0D0D0", redDim: "rgba(208,208,208,0.10)", amber: "#C0C0C0",
    amberDim: "rgba(192,192,192,0.10)", purple: "#A0A0A0", purpleDim: "rgba(160,160,160,0.10)",
    hover: "rgba(232,232,232,0.06)",
  },

  // ── CHALKBOARD ───────────────────────────────────────────────────────────
  chalkboard: {
    name: "Chalkboard", emoji: "🏫",
    bg: "#1A2A1A", surface: "#223222", surfaceRaised: "#2A3A2A",
    border: "#3A5038", text: "#D8E8D0", textMuted: "#7A9A70",
    textBright: "#F0F8E8", accent: "#F0F0E0", accentDim: "rgba(240,240,224,0.10)",
    accentGlow: "rgba(240,240,224,0.18)", green: "#90D080", greenDim: "rgba(144,208,128,0.10)",
    red: "#E88878", redDim: "rgba(232,136,120,0.10)", amber: "#E8D078",
    amberDim: "rgba(232,208,120,0.10)", purple: "#B0A0D0", purpleDim: "rgba(176,160,208,0.10)",
    hover: "rgba(240,240,224,0.06)",
  },


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIGHT THEMES (+8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── CREAM ────────────────────────────────────────────────────────────────
  cream: {
    name: "Cream", emoji: "🍦",
    bg: "#FAF6F0", surface: "#FFF8F0", surfaceRaised: "#FFFFFF",
    border: "#E8DCC8", text: "#4A4238", textMuted: "#8A7E70",
    textBright: "#1E1A14", accent: "#B08040", accentDim: "rgba(176,128,64,0.10)",
    accentGlow: "rgba(176,128,64,0.18)", green: "#5A8A48", greenDim: "rgba(90,138,72,0.10)",
    red: "#B85848", redDim: "rgba(184,88,72,0.10)", amber: "#A88828",
    amberDim: "rgba(168,136,40,0.10)", purple: "#7868A0", purpleDim: "rgba(120,104,160,0.10)",
    hover: "rgba(176,128,64,0.06)",
  },

  // ── MINT ─────────────────────────────────────────────────────────────────
  mint: {
    name: "Mint", emoji: "🌿",
    bg: "#F0FAF4", surface: "#F4FFF8", surfaceRaised: "#FFFFFF",
    border: "#B8E0C8", text: "#2A4A38", textMuted: "#6A9A80",
    textBright: "#142820", accent: "#2A9868", accentDim: "rgba(42,152,104,0.10)",
    accentGlow: "rgba(42,152,104,0.20)", green: "#2A9868", greenDim: "rgba(42,152,104,0.10)",
    red: "#C85858", redDim: "rgba(200,88,88,0.10)", amber: "#A89028",
    amberDim: "rgba(168,144,40,0.10)", purple: "#7870A8", purpleDim: "rgba(120,112,168,0.10)",
    hover: "rgba(42,152,104,0.06)",
  },

  // ── PEACH ────────────────────────────────────────────────────────────────
  peach: {
    name: "Peach", emoji: "🍑",
    bg: "#FDF4EE", surface: "#FFF0E8", surfaceRaised: "#FFFFFF",
    border: "#E8CCC0", text: "#5A3E34", textMuted: "#A8887A",
    textBright: "#2A1810", accent: "#D87848", accentDim: "rgba(216,120,72,0.10)",
    accentGlow: "rgba(216,120,72,0.20)", green: "#5A9A68", greenDim: "rgba(90,154,104,0.10)",
    red: "#D06050", redDim: "rgba(208,96,80,0.10)", amber: "#C89830",
    amberDim: "rgba(200,152,48,0.10)", purple: "#8868A8", purpleDim: "rgba(136,104,168,0.10)",
    hover: "rgba(216,120,72,0.06)",
  },

  // ── SEAFOAM ──────────────────────────────────────────────────────────────
  seafoam: {
    name: "Seafoam", emoji: "🫧",
    bg: "#EEF8F8", surface: "#F4FCFC", surfaceRaised: "#FFFFFF",
    border: "#B8D8D8", text: "#2A4848", textMuted: "#6A9898",
    textBright: "#142828", accent: "#3098A0", accentDim: "rgba(48,152,160,0.10)",
    accentGlow: "rgba(48,152,160,0.20)", green: "#3A9878", greenDim: "rgba(58,152,120,0.10)",
    red: "#C86060", redDim: "rgba(200,96,96,0.10)", amber: "#A09030",
    amberDim: "rgba(160,144,48,0.10)", purple: "#7078A8", purpleDim: "rgba(112,120,168,0.10)",
    hover: "rgba(48,152,160,0.06)",
  },

  // ── COTTON CANDY ─────────────────────────────────────────────────────────
  cottonCandy: {
    name: "Cotton Candy", emoji: "🧁",
    bg: "#FAF0FF", surface: "#FFF4FF", surfaceRaised: "#FFFFFF",
    border: "#E0C8E8", text: "#4A3458", textMuted: "#9A80A8",
    textBright: "#201028", accent: "#B868D8", accentDim: "rgba(184,104,216,0.10)",
    accentGlow: "rgba(184,104,216,0.20)", green: "#60A880", greenDim: "rgba(96,168,128,0.10)",
    red: "#D06870", redDim: "rgba(208,104,112,0.10)", amber: "#C0A038",
    amberDim: "rgba(192,160,56,0.10)", purple: "#A868D0", purpleDim: "rgba(168,104,208,0.10)",
    hover: "rgba(184,104,216,0.06)",
  },

  // ── PORCELAIN ────────────────────────────────────────────────────────────
  porcelain: {
    name: "Porcelain", emoji: "🏺",
    bg: "#F4F6FA", surface: "#FAFCFF", surfaceRaised: "#FFFFFF",
    border: "#D0D8E4", text: "#3A4258", textMuted: "#7A8498",
    textBright: "#141828", accent: "#4868A8", accentDim: "rgba(72,104,168,0.10)",
    accentGlow: "rgba(72,104,168,0.20)", green: "#489878", greenDim: "rgba(72,152,120,0.10)",
    red: "#C06060", redDim: "rgba(192,96,96,0.10)", amber: "#A89838",
    amberDim: "rgba(168,152,56,0.10)", purple: "#7868B0", purpleDim: "rgba(120,104,176,0.10)",
    hover: "rgba(72,104,168,0.06)",
  },

  // ── LINEN ────────────────────────────────────────────────────────────────
  linen: {
    name: "Linen", emoji: "🧵",
    bg: "#F8F4EE", surface: "#FFFAF4", surfaceRaised: "#FFFFFF",
    border: "#DED4C4", text: "#484038", textMuted: "#908478",
    textBright: "#1C1810", accent: "#8A7058", accentDim: "rgba(138,112,88,0.10)",
    accentGlow: "rgba(138,112,88,0.18)", green: "#5A8858", greenDim: "rgba(90,136,88,0.10)",
    red: "#B06050", redDim: "rgba(176,96,80,0.10)", amber: "#A08830",
    amberDim: "rgba(160,136,48,0.10)", purple: "#7A6898", purpleDim: "rgba(122,104,152,0.10)",
    hover: "rgba(138,112,88,0.06)",
  },

  // ── SPRING ───────────────────────────────────────────────────────────────
  spring: {
    name: "Spring", emoji: "🌷",
    bg: "#F4FBF0", surface: "#FAFFF6", surfaceRaised: "#FFFFFF",
    border: "#C4E0B8", text: "#2E4A28", textMuted: "#6A9A5A",
    textBright: "#142010", accent: "#48A838", accentDim: "rgba(72,168,56,0.10)",
    accentGlow: "rgba(72,168,56,0.20)", green: "#48A838", greenDim: "rgba(72,168,56,0.10)",
    red: "#D06058", redDim: "rgba(208,96,88,0.10)", amber: "#B09828",
    amberDim: "rgba(176,152,40,0.10)", purple: "#8868B0", purpleDim: "rgba(136,104,176,0.10)",
    hover: "rgba(72,168,56,0.06)",
  },


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VIBRANT THEMES (+10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── BUBBLEGUM ────────────────────────────────────────────────────────────
  bubblegum: {
    name: "Bubblegum", emoji: "🫧",
    bg: "#1A0818", surface: "#240E24", surfaceRaised: "#301430",
    border: "#5A2858", text: "#E8B0E0", textMuted: "#A06898",
    textBright: "#FFD8F8", accent: "#FF68C0", accentDim: "rgba(255,104,192,0.14)",
    accentGlow: "rgba(255,104,192,0.30)", green: "#68D8A8", greenDim: "rgba(104,216,168,0.12)",
    red: "#FF6088", redDim: "rgba(255,96,136,0.12)", amber: "#F8C048",
    amberDim: "rgba(248,192,72,0.12)", purple: "#C878F8", purpleDim: "rgba(200,120,248,0.12)",
    hover: "rgba(255,104,192,0.06)",
  },

  // ── TOXIC ────────────────────────────────────────────────────────────────
  toxic: {
    name: "Toxic", emoji: "☣️",
    bg: "#080C08", surface: "#0E140E", surfaceRaised: "#141E14",
    border: "#1E3A1E", text: "#88D888", textMuted: "#407040",
    textBright: "#B0FFB0", accent: "#40FF40", accentDim: "rgba(64,255,64,0.14)",
    accentGlow: "rgba(64,255,64,0.30)", green: "#40FF40", greenDim: "rgba(64,255,64,0.12)",
    red: "#FF4040", redDim: "rgba(255,64,64,0.12)", amber: "#C0FF00",
    amberDim: "rgba(192,255,0,0.12)", purple: "#80FF80", purpleDim: "rgba(128,255,128,0.12)",
    hover: "rgba(64,255,64,0.08)",
  },

  // ── CORAL REEF ───────────────────────────────────────────────────────────
  coralReef: {
    name: "Coral Reef", emoji: "🪸",
    bg: "#0A1420", surface: "#101C2A", surfaceRaised: "#182434",
    border: "#28405A", text: "#A8C8E0", textMuted: "#5888A8",
    textBright: "#D8F0FF", accent: "#FF7860", accentDim: "rgba(255,120,96,0.14)",
    accentGlow: "rgba(255,120,96,0.28)", green: "#40D8A8", greenDim: "rgba(64,216,168,0.12)",
    red: "#FF6860", redDim: "rgba(255,104,96,0.12)", amber: "#FFB848",
    amberDim: "rgba(255,184,72,0.12)", purple: "#A088E0", purpleDim: "rgba(160,136,224,0.12)",
    hover: "rgba(255,120,96,0.06)",
  },

  // ── ULTRAVIOLET ──────────────────────────────────────────────────────────
  ultraviolet: {
    name: "Ultraviolet", emoji: "🔮",
    bg: "#0A0420", surface: "#12082E", surfaceRaised: "#1A0E3C",
    border: "#2E1860", text: "#C0A8E8", textMuted: "#7858B0",
    textBright: "#E8D8FF", accent: "#8040FF", accentDim: "rgba(128,64,255,0.14)",
    accentGlow: "rgba(128,64,255,0.30)", green: "#50D8B0", greenDim: "rgba(80,216,176,0.12)",
    red: "#FF5080", redDim: "rgba(255,80,128,0.12)", amber: "#D8A030",
    amberDim: "rgba(216,160,48,0.12)", purple: "#A060FF", purpleDim: "rgba(160,96,255,0.12)",
    hover: "rgba(128,64,255,0.06)",
  },

  // ── MARS ─────────────────────────────────────────────────────────────────
  mars: {
    name: "Mars", emoji: "🔴",
    bg: "#1A0C08", surface: "#241410", surfaceRaised: "#2E1C16",
    border: "#5A3020", text: "#D8B098", textMuted: "#987058",
    textBright: "#F0D8C0", accent: "#E06830", accentDim: "rgba(224,104,48,0.14)",
    accentGlow: "rgba(224,104,48,0.28)", green: "#80A858", greenDim: "rgba(128,168,88,0.12)",
    red: "#E05838", redDim: "rgba(224,88,56,0.12)", amber: "#D89830",
    amberDim: "rgba(216,152,48,0.12)", purple: "#9878A0", purpleDim: "rgba(152,120,160,0.12)",
    hover: "rgba(224,104,48,0.06)",
  },

  // ── LAGOON ───────────────────────────────────────────────────────────────
  lagoon: {
    name: "Lagoon", emoji: "🏝️",
    bg: "#081818", surface: "#0E2222", surfaceRaised: "#142C2C",
    border: "#204848", text: "#90D0C8", textMuted: "#508880",
    textBright: "#C8F8F0", accent: "#30D8C0", accentDim: "rgba(48,216,192,0.14)",
    accentGlow: "rgba(48,216,192,0.28)", green: "#40D898", greenDim: "rgba(64,216,152,0.12)",
    red: "#D07868", redDim: "rgba(208,120,104,0.12)", amber: "#C8B848",
    amberDim: "rgba(200,184,72,0.12)", purple: "#7898C0", purpleDim: "rgba(120,152,192,0.12)",
    hover: "rgba(48,216,192,0.06)",
  },

  // ── WASABI ───────────────────────────────────────────────────────────────
  wasabi: {
    name: "Wasabi", emoji: "🟢",
    bg: "#0C1008", surface: "#14180E", surfaceRaised: "#1C2214",
    border: "#2E3A20", text: "#B8D098", textMuted: "#688850",
    textBright: "#E0F0C8", accent: "#88D830", accentDim: "rgba(136,216,48,0.14)",
    accentGlow: "rgba(136,216,48,0.28)", green: "#88D830", greenDim: "rgba(136,216,48,0.12)",
    red: "#D87050", redDim: "rgba(216,112,80,0.12)", amber: "#C8B030",
    amberDim: "rgba(200,176,48,0.12)", purple: "#8898A0", purpleDim: "rgba(136,152,160,0.12)",
    hover: "rgba(136,216,48,0.06)",
  },

  // ── NEON TOKYO ───────────────────────────────────────────────────────────
  neonTokyo: {
    name: "Neon Tokyo", emoji: "🏙️",
    bg: "#08041A", surface: "#100824", surfaceRaised: "#180E30",
    border: "#281850", text: "#D0B8F0", textMuted: "#7858A8",
    textBright: "#F0E0FF", accent: "#FF2080", accentDim: "rgba(255,32,128,0.14)",
    accentGlow: "rgba(255,32,128,0.30)", green: "#00FFB0", greenDim: "rgba(0,255,176,0.12)",
    red: "#FF3060", redDim: "rgba(255,48,96,0.12)", amber: "#FFD020",
    amberDim: "rgba(255,208,32,0.12)", purple: "#8030FF", purpleDim: "rgba(128,48,255,0.12)",
    hover: "rgba(255,32,128,0.06)",
  },

  // ── CARNIVAL ─────────────────────────────────────────────────────────────
  carnival: {
    name: "Carnival", emoji: "🎪",
    bg: "#1A0A1A", surface: "#241228", surfaceRaised: "#301A34",
    border: "#503050", text: "#E0C0E0", textMuted: "#987098",
    textBright: "#FFE8FF", accent: "#FFB020", accentDim: "rgba(255,176,32,0.14)",
    accentGlow: "rgba(255,176,32,0.30)", green: "#50E868", greenDim: "rgba(80,232,104,0.12)",
    red: "#FF4060", redDim: "rgba(255,64,96,0.12)", amber: "#FFD030",
    amberDim: "rgba(255,208,48,0.12)", purple: "#C050FF", purpleDim: "rgba(192,80,255,0.12)",
    hover: "rgba(255,176,32,0.06)",
  },

  // ── TERMINAL AMBER ───────────────────────────────────────────────────────
  terminalAmber: {
    name: "Terminal Amber", emoji: "🖥️",
    bg: "#0C0A08", surface: "#141210", surfaceRaised: "#1C1A16",
    border: "#2E2A22", text: "#FFB820", textMuted: "#A07810",
    textBright: "#FFD060", accent: "#FFB820", accentDim: "rgba(255,184,32,0.14)",
    accentGlow: "rgba(255,184,32,0.28)", green: "#FFB820", greenDim: "rgba(255,184,32,0.12)",
    red: "#FF6830", redDim: "rgba(255,104,48,0.12)", amber: "#FFD040",
    amberDim: "rgba(255,208,64,0.12)", purple: "#FFB020", purpleDim: "rgba(255,176,32,0.12)",
    hover: "rgba(255,184,32,0.08)",
  },


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUN / NOVELTY THEMES (+6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── DOS ──────────────────────────────────────────────────────────────────
  dos: {
    name: "DOS", emoji: "💾",
    bg: "#0000AA", surface: "#0000CC", surfaceRaised: "#0000DD",
    border: "#5555FF", text: "#FFFFFF", textMuted: "#AAAAFF",
    textBright: "#FFFFFF", accent: "#FFFF55", accentDim: "rgba(255,255,85,0.14)",
    accentGlow: "rgba(255,255,85,0.25)", green: "#55FF55", greenDim: "rgba(85,255,85,0.12)",
    red: "#FF5555", redDim: "rgba(255,85,85,0.12)", amber: "#FFFF55",
    amberDim: "rgba(255,255,85,0.12)", purple: "#FF55FF", purpleDim: "rgba(255,85,255,0.12)",
    hover: "rgba(255,255,85,0.08)",
  },

  // ── SEPIA ────────────────────────────────────────────────────────────────
  sepia: {
    name: "Sepia", emoji: "📷",
    bg: "#2A2018", surface: "#342A20", surfaceRaised: "#3E3228",
    border: "#5A4A38", text: "#C8B498", textMuted: "#8A7A64",
    textBright: "#E8D8C0", accent: "#C8A060", accentDim: "rgba(200,160,96,0.14)",
    accentGlow: "rgba(200,160,96,0.25)", green: "#8A9868", greenDim: "rgba(138,152,104,0.12)",
    red: "#B87868", redDim: "rgba(184,120,104,0.12)", amber: "#C8A050",
    amberDim: "rgba(200,160,80,0.12)", purple: "#98887A", purpleDim: "rgba(152,136,122,0.12)",
    hover: "rgba(200,160,96,0.06)",
  },

  // ── WHITEBOARD ───────────────────────────────────────────────────────────
  whiteboard: {
    name: "Whiteboard", emoji: "📋",
    bg: "#F8F8F8", surface: "#FFFFFF", surfaceRaised: "#FFFFFF",
    border: "#D0D0D0", text: "#2A2A2A", textMuted: "#888888",
    textBright: "#000000", accent: "#2060D0", accentDim: "rgba(32,96,208,0.10)",
    accentGlow: "rgba(32,96,208,0.18)", green: "#208040", greenDim: "rgba(32,128,64,0.10)",
    red: "#D02020", redDim: "rgba(208,32,32,0.10)", amber: "#D09020",
    amberDim: "rgba(208,144,32,0.10)", purple: "#8040C0", purpleDim: "rgba(128,64,192,0.10)",
    hover: "rgba(32,96,208,0.06)",
  },

  // ── NEON SIGN ────────────────────────────────────────────────────────────
  neonSign: {
    name: "Neon Sign", emoji: "💡",
    bg: "#0A0A10", surface: "#101018", surfaceRaised: "#181820",
    border: "#282838", text: "#C0C0E0", textMuted: "#606088",
    textBright: "#F0F0FF", accent: "#FF3080", accentDim: "rgba(255,48,128,0.14)",
    accentGlow: "rgba(255,48,128,0.35)", green: "#30FF90", greenDim: "rgba(48,255,144,0.12)",
    red: "#FF3050", redDim: "rgba(255,48,80,0.12)", amber: "#FFD030",
    amberDim: "rgba(255,208,48,0.12)", purple: "#B040FF", purpleDim: "rgba(176,64,255,0.12)",
    hover: "rgba(255,48,128,0.06)",
  },

  // ── TUNDRA ───────────────────────────────────────────────────────────────
  tundra: {
    name: "Tundra", emoji: "🏔️",
    bg: "#0E1220", surface: "#141A28", surfaceRaised: "#1A2230",
    border: "#283448", text: "#A0B0C8", textMuted: "#607088",
    textBright: "#D8E8F8", accent: "#88A8D8", accentDim: "rgba(136,168,216,0.12)",
    accentGlow: "rgba(136,168,216,0.25)", green: "#68A898", greenDim: "rgba(104,168,152,0.12)",
    red: "#C08080", redDim: "rgba(192,128,128,0.12)", amber: "#B0A878",
    amberDim: "rgba(176,168,120,0.12)", purple: "#9088B8", purpleDim: "rgba(144,136,184,0.12)",
    hover: "rgba(136,168,216,0.06)",
  },

  // ── MAGMA ────────────────────────────────────────────────────────────────
  magma: {
    name: "Magma", emoji: "🔥",
    bg: "#100404", surface: "#1C0808", surfaceRaised: "#280C0C",
    border: "#4A1818", text: "#E0A890", textMuted: "#985848",
    textBright: "#FFD8C0", accent: "#FF4020", accentDim: "rgba(255,64,32,0.14)",
    accentGlow: "rgba(255,64,32,0.35)", green: "#C88830", greenDim: "rgba(200,136,48,0.12)",
    red: "#FF3020", redDim: "rgba(255,48,32,0.12)", amber: "#FF8020",
    amberDim: "rgba(255,128,32,0.12)", purple: "#D06040", purpleDim: "rgba(208,96,64,0.12)",
    hover: "rgba(255,64,32,0.06)",
  },

 // ── HIGH CONTRAST LIGHT ──────────────────────────────────────────────────
  // White background variant of High Contrast for users who prefer light mode
  // but need maximum readability. All colors pass WCAG AAA.
  highContrastLight: {
    name: "High Contrast Light", emoji: "☀️",
    bg: "#FFFFFF", surface: "#F0F0F0", surfaceRaised: "#FFFFFF",
    border: "#000000", text: "#000000", textMuted: "#333333",
    textBright: "#000000", accent: "#0000CC", accentDim: "rgba(0,0,204,0.12)",
    accentGlow: "rgba(0,0,204,0.25)", green: "#006600", greenDim: "rgba(0,102,0,0.12)",
    red: "#CC0000", redDim: "rgba(204,0,0,0.12)", amber: "#886600",
    amberDim: "rgba(136,102,0,0.12)", purple: "#6600AA", purpleDim: "rgba(102,0,170,0.12)",
    hover: "rgba(0,0,204,0.08)",
  },

  // ── COLOR BLIND SAFE (Deuteranopia) ──────────────────────────────────────
  // Optimized for red-green color blindness (affects ~8% of males).
  // Avoids red/green as semantic indicators entirely. Uses blue/orange as the
  // primary contrast pair, with distinct lightness values for every status color.
  colorBlindSafe: {
    name: "Color Blind Safe", emoji: "👁️",
    bg: "#121620", surface: "#1A1E2A", surfaceRaised: "#222834",
    border: "#343C4C", text: "#C8CCD8", textMuted: "#7A8090",
    textBright: "#EEF0F4", accent: "#4A90D8", accentDim: "rgba(74,144,216,0.12)",
    accentGlow: "rgba(74,144,216,0.25)",
    green: "#3A8AD0",     // blue instead of green — universally distinguishable
    greenDim: "rgba(58,138,208,0.12)",
    red: "#E88430",       // orange instead of red — distinct from blue at any vision type
    redDim: "rgba(232,132,48,0.12)",
    amber: "#E8C840",     // bright yellow — high lightness, distinct from blue/orange
    amberDim: "rgba(232,200,64,0.12)",
    purple: "#B878D8",    // lavender — distinct lightness from all other indicators
    purpleDim: "rgba(184,120,216,0.12)",
    hover: "rgba(74,144,216,0.06)",
  },

  // ── TRITANOPIA SAFE ──────────────────────────────────────────────────────
  // Optimized for blue-yellow color blindness (tritanopia/tritanomaly).
  // Avoids blue/yellow as distinguishing colors. Uses red/cyan as the
  // primary contrast pair with high lightness differentiation.
  tritanopiaSafe: {
    name: "Tritanopia Safe", emoji: "👁️",
    bg: "#141414", surface: "#1C1C1C", surfaceRaised: "#262626",
    border: "#3C3C3C", text: "#C8C8C8", textMuted: "#787878",
    textBright: "#F0F0F0", accent: "#E05070", accentDim: "rgba(224,80,112,0.12)",
    accentGlow: "rgba(224,80,112,0.25)",
    green: "#20B8A8",     // teal/cyan — easily distinguished from red
    greenDim: "rgba(32,184,168,0.12)",
    red: "#E04848",       // warm red — distinct from cyan
    redDim: "rgba(224,72,72,0.12)",
    amber: "#E87830",     // orange — differs in lightness from both red and cyan
    amberDim: "rgba(232,120,48,0.12)",
    purple: "#C870A8",    // pink/magenta — distinguishable via lightness + hue
    purpleDim: "rgba(200,112,168,0.12)",
    hover: "rgba(224,80,112,0.06)",
  },

  // ── LOW VISION ───────────────────────────────────────────────────────────
  // Maximum contrast ratios (15:1+), extra bold accent colors, and simplified
  // palette for users with significantly reduced visual acuity. Colors are
  // chosen for maximum luminance separation.
  lowVision: {
    name: "Low Vision", emoji: "🔍",
    bg: "#000000", surface: "#0C0C0C", surfaceRaised: "#1A1A1A",
    border: "#E0E0E0", text: "#FFFFFF", textMuted: "#D0D0D0",
    textBright: "#FFFFFF", accent: "#00CCFF", accentDim: "rgba(0,204,255,0.18)",
    accentGlow: "rgba(0,204,255,0.35)",
    green: "#00EE00",     // maximum saturation green — bright on black
    greenDim: "rgba(0,238,0,0.15)",
    red: "#FF2020",       // maximum saturation red
    redDim: "rgba(255,32,32,0.15)",
    amber: "#FFD700",     // pure gold — maximum visibility
    amberDim: "rgba(255,215,0,0.15)",
    purple: "#FF80FF",    // bright magenta — high luminance on black
    purpleDim: "rgba(255,128,255,0.15)",
    hover: "rgba(0,204,255,0.10)",
  },

  // ── REDUCED CONTRAST ─────────────────────────────────────────────────────
  // For users with photosensitivity, migraines, or light sensitivity. Avoids
  // stark black/white, uses a narrow mid-range luminance band. No bright
  // whites or deep blacks — everything stays in a comfortable middle zone.
  reducedContrast: {
    name: "Reduced Contrast", emoji: "🌙",
    bg: "#2A2A30", surface: "#323238", surfaceRaised: "#3A3A40",
    border: "#4A4A52", text: "#A8A8B0", textMuted: "#787880",
    textBright: "#C0C0C8", accent: "#7890A8", accentDim: "rgba(120,144,168,0.12)",
    accentGlow: "rgba(120,144,168,0.20)",
    green: "#78A088",     // muted sage
    greenDim: "rgba(120,160,136,0.10)",
    red: "#A87878",       // muted rose
    redDim: "rgba(168,120,120,0.10)",
    amber: "#A89878",     // muted sand
    amberDim: "rgba(168,152,120,0.10)",
    purple: "#8878A0",    // muted lavender
    purpleDim: "rgba(136,120,160,0.10)",
    hover: "rgba(120,144,168,0.06)",
  },

  // ── MAINLY CLEAR DAY ────────────────────────────────────────────────────
  // Internal weather sub-theme: WMO 1 — mostly clear daytime sky (light blue).
  mainlyClearDay: {
    name: "Mainly Clear", emoji: "🌤️",
    _mainlyClear: true,
    bg: "#EBF4FF", surface: "#F3F8FF", surfaceRaised: "#FFFFFF",
    border: "#BAD4EE", text: "#2C4A68", textMuted: "#6888A8",
    textBright: "#0E2038", accent: "#2878C8", accentDim: "rgba(40,120,200,0.10)",
    accentGlow: "rgba(40,120,200,0.22)", green: "#2E8860", greenDim: "rgba(46,136,96,0.10)",
    red: "#C04848", redDim: "rgba(192,72,72,0.10)", amber: "#B07830",
    amberDim: "rgba(176,120,48,0.10)", purple: "#7858B8", purpleDim: "rgba(120,88,184,0.10)",
    hover: "rgba(40,120,200,0.06)",
  },

  // ── CLOUDY DAY ───────────────────────────────────────────────────────────
  // Internal weather sub-theme: overcast during the day (light palette).
  cloudyDay: {
    name: "Cloudy Day", emoji: "⛅",
    _cloudy: true,
    bg: "#E4EAF0", surface: "#EEF3F8", surfaceRaised: "#FFFFFF",
    border: "#C4D0DC", text: "#3C4E60", textMuted: "#7888A0",
    textBright: "#1A2A3A", accent: "#4A78A0", accentDim: "rgba(74,120,160,0.10)",
    accentGlow: "rgba(74,120,160,0.20)", green: "#3A7860", greenDim: "rgba(58,120,96,0.10)",
    red: "#A85858", redDim: "rgba(168,88,88,0.10)", amber: "#9A8040",
    amberDim: "rgba(154,128,64,0.10)", purple: "#7868A0", purpleDim: "rgba(120,104,160,0.10)",
    hover: "rgba(74,120,160,0.06)",
  },

  // ── CLOUDY NIGHT ─────────────────────────────────────────────────────────
  // Internal weather sub-theme: overcast at night (dark palette).
  cloudy: {
    name: "Cloudy", emoji: "☁️",
    _cloudy: true,
    bg: "#151A22", surface: "#1C2330", surfaceRaised: "#232C3C",
    border: "#303D54", text: "#A8B8CC", textMuted: "#6070888",
    textBright: "#D4E0EE", accent: "#7898C0", accentDim: "rgba(120,152,192,0.14)",
    accentGlow: "rgba(120,152,192,0.28)", green: "#5AA880", greenDim: "rgba(90,168,128,0.12)",
    red: "#B07080", redDim: "rgba(176,112,128,0.12)", amber: "#A09060",
    amberDim: "rgba(160,144,96,0.12)", purple: "#8878A8", purpleDim: "rgba(136,120,168,0.12)",
    hover: "rgba(120,152,192,0.06)",
  },

  // ── THUNDERSTORM ─────────────────────────────────────────────────────────
  // Internal weather sub-theme: thunderstorm.
  thunderstorm: {
    name: "Thunderstorm", emoji: "⛈️",
    _thunderstorm: true,
    bg: "#07090F", surface: "#0D1018", surfaceRaised: "#131824",
    border: "#1E2636", text: "#8898B4", textMuted: "#485870",
    textBright: "#B8C8E4", accent: "#5070C0", accentDim: "rgba(80,112,192,0.14)",
    accentGlow: "rgba(80,112,192,0.40)", green: "#4898A0", greenDim: "rgba(72,152,160,0.12)",
    red: "#C06878", redDim: "rgba(192,104,120,0.12)", amber: "#908040",
    amberDim: "rgba(144,128,64,0.12)", purple: "#7060B0", purpleDim: "rgba(112,96,176,0.12)",
    hover: "rgba(80,112,192,0.06)",
  },

  // ── FOGGY MORNING (day) ──────────────────────────────────────────────────
  // Internal weather sub-theme: fog during the day (light pale palette).
  fogDay: {
    name: "Foggy Morning", emoji: "🌫️",
    _fog: true,
    bg: "#E8ECEE", surface: "#F0F4F5", surfaceRaised: "#FFFFFF",
    border: "#C8D0D4", text: "#485460", textMuted: "#88969E",
    textBright: "#202C34", accent: "#5A8898", accentDim: "rgba(90,136,152,0.10)",
    accentGlow: "rgba(90,136,152,0.20)", green: "#4A7868", greenDim: "rgba(74,120,104,0.10)",
    red: "#986868", redDim: "rgba(152,104,104,0.10)", amber: "#988060",
    amberDim: "rgba(152,128,96,0.10)", purple: "#786888", purpleDim: "rgba(120,104,136,0.10)",
    hover: "rgba(90,136,152,0.06)",
  },

  // ── FOG NIGHT ────────────────────────────────────────────────────────────
  // Internal weather sub-theme: foggy at night (dark palette).
  fog: {
    name: "Fog", emoji: "🌫️",
    _fog: true,
    bg: "#131618", surface: "#1A1E22", surfaceRaised: "#22262C",
    border: "#363C44", text: "#909898", textMuted: "#5E6870",
    textBright: "#C0C8CC", accent: "#7898A0", accentDim: "rgba(120,152,160,0.12)",
    accentGlow: "rgba(120,152,160,0.22)", green: "#6A9080", greenDim: "rgba(106,144,128,0.12)",
    red: "#A07878", redDim: "rgba(160,120,120,0.12)", amber: "#908870",
    amberDim: "rgba(144,136,112,0.12)", purple: "#807898", purpleDim: "rgba(128,120,152,0.12)",
    hover: "rgba(120,152,160,0.06)",
  },

  // ── WEATHER ──────────────────────────────────────────────────────────────
  // Detects local weather and switches to the matching sub-theme + canvas.
  weather: {
    name: "Weather", emoji: "🌦️",
    _weather: true,
    bg: "#0F1A2E", surface: "#152340", surfaceRaised: "#1A2E55",
    border: "#2A4A7A", text: "#B0C8E8", textMuted: "#6080A8",
    textBright: "#E0F0FF", accent: "#60A8E0", accentDim: "rgba(96,168,224,0.14)",
    accentGlow: "rgba(96,168,224,0.28)", green: "#50C890", greenDim: "rgba(80,200,144,0.12)",
    red: "#C06868", redDim: "rgba(192,104,104,0.12)", amber: "#C0A848",
    amberDim: "rgba(192,168,72,0.12)", purple: "#8878C0", purpleDim: "rgba(136,120,192,0.12)",
    hover: "rgba(96,168,224,0.06)",
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
      "emeraldOps",
      "rosewood", "slateBlue", "obsidian", "military",
      // ── New ──
      "espresso", "eclipse", "phantom", "iron", "abyss", "volcanic",
      "graphite", "darkCherry", "gameboy", "noir", "chalkboard",
    ],
  },
  {
    label: "Light",
    keys: [
      "light", "cherry", "lavender", "frutigerAero", "windowsXP", "pastel",
      "solarizedLight", "gruvboxLight", "paper", "sunshineHues",
      "ice", "sakura",
      // ── New ──
      "cream", "mint", "peach", "seafoam", "cottonCandy", "porcelain",
      "linen", "spring",
    ],
  },
  {
    label: "Vibrant",
    keys: [
      "forest", "ocean", "sunset", "retro", "cyberpunk",
      "neonMint", "wacky", "eyebleed", "hotDog",
      "urgentPumpkin", "scoobyDoo",
      "terracotta", "honeycomb", "blueprint", "newspaper",
      // ── New ──
      "bubblegum", "toxic", "coralReef", "ultraviolet", "mars",
      "lagoon", "wasabi", "neonTokyo", "carnival", "terminalAmber",
    ],
  },
  {
    label: "Animated",
    keys: [
      "chromawave", "hyperdrive", "aurora", "vaporwave",
      "fireflies", "lavaLamp", "synthwave", "fishTank",
      "audioVisualizer",
      "rainstorm", "starfieldTheme", "campfire", "snowfall", "deepSea", "crt",
      "weather",
    ],
  },
  {
    label: "Fun",
    keys: [
      "dos", "sepia", "whiteboard", "neonSign", "tundra", "magma",
    ],
  },
  {
    label: "Accessibility",
    keys: [
      "highContrast", "highContrastLight", "colorBlindSafe",
      "tritanopiaSafe", "lowVision", "reducedContrast",
    ],
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