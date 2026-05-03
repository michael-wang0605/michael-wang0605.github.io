# personal website

Static personal site (HTML, CSS, JavaScript). No build step or package manager; serve the repo over HTTP so ES module imports and WebGL backgrounds work.

## Run locally

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Open [http://localhost:8000](http://localhost:8000). Do not open `index.html` via `file://` — the homepage background loads Three.js with `import()`, which browsers block from local files.

Pages: `index.html` (home), `life.html`, `interests.html`, `manifesto.html`, `contact.html`. Fonts, KaTeX, and Three.js load from public CDNs at runtime.

## Open source inspirations

Most of the motion and atmosphere comes from adapting existing demos, shaders, and samples — usually heavily reworked for this layout, performance, and interaction model, but the ideas and starting points belong to their authors.

| Where it shows up | Source | Role |
|-------------------|--------|------|
| [interests.html](interests.html) | [ShaderToy — tdsGWX](https://www.shadertoy.com/view/tdsGWX) | Background shader reference for the interests page canvas. |
| [manifesto.html](manifesto.html) | [Holtsetio — Aurelia](https://github.com/holtsetio/aurelia/) | WebGPU/TSL scene adapted as the manifesto backdrop (`public/assets/aurelia/`). |
| [index.html](index.html) | [mattatz — GPUFluidWireframe](https://github.com/mattatz/mattatz.github.io/tree/master/GPUFluidWireframe) | Starting point for the fluid wireframe homepage background (`fluid-wireframe-background.js`). |
| [life.html](life.html) | [ShaderToy — XlfGRj](https://www.shadertoy.com/view/XlfGRj) | Shader / visual reference for the life page background. |
| [contact.html](contact.html) | [WebGLSamples — field](https://github.com/WebGLSamples/WebGLSamples.github.io/tree/master/field) | Inspiration for the depth-of-field “field” style contact background (`contact-background.js`). |
| Site shell (multiple pages) | [CodePen — CSS record player](https://codepen.io/robrehrig/pen/AooLxK) | Basis for the fixed turntable / record player UI, wired up with local audio controls (`player.js`, `styles.css`). |

Thank you to everyone who publishes demos and source — this site would not look the way it does without that generosity.
