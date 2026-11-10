/* =========================================================
   ResumeIQ — bg.js  v2  (background animation)
   Visual only. Does NOT touch forms, fetch, or any app state.

   Hero canvas:
   - "Resume" nodes (white) drift right, "JD" nodes (blue) drift left
   - 3 depth layers (size, speed, opacity) for parallax feel
   - Skill labels ride on some nodes and brighten on a match
   - Match burst: ring + counter tick when a resume meets a JD node
   - ATS scan-line with caption sweeps across, nodes flare as it passes
   - Cursor repels nodes, draws links, soft glow; click = shockwave

   Form tile: cursor-following blue spotlight (CSS vars --mx/--my/--spot)

   Palette is design.md only: #ffffff and #2997ff on #272729.
   ========================================================= */
   (() => {
    "use strict";
  
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  
    /* =======================================================
       1. HERO CANVAS
       ======================================================= */
    const canvas = document.getElementById("hero-canvas");
  
    if (canvas && canvas.getContext) {
      const hero = canvas.parentElement;
      const content = hero.querySelector(".hero__inner");
      const ctx = canvas.getContext("2d");
  
      const WHITE = "255,255,255";
      const BLUE = "41,151,255"; // --primary-on-dark
      const FONT = '"Inter", -apple-system, system-ui, sans-serif';
      const RESUME_SKILLS = ["React", "Node.js", "SQL", "Git", "Python", "REST", "Docker", "TypeScript"];
      const JD_SKILLS = ["React", "Node.js", "AWS", "CI/CD", "SQL", "Docker", "REST", "Testing"];
      const LAYERS = [0.55, 0.8, 1];
  
      let w = 0;
      let h = 0;
      let dpr = 1;
      let nodes = [];
      let rings = [];
      let safe = null; // headline area -> animation dims behind it
      let raf = 0;
      let running = false;
      let heroVisible = true;
      let last = 0;
      let time = 0;
      let matches = 0;
  
      const pointer = { x: -9999, y: -9999, active: false };
  
      const rand = (a, b) => a + Math.random() * (b - a);
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const pick = (list) => list[(Math.random() * list.length) | 0];
  
      function makeNodes() {
        const count = Math.round(clamp((w * h) / 12000, 32, 100));
        nodes = Array.from({ length: count }, (_, i) => {
          const group = i % 2; // 0 = resume, 1 = job description
          const z = pick(LAYERS);
          return {
            group,
            z,
            x: group === 0 ? rand(0, w * 0.65) : rand(w * 0.35, w),
            y: rand(0, h),
            vx: (rand(-0.18, 0.18) + (group === 0 ? 0.12 : -0.12)) * z,
            vy: rand(-0.22, 0.22) * z,
            kx: 0, // click-shockwave velocity
            ky: 0,
            r: rand(1.5, 3.1) * (0.6 + 0.4 * z),
            phase: Math.random() * Math.PI * 2,
            flare: 0,
            cool: 0, // ms until this node can trigger another burst
            label: null,
          };
        });
  
        // skill labels on a few front-layer nodes
        const maxLabels = w < 640 ? 4 : 11;
        let labelled = 0;
        for (const n of nodes) {
          if (labelled >= maxLabels) break;
          if (n.z === 1 && Math.random() < 0.55) {
            n.label = pick(n.group === 0 ? RESUME_SKILLS : JD_SKILLS);
            labelled++;
          }
        }
      }
  
      function measure() {
        const rect = hero.getBoundingClientRect();
        const prevW = w;
        w = Math.max(1, Math.round(rect.width));
        h = Math.max(1, Math.round(rect.height));
        dpr = Math.min(window.devicePixelRatio || 1, 2);
  
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
        if (content) {
          const c = content.getBoundingClientRect();
          safe = {
            x: c.left - rect.left - 24,
            y: c.top - rect.top - 16,
            w: c.width + 48,
            h: c.height + 32,
          };
        }
  
        if (!nodes.length || Math.abs(w - prevW) > 1) makeNodes();
        if (!running) draw();
      }
  
      // Soft dimming near the headline so text stays readable
      function dim(x, y) {
        if (!safe) return 1;
        const dx = Math.max(safe.x - x, 0, x - (safe.x + safe.w));
        const dy = Math.max(safe.y - y, 0, y - (safe.y + safe.h));
        const d = Math.hypot(dx, dy);
        return 0.3 + 0.7 * clamp(d / 90, 0, 1);
      }
  
      const scanPos = () => ((time * 0.00007) % 1.2 - 0.1) * w;
  
      function addRing(x, y, life, maxR, strong) {
        if (rings.length > 30) rings.shift();
        rings.push({ x, y, age: 0, life, maxR, strong });
      }
  
      function update(dt) {
        const k = dt / 16.67;
        const damp = Math.pow(0.92, k);
        const scanX = scanPos();
  
        for (const n of nodes) {
          n.x += (n.vx + n.kx) * k;
          n.y += (n.vy + n.ky) * k;
          n.kx *= damp;
          n.ky *= damp;
          n.cool = Math.max(0, n.cool - dt);
  
          if (pointer.active) {
            const dx = n.x - pointer.x;
            const dy = n.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < 110 && d > 0.01) {
              const push = (1 - d / 110) * 1.4 * k;
              n.x += (dx / d) * push;
              n.y += (dy / d) * push;
            }
          }
  
          if (n.x < -20) n.x = w + 20;
          else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          else if (n.y > h + 20) n.y = -20;
  
          n.flare = Math.max(0, n.flare - 0.018 * k);
          if (Math.abs(n.x - scanX) < 14) n.flare = 1;
        }
  
        for (const r of rings) r.age += dt;
        rings = rings.filter((r) => r.age < r.life);
      }
  
      function draw() {
        ctx.clearRect(0, 0, w, h);
  
        // Cursor glow (flat translucent disc)
        if (pointer.active) {
          ctx.fillStyle = `rgba(${BLUE},0.07)`;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 90, 0, Math.PI * 2);
          ctx.fill();
        }
  
        // ATS scan line + caption
        const scanX = scanPos();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${BLUE},0.28)`;
        ctx.beginPath();
        ctx.moveTo(scanX, 0);
        ctx.lineTo(scanX, h);
        ctx.stroke();
  
        ctx.font = `400 10px ${FONT}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = `rgba(${BLUE},${0.55 * dim(scanX + 8, 24)})`;
        ctx.fillText("ATS SCAN", scanX + 8, 24);
  
        // Links
        const LINK = w < 640 ? 100 : 140;
        const L2 = LINK * LINK;
  
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > L2) continue;
  
            const t = 1 - Math.sqrt(d2) / LINK;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const f = dim(mx, my) * Math.min(a.z, b.z);
  
            if (a.group === b.group) {
              ctx.strokeStyle = `rgba(${WHITE},${0.1 * t * f})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            } else {
              // resume x JD = match
              ctx.strokeStyle = `rgba(${BLUE},${(0.15 + 0.6 * t) * f})`;
              ctx.lineWidth = 1 + t * 0.9;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
  
              if (t > 0.8) {
                a.flare = Math.max(a.flare, 0.7);
                b.flare = Math.max(b.flare, 0.7);
  
                // match burst (animated frames only)
                if (running && a.cool <= 0 && b.cool <= 0) {
                  a.cool = b.cool = 2200;
                  addRing(mx, my, 900, 38, false);
                  matches++;
                }
              }
  
              if (t > 0.3) {
                const p = (time * 0.0007 + i * 0.37 + j * 0.11) % 1;
                ctx.fillStyle = `rgba(${WHITE},${0.9 * f})`;
                ctx.beginPath();
                ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 1.6, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
  
        // Cursor links
        if (pointer.active) {
          for (const n of nodes) {
            const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
            if (d < 160) {
              ctx.strokeStyle = `rgba(${WHITE},${0.35 * (1 - d / 160)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(pointer.x, pointer.y);
              ctx.stroke();
            }
          }
          ctx.strokeStyle = `rgba(${BLUE},0.5)`;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
  
        // Rings (match bursts + click shockwave)
        for (const r of rings) {
          const p = r.age / r.life;
          const eased = 1 - Math.pow(1 - p, 3);
          const f = dim(r.x, r.y);
          ctx.strokeStyle = `rgba(${BLUE},${(1 - p) * (r.strong ? 0.5 : 0.65) * f})`;
          ctx.lineWidth = r.strong ? 1.5 : 1.2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 4 + r.maxR * eased, 0, Math.PI * 2);
          ctx.stroke();
        }
  
        // Nodes + skill labels
        ctx.font = `400 11px ${FONT}`;
        for (const n of nodes) {
          const f = dim(n.x, n.y);
          const color = n.group === 0 ? WHITE : BLUE;
          const r = n.r * (1 + 0.15 * Math.sin(time * 0.002 + n.phase));
  
          if (n.flare > 0.01) {
            ctx.fillStyle = `rgba(${BLUE},${n.flare * 0.16 * f})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2);
            ctx.fill();
  
            ctx.strokeStyle = `rgba(${BLUE},${n.flare * 0.7 * f})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + (1 - n.flare) * 16, 0, Math.PI * 2);
            ctx.stroke();
          }
  
          ctx.fillStyle = `rgba(${color},${(0.6 + 0.3 * n.flare) * f * (0.55 + 0.45 * n.z)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fill();
  
          if (n.label) {
            ctx.fillStyle = `rgba(${color},${(0.3 + 0.6 * n.flare) * f})`;
            ctx.fillText(n.label, n.x + r + 7, n.y - r - 5);
          }
        }
  
        // HUD counter
        ctx.font = `400 12px ${FONT}`;
        ctx.fillStyle = `rgba(${WHITE},0.45)`;
        ctx.fillText(`MATCHES  ${String(matches).padStart(4, "0")}`, w < 640 ? 16 : 24, h - 22);
      }
  
      function frame(now) {
        if (!running) return;
        const dt = Math.min(now - last, 50);
        last = now;
        time += dt;
        update(dt);
        draw();
        raf = requestAnimationFrame(frame);
      }
  
      function start() {
        if (running || reduceMotion.matches || !heroVisible || document.hidden) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
  
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }
  
      // Pointer (visual only)
      hero.addEventListener("pointermove", (e) => {
        const rect = hero.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
        pointer.active = true;
      });
      hero.addEventListener("pointerleave", () => {
        pointer.active = false;
      });
  
      // Click = shockwave: ring + push nearby nodes outward
      hero.addEventListener("pointerdown", (e) => {
        if (reduceMotion.matches) return;
        const rect = hero.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        addRing(x, y, 1100, 150, true);
        for (const n of nodes) {
          const dx = n.x - x;
          const dy = n.y - y;
          const d = Math.hypot(dx, dy);
          if (d < 180 && d > 0.01) {
            const kick = (1 - d / 180) * 4;
            n.kx += (dx / d) * kick;
            n.ky += (dy / d) * kick;
          }
        }
      });
  
      // Lifecycle: pause offscreen, hidden tab, reduced motion
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
          heroVisible = entries[0].isIntersecting;
          heroVisible ? start() : stop();
        }).observe(hero);
      }
  
      document.addEventListener("visibilitychange", () => {
        document.hidden ? stop() : start();
      });
  
      reduceMotion.addEventListener?.("change", () => {
        reduceMotion.matches ? (stop(), draw()) : start();
      });
  
      if ("ResizeObserver" in window) {
        new ResizeObserver(measure).observe(hero);
      } else {
        window.addEventListener("resize", measure);
      }
      window.addEventListener("load", measure);
  
      measure();
      start();
    }
  
    /* =======================================================
       2. FORM TILE SPOTLIGHT  (writes CSS vars only)
       ======================================================= */
    (function spotlight() {
      const band = document.querySelector(".form-band");
      if (!band || reduceMotion.matches) return;
      if (!window.matchMedia("(hover: hover)").matches) return; // skip touch
  
      let tx = 0, ty = -400, cx = 0, cy = -400, ts = 0, cs = 0, raf = 0;
  
      function tick() {
        cx += (tx - cx) * 0.14;
        cy += (ty - cy) * 0.14;
        cs += (ts - cs) * 0.08;
  
        band.style.setProperty("--mx", cx.toFixed(1) + "px");
        band.style.setProperty("--my", cy.toFixed(1) + "px");
        band.style.setProperty("--spot", cs.toFixed(3));
  
        const moving =
          Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5 || Math.abs(ts - cs) > 0.01;
        raf = moving ? requestAnimationFrame(tick) : 0;
      }
  
      const kick = () => {
        if (!raf) raf = requestAnimationFrame(tick);
      };
  
      band.addEventListener("pointermove", (e) => {
        const r = band.getBoundingClientRect();
        tx = e.clientX - r.left;
        ty = e.clientY - r.top;
        if (ts === 0 && cs < 0.01) {
          cx = tx;
          cy = ty;
        }
        ts = 1;
        kick();
      });
  
      band.addEventListener("pointerleave", () => {
        ts = 0;
        kick();
      });
    })();
  })();