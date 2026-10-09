# Local editor for a static site

How the editing toolbar on this site works. It is written as a pattern you can copy to another static page, and as a starting point for a future skill.

## The idea in one paragraph

All content lives in one data file (`assets/js/data.js`). The page script reads it and draws the page. When the page is opened from `localhost`, the page script also loads an editor script. The editor changes the same data object in memory, asks the page to redraw, and on Save sends the whole object to a tiny local Python server, which rewrites `data.js` on disk. On GitHub Pages the editor is never loaded, and there is no server that accepts writes, so visitors only see the finished site.

## Files

| File | Role | Deployed? |
|---|---|---|
| `assets/js/data.js` | All content, colours and fonts: `window.SITE = { … }` | Yes |
| `assets/js/site.js` | Draws the page from `window.SITE`, exposes `window.Site` for the editor, loads the editor only on localhost | Yes |
| `assets/js/editor.js` | Toolbar, inline text editing, side panel forms, save and upload | In the repo, but never loaded online |
| `assets/css/editor.css` | Editor styles | Same as above |
| `.claude/serve.py` | Local server: static files with no caching, plus `/__save` and `/__upload` | Only used locally |
| `.claude/launch.json` | Lets the Claude preview start `serve.py` | Only used locally |

## How it stays hidden once deployed

The gate is at the end of `site.js`:

```js
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
           || location.protocol === "file:";
if (local) { /* inject editor.css and editor.js */ }
```

- On `https://<user>.github.io/...` the condition is false, so `editor.js` and `editor.css` are never requested. Visitors download nothing extra and see no toolbar.
- The files are still in the repo, so anyone can read them. They contain no secrets, only UI code.
- Even if someone loaded `editor.js` by hand on the live site, Save would fail: GitHub Pages has no `/__save` endpoint. The editor then falls back to downloading a `data.js` on that person's machine, which changes nothing online.
- Opening the page as a local file (`file://`) shows the editor, but saving and uploading need the server, so Save falls back to the download.

## Data flow

```
data.js ──load──> window.SITE (S) ──render──> page
                       ▲   │
       editor changes  │   │ Site.renderX() / Site.rebuild()
                       │   ▼
             inline text, side panel
                       │
                    Save (Ctrl+S)
                       │  POST /__save  (whole S as JSON)
                       ▼
             serve.py writes data.js
             (old copy -> data.js.bak, ?v= on data.js raised in every page)
```

Key rule: **the data object is the single source of truth.** The editor never edits the page's HTML directly. It changes `S`, then asks `site.js` to redraw the affected part.

## The contract between page and editor

`site.js` exposes `window.Site`. The editor only talks to the page through it.

| Member | What it does |
|---|---|
| `Site.S` | The live data object (same as `window.SITE`) |
| `Site.get(path)` / `Site.set(path, value)` | Read or write by dotted path, e.g. `"gallery.2.title"`, `"summary.0"` |
| `Site.renderHero()`, `renderList()`, `renderPageHead()`, `renderName()` | Redraw one region from `S` |
| `Site.rebuild()` | Redraw the gallery windows, keeping each window's position |
| `Site.applyTheme()` | Apply colour and font overrides from `S.theme` as CSS variables |
| `Site.loadFont(name)` | Add a Google Fonts stylesheet for a family on demand |
| `Site.editing` | `true` while edit mode is on. The page checks it, e.g. a card click opens the editor panel instead of the detail view |
| `Site.onCardClick(i)` | Hook the editor sets; the page calls it in edit mode |
| `Site.hasGallery`, `Site.listSource` | Which page we are on, so the toolbar shows the right buttons |
| `Site.windows`, `Site.imagesOf`, `Site.TOKENS` | Small helpers the editor needs |

When porting, this table is the part to design first: list the regions of the new page, give each a render function, and expose them.

## Two ways of editing

### 1. Inline text: the `data-bind` convention

Every rendered text element that maps to one string in the data gets an attribute with its path:

```html
<h1 data-bind="name">Vladimir Vilde</h1>
<p data-bind="summary.0">Hi, I'm …</p>
<li data-bind="profile.0.points.2">…</li>
```

In edit mode the editor makes every `[data-bind]` element `contenteditable="plaintext-only"`, and one document-level `input` listener writes `el.textContent` back with `Site.set(el.dataset.bind, …)`. There's no per-element wiring, so any new region gets inline editing just by adding `data-bind` when rendering.

Details that matter:
- **Enter** blurs instead of inserting a line break (each bound element is one string).
- **Paste** is converted to plain text.
- **Links** inside editable areas are blocked from navigating while editing (click listener in capture phase).
- Inline edits do **not** trigger a redraw. Redrawing would move the caret. The data is updated and the DOM already shows the new text.

### 2. Side panel: a small form builder

Anything that isn't a single visible string (links, images, colours, fonts, order, deletion) goes through a side panel. `openPanel(kind, title, obj, sections, onChange, actions)` builds a form from a list of field descriptions:

```js
{ label: "Title bar colour", key: "style.bar", type: "color", fallback: () => token("bark") }
```

| Field type | Stored as | Shown as |
|---|---|---|
| `text`, `textarea` | string | input / textarea |
| `select` | string | dropdown (`options: [[value, label]]`) |
| `paras` | array of strings | textarea, blank line between paragraphs |
| `lines` | array of strings | textarea, one per line |
| `tags` | array of strings | comma separated |
| `links` | `[{label, url}]` | one per line: `Label \| URL` |
| `color` | CSS colour string | colour picker + text box + Reset |
| `font` | family name | text box with a list of suggestions |
| `image`, `images` | path / array of paths | text + **Upload image** button |
| `picture` | `style.pattern` + `style.seed` | pattern dropdown + **Shuffle** / **Reset** for the generated drawing |

Empty values delete the key, so the data stays clean. Each field writes into `obj` at `key` (dotted paths create nested objects), then calls `onChange`, debounced by 120 ms, which redraws the page region.

Panels used on this site: **Card** (gallery item), **Entry** (Business/Profile row), **Site style and profile** (profile, page texts, fonts, palette for the current light/dark theme). Dangerous actions (Delete, Reset) use a two-click confirm inside the button, because `confirm()` is ugly and blocks.

## Styling from data

Visual settings are data too, so the editor can change them and they survive deployment:

- **Site palette and fonts**: `S.theme = { light: {token: colour}, dark: {…}, fonts: {display, body, mono} }`. `applyTheme()` sets them as inline CSS variables on `<html>` (`--fog`, `--bark`, `--f-display`…). The stylesheet only ever uses those variables, so overriding a variable restyles everything.
- **Per item**: `item.style = { bar, tint, font, titleColor, textColor }` becomes CSS variables on that card (`--bar-bg`, `--card-font`…). The CSS uses them with fallbacks: `background: var(--bar-bg, var(--bark))`.

This is the main design rule that made "edit colours and fonts, not just text" cheap: **write the CSS against variables from day one.**

## The local server (`serve.py`)

- Serves the project folder with `Cache-Control: no-store`, so a normal reload always shows the latest files.
- `POST /__save`: validates the JSON, keeps everything in `data.js` before `window.SITE` (a header comment, if present), copies the old file to `data.js.bak`, writes `window.SITE = <pretty JSON>;`, then raises `?v=N` on `data.js` in each HTML page so visitors' browsers fetch the new version after you push.
- `POST /__upload?name=…`: stores an image in `assets/img/uploads/` with a cleaned, unique name and returns its path.
- Security: listens on `127.0.0.1` only. Requires a custom header `X-Site-Editor: 1`, which forces a CORS preflight that the server never approves, so other websites open in your browser can't post to it. It also checks that `Origin` matches the server's own host.

## Lessons learned (bugs we actually hit)

1. **Never rebuild the panel in response to its own edits.** The site panel listened to `themechange` to rebuild when switching light/dark, but its own colour edits also fired `themechange`, so the form rebuilt after every key and the text box lost focus. Fix: rebuild only when the real trigger changed (here, the theme mode).
2. **`[hidden]` loses to `display: flex`.** A panel styled `display: flex` stays visible even with the `hidden` attribute. Add `.panel[hidden] { display: none; }`.
3. **Measure targets, not animated values.** With CSS transitions on `left/top`, `offsetTop` returns the in-between value. Compute sizes from the target (`parseFloat(el.style.top)`).
4. **Browser cache hides edits.** Python's default `http.server` lets the browser cache files, so pages showed old versions. Fix: `no-store` locally, and `?v=` version numbers on assets for the live site.
5. **Keep random things stable across redraws.** Gallery windows get a random size and position. Store them per item in a `WeakMap` so redrawing during edits doesn't reshuffle everything, and so the random values are never written into the data file.
6. **Inline editing must not redraw.** Update the data only; redrawing moves the caret.
7. **Normalise old field shapes on open, not on load.** `image` → `images`, `link` → `links` are merged when a card panel opens, so the visitor-facing code still accepts both.
8. **Always have a fallback for Save.** If the server isn't there, download the file instead of failing silently.

## Checklist to reuse this on another page

1. Move all content into one data file (`window.DATA = {…}`), including visual settings.
2. Write CSS against variables for every colour and font.
3. Render each page region with a function that reads only from the data, and add `data-bind="path"` on single-string elements.
4. Expose `window.Site` (or similar) with the data, `get/set`, the render functions and an `editing` flag.
5. Add the localhost gate that injects the editor files.
6. In the editor: toolbar, edit-mode toggle (`contenteditable` on `[data-bind]`), a panel per kind of item described as field lists, add/delete/reorder actions, Save with download fallback.
7. Copy `serve.py`, change the data path and the list of HTML pages, keep the security checks.
8. Test: type a full sentence in every panel field (focus must stay), close the panel (it must really disappear), save, reload, and check the file on disk.

## Ideas for the skill

- **Schema first.** The panels are already just field lists. A skill could ask for (or infer) a schema of the data and generate both the render `data-bind`s and the panels from it.
- **Generic editor file.** `editor.js` is mostly generic: toolbar, form builder, save/upload. Only the panel definitions (`openCardPanel`, `openEntryPanel`, `openSitePanel`) are site-specific. Splitting those into a config would make it drop-in.
- **Same server for any static site.** `serve.py` only needs the data path and the page list as settings.
- Possible additions: undo (keep a stack of JSON snapshots), saving dragged layout positions, editing several data files, a "Publish" button that runs `git commit && git push`.
- Open question: keep the data as a `.js` file (works from `file://` and needs no fetch) or switch to `.json` (cleaner, but needs a server even to view).
