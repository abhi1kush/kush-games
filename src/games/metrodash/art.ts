/**
 * Metro Dash's colours and pre-rendered sprites (all drawn in code: no image files). A bright, cheerful but soft
 * palette: pastel trains and buildings, sandy ballast, a peach-and-sky-blue morning.
 */
export type RGB = readonly [number, number, number];

export const HAZE: RGB = [246, 228, 214];
export const PALETTE = {
  skyTop: '#9cc8ee', skyMiddle: '#cfe5f5', skyHorizon: '#fae3d3', sun: '#fff6dc',
  skylineFar: '#dcd6ee', skylineNear: '#c8c2e4',
  ground: '#e9dcc7', ballast: '#cdbfa9', ballastDark: '#bcae98', sleeper: '#a88f75', rail: '#8f99ab', railShine: '#e1e7f0',
  platform: '#efe7da', platformEdge: '#f2cf78', platformSide: '#d8cdbd', pole: '#7d8ca3', lamp: '#fff1c4',
  shadow: 'rgba(70, 60, 80, 0.22)',
};
/** Soft pastel train liveries (the fifth is the oncoming train: a warmer coral). */
export const TRAIN_COLORS: readonly RGB[] = [[143, 211, 193], [244, 169, 154], [185, 167, 230], [243, 212, 138], [238, 140, 124]];
export const BUILDING_COLORS: readonly RGB[] = [[242, 181, 160], [168, 213, 194], [246, 213, 142], [185, 198, 238], [231, 183, 212], [201, 228, 166], [244, 201, 168]];

export const rgb = ([red, green, blue]: RGB, factor = 1) =>
  `rgb(${Math.min(255, Math.round(red * factor))},${Math.min(255, Math.round(green * factor))},${Math.min(255, Math.round(blue * factor))})`;
/** `color` mixed toward the haze by `amount` (0 … 1), shaded by `factor`. */
export function hazed(color: RGB, amount: number, factor = 1): string {
  const mix = (index: number) => Math.round(Math.min(255, color[index] * factor) * (1 - amount) + HAZE[index] * amount);
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
}
export const FOG_LEVELS = 8;
/** Pre-mixed colour strings per haze level, so drawing never builds colour strings per frame. */
export function fogRamp(color: RGB, factor = 1, maxHaze = 0.75): string[] {
  return Array.from({ length: FOG_LEVELS }, (_, level) => hazed(color, (level / (FOG_LEVELS - 1)) * maxHaze, factor));
}

export interface Sprites { coin: HTMLCanvasElement; magnet: HTMLCanvasElement; sneakers: HTMLCanvasElement; multiplier: HTMLCanvasElement; hoverboard: HTMLCanvasElement; sky: HTMLCanvasElement | null }
export const SPRITE_SIZE = 96;

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function drawCoin(): HTMLCanvasElement {
  const canvas = canvasOf(SPRITE_SIZE, SPRITE_SIZE);
  const context = canvas.getContext('2d')!;
  const middle = SPRITE_SIZE / 2;
  context.fillStyle = '#d9a43c';
  context.beginPath(); context.arc(middle, middle, middle - 3, 0, Math.PI * 2); context.fill();
  const face = context.createRadialGradient(middle - 12, middle - 14, 4, middle, middle, middle - 8);
  face.addColorStop(0, '#fff3b8'); face.addColorStop(0.55, '#f7d26a'); face.addColorStop(1, '#eab04a');
  context.fillStyle = face;
  context.beginPath(); context.arc(middle, middle, middle - 9, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#d89b35'; context.lineWidth = 4;
  context.beginPath(); context.arc(middle, middle, middle - 20, 0, Math.PI * 2); context.stroke();
  // a little star stamped in the middle
  context.fillStyle = '#e3a43f';
  context.beginPath();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? 15 : 6.5;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    context.lineTo(middle + Math.cos(angle) * radius, middle + Math.sin(angle) * radius);
  }
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.beginPath(); context.ellipse(middle - 14, middle - 18, 8, 4, -0.6, 0, Math.PI * 2); context.fill();
  return canvas;
}

/** A soft glowing bubble with an icon drawn by `icon` in a 96 × 96 box. */
function bubble(tint: string, icon: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = canvasOf(SPRITE_SIZE, SPRITE_SIZE);
  const context = canvas.getContext('2d')!;
  const middle = SPRITE_SIZE / 2;
  const glow = context.createRadialGradient(middle, middle, 10, middle, middle, middle);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(0.7, tint); glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.beginPath(); context.arc(middle, middle, middle, 0, Math.PI * 2); context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.9)'; context.lineWidth = 3;
  context.beginPath(); context.arc(middle, middle, middle - 10, 0, Math.PI * 2); context.stroke();
  context.save();
  icon(context);
  context.restore();
  context.fillStyle = 'rgba(255,255,255,0.75)';
  context.beginPath(); context.ellipse(middle - 16, middle - 22, 10, 5, -0.6, 0, Math.PI * 2); context.fill();
  return canvas;
}

export function createSprites(): Sprites {
  return {
    coin: drawCoin(),
    magnet: bubble('rgba(240,140,140,0.55)', context => {
      context.lineCap = 'butt';
      context.lineWidth = 13;
      context.strokeStyle = '#e46f6f';
      context.beginPath(); context.arc(48, 46, 17, Math.PI, 0, false); context.stroke();
      context.beginPath(); context.moveTo(31, 46); context.lineTo(31, 64); context.moveTo(65, 46); context.lineTo(65, 64); context.stroke();
      context.strokeStyle = '#e8edf4';
      context.beginPath(); context.moveTo(31, 58); context.lineTo(31, 68); context.moveTo(65, 58); context.lineTo(65, 68); context.stroke();
    }),
    sneakers: bubble('rgba(150,220,140,0.55)', context => {
      context.fillStyle = '#7fcf74';
      context.beginPath();
      context.moveTo(22, 60); context.lineTo(26, 38); context.lineTo(42, 36); context.quadraticCurveTo(50, 52, 72, 54); context.quadraticCurveTo(78, 58, 76, 64); context.lineTo(22, 64);
      context.fill();
      context.fillStyle = '#ffffff';
      context.fillRect(22, 62, 55, 6);
      context.strokeStyle = '#ffffff'; context.lineWidth = 2.5;
      context.beginPath(); context.moveTo(36, 44); context.lineTo(44, 42); context.moveTo(38, 50); context.lineTo(48, 47); context.stroke();
      context.strokeStyle = '#f6d36b'; context.lineWidth = 3;
      context.beginPath(); context.moveTo(18, 30); context.lineTo(24, 22); context.moveTo(30, 26); context.lineTo(33, 17); context.stroke();
    }),
    multiplier: bubble('rgba(180,160,240,0.55)', context => {
      context.fillStyle = '#7d6bd0';
      context.font = '900 38px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('2×', 49, 51);
    }),
    hoverboard: bubble('rgba(130,200,240,0.55)', context => {
      context.translate(48, 50);
      context.rotate(-0.35);
      const board = context.createLinearGradient(-30, 0, 30, 0);
      board.addColorStop(0, '#6cc3f0'); board.addColorStop(1, '#b49af0');
      context.fillStyle = board;
      context.beginPath(); context.ellipse(0, 0, 32, 10, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ffffff';
      context.fillRect(-14, -2, 28, 4);
      context.fillStyle = 'rgba(140,220,255,0.8)';
      context.beginPath(); context.ellipse(-18, 12, 6, 3, 0, 0, Math.PI * 2); context.ellipse(18, 12, 6, 3, 0, 0, Math.PI * 2); context.fill();
    }),
    sky: null,
  };
}

/** The sky and the distant skyline, drawn once per canvas size (`margin` px wider each side for a little parallax). */
export function createSky(width: number, horizonY: number, margin: number): HTMLCanvasElement {
  const canvas = canvasOf(width + margin * 2, Math.max(2, Math.ceil(horizonY) + 2));
  const context = canvas.getContext('2d')!;
  const height = canvas.height;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, PALETTE.skyTop); gradient.addColorStop(0.55, PALETTE.skyMiddle); gradient.addColorStop(1, PALETTE.skyHorizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, height);
  // a soft morning sun
  const sunX = canvas.width * 0.72, sunY = height * 0.42, sunRadius = Math.max(18, height * 0.16);
  const glow = context.createRadialGradient(sunX, sunY, sunRadius * 0.4, sunX, sunY, sunRadius * 3);
  glow.addColorStop(0, 'rgba(255,246,220,0.9)'); glow.addColorStop(1, 'rgba(255,246,220,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, height);
  context.fillStyle = PALETTE.sun;
  context.beginPath(); context.arc(sunX, sunY, sunRadius, 0, Math.PI * 2); context.fill();
  // puffy clouds
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  context.fillStyle = 'rgba(255,255,255,0.8)';
  for (let cloud = 0; cloud < 6; cloud++) {
    const x = random() * canvas.width, y = height * (0.12 + random() * 0.4), size = height * (0.05 + random() * 0.06);
    context.beginPath();
    context.ellipse(x, y, size * 2.4, size, 0, 0, Math.PI * 2);
    context.ellipse(x - size * 1.3, y + size * 0.25, size * 1.4, size * 0.8, 0, 0, Math.PI * 2);
    context.ellipse(x + size * 1.2, y - size * 0.3, size * 1.5, size * 0.9, 0, 0, Math.PI * 2);
    context.fill();
  }
  // two layers of distant towers
  for (const [color, minimum, maximum, step] of [[PALETTE.skylineFar, 0.1, 0.3, 26], [PALETTE.skylineNear, 0.05, 0.2, 34]] as const) {
    context.fillStyle = color;
    let x = -random() * step;
    while (x < canvas.width) {
      const towerWidth = step * (0.6 + random() * 0.9);
      const towerHeight = height * (minimum + random() * (maximum - minimum));
      context.fillRect(x, height - towerHeight, towerWidth, towerHeight);
      if (random() < 0.25) context.fillRect(x + towerWidth * 0.4, height - towerHeight - height * 0.04, towerWidth * 0.15, height * 0.04);
      x += towerWidth + random() * 6;
    }
  }
  return canvas;
}
