const canvas = document.getElementById('gaussian-canvas');

if (canvas) {
  initRaymarchedBackground().catch((error) => {
    console.warn('Raymarched background failed; using CSS fallback.', error);
  });
}

async function initRaymarchedBackground() {
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pointer = new THREE.Vector2(0, 0);
  const smoothPointer = new THREE.Vector2(0, 0);
  const clock = new THREE.Clock();
  let frame = 0;

  const uniforms = {
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iTime: { value: 0 },
    iFrame: { value: 0 },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
  };

  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform vec3 iResolution;
      uniform float iTime;
      uniform int iFrame;
      uniform vec4 iMouse;

      #define ZERO min(iFrame, 0)
      const float pi = 3.14159265359;

      float hash1(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 r = mat2(0.82, -0.57, 0.57, 0.82);

        for (int i = 0; i < 5; i++) {
          v += noise(p) * a;
          p = r * p * 2.03 + 0.17;
          a *= 0.48;
        }

        return v;
      }

      float sdSphere(vec3 p, vec4 s) {
        return length(p - s.xyz) - s.w;
      }

      float sdEllipsoid(vec3 p, vec3 c, vec3 r) {
        return (length((p - c) / r) - 1.0) * min(min(r.x, r.y), r.z);
      }

      float sdTorus(vec3 p, vec2 t) {
        return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
      }

      float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
        vec3 pa = p - a;
        vec3 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h) - r;
      }

      float smin(float a, float b, float k) {
        float h = max(k - abs(a - b), 0.0);
        return min(a, b) - h * h * 0.25 / k;
      }

      float smax(float a, float b, float k) {
        float h = max(k - abs(a - b), 0.0);
        return max(a, b) + h * h * 0.25 / k;
      }

      mat2 rot(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, -s, s, c);
      }

      float mapShell(vec3 p, out vec4 matInfo) {
        p -= vec3(0.08, 0.07, -0.07);

        mat3 shellRot = mat3(
          -0.6333234, -0.7332753, 0.2474040,
           0.7738444, -0.6034162, 0.1924932,
           0.0081371,  0.3133626, 0.9495987
        );

        vec3 q = shellRot * p;
        const float b = 0.1759;

        float r = max(length(q.xy), 0.001);
        float t = atan(q.y, q.x);
        float np = (log(r) / b - t) / (2.0 * pi);
        float nm = (log(0.11) / b - t) / (2.0 * pi);
        float n = min(np, nm);
        float ni = floor(n);

        float r1 = exp(b * (t + 2.0 * pi * ni));
        float r2 = r1 * 3.019863;

        float h1 = q.z + 1.5 * r1 - 0.5;
        float h2 = q.z + 1.5 * r2 - 0.5;
        float d1 = sqrt((r1 - r) * (r1 - r) + h1 * h1) - r1;
        float d2 = sqrt((r2 - r) * (r2 - r) + h2 * h2) - r2;

        float d = d1;
        float dx = r1 - r;
        float dy = h1;
        if (d2 < d1) {
          d = d2;
          dx = r2 - r;
          dy = h2;
        }

        float shellNoise = fbm(vec2(t * 0.45 + r * 8.0, q.z * 2.0));
        d += 0.003 * shellNoise;
        matInfo = vec4(dx, dy, r / 0.4, t / pi);

        vec3 s = q;
        q -= vec3(0.34, -0.1, 0.03);
        q.xy = rot(-0.64) * q.xy;
        d = smin(d, sdTorus(q, vec2(0.28, 0.05)), 0.06);
        d = smax(d, -sdEllipsoid(q, vec3(0.0), vec3(0.24, 0.36, 0.24)), 0.03);
        d = smax(d, -sdEllipsoid(s, vec3(0.52, 0.0, 0.0), vec3(0.42, 0.23, 0.5)), 0.05);

        return d;
      }

      float mapLeaf(vec3 p) {
        p -= vec3(-1.55, 0.46, -0.62);
        p = mat3(
           0.671212, 0.366685, -0.644218,
          -0.479426, 0.877583,  0.000000,
           0.565354, 0.308854,  0.764842
        ) * p;

        p.y += 0.2 * exp2(-abs(2.9 * p.z));

        float ph = 12.5 * p.x - 18.75 * abs(p.z);
        float veins = sin(ph);
        veins *= veins;
        veins *= veins;
        p.y += 0.004 * veins;

        float r = clamp((p.x + 2.0) / 4.0, 0.0, 1.0);
        r = 0.0001 + r * (1.0 - r) * (1.0 - r) * 6.0;

        float fine = sin(ph * 2.0);
        fine *= fine;
        fine *= 0.5 + 0.5 * sin(p.x * 12.0);

        float d = sdEllipsoid(p, vec3(0.0), vec3(2.0, 0.25 * r, r + 0.035 * fine));
        return smax(d, -(p.y - 0.02), 0.02);
      }

      float mapDrop(vec3 p) {
        p -= vec3(-0.24, 0.23, -0.02);
        p.x -= 2.5 * p.y * p.y;
        return sdCapsule(p, vec3(0.0, -0.06, 0.0), vec3(0.014, 0.06, 0.0), 0.037);
      }

      vec2 mapScene(vec3 p, out vec4 matInfo) {
        matInfo = vec4(0.0);
        float d = mapLeaf(p);
        float materialId = 4.0;

        vec4 shellInfo;
        float shell = mapShell(p, shellInfo);
        if (shell < d) {
          d = shell;
          materialId = 2.0;
          matInfo = shellInfo;
        }

        vec3 bp = p - vec3(-0.22, 0.02, 0.02);
        float body = sdCapsule(bp, vec3(-0.52, -0.34, 0.0), vec3(-0.14, 0.46, 0.0), 0.09);
        body = smin(body, sdSphere(p, vec4(-0.76, 0.52, -0.25, 0.11)), 0.07);
        if (body < d) {
          d = body;
          materialId = 1.0;
        }

        float drop = mapDrop(p);
        if (drop < d) {
          d = drop;
          materialId = 5.0;
        }

        return vec2(d, materialId);
      }

      vec3 calcNormal(vec3 p) {
        vec4 info;
        vec2 e = vec2(0.0018, 0.0);
        return normalize(vec3(
          mapScene(p + e.xyy, info).x - mapScene(p - e.xyy, info).x,
          mapScene(p + e.yxy, info).x - mapScene(p - e.yxy, info).x,
          mapScene(p + e.yyx, info).x - mapScene(p - e.yyx, info).x
        ));
      }

      float calcAO(vec3 p, vec3 n) {
        vec4 info;
        float occ = 0.0;
        float sca = 1.0;

        for (int i = 0; i < 5; i++) {
          float h = 0.015 + 0.055 * float(i);
          float d = mapScene(p + n * h, info).x;
          occ += (h - d) * sca;
          sca *= 0.65;
        }

        return clamp(1.0 - 2.6 * occ, 0.0, 1.0);
      }

      float softShadow(vec3 ro, vec3 rd) {
        vec4 info;
        float result = 1.0;
        float t = 0.02;

        for (int i = 0; i < 36; i++) {
          float h = mapScene(ro + rd * t, info).x;
          result = min(result, smoothstep(0.0, 1.0, 18.0 * h / t));
          t += clamp(h, 0.025, 0.11);
          if (result < 0.02 || t > 3.6) break;
        }

        return clamp(result, 0.0, 1.0);
      }

      vec2 intersectScene(vec3 ro, vec3 rd, out vec4 matInfo) {
        float t = 0.9;
        float materialId = -1.0;

        for (int i = 0; i < 96; i++) {
          vec3 p = ro + rd * t;
          vec2 h = mapScene(p, matInfo);
          materialId = h.y;
          if (h.x < 0.0015 * t || t > 4.3) break;
          t += h.x * 0.86;
        }

        if (t > 4.3) materialId = -1.0;
        return vec2(t, materialId);
      }

      vec3 materialColor(float materialId, vec3 p, vec3 n, vec4 matInfo) {
        if (materialId < 1.5) {
          float speckle = fbm(p.xy * 16.0);
          return mix(vec3(0.95, 0.42, 0.16), vec3(1.0, 0.73, 0.34), speckle) * 0.42;
        }

        if (materialId < 2.5) {
          float stripes = 0.5 + 0.5 * sin(38.0 * matInfo.w + 9.0 * sin(11.0 * matInfo.z));
          vec3 base = mix(vec3(0.18, 0.015, 0.0), vec3(0.88, 0.28, 0.06), stripes);
          return mix(base, vec3(1.0, 0.76, 0.28), smoothstep(0.18, 0.65, matInfo.z)) * 0.6;
        }

        if (materialId < 4.5) {
          float veins = fbm(p.xz * 8.0);
          return mix(vec3(0.09, 0.08, 0.015), vec3(0.42, 0.18, 0.02), veins) * 0.5;
        }

        return vec3(0.84, 0.95, 1.0);
      }

      mat3 setCamera(vec3 ro, vec3 rt) {
        vec3 cw = normalize(rt - ro);
        vec3 cp = vec3(0.0, 1.0, 0.0);
        vec3 cu = normalize(cross(cw, cp));
        vec3 cv = normalize(cross(cu, cw));
        return mat3(cu, cv, cw);
      }

      vec3 background(vec3 rd, vec2 q) {
        vec2 p = q - 0.5;
        p.x *= iResolution.x / iResolution.y;

        vec2 mouse = (iMouse.xy / max(iResolution.xy, vec2(1.0)) - 0.5) * vec2(1.4, 0.9);
        float wake = exp(-dot(p - mouse, p - mouse) * 7.0) * smoothstep(0.001, 0.45, length(iMouse.zw));
        float glowA = exp(-dot((p - vec2(-0.36, 0.18)) / vec2(0.42, 0.23), (p - vec2(-0.36, 0.18)) / vec2(0.42, 0.23)));
        float glowB = exp(-dot((p - vec2(0.28, -0.18)) / vec2(0.52, 0.22), (p - vec2(0.28, -0.18)) / vec2(0.52, 0.22)));
        float grain = hash21(gl_FragCoord.xy + floor(iTime * 22.0));

        vec3 col = vec3(0.003);
        col += vec3(0.42, 0.02, 0.0) * glowB * 0.22;
        col += vec3(0.93, 0.48, 0.12) * glowA * 0.14;
        col += vec3(1.0, 0.68, 0.26) * wake * 0.12;
        col += (grain - 0.5) * 0.045;
        return max(col, vec3(0.0));
      }

      vec3 render(vec3 ro, vec3 rd, vec2 q) {
        vec3 col = background(rd, q);
        vec4 matInfo;
        vec2 hit = intersectScene(ro, rd, matInfo);

        if (hit.y > 0.0) {
          vec3 pos = ro + rd * hit.x;
          vec3 nor = calcNormal(pos);
          vec3 sunDir = normalize(vec3(0.22, 0.52, 0.36));
          vec3 halfDir = normalize(sunDir - rd);
          float ao = calcAO(pos, nor);
          float shadow = softShadow(pos + nor * 0.012, sunDir);
          float dif = clamp(dot(nor, sunDir), 0.0, 1.0) * shadow;
          float rim = pow(clamp(1.0 + dot(nor, rd), 0.0, 1.0), 2.2);
          float spe = pow(clamp(dot(nor, halfDir), 0.0, 1.0), hit.y > 4.5 ? 90.0 : 38.0);
          vec3 mate = materialColor(hit.y, pos, nor, matInfo);

          vec3 lit = mate * (0.11 + 1.7 * dif * vec3(1.0, 0.58, 0.28));
          lit += mate * vec3(0.7, 0.08, 0.02) * rim * 0.55;
          lit += vec3(1.0, 0.83, 0.48) * spe * (hit.y > 4.5 ? 1.4 : 0.35);
          lit *= ao;

          col = mix(col, lit, 0.62);
        }

        vec2 p = q - 0.5;
        p.x *= iResolution.x / iResolution.y;
        float titlePocket = exp(-dot((p - vec2(0.0, 0.02)) / vec2(0.44, 0.13), (p - vec2(0.0, 0.02)) / vec2(0.44, 0.13)));
        float vignette = pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.12);
        col *= 0.22 + 0.78 * vignette;
        col *= 1.0 - titlePocket * 0.72;
        col = pow(max(col, vec3(0.0)), vec3(0.62));
        return clamp(col, 0.0, 1.0);
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 q = fragCoord / iResolution.xy;
        vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
        p = p * 1.42 + vec2(-0.16, 0.08);
        vec2 mouse = iMouse.xy / max(iResolution.xy, vec2(1.0)) - 0.5;

        float an = 1.87 - 0.04 * (1.0 - cos(0.5 * iTime)) + mouse.x * 0.14;
        vec3 ro = vec3(-0.42, 0.22 + mouse.y * 0.1, 0.0) + 2.55 * vec3(cos(an), 0.0, sin(an));
        vec3 ta = vec3(-0.48, 0.18, 0.0);
        mat3 ca = setCamera(ro, ta);
        vec3 rd = normalize(ca * vec3(p, 3.25));

        vec3 col = render(ro, rd, q);
        fragColor = vec4(col, 1.0);
      }

      void main() {
        mainImage(gl_FragColor, gl_FragCoord.xy);
      }
    `,
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function onPointerMove(event) {
    pointer.set(event.clientX, window.innerHeight - event.clientY);
  }

  function onPointerLeave() {
    pointer.set(0, 0);
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.iResolution.value.set(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio,
      pixelRatio,
    );
  }

  function animate() {
    smoothPointer.lerp(pointer, 0.08);
    uniforms.iTime.value = clock.getElapsedTime();
    uniforms.iFrame.value = frame;
    uniforms.iMouse.value.set(
      smoothPointer.x * renderer.getPixelRatio(),
      smoothPointer.y * renderer.getPixelRatio(),
      pointer.x,
      pointer.y,
    );

    renderer.render(scene, camera);
    frame += 1;
    window.requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave);
  document.documentElement.classList.add('shader-ready');
  window.requestAnimationFrame(animate);
}
