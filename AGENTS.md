# Agents

## Cursor Cloud specific instructions

This is a **zero-dependency static website** (HTML/CSS/JS). There is no package manager, no build step, no test framework, and no linter configured.

### Running the dev server

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Serves the site at `http://localhost:8000`. All JS libraries (Three.js, KaTeX, Google Fonts) are loaded from external CDNs at runtime — internet access is required.

### Key caveats

- **No `file://` protocol**: The site imports Three.js via ES module `import()` inside `fluid-wireframe-background.js`, which requires an HTTP server (opening `index.html` directly in a browser will fail with CORS errors).
- **WebGL required**: The homepage relies on Two Three.js canvas renderers for its animated wireframe and particle title. A headless/non-GPU browser will render only the text elements.
- **No lint/test/build commands**: There is no `package.json`, no test runner, and no linter. Validation is limited to serving the site and checking it renders correctly in a browser.
- **CDN dependency**: If the external CDNs (`cdn.jsdelivr.net`, `fonts.googleapis.com`) are unreachable, the page will lack fonts, KaTeX rendering, and the 3D background.

### Project structure

| File | Purpose |
|------|---------|
| `index.html` | Homepage with WebGL background + particle title |
| `timeline.html`, `interests.html`, `manifesto.html`, `present.html`, `contact.html` | Sub-pages |
| `script.js` | Three.js 3D surface + canvas particle animation |
| `fluid-wireframe-background.js` | Three.js wireframe mesh with pointer interaction |
| `glass-cursor.js` | PIXI.js displacement lens (currently unused) |
| `styles.css` / `variables.css` | Styling and design tokens |
| `design/` | Design reference docs and tokens |
