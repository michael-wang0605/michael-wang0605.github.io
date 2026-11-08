import { createDotField, stepDotField } from './dot-field.js';

// Preserve ASCII Magic's halftone grid and animated source, but draw each dot
// as its own GPU sprite. Only the source/tone pass runs at the piece's 15 fps;
// springs and pointer parallax update at the browser's frame rate.
export function playMausoleum(pre, mod, { still = false, speed = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const host = pre.getRootNode().host;
  const { cols, rows } = mod.meta;
  const field = createDotField(cols, rows);
  const drawSource = mod.default();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const mouse = { x: 0, y: 0, active: false };
  const pointer = { x: 0, y: 0, active: false };
  let shiftX = 0, shiftY = 0, targetX = 0, targetY = 0;
  let width = 1, height = 1, left = 0, top = 0, ratio = 1;
  let frame = 0, previous = 0, lastSource = -Infinity, elapsed = 0, stopped = false;
  let departure = null, departed = false;
  let program, buffer, vertex, fragment, observer;
  const uniform = {};

  function dispose() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('pointerout', onPointerOut);
    window.removeEventListener('blur', clearPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('mw:portfolio-dismiss', onDismiss);
    document.removeEventListener('mw:portfolio-reset', onReset);
    reduced.removeEventListener('change', onMotion);
    finePointer.removeEventListener('change', onMotion);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    host.style.removeProperty('--portfolio-shift-x');
    host.style.removeProperty('--portfolio-shift-y');
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    pre.style.display = '';
  }

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };
  try {
    vertex = compile(gl.VERTEX_SHADER, `
      attribute vec4 dot;
      uniform vec2 viewport;
      uniform float pixelRatio;
      uniform float cellWidth;
      varying float radius;
      varying float spriteSize;
      varying float tone;
      void main() {
        vec2 position = dot.xy / viewport;
        gl_Position = vec4(position.x * 2. - 1., 1. - position.y * 2., 0., 1.);
        radius = dot.z * cellWidth * pixelRatio;
        spriteSize = max(1., ceil(radius * 2. + 2.));
        gl_PointSize = spriteSize;
        tone = dot.w;
      }
    `);
    fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying float radius;
      varying float spriteSize;
      varying float tone;
      void main() {
        if (radius < .25) discard;
        float distanceToCenter = length(gl_PointCoord - .5) * spriteSize;
        float coverage = 1. - smoothstep(max(0., radius - .65), radius + .65, distanceToCenter);
        gl_FragColor = vec4(vec3(tone * coverage), coverage);
      }
    `);
    program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, field.data.byteLength, gl.DYNAMIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'dot');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, 0, 0);
    for (const name of ['viewport', 'pixelRatio', 'cellWidth']) uniform[name] = gl.getUniformLocation(program, name);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  } catch (error) {
    dispose();
    console.warn('Interactive mausoleum unavailable; using the canvas player.', error);
    return null;
  }

  // Tone conversion matches the library's continuous halftone areas. Retain
  // source palette luminance, then lift it to neutral grayscale for this site.
  const levels = { '\u2581': .135, '\u2582': .257, '\u2583': .378, '\u2584': .51, '\u2585': .635, '\u2586': .757, '\u2587': .878, '\u2588': 1 };
  const palette = {};
  for (const [key, hex] of Object.entries(mod.meta.palette)) {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    palette[key] = [luminance, luminance * (.18 + .82 / Math.max(r, g, b, .001))];
  }
  const values = new Float32Array(cols * rows), tones = new Float32Array(cols * rows);
  const histogram = new Uint32Array(512);
  const areas = [.04, .25, .7225, 1.7424];
  function updateSource() {
    const source = drawSource(elapsed * speed);
    const text = source.text.split('\n'), color = source.color.split('\n');
    let maximum = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const entry = palette[color[y][x]];
      values[i] = (levels[text[y][x]] || 0) * entry[0];
      tones[i] = entry[1];
      maximum = Math.max(maximum, values[i]);
    }
    histogram.fill(0);
    for (const value of values) histogram[Math.min(511, Math.floor(value / (maximum || 1) * 512))]++;
    const percentile = fraction => {
      let total = 0;
      for (let i = 0; i < histogram.length; i++) {
        total += histogram[i];
        if (total >= fraction * values.length) return (i + .5) / 512 * maximum;
      }
      return maximum;
    };
    const low = percentile(.04), high = Math.max(percentile(.985), low + .0001);
    for (let i = 0; i < field.count; i++) {
      const sx = Math.max(0, Math.min(cols - 1, field.anchors[i * 2] * cols - .5));
      const sy = Math.max(0, Math.min(rows - 1, field.anchors[i * 2 + 1] * rows - .5));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
      const tx = sx - x0, ty = sy - y0;
      const value = values[y0 * cols + x0] * (1 - tx) * (1 - ty) + values[y0 * cols + x1] * tx * (1 - ty) +
        values[y1 * cols + x0] * (1 - tx) * ty + values[y1 * cols + x1] * tx * ty;
      const t = Math.pow(Math.max(0, Math.min(1, (value - low) / (high - low))), 1.1);
      const level = t * 4 - .5, index = Math.floor(level), mix = level - index;
      const a = index < 0 ? 0 : areas[Math.min(3, index)], b = areas[Math.min(3, index + 1)];
      field.data[i * 4 + 2] = .3 * Math.sqrt(a + (b - a) * mix);
      field.data[i * 4 + 3] = tones[Math.round(sy) * cols + Math.round(sx)];
    }
  }

  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  pre.style.display = 'none';
  pre.after(canvas);

  function render(delta, now = performance.now()) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (departed) return;
    const interactive = !departure && !still && !reduced.matches && finePointer.matches;
    const ease = 1 - Math.exp(-5 * delta);
    shiftX += ((interactive ? targetX : 0) - shiftX) * ease;
    shiftY += ((interactive ? targetY : 0) - shiftY) * ease;
    host.style.setProperty('--portfolio-shift-x', shiftX.toFixed(3) + 'px');
    host.style.setProperty('--portfolio-shift-y', shiftY.toFixed(3) + 'px');
    pointer.x = mouse.x - left - shiftX;
    pointer.y = mouse.y - top - shiftY;
    pointer.active = interactive && mouse.active && pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    if (departure) {
      const progress = Math.max(0, Math.min(1, (now - departure.startedAt) / departure.duration));
      if (progress >= 1) {
        departure = null;
        departed = true;
        return;
      }
      for (let i = 0; i < field.count; i++) {
        const j = i * 4, k = i * 3;
        const delay = departure.paths[k + 2];
        const p = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
        const distance = reduced.matches ? 0 : p * p;
        field.data[j] = departure.source[j] * width / departure.width + departure.paths[k] * distance;
        field.data[j + 1] = departure.source[j + 1] * height / departure.height + departure.paths[k + 1] * distance;
        field.data[j + 2] = departure.source[j + 2] * (1 - p * .8);
        field.data[j + 3] = departure.source[j + 3] * Math.pow(1 - p, 1.5);
      }
    } else {
      stepDotField(field, width, height, pointer, delta);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.data);
    gl.drawArrays(gl.POINTS, 0, field.count);
  }

  function resize() {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    left = bounds.left - shiftX; top = bounds.top - shiftY;
    ratio = Math.min(window.devicePixelRatio || 1, 2, 1536 / width, 864 / height);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniform.viewport, width, height);
    gl.uniform1f(uniform.pixelRatio, ratio);
    gl.uniform1f(uniform.cellWidth, width / cols);
    render(0);
  }

  function animate(now) {
    frame = 0;
    if (stopped || document.hidden || !host.isConnected || gl.isContextLost()) return;
    const delta = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
    previous = now;
    elapsed += delta;
    if (!departure && !departed && now - lastSource >= 1000 / mod.meta.fps) { updateSource(); lastSource = now; }
    render(delta, now);
    if (!departed && (departure || (!still && !reduced.matches))) frame = requestAnimationFrame(animate);
  }
  function resume() {
    cancelAnimationFrame(frame);
    previous = 0;
    if (!stopped && !departed && !document.hidden && (departure || (!still && !reduced.matches))) frame = requestAnimationFrame(animate);
  }
  function onPointer(event) {
    if (departure || departed || event.pointerType === 'touch' || !finePointer.matches || reduced.matches) return;
    mouse.x = event.clientX; mouse.y = event.clientY; mouse.active = true;
    targetX = (event.clientX / window.innerWidth * 2 - 1) * 7;
    targetY = (event.clientY / window.innerHeight * 2 - 1) * 5;
  }
  function clearPointer() { mouse.active = false; targetX = targetY = 0; }
  function onPointerOut(event) { if (!event.relatedTarget) clearPointer(); }
  function onVisibility() { clearPointer(); resume(); }
  function onDismiss(event) {
    if (stopped || departed || departure) return;
    clearPointer();
    const paths = new Float32Array(field.count * 3);
    for (let i = 0; i < field.count; i++) {
      const j = i * 4, k = i * 3;
      const angle = Math.atan2(field.data[j + 1] - height * .3, field.data[j] - width * .5)
        + (Math.random() - .5) * 1.3;
      const distance = Math.max(width, height) * (.3 + Math.random() * .55);
      paths[k] = Math.cos(angle) * distance;
      paths[k + 1] = Math.sin(angle) * distance;
      paths[k + 2] = Math.random() * .22;
    }
    departure = {
      startedAt: event.detail.startedAt, duration: event.detail.duration,
      source: new Float32Array(field.data), paths, width, height,
    };
    resume();
  }
  function onReset() {
    if (stopped) return;
    departure = null;
    departed = false;
    clearPointer();
    field.motion.fill(0);
    updateSource();
    render(0);
    resume();
  }
  function onMotion() {
    clearPointer();
    field.motion.fill(0);
    shiftX = shiftY = 0;
    render(0);
    resume();
  }
  function onContextLost(event) {
    event.preventDefault();
    dispose();
    // Re-enter through the component so a restored canvas never reuses dead GPU resources.
    if (host.isConnected) host.start();
  }

  updateSource();
  resize();
  observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  window.addEventListener('blur', clearPointer);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('mw:portfolio-dismiss', onDismiss);
  document.addEventListener('mw:portfolio-reset', onReset);
  reduced.addEventListener('change', onMotion);
  finePointer.addEventListener('change', onMotion);
  canvas.addEventListener('webglcontextlost', onContextLost);
  // A late component mount must not repopulate an already dismissed scene.
  if (document.body.classList.contains('is-portfolio-empty')) {
    departed = true;
    gl.clear(gl.COLOR_BUFFER_BIT);
  } else if (document.body.classList.contains('is-portfolio-departing')) {
    onDismiss({ detail: { startedAt: performance.now(), duration: reduced.matches ? 160 : 2200 } });
  } else {
    resume();
  }
  return dispose;
}
