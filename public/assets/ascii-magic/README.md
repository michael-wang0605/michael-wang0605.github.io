# Portfolio ASCII backgrounds

Selected source files from [ASCII Magic](https://github.com/kailashsr38/ascii-magic-art),
pinned to commit `b324cb0c60b38cadbf02659b1d3d9d6af2d0a4e1` (MIT; see LICENSE and NOTICE).
The summit piece and its runtime dependencies are included. No build or package
installation is needed.

The unmodified `moonlit-mausoleum` piece was also vendored from
https://www.ascii-magic.com/ascii/pieces/moonlit-mausoleum.js on 2026-10-30
under the same MIT license. The portfolio now loads the local component once,
so it can render the original animated scene as interactive grayscale dots.

`pieces/boot-sequence.js` was vendored from the same site's `/ascii/pieces/`
directory on 2026-10-30. Its local `prompt="1"` option plays the original boot
log, then holds at a neutral waiting prompt beside the real password form.
It does not simulate a successful login. The default upstream animation is
unchanged when that option is absent. Both pieces use the existing single
runtime script; adding another hosted script would duplicate registration.

- `runtime/mausoleum-renderer.js`: GPU point sprites on the original halftone
  grid, with the source refreshed at 15 fps and pointer motion at display rate.
  Each dot repels from the cursor and springs back. Gentle parallax follows the
  pointer without changing the dome's layout anchor. No images are rasterized
  or read back from the GPU each frame.
- `runtime/dot-field.js`: CSS-pixel spring physics, independent of pixel density.
  The component disposes its GPU resources, observers, listeners, and animation
  when disconnected; it pauses when hidden and respects reduced motion.
  Without WebGL, the existing canvas player still displays the original scene.

Local changes:

- `pieces/summit-cloud-sea.js`: 30 fps, fractional cloud-texture sampling with wraparound,
  interpolated cloud lighting, and a continuous RGB output for the GPU renderer.
  The original sampled whole columns at 15 fps.
- `runtime/summit-renderer.js`: project-specific WebGL halftone renderer. Uploads
  the 192 x 108 source texture instead of painting full-screen dots on the CPU.
  Tone mapping and continuous dot areas are calculated per source cell; the shader
  draws antialiased circles. Tone limits stay fixed to prevent brightness pulsing.
  The render buffer is capped at 1280 x 720 and scales to cover the viewport.
- `runtime/canvas.js`: `steps="0"` interpolates halftone dot area continuously, retaining
  the original tone range while removing the four-size Bayer pattern.
- `runtime/ascii.js`: cancel outdated async starts so a disconnected element or
  simultaneous attribute updates cannot start extra animation loops. Prefer the
  GPU renderer for the summit; keep the original canvas player as a fallback.
- `runtime/player.js`: reset animation time when visibility changes so returning to
  the page does not jump the simulation forward. Bound fallback raster resolution.

`portfolio.html` loads the component once per browser document with `data-load-once`.
The art still stops off-screen and respects reduced motion.
