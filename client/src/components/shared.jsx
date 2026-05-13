import { useEffect, useRef, useState } from "react";
import { useTheme, font, mono, DRAFT_DISCLAIMER } from "../theme";
import { api } from "../api";

// ── RESPONSIVE BREAKPOINT HOOK ───────────────────────────────────────────────
// Returns true when the viewport is narrower than the given pixel width.
// Default breakpoint is 768px (tablet/mobile boundary).
export const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
};

// ── MOBILE GATE ──────────────────────────────────────────────────────────────
// Full-page placeholder shown on mobile for views that require a desktop.
// icon: large character/emoji shown at top
// title: view name
// description: one-sentence explanation
// copyUrl: if true, shows a "Copy link" button so the user can open on desktop
export const MobileGate = ({ icon = "◈", title, description, copyUrl = true }) => {
  const T = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "40px 24px", textAlign: "center", fontFamily: font,
    }}>
      <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.4, color: T.accent }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.textBright, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, maxWidth: 280, marginBottom: 28 }}>
        {description || "This view is designed for a larger screen and works best on a desktop or tablet."}
      </div>
      {copyUrl && (
        <button
          onClick={handleCopy}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 8, cursor: "pointer",
            background: T.accentDim, border: `1px solid ${T.accent}44`,
            color: T.accent, fontFamily: font, fontSize: 13, fontWeight: 600,
          }}
        >
          {copied ? "✓ Copied!" : "⎘ Copy link to open on desktop"}
        </button>
      )}
    </div>
  );
};

// ── MOBILE WARNING BANNER ─────────────────────────────────────────────────────
// Dismissible top banner for views that work on mobile but have limitations.
export const MobileWarningBanner = ({ message }) => {
  const T = useTheme();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
      padding: "10px 14px", marginBottom: 16, borderRadius: 8,
      background: T.amberDim, border: `1px solid ${T.amber}44`,
      fontFamily: font, fontSize: 12, color: T.amber,
    }}>
      <span>⚠ {message}</span>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", color: T.amber, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px", opacity: 0.7 }}
      >✕</button>
    </div>
  );
};

export const Badge = ({ color = "accent", children, style }) => {
  const T = useTheme();
  const c = T[color] || color;
  const dim = T[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
};

export const Button = ({ variant = "primary", children, onClick, disabled, style, small }) => {
  const T = useTheme();
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.2s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = { primary: { ...base, background: T.accent, color: T.bg }, secondary: { ...base, background: T.surfaceRaised, color: T.text, border: `1px solid ${T.border}` }, danger: { ...base, background: T.redDim, color: T.red, border: `1px solid ${T.red}33` }, warning: { ...base, background: T.amberDim, color: T.amber, border: `1px solid ${T.amber}33` }, ghost: { ...base, background: "transparent", color: T.textMuted } };  return <button style={{ ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

// ── PURGE CONFIRMATION ────────────────────────────────────────────────────────
// Inline panel shown when a user clicks the Purge button on a TC. Loads the
// purge preview (counts of feedback events and exemplar entries that would
// be erased) and waits for the user to confirm. Matches the inline-panel
// pattern of RejectionPicker rather than a modal dialog.
//
// Props:
//   tcId      — test case ID being purged
//   onConfirm — async function called with tcId when user confirms. The parent
//               handles the actual discard call and refresh.
//   onCancel  — called when the user dismisses without confirming.
export const PurgeConfirmation = ({ tcId, onConfirm, onCancel }) => {
  const T = useTheme();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api.getPurgePreview(tcId)
      .then(data => { if (!cancelled) { setPreview(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setLoadError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tcId]);

  const handleConfirm = async () => {
    setPurging(true);
    setPurgeError("");
    try {
      await onConfirm(tcId);
    } catch (err) {
      setPurgeError(err.message);
      setPurging(false);
    }
  };

  return (
    <div style={{
      padding: 12,
      background: T.amberDim,
      border: `1px solid ${T.amber}66`,
      borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: T.amber, fontSize: 14 }}>⚠</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.amber }}>
          Purge <span style={{ fontFamily: mono }}>{tcId}</span>?
        </span>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
          Loading impact...
        </div>
      )}

      {loadError && (
        <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>
          Couldn't load preview: {loadError}
        </div>
      )}

      {preview && !loading && (
        <>
          <div style={{ fontSize: 12, color: T.text, marginBottom: 6, lineHeight: 1.5 }}>
            This will remove the test case and erase its feedback from the learning engine:
          </div>
          <ul style={{ margin: "0 0 10px 18px", padding: 0, fontFamily: mono, fontSize: 12, color: T.amber, lineHeight: 1.7 }}>
            <li>{preview.feedbackEvents} feedback event{preview.feedbackEvents !== 1 ? "s" : ""}</li>
            <li>{preview.exemplars} exemplar entr{preview.exemplars !== 1 ? "ies" : "y"}</li>
          </ul>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10, fontStyle: "italic", lineHeight: 1.5 }}>
            For bad samples that shouldn't influence future generations. Already-aggregated rules are not unwound.
          </div>
        </>
      )}

      {purgeError && (
        <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>
          Purge failed: {purgeError}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Button small variant="ghost" onClick={onCancel} disabled={purging}>Cancel</Button>
        <Button small variant="warning" onClick={handleConfirm} disabled={loading || purging || !!loadError}>
          {purging ? "Purging..." : "Purge"}
        </Button>
      </div>
    </div>
  );
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

export const AutoResizeTextarea = ({ value, onChange, rows = 2, mono: useMono, error, placeholder, disabled, style }) => {
  const T = useTheme();
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: T.surface,
        border: `1px solid ${error ? T.red : T.border}`,
        borderRadius: 4,
        color: T.textBright,
        fontSize: 12,
        padding: "6px 10px",
        resize: "none",
        outline: "none",
        overflow: "hidden",
        fontFamily: useMono ? mono : "inherit",
        lineHeight: 1.5,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    />
  );
};

export const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea
      ? <AutoResizeTextarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} mono={useMono} rows={3} style={{ fontSize: 13, padding: "10px 12px", borderRadius: 6 }} />
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

// JamaImportPanel — collapsible tutorial shown when an import button is clicked.
// Props:
//   title    — heading text
//   steps    — array of { step: string, detail: string }
//   accept   — file input accept string, e.g. ".doc" or ".doc,.docx"
//   importing — boolean, disables the file picker while in-flight
//   onFile   — called with the File object when the user picks a file
//   onCancel — called when the user dismisses the panel
//   result   — optional success node rendered below the file picker
//   error    — optional error string rendered below the file picker
export const JamaImportPanel = ({ title, steps, accept = ".doc", importing, onFile, onCancel, result, error }) => {
  const T = useTheme();
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    onFile(file);
  };
  return (
    <div style={{ marginBottom: 16, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 16px", background: T.bg }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright, marginBottom: 10 }}>{title}</div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map(({ step, detail }, i) => (
            <li key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600, color: T.textBright }}>{step}</span>
              <span style={{ color: T.textMuted }}> {detail}</span>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ cursor: importing ? "not-allowed" : "pointer" }}>
            <input type="file" accept={accept} style={{ display: "none" }} disabled={importing} onChange={handleChange} />
            <Button variant="primary" small onClick={undefined} style={{ pointerEvents: "none" }}>{importing ? "Importing..." : "Choose File"}</Button>
          </label>
          <Button variant="ghost" small onClick={onCancel}>Cancel</Button>
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: T.red, fontFamily: mono }}>{error}</div>}
        {result}
      </div>
    </div>
  );
};

export const RejectionPicker = ({ onReject, onCancel }) => {
  const T = useTheme();
  const isMobile = useIsMobile();
  const reasons = [
    { key: "missing_edge_case",  label: "Missing edge case" },
    { key: "wrong_precondition", label: "Wrong preconditions" },
    { key: "incomplete_steps",   label: "Incomplete steps" },
    { key: "unclear_expected",   label: "Unclear expected results" },
    { key: "duplicate_coverage", label: "Duplicates another TC" },
    { key: "wrong_requirement",  label: "Doesn't test the requirement" },
    { key: "other",              label: "Other" },
  ];

  return (
    <div style={{
      marginTop: 8, padding: 12, background: T.surface,
      border: `1px solid ${T.red}33`, borderRadius: 8,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: T.red,
        fontFamily: mono, textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: 8,
      }}>
        What's the main issue?
      </div>
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flexWrap: isMobile ? "nowrap" : "wrap",
        gap: 6,
      }}>
        {reasons.map(r => (
          <button key={r.key} onClick={() => onReject(r.key)} style={{
            padding: isMobile ? "12px 16px" : "5px 12px",
            borderRadius: 5,
            fontSize: isMobile ? 13 : 11,
            fontFamily: font, fontWeight: 500, cursor: "pointer",
            border: `1px solid ${T.red}44`,
            background: T.redDim || "rgba(255,80,80,0.08)",
            color: T.red,
            textAlign: isMobile ? "left" : "center",
            width: isMobile ? "100%" : "auto",
          }}>
            {r.label}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{
        marginTop: 10, background: "none", border: "none",
        color: T.textMuted, cursor: "pointer",
        fontSize: isMobile ? 13 : 11,
        fontFamily: mono, padding: isMobile ? "4px 0" : 0,
      }}>
        Cancel
      </button>
    </div>
  );
};
