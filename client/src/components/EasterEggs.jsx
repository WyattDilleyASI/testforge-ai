import { useState, useEffect, useCallback, useRef } from "react";
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
        // Flip it back upright if the UI is upside down
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

    // Initialize stars at random positions with depth
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

        // Bright head character
        ctx.fillStyle = "#AAFFAA";
        ctx.fillText(char, x, y);

        // Dimmer trail
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

// ── AURORA BOREALIS ──────────────────────────────────────────────────────────
// Renders slow-flowing translucent waves of green/purple/teal across the sky.

export const AuroraCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const colors = [
        { r: 0, g: 232, b: 126, a: 0.08 },   // green
        { r: 100, g: 80, b: 255, a: 0.06 },   // purple
        { r: 0, g: 180, b: 220, a: 0.05 },    // teal
        { r: 0, g: 255, b: 180, a: 0.04 },    // mint
      ];

      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const yBase = H * 0.15 + i * H * 0.08;
        const speed = 0.0003 + i * 0.0001;
        const amplitude = H * 0.12 + i * 20;

        ctx.beginPath();
        ctx.moveTo(0, H);

        for (let x = 0; x <= W; x += 4) {
          const wave1 = Math.sin(x * 0.002 + time * speed * 6 + i * 1.5) * amplitude;
          const wave2 = Math.sin(x * 0.004 + time * speed * 4 + i * 0.8) * amplitude * 0.5;
          const wave3 = Math.sin(x * 0.001 + time * speed * 2) * amplitude * 0.3;
          const y = yBase + wave1 + wave2 + wave3;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(W, H);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, yBase - amplitude, 0, yBase + amplitude * 2);
        grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${c.a * 1.5})`);
        grad.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${c.a})`);
        grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      time++;
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


// ── VAPORWAVE GRID ───────────────────────────────────────────────────────────
// Renders a retro 80s sunset with a scrolling perspective grid.

export const VaporwaveCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      const horizon = H * 0.45;

      // ── Sky gradient ──────────────────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#0E0620");
      sky.addColorStop(0.4, "#2D1050");
      sky.addColorStop(0.75, "#6A2080");
      sky.addColorStop(1, "#FF71CE55");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);

      // ── Sun ───────────────────────────────────────────────────────
      const sunX = W / 2;
      const sunY = horizon - 30;
      const sunR = 55;

      // Draw the full sun circle with gradient
      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.clip();

      const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
      sunGrad.addColorStop(0, "#FFDD44");
      sunGrad.addColorStop(0.4, "#FF8844");
      sunGrad.addColorStop(0.7, "#FF4488");
      sunGrad.addColorStop(1, "#CC22AA");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

      // Retro scanline gaps — thin transparent slices through the lower half
      ctx.globalCompositeOperation = "destination-out";
      const gapCount = 7;
      for (let i = 0; i < gapCount; i++) {
        const t = i / gapCount;
        const gapY = sunY + sunR * 0.05 + t * sunR * 0.9;
        const gapH = 1.5 + t * 2.5; // gaps get wider toward bottom
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(sunX - sunR, gapY, sunR * 2, gapH);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // Sun glow
      const glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, sunR * 2.5);
      glowGrad.addColorStop(0, "rgba(255,113,206,0.15)");
      glowGrad.addColorStop(0.5, "rgba(255,80,180,0.06)");
      glowGrad.addColorStop(1, "rgba(255,80,180,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // ── Ground plane ──────────────────────────────────────────────
      const ground = ctx.createLinearGradient(0, horizon, 0, H);
      ground.addColorStop(0, "#2A1050");
      ground.addColorStop(0.3, "#1A0A3A");
      ground.addColorStop(1, "#0E0620");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, W, H - horizon);

      // ── Horizontal grid lines — scroll toward viewer ──────────────
      const hLineCount = 30;
      const scrollSpeed = 0.004;
      const scrollPhase = (time * scrollSpeed) % 1;

      ctx.lineWidth = 1;
      for (let i = 0; i < hLineCount; i++) {
        // t goes 0→1 with scroll offset, quadratic spacing for perspective
        let t = ((i / hLineCount) + scrollPhase) % 1;
        const y = horizon + (H - horizon) * (t * t);
        const alpha = 0.05 + t * 0.35;

        ctx.strokeStyle = `rgba(255,113,206,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // ── Vertical grid lines — converge at horizon vanishing point ─
      const vLineCount = 28;
      ctx.lineWidth = 1;

      for (let i = -vLineCount / 2; i <= vLineCount / 2; i++) {
        const spread = (i / (vLineCount / 2));
        const bottomX = W / 2 + spread * W * 0.9;
        const topX = W / 2; // all lines converge to center at horizon
        const alpha = 0.06 + (1 - Math.abs(spread)) * 0.12;

        ctx.strokeStyle = `rgba(185,103,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(topX, horizon);
        ctx.lineTo(bottomX, H);
        ctx.stroke();
      }

      time++;
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


// ── FIREFLIES ────────────────────────────────────────────────────────────────
// Floating warm-toned particles that drift, pulse, and softly glow.

export const FirefliesCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const particles = [];
    const COUNT = 45;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        radius: 1.5 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.02,
        hue: 40 + Math.random() * 30, // warm yellow-amber range
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase * 0.7) * 0.15;
        p.y += p.vy + Math.cos(p.phase * 0.5) * 0.1;

        // Wrap around
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        const glow = 0.3 + Math.sin(p.phase) * 0.3 + 0.2;
        const r = p.radius * (1 + Math.sin(p.phase) * 0.3);

        // Outer glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 8);
        grad.addColorStop(0, `hsla(${p.hue}, 90%, 65%, ${glow * 0.25})`);
        grad.addColorStop(0.3, `hsla(${p.hue}, 80%, 55%, ${glow * 0.08})`);
        grad.addColorStop(1, `hsla(${p.hue}, 70%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 8, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `hsla(${p.hue}, 95%, 80%, ${glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
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

export const FishTankCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    // ── Bubbles ─────────────────────────────────────────────────────
    const bubbles = [];
    const BUBBLE_COUNT = 35;
    const spawnBubble = (W, H) => ({
      x: Math.random() * W,
      y: H + Math.random() * 100,
      r: 2 + Math.random() * 6,
      speed: 0.4 + Math.random() * 0.8,
      wobbleAmp: 0.3 + Math.random() * 0.8,
      wobbleFreq: 0.02 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.15 + Math.random() * 0.25,
    });

    // ── Fish ────────────────────────────────────────────────────────
    const fish = [];
    const FISH_COUNT = 6;
    const spawnFish = (W, H) => {
      const goingRight = Math.random() > 0.5;
      return {
        x: goingRight ? -60 : W + 60,
        y: H * 0.15 + Math.random() * H * 0.55,
        speed: (0.5 + Math.random() * 1.0) * (goingRight ? 1 : -1),
        size: 12 + Math.random() * 18,
        bodyHue: [0, 30, 45, 180, 200, 280, 320][Math.floor(Math.random() * 7)],
        bodySat: 60 + Math.random() * 30,
        tailPhase: Math.random() * Math.PI * 2,
        tailSpeed: 0.08 + Math.random() * 0.06,
        wobbleY: Math.random() * Math.PI * 2,
      };
    };

    // ── Seaweed strands ─────────────────────────────────────────────
    const seaweed = [];
    const SEAWEED_COUNT = 10;
    const initSeaweed = (W, H) => {
      seaweed.length = 0;
      for (let i = 0; i < SEAWEED_COUNT; i++) {
        seaweed.push({
          x: W * 0.05 + Math.random() * W * 0.9,
          baseY: H,
          height: 60 + Math.random() * 100,
          segments: 6 + Math.floor(Math.random() * 4),
          phase: Math.random() * Math.PI * 2,
          hue: 120 + Math.random() * 40, // green range
          width: 3 + Math.random() * 4,
        });
      }
    };

    // ── Light rays ──────────────────────────────────────────────────
    const rays = [];
    const RAY_COUNT = 5;
    for (let i = 0; i < RAY_COUNT; i++) {
      rays.push({
        x: Math.random(),
        width: 0.03 + Math.random() * 0.06,
        alpha: 0.02 + Math.random() * 0.03,
        drift: 0.0002 + Math.random() * 0.0003,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Re-init position-dependent elements
      initSeaweed(canvas.width, canvas.height);
      bubbles.length = 0;
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const b = spawnBubble(canvas.width, canvas.height);
        b.y = Math.random() * canvas.height; // spread them out initially
        bubbles.push(b);
      }
      fish.length = 0;
      for (let i = 0; i < FISH_COUNT; i++) {
        const f = spawnFish(canvas.width, canvas.height);
        f.x = Math.random() * canvas.width; // spread initially
        fish.push(f);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Water gradient background tint ────────────────────────────
      const waterGrad = ctx.createLinearGradient(0, 0, 0, H);
      waterGrad.addColorStop(0, "rgba(10,60,120,0.06)");
      waterGrad.addColorStop(0.5, "rgba(4,20,40,0.03)");
      waterGrad.addColorStop(1, "rgba(4,15,30,0.08)");
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Light rays from surface ───────────────────────────────────
      for (const ray of rays) {
        const rx = (ray.x + Math.sin(time * ray.drift + ray.phase) * 0.05) * W;
        const rw = ray.width * W;
        const pulseAlpha = ray.alpha * (0.7 + Math.sin(time * 0.008 + ray.phase) * 0.3);

        const grad = ctx.createLinearGradient(0, 0, 0, H * 0.8);
        grad.addColorStop(0, `rgba(120,200,255,${pulseAlpha * 2})`);
        grad.addColorStop(0.3, `rgba(80,180,255,${pulseAlpha})`);
        grad.addColorStop(1, "rgba(40,100,200,0)");
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(rx - rw * 0.3, 0);
        ctx.lineTo(rx + rw * 0.3, 0);
        ctx.lineTo(rx + rw * 1.5, H * 0.8);
        ctx.lineTo(rx - rw * 1.5, H * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      // ── Seaweed ───────────────────────────────────────────────────
      for (const sw of seaweed) {
        const segH = sw.height / sw.segments;
        ctx.strokeStyle = `hsla(${sw.hue}, 55%, 28%, 0.6)`;
        ctx.lineWidth = sw.width;
        ctx.lineCap = "round";
        ctx.beginPath();

        let px = sw.x;
        let py = sw.baseY;
        ctx.moveTo(px, py);

        for (let seg = 1; seg <= sw.segments; seg++) {
          const t = seg / sw.segments;
          const sway = Math.sin(time * 0.012 + sw.phase + seg * 0.5) * (8 + t * 15);
          py = sw.baseY - seg * segH;
          px = sw.x + sway;
          ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Leaves at some segments
        for (let seg = 2; seg < sw.segments; seg += 2) {
          const t = seg / sw.segments;
          const sway = Math.sin(time * 0.012 + sw.phase + seg * 0.5) * (8 + t * 15);
          const lx = sw.x + sway;
          const ly = sw.baseY - seg * segH;
          const leafDir = seg % 4 === 0 ? 1 : -1;
          const leafLen = 8 + Math.random() * 4;

          ctx.strokeStyle = `hsla(${sw.hue + 10}, 50%, 32%, 0.4)`;
          ctx.lineWidth = sw.width * 0.6;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.quadraticCurveTo(
            lx + leafDir * leafLen,
            ly - leafLen * 0.3,
            lx + leafDir * leafLen * 1.3,
            ly + 4
          );
          ctx.stroke();
        }
      }

      // ── Fish ──────────────────────────────────────────────────────
      for (let fi = 0; fi < fish.length; fi++) {
        const f = fish[fi];
        f.x += f.speed;
        f.tailPhase += f.tailSpeed;
        f.wobbleY += 0.015;

        const fy = f.y + Math.sin(f.wobbleY) * 8;
        const dir = f.speed > 0 ? 1 : -1;
        const sz = f.size;
        const tailSwing = Math.sin(f.tailPhase) * sz * 0.35;

        ctx.save();
        ctx.translate(f.x, fy);
        ctx.scale(dir, 1);

        // Body
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 55%, 0.7)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Belly highlight
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat - 10}%, 75%, 0.3)`;
        ctx.beginPath();
        ctx.ellipse(sz * 0.1, sz * 0.1, sz * 0.6, sz * 0.2, 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 48%, 0.6)`;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.8, 0);
        ctx.lineTo(-sz * 1.4, -sz * 0.35 + tailSwing * 0.5);
        ctx.lineTo(-sz * 1.4, sz * 0.35 + tailSwing * 0.5);
        ctx.closePath();
        ctx.fill();

        // Dorsal fin
        ctx.fillStyle = `hsla(${f.bodyHue}, ${f.bodySat}%, 45%, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.1, -sz * 0.4);
        ctx.lineTo(sz * 0.3, -sz * 0.7);
        ctx.lineTo(sz * 0.5, -sz * 0.35);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(sz * 0.55, -sz * 0.08, sz * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.beginPath();
        ctx.arc(sz * 0.58, -sz * 0.08, sz * 0.06, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Respawn off-screen fish
        if ((f.speed > 0 && f.x > W + 80) || (f.speed < 0 && f.x < -80)) {
          fish[fi] = spawnFish(W, H);
        }
      }

      // ── Bubbles ──────────────────────────────────────────────────
      for (let bi = 0; bi < bubbles.length; bi++) {
        const b = bubbles[bi];
        b.y -= b.speed;
        b.phase += b.wobbleFreq;
        b.x += Math.sin(b.phase) * b.wobbleAmp;

        // Bubble body
        ctx.strokeStyle = `rgba(140,210,255,${b.opacity})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();

        // Highlight
        ctx.fillStyle = `rgba(200,240,255,${b.opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Soft glow
        const bGlow = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r * 3);
        bGlow.addColorStop(0, `rgba(80,180,255,${b.opacity * 0.15})`);
        bGlow.addColorStop(1, "rgba(80,180,255,0)");
        ctx.fillStyle = bGlow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Respawn at bottom when off top
        if (b.y < -b.r * 4) {
          bubbles[bi] = spawnBubble(W, H);
        }
      }

      // ── Surface caustic shimmer at top ────────────────────────────
      const causticH = H * 0.04;
      for (let x = 0; x < W; x += 3) {
        const wave = Math.sin(x * 0.02 + time * 0.015) * 0.5
                   + Math.sin(x * 0.035 + time * 0.008) * 0.3;
        const alpha = 0.03 + wave * 0.025;
        ctx.fillStyle = `rgba(150,220,255,${Math.max(0, alpha)})`;
        ctx.fillRect(x, 0, 3, causticH * (0.6 + wave * 0.4));
      }

      time++;
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

// ── FALLING HOT DOGS ─────────────────────────────────────────────────────────
// Hot dog emojis rain down and pile up at the bottom of the screen.

export const HotDogCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    // Offscreen canvas — landed pile is drawn here once per landing event,
    // then blitted in one drawImage call per frame instead of re-drawing every hotdog.
    const pile = document.createElement("canvas");
    const pileCtx = pile.getContext("2d");

    const falling = [];
    const COUNT = 50;
    const COLS = 55;
    let floorLevel = [];

    const colWidth = () => canvas.width / COLS;
    const getFloor = (x) => {
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / colWidth())));
      return canvas.height - (floorLevel[col] || 0);
    };
    const raiseFloor = (x, amount) => {
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / colWidth())));
      const weights = { 0: 1, 1: 0.7, 2: 0.35 };
      for (let dc = -2; dc <= 2; dc++) {
        const c = Math.max(0, Math.min(COLS - 1, col + dc));
        const weight = weights[Math.abs(dc)] ?? 0;
        floorLevel[c] = (floorLevel[c] || 0) + amount * weight;
      }
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      pile.width = canvas.width;
      pile.height = canvas.height;
      floorLevel = new Array(COLS).fill(0);
      pileCtx.clearRect(0, 0, pile.width, pile.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pre-render emoji at discrete sizes so drawDog uses fast drawImage blits
    // instead of expensive fillText emoji shaping every frame.
    const SPRITE_SIZES = [28, 36, 44, 52, 70, 90, 140, 240, 480, 960];
    const sprites = SPRITE_SIZES.map(sz => {
      const pad = 4;
      const dim = sz + pad * 2;
      const oc = document.createElement("canvas");
      oc.width = dim; oc.height = dim;
      const octx = oc.getContext("2d");
      octx.font = `${sz}px serif`;
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText("🌭", dim / 2, dim / 2);
      return { canvas: oc, dim };
    });
    const getSprite = (size) => {
      let best = sprites[0];
      for (const s of sprites) if (Math.abs(s.dim - size) < Math.abs(best.dim - size)) best = s;
      return best;
    };

    const spawnHotdog = () => {
      const roll = Math.random();
      // 0.01% chance: legendary hot dog
      // 1% chance: giant hot dog
      // 5% chance: large hot dog
      // ~94% chance: normal hot dog
      const size = roll < 0.0001
        ? 900 + Math.random() * 100      // legendary: 900–1000px
        : roll < 0.01
          ? 110 + Math.random() * 40     // giant: 110–150px
          : roll < 0.06
            ? 62 + Math.random() * 22    // large: 62–84px
            : 26 + Math.random() * 24;   // normal: 26–50px
      return {
        x: Math.random() * canvas.width,
        y: -60 - Math.random() * 300,
        speed: 2 + Math.random() * 2.5,
        size,
        rot: (Math.random() - 0.5) * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.07,
        wobble: Math.random() * Math.PI * 2,
        wobbleAmp: 0.5 + Math.random() * 1.0,
        wobbleFreq: 0.02 + Math.random() * 0.03,
      };
    };

    for (let i = 0; i < COUNT; i++) {
      const h = spawnHotdog();
      h.y = Math.random() * canvas.height * 0.8;
      falling.push(h);
    }

    const drawDog = (targetCtx, x, y, rot, size) => {
      const { canvas: spr, dim } = getSprite(size);
      const scale = size / dim;
      targetCtx.save();
      targetCtx.translate(x, y);
      targetCtx.rotate(rot);
      targetCtx.scale(scale, scale);
      targetCtx.drawImage(spr, -dim / 2, -dim / 2);
      targetCtx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Blit the entire landed pile in one operation
      ctx.drawImage(pile, 0, 0);

      // Update and draw only the falling hotdogs (small fixed number)
      for (let i = 0; i < falling.length; i++) {
        const h = falling[i];
        h.y += h.speed;
        h.rot += h.rotSpeed;
        h.wobble += h.wobbleFreq;
        h.x += Math.sin(h.wobble) * h.wobbleAmp;

        const floor = getFloor(h.x);

        if (h.y >= floor) {
          h.rot = h.rot + (Math.random() - 0.5) * 0.3;
          h.y = floor;
          raiseFloor(h.x, h.size * 0.55);
          // Paint directly onto the offscreen pile canvas — never redrawn again
          drawDog(pileCtx, h.x, h.y, h.rot, h.size);
          falling[i] = spawnHotdog();
        } else {
          drawDog(ctx, h.x, h.y, h.rot, h.size);
        }
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

// ── RAINSTORM ────────────────────────────────────────────────────────────────
// Diagonal rain streaks with occasional lightning flashes.

export const RainstormCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;
    let lightningTimer = 0;
    let lightningAlpha = 0;

    const drops = [];
    const DROP_COUNT = 280;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize raindrops
    for (let i = 0; i < DROP_COUNT; i++) {
      drops.push({
        x: Math.random() * canvas.width * 1.4 - canvas.width * 0.2,
        y: Math.random() * canvas.height,
        len: 12 + Math.random() * 24,
        speed: 8 + Math.random() * 10,
        opacity: 0.08 + Math.random() * 0.16,
        wind: 2 + Math.random() * 2,
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Lightning flash ──
      lightningTimer++;
      if (lightningTimer > 400 + Math.random() * 600) {
        lightningAlpha = 0.15 + Math.random() * 0.12;
        lightningTimer = 0;
      }
      if (lightningAlpha > 0) {
        ctx.fillStyle = `rgba(200,210,230,${lightningAlpha})`;
        ctx.fillRect(0, 0, W, H);
        lightningAlpha *= 0.88;
        if (lightningAlpha < 0.005) lightningAlpha = 0;
      }

      // ── Rain streaks ──
      ctx.lineCap = "round";
      for (const d of drops) {
        d.y += d.speed;
        d.x += d.wind;

        if (d.y > H) {
          d.y = -d.len;
          d.x = Math.random() * W * 1.4 - W * 0.2;
        }

        ctx.strokeStyle = `rgba(140,170,210,${d.opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.wind * 1.5, d.y + d.len);
        ctx.stroke();
      }

      // ── Subtle mist at bottom ──
      const mistGrad = ctx.createLinearGradient(0, H * 0.85, 0, H);
      mistGrad.addColorStop(0, "rgba(80,100,130,0)");
      mistGrad.addColorStop(1, `rgba(80,100,130,${0.04 + Math.sin(time * 0.008) * 0.02})`);
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, H * 0.85, W, H * 0.15);

      time++;
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


// ── STARFIELD (PARALLAX) ─────────────────────────────────────────────────────
// Slow-drifting multi-layer parallax stars. Distinct from the easter-egg
// "After Dark" warp-speed starfield — this one is calm and ambient.

export const StarfieldParallaxCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const LAYER_COUNT = 3;
    const layers = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Reinit layers on resize
      layers.length = 0;
      for (let l = 0; l < LAYER_COUNT; l++) {
        const count = 60 + l * 40;
        const stars = [];
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: 0.4 + (LAYER_COUNT - l) * 0.5 + Math.random() * 0.4,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.005 + Math.random() * 0.015,
          });
        }
        layers.push({ stars, speed: 0.05 + l * 0.08 });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const layer of layers) {
        for (const s of layer.stars) {
          s.x -= layer.speed;
          s.twinkle += s.twinkleSpeed;
          if (s.x < -2) s.x = W + 2;

          const alpha = 0.4 + Math.sin(s.twinkle) * 0.35;
          ctx.fillStyle = `rgba(200,210,240,${alpha})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
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


// ── CAMPFIRE ─────────────────────────────────────────────────────────────────
// Wide campfire with organic, irregularly-spaced flames rising directly from
// a broad coal bed. Flames overlap and merge for a natural look.

export const CampfireCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const embers = [];
    const EMBER_COUNT = 80;
    const smokeParticles = [];
    const SMOKE_COUNT = 22;
    const flameRoots = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const getGeo = () => {
      const W = canvas.width, H = canvas.height;
      const cx = W * 0.5;
      const baseY = H - 55;
      const bedW = Math.min(W * 0.40, 520);
      return { cx, baseY, bedW, W, H };
    };

    // ── Flame roots — irregularly clustered along the bed ──
    // Uses rejection sampling to create natural-looking clusters
    const initFlameRoots = () => {
      flameRoots.length = 0;

      // Cluster centers (random, biased toward center)
      const clusterCount = 2 + Math.floor(Math.random() * 2); // 2-3 clusters
      const clusters = [];
      for (let c = 0; c < clusterCount; c++) {
        // Gaussian-ish bias toward center
        const pos = (Math.random() + Math.random() + Math.random()) / 3 - 0.5; // -0.5 to 0.5, center-biased
        clusters.push({ pos, spread: 0.08 + Math.random() * 0.12 });
      }

      // Generate 9-12 flame roots clustered around those centers
      const count = 9 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        // Pick a random cluster or place independently
        let pos;
        if (Math.random() < 0.75 && clusters.length > 0) {
          const cl = clusters[Math.floor(Math.random() * clusters.length)];
          pos = cl.pos + (Math.random() - 0.5) * cl.spread * 2;
        } else {
          pos = (Math.random() - 0.5) * 0.85;
        }
        pos = Math.max(-0.45, Math.min(0.45, pos));

        // Distance from center affects max height
        const distFromCenter = Math.abs(pos);
        const centerBias = 1.0 - distFromCenter * 1.1;

        flameRoots.push({
          pos,
          phaseA: Math.random() * Math.PI * 2,
          phaseB: Math.random() * Math.PI * 2,
          phaseC: Math.random() * Math.PI * 2,
          speedA: 0.04 + Math.random() * 0.05,
          speedB: 0.07 + Math.random() * 0.07,
          speedC: 0.025 + Math.random() * 0.035,
          maxH: (0.5 + Math.random() * 0.5) * Math.max(0.25, centerBias),
          maxW: (0.6 + Math.random() * 0.4) * Math.max(0.35, centerBias),
          // Slight vertical offset so roots sit at different depths in the coals
          yOffset: (Math.random() - 0.5) * 8,
        });
      }
    };
    initFlameRoots();

    const spawnEmber = (W, H) => {
      const g = getGeo();
      return {
        x: g.cx + (Math.random() - 0.5) * g.bedW * 0.8,
        y: g.baseY - 10 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.9,
        vy: -(0.7 + Math.random() * 1.8),
        r: 1 + Math.random() * 3,
        life: 1.0,
        decay: 0.0015 + Math.random() * 0.003,
        hue: 10 + Math.random() * 35,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
      };
    };

    const spawnSmoke = (W, H) => {
      const g = getGeo();
      return {
        x: g.cx + (Math.random() - 0.5) * g.bedW * 0.5,
        y: g.baseY - 130 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(0.2 + Math.random() * 0.5),
        r: 10 + Math.random() * 18,
        life: 1.0,
        decay: 0.003 + Math.random() * 0.004,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.012,
      };
    };

    for (let i = 0; i < EMBER_COUNT; i++) {
      const e = spawnEmber(canvas.width, canvas.height);
      e.y = canvas.height * 0.15 + Math.random() * canvas.height * 0.65;
      e.life = Math.random();
      embers.push(e);
    }
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const s = spawnSmoke(canvas.width, canvas.height);
      s.y = canvas.height * 0.05 + Math.random() * canvas.height * 0.4;
      s.life = Math.random();
      smokeParticles.push(s);
    }

    // ── Draw flame tongue (bezier, origin sinks into coal bed) ──
    const drawFlame = (cx, baseY, w, h, sway, tipSway, color) => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, baseY);
      ctx.bezierCurveTo(
        cx - w * 0.55 + sway * 0.15, baseY - h * 0.22,
        cx - w * 0.25 + sway * 0.45, baseY - h * 0.62,
        cx + tipSway, baseY - h
      );
      ctx.bezierCurveTo(
        cx + w * 0.25 + sway * 0.45, baseY - h * 0.62,
        cx + w * 0.55 + sway * 0.15, baseY - h * 0.22,
        cx + w / 2, baseY
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    // ── Draw log ──
    const drawLog = (x, y, length, thickness, angle, glowPhase) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const lg = ctx.createLinearGradient(0, -thickness, 0, thickness);
      lg.addColorStop(0, "#5C3316");
      lg.addColorStop(0.35, "#3E200C");
      lg.addColorStop(0.7, "#321A0A");
      lg.addColorStop(1, "#261208");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(0, 0, length / 2, thickness, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bark
      ctx.strokeStyle = "rgba(80,45,15,0.3)";
      ctx.lineWidth = 0.8;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * (length / 8), -thickness * 0.6);
        ctx.lineTo(i * (length / 8) + 2, thickness * 0.6);
        ctx.stroke();
      }

      // End
      ctx.fillStyle = "#4A2810";
      ctx.beginPath();
      ctx.ellipse(length / 2 - 2, 0, thickness * 0.85, thickness, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glow on log
      const ga = 0.18 + Math.sin(glowPhase) * 0.12;
      const eg = ctx.createRadialGradient(-length * 0.1, 0, 0, -length * 0.1, 0, length * 0.2);
      eg.addColorStop(0, `rgba(255,100,20,${ga})`);
      eg.addColorStop(0.6, `rgba(200,50,5,${ga * 0.3})`);
      eg.addColorStop(1, "rgba(150,30,0,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(-length * 0.1, 0, length * 0.2, thickness * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const draw = () => {
      const { cx, baseY, bedW, W, H } = getGeo();
      ctx.clearRect(0, 0, W, H);

      const n1 = Math.sin(time * 0.07) * 0.15 + Math.sin(time * 0.13) * 0.1;
      const n2 = Math.cos(time * 0.09) * 0.12 + Math.sin(time * 0.17 + 1) * 0.08;
      const n3 = Math.sin(time * 0.11 + 2) * 0.1 + Math.cos(time * 0.06) * 0.1;
      const pulse = 1.0 + n1 * 0.2;

      // ── Wide ground light pool ──
      const gg = ctx.createRadialGradient(cx, baseY + 10, 20, cx, baseY + 10, bedW * 1.2);
      const ga = 0.06 * pulse;
      gg.addColorStop(0, `rgba(255,130,30,${ga * 2})`);
      gg.addColorStop(0.25, `rgba(240,90,15,${ga * 1.2})`);
      gg.addColorStop(0.55, `rgba(180,50,5,${ga * 0.4})`);
      gg.addColorStop(1, "rgba(80,20,0,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);

      // ── Upward light wash ──
      const ug = ctx.createRadialGradient(cx, baseY - 80, 30, cx, baseY - 80, H * 0.45);
      ug.addColorStop(0, `rgba(255,140,40,${0.035 * pulse})`);
      ug.addColorStop(0.4, `rgba(200,70,10,${0.015 * pulse})`);
      ug.addColorStop(1, "rgba(100,30,0,0)");
      ctx.fillStyle = ug;
      ctx.fillRect(0, 0, W, H);

      // ── Logs (behind coal bed, partially buried) ──
      drawLog(cx - bedW * 0.25, baseY + 14, bedW * 0.48, 9, -0.22, time * 0.06 + 1);
      drawLog(cx + bedW * 0.2, baseY + 15, bedW * 0.52, 10, 0.28, time * 0.06);
      drawLog(cx + bedW * 0.04, baseY + 19, bedW * 0.36, 7, -0.06, time * 0.08 + 2);
      drawLog(cx - bedW * 0.36, baseY + 8, bedW * 0.22, 6, -0.38, time * 0.07 + 3);
      drawLog(cx + bedW * 0.38, baseY + 10, bedW * 0.2, 6, 0.33, time * 0.07 + 4);

      // ── Coal bed (drawn OVER logs so flames come from the coals) ──
      // Dark ash base
      ctx.fillStyle = "rgba(25,10,3,0.75)";
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 8, bedW / 2 + 12, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      // Individual coals
      for (let i = 0; i < 35; i++) {
        const ct = (Math.random() - 0.5) * 0.92;
        const cxP = cx + ct * bedW;
        // Coals distributed in the oval
        const maxYSpread = Math.sqrt(1 - (ct / 0.5) * (ct / 0.5)) * 16;
        const cyP = baseY + 6 + (Math.random() - 0.5) * maxYSpread;
        const cr = 3 + Math.random() * 7;
        const cAng = Math.random() * Math.PI;

        ctx.fillStyle = "rgba(45,16,4,0.85)";
        ctx.beginPath();
        ctx.ellipse(cxP, cyP, cr, cr * 0.55, cAng, 0, Math.PI * 2);
        ctx.fill();

        // Hot glow per coal
        const cGlow = 0.2 + Math.sin(time * 0.05 + i * 1.1) * 0.2;
        const hotH = 8 + Math.sin(time * 0.03 + i * 0.7) * 10;
        ctx.fillStyle = `hsla(${hotH}, 100%, 48%, ${cGlow})`;
        ctx.beginPath();
        ctx.ellipse(cxP, cyP, cr * 0.5, cr * 0.3, cAng, 0, Math.PI * 2);
        ctx.fill();
      }

      // Continuous bed glow
      const bg = ctx.createRadialGradient(cx, baseY + 6, bedW * 0.04, cx, baseY + 6, bedW / 2);
      const bga = 0.14 + Math.sin(time * 0.04) * 0.04;
      bg.addColorStop(0, `rgba(255,100,15,${bga})`);
      bg.addColorStop(0.5, `rgba(220,60,5,${bga * 0.45})`);
      bg.addColorStop(1, "rgba(150,30,0,0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 6, bedW / 2, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Fire halo ──
      const halo = ctx.createRadialGradient(cx, baseY - 50, 20, cx, baseY - 25, bedW * 0.55);
      halo.addColorStop(0, `rgba(255,150,35,${0.08 * pulse})`);
      halo.addColorStop(0.4, `rgba(255,75,10,${0.03 * pulse})`);
      halo.addColorStop(1, "rgba(200,40,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 25, bedW * 0.55, bedW * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Flames rising FROM the coal bed ──
      // The key: flame baseY is pushed DOWN into the coal bed so they emerge from it
      for (const root of flameRoots) {
        root.phaseA += root.speedA;
        root.phaseB += root.speedB;
        root.phaseC += root.speedC;

        const rootX = cx + root.pos * bedW;
        // Flame origin is INSIDE the coal bed (baseY + offset pushes it down)
        const rootY = baseY + 10 + root.yOffset;

        const sway = Math.sin(root.phaseA) * 10 + Math.sin(root.phaseB) * 6;
        const tipSway = sway * 1.3 + Math.sin(root.phaseC) * 5;
        const hM = root.maxH * pulse;
        const wM = root.maxW;

        // Per-root intensity wobble
        const intensity = 0.8 + Math.sin(root.phaseA * 1.4 + root.phaseB) * 0.2;

        // L1: deep red (largest, most transparent)
        drawFlame(rootX, rootY,
          (60 + n2 * 10) * wM, (140 + n1 * 30) * hM,
          sway * 0.25, tipSway * 0.6,
          `rgba(150,25,0,${0.2 * intensity})`);

        // L2: orange
        drawFlame(rootX, rootY,
          (46 + n1 * 7) * wM, (115 + n2 * 22) * hM,
          sway * 0.35, tipSway * 0.8,
          `rgba(220,75,5,${0.32 * intensity})`);

        // L3: bright orange core
        drawFlame(rootX, rootY,
          (33 + n3 * 5) * wM, (88 + n3 * 18) * hM,
          sway * 0.45, tipSway * 0.95,
          `rgba(255,145,20,${0.42 * intensity})`);

        // L4: yellow
        drawFlame(rootX, rootY,
          (22 + n2 * 4) * wM, (62 + n1 * 14) * hM,
          sway * 0.5, tipSway,
          `rgba(255,210,45,${0.38 * intensity})`);

        // L5: white-hot center
        drawFlame(rootX, rootY,
          (12 + n1 * 3) * wM, (38 + n3 * 10) * hM,
          sway * 0.3, tipSway * 0.55,
          `rgba(255,245,175,${0.28 * intensity})`);
      }

      // ── Smoke ──
      for (let i = 0; i < smokeParticles.length; i++) {
        const s = smokeParticles[i];
        s.wobble += s.wobbleSpeed;
        s.x += s.vx + Math.sin(s.wobble) * 0.45;
        s.y += s.vy;
        s.r += 0.04;
        s.life -= s.decay;

        if (s.life <= 0) {
          smokeParticles[i] = spawnSmoke(W, H);
          continue;
        }

        const a = s.life * 0.05;
        const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        sg.addColorStop(0, `rgba(60,50,40,${a})`);
        sg.addColorStop(0.5, `rgba(50,42,35,${a * 0.5})`);
        sg.addColorStop(1, "rgba(40,35,30,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Heat shimmer ──
      ctx.save();
      ctx.globalAlpha = 0.018 + n1 * 0.01;
      for (let i = 0; i < 10; i++) {
        const sy = baseY - 150 - i * 30;
        const sx = cx + Math.sin(time * 0.02 + i * 0.8) * (bedW * 0.2 + i * 10);
        const sr = 25 + i * 14;
        const sh = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sh.addColorStop(0, "rgba(255,200,100,0.2)");
        sh.addColorStop(1, "rgba(255,200,100,0)");
        ctx.fillStyle = sh;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── Embers ──
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.wobble += e.wobbleSpeed;
        e.x += e.vx + Math.sin(e.wobble) * 0.35;
        e.y += e.vy;
        e.life -= e.decay;

        if (e.life <= 0) {
          embers[i] = spawnEmber(W, H);
          continue;
        }

        const a = e.life * 0.75;
        const eg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 7);
        eg.addColorStop(0, `hsla(${e.hue}, 95%, 60%, ${a * 0.3})`);
        eg.addColorStop(0.4, `hsla(${e.hue}, 90%, 50%, ${a * 0.08})`);
        eg.addColorStop(1, `hsla(${e.hue}, 85%, 40%, 0)`);
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${e.hue}, 100%, 75%, ${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }

      time++;
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


// ── SNOWFALL ─────────────────────────────────────────────────────────────────
// Gentle snowflakes drifting down with slight wind sway.

export const SnowfallCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const flakes = [];
    const FLAKE_COUNT = 120;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < FLAKE_COUNT; i++) {
      flakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 1 + Math.random() * 3,
        speed: 0.3 + Math.random() * 0.8,
        wind: (Math.random() - 0.5) * 0.3,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.005 + Math.random() * 0.01,
        opacity: 0.2 + Math.random() * 0.4,
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const f of flakes) {
        f.wobble += f.wobbleSpeed;
        f.x += f.wind + Math.sin(f.wobble) * 0.4;
        f.y += f.speed;

        if (f.y > H + f.r * 2) {
          f.y = -f.r * 2;
          f.x = Math.random() * W;
        }
        if (f.x < -10) f.x = W + 10;
        if (f.x > W + 10) f.x = -10;

        ctx.fillStyle = `rgba(220,230,245,${f.opacity})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();

        // Tiny glow
        if (f.r > 2) {
          const g = ctx.createRadialGradient(f.x, f.y, f.r, f.x, f.y, f.r * 3);
          g.addColorStop(0, `rgba(200,215,240,${f.opacity * 0.15})`);
          g.addColorStop(1, "rgba(200,215,240,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
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


// ── DEEP SEA ─────────────────────────────────────────────────────────────────
// Slow caustic light patterns (refracted light through water surface) +
// occasional bioluminescent particle drifts.

export const DeepSeaCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const particles = [];
    const PARTICLE_COUNT = 20;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1 - 0.05,
        r: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.02,
        hue: 170 + Math.random() * 40, // teal to blue
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Caustic light pattern at top ──
      const causticH = H * 0.35;
      for (let x = 0; x < W; x += 6) {
        const wave1 = Math.sin(x * 0.008 + time * 0.006) * 0.5;
        const wave2 = Math.sin(x * 0.015 + time * 0.004 + 1.5) * 0.3;
        const wave3 = Math.sin(x * 0.003 + time * 0.008) * 0.2;
        const combined = wave1 + wave2 + wave3;
        const alpha = Math.max(0, 0.015 + combined * 0.015);

        const yOffset = combined * 20;
        const grad = ctx.createLinearGradient(x, yOffset, x, causticH + yOffset);
        grad.addColorStop(0, `rgba(40,140,180,${alpha * 1.5})`);
        grad.addColorStop(0.5, `rgba(20,100,140,${alpha})`);
        grad.addColorStop(1, "rgba(20,100,140,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, 6, causticH + yOffset);
      }

      // ── Bioluminescent particles ──
      for (const p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase * 0.7) * 0.08;
        p.y += p.vy + Math.cos(p.phase * 0.5) * 0.05;

        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        const glow = 0.3 + Math.sin(p.phase) * 0.25;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 10);
        grad.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${glow * 0.2})`);
        grad.addColorStop(0.4, `hsla(${p.hue}, 70%, 50%, ${glow * 0.06})`);
        grad.addColorStop(1, `hsla(${p.hue}, 60%, 40%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      time++;
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


// ── CRT MONITOR ──────────────────────────────────────────────────────────────
// Scanline overlay + subtle flicker + slight barrel distortion glow.
// Uses canvas for the scanlines so it layers cleanly over all content.

export const CRTCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Scanlines ──
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1);
      }

      // ── Flicker (subtle brightness variation) ──
      const flicker = Math.random() * 0.03;
      if (flicker > 0.02) {
        ctx.fillStyle = `rgba(20,40,20,${flicker})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Occasional horizontal glitch line ──
      if (Math.random() > 0.995) {
        const glitchY = Math.random() * H;
        const glitchH = 1 + Math.random() * 3;
        ctx.fillStyle = "rgba(51,255,51,0.06)";
        ctx.fillRect(0, glitchY, W, glitchH);
      }

      // ── Vignette (darkened edges) ──
      const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Phosphor glow at edges ──
      const edgeGlow = 0.02 + Math.sin(time * 0.02) * 0.01;
      ctx.strokeStyle = `rgba(51,255,51,${edgeGlow})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, W - 4, H - 4);

      time++;
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

// ── AUDIO VISUALIZER ──────────────────────────────────────────────────────────
// Frequency bars + waveform + reactive particles.
// Canvas stays pointerEvents:"none" like all other themes.
// A small overlay div provides System Audio / Microphone buttons.

export const AudioVisualizerCanvas = () => {
  const [audioState, setAudioState] = useState("idle"); // idle | listening | ended
  const [sourceLabel, setSourceLabel] = useState("");

  // Refs shared between the canvas animation and button handlers
  const audioRef = useRef({ ctx: null, analyser: null, stream: null, freqData: null, timeData: null });

  const cleanup = () => {
    const a = audioRef.current;
    if (a.stream) a.stream.getTracks().forEach(t => t.stop());
    if (a.ctx && a.ctx.state !== "closed") a.ctx.close().catch(() => {});
    a.analyser = null; a.stream = null; a.freqData = null; a.timeData = null;
  };

  const connectStream = (mediaStream, label) => {
    cleanup();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    const source = ctx.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    audioRef.current = {
      ctx, analyser, stream: mediaStream,
      freqData: new Uint8Array(analyser.frequencyBinCount),
      timeData: new Uint8Array(analyser.fftSize),
    };

    setAudioState("listening");
    setSourceLabel(label);

    // If stream ends externally, fall back
    mediaStream.getTracks().forEach(track => {
      track.addEventListener("ended", () => {
        setAudioState("idle");
        setSourceLabel("");
      });
    });
  };

  const handleSystemAudio = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true, audio: true,
      });
      displayStream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.log("No audio track — make sure 'Share audio' is checked");
        return;
      }
      connectStream(new MediaStream(audioTracks), "System Audio");
    } catch (e) {
      console.log("System audio capture cancelled or denied");
    }
  };

  const handleMicrophone = async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      connectStream(micStream, "Microphone");
    } catch (e) {
      console.log("Microphone access denied or unavailable");
    }
  };

  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;

    // ── Simulated frequency ──
    const SIM_BINS = 64;
    const simFreq = new Uint8Array(SIM_BINS);
    const simSmooth = new Float32Array(SIM_BINS);
    const simPhases = [];
    for (let i = 0; i < SIM_BINS; i++) {
      simPhases.push({
        a: Math.random() * Math.PI * 2, b: Math.random() * Math.PI * 2, c: Math.random() * Math.PI * 2,
        sa: 0.02 + Math.random() * 0.04, sb: 0.05 + Math.random() * 0.08, sc: 0.01 + Math.random() * 0.02,
        base: Math.max(0, 180 - i * 2.2 + Math.random() * 30), amp: 40 + Math.random() * 30,
      });
    }

    // ── Particles ──
    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random(), y: Math.random(), vx: 0, vy: 0,
        r: 1 + Math.random() * 2, hue: 180 + Math.random() * 120, phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const updateSim = () => {
      const beat = Math.max(0, Math.sin(time * 0.035) * 0.5 + Math.sin(time * 0.057) * 0.3);
      const bb = beat * 80;
      for (let i = 0; i < SIM_BINS; i++) {
        const p = simPhases[i];
        p.a += p.sa; p.b += p.sb; p.c += p.sc;
        let v = p.base + Math.sin(p.a) * p.amp * 0.5 + Math.sin(p.b) * p.amp * 0.3 + Math.sin(p.c) * p.amp * 0.2;
        if (i < 12) v += bb * (1 - i / 12);
        if (i > 15 && i < 35) v += beat * 30;
        v = Math.max(0, Math.min(255, v));
        simSmooth[i] += (v - simSmooth[i]) * 0.15;
        simFreq[i] = Math.round(simSmooth[i]);
      }
    };

    const getFreq = () => {
      const a = audioRef.current;
      if (a.analyser && a.freqData) {
        a.analyser.getByteFrequencyData(a.freqData);
        a.analyser.getByteTimeDomainData(a.timeData);
        return { freq: a.freqData, wave: a.timeData, bins: a.analyser.frequencyBinCount };
      }
      updateSim();
      return { freq: simFreq, wave: null, bins: SIM_BINS };
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const { freq, wave, bins } = getFreq();

      let bass = 0;
      for (let i = 0; i < Math.min(8, bins); i++) bass += freq[i];
      bass /= Math.min(8, bins) * 255;

      // ── Background pulse ──
      if (bass * 0.06 > 0.005) {
        ctx.fillStyle = `rgba(0,240,255,${bass * 0.06})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Frequency bars ──
      const bc = Math.min(bins, 64), gap = 2, tw = W * 0.85;
      const bw = (tw - gap * (bc - 1)) / bc, sx = (W - tw) / 2, by = H - 30, mh = H * 0.45;

      for (let i = 0; i < bc; i++) {
        const val = freq[i] / 255, bh = val * mh;
        const x = sx + i * (bw + gap);
        const hue = 180 + (i / bc) * 120, sat = 80 + val * 20, lt = 45 + val * 20;

        // Glow
        const gh = bh * 1.1;
        const gl = ctx.createLinearGradient(x, by, x, by - gh);
        gl.addColorStop(0, `hsla(${hue},${sat}%,${lt}%,0.6)`);
        gl.addColorStop(0.6, `hsla(${hue},${sat}%,${lt + 10}%,0.3)`);
        gl.addColorStop(1, `hsla(${hue},${sat}%,${lt + 20}%,0)`);
        ctx.fillStyle = gl;
        ctx.fillRect(x - 1, by - gh, bw + 2, gh);

        // Bar
        const bg = ctx.createLinearGradient(x, by, x, by - bh);
        bg.addColorStop(0, `hsla(${hue},${sat}%,${lt}%,0.9)`);
        bg.addColorStop(0.5, `hsla(${hue + 10},${sat}%,${lt + 5}%,0.8)`);
        bg.addColorStop(1, `hsla(${hue + 20},${sat - 10}%,${lt + 15}%,0.6)`);
        ctx.fillStyle = bg;
        ctx.fillRect(x, by - bh, bw, bh);

        if (bh > 2) {
          ctx.fillStyle = `hsla(${hue},95%,80%,${0.5 + val * 0.5})`;
          ctx.fillRect(x, by - bh - 2, bw, 2);
        }
      }

      // ── Mirror ──
      ctx.save(); ctx.globalAlpha = 0.12;
      for (let i = 0; i < bc; i++) {
        const val = freq[i] / 255, bh = val * mh * 0.3, x = sx + i * (bw + gap);
        ctx.fillStyle = `hsla(${180 + (i / bc) * 120},70%,50%,0.5)`;
        ctx.fillRect(x, by + 2, bw, bh);
      }
      ctx.restore();

      // ── Waveform ──
      const wy = H * 0.35, wa = 40 + bass * 60;
      ctx.beginPath(); ctx.lineWidth = 2;
      if (wave) {
        for (let i = 0; i < wave.length; i++) {
          const x = (i / wave.length) * W, y = wy + ((wave[i] - 128) / 128) * wa;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      } else {
        for (let i = 0; i < 200; i++) {
          const t = i / 200, x = t * W;
          let y = wy;
          for (let h = 0; h < 6; h++) y += Math.sin(t * Math.PI * 2 * (h + 1) + time * 0.03 * (h + 1)) * (freq[h * 3] / 255) * wa * 0.2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(0,240,255,${0.3 + bass * 0.4})`;
      ctx.shadowColor = "rgba(0,240,255,0.5)";
      ctx.shadowBlur = 8 + bass * 12;
      ctx.stroke(); ctx.shadowBlur = 0;

      // ── Particles ──
      for (const p of particles) {
        p.phase += 0.02;
        p.vx += (p.x - 0.5) * bass * 0.008;
        p.vy += (p.y - 0.5) * bass * 0.008 - 0.0003;
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -0.05) p.x = 1.05; if (p.x > 1.05) p.x = -0.05;
        if (p.y < -0.05) p.y = 1.05; if (p.y > 1.05) p.y = -0.05;

        const px = p.x * W, py = p.y * H;
        const al = 0.2 + bass * 0.4 + Math.sin(p.phase) * 0.1;
        const pr = p.r * (4 + bass * 6);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, `hsla(${p.hue},90%,65%,${al * 0.4})`);
        pg.addColorStop(1, `hsla(${p.hue},80%,50%,0)`);
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${p.hue},95%,75%,${al})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
      }

      time++;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
      cleanup();
    };
  }, []);

  const btnStyle = {
    padding: "8px 18px",
    borderRadius: 6,
    border: "1px solid rgba(160,160,224,0.25)",
    background: "rgba(16,16,30,0.85)",
    color: "rgba(192,192,240,0.8)",
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: 12,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    transition: "all 0.15s ease",
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          zIndex: 0, pointerEvents: "none",
        }}
      />
      {audioState === "idle" && (
        <div style={{
          position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
          zIndex: 1, display: "flex", gap: 12, alignItems: "center",
        }}>
          <span style={{
            fontSize: 10, color: "rgba(128,128,170,0.5)",
            fontFamily: "'JetBrains Mono','Fira Code',monospace",
            position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}>
            Choose an audio source to visualize
          </span>
          <button
            onClick={handleSystemAudio}
            style={btnStyle}
            onMouseEnter={e => { e.target.style.background = "rgba(0,240,255,0.12)"; e.target.style.borderColor = "rgba(0,240,255,0.4)"; }}
            onMouseLeave={e => { e.target.style.background = "rgba(16,16,30,0.85)"; e.target.style.borderColor = "rgba(160,160,224,0.25)"; }}
          >
            🔊 System Audio
          </button>
          <button
            onClick={handleMicrophone}
            style={btnStyle}
            onMouseEnter={e => { e.target.style.background = "rgba(0,240,255,0.12)"; e.target.style.borderColor = "rgba(0,240,255,0.4)"; }}
            onMouseLeave={e => { e.target.style.background = "rgba(16,16,30,0.85)"; e.target.style.borderColor = "rgba(160,160,224,0.25)"; }}
          >
            🎤 Microphone
          </button>
        </div>
      )}
      {audioState === "listening" && sourceLabel && (
        <div style={{
          position: "fixed", bottom: 12, right: 20, zIndex: 1,
          fontSize: 10, color: "rgba(160,160,224,0.4)",
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
        }}>
          ● {sourceLabel}
        </div>
      )}
    </>
  );
};


// ── AMBIENT PARTICLES ─────────────────────────────────────────────────────────
// Very subtle theme-colored floating particles — the fallback animation for
// all themes that don't have a dedicated canvas effect.

export const AmbientCanvas = () => {
  const T = useTheme();
  const themeRef = useRef(T);
  useEffect(() => { themeRef.current = T; }, [T]);

  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const particles = [];
    const COUNT = 35;

    const hexToRgb = (hex) => {
      if (!hex || hex[0] !== "#" || hex.length < 7) return { r: 128, g: 128, b: 200 };
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      };
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 1.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.008,
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const { r, g, b } = hexToRgb(themeRef.current.accent);

      for (const p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase * 1.3) * 0.06;
        p.y += p.vy + Math.cos(p.phase * 0.9) * 0.05;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        const alpha = Math.max(0, 0.025 + Math.sin(p.phase) * 0.02);
        const radius = p.r * (0.85 + Math.sin(p.phase * 1.7) * 0.15);

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 7);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 7, 0, Math.PI * 2);
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
    <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />
  );
};


// ── CLOUDY SKY ────────────────────────────────────────────────────────────────
// Soft cloud masses slowly drifting across the screen.

export const CloudyCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const clouds = [];
    const CLOUD_COUNT = 6;

    const spawnCloud = (W, H, offscreen = false) => ({
      x: offscreen ? W + 200 + Math.random() * 400 : Math.random() * (W + 600) - 300,
      y: H * (0.05 + Math.random() * 0.55),
      scale: 0.6 + Math.random() * 1.4,
      speed: 0.12 + Math.random() * 0.2,
      opacity: 0.22 + Math.random() * 0.20,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.001 + Math.random() * 0.002,
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      clouds.length = 0;
      for (let i = 0; i < CLOUD_COUNT; i++) clouds.push(spawnCloud(canvas.width, canvas.height));
    };
    resize();
    window.addEventListener("resize", resize);

    const drawCloud = (x, y, scale, opacity) => {
      const blobs = [
        { dx: 0, dy: 0, r: 55 }, { dx: 55, dy: -20, r: 45 }, { dx: -55, dy: -15, r: 42 },
        { dx: 90, dy: 0, r: 35 }, { dx: -90, dy: 5, r: 35 },
        { dx: 30, dy: -45, r: 38 }, { dx: -30, dy: -40, r: 36 },
      ];
      for (const blob of blobs) {
        const bx = x + blob.dx * scale;
        const by = y + blob.dy * scale;
        const br = blob.r * scale;
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, `rgba(210,220,240,${opacity})`);
        grad.addColorStop(0.45, `rgba(190,205,228,${opacity * 0.85})`);
        grad.addColorStop(0.75, `rgba(170,185,215,${opacity * 0.4})`);
        grad.addColorStop(1, "rgba(150,170,205,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const c of clouds) {
        c.wobble += c.wobbleSpeed;
        c.x -= c.speed;
        if (c.x < -500) Object.assign(c, spawnCloud(W, H, true));
        drawCloud(c.x, c.y + Math.sin(c.wobble) * 4, c.scale, c.opacity);
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
};


// ── THUNDERSTORM ──────────────────────────────────────────────────────────────
// Heavy driving rain with intense lightning bolts.

export const ThunderstormCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let time = 0;
    let lightningTimer = 0;
    let lightningAlpha = 0;
    let lightningBolt = null;

    const drops = [];
    const DROP_COUNT = 500;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < DROP_COUNT; i++) {
      drops.push({
        x: Math.random() * canvas.width * 1.5 - canvas.width * 0.25,
        y: Math.random() * canvas.height,
        len: 16 + Math.random() * 28,
        speed: 12 + Math.random() * 14,
        opacity: 0.10 + Math.random() * 0.18,
        wind: 3 + Math.random() * 3,
      });
    }

    const buildBolt = (W, H) => {
      const startX = W * 0.2 + Math.random() * W * 0.6;
      const points = [{ x: startX, y: 0 }];
      let cx = startX;
      const segments = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < segments; i++) {
        cx += (Math.random() - 0.5) * 80;
        points.push({ x: cx, y: (H / segments) * (i + 1) * (0.4 + Math.random() * 0.4) });
      }
      return points;
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Lightning flash ──
      lightningTimer++;
      if (lightningTimer > 120 + Math.random() * 200) {
        lightningAlpha = 0.25 + Math.random() * 0.20;
        lightningBolt = buildBolt(W, H);
        lightningTimer = 0;
      }
      if (lightningAlpha > 0) {
        ctx.fillStyle = `rgba(210,220,255,${lightningAlpha})`;
        ctx.fillRect(0, 0, W, H);
        if (lightningBolt && lightningAlpha > 0.08) {
          ctx.save();
          ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, lightningAlpha * 3)})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(150,180,255,0.9)";
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(lightningBolt[0].x, lightningBolt[0].y);
          for (const pt of lightningBolt.slice(1)) ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
          ctx.restore();
        }
        lightningAlpha *= 0.80;
        if (lightningAlpha < 0.005) { lightningAlpha = 0; lightningBolt = null; }
      }

      // ── Rain streaks ──
      ctx.lineCap = "round";
      for (const d of drops) {
        d.y += d.speed;
        d.x += d.wind;
        if (d.y > H) {
          d.y = -d.len;
          d.x = Math.random() * W * 1.5 - W * 0.25;
        }
        ctx.strokeStyle = `rgba(140,165,210,${d.opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.wind * 1.5, d.y + d.len);
        ctx.stroke();
      }

      // ── Ground mist ──
      const mistGrad = ctx.createLinearGradient(0, H * 0.88, 0, H);
      mistGrad.addColorStop(0, "rgba(80,100,140,0)");
      mistGrad.addColorStop(1, `rgba(80,100,140,${0.05 + Math.sin(time * 0.006) * 0.02})`);
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, H * 0.88, W, H * 0.12);

      time++;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
};


// ── FOG ───────────────────────────────────────────────────────────────────────
// Slow drifting translucent fog masses.

export const FogCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const blobs = [];
    const BLOB_COUNT = 8;

    const spawnBlob = (W, H, offscreen = false) => ({
      x: offscreen ? W + 200 + Math.random() * 600 : Math.random() * (W + 600) - 300,
      y: H * (0.3 + Math.random() * 0.7),
      rx: 200 + Math.random() * 300,
      ry: 60 + Math.random() * 100,
      speed: 0.06 + Math.random() * 0.12,
      opacity: 0.04 + Math.random() * 0.06,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.0006 + Math.random() * 0.001,
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      blobs.length = 0;
      for (let i = 0; i < BLOB_COUNT; i++) blobs.push(spawnBlob(canvas.width, canvas.height));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const b of blobs) {
        b.wobble += b.wobbleSpeed;
        b.x -= b.speed;
        if (b.x < -600) Object.assign(b, spawnBlob(W, H, true));

        ctx.save();
        ctx.translate(b.x, b.y + Math.sin(b.wobble) * 12);
        ctx.scale(1, b.ry / b.rx);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, b.rx);
        grad.addColorStop(0, `rgba(190,200,215,${b.opacity})`);
        grad.addColorStop(0.6, `rgba(180,190,205,${b.opacity * 0.5})`);
        grad.addColorStop(1, "rgba(180,190,205,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, b.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
};


// ── SUNSHINE ─────────────────────────────────────────────────────────────────
// Warm golden bokeh motes rising gently — visible on light daytime backgrounds.

export const SunshineCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const motes = [];
    const COUNT = 50;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      motes.push({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * canvas.height,
        r: 14 + Math.random() * 36,
        speed: 0.18 + Math.random() * 0.28,
        drift: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.004 + Math.random() * 0.006,
        hue: 38 + Math.random() * 18,    // warm gold → amber
        opacity: 0.16 + Math.random() * 0.18,
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Soft warm sun-glow pooling at the top of the screen
      const sunGlow = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, H * 0.55);
      sunGlow.addColorStop(0, "rgba(255,230,120,0.13)");
      sunGlow.addColorStop(0.5, "rgba(255,210,80,0.05)");
      sunGlow.addColorStop(1, "rgba(255,200,60,0)");
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, W, H);

      for (const m of motes) {
        m.wobble += m.wobbleSpeed;
        m.y -= m.speed;
        m.x += m.drift + Math.sin(m.wobble) * 0.3;

        if (m.y < -m.r * 4) {
          m.y = H + m.r * 2;
          m.x = Math.random() * W;
        }

        const pulse = m.opacity * (0.75 + Math.sin(m.wobble * 1.4) * 0.25);
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        grad.addColorStop(0, `hsla(${m.hue}, 95%, 72%, ${pulse})`);
        grad.addColorStop(0.45, `hsla(${m.hue}, 85%, 65%, ${pulse * 0.55})`);
        grad.addColorStop(1, `hsla(${m.hue}, 75%, 60%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
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

  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
};


// ── MAINLY CLEAR CANVAS ───────────────────────────────────────────────────────
// Sky-blue bokeh motes rising slowly + a couple of thin wispy cloud streaks.

export const MainlyClearCanvas = () => {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Sky-blue bokeh motes
    const motes = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * canvas.height,
      r: 10 + Math.random() * 30,
      speed: 0.12 + Math.random() * 0.20,
      drift: (Math.random() - 0.5) * 0.20,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.003 + Math.random() * 0.005,
      hue: 200 + Math.random() * 30,   // sky blue → cyan-blue
      opacity: 0.12 + Math.random() * 0.14,
    }));

    // Thin wispy cloud streaks (static shape, just drift slowly sideways)
    const wisps = Array.from({ length: 3 }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: 40 + i * 70 + Math.random() * 30,
      w: 200 + Math.random() * 300,
      h: 18 + Math.random() * 14,
      speed: 0.08 + Math.random() * 0.10,
      opacity: 0.10 + Math.random() * 0.10,
    }));

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Very faint blue sky wash at the top
      const skyGlow = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      skyGlow.addColorStop(0, "rgba(160,210,255,0.08)");
      skyGlow.addColorStop(1, "rgba(160,210,255,0)");
      ctx.fillStyle = skyGlow;
      ctx.fillRect(0, 0, W, H);

      // Wispy cloud streaks
      for (const w of wisps) {
        w.x += w.speed;
        if (w.x > W + w.w) w.x = -w.w;
        const cg = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.w * 0.5);
        cg.addColorStop(0, `rgba(255,255,255,${w.opacity})`);
        cg.addColorStop(0.5, `rgba(240,248,255,${w.opacity * 0.5})`);
        cg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.scale(1, w.h / (w.w * 0.5));
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(w.x, w.y * (w.w * 0.5) / w.h, w.w * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Rising sky-blue bokeh
      for (const m of motes) {
        m.wobble += m.wobbleSpeed;
        m.y -= m.speed;
        m.x += m.drift + Math.sin(m.wobble) * 0.25;
        if (m.y < -m.r * 4) { m.y = H + m.r * 2; m.x = Math.random() * W; }
        const pulse = m.opacity * (0.75 + Math.sin(m.wobble * 1.3) * 0.25);
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        grad.addColorStop(0, `hsla(${m.hue}, 80%, 72%, ${pulse})`);
        grad.addColorStop(0.45, `hsla(${m.hue}, 70%, 65%, ${pulse * 0.5})`);
        grad.addColorStop(1, `hsla(${m.hue}, 60%, 60%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
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

  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
};


// ── WEATHER INFO CARD ─────────────────────────────────────────────────────────
// Displayed when the Weather theme is active. Receives resolved weather data
// from App.jsx (which handles geolocation + Open-Meteo fetch) and shows the
// current condition, temperature, and city — sitting just above the sidebar FRD.

const WMO_INFO = {
  0:  { label: "Clear Sky",           emoji: "🌞" },
  1:  { label: "Mainly Clear",        emoji: "🌤️" },
  2:  { label: "Partly Cloudy",       emoji: "⛅" },
  3:  { label: "Overcast",            emoji: "☁️" },
  45: { label: "Foggy",               emoji: "🌫️" },
  48: { label: "Icy Fog",             emoji: "🌫️" },
  51: { label: "Light Drizzle",       emoji: "🌦️" },
  53: { label: "Drizzle",             emoji: "🌦️" },
  55: { label: "Heavy Drizzle",       emoji: "🌧️" },
  61: { label: "Light Rain",          emoji: "🌧️" },
  63: { label: "Rain",                emoji: "🌧️" },
  65: { label: "Heavy Rain",          emoji: "🌧️" },
  71: { label: "Light Snow",          emoji: "🌨️" },
  73: { label: "Snow",                emoji: "🌨️" },
  75: { label: "Heavy Snow",          emoji: "❄️" },
  77: { label: "Snow Grains",         emoji: "❄️" },
  80: { label: "Rain Showers",        emoji: "🌦️" },
  81: { label: "Heavy Showers",       emoji: "🌧️" },
  82: { label: "Violent Showers",     emoji: "⛈️" },
  85: { label: "Snow Showers",        emoji: "🌨️" },
  86: { label: "Heavy Snow Showers",  emoji: "❄️" },
  95: { label: "Thunderstorm",        emoji: "⛈️" },
  96: { label: "Thunderstorm + Hail", emoji: "⛈️" },
  99: { label: "Severe Thunderstorm", emoji: "⛈️" },
};

export const WeatherInfoCard = ({ weatherData }) => {
  const T = useTheme();
  if (!weatherData) return null;

  const { code, temp, city, state } = weatherData;
  const info = WMO_INFO[code] ?? { label: `Unknown (WMO ${code})`, emoji: "🌡️" };
  const locationStr = [city, state].filter(Boolean).join(", ");
  const tempStr = temp !== null && temp !== undefined ? `${Math.round(temp)}°F` : null;
  const sub = [tempStr, locationStr].filter(Boolean).join(" · ");

  return (
    <div style={{
      position: "fixed", bottom: 38, left: 8, zIndex: 1,
      display: "flex", alignItems: "center", gap: 12,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "10px 16px",
      fontFamily: font,
      pointerEvents: "none",
      boxShadow: `0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px ${T.border}`,
    }}>
      <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{info.emoji}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.textBright, lineHeight: 1.3 }}>
          {info.label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, letterSpacing: "0.01em" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
};

// ── CLIPPY COMPANION ──────────────────────────────────────────────────────────
// The beloved(?) Office assistant, now haunting your QA workflow.
// DOM-based (not canvas) — he needs to be clickable. Barely.
// Flees from the cursor, dispenses unsolicited QA advice, and respawns
// 15 seconds after being caught. There is no escape. Only themes.

const CLIPPY_QUIPS = [
  "It looks like you're writing a test case! Would you like help?",
  "Have you considered the sad path?",
  "Pro tip: 'Works on my machine' is not a valid expected result.",
  "You haven't generated test cases in a while. Everything okay?",
  "I notice you're still in Draft. Living dangerously?",
  "Need help? Too bad, I'm just a paperclip.",
  "Did you mean to leave that precondition blank, or...?",
  "I'm not saying your coverage is low, but... it's low.",
  "Fun fact: I can't be closed. I've tried.",
  "Have you tried turning the requirement off and on again?",
  "That's a lot of draft test cases. Just saying.",
  "Remember: a test case without expected results is just a suggestion.",
  "You look like you could use a boundary value analysis.",
  "I've been watching you work. We need to talk about your test coverage.",
  "According to my calculations, you're 73% done. I made that up.",
  "I see 0 test cases linked to this requirement. Bold strategy.",
  "Let's make sure this will help the boots on the ground.",
  "Will this test end up with a bricked VCU?",
  "I'm Clippy, your useless TestForge Assistant!",
  "Did you know that a John Deere 9RX could till 394,200,000 acres if ran continously for 900 years?",
  "YouTube was initially created as a video-dating site. The more you know.",
];

export const ClippyCompanion = () => {
  const T = useTheme();

  // ── Refs for animation loop (no re-renders) ──
  const containerRef = useRef(null);
  const pupilLRef = useRef(null);
  const pupilRRef = useRef(null);
  const eyeLRef = useRef(null);
  const eyeRRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const mouse = useRef({ x: -9999, y: -9999 });
  const stateRef = useRef("idle"); // idle | dead
  const frameRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const lastBlink = useRef(0);
  const blinkRemaining = useRef(0);

  // ── React state (infrequent updates only) ──
  const [dead, setDead] = useState(false);
  const [deathAnim, setDeathAnim] = useState(false);
  const [bubble, setBubble] = useState(null);

  const SIZE = 62;
  const FLEE_RADIUS = 180;
  const FLEE_FORCE = 22;
  const FRICTION = 0.93;

  // ── Eye pupil positions in SVG coordinates ──
  const EYE_L = { cx: 21, cy: 28 };
  const EYE_R = { cx: 33, cy: 28 };
  const MAX_PUPIL_OFFSET = 2.8;

  useEffect(() => {
    // Initial position: bottom-right area
    pos.current = {
      x: window.innerWidth - SIZE - 40,
      y: window.innerHeight - SIZE - 120,
    };
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
    }

    // Mouse tracking
    const onMouse = (e) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouse);

    // ── Bubble scheduler (recursive setTimeout for random intervals) ──
    const scheduleBubble = () => {
      bubbleTimerRef.current = setTimeout(() => {
        if (stateRef.current !== "dead") {
          const speed = Math.sqrt(vel.current.x ** 2 + vel.current.y ** 2);
          if (speed < 1.5) {
            const quip = CLIPPY_QUIPS[Math.floor(Math.random() * CLIPPY_QUIPS.length)];
            setBubble(quip);
            setTimeout(() => setBubble((b) => (b === quip ? null : b)), 5500);
          }
        }
        scheduleBubble();
      }, 8000 + Math.random() * 7000);
    };

    // First bubble after short delay
    const introTimer = setTimeout(() => {
      setBubble("It looks like you're writing a test case! Would you like help?");
      setTimeout(() => setBubble(null), 5500);
      scheduleBubble();
    }, 2500);

    // ── Animation loop ──
    const tick = (now) => {
      frameRef.current = requestAnimationFrame(tick);
      if (stateRef.current === "dead") return;

      const p = pos.current;
      const v = vel.current;
      const m = mouse.current;

      // Center of Clippy
      const cx = p.x + SIZE / 2;
      const cy = p.y + SIZE / 2;
      const dx = cx - m.x;
      const dy = cy - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Flee when cursor is close
      if (dist < FLEE_RADIUS && dist > 1) {
        const intensity = 1 - dist / FLEE_RADIUS;
        const force = FLEE_FORCE * intensity * intensity; // quadratic falloff
        v.x += (dx / dist) * force;
        v.y += (dy / dist) * force;
        // Clear bubble when fleeing
        setBubble(null);
      }

      // Friction
      v.x *= FRICTION;
      v.y *= FRICTION;

      // Update position
      p.x += v.x;
      p.y += v.y;

      // Bounce off viewport edges
      const maxX = window.innerWidth - SIZE;
      const maxY = window.innerHeight - SIZE;
      if (p.x < 0) { p.x = 0; v.x = Math.abs(v.x) * 0.5; }
      if (p.x > maxX) { p.x = maxX; v.x = -Math.abs(v.x) * 0.5; }
      if (p.y < 0) { p.y = 0; v.y = Math.abs(v.y) * 0.5; }
      if (p.y > maxY) { p.y = maxY; v.y = -Math.abs(v.y) * 0.5; }

      // DOM update
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }

      // ── Eye tracking ──
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);

      // Blink every 3-6 seconds
      if (now - lastBlink.current > 3000 + Math.random() * 3000 * 60) {
        // Only reset timer at frame boundaries
        if (blinkRemaining.current <= 0) {
          lastBlink.current = now;
          blinkRemaining.current = 150;
        }
      }
      const isBlinking = blinkRemaining.current > 0;
      if (isBlinking) blinkRemaining.current -= 16;

      if (eyeLRef.current && eyeRRef.current) {
        const ry = isBlinking ? "1.5" : "5.5";
        eyeLRef.current.setAttribute("ry", ry);
        eyeRRef.current.setAttribute("ry", ry);
      }

      if (pupilLRef.current && pupilRRef.current && !isBlinking) {
        // Pupils track mouse position
        const lookX = m.x;
        const lookY = m.y;

        for (const [ref, eye] of [[pupilLRef, EYE_L], [pupilRRef, EYE_R]]) {
          // Eye position in screen space (approximate, SVG is ~52x72 within SIZE container)
          const eyeScreenX = p.x + (eye.cx / 52) * SIZE;
          const eyeScreenY = p.y + (eye.cy / 72) * SIZE;
          const edx = lookX - eyeScreenX;
          const edy = lookY - eyeScreenY;
          const eDist = Math.sqrt(edx * edx + edy * edy) || 1;
          // Scale offset — closer mouse = bigger offset, capped
          const offsetScale = Math.min(1, eDist / 150);
          const ox = (edx / eDist) * MAX_PUPIL_OFFSET * offsetScale;
          const oy = (edy / eDist) * MAX_PUPIL_OFFSET * offsetScale;

          // When fleeing fast, eyes go wide (pupils shrink offset toward center)
          const panicFactor = Math.min(1, speed / 15);
          const finalOx = ox * (1 - panicFactor * 0.5);
          const finalOy = oy * (1 - panicFactor * 0.5);

          ref.current.setAttribute("cx", eye.cx + finalOx);
          ref.current.setAttribute("cy", eye.cy + finalOy);
          // Slightly larger pupils when panicking
          ref.current.setAttribute("r", 2.5 + panicFactor * 0.8);
        }
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouse);
      cancelAnimationFrame(frameRef.current);
      clearTimeout(bubbleTimerRef.current);
      clearTimeout(introTimer);
    };
  }, []);

  // ── Catch handler ──
  const handleClick = () => {
    if (stateRef.current === "dead") return;
    stateRef.current = "dead";
    setBubble(null);
    setDeathAnim(true);

    // After death animation, hide and schedule respawn
    setTimeout(() => {
      setDead(true);
      setDeathAnim(false);

      // Respawn after 15 seconds
      setTimeout(() => {
        const corners = [
          { x: 30, y: 30 },
          { x: window.innerWidth - SIZE - 30, y: 30 },
          { x: 30, y: window.innerHeight - SIZE - 30 },
          { x: window.innerWidth - SIZE - 30, y: window.innerHeight - SIZE - 30 },
        ];
        // Pick a random corner that's far from the mouse
        let best = corners[0], bestDist = 0;
        for (const c of corners) {
          const d = Math.sqrt((c.x + SIZE / 2 - mouse.current.x) ** 2 + (c.y + SIZE / 2 - mouse.current.y) ** 2);
          if (d > bestDist) { bestDist = d; best = c; }
        }

        pos.current = { ...best };
        vel.current = { x: 0, y: 0 };
        stateRef.current = "idle";
        setDead(false);

        if (containerRef.current) {
          containerRef.current.style.transform = `translate(${best.x}px, ${best.y}px)`;
        }

        setBubble("You can't get rid of me that easily.");
        setTimeout(() => setBubble(null), 4500);
      }, 15000);
    }, 700);
  };

  if (dead) return null;

  return (
    <>
      <style>{`
        @keyframes clippyBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes clippyDeath {
          0% { transform: scale(1) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 0.8; }
          100% { transform: scale(0) rotate(720deg); opacity: 0; }
        }
        @keyframes clippyBubbleIn {
          from { opacity: 0; transform: translateY(8px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        ref={containerRef}
        onClick={handleClick}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: SIZE,
          height: SIZE + 10,
          zIndex: 9998,
          cursor: "pointer",
          userSelect: "none",
          // No transition — position is updated via rAF on the transform
        }}
      >
        {/* Speech bubble */}
        {bubble && (
          <div
            style={{
              position: "absolute",
              bottom: SIZE + 14,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#FFFFCC",
              border: "1px solid #999",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 11,
              fontFamily: font,
              color: "#333",
              whiteSpace: "pre-line",
              lineHeight: 1.4,
              boxShadow: "2px 2px 6px rgba(0,0,0,0.2)",
              minWidth: 160,
              maxWidth: 220,
              textAlign: "center",
              animation: "clippyBubbleIn 0.25s ease-out",
              pointerEvents: "none",
            }}
          >
            {bubble}
            {/* Triangle pointer */}
            <div
              style={{
                position: "absolute",
                bottom: -7,
                left: "50%",
                marginLeft: -6,
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "7px solid #FFFFCC",
                filter: "drop-shadow(0 1px 0 #999)",
              }}
            />
          </div>
        )}

        {/* Clippy body */}
        <div
          style={{
            animation: deathAnim
              ? "clippyDeath 0.7s ease-in forwards"
              : "clippyBob 2.5s ease-in-out infinite",
          }}
        >
          <svg viewBox="0 0 52 72" width={SIZE * 0.82} height={SIZE} style={{ overflow: "visible", display: "block", margin: "0 auto" }}>
            {/* Metallic gradient */}
            <defs>
              <linearGradient id="clipWire" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#D8DCE0" />
                <stop offset="40%" stopColor="#A8B0B8" />
                <stop offset="70%" stopColor="#BCC4CC" />
                <stop offset="100%" stopColor="#9CA4AC" />
              </linearGradient>
            </defs>
            {/* Paperclip wire body */}
            <path
              d="M 14,67 V 18 C 14,5 38,5 38,18 V 52 C 38,62 22,62 22,52 V 30"
              fill="none"
              stroke="url(#clipWire)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Shine highlight on left wire */}
            <path
              d="M 12.5,60 V 22 C 12.5,10 26,7 30,9"
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Left eye white */}
            <ellipse ref={eyeLRef} cx="21" cy="28" rx="5.5" ry="5.5" fill="white" stroke="#888" strokeWidth="0.7" />
            {/* Left pupil */}
            <circle ref={pupilLRef} cx="22" cy="28" r="2.5" fill="#111" />
            {/* Right eye white */}
            <ellipse ref={eyeRRef} cx="33" cy="28" rx="5.5" ry="5.5" fill="white" stroke="#888" strokeWidth="0.7" />
            {/* Right pupil */}
            <circle ref={pupilRRef} cx="34" cy="28" r="2.5" fill="#111" />
          </svg>
        </div>
      </div>
    </>
  );
};

// ── WHITEBOARD MARKERS ────────────────────────────────────────────────────────
// Shared interactive drawing canvas for the Whiteboard theme.
// Strokes persist to the server so all users see the same board.
// A floating marker tray provides color, size, eraser, and clear controls.

const MARKER_COLORS = [
  { hex: "#D02020", border: "#B01818", name: "Red" },
  { hex: "#2060D0", border: "#1850B0", name: "Blue" },
  { hex: "#208040", border: "#186830", name: "Green" },
  { hex: "#2A2A2A", border: "#1A1A1A", name: "Black" },
  { hex: "#D09020", border: "#B07818", name: "Orange" },
  { hex: "#8040C0", border: "#6830A0", name: "Purple" },
  { hex: "#E03080", border: "#C02068", name: "Pink" },
  { hex: "#18A0A0", border: "#108888", name: "Teal" },
  { hex: "#C8A030", border: "#A88820", name: "Gold" },
  { hex: "#6B4226", border: "#55341E", name: "Brown" },
];

const BRUSH_SIZES = [
  { label: "S", width: 2 },
  { label: "M", width: 5 },
  { label: "L", width: 10 },
];

const POLL_INTERVAL = 3000; // ms

export const WhiteboardCanvas = () => {
  const [drawMode, setDrawMode] = useState(false);
  const [activeColor, setActiveColor] = useState("#D02020");
  const [activeSize, setActiveSize] = useState(5);
  const [eraserOn, setEraserOn] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const strokesRef = useRef([]);
  const currentPoints = useRef([]);
  const knownCount = useRef(0);
  const pollTimer = useRef(null);

  // ── Stroke renderer (smooth bezier, marker-like opacity) ──
  const drawStroke = (ctx, stroke) => {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    ctx.save();
    ctx.globalAlpha = stroke.eraser ? 1 : 0.65;
    ctx.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.restore();
  };

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
  }, []);

  // ── Server sync helpers ──
  const fetchAllStrokes = useCallback(async () => {
    try {
      const { api } = await import("../api");
      const strokes = await api.getWhiteboardStrokes();
      strokesRef.current = strokes;
      knownCount.current = strokes.length;
      redrawAll();
    } catch (err) {
      console.warn("Whiteboard fetch failed:", err.message);
    }
  }, [redrawAll]);

  const pollForChanges = useCallback(async () => {
    try {
      const { api } = await import("../api");
      const { count } = await api.getWhiteboardCount();
      if (count !== knownCount.current) {
        await fetchAllStrokes();
      }
    } catch {
      // silent — poll will retry
    }
  }, [fetchAllStrokes]);

  const saveStroke = useCallback(async (stroke) => {
    try {
      const { api } = await import("../api");
      await api.saveWhiteboardStroke(stroke);
    } catch (err) {
      console.warn("Whiteboard save failed:", err.message);
    }
  }, []);

  const clearBoard = useCallback(async () => {
    try {
      const { api } = await import("../api");
      await api.clearWhiteboard();
      strokesRef.current = [];
      knownCount.current = 0;
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn("Whiteboard clear failed:", err.message);
    }
  }, []);

  // ── Lifecycle: resize, initial fetch, polling ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawAll();
    };
    resize();
    window.addEventListener("resize", resize);

    // Initial load
    fetchAllStrokes();

    // Start polling
    pollTimer.current = setInterval(pollForChanges, POLL_INTERVAL);

    return () => {
      window.removeEventListener("resize", resize);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [redrawAll, fetchAllStrokes, pollForChanges]);

  // ── Coordinate helper ──
  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const evt = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  // ── Pointer event handlers ──
  const handleDown = (e) => {
    if (!drawMode) return;
    e.preventDefault();
    isDrawing.current = true;
    currentPoints.current = [getPos(e)];
  };

  const handleMove = (e) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const pos = getPos(e);
    currentPoints.current.push(pos);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pts = currentPoints.current;
    if (pts.length < 2) return;

    ctx.save();
    ctx.globalAlpha = eraserOn ? 1 : 0.65;
    ctx.globalCompositeOperation = eraserOn ? "destination-out" : "source-over";
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = activeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.restore();
  };

  const handleUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints.current.length > 0) {
      const stroke = {
        points: [...currentPoints.current],
        color: activeColor,
        width: activeSize,
        eraser: eraserOn,
      };
      strokesRef.current.push(stroke);
      knownCount.current = strokesRef.current.length;
      currentPoints.current = [];
      redrawAll();
      saveStroke(stroke);
    }
  };

  // ── Shared styles ──
  const markerBody = {
    width: 10, height: 28,
    background: "linear-gradient(90deg, #F0EDE8, #E8E4DE, #F0EDE8)",
    borderRadius: 1, border: "1px solid #C8C4BC", borderTop: "none",
  };
  const markerTip = {
    width: 7, height: 5,
    background: "#AAA69E", borderRadius: "0 0 2px 2px",
  };

  return (
    <>
      {/* ── Drawing Canvas ── */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100vw", height: "100vh",
          zIndex: drawMode ? 9999 : 0,
          pointerEvents: drawMode ? "auto" : "none",
          cursor: drawMode ? (eraserOn ? "cell" : "crosshair") : "default",
        }}
      />

      {/* ── Floating Marker Tray ── */}
      <div style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 10001,
        display: "flex", alignItems: "flex-end",
        padding: drawMode ? "6px 14px 10px" : "10px 20px 8px",
        background: "linear-gradient(180deg, #E8E4DC 0%, #D8D4CC 100%)",
        borderRadius: "8px 8px 14px 14px",
        border: "1px solid #C8C4BC", borderTop: "1px solid #EEEBE4",
        boxShadow: "0 3px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.6)",
        gap: drawMode ? 4 : 8,
        fontFamily: "system-ui, sans-serif",
        cursor: drawMode ? "default" : "pointer",
      }}
        onClick={!drawMode ? () => setDrawMode(true) : undefined}
      >
        {/* Tray lip */}
        <div style={{
          position: "absolute", bottom: 0, left: 8, right: 8, height: 6,
          background: "linear-gradient(180deg, #CCC8C0, #D8D4CC)",
          borderRadius: "0 0 10px 10px",
        }} />

        {!drawMode ? (
          /* ── Collapsed: marker tips peeking out + "Draw" label ── */
          <>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 7,
                height: 12 + (i % 3) * 3,
                background: MARKER_COLORS[i].hex,
                borderRadius: "2px 2px 1px 1px",
                transform: "translateY(-2px)",
              }} />
            ))}
            <div style={{
              fontSize: 13, fontWeight: 500, color: "#555",
              padding: "0 6px", letterSpacing: "0.01em",
            }}>Draw</div>
          </>
        ) : (
          /* ── Expanded: full marker tray ── */
          <>
            {/* Markers */}
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", padding: "0 2px" }}>
              {MARKER_COLORS.map(m => {
                const selected = !eraserOn && activeColor === m.hex;
                return (
                  <div
                    key={m.hex}
                    onClick={() => { setActiveColor(m.hex); setEraserOn(false); }}
                    title={m.name}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: "pointer",
                      transform: selected ? "translateY(-12px)" : "translateY(-2px)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    {/* Cap */}
                    <div style={{
                      width: 12, height: 20,
                      background: m.hex,
                      borderRadius: "3px 3px 2px 2px",
                      border: `1px solid ${m.border}`,
                    }} />
                    {/* Body */}
                    <div style={markerBody} />
                    {/* Tip */}
                    <div style={markerTip} />
                    {/* Selection arrow */}
                    {selected && (
                      <div style={{
                        width: 0, height: 0, marginTop: 3,
                        borderLeft: "4px solid transparent",
                        borderRight: "4px solid transparent",
                        borderTop: "5px solid #888",
                      }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 48, background: "#C0BDB6", margin: "0 4px", alignSelf: "center" }} />

            {/* Size dots */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, alignSelf: "center", padding: "4px 2px" }}>
              {BRUSH_SIZES.map(s => (
                <div
                  key={s.label}
                  onClick={() => setActiveSize(s.width)}
                  title={`Size: ${s.label}`}
                  style={{
                    width: Math.max(s.width + 6, 8),
                    height: Math.max(s.width + 6, 8),
                    borderRadius: "50%",
                    background: "#888",
                    cursor: "pointer",
                    border: activeSize === s.width ? "2px solid #444" : "2px solid transparent",
                    transition: "border-color 0.15s",
                  }}
                />
              ))}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 48, background: "#C0BDB6", margin: "0 4px", alignSelf: "center" }} />

            {/* Eraser */}
            <div
              onClick={() => setEraserOn(e => !e)}
              title="Eraser"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                cursor: "pointer", alignSelf: "center", padding: 2,
                borderRadius: 4,
                outline: eraserOn ? "2px solid #D02020" : "none",
              }}
            >
              <div style={{
                width: 36, height: 14,
                background: "linear-gradient(180deg, #F5F0E8, #E0DBD0)",
                borderRadius: "3px 3px 0 0",
                border: "1px solid #C8C4BC", borderBottom: "none",
              }} />
              <div style={{
                width: 38, height: 10,
                background: "#888",
                borderRadius: "0 0 2px 2px",
              }} />
              <div style={{ fontSize: 9, color: "#888", marginTop: 2, letterSpacing: "0.02em" }}>eraser</div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 48, background: "#C0BDB6", margin: "0 4px", alignSelf: "center" }} />

            {/* Clear — spray bottle SVG */}
            <div
              onClick={() => setShowClearConfirm(true)}
              title="Clear board for everyone"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                cursor: "pointer", alignSelf: "center", padding: "2px 4px",
                borderRadius: 4, transition: "background 0.15s",
              }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(208,32,32,0.08)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              <svg width="28" height="40" viewBox="0 0 28 40" fill="none" style={{ display: "block" }}>
                <rect x="11" y="2" width="6" height="4" rx="1" fill="#999"/>
                <rect x="5" y="4" width="8" height="3" rx="1" fill="#AAA"/>
                <rect x="2" y="5" width="4" height="2" rx="1" fill="#BBB"/>
                <rect x="12" y="6" width="4" height="6" rx="1" fill="#CCC8C0"/>
                <path d="M8 12 L20 12 L22 16 L22 34 Q22 37 19 37 L9 37 Q6 37 6 34 L6 16 Z" fill="#70A8D8" stroke="#5088B8" strokeWidth="0.75"/>
                <rect x="8" y="20" width="12" height="8" rx="1" fill="white" opacity="0.85"/>
                <line x1="10" y1="23" x2="18" y2="23" stroke="#AAA" strokeWidth="0.5"/>
                <line x1="10" y1="25" x2="16" y2="25" stroke="#AAA" strokeWidth="0.5"/>
                <rect x="7" y="30" width="14" height="6" rx="0" fill="rgba(80,140,200,0.3)"/>
              </svg>
              <div style={{ fontSize: 9, color: "#888", marginTop: 1, letterSpacing: "0.02em" }}>clear</div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 48, background: "#C0BDB6", margin: "0 4px", alignSelf: "center" }} />

            {/* Done */}
            <div
              onClick={() => { setDrawMode(false); setEraserOn(false); }}
              style={{
                alignSelf: "center", cursor: "pointer",
                fontSize: 11, fontWeight: 500, color: "#888",
                padding: "6px 10px", borderRadius: 6,
                transition: "background 0.15s", letterSpacing: "0.02em",
              }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >Done</div>
          </>
        )}
      </div>

        {/* ── Clear Confirmation Modal ── */}
      {showClearConfirm && (
        <div
          onClick={() => setShowClearConfirm(false)}
          style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10002,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#FFFEF6",
              border: "1px solid #D8D4C8",
              borderRadius: 4,
              padding: "28px 32px 24px",
              minWidth: 320,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
              transform: "rotate(-0.8deg)",
              fontFamily: "system-ui, sans-serif",
              position: "relative",
            }}
          >
            {/* Faux tape strip at top */}
            <div style={{
              position: "absolute", top: -8, left: "50%", transform: "translateX(-50%) rotate(1.2deg)",
              width: 64, height: 16,
              background: "rgba(200,195,175,0.55)",
              borderRadius: 2,
              border: "1px solid rgba(180,175,160,0.3)",
            }} />

            {/* Red marker X in corner */}
            <div style={{
              position: "absolute", top: 8, right: 12,
              fontSize: 18, color: "#D02020", fontWeight: 700,
              cursor: "pointer", lineHeight: 1,
              opacity: 0.6,
            }}
              onClick={() => setShowClearConfirm(false)}
            >&times;</div>

            {/* Heading */}
            <div style={{
              fontSize: 16, fontWeight: 600, color: "#2A2A2A",
              marginBottom: 8,
            }}>
              Erase the board?
            </div>

            {/* Body */}
            <div style={{
              fontSize: 13, color: "#666", lineHeight: 1.5,
              marginBottom: 20,
            }}>
              This will clear all drawings for every user.
              <br />
              This can't be undone.
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  padding: "7px 18px", fontSize: 13, fontWeight: 500,
                  background: "#F0EDE6", color: "#555",
                  border: "1px solid #D0CCC4", borderRadius: 6,
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseOver={e => e.currentTarget.style.background = "#E8E4DC"}
                onMouseOut={e => e.currentTarget.style.background = "#F0EDE6"}
              >
                Keep it
              </button>
              <button
                onClick={() => { setShowClearConfirm(false); clearBoard(); }}
                style={{
                  padding: "7px 18px", fontSize: 13, fontWeight: 600,
                  background: "#D02020", color: "#FFF",
                  border: "1px solid #B01818", borderRadius: 6,
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseOver={e => e.currentTarget.style.background = "#B81A1A"}
                onMouseOut={e => e.currentTarget.style.background = "#D02020"}
              >
                Erase everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};