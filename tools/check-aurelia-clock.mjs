// Run with: node tools/check-aurelia-clock.mjs
// Exercise the real clock from the pinned Three.js bundle without requiring a GPU.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bundle = readFileSync(new URL('../public/assets/aurelia/aurelia-manifesto.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../manifesto-runtime.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const clockSignature = 'constructor(e,t){this.nodes=e,this.info=t,this._context=self,';
const clockOffset = bundle.indexOf(clockSignature);
assert.notEqual(clockOffset, -1, 'pinned Three.js animation clock must still match');
const clockSource = bundle.slice(bundle.lastIndexOf('class ', clockOffset), bundle.indexOf('class Gs{', clockOffset));

async function exercise(source) {
  let pageToken = 1;
  let frameId = 0;
  let factory;
  let shaderFrame = 0;
  const pageFrames = new Map();
  const sceneFrames = new Map();
  const observedFrames = [];
  const pageWindow = {
    requestAnimationFrame(callback) {
      pageFrames.set(++frameId, { callback, token: pageToken });
      return frameId;
    },
    cancelAnimationFrame(id) { pageFrames.delete(id); sceneFrames.delete(id); },
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  };
  const Clock = vm.runInNewContext('(' + clockSource + ')', { self: pageWindow });
  const info = { autoReset: true, reset() {}, frame: 0 };
  const nodes = { nodeFrame: { frameId: 0, update() { this.frameId++; } } };
  const animation = new Clock(nodes, info);
  const renderer = {
    domElement: { style: {}, remove() {} },
    backend: { isWebGPUBackend: true },
    setSize() {}, setPixelRatio() {}, dispose() { animation.dispose(); },
  };
  const scene = {
    resize() {},
    async update() { shaderFrame = info.frame; },
  };
  function runPageFrame() {
    const scheduled = [...pageFrames.values()];
    pageFrames.clear();
    scheduled.forEach(({ callback, token }) => {
      if (token === pageToken) callback(100);
    });
  }
  const backgrounds = {
    define(name, value) { factory = value; },
    run: callback => callback(),
    async delay() { runPageFrame(); },
    frame(callback) { sceneFrames.set(++frameId, callback); return frameId; },
  };
  const context = {
    URL, console, mwPreload: true,
    location: { href: 'http://localhost:8000/manifesto.html' },
    navigator: { gpu: { requestAdapter: async () => ({}) } },
    document: { getElementById: () => null },
    window: Object.assign(pageWindow, {
      MWBackgrounds: backgrounds,
      MWSiteShell: { loadScriptSource: async () => bundle },
    }),
    Function(...args) {
      // Verify every actual vendor hook and compile the adapted bundle. Only GPU
      // setup is substituted; the clock implementation above is unmodified.
      new Function(...args);
      const ownsClock = args.at(-1).includes('mwRuntime.ownFrameClock(this._animation)');
      return async runtime => {
        renderer.init = async () => {
          if (ownsClock) runtime.ownFrameClock(animation);
          else animation.start();
        };
        await runtime.initialize(renderer);
        await runtime.prepare(scene);
      };
    },
  };
  vm.runInNewContext(source, context);
  const instance = await factory();
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  let time = 100;
  for (let visit = 0; visit < 6; visit++) {
    const placeholder = { classList: { add() {}, remove() {} }, appendChild() {} };
    const stop = instance.start(placeholder);
    await flush();
    for (let step = 0; step < 3; step++) {
      runPageFrame();
      assert.equal(sceneFrames.size, 1, 'one scene loop per visible page');
      const [id, callback] = sceneFrames.entries().next().value;
      sceneFrames.delete(id);
      callback(time += 16);
      await flush();
      observedFrames.push(shaderFrame);
    }
    stop();
    pageToken++;
    runPageFrame();
    assert.equal(sceneFrames.size, 0, 'scene loop pauses while away');
  }
  return { observedFrames, pendingClockFrames: pageFrames.size };
}

// Reproduce the previous integration, with the same scene but its original
// page-scoped Three.js clock. That clock stalls after the first navigation.
const legacySource = runtimeSource
  .replace("    code = replaceOnce(code, 'this._animation.start(),this._initialized=!0',\n      'mwRuntime.ownFrameClock(this._animation),this._initialized=!0');", '')
  .replaceAll('await updateScene(', 'await scene.update(')
  .replace('updating = updateScene(', 'updating = scene.update(');
assert.notEqual(legacySource, runtimeSource);
const legacy = await exercise(legacySource);
assert.ok(legacy.observedFrames[2] > legacy.observedFrames[0], 'old clock initially animates before navigation');
assert.equal(legacy.observedFrames.at(-1), legacy.observedFrames[2], 'reproduce the old clock freezing after navigation');

const fixed = await exercise(runtimeSource);
fixed.observedFrames.forEach((frame, index, frames) => {
  if (index) assert.ok(frame > frames[index - 1], 'shader clock advances after every navigation');
});
assert.equal(fixed.pendingClockFrames, 0, 'no second clock loop remains while hidden');
console.log('PASS: old freeze reproduced; shader clock advances across 6 visits, with one scene loop and no hidden clock loop.');
