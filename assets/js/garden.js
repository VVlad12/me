/*
 * Generative flowers drawn on <canvas>.
 * Every bouquet comes from a numeric seed, so the same number always
 * grows the same bouquet.
 */
window.Garden = (function () {
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      stem: v("--moss"), ink: v("--bark"), muted: v("--muted"), ground: v("--line"),
      petal: v("--petal"), ochre: v("--ochre"), beet: v("--beet"), blush: v("--blush"),
      fog: v("--fog-deep"), paper: v("--paper"),
    };
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  function bez(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  }

  /* ---------- model ---------- */
  const HEADS = ["daisy", "cosmos", "tulip", "seedhead", "berries", "aster", "daisy", "cosmos"];

  function makeFlower(r, opts = {}) {
    const bx = opts.x ?? 0.08 + r() * 0.84;
    const hx = Math.min(0.95, Math.max(0.05, bx + (r() - 0.5) * 0.3));
    const hy = opts.y ?? 0.1 + r() * 0.5;
    const type = HEADS[Math.floor(r() * HEADS.length)];
    const colorKey = {
      daisy: "petal", cosmos: r() < 0.5 ? "blush" : "beet", tulip: r() < 0.5 ? "beet" : "ochre",
      seedhead: "muted", berries: "beet", aster: r() < 0.5 ? "blush" : "ochre",
    }[type];
    const leaves = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
      t: 0.18 + r() * 0.5, side: r() < 0.5 ? -1 : 1, size: 0.6 + r() * 0.7, tilt: 0.5 + r() * 0.6,
    }));
    return {
      p0: [bx, 1], p1: [bx + (r() - 0.5) * 0.2, 0.72],
      p2: [hx + (r() - 0.5) * 0.25, hy + 0.22], p3: [hx, hy],
      width: 1.1 + r() * 1.1, type, colorKey, size: 0.7 + r() * 0.6,
      petals: 8 + Math.floor(r() * 9), spin: r() * Math.PI, leaves, rnd: r(),
    };
  }

  /* ---------- drawing ---------- */
  function drawLeaf(ctx, x, y, ang, len, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawHead(ctx, f, x, y, R, s, pal) {
    if (s <= 0) return;
    const col = pal[f.colorKey];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(f.spin);
    switch (f.type) {
      case "daisy":
        for (let i = 0; i < f.petals + 4; i++) {
          ctx.rotate((Math.PI * 2) / (f.petals + 4));
          ctx.beginPath();
          ctx.ellipse(R * 0.55, 0, R * 0.5, R * 0.14, 0, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = pal.ground; ctx.lineWidth = 0.6; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, R * 0.26, 0, Math.PI * 2); ctx.fillStyle = pal.ochre; ctx.fill();
        break;
      case "cosmos":
        for (let i = 0; i < 8; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(R * 0.3, -R * 0.45, R * 1.05, -R * 0.35, R, 0);
          ctx.bezierCurveTo(R * 1.05, R * 0.35, R * 0.3, R * 0.45, 0, 0);
          ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fillStyle = pal.ochre; ctx.fill();
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9;
          ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12, R * 0.035, 0, Math.PI * 2);
          ctx.fillStyle = pal.ink; ctx.fill();
        }
        break;
      case "tulip":
        ctx.rotate(-f.spin); // tulips stay upright
        ctx.beginPath();
        ctx.moveTo(-R * 0.55, -R * 0.1);
        ctx.quadraticCurveTo(-R * 0.6, R * 0.6, 0, R * 0.6);
        ctx.quadraticCurveTo(R * 0.6, R * 0.6, R * 0.55, -R * 0.1);
        ctx.lineTo(R * 0.3, -R * 0.75);
        ctx.lineTo(R * 0.05, -R * 0.2);
        ctx.lineTo(-R * 0.15, -R * 0.8);
        ctx.lineTo(-R * 0.3, -R * 0.2);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        break;
      case "seedhead":
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 0.7;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2, l = R * (0.75 + ((i * 7) % 5) * 0.06);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke();
          ctx.beginPath(); ctx.arc(Math.cos(a) * l, Math.sin(a) * l, 1.1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2); ctx.fillStyle = pal.stem; ctx.fill();
        break;
      case "berries":
        ctx.fillStyle = col;
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4, d = R * 0.38 * Math.sqrt(i / 7);
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, R * 0.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case "aster":
        ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.4, R * 0.09);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25);
          ctx.lineTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.fillStyle = pal.ochre; ctx.fill();
        break;
    }
    ctx.restore();
  }

  // grow: 0..1 for the stem, bloom: 0..1 for the head
  function drawFlower(ctx, f, W, H, unit, grow, bloom, pal) {
    const P = (p) => [p[0] * W, p[1] * H];
    const p0 = P(f.p0), p1 = P(f.p1), p2 = P(f.p2), p3 = P(f.p3);
    const steps = 40, n = Math.max(1, Math.round(steps * grow));

    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    let last = p0;
    for (let i = 1; i <= n; i++) {
      last = bez(p0, p1, p2, p3, (i / steps) * (grow * steps / n));
      ctx.lineTo(last[0], last[1]);
    }
    ctx.strokeStyle = pal.stem; ctx.lineWidth = f.width; ctx.lineCap = "round";
    ctx.stroke();

    f.leaves.forEach((lf) => {
      const s = clamp01((grow - lf.t) / 0.25);
      if (s <= 0) return;
      const a = bez(p0, p1, p2, p3, lf.t), b = bez(p0, p1, p2, p3, lf.t + 0.02);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + lf.side * lf.tilt * 1.2;
      drawLeaf(ctx, a[0], a[1], ang, unit * 22 * lf.size * easeOut(s), pal.stem);
    });

    drawHead(ctx, f, p3[0], p3[1], unit * 17 * f.size, easeBack(bloom), pal);
  }

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: w, H: h };
  }

  /* ---------- the hero garden ---------- */
  function garden(canvas, onSeed) {
    let flowers = [], seed = 0, start = 0, raf = 0, animating = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const GROW = 1100, BLOOM = 650, STAGGER = 170;

    function grass(ctx, W, H, r, pal) {
      ctx.strokeStyle = pal.ground; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
      ctx.strokeStyle = pal.stem; ctx.globalAlpha = 0.55;
      for (let i = 0; i < W / 7; i++) {
        const x = r() * W, h = 4 + r() * 14;
        ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + 2, H - h * 0.6, x + (r() - 0.5) * 8, H - h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      const { ctx, W, H } = fit(canvas);
      const pal = palette();
      const unit = Math.min(W, H * 1.2) / 300;
      const t = reduce ? 1e9 : now - start;
      ctx.clearRect(0, 0, W, H);
      grass(ctx, W, H, rng(seed + 1), pal);
      let done = true;
      flowers.forEach((f, i) => {
        const local = t - i * STAGGER;
        const g = easeOut(clamp01(local / GROW));
        const b = clamp01((local - GROW * 0.85) / BLOOM);
        if (b < 1) done = false;
        drawFlower(ctx, f, W, H, unit, g, b, pal);
      });
      animating = !done;
      if (!done) raf = requestAnimationFrame(frame);
    }

    function plant(newSeed) {
      seed = newSeed ?? Math.floor(Math.random() * 9000) + 1000;
      const r = rng(seed);
      const count = 6 + Math.floor(r() * 4);
      flowers = Array.from({ length: count }, () => makeFlower(r));
      // tallest first so shorter stems sit in front
      flowers.sort((a, b) => a.p3[1] - b.p3[1]);
      cancelAnimationFrame(raf);
      start = performance.now();
      raf = requestAnimationFrame(frame);
      if (onSeed) onSeed(seed);
    }

    // redraw at rest on resize / theme change (a running animation refits itself)
    const still = () => { if (!animating && flowers.length) frame(performance.now()); };
    new ResizeObserver(still).observe(canvas);
    document.addEventListener("themechange", still);

    return { plant };
  }

  /* ---------- small pattern for windows without an image ---------- */
  // kind: 0 flower, 1 leaves, 2 rings, 3 seeds (default: picked from the key)
  function swatch(canvas, key, bg, forcedKind) {
    const r = rng(hash(key));
    const { ctx, W, H } = fit(canvas);
    const pal = palette();
    let kind = Math.floor(r() * 4);
    if (forcedKind >= 0 && forcedKind <= 3) kind = forcedKind;
    const bgs = [pal.ochre, pal.stem, pal.beet, pal.blush];
    ctx.fillStyle = kind === 0 ? pal.fog : bgs[Math.floor(r() * bgs.length)];
    if (bg) ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const fg = pal.paper;

    if (kind === 0) { // a single sprig
      const f = makeFlower(r, { x: 0.3 + r() * 0.4, y: 0.25 + r() * 0.15 });
      drawFlower(ctx, f, W, H, Math.min(W, H) / 170, 1, 1, pal);
    } else if (kind === 1) { // rows of leaves
      ctx.globalAlpha = 0.5;
      for (let y = 12; y < H; y += 22) for (let x = (y / 22) % 2 ? 10 : 22; x < W; x += 26)
        drawLeaf(ctx, x, y, -0.6 + r() * 0.3, 14, fg);
    } else if (kind === 2) { // tree rings
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
      const cx = W * (0.2 + r() * 0.6), cy = H * (0.3 + r() * 0.5);
      for (let rad = 6; rad < W; rad += 5 + r() * 6) {
        ctx.beginPath(); ctx.ellipse(cx, cy, rad * 1.15, rad, 0.2, 0, Math.PI * 2); ctx.stroke();
      }
    } else { // scattered seeds
      ctx.fillStyle = fg; ctx.globalAlpha = 0.6;
      for (let i = 0; i < (W * H) / 260; i++) {
        ctx.beginPath(); ctx.ellipse(r() * W, r() * H, 3, 1.6, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  return { garden, swatch };
})();
