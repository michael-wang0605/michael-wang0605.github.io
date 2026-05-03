const canvas = document.getElementById('interest-shader-canvas');
const titleCanvas = document.getElementById('interest-title-canvas');

if (titleCanvas) {
  initInterestTitle().catch((error) => {
    console.warn('Interest title animation failed.', error);
  });
}

if (canvas) {
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
      #define MAX_ITERATIONS 144
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
      #define SHADOW_ITERATIONS 18
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
          // Translate viewport
          vec2 center = vec2(0.296, 0.29);
          vec2 uv = (fragCoord/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvx1 = ((fragCoord-vec2(2., 0.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvx2 = ((fragCoord+vec2(2., 0.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvy1 = ((fragCoord-vec2(0., 2.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);
          vec2 uvy2 = ((fragCoord+vec2(0., 2.))/iResolution.xy - center) * vec2(1., iResolution.y / iResolution.x);

          uv *= 1.2;
          uvx1 *= 1.2;
          uvx2 *= 1.2;
          uvy1 *= 1.2;
          uvy2 *= 1.2;

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

    function resize() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 0.92);
      const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
      const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
    }

    function render(now) {
      resize();

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(resolutionLocation, canvas.width, canvas.height, 1);
      gl.uniform1f(timeLocation, (now * 0.001) * (reducedMotion ? 0.12 : 0.72));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      window.requestAnimationFrame(render);
    }

    resize();
    window.addEventListener('resize', resize);
    window.requestAnimationFrame(render);
  }
}

async function initInterestTitle() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => {
      window.setTimeout(resolve, 1200);
    }),
  ]);

  const TITLE_PIXEL_RATIO_CAP = 1.35;
  const ctx = titleCanvas.getContext('2d');
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
    const sampleGap = 1;

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
    const count = Math.round(clamp(
      sourcePoints.length * (width < 768 ? 0.52 : 0.66),
      width < 768 ? 1800 : 3600,
      width < 768 ? 4300 : 8400,
    ));

    particles.length = 0;

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
        delay: Math.random() * 32,
        size: randomBetween(width < 768 ? 1.0 : 1.12, width < 768 ? 1.75 : 2.2),
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
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
}
