/**
 * Antariksh Defenders' art: original vector-ish drawings in saffron, white, green and deep-space navy.
 * Everything static (backdrops, enemy/player/mothership sprites, the shields) is pre-rendered into offscreen canvases at the
 * current scale, so a frame is mostly drawImage calls plus a few fillRects. No strings or objects are created per frame.
 */
import { Backdrop, EnemyKind, GROUND_Y, ParticleKind, Power, SHIELD_COUNT, SHIELD_HEIGHT, SHIELD_TOP, SHIELD_WIDTH, SHIELD_CENTERS, WORLD_HEIGHT, WORLD_WIDTH } from './engine';

export const SAFFRON = '#ff9933';
export const INDIA_GREEN = '#138808';
export const CHAKRA_BLUE = '#1a2a8a';
export const SPACE_NAVY = '#050b1f';

type Paint = (context: CanvasRenderingContext2D) => void;

/** An offscreen canvas `width × height` world units big at `scale` pixels per unit; `paint` draws in world units. */
function makeSprite(width: number, height: number, scale: number, paint: Paint): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  paint(context);
  return canvas;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

function polygon(context: CanvasRenderingContext2D, points: number[]) {
  context.beginPath();
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) context.lineTo(points[index], points[index + 1]);
  context.closePath();
}

// ------------------------------------------------------------------ backdrops

/** The whole static scene behind the action for one stage: sky, stars, the planet for that leg of the journey, the launch pad. */
export function createBackdrop(scale: number, backdrop: Backdrop): HTMLCanvasElement {
  return makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, context => {
    const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    const tints = [['#030818', '#0a1f45'], ['#04060f', '#161b2e'], ['#07040d', '#2a0f12'], ['#05030f', '#1a0b2e']][backdrop];
    sky.addColorStop(0, tints[0]);
    sky.addColorStop(1, tints[1]);
    context.fillStyle = sky;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const random = seededRandom(17 + backdrop * 31);
    for (let star = 0; star < 120; star++) {
      const size = random() < 0.12 ? 1 : 0.5;
      context.globalAlpha = 0.25 + random() * 0.6;
      context.fillStyle = random() < 0.15 ? '#ffd9a8' : '#ffffff';
      context.fillRect(random() * WORLD_WIDTH, random() * WORLD_HEIGHT, size, size);
    }
    context.globalAlpha = 1;
    if (backdrop === Backdrop.Earth) drawEarthLimb(context);
    else if (backdrop === Backdrop.Moon) { drawSmallEarth(context, 26, 60, 6); drawMoon(context, 214, 170, 44); }
    else if (backdrop === Backdrop.Mars) { drawMars(context, 30, 168, 38); drawMoonlet(context, 200, 70, 3.5); }
    else drawDeepSpace(context, random);
    drawLaunchPad(context);
  });
}

function drawEarthLimb(context: CanvasRenderingContext2D) {
  // the curve of the Earth low on the screen, behind the shields
  const glow = context.createRadialGradient(120, 560, 300, 120, 560, 345);
  glow.addColorStop(0, 'rgba(80,170,255,0.45)');
  glow.addColorStop(1, 'rgba(80,170,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 180, WORLD_WIDTH, 100);
  context.save();
  context.beginPath();
  context.arc(120, 560, 310, 0, Math.PI * 2);
  context.clip();
  const ocean = context.createLinearGradient(0, 250, 0, 280);
  ocean.addColorStop(0, '#2f7fd1');
  ocean.addColorStop(1, '#0c2f66');
  context.fillStyle = ocean;
  context.fillRect(0, 240, WORLD_WIDTH, 40);
  // soft green landmasses and cloud wisps (stylised, not a map)
  context.fillStyle = 'rgba(70,150,80,0.6)';
  polygon(context, [100, 254, 112, 251, 124, 252, 134, 254, 140, 259, 135, 263, 129, 270, 124, 279, 119, 271, 113, 264, 106, 262, 101, 258]);
  context.fill();
  polygon(context, [18, 262, 34, 258, 46, 261, 40, 268, 26, 270]);
  context.fill();
  polygon(context, [176, 260, 196, 257, 214, 262, 206, 270, 186, 268]);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.28)';
  for (const [x, y, width] of [[58, 256, 22], [150, 255, 18], [84, 266, 16], [200, 265, 20], [30, 272, 14]]) {
    context.beginPath();
    context.ellipse(x, y, width / 2, 1.3, -0.08, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  context.strokeStyle = 'rgba(150,215,255,0.8)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(120, 560, 310, Math.PI * 1.25, Math.PI * 1.75);
  context.stroke();
}

function drawSmallEarth(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const body = context.createRadialGradient(x - radius * 0.4, y - radius * 0.4, 1, x, y, radius);
  body.addColorStop(0, '#7cc4ff');
  body.addColorStop(1, '#174a8a');
  context.fillStyle = body;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(80,160,80,0.8)';
  context.fillRect(x - 2, y - 3, 3, 4);
}

function drawMoon(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const body = context.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
  body.addColorStop(0, '#e9e6df');
  body.addColorStop(0.7, '#a9a59c');
  body.addColorStop(1, '#5e5b55');
  context.globalAlpha = 0.5;
  context.fillStyle = body;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  const random = seededRandom(5);
  context.fillStyle = 'rgba(70,66,60,0.35)';
  for (let crater = 0; crater < 16; crater++) {
    const angle = random() * Math.PI * 2, distance = random() * radius * 0.85, size = 1.5 + random() * 6;
    context.beginPath();
    context.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawMoonlet(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.fillStyle = '#8a7a6a';
  context.beginPath();
  context.ellipse(x, y, radius * 1.3, radius, 0.4, 0, Math.PI * 2);
  context.fill();
}

function drawMars(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const body = context.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
  body.addColorStop(0, '#f2a46a');
  body.addColorStop(0.6, '#c1502e');
  body.addColorStop(1, '#5a1c10');
  context.globalAlpha = radius > 20 ? 0.55 : 0.85;
  context.fillStyle = body;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.clip();
  context.fillStyle = 'rgba(90,30,15,0.35)';
  context.fillRect(x - radius, y - 4, radius * 2, 5);
  context.fillRect(x - radius, y + 10, radius * 2, 3);
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.beginPath();
  context.ellipse(x, y - radius + 2, radius * 0.4, 4, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
  context.globalAlpha = 1;
}

function drawDeepSpace(context: CanvasRenderingContext2D, random: () => number) {
  for (const [x, y, radius, color] of [[60, 80, 70, 'rgba(255,153,51,0.10)'], [190, 150, 80, 'rgba(19,136,8,0.10)'], [120, 40, 50, 'rgba(120,80,255,0.10)']] as const) {
    const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, color);
    cloud.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = cloud;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  drawMars(context, 205, 60, 10);
  for (let star = 0; star < 30; star++) {
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.fillRect(random() * WORLD_WIDTH, random() * 200, 0.6, 0.6);
  }
}

function drawLaunchPad(context: CanvasRenderingContext2D) {
  // the ground station line under the ship, with a tricolour accent strip
  context.fillStyle = 'rgba(5,11,31,0.85)';
  context.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
  context.fillStyle = SAFFRON;
  context.fillRect(0, GROUND_Y, WORLD_WIDTH, 0.8);
  context.fillStyle = '#ffffff';
  context.fillRect(0, GROUND_Y + 0.8, WORLD_WIDTH, 0.8);
  context.fillStyle = INDIA_GREEN;
  context.fillRect(0, GROUND_Y + 1.6, WORLD_WIDTH, 0.8);
}

// ------------------------------------------------------------------ sprites

export interface Sprites {
  /** [kind * 2 + frame], 16 × 12 units, centred on the enemy. */
  enemies: HTMLCanvasElement[];
  /** the launcher, 18 × 18 units, centred on (x, PLAYER_Y). */
  player: HTMLCanvasElement;
  /** comet heading right, comet heading left, mothership; 30 × 14 units. */
  mystery: HTMLCanvasElement[];
  /** triple-shot and bubble capsules, 9 × 9 units. */
  capsules: HTMLCanvasElement[];
  life: HTMLCanvasElement;
}

export const ENEMY_SPRITE_WIDTH = 16;
export const ENEMY_SPRITE_HEIGHT = 12;
export const PLAYER_SPRITE_SIZE = 18;
export const MYSTERY_SPRITE_WIDTH = 30;
export const MYSTERY_SPRITE_HEIGHT = 14;

export function createSprites(scale: number): Sprites {
  const enemies: HTMLCanvasElement[] = [];
  for (const kind of [EnemyKind.Asteroid, EnemyKind.Debris, EnemyKind.Drone]) {
    for (const frame of [0, 1]) enemies.push(makeSprite(ENEMY_SPRITE_WIDTH, ENEMY_SPRITE_HEIGHT, scale, context => {
      context.translate(ENEMY_SPRITE_WIDTH / 2, ENEMY_SPRITE_HEIGHT / 2);
      if (kind === EnemyKind.Asteroid) paintAsteroid(context, frame);
      else if (kind === EnemyKind.Debris) paintDebris(context, frame);
      else paintDrone(context, frame);
    }));
  }
  const player = makeSprite(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, scale, context => { context.translate(PLAYER_SPRITE_SIZE / 2, PLAYER_SPRITE_SIZE / 2); paintLauncher(context, 1); });
  const life = makeSprite(8, 10, scale, context => { context.translate(4, 5.5); context.scale(0.5, 0.5); paintLauncher(context, 1); });
  const mystery = [1, -1].map(direction => makeSprite(MYSTERY_SPRITE_WIDTH, MYSTERY_SPRITE_HEIGHT, scale, context => {
    context.translate(MYSTERY_SPRITE_WIDTH / 2, MYSTERY_SPRITE_HEIGHT / 2);
    paintComet(context, direction);
  }));
  mystery.push(makeSprite(MYSTERY_SPRITE_WIDTH, MYSTERY_SPRITE_HEIGHT, scale, context => { context.translate(MYSTERY_SPRITE_WIDTH / 2, MYSTERY_SPRITE_HEIGHT / 2); paintMothership(context); }));
  const capsules = [Power.TripleShot, Power.Bubble].map(power => makeSprite(9, 9, scale, context => {
    context.translate(4.5, 4.5);
    context.fillStyle = power === Power.TripleShot ? SAFFRON : '#4fc3f7';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(0, 0, 3.8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#0b1530';
    context.font = 'bold 5px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(power === Power.TripleShot ? 'T' : 'S', 0, 0.4);
  }));
  return { enemies, player, mystery, capsules, life };
}

function paintAsteroid(context: CanvasRenderingContext2D, frame: number) {
  context.rotate(frame ? 0.35 : 0);
  context.fillStyle = '#8a7765';
  polygon(context, [-6, -1, -4, -4.5, 0, -5.2, 4, -4, 6, -0.5, 5, 3.5, 1, 5, -3.5, 4.4]);
  context.fill();
  context.fillStyle = '#b39c84';
  polygon(context, [-4, -3.5, 0, -4.4, 3, -3.2, 0, -1.5, -3, -1]);
  context.fill();
  context.fillStyle = '#5a4a3c';
  context.beginPath(); context.arc(-1.8, 1.2, 1.4, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(2.8, 0.2, 0.9, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(0.8, 3.2, 0.7, 0, Math.PI * 2); context.fill();
}

function paintDebris(context: CanvasRenderingContext2D, frame: number) {
  // a broken solar panel, a gold-foil fragment and loose bolts, tumbling
  context.rotate(frame ? -0.25 : 0.12);
  context.fillStyle = '#2b4f9e';
  context.fillRect(-6.5, -3.5, 7, 6);
  context.strokeStyle = '#7fa8ff';
  context.lineWidth = 0.35;
  for (let line = -5; line < 0; line += 1.8) { context.beginPath(); context.moveTo(line, -3.5); context.lineTo(line, 2.5); context.stroke(); }
  context.beginPath(); context.moveTo(-6.5, -0.5); context.lineTo(0.5, -0.5); context.stroke();
  context.fillStyle = '#d4a52b';
  polygon(context, [0.5, -4.5, 6, -2.5, 5, 3.5, 1, 4.5]);
  context.fill();
  context.fillStyle = '#f5d76e';
  context.fillRect(2, -2.5, 2, 1.2);
  context.fillStyle = '#c0c7d0';
  context.fillRect(frame ? 4.5 : -5.5, frame ? 3.5 : 3.2, 1.6, 1.6);
  context.fillRect(frame ? -6 : 5, frame ? -5 : -5.2, 1.2, 1.2);
}

function paintDrone(context: CanvasRenderingContext2D, frame: number) {
  // a rogue alien drone: hull, glowing eye, flapping antennae
  context.strokeStyle = '#69f0ae';
  context.lineWidth = 0.7;
  context.beginPath();
  const spread = frame ? 1.5 : -0.5;
  context.moveTo(-3, -2); context.lineTo(-5.5, -4.5 - spread);
  context.moveTo(3, -2); context.lineTo(5.5, -4.5 - spread);
  context.moveTo(-4, 2); context.lineTo(-6.5, 4.5 + spread);
  context.moveTo(4, 2); context.lineTo(6.5, 4.5 + spread);
  context.stroke();
  context.fillStyle = '#5b2a86';
  polygon(context, [-5, 0, -2.5, -3.5, 2.5, -3.5, 5, 0, 2.5, 3.5, -2.5, 3.5]);
  context.fill();
  context.fillStyle = '#8e44ad';
  polygon(context, [-3.5, 0, -2, -2.4, 2, -2.4, 3.5, 0]);
  context.fill();
  context.fillStyle = '#ff4fd8';
  context.beginPath(); context.arc(0, 0.6, 1.7, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ffffff';
  context.fillRect(-0.5 + (frame ? 0.4 : -0.4), 0, 0.9, 0.9);
}

/** The player's launcher: a white core stage with saffron and green bands, strap-on boosters, a chakra-blue dot. */
export function paintLauncher(context: CanvasRenderingContext2D, alpha: number) {
  context.globalAlpha = alpha;
  // strap-on boosters
  for (const side of [-1, 1]) {
    context.fillStyle = '#e8ecf2';
    context.fillRect(side * 4.6 - 1.2, -2.5, 2.4, 8);
    context.fillStyle = '#c9ced6';
    polygon(context, [side * 4.6 - 1.2, -2.5, side * 4.6, -4.8, side * 4.6 + 1.2, -2.5]);
    context.fill();
    context.fillStyle = INDIA_GREEN;
    polygon(context, [side * 6.4, 6, side * 5.8, 2, side * 3.4, 5.5]);
    context.fill();
  }
  // core stage
  context.fillStyle = '#ffffff';
  context.fillRect(-2.6, -6.5, 5.2, 12.5);
  context.fillStyle = SAFFRON;
  polygon(context, [-2.6, -6.5, 0, -9.5, 2.6, -6.5]);
  context.fill();
  context.fillStyle = SAFFRON;
  context.fillRect(-2.6, -3.6, 5.2, 1.4);
  context.fillStyle = INDIA_GREEN;
  context.fillRect(-2.6, 2.2, 5.2, 1.4);
  context.fillStyle = CHAKRA_BLUE;
  context.beginPath(); context.arc(0, -0.2, 0.9, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#9aa3ae';
  context.fillRect(-1.8, 6, 3.6, 1.2);
  context.globalAlpha = 1;
}

function paintComet(context: CanvasRenderingContext2D, direction: number) {
  // icy nucleus in front, a saffron-white tail streaming behind
  const tail = context.createLinearGradient(direction * 4, 0, -direction * 15, 0);
  tail.addColorStop(0, 'rgba(255,255,255,0.95)');
  tail.addColorStop(0.35, 'rgba(255,190,110,0.7)');
  tail.addColorStop(1, 'rgba(255,153,51,0)');
  context.fillStyle = tail;
  polygon(context, [direction * 6, -3.5, -direction * 15, -6.5, -direction * 15, 6.5, direction * 6, 3.5]);
  context.fill();
  const glow = context.createRadialGradient(direction * 7, 0, 0.5, direction * 7, 0, 6);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.5, '#bfefff');
  glow.addColorStop(1, 'rgba(120,200,255,0)');
  context.fillStyle = glow;
  context.beginPath(); context.arc(direction * 7, 0, 6, 0, Math.PI * 2); context.fill();
}

function paintMothership(context: CanvasRenderingContext2D) {
  context.fillStyle = 'rgba(180,120,255,0.25)';
  context.beginPath(); context.ellipse(0, 1, 14, 6, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#7e57c2';
  context.beginPath(); context.ellipse(0, 1.5, 12, 3.6, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#b39ddb';
  context.beginPath(); context.ellipse(0, -1.2, 5.5, 3.6, 0, Math.PI, 0); context.fill();
  context.fillStyle = '#69f0ae';
  for (let light = -9; light <= 9; light += 4.5) { context.beginPath(); context.arc(light, 2, 0.9, 0, Math.PI * 2); context.fill(); }
}

// ------------------------------------------------------------------ shields

const SHIELD_COLORS = ['', '#2e5cb8', '#e0b13a', '#e8ecf2'];
const SHIELD_SHADE = ['', '#1f3f86', '#b8891e', '#b8c0cc'];

/** Repaint the shield strip (240 × 16 units) from the cell bytes; called only when a shield changes. */
export function paintShields(canvas: HTMLCanvasElement, scale: number, cells: Uint8Array) {
  const width = Math.ceil(WORLD_WIDTH * scale), height = Math.ceil(SHIELD_HEIGHT * scale);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d')!;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  for (let shield = 0; shield < SHIELD_COUNT; shield++) {
    const left = SHIELD_CENTERS[shield] - SHIELD_WIDTH / 2;
    for (let row = 0; row < SHIELD_HEIGHT; row++) {
      for (let column = 0; column < SHIELD_WIDTH; column++) {
        const cell = cells[shield * SHIELD_WIDTH * SHIELD_HEIGHT + row * SHIELD_WIDTH + column];
        if (cell === 0) continue;
        // panel grid lines and foil wrinkles: alternate shade on a pattern
        const isShade = cell === 1 ? (column % 3 === 0 || row === 8) : cell === 2 ? ((column + row) % 4 === 0) : row === 2;
        context.fillStyle = isShade ? SHIELD_SHADE[cell] : SHIELD_COLORS[cell];
        context.fillRect(left + column, row, 1.02, 1.02);
      }
    }
  }
}
export const SHIELD_STRIP_TOP = SHIELD_TOP;

// ------------------------------------------------------------------ dynamic bits

export function drawFlame(context: CanvasRenderingContext2D, x: number, y: number, clock: number) {
  const flicker = 2.2 + Math.sin(clock * 47) * 0.8 + Math.sin(clock * 31) * 0.5;
  context.fillStyle = SAFFRON;
  context.fillRect(x - 1.3, y + 7, 2.6, flicker + 1);
  context.fillStyle = '#ffe08a';
  context.fillRect(x - 0.7, y + 7, 1.4, flicker * 0.6 + 0.6);
}

export function drawPlayerBullet(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = 'rgba(255,153,51,0.45)';
  context.fillRect(x - 1.2, y - 1, 2.4, 7);
  context.fillStyle = '#fff7e0';
  context.fillRect(x - 0.6, y - 2, 1.2, 6);
}

export function drawEnemyBullet(context: CanvasRenderingContext2D, kind: number, x: number, y: number, age: number) {
  if (kind === EnemyKind.Drone) {
    context.fillStyle = (Math.floor(age * 12) & 1) ? '#ff4fd8' : '#69f0ae';
    context.fillRect(x - 1.2, y - 1.5, 2.4, 4.5);
  } else if (kind === EnemyKind.Debris) {
    context.fillStyle = '#e8ecf2';
    context.fillRect(x - 0.6, y - 2.5, 1.2, 6);
    context.fillStyle = '#90caf9';
    context.fillRect(x - 0.6, y + 2.5, 1.2, 1.2);
  } else {
    context.fillStyle = '#ff7a45';
    context.fillRect(x - 1.1, y - 1, 2.2, 4);
    context.fillStyle = '#ffd0a0';
    context.fillRect(x - 0.5, y + 1.5, 1, 1.5);
  }
}

const PARTICLE_COLORS = [
  ['#d9b996', '#8a7765', '#ffcc80'],
  ['#ffd54f', '#7fa8ff', '#ffffff'],
  ['#ff4fd8', '#69f0ae', '#e1bee7'],
  ['#ffffff', '#bfefff', '#ffcc80'],
  [SAFFRON, '#ffffff', '#3fbf3a'],
  ['#ffd54f', '#5f8de0', '#ffffff'],
];
const NUMBER_TEXT: Record<number, string> = { 50: '50', 100: '100', 150: '150', 300: '300' };

export function drawParticle(context: CanvasRenderingContext2D, kind: ParticleKind, x: number, y: number, progress: number, value: number, index: number) {
  const palette = PARTICLE_COLORS[Math.min(value, 5) | 0];
  const fade = 1 - progress;
  if (kind === ParticleKind.Spark || kind === ParticleKind.Shard) {
    context.globalAlpha = fade;
    context.fillStyle = palette[index % 3];
    const size = kind === ParticleKind.Shard ? 1.6 : 1;
    context.fillRect(x - size / 2, y - size / 2, size, size);
  } else if (kind === ParticleKind.Ring) {
    // a bright hit flash that opens into a ring
    context.globalAlpha = fade * 0.9;
    if (progress < 0.25) {
      context.fillStyle = '#ffffff';
      context.beginPath(); context.arc(x, y, 2 + progress * 16, 0, Math.PI * 2); context.fill();
    }
    context.strokeStyle = palette[0];
    context.lineWidth = 1.2 * fade + 0.3;
    context.beginPath(); context.arc(x, y, 3 + progress * (value === 4 ? 22 : 11), 0, Math.PI * 2); context.stroke();
  } else if (kind === ParticleKind.Ember) {
    context.globalAlpha = fade;
    context.fillStyle = '#fff1c1';
    context.beginPath(); context.arc(x, y, 2.2 * fade + 0.6, 0, Math.PI * 2); context.fill();
  } else if (kind === ParticleKind.ScoreText) {
    context.globalAlpha = Math.min(1, fade * 2);
    context.fillStyle = '#ffd23f';
    context.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
    context.textAlign = 'center';
    context.fillText(NUMBER_TEXT[value] ?? '', x, y);
  }
  context.globalAlpha = 1;
}
