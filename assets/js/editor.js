/*
 * Local editor. site.js only loads this file when the page is opened from
 * localhost or as a local file, so it never runs on GitHub Pages.
 *
 * Saving writes assets/js/data.js through the preview server (.claude/serve.py).
 * Without that server, Save downloads a data.js to replace by hand.
 */
(function () {
  const Site = window.Site;
  const S = Site.S;
  const esc = Site.esc;

  const FONTS = [
    "Young Serif", "Fraunces", "DM Serif Display", "Playfair Display", "Gloock", "Instrument Serif",
    "Cormorant Garamond", "EB Garamond", "Libre Caslon Text", "Literata", "Source Serif 4",
    "Bricolage Grotesque", "Syne", "Space Grotesk", "Schibsted Grotesk", "Inter", "Work Sans", "Karla",
    "Manrope", "IBM Plex Sans", "DM Mono", "JetBrains Mono", "IBM Plex Mono", "Space Mono", "Caveat", "Kalam",
  ];
  const TOKEN_LABELS = {
    fog: "Page background", "fog-deep": "Gallery background", paper: "Cards and panels", bark: "Text",
    muted: "Secondary text", line: "Lines and borders", moss: "Moss (hobby bars, stems)",
    ochre: "Ochre (underlines, flower hearts)", beet: "Beet (hover, flowers)", blush: "Blush (flowers)", petal: "Petals",
  };

  const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    card: icon('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9h18M12 12v5M9.5 14.5h5"/>'),
    entry: icon('<path d="M4 6h16M4 12h10M4 18h16M18 10v4M16 12h4"/>'),
    style: icon('<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/><path d="M12 20.5c-1.5 0-2-1-2-2s1-1.8 2-1.8"/>'),
    save: icon('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
  };

  /* ---------- helpers ---------- */
  const getK = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const setK = (obj, key, v) => {
    const keys = key.split(".");
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] && typeof o[k] === "object" ? o[k] : (o[k] = {})), obj);
    const empty = v === "" || v == null || (Array.isArray(v) && v.length === 0);
    if (empty) delete target[last]; else target[last] = v;
  };
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim();
  const cx = document.createElement("canvas").getContext("2d");
  const toHex = (c) => { cx.fillStyle = "#000000"; cx.fillStyle = c || "#000000"; return /^#[0-9a-f]{6}$/i.test(cx.fillStyle) ? cx.fillStyle : "#000000"; };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // text <-> data converters for the form fields
  const FMT = {
    paras: [(v) => [].concat(v || []).join("\n\n"), (s) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)],
    lines: [(v) => [].concat(v || []).join("\n"), (s) => s.split("\n").map((l) => l.trim()).filter(Boolean)],
    tags: [(v) => [].concat(v || []).join(", "), (s) => s.split(",").map((t) => t.trim()).filter(Boolean)],
    links: [
      (v) => [].concat(v || []).map((l) => `${l.label} | ${l.url}`).join("\n"),
      (s) => s.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [label, url] = l.split("|").map((x) => x.trim());
        return { label, url: url || label };
      }),
    ],
  };

  /* ---------- toast ---------- */
  const toastEl = document.createElement("div");
  toastEl.className = "ed-toast";
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let toastT;
  function toast(msg, warn) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("warn", !!warn);
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), warn ? 7000 : 2500);
  }

  /* ---------- toolbar ---------- */
  const bar = document.createElement("div");
  bar.className = "ed-bar";
  const btn = (act, label, extra = "") =>
    `<button type="button" class="ed-btn" data-act="${act}" aria-label="${label}" ${extra}>${ICONS[act]}<span class="ed-tip">${label}</span></button>`;
  bar.innerHTML = [
    btn("edit", "Edit mode", 'aria-pressed="false"'),
    Site.hasGallery ? btn("card", "New card") : "",
    Site.listSource ? btn("entry", "New entry") : "",
    btn("style", "Site style and profile"),
    btn("save", "Save (Ctrl+S)"),
  ].join("");
  document.body.appendChild(bar);

  const pill = document.createElement("div");
  pill.className = "ed-pill mono";
  pill.textContent = Site.hasGallery
    ? "Edit mode: click text to change it, click a card to edit it"
    : "Edit mode: click text to change it, use Edit on an entry for its link and order";
  document.body.appendChild(pill);

  let dirty = false;
  function changed() { dirty = true; bar.classList.add("dirty"); }
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  bar.addEventListener("click", (e) => {
    const b = e.target.closest(".ed-btn");
    if (!b) return;
    ({
      edit: () => setEditing(!Site.editing),
      card: newCard,
      entry: newEntry,
      style: openSitePanel,
      save,
    })[b.dataset.act]();
  });

  /* ---------- inline text editing ---------- */
  function setEditable(el, on) {
    if (!on) return el.removeAttribute("contenteditable");
    try { el.contentEditable = "plaintext-only"; } catch (e) { el.contentEditable = "true"; }
  }
  function refresh() {
    document.querySelectorAll("[data-bind]").forEach((el) => setEditable(el, Site.editing));
    if (Site.listSource) {
      document.querySelectorAll(".entry").forEach((li) => {
        if (!li.querySelector(".ed-handle"))
          li.insertAdjacentHTML("beforeend", `<button type="button" class="ed-handle mono">Edit</button>`);
      });
      const list = document.getElementById("list");
      if (list && !document.querySelector(".ed-add")) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "ed-add mono";
        add.textContent = "+ Add entry";
        add.addEventListener("click", () => newEntry());
        list.after(add);
      }
    }
  }
  function setEditing(on) {
    Site.editing = on;
    document.documentElement.classList.toggle("ed-on", on);
    bar.querySelector('[data-act="edit"]').setAttribute("aria-pressed", on);
    refresh();
    if (!on) closePanel();
  }

  document.addEventListener("input", (e) => {
    const el = e.target.closest && e.target.closest("[data-bind]");
    if (!el || !Site.editing) return;
    Site.set(el.dataset.bind, el.textContent.trim());
    if (el.dataset.bind === "name") Site.renderName();
    changed();
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest("[data-bind]");
    if (el && Site.editing && e.key === "Enter") { e.preventDefault(); el.blur(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    if (e.key === "Escape" && !panel.hidden && !document.querySelector("dialog[open]")) closePanel();
  });
  // paste as plain text, and keep links from navigating while editing
  document.addEventListener("paste", (e) => {
    if (!Site.editing || !(e.target.closest && e.target.closest("[data-bind]"))) return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  document.addEventListener("click", (e) => {
    if (!Site.editing) return;
    const handle = e.target.closest(".ed-handle");
    if (handle) { e.preventDefault(); openEntryPanel(+handle.closest(".entry").dataset.entry); return; }
    const a = e.target.closest("a");
    if (a && (a.closest("[data-bind]") || a.closest(".hero-text") || a.closest(".entry"))) e.preventDefault();
  }, true);

  /* ---------- side panel ---------- */
  const panel = document.createElement("aside");
  panel.className = "ed-panel";
  panel.hidden = true;
  document.body.appendChild(panel);
  let panelKind = null;

  const datalist = document.createElement("datalist");
  datalist.id = "ed-fonts";
  datalist.innerHTML = FONTS.map((f) => `<option value="${f}"></option>`).join("");
  document.body.appendChild(datalist);

  function closePanel() {
    panel.hidden = true;
    panelKind = null;
    document.querySelectorAll(".ed-selected").forEach((el) => el.classList.remove("ed-selected"));
  }

  let fieldId = 0;
  /*
   * sections: [{ title, fields: [{ label, key, type, options, placeholder, fallback }] }]
   * obj: the object the keys refer to; onChange: redraw after an edit
   * actions: [{ label, run, danger }]
   */
  function openPanel(kind, title, obj, sections, onChange, actions = []) {
    panelKind = kind;
    panel.hidden = false;
    panel.innerHTML = `
      <header class="ed-panel-head"><h2>${esc(title)}</h2><button type="button" class="ed-close" aria-label="Close panel">&times;</button></header>
      <div class="ed-panel-body"></div>
      ${actions.length ? `<footer class="ed-actions"></footer>` : ""}`;
    panel.querySelector(".ed-close").addEventListener("click", closePanel);
    const body = panel.querySelector(".ed-panel-body");
    const redraw = debounce(onChange, 120);

    sections.forEach((sec) => {
      const box = document.createElement("section");
      box.className = "ed-section";
      box.innerHTML = `<h3 class="mono">${esc(sec.title)}</h3>`;
      sec.fields.forEach((f) => box.appendChild(field(f, obj, () => { changed(); redraw(); })));
      body.appendChild(box);
    });

    const foot = panel.querySelector(".ed-actions");
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-action" + (a.danger ? " danger" : "");
      b.textContent = a.label;
      b.addEventListener("click", () => {
        if (a.danger && !b.dataset.armed) { // confirm in place: first click arms, second click runs
          b.dataset.armed = "1";
          b.textContent = "Click again to confirm";
          setTimeout(() => { delete b.dataset.armed; b.textContent = a.label; }, 3000);
          return;
        }
        a.run();
      });
      foot.appendChild(b);
    });
  }

  function field(f, obj, onChange) {
    const id = "ed-f" + ++fieldId;
    const wrap = document.createElement("div");
    wrap.className = "ed-field";
    const type = f.type || "text";
    const val = getK(obj, f.key);
    const set = (v) => { setK(obj, f.key, v); onChange(); };
    const label = `<label for="${id}">${esc(f.label)}</label>`;

    if (type === "select") {
      wrap.innerHTML = label + `<select id="${id}">${f.options.map(([v, l]) =>
        `<option value="${esc(v)}" ${String(val || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      wrap.querySelector("select").addEventListener("change", (e) => set(e.target.value));
    } else if (type === "color") {
      const fb = f.fallback ? f.fallback() : "#000000";
      wrap.innerHTML = label + `<div class="ed-color">
        <input type="color" aria-label="${esc(f.label)} picker" value="${toHex(val || fb)}">
        <input type="text" id="${id}" value="${esc(val || "")}" placeholder="${esc(fb)} (default)">
        <button type="button" class="ed-mini" title="Back to default">Reset</button></div>`;
      const [pickEl, textEl] = wrap.querySelectorAll("input");
      pickEl.addEventListener("input", () => { textEl.value = pickEl.value; set(pickEl.value); });
      textEl.addEventListener("input", () => { if (textEl.value) pickEl.value = toHex(textEl.value); set(textEl.value.trim()); });
      wrap.querySelector("button").addEventListener("click", () => { textEl.value = ""; pickEl.value = toHex(fb); set(""); });
    } else if (type === "font") {
      wrap.innerHTML = label + `<input type="text" id="${id}" list="ed-fonts" value="${esc(val || "")}" placeholder="${esc(f.placeholder || "Default")}">
        <small>Any Google Fonts family name works.</small>`;
      const inp = wrap.querySelector("input");
      inp.addEventListener("change", () => set(inp.value.trim()));
    } else if (type === "image" || type === "images") {
      const multi = type === "images";
      const shown = multi ? FMT.lines[0](val) : val || "";
      wrap.innerHTML = label + (multi
        ? `<textarea id="${id}" rows="3" placeholder="assets/img/…">${esc(shown)}</textarea>`
        : `<input type="text" id="${id}" value="${esc(shown)}">`) +
        `<div class="ed-row"><button type="button" class="ed-mini">Upload image…</button><small></small></div>
         <input type="file" accept="image/*" ${multi ? "multiple" : ""} hidden>`;
      const inp = wrap.querySelector(multi ? "textarea" : 'input[type="text"]');
      const file = wrap.querySelector('input[type="file"]');
      const note = wrap.querySelector("small");
      const apply = () => set(multi ? FMT.lines[1](inp.value) : inp.value.trim());
      inp.addEventListener("input", apply);
      wrap.querySelector(".ed-mini").addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        for (const fl of file.files) {
          note.textContent = "Uploading " + fl.name + "…";
          try {
            const path = await upload(fl);
            inp.value = multi ? (inp.value.trim() ? inp.value.trim() + "\n" : "") + path : path;
            apply();
            note.textContent = "Saved to " + path;
          } catch (err) {
            note.textContent = "";
            toast("Upload needs the preview server (.claude/serve.py). Copy the image into assets/img/ and type its path instead.", true);
          }
        }
        file.value = "";
      });
    } else if (FMT[type] || type === "textarea") {
      const [fmt, parse] = FMT[type] || [(v) => v || "", (s) => s];
      wrap.innerHTML = label + `<textarea id="${id}" rows="${type === "paras" ? 6 : 3}" placeholder="${esc(f.placeholder || "")}">${esc(fmt(val))}</textarea>`;
      const ta = wrap.querySelector("textarea");
      ta.addEventListener("input", () => set(parse(ta.value)));
    } else {
      wrap.innerHTML = label + `<input type="text" id="${id}" value="${esc(val || "")}" placeholder="${esc(f.placeholder || "")}">`;
      const inp = wrap.querySelector("input");
      inp.addEventListener("input", () => set(inp.value));
    }
    if (f.hint) wrap.insertAdjacentHTML("beforeend", `<small>${esc(f.hint)}</small>`);
    return wrap;
  }

  /* ---------- gallery cards ---------- */
  function select(i) {
    document.querySelectorAll(".ed-selected").forEach((el) => el.classList.remove("ed-selected"));
    const w = Site.windows && Site.windows[i];
    if (w) w.classList.add("ed-selected");
  }

  function openCardPanel(i) {
    const it = S.gallery[i];
    if (!it) return;
    // fold the older single-value fields into their list versions
    if (it.image) { it.images = Site.imagesOf(it); delete it.image; }
    if (it.link) { it.links = [].concat(it.links || [], { label: "Open project", url: it.link }); delete it.link; }

    const redraw = () => { Site.rebuild(); select(S.gallery.indexOf(it)); };
    openPanel("card", "Card", it, [
      { title: "Content", fields: [
        { label: "Type", key: "type", type: "select", options: [["project", "Project"], ["hobby", "Hobby"]] },
        { label: "Title", key: "title" },
        { label: "Short text (on the card)", key: "text", type: "textarea" },
        { label: "Details (blank line between paragraphs)", key: "details", type: "paras", placeholder: "Shown when the card is opened. Leave empty to reuse the short text." },
        { label: "When", key: "year", placeholder: "2024, or 2022 — now" },
        { label: "Tags (comma separated)", key: "tags", type: "tags" },
        { label: "Links (one per line: Label | https://…)", key: "links", type: "links" },
        { label: "Images (one per line, the first is the cover)", key: "images", type: "images" },
      ] },
      { title: "Look", fields: [
        { label: "Size", key: "size", type: "select", options: [["", "Random"], ["s", "Small"], ["m", "Medium"], ["l", "Large"]] },
        { label: "Title bar colour", key: "style.bar", type: "color", fallback: () => token(it.type === "hobby" ? "moss" : "bark") },
        { label: "Picture colour (when there is no image)", key: "style.tint", type: "color", fallback: () => token("ochre") },
        { label: "Title font", key: "style.font", type: "font", placeholder: "Same as the site" },
        { label: "Title colour", key: "style.titleColor", type: "color", fallback: () => token("bark") },
        { label: "Text colour", key: "style.textColor", type: "color", fallback: () => token("muted") },
      ] },
    ], redraw, [
      { label: "Preview", run: () => Site.openDetail(S.gallery.indexOf(it)) },
      { label: "Duplicate", run: () => {
        const copy = JSON.parse(JSON.stringify(it));
        copy.title += " (copy)";
        const at = S.gallery.indexOf(it) + 1;
        S.gallery.splice(at, 0, copy);
        changed(); Site.rebuild(); openCardPanel(at); select(at);
      } },
      { label: "Delete card", danger: true, run: () => {
        S.gallery.splice(S.gallery.indexOf(it), 1);
        changed(); closePanel(); Site.rebuild();
        toast("Card deleted. Save to keep the change.");
      } },
    ]);
    select(i);
  }
  Site.onCardClick = openCardPanel;

  function newCard() {
    if (!Site.editing) setEditing(true);
    S.gallery.push({ type: "project", title: "New project", text: "One or two lines about it." });
    changed();
    Site.rebuild();
    const i = S.gallery.length - 1;
    openCardPanel(i);
    const inp = panel.querySelectorAll(".ed-field input")[0];
    if (inp) { inp.focus(); inp.select(); }
  }

  /* ---------- ledger entries (business / profile) ---------- */
  function openEntryPanel(i) {
    const src = Site.listSource;
    const list = S[src];
    const it = list[i];
    if (!it) return;
    const redraw = () => { Site.renderList(); refresh(); };
    const move = (d) => {
      const at = list.indexOf(it), to = at + d;
      if (to < 0 || to >= list.length) return;
      list.splice(at, 1); list.splice(to, 0, it);
      changed(); redraw();
    };
    openPanel("entry", "Entry", it, [
      { title: "Content", fields: [
        { label: "Section heading", key: "section", placeholder: "Experience, Education… (optional)" },
        { label: "Title", key: "title" },
        { label: "Date or label (left column)", key: "meta", placeholder: "2021 — now" },
        { label: "Text", key: "text", type: "textarea" },
        { label: "Bullet points (one per line)", key: "points", type: "lines" },
        { label: "Link", key: "link", placeholder: "https://…" },
      ] },
    ], redraw, [
      { label: "Add below", run: () => newEntry(list.indexOf(it) + 1) },
      { label: "Move up", run: () => move(-1) },
      { label: "Move down", run: () => move(1) },
      { label: "Delete entry", danger: true, run: () => {
        list.splice(list.indexOf(it), 1);
        changed(); closePanel(); redraw();
      } },
    ]);
  }

  // adds an entry at position `at` (default: the end) and opens it
  function newEntry(at) {
    if (!Site.editing) setEditing(true);
    const list = (S[Site.listSource] ||= []);
    if (typeof at !== "number") at = list.length;
    // a new entry joins the section of the entry just above it
    const above = list[at - 1];
    list.splice(at, 0, { ...(above && above.section ? { section: above.section } : {}), title: "New entry", meta: "", text: "" });
    changed();
    Site.renderList();
    refresh();
    openEntryPanel(at);
    const li = document.querySelector(`.entry[data-entry="${at}"]`);
    if (li) li.scrollIntoView({ behavior: "smooth", block: "center" });
    const first = panel.querySelector(".ed-field input");
    if (first) { first.focus(); first.select(); }
  }

  /* ---------- site style and profile ---------- */
  const currentMode = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  let sitePanelMode = null;
  function openSitePanel() {
    const mode = (sitePanelMode = currentMode());
    const page = document.querySelector(".page-head[data-page]");
    const redraw = () => {
      Site.applyTheme();
      document.dispatchEvent(new Event("themechange"));
      Site.renderHero(); Site.renderName(); Site.renderPageHead();
      if (Site.hasGallery) Site.rebuild();
      refresh();
    };
    const sections = [
      { title: "Profile", fields: [
        { label: "Name", key: "name" },
        { label: "Role line", key: "role" },
        { label: "Photo", key: "photo", type: "image" },
        { label: "Summary (blank line between paragraphs)", key: "summary", type: "paras" },
        { label: "Contact links (one per line: Label | URL)", key: "contact", type: "links" },
      ] },
    ];
    if (page && S.pages) sections.push({ title: "This page", fields: [
      { label: "Heading", key: `pages.${page.dataset.page}.title` },
      { label: "Intro", key: `pages.${page.dataset.page}.intro`, type: "textarea" },
    ] });
    sections.push(
      { title: "Fonts", fields: [
        { label: "Headings", key: "theme.fonts.display", type: "font", placeholder: "Young Serif" },
        { label: "Body text", key: "theme.fonts.body", type: "font", placeholder: "Schibsted Grotesk" },
        { label: "Labels and file names", key: "theme.fonts.mono", type: "font", placeholder: "DM Mono" },
      ] },
      { title: `Colours: ${mode} theme`, fields: Site.TOKENS.map((t) => ({
        label: TOKEN_LABELS[t] || t, key: `theme.${mode}.${t}`, type: "color", fallback: () => defaultToken(t),
      })) },
    );
    openPanel("site", "Site style and profile", S, sections, redraw, [
      { label: `Reset ${mode} colours`, danger: true, run: () => {
        if (S.theme) delete S.theme[mode];
        changed(); redraw(); openSitePanel();
      } },
    ]);
  }
  // value from the stylesheet, ignoring overrides from data.js
  function defaultToken(t) {
    const root = document.documentElement;
    const cur = root.style.getPropertyValue("--" + t);
    root.style.removeProperty("--" + t);
    const v = token(t);
    if (cur) root.style.setProperty("--" + t, cur);
    return v;
  }
  // rebuild the panel only when the visitor switches light/dark, not on every colour edit
  document.addEventListener("themechange", () => {
    if (panelKind === "site" && currentMode() !== sitePanelMode) openSitePanel();
  });

  /* ---------- save / upload ---------- */
  function prune(o) {
    if (Array.isArray(o)) return o.forEach(prune);
    if (!o || typeof o !== "object") return;
    Object.keys(o).forEach((k) => {
      prune(o[k]);
      const v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) delete o[k];
    });
  }

  async function save() {
    prune(S);
    const json = JSON.stringify(S);
    try {
      const r = await fetch("/__save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Site-Editor": "1" },
        body: json,
      });
      if (!r.ok) throw new Error(await r.text());
      dirty = false;
      bar.classList.remove("dirty");
      toast("Saved to assets/js/data.js");
    } catch (err) {
      const blob = new Blob([`window.SITE = ${JSON.stringify(S, null, 2)};\n`], { type: "text/javascript" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "data.js";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("The page couldn't write the file directly, so data.js was downloaded. Replace assets/js/data.js with it.", true);
    }
  }

  async function upload(file) {
    const r = await fetch("/__upload?name=" + encodeURIComponent(file.name), {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-Site-Editor": "1" },
      body: file,
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).path;
  }
})();
