
interests:
https://www.shadertoy.com/view/tdsGWX

manifesto:
https://github.com/holtsetio/aurelia/


homepage:
https://github.com/mattatz/mattatz.github.io/tree/master/GPUFluidWireframe


life:
https://www.shadertoy.com/view/XlfGRj


contact:
https://github.com/WebGLSamples/WebGLSamples.github.io/tree/master/field

record player:
https://codepen.io/robrehrig/pen/AooLxK

Performance notes:
- Text uses local fallback fonts immediately; the shared web fonts load without blocking rendering.
- Music downloads only after an interaction. Entering the homepage does not wait for playback to buffer.
- Decorative rendering is capped at 30 fps on narrow screens, touch devices, devices with limited CPU/memory, and connections with Save-Data enabled; other devices are capped at 60 fps. Canvas resolution and scene density are also reduced.
- Settled particle titles stop redrawing. The Life timeline resumes on wheel, touch, keyboard, resize, or font updates. Hidden tabs suspend graphics work.
- Navigation caches HTML and local scripts in memory, fetches independent scripts together, and prefetches on link hover/focus unless Save-Data or a 2G connection is detected. Content appears before graphics finish initializing.
- Leaving a page disposes its renderers, geometry, materials, render targets, and WebGL buffers. Async initializers check their page token before attaching graphics.
- The manifesto WebGPU simulation is reserved for capable desktops. Mobile, reduced-motion, and unsupported devices use a CSS backdrop. Reduced-motion visitors can read the Life milestones as a normal scrolling list.

Validation: serve over HTTP, inspect all five pages at desktop and phone widths, exercise the Life timeline after it becomes idle, and navigate repeatedly between pages while checking the console. The project still has no build step or dependencies.
