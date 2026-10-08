(() => {
const profile = window.MWPerformance;
const pageToken = window.MWPageLifecycle.getActiveToken();
const titleCanvas = document.getElementById('title-canvas');

function initLocalTime() {
  const timeElements = [
    document.getElementById('local-time'),
    document.getElementById('manifesto-time'),
  ].filter(Boolean);

  if (timeElements.length === 0) {
    return;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });

  function updateTime() {
    const time = `currently ${formatter.format(new Date()).toLowerCase()}`;

    timeElements.forEach((timeElement) => {
      timeElement.textContent = time;
    });
  }

  updateTime();
  window.setInterval(updateTime, 30000);
}

initLocalTime();

async function initTitleCanvas() {
  if (!titleCanvas) {
    return;
  }

  await Promise.race([document.fonts.ready, new Promise(resolve => window.setTimeout(resolve, 350))]);
  if (!profile.isCurrent(titleCanvas, pageToken) || profile.reducedMotion) return;

  const ctx = titleCanvas.getContext('2d');
  const heading = document.querySelector('.intro-title');
  const HOLD_MS = window.innerWidth < 768 ? 1800 : 500;
  const INTRO_DELAY_MS = 450;
  const STEP_MS = 620;
  const segmentKeys = ['michael', 'wang', 'wangChinese', 'bohanChinese'];
  const englishKeys = ['michael', 'wang'];
  const chineseKeys = ['wangChinese', 'bohanChinese'];
  const particles = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let sources = {};
  let activeLanguage = 'intro';
  let sequenceTimer = null;
  let transitionStartedAt = performance.now();
  const settleDuration = 1200;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getFontSize() {
    if (window.innerWidth < 768) {
      return clamp(window.innerWidth * 0.118, 44, 52);
    }

    return Math.max(window.innerWidth * 0.066, 60);
  }

  function createTextSource({ text, x, y, fontSize, fontWeight = 400 }) {
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.font = `${fontWeight} ${fontSize}px "Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif`;
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';
    sourceCtx.fillText(text, x, y);

    return profile.sampleText(sourceCtx, width, height, x, y, text, fontSize, 2);
  }

  function getSegmentLayouts() {
    const measuringCanvas = document.createElement('canvas');
    const measuringCtx = measuringCanvas.getContext('2d');
    const fontSize = getFontSize();
    const chineseFontSize = fontSize * 1.08;
    const isNarrow = window.innerWidth < 768;
    const centerY = height * 0.5 - (isNarrow ? 10 : 14);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';

    measuringCtx.font = `400 ${fontSize}px ${fontStack}`;
    const michaelWidth = measuringCtx.measureText('michael').width;
    const wangWidth = measuringCtx.measureText('wang').width;
    const englishGap = fontSize * (isNarrow ? 0.38 : 0.56);
    const englishWidth = michaelWidth + englishGap + wangWidth;
    const michaelX = width * 0.5 - englishWidth * 0.5 + michaelWidth * 0.5;
    const wangX = width * 0.5 + englishWidth * 0.5 - wangWidth * 0.5;

    measuringCtx.font = `400 ${chineseFontSize}px ${fontStack}`;
    const chineseWangWidth = measuringCtx.measureText('汪').width;
    const bohanWidth = measuringCtx.measureText('博涵').width;
    const chineseGap = chineseFontSize * (isNarrow ? 0.16 : 0.2);
    const chineseWidth = chineseWangWidth + chineseGap + bohanWidth;
    const chineseWangX = width * 0.5 - chineseWidth * 0.5 + chineseWangWidth * 0.5;
    const bohanX = width * 0.5 + chineseWidth * 0.5 - bohanWidth * 0.5;

    return {
      michael: { text: 'michael', x: michaelX, y: centerY, fontSize },
      wang: { text: 'wang', x: wangX, y: centerY, fontSize },
      wangChinese: { text: '汪', x: chineseWangX, y: centerY, fontSize: chineseFontSize, fontWeight: 400 },
      bohanChinese: { text: '博涵', x: bohanX, y: centerY, fontSize: chineseFontSize, fontWeight: 400 },
    };
  }

  function setHeadingText(language) {
    if (!heading) {
      return;
    }

    heading.textContent = language === 'chinese' ? '汪博涵' : 'michael wang';
  }

  function getParticleCount(points, segment) {
    const isChineseSegment = chineseKeys.includes(segment);
    const multiplier = window.innerWidth < 768 ? 0.72 : 0.64;
    const minimum = profile.lowPower ? 500 : 800;
    const maximum = profile.lowPower ? 1300 : 2600;
    const densityBoost = isChineseSegment ? 1.28 : 1;

    return Math.round(clamp(points.length * multiplier * densityBoost, minimum, maximum * densityBoost));
  }

  function getParticleSize(segment) {
    const isChineseSegment = chineseKeys.includes(segment);

    if (isChineseSegment) {
      return randomBetween(0.95, window.innerWidth < 768 ? 2.15 : 1.9);
    }

    return randomBetween(1.15, window.innerWidth < 768 ? 2.55 : 2.25);
  }

  function retargetParticle(particle, show, immediate = false) {
    const points = sources[particle.segment];

    if (!points || points.length === 0) {
      return;
    }

    const point = points[Math.floor(Math.random() * points.length)];

    if (show) {
      particle.targetX = point.x;
      particle.targetY = point.y;
      particle.targetAlpha = Math.max(window.innerWidth < 768 ? 0.72 : 0.58, point.alpha);
      particle.delay = immediate ? 0 : Math.random() * 26;

      if (particle.alpha <= 0.04 || immediate) {
        particle.x = point.x + randomBetween(-28, 28);
        particle.y = point.y + randomBetween(84, 170);
      }
    } else {
      particle.targetX = particle.x + randomBetween(-95, 95);
      particle.targetY = particle.y - randomBetween(92, 230);
      particle.targetAlpha = 0;
      particle.delay = immediate ? 0 : Math.random() * 18;
    }

    if (immediate && show) {
      particle.x = point.x;
      particle.y = point.y;
      particle.alpha = Math.max(window.innerWidth < 768 ? 0.72 : 0.58, point.alpha);
      particle.targetAlpha = particle.alpha;
      particle.delay = 0;
    }
  }

  function createParticles() {
    particles.length = 0;

    segmentKeys.forEach((segment) => {
      const points = sources[segment];

      if (!points || points.length === 0) {
        return;
      }

      const visible = activeLanguage === 'english'
        ? englishKeys.includes(segment)
        : activeLanguage === 'chinese' && chineseKeys.includes(segment);
      const count = getParticleCount(points, segment);

      for (let index = 0; index < count; index += 1) {
        const point = points[Math.floor(Math.random() * points.length)];
        const alpha = visible ? Math.max(window.innerWidth < 768 ? 0.72 : 0.58, point.alpha) : 0;
        const particle = {
          segment,
          x: visible ? point.x : randomBetween(0, width),
          y: visible ? point.y : randomBetween(height * 0.56, height * 0.84),
          targetX: point.x,
          targetY: point.y,
          size: getParticleSize(segment),
          alpha,
          targetAlpha: alpha,
          delay: Math.random() * 18,
          jitter: randomBetween(0.25, 1.2),
          phase: Math.random() * Math.PI * 2,
        };

        retargetParticle(particle, visible, true);
        particles.push(particle);
      }
    });
  }

  function buildSources() {
    const layouts = getSegmentLayouts();

    sources = Object.fromEntries(
      segmentKeys.map((segment) => [segment, createTextSource(layouts[segment])]),
    );
  }

  function setSegments(segments, show, immediate = false) {
    transitionStartedAt = performance.now();
    profile.frame(draw, pageToken);

    particles.forEach((particle) => {
      if (segments.includes(particle.segment)) {
        retargetParticle(particle, show, immediate);
      }
    });
  }

  function scheduleSequence() {
    window.clearTimeout(sequenceTimer);

    const waitTime = activeLanguage === 'intro' ? INTRO_DELAY_MS : HOLD_MS;

    sequenceTimer = window.setTimeout(() => {
      if (activeLanguage === 'intro') {
        setSegments(['michael'], true);
        window.setTimeout(() => {
          setSegments(['wang'], true);
          activeLanguage = 'english';
          setHeadingText(activeLanguage);
          window.setTimeout(scheduleSequence, settleDuration);
        }, STEP_MS);
      } else if (activeLanguage === 'english') {
        setSegments(['michael'], false);
        window.setTimeout(() => setSegments(['wang'], false), STEP_MS);
        window.setTimeout(() => setSegments(['wangChinese'], true), STEP_MS * 2);
        window.setTimeout(() => {
          setSegments(['bohanChinese'], true);
          activeLanguage = 'chinese';
          setHeadingText(activeLanguage);
          window.setTimeout(scheduleSequence, settleDuration);
        }, STEP_MS * 3);
      } else {
        setSegments(['wangChinese'], false);
        window.setTimeout(() => setSegments(['bohanChinese'], false), STEP_MS);
        window.setTimeout(() => setSegments(['michael'], true), STEP_MS * 2);
        window.setTimeout(() => {
          setSegments(['wang'], true);
          activeLanguage = 'english';
          setHeadingText(activeLanguage);
          window.setTimeout(scheduleSequence, settleDuration);
        }, STEP_MS * 3);
      }
    }, waitTime);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = profile.pixelRatio(1.25, 1);

    titleCanvas.width = Math.floor(width * pixelRatio);
    titleCanvas.height = Math.floor(height * pixelRatio);
    titleCanvas.style.width = `${width}px`;
    titleCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    buildSources();
    createParticles();
    transitionStartedAt = performance.now();
    profile.frame(draw, pageToken);
  }

  function draw(time) {
    if (!profile.isCurrent(titleCanvas, pageToken)) return;
    const elapsed = Math.max(0, time - transitionStartedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);

    ctx.clearRect(0, 0, width, height);

    particles.forEach((particle) => {
      if (particle.delay > 0) {
        particle.delay -= 1;
        particle.x += randomBetween(-12, 12) * motion;
        particle.y += randomBetween(-8, 8) * motion;
      } else {
        const pull = 0.07 + (1 - motion) * 0.085;
        particle.x += (particle.targetX - particle.x) * pull;
        particle.y += (particle.targetY - particle.y) * pull;
        particle.alpha += (particle.targetAlpha - particle.alpha) * 0.08;
      }

      const shimmer = Math.sin(time * 0.004 + particle.phase) * particle.jitter * motion;
      const visibleAlpha = clamp(particle.alpha, 0, 1);

      if (visibleAlpha < 0.01) {
        return;
      }

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

    if (elapsed < settleDuration + 1600) profile.frame(draw, pageToken);
  }

  window.addEventListener('resize', profile.debounce(resize));
  resize();
  profile.refreshFonts(resize, pageToken);
  setHeadingText(activeLanguage);
  scheduleSequence();
  profile.frame(draw, pageToken);
}

initTitleCanvas().catch((error) => {
  console.warn('Title canvas failed.', error);
});

})();
