(() => {
const canvas = document.getElementById('contact-field-canvas');
const titleCanvas = document.getElementById('contact-title-canvas');
const FIELD_PIXEL_RATIO_CAP = 1.65;
const TITLE_PIXEL_RATIO_CAP = 1.35;
const DESKTOP_BLADE_COUNT = 5600;
const MOBILE_BLADE_COUNT = 2600;

if (canvas) {
  initContactField().catch((error) => {
    console.warn('Contact field background failed.', error);
  });
}

if (titleCanvas) {
  initContactTitle().catch((error) => {
    console.warn('Contact title animation failed.', error);
  });
}

async function initContactTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  const ctx = titleCanvas.getContext('2d');
  const particles = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sourcePoints = [];
  let startedAt = performance.now();
  const settleDuration = 1500;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createTitleSource() {
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');
    const titleSize = width < 768
      ? clamp(width * 0.16, 72, 96)
      : clamp(width * 0.078, 92, 132);
    const centerY = width < 768
      ? clamp(height * 0.205, 144, 182)
      : clamp(height * 0.19, 150, 190);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';
    const points = [];

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.font = `400 ${titleSize}px ${fontStack}`;
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';
    sourceCtx.fillText('contact', width * 0.5, centerY);

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const sampleGap = 1;

    for (let y = 0; y < height; y += sampleGap) {
      for (let x = 0; x < width; x += sampleGap) {
        const alpha = imageData.data[(y * width + x) * 4 + 3];

        if (alpha > 34) {
          points.push({ x, y, alpha: alpha / 255 });
        }
      }
    }

    return points;
  }

  function createParticles() {
    const count = Math.round(clamp(
      sourcePoints.length * (width < 768 ? 0.58 : 0.72),
      width < 768 ? 1700 : 3200,
      width < 768 ? 3900 : 7600,
    ));

    particles.length = 0;

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];
      const x = randomBetween(width * 0.18, width * 0.82);
      const y = randomBetween(height * 0.36, height * 0.62);

      particles.push({
        x,
        y,
        targetX: point.x,
        targetY: point.y,
        targetAlpha: Math.max(0.58, point.alpha),
        alpha: 0,
        delay: Math.random() * 32,
        size: randomBetween(width < 768 ? 1.05 : 1.15, width < 768 ? 1.9 : 2.35),
        jitter: randomBetween(0.18, 1.05),
        phase: Math.random() * Math.PI * 2,
      });
    }

    startedAt = performance.now();
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, TITLE_PIXEL_RATIO_CAP);
    titleCanvas.width = Math.floor(width * pixelRatio);
    titleCanvas.height = Math.floor(height * pixelRatio);
    titleCanvas.style.width = `${width}px`;
    titleCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    sourcePoints = createTitleSource();
    createParticles();
  }

  function draw(time) {
    const elapsed = Math.max(0, time - startedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);

    ctx.clearRect(0, 0, width, height);

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];

      if (particle.delay > 0) {
        particle.delay -= 1;
        particle.x += randomBetween(-12, 12) * motion;
        particle.y += randomBetween(-8, 8) * motion;
      } else {
        const pull = 0.07 + (1 - motion) * 0.09;
        particle.x += (particle.targetX - particle.x) * pull;
        particle.y += (particle.targetY - particle.y) * pull;
        particle.alpha += (particle.targetAlpha - particle.alpha) * 0.08;
      }

      const visibleAlpha = clamp(particle.alpha, 0, 1);

      if (visibleAlpha < 0.01) {
        continue;
      }

      const shimmer = Math.sin(time * 0.004 + particle.phase) * particle.jitter * (motion + 0.1);
      ctx.globalAlpha = visibleAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(
        particle.x + shimmer,
        particle.y - shimmer * 0.4,
        particle.size,
        particle.size,
      );
    }

    ctx.globalAlpha = 1;
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
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
  const postScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clock = new THREE.Clock();
  const targetPointer = new THREE.Vector2(0, 0);
  const smoothPointer = new THREE.Vector2(0, 0);
  let grass = null;
  let fieldTarget = null;
  let dofMaterial = null;
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

  function createRenderTarget(targetWidth, targetHeight) {
    return new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
  }

  function setupDepthOfFieldPass() {
    dofMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uScene: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBlurStrength: { value: 1.16 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;

        uniform sampler2D uScene;
        uniform vec2 uResolution;
        uniform float uBlurStrength;

        varying vec2 vUv;

        float luminance(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }

        void main() {
          vec4 sharp = texture2D(uScene, vUv);
          vec2 texel = 1.0 / uResolution;
          float fieldMask = smoothstep(0.012, 0.13, luminance(sharp.rgb));
          float horizonDepth = smoothstep(0.45, 0.76, vUv.y);
          float blurAmount = horizonDepth * fieldMask * uBlurStrength;
          vec2 radius = texel * mix(0.0, 5.2, blurAmount);

          vec4 blur = sharp * 0.18;
          blur += texture2D(uScene, vUv + vec2(-4.0, 0.0) * radius) * 0.05;
          blur += texture2D(uScene, vUv + vec2(-2.0, 0.0) * radius) * 0.09;
          blur += texture2D(uScene, vUv + vec2( 2.0, 0.0) * radius) * 0.09;
          blur += texture2D(uScene, vUv + vec2( 4.0, 0.0) * radius) * 0.05;
          blur += texture2D(uScene, vUv + vec2(0.0, -4.0) * radius) * 0.05;
          blur += texture2D(uScene, vUv + vec2(0.0, -2.0) * radius) * 0.09;
          blur += texture2D(uScene, vUv + vec2(0.0,  2.0) * radius) * 0.09;
          blur += texture2D(uScene, vUv + vec2(0.0,  4.0) * radius) * 0.05;
          blur += texture2D(uScene, vUv + vec2(-2.0, -2.0) * radius) * 0.08;
          blur += texture2D(uScene, vUv + vec2( 2.0, -2.0) * radius) * 0.08;
          blur += texture2D(uScene, vUv + vec2(-2.0,  2.0) * radius) * 0.08;
          blur += texture2D(uScene, vUv + vec2( 2.0,  2.0) * radius) * 0.08;
          blur.rgb *= 0.86 + horizonDepth * 0.1;

          vec3 color = mix(sharp.rgb, blur.rgb, blurAmount);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dofMaterial));
  }

  function createGrassField() {
    if (grass) {
      grass.geometry.dispose();
      grass.material.dispose();
      scene.remove(grass);
    }

    const narrow = width < 768;
    const baseBladeCount = narrow ? MOBILE_BLADE_COUNT : DESKTOP_BLADE_COUNT;
    const frontBladeCount = Math.round(baseBladeCount * 0.25);
    const bladeCount = baseBladeCount + frontBladeCount;
    const columns = Math.round(Math.sqrt(baseBladeCount * 1.45));
    const rows = Math.ceil(baseBladeCount / columns);
    const fieldWidth = narrow ? 13.5 : 18.5;
    const fieldDepth = narrow ? 16 : 18.5;
    const offsets = new Float32Array(bladeCount * 3);
    const randoms = new Float32Array(bladeCount * 4);
    const scales = new Float32Array(bladeCount);

    for (let index = 0; index < bladeCount; index += 1) {
      const foregroundBlade = index >= baseBladeCount;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = foregroundBlade
        ? (Math.random() - 0.5) * fieldWidth
        : ((column + Math.random()) / columns - 0.5) * fieldWidth;
      const z = foregroundBlade
        ? 5.2 - Math.pow(Math.random(), 1.35) * fieldDepth * 0.42
        : 5.2 - ((row + Math.random()) / rows) * fieldDepth;
      const waveA = Math.sin(Math.hypot(x + 4.4, z + 1.6) * 1.38);
      const waveB = Math.sin(Math.hypot(x - 5.8, z + 6.4) * 0.92);
      const waveC = Math.sin(x * 0.42 - z * 0.34);
      const hill = (waveA - waveB) * 0.18 + waveC * 0.09;
      const depthProgress = THREE.MathUtils.smoothstep(5.2 - z, 0, fieldDepth);

      offsets[index * 3] = x;
      offsets[index * 3 + 1] = hill - (narrow ? 1.42 : 1.62);
      offsets[index * 3 + 2] = z;
      randoms[index * 4] = Math.random();
      randoms[index * 4 + 1] = Math.random();
      randoms[index * 4 + 2] = Math.random();
      randoms[index * 4 + 3] = Math.random();
      scales[index] = randomBetween(0.68, 1.28) * (0.92 - depthProgress * 0.24);
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
    const targetWidth = Math.max(1, Math.floor(width * pixelRatio));
    const targetHeight = Math.max(1, Math.floor(height * pixelRatio));

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.position.set(0, width < 768 ? 1.68 : 1.56, width < 768 ? 8.0 : 7.75);
    camera.lookAt(0, width < 768 ? -0.72 : -0.88, -3.95);
    camera.updateProjectionMatrix();

    if (!fieldTarget) {
      fieldTarget = createRenderTarget(targetWidth, targetHeight);
    } else {
      fieldTarget.setSize(targetWidth, targetHeight);
    }

    if (dofMaterial) {
      dofMaterial.uniforms.uResolution.value.set(targetWidth, targetHeight);
      dofMaterial.uniforms.uScene.value = fieldTarget.texture;
    }

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
    if (fieldTarget && dofMaterial) {
      renderer.setRenderTarget(fieldTarget);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(postScene, postCamera);
    } else {
      renderer.render(scene, camera);
    }
    window.requestAnimationFrame(animate);
  }

  setupDepthOfFieldPass();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.requestAnimationFrame(animate);
}
})();
