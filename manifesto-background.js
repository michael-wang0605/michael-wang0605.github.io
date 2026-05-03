(() => {
const titleCanvas = document.getElementById('manifesto-title-canvas');
const TITLE_PIXEL_RATIO_CAP = 1.35;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function scheduleManifestoPaintFirst(callback) {
  if (prefersReducedMotion) {
    callback();
    return;
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(callback);
  });
}

if (document.body.classList.contains('manifesto-page') && prefersReducedMotion) {
  document.body.classList.add(
    'manifesto-title-canvas-revealed',
    'manifesto-title-handoff-complete',
    'manifesto-backdrop-revealed',
  );
}

if (titleCanvas) {
  scheduleManifestoPaintFirst(function () {
    initManifestoTitle().catch((error) => {
      console.warn('Manifesto title animation failed.', error);
      document.body.classList.add('manifesto-title-canvas-revealed', 'manifesto-title-handoff-complete');
    });
  });
}

async function initManifestoTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  const ctx = titleCanvas.getContext('2d');
  const heading = document.querySelector('.manifesto-fallback-title');
  const particles = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sourcePoints = [];
  let startedAt = performance.now();
  const settleDuration = 1500;
  let titleIntroFrames = 0;

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
      ? clamp(width * 0.155, 58, 92)
      : clamp(width * 0.07, 84, 122);
    const centerY = width < 768
      ? clamp(height * 0.18, 118, 150)
      : clamp(height * 0.18, 138, 178);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';
    const points = [];

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.font = `400 ${titleSize}px ${fontStack}`;
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';
    sourceCtx.fillText('manifesto', width * 0.5, centerY);

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

    if (heading) {
      heading.textContent = 'manifesto';
    }

    return points;
  }

  function createParticles() {
    const count = Math.round(clamp(
      sourcePoints.length * (width < 768 ? 0.54 : 0.66),
      width < 768 ? 1600 : 3000,
      width < 768 ? 3800 : 7200,
    ));

    particles.length = 0;

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];

      particles.push({
        x: randomBetween(width * 0.14, width * 0.86),
        y: randomBetween(height * 0.34, height * 0.62),
        targetX: point.x,
        targetY: point.y,
        targetAlpha: Math.max(0.58, point.alpha),
        alpha: 0,
        delay: Math.random() * 32,
        size: randomBetween(width < 768 ? 1.02 : 1.14, width < 768 ? 1.9 : 2.35),
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

    if (!prefersReducedMotion && !document.body.classList.contains('manifesto-title-handoff-complete')) {
      titleIntroFrames += 1;

      if (titleIntroFrames === 14) {
        document.body.classList.add('manifesto-title-canvas-revealed', 'manifesto-title-handoff-complete');
      }
    }

    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
}
})();
