(() => {
const titleCanvas = document.getElementById('portfolio-title-canvas');
const pageLifecycle = window.MWPageLifecycle;
const pageToken = pageLifecycle && pageLifecycle.getActiveToken ? pageLifecycle.getActiveToken() : 0;
const TITLE_PIXEL_RATIO_CAP = 1;
const TITLE_SETTLED_EVENT = 'mw:portfolio-title-settled';

function isCurrentCanvas(element) {
  return element &&
    element.isConnected &&
    (!pageLifecycle || pageLifecycle.getActiveToken() === pageToken);
}

if (titleCanvas) {
  initPortfolioTitle().catch((error) => {
    console.warn('Portfolio title animation failed.', error);
  });
}

async function initPortfolioTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  if (!isCurrentCanvas(titleCanvas)) return;

  const ctx = titleCanvas.getContext('2d');
  if (!ctx) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heading = document.querySelector('.portfolio-fallback-title');
  const particles = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sourcePoints = [];
  let startedAt = performance.now();
  let lastDrawAt = 0;
  let titleFrame = 0;
  let hasAnnouncedSettled = false;
  let departure = null;
  let departed = document.body.classList.contains('is-portfolio-departing');
  const settleDuration = 850;
  const activeFrameInterval = 1000 / 42;

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
      ? clamp(width * 0.132, 52, 76)
      : clamp(width * 0.07, 84, 122);
    const centerX = width * 0.5;
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
    sourceCtx.fillText('portfolio', centerX, centerY);

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const sampleGap = 2;

    for (let y = 0; y < height; y += sampleGap) {
      for (let x = 0; x < width; x += sampleGap) {
        const alpha = imageData.data[(y * width + x) * 4 + 3];

        if (alpha > 34) {
          points.push({ x, y, alpha: alpha / 255 });
        }
      }
    }

    if (heading) {
      heading.textContent = 'portfolio';
    }

    return points;
  }

  function createParticles() {
    particles.length = 0;

    if (!sourcePoints.length) return;

    const count = Math.round(clamp(
      sourcePoints.length * (width < 768 ? 0.4 : 0.44),
      width < 768 ? 1100 : 2000,
      width < 768 ? 2500 : 3900,
    ));

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];

      particles.push({
        x: randomBetween(width * 0.14, width * 0.86),
        y: randomBetween(height * 0.34, height * 0.62),
        targetX: point.x,
        targetY: point.y,
        targetAlpha: Math.max(0.58, point.alpha),
        alpha: 0,
        delay: Math.random() * 14,
        size: randomBetween(width < 768 ? 1.16 : 1.3, width < 768 ? 2.12 : 2.72),
        jitter: randomBetween(0.18, 1.05),
        phase: Math.random() * Math.PI * 2,
      });
    }

    startedAt = performance.now();
  }

  function resize() {
    if (!isCurrentCanvas(titleCanvas)) return;

    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, TITLE_PIXEL_RATIO_CAP);
    titleCanvas.width = Math.floor(width * pixelRatio);
    titleCanvas.height = Math.floor(height * pixelRatio);
    titleCanvas.style.width = `${width}px`;
    titleCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (departure || departed) {
      window.cancelAnimationFrame(titleFrame);
      if (departure) titleFrame = window.requestAnimationFrame(draw);
      return;
    }
    delete titleCanvas.dataset.titleSettled;
    hasAnnouncedSettled = false;
    lastDrawAt = 0;
    sourcePoints = createTitleSource();
    createParticles();
    window.cancelAnimationFrame(titleFrame);
    titleFrame = window.requestAnimationFrame(draw);
  }

  function announceSettled() {
    if (hasAnnouncedSettled) return;

    hasAnnouncedSettled = true;

    if (isCurrentCanvas(titleCanvas)) {
      titleCanvas.dataset.titleSettled = 'true';
      document.dispatchEvent(new CustomEvent(TITLE_SETTLED_EVENT));
    }
  }

  function draw(time) {
    if (!isCurrentCanvas(titleCanvas)) return;
    if (departure) {
      drawDeparture(time);
      return;
    }
    if (departed) return;

    const elapsed = Math.max(0, time - startedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);
    const settled = reducedMotion || elapsed >= settleDuration + 500;
    const frameInterval = activeFrameInterval;

    if (!settled && time - lastDrawAt < frameInterval) {
      titleFrame = window.requestAnimationFrame(draw);
      return;
    }

    lastDrawAt = time;

    ctx.clearRect(0, 0, width, height);

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];

      if (settled) {
        particle.x = particle.targetX;
        particle.y = particle.targetY;
        particle.alpha = particle.targetAlpha;
      } else if (particle.delay > 0) {
        particle.delay -= 1;
        particle.x += randomBetween(-12, 12) * motion;
        particle.y += randomBetween(-8, 8) * motion;
      } else {
        const pull = 0.1 + (1 - motion) * 0.12;
        particle.x += (particle.targetX - particle.x) * pull;
        particle.y += (particle.targetY - particle.y) * pull;
        particle.alpha += (particle.targetAlpha - particle.alpha) * 0.12;
      }

      const visibleAlpha = clamp(particle.alpha, 0, 1);

      if (visibleAlpha < 0.01) {
        continue;
      }

      const shimmer = reducedMotion ? 0 : Math.sin(time * 0.004 + particle.phase) * particle.jitter * motion;
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
    if (heading) heading.classList.add('is-animated');
    if (settled) {
      announceSettled();
    } else {
      titleFrame = window.requestAnimationFrame(draw);
    }
  }

  function dismiss(event) {
    if (!isCurrentCanvas(titleCanvas) || departure || departed) return;
    departure = { startedAt: event.detail.startedAt, duration: event.detail.duration };
    for (const particle of particles) {
      particle.exitX = particle.x;
      particle.exitY = particle.y;
      particle.exitAlpha = particle.alpha;
      // Letters release in small waves, then accelerate away from their homes.
      particle.exitDelay = Math.random() * 0.2;
      particle.exitAngle = Math.atan2(particle.y - height * 0.18, particle.x - width * 0.5)
        + randomBetween(-0.7, 0.7);
      particle.exitDistance = randomBetween(0.3, 0.8) * Math.max(width, height);
    }
    window.cancelAnimationFrame(titleFrame);
    titleFrame = window.requestAnimationFrame(draw);
  }

  function drawDeparture(time) {
    const progress = clamp((time - departure.startedAt) / departure.duration, 0, 1);
    ctx.clearRect(0, 0, width, height);
    if (progress >= 1) {
      departure = null;
      departed = true;
      return;
    }
    ctx.fillStyle = '#fff';
    for (const particle of particles) {
      const p = clamp((progress - particle.exitDelay) / (1 - particle.exitDelay), 0, 1);
      const distance = reducedMotion ? 0 : p * p * particle.exitDistance;
      const flutter = reducedMotion ? 0 : Math.sin(p * 9 + particle.phase) * 20 * p;
      ctx.globalAlpha = particle.exitAlpha * Math.pow(1 - p, 1.6);
      const size = particle.size * (1 - p * 0.75);
      ctx.fillRect(
        particle.exitX + Math.cos(particle.exitAngle) * distance + flutter,
        particle.exitY + Math.sin(particle.exitAngle) * distance - flutter * 0.4,
        size, size,
      );
    }
    ctx.globalAlpha = 1;
    titleFrame = window.requestAnimationFrame(draw);
  }

  function restore() {
    departure = null;
    departed = false;
    resize();
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('mw:portfolio-dismiss', dismiss);
  document.addEventListener('mw:portfolio-reset', restore);
  if (pageLifecycle) pageLifecycle.addCleanup(() => {
    window.cancelAnimationFrame(titleFrame);
    window.removeEventListener('resize', resize);
    document.removeEventListener('mw:portfolio-dismiss', dismiss);
    document.removeEventListener('mw:portfolio-reset', restore);
  }, pageToken);
}
})();
