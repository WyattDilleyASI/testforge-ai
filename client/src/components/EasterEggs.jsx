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
