# Aurelia Manifesto Backdrop

This directory contains a static bundle built from Holtsetio's Aurelia:

https://github.com/holtsetio/aurelia/

The source was built with the repository's own Vite and `vite-plugin-tsl-operator` pipeline, then mounted as the `manifesto.html` backdrop. Local adaptations were limited to hiding the original demo UI, mounting into `#manifesto-aurelia`, replacing orbit dragging with cursor-driven camera/raycast movement, reducing scene density for a page background, and slightly reducing bloom intensity.

The upstream license is included in `LICENSE`.

`manifesto-runtime.js` adapts this pinned Three.js r175 bundle to the site's
navigation lifecycle. Its scene loop also advances Three's internal node/shader
clock; the renderer must not start its own page-scoped animation loop. Otherwise
navigation cancels that clock while leaving the cached scene loop running, and
the GPU uniforms freeze when the manifesto is reopened. Both clocks pause while
the page is away. The runtime checks each bundle hook before evaluating it.
