(() => {
  'use strict';

  const backgrounds = window.MWBackgrounds;
  const container = document.getElementById('manifesto-aurelia');

  // The pinned bundle has no public preparation API. Keep these hooks explicit
  // so an upstream change fails visibly instead of silently running extra loops.
  function replaceOnce(code, before, after) {
    if (code.split(before).length !== 2) throw new Error('Aurelia runtime hook no longer matches: ' + before);
    return code.replace(before, after);
  }

  backgrounds.define('manifesto', async () => {
    const adapter = navigator.gpu && await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { start() {
        document.documentElement.classList.add('aurelia-unavailable');
        return () => {};
      } };
    }

    const sourceUrl = new URL('public/assets/aurelia/aurelia-manifesto.js?v=repo-aurelia-6', location.href);
    let code = await window.MWSiteShell.loadScriptSource(sourceUrl.href);
    let renderer;
    let scene;
    let active = false;
    let generation = 0;
    let frame = 0;
    let elapsed = 0;
    let previousTime = 0;
    let updating = null;
    let advanceRendererFrame = null;
    let usable = true;
    let mounted = null;
    let revealPending = false;
    const listeners = [];
    const runtime = {
      yield: () => backgrounds.delay(16),
      listen(type, listener, options) { listeners.push([type, listener, options]); },
      ownFrameClock(animation) {
        // Three r175 starts a second RAF loop to advance shader/node uniforms.
        // Its default `self` context uses the page-scoped RAF, which navigation
        // cancels even though this cached renderer is still usable. Capture its
        // tick instead: our scene loop advances it exactly once per update.
        animation.setContext({
          requestAnimationFrame(callback) { advanceRendererFrame = callback; return 0; },
          cancelAnimationFrame() { advanceRendererFrame = null; },
        });
        animation.start();
      },
      async initialize(value) {
        renderer = value;
        await renderer.init();
        if (!renderer.backend.isWebGPUBackend) throw new Error('WebGPU could not initialize.');
      },
      async prepare(value) {
        scene = value;
        // Compile compute/render pipelines and bloom using a small render target.
        // Stop after the first few frames; the simulation resumes on navigation.
        for (let index = 0; index < 4; index += 1) {
          await backgrounds.delay(32);
          elapsed += 1 / 60;
          await updateScene(1 / 60, elapsed);
        }
      },
    };

    code = replaceOnce(code, 'const HE=async()=>{},qE=', 'const HE=()=>mwRuntime.yield(),qE=');
    code = replaceOnce(code, 'this.renderer.init()', 'await mwRuntime.initialize(this.renderer)');
    code = replaceOnce(code, 'this._animation.start(),this._initialized=!0',
      'mwRuntime.ownFrameClock(this._animation),this._initialized=!0');
    code = replaceOnce(code, 'o.setPixelRatio(window.devicePixelRatio)',
      'o.setPixelRatio(Math.min(window.devicePixelRatio,window.innerWidth<768?1:1.25))');
    code = replaceOnce(code, 'this.physics.addObject(c)}this.physics.addObject(this.bridge)',
      'this.physics.addObject(c);await mwRuntime.yield()}this.physics.addObject(this.bridge)');
    code = replaceOnce(code, 'window.addEventListener("pointermove",a=>{this.onMouseMove(a)},{passive:!0})',
      'mwRuntime.listen("pointermove",a=>{this.onMouseMove(a)},{passive:!0})');
    const entryPoint = ',jE=async()=>{';
    if (code.split(entryPoint).length !== 2) throw new Error('Aurelia entry point no longer matches.');
    code = code.slice(0, code.indexOf(entryPoint)) + ';const renderer=qE();' +
      'if(!renderer.backend.isWebGPUBackend)throw new Error("WebGPU is unavailable.");' +
      'renderer.domElement.className="manifesto-aurelia-canvas";' +
      'const scene=new $E(renderer);await scene.init(HE);await mwRuntime.prepare(scene);';
    code = replaceOnce(code, 'o.setSize(window.innerWidth,window.innerHeight)', 'o.setSize(64,64)');

    try {
      // The async wrapper lets preparation finish before caching the instance.
      await backgrounds.run(() => Function('mwRuntime', 'requestAnimationFrame',
        'return (async () => {' + code + '\n})();\n//# sourceURL=' + sourceUrl.href)(runtime, backgrounds.frame));
    } catch (error) {
      if (renderer) renderer.dispose();
      throw error;
    }

    function resize() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1 : 1.25));
      renderer.setSize(window.innerWidth, window.innerHeight);
      scene.resize(window.innerWidth, window.innerHeight);
    }

    function updateScene(delta, time) {
      if (!advanceRendererFrame) throw new Error('Aurelia frame clock is unavailable.');
      advanceRendererFrame();
      return scene.update(delta, time);
    }

    function fail(error) {
      usable = false;
      active = false;
      window.cancelAnimationFrame(frame);
      if (mounted) mounted.classList.remove('is-aurelia-ready');
      renderer.dispose();
      console.warn('Aurelia animation failed.', error);
    }

    async function animate(time) {
      if (!active) return;
      const currentGeneration = generation;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      elapsed += delta;
      try {
        updating = updateScene(delta, elapsed);
        await updating;
        // Resizing clears the warmup image. Reveal only after a complete frame
        // at the current viewport size, and never reveal a departed page.
        if (active && generation === currentGeneration && revealPending) {
          mounted.classList.add('is-aurelia-ready');
          revealPending = false;
        }
      } catch (error) {
        fail(error);
      } finally {
        updating = null;
      }
      if (active && generation === currentGeneration) frame = backgrounds.frame(animate);
    }

    return {
      isUsable: () => usable,
      start(placeholder) {
        mounted = placeholder;
        revealPending = true;
        placeholder.classList.remove('is-aurelia-ready');
        placeholder.appendChild(renderer.domElement);
        renderer.domElement.style.filter = 'brightness(1.55) contrast(1.14)';
        active = true;
        const currentGeneration = ++generation;
        previousTime = 0;
        window.addEventListener('resize', resize);
        listeners.forEach(([type, listener, options]) => window.addEventListener(type, listener, options));
        // A previous page's final async GPU update may still be completing.
        Promise.resolve(updating).catch(() => {}).then(() => {
          if (active && generation === currentGeneration) {
            resize();
            frame = backgrounds.frame(animate);
          }
        }).catch(fail);
        return () => {
          active = false;
          generation += 1;
          revealPending = false;
          mounted = null;
          placeholder.classList.remove('is-aurelia-ready');
          window.cancelAnimationFrame(frame);
          window.removeEventListener('resize', resize);
          listeners.forEach(([type, listener, options]) => window.removeEventListener(type, listener, options));
          renderer.domElement.remove();
        };
      },
    };
  });

  if (typeof mwPreload !== 'undefined' || !container) return;
  const titleReady = new Promise((resolve) => {
    const title = document.getElementById('manifesto-title-canvas');
    if (!title || title.dataset.titleSettled === 'true') return resolve();
    document.addEventListener('mw:manifesto-title-settled', resolve, { once: true });
    window.setTimeout(resolve, 2600);
    window.MWPageLifecycle.addCleanup(resolve);
  });
  backgrounds.mount('manifesto', container, titleReady);
})();
