const canvas = document.getElementById('shader-canvas');
const titleCanvas = document.getElementById('title-canvas');

function initAtlantaTime() {
  const timeElements = [
    document.getElementById('atlanta-time'),
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
  window.setInterval(updateTime, 1000);
}

initAtlantaTime();

const vertexShader = `
  varying vec3 vUv;

  void main() {
    vUv = position;
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec3 vUv;

  uniform vec3  uBaseFirstColor;
  uniform vec3  uBaseSecondColor;
  uniform vec3  uAccentColor;
  uniform float uBgProgress;
  uniform float uAccentOpacity;
  uniform float uBaseFrequency;
  uniform float uAccentFrequency;
  uniform float uNoiseIntensity;
  uniform float uOpacityBackground;
  uniform float uTime;
  uniform float uZoom;
  uniform vec2  uMouse;
  uniform vec2  u_res;

  vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float mod289(float x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 perm(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }

  float noise(vec3 p){
    vec3 a = floor(p);
    vec3 d = p - a;
    d = d * d * (3.0 - 2.0 * d);

    vec4 b  = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
    vec4 k1 = perm(b.xyxy);
    vec4 k2 = perm(k1.xyxy + b.zzww);

    vec4 c  = k2 + a.zzzz;
    vec4 k3 = perm(c);
    vec4 k4 = perm(c + 1.0);

    vec4 o1 = fract(k3 * (1.0/41.0));
    vec4 o2 = fract(k4 * (1.0/41.0));

    vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
    vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

    return o4.y * d.y + o4.x * (1.0 - d.y);
  }

  float snoise3(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  mat2 rotate2d(float angle){
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  }

  float lines(in vec2 pos, float b){
    float scale = 10.0;
    pos *= scale;
    return smoothstep(0.0, 0.5 + b*0.5, abs((sin(pos.x*3.1415) + b*2.0)) * 0.5);
  }

  float flowerPolar(vec2 p, float petals, float radius, float roundness, float softness, float phase){
    float angle = atan(p.y, p.x) + phase;
    float r = length(p);
    float petalWave = pow(max(0.0, 0.5 + 0.5 * cos(angle * petals)), roundness);
    float petalRadius = radius * (0.24 + petalWave * 0.94);
    float edge = 1.0 - smoothstep(petalRadius, petalRadius + softness, r);
    float centerFade = smoothstep(0.025, radius * 0.52, r);
    return edge * centerFade * smoothstep(0.42, 0.96, petalWave);
  }

  float petalLayer(vec2 p, float petals, float radius, float roundness, float softness, float phase){
    float primary = flowerPolar(p, petals, radius, roundness, softness, phase);
    float secondary = flowerPolar(p * vec2(1.08, 0.94), petals, radius * 0.92, roundness * 0.82, softness * 1.28, phase + 0.32);
    return clamp(primary + secondary * 0.55, 0.0, 1.0);
  }

  float flowerCenter(vec2 p){
    float r = length(p);
    float glow = 1.0 - smoothstep(0.02, 0.18, r);
    float core = 1.0 - smoothstep(0.0, 0.07, r);
    return clamp(glow * 0.72 + core, 0.0, 1.0);
  }

  float petalVeins(vec2 p, float petals, float phase){
    float angle = atan(p.y, p.x) + phase;
    float r = length(p);
    float radial = pow(max(0.0, 1.0 - abs(sin(angle * petals * 0.5))), 10.0);
    float pulse = 0.55 + 0.45 * sin(r * 34.0 - uTime * 1.2 + angle * 2.0);
    return radial * pulse * smoothstep(0.08, 0.48, r) * (1.0 - smoothstep(0.58, 0.82, r));
  }

  float ribbonField(vec2 p){
    float y1 = sin(p.x * 5.2 + uTime * 0.46) * 0.13 + sin(p.x * 10.0 - uTime * 0.18) * 0.045 + 0.24;
    float y2 = sin(p.x * 4.4 - uTime * 0.36 + 1.7) * 0.11 + sin(p.x * 8.0 + uTime * 0.24) * 0.04 - 0.1;
    float y3 = sin(p.x * 6.6 + uTime * 0.3 + 2.4) * 0.08 - 0.36;
    float line1 = exp(-pow((p.y - y1) * 13.0, 2.0));
    float line2 = exp(-pow((p.y - y2) * 15.0, 2.0));
    float line3 = exp(-pow((p.y - y3) * 16.0, 2.0));
    float rightBias = smoothstep(-0.25, 0.72, p.x);
    return (line1 + line2 * 0.74 + line3 * 0.55) * rightBias;
  }

  float gaussianDerivative(vec2 p){
    return -p.x * exp(-dot(p, p));
  }

  float segmentDistance(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  vec2 gaussianProject(float x, float y){
    float z = gaussianDerivative(vec2(x, y));
    float sx = x * 0.14 + y * 0.13 - 0.1;
    float sy = z * 1.02 + y * 0.12 - 0.02;
    return rotate2d(-0.03 + uMouse.x * 0.025) * vec2(sx, sy);
  }

  float curveDistance(vec2 p, float ySlice, float phase){
    float best = 10.0;

    for (int i = 0; i < 20; i++) {
      float x = -2.1 + float(i) * 0.22;
      vec2 a = gaussianProject(x, ySlice);
      vec2 b = gaussianProject(x + 0.22, ySlice);
      float shimmer = sin(float(i) * 0.7 + ySlice * 8.0 + phase) * 0.003;
      best = min(best, segmentDistance(p, a, b) + shimmer);
    }

    return best;
  }

  float gaussianSurface(vec2 p){
    float glow = 0.0;

    for (int j = 0; j < 9; j++) {
      float ySlice = -0.96 + float(j) * 0.24;
      float d = curveDistance(p, ySlice, uTime * 1.15);
      glow += exp(-pow(d * 70.0, 2.0)) * 0.38;
      glow += exp(-pow(d * 18.0, 2.0)) * 0.05;
    }

    for (int k = 0; k < 5; k++) {
      float x = -1.36 + float(k) * 0.68;
      float best = 10.0;

      for (int i = 0; i < 14; i++) {
        float y = -0.96 + float(i) * 0.15;
        vec2 a = gaussianProject(x, y);
        vec2 b = gaussianProject(x, y + 0.15);
        best = min(best, segmentDistance(p, a, b));
      }

      glow += exp(-pow(best * 48.0, 2.0)) * 0.12;
    }

    return clamp(glow, 0.0, 1.0);
  }

  float redRibbonField(vec2 p){
    float y1 = sin(p.x * 4.4 + uTime * 0.32) * 0.08 + sin(p.x * 8.4 - uTime * 0.24) * 0.026 + 0.32;
    float y2 = sin(p.x * 3.2 - uTime * 0.26 + 1.2) * 0.12 + 0.01;
    float y3 = sin(p.x * 5.6 + uTime * 0.18 + 2.1) * 0.07 - 0.3;
    float line1 = exp(-pow((p.y - y1) * 18.0, 2.0));
    float line2 = exp(-pow((p.y - y2) * 17.0, 2.0));
    float line3 = exp(-pow((p.y - y3) * 22.0, 2.0));
    return line1 * 0.72 + line2 * 0.38 + line3 * 0.3;
  }

  void main() {
    vec2 resolution = u_res;
    vec2 st = gl_FragCoord.xy / resolution.xy - vec2(0.5);
    st.y *= resolution.y / resolution.x;
    vec2 field = st;

    vec2 surfaceUv = field - vec2(-0.2 + uMouse.x * 0.035, 0.04 - uMouse.y * 0.02);
    surfaceUv *= 1.08 + sin(uTime * 0.45) * 0.012;

    float surface = gaussianSurface(surfaceUv) * 0.08;
    float ribbons = redRibbonField(field + uMouse * vec2(0.035, -0.025));
    float haze = noise(vec3(field * 2.8, uTime * 0.08));
    float core = exp(-pow(length(surfaceUv - vec2(-0.11, 0.0)) * 5.2, 2.0));

    vec3 deepBlack = vec3(0.018, 0.0, 0.002);
    vec3 red = vec3(1.0, 0.02, 0.05);
    vec3 crimson = vec3(0.65, 0.0, 0.04);
    vec3 magenta = vec3(1.0, 0.1, 0.32);
    vec3 whiteHot = vec3(1.0, 0.78, 0.68);

    vec3 finalImage = deepBlack;
    finalImage += crimson * ribbons * 0.52;
    finalImage += red * pow(max(ribbons, 0.0), 2.0) * 0.42;
    finalImage += magenta * surface * 0.2;
    finalImage += red * pow(max(surface, 0.0), 1.8) * 0.18;
    finalImage += whiteHot * pow(max(surface, 0.0), 4.0) * 0.08;
    finalImage += red * core * 0.28;
    finalImage += crimson * haze * 0.035;
    finalImage *= 1.0 - smoothstep(0.58, 1.04, length(field * vec2(0.9, 1.08))) * 0.62;
    gl_FragColor = vec4(finalImage, uOpacityBackground);
  }
`;

async function initShader() {
  if (!canvas) {
    return;
  }

  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uBaseFirstColor: { value: new THREE.Color(1.0, 0.02, 0.05) },
    uBaseSecondColor: { value: new THREE.Color(1.0, 0.1, 0.32) },
    uAccentColor: { value: new THREE.Color(0.0, 0.0, 0.0) },
    uBgProgress: { value: 0.075 },
    uAccentOpacity: { value: 0.88 },
    uBaseFrequency: { value: 1.72 },
    uAccentFrequency: { value: 1.08 },
    uNoiseIntensity: { value: 1.35 },
    uOpacityBackground: { value: 1.0 },
    uTime: { value: 0.0 },
    uZoom: { value: 0.82 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    u_res: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  function gaussianDerivativeValue(x, y) {
    return -x * Math.exp(-(x * x + y * y));
  }

  function projectGaussianPoint(x, y) {
    const z = gaussianDerivativeValue(x, y);
    return {
      x: x * 0.34 + y * 0.22 - 0.28,
      y: z * 1.95 + y * 0.24 + 0.18,
      z: 0.02 + z * 0.08,
      value: z,
    };
  }

  function createGaussianSurfaceGeometry() {
    const xSegments = 96;
    const ySegments = 58;
    const positions = [];
    const values = [];
    const indices = [];

    for (let yi = 0; yi <= ySegments; yi += 1) {
      const y = -1.45 + (yi / ySegments) * 2.9;

      for (let xi = 0; xi <= xSegments; xi += 1) {
        const x = -2.35 + (xi / xSegments) * 4.7;
        const point = projectGaussianPoint(x, y);
        positions.push(point.x, point.y, point.z);
        values.push(point.value);
      }
    }

    for (let yi = 0; yi < ySegments; yi += 1) {
      for (let xi = 0; xi < xSegments; xi += 1) {
        const a = yi * (xSegments + 1) + xi;
        const b = a + 1;
        const c = a + (xSegments + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aValue', new THREE.Float32BufferAttribute(values, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createGaussianWireGeometry() {
    const positions = [];
    const xSteps = 92;
    const ySteps = 34;
    const xLines = 13;
    const yLines = 18;

    function pushSegment(a, b) {
      positions.push(a.x, a.y, a.z + 0.004, b.x, b.y, b.z + 0.004);
    }

    for (let row = 0; row < yLines; row += 1) {
      const y = -1.35 + (row / (yLines - 1)) * 2.7;
      let previous = projectGaussianPoint(-2.25, y);

      for (let xi = 1; xi <= xSteps; xi += 1) {
        const x = -2.25 + (xi / xSteps) * 4.5;
        const next = projectGaussianPoint(x, y);
        pushSegment(previous, next);
        previous = next;
      }
    }

    for (let column = 0; column < xLines; column += 1) {
      const x = -2.1 + (column / (xLines - 1)) * 4.2;
      let previous = projectGaussianPoint(x, -1.32);

      for (let yi = 1; yi <= ySteps; yi += 1) {
        const y = -1.32 + (yi / ySteps) * 2.64;
        const next = projectGaussianPoint(x, y);
        pushSegment(previous, next);
        previous = next;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }

  const graphUniforms = {
    uTime: uniforms.uTime,
    uMouse: uniforms.uMouse,
  };

  const graphMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: graphUniforms,
    vertexShader: `
      uniform vec2 uMouse;

      attribute float aValue;
      varying float vValue;
      varying vec2 vPos;

      void main() {
        vValue = aValue;
        vPos = position.xy;
        vec3 pos = position;
        pos.x += uMouse.x * 0.018;
        pos.y -= uMouse.y * 0.012;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      varying float vValue;
      varying vec2 vPos;

      void main() {
        float heightTone = smoothstep(-0.36, 0.36, vValue);
        float center = exp(-dot(vPos - vec2(-0.28, 0.18), vPos - vec2(-0.28, 0.18)) * 10.0);
        vec3 low = vec3(0.28, 0.0, 0.015);
        vec3 high = vec3(1.0, 0.02, 0.06);
        vec3 color = mix(low, high, heightTone);
        color += vec3(1.0, 0.2, 0.16) * center * 0.22;
        float alpha = 0.24 + abs(vValue) * 0.95 + center * 0.12;
        gl_FragColor = vec4(color, clamp(alpha, 0.18, 0.72));
      }
    `,
  });

  const wireMaterial = new THREE.LineBasicMaterial({
    color: 0xff1736,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const graphSurface = new THREE.Mesh(createGaussianSurfaceGeometry(), graphMaterial);
  const graphWire = new THREE.LineSegments(createGaussianWireGeometry(), wireMaterial);
  scene.add(graphSurface, graphWire);

  const targetMouse = new THREE.Vector2(0, 0);
  const smoothMouse = new THREE.Vector2(0, 0);

  function onPointerMove(event) {
    targetMouse.set(
      (event.clientX / window.innerWidth - 0.5) * 2,
      (event.clientY / window.innerHeight - 0.5) * 2
    );
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.u_res.value.set(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
  }

  function animate(time) {
    uniforms.uTime.value = time * 0.001;
    uniforms.uBgProgress.value = 0.073 + Math.sin(time * 0.00034) * 0.006;
    smoothMouse.lerp(targetMouse, 0.065);
    uniforms.uMouse.value.copy(smoothMouse);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.classList.add('shader-ready');
  requestAnimationFrame(animate);
}

initShader().catch((error) => {
  console.warn('Shader background failed; using CSS fallback.', error);
});

async function initTitleCanvas() {
  if (!titleCanvas) {
    return;
  }

  await document.fonts.ready;

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

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const points = [];
    const sampleGap = window.innerWidth < 768 ? 1 : 2;

    for (let y = 0; y < height; y += sampleGap) {
      for (let x = 0; x < width; x += sampleGap) {
        const alpha = imageData.data[(y * width + x) * 4 + 3];

        if (alpha > 35) {
          points.push({ x, y, alpha: alpha / 255 });
        }
      }
    }

    return points;
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
    const minimum = window.innerWidth < 768 ? 860 : 920;
    const maximum = window.innerWidth < 768 ? 2300 : 3200;
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
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    titleCanvas.width = Math.floor(width * pixelRatio);
    titleCanvas.height = Math.floor(height * pixelRatio);
    titleCanvas.style.width = `${width}px`;
    titleCanvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    buildSources();
    createParticles();
    transitionStartedAt = performance.now();
  }

  function draw(time) {
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
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  setHeadingText(activeLanguage);
  scheduleSequence();
  requestAnimationFrame(draw);
}

initTitleCanvas().catch((error) => {
  console.warn('Title canvas failed.', error);
});
