/*
 * A cat that walks onto the page and knocks things out of the window.
 *
 * The cat is drawn on a fixed canvas over the page and lives in page
 * coordinates, so it scrolls with the content. It stands on the bottom edge of
 * whatever it wants to push, paws at it a few times, checks that you are
 * watching, then swipes. The pushed element leaves an empty space behind: the
 * original is hidden and a fixed-position copy tumbles off the screen.
 */
window.PageCat = (function () {
  // what the cat may push, in any page built by site.js
  const TARGETS = [
    ".hero-photo", ".hero-text .role", ".hero-text h1", ".hero-text p", ".links a", ".garden",
    ".gallery-head h2", ".gallery-head p", ".filter", ".win:not(.hidden)",
    ".page-head h1", ".page-head p", ".entry", ".site-footer .wrap > span",
  ].join(",");

  const STOP = Symbol("stop");
  const REACH = 40;   // units from the cat's origin to the edge it paws at
  const SPEED = 95;   // walking speed, units per second
  const STRIDE = 36;  // units travelled per gait cycle (no foot sliding)

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const vw = () => document.documentElement.clientWidth;
  const vh = () => document.documentElement.clientHeight;
  const U = () => clamp(vw() / 1100, 0.6, 1); // pixels per cat unit
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- state ---------- */
  const cat = {
    on: false, x: 0, g: 0,          // page x of the cat, page y of the ground under it
    dir: 1, face: 1,                // facing (+1 right), and the drawn facing while turning
    phase: 0, walking: false, gait: 0,
    sit: 0, crouch: 0, air: 0, tilt: 0,
    look: 0, turn: 0, blink: 0, twitch: 0,
    paw: null,                      // near front paw target while pawing, in cat units
  };
  const knocked = new Set();        // originals hidden after a push
  const nudges = new Map();         // element -> { nx, wob, wv } while being teased
  let flying = [];                  // tumbling copies
  let running = false, gen = 0, raf = 0, last = 0, waiters = [], nextBlink = 0;
  let canvas, ctx, bar;

  /* ---------- frame loop ---------- */
  function loop(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const w = waiters; waiters = [];
    w.forEach((f) => f(dt));
    update(dt, now);
    draw(now);
    if (running || cat.on || flying.length || nudges.size) raf = requestAnimationFrame(loop);
    else { raf = 0; last = 0; }
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };

  // behaviour scripts are async functions that wait for frames; a new generation stops the old one
  async function step(g) {
    const dt = await new Promise((r) => waiters.push(r));
    if (g !== gen) throw STOP;
    return dt;
  }
  async function tween(g, ms, fn) {
    let t = 0; fn(0);
    while (t < ms) { t += (await step(g)) * 1000; fn(Math.min(1, t / ms)); }
  }
  const wait = (g, ms) => tween(g, ms, () => {});

  function update(dt, now) {
    cat.gait += ((cat.walking ? 1 : 0) - cat.gait) * Math.min(1, dt * 10);
    if (now > nextBlink) { cat.blink = 1; nextBlink = now + rand(1800, 4800); }
    cat.blink = Math.max(0, cat.blink - dt * 7);
    cat.twitch = Math.max(0, cat.twitch - dt * 1.5);

    // teased things wobble and settle
    nudges.forEach((n, el) => {
      n.wv += (-160 * n.wob - 8 * n.wv) * dt;
      n.wob += n.wv * dt;
      el.style.translate = `${n.nx.toFixed(1)}px 0px`;
      el.style.rotate = `${n.wob.toFixed(2)}deg`;
    });

    // pushed things tumble off the screen
    const W = vw(), H = vh();
    flying = flying.filter((f) => {
      f.vy += 2200 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt;
      f.c.style.translate = `${f.x.toFixed(1)}px ${f.y.toFixed(1)}px`;
      f.c.style.rotate = `${f.a.toFixed(1)}deg`;
      const cx = f.cx + f.x, cy = f.cy + f.y;
      if (cy - f.rad > H || cx + f.rad < 0 || cx - f.rad > W) { f.c.remove(); return false; }
      return true;
    });
  }

  /* ---------- drawing ---------- */
  function draw(now) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = vw(), H = vh();
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!cat.on) return;
    const u = U(), sx = cat.x - scrollX, sy = cat.g - scrollY;
    if (sx < -160 || sx > W + 160 || sy < -40 || sy > H + 160) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(cat.face * u, u);
    drawCat(now / 1000);
    ctx.restore();
  }

  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  const blob = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  // two-bone leg: bend +1 puts the joint behind (front legs), -1 in front (hind legs)
  function leg(root, paw, l1, l2, bend, w1, w2) {
    let dx = paw.x - root.x, dy = paw.y - root.y, d = Math.hypot(dx, dy) || 0.01;
    const max = l1 + l2 - 0.4;
    if (d > max) { paw = { x: root.x + (dx / d) * max, y: root.y + (dy / d) * max }; d = max; }
    const a = Math.atan2(dy, dx) + bend * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const knee = { x: root.x + Math.cos(a) * l1, y: root.y + Math.sin(a) * l1 };
    ctx.lineWidth = w1; line(root, knee);
    ctx.lineWidth = w2; line(knee, paw);
    blob(paw.x + 1.6, paw.y - 2.2, 4.4, 2.8);
  }

  // local units: x forward, y down, ground at 0; the cat is about 100 long and 75 tall
  function drawCat(T) {
    const ink = css("--bark") || "#2a2620", eyeCol = css("--ochre") || "#c4892b";
    const { sit, crouch: cr, air, gait: walk } = cat;
    const bob = -Math.abs(Math.sin(cat.phase)) * 1.6 * walk;
    const breathe = Math.sin(T * 2.4) * 0.6 * (1 - walk);
    const hip = { x: lerp(-26, -19, sit), y: lerp(-40, -16, sit) + cr * 10 + bob };
    const sh = { x: lerp(24, 14, sit), y: lerp(-42, -48, sit) + cr * 12 + bob + breathe };

    ctx.save();
    ctx.translate(0, -40); ctx.rotate(cat.tilt); ctx.translate(0, 40);
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // paw targets: walking gait, sitting, flying, and the pawing override
    const ph = cat.phase;
    const gp = (bx, p) => ({ x: bx + Math.sin(p) * 9 * walk, y: -Math.max(0, Math.cos(p)) * 7 * walk });
    const blend = (stand, seated, flight) => mix(mix(stand, seated, sit), flight, air);
    const HF = blend(gp(hip.x + 1, ph + Math.PI), { x: hip.x + 13, y: 0 }, { x: hip.x - 13, y: hip.y + 30 });
    const FF = blend(gp(sh.x + 1, ph), { x: sh.x + 1, y: 0 }, { x: sh.x + 12, y: sh.y + 31 });
    const HN = blend(gp(hip.x + 3, ph), { x: hip.x + 17, y: 0 }, { x: hip.x - 17, y: hip.y + 28 });
    let FN = blend(gp(sh.x + 3, ph + Math.PI), { x: sh.x + 4, y: 0 }, { x: sh.x + 16, y: sh.y + 30 });
    if (cat.paw) FN = cat.paw;
    const hipRoot = { x: hip.x + 2, y: hip.y + 3 }, shRoot = { x: sh.x, y: sh.y + 4 };

    // far legs, a shade lighter, behind everything
    ctx.globalAlpha = 0.5;
    leg(hipRoot, HF, 20, 22, -1, 10, 6);
    leg(shRoot, FF, 20, 20, 1, 8, 6);
    ctx.globalAlpha = 1;

    // tail
    {
      let a = lerp(lerp(-1.8, -3.75, sit), -2.75, air);
      const inc = lerp(lerp(-0.12, 0.14, sit), -0.02, air);
      const speed = lerp(2.6, 1.4, sit), amp = 0.05 + 0.14 * cat.twitch + 0.06 * sit;
      let p = { x: hip.x - 12, y: hip.y - 3 };
      for (let i = 0; i < 10; i++) {
        a += inc + Math.sin(T * speed - i * 0.5) * amp;
        const q = { x: p.x + Math.cos(a) * 5.2, y: Math.min(-1.5, p.y + Math.sin(a) * 5.2) };
        ctx.lineWidth = lerp(7, 3.4, i / 9);
        line(p, q);
        p = q;
      }
    }

    // body
    ctx.lineWidth = 27;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.quadraticCurveTo((hip.x + sh.x) / 2, (hip.y + sh.y) / 2 - 3 - cr * 2, sh.x, sh.y);
    ctx.stroke();
    blob(hip.x - 1, hip.y + 1, lerp(14.5, 16, sit), lerp(14.5, 16, sit));
    blob(sh.x + 2, sh.y + 2, 13.5, 13.5);

    // neck and head
    const look = cat.look, turn = cat.turn;
    const hc = { x: sh.x + lerp(15, 12, sit) + look * 4, y: sh.y - 15 + look * 9 + cr * 3 };
    ctx.lineWidth = 15;
    line({ x: sh.x + 3, y: sh.y - 1 }, hc);
    ctx.save();
    ctx.translate(hc.x, hc.y);
    ctx.rotate(look * 0.35 * (1 - turn));
    blob(0, 0, lerp(12, 12.8, turn), 12);
    const ear = (side, front) => {
      const P = side.map((p, i) => mix(p, front[i], turn));
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[2].x, P[2].y); ctx.lineTo(P[1].x, P[1].y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    ear([{ x: -9, y: -7.5 }, { x: -2, y: -11.8 }, { x: -8, y: -19.5 }], [{ x: -10.5, y: -6 }, { x: -2.5, y: -11.5 }, { x: -10, y: -20 }]);
    ear([{ x: 1, y: -11.5 }, { x: 9, y: -7.5 }, { x: 6, y: -21 }], [{ x: 2.5, y: -11.5 }, { x: 10.5, y: -6 }, { x: 10, y: -20 }]);
    blob(lerp(8.5, 0, turn), lerp(3.5, 5, turn), lerp(6.5, 6, turn), lerp(5, 4.4, turn));

    // whiskers: one side in profile, both when facing you
    ctx.lineWidth = 0.6;
    const wsk = (x, y, s) => { line({ x, y }, { x: x + 12 * s, y: y - 2.5 }); line({ x, y: y + 1 }, { x: x + 12 * s, y: y + 4 }); };
    ctx.globalAlpha = 1 - turn; wsk(11, 3.5, 1);
    ctx.globalAlpha = turn; wsk(5, 5, 1); wsk(-5, 5, -1);
    ctx.globalAlpha = 1;

    // eyes: ochre with a slit, pupils widen when it looks at you
    const eye = (x, y, alpha) => {
      if (alpha <= 0.02) return;
      const open = 1 - cat.blink * 0.92;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = eyeCol; blob(x, y, 2.7, 2 * open);
      ctx.fillStyle = ink; blob(x + 0.3 * (1 - turn), y, lerp(0.65, 1.3, turn), 1.7 * open);
      ctx.globalAlpha = 1;
    };
    eye(lerp(5.5, 4.6, turn), lerp(-2, -1.5, turn), 1);
    eye(lerp(-1, -4.6, turn), -1.5, turn);
    ctx.restore();

    // near legs, in front of the body
    ctx.fillStyle = ink;
    leg(hipRoot, HN, 20, 22, -1, 10, 6);
    leg(shRoot, FN, 20, 20, 1, 8, 6);
    ctx.restore();
  }

  /* ---------- reading the page ---------- */
  // the visible extent of an element: for a block of plain text, the text itself
  function box(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "block" && [...el.children].every((c) => getComputedStyle(c).display.startsWith("inline"))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      if (t.width > 4 && t.height > 4) return t;
    }
    return el.getBoundingClientRect();
  }

  // where to stand to push el towards the nearer side of the screen
  function stance(el) {
    const r = box(el), u = U(), W = vw();
    const pref = r.left + r.width / 2 < W / 2 ? -1 : 1;
    let partial = null;
    for (const dir of [pref, -pref]) {
      const edge = dir === 1 ? r.left : r.right;
      const x = edge - dir * REACH * u;
      const tail = x - dir * 50 * u, nose = x + dir * 60 * u;
      const s = { el, dir, x: x + scrollX, g: r.bottom + scrollY };
      if (Math.min(tail, nose) >= 4 && Math.max(tail, nose) <= W - 4) return s;
      if (!partial && edge > 0 && edge < W && x > -34 * u && x < W + 34 * u) partial = { ...s, partial: true };
    }
    return partial;
  }

  function candidates() {
    const H = vh(), W = vw(), u = U(), out = [];
    document.querySelectorAll(TARGETS).forEach((el) => {
      if (knocked.has(el)) return;
      const r = box(el);
      if (r.width < 10 || r.height < 8 || r.bottom < 80 * u || r.bottom > H - 6 || r.right < 0 || r.left > W) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.1) return;
      const s = stance(el);
      if (s) out.push(s);
    });
    return out;
  }

  const onScreen = () => {
    const sx = cat.x - scrollX, sy = cat.g - scrollY;
    return cat.on && sx > -40 && sx < vw() + 40 && sy > 0 && sy < vh() + 20;
  };

  function pick() {
    const c = candidates();
    if (!c.length) return null;
    c.forEach((s) => (s.cost = onScreen() ? Math.hypot(s.x - cat.x, (s.g - cat.g) * 1.5) : Math.random()));
    c.sort((a, b) => a.cost - b.cost);
    return c[Math.floor(Math.random() * Math.min(3, c.length))];
  }

  function liveEdge(s) {
    const r = box(s.el);
    return (s.dir === 1 ? r.left : r.right) + scrollX;
  }

  /* ---------- pushing things ---------- */
  function nudge(el, dir) {
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
    const n = nudges.get(el) || { nx: 0, wob: 0, wv: 0 };
    n.nx += dir * rand(5, 10);
    n.wv += dir * rand(40, 80);
    nudges.set(el, n);
    wake();
  }

  function launch(el, dir) {
    const n = nudges.get(el) || { nx: 0, wob: 0 };
    nudges.delete(el);
    el.style.translate = ""; el.style.rotate = "";
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
    const r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    // a copy that keeps the page's styles (same parent), pinned to the screen
    const c = el.cloneNode(true);
    c.removeAttribute("id");
    c.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, {
      position: "fixed", left: cx - w / 2 + "px", top: cy - h / 2 + "px", width: w + "px", height: h + "px",
      margin: "0", transition: "none", zIndex: "9000", pointerEvents: "none", visibility: "visible",
      translate: `${n.nx}px 0px`, rotate: `${n.wob}deg`,
    });
    const from = el.querySelectorAll("canvas"), to = c.querySelectorAll("canvas");
    from.forEach((o, i) => {
      if (!o.width || !o.height) return;
      to[i].width = o.width; to[i].height = o.height;
      to[i].getContext("2d").drawImage(o, 0, 0);
    });
    el.after(c);
    el.style.visibility = "hidden";
    knocked.add(el);
    updateBar();

    const light = clamp(160 / Math.max(w, h), 0.4, 1); // small things fly further
    flying.push({
      c, cx, cy, rad: Math.hypot(w, h) / 2,
      x: n.nx, y: 0, a: n.wob,
      vx: dir * rand(300, 520) * (0.6 + 0.6 * light), vy: -rand(150, 340) * (0.6 + 0.5 * light),
      va: dir * rand(140, 400) * (0.5 + light),
    });
    wake();
  }

  /* ---------- behaviour ---------- */
  async function turn(g, dir) {
    if (dir === cat.dir) return;
    const f0 = cat.face;
    await tween(g, 240, (k) => (cat.face = lerp(f0, dir, ease(k))));
    cat.dir = dir; cat.face = dir;
  }

  async function walkTo(g, x, speed = 1) {
    const dir = Math.sign(x - cat.x);
    if (!dir) return;
    await turn(g, dir);
    cat.walking = true;
    try {
      for (;;) {
        const dt = await step(g), u = U();
        const v = SPEED * u * speed * (0.35 + 0.65 * cat.gait) * dt;
        if (Math.abs(x - cat.x) <= v) { cat.x = x; break; }
        cat.x += dir * v;
        cat.phase += (v / u / STRIDE) * Math.PI * 2;
      }
    } finally { cat.walking = false; }
  }

  async function jumpTo(g, x, ground) {
    const u = U(), dir = Math.sign(x - cat.x) || cat.dir;
    await turn(g, dir);
    await tween(g, 200, (k) => (cat.crouch = ease(k)));
    const x0 = cat.x, g0 = cat.g, up = g0 - ground;
    const h = up > 0 ? up * 0.75 + 26 * u : 26 * u;
    const ms = Math.min(950, 360 + Math.hypot(x - x0, up) * 0.9);
    cat.crouch = 0;
    await tween(g, ms, (k) => {
      cat.x = lerp(x0, x, k);
      cat.g = lerp(g0, ground, k) - h * 4 * k * (1 - k);
      cat.air = Math.sin(Math.PI * clamp(k * 1.1, 0, 1));
      cat.tilt = -(0.5 - k) * 0.6;
    });
    cat.x = x; cat.g = ground; cat.air = 0; cat.tilt = 0;
    await tween(g, 220, (k) => (cat.crouch = 0.8 * (1 - ease(k))));
  }

  async function standUp(g) {
    if (cat.sit <= 0) return;
    const s0 = cat.sit, l0 = cat.look;
    await tween(g, 280, (k) => { cat.sit = s0 * (1 - ease(k)); cat.look = l0 * (1 - ease(k)); });
  }

  async function sitDown(g, look = 0) {
    const s0 = cat.sit, c0 = cat.crouch, l0 = cat.look;
    await tween(g, 380, (k) => { cat.sit = lerp(s0, 1, ease(k)); cat.crouch = c0 * (1 - ease(k)); cat.look = lerp(l0, look, ease(k)); });
  }

  async function leave(g, speed = 1.6) {
    await standUp(g);
    const u = U(), left = cat.x - scrollX < vw() / 2;
    await walkTo(g, left ? scrollX - 90 * u : scrollX + vw() + 90 * u, speed);
    cat.on = false;
  }

  async function approach(g, s) {
    const u = U();
    const fresh = !onScreen() || s.partial || Math.abs(s.g - cat.g) > vh() * 0.55;
    if (fresh) {
      if (onScreen()) await leave(g);
      Object.assign(cat, { on: true, sit: 0, crouch: 0, air: 0, tilt: 0, look: 0, turn: 0, dir: s.dir, face: s.dir, g: s.g });
      cat.x = s.dir === 1 ? scrollX - 70 * u : scrollX + vw() + 70 * u;
      await walkTo(g, s.x);
      return;
    }
    await standUp(g);
    if (Math.abs(s.g - cat.g) < 3) { await walkTo(g, s.x); return; }
    const gap = s.x - cat.x, max = 150 * u;
    if (Math.abs(gap) > max) await walkTo(g, s.x - Math.sign(gap) * max);
    await jumpTo(g, s.x, s.g);
  }

  // shuffle up so the edge stays within reach
  async function creep(g, s) {
    const x = liveEdge(s) - s.dir * REACH * U();
    if (Math.abs(x - cat.x) > 2) { await walkTo(g, x, 0.5); await turn(g, s.dir); }
  }

  async function paw(g, s, swipe) {
    const ms = swipe ? 300 : 520;
    let hit = false;
    await tween(g, ms, (k) => {
      const e = ((liveEdge(s) - cat.x) * cat.dir) / U();
      const reach = Math.sin(Math.PI * k);
      const target = { x: e + (swipe ? 7 : 1), y: swipe ? -14 : -18 };
      cat.paw = { x: lerp(27, target.x, reach), y: lerp(0, target.y, reach) - Math.sin(Math.PI * reach) * 8 };
      if (!hit && k >= 0.5) { hit = true; swipe ? launch(s.el, s.dir) : nudge(s.el, s.dir); }
    });
    cat.paw = null;
  }

  async function lookAtYou(g, hold = 700) {
    const l0 = cat.look;
    await tween(g, 260, (k) => { cat.turn = ease(k); cat.look = l0 * (1 - ease(k)); });
    await wait(g, hold * 0.6);
    cat.blink = 1;
    await wait(g, hold * 0.4);
    await tween(g, 260, (k) => (cat.turn = 1 - ease(k)));
  }

  async function tease(g, s) {
    await turn(g, s.dir);
    await tween(g, 450, (k) => { cat.crouch = 0.45 * ease(k); cat.look = 0.6 * ease(k); });
    const taps = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < taps; i++) {
      cat.twitch = 1;
      await creep(g, s);
      await paw(g, s, false);
      await wait(g, rand(220, 650));
    }
    await lookAtYou(g, rand(600, 1100));
    cat.look = 0.6;
    await creep(g, s);
    await paw(g, s, true);
  }

  async function watch(g) {
    await sitDown(g, 1);
    await wait(g, 900);
    await lookAtYou(g, 900);
    await wait(g, rand(300, 900));
  }

  async function life(g) {
    try {
      await wait(g, 300);
      for (;;) {
        const s = pick();
        if (!s) {
          if (cat.on && onScreen()) await sitDown(g, 0);
          await wait(g, 1200);
          continue;
        }
        await approach(g, s);
        if (!s.el.isConnected || knocked.has(s.el)) continue;
        // the page may have moved while the cat walked over
        const again = stance(s.el);
        if (!again || Math.abs(again.g - cat.g) > 8) continue;
        Object.assign(s, again);
        await tease(g, s);
        await watch(g);
      }
    } catch (e) { if (e !== STOP) throw e; }
  }

  /* ---------- controls ---------- */
  function start() {
    if (running) return;
    running = true;
    life(++gen);
    wake();
    updateBar();
  }

  function stop() {
    if (!running) return;
    running = false;
    const g = ++gen;
    updateBar();
    (async () => {
      try { if (onScreen()) await leave(g, 2.4); } catch (e) { if (e !== STOP) throw e; }
      if (g !== gen) return;
      cat.on = false; cat.paw = null;
      nudges.forEach((n, el) => { el.style.translate = ""; el.style.rotate = ""; });
      nudges.clear();
    })();
    wake();
  }

  function restore() {
    flying.forEach((f) => f.c.remove());
    flying = [];
    knocked.forEach((el) => {
      el.style.visibility = "";
      el.animate([{ opacity: 0, translate: "0 -14px" }, { opacity: 1, translate: "0 0" }], { duration: 420, easing: "ease-out" });
    });
    knocked.clear();
    updateBar();
  }

  function updateBar() {
    if (!bar) return;
    bar.querySelector('[data-act="toggle"]').textContent = running ? "Shoo the cat" : "Let the cat in";
    const reset = bar.querySelector('[data-act="reset"]');
    reset.textContent = knocked.size ? `Put back (${knocked.size})` : "Put back";
    reset.disabled = !knocked.size;
  }

  function init(opts = {}) {
    canvas = document.createElement("canvas");
    canvas.className = "page-cat";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");

    bar = document.createElement("div");
    bar.className = "page-cat-ui mono";
    bar.innerHTML = '<button type="button" data-act="toggle"></button><button type="button" data-act="reset"></button>';
    bar.addEventListener("click", (e) => {
      const act = e.target.closest("button") && e.target.closest("button").dataset.act;
      if (act === "toggle") (running ? stop : start)();
      if (act === "reset") restore();
    });
    document.body.appendChild(bar);
    updateBar();

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (opts.autostart !== false && !calm) setTimeout(start, opts.delay ?? 1400);
  }

  return { init, start, stop, restore };
})();
