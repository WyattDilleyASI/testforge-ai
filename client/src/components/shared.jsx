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

export const Badge = ({ color = "accent", children, style, title }) => {
  const T = useTheme();
  const c = T[color] || color;
  const dim = T[color + "Dim"] || "rgba(255,255,255,0.08)";
  return <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase", color: c, background: dim, border: `1px solid ${c}22`, whiteSpace: "nowrap", cursor: title ? "help" : "default", ...style }}>{children}</span>;
};

export const Button = ({ variant = "primary", children, onClick, disabled, style, small, type, title }) => {
  const T = useTheme();
  const [hover, setHover] = useState(false);
  const base = { fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, padding: small ? "5px 12px" : "9px 20px", transition: "all 0.15s ease", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = {
    primary:   { ...base, background: T.accent, color: T.bg },
    secondary: { ...base, background: T.surfaceRaised, color: T.text, border: `1px solid ${T.border}` },
    danger:    { ...base, background: T.redDim, color: T.red, border: `1px solid ${T.red}33` },
    warning:   { ...base, background: T.amberDim, color: T.amber, border: `1px solid ${T.amber}33` },
    ghost:     { ...base, background: "transparent", color: T.textMuted },
  };
  const hoverStyles = !disabled && hover ? {
    primary:   { filter: "brightness(1.08)", transform: "translateY(-1px)" },
    secondary: { background: T.accentDim, borderColor: `${T.accent}55`, color: T.textBright },
    danger:    { background: `${T.red}22`, borderColor: `${T.red}66` },
    warning:   { background: `${T.amber}22`, borderColor: `${T.amber}66` },
    ghost:     { background: `${T.accent}11`, color: T.text },
  }[variant] : {};
  return <button
    type={type || "button"}
    title={title}
    style={{ ...variants[variant], ...style, ...hoverStyles }}
    onClick={onClick}
    disabled={disabled}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
  >{children}</button>;
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

export const Input = ({ label, value, onChange, placeholder, textarea, mono: useMono, style, disabled, type, name, autoComplete }) => {
  const T = useTheme();
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
    {textarea
      ? <AutoResizeTextarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} mono={useMono} rows={3} style={{ fontSize: 13, padding: "10px 12px", borderRadius: 6 }} />
      : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type || "text"} name={name} autoComplete={autoComplete} style={{ fontFamily: useMono ? mono : font, fontSize: 13, color: T.textBright, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", opacity: disabled ? 0.5 : 1 }} />}
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

// ── SECTION LABEL ────────────────────────────────────────────────────────────
// The small uppercase header that sits above a section of fields/content.
// Sans (not mono) for readability, with subtle letter-spacing to keep the
// "label" feel. Use SectionLabel for top-level section headers and
// SectionSubLabel for nested sub-headings inside a section.
export const SectionLabel = ({ children, color, style }) => {
  const T = useTheme();
  return (
    <div style={{
      fontSize: 11, fontWeight: 600,
      color: color || T.textMuted,
      textTransform: "uppercase", letterSpacing: "0.06em",
      marginBottom: 6,
      ...style,
    }}>{children}</div>
  );
};

export const SectionSubLabel = ({ children, color, style }) => {
  const T = useTheme();
  return (
    <div style={{
      fontSize: 10, fontWeight: 600,
      color: color || T.textMuted,
      textTransform: "uppercase", letterSpacing: "0.06em",
      marginBottom: 4,
      ...style,
    }}>{children}</div>
  );
};


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

// ── OVERFLOW MENU ─────────────────────────────────────────────────────────────
// Small dropdown button that hides secondary actions behind a single trigger.
// Use to declutter toolbars when several rarely-used buttons crowd primary ones.
//
// Props:
//   items       — array of { label, onClick, severity?, disabled?, hidden? }.
//                 severity = "danger" | "warning" | undefined. Hidden items
//                 are filtered out (useful for permission-gated entries).
//   triggerLabel — button text/glyph. Defaults to "⋯".
//   align        — "left" | "right" (default). Aligns dropdown panel relative
//                  to the trigger button.
export const OverflowMenu = ({ items, triggerLabel = "⋯", align = "right" }) => {
  const T = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const visible = (items || []).filter(it => !it.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <Button variant="secondary" small onClick={() => setOpen(o => !o)}>
        {triggerLabel}
      </Button>
      {open && (
        <div style={{
          position: "absolute", top: "100%",
          [align]: 0,
          marginTop: 4,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 50, minWidth: 180,
          padding: 4,
        }}>
          {visible.map((item, i) => {
            const color = item.severity === "danger" ? T.red
              : item.severity === "warning" ? T.amber
              : T.text;
            return (
              <button
                key={i}
                onClick={() => { setOpen(false); item.onClick?.(); }}
                disabled={item.disabled}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "7px 10px", borderRadius: 4, border: "none",
                  background: "transparent",
                  cursor: item.disabled ? "not-allowed" : "pointer",
                  fontSize: 12, fontFamily: font,
                  fontWeight: 500,
                  color,
                  opacity: item.disabled ? 0.4 : 1,
                }}
                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = T.surfaceRaised; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── CONFIRMATIONS ─────────────────────────────────────────────────────────────
// InlineConfirm is a single-row replacement for a button: shows a prompt plus
// Confirm/Cancel buttons. Used when an action button transforms into its own
// confirmation in place (toolbar buttons, inline list-item delete).
//
// Props:
//   prompt        — short question, e.g. "Delete 3 items?"
//   onConfirm     — sync or async; if it returns a promise the panel disables
//                   the buttons while pending and surfaces thrown errors.
//   onCancel      — called when user dismisses.
//   severity      — "danger" (default) or "warning". Tints the prompt color
//                   and chooses the Confirm button variant.
//   confirmLabel  — defaults to "Confirm".
//   cancelLabel   — defaults to "Cancel".
//   stopPropagation — wrap click handlers in stopPropagation (for clickable
//                     parent rows).
export const InlineConfirm = ({
  prompt,
  onConfirm,
  onCancel,
  severity = "danger",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  stopPropagation = false,
}) => {
  const T = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const color = severity === "warning" ? T.amber : T.red;

  const handle = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || "Failed");
      setBusy(false);
    }
  };

  const swallow = (handler) => stopPropagation
    ? (e) => { e?.stopPropagation?.(); handler?.(e); }
    : handler;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{prompt}</span>
      <Button
        variant={severity === "warning" ? "warning" : "danger"}
        small
        onClick={swallow(handle)}
        disabled={busy}
      >
        {busy ? "…" : confirmLabel}
      </Button>
      <Button variant="ghost" small onClick={swallow(onCancel)} disabled={busy}>
        {cancelLabel}
      </Button>
      {error && <span style={{ fontSize: 11, color: T.red, fontFamily: mono }}>{error}</span>}
    </div>
  );
};

// ConfirmPanel is a block-level confirmation panel — heavier visual weight,
// suitable for page-level destructive actions (clear-all, bulk-delete). Use
// InlineConfirm for in-toolbar or in-list-item confirmations.
//
// Props:
//   title         — bolded heading next to the warning icon
//   body          — optional supporting text (string or ReactNode)
//   onConfirm     — sync or async
//   onCancel      — called when user dismisses
//   severity      — "danger" (default) or "warning"
//   confirmLabel  — defaults to "Confirm"
//   cancelLabel   — defaults to "Cancel"
export const ConfirmPanel = ({
  title,
  body,
  onConfirm,
  onCancel,
  severity = "danger",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}) => {
  const T = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const color = severity === "warning" ? T.amber : T.red;
  const dim = severity === "warning" ? T.amberDim : T.redDim;

  const handle = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || "Failed");
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 12, background: dim, border: `1px solid ${color}66`, borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: body ? 8 : 10 }}>
        <span style={{ color, fontSize: 14 }}>⚠</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{title}</span>
      </div>
      {body && (
        <div style={{ fontSize: 12, color: T.text, marginBottom: 10, lineHeight: 1.5 }}>{body}</div>
      )}
      {error && <div style={{ fontSize: 11, color: T.red, marginBottom: 8, fontFamily: mono }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <Button variant={severity === "warning" ? "warning" : "danger"} small onClick={handle} disabled={busy}>
          {busy ? "…" : confirmLabel}
        </Button>
        <Button variant="ghost" small onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
      </div>
    </div>
  );
};

// ── TEST CASE EDIT FORM ───────────────────────────────────────────────────────
// Shared edit form used by the TC generation page and the TC library. Renders
// Title/Type, optional Traced Requirements selector, Description, Setup, and
// Test Steps sections, plus Save/Cancel buttons.
//
// Props:
//   editForm        — current form state (title, type, description{}, setup{}, steps[], linked_req_ids[])
//   setEditForm     — setter (accepts updater fn)
//   onSave          — called when user clicks Save
//   onCancel        — called when user clicks Cancel
//   saving          — disables Save while true; shows "Saving..." label
//   error           — optional error string shown next to buttons
//   requirements    — optional. When provided, shows the Traced Requirements section.
//   traceSearch     — controlled search query for the trace selector (string)
//   setTraceSearch  — setter for traceSearch
//   stopPropagation — wrap onClick handlers in stopPropagation (use when parent card is clickable)
//   wrapperStyle    — override the outer container style (e.g., to add a top border)
export const TestCaseEditForm = ({
  editForm,
  setEditForm,
  onSave,
  onCancel,
  saving,
  error,
  requirements,
  traceSearch,
  setTraceSearch,
  stopPropagation = false,
  wrapperStyle,
}) => {
  const T = useTheme();
  const swallow = (handler) => stopPropagation
    ? (e) => { e?.stopPropagation?.(); handler?.(e); }
    : handler;

  const lbl = (text) => <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{text}</label>;
  const inp = (val, onChange) => <input value={val} onChange={onChange} style={{ width: "100%", boxSizing: "border-box", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textBright, fontSize: 13, padding: "6px 10px", outline: "none" }} />;
  const ta = (val, onChange, rows = 3) => <AutoResizeTextarea value={val} onChange={onChange} rows={rows} />;
  const arrVal = (arr) => (arr || []).join("\n");
  const arrChange = (path, e) => {
    const items = e.target.value.split("\n");
    setEditForm(p => {
      const parts = path.split(".");
      if (parts.length === 1) return { ...p, [parts[0]]: items };
      if (parts[0] === "description") return { ...p, description: { ...p.description, [parts[1]]: items } };
      if (parts[0] === "setup") return { ...p, setup: { ...p.setup, [parts[1]]: items } };
      return p;
    });
  };
  const arrHint = <div style={{ fontSize: 10, color: T.textMuted, fontFamily: mono, marginBottom: 4 }}>One item per line</div>;
  const section = (label) => <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 16, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>{label}</div>;

  const showTraces = Array.isArray(requirements);

  return (
    <div style={wrapperStyle || { display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          {lbl("Title")}
          {inp(editForm.title, e => setEditForm(p => ({ ...p, title: e.target.value })))}
        </div>
        <div style={{ minWidth: 150 }}>
          {lbl("Type")}
          <select value={editForm.type} onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textBright, fontSize: 12, padding: "6px 10px", outline: "none" }}>
            {["Happy Path", "Negative", "Boundary", "Edge Case"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {showTraces && <>
        {section("Traced Requirements")}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, background: T.bg, overflow: "hidden" }}>
          {(editForm.linked_req_ids || []).length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 8px 6px",
              borderBottom: `1px solid ${T.border}`, background: T.accentDim,
            }}>
              {(editForm.linked_req_ids || []).map(rid => (
                <span key={rid} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: T.accent, color: T.bg,
                  fontSize: 10, fontFamily: mono, fontWeight: 700,
                  padding: "2px 6px 2px 8px", borderRadius: 10,
                }}>
                  {rid}
                  <span
                    role="button"
                    onClick={swallow(() => setEditForm(p => ({ ...p, linked_req_ids: (p.linked_req_ids || []).filter(id => id !== rid) })))}
                    style={{ cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px", borderRadius: "50%", opacity: 0.7 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                  >×</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>
            <input
              value={traceSearch || ""}
              onChange={e => setTraceSearch?.(e.target.value)}
              placeholder="Search requirements by ID or title..."
              style={{ width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textBright, fontSize: 12, padding: "6px 10px", fontFamily: mono, outline: "none" }}
              onClick={swallow(() => {})}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", padding: 8 }}>
            {requirements.length === 0 && (
              <div style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>No requirements loaded</div>
            )}
            {(() => {
              const linked = editForm.linked_req_ids || [];
              const query = (traceSearch || "").toLowerCase().trim();
              const filtered = requirements.filter(req => {
                const alreadyLinked = linked.includes(req.req_id);
                if (alreadyLinked) return true;
                if (!query) return true;
                return req.req_id.toLowerCase().includes(query)
                  || (req.title || "").toLowerCase().includes(query);
              });
              const sorted = [...filtered].sort((a, b) => {
                const aLinked = linked.includes(a.req_id) ? 0 : 1;
                const bLinked = linked.includes(b.req_id) ? 0 : 1;
                if (aLinked !== bLinked) return aLinked - bLinked;
                return a.req_id.localeCompare(b.req_id);
              });
              if (sorted.length === 0) {
                return <div style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic", padding: "4px 0" }}>No matches for "{traceSearch}"</div>;
              }
              return sorted.map(req => {
                const isLinked = linked.includes(req.req_id);
                return (
                  <label key={req.req_id} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 6px",
                    cursor: "pointer", fontSize: 12, color: T.text,
                    borderRadius: 4,
                    background: isLinked ? `${T.accent}11` : "transparent",
                    borderLeft: isLinked ? `3px solid ${T.accent}` : "3px solid transparent",
                    transition: "background 0.3s ease, border-left 0.3s ease",
                  }}>
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => setEditForm(p => ({
                        ...p,
                        linked_req_ids: isLinked
                          ? (p.linked_req_ids || []).filter(id => id !== req.req_id)
                          : [...(p.linked_req_ids || []), req.req_id],
                      }))}
                      style={{ marginTop: 2, accentColor: T.accent }}
                    />
                    <span>
                      <span style={{ fontFamily: mono, fontWeight: 600, color: isLinked ? T.accent : T.textMuted, transition: "color 0.3s ease" }}>{req.req_id}</span>
                      {req.title && <span style={{ color: T.textMuted }}> — {req.title}</span>}
                    </span>
                  </label>
                );
              });
            })()}
          </div>
        </div>
        {(editForm.linked_req_ids || []).length > 0 && (
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, fontFamily: mono }}>
            {editForm.linked_req_ids.length} requirement{editForm.linked_req_ids.length !== 1 ? "s" : ""} traced
          </div>
        )}
      </>}

      {section("Description")}
      <div>{lbl("Objective")}{ta(editForm.description?.objective || "", e => setEditForm(p => ({ ...p, description: { ...p.description, objective: e.target.value } })), 4)}</div>
      <div>{lbl("Scope")}{ta(editForm.description?.scope || "", e => setEditForm(p => ({ ...p, description: { ...p.description, scope: e.target.value } })), 2)}</div>
      <div>{lbl("Assumptions")}{arrHint}{ta(arrVal(editForm.description?.assumptions), e => arrChange("description.assumptions", e), 3)}</div>

      {section("Setup")}
      <div>{lbl("Preconditions")}{arrHint}{ta(arrVal(editForm.setup?.preconditions), e => arrChange("setup.preconditions", e), 3)}</div>
      <div>{lbl("Environment")}{arrHint}{ta(arrVal(editForm.setup?.environment), e => arrChange("setup.environment", e), 2)}</div>
      <div>{lbl("Equipment")}{arrHint}{ta(arrVal(editForm.setup?.equipment), e => arrChange("setup.equipment", e), 2)}</div>
      <div>{lbl("Test Data")}{arrHint}{ta(arrVal(editForm.setup?.testData), e => arrChange("setup.testData", e), 2)}</div>

      {section("Test Steps")}
      {(editForm.steps || []).map((s, i) => (
        <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, fontFamily: mono }}>Step {i + 1}</div>
            <button
              onClick={swallow(() => setEditForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) })))}
              disabled={(editForm.steps || []).length <= 1}
              style={{ background: "none", border: "none", cursor: "pointer", color: T.red, fontFamily: mono, fontSize: 14, lineHeight: 1, padding: "0 2px", opacity: (editForm.steps || []).length <= 1 ? 0.25 : 0.6 }}
              title="Delete step"
            >×</button>
          </div>
          <div style={{ marginBottom: 4 }}>{lbl("Action")}{ta(s.step, e => setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, step: e.target.value } : st) })), 2)}</div>
          <div>{lbl("Expected Result")}{ta(s.expectedResult, e => setEditForm(p => ({ ...p, steps: p.steps.map((st, j) => j === i ? { ...st, expectedResult: e.target.value } : st) })), 2)}</div>
        </div>
      ))}

      <Button
        small
        variant="ghost"
        onClick={swallow(() => setEditForm(p => ({
          ...p,
          steps: [...(p.steps || []), { step: "", expectedResult: "" }],
        })))}
        style={{ alignSelf: "flex-start", marginTop: 4 }}
      >
        + Add step
      </Button>

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <Button small onClick={swallow(onSave)} disabled={saving || !editForm.title?.trim()}>{saving ? "Saving..." : "Save"}</Button>
        <Button small variant="ghost" onClick={swallow(onCancel)}>Cancel</Button>
        {error && <span style={{ fontSize: 11, color: T.red, fontFamily: mono }}>{error}</span>}
      </div>
    </div>
  );
};
