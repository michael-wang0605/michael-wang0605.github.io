const canvas = document.getElementById('interest-shader-canvas');
const titleCanvas = document.getElementById('interest-title-canvas');
const TITLE_SETTLED_EVENT = 'mw:interest-title-settled';
const pageLifecycle = window.MWPageLifecycle;
const pageToken = pageLifecycle && pageLifecycle.getActiveToken ? pageLifecycle.getActiveToken() : 0;

function isCurrentCanvas(element) {
  return element &&
    element.isConnected &&
    (!pageLifecycle || pageLifecycle.getActiveToken() === pageToken);
}

let titleSettledPromise = Promise.resolve();

if (titleCanvas) {
  titleSettledPromise = initInterestTitle().catch((error) => {
    console.warn('Interest title animation failed.', error);
  });
}

if (canvas) {
  titleSettledPromise.then(() => {
    window.setTimeout(() => {
      scheduleInterestArtifact(() => {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.warn('Interest background failed: WebGL is unavailable.');
    } else {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const compactViewport = window.matchMedia('(max-width: 767px)').matches;
      const rayMarchIterations = 144;
      const shadowIterations = 18;
      const renderPixelRatioCap = compactViewport ? 0.58 : 0.92;
      const renderFrameInterval = reducedMotion ? 1000 / 15 : compactViewport ? 1000 / 30 : 0;

    const vertexShader = `
      attribute vec2 aPosition;

      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;

      uniform vec3 iResolution;
      uniform float iTime;
      uniform float iIntro;

      // Based on this tutorial: https://www.youtube.com/watch?v=PGtv-dBi2wE
      // Soft shadow implementation based on: https://iquilezles.org/articles/rmshadows
      // 3D simplex noise from: https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83 (by Ian McEwan)
      // Arbitraty axis rotation from: http://www.neilmendoza.com/glsl-rotation-about-an-arbitrary-axis/ (blarg)

      /////// -- simplex noise start

      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

      float snoise(vec3 v){
          const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
          const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy) );
          vec3 x0 =   v - i + dot(i, C.xxx) ;

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min( g.xyz, l.zxy );
          vec3 i2 = max( g.xyz, l.zxy );

          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1. + 3.0 * C.xxx;

          i = mod(i, 289.0 );
          vec4 p = permute( permute( permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

          float n_ = 1.0/7.0; // N=7
          vec3  ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4( x.xy, y.xy );
          vec4 b1 = vec4( x.zw, y.zw );

          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

          vec3 p0 = vec3(a0.xy,h.x);
          vec3 p1 = vec3(a0.zw,h.y);
          vec3 p2 = vec3(a1.xy,h.z);
          vec3 p3 = vec3(a1.zw,h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return (42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                         dot(p2,x2), dot(p3,x3) ) )) * 0.5 + 0.5;
      }

      ////// -- simplex noise end / abritrary rotation axis start

      mat3 rotAxis(vec3 axis, float a) {
          float s=sin(a);
          float c=cos(a);
          float oc=1.0-c;
          vec3 as=axis*s;
          mat3 p=mat3(axis.x*axis,axis.y*axis,axis.z*axis);
          mat3 q=mat3(c,-as.z,as.y,as.z,c,-as.x,-as.y,as.x,c);
          return p*oc+q;
      }

      ////// -- abritrary rotation axis end / ray<->sphere intersect start

      vec2 raySphere(vec3 r0, vec3 rd, vec3 s0, float sr) {
          float a = dot(rd, rd);
          vec3 s0_r0 = r0 - s0;
          float b = 2.0 * dot(rd, s0_r0);
          float c = dot(s0_r0, s0_r0) - (sr * sr);
          float test = b*b - 4.0*a*c;
          if (test < 0.0) {
              return vec2(-1.0, -1.0);
          }
          test = sqrt(test);
          float X = (-b - test)/(2.0*a);
          float Y = (-b + test)/(2.0*a);
          return vec2(
              min(X, Y),
              max(X, Y)
          );
      }

      ////// -- ray<->sphere intersect end / main start

      // Planetoid terrain functions
      float planetHeightHD(vec3 n, vec3 pseed) {
        return
              snoise(n*2.5 + pseed * 1234.1) * 0.5 +
              snoise(n*2.5*2. + pseed * 1234.1) * 0.25 +
              snoise(n*2.5*4. + pseed * 1234.1) * 0.125 +
              snoise(n*2.5*8. + pseed * 1234.1) * 0.125*0.5 +
              snoise(n*2.5*16. + pseed * 1234.1) * 0.125*0.25;
      }

      float planetHeightHDS(vec3 n, vec3 pseed) {
        return
              snoise(n*1.5 + pseed * 1234.1) * 0.85,
              snoise(n*2.5 + pseed * 1234.1) * 0.15;
      }

      vec3 clrPlanetHD(vec3 p, vec3 pc, vec3 pseed, mat3 rot) {
          vec3 n = normalize(rot * (p - pc));
          float ph = planetHeightHD(n, pseed);
          float t = pow(ph, 1.5);
          float t2 = pow((1. - ph) * 1.5, 2.0);
          return mix(
              mix(
                vec3(0.3, 0.3, 0.3),
                  vec3(1., 1., 1.),
                  t2
              ),
              vec3(1., 1., .7) * (0.25 + pow(snoise(n*2.5*1. + pseed * 11234.1), 0.2) * 0.75),
              t
          );
      }

      float distPlanetHD(vec3 p, vec3 pc, float pr, vec3 pseed, float hd, mat3 rot) {

          // Start with sphere
          float d0 = length(p - pc);
          // Offset by layered simplex noise
          float ph = planetHeightHD(normalize(rot * (p - pc)), pseed);
          float phs = planetHeightHDS(normalize(rot * (p - pc)), pseed);
          float r = pr - pr * hd * mix(ph, phs * 3.5, pow(ph, 1.5));

          return d0 - r;

      }

      // Satellite terrain functions
      float planetHeight(vec3 n, vec3 pseed) {
        return
              snoise(n*0.5 + pseed * 1234.1) +
              snoise(n*0.5*4. + pseed * 1234.1) * 0.25 +
              snoise(n*0.5*16. + pseed * 1234.1) * 0.125 * 0.5;
      }

      float distPlanet(vec3 p, vec3 pc, float pr, vec3 pseed, float hd, mat3 rot) {

          float d0 = length(p - pc);
          float r = pr + pr * hd * planetHeight(normalize(rot * (p - pc)), pseed);

          return d0 - r;

      }

      // Scene function
      float getDist(vec3 p) {

          // Planetoid self rotation
          mat3 p1r = rotAxis(normalize(vec3(.5, -.2, 1.)), iTime * 0.1);
          // Orbital rotation
          mat3 p1r2 = rotAxis(normalize(vec3(-1, -.1, 0.05)), -iTime * 0.2);
          // Satellite self rotation
          mat3 p2r = rotAxis(normalize(vec3(.1, .5, -1.)), -iTime * 0.5);

          return min(
            distPlanetHD(p, vec3(0., 0., 0.), 5., vec3(.4315, .3415, .141561), 0.1, p1r),
              distPlanet(p, p1r2 * vec3(1., 3., 7.) * 1., 0.5, vec3(.1315, .7615, .5341561), 1., p2r)
          );

      }

      vec3 getClr(vec3 p) {
          vec3 clr = vec3(0.75, 0.75, 0.75);
          mat3 p1r = rotAxis(normalize(vec3(.5, -.2, 1.)), iTime * 0.1);
          float dp = distPlanetHD(p, vec3(0., 0., 0.), 5., vec3(.4315, .3415, .141561), 0.1, p1r);
          if (dp < (1e-3)) {
              return clrPlanetHD(p, vec3(0., 0., 0.), vec3(.4315, .3415, .141561), p1r);
          }
          return clr;
      }

      // Raymarching implementation
      #define MAX_ITERATIONS ${rayMarchIterations}
      #define FAR_CLIP 60.
      #define MIN_DIST (1e-3)

      float rayMarch(vec3 r0, vec3 rd) {
          float ds = 0.;
          for (int i=0; i<MAX_ITERATIONS; i++) {
              vec3 p = r0 + rd * ds;
              float dist = getDist(p);
              ds += dist;
              if (dist < MIN_DIST) {
                  return ds;
              }
              if (ds >= FAR_CLIP) {
                  break;
              }
          }
          return FAR_CLIP;
      }

      // Lighting functions
      #define LIGHT vec3(0., 15., -1.)
      #define SHADOW_STRENGTH 0.8
      #define AMBIENT_LIGHT 0.01
      #define SURFACE_DIST 0.02
      #define NORMAL_SAMPLE_DIST (1e-3)
      #define SHADOW_ITERATIONS ${shadowIterations}
      #define SHADOW_MIN_DIST (1e-4)
      #define SHADOW_SHARPNESS 2.25

      float shadowRay(vec3 r0, vec3 rd, float maxDist) {
          float ds = 0.;
          float ret = 1.;
          for (int i=0; i<SHADOW_ITERATIONS; i++) {
              if (ds >= maxDist) {
                  break;
              }
              vec3 p = r0 + rd * ds;
              float dist = getDist(p);
              ds += dist;
              if (dist < SHADOW_MIN_DIST) {
                  return 0.0;
              }
              ret = min(ret, SHADOW_STRENGTH * dist/ds);
          }
          return pow(ret, 1.0 / SHADOW_SHARPNESS);
      }

      float shadowRayLD(vec3 r0, vec3 rd, float maxDist) {
          float ds = 0.;
          float ret = 1.;
          for (int i=0; i<16; i++) {
              if (ds >= maxDist) {
                  break;
              }
              vec3 p = r0 + rd * ds;
              float dist = getDist(p);
              ds += dist;
              if (dist < (0.5 * 1e-1)) {
                  return 0.0;
              }
              ret = min(ret, SHADOW_STRENGTH * dist/ds);
          }
          return pow(ret, 1.0 / 2.);
      }

      vec3 getNormal(vec3 p) {
          vec2 eps = vec2(NORMAL_SAMPLE_DIST, 0.);
          return normalize(
              getDist(p) - vec3(
                  getDist(p - eps.xyy),
                  getDist(p - eps.yxy),
                  getDist(p - eps.yyx)
              )
          );
      }

      float getLight(vec3 n, vec3 p) {

          vec3 ld = normalize(LIGHT - p);

          // Apply defuse lighting
          float l = clamp(dot(n, ld), 0., 1.) * (1. - AMBIENT_LIGHT) + AMBIENT_LIGHT;

          return l;
      }

      float getShading(vec3 n, vec3 p) {

          vec3 ld = normalize(LIGHT - p);
          return shadowRay(p + n*SURFACE_DIST, ld, length(LIGHT - p)-SURFACE_DIST);

      }

      float getShadingLD(vec3 n, vec3 p) {

          vec3 ld = normalize(LIGHT - p);
          return shadowRayLD(p + n, ld, length(LIGHT - p)-1.0);

      }

      // Main
      void mainImage( out vec4 fragColor, in vec2 fragCoord )
      {
          // Translate viewport. Mobile moves the artifact out of the text column.
          float mobile = step(iResolution.x, 760.0);
          vec2 center = mix(vec2(0.296, 0.29), vec2(0.735, 0.54), mobile);
          vec2 uv = (fragCoord/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvx1 = ((fragCoord-vec2(2., 0.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvx2 = ((fragCoord+vec2(2., 0.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvy1 = ((fragCoord-vec2(0., 2.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvy2 = ((fragCoord+vec2(0., 2.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);

          float viewportScale = mix(1.2, 1.85, mobile);
          uv *= viewportScale;
          uvx1 *= viewportScale;
          uvx2 *= viewportScale;
          uvy1 *= viewportScale;
          uvy2 *= viewportScale;

          // Animate camera and compute camera ray
          mat3 crot = rotAxis(vec3(0., 1., 0.), iTime * 0.15);
          vec3 r0 = vec3(0., 0., -40. + (sin(iTime * 0.25) * 0.5 + 0.5) * 15.);
          vec3 rd = normalize(vec3(uv, 1.));
          r0 = crot * r0;
          rd = normalize(crot * rd);

          vec3 rdx1 = normalize(crot * normalize(vec3(uvx1, 1.)));
          vec3 rdx2 = normalize(crot * normalize(vec3(uvx2, 1.)));
          vec3 rdy1 = normalize(crot * normalize(vec3(uvy1, 1.)));
          vec3 rdy2 = normalize(crot * normalize(vec3(uvy2, 1.)));

          // Render fragment
          float id = rayMarch(r0, rd);
          vec3 rp = r0 + rd * id;
          vec3 n = getNormal(rp);
          float shadow = getShading(n, rp);
          float light = getLight(n, rp) * shadow;
          if (id < (FAR_CLIP-(1e-6))) {
            fragColor = vec4(getClr(rp) * light, 1.0);
          }
          else {
              fragColor = vec4(0., 0., 0., 1.);
          }

          // Atmosphere
          vec2 rsi = raySphere(r0, rd, vec3(0., 0., 0.), 5.75);
          if (rsi.x > 0.) {
              rsi.y = min(rsi.y, id);
              vec3 rp2 = r0 + rd * (rsi.x+rsi.y) * 0.5;
              float ashadow = 0.35 + 0.65 * getShadingLD(n, rp2);
              float astr = max(rsi.y - rsi.x, 0.) / 11.5 * max(dot(normalize(LIGHT), normalize(rp2)), 0.0);
              fragColor.rgb += vec3(1., 1., 0.8) * ashadow * pow(astr, 2.0);
          }

      }

      void main() {
        mainImage(gl_FragColor, gl_FragCoord.xy);
        gl_FragColor.rgb *= smoothstep(0.0, 1.0, iIntro);
      }
    `;

    function createShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error || 'Unknown shader compile error.');
      }

      return shader;
    }

    function createProgram() {
      const program = gl.createProgram();
      const vert = createShader(gl.VERTEX_SHADER, vertexShader);
      const frag = createShader(gl.FRAGMENT_SHADER, fragmentShader);

      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(error || 'Unknown shader link error.');
      }

      return program;
    }

    let program;

    try {
      program = createProgram();
    } catch (error) {
      console.warn('Interest background failed.', error);
      throw error;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        3, -1,
        -1, 3,
      ]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    const resolutionLocation = gl.getUniformLocation(program, 'iResolution');
    const timeLocation = gl.getUniformLocation(program, 'iTime');
    const introLocation = gl.getUniformLocation(program, 'iIntro');
    let hasRevealed = false;
    let firstFrameAt = 0;
    let lastRenderAt = 0;

    function resize() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, renderPixelRatioCap);
      const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
      const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
    }

    function render(now) {
      if (!isCurrentCanvas(canvas)) return;

      if (lastRenderAt && now - lastRenderAt < renderFrameInterval) {
        window.requestAnimationFrame(render);
        return;
      }

      lastRenderAt = now;

      if (!firstFrameAt) {
        firstFrameAt = now;
      }

      resize();

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(resolutionLocation, canvas.width, canvas.height, 1);
      gl.uniform1f(timeLocation, (now * 0.001) * (reducedMotion ? 0.12 : 0.72));
      gl.uniform1f(introLocation, Math.min(1, Math.max(0, (now - firstFrameAt) / 900)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!hasRevealed) {
        hasRevealed = true;
        document.body.classList.add('is-gpu-ready');
      }

      window.requestAnimationFrame(render);
    }

    resize();
    window.addEventListener('resize', resize);
    window.requestAnimationFrame(render);
  }
      });
    }, 120);
  });
}

function scheduleInterestArtifact(callback) {
  const runCallback = () => {
    if (isCurrentCanvas(canvas)) {
      callback();
    }
  };
  const run = () => {
    if (!isCurrentCanvas(canvas)) return;

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runCallback, { timeout: 700 });
    } else {
      window.setTimeout(runCallback, 0);
    }
  };

  run();
}

async function initInterestTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  if (!isCurrentCanvas(titleCanvas)) return;

  const TITLE_PIXEL_RATIO_CAP = 1;
  const ctx = titleCanvas.getContext('2d');
  const particles = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sourcePoints = [];
  let startedAt = performance.now();
  let lastDrawAt = 0;
  let hasAnnouncedSettled = false;
  let resolveSettled;
  const settledPromise = new Promise((resolve) => {
    resolveSettled = resolve;
  });
  const settleDuration = 850;
  const activeFrameInterval = 1000 / 42;
  const settledFrameInterval = 1000 / 24;

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
      ? clamp(width * 0.135, 58, 84)
      : clamp(width * 0.072, 82, 118);
    const centerY = width < 768
      ? clamp(height * 0.2, 138, 178)
      : clamp(height * 0.19, 150, 190);
    const fontStack = '"Noto Sans JP", "Roobert", Helvetica, Arial, sans-serif';
    const points = [];

    source.width = width;
    source.height = height;
    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.fillStyle = '#fff';
    sourceCtx.font = `400 ${titleSize}px ${fontStack}`;
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';
    sourceCtx.fillText('interests', width * 0.5, centerY);

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

    return points;
  }

  function createParticles() {
    particles.length = 0;

    if (!sourcePoints.length) return;

    const count = Math.round(clamp(
      sourcePoints.length * (width < 768 ? 0.38 : 0.44),
      width < 768 ? 1200 : 2200,
      width < 768 ? 2600 : 4300,
    ));

    for (let index = 0; index < count; index += 1) {
      const point = sourcePoints[Math.floor(Math.random() * sourcePoints.length)];
      const x = randomBetween(width * 0.18, width * 0.82);
      const y = randomBetween(height * 0.34, height * 0.6);

      particles.push({
        x,
        y,
        targetX: point.x,
        targetY: point.y,
        targetAlpha: Math.max(0.58, point.alpha),
        alpha: 0,
        delay: Math.random() * 14,
        size: randomBetween(width < 768 ? 1.14 : 1.28, width < 768 ? 2.08 : 2.68),
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
    sourcePoints = createTitleSource();
    createParticles();
  }

  function announceSettled() {
    if (hasAnnouncedSettled) return;

    hasAnnouncedSettled = true;

    if (isCurrentCanvas(titleCanvas)) {
      titleCanvas.dispatchEvent(new CustomEvent(TITLE_SETTLED_EVENT, { bubbles: true }));
    }

    resolveSettled();
  }

  function draw(time) {
    if (!isCurrentCanvas(titleCanvas)) return;

    const elapsed = Math.max(0, time - startedAt);
    const motion = clamp(1 - elapsed / settleDuration, 0, 1);
    const frameInterval = motion > 0 ? activeFrameInterval : settledFrameInterval;

    if (elapsed >= settleDuration) {
      announceSettled();
    }

    if (time - lastDrawAt < frameInterval) {
      window.requestAnimationFrame(draw);
      return;
    }

    lastDrawAt = time;

    ctx.clearRect(0, 0, width, height);

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];

      if (particle.delay > 0) {
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
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
  window.setTimeout(announceSettled, settleDuration + 250);

  return settledPromise;
}
