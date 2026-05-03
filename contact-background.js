(() => {
const canvas = document.getElementById('contact-field-canvas');
const FIELD_PIXEL_RATIO_CAP = 1.65;
const DESKTOP_BLADE_COUNT = 5600;
const MOBILE_BLADE_COUNT = 2600;

if (canvas) {
  initContactField().catch((error) => {
    console.warn('Contact field background failed.', error);
  });
}

async function initContactField() {
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  const clock = new THREE.Clock();
  const targetPointer = new THREE.Vector2(0, 0);
  const smoothPointer = new THREE.Vector2(0, 0);
  let grass = null;
  let width = 1;
  let height = 1;

  renderer.setClearColor(0x000000, 1);

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createBladeGeometry(segments = 7) {
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let index = 0; index <= segments; index += 1) {
      const y = index / segments;
      positions.push(-1, y, 0, 1, y, 0);
      uvs.push(0, y, 1, y);
    }

    for (let index = 0; index < segments; index += 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
  }

  function createGrassField() {
    if (grass) {
      grass.geometry.dispose();
      grass.material.dispose();
      scene.remove(grass);
    }

    const narrow = width < 768;
    const bladeCount = narrow ? MOBILE_BLADE_COUNT : DESKTOP_BLADE_COUNT;
    const columns = Math.round(Math.sqrt(bladeCount * 1.45));
    const rows = Math.ceil(bladeCount / columns);
    const fieldWidth = narrow ? 13.5 : 18.5;
    const fieldDepth = narrow ? 16 : 18.5;
    const offsets = new Float32Array(bladeCount * 3);
    const randoms = new Float32Array(bladeCount * 4);
    const scales = new Float32Array(bladeCount);

    for (let index = 0; index < bladeCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = ((column + Math.random()) / columns - 0.5) * fieldWidth;
      const z = 5.2 - ((row + Math.random()) / rows) * fieldDepth;
      const hill = Math.sin(x * 0.52 + z * 0.34) * 0.08 + Math.sin(z * 0.82) * 0.035;
      const depthGrowth = THREE.MathUtils.smoothstep(5.2 - z, 0, fieldDepth);

      offsets[index * 3] = x;
      offsets[index * 3 + 1] = hill - 0.88;
      offsets[index * 3 + 2] = z;
      randoms[index * 4] = Math.random();
      randoms[index * 4 + 1] = Math.random();
      randoms[index * 4 + 2] = Math.random();
      randoms[index * 4 + 3] = Math.random();
      scales[index] = randomBetween(0.68, 1.28) * (0.74 + depthGrowth * 0.44);
    }

    const geometry = createBladeGeometry();
    geometry.instanceCount = bladeCount;
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(randoms, 4));
    geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntro: { value: 0 },
        uMouse: { value: smoothPointer },
      },
      vertexShader: `
        precision highp float;

        attribute vec3 aOffset;
        attribute vec4 aRandom;
        attribute float aScale;

        uniform float uTime;
        uniform float uIntro;
        uniform vec2 uMouse;

        varying float vAlpha;
        varying float vBlade;

        void main() {
          float y = uv.y;
          float angle = aRandom.x * 6.28318530718;
          vec2 side = vec2(cos(angle), sin(angle));
          vec2 windDirection = normalize(vec2(
            sin(angle + aRandom.z * 2.1),
            cos(angle * 0.7 + aRandom.w * 3.0)
          ));
          float wave = sin(
            aOffset.x * 1.28 +
            aOffset.z * 1.74 +
            uTime * (0.78 + aRandom.y * 0.44) +
            aRandom.w * 6.28318530718
          );
          vec2 mouseField = vec2(uMouse.x * 7.4, -uMouse.y * 4.2 + 0.8);
          float pointerWake = exp(-dot(aOffset.xz - mouseField, aOffset.xz - mouseField) * 0.16);
          float height = mix(0.48, 1.14, aRandom.y) * aScale;
          float taper = mix(0.038, 0.004, y);
          float bend = pow(y, 1.72) * (wave * 0.22 + pointerWake * 0.38);
          vec2 base = aOffset.xz + side * position.x * taper * (0.76 + aRandom.z * 0.58);
          vec2 bent = base + windDirection * bend;
          float lean = sin(aOffset.x * 0.34 + aOffset.z * 0.62 + uTime * 0.2) * 0.045;
          vec3 transformed = vec3(
            bent.x + side.x * lean * y,
            aOffset.y + y * height,
            bent.y + side.y * lean * y
          );

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          float nearFade = smoothstep(5.35, 3.35, aOffset.z);
          float farFade = smoothstep(-12.5, -4.6, aOffset.z);
          float heightFade = smoothstep(0.08, 0.9, y);
          vBlade = y;
          vAlpha = (0.05 + heightFade * 0.42) * nearFade * farFade * uIntro;
          vAlpha *= 0.58 + aRandom.w * 0.62;
        }
      `,
      fragmentShader: `
        precision mediump float;

        varying float vAlpha;
        varying float vBlade;

        void main() {
          float tipGlow = smoothstep(0.55, 1.0, vBlade) * 0.12;
          gl_FragColor = vec4(vec3(1.0), vAlpha + tipGlow * vAlpha);
        }
      `,
    });

    grass = new THREE.Mesh(geometry, material);
    grass.frustumCulled = false;
    scene.add(grass);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, FIELD_PIXEL_RATIO_CAP);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.position.set(0, width < 768 ? 1.45 : 1.28, width < 768 ? 7.4 : 7.0);
    camera.lookAt(0, -0.18, -3.8);
    camera.updateProjectionMatrix();
    createGrassField();
  }

  function onPointerMove(event) {
    targetPointer.set(
      (event.clientX / Math.max(width, 1) - 0.5) * 2,
      (event.clientY / Math.max(height, 1) - 0.5) * 2,
    );
  }

  function animate() {
    const elapsed = clock.getElapsedTime();

    smoothPointer.lerp(targetPointer, 0.06);
    if (grass) {
      grass.material.uniforms.uTime.value = elapsed;
      grass.material.uniforms.uIntro.value = THREE.MathUtils.smoothstep(elapsed, 0.25, 1.9);
    }
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.requestAnimationFrame(animate);
}
})();
