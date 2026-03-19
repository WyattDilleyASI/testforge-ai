import { useState, useEffect, useCallback } from "react";
import { useTheme, font, mono } from "../theme";

export const EasterEggToast = ({ message, onDone }) => {
  const T = useTheme();
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 99999, padding: "12px 24px", borderRadius: 8,
      background: T.accent, color: T.bg, fontFamily: font,
      fontSize: 14, fontWeight: 700, boxShadow: `0 4px 24px ${T.accentGlow}`,
      animation: "toastIn 0.3s ease-out",
    }}>
      {message}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export const EasterEggResetButton = ({ onReset }) => {
  const T = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onReset}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 8,
        border: `1px solid ${T.accent}66`,
        background: hovered ? T.accent : T.surface,
        color: hovered ? T.bg : T.textBright,
        fontFamily: font,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 12px ${T.accentGlow}`,
        transition: "all 0.2s ease",
        ...(T._upsideDown ? { transform: "rotate(180deg)" } : {}),
      }}
    >
      <span style={{ fontSize: 16 }}>↩️</span>
      <span>Reset Theme</span>
      <span style={{
        fontSize: 10,
        fontFamily: mono,
        opacity: 0.7,
        padding: "2px 6px",
        background: hovered ? `${T.bg}33` : `${T.accent}22`,
        borderRadius: 4,
      }}>
        ESC
      </span>
    </button>
  );
};

export const StarfieldCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const stars = [];
    const STAR_COUNT = 200;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width - canvas.width / 2,
        y: Math.random() * canvas.height - canvas.height / 2,
        z: Math.random() * canvas.width,
      });
    }

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 8, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (const star of stars) {
        star.z -= 1.5;
        if (star.z <= 0) {
          star.x = Math.random() * canvas.width - cx;
          star.y = Math.random() * canvas.height - cy;
          star.z = canvas.width;
        }
        const sx = (star.x / star.z) * cx + cx;
        const sy = (star.y / star.z) * cy + cy;
        const r = Math.max(0, (1 - star.z / canvas.width) * 2.5);
        const brightness = Math.max(0, (1 - star.z / canvas.width));
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};

export const MatrixRainCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const fontSize = 14;
    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
    let columns, drops;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(1);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.fillStyle = "rgba(0, 8, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00FF41";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillStyle = "#AAFFAA";
        ctx.fillText(char, x, y);

        ctx.fillStyle = "#00FF41";
        if (y > fontSize) {
          const trailChar = chars[Math.floor(Math.random() * chars.length)];
          ctx.globalAlpha = 0.6;
          ctx.fillText(trailChar, x, y - fontSize);
          ctx.globalAlpha = 1.0;
        }

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
};
