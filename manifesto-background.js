(() => {
  const canvas = document.getElementById('manifesto-canvas');
  const fisherman = document.querySelector('[data-fisherman]');
  const fishermanImage = fisherman?.querySelector('img');

  if (fishermanImage) {
    let triedFallbackPath = false;

    fishermanImage.addEventListener('error', () => {
      if (!triedFallbackPath) {
        triedFallbackPath = true;
        fishermanImage.src = 'assets/fisherman-silhouette.png';
        return;
      }

      fisherman.classList.add('is-missing-image');
    });

    if (fishermanImage.complete && fishermanImage.naturalWidth === 0) {
      fishermanImage.src = 'assets/fisherman-silhouette.png';
      triedFallbackPath = true;
    }
  }

  if (!canvas) {
    return;
  }

  initManifestoFishingScene().catch((error) => {
    console.warn('Manifesto fishing scene failed.', error);
  });

  async function initManifestoFishingScene() {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
    const clock = new THREE.Clock();
    const rippleUv = new THREE.Vector2(0.405, 0.335);

    let width = 1;
    let height = 1;
    let aspect = 1;
    let pixelRatio = 1;
    let background = null;
    let rigGroup = null;
    let particles = null;

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRipple: { value: rippleUv },
      uMotion: { value: reducedMotion ? 0.18 : 1 },
    };

    const backgroundMaterial = new THREE.ShaderMaterial({
      uniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;
        uniform float uTime;
        uniform float uMotion;
        uniform vec2 uResolution;
        uniform vec2 uRipple;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float thinRing(float d, float radius, float width) {
          return 1.0 - smoothstep(0.0, width, abs(d - radius));
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution.xy;
          vec2 centered = uv - vec2(0.5);
          float aspect = uResolution.x / uResolution.y;
          float time = uTime * uMotion;
          float horizon = 0.505 + sin(time * 0.11) * 0.002;
          float waterMask = 1.0 - smoothstep(horizon - 0.018, horizon + 0.012, uv.y);
          float skyMask = smoothstep(horizon - 0.018, horizon + 0.025, uv.y);
          float waterDepth = clamp((horizon - uv.y) / max(horizon, 0.001), 0.0, 1.0);

          float horizonLine = exp(-pow((uv.y - horizon) / 0.0055, 2.0));
          float horizonGlow = exp(-pow((uv.y - horizon) / 0.071, 2.0))
            * exp(-pow((uv.x - 0.64) / 0.35, 2.0));
          float lowFog = noise(vec2(uv.x * 3.2 + time * 0.025, uv.y * 7.0 - time * 0.015));
          lowFog = smoothstep(0.34, 0.9, lowFog) * exp(-pow((uv.y - 0.56) / 0.23, 2.0));

          float perspective = smoothstep(0.0, 0.48, horizon - uv.y);
          float wavePhase = uv.y * mix(520.0, 118.0, perspective)
            + sin(uv.x * 18.0 + time * 0.55) * 1.25
            + sin(uv.x * 39.0 - time * 0.23) * 0.35;
          float waveLines = pow(max(0.0, sin(wavePhase + time * 0.62)), 13.0);
          float current = sin(uv.x * 20.0 + uv.y * 12.0 + time * 0.34) * 0.5 + 0.5;
          float waterHighlight = (waveLines * 0.1 + current * 0.026) * waterMask * waterDepth;

          vec2 ripplePoint = uRipple + vec2(sin(time * 0.7) * 0.0015, cos(time * 0.6) * 0.001);
          vec2 rippleDelta = (uv - ripplePoint) * vec2(aspect * 1.18, 2.18);
          float d = length(rippleDelta);
          float pulse = fract(time * 0.09);
          float pulseFade = 1.0 - smoothstep(0.0, 1.0, pulse);
          float ring1 = thinRing(d, 0.085 + pulse * 0.038, 0.0085);
          float ring2 = thinRing(d, 0.16 + pulse * 0.052, 0.0075);
          float ring3 = thinRing(d, 0.27 + pulse * 0.066, 0.0065);
          float rippleFade = smoothstep(0.5, 0.07, d);
          float rippleLight = (ring1 * 0.55 + ring2 * 0.42 + ring3 * 0.28) * rippleFade;
          rippleLight *= (0.66 + pulseFade * 0.34) * waterMask;

          float lineReflection = exp(-pow((uv.x - uRipple.x) * aspect / 0.008, 2.0))
            * smoothstep(uRipple.y - 0.02, uRipple.y + 0.08, uv.y)
            * (1.0 - smoothstep(horizon - 0.03, horizon, uv.y))
            * 0.09;

          float sideFade = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.78, uv.x);
          float bottomFade = smoothstep(0.0, 0.14, uv.y);
          float vignette = smoothstep(0.82, 0.25, length(centered * vec2(0.9, 1.15)));
          float grain = hash(gl_FragCoord.xy + floor(time * 24.0)) - 0.5;

          vec3 color = vec3(0.0015);
          color += vec3(0.032) * skyMask;
          color += vec3(0.12) * lowFog * skyMask;
          color += vec3(0.52) * horizonLine * sideFade;
          color += vec3(0.34) * horizonGlow;
          color += vec3(0.055) * waterHighlight;
          color += vec3(0.68) * rippleLight;
          color += vec3(0.22) * lineReflection;
          color *= mix(0.16, 1.0, vignette);
          color *= bottomFade;
          color += vec3(grain * 0.014);

          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
    });

    function screenToWorld(u, v, z = 0) {
      return new THREE.Vector3((u - 0.5) * 2 * aspect, (v - 0.5) * 2, z);
    }

    function screenWidth(value) {
      return value * 2 * aspect;
    }

    function screenHeight(value) {
      return value * 2;
    }

    function makeMaterial(color, opacity, additive = false) {
      return new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        depthTest: false,
      });
    }

    function addRock(group, u, v, rx, ry, rotation, color, opacity, z, segments = 8) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, segments), makeMaterial(color, opacity));
      mesh.position.copy(screenToWorld(u, v, z));
      mesh.scale.set(screenWidth(rx), screenHeight(ry), 1);
      mesh.rotation.z = rotation;
      group.add(mesh);
      return mesh;
    }

    function addCurveTube(group, points, radius, color, opacity, additive = true) {
      const curve = new THREE.CatmullRomCurve3(points.map((point) => screenToWorld(point.u, point.v, point.z ?? 4)));
      const geometry = new THREE.TubeGeometry(curve, 84, screenHeight(radius), 7, false);
      const mesh = new THREE.Mesh(geometry, makeMaterial(color, opacity, additive));
      group.add(mesh);
      return mesh;
    }

    function disposeObject(object) {
      object.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    function buildRig() {
      if (rigGroup) {
        scene.remove(rigGroup);
        disposeObject(rigGroup);
      }

      rigGroup = new THREE.Group();
      scene.add(rigGroup);

      const rockGroup = new THREE.Group();
      rigGroup.add(rockGroup);

      addRock(rockGroup, 0.742, 0.205, 0.105, 0.045, 0.08, 0x050505, 0.98, 2.4, 7);
      addRock(rockGroup, 0.825, 0.223, 0.13, 0.057, -0.13, 0x070707, 0.98, 2.45, 8);
      addRock(rockGroup, 0.922, 0.208, 0.15, 0.068, 0.19, 0x050505, 0.98, 2.5, 7);
      addRock(rockGroup, 0.69, 0.265, 0.078, 0.047, -0.08, 0x101010, 0.82, 2.6, 8);
      addRock(rockGroup, 0.79, 0.296, 0.103, 0.055, 0.12, 0x111111, 0.78, 2.7, 7);
      addRock(rockGroup, 0.889, 0.292, 0.088, 0.049, -0.18, 0x101010, 0.78, 2.75, 8);
      addRock(rockGroup, 0.966, 0.275, 0.105, 0.058, 0.22, 0x080808, 0.9, 2.8, 7);
      addRock(rockGroup, 0.774, 0.317, 0.054, 0.013, -0.07, 0x3a3a3a, 0.22, 3.05, 7);
      addRock(rockGroup, 0.881, 0.314, 0.052, 0.012, 0.17, 0x3f3f3f, 0.18, 3.05, 7);

      const rod = [
        { u: 0.718, v: 0.612, z: 4.2 },
        { u: 0.655, v: 0.68, z: 4.2 },
        { u: 0.54, v: 0.637, z: 4.2 },
        { u: 0.456, v: 0.548, z: 4.2 },
      ];
      const line = [
        { u: 0.456, v: 0.548, z: 4.1 },
        { u: 0.435, v: 0.477, z: 4.1 },
        { u: 0.413, v: 0.395, z: 4.1 },
        { u: rippleUv.x, v: rippleUv.y + 0.004, z: 4.1 },
      ];

      addCurveTube(rigGroup, rod, 0.0019, 0xd8d8d8, 0.3);
      addCurveTube(rigGroup, rod, 0.0046, 0xffffff, 0.035);
      addCurveTube(rigGroup, line, 0.00075, 0xf5f5f5, 0.42);
      addCurveTube(rigGroup, line, 0.0022, 0xffffff, 0.055);

      if (particles) {
        scene.remove(particles);
        disposeObject(particles);
      }

      const particleCount = width < 768 ? 42 : 78;
      const positions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i += 1) {
        const u = 0.08 + Math.random() * 0.82;
        const v = 0.48 + Math.random() * 0.42;
        const point = screenToWorld(u, v, -1);
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
      }

      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: screenHeight(0.0024),
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      aspect = width / Math.max(height, 1);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 1);

      camera.left = -aspect;
      camera.right = aspect;
      camera.top = 1;
      camera.bottom = -1;
      camera.position.z = 10;
      camera.updateProjectionMatrix();

      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);

      if (!background) {
        background = new THREE.Mesh(new THREE.PlaneGeometry(2 * aspect, 2), backgroundMaterial);
        background.position.z = -10;
        scene.add(background);
      } else {
        background.geometry.dispose();
        background.geometry = new THREE.PlaneGeometry(2 * aspect, 2);
      }

      buildRig();
    }

    function animate() {
      const time = clock.getElapsedTime();
      uniforms.uTime.value = reducedMotion ? time * 0.22 : time;

      if (particles) {
        particles.material.opacity = 0.09 + Math.sin(time * 0.31) * 0.025;
      }

      renderer.render(scene, camera);
      window.requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener('resize', resize);
    window.requestAnimationFrame(animate);
  }
})();
