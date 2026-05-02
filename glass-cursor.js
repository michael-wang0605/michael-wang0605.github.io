const lensCanvas = document.getElementById('lens-canvas') || document.getElementById('title-canvas');

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
    fontFamily: 'Noto Sans JP, Roobert, Helvetica, Arial, sans-serif',
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
