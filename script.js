const canvas = document.getElementById('shader-canvas');
const lensCanvas = document.getElementById('lens-canvas');

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

  float circle(in vec2 _st, in float _radius, in float blurriness){
    vec2 dist = _st;
    return 1.0 - smoothstep(_radius - (_radius*blurriness), _radius + (_radius*blurriness), dot(dist, dist) * 4.0);
  }

  float dist(vec2 p0, vec2 pf){
    return sqrt((pf.x-p0.x)*(pf.x-p0.x) + (pf.y-p0.y)*(pf.y-p0.y));
  }

  void main() {
    vec2 resolution = u_res;
    vec3 uv = vUv.xyz;
    float progress = uBgProgress;

    float baseNoise = noise(uBaseFrequency * uv + uTime * 0.18);
    vec2 basePos = rotate2d(baseNoise * 6.283185) * uv.xy * uZoom;
    float basePattern = lines(basePos, 0.5);

    vec2 st = gl_FragCoord.xy / resolution.xy - vec2(0.5);
    st.y *= resolution.y / resolution.x;

    float c = circle(st, 0.18 + progress * 4.8, 1.6);

    float offX = uv.x + sin(uv.y + uTime * 2.0);
    float offY = uv.y - uTime * 0.2 - cos(uTime * 2.0) * 0.1;
    float nc = snoise3(vec3(offX, offY, uTime * 1.1) * 2.0) * 0.03 * uNoiseIntensity;

    float d = dist(resolution.xy * 0.5, gl_FragCoord.xy) * (1.0 - progress) * 0.00235;

    vec2 accentPos = rotate2d(baseNoise * 6.283185) * uv.xy * uZoom * uAccentFrequency;
    float accentPattern = lines(accentPos, 0.1);

    vec3 baseMix = mix(uBaseFirstColor, uBaseSecondColor, basePattern);
    vec3 accentMix = mix(baseMix, uAccentColor, clamp(accentPattern - (1.0 - uAccentOpacity), 0.0, 1.0));

    float rawMask = pow(max(c, 0.0), 6.0) * 10.0 + nc * (1.0 - progress);
    float finalMask = smoothstep(0.02, 0.82, rawMask);

    vec4 finalImage = mix(vec4(vec3(finalMask), 1.0), vec4(accentMix, 1.0), clamp(finalMask + progress, 0.0, 1.0)) * (1.0 - d);
    gl_FragColor = vec4(finalImage.rgb, uOpacityBackground);
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
    uBaseFirstColor: { value: new THREE.Color(0.62, 0.77, 0.54) },
    uBaseSecondColor: { value: new THREE.Color(1.0, 0.66, 0.32) },
    uAccentColor: { value: new THREE.Color(0.0, 0.0, 0.0) },
    uBgProgress: { value: 0.075 },
    uAccentOpacity: { value: 0.88 },
    uBaseFrequency: { value: 1.72 },
    uAccentFrequency: { value: 1.08 },
    uNoiseIntensity: { value: 1.35 },
    uOpacityBackground: { value: 1.0 },
    uTime: { value: 0.0 },
    uZoom: { value: 0.82 },
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

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.u_res.value.set(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
  }

  function animate(time) {
    uniforms.uTime.value = time * 0.001;
    uniforms.uBgProgress.value = 0.073 + Math.sin(time * 0.00034) * 0.006;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  document.documentElement.classList.add('shader-ready');
  requestAnimationFrame(animate);
}

initShader().catch((error) => {
  console.warn('Shader background failed; using CSS fallback.', error);
});

function createDisplacementTexture() {
  const size = 256;
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const ctx = source.getContext('2d');
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x / size - 0.5) * 2;
      const dy = (y / size - 0.5) * 2;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const ripple = Math.sin(radius * 34 - angle * 3) * 0.5 + 0.5;
      const falloff = Math.max(0, 1 - radius);
      const value = 128 + (ripple - 0.5) * 120 * falloff;
      const index = (y * size + x) * 4;
      image.data[index] = value + dx * 36 * falloff;
      image.data[index + 1] = value + dy * 36 * falloff;
      image.data[index + 2] = 128;
      image.data[index + 3] = Math.round(255 * falloff);
    }
  }

  ctx.putImageData(image, 0, 0);
  return PIXI.Texture.from(source);
}

function createLensTexture(radius) {
  const size = radius * 2;
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const ctx = source.getContext('2d');
  const center = radius;

  const glass = ctx.createRadialGradient(center * 0.75, center * 0.62, 0, center, center, radius);
  glass.addColorStop(0, 'rgba(255,255,255,0.42)');
  glass.addColorStop(0.18, 'rgba(255,255,255,0.10)');
  glass.addColorStop(0.62, 'rgba(255,255,255,0.035)');
  glass.addColorStop(1, 'rgba(255,255,255,0.0)');

  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.96, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = Math.max(1, radius * 0.022);
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.46)';
  ctx.lineWidth = Math.max(1, radius * 0.018);
  ctx.beginPath();
  ctx.arc(center * 0.82, center * 0.78, radius * 0.5, Math.PI * 1.1, Math.PI * 1.62);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath();
  ctx.ellipse(center * 0.67, center * 0.58, radius * 0.12, radius * 0.055, -0.55, 0, Math.PI * 2);
  ctx.fill();

  return PIXI.Texture.from(source);
}

function buildTitleText(text, fontSize) {
  return new PIXI.Text(text, {
    fontFamily: 'Space Grotesk, Roobert, Helvetica, Arial, sans-serif',
    fontSize,
    fontWeight: '400',
    fill: 0xffffff,
    lineHeight: fontSize * 0.934,
    align: 'center',
  });
}

async function initCursorLens() {
  if (!window.PIXI || !lensCanvas) {
    return;
  }

  await document.fonts.ready;

  const app = new PIXI.Application({
    view: lensCanvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });

  const englishContainer = new PIXI.Container();
  const revealContainer = new PIXI.Container();
  const maskedEnglish = new PIXI.Container();
  const maskedReveal = new PIXI.Container();
  const circleMask = new PIXI.Graphics();
  const inverseCircleMask = new PIXI.Graphics();
  const lensSprite = new PIXI.Sprite();
  const displacementSprite = new PIXI.Sprite(createDisplacementTexture());
  const displacementFilter = new PIXI.filters.DisplacementFilter(displacementSprite);
  const rgbSplitFilter = PIXI.filters.RGBSplitFilter
    ? new PIXI.filters.RGBSplitFilter([-3, 2], [1, 1], [3, -2])
    : null;

  displacementFilter.scale.set(20, 20);
  displacementSprite.anchor.set(0.5);
  displacementSprite.alpha = 0;

  maskedEnglish.addChild(englishContainer);
  maskedReveal.addChild(revealContainer);
  maskedEnglish.mask = inverseCircleMask;
  maskedReveal.mask = circleMask;
  maskedReveal.filters = rgbSplitFilter
    ? [displacementFilter, rgbSplitFilter]
    : [displacementFilter];

  app.stage.addChild(maskedEnglish);
  app.stage.addChild(maskedReveal);
  app.stage.addChild(circleMask);
  app.stage.addChild(inverseCircleMask);
  app.stage.addChild(displacementSprite);
  app.stage.addChild(lensSprite);

  let englishText;
  let revealText;
  let radius = 118;
  let targetX = window.innerWidth * 0.5;
  let targetY = window.innerHeight * 0.5;
  let smoothX = targetX;
  let smoothY = targetY;

  function drawInverseMask() {
    inverseCircleMask.clear();
    inverseCircleMask.beginFill(0xffffff);
    inverseCircleMask.drawRect(0, 0, app.screen.width, app.screen.height);
    inverseCircleMask.beginHole();
    inverseCircleMask.drawCircle(smoothX, smoothY, radius);
    inverseCircleMask.endHole();
    inverseCircleMask.endFill();
  }

  function drawCircleMask() {
    circleMask.clear();
    circleMask.beginFill(0xffffff);
    circleMask.drawCircle(smoothX, smoothY, radius);
    circleMask.endFill();
  }

  function layoutText() {
    const fontSize = Math.max(window.innerWidth * 0.08, window.innerWidth < 768 ? 76 : 72);
    radius = Math.max(84, Math.min(138, window.innerWidth * 0.09));

    englishContainer.removeChildren();
    revealContainer.removeChildren();

    englishText = buildTitleText('michael wang', fontSize);
    revealText = buildTitleText('汪博涵', fontSize * 0.86);

    englishText.anchor.set(0.5);
    revealText.anchor.set(0.5);
    englishText.position.set(app.screen.width * 0.5, app.screen.height * 0.5 - 14);
    revealText.position.set(app.screen.width * 0.5, app.screen.height * 0.5 - 14);

    englishContainer.addChild(englishText);
    revealContainer.addChild(revealText);

    lensSprite.texture = createLensTexture(Math.ceil(radius));
    lensSprite.anchor.set(0.5);
    lensSprite.alpha = 0.72;
    lensSprite.blendMode = PIXI.BLEND_MODES.SCREEN;

    displacementSprite.width = radius * 2.05;
    displacementSprite.height = radius * 2.05;
    drawCircleMask();
    drawInverseMask();
  }

  function resize() {
    layoutText();
  }

  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
  });

  window.addEventListener('resize', resize);
  layoutText();

  app.ticker.add(() => {
    smoothX += 0.1 * (targetX - smoothX);
    smoothY += 0.1 * (targetY - smoothY);

    lensSprite.position.set(smoothX, smoothY);
    displacementSprite.position.set(smoothX, smoothY);
    displacementSprite.rotation += 0.0035;

    drawCircleMask();
    drawInverseMask();
  });
}

initCursorLens().catch((error) => {
  console.warn('Cursor lens failed.', error);
});
