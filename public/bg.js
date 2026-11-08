/* =========================================================
   ResumeIQ — bg.js  (hero background animation)
   Visual only. Does NOT touch forms, fetch, or any app state.
   Concept: "resume" nodes (white) drift right, "JD" nodes (blue)
   drift left. When they meet, a match link lights up. An ATS
   scan-line sweeps across and makes nodes flare.
   Palette is design.md only: #ffffff and #2997ff on #272729.
   ========================================================= */
   (() => {
    "use strict";
  
    const canvas = document.getElementById("hero-canvas");
    if (!canvas || !canvas.getContext) return;
  
    const hero = canvas.parentElement;
    const content = hero.querySelector(".hero__inner");
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  
    const WHITE = "255,255,255";
    const BLUE = "41,151,255"; // --primary-on-dark
  
    let w = 0;
    let h = 0;
    let dpr = 1;
    let nodes = [];
    let safe = null; // text area -> animation dims behind it
    let raf = 0;
    let running = false;
    let heroVisible = true;
    let last = 0;
    let time = 0;
  
    const pointer = { x: -9999, y: -9999, active: false };
  
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  
    function makeNodes() {
      const count = Math.round(clamp((w * h) / 13000, 30, 95));
      nodes = Array.from({ length: count }, (_, i) => {
        const group = i % 2; // 0 = resume, 1 = job description
        return {
          group,
          x: group === 0 ? rand(0, w * 0.65) : rand(w * 0.35, w),
          y: rand(0, h),
          vx: rand(-0.18, 0.18) + (group === 0 ? 0.12 : -0.12),
          vy: rand(-0.22, 0.22),
          r: rand(1.6, 3.2),
          phase: Math.random() * Math.PI * 2,
          flare: 0,
        };
      });
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
  
    function update(dt) {
      const k = dt / 16.67;
      const scanX = ((time * 0.00007) % 1.2 - 0.1) * w;
  
      for (const n of nodes) {
        n.x += n.vx * k;
        n.y += n.vy * k;
  
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
    }
  
    function draw() {
      ctx.clearRect(0, 0, w, h);
  
      // ATS scan line
      const scanX = ((time * 0.00007) % 1.2 - 0.1) * w;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${BLUE},0.28)`;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();
  
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
          const f = dim((a.x + b.x) / 2, (a.y + b.y) / 2);
  
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
  
      // Nodes
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
  
        ctx.fillStyle = `rgba(${color},${(0.6 + 0.3 * n.flare) * f})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
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
  })();