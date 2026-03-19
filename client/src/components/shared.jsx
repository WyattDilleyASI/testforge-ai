import { useState } from "react";
import { useTheme, font, mono, DRAFT_DISCLAIMER } from "../theme";

export const Badge = ({ color = "accent", children, style }) => {
  const T = useTheme();
  const c = T[color] || color;
  const dim = T[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

export const Button = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const T = useTheme();
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = { primary: { ...base, background: T.accent, color: T.bg }, secondary: { ...base, background: T.surfaceRaised, color: T.text, border: `1px solid ${T.border}` }, danger: { ...base, background: T.redDim, color: T.red, border: `1px solid ${T.red}33` }, ghost: { ...base, background: "transparent", color: T.textMuted } };
  return <button style={{ ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

export const Card = ({ children, style, glow, ...rest }) => {
  const T = useTheme();
  const isAeroTheme = T._aero || false;

  return (
    <div
      style={{
        background: isAeroTheme
          ? "rgba(255, 255, 255, 0.55)"
          : T.surfaceRaised,
        border: `1px solid ${glow ? T.accent + "44" : T.border}`,
        borderRadius: 10,
        padding: 20,
        boxShadow: glow
          ? `0 0 20px ${T.accentGlow}`
          : isAeroTheme
            ? "0 4px 24px rgba(0, 80, 140, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
            : "0 2px 8px rgba(0,0,0,0.3)",
        ...(isAeroTheme ? {
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

export const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none", opacity: disabled ? 0.5 : 1 }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
  </div>;
};

export const PasswordInput = ({ label, value, onChange, placeholder, style, onKeyDown }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} style={{ fontFamily: font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none" }} />
  </div>;
};

export const Select = ({ label, value, onChange, options, style, disabled }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ fontFamily: font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>;
};

export const ReqIdTag = ({ id }) => { const T = useTheme(); return <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 4, border: `1px solid ${T.accent}33` }}>{id}</span>; };

export const Spinner = () => { const T = useTheme(); return <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.accent }}><div style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 13, fontFamily: mono }}>Generating drafts via Claude API...</span><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>; };

export const EmptyState = ({ icon, title, subtitle }) => { const T = useTheme(); return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: T.textMuted, textAlign: "center" }}><span style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</span><span style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 4 }}>{title}</span><span style={{ fontSize: 13 }}>{subtitle}</span></div>; };

export const DraftDisclaimer = ({ style }) => { const T = useTheme(); return <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", borderRadius: 6, border: `1px solid ${T.amber}33`, fontSize: 11, color: T.amber, lineHeight: 1.5, ...style }}><span style={{ fontFamily: mono, fontWeight: 700, marginRight: 6, fontSize: 10, textTransform: "uppercase" }}>TC-003a DRAFT</span>{DRAFT_DISCLAIMER}</div>; };

export const ErrorBanner = ({ msg }) => { const T = useTheme(); return msg ? <div style={{ marginBottom: 16, padding: "8px 12px", background: T.redDim, borderRadius: 6, border: `1px solid ${T.red}33`, fontSize: 12, color: T.red }}>{msg}</div> : null; };
