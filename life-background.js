const lifeCanvas = document.getElementById('life-canvas');
const lifeTextCanvas = document.getElementById('life-text-canvas');
const LIFE_WEBGL_PIXEL_RATIO_CAP = 1.35;
const LIFE_TEXT_PIXEL_RATIO_CAP = 1.3;

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

  const targetMouse = new THREE.Vector2(0.5, 0.5);
  const smoothMouse = new THREE.Vector2(0.5, 0.5);

  function syncMouseUniform() {
    const resolution = starNestMaterial.uniforms.iResolution.value;
    starNestMaterial.uniforms.iMouse.value.set(
      smoothMouse.x * resolution.x,
      smoothMouse.y * resolution.y,
      0,
      0,
    );
  }

  function onPointerMove(event) {
    targetMouse.set(
      event.clientX / Math.max(window.innerWidth, 1),
      event.clientY / Math.max(window.innerHeight, 1),
    );
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, LIFE_WEBGL_PIXEL_RATIO_CAP);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 1);
    starNestMaterial.uniforms.iResolution.value.set(width * pixelRatio, height * pixelRatio, 1);
    syncMouseUniform();
  }

  function animate() {
    starNestMaterial.uniforms.iTime.value = clock.getElapsedTime();
    smoothMouse.lerp(targetMouse, 0.01);
    syncMouseUniform();
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
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
  const timelineTextParticles = [];
  const timelineParticleBuckets = [];
  const timelineItems = Array.from(document.querySelectorAll('.life-event'));
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sourcePoints = [];
  let startedAt = performance.now();
  let scrollProgress = 0;
  let targetScrollProgress = 0;
  let depopulationProgress = 0;
  let timelinePathPoints = [];
  let touchStartY = null;
  const lastTimelineReveals = [];
  const settleDuration = 1500;
  const timelineStep = 0.92;
  const TIMELINE_VISIBLE_WINDOW = 3;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function getTrackedTextWidth(context, text, tracking, wordSpacing) {
    return Array.from(text).reduce((total, character, index, characters) => {
      const spacing = index < characters.length - 1
        ? tracking + (character === ' ' ? wordSpacing : 0)
        : 0;

      return total + context.measureText(character).width + spacing;
    }, 0);
  }

  function fillTrackedText(context, text, x, y, tracking, wordSpacing) {
    const characters = Array.from(text);
    let cursor = x - getTrackedTextWidth(context, text, tracking, wordSpacing) * 0.5;

    context.textAlign = 'left';

    characters.forEach((character, index) => {
      if (character !== ' ') {
        context.fillText(character, cursor, y);
      }

      cursor += context.measureText(character).width;

      if (index < characters.length - 1) {
        cursor += tracking + (character === ' ' ? wordSpacing : 0);
      }
    });

    context.textAlign = 'center';
  }

  function wrapTrackedText(context, text, maxWidth, tracking, wordSpacing) {
    const words = text.split(' ');
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;

      if (line && getTrackedTextWidth(context, nextLine, tracking, wordSpacing) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    });

    if (line) {
      lines.push(line);
    }

    return lines;
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function isContinuationItem(item) {
    return item?.dataset.continuation === 'true';
  }

  function getWheelDistance(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * height;
    }

    return event.deltaY;
  }

  function getMaxScrollProgress() {
    return 1 + timelineItems.length * timelineStep + 0.8;
  }

  function syncScrollCue() {
    document.body.classList.toggle(
      'is-life-scrolled',
      Math.max(scrollProgress, targetScrollProgress) > 0.08,
    );
  }

  function applyScrollDistance(distance) {
    if (distance === 0) {
      return;
    }

    targetScrollProgress = clamp(
      targetScrollProgress + distance / Math.max(height * 1.28, 760),
      0,
      getMaxScrollProgress(),
    );
    syncScrollCue();
  }

  function handleWheel(event) {
    const distance = getWheelDistance(event);

    if (distance === 0) {
      return;
    }

    event.preventDefault();
    applyScrollDistance(distance);
  }

  function handleTouchStart(event) {
    touchStartY = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event) {
    const currentY = event.touches[0]?.clientY;

    if (touchStartY === null || currentY === undefined) {
      return;
    }

    event.preventDefault();
    applyScrollDistance((touchStartY - currentY) * 1.65);
    touchStartY = currentY;
  }

  function handleTouchEnd() {
    touchStartY = null;
  }

  function handleKeyDown(event) {
    const distances = {
      ArrowDown: height * 0.34,
      PageDown: height * 0.8,
      ArrowUp: height * -0.34,
      PageUp: height * -0.8,
    };
    let distance = distances[event.key] ?? 0;

    if (event.key === ' ') {
      distance = height * (event.shiftKey ? -0.8 : 0.8);
    } else if (event.key === 'Home') {
      targetScrollProgress = 0;
      scrollProgress = 0;
      depopulationProgress = 0;
      syncScrollCue();
      event.preventDefault();
      return;
    } else if (event.key === 'End') {
      targetScrollProgress = getMaxScrollProgress();
      scrollProgress = targetScrollProgress;
      depopulationProgress = 1;
      syncScrollCue();
      event.preventDefault();
      return;
    }

    if (distance === 0) {
      return;
    }

    event.preventDefault();
    applyScrollDistance(distance);
  }

  function getTimelinePath() {
    if (width < 700) {
      return timelineItems.map((item, index) => {
        const isContinuation = isContinuationItem(item);
        const y = 24 + (isContinuation ? index - 1 : index) * 6.8;

        return {
          x: isContinuation ? 66 : 50,
          y,
          dateX: isContinuation ? 66 : 50,
          dateY: y,
          labelX: isContinuation ? 74 : 50,
          labelY: isContinuation ? y : y + 4.2,
          angle: 0,
          labelAngle: 0,
        };
      });
    }

    // Three vertical tracks (top y=25, mid y=50, bot y=75) with consecutive events
    // cycling through tracks so any visible triple occupies all three rows. Date sits
    // 6% above the dot, label 8% below — tight enough to read as one unit, loose
    // enough that 2-line labels stay clear of the next track. Tracks pulled in from
    // the edges so labels never clip at the top or bottom.
    return [
      { x: 15, y: 25, dateX: 15, dateY: 19, labelX: 15, labelY: 33, angle: 0, labelAngle: 0 },
      { x: 52, y: 50, dateX: 52, dateY: 44, labelX: 52, labelY: 58, angle: 0, labelAngle: 0 },
      { x: 85, y: 75, dateX: 85, dateY: 69, labelX: 85, labelY: 83, angle: 0, labelAngle: 0 },
      { x: 48, y: 25, dateX: 48, dateY: 19, labelX: 48, labelY: 33, angle: 0, labelAngle: 0 },
      { x: 85, y: 50, dateX: 85, dateY: 44, labelX: 85, labelY: 58, angle: 0, labelAngle: 0 },
      { x: 15, y: 75, dateX: 15, dateY: 69, labelX: 15, labelY: 83, angle: 0, labelAngle: 0 },
      { x: 82, y: 25, dateX: 82, dateY: 19, labelX: 82, labelY: 33, angle: 0, labelAngle: 0 },
      { x: 18, y: 50, dateX: 18, dateY: 44, labelX: 18, labelY: 58, angle: 0, labelAngle: 0 },
      { x: 50, y: 75, dateX: 50, dateY: 69, labelX: 50, labelY: 83, angle: 0, labelAngle: 0 },
      { x: 78, y: 75, dateX: 78, dateY: 75, labelX: 88, labelY: 75, angle: 0, labelAngle: 0 },
    ];
  }

  function layoutTimeline() {
    const path = getTimelinePath();
    timelinePathPoints = path.map((point) => ({
      x: (point.x / 100) * width,
      y: (point.y / 100) * height,
    }));

    timelineItems.forEach((item, index) => {
      const point = path[index] || path[path.length - 1];

      item.style.setProperty('--event-x', `${point.x}%`);
      item.style.setProperty('--event-y', `${point.y}%`);
      item.style.setProperty('--event-angle', `${point.angle}deg`);
      item.style.setProperty('--event-label-angle', `${point.labelAngle}deg`);
    });
  }

  function getTimelineTextStyle(kind) {
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';
    const fontSize = kind === 'date'
      ? clamp(width * 0.0175, width < 700 ? 18 : 22, width < 700 ? 25 : 34)
      : clamp(width * 0.021, width < 700 ? 21 : 28, width < 700 ? 30 : 42);
    const fontWeight = 400;
    const tracking = clamp(width * 0.001, width < 700 ? 0.55 : 1.1, width < 700 ? 1.2 : 2.05);

    return {
      font: `${fontWeight} ${fontSize}px ${fontStack}`,
      fontSize,
      fontWeight,
      fontStack,
      tracking,
      wordSpacing: tracking * 2.1,
      lineHeight: fontSize * 1.28,
      maxWidth: width < 700 ? width * 0.8 : 460,
    };
  }

  function getTimelineTextAnchor(point, pathPoint, eventIndex, kind) {
    if (isContinuationItem(timelineItems[eventIndex])) {
      return {
        x: clamp(((pathPoint.labelX ?? pathPoint.x) / 100) * width, 130, width - 130),
        y: clamp(((pathPoint.labelY ?? pathPoint.y) / 100) * height, height * 0.08, height * 0.9),
      };
    }

    if (width < 700) {
      return {
        x: clamp(point.x, 130, width - 130),
        y: point.y + (kind === 'date' ? -24 : 30),
      };
    }

    const anchorX = kind === 'date'
      ? pathPoint.dateX ?? pathPoint.x
      : pathPoint.labelX ?? pathPoint.x;
    const anchorY = kind === 'date'
      ? pathPoint.dateY ?? pathPoint.y
      : pathPoint.labelY ?? pathPoint.y;

    return {
      x: clamp((anchorX / 100) * width, 150, width - 150),
      y: clamp((anchorY / 100) * height, height * 0.08, height * 0.9),
    };
  }

  function createTimelineTextPoints({ text, x, y, kind }) {
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');
    const textStyle = getTimelineTextStyle(kind);
    const points = [];

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.font = textStyle.font;
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';

    const lines = kind === 'date'
      ? [text]
      : wrapTrackedText(sourceCtx, text, textStyle.maxWidth, textStyle.tracking, textStyle.wordSpacing);
    const startY = y - ((lines.length - 1) * textStyle.lineHeight) * 0.5;
    const sampleGap = 1;

    lines.forEach((line, index) => {
      fillTrackedText(
        sourceCtx,
        line,
        x,
        startY + index * textStyle.lineHeight,
        textStyle.tracking,
        textStyle.wordSpacing,
      );
    });

    const imageData = sourceCtx.getImageData(0, 0, width, height);

    for (let pointY = 0; pointY < height; pointY += sampleGap) {
      for (let pointX = 0; pointX < width; pointX += sampleGap) {
        const alpha = imageData.data[(pointY * width + pointX) * 4 + 3];

        if (alpha > 30) {
          points.push({ x: pointX, y: pointY, alpha: alpha / 255 });
        }
      }
    }

    return points;
  }

  function addTimelineParticle(particle) {
    timelineTextParticles.push(particle);

    if (!timelineParticleBuckets[particle.eventIndex]) {
      timelineParticleBuckets[particle.eventIndex] = [];
    }

    timelineParticleBuckets[particle.eventIndex].push(particle);
  }

  function addTimelineTextParticles(points, eventIndex, kind) {
    if (!points || points.length === 0) {
      return;
    }

    const count = Math.round(clamp(
      points.length * (kind === 'date' ? 0.6 : 0.55),
      kind === 'date' ? 320 : 480,
      kind === 'date' ? 2600 : 6800,
    ));

    for (let index = 0; index < count; index += 1) {
      const point = points[Math.floor(Math.random() * points.length)];

      addTimelineParticle({
        eventIndex,
        kind,
        originX: point.x + randomBetween(-44, 44),
        originY: point.y + randomBetween(28, 78),
        targetX: point.x,
        targetY: point.y,
        targetAlpha: kind === 'date'
          ? Math.max(0.64, point.alpha * 0.84)
          : Math.max(0.68, point.alpha * 0.88),
        size: kind === 'date'
          ? randomBetween(width < 700 ? 0.9 : 1.0, width < 700 ? 1.5 : 1.85)
          : randomBetween(width < 700 ? 0.95 : 1.08, width < 700 ? 1.7 : 2.1),
        revealOffset: randomBetween(0, 0.035),
        jitter: randomBetween(0.02, 0.16),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function addDotParticles(point, eventIndex) {
    const count = width < 700 ? 64 : 92;
    const radius = width < 700 ? 4.8 : 6.2;

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const targetRadius = Math.sqrt(Math.random()) * radius;

      addTimelineParticle({
        eventIndex,
        kind: 'dot',
        originX: point.x + randomBetween(-64, 64),
        originY: point.y + randomBetween(-64, 64),
        targetX: point.x + Math.cos(angle) * targetRadius,
        targetY: point.y + Math.sin(angle) * targetRadius,
        targetAlpha: randomBetween(0.62, 0.98),
        size: randomBetween(width < 700 ? 1.1 : 1.25, width < 700 ? 2.1 : 2.55),
        revealOffset: randomBetween(0, 0.055),
        jitter: randomBetween(0.12, 0.62),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function addLineParticles(startPoint, endPoint, eventIndex) {
    const distance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    const count = Math.max(26, Math.round(distance / (width < 700 ? 5.8 : 7)));

    for (let index = 0; index < count; index += 1) {
      const lineProgress = count === 1 ? 1 : index / (count - 1);
      const x = startPoint.x + (endPoint.x - startPoint.x) * lineProgress;
      const y = startPoint.y + (endPoint.y - startPoint.y) * lineProgress;

      addTimelineParticle({
        eventIndex,
        kind: 'line',
        lineProgress,
        originX: x + randomBetween(-24, 24),
        originY: y + randomBetween(-24, 24),
        targetX: x + randomBetween(-1.1, 1.1),
        targetY: y + randomBetween(-1.1, 1.1),
        targetAlpha: randomBetween(0.32, 0.62),
        size: randomBetween(width < 700 ? 0.82 : 0.92, width < 700 ? 1.45 : 1.68),
        revealOffset: randomBetween(0, 0.025),
        jitter: randomBetween(0.04, 0.26),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function buildTimelineTextParticles() {
    const path = getTimelinePath();

    timelineTextParticles.length = 0;
    timelineParticleBuckets.length = 0;

    timelineItems.forEach((item, index) => {
      const isContinuation = isContinuationItem(item);
      const point = path[index] || path[path.length - 1];
      const particlePoint = timelinePathPoints[index] || {
        x: (point.x / 100) * width,
        y: (point.y / 100) * height,
      };
      const date = item.querySelector('time')?.textContent.trim() || '';
      const label = item.querySelector('span')?.textContent.trim() || '';
      const dateAnchor = getTimelineTextAnchor(particlePoint, point, index, 'date');
      const labelAnchor = getTimelineTextAnchor(particlePoint, point, index, 'label');

      if (index > 0 && timelinePathPoints[index - 1]) {
        addLineParticles(timelinePathPoints[index - 1], particlePoint, index);
      }

      if (!isContinuation) {
        addDotParticles(particlePoint, index);
      }

      const datePoints = !isContinuation && date
        ? createTimelineTextPoints({
          text: date,
          x: dateAnchor.x,
          y: dateAnchor.y,
          kind: 'date',
        })
        : [];
      const labelPoints = createTimelineTextPoints({
        text: label,
        x: labelAnchor.x,
        y: labelAnchor.y,
        kind: isContinuation ? 'continuation' : 'label',
      });

      addTimelineTextParticles(datePoints, index, 'date');
      addTimelineTextParticles(labelPoints, index, isContinuation ? 'continuation' : 'label');
    });
  }

  function getTimelinePartProgress(eventIndex, kind, revealOffset = 0, lineProgress = 0) {
    const timelineProgress = Math.max(0, scrollProgress - 1);
    const eventStart = eventIndex * timelineStep;
    const dotDuration = 0.2;
    const dateOffset = 0.18;
    const dateDuration = 0.28;
    const labelOffset = 0.44;
    const labelDuration = 0.32;
    const lineDuration = 0.48;
    const lineParticleDuration = 0.12;

    let revealProgress;

    if (kind === 'line') {
      revealProgress = smoothstep(
        (timelineProgress - eventStart - lineProgress * lineDuration - revealOffset) / lineParticleDuration,
      );
    } else {
      const offset = kind === 'dot'
        ? (eventIndex === 0 ? 0.08 : lineDuration + 0.02)
        : kind === 'date'
          ? (eventIndex === 0 ? dateOffset : lineDuration + dateOffset)
          : (eventIndex === 0 ? labelOffset : lineDuration + labelOffset);
      const duration = kind === 'dot'
        ? dotDuration
        : kind === 'date'
          ? dateDuration
          : labelDuration;

      revealProgress = smoothstep((timelineProgress - eventStart - offset - revealOffset) / duration);
    }

    const fadeStart = (eventIndex + TIMELINE_VISIBLE_WINDOW) * timelineStep + 0.08;
    const fadeProgress = smoothstep((timelineProgress - fadeStart) / 0.5);

    return revealProgress * (1 - fadeProgress);
  }

  function drawTimelineText(time) {
    const timelineProgress = Math.max(0, scrollProgress - 1);
    const lastVisibleEvent = Math.min(
      timelineItems.length - 1,
      Math.ceil((timelineProgress + 1.9) / timelineStep),
    );

    for (let eventIndex = 0; eventIndex <= lastVisibleEvent; eventIndex += 1) {
      const eventParticles = timelineParticleBuckets[eventIndex];

      if (!eventParticles) {
        continue;
      }

      for (let index = 0; index < eventParticles.length; index += 1) {
        const particle = eventParticles[index];
        const progress = getTimelinePartProgress(
          particle.eventIndex,
          particle.kind,
          particle.revealOffset,
          particle.lineProgress || 0,
        );

        if (progress <= 0.01) {
          continue;
        }

        const textParticle = particle.kind === 'date'
          || particle.kind === 'label'
          || particle.kind === 'continuation';
        const shimmer = Math.sin(time * 0.004 + particle.phase)
          * particle.jitter
          * (textParticle ? 0.08 : 0.2 + progress * 0.35);
        const x = particle.originX + (particle.targetX - particle.originX) * progress;
        const y = particle.originY + (particle.targetY - particle.originY) * progress;

        ctx.globalAlpha = particle.targetAlpha * progress;
        ctx.fillStyle = '#fff';
        ctx.fillRect(
          x + shimmer,
          y - shimmer * 0.4,
          particle.size,
          particle.size,
        );
      }
    }
  }

  function updateTimeline() {
    const timelineProgress = Math.max(0, scrollProgress - 1);

    timelineItems.forEach((item, index) => {
      const revealProgress = smoothstep((timelineProgress - index * timelineStep - 0.08) / 0.2);
      const previousRevealProgress = lastTimelineReveals[index] ?? -1;

      if (Math.abs(revealProgress - previousRevealProgress) < 0.002) {
        return;
      }

      lastTimelineReveals[index] = revealProgress;

      item.style.setProperty('--event-progress', revealProgress.toFixed(3));
      item.style.setProperty('--event-opacity', '0');
      item.style.setProperty('--event-scale', (0.92 + revealProgress * 0.08).toFixed(3));
      item.setAttribute('aria-hidden', revealProgress < 0.02 ? 'true' : 'false');
    });
  }

  function createTitleSource() {
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');
    const titleSize = clamp(width * 0.16, width < 700 ? 72 : 120, width < 700 ? 128 : 220);
    const subtitleSize = clamp(width * 0.026, width < 700 ? 14 : 20, width < 700 ? 21 : 34);
    const centerY = height * (width < 700 ? 0.47 : 0.45);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';
    const subtitleTracking = clamp(width * 0.0022, width < 700 ? 1.1 : 1.8, width < 700 ? 2.2 : 4.2);
    const subtitleWordSpacing = subtitleTracking * 2.4;

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
      fillTrackedText(
        sourceCtx,
        'a timeline of moments that shaped',
        width * 0.5,
        centerY + titleSize * 0.55,
        subtitleTracking,
        subtitleWordSpacing,
      );
      fillTrackedText(
        sourceCtx,
        'who i am today.',
        width * 0.5,
        centerY + titleSize * 0.77,
        subtitleTracking,
        subtitleWordSpacing,
      );
    } else {
      fillTrackedText(
        sourceCtx,
        'a timeline of moments that shaped who i am today.',
        width * 0.5,
        centerY + titleSize * 0.58,
        subtitleTracking,
        subtitleWordSpacing,
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
        }
      }
    }

    return points;
  }

  function createParticles() {
    const count = Math.round(clamp(
      sourcePoints.length * (width < 700 ? 0.68 : 0.82),
      width < 700 ? 1900 : 3000,
      width < 700 ? 4300 : 7600,
    ));

    particles.length = 0;

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];
      const x = randomBetween(0, width);
      const y = randomBetween(0, height);
      const delay = Math.random() * 34;

      particles.push({
        x,
        y,
        originX: x,
        originY: y,
        targetX: point.x,
        targetY: point.y,
        alpha: 0,
        targetAlpha: point.kind === 'subtitle'
          ? Math.max(0.48, point.alpha * 0.7)
          : Math.max(0.62, point.alpha),
        delay,
        exitStart: randomBetween(0, 0.46),
        exitDuration: randomBetween(0.28, 0.4),
        size: point.kind === 'subtitle'
          ? randomBetween(width < 700 ? 0.95 : 1.08, width < 700 ? 1.75 : 2.2)
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
    pixelRatio = Math.min(window.devicePixelRatio || 1, LIFE_TEXT_PIXEL_RATIO_CAP);
    lifeTextCanvas.width = Math.floor(width * pixelRatio);
    lifeTextCanvas.height = Math.floor(height * pixelRatio);
    lifeTextCanvas.style.width = `${width}px`;
    lifeTextCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    sourcePoints = createTitleSource();
    createParticles();
    layoutTimeline();
    buildTimelineTextParticles();
    lastTimelineReveals.length = 0;
    updateTimeline();
  }

  function updateSmoothScroll() {
    const delta = targetScrollProgress - scrollProgress;

    if (Math.abs(delta) < 0.001) {
      scrollProgress = targetScrollProgress;
    } else {
      scrollProgress += delta * 0.2;
    }

    depopulationProgress = clamp(scrollProgress, 0, 1);
  }

  function draw(time) {
    updateSmoothScroll();

    const elapsed = Math.max(0, time - startedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);
    const timelineScrim = smoothstep((scrollProgress - 0.82) / 0.46);

    ctx.clearRect(0, 0, width, height);
    if (timelineScrim > 0.01) {
      ctx.globalAlpha = timelineScrim * 0.42;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    updateTimeline();

    if (depopulationProgress < 0.995) {
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const exitProgress = smoothstep(
          (depopulationProgress - particle.exitStart) / particle.exitDuration,
        );
        const targetX = particle.targetX + (particle.originX - particle.targetX) * exitProgress;
        const targetY = particle.targetY + (particle.originY - particle.targetY) * exitProgress;
        const targetAlpha = particle.targetAlpha * (1 - exitProgress);

        if (particle.delay > 0) {
          particle.delay -= 1;
          particle.x += randomBetween(-16, 16) * motion;
          particle.y += randomBetween(-12, 12) * motion;
        } else {
          const pull = 0.055 + (1 - motion) * 0.095;
          particle.x += (targetX - particle.x) * pull;
          particle.y += (targetY - particle.y) * pull;
          particle.alpha += (targetAlpha - particle.alpha) * 0.08;
        }

        const visibleAlpha = clamp(particle.alpha, 0, 1);
        if (visibleAlpha < 0.01) {
          continue;
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
      }
    }

    drawTimelineText(time);

    ctx.globalAlpha = 1;
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('keydown', handleKeyDown);
  syncScrollCue();
  updateTimeline();
  window.requestAnimationFrame(draw);
}
