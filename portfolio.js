(() => {
  'use strict';

  const root = document.getElementById('portfolio-root');
  if (!root) return;

  const form = document.getElementById('portfolio-form');
  const input = document.getElementById('portfolio-password');
  const unlock = document.getElementById('portfolio-unlock');
  const lock = document.getElementById('portfolio-lock');
  const access = document.getElementById('portfolio-access');
  const content = document.getElementById('portfolio-content');
  const message = document.getElementById('portfolio-message');
  let attempt = 0;
  let busy = false;

  const isCurrent = () => root.isConnected;
  const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  if (!window.crypto?.subtle) {
    message.textContent = 'Open this page over HTTPS to unlock the portfolio.';
  } else {
    unlock.disabled = false;
  }

  function relock(focus = true) {
    attempt += 1;
    content.replaceChildren();
    content.hidden = true;
    lock.hidden = true;
    access.hidden = false;
    input.value = '';
    input.removeAttribute('aria-invalid');
    message.textContent = '';
    if (focus) input.focus();
  }

  window.MWPageLifecycle.addCleanup(() => relock(false));
  lock.addEventListener('click', () => relock());
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    message.textContent = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !input.value || !window.crypto?.subtle) return;
    busy = true;
    const currentAttempt = ++attempt;
    let password = input.value;
    input.value = '';
    unlock.disabled = true;
    unlock.textContent = 'unlocking…';
    message.textContent = '';
    let stage = 'fetch';

    try {
      const response = await fetch('public/assets/portfolio.enc.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Portfolio unavailable.');
      const payload = await response.json();
      if (payload.version !== 1 || payload.iterations !== 600000) throw new Error('Unsupported portfolio format.');
      if (!isCurrent() || currentAttempt !== attempt) return;

      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      password = '';
      const key = await crypto.subtle.deriveKey({
        name: 'PBKDF2', salt: bytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256',
      }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      stage = 'decrypt';
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv), tagLength: 128 }, key, bytes(payload.ciphertext));
      if (!isCurrent() || currentAttempt !== attempt) return;

      // This HTML is authored locally and authenticated by AES-GCM.
      content.innerHTML = new TextDecoder().decode(plaintext);
      access.hidden = true;
      content.hidden = false;
      lock.hidden = false;
      content.focus({ preventScroll: true });
    } catch (error) {
      if (!isCurrent() || currentAttempt !== attempt) return;
      if (stage === 'decrypt' && error.name === 'OperationError') {
        message.textContent = 'Incorrect password. Try again.';
        input.setAttribute('aria-invalid', 'true');
      } else {
        message.textContent = 'The portfolio could not be opened. Please try again.';
      }
      input.focus();
    } finally {
      password = '';
      busy = false;
      if (isCurrent()) {
        unlock.disabled = false;
        unlock.textContent = 'unlock >';
      }
    }
  });

  // A small 2D wireframe keeps the visual language without a graphics library.
  const canvas = document.getElementById('portfolio-wireframe');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = [];
  for (let ring = 1; ring < 18; ring += 1) {
    const latitude = ring / 18 * Math.PI;
    const points = [];
    for (let segment = 0; segment <= 64; segment += 1) {
      const longitude = segment / 64 * Math.PI * 2;
      points.push([Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)]);
    }
    lines.push(points);
  }
  let width = 1;
  let height = 1;
  let lastDraw = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(performance.now(), true);
  }

  function draw(now, singleFrame = false) {
    if (!isCurrent()) return;
    if (singleFrame || (!document.hidden && now - lastDraw >= 1000 / 24)) {
      lastDraw = now;
      ctx.clearRect(0, 0, width, height);
      const angle = reducedMotion ? .4 : now * .000025;
      const radius = Math.min(width < 768 ? width * .72 : width * .27, 410);
      const cx = width < 768 ? width * .28 : width * .26;
      const cy = height * .7;
      for (const line of lines) {
        ctx.beginPath();
        for (let i = 0; i < line.length; i += 1) {
          const [x, y, z] = line[i];
          const rx = x * Math.cos(angle) + z * Math.sin(angle);
          const rz = z * Math.cos(angle) - x * Math.sin(angle);
          const ry = y * .83 - rz * .56;
          const depth = y * .56 + rz * .83;
          const perspective = 2.8 / (2.8 + depth);
          const px = cx + (rx * .94 - ry * .34) * radius * perspective;
          const py = cy + (rx * .34 + ry * .94) * radius * perspective;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = .65;
        ctx.stroke();
      }
    }
    if (!singleFrame && !reducedMotion) window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reducedMotion) window.requestAnimationFrame(draw);
})();
