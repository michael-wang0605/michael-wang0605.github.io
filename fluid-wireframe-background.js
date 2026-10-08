(() => {
const canvas = document.getElementById('fluid-wireframe-canvas');

if (canvas) {
  initFluidWireframeBackground().catch((error) => {
    console.warn('Fluid wireframe background failed.', error);
  });
}

async function initFluidWireframeBackground() {
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, -0.38, 8.2);

  const geometry = new THREE.PlaneGeometry(6.8, 6.8, 168, 168);
  const pointer = new THREE.Vector2(0, 0);
  const smoothPointer = new THREE.Vector2(0, 0);
  const clock = new THREE.Clock();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    wireframe: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: smoothPointer },
      uIntro: { value: 0 },
      uNarrow: { value: 0 },
    },
    vertexShader: `
      precision highp float;

      uniform float uTime;
      uniform float uIntro;
      uniform vec2 uMouse;

      varying float vHeight;
      varying float vEdgeFade;
      varying vec2 vScreen;

      float gaussianDerivative(float x, float y) {
        return -x * exp(-(x * x + y * y));
      }

      void main() {
        vec3 pos = position;
        float x = pos.x * 0.62;
        float y = pos.y * 0.62;
        float base = gaussianDerivative(x, y);

        float d = length(vec2(x, y) - uMouse * vec2(1.75, -1.15));
        float wake = sin(d * 9.0 - uTime * 2.9) * exp(-d * 1.35);
        float current = sin((x * 2.2 + y * 1.45) + uTime * 0.85) * 0.045;
        float fluid = (wake * 0.11 + current) * uIntro;

        pos.z = (base * 2.18) + fluid;
        pos.x += y * 0.055;
        pos.y -= base * 0.14;

        vHeight = base;
        vEdgeFade = 1.0 - smoothstep(2.35, 3.55, length(position.xy));
        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        vScreen = (clipPosition.xy / clipPosition.w) * 0.5 + 0.5;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      precision highp float;

      varying float vHeight;
      varying float vEdgeFade;
      varying vec2 vScreen;

      uniform float uNarrow;

      void main() {
        float crest = smoothstep(0.0, 0.34, abs(vHeight));
        vec2 titlePocketSize = mix(vec2(0.31, 0.13), vec2(0.66, 0.18), uNarrow);
        vec2 titleSpace = (vScreen - vec2(0.5, 0.5)) / titlePocketSize;
        float titlePocket = exp(-dot(titleSpace, titleSpace) * mix(1.24, 1.0, uNarrow));
        vec2 equationSpace = (vScreen - vec2(0.5, 0.24)) / vec2(0.2, 0.044);
        float equationPocket = exp(-dot(equationSpace, equationSpace) * 1.55);
        float alpha = mix(0.12, 0.42, crest) * vEdgeFade;
        alpha *= 1.0 - titlePocket * mix(0.64, 1.0, uNarrow);
        alpha *= 1.0 - equationPocket * 0.72;
        alpha *= mix(1.0, 0.86, uNarrow);
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -1.08;
  mesh.rotation.z = -0.18;
  mesh.position.set(0, 0, 0);
  scene.add(mesh);

  function onPointerMove(event) {
    pointer.set(
      (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2,
      (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2,
    );
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.7);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();

    const narrow = width < 768;
    material.uniforms.uNarrow.value = narrow ? 1 : 0;
    camera.position.z = narrow ? 11.8 : 8.2;
    mesh.scale.setScalar(narrow ? 1.02 : 1);
  }

  function animate() {
    const time = clock.getElapsedTime();
    smoothPointer.lerp(pointer, 0.055);
    material.uniforms.uTime.value = time;
    material.uniforms.uIntro.value = THREE.MathUtils.smoothstep(time, 1.15, 3.2);
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.requestAnimationFrame(animate);
}
})();
