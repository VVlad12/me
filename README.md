# Personal site

Static portfolio (HTML/CSS/JS only) for GitHub Pages.

- `index.html`: photo and summary, generated flowers, then a scattered "desktop" gallery of projects and hobbies
- `business.html`, `profile.html`: simple lists
- All content, colours and fonts live in `assets/js/data.js`.

## Edit locally

```bash
python .claude/serve.py
```

Open http://localhost:8765. A toolbar appears on the left (only on your machine, never on GitHub Pages):

- **Edit mode**: click any outlined text to change it. Click a gallery card to open its panel (content, images, links, colours, font). On Business and Profile, use **Edit** on an entry for its link, order or deletion.
- **New card** / **New entry**: adds one and opens its panel.
- **Site style**: profile, fonts, and the colour palette of the current theme (light or dark).
- **Save** (Ctrl+S): writes `assets/js/data.js`. The previous version is kept as `data.js.bak`. Uploaded images go to `assets/img/uploads/`.

Saving also raises the `?v=` number on `data.js` in the pages, so visitors get the new content. If you change CSS or other JS files by hand, raise their `?v=` numbers too.

## Publish

Push to a repo named `<username>.github.io` (or any repo, then Settings → Pages → deploy from branch `main`, folder `/`).
