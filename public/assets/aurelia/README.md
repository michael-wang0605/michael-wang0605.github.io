# Aurelia Manifesto Backdrop

This directory contains a static bundle built from Holtsetio's Aurelia:

https://github.com/holtsetio/aurelia/

The source was built with the repository's own Vite and `vite-plugin-tsl-operator` pipeline, then mounted as the `manifesto.html` backdrop. Local adaptations were limited to hiding the original demo UI, mounting into `#manifesto-aurelia`, replacing orbit dragging with cursor-driven camera/raycast movement, reducing scene density for a page background, and slightly reducing bloom intensity.

The upstream license is included in `LICENSE`.
