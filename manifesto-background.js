(() => {
  const canvas = document.getElementById('manifesto-canvas');

  if (!canvas) {
    return;
  }

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    console.warn('Manifesto shader failed: WebGL is unavailable.');
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionScale = reducedMotion ? 0.08 : 0.28;
  const mouse = [0, 0, 0, 0];

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
    uniform vec4 iMouse;

    #define INVERTMOUSE -1.

    #define MAX_STEPS 48.
    #define VOLUME_STEPS 4.
    #define MIN_DISTANCE 0.1
    #define MAX_DISTANCE 100.
    #define HIT_DISTANCE .01

    #define S(x,y,z) smoothstep(x,y,z)
    #define B(x,y,z,w) S(x-z, x+z, w)*S(y+z, y-z, w)
    #define sat(x) clamp(x,0.,1.)
    #define SIN(x) sin(x)*.5+.5

    const vec3 lf=vec3(1., 0., 0.);
    const vec3 up=vec3(0., 1., 0.);
    const vec3 fw=vec3(0., 0., 1.);

    const float halfpi = 1.570796326794896619;
    const float pi = 3.141592653589793238;
    const float twopi = 6.283185307179586;

    vec3 accentColor1 = vec3(.82);
    vec3 secondColor1 = vec3(.018);

    vec3 accentColor2 = vec3(1.);
    vec3 secondColor2 = vec3(.12);

    vec3 bg;
    vec3 accent;

    float N1( float x ) { return fract(sin(x)*5346.1764); }
    float N2(float x, float y) { return N1(x + y*23414.324); }

    float N3(vec3 p) {
      p  = fract( p*0.3183099+.1 );
      p *= 17.0;
      return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
    }

    struct ray {
      vec3 o;
      vec3 d;
    };

    struct camera {
      vec3 p;
      vec3 forward;
      vec3 left;
      vec3 up;
      vec3 center;
      vec3 i;
      ray ray;
      vec3 lookAt;
      float zoom;
    };

    struct de {
      float d;
      float m;
      vec3 uv;
      float pump;
      vec3 id;
      vec3 pos;
    };

    struct rc {
      vec3 id;
      vec3 h;
      vec3 p;
    };

    rc Repeat(vec3 pos, vec3 size) {
      rc o;
      o.h = size*.5;
      o.id = floor(pos/size);
      o.p = mod(pos, size)-o.h;

      return o;
    }

    camera cam;

    void CameraSetup(vec2 uv, vec3 position, vec3 lookAt, float zoom) {
      cam.p = position;
      cam.lookAt = lookAt;
      cam.forward = normalize(cam.lookAt-cam.p);
      cam.left = cross(up, cam.forward);
      cam.up = cross(cam.forward, cam.left);
      cam.zoom = zoom;

      cam.center = cam.p+cam.forward*cam.zoom;
      cam.i = cam.center+cam.left*uv.x+cam.up*uv.y;

      cam.ray.o = cam.p;
      cam.ray.d = normalize(cam.i-cam.p);
    }

    vec3 N31(float p) {
      vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
      p3 += dot(p3, p3.yzx + 19.19);
      return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
    }

    float smin( float a, float b, float k )
    {
      float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
      return mix( b, a, h ) - k*h*(1.0-h);
    }

    float smax( float a, float b, float k )
    {
      float h = clamp( 0.5 + 0.5*(b-a)/k, 0.0, 1.0 );
      return mix( a, b, h ) + k*h*(1.0-h);
    }

    float sdSphere( vec3 p, vec3 pos, float s ) { return (length(p-pos)-s); }

    vec2 pModPolar(inout vec2 p, float repetitions, float fix) {
      float angle = twopi/repetitions;
      float a = atan(p.y, p.x) + angle/2.;
      float r = length(p);
      float c = floor(a/angle);
      a = mod(a,angle) - (angle/2.)*fix;
      p = vec2(cos(a), sin(a))*r;

      return p;
    }

    float Dist( vec2 P,  vec2 P0, vec2 P1 ) {
      vec2 v = P1 - P0;
      vec2 w = P - P0;

      float c1 = dot(w, v);
      float c2 = dot(v, v);

      if (c1 <= 0. ) {
        return length(P-P0);
      }

      float b = c1 / c2;
      vec2 Pb = P0 + b*v;
      return length(P-Pb);
    }

    vec3 ClosestPoint(vec3 ro, vec3 rd, vec3 p) {
      return ro + max(0., dot(p-ro, rd))*rd;
    }

    vec2 RayRayTs(vec3 ro1, vec3 rd1, vec3 ro2, vec3 rd2) {
      vec3 dO = ro2-ro1;
      vec3 cD = cross(rd1, rd2);
      float v = dot(cD, cD);

      float t1 = dot(cross(dO, rd2), cD)/v;
      float t2 = dot(cross(dO, rd1), cD)/v;
      return vec2(t1, t2);
    }

    float DistRaySegment(vec3 ro, vec3 rd, vec3 p1, vec3 p2) {
      vec3 rd2 = p2-p1;
      vec2 t = RayRayTs(ro, rd, p1, rd2);

      t.x = max(t.x, 0.);
      t.y = clamp(t.y, 0., length(rd2));

      vec3 rp = ro+rd*t.x;
      vec3 sp = p1+rd2*t.y;

      return length(rp-sp);
    }

    vec2 sph(vec3 ro, vec3 rd, vec3 pos, float radius) {
      vec3 oc = pos - ro;
      float l = dot(rd, oc);
      float det = l*l - dot(oc, oc) + radius*radius;
      if (det < 0.0) return vec2(MAX_DISTANCE);

      float d = sqrt(det);
      float a = l - d;
      float b = l + d;

      return vec2(a, b);
    }

    vec3 background(vec3 r) {
      float x = atan(r.x, r.z);
      float y = pi*0.5-acos(r.y);

      vec3 col = bg*(1.15+y*.35);

      float t = iTime;

      float a = sin(r.x);

      float beam = sat(sin(10.*x+a*y*5.+t));
      beam *= sat(sin(7.*x+a*y*3.5-t));

      float beam2 = sat(sin(42.*x+a*y*21.-t));
      beam2 *= sat(sin(34.*x+a*y*17.+t));

      beam += beam2;
      col *= 1.+beam*.05;

      return col;
    }

    float remap(float a, float b, float c, float d, float t) {
      return ((t-a)/(b-a))*(d-c)+c;
    }

    de map( vec3 p, vec3 id ) {
      float t = iTime*2.;

      float N = N3(id);

      de o;
      o.m = 0.;

      float x = (p.y+N*twopi)*1.+t;
      float r = 1.;

      float pump = cos(x+cos(x))+sin(2.*x)*.2+sin(4.*x)*.02;

      x = t + N*twopi;
      p.y -= (cos(x+cos(x))+sin(2.*x)*.2)*.6;
      p.xz *= 1. + pump*.2;

      float d1 = sdSphere(p, vec3(0., 0., 0.), r);
      float d2 = sdSphere(p, vec3(0., -.5, 0.), r);

      o.d = smax(d1, -d2, .1);
      o.m = 1.;

      if(p.y<.5) {
        float sway = sin(t+p.y+N*twopi)*S(.5, -3., p.y)*N*.3;
        p.x += sway*N;
        p.z += sway*(1.-N);

        vec3 mp = p;
        mp.xz = pModPolar(mp.xz, 6., 0.);

        float d3 = length(mp.xz-vec2(.2, .1))-remap(.5, -3.5, .1, .01, mp.y);
        if(d3<o.d) o.m=2.;
        d3 += (sin(mp.y*10.)+sin(mp.y*23.))*.03;

        float d32 = length(mp.xz-vec2(.2, .1))-remap(.5, -3.5, .1, .04, mp.y)*.5;
        d3 = min(d3, d32);
        o.d = smin(o.d, d3, .5);

        if( p.y<.2) {
          vec3 op = p;
          op.xz = pModPolar(op.xz, 13., 1.);

          float d4 = length(op.xz-vec2(.85, .0))-remap(.5, -3., .04, .0, op.y);
          if(d4<o.d) o.m=3.;
          o.d = smin(o.d, d4, .15);
        }
      }
      o.pump = pump;
      o.uv = p;

      o.d *= .8;
      return o;
    }

    vec3 calcNormal( de o ) {
      vec3 eps = vec3( 0.01, 0.0, 0.0 );
      vec3 nor = vec3(
        map(o.pos+eps.xyy, o.id).d - map(o.pos-eps.xyy, o.id).d,
        map(o.pos+eps.yxy, o.id).d - map(o.pos-eps.yxy, o.id).d,
        map(o.pos+eps.yyx, o.id).d - map(o.pos-eps.yyx, o.id).d );
      return normalize(nor);
    }

    de CastRay(ray r) {
      float d = 0.;
      float dS = MAX_DISTANCE;

      vec3 pos = vec3(0., 0., 0.);
      vec3 n = vec3(0.);
      de o, s;
      o.d = MAX_DISTANCE;
      o.m = 0.;
      o.id = vec3(0.);
      o.uv = vec3(0.);
      o.pump = 0.;
      o.pos = vec3(0.);
      s.d = MAX_DISTANCE;
      s.m = 0.;

      float dC = MAX_DISTANCE;
      vec3 p;
      rc q;
      q.id = vec3(0.);
      q.h = vec3(0.);
      q.p = vec3(0.);
      float t = iTime;
      vec3 grid = vec3(6., 30., 6.);

      for(float i=0.; i<MAX_STEPS; i++) {
        p = r.o + r.d*d;

        p.y -= t;
        p.x += t;

        q = Repeat(p, grid);

        vec3 rC = ((2.*step(0., r.d)-1.)*q.h-q.p)/r.d;
        dC = min(min(rC.x, rC.y), rC.z)+.01;

        float N = N3(q.id);
        q.p += (N31(N)-.5)*grid*vec3(.5, .7, .5);

        if(Dist(q.p.xz, r.d.xz, vec2(0.))<1.1) {
          s = map(q.p, q.id);
        } else {
          s.d = dC;
          s.m = 0.;
        }

        if(s.d<HIT_DISTANCE || d>MAX_DISTANCE) break;
        d+=min(s.d, dC);
      }

      if(s.d<HIT_DISTANCE) {
        o.m = s.m;
        o.d = d;
        o.id = q.id;
        o.uv = s.uv;
        o.pump = s.pump;
        o.pos = q.p;
      }

      return o;
    }

    float VolTex(vec3 uv, vec3 p, float scale, float pump) {
      p.y *= scale;

      float s2 = 5.*p.x/twopi;
      float id = floor(s2);
      s2 = fract(s2);
      vec2 ep = vec2(s2-.5, p.y-.6);
      float ed = length(ep);
      float e = B(.35, .45, .05, ed);

      float s = SIN(s2*twopi*15. );
      s = s*s; s = s*s;
      s *= S(1.4, -.3, uv.y-cos(s2*twopi)*.2+.3)*S(-.6, -.3, uv.y);

      float t = iTime*5.;
      float mask = SIN(p.x*twopi*2. + t);
      s *= mask*mask*2.;

      return s+e*pump*2.;
    }

    vec4 JellyTex(vec3 p) {
      vec3 s = vec3(atan(p.x, p.z), length(p.xz), p.y);

      float b = .75+sin(s.x*6.)*.25;
      b = mix(1., b, s.y*s.y);

      p.x += sin(s.z*10.)*.1;
      float b2 = cos(s.x*26.) - s.z-.7;

      b2 = S(.1, .6, b2);
      return vec4(b+b2);
    }

    vec3 render( vec2 uv, ray camRay, float depth ) {
      bg = background(cam.ray.d);

      vec3 col = bg;
      de o = CastRay(camRay);

      vec3 L = up;

      if(o.m>0.) {
        vec3 n = calcNormal(o);
        float lambert = sat(dot(n, L));
        vec3 R = reflect(camRay.d, n);
        float fresnel = sat(1.+dot(camRay.d, n));
        float trans = (1.-fresnel)*.5;
        vec3 ref = background(R);
        float fade = 0.;

        if(o.m==1.) {
          float density = 0.;
          for(float i=0.; i<VOLUME_STEPS; i++) {
            float sd = sph(o.uv, camRay.d, vec3(0.), .8+i*.015).x;
            if(sd!=MAX_DISTANCE) {
              vec2 intersect = o.uv.xz+camRay.d.xz*sd;

              vec3 uv = vec3(atan(intersect.x, intersect.y), length(intersect.xy), o.uv.z);
              density += VolTex(o.uv, uv, 1.4+i*.03, o.pump);
            }
          }
          vec4 volTex = vec4(accent, density/VOLUME_STEPS);

          vec3 dif = JellyTex(o.uv).rgb;
          dif *= max(.2, lambert);

          col = mix(col, volTex.rgb, volTex.a);
          col = mix(col, vec3(dif), .25);

          col += fresnel*ref*sat(dot(up, n));

          fade = max(fade, S(.0, 1., fresnel));
        } else if(o.m==2.) {
          vec3 dif = accent;
          col = mix(bg, dif, fresnel);

          col *= mix(.6, 1., S(0., -1.5, o.uv.y));

          float prop = o.pump+.25;
          prop *= prop*prop;
          col += pow(1.-fresnel, 20.)*dif*prop;

          fade = fresnel;
        } else if(o.m==3.) {
          vec3 dif = accent;
          float d = S(100., 13., o.d);
          col = mix(bg, dif, pow(1.-fresnel, 5.)*d);
        }

        fade = max(fade, S(0., 100., o.d));
        col = mix(col, bg, fade);

        if(o.m==4.) {
          col = vec3(1., 0., 0.);
        }
      } else {
        col = bg;
      }

      return col;
    }

    void mainImage( out vec4 fragColor, in vec2 fragCoord )
    {
      float t = iTime*.04;

      vec2 uv = (fragCoord.xy / iResolution.xy);
      uv -= .5;
      uv.y *= iResolution.y/iResolution.x;

      vec2 m = iMouse.xy/iResolution.xy;

      if(m.x<0.05 || m.x>.95) {
        m = vec2(t*.25, SIN(t*pi)*.5+.5);
      }

      accent = mix(accentColor1, accentColor2, SIN(t*15.456));
      bg = mix(secondColor1, secondColor2, SIN(t*7.345231));

      float turn = (.1-m.x)*twopi;
      float s = sin(turn);
      float c = cos(turn);
      mat3 rotX = mat3(c,  0., s, 0., 1., 0., s,  0., -c);

      float camDist = -.1;

      vec3 lookAt = vec3(0., -1., 0.);

      vec3 camPos = vec3(0., INVERTMOUSE*camDist*cos((m.y)*pi), camDist)*rotX;

      CameraSetup(uv, camPos+lookAt, lookAt, 1.);

      vec3 col = render(uv, cam.ray, 0.);
      if (col.x != col.x || col.y != col.y || col.z != col.z) {
        col = vec3(0.0);
      }
      col = clamp(col, 0.0, 1.0);
      float veil = pow(SIN(uv.x*24.0 + uv.y*9.0 + iTime*.42), 6.0);
      veil += pow(SIN(uv.x*11.0 - uv.y*17.0 - iTime*.27), 8.0)*.7;
      veil *= smoothstep(.92, .08, length(uv*vec2(.82, 1.22)));
      col += vec3(.045 + veil*.105);

      col = pow(clamp(col * 1.9, 0.0, 1.0), vec3(mix(.82, 1.25, SIN(t+pi))));
      float d = 1.-dot(uv, uv);
      col *= (d*d*d)+.1;

      fragColor = vec4(col, 1.);
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
    console.warn('Manifesto shader failed.', error);
    return;
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
  const mouseLocation = gl.getUniformLocation(program, 'iMouse');

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
    const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
  }

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = canvas.width / Math.max(rect.width, 1);
    mouse[0] = (event.clientX - rect.left) * pixelRatio;
    mouse[1] = (rect.bottom - event.clientY) * pixelRatio;
    mouse[2] = mouse[0];
    mouse[3] = mouse[1];
  }

  function render(now) {
    resize();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(resolutionLocation, canvas.width, canvas.height, 1);
    gl.uniform1f(timeLocation, 14 + (now * 0.001) * motionScale);
    gl.uniform4f(mouseLocation, mouse[0], mouse[1], mouse[2], mouse[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    window.requestAnimationFrame(render);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', updateMouse, { passive: true });
  window.requestAnimationFrame(render);
})();
