(() => {
  'use strict';

  const container = document.getElementById('manifesto-aurelia');
  if (!container) return;

  const lifecycle = window.MWPageLifecycle;
  const token = lifecycle.getActiveToken();
  const sourceUrl = new URL('public/assets/aurelia/aurelia-manifesto.js?v=repo-aurelia-6', location.href);
  // Download while the lightweight title plays, without starting the simulation.
  const source = window.MWSiteShell.loadScriptSource(sourceUrl.href);
  source.catch(() => {});

  const isCurrent = () => container.isConnected && lifecycle.getActiveToken() === token;
  const ensureCurrent = () => {
    if (!isCurrent()) throw new DOMException('Page changed.', 'AbortError');
  };

  const runtime = {
    isCurrent,
    async yield() {
      ensureCurrent();
      await lifecycle.yield();
      ensureCurrent();
    },
    initialize(renderer) {
      const initialized = renderer.init();
      lifecycle.addCleanup(() => {
        initialized.then(() => renderer.dispose()).catch(() => {});
      }, token);
      return initialized;
    },
    reveal() {
      if (!isCurrent()) return;
      container.classList.add('is-aurelia-ready');
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.style.filter = 'brightness(1.55) contrast(1.14)';
    },
  };

  const titleReady = new Promise((resolve) => {
    const title = document.getElementById('manifesto-title-canvas');
    if (!title || title.dataset.titleSettled === 'true') {
      resolve();
      return;
    }
    document.addEventListener('mw:manifesto-title-settled', resolve, { once: true });
    window.setTimeout(resolve, 2600);
  });

  // These hooks target the pinned Aurelia bundle. Fail visibly in the console
  // if that bundle changes, rather than silently losing scheduling or cleanup.
  function replaceOnce(code, before, after) {
    if (code.split(before).length !== 2) throw new Error('Aurelia runtime hook no longer matches: ' + before);
    return code.replace(before, after);
  }

  Promise.all([source, titleReady]).then(async ([code]) => {
    await runtime.yield();
    code = replaceOnce(code, 'const HE=async()=>{},qE=', 'const HE=()=>mwRuntime.yield(),qE=');
    code = replaceOnce(code, 'this.renderer.init()', 'mwRuntime.initialize(this.renderer)');
    code = replaceOnce(code, 'o.setPixelRatio(window.devicePixelRatio)',
      'o.setPixelRatio(Math.min(window.devicePixelRatio,window.innerWidth<768?1:1.25))');
    code = replaceOnce(code, 'this.frameNum===0&&console.timeEnd("firstFrame")',
      '(this.frameNum===0&&console.timeEnd("firstFrame"),this.frameNum===3&&mwRuntime.reveal())');
    code = replaceOnce(code, 'this.physics.addObject(c)}this.physics.addObject(this.bridge)',
      'this.physics.addObject(c);await mwRuntime.yield()}this.physics.addObject(this.bridge)');
    code = replaceOnce(code,
      'i=async()=>{const n=s.getDelta(),r=s.getElapsedTime();await t.update(n,r),requestAnimationFrame(i)}',
      'i=async()=>{if(!mwRuntime.isCurrent())return;try{const n=Math.min(s.getDelta(),.05),r=s.getElapsedTime();await t.update(n,r)}catch(e){if(mwRuntime.isCurrent())console.error(e);return}if(mwRuntime.isCurrent())requestAnimationFrame(i)}');
    code = replaceOnce(code, 'jE().catch(o=>{console.error(o)})',
      'jE().catch(o=>{if(o.name!=="AbortError")console.error(o)})');

    ensureCurrent();
    lifecycle.run(token, () => Function('mwRuntime', code + '\n//# sourceURL=' + sourceUrl.href)(runtime));
  }).catch((error) => {
    if (isCurrent() && error.name !== 'AbortError') console.warn('Aurelia background failed.', error);
  });
})();
