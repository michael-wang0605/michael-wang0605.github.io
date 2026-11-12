(() => {
  'use strict';
  const canvas = document.getElementById('portfolio-background-canvas');
  if (!canvas) return;
  const lifecycle = window.MWPageLifecycle;
  const token = lifecycle.getActiveToken();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, pending = false, paused = false, frame = 0;
  let renderer, geometry, material, scene, camera, mouse, target;
  let startedAt = performance.now(), lastFrame = 0;
  const current = () => !disposed && canvas.isConnected && lifecycle.getActiveToken() === token;

  function resize() {
    if (!renderer || !current()) return;
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    material.uniforms.iResolution.value.set(width * ratio, height * ratio, 1);
    draw(performance.now(), true);
  }

  function draw(time, once = false) {
    if (!current() || !renderer || paused || document.hidden) return;
    if (once || time - lastFrame >= 1000 / 30) {
      lastFrame = time;
      material.uniforms.iTime.value = reducedMotion.matches ? 0 : (time - startedAt) / 1000;
      mouse.lerp(target, 0.01);
      const resolution = material.uniforms.iResolution.value;
      material.uniforms.iMouse.value.set(mouse.x * resolution.x, mouse.y * resolution.y, 0, 0);
      renderer.render(scene, camera);
      canvas.dataset.backgroundReady = 'true';
    }
    if (!once && !reducedMotion.matches) frame = window.requestAnimationFrame(draw);
  }

  function stop() {
    paused = true;
    window.cancelAnimationFrame(frame);
    frame = 0;
  }

  async function start() {
    if (!current() || document.hidden || pending) return;
    paused = false;
    if (!renderer) {
      pending = true;
      try {
        const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
        if (!current()) return;
        renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 1);
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        target = new THREE.Vector2(0.5, 0.5);
        mouse = new THREE.Vector2(0.5, 0.5);
        // The original Life page's Star Nest shader, with its original values.
        material = new THREE.ShaderMaterial({
          depthWrite: false,
          depthTest: false,
          uniforms: {
            iResolution: { value: new THREE.Vector3(1, 1, 1) },
            iTime: { value: 0 },
            iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
          },
          vertexShader: `
            void main() {
              gl_Position = vec4(position.xy, 0.0, 1.0);
            }
          `,
          fragmentShader: `
            // Star Nest by Pablo Roman Andrioli
            // License: MIT
            precision highp float;
            uniform vec3 iResolution;
            uniform float iTime;
            uniform vec4 iMouse;
            #define iterations 17
            #define formuparam 0.53
            #define volsteps 20
            #define stepsize 0.1
            #define zoom 0.800
            #define tile 0.850
            #define speed 0.004
            #define brightness 0.00105
            #define darkmatter 0.340
            #define distfading 0.700
            #define saturation 0.0
            void mainImage(out vec4 fragColor, in vec2 fragCoord) {
              vec2 uv = fragCoord.xy / iResolution.xy - 0.5;
              uv.y *= iResolution.y / iResolution.x;
              vec3 dir = vec3(uv * zoom, 1.0);
              float time = iTime * speed + 0.25;
              vec2 pointer = iMouse.xy / iResolution.xy - 0.5;
              float a1 = 1.5 + pointer.x * 0.025;
              float a2 = 1.8 + pointer.y * 0.025;
              mat2 rot1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1));
              mat2 rot2 = mat2(cos(a2), sin(a2), -sin(a2), cos(a2));
              dir.xz *= rot1;
              dir.xy *= rot2;
              vec3 from = vec3(1.0, 0.5, 0.5);
              from += vec3(time * 2.0, time, -2.0);
              from.xz *= rot1;
              from.xy *= rot2;
              float s = 0.1;
              float fade = 1.0;
              vec3 v = vec3(0.0);
              for (int r = 0; r < volsteps; r++) {
                vec3 p = from + s * dir * 0.5;
                p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));
                float pa;
                float a = pa = 0.0;
                for (int i = 0; i < iterations; i++) {
                  p = abs(p) / dot(p, p) - formuparam;
                  a += abs(length(p) - pa);
                  pa = length(p);
                }
                float dm = max(0.0, darkmatter - a * a * 0.001);
                a *= a * a;
                if (r > 6) fade *= 1.0 - dm;
                v += fade;
                v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
                fade *= distfading;
                s += stepsize;
              }
              v = mix(vec3(length(v)), v, saturation);
              fragColor = vec4(v * 0.008, 1.0);
            }
            void main() {
              mainImage(gl_FragColor, gl_FragCoord.xy);
            }
          `,
        });
        geometry = new THREE.PlaneGeometry(2, 2);
        scene.add(new THREE.Mesh(geometry, material));
        startedAt = performance.now();
        resize();
      } catch (error) {
        if (current()) console.warn('Portfolio starfield could not be initialized.', error);
        return;
      } finally {
        pending = false;
      }
    }
    if (!current() || document.hidden) return;
    window.cancelAnimationFrame(frame);
    paused = false;
    draw(performance.now(), true);
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(draw);
  }

  const pointer = event => { if (target && !paused) target.set(event.clientX / window.innerWidth, event.clientY / window.innerHeight); };
  const visibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('mw:portfolio-reset', start);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pointermove', pointer, { passive: true });
  window.addEventListener('resize', resize);
  lifecycle.addCleanup(() => {
    disposed = true;
    stop();
    document.removeEventListener('mw:portfolio-reset', start);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pointermove', pointer);
    window.removeEventListener('resize', resize);
    geometry?.dispose();
    material?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }, token);
  start();
})();
