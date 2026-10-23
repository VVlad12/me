# Personal site

Static portfolio (HTML/CSS/JS only) for GitHub Pages.

- `index.html`: photo and summary, generated flowers, then a scattered "desktop" gallery of projects and hobbies
- `business.html`, `profile.html`: simple lists
- `cat.html`: experiment, not linked from the menu. The home page with a cat that walks in and knocks elements off the screen (`assets/js/cat.js`). Buttons at the bottom right let it in, shoo it, and put everything back
- `sketch.html`: rendering test, not linked from the menu. Seven animals (cat, dog, pigeon, squirrel, rabbit, fox, hedgehog), each with three poses, drawn as one animated brush stroke in one of four line styles; the seed picks pose and style. `?animal=cat&pose=1&seed=1234&style=fine` replays a given sketch
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
