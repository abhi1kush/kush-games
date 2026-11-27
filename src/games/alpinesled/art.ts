/**
 * Alpine Sled art: a soft alpine winter palette, the sky and the layered mountain backdrop (pre-drawn once per
 * canvas size), and the trail-side sprites (pines, boulders, snowmen, logs, gifts, stars, the shield), all drawn in
 * code with canvas paths. Nothing is loaded from files.
 */

export const PALETTE = {
  skyTop: '#93b2d8',
  skyMiddle: '#c3d4ea',
  skyHorizon: '#f3d9c9',
  sunGlow: 'rgba(255,240,214,',
  fog: [233, 238, 246] as const,
  snowField: [[229, 236, 246], [222, 231, 242]] as const,
  trail: [[251, 252, 254], [243, 247, 252]] as const,
  groove: [214, 224, 238] as const,
  bankTop: [255, 255, 255] as const,
  bankFace: [214, 225, 238] as const,
  pineLit: '#6f9a86', pineShade: '#557d6c', pineDeep: '#466c5e',
  snow: '#f6f9fc', snowShade: '#d9e4ef',
  trunk: '#8a6a52',
  rockLit: '#a3afbd', rockShade: '#8593a4', rockDeep: '#6f7c8d',
  woodLight: '#d0a271', wood: '#b9875a', woodDark: '#8f6443', woodEnd: '#e2c79f',
  coat: '#7194bf', coatShade: '#5b7aa3', scarf: '#e48a72', scarfShade: '#c9705b', hat: '#f2efe9', pompom: '#e9a0a0', skin: '#f1cfb4',
  giftBox: '#eaa5a5', giftSide: '#d58e90', ribbon: '#f5d78c',
  star: '#f4cd6e', starLight: '#fbe9ad', starEdge: '#d6a84a',
  shield: 'rgba(150,205,235,', shieldEdge: '#7fbfe0',
  flags: ['#e28f84', '#7fa8d6', '#f2c879'] as const,
} as const;

export type RGB = readonly [number, number, number];

/** Fog levels: each surface colour mixed toward the fog, 0 (clear) … FOG_LEVELS-1 (all fog), as CSS strings. */
export const FOG_LEVELS = 24;
export function fogRamp(color: RGB, fog: RGB = PALETTE.fog): string[] {
  return Array.from({ length: FOG_LEVELS }, (_, level) => {
    const amount = level / (FOG_LEVELS - 1);
    const mix = (channel: number) => Math.round(color[channel] + (fog[channel] - color[channel]) * amount);
    return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
  });
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return [canvas, canvas.getContext('2d')!];
}

/** A seeded random number generator so the backdrop looks the same every time. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

function polygon(context: CanvasRenderingContext2D, points: number[], color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) context.lineTo(points[index], points[index + 1]);
  context.closePath();
  context.fill();
}

// ---------------------------------------------------------------- sky and mountains

/** The sky: cool blue overhead fading to a warm pastel sunrise glow at the horizon, with a soft low sun. */
export function createSky(width: number, height: number, horizonY: number): HTMLCanvasElement {
  const [canvas, context] = makeCanvas(width, height);
  const gradient = context.createLinearGradient(0, 0, 0, horizonY);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(0.55, PALETTE.skyMiddle);
  gradient.addColorStop(1, PALETTE.skyHorizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, horizonY + 2);
  const sunX = width * 0.72;
  const sunY = horizonY - height * 0.1;
  const glowRadius = Math.max(width, height) * 0.45;
  const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowRadius);
  glow.addColorStop(0, `${PALETTE.sunGlow}0.95)`);
  glow.addColorStop(0.08, `${PALETTE.sunGlow}0.75)`);
  glow.addColorStop(0.35, `${PALETTE.sunGlow}0.22)`);
  glow.addColorStop(1, `${PALETTE.sunGlow}0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, horizonY + 2);
  // a few soft streaks of cloud
  const random = seededRandom(7);
  context.fillStyle = 'rgba(255,255,255,0.32)';
  for (let cloud = 0; cloud < 6; cloud++) {
    const cloudX = random() * width;
    const cloudY = horizonY * (0.18 + random() * 0.45);
    const cloudWidth = width * (0.12 + random() * 0.18);
    context.beginPath();
    context.ellipse(cloudX, cloudY, cloudWidth, cloudWidth * 0.07, 0, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

interface MountainStyle { lit: string; shade: string; capLit: string; capShade: string; height: number; peaks: number; seed: number; haze: string }

/**
 * One tileable layer of low-poly peaks (twice the canvas width, so it can slide sideways as the trail turns).
 * Each peak is two triangles (a sunlit face and a shaded face) with a two-tone snow cap; a haze fades the foot.
 */
function createMountainLayer(width: number, horizonY: number, style: MountainStyle): HTMLCanvasElement {
  const layerWidth = Math.ceil(width * 2);
  const layerHeight = Math.ceil(style.height * 1.08);
  const [canvas, context] = makeCanvas(layerWidth, layerHeight);
  const random = seededRandom(style.seed);
  const peaks = Array.from({ length: style.peaks }, () => ({
    x: random() * layerWidth,
    height: style.height * (0.45 + random() * 0.55),
    halfWidth: (layerWidth / style.peaks) * (0.75 + random() * 0.7),
    skew: (random() - 0.5) * 0.5,
  })).sort((first, second) => first.height - second.height);
  const base = layerHeight;
  for (const peak of peaks) {
    for (const shift of [-layerWidth, 0, layerWidth]) {
      const apexX = peak.x + shift + peak.skew * peak.halfWidth;
      const apexY = base - peak.height;
      const leftX = peak.x + shift - peak.halfWidth;
      const rightX = peak.x + shift + peak.halfWidth;
      if (rightX < 0 || leftX > layerWidth) continue;
      polygon(context, [leftX, base, apexX, apexY, apexX, base], style.shade);
      polygon(context, [apexX, apexY, rightX, base, apexX, base], style.lit);
      // snow cap: the top third, with a zig-zag lower edge
      const capDepth = 0.32 + (peak.height / style.height) * 0.1;
      const capLeftX = apexX + (leftX - apexX) * capDepth;
      const capRightX = apexX + (rightX - apexX) * capDepth;
      const capY = apexY + peak.height * capDepth;
      polygon(context, [apexX, apexY, capLeftX, capY, (capLeftX + apexX) / 2, capY - peak.height * 0.06, apexX - (apexX - capLeftX) * 0.15, capY + peak.height * 0.03, apexX, capY - peak.height * 0.04], style.capShade);
      polygon(context, [apexX, apexY, apexX, capY - peak.height * 0.04, apexX + (capRightX - apexX) * 0.35, capY + peak.height * 0.04, (capRightX + apexX) / 2 + (capRightX - apexX) * 0.2, capY - peak.height * 0.05, capRightX, capY], style.capLit);
    }
  }
  const haze = context.createLinearGradient(0, base - style.height * 0.55, 0, base);
  haze.addColorStop(0, `${style.haze}0)`);
  haze.addColorStop(1, `${style.haze}0.85)`);
  context.fillStyle = haze;
  context.fillRect(0, 0, layerWidth, layerHeight);
  void horizonY;
  return canvas;
}

/** Rolling snowy foothills with rows of tiny pines (the nearest backdrop layer). */
function createFoothills(width: number, height: number): HTMLCanvasElement {
  const layerWidth = Math.ceil(width * 2);
  const layerHeight = Math.ceil(height);
  const [canvas, context] = makeCanvas(layerWidth, layerHeight);
  const random = seededRandom(31);
  const waves = [1, 2, 3, 5].map(frequency => ({ frequency, phase: random() * Math.PI * 2, amplitude: 1 / (frequency + 0.6) }));
  const ridge = (x: number) => {
    let sum = 0;
    for (const wave of waves) sum += wave.amplitude * Math.sin((x / layerWidth) * Math.PI * 2 * wave.frequency + wave.phase);
    return layerHeight * (0.55 - sum * 0.32);
  };
  const fill = context.createLinearGradient(0, 0, 0, layerHeight);
  fill.addColorStop(0, '#eef3f9');
  fill.addColorStop(1, '#dde6f0');
  context.fillStyle = fill;
  context.beginPath();
  context.moveTo(0, layerHeight);
  for (let x = 0; x <= layerWidth; x += 6) context.lineTo(x, ridge(x));
  context.lineTo(layerWidth, layerHeight);
  context.closePath();
  context.fill();
  // little pine silhouettes along the ridges
  for (let tree = 0; tree < 160; tree++) {
    const x = random() * layerWidth;
    const top = ridge(x) + random() * layerHeight * 0.35;
    const treeHeight = layerHeight * (0.12 + random() * 0.12);
    context.fillStyle = random() < 0.5 ? 'rgba(111,148,140,0.75)' : 'rgba(95,132,126,0.7)';
    context.beginPath();
    context.moveTo(x, top - treeHeight);
    context.lineTo(x - treeHeight * 0.3, top);
    context.lineTo(x + treeHeight * 0.3, top);
    context.closePath();
    context.fill();
  }
  const haze = context.createLinearGradient(0, 0, 0, layerHeight);
  haze.addColorStop(0, 'rgba(233,238,246,0.15)');
  haze.addColorStop(1, 'rgba(233,238,246,0.9)');
  context.fillStyle = haze;
  context.fillRect(0, 0, layerWidth, layerHeight);
  return canvas;
}

export interface Backdrop { sky: HTMLCanvasElement; layers: { canvas: HTMLCanvasElement; parallax: number }[] }

export function createBackdrop(width: number, height: number, horizonY: number): Backdrop {
  const span = Math.min(height, width * 0.9);
  return {
    sky: createSky(width, height, horizonY),
    layers: [
      { canvas: createMountainLayer(width, horizonY, { lit: '#c7d0e2', shade: '#aeb9d1', capLit: '#f6f8fc', capShade: '#dfe5f1', height: span * 0.3, peaks: 9, seed: 3, haze: 'rgba(238,226,226,' }), parallax: 0.22 },
      { canvas: createMountainLayer(width, horizonY, { lit: '#a5b5cd', shade: '#8a9cb9', capLit: '#f8fafd', capShade: '#d6dfec', height: span * 0.2, peaks: 11, seed: 11, haze: 'rgba(233,236,244,' }), parallax: 0.42 },
      { canvas: createFoothills(width, span * 0.09), parallax: 0.7 },
    ],
  };
}

// ---------------------------------------------------------------- trail-side sprites

/** Pixels per metre the sprites are drawn at (they are scaled down from this when far away). */
export const SPRITE_PIXELS_PER_METRE = 64;

export interface Sprites {
  pine: HTMLCanvasElement;
  snowyPine: HTMLCanvasElement;
  boulder: HTMLCanvasElement;
  snowman: HTMLCanvasElement;
  log: HTMLCanvasElement;
  gift: HTMLCanvasElement;
  star: HTMLCanvasElement;
  shield: HTMLCanvasElement;
}

function drawPine(widthMetres: number, heightMetres: number, snowiness: number): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(widthMetres * pixels, heightMetres * pixels);
  const width = canvas.width, height = canvas.height, middle = width / 2;
  context.fillStyle = PALETTE.trunk;
  context.fillRect(middle - width * 0.05, height * 0.82, width * 0.1, height * 0.18);
  const tiers = [[0.86, 0.5, 0.5], [0.62, 0.38, 0.3], [0.4, 0.26, 0.1]];
  for (const [bottom, halfWidth, top] of tiers) {
    const bottomY = height * bottom, topY = height * top, half = width * halfWidth;
    const tipY = topY;
    polygon(context, [middle, tipY, middle - half, bottomY, middle - half * 0.3, bottomY + height * 0.03, middle, bottomY], PALETTE.pineLit);
    polygon(context, [middle, tipY, middle, bottomY, middle + half * 0.35, bottomY + height * 0.03, middle + half, bottomY], PALETTE.pineShade);
    polygon(context, [middle, tipY + (bottomY - tipY) * 0.5, middle + half * 0.55, bottomY, middle + half * 0.1, bottomY], PALETTE.pineDeep);
    // snow lying on the tier
    const snowDepth = 0.32 + snowiness * 0.3;
    const snowY = tipY + (bottomY - tipY) * snowDepth;
    const snowHalf = half * snowDepth;
    polygon(context, [middle, tipY, middle - snowHalf, snowY, middle - snowHalf * 0.5, snowY - height * 0.012, middle - snowHalf * 0.15, snowY + height * 0.015, middle, snowY - height * 0.01], PALETTE.snow);
    polygon(context, [middle, tipY, middle, snowY - height * 0.01, middle + snowHalf * 0.4, snowY + height * 0.012, middle + snowHalf, snowY], PALETTE.snowShade);
    if (snowiness > 0.5) {
      context.fillStyle = 'rgba(246,249,252,0.85)';
      context.fillRect(middle - half * 0.85, bottomY - height * 0.018, half * 1.7, height * 0.02);
    }
  }
  return canvas;
}

function drawBoulder(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(2.3 * pixels, 1.25 * pixels);
  const width = canvas.width, height = canvas.height;
  const at = (x: number, y: number) => [width * x, height * y];
  polygon(context, [...at(0.04, 1), ...at(0.12, 0.45), ...at(0.38, 0.12), ...at(0.5, 0.5), ...at(0.4, 1)], PALETTE.rockLit);
  polygon(context, [...at(0.38, 0.12), ...at(0.7, 0.08), ...at(0.88, 0.4), ...at(0.5, 0.5)], PALETTE.rockLit);
  polygon(context, [...at(0.5, 0.5), ...at(0.88, 0.4), ...at(0.97, 1), ...at(0.4, 1)], PALETTE.rockShade);
  polygon(context, [...at(0.62, 0.62), ...at(0.97, 1), ...at(0.5, 1)], PALETTE.rockDeep);
  // snow cap
  polygon(context, [...at(0.13, 0.42), ...at(0.38, 0.1), ...at(0.7, 0.06), ...at(0.86, 0.36), ...at(0.7, 0.3), ...at(0.55, 0.4), ...at(0.4, 0.3), ...at(0.25, 0.44)], PALETTE.snow);
  polygon(context, [...at(0.7, 0.06), ...at(0.86, 0.36), ...at(0.72, 0.3)], PALETTE.snowShade);
  // snow drifted around its foot
  context.fillStyle = PALETTE.snow;
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.98, width * 0.52, height * 0.08, 0, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

function shadedBall(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.7, '#eef3f9');
  gradient.addColorStop(1, '#cbd8e8');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawSnowman(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(1.5 * pixels, 1.9 * pixels);
  const width = canvas.width, height = canvas.height, middle = width / 2;
  // stick arms
  context.strokeStyle = PALETTE.trunk;
  context.lineWidth = width * 0.035;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(middle - width * 0.18, height * 0.5); context.lineTo(middle - width * 0.46, height * 0.36);
  context.moveTo(middle + width * 0.18, height * 0.5); context.lineTo(middle + width * 0.46, height * 0.4);
  context.stroke();
  shadedBall(context, middle, height * 0.78, width * 0.36);
  shadedBall(context, middle, height * 0.5, width * 0.27);
  shadedBall(context, middle, height * 0.27, width * 0.2);
  // scarf
  context.fillStyle = PALETTE.scarf;
  context.fillRect(middle - width * 0.2, height * 0.355, width * 0.4, height * 0.05);
  context.fillStyle = PALETTE.scarfShade;
  context.fillRect(middle + width * 0.06, height * 0.38, width * 0.09, height * 0.16);
  // hat
  context.fillStyle = '#5b6b7e';
  context.fillRect(middle - width * 0.2, height * 0.135, width * 0.4, height * 0.03);
  context.fillRect(middle - width * 0.13, height * 0.02, width * 0.26, height * 0.125);
  // face and buttons
  context.fillStyle = '#4a4f58';
  for (const [x, y, radius] of [[-0.07, 0.25, 0.022], [0.07, 0.25, 0.022], [0, 0.47, 0.022], [0, 0.55, 0.022]]) {
    context.beginPath(); context.arc(middle + width * x, height * y, width * radius, 0, Math.PI * 2); context.fill();
  }
  polygon(context, [middle, height * 0.28, middle + width * 0.16, height * 0.3, middle, height * 0.31], '#e79a5c');
  return canvas;
}

function drawLog(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(3.2 * pixels, 0.75 * pixels);
  const width = canvas.width, height = canvas.height;
  const radius = height * 0.42;
  const top = height - radius * 2 - height * 0.04;
  context.fillStyle = PALETTE.wood;
  context.fillRect(radius, top, width - radius * 2, radius * 2);
  context.fillStyle = PALETTE.woodDark;
  context.fillRect(radius, top + radius * 1.25, width - radius * 2, radius * 0.75);
  context.strokeStyle = 'rgba(110,78,52,0.55)';
  context.lineWidth = Math.max(1, height * 0.03);
  for (let line = 0; line < 5; line++) {
    const x = radius + (width - radius * 2) * (0.1 + line * 0.19);
    context.beginPath(); context.moveTo(x, top + radius * 0.4); context.lineTo(x + width * 0.06, top + radius * 0.55); context.stroke();
  }
  for (const endX of [radius, width - radius]) {
    context.fillStyle = PALETTE.woodEnd;
    context.beginPath(); context.ellipse(endX, top + radius, radius * 0.55, radius, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = 'rgba(160,120,82,0.7)';
    context.beginPath(); context.ellipse(endX, top + radius, radius * 0.3, radius * 0.55, 0, 0, Math.PI * 2); context.stroke();
  }
  // snow along the top
  context.fillStyle = PALETTE.snow;
  context.beginPath();
  context.ellipse(width / 2, top + radius * 0.12, width * 0.4, radius * 0.28, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(246,249,252,0.9)';
  context.beginPath(); context.ellipse(width / 2, height * 0.97, width * 0.48, height * 0.06, 0, 0, Math.PI * 2); context.fill();
  return canvas;
}

function drawGift(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(1.0 * pixels, 1.0 * pixels);
  const size = canvas.width;
  const boxTop = size * 0.32;
  polygon(context, [size * 0.12, boxTop, size * 0.66, boxTop, size * 0.66, size * 0.98, size * 0.12, size * 0.98], PALETTE.giftBox);
  polygon(context, [size * 0.66, boxTop, size * 0.88, boxTop - size * 0.08, size * 0.88, size * 0.9, size * 0.66, size * 0.98], PALETTE.giftSide);
  polygon(context, [size * 0.12, boxTop, size * 0.34, boxTop - size * 0.08, size * 0.88, boxTop - size * 0.08, size * 0.66, boxTop], '#f2bcbc');
  context.fillStyle = PALETTE.ribbon;
  context.fillRect(size * 0.34, boxTop, size * 0.1, size * 0.66);
  polygon(context, [size * 0.72, boxTop - size * 0.02, size * 0.78, boxTop - size * 0.05, size * 0.78, size * 0.93, size * 0.72, size * 0.96], PALETTE.ribbon);
  // bow
  context.beginPath();
  context.ellipse(size * 0.33, boxTop - size * 0.14, size * 0.12, size * 0.08, -0.5, 0, Math.PI * 2);
  context.ellipse(size * 0.57, boxTop - size * 0.14, size * 0.12, size * 0.08, 0.5, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

function drawStar(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(1.1 * pixels, 1.1 * pixels);
  const size = canvas.width, middle = size / 2;
  const glow = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
  glow.addColorStop(0, 'rgba(255,236,170,0.75)');
  glow.addColorStop(1, 'rgba(255,236,170,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  const points: number[] = [];
  for (let corner = 0; corner < 10; corner++) {
    const radius = corner % 2 === 0 ? size * 0.4 : size * 0.17;
    const angle = -Math.PI / 2 + (corner * Math.PI) / 5;
    points.push(middle + Math.cos(angle) * radius, middle + Math.sin(angle) * radius);
  }
  polygon(context, points, PALETTE.starEdge);
  const inner = points.map((value, index) => (index % 2 === 0 ? middle + (value - middle) * 0.82 : middle + (value - middle) * 0.82));
  polygon(context, inner, PALETTE.star);
  polygon(context, [middle, middle - size * 0.33, middle + size * 0.08, middle - size * 0.05, middle, middle + size * 0.02, middle - size * 0.08, middle - size * 0.05], PALETTE.starLight);
  return canvas;
}

function drawShield(): HTMLCanvasElement {
  const pixels = SPRITE_PIXELS_PER_METRE;
  const [canvas, context] = makeCanvas(1.2 * pixels, 1.2 * pixels);
  const size = canvas.width, middle = size / 2;
  const bubble = context.createRadialGradient(middle - size * 0.15, middle - size * 0.18, size * 0.05, middle, middle, size * 0.48);
  bubble.addColorStop(0, `${PALETTE.shield}0.25)`);
  bubble.addColorStop(0.75, `${PALETTE.shield}0.45)`);
  bubble.addColorStop(1, `${PALETTE.shield}0.85)`);
  context.fillStyle = bubble;
  context.beginPath(); context.arc(middle, middle, size * 0.46, 0, Math.PI * 2); context.fill();
  context.strokeStyle = PALETTE.shieldEdge;
  context.lineWidth = size * 0.035;
  context.stroke();
  // a little shield badge inside
  polygon(context, [middle, size * 0.24, size * 0.72, size * 0.33, size * 0.68, size * 0.58, middle, size * 0.78, size * 0.32, size * 0.58, size * 0.28, size * 0.33], '#f7fbff');
  polygon(context, [middle, size * 0.3, size * 0.66, size * 0.37, size * 0.63, size * 0.56, middle, size * 0.71], '#9fd0ea');
  context.fillStyle = 'rgba(255,255,255,0.8)';
  context.beginPath(); context.ellipse(middle - size * 0.17, middle - size * 0.2, size * 0.08, size * 0.04, -0.6, 0, Math.PI * 2); context.fill();
  return canvas;
}

export function createSprites(): Sprites {
  return {
    pine: drawPine(2.4, 3.6, 0.2),
    snowyPine: drawPine(2.4, 3.6, 0.8),
    boulder: drawBoulder(),
    snowman: drawSnowman(),
    log: drawLog(),
    gift: drawGift(),
    star: drawStar(),
    shield: drawShield(),
  };
}
