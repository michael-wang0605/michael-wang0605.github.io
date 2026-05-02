const lifeCanvas = document.getElementById('life-canvas');
const lifeTextCanvas = document.getElementById('life-text-canvas');

if (lifeCanvas) {
  initLifeBackground().catch((error) => {
    console.warn('Life WebGL background failed.', error);
  });
}

if (lifeTextCanvas) {
  initLifeTitle().catch((error) => {
    console.warn('Life title animation failed.', error);
  });
}

async function initLifeBackground() {
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');

  const renderer = new THREE.WebGLRenderer({
    canvas: lifeCanvas,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clock = new THREE.Clock();

  const starNestMaterial = new THREE.ShaderMaterial({
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

      #define zoom   0.800
      #define tile   0.850
      #define speed  0.004

      #define brightness 0.00105
      #define darkmatter 0.340
      #define distfading 0.700
      #define saturation 0.0

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord.xy / iResolution.xy - 0.5;
        uv.y *= iResolution.y / iResolution.x;
        vec3 dir = vec3(uv * zoom, 1.0);
        float time = iTime * speed + 0.25;

        float a1 = 0.5 + iMouse.x / iResolution.x * 2.0;
        float a2 = 0.8 + iMouse.y / iResolution.y * 2.0;
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
          if (r > 6) {
            fade *= 1.0 - dm;
          }

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

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), starNestMaterial));

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 1);
    starNestMaterial.uniforms.iResolution.value.set(width * pixelRatio, height * pixelRatio, 1);
    starNestMaterial.uniforms.iMouse.value.set(width * pixelRatio * 0.5, height * pixelRatio * 0.5, 0, 0);
  }

  function animate() {
    starNestMaterial.uniforms.iTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(animate);
}

async function initLifeTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  const ctx = lifeTextCanvas.getContext('2d');
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
    const titleSize = clamp(width * 0.16, width < 700 ? 72 : 120, width < 700 ? 128 : 220);
    const subtitleSize = clamp(width * 0.026, width < 700 ? 14 : 20, width < 700 ? 21 : 34);
    const centerY = height * (width < 700 ? 0.47 : 0.45);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';

    sourceCtx.font = `400 ${titleSize}px ${fontStack}`;
    sourceCtx.fillText('life', width * 0.5, centerY - titleSize * 0.12);

    sourceCtx.font = `400 ${subtitleSize}px ${fontStack}`;
    if (width < 700) {
      sourceCtx.fillText('a timeline of moments that shaped', width * 0.5, centerY + titleSize * 0.55);
      sourceCtx.fillText('who i am today.', width * 0.5, centerY + titleSize * 0.77);
    } else {
      sourceCtx.fillText(
        'a timeline of moments that shaped who i am today.',
        width * 0.5,
        centerY + titleSize * 0.58,
      );
    }

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const sampleGap = 1;
    const subtitleStartY = centerY + titleSize * 0.34;
    const points = [];

    for (let y = 0; y < height; y += sampleGap) {
      for (let x = 0; x < width; x += sampleGap) {
        const alpha = imageData.data[(y * width + x) * 4 + 3];

        if (alpha > 28) {
          const kind = y > subtitleStartY ? 'subtitle' : 'title';
          const point = { x, y, alpha: alpha / 255, kind };
          points.push(point);

          if (kind === 'subtitle') {
            points.push(point, point, point, point);
          }
        }
      }
    }

    return points;
  }

  function createParticles() {
    const count = Math.round(clamp(
      sourcePoints.length * (width < 700 ? 0.86 : 1.08),
      width < 700 ? 2600 : 4200,
      width < 700 ? 6200 : 11800,
    ));

    particles.length = 0;

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];

      particles.push({
        x: randomBetween(0, width),
        y: randomBetween(0, height),
        targetX: point.x,
        targetY: point.y,
        alpha: 0,
        targetAlpha: point.kind === 'subtitle' ? Math.max(0.82, point.alpha) : Math.max(0.62, point.alpha),
        delay: Math.random() * 34,
        size: point.kind === 'subtitle'
          ? randomBetween(width < 700 ? 1.2 : 1.42, width < 700 ? 2.25 : 2.85)
          : randomBetween(width < 700 ? 1.1 : 1.25, width < 700 ? 2.1 : 2.6),
        jitter: randomBetween(0.18, 1.1),
        phase: Math.random() * Math.PI * 2,
      });
    }

    startedAt = performance.now();
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    lifeTextCanvas.width = Math.floor(width * pixelRatio);
    lifeTextCanvas.height = Math.floor(height * pixelRatio);
    lifeTextCanvas.style.width = `${width}px`;
    lifeTextCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    sourcePoints = createTitleSource();
    createParticles();
  }

  function draw(time) {
    const elapsed = Math.max(0, time - startedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);

    ctx.clearRect(0, 0, width, height);

    particles.forEach((particle) => {
      if (particle.delay > 0) {
        particle.delay -= 1;
        particle.x += randomBetween(-16, 16) * motion;
        particle.y += randomBetween(-12, 12) * motion;
      } else {
        const pull = 0.055 + (1 - motion) * 0.095;
        particle.x += (particle.targetX - particle.x) * pull;
        particle.y += (particle.targetY - particle.y) * pull;
        particle.alpha += (particle.targetAlpha - particle.alpha) * 0.08;
      }

      const visibleAlpha = clamp(particle.alpha, 0, 1);
      if (visibleAlpha < 0.01) {
        return;
      }

      const shimmer = Math.sin(time * 0.004 + particle.phase) * particle.jitter * (motion + 0.12);
      ctx.globalAlpha = visibleAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(
        particle.x + shimmer,
        particle.y - shimmer * 0.4,
        particle.size,
        particle.size,
      );
    });

    ctx.globalAlpha = 1;
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
}
