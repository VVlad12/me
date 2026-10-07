(function () {
  const S = window.SITE;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const slug = (s) => String(s || "untitled").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Shared with the local editor (assets/js/editor.js)
  const Site = (window.Site = { S, esc, slug, editing: false });

  // Read / write a value by path, e.g. "gallery.2.title"
  Site.get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S);
  Site.set = (path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    const obj = keys.reduce((o, k) => (o[k] ??= {}), S);
    obj[last] = value;
  };

  /* ---------- theme: colours and fonts from data.js ---------- */
  const TOKENS = ["fog", "fog-deep", "paper", "bark", "muted", "line", "moss", "ochre", "beet", "blush", "petal"];
  const FONT_VARS = { display: ["--f-display", "Georgia, serif"], body: ["--f-body", "system-ui, sans-serif"], mono: ["--f-mono", "ui-monospace, Consolas, monospace"] };
  const loadedFonts = new Set(["Young Serif", "Schibsted Grotesk", "DM Mono"]);

  Site.loadFont = (name) => {
    if (!name || loadedFonts.has(name)) return;
    loadedFonts.add(name);
    const fam = name.trim().replace(/ +/g, "+");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600&display=swap`;
    // single-weight families reject the weight list, so retry without it
    link.onerror = () => { link.onerror = null; link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`; };
    document.head.appendChild(link);
  };

  Site.applyTheme = () => {
    const root = document.documentElement;
    const t = S.theme || {};
    const mode = root.dataset.theme === "dark" ? "dark" : "light";
    TOKENS.forEach((k) => root.style.removeProperty("--" + k));
    Object.entries(t[mode] || {}).forEach(([k, v]) => v && root.style.setProperty("--" + k, v));
    Object.entries(FONT_VARS).forEach(([k, [cssVar, fallback]]) => {
      const name = t.fonts && t.fonts[k];
      if (name) { Site.loadFont(name); root.style.setProperty(cssVar, `"${name}", ${fallback}`); }
      else root.style.removeProperty(cssVar);
    });
  };
  Site.TOKENS = TOKENS;
  Site.applyTheme();

  /* ---------- light / dark toggle (light by default) ---------- */
  const toggle = $("#theme-toggle");
  const setTheme = (dark) => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (toggle) toggle.textContent = dark ? "Light" : "Dark";
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    Site.applyTheme();
    document.dispatchEvent(new Event("themechange"));
  };
  if (toggle) {
    toggle.textContent = document.documentElement.dataset.theme === "dark" ? "Light" : "Dark";
    toggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme !== "dark"));
  }

  /* ---------- shared bits ---------- */
  Site.renderName = () => document.querySelectorAll("[data-name]").forEach((el) => (el.textContent = S.name));
  Site.renderName();
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- page heads (business / profile) ---------- */
  Site.renderPageHead = () => {
    const head = $(".page-head[data-page]");
    const p = head && S.pages && S.pages[head.dataset.page];
    if (!p) return;
    const key = "pages." + head.dataset.page;
    head.innerHTML = `<h1 data-bind="${key}.title">${esc(p.title)}</h1><p data-bind="${key}.intro">${esc(p.intro)}</p>`;
  };
  Site.renderPageHead();

  /* ---------- hero ---------- */
  const hero = $("#hero");
  Site.renderHero = () => {
    if (!hero) return;
    hero.querySelector(".hero-photo img").src = S.photo;
    hero.querySelector(".hero-photo img").alt = "Portrait of " + S.name;
    hero.querySelector(".hero-text").innerHTML = `
      <div class="role mono" data-bind="role">${esc(S.role)}</div>
      <h1 data-bind="name">${esc(S.name)}</h1>
      ${S.summary.map((p, i) => `<p data-bind="summary.${i}">${esc(p)}</p>`).join("")}
      <div class="links">
        ${S.contact.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label)}</a>`).join("")}
      </div>`;
  };
  if (hero) {
    hero.innerHTML = `
      <figure class="hero-photo"><img src="" alt=""></figure>
      <div class="hero-text"></div>
      <div class="garden" aria-hidden="true">
        <canvas></canvas>
        <div class="garden-meta mono">
          <span>Bouquet no. <span id="seed"></span></span>
          <button type="button" id="regrow">Grow another</button>
        </div>
      </div>`;
    Site.renderHero();
    const g = window.Garden.garden(hero.querySelector(".garden canvas"), (seed) => ($("#seed").textContent = seed));
    g.plant();
    $("#regrow").addEventListener("click", () => g.plant());
  }

  /* ---------- ledger pages ---------- */
  const list = $("#list");
  Site.listSource = list && list.dataset.source;
  Site.renderList = () => {
    if (!list) return;
    const src = list.dataset.source;
    const items = S[src] || [];
    let section = null;
    list.innerHTML = items.map((it, i) => {
      const key = `${src}.${i}`;
      const title = it.link
        ? `<a href="${esc(it.link)}" target="_blank" rel="noopener" data-bind="${key}.title">${esc(it.title)}</a>`
        : `<span data-bind="${key}.title">${esc(it.title)}</span>`;
      // a heading row whenever the entry's section changes (Experience, Education, …)
      const head = it.section && it.section !== section
        ? `<li class="ledger-section"><h2 class="mono">${esc(it.section)}</h2></li>` : "";
      section = it.section || null;
      const points = (it.points || []).length
        ? `<ul class="points">${it.points.map((p, n) => `<li data-bind="${key}.points.${n}">${esc(p)}</li>`).join("")}</ul>` : "";
      return `${head}<li class="entry" data-entry="${i}">
        <div class="meta mono" data-bind="${key}.meta">${esc(it.meta)}</div>
        <div>
          <h2>${title}</h2>
          ${it.text ? `<p data-bind="${key}.text">${esc(it.text)}</p>` : ""}
          ${points}
        </div>
      </li>`;
    }).join("");
  };
  Site.renderList();

  /* ---------- desktop gallery ---------- */
  const desk = $("#desktop");
  Site.hasGallery = !!desk;

  const sizes = { s: 215, m: 250, l: 295 };
  const autoSize = new WeakMap();   // random size / picture height per item, kept across redraws
  const placed = new WeakMap();     // last position per item
  let wins = [];
  let filter = "all";
  let top = 10;

  const imagesOf = (it) => [].concat(it.images || [], it.image || []).filter((v, i, a) => v && a.indexOf(v) === i);
  const pathOf = (it) => `~/${it.type === "hobby" ? "hobbies" : "projects"}/${slug(it.title)}`;
  Site.imagesOf = imagesOf;

  // per-item colours and fonts (item.style) become CSS variables
  function styleVars(el, it) {
    const st = it.style || {};
    const vars = { "--bar-bg": st.bar, "--tint": st.tint, "--card-font": st.font && `"${st.font}", var(--f-display)`,
                   "--title-color": st.titleColor, "--text-color": st.textColor };
    Object.entries(vars).forEach(([k, v]) => (v ? el.style.setProperty(k, v) : el.style.removeProperty(k)));
    if (st.font) Site.loadFont(st.font);
  }

  function buildWindow(it, i) {
    if (!autoSize.has(it)) autoSize.set(it, { size: pick(["s", "m", "m", "l"]), mh: Math.round(rand(90, 150)) });
    const auto = autoSize.get(it);
    const img = imagesOf(it)[0];
    const el = document.createElement("article");
    el.className = "win";
    el.dataset.type = it.type;
    el.dataset.index = i;
    el.style.setProperty("--w", sizes[it.size || auto.size] + "px");
    el.style.setProperty("--mh", auto.mh + "px");
    styleVars(el, it);
    el.innerHTML = `
      <div class="win-bar"><span>${esc(pathOf(it))}</span><span class="box"></span></div>
      <div class="win-media">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<canvas></canvas>`}</div>
      <div class="win-body">
        <h3>${esc(it.title)}</h3>
        <p>${esc(it.text)}</p>
        ${it.tags && it.tags.length ? `<div class="tags">${it.tags.map(esc).join(" · ")}</div>` : ""}
      </div>`;
    if (filter !== "all" && it.type !== filter) el.classList.add("hidden");
    makeDraggable(el);
    return el;
  }

  function paintSwatches() {
    wins.forEach((el, i) => {
      const c = el.querySelector(".win-media canvas");
      const it = S.gallery[i];
      if (c) window.Garden.swatch(c, it.title, it.style && it.style.tint);
    });
  }

  const isPhone = () => window.matchMedia("(max-width: 640px)").matches;
  // side margin of the desk: at least 40px, growing to 120px on wide screens
  const edge = () => Math.max(40, Math.min(120, desk.clientWidth * 0.06));

  function remember(el) {
    const it = S.gallery[+el.dataset.index];
    if (it) placed.set(it, { left: el.style.left, top: el.style.top, rot: el.style.getPropertyValue("--rot"), z: el.style.zIndex });
  }

  function fitHeight() {
    const visible = wins.filter((w) => !w.classList.contains("hidden"));
    // use the target position, not offsetTop, which lags behind while windows slide into place
    const maxBottom = Math.max(...visible.map((el) => (parseFloat(el.style.top) || el.offsetTop) + el.offsetHeight), 360);
    desk.style.height = maxBottom + 40 + "px";
  }

  // Loose masonry: each window drops into one of the lowest columns with
  // random jitter, tilt and a bit of overlap, like windows left open on a desk.
  function scatter() {
    paintSwatches();
    if (isPhone()) { desk.style.height = ""; return; }
    const visible = wins.filter((w) => !w.classList.contains("hidden"));
    visible.sort(() => Math.random() - 0.5);

    const W = desk.clientWidth;
    const pad = edge();
    const cols = Math.max(2, Math.floor((W - pad * 2) / 290));
    const colW = (W - pad * 2) / cols;
    const bottoms = Array.from({ length: cols }, () => pad + rand(0, 50));

    visible.forEach((el) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      const order = bottoms.map((b, i) => [b, i]).sort((a, b) => a[0] - b[0]);
      const col = order[Math.random() < 0.7 ? 0 : Math.min(1, cols - 1)][1];

      const spare = Math.max(0, colW - w);
      let x = pad + col * colW + rand(-0.3, 1.3) * spare;
      x = Math.min(Math.max(pad, x), W - w - pad);
      const y = bottoms[col] + rand(0, 40);

      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--rot", rand(-3, 3).toFixed(2) + "deg");
      el.style.zIndex = Math.floor(rand(1, 10));
      bottoms[col] = y + h * rand(0.8, 0.95);
      remember(el);
    });
    fitHeight();
  }

  // Redraw every window, keeping the ones already on the desk where they are.
  // New windows land near the top-left of what is currently on screen.
  Site.rebuild = () => {
    if (!desk) return;
    desk.innerHTML = "";
    wins = S.gallery.map((it, i) => {
      const el = buildWindow(it, i);
      desk.appendChild(el);
      const p = placed.get(it);
      if (p) {
        el.style.left = p.left; el.style.top = p.top; el.style.zIndex = p.z;
        el.style.setProperty("--rot", p.rot);
      } else {
        el.style.left = edge() + "px";
        el.style.top = Math.max(24, 90 - desk.getBoundingClientRect().top) + "px";
        el.style.setProperty("--rot", "0deg");
        el.style.zIndex = 100 + ++top;
        remember(el);
      }
      return el;
    });
    Site.windows = wins;
    paintSwatches();
    if (!isPhone()) fitHeight();
  };

  function makeDraggable(el) {
    let sx, sy, ox, oy, moved = false, active = false;

    el.addEventListener("pointerdown", (e) => {
      if (isPhone() || e.button !== 0) return;
      active = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      ox = el.offsetLeft; oy = el.offsetTop;
      el.style.zIndex = 100 + ++top;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      el.classList.add("dragging");
      const m = edge() / 2;
      el.style.left = Math.min(Math.max(m, ox + dx), desk.clientWidth - el.offsetWidth - m) + "px";
      el.style.top = Math.max(16, oy + dy) + "px";
      const need = el.offsetTop + el.offsetHeight + 40;
      if (need > desk.clientHeight) desk.style.height = need + "px";
    });

    const end = () => {
      if (!active) return;
      active = false;
      el.classList.remove("dragging");
      remember(el);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);

    // a click that wasn't a drag opens the detail window (or the editor panel)
    el.addEventListener("click", () => {
      if (moved) { moved = false; return; }
      const i = +el.dataset.index;
      if (Site.editing && Site.onCardClick) Site.onCardClick(i);
      else openDetail(i);
    });
  }

  /* ---------- detail window ---------- */
  const dlg = document.createElement("dialog");
  dlg.className = "detail";
  if (desk) document.body.appendChild(dlg);

  function openDetail(i, fromHash) {
    const it = S.gallery[i];
    if (!it) return;
    const imgs = imagesOf(it);
    const paras = [].concat(it.details && it.details.length ? it.details : it.text);
    const links = [].concat(it.links || [], it.link ? [{ label: "Open project", url: it.link }] : []);
    dlg.dataset.type = it.type;
    dlg.dataset.index = i;
    styleVars(dlg, it);
    dlg.innerHTML = `
      <div class="win-bar"><span>${esc(pathOf(it))}</span><button class="detail-close" aria-label="Close">&times;</button></div>
      <div class="detail-scroll">
        <div class="detail-media">${imgs.length ? `<img src="${esc(imgs[0])}" alt="">` : `<canvas></canvas>`}</div>
        ${imgs.length > 1 ? `<div class="detail-thumbs">${imgs.map((src, n) =>
          `<button type="button" aria-current="${n === 0}" data-src="${esc(src)}"><img src="${esc(src)}" alt="Image ${n + 1}"></button>`).join("")}</div>` : ""}
        <div class="detail-body">
          <div class="text">
            <h2>${esc(it.title)}</h2>
            ${paras.map((p) => `<p>${esc(p)}</p>`).join("")}
          </div>
          <dl class="facts">
            <div><dt>Type</dt><dd>${it.type === "hobby" ? "Hobby" : "Project"}</dd></div>
            ${it.year ? `<div><dt>When</dt><dd>${esc(it.year)}</dd></div>` : ""}
            ${it.tags && it.tags.length ? `<div><dt>Tags</dt><dd>${it.tags.map(esc).join(", ")}</dd></div>` : ""}
            ${links.length ? `<div><dt>Links</dt><dd>${links.map((l) =>
              `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} &#8599;</a>`).join("")}</dd></div>` : ""}
          </dl>
        </div>
      </div>`;

    dlg.querySelector(".detail-close").addEventListener("click", () => dlg.close());
    dlg.querySelectorAll(".detail-thumbs button").forEach((b) => b.addEventListener("click", () => {
      dlg.querySelector(".detail-media img").src = b.dataset.src;
      dlg.querySelectorAll(".detail-thumbs button").forEach((x) => x.setAttribute("aria-current", x === b));
    }));

    if (!dlg.open) dlg.showModal();
    const c = dlg.querySelector(".detail-media canvas");
    if (c) window.Garden.swatch(c, it.title, it.style && it.style.tint);
    if (!fromHash) history.replaceState(null, "", "#" + slug(it.title));
  }
  Site.openDetail = openDetail;

  if (desk) {
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // backdrop
    dlg.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));

    // shareable links: index.html#collaborative-map opens that window
    const fromHash = () => {
      const i = S.gallery.findIndex((it) => slug(it.title) === location.hash.slice(1));
      if (i >= 0) openDetail(i, true);
    };
    window.addEventListener("hashchange", fromHash);

    /* filters + shuffle */
    document.querySelectorAll(".filter[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter[data-filter]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
        filter = btn.dataset.filter;
        wins.forEach((w) => w.classList.toggle("hidden", filter !== "all" && w.dataset.type !== filter));
        scatter();
      });
    });
    const shuffle = $("#shuffle");
    if (shuffle) shuffle.addEventListener("click", scatter);

    // re-scatter only when the desktop's width changes
    let t, lastW = 0;
    new ResizeObserver(() => {
      if (desk.clientWidth === lastW) return;
      lastW = desk.clientWidth;
      clearTimeout(t);
      t = setTimeout(scatter, 150);
    }).observe(desk);
    document.addEventListener("themechange", () => {
      paintSwatches();
      const c = dlg.open && dlg.querySelector(".detail-media canvas");
      const it = S.gallery[+dlg.dataset.index];
      if (c && it) window.Garden.swatch(c, it.title, it.style && it.style.tint);
    });

    Site.rebuild();
    scatter();
    fromHash();
    window.addEventListener("load", scatter, { once: true });
  }

  /* ---------- local editor: only on your own machine, never on GitHub Pages ---------- */
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.protocol === "file:";
  if (local) {
    const v = (document.querySelector('script[src*="site.js"]').getAttribute("src").split("?")[1] || "");
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "assets/css/editor.css?" + v;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "assets/js/editor.js?" + v;
    document.body.appendChild(js);
  }
})();
