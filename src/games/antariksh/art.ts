/**
 * Antariksh Defenders' art: original vector-ish drawings in saffron, white, green and deep-space navy.
 * Everything static (backdrop layers, enemy/player/mothership sprites) is pre-rendered into offscreen canvases at the
 * current scale, so a frame is mostly drawImage calls plus a few fillRects. No strings or objects are created per frame.
 */
import { Backdrop, EnemyKind, GROUND_Y, ParticleKind, Power, WORLD_HEIGHT, WORLD_WIDTH } from './engine';

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

/**
 * The scene behind the action for one stage, split into layers that scroll downward at different speeds (parallax) so the
 * ship and the formation feel like they are flying forward through space. Each star/nebula layer is a vertically seamless
 * WORLD_WIDTH × WORLD_HEIGHT tile; `scenery` holds the stage's planet and drifts past slowly; `pad` is the fixed ground strip.
 */
export interface BackdropLayers {
  sky: HTMLCanvasElement;
  farStars: HTMLCanvasElement;
  nebula: HTMLCanvasElement;
  midStars: HTMLCanvasElement;
  scenery: HTMLCanvasElement;
  pad: HTMLCanvasElement;
}

/** The fixed ground strip under the ship (drawn at GROUND_Y), with 2 spare units below to cover screen shake. */
export const GROUND_STRIP_HEIGHT = WORLD_HEIGHT - GROUND_Y + 2;

/** World units per second each layer scrolls at cruising speed. */
export const LAYER_SPEEDS = { farStars: 8, nebula: 14, midStars: 28, scenery: 4 } as const;

const NEBULA_TINTS = [
  ['rgba(80,140,255,0.13)', 'rgba(19,136,8,0.08)', 'rgba(255,153,51,0.07)'],
  ['rgba(180,180,210,0.10)', 'rgba(90,110,255,0.10)', 'rgba(255,153,51,0.06)'],
  ['rgba(255,110,60,0.12)', 'rgba(160,50,40,0.10)', 'rgba(255,190,120,0.06)'],
  ['rgba(255,153,51,0.12)', 'rgba(19,136,8,0.11)', 'rgba(120,80,255,0.13)'],
] as const;

/** Draw `paint` three times (shifted by ±WORLD_HEIGHT) so whatever crosses the tile's top/bottom edge wraps seamlessly. */
function paintWrapped(context: CanvasRenderingContext2D, paint: (offsetY: number) => void) {
  for (const offsetY of [-WORLD_HEIGHT, 0, WORLD_HEIGHT]) paint(offsetY);
}

function starTile(scale: number, seed: number, count: number, sizes: [number, number], alpha: [number, number], bigChance: number) {
  return makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, context => {
    const random = seededRandom(seed);
    for (let star = 0; star < count; star++) {
      const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT;
      const isBig = random() < bigChance;
      const size = isBig ? sizes[1] : sizes[0];
      context.globalAlpha = alpha[0] + random() * (alpha[1] - alpha[0]);
      context.fillStyle = random() < 0.15 ? '#ffd9a8' : random() < 0.2 ? '#bfe3ff' : '#ffffff';
      paintWrapped(context, offsetY => {
        context.fillRect(x, y + offsetY, size, size);
        if (isBig) { // a little twinkle cross on the bright ones
          context.globalAlpha *= 0.45;
          context.fillRect(x - size, y + offsetY + size / 2 - 0.15, size * 3, 0.3);
          context.fillRect(x + size / 2 - 0.15, y + offsetY - size, 0.3, size * 3);
          context.globalAlpha /= 0.45;
        }
      });
    }
    context.globalAlpha = 1;
  });
}

export function createBackdrop(scale: number, backdrop: Backdrop): BackdropLayers {
  const sky = makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, context => {
    const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    const tints = [['#030818', '#0a1f45'], ['#04060f', '#161b2e'], ['#07040d', '#2a0f12'], ['#05030f', '#1a0b2e']][backdrop];
    gradient.addColorStop(0, tints[0]);
    gradient.addColorStop(1, tints[1]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    // baked-in vignette: darker edges frame the action (free at run time)
    const shade = context.createRadialGradient(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_HEIGHT * 0.3, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_HEIGHT * 0.75);
    shade.addColorStop(0, 'rgba(0,0,8,0)');
    shade.addColorStop(1, 'rgba(0,0,8,0.6)');
    context.fillStyle = shade;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  });
  const farStars = starTile(scale, 17 + backdrop * 31, 150, [0.45, 0.8], [0.15, 0.55], 0.06);
  const midStars = starTile(scale, 101 + backdrop * 13, 42, [0.7, 1.1], [0.45, 0.95], 0.25);
  const nebula = makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, context => {
    const random = seededRandom(7 + backdrop * 19);
    const tints = NEBULA_TINTS[backdrop];
    const clouds = backdrop === Backdrop.DeepSpace ? 7 : 5;
    for (let index = 0; index < clouds; index++) {
      const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT, radius = 35 + random() * 55;
      const stretch = 0.5 + random() * 0.6;
      const color = tints[index % tints.length];
      paintWrapped(context, offsetY => {
        context.save();
        context.translate(x, y + offsetY);
        context.scale(1, stretch);
        const cloud = context.createRadialGradient(0, 0, 0, 0, 0, radius);
        cloud.addColorStop(0, color);
        cloud.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = cloud;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
      });
    }
    // faint dust lanes
    context.fillStyle = 'rgba(255,255,255,0.05)';
    for (let lane = 0; lane < 40; lane++) {
      const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT, length = 2 + random() * 4;
      paintWrapped(context, offsetY => context.fillRect(x, y + offsetY, 0.4, length));
    }
  });
  const scenery = makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, context => {
    if (backdrop === Backdrop.Earth) drawEarthLimb(context);
    else if (backdrop === Backdrop.Moon) { drawSmallEarth(context, 26, 60, 6); drawMoon(context, 214, 170, 44); }
    else if (backdrop === Backdrop.Mars) { drawMars(context, 30, 168, 38); drawMoonlet(context, 200, 70, 3.5); }
    else drawMars(context, 205, 60, 10);
  });
  const pad = makeSprite(WORLD_WIDTH, GROUND_STRIP_HEIGHT, scale, context => {
    context.translate(0, -GROUND_Y);
    drawLaunchPad(context);
  });
  return { sky, farStars, nebula, midStars, scenery, pad };
}

function drawEarthLimb(context: CanvasRenderingContext2D) {
  // the curve of the Earth low on the screen, falling away as the ship climbs
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

function drawLaunchPad(context: CanvasRenderingContext2D) {
  // the ground station line under the ship, with a tricolour accent strip
  context.fillStyle = 'rgba(5,11,31,0.85)';
  context.fillRect(0, GROUND_Y, WORLD_WIDTH, GROUND_STRIP_HEIGHT);
  context.fillStyle = SAFFRON;
  context.fillRect(0, GROUND_Y, WORLD_WIDTH, 0.8);
  context.fillStyle = '#ffffff';
  context.fillRect(0, GROUND_Y + 0.8, WORLD_WIDTH, 0.8);
  context.fillStyle = INDIA_GREEN;
  context.fillRect(0, GROUND_Y + 1.6, WORLD_WIDTH, 0.8);
}

// ------------------------------------------------------------------ sprites

export interface Sprites {
  /** [kind * 2 + frame], 16 × 12 units, centred on the enemy (kind 3, the queen, is QUEEN_SPRITE_WIDTH × QUEEN_SPRITE_HEIGHT). */
  enemies: HTMLCanvasElement[];
  /** the launcher, 18 × 18 units, centred on (x, PLAYER_Y). */
  player: HTMLCanvasElement;
  /** comet heading right, comet heading left, mothership; 30 × 14 units. */
  mystery: HTMLCanvasElement[];
  /** triple-shot and bubble capsules, 9 × 9 units. */
  capsules: HTMLCanvasElement[];
  life: HTMLCanvasElement;
  /** soft additive glows, GLOW_SIZE units across, one per GlowColor. */
  glows: HTMLCanvasElement[];
  /** player bolts: standard, machine gun, triple stream; 4 × 11 units. */
  bolts: HTMLCanvasElement[];
}

export const ENEMY_SPRITE_WIDTH = 16;
export const ENEMY_SPRITE_HEIGHT = 12;
export const QUEEN_SPRITE_WIDTH = 28;
export const QUEEN_SPRITE_HEIGHT = 20;
export const PLAYER_SPRITE_SIZE = 18;
export const MYSTERY_SPRITE_WIDTH = 30;
export const MYSTERY_SPRITE_HEIGHT = 14;
export const GLOW_SIZE = 16;
export const BOLT_WIDTH = 4;
export const BOLT_HEIGHT = 11;
export const enum GlowColor { Saffron = 0, Cyan = 1, Magenta = 2, White = 3, Gold = 4, Green = 5 }
const GLOW_RGB = ['255,153,51', '79,195,247', '255,79,216', '255,255,255', '255,210,63', '105,240,174'];

/** Like makeSprite, but everything painted gets a soft coloured halo (rendered once). */
function makeGlowingSprite(width: number, height: number, scale: number, glow: string, blur: number, paint: Paint) {
  return makeSprite(width, height, scale, context => {
    context.shadowColor = glow;
    context.shadowBlur = blur * scale;
    paint(context);
  });
}

export function createSprites(scale: number): Sprites {
  const enemies: HTMLCanvasElement[] = [];
  for (const kind of [EnemyKind.Asteroid, EnemyKind.Debris, EnemyKind.Drone]) {
    const halo = kind === EnemyKind.Drone ? 'rgba(255,79,216,0.55)' : kind === EnemyKind.Debris ? 'rgba(120,170,255,0.45)' : 'rgba(255,190,120,0.3)';
    for (const frame of [0, 1]) enemies.push(makeGlowingSprite(ENEMY_SPRITE_WIDTH, ENEMY_SPRITE_HEIGHT, scale, halo, 1.6, context => {
      context.translate(ENEMY_SPRITE_WIDTH / 2, ENEMY_SPRITE_HEIGHT / 2);
      if (kind === EnemyKind.Asteroid) paintAsteroid(context, frame);
      else if (kind === EnemyKind.Debris) paintDebris(context, frame);
      else paintDrone(context, frame);
    }));
  }
  for (const frame of [0, 1]) enemies.push(makeGlowingSprite(QUEEN_SPRITE_WIDTH, QUEEN_SPRITE_HEIGHT, scale, 'rgba(255,79,216,0.7)', 2.4, context => {
    context.translate(QUEEN_SPRITE_WIDTH / 2, QUEEN_SPRITE_HEIGHT / 2);
    paintQueen(context, frame);
  }));
  const player = makeGlowingSprite(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, scale, 'rgba(255,200,140,0.45)', 1.5, context => { context.translate(PLAYER_SPRITE_SIZE / 2, PLAYER_SPRITE_SIZE / 2); paintLauncher(context, 1); });
  const life = makeSprite(8, 10, scale, context => { context.translate(4, 5.5); context.scale(0.5, 0.5); paintLauncher(context, 1); });
  const mystery = [1, -1].map(direction => makeSprite(MYSTERY_SPRITE_WIDTH, MYSTERY_SPRITE_HEIGHT, scale, context => {
    context.translate(MYSTERY_SPRITE_WIDTH / 2, MYSTERY_SPRITE_HEIGHT / 2);
    paintComet(context, direction);
  }));
  mystery.push(makeGlowingSprite(MYSTERY_SPRITE_WIDTH, MYSTERY_SPRITE_HEIGHT, scale, 'rgba(180,120,255,0.6)', 2, context => { context.translate(MYSTERY_SPRITE_WIDTH / 2, MYSTERY_SPRITE_HEIGHT / 2); paintMothership(context); }));
  const capsules = [Power.TripleShot, Power.Bubble].map(power => makeGlowingSprite(9, 9, scale, power === Power.TripleShot ? SAFFRON : '#4fc3f7', 2, context => {
    context.translate(4.5, 4.5);
    const color = power === Power.TripleShot ? SAFFRON : '#4fc3f7';
    const body = context.createRadialGradient(-1.2, -1.2, 0.3, 0, 0, 3.8);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, color);
    body.addColorStop(1, power === Power.TripleShot ? '#a34d00' : '#0d5a8a');
    context.fillStyle = body;
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 0.6;
    context.beginPath();
    context.arc(0, 0, 3.8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = '#0b1530';
    context.font = '900 4.6px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(power === Power.TripleShot ? 'T' : 'S', 0, 0.4);
  }));
  const glows = GLOW_RGB.map(rgb => makeSprite(GLOW_SIZE, GLOW_SIZE, scale, context => {
    const glow = context.createRadialGradient(GLOW_SIZE / 2, GLOW_SIZE / 2, 0, GLOW_SIZE / 2, GLOW_SIZE / 2, GLOW_SIZE / 2);
    glow.addColorStop(0, `rgba(${rgb},0.9)`);
    glow.addColorStop(0.25, `rgba(${rgb},0.45)`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = glow;
    context.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  }));
  const bolts = [['255,153,51', '#fff7e0'], ['79,195,247', '#e6fbff'], ['255,210,63', '#fffbe6']].map(([rgb, core]) => makeSprite(BOLT_WIDTH, BOLT_HEIGHT, scale, context => {
    const halo = context.createLinearGradient(0, 0, 0, BOLT_HEIGHT);
    halo.addColorStop(0, `rgba(${rgb},0.9)`);
    halo.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = halo;
    context.beginPath();
    context.ellipse(BOLT_WIDTH / 2, 4, BOLT_WIDTH / 2, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(BOLT_WIDTH / 2 - 0.9, 4, 1.8, BOLT_HEIGHT - 4);
    context.fillStyle = core;
    context.beginPath();
    context.ellipse(BOLT_WIDTH / 2, 3.6, 0.7, 2.8, 0, 0, Math.PI * 2);
    context.fill();
  }));
  return { enemies, player, mystery, capsules, life, glows, bolts };
}

function paintAsteroid(context: CanvasRenderingContext2D, frame: number) {
  context.rotate(frame ? 0.35 : 0);
  const rock = context.createRadialGradient(-2, -2.5, 0.5, 0, 0, 6.5);
  rock.addColorStop(0, '#c9b29a');
  rock.addColorStop(0.55, '#8a7765');
  rock.addColorStop(1, '#3f3329');
  context.fillStyle = rock;
  polygon(context, [-6, -1, -4, -4.5, 0, -5.2, 4, -4, 6, -0.5, 5, 3.5, 1, 5, -3.5, 4.4]);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,220,180,0.35)';
  context.lineWidth = 0.4;
  context.beginPath(); context.moveTo(-5.6, -1.2); context.lineTo(-3.8, -4.3); context.lineTo(0, -5); context.lineTo(3.8, -3.9); context.stroke();
  for (const [x, y, radius] of [[-1.8, 1.2, 1.4], [2.8, 0.2, 0.9], [0.8, 3.2, 0.7]]) {
    context.fillStyle = '#4a3c30';
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = 'rgba(255,230,200,0.25)';
    context.beginPath(); context.arc(x + radius * 0.25, y + radius * 0.3, radius * 0.55, 0, Math.PI); context.fill();
  }
}

function paintDebris(context: CanvasRenderingContext2D, frame: number) {
  // a broken solar panel, a gold-foil fragment and loose bolts, tumbling
  context.rotate(frame ? -0.25 : 0.12);
  const panel = context.createLinearGradient(-6.5, -3.5, 0.5, 2.5);
  panel.addColorStop(0, '#4b78d6');
  panel.addColorStop(1, '#1d3a7a');
  context.fillStyle = panel;
  context.fillRect(-6.5, -3.5, 7, 6);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(160,200,255,0.8)';
  context.lineWidth = 0.3;
  for (let line = -5; line < 0; line += 1.8) { context.beginPath(); context.moveTo(line, -3.5); context.lineTo(line, 2.5); context.stroke(); }
  context.beginPath(); context.moveTo(-6.5, -0.5); context.lineTo(0.5, -0.5); context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  polygon(context, [-6.5, -3.5, -3, -3.5, -6.5, -0.5]);
  context.fill();
  const foil = context.createLinearGradient(0.5, -4.5, 6, 4.5);
  foil.addColorStop(0, '#fff0a8');
  foil.addColorStop(0.4, '#d4a52b');
  foil.addColorStop(1, '#7a5a10');
  context.fillStyle = foil;
  polygon(context, [0.5, -4.5, 6, -2.5, 5, 3.5, 1, 4.5]);
  context.fill();
  context.fillStyle = '#c0c7d0';
  context.fillRect(frame ? 4.5 : -5.5, frame ? 3.5 : 3.2, 1.6, 1.6);
  context.fillRect(frame ? -6 : 5, frame ? -5 : -5.2, 1.2, 1.2);
}

function paintDrone(context: CanvasRenderingContext2D, frame: number) {
  // a rogue alien drone: hull, glowing eye, flapping antennae
  context.strokeStyle = '#69f0ae';
  context.lineWidth = 0.7;
  context.lineCap = 'round';
  context.beginPath();
  const spread = frame ? 1.5 : -0.5;
  context.moveTo(-3, -2); context.lineTo(-5.5, -4.5 - spread);
  context.moveTo(3, -2); context.lineTo(5.5, -4.5 - spread);
  context.moveTo(-4, 2); context.lineTo(-6.5, 4.5 + spread);
  context.moveTo(4, 2); context.lineTo(6.5, 4.5 + spread);
  context.stroke();
  const hull = context.createLinearGradient(0, -3.5, 0, 3.5);
  hull.addColorStop(0, '#a35ad6');
  hull.addColorStop(1, '#3a1460');
  context.fillStyle = hull;
  polygon(context, [-5, 0, -2.5, -3.5, 2.5, -3.5, 5, 0, 2.5, 3.5, -2.5, 3.5]);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.25)';
  polygon(context, [-3.5, -0.4, -2, -2.8, 2, -2.8, 3.5, -0.4]);
  context.fill();
  const eye = context.createRadialGradient(0, 0.6, 0.2, 0, 0.6, 2);
  eye.addColorStop(0, '#ffffff');
  eye.addColorStop(0.4, '#ff4fd8');
  eye.addColorStop(1, '#7a0f66');
  context.fillStyle = eye;
  context.beginPath(); context.arc(0, 0.6, 1.8, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ffffff';
  context.fillRect(-0.5 + (frame ? 0.4 : -0.4), 0, 0.8, 0.8);
}

/** The queen: a crowned alien matriarch with membrane wings and a blazing core. */
function paintQueen(context: CanvasRenderingContext2D, frame: number) {
  const flap = frame ? 1.2 : -0.6;
  // wings
  for (const side of [-1, 1]) {
    const wing = context.createLinearGradient(side * 4, 0, side * 13.5, 0);
    wing.addColorStop(0, 'rgba(160,70,220,0.95)');
    wing.addColorStop(1, 'rgba(255,79,216,0.35)');
    context.fillStyle = wing;
    polygon(context, [side * 4, -3, side * 12, -7 - flap, side * 13.5, -1 - flap * 0.4, side * 11, 4, side * 4, 3]);
    context.fill();
    context.strokeStyle = 'rgba(255,200,250,0.7)';
    context.lineWidth = 0.35;
    context.beginPath();
    context.moveTo(side * 4.5, -1); context.lineTo(side * 12, -6 - flap);
    context.moveTo(side * 4.5, 0.5); context.lineTo(side * 13, -1 - flap * 0.4);
    context.moveTo(side * 4.5, 2); context.lineTo(side * 10.5, 3.5);
    context.stroke();
  }
  // pincers
  context.strokeStyle = '#ffd23f';
  context.lineWidth = 0.8;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-2.5, 5); context.quadraticCurveTo(-4, 8, -1.5 - flap * 0.3, 9);
  context.moveTo(2.5, 5); context.quadraticCurveTo(4, 8, 1.5 + flap * 0.3, 9);
  context.stroke();
  // carapace
  const shell = context.createLinearGradient(0, -6, 0, 6);
  shell.addColorStop(0, '#c77dff');
  shell.addColorStop(0.5, '#6a1fb0');
  shell.addColorStop(1, '#2a0750');
  context.fillStyle = shell;
  polygon(context, [-5.5, -1, -3.5, -5, 3.5, -5, 5.5, -1, 4.5, 4, 0, 6.5, -4.5, 4]);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = '#ffd23f';
  context.lineWidth = 0.45;
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.22)';
  polygon(context, [-4.5, -1.2, -3, -4.2, 3, -4.2, 4.5, -1.2]);
  context.fill();
  // crown
  const gold = context.createLinearGradient(0, -9.5, 0, -5);
  gold.addColorStop(0, '#fff3b0');
  gold.addColorStop(1, '#c8901a');
  context.fillStyle = gold;
  polygon(context, [-4, -5, -4.4, -8.4, -2.2, -6.6, 0, -9.6, 2.2, -6.6, 4.4, -8.4, 4, -5]);
  context.fill();
  context.fillStyle = '#ff4fd8';
  for (const x of [-4.4, 0, 4.4]) { context.beginPath(); context.arc(x, x === 0 ? -9.4 : -8.2, 0.6, 0, Math.PI * 2); context.fill(); }
  // core eye
  const core = context.createRadialGradient(0, 0.6, 0.2, 0, 0.6, 2.8);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, '#ff9de8');
  core.addColorStop(0.7, '#ff4fd8');
  core.addColorStop(1, 'rgba(120,0,100,0.9)');
  context.fillStyle = core;
  context.beginPath(); context.arc(0, 0.6, 2.6, 0, Math.PI * 2); context.fill();
}

/** The player's launcher: a white core stage with saffron and green bands, strap-on boosters, a chakra-blue dot. */
export function paintLauncher(context: CanvasRenderingContext2D, alpha: number) {
  context.globalAlpha = alpha;
  // swept fins
  for (const side of [-1, 1]) {
    const fin = context.createLinearGradient(side * 2.6, 0, side * 7.5, 0);
    fin.addColorStop(0, '#1a9a14');
    fin.addColorStop(1, '#0b5a08');
    context.fillStyle = fin;
    polygon(context, [side * 2.6, 1, side * 7.6, 6.5, side * 7, 7.6, side * 2.6, 5.6]);
    context.fill();
  }
  // strap-on boosters
  for (const side of [-1, 1]) {
    const booster = context.createLinearGradient(side * 4.6 - 1.2, 0, side * 4.6 + 1.2, 0);
    booster.addColorStop(0, side < 0 ? '#aab2bd' : '#ffffff');
    booster.addColorStop(1, side < 0 ? '#ffffff' : '#aab2bd');
    context.fillStyle = booster;
    context.fillRect(side * 4.6 - 1.2, -2.5, 2.4, 8);
    context.fillStyle = SAFFRON;
    polygon(context, [side * 4.6 - 1.2, -2.5, side * 4.6, -5, side * 4.6 + 1.2, -2.5]);
    context.fill();
    context.fillStyle = '#6b7380';
    context.fillRect(side * 4.6 - 1, 5.5, 2, 1);
  }
  // core stage
  const body = context.createLinearGradient(-2.6, 0, 2.6, 0);
  body.addColorStop(0, '#c9d0da');
  body.addColorStop(0.45, '#ffffff');
  body.addColorStop(1, '#a7afba');
  context.fillStyle = body;
  context.fillRect(-2.6, -6.5, 5.2, 12.5);
  const nose = context.createLinearGradient(-2.6, 0, 2.6, 0);
  nose.addColorStop(0, '#d9741a');
  nose.addColorStop(0.5, '#ffb35c');
  nose.addColorStop(1, '#c4600c');
  context.fillStyle = nose;
  polygon(context, [-2.6, -6.5, 0, -10, 2.6, -6.5]);
  context.fill();
  context.fillStyle = SAFFRON;
  context.fillRect(-2.6, -3.6, 5.2, 1.3);
  context.fillStyle = INDIA_GREEN;
  context.fillRect(-2.6, 2.2, 5.2, 1.3);
  // cockpit window with a glint
  const glass = context.createRadialGradient(-0.3, -0.6, 0.1, 0, -0.2, 1.3);
  glass.addColorStop(0, '#bfe8ff');
  glass.addColorStop(1, CHAKRA_BLUE);
  context.fillStyle = glass;
  context.beginPath(); context.arc(0, -0.2, 1.15, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#6b7380';
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
  context.fillStyle = 'rgba(255,255,255,0.35)';
  polygon(context, [direction * 6, -1, -direction * 13, -2, -direction * 13, 2, direction * 6, 1]);
  context.fill();
  const glow = context.createRadialGradient(direction * 7, 0, 0.5, direction * 7, 0, 6);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.5, '#bfefff');
  glow.addColorStop(1, 'rgba(120,200,255,0)');
  context.fillStyle = glow;
  context.beginPath(); context.arc(direction * 7, 0, 6, 0, Math.PI * 2); context.fill();
}

function paintMothership(context: CanvasRenderingContext2D) {
  const hull = context.createLinearGradient(0, -2, 0, 5);
  hull.addColorStop(0, '#b794f6');
  hull.addColorStop(1, '#3d1d7a');
  context.fillStyle = hull;
  context.beginPath(); context.ellipse(0, 1.5, 12.5, 3.8, 0, 0, Math.PI * 2); context.fill();
  context.shadowBlur = 0;
  const dome = context.createRadialGradient(-1.5, -3, 0.3, 0, -1.2, 5.5);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(0.4, '#c9b6ff');
  dome.addColorStop(1, 'rgba(120,90,200,0.8)');
  context.fillStyle = dome;
  context.beginPath(); context.ellipse(0, -1.2, 5.5, 3.8, 0, Math.PI, 0); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.fillRect(-11, 0.6, 22, 0.5);
  for (let light = -9; light <= 9; light += 4.5) {
    const lamp = context.createRadialGradient(light, 2.2, 0, light, 2.2, 1.6);
    lamp.addColorStop(0, '#ffffff');
    lamp.addColorStop(0.4, '#69f0ae');
    lamp.addColorStop(1, 'rgba(105,240,174,0)');
    context.fillStyle = lamp;
    context.beginPath(); context.arc(light, 2.2, 1.6, 0, Math.PI * 2); context.fill();
  }
}

// ------------------------------------------------------------------ dynamic bits

/** An additive glow centred on (x, y), `size` units across. Callers set globalCompositeOperation = 'lighter' around batches. */
export function drawGlow(context: CanvasRenderingContext2D, sprites: Sprites, color: GlowColor, x: number, y: number, size: number, alpha: number) {
  if (alpha <= 0) return;
  context.globalAlpha = Math.min(1, alpha);
  context.drawImage(sprites.glows[color], x - size / 2, y - size / 2, size, size);
  context.globalAlpha = 1;
}

export function drawFlame(context: CanvasRenderingContext2D, x: number, y: number, clock: number, sprites?: Sprites) {
  const flicker = 2.6 + Math.sin(clock * 47) * 0.8 + Math.sin(clock * 31) * 0.5;
  if (sprites) {
    context.globalCompositeOperation = 'lighter';
    drawGlow(context, sprites, GlowColor.Saffron, x, y + 8.5 + flicker * 0.4, 9 + flicker, 0.7);
    context.globalCompositeOperation = 'source-over';
  }
  context.fillStyle = SAFFRON;
  polygon(context, [x - 1.6, y + 7, x + 1.6, y + 7, x, y + 8 + flicker * 1.4]);
  context.fill();
  context.fillStyle = '#ffe08a';
  polygon(context, [x - 0.9, y + 7, x + 0.9, y + 7, x, y + 7.6 + flicker * 0.9]);
  context.fill();
  context.fillStyle = '#ffffff';
  context.fillRect(x - 0.4, y + 7, 0.8, 0.9);
}

/** `style`: 0 standard, 1 machine gun, 2 triple stream (sprites.bolts). */
export function drawPlayerBullet(context: CanvasRenderingContext2D, sprites: Sprites, x: number, y: number, style: number) {
  context.drawImage(sprites.bolts[style], x - BOLT_WIDTH / 2, y - 2.5, BOLT_WIDTH, BOLT_HEIGHT);
}

export function drawEnemyBullet(context: CanvasRenderingContext2D, kind: number, x: number, y: number, age: number) {
  if (kind === EnemyKind.Drone) {
    const pink = (Math.floor(age * 12) & 1) === 1;
    context.fillStyle = pink ? 'rgba(255,79,216,0.35)' : 'rgba(105,240,174,0.35)';
    context.beginPath(); context.arc(x, y + 0.8, 2.6, 0, Math.PI * 2); context.fill();
    context.fillStyle = pink ? '#ff9de8' : '#b9ffd9';
    context.beginPath(); context.arc(x, y + 0.8, 1.3, 0, Math.PI * 2); context.fill();
  } else if (kind === EnemyKind.Debris) {
    context.fillStyle = 'rgba(144,202,249,0.35)';
    context.fillRect(x - 1.3, y - 3, 2.6, 7.5);
    context.fillStyle = '#e8ecf2';
    context.fillRect(x - 0.55, y - 2.5, 1.1, 6);
  } else {
    context.fillStyle = 'rgba(255,122,69,0.35)';
    context.beginPath(); context.arc(x, y + 1, 2.4, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ff7a45';
    context.fillRect(x - 1, y - 1, 2, 4);
    context.fillStyle = '#ffe0c0';
    context.fillRect(x - 0.45, y - 0.5, 0.9, 2.5);
  }
}

const PARTICLE_COLORS = [
  ['#e8cdb0', '#a08a76', '#ffcc80'],
  ['#ffd54f', '#7fa8ff', '#ffffff'],
  ['#ff4fd8', '#69f0ae', '#f3c6ff'],
  ['#ffffff', '#ffd23f', '#ff9de8'],
  [SAFFRON, '#ffffff', '#3fbf3a'],
  ['#ffd54f', '#5f8de0', '#ffffff'],
];
const PARTICLE_GLOWS = [GlowColor.Saffron, GlowColor.Cyan, GlowColor.Magenta, GlowColor.Gold, GlowColor.Saffron, GlowColor.Gold];
const NUMBER_TEXT: Record<number, string> = { 50: '+50', 100: '+100', 150: '+150', 300: '+300', 500: '+500' };

export function drawParticle(context: CanvasRenderingContext2D, sprites: Sprites, kind: ParticleKind, x: number, y: number, progress: number, value: number, index: number) {
  const colorIndex = Math.min(value, 5) | 0;
  const palette = PARTICLE_COLORS[colorIndex];
  const fade = 1 - progress;
  if (kind === ParticleKind.Spark || kind === ParticleKind.Shard) {
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = fade;
    context.fillStyle = palette[index % 3];
    const size = (kind === ParticleKind.Shard ? 1.7 : 1.1) * (0.6 + fade * 0.4);
    context.fillRect(x - size / 2, y - size / 2, size, size);
    context.globalCompositeOperation = 'source-over';
  } else if (kind === ParticleKind.Ring) {
    // a bright fireball flash that opens into a shockwave ring
    context.globalCompositeOperation = 'lighter';
    if (progress < 0.45) drawGlow(context, sprites, PARTICLE_GLOWS[colorIndex], x, y, 10 + progress * (value === 4 ? 60 : 34), (0.45 - progress) * 2.4);
    if (progress < 0.2) drawGlow(context, sprites, GlowColor.White, x, y, 6 + progress * 30, 1 - progress * 5);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = fade * 0.85;
    context.strokeStyle = palette[0];
    context.lineWidth = 1.1 * fade + 0.25;
    context.beginPath(); context.arc(x, y, 3 + progress * (value === 4 ? 22 : 11), 0, Math.PI * 2); context.stroke();
  } else if (kind === ParticleKind.Ember) {
    // muzzle flash
    context.globalCompositeOperation = 'lighter';
    drawGlow(context, sprites, GlowColor.Saffron, x, y, 7 + fade * 4, fade);
    context.globalAlpha = fade;
    context.fillStyle = '#fff1c1';
    context.beginPath(); context.arc(x, y, 1.6 * fade + 0.4, 0, Math.PI * 2); context.fill();
    context.globalCompositeOperation = 'source-over';
  } else if (kind === ParticleKind.ScoreText) {
    context.globalAlpha = Math.min(1, fade * 2);
    context.font = '900 7.5px system-ui, sans-serif';
    context.textAlign = 'center';
    context.lineWidth = 1.6;
    context.strokeStyle = 'rgba(40,10,0,0.85)';
    const text = NUMBER_TEXT[value] ?? '';
    context.strokeText(text, x, y);
    context.fillStyle = value >= 500 ? '#ff9de8' : '#ffd23f';
    context.fillText(text, x, y);
  }
  context.globalAlpha = 1;
}
