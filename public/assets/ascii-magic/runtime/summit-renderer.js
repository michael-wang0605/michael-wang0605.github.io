// Portfolio renderer for ASCII Magic's summit scene. The scene stays on its
// original cell grid; WebGL draws antialiased halftone dots from a tiny texture.
// Updating a 192 x 108 texture avoids rasterizing every fullscreen pixel in JS.
export function playSummit(pre, mod, { still = false, speed = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
  });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = new Error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw error;
    }
    return shader;
  };
  let program, vertex, fragment, buffer, texture;
  let frame = 0, stopped = false, visible = true, elapsed = 0, previous = 0, lastDraw = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let resizeObserver;
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    reduced.removeEventListener('change', onMotion);
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    pre.style.display = '';
  };

  const { cols, rows } = mod.meta;
  const pixels = new Uint8Array(cols * rows * 4);
  const histogram = new Uint32Array(512);
  const drawScene = mod.default({ pixels: true });
  let toneLow = 0, toneHigh = 1;
  let textureReady = false;

  try {
    vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() {
        uv = vec2(position.x * .5 + .5, .5 - position.y * .5);
        gl_Position = vec4(position, 0., 1.);
      }
    `);
    fragment = compile(gl.FRAGMENT_SHADER, `
      precision highp float;
      uniform sampler2D scene;
      uniform vec2 grid;
      uniform float edgeWidth;
      varying vec2 uv;
      void main() {
        vec2 cell = floor(uv * grid);
        vec4 sampleColor = texture2D(scene, (cell + .5) / grid);
        // Radius and colour are prepared once per source cell, rather than
        // repeating tone mapping for every full-screen output pixel.
        float radius = sampleColor.a * .55;
        float distanceToCenter = length(fract(uv * grid) - .5);
        float ink = 1. - smoothstep(radius - edgeWidth, radius + edgeWidth, distanceToCenter);
        gl_FragColor = vec4(sampleColor.rgb * ink, 1.);
      }
    `);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(gl.getUniformLocation(program, 'grid'), Math.round(cols * 1.31), Math.round(rows * 1.31));
    gl.uniform1i(gl.getUniformLocation(program, 'scene'), 0);
  } catch (error) {
    dispose();
    console.warn('Summit GPU rendering unavailable; using the canvas player.', error);
    return null;
  }

  const edgeUniform = gl.getUniformLocation(program, 'edgeWidth');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  pre.style.display = 'none';
  pre.after(canvas);

  function render() {
    const { rgb, accents } = drawScene(elapsed);
    if (!textureReady) histogram.fill(0);
    for (let i = 0; i < cols * rows; i += 1) {
      const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
      const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
      const ink = luminance > .86 ? 1 : Math.max(.378, Math.min(.878, .757 + accents[i] * .12));
      const value = luminance * ink;
      if (!textureReady) histogram[Math.min(511, Math.floor(value * 511))] += 1;
      const gain = .18 + .82 * 255 / Math.max(r, g, b, 1);
      pixels[i * 4] = r * gain;
      pixels[i * 4 + 1] = g * gain;
      pixels[i * 4 + 2] = b * gain;
      pixels[i * 4 + 3] = Math.round(value * 255);
    }
    if (!textureReady) {
      // Fix the tone range from the first frame so small cloud changes cannot
      // make the static mountain and sky pulse brighter or darker.
      let count = 0;
      for (let i = 0; i < 512; i += 1) {
        count += histogram[i];
        if (count < cols * rows * .04) toneLow = i / 511;
        if (count < cols * rows * .985) toneHigh = (i + 1) / 511;
      }
      toneHigh = Math.max(toneHigh, toneLow + .001);
    }
    const areas = [.04, .25, .7225, 1.7424];
    for (let i = 3; i < pixels.length; i += 4) {
      const value = pixels[i] / 255;
      const t = Math.pow(Math.max(0, Math.min(1, (value - toneLow) / (toneHigh - toneLow))), 1.1);
      const level = t * 4 - .5, low = Math.floor(level), fraction = level - low;
      const a = low < 0 ? 0 : areas[Math.min(3, low)], b = areas[Math.min(3, low + 1)];
      const radius = .5 * .6 * 1.31 * Math.sqrt(a + (b - a) * fraction);
      pixels[i] = Math.round(radius / .55 * 255);
    }
    if (textureReady) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      textureReady = true;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 1280 / bounds.width, 720 / bounds.height);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(edgeUniform, Math.round(cols * 1.31) / canvas.width * .7);
    if (still || reduced.matches) render();
  }

  function animate(now) {
    frame = 0;
    if (stopped || !visible || still || reduced.matches || !canvas.isConnected || gl.isContextLost()) return;
    const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now;
    elapsed += delta * speed;
    const interval = 1000 / mod.meta.fps;
    if (now - lastDraw >= interval - .5) {
      lastDraw = now - ((now - lastDraw + .5) % interval) + .5;
      render();
    }
    frame = requestAnimationFrame(animate);
  }

  function resume() {
    cancelAnimationFrame(frame);
    previous = lastDraw = 0;
    if (!stopped && visible && !still && !reduced.matches) frame = requestAnimationFrame(animate);
  }
  function onVisibility() { visible = !document.hidden; resume(); }
  function onMotion() { render(); resume(); }

  resize();
  if (!still && !reduced.matches) render();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onMotion);
  onVisibility();
  return dispose;
}
