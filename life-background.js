const lifeCanvas = document.getElementById('life-canvas');

if (lifeCanvas) {
  initLifeBackground().catch((error) => {
    console.warn('Life WebGL background failed.', error);
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
  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1500);
  const clock = new THREE.Clock();
  const scroll = { target: 0, current: 0 };
  const lifeEvents = Array.from(document.querySelectorAll('.life-event')).map((element) => ({
    element,
    progress: Number(element.dataset.progress || 0),
  }));

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let galaxy = null;
  let timelineLine = null;
  let timelineMarkers = null;
  let timelineData = [];
  let markerData = [];
  const galaxyAnchor = new THREE.Vector3(0, 0, 0);
  const galaxyScreenAnchor = new THREE.Vector2(0, 0);
  let scanTime = 0;
  let destroyTime = 0;

  const galaxyMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      size: { value: 3.3 },
      t: { value: 0 },
      z: { value: 0 },
      pixelRatio: { value: 1 },
    },
    vertexShader: `
      uniform float size;
      uniform float t;
      uniform float z;
      uniform float pixelRatio;

      varying vec3 vPosition;
      varying vec3 mPosition;
      varying float gas;

      void main() {
        vPosition = position;

        float a = length(position);
        float b = 0.0;

        if (t > 0.0) {
          b = max(0.0, (cos(a / 20.0 - t * 0.02) - 0.99) * 3.0 / a);
        }

        if (z > 0.0) {
          b = max(0.0, cos(a / 40.0 - z * 0.01 + 2.0));
        }

        mPosition = position * (1.0 + b * 4.0);

        vec4 mvPosition = modelViewMatrix * vec4(mPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        gas = max(0.0, sin(-a / 20.0));
        gl_PointSize = pixelRatio * size * (1.0 + gas * 2.0) / length(mvPosition.xyz);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float z;

      varying vec3 vPosition;
      varying vec3 mPosition;
      varying float gas;

      void main() {
        float a = distance(mPosition, vPosition);
        if (a > 0.0) {
          a = 1.0;
        }

        float c = distance(gl_PointCoord, vec2(0.5));
        float starlook = -(c - 0.5) * 1.2 * gas;
        float gaslook = (1.0 - gas) / max(c * 10.0, 0.001);
        float texture = starlook + gaslook;

        gl_FragColor = vec4(vec3(1.0), 1.0) * texture * 0.72 * (1.0 - a * 0.35);

        if (z > 0.0) {
          gl_FragColor *= cos(1.57 * z / 322.0) * (1.0 - 0.001 * length(mPosition));
        }
      }
    `,
  });
  const timelineLineMaterial = galaxyMaterial.clone();
  const timelineMarkerMaterial = galaxyMaterial.clone();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function updateScrollTarget() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scroll.target = clamp(window.scrollY / maxScroll, 0, 1);
  }

  function createGalaxyPositions(count = 10000, axis1 = 72, axis2 = 112, armsAngle = 12, bulbSize = 0.34, ellipticity = 0.32) {
    const positions = new Float32Array(count * 3);
    const majorAxis = Math.max(axis1, axis2);
    const minorAxis = Math.min(axis1, axis2);

    for (let index = 0; index < count; index += 1) {
      const dist = Math.random();
      const angleOffset = (dist - bulbSize) * armsAngle;
      const a = majorAxis * dist;
      const b = minorAxis * dist;
      const eccentricity = a === 0 ? 0 : Math.sqrt(Math.max(a * a - b * b, 0)) / a;
      const phi = ellipticity * Math.PI * 0.5 * (1 - dist) * (Math.random() * 2 - 1);

      let theta = Math.random() * Math.PI * 2;
      const radius =
        Math.sqrt((b * b) / Math.max(1 - eccentricity * eccentricity * Math.pow(Math.cos(theta), 2), 0.0001)) *
        (1 + Math.random() * 0.1);

      if (dist > bulbSize) {
        theta += angleOffset;
      }

      const vertexIndex = index * 3;
      positions[vertexIndex] = Math.cos(phi) * Math.cos(theta) * radius;
      positions[vertexIndex + 1] = Math.cos(phi) * Math.sin(theta) * radius;
      positions[vertexIndex + 2] = Math.sin(phi) * radius;
    }

    return positions;
  }

  function setGalaxy() {
    const count = width < 700 ? 9000 : 14000;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(createGalaxyPositions(count), 3));

    galaxy = new THREE.Points(geometry, galaxyMaterial);
    galaxy.rotation.x = -0.18;
    galaxy.rotation.z = -0.08;
    scene.add(galaxy);
  }

  function screenToWorldOnGalaxyPlane(screenX, screenY, target = new THREE.Vector3()) {
    const vector = new THREE.Vector3((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1, 0.5);
    vector.unproject(camera);
    const direction = vector.sub(camera.position).normalize();
    const distance = -camera.position.z / direction.z;
    return target.copy(camera.position).add(direction.multiplyScalar(distance));
  }

  function updateGalaxyAnchor() {
    const x = width * 0.5;
    const y = width < 700 ? height * 0.72 : height * 0.76;
    galaxyScreenAnchor.set(x, y);
    galaxyAnchor.copy(screenToWorldOnGalaxyPlane(x, y));
  }

  function createTimelineStream() {
    [timelineLine, timelineMarkers].forEach((points) => {
      if (points) {
        scene.remove(points);
        points.geometry.dispose();
      }
    });

    timelineLine = null;
    timelineMarkers = null;

    const lineCount = width < 700 ? 900 : 1500;
    const markerCount = lifeEvents.length * (width < 700 ? 115 : 165);
    const linePositions = new Float32Array(lineCount * 3);
    const markerPositions = new Float32Array(markerCount * 3);

    timelineData = [];
    markerData = [];

    for (let index = 0; index < lineCount; index += 1) {
      const t = Math.random();
      const neck = Math.pow(Math.sin(t * Math.PI), 0.9);
      const spread = (Math.random() ** 2.2) * (width < 700 ? 9 : 14);
      timelineData.push({
        t,
        offsetX: (Math.random() * 2 - 1) * spread * (0.35 + neck),
        offsetY: (Math.random() * 2 - 1) * (width < 700 ? 5 : 8),
        phase: Math.random() * Math.PI * 2,
      });
    }

    lifeEvents.forEach((event, eventIndex) => {
      const pointsPerMarker = markerCount / Math.max(lifeEvents.length, 1);

      for (let pointIndex = 0; pointIndex < pointsPerMarker; pointIndex += 1) {
        const dist = Math.pow(Math.random(), 1.85);
        const angle = Math.random() * Math.PI * 2;
        const radius = (width < 700 ? 8 : 18) * dist;
        const ray = Math.random() < 0.22 ? (width < 700 ? 9 : 26) * Math.pow(Math.random(), 0.7) : 0;

        markerData.push({
          progress: event.progress,
          eventIndex,
          offsetX: Math.cos(angle) * radius + (Math.random() < 0.5 ? -ray : ray),
          offsetY: Math.sin(angle) * radius * 0.72,
          phase: Math.random() * Math.PI * 2,
        });
      }
    });

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    const markerGeometry = new THREE.BufferGeometry();
    markerGeometry.setAttribute('position', new THREE.BufferAttribute(markerPositions, 3));

    timelineLine = new THREE.Points(lineGeometry, timelineLineMaterial);
    timelineMarkers = new THREE.Points(markerGeometry, timelineMarkerMaterial);
    timelineLine.frustumCulled = false;
    timelineMarkers.frustumCulled = false;
    scene.add(timelineLine, timelineMarkers);
    updateTimelineStream(0);
  }

  function getTimelineBounds() {
    const top = width < 700 ? height * 0.25 : height * 0.13;
    const bottom = galaxyScreenAnchor.y - (width < 700 ? 170 : 220);
    const travel = height * (width < 700 ? 0.045 : 0.055);
    return { top, bottom, travel };
  }

  function getTimelineY(progress) {
    const bounds = getTimelineBounds();
    return bounds.top + (bounds.bottom - bounds.top) * progress + (0.5 - scroll.current) * bounds.travel;
  }

  function updateTimelineStream(time) {
    if (!timelineLine || !timelineMarkers) {
      return;
    }

    const linePositions = timelineLine.geometry.attributes.position.array;
    const markerPositions = timelineMarkers.geometry.attributes.position.array;
    const streamTop = getTimelineY(0) - (width < 700 ? 34 : 46);
    const streamBottom = galaxyScreenAnchor.y - (width < 700 ? 14 : 18);
    const centerX = width * 0.5;
    const point = new THREE.Vector3();

    timelineData.forEach((particle, index) => {
      const pulse = Math.sin(time * 0.48 + particle.phase + particle.t * 7);
      const x = centerX + particle.offsetX + pulse * (width < 700 ? 0.5 : 0.8);
      const y = streamBottom + (streamTop - streamBottom) * particle.t + particle.offsetY;
      const vertexIndex = index * 3;

      screenToWorldOnGalaxyPlane(x, y, point);
      linePositions[vertexIndex] = point.x;
      linePositions[vertexIndex + 1] = point.y;
      linePositions[vertexIndex + 2] = point.z + 8 + particle.t * 8;
    });

    markerData.forEach((particle, index) => {
      const pulse = Math.sin(time * 0.35 + particle.phase) * (width < 700 ? 0.5 : 0.8);
      const x = centerX + particle.offsetX + pulse;
      const y = getTimelineY(particle.progress) + particle.offsetY;
      const vertexIndex = index * 3;

      screenToWorldOnGalaxyPlane(x, y, point);
      markerPositions[vertexIndex] = point.x;
      markerPositions[vertexIndex + 1] = point.y;
      markerPositions[vertexIndex + 2] = point.z + 18 + particle.eventIndex * 0.35;
    });

    timelineLine.geometry.attributes.position.needsUpdate = true;
    timelineMarkers.geometry.attributes.position.needsUpdate = true;
  }

  function updateTimelineLabels() {
    if (lifeEvents.length === 0) {
      return;
    }

    lifeEvents.forEach((event) => {
      const y = getTimelineY(event.progress);
      const focus = 1 - clamp(Math.abs(scroll.current - event.progress) / 0.28, 0, 1);
      const passed = clamp((scroll.current - event.progress + 0.18) / 0.24, 0, 1);
      const alpha = clamp(0.72 + focus * 0.18 + passed * 0.1, 0.72, 1);

      event.element.style.setProperty('--event-x', '50%');
      event.element.style.setProperty('--event-y', `${y}px`);
      event.element.style.setProperty('--event-opacity', String(alpha));
      event.element.style.setProperty('--event-scale', String(0.96 + focus * 0.05));
      event.element.style.setProperty('--event-angle', '0deg');
      event.element.style.setProperty('--event-label-angle', '0deg');
    });
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    galaxyMaterial.uniforms.pixelRatio.value = height;
    galaxyMaterial.uniforms.size.value = width < 700 ? 1.28 : 1.82;
    timelineLineMaterial.uniforms.pixelRatio.value = height;
    timelineLineMaterial.uniforms.size.value = width < 700 ? 0.48 : 0.62;
    timelineLineMaterial.uniforms.t.value = 0;
    timelineLineMaterial.uniforms.z.value = 0;
    timelineMarkerMaterial.uniforms.pixelRatio.value = height;
    timelineMarkerMaterial.uniforms.size.value = width < 700 ? 0.98 : 1.42;
    timelineMarkerMaterial.uniforms.t.value = 0;
    timelineMarkerMaterial.uniforms.z.value = 0;

    if (galaxy) {
      galaxy.scale.setScalar(width < 700 ? 0.36 : 0.5);
    }

    updateGalaxyAnchor();
    createTimelineStream();
    updateScrollTarget();
    updateTimelineLabels();
  }

  function animate() {
    const time = clock.getElapsedTime();
    updateScrollTarget();
    scroll.current += (scroll.target - scroll.current) * 0.08;

    galaxyMaterial.uniforms.t.value = scanTime;
    galaxyMaterial.uniforms.z.value = destroyTime;

    if (galaxy) {
      galaxy.position.copy(galaxyAnchor);
      galaxy.rotation.y = -0.08 + Math.sin(time * 0.08) * 0.035;
      galaxy.rotation.x = -0.18;
      galaxy.rotation.z = -0.08 + time * 0.06;
    }

    updateTimelineStream(time);
    updateTimelineLabels();
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  camera.position.set(-20, -155, 90);
  camera.lookAt(scene.position);

  setGalaxy();
  resize();

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.requestAnimationFrame(animate);
}
