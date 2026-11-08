// Dot positions live in CSS pixels, so the interaction feels the same on retina
// displays and after a responsive resize. Radii and tones share the GPU buffer.
export function createDotField(cols, rows, density = 1.31) {
  const across = Math.round(cols * density), down = Math.round(rows * density);
  const count = across * down;
  const anchors = new Float32Array(count * 2);
  for (let y = 0; y < down; y++) for (let x = 0; x < across; x++) {
    const index = y * across + x;
    anchors[index * 2] = (x + .5) / across;
    anchors[index * 2 + 1] = (y + .5) / down;
  }
  return { across, down, count, anchors, motion: new Float32Array(count * 4), data: new Float32Array(count * 4) };
}

export function stepDotField(field, width, height, pointer, delta) {
  const dt = Math.min(Math.max(delta, 0), 1 / 30);
  const { count, anchors, motion, data } = field;
  const radius = 78;
  for (let i = 0; i < count; i++) {
    const j = i * 4;
    const homeX = anchors[i * 2] * width, homeY = anchors[i * 2 + 1] * height;
    let x = motion[j], y = motion[j + 1], vx = motion[j + 2], vy = motion[j + 3];
    let ax = -38 * x - 9 * vx, ay = -38 * y - 9 * vy;
    if (pointer.active && data[j + 2] > 0) {
      const dx = homeX + x - pointer.x, dy = homeY + y - pointer.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < radius * radius) {
        const distance = Math.sqrt(distanceSquared);
        const falloff = 1 - distance / radius;
        const force = 3400 * falloff * falloff;
        // An exact hit needs a direction too; use a deterministic radial seed.
        ax += force * (distance > .01 ? dx / distance : Math.cos(i * 2.39996));
        ay += force * (distance > .01 ? dy / distance : Math.sin(i * 2.39996));
      }
    }
    vx += ax * dt; vy += ay * dt;
    x += vx * dt; y += vy * dt;
    if (Math.abs(x) + Math.abs(y) + Math.abs(vx) + Math.abs(vy) < .015) x = y = vx = vy = 0;
    motion[j] = x; motion[j + 1] = y; motion[j + 2] = vx; motion[j + 3] = vy;
    data[j] = homeX + x; data[j + 1] = homeY + y;
  }
}
