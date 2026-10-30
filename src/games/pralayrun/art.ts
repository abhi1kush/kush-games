/**
 * The look of Pralay Run, drawn on one 2D canvas: a dusk sky with a low sun and slow god rays, three parallax layers
 * of floating sky-temple ruins with haze between them, sandstone temple blocks with rim light from the sun, the
 * Pralay (a violet-black collapse with a burning edge and embers), and an additive light pass (lanterns, gems,
 * flames, bolts, eyes) finished with drifting fog, dust motes and a vignette.
 * Everything costly (sky, rays, layers, glow sprites, vignette) is pre-rendered once per canvas size.
 */
import { DASH_SECONDS, EffectKind, EnemyKind, MAX_HP, PlatformKind, Pose, PropKind, RenderSlot, VENT_ACTIVE, VENT_PERIOD, VIEW_HEIGHT } from './engine';

type Context = CanvasRenderingContext2D;
type GlowColor = 'warm' | 'cyan' | 'magenta' | 'red' | 'gold' | 'violet' | 'pink' | 'white';

const GLOW_RGB: Record<GlowColor, string> = {
  warm: '255,176,96', cyan: '110,240,255', magenta: '255,70,190', red: '255,70,50', gold: '255,214,120', violet: '170,110,255', pink: '255,120,190', white: '255,255,255',
};

export interface Scene {
  context: Context;
  /** Device pixels per world unit. */
  scale: number;
  viewWidth: number;
  sky: HTMLCanvasElement;
  rays: HTMLCanvasElement;
  layers: { canvas: HTMLCanvasElement; factor: number; widthPixels: number }[];
  glow: Record<GlowColor, HTMLCanvasElement>;
  fog: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
  danger: HTMLCanvasElement;
  bodyGradient: CanvasGradient;
  pillarGradient: CanvasGradient;
  hazeGradients: CanvasGradient[];
  sunX: number;
  sunY: number;
}

/** Everything the renderer remembers between frames (purely visual). */
export interface VisualState {
  shake: number;
  hurtFlash: number;
  trail: { x: number; y: number; facing: number; age: number }[];
  lastClock: number;
}

export const createVisualState = (): VisualState => ({ shake: 0, hurtFlash: 0, trail: [], lastClock: 0 });

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
};

/** Small deterministic hash → [0, 1). */
const hash = (value: number) => { const s = Math.sin(value * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function seeded(seed: number) { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) % 100000) / 100000; }; }

function makeGlow(rgb: string) {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${rgb},1)`);
  gradient.addColorStop(0.18, `rgba(${rgb},0.55)`);
  gradient.addColorStop(0.45, `rgba(${rgb},0.16)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

function makeSky(width: number, height: number, sunX: number, sunY: number, scale: number) {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0d0724');
  gradient.addColorStop(0.32, '#2b1050');
  gradient.addColorStop(0.58, '#7a2266');
  gradient.addColorStop(0.76, '#d4506a');
  gradient.addColorStop(0.9, '#ff9e6a');
  gradient.addColorStop(1, '#ffd29a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  // stars in the high, dark part of the sky
  const random = seeded(77);
  for (let index = 0; index < 90; index++) {
    const x = random() * width, y = random() * height * 0.45;
    const alpha = (1 - y / (height * 0.45)) * (0.3 + random() * 0.7);
    context.fillStyle = `rgba(255,240,255,${alpha.toFixed(3)})`;
    const size = (random() < 0.1 ? 1.6 : 0.9) * Math.max(1, scale * 0.35);
    context.fillRect(x, y, size, size);
  }
  // a faint aurora ribbon across the upper sky
  context.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    context.beginPath();
    for (let x = 0; x <= width; x += width / 24) {
      const y = height * (0.2 + band * 0.05) + Math.sin(x / width * 5 + band) * height * 0.04;
      if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.strokeStyle = `rgba(${band === 1 ? '120,220,255' : '255,120,220'},${0.05 - band * 0.01})`;
    context.lineWidth = height * (0.05 - band * 0.012);
    context.stroke();
  }
  // the low sun: a wide halo, then the disc
  const radius = height * 0.11;
  const halo = context.createRadialGradient(sunX, sunY, radius * 0.6, sunX, sunY, height * 0.75);
  halo.addColorStop(0, 'rgba(255,210,150,0.55)');
  halo.addColorStop(0.3, 'rgba(255,140,110,0.18)');
  halo.addColorStop(1, 'rgba(255,120,120,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  const disc = context.createRadialGradient(sunX - radius * 0.2, sunY - radius * 0.25, radius * 0.1, sunX, sunY, radius);
  disc.addColorStop(0, '#fffbe8');
  disc.addColorStop(0.7, '#ffe0a0');
  disc.addColorStop(1, '#ffb86e');
  context.fillStyle = disc;
  context.beginPath(); context.arc(sunX, sunY, radius, 0, Math.PI * 2); context.fill();
  // a thin ring of a far-off chakra around the sun
  context.strokeStyle = 'rgba(255,230,180,0.25)';
  context.lineWidth = Math.max(1, scale * 0.6);
  context.beginPath(); context.arc(sunX, sunY, radius * 1.55, 0, Math.PI * 2); context.stroke();
  for (let spoke = 0; spoke < 24; spoke++) {
    const angle = spoke / 24 * Math.PI * 2;
    context.beginPath();
    context.moveTo(sunX + Math.cos(angle) * radius * 1.55, sunY + Math.sin(angle) * radius * 1.55);
    context.lineTo(sunX + Math.cos(angle) * radius * 1.72, sunY + Math.sin(angle) * radius * 1.72);
    context.stroke();
  }
  return canvas;
}

function makeRays(size: number) {
  const canvas = makeCanvas(size, size);
  const context = canvas.getContext('2d')!;
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,225,170,0.5)');
  gradient.addColorStop(0.4, 'rgba(255,200,150,0.16)');
  gradient.addColorStop(1, 'rgba(255,180,140,0)');
  context.fillStyle = gradient;
  const random = seeded(5);
  for (let ray = 0; ray < 14; ray++) {
    const angle = ray / 14 * Math.PI * 2 + random() * 0.2;
    const spread = 0.035 + random() * 0.06;
    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(center + Math.cos(angle - spread) * center, center + Math.sin(angle - spread) * center);
    context.lineTo(center + Math.cos(angle + spread) * center, center + Math.sin(angle + spread) * center);
    context.closePath();
    context.fill();
  }
  return canvas;
}

/** A spire (shikhara) silhouette standing on (x, base), `height` tall. */
function spire(context: Context, x: number, base: number, width: number, height: number) {
  context.moveTo(x - width / 2, base);
  context.quadraticCurveTo(x - width * 0.52, base - height * 0.55, x - width * 0.12, base - height * 0.92);
  context.lineTo(x, base - height);
  context.lineTo(x + width * 0.12, base - height * 0.92);
  context.quadraticCurveTo(x + width * 0.52, base - height * 0.55, x + width / 2, base);
  context.closePath();
}

/** One parallax layer, `widthUnits` wide and tileable. Kind 0: far mountains, 1: temple islands, 2: near rocks. */
function makeLayer(kind: number, widthUnits: number, scale: number) {
  const width = widthUnits * scale, height = VIEW_HEIGHT * scale;
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  const random = seeded(31 + kind * 101);
  if (kind === 0) {
    // low-poly mountain range: lit faces toward the sun (right), shadowed faces left
    const peaks: [number, number][] = [];
    for (let x = -40; x <= widthUnits + 40; x += 30 + random() * 40) peaks.push([x, 150 + random() * 50]);
    const valley = 215;
    context.fillStyle = '#3d1c4c';
    context.beginPath(); context.moveTo(-40, VIEW_HEIGHT);
    for (const [x, y] of peaks) context.lineTo(x, y);
    context.lineTo(widthUnits + 40, VIEW_HEIGHT); context.closePath(); context.fill();
    for (let index = 0; index + 1 < peaks.length; index++) {
      const [x1, y1] = peaks[index], [x2, y2] = peaks[index + 1];
      const mid = (x1 + x2) / 2;
      context.fillStyle = y1 < y2 ? 'rgba(255,150,140,0.13)' : 'rgba(0,0,0,0.12)';
      context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.lineTo(mid, valley); context.closePath(); context.fill();
    }
    // a far temple on the ridge
    context.fillStyle = '#331640';
    context.beginPath(); spire(context, widthUnits * 0.62, 168, 22, 46); context.fill();
  } else if (kind === 1) {
    // floating islands with temple spires, glowing windows
    for (let island = 0; island < 4; island++) {
      const x = (island + 0.25 + random() * 0.5) * widthUnits / 4;
      const top = 110 + random() * 60;
      const half = 34 + random() * 30;
      context.fillStyle = '#2a1238';
      context.beginPath();
      context.moveTo(x - half, top);
      context.lineTo(x + half, top);
      context.lineTo(x + half * 0.55, top + 22);
      context.lineTo(x + half * 0.1, top + 44 + random() * 20);
      context.lineTo(x - half * 0.4, top + 26);
      context.closePath(); context.fill();
      context.fillStyle = 'rgba(255,140,110,0.22)';
      context.beginPath(); context.moveTo(x + half * 0.1, top); context.lineTo(x + half, top); context.lineTo(x + half * 0.55, top + 22); context.closePath(); context.fill();
      const towers = 1 + Math.floor(random() * 3);
      for (let tower = 0; tower < towers; tower++) {
        const tx = x - half * 0.5 + tower * half * 0.5 + random() * 6;
        const tall = 26 + random() * 40;
        context.fillStyle = '#26102f';
        context.beginPath(); spire(context, tx, top + 1, 14 + tall * 0.25, tall); context.fill();
        context.strokeStyle = 'rgba(255,170,120,0.35)';
        context.lineWidth = 0.6;
        context.beginPath(); context.moveTo(tx + 1, top - tall + 2); context.quadraticCurveTo(tx + (14 + tall * 0.25) * 0.5, top - tall * 0.5, tx + (14 + tall * 0.25) / 2, top); context.stroke();
        context.fillStyle = 'rgba(255,205,120,0.9)';
        for (let window = 0; window < 2; window++) context.fillRect(tx - 1 + window * 0.2, top - tall * (0.3 + window * 0.25), 1.6, 2.2);
      }
      // hanging roots
      context.strokeStyle = 'rgba(40,16,50,0.8)'; context.lineWidth = 0.8;
      for (let root = 0; root < 4; root++) { const rx = x - half * 0.3 + root * half * 0.25; context.beginPath(); context.moveTo(rx, top + 18); context.lineTo(rx + 2, top + 30 + random() * 26); context.stroke(); }
    }
  } else {
    // near broken arches and rocks, very dark, strong rim light
    for (let piece = 0; piece < 3; piece++) {
      const x = (piece + 0.2 + random() * 0.6) * widthUnits / 3;
      const base = 205 + random() * 30;
      const arch = random() < 0.6;
      context.fillStyle = '#170a1f';
      if (arch) {
        const span = 46 + random() * 30, rise = 60 + random() * 40;
        context.beginPath();
        context.moveTo(x - span / 2 - 9, VIEW_HEIGHT); context.lineTo(x - span / 2 - 9, base - rise * 0.6);
        context.quadraticCurveTo(x, base - rise * 1.25, x + span / 2 + 9, base - rise * 0.6);
        context.lineTo(x + span / 2 + 9, base - rise * 0.35); // broken top on the right
        context.lineTo(x + span / 2 + 4, base - rise * 0.3);
        context.lineTo(x + span / 2 + 4, VIEW_HEIGHT); context.lineTo(x + span / 2 - 4, VIEW_HEIGHT);
        context.lineTo(x + span / 2 - 4, base - rise * 0.52);
        context.quadraticCurveTo(x, base - rise * 1.02, x - span / 2, base - rise * 0.52);
        context.lineTo(x - span / 2, VIEW_HEIGHT); context.closePath(); context.fill();
        context.strokeStyle = 'rgba(255,150,90,0.5)'; context.lineWidth = 1;
        context.beginPath(); context.moveTo(x + span / 2 + 9, VIEW_HEIGHT); context.lineTo(x + span / 2 + 9, base - rise * 0.6); context.stroke();
      } else {
        const half = 18 + random() * 16;
        const top = 140 + random() * 50;
        context.beginPath(); context.moveTo(x - half, top); context.lineTo(x + half, top + 4); context.lineTo(x + half * 0.4, top + 30); context.lineTo(x - half * 0.6, top + 18); context.closePath(); context.fill();
        context.strokeStyle = 'rgba(255,150,90,0.55)'; context.lineWidth = 0.9;
        context.beginPath(); context.moveTo(x - half, top); context.lineTo(x + half, top + 4); context.lineTo(x + half * 0.4, top + 30); context.stroke();
        // a chain hanging from the sky
        context.strokeStyle = 'rgba(30,14,40,0.9)'; context.lineWidth = 0.8;
        context.setLineDash([2, 1.5]); context.beginPath(); context.moveTo(x, 0); context.lineTo(x, top); context.stroke(); context.setLineDash([]);
      }
    }
  }
  return canvas;
}

function makeVignette(width: number, height: number, rgb: string, inner: number, alpha: number) {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const radius = Math.hypot(width, height) / 2;
  const gradient = context.createRadialGradient(width / 2, height * 0.48, radius * inner, width / 2, height / 2, radius);
  gradient.addColorStop(0, `rgba(${rgb},0)`);
  gradient.addColorStop(1, `rgba(${rgb},${alpha})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function makeFog() {
  const canvas = makeCanvas(256, 96);
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 48, 4, 128, 48, 128);
  gradient.addColorStop(0, 'rgba(255,215,235,0.42)');
  gradient.addColorStop(1, 'rgba(255,215,235,0)');
  context.fillStyle = gradient;
  context.save(); context.scale(1, 96 / 256); context.translate(0, 0);
  context.beginPath(); context.arc(128, 128, 128, 0, Math.PI * 2); context.fill(); context.restore();
  return canvas;
}

export function createScene(context: Context, width: number, height: number): Scene {
  const scale = height / VIEW_HEIGHT;
  const viewWidth = width / scale;
  const sunX = width * 0.74, sunY = height * 0.6;
  const bodyGradient = context.createLinearGradient(0, 120, 0, 320);
  bodyGradient.addColorStop(0, '#7b3e4c');
  bodyGradient.addColorStop(0.35, '#4c2140');
  bodyGradient.addColorStop(1, '#14081a');
  const pillarGradient = context.createLinearGradient(0, 100, 0, 320);
  pillarGradient.addColorStop(0, '#83505a');
  pillarGradient.addColorStop(0.4, '#4a2440');
  pillarGradient.addColorStop(1, '#14081a');
  const haze = (top: number, color: string, alpha: number) => {
    const gradient = context.createLinearGradient(0, top * height, 0, height);
    gradient.addColorStop(0, `rgba(${color},0)`);
    gradient.addColorStop(0.5, `rgba(${color},${alpha})`);
    gradient.addColorStop(1, `rgba(${color},${alpha * 1.3})`);
    return gradient;
  };
  return {
    context, scale, viewWidth, sunX, sunY,
    sky: makeSky(width, height, sunX, sunY, scale),
    rays: makeRays(Math.ceil(height * 1.9)),
    layers: [
      { canvas: makeLayer(0, 720, scale), factor: 0.06, widthPixels: 720 * scale },
      { canvas: makeLayer(1, 820, scale), factor: 0.18, widthPixels: 820 * scale },
      { canvas: makeLayer(2, 640, scale), factor: 0.42, widthPixels: 640 * scale },
    ],
    glow: Object.fromEntries((Object.keys(GLOW_RGB) as GlowColor[]).map(name => [name, makeGlow(GLOW_RGB[name])])) as Record<GlowColor, HTMLCanvasElement>,
    fog: makeFog(),
    vignette: makeVignette(width, height, '8,2,16', 0.45, 0.7),
    danger: makeVignette(width, height, '200,20,140', 0.35, 0.85),
    bodyGradient, pillarGradient,
    hazeGradients: [haze(0.45, '255,150,150', 0.28), haze(0.55, '200,90,150', 0.3), haze(0.7, '90,30,90', 0.45)],
  };
}

// ---------------------------------------------------------------- world pieces

function drawBlock(context: Context, scene: Scene, x: number, y: number, w: number, h: number, kind: PlatformKind, exposedLeft: boolean, exposedRight: boolean, voidGap: number) {
  const isPillar = kind === PlatformKind.Pillar;
  const bottom = Math.min(y + h, VIEW_HEIGHT + 60);
  context.fillStyle = isPillar ? scene.pillarGradient : scene.bodyGradient;
  context.fillRect(x - 0.05, y + 5, w + 0.1, bottom - y - 5);
  // low-poly facets on the face
  const seed = hash(x * 0.37);
  context.fillStyle = 'rgba(255,190,150,0.08)';
  context.beginPath(); context.moveTo(x, y + 6); context.lineTo(x + w * (0.4 + seed * 0.4), y + 6); context.lineTo(x, y + 26 + seed * 14); context.closePath(); context.fill();
  context.fillStyle = 'rgba(0,0,0,0.14)';
  context.beginPath(); context.moveTo(x + w, y + 14); context.lineTo(x + w, y + 46); context.lineTo(x + w * (0.3 + seed * 0.3), y + 46); context.closePath(); context.fill();
  if (isPillar) {
    context.fillStyle = 'rgba(0,0,0,0.16)';
    for (let flute = x + 6; flute < x + w - 3; flute += 8) context.fillRect(flute, y + 12, 2, bottom - y - 12);
    context.fillStyle = 'rgba(255,200,140,0.1)';
    for (let flute = x + 8; flute < x + w - 3; flute += 8) context.fillRect(flute, y + 12, 1, bottom - y - 12);
  } else {
    // carved frieze with gold studs
    context.fillStyle = 'rgba(20,6,24,0.28)';
    context.fillRect(x, y + 11, w, 6);
    context.fillStyle = 'rgba(255,205,110,0.75)';
    for (let stud = x + 4; stud < x + w; stud += 8) context.fillRect(stud, y + 13.2, 1.6, 1.6);
  }
  // sandstone cap, rim-lit
  context.fillStyle = '#e2a26c';
  context.fillRect(x - 0.05, y, w + 0.1, 5);
  context.fillStyle = '#ffe3b4';
  context.fillRect(x - 0.05, y, w + 0.1, 1.1);
  context.fillStyle = 'rgba(70,20,40,0.45)';
  context.fillRect(x - 0.05, y + 5, w + 0.1, 1.2);
  if (exposedRight) {
    const rim = context.createLinearGradient(0, y, 0, y + 60);
    rim.addColorStop(0, 'rgba(255,190,120,0.9)'); rim.addColorStop(1, 'rgba(255,140,100,0)');
    context.fillStyle = rim;
    context.fillRect(x + w - 1.3, y, 1.3, 60);
  }
  if (exposedLeft) { context.fillStyle = 'rgba(10,2,16,0.35)'; context.fillRect(x, y, 2.5, bottom - y); }
  // cracks glowing as the Pralay closes in
  if (voidGap < 90) {
    const heat = 1 - Math.max(0, voidGap) / 90;
    context.strokeStyle = `rgba(255,${Math.round(90 + 80 * (1 - heat))},200,${(0.25 + heat * 0.6).toFixed(3)})`;
    context.lineWidth = 0.8;
    context.beginPath();
    const cx = x + w * (0.3 + seed * 0.4);
    context.moveTo(cx, y); context.lineTo(cx - 3, y + 8); context.lineTo(cx + 2, y + 16); context.lineTo(cx - 2, y + 28);
    context.moveTo(cx - 3, y + 8); context.lineTo(cx - 9, y + 12);
    context.stroke();
  }
}

function drawLedge(context: Context, x: number, y: number, w: number, crumbling: boolean, crumbleTimer: number, clock: number) {
  let offsetX = 0;
  if (crumbling && crumbleTimer >= 0) offsetX = Math.sin(clock * 90) * 0.8;
  x += offsetX;
  context.fillStyle = crumbling ? '#4a1d33' : '#3f1d44';
  context.beginPath();
  context.moveTo(x, y + 4); context.lineTo(x + w, y + 4); context.lineTo(x + w - 5, y + 10); context.lineTo(x + w * 0.62, y + 17);
  context.lineTo(x + w * 0.38, y + 13); context.lineTo(x + 4, y + 10); context.closePath(); context.fill();
  context.fillStyle = 'rgba(255,150,120,0.18)';
  context.beginPath(); context.moveTo(x + w * 0.5, y + 4); context.lineTo(x + w, y + 4); context.lineTo(x + w - 5, y + 10); context.closePath(); context.fill();
  context.fillStyle = crumbling ? '#c7795c' : '#dca57a';
  context.fillRect(x, y, w, 4.2);
  context.fillStyle = crumbling ? '#ffc6a0' : '#fff0c8';
  context.fillRect(x, y, w, 1);
  if (crumbling) {
    context.strokeStyle = 'rgba(60,10,20,0.8)'; context.lineWidth = 0.7;
    context.beginPath();
    for (let crack = x + 7; crack < x + w - 4; crack += 13) { context.moveTo(crack, y); context.lineTo(crack + 2, y + 3); context.lineTo(crack - 1, y + 8); }
    context.stroke();
  } else {
    // hanging crystal (its light is added in the light pass)
    const cx = x + w * 0.62;
    context.fillStyle = '#8ff6ff';
    context.beginPath(); context.moveTo(cx - 2, y + 16); context.lineTo(cx + 2, y + 16); context.lineTo(cx, y + 23); context.closePath(); context.fill();
  }
}

function drawSpikes(context: Context, x: number, y: number, w: number) {
  for (let spike = x; spike < x + w - 0.5; spike += 8) {
    context.fillStyle = '#2d1a2c';
    context.beginPath(); context.moveTo(spike, y); context.lineTo(spike + 4, y - 8); context.lineTo(spike + 8, y); context.closePath(); context.fill();
    context.fillStyle = '#9b5f58';
    context.beginPath(); context.moveTo(spike + 4, y - 8); context.lineTo(spike + 8, y); context.lineTo(spike + 5, y); context.closePath(); context.fill();
    context.fillStyle = '#ff7a4a';
    context.fillRect(spike + 3.4, y - 8, 1.2, 1.6);
  }
}

function drawVent(context: Context, x: number, y: number, cycle: number, clock: number) {
  context.fillStyle = '#26121e';
  context.fillRect(x - 8, y - 3, 16, 3.5);
  const warming = cycle > VENT_PERIOD - 0.5;
  context.fillStyle = cycle < VENT_ACTIVE ? '#ffd27a' : warming ? '#ff8a3a' : '#7a2a1a';
  for (let slit = -6; slit <= 4; slit += 4) context.fillRect(x + slit, y - 2, 2, 1.2);
  if (cycle < VENT_ACTIVE) {
    const grow = Math.min(1, cycle / 0.12) * Math.min(1, (VENT_ACTIVE - cycle) / 0.15);
    const height = 54 * grow;
    context.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const width = (8 - layer * 2.3) * (1 + Math.sin(clock * 40 + layer) * 0.12);
      const gradient = context.createLinearGradient(0, y, 0, y - height);
      const colors = [['255,90,40', '255,40,20'], ['255,170,60', '255,90,30'], ['255,245,200', '255,200,100']][layer];
      gradient.addColorStop(0, `rgba(${colors[0]},0.9)`);
      gradient.addColorStop(0.7, `rgba(${colors[1]},0.45)`);
      gradient.addColorStop(1, `rgba(${colors[1]},0)`);
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(x - width / 2, y - 2);
      context.quadraticCurveTo(x - width * 0.7 + Math.sin(clock * 23) * 1.5, y - height * 0.5, x + Math.sin(clock * 31 + layer) * 2, y - height);
      context.quadraticCurveTo(x + width * 0.7 + Math.cos(clock * 19) * 1.5, y - height * 0.5, x + width / 2, y - 2);
      context.closePath(); context.fill();
    }
    context.globalCompositeOperation = 'source-over';
  } else if (warming) {
    context.fillStyle = 'rgba(255,190,90,0.9)';
    for (let spark = 0; spark < 3; spark++) {
      const t = (clock * 2.2 + spark / 3) % 1;
      context.fillRect(x - 4 + spark * 4 + Math.sin(clock * 9 + spark) * 1.5, y - 3 - t * 10, 1, 1);
    }
  }
}

function drawGem(context: Context, x: number, y: number, clock: number) {
  const bob = Math.sin(clock * 2.4 + x * 0.05) * 1.8;
  const turn = Math.cos(clock * 3 + x * 0.1);
  const half = 4.2 * Math.max(0.25, Math.abs(turn));
  y += bob;
  context.fillStyle = '#3fd6ff';
  context.beginPath(); context.moveTo(x, y - 7); context.lineTo(x + half, y - 1); context.lineTo(x, y + 6); context.lineTo(x - half, y - 1); context.closePath(); context.fill();
  context.fillStyle = turn > 0 ? '#e6fdff' : '#9cf0ff';
  context.beginPath(); context.moveTo(x, y - 7); context.lineTo(x + half * Math.sign(turn || 1), y - 1); context.lineTo(x, y - 1); context.closePath(); context.fill();
  context.fillStyle = '#ffd77a';
  context.fillRect(x - 0.6, y - 1.6, 1.2, 1.2);
}

function drawLotus(context: Context, x: number, y: number, clock: number) {
  y += Math.sin(clock * 2 + x) * 1.6;
  const petals: [number, number][] = [[-0.9, 0.85], [0.9, 0.85], [0, 1]];
  for (const [angle, length] of petals) {
    context.save(); context.translate(x, y + 3); context.rotate(angle * 0.7);
    context.fillStyle = angle === 0 ? '#ffb3d6' : '#ff73b0';
    context.beginPath(); context.moveTo(0, 0); context.quadraticCurveTo(-3.4, -5 * length, 0, -9 * length); context.quadraticCurveTo(3.4, -5 * length, 0, 0); context.fill();
    context.restore();
  }
  context.fillStyle = '#ffe39a'; context.fillRect(x - 1, y + 1, 2, 2);
}

function drawLamp(context: Context, x: number, y: number, clock: number) {
  context.fillStyle = '#2a1424';
  context.fillRect(x - 1, y - 32, 2, 32);
  context.fillStyle = '#b8803c';
  context.fillRect(x - 3, y - 33, 6, 1.6);
  context.fillRect(x - 2.5, y - 2, 5, 2);
  // the diya bowl and its flame
  context.fillStyle = '#c86a2a';
  context.beginPath(); context.ellipse(x, y - 34.5, 3.6, 1.6, 0, 0, Math.PI); context.fill();
  const flicker = Math.sin(clock * 17 + x) * 0.6;
  context.fillStyle = '#ffd36e';
  context.beginPath(); context.moveTo(x - 1.5, y - 35); context.quadraticCurveTo(x + flicker, y - 41, x + flicker * 0.5, y - 42); context.quadraticCurveTo(x + 1.8, y - 38, x + 1.5, y - 35); context.fill();
  context.fillStyle = '#fff6da'; context.fillRect(x - 0.5, y - 37.5, 1, 2);
}

function drawShade(context: Context, x: number, y: number, facing: number, flash: number, timer: number) {
  const sway = Math.sin(timer * 6) * 1.2;
  context.fillStyle = flash > 0 ? '#ffffff' : '#160a1e';
  context.beginPath();
  context.moveTo(x - 7, y);
  for (let step = 0; step <= 4; step++) {
    const px = x - 7 + step * 3.5;
    context.lineTo(px, y - (step % 2 ? 2.8 : 0) + Math.sin(timer * 10 + step) * 0.8);
  }
  context.quadraticCurveTo(x + 7.5 + sway, y - 9, x + 4 + sway * 0.5, y - 14);
  context.arc(x + sway * 0.4, y - 13.5, 5.2, -0.2, Math.PI + 0.2, true);
  context.quadraticCurveTo(x - 7.5 + sway, y - 9, x - 7, y);
  context.fill();
  if (flash <= 0) {
    context.strokeStyle = 'rgba(255,110,200,0.55)';
    context.lineWidth = 0.8;
    context.beginPath(); context.arc(x + sway * 0.4, y - 13.5, 5.2, -1.3, 0.3); context.stroke();
  }
  context.fillStyle = '#ff5a3c';
  const eye = x + sway * 0.4 + facing * 1.8;
  context.fillRect(eye - 2.2, y - 15, 1.6, 1.3);
  context.fillRect(eye + 0.8, y - 15, 1.6, 1.3);
}

function drawWisp(context: Context, x: number, y: number, facing: number, flash: number, timer: number) {
  const cy = y - 6;
  const flap = Math.sin(timer * 14) * 4;
  context.fillStyle = flash > 0 ? '#ffffff' : '#3b1d6e';
  context.beginPath(); context.moveTo(x - 2, cy); context.lineTo(x - 13, cy - 4 - flap); context.lineTo(x - 8, cy + 2); context.closePath(); context.fill();
  context.beginPath(); context.moveTo(x + 2, cy); context.lineTo(x + 13, cy - 4 - flap); context.lineTo(x + 8, cy + 2); context.closePath(); context.fill();
  const gradient = context.createRadialGradient(x, cy, 0.5, x, cy, 7);
  gradient.addColorStop(0, flash > 0 ? '#ffffff' : '#e5d4ff');
  gradient.addColorStop(0.5, '#8a5cff');
  gradient.addColorStop(1, 'rgba(90,40,200,0)');
  context.fillStyle = gradient;
  context.beginPath(); context.arc(x, cy, 7, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#1a0830';
  context.beginPath(); context.arc(x + facing * 1.6, cy, 1.5, 0, Math.PI * 2); context.fill();
}

function drawIdol(context: Context, x: number, y: number, facing: number, flash: number, timer: number) {
  context.fillStyle = flash > 0 ? '#ffffff' : '#5a4568';
  context.beginPath();
  context.moveTo(x - 9, y); context.lineTo(x + 9, y); context.lineTo(x + 7, y - 20); context.lineTo(x + 4, y - 26); context.lineTo(x - 4, y - 26); context.lineTo(x - 7, y - 20); context.closePath(); context.fill();
  if (flash <= 0) {
    context.fillStyle = 'rgba(255,170,110,0.35)';
    context.beginPath(); context.moveTo(x + 2, y); context.lineTo(x + 9, y); context.lineTo(x + 7, y - 20); context.lineTo(x + 4, y - 26); context.lineTo(x + 2, y - 26); context.closePath(); context.fill();
    context.fillStyle = '#3a2a48';
    context.fillRect(x - 6, y - 23, 12, 1.6); // brow
    context.fillRect(x - 4, y - 9, 8, 2.2); // mouth
    context.fillStyle = '#d8a24a';
    context.fillRect(x - 5, y - 28, 10, 2); // crown band
    context.beginPath(); context.moveTo(x - 3, y - 28); context.lineTo(x, y - 33); context.lineTo(x + 3, y - 28); context.fill();
  }
  const charge = timer > 1.9 ? Math.min(1, (timer - 1.9) / 0.5) : 0;
  context.fillStyle = charge > 0 ? `rgb(255,${Math.round(200 - charge * 120)},${Math.round(120 - charge * 90)})` : '#a86a3a';
  context.beginPath(); context.arc(x + facing * 1.2, y - 18.5, 2.4 + charge * 0.8, 0, Math.PI * 2); context.fill();
}

/** Aru: a hooded lamp-bearer in a saffron tunic with a long glowing scarf. */
function drawHero(context: Context, x: number, y: number, facing: number, pose: Pose, stride: number, velocityX: number, velocityY: number, clock: number, shotCooldown: number) {
  const phase = stride * 0.12;
  const running = pose === Pose.Run;
  const airborne = pose === Pose.Rise || pose === Pose.Fall;
  const dashing = pose === Pose.Dash;
  const lean = dashing ? 0.35 : running ? 0.12 : 0;
  context.save();
  context.translate(x, y);
  context.scale(1.2, 1.2); // drawn a touch larger than the 10×18 hitbox: easier to read, forgiving to play
  if (pose === Pose.Dead) context.rotate(-facing * Math.min(1.4, clock % 10));
  context.rotate(facing * lean);
  // scarf, trailing behind and waving
  context.lineCap = 'round';
  let px = -facing * 1, py = -14;
  for (let segment = 1; segment <= 7; segment++) {
    const nx = -facing * (1 + segment * 3.3) - velocityX * 0.006 * segment;
    const ny = -14 + Math.sin(clock * 13 - segment * 0.9) * (0.6 + segment * 0.35) + Math.max(-4, Math.min(4, velocityY * 0.008)) * segment * 0.5;
    context.strokeStyle = segment < 4 ? '#58f0dd' : '#2fc6c9';
    context.lineWidth = 2.6 - segment * 0.25;
    context.beginPath(); context.moveTo(px, py); context.lineTo(nx, ny); context.stroke();
    px = nx; py = ny;
  }
  // legs
  context.strokeStyle = '#2a1c40';
  context.lineWidth = 2.3;
  const legSwing = running ? Math.sin(phase) * 4.2 : airborne ? 2.5 : dashing ? 3.5 : 0;
  const tuck = airborne ? 2.5 : 0;
  context.beginPath(); context.moveTo(-1, -6); context.lineTo(-1 + legSwing * facing, -tuck - (running ? Math.max(0, Math.cos(phase)) * 1.5 : 0)); context.stroke();
  context.beginPath(); context.moveTo(1, -6); context.lineTo(1 - legSwing * facing, -tuck * 0.4 - (running ? Math.max(0, -Math.cos(phase)) * 1.5 : 0)); context.stroke();
  // tunic
  context.fillStyle = '#ff9638';
  context.beginPath(); context.moveTo(-4.4, -5); context.lineTo(4.4, -5); context.lineTo(3.2, -13.5); context.lineTo(-3.2, -13.5); context.closePath(); context.fill();
  context.fillStyle = '#d4601e';
  context.beginPath(); context.moveTo(-facing * 4.4, -5); context.lineTo(-facing * 1, -5); context.lineTo(-facing * 1, -13.5); context.lineTo(-facing * 3.2, -13.5); context.closePath(); context.fill();
  context.fillStyle = '#ffd36a';
  context.fillRect(-3.8, -8.6, 7.6, 1.3);
  // arm: reaching forward while shooting
  context.strokeStyle = '#c98a5c';
  context.lineWidth = 1.8;
  const shooting = shotCooldown > 0.08;
  context.beginPath(); context.moveTo(facing * 1.5, -12); context.lineTo(facing * (shooting ? 7 : 2.5 + Math.sin(phase + 1) * (running ? 2.5 : 0.5)), shooting ? -11 : -7.5); context.stroke();
  // head with hood and topknot
  context.fillStyle = '#c98a5c';
  context.beginPath(); context.arc(facing * 0.6, -16.6, 3.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#1e1226';
  context.beginPath(); context.arc(facing * 0.6, -16.6, 3.7, Math.PI * (facing > 0 ? 0.55 : -0.45) , Math.PI * (facing > 0 ? 1.95 : 0.95)); context.fill();
  context.beginPath(); context.arc(-facing * 1.6, -20.3, 1.6, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#fff';
  context.fillRect(facing * 2.2 - 0.5, -17.3, 1, 1);
  // rim light from the sun (it sits to the right)
  context.strokeStyle = 'rgba(255,220,160,0.85)';
  context.lineWidth = 0.7;
  context.beginPath(); context.arc(facing * 0.6, -16.6, 3.6, -1.2, 0.7); context.stroke();
  context.beginPath(); context.moveTo(3.3, -13.3); context.lineTo(4.5, -5.2); context.stroke();
  context.restore();
}

// ---------------------------------------------------------------- the frame

/** Draw one frame from the wasm render buffer. */
export function drawFrame(scene: Scene, render: Float32Array, visual: VisualState, now: number) {
  const { context, scale, viewWidth } = scene;
  const width = context.canvas.width, height = context.canvas.height;
  const clock = render[RenderSlot.clock];
  const frameSeconds = Math.min(0.05, Math.max(0, now - visual.lastClock));
  visual.lastClock = now;
  const cameraX = render[RenderSlot.cameraX];
  const voidX = render[RenderSlot.voidX];
  const heroX = render[RenderSlot.heroX], heroY = render[RenderSlot.heroY];
  const gap = heroX - voidX;

  visual.shake = Math.max(0, visual.shake - frameSeconds * 3);
  if (gap < 70 && render[RenderSlot.phase] === 1) visual.shake = Math.max(visual.shake, (1 - gap / 70) * 0.6);
  visual.hurtFlash = Math.max(0, visual.hurtFlash - frameSeconds * 2.5);
  const shakeX = (Math.sin(now * 61) + Math.sin(now * 37)) * visual.shake * 1.2 * scale;
  const shakeY = (Math.cos(now * 53) + Math.sin(now * 29)) * visual.shake * 1.0 * scale;

  // ----- sky, rays and parallax
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.drawImage(scene.sky, 0, 0);
  context.globalCompositeOperation = 'lighter';
  const raysSize = scene.rays.width;
  context.save();
  context.translate(scene.sunX, scene.sunY);
  context.rotate(now * 0.03);
  context.globalAlpha = 0.5 + Math.sin(now * 0.7) * 0.12;
  context.drawImage(scene.rays, -raysSize / 2, -raysSize / 2);
  context.rotate(-now * 0.05 + 0.4);
  context.globalAlpha = 0.28;
  context.drawImage(scene.rays, -raysSize / 2, -raysSize / 2);
  context.restore();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  for (let index = 0; index < scene.layers.length; index++) {
    const layer = scene.layers[index];
    let x = -(((cameraX * layer.factor * scale) % layer.widthPixels) + layer.widthPixels) % layer.widthPixels;
    for (; x < width; x += layer.widthPixels) context.drawImage(layer.canvas, Math.floor(x), index === 2 ? shakeY * 0.5 : 0);
    context.fillStyle = scene.hazeGradients[index];
    context.fillRect(0, 0, width, height);
  }

  // ----- the world
  context.setTransform(scale, 0, 0, scale, -cameraX * scale + shakeX, shakeY);
  const platformCount = render[RenderSlot.platformCount];
  const left = cameraX - 20, right = cameraX + viewWidth + 20;
  for (let index = 0; index < platformCount; index++) {
    const offset = RenderSlot.platforms + index * RenderSlot.platformStride;
    const x = render[offset], y = render[offset + 1], w = render[offset + 2], h = render[offset + 3];
    if (x + w < left || x > right || y > VIEW_HEIGHT + 10) continue;
    const kind = render[offset + 4] as PlatformKind, crumble = render[offset + 5], fall = render[offset + 6];
    if (fall > 0) {
      context.save();
      const pivotX = x + w / 2;
      context.translate(pivotX, y);
      context.rotate((hash(x) < 0.5 ? -1 : 1) * fall * 0.004);
      context.translate(-pivotX, -y);
      context.globalAlpha = Math.max(0, 1 - fall / 300);
    }
    if (kind === PlatformKind.Ledge || kind === PlatformKind.Crumble) drawLedge(context, x, y, w, kind === PlatformKind.Crumble, crumble, clock);
    else {
      const previous = index > 0 ? RenderSlot.platforms + (index - 1) * RenderSlot.platformStride : -1;
      const next = index + 1 < platformCount ? RenderSlot.platforms + (index + 1) * RenderSlot.platformStride : -1;
      const touchesLeft = previous >= 0 && Math.abs(render[previous] + render[previous + 2] - x) < 0.5 && render[previous + 1] <= y + 0.5 && render[previous + 6] === 0;
      const touchesRight = next >= 0 && Math.abs(render[next] - x - w) < 0.5 && render[next + 1] <= y + 0.5;
      drawBlock(context, scene, x, y, w, h, kind, !touchesLeft, !touchesRight, x - voidX);
    }
    if (fall > 0) context.restore();
  }

  // props
  const propCount = render[RenderSlot.propCount];
  for (let index = 0; index < propCount; index++) {
    const offset = RenderSlot.props + index * RenderSlot.propStride;
    const kind = render[offset] as PropKind, x = render[offset + 1], y = render[offset + 2], w = render[offset + 3], state = render[offset + 4];
    if (x + w < left || x > right || y > VIEW_HEIGHT + 40) continue;
    if (kind === PropKind.Spikes) drawSpikes(context, x, y, w);
    else if (kind === PropKind.Vent) drawVent(context, x, y, state, clock);
    else if (kind === PropKind.Gem) drawGem(context, x, y, clock);
    else if (kind === PropKind.Heart) drawLotus(context, x, y, clock);
    else drawLamp(context, x, y, clock);
  }

  // enemies
  const enemyCount = render[RenderSlot.enemyCount];
  for (let index = 0; index < enemyCount; index++) {
    const offset = RenderSlot.enemies + index * RenderSlot.enemyStride;
    const kind = render[offset] as EnemyKind, x = render[offset + 1], y = render[offset + 2], facing = render[offset + 3], flash = render[offset + 4], timer = render[offset + 5];
    if (x < left || x > right) continue;
    if (kind === EnemyKind.Shade) drawShade(context, x, y, facing, flash, timer);
    else if (kind === EnemyKind.Wisp) drawWisp(context, x, y, facing, flash, timer);
    else drawIdol(context, x, y, facing, flash, timer);
  }

  // hero, with dash afterimages
  const pose = render[RenderSlot.heroPose] as Pose;
  const facing = render[RenderSlot.heroFacing];
  const dash = render[RenderSlot.heroDash];
  if (dash > 0) visual.trail.push({ x: heroX, y: heroY, facing, age: 0 });
  for (const ghost of visual.trail) ghost.age += frameSeconds;
  while (visual.trail.length && (visual.trail[0].age > 0.22 || visual.trail.length > 10)) visual.trail.shift();
  if (visual.trail.length) {
    context.globalCompositeOperation = 'lighter';
    for (const ghost of visual.trail) {
      context.globalAlpha = Math.max(0, 0.5 * (1 - ghost.age / 0.22));
      context.drawImage(scene.glow.cyan, ghost.x - 12, ghost.y - 22, 24, 26);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }
  const invulnerable = render[RenderSlot.heroInvulnerable];
  const blink = invulnerable > 0 && pose !== Pose.Dead && Math.floor(now * 14) % 2 === 0;
  const dyingTime = render[RenderSlot.dyingTime];
  if (!blink && !(pose === Pose.Dead && dyingTime > 0.9)) {
    if (pose === Pose.Dead) context.globalAlpha = Math.max(0, 1 - dyingTime / 0.9);
    drawHero(context, heroX, heroY, facing, pose, render[RenderSlot.heroStride], render[RenderSlot.heroVelocityX], render[RenderSlot.heroVelocityY], pose === Pose.Dead ? dyingTime * 4 : clock, render[RenderSlot.shotCooldown]);
    context.globalAlpha = 1;
  }

  // ----- additive light pass
  context.globalCompositeOperation = 'lighter';
  const glow = (color: GlowColor, x: number, y: number, radius: number, alpha: number) => {
    if (x + radius < left || x - radius > right || alpha <= 0.01) return;
    context.globalAlpha = Math.min(1, alpha);
    context.drawImage(scene.glow[color], x - radius, y - radius, radius * 2, radius * 2);
  };
  if (pose !== Pose.Dead) {
    glow('warm', heroX, heroY - 10, 46, 0.32);
    glow('cyan', heroX - facing * 10, heroY - 14, 16, 0.3);
    if (dash > 0) glow('cyan', heroX, heroY - 9, 34, 0.6 * dash / DASH_SECONDS);
  }
  for (let index = 0; index < platformCount; index++) {
    const offset = RenderSlot.platforms + index * RenderSlot.platformStride;
    if (render[offset + 4] === PlatformKind.Ledge) glow('cyan', render[offset] + render[offset + 2] * 0.62, render[offset + 1] + 19, 14, 0.5);
  }
  for (let index = 0; index < propCount; index++) {
    const offset = RenderSlot.props + index * RenderSlot.propStride;
    const kind = render[offset] as PropKind, x = render[offset + 1], y = render[offset + 2], w = render[offset + 3], state = render[offset + 4];
    if (kind === PropKind.Lamp) { glow('warm', x, y - 38, 62, 0.55 + Math.sin(clock * 9 + x) * 0.06); glow('gold', x, y - 38, 12, 0.8); }
    else if (kind === PropKind.Gem) glow('cyan', x, y + Math.sin(clock * 2.4 + x * 0.05) * 1.8, 17, 0.62);
    else if (kind === PropKind.Heart) glow('pink', x, y, 22, 0.7);
    else if (kind === PropKind.Spikes) glow('red', x + w / 2, y - 6, 10 + w * 0.4, 0.3);
    else if (kind === PropKind.Vent) {
      if (state < VENT_ACTIVE) { glow('warm', x, y - 22, 52, 0.85); glow('red', x, y - 5, 22, 0.6); }
      else if (state > VENT_PERIOD - 0.5) glow('red', x, y - 4, 14, 0.6);
    }
  }
  for (let index = 0; index < enemyCount; index++) {
    const offset = RenderSlot.enemies + index * RenderSlot.enemyStride;
    const kind = render[offset] as EnemyKind, x = render[offset + 1], y = render[offset + 2], timer = render[offset + 5];
    if (kind === EnemyKind.Shade) { glow('magenta', x, y - 9, 18, 0.28); glow('red', x, y - 14.5, 9, 0.7); }
    else if (kind === EnemyKind.Wisp) glow('violet', x, y - 6, 30, 0.6);
    else {
      const charge = timer > 1.9 ? Math.min(1, (timer - 1.9) / 0.5) : 0;
      glow('warm', x, y - 18.5, 9 + charge * 22, 0.4 + charge * 0.6);
    }
  }
  const bulletCount = render[RenderSlot.bulletCount];
  for (let index = 0; index < bulletCount; index++) {
    const offset = RenderSlot.bullets + index * RenderSlot.bulletStride;
    const fromHero = render[offset] === 1, x = render[offset + 1], y = render[offset + 2], vx = render[offset + 3], vy = render[offset + 4];
    context.globalAlpha = 1;
    if (fromHero) {
      context.strokeStyle = 'rgba(200,255,255,0.95)'; context.lineWidth = 2; context.lineCap = 'round';
      context.beginPath(); context.moveTo(x - vx * 0.03, y); context.lineTo(x, y); context.stroke();
      glow('cyan', x, y, 15, 0.85);
    } else {
      const pulse = 1 + Math.sin(clock * 20 + index) * 0.15;
      glow('magenta', x, y, 20 * pulse, 0.85);
      context.globalAlpha = 1;
      context.fillStyle = '#ffd0f0';
      context.beginPath(); context.arc(x, y, 2.6, 0, Math.PI * 2); context.fill();
      context.strokeStyle = 'rgba(255,80,190,0.6)'; context.lineWidth = 1.4;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - vx * 0.06, y - vy * 0.06); context.stroke();
    }
  }

  // effects
  const effectCount = render[RenderSlot.effectCount];
  for (let index = 0; index < effectCount; index++) {
    const offset = RenderSlot.effects + index * RenderSlot.effectStride;
    const kind = render[offset] as EffectKind, x = render[offset + 1], y = render[offset + 2], age = render[offset + 3], value = render[offset + 4];
    const life = 1 - age / 0.7;
    if (kind === EffectKind.Spark) {
      glow(value === 2 ? 'magenta' : 'gold', x, y, 10 + age * 30, life);
      context.globalAlpha = Math.max(0, life);
      context.strokeStyle = '#fff2c0'; context.lineWidth = 0.8;
      context.beginPath();
      for (let ray = 0; ray < 6; ray++) { const angle = ray / 6 * Math.PI * 2 + x; const r = 2 + age * 26; context.moveTo(x + Math.cos(angle) * r * 0.4, y + Math.sin(angle) * r * 0.4); context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); }
      context.stroke();
    } else if (kind === EffectKind.Burst) {
      const color: GlowColor = value === EnemyKind.Wisp ? 'violet' : value === EnemyKind.Idol ? 'warm' : 'magenta';
      glow(color, x, y, 18 + age * 50, life * 0.9);
      context.globalAlpha = Math.max(0, life);
      context.strokeStyle = `rgba(${GLOW_RGB[color]},1)`; context.lineWidth = 1.2;
      context.beginPath(); context.arc(x, y, 3 + age * 46, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#fff';
      for (let bit = 0; bit < 8; bit++) { const angle = bit / 8 * Math.PI * 2 + 0.3; const r = 4 + age * 60; context.fillRect(x + Math.cos(angle) * r, y + Math.sin(angle) * r + age * age * 40, 1.4, 1.4); }
    } else if (kind === EffectKind.Pickup) {
      glow(value > 0 ? 'cyan' : 'pink', x, y, 10 + age * 40, life * 0.8);
      context.globalAlpha = Math.max(0, life);
      context.strokeStyle = value > 0 ? '#bff8ff' : '#ffc2e0'; context.lineWidth = 1;
      context.beginPath(); context.arc(x, y, 3 + age * 24, 0, Math.PI * 2); context.stroke();
    } else if (kind === EffectKind.Hurt) {
      glow('red', x, y, 20 + age * 40, life);
    }
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  for (let index = 0; index < effectCount; index++) {
    const offset = RenderSlot.effects + index * RenderSlot.effectStride;
    const kind = render[offset] as EffectKind, x = render[offset + 1], y = render[offset + 2], age = render[offset + 3], value = render[offset + 4];
    if (kind === EffectKind.Score || (kind === EffectKind.Pickup && value > 0)) {
      const alpha = Math.max(0, 1 - age / 0.9);
      context.globalAlpha = alpha;
      context.font = '800 8px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = 'rgba(30,6,30,0.7)';
      context.fillText(`+${value}`, x + 0.6, y - 8 - age * 26 + 0.6);
      context.fillStyle = kind === EffectKind.Score ? '#ffd77a' : '#bff8ff';
      context.fillText(`+${value}`, x, y - 8 - age * 26);
    } else if (kind === EffectKind.Dust || kind === EffectKind.Crumble) {
      const alpha = Math.max(0, 0.6 * (1 - age / 0.7));
      context.globalAlpha = alpha;
      context.fillStyle = kind === EffectKind.Dust ? '#e9c3a0' : '#6a2a6e';
      for (let puff = 0; puff < 4; puff++) {
        const side = puff % 2 ? 1 : -1;
        const r = (kind === EffectKind.Dust ? 2 : 5) + age * (kind === EffectKind.Dust ? 8 : 16);
        context.beginPath(); context.arc(x + side * (3 + age * 22) * (puff < 2 ? 1 : 0.5), y - 2 - age * (kind === EffectKind.Dust ? 6 : 24) - puff * 2, r, 0, Math.PI * 2); context.fill();
      }
    }
  }
  context.globalAlpha = 1;

  // ----- the Pralay: a violet-black collapse with a burning, ragged edge
  drawVoid(context, scene, voidX, cameraX, now);

  // ----- screen-space finish: fog, motes, vignettes
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  const fogWidth = scene.fog.width * scale * 0.9, fogHeight = scene.fog.height * scale * 0.9;
  for (let puff = 0; puff < 7; puff++) {
    const speed = 1.25 + (puff % 3) * 0.12;
    const span = width + fogWidth;
    const x = ((((puff * 197 - cameraX * speed * scale - now * 8 * scale) % span) + span) % span) - fogWidth;
    const y = height - fogHeight * (0.75 + (puff % 2) * 0.25) + Math.sin(now * 0.4 + puff) * 4 * scale;
    context.globalAlpha = 0.55 + (puff % 3) * 0.12;
    context.drawImage(scene.fog, x, y, fogWidth, fogHeight);
  }
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = 'rgba(255,215,160,0.8)';
  for (let mote = 0; mote < 34; mote++) {
    const drift = (now * (6 + (mote % 5) * 2) + mote * 53) * scale;
    const x = (((hash(mote) * width - drift - cameraX * 0.7 * scale) % width) + width) % width;
    const y = (((hash(mote + 9) * height - now * (3 + (mote % 4)) * scale) % height) + height) % height;
    context.globalAlpha = 0.18 + 0.25 * (0.5 + 0.5 * Math.sin(now * 2 + mote));
    const size = (mote % 6 === 0 ? 1.4 : 0.8) * scale;
    context.fillRect(x, y, size, size);
  }
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  context.drawImage(scene.vignette, 0, 0);
  // the Pralay off-screen to the left: its glow leaks in from the edge as it closes in
  const offscreen = (cameraX - voidX) / (viewWidth * 0.6);
  if (offscreen > 0 && offscreen < 1 && render[RenderSlot.phase] !== 0) {
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = (1 - offscreen) * (0.55 + Math.sin(now * 6) * 0.15);
    context.drawImage(scene.glow.magenta, -height * 0.35, -height * 0.25, height * 0.7, height * 1.5);
    context.globalCompositeOperation = 'source-over';
  }
  context.globalAlpha = 1;
  if (render[RenderSlot.phase] === 1 && gap < 150) {
    context.globalAlpha = Math.min(1, (1 - gap / 150) * (0.75 + Math.sin(now * 9) * 0.25));
    context.drawImage(scene.danger, 0, 0);
  }
  if (visual.hurtFlash > 0) {
    context.globalAlpha = visual.hurtFlash * 0.35;
    context.fillStyle = '#ff2040';
    context.fillRect(0, 0, width, height);
  }
  context.globalAlpha = 1;
}

function drawVoid(context: Context, scene: Scene, voidX: number, cameraX: number, now: number) {
  const leftEdge = cameraX - 60;
  if (voidX < leftEdge - 40) return;
  const edgeAt = (y: number) => voidX + Math.sin(y * 0.07 + now * 2.1) * 6 + Math.sin(y * 0.19 - now * 3.3) * 3.5 + Math.sin(y * 0.5 + now * 7) * 1.2;
  const body = context.createLinearGradient(voidX - 140, 0, voidX + 8, 0);
  body.addColorStop(0, '#030007');
  body.addColorStop(0.7, 'rgba(18,2,30,0.97)');
  body.addColorStop(1, 'rgba(60,8,70,0.8)');
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(leftEdge, -20);
  for (let y = -20; y <= VIEW_HEIGHT + 20; y += 6) context.lineTo(edgeAt(y), y);
  context.lineTo(leftEdge, VIEW_HEIGHT + 20);
  context.closePath();
  context.fill();
  // inner stars of the void, drifting
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = 'rgba(190,120,255,0.8)';
  for (let star = 0; star < 26; star++) {
    const depth = 10 + hash(star) * 130;
    const x = voidX - depth + Math.sin(now * 0.8 + star) * 3;
    if (x < leftEdge) continue;
    const y = (hash(star + 40) * VIEW_HEIGHT + now * (4 + star % 5)) % VIEW_HEIGHT;
    context.globalAlpha = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(now * 3 + star));
    context.fillRect(x, y, 0.9, 0.9);
  }
  // the burning edge
  context.globalAlpha = 1;
  context.lineJoin = 'round';
  const strokeEdge = (style: string, lineWidth: number, offset: number) => {
    context.strokeStyle = style; context.lineWidth = lineWidth;
    context.beginPath();
    for (let y = -20; y <= VIEW_HEIGHT + 20; y += 6) { const x = edgeAt(y) + offset; if (y === -20) context.moveTo(x, y); else context.lineTo(x, y); }
    context.stroke();
  };
  strokeEdge('rgba(160,20,140,0.22)', 22, 4);
  strokeEdge('rgba(255,40,150,0.35)', 9, 1);
  strokeEdge('rgba(255,120,80,0.55)', 3.5, 0.5);
  strokeEdge('rgba(255,230,240,0.9)', 1, 0);
  for (let y = 10; y < VIEW_HEIGHT; y += 34) {
    const alpha = 0.32 + Math.sin(now * 3 + y) * 0.1;
    context.globalAlpha = alpha;
    context.drawImage(scene.glow.magenta, edgeAt(y) - 34, y - 34, 68, 68);
  }
  // embers torn off the world, streaming forward
  for (let ember = 0; ember < 44; ember++) {
    const period = 1.4 + (ember % 5) * 0.35;
    const t = ((now / period + hash(ember) ) % 1);
    const startY = hash(ember + 100) * (VIEW_HEIGHT + 20) - 10;
    const x = voidX + t * (30 + (ember % 7) * 12) + Math.sin(now * 3 + ember) * 2;
    const y = startY - t * (20 + (ember % 4) * 12);
    context.globalAlpha = Math.max(0, (1 - t) * 0.9);
    context.fillStyle = ember % 3 === 0 ? '#ff5fc0' : ember % 3 === 1 ? '#ffb15a' : '#ffe6a0';
    const size = 1.6 * (1 - t) + 0.4;
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
}

/** Hearts for the HUD (drawn in HTML, so this is just the count clamp). */
export const heartsFor = (hp: number) => Math.max(0, Math.min(MAX_HP, Math.round(hp)));
