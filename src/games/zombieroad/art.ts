/**
 * Zombie Road's art: a night-time city road seen from above, drawn in code (no image files).
 * Everything static (the road, the fog and vignette, zombie and survivor sprites) is pre-rendered into offscreen canvases
 * at the current scale, so a frame is mostly drawImage calls plus a few small paths. Nothing is allocated per frame.
 */
import { CoverKind, DEFENSE_LINE_Y, PickupKind, WORLD_HEIGHT, WORLD_WIDTH, ZOMBIE_RADIUS, ZombieKind } from './engine';

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

function ellipse(context: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
}

function circle(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  // (older phones lack roundRect: plain corners there)
  if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, radius); else context.rect(x, y, width, height);
  context.fill();
}

// ------------------------------------------------------------------ the road

/** Left and right sidewalks (world units). */
export const SIDEWALK_WIDTH = 16;
/** Streetlights: pole x, y, which side (−1 left, 1 right). The second one flickers (drawn live). */
export const STREETLIGHTS: [number, number, number][] = [[6, 46, -1], [234, 120, 1], [6, 196, -1], [234, 262, 1]];
export const FLICKERING_LIGHT = 1;
const LAMP_REACH = 22;
export const lampPosition = (light: number): [number, number] => {
  const [x, y, side] = STREETLIGHTS[light];
  return [x - side * LAMP_REACH, y];
};

function paintRoad(context: CanvasRenderingContext2D) {
  const random = seededRandom(1977);
  // asphalt, darker toward the top where the horde comes from
  const asphalt = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  asphalt.addColorStop(0, '#1a1c20');
  asphalt.addColorStop(0.6, '#26282d');
  asphalt.addColorStop(1, '#2c2e33');
  context.fillStyle = asphalt;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // repaired patches
  for (let i = 0; i < 7; i++) {
    context.fillStyle = random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.025)';
    context.fillRect(SIDEWALK_WIDTH + random() * 180, random() * WORLD_HEIGHT, 14 + random() * 26, 8 + random() * 18);
  }
  // grain
  for (let i = 0; i < 1400; i++) {
    context.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
    context.fillRect(random() * WORLD_WIDTH, random() * WORLD_HEIGHT, 0.6, 0.6);
  }
  // oil stains and old blood
  for (let i = 0; i < 9; i++) ellipse(context, 24 + random() * 192, random() * WORLD_HEIGHT, 4 + random() * 8, 2 + random() * 4, i % 3 === 0 ? 'rgba(70,10,10,0.28)' : 'rgba(0,0,0,0.25)');
  // skid marks
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1.6;
  for (const [startX, startY, bend] of [[80, 20, 30], [86, 22, 30], [150, 150, -26], [156, 152, -26]]) {
    context.beginPath(); context.moveTo(startX, startY); context.quadraticCurveTo(startX + bend, startY + 40, startX + bend * 0.4, startY + 90); context.stroke();
  }
  // cracks
  context.strokeStyle = 'rgba(0,0,0,0.5)';
  context.lineWidth = 0.6;
  for (let i = 0; i < 14; i++) {
    let x = SIDEWALK_WIDTH + 6 + random() * 190, y = random() * WORLD_HEIGHT;
    context.beginPath(); context.moveTo(x, y);
    for (let segment = 0; segment < 5; segment++) { x += (random() - 0.5) * 9; y += random() * 6; context.lineTo(x, y); }
    context.stroke();
  }
  // lane dashes (worn) and the double yellow centre line
  context.fillStyle = 'rgba(225,225,215,0.55)';
  for (const laneX of [68, 172]) for (let y = -4; y < WORLD_HEIGHT; y += 22) if (random() > 0.12) context.fillRect(laneX - 0.8, y, 1.6, 11);
  context.fillStyle = 'rgba(230,180,40,0.6)';
  for (let y = 0; y < WORLD_HEIGHT; y += 6) if (random() > 0.08) { context.fillRect(117.6, y, 1.2, 6); context.fillRect(121.2, y, 1.2, 6); }
  // a zebra crossing up the road
  context.fillStyle = 'rgba(225,225,215,0.4)';
  for (let x = SIDEWALK_WIDTH + 6; x < WORLD_WIDTH - SIDEWALK_WIDTH - 6; x += 12) context.fillRect(x, 74, 7, 16);
  // manholes
  for (const [x, y] of [[44, 150], [196, 40]]) {
    circle(context, x, y, 5, '#3a3c40');
    context.strokeStyle = 'rgba(0,0,0,0.5)'; context.lineWidth = 0.5;
    for (let line = -3; line <= 3; line += 2) { context.beginPath(); context.moveTo(x - 4, y + line); context.lineTo(x + 4, y + line); context.stroke(); }
  }
  // sidewalks with slabs and a curb
  for (const left of [0, WORLD_WIDTH - SIDEWALK_WIDTH]) {
    context.fillStyle = '#44464b';
    context.fillRect(left, 0, SIDEWALK_WIDTH, WORLD_HEIGHT);
    context.strokeStyle = 'rgba(0,0,0,0.35)'; context.lineWidth = 0.5;
    for (let y = 0; y < WORLD_HEIGHT; y += 12) { context.beginPath(); context.moveTo(left, y); context.lineTo(left + SIDEWALK_WIDTH, y); context.stroke(); }
    const curbX = left === 0 ? SIDEWALK_WIDTH - 1.4 : left;
    context.fillStyle = '#707277';
    context.fillRect(curbX, 0, 1.4, WORLD_HEIGHT);
  }
  // roadside junk: a burnt-out car half off the left edge, a crashed van on the right, cones, tyres, a sawhorse barrier
  context.save(); context.translate(4, 118); context.rotate(0.12); paintBurntCar(context, 30, 15); context.restore();
  context.save(); context.translate(238, 30); context.rotate(-0.25); paintBurntCar(context, 34, 17); context.restore();
  for (const [x, y] of [[20, 230], [24, 238], [219, 182], [214, 300]]) paintCone(context, x, y);
  for (const [x, y] of [[229, 210], [11, 280]]) { circle(context, x, y, 3.2, '#121214'); circle(context, x, y, 1.4, '#2c2c30'); }
  paintSawhorse(context, 226, 90);
  // streetlight poles (their light pools are drawn on top, except the flickering one)
  for (let light = 0; light < STREETLIGHTS.length; light++) {
    const [x, y, side] = STREETLIGHTS[light];
    const [lampX] = lampPosition(light);
    context.strokeStyle = '#2a2b2f'; context.lineWidth = 1.6;
    context.beginPath(); context.moveTo(x, y); context.lineTo(lampX, y); context.stroke();
    circle(context, x, y, 2.4, '#55575c');
    roundedRect(context, lampX - (side > 0 ? 3 : 1), y - 1.6, 4, 3.2, 1, '#77797e');
    if (light !== FLICKERING_LIGHT) paintLightPool(context, lampX, y, 1);
  }
  // the last line: hazard stripe and sandbags behind the survivor
  const stripeY = DEFENSE_LINE_Y - 1;
  for (let x = 0; x < WORLD_WIDTH; x += 6) { context.fillStyle = (x / 6) % 2 ? '#1c1c1c' : '#d9a92b'; context.fillRect(x, stripeY, 6, 2); }
  for (let x = -4; x < WORLD_WIDTH + 6; x += 10) {
    roundedRect(context, x, DEFENSE_LINE_Y + 4, 11, 6, 3, '#8a7a55');
    roundedRect(context, x + 5, DEFENSE_LINE_Y + 9, 11, 6, 3, '#776948');
  }
}

/** A pool of warm streetlight on the road (also the flicker sprite). */
function paintLightPool(context: CanvasRenderingContext2D, x: number, y: number, strength: number) {
  const pool = context.createRadialGradient(x, y + 4, 0, x, y + 4, 34);
  pool.addColorStop(0, `rgba(255,214,140,${0.2 * strength})`);
  pool.addColorStop(0.5, `rgba(255,190,110,${0.08 * strength})`);
  pool.addColorStop(1, 'rgba(255,180,100,0)');
  context.fillStyle = pool;
  context.fillRect(x - 36, y - 32, 72, 72);
}

function paintBurntCar(context: CanvasRenderingContext2D, length: number, width: number) {
  roundedRect(context, -length / 2, -width / 2, length, width, 3, '#1f1a18');
  roundedRect(context, -length / 4, -width / 2 + 2, length / 2, width - 4, 2, '#0e0c0b');
  context.fillStyle = 'rgba(120,60,30,0.5)';
  context.fillRect(-length / 2 + 2, -width / 2 + 1, 4, 3);
  context.fillRect(length / 2 - 7, width / 2 - 4, 5, 3);
}

function paintCone(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#e8641c';
  context.fillRect(x - 2.6, y - 2.6, 5.2, 5.2);
  circle(context, x, y, 1.8, '#f2f2f2');
  circle(context, x, y, 0.9, '#e8641c');
}

function paintSawhorse(context: CanvasRenderingContext2D, x: number, y: number) {
  for (let stripe = 0; stripe < 5; stripe++) {
    context.fillStyle = stripe % 2 ? '#f0f0f0' : '#e0401c';
    context.fillRect(x - 6 + stripe * 2.4, y - 1.5, 2.4, 3);
  }
}

/** The fog the horde walks out of, and a dark vignette, drawn over the action. */
function paintAtmosphere(context: CanvasRenderingContext2D) {
  const fog = context.createLinearGradient(0, 0, 0, 80);
  fog.addColorStop(0, 'rgba(8,10,14,0.92)');
  fog.addColorStop(0.45, 'rgba(12,16,20,0.45)');
  fog.addColorStop(1, 'rgba(14,18,22,0)');
  context.fillStyle = fog;
  context.fillRect(0, 0, WORLD_WIDTH, 80);
  const vignette = context.createRadialGradient(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.6, WORLD_HEIGHT * 0.3, WORLD_WIDTH / 2, WORLD_HEIGHT * 0.6, WORLD_HEIGHT * 0.78);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

/** A soft drifting fog bank (drawn twice, sliding sideways). */
function paintFogBank(context: CanvasRenderingContext2D) {
  const random = seededRandom(42);
  for (let i = 0; i < 9; i++) {
    const x = random() * WORLD_WIDTH, y = 14 + random() * 60, radius = 18 + random() * 22;
    const puff = context.createRadialGradient(x, y, 0, x, y, radius);
    puff.addColorStop(0, 'rgba(150,165,170,0.1)');
    puff.addColorStop(1, 'rgba(150,165,170,0)');
    context.fillStyle = puff;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

// ------------------------------------------------------------------ zombies and the survivor

interface ZombieLook { skin: string; shirt: string; pants: string; dark: string }
const ZOMBIE_LOOKS: ZombieLook[] = [
  { skin: '#8fae6b', shirt: '#4f6286', pants: '#33363f', dark: '#2a3320' }, // walker: faded office shirt
  { skin: '#b7c792', shirt: '#a3352c', pants: '#2b2b33', dark: '#3a1410' }, // runner: red hoodie
  { skin: '#76875a', shirt: '#4b3a2b', pants: '#2a241e', dark: '#1d1a12' }, // brute: torn work vest
  { skin: '#b9c94c', shirt: '#6f7d2a', pants: '#3a3a20', dark: '#4a5a10' }, // spitter: bloated, yellow-green
  { skin: '#6c7b52', shirt: '#3a3f2c', pants: '#22251a', dark: '#161a10' }, // tank
];
/** Each sprite is a square this many world units across, centred on the zombie. */
export const zombieSpriteSize = (kind: number) => ZOMBIE_RADIUS[kind] * 2 + 14;
export const ZOMBIE_FRAMES = 4;

/** One zombie, facing down the road toward the survivor, arms reaching. `step` is −1..1 (leg/arm swing). */
function paintZombie(context: CanvasRenderingContext2D, kind: number, step: number) {
  const radius = ZOMBIE_RADIUS[kind];
  const look = ZOMBIE_LOOKS[kind];
  const isRunner = kind === ZombieKind.Runner;
  ellipse(context, 0, radius * 0.35, radius * 1.05, radius * 0.6, 'rgba(0,0,0,0.38)');
  // feet
  const stride = (isRunner ? 2.2 : 1.4) * step * (radius / 6);
  ellipse(context, -radius * 0.38, radius * 0.25 + stride, radius * 0.22, radius * 0.34, look.pants);
  ellipse(context, radius * 0.38, radius * 0.25 - stride, radius * 0.22, radius * 0.34, look.pants);
  // arms: reaching forward (down); runners pump them back
  const armWidth = Math.max(1.6, radius * (kind === ZombieKind.Tank ? 0.38 : kind === ZombieKind.Brute ? 0.34 : 0.27));
  for (const side of [-1, 1]) {
    const shoulderX = side * radius * 0.78;
    const reach = isRunner ? -radius * 0.9 - side * step * 1.5 : radius * 1.05 + side * step * 1.2;
    context.strokeStyle = look.shirt; context.lineWidth = armWidth; context.lineCap = 'round';
    context.beginPath(); context.moveTo(shoulderX, 0); context.lineTo(shoulderX * 0.95, reach * 0.45); context.stroke();
    context.strokeStyle = look.skin;
    context.beginPath(); context.moveTo(shoulderX * 0.95, reach * 0.45); context.lineTo(shoulderX * (isRunner ? 1.05 : 0.8), reach); context.stroke();
    circle(context, shoulderX * (isRunner ? 1.05 : 0.8), reach, armWidth * 0.62, look.skin);
  }
  // torso (shoulders seen from above)
  const torsoWidth = radius * (kind === ZombieKind.Spitter ? 1.0 : 0.95), torsoDepth = radius * (kind === ZombieKind.Spitter ? 0.8 : 0.58);
  ellipse(context, 0, -radius * 0.05, torsoWidth, torsoDepth, look.shirt);
  // rips and stains
  context.fillStyle = look.dark;
  context.fillRect(-torsoWidth * 0.5, -torsoDepth * 0.3, torsoWidth * 0.3, torsoDepth * 0.25);
  context.fillStyle = 'rgba(90,10,10,0.55)';
  context.fillRect(torsoWidth * 0.2, torsoDepth * 0.05, torsoWidth * 0.35, torsoDepth * 0.3);
  if (kind === ZombieKind.Spitter) {
    for (const [x, y, size] of [[-3.4, -1.5, 1.1], [2.8, -2.6, 0.9], [3.6, 1.2, 1.2], [-1.2, 2.6, 0.8]]) circle(context, x, y, size, '#dcf06a');
  }
  if (kind === ZombieKind.Tank || kind === ZombieKind.Brute) {
    // bone spurs on the shoulders
    const spurs = kind === ZombieKind.Tank ? 4 : 2;
    for (const side of [-1, 1]) for (let spur = 0; spur < spurs; spur++) {
      const x = side * (torsoWidth * 0.35 + spur * radius * 0.14), y = -torsoDepth * 0.6 + spur * 0.8;
      context.fillStyle = '#e6dcc0';
      context.beginPath(); context.moveTo(x - 1, y + 1); context.lineTo(x + side * 0.6, y - radius * 0.22); context.lineTo(x + 1, y + 1); context.closePath(); context.fill();
    }
  }
  // head, a little forward, with patchy hair and glowing eyes
  const headRadius = radius * (kind === ZombieKind.Tank ? 0.36 : kind === ZombieKind.Brute ? 0.4 : 0.48);
  const headY = radius * 0.18;
  circle(context, 0, headY, headRadius, look.skin);
  context.fillStyle = look.dark;
  context.beginPath(); context.arc(0, headY - headRadius * 0.15, headRadius * 0.9, Math.PI * 1.05, Math.PI * 1.95); context.fill();
  const eyeColor = kind === ZombieKind.Tank ? '#ff3b2f' : kind === ZombieKind.Spitter ? '#e9ff5a' : '#ffdf6b';
  circle(context, -headRadius * 0.38, headY + headRadius * 0.45, Math.max(0.45, headRadius * 0.17), eyeColor);
  circle(context, headRadius * 0.38, headY + headRadius * 0.45, Math.max(0.45, headRadius * 0.17), eyeColor);
}

/** The survivor seen from above, rifle pointing up the road. */
function paintSurvivor(context: CanvasRenderingContext2D) {
  ellipse(context, 0, 2.5, 7.5, 4.2, 'rgba(0,0,0,0.4)');
  // boots
  ellipse(context, -2.6, 3.6, 1.6, 2.2, '#2a2420');
  ellipse(context, 2.6, 3.0, 1.6, 2.2, '#2a2420');
  // backpack
  roundedRect(context, -3.6, 1.2, 7.2, 4.6, 1.4, '#6b4a2c');
  context.fillStyle = '#4e351f'; context.fillRect(-3.6, 2.8, 7.2, 0.8);
  // jacket shoulders
  ellipse(context, 0, 0, 6.4, 3.9, '#5d6b34');
  context.fillStyle = '#c94a2a'; context.fillRect(-6, -0.6, 1.6, 1.4); // armband
  // arms forward to the rifle
  context.strokeStyle = '#5d6b34'; context.lineWidth = 2.1; context.lineCap = 'round';
  context.beginPath(); context.moveTo(-4.6, -0.8); context.lineTo(-1.2, -5.2); context.stroke();
  context.beginPath(); context.moveTo(4.6, -0.8); context.lineTo(1.2, -7.6); context.stroke();
  circle(context, -1.0, -5.4, 1.1, '#d9a77c');
  circle(context, 1.0, -7.8, 1.1, '#d9a77c');
  // rifle
  context.fillStyle = '#1b1c1f'; context.fillRect(-0.8, -12.5, 1.6, 10);
  context.fillStyle = '#5a3d24'; context.fillRect(-1.1, -4.2, 2.2, 3.2);
  // head with a cap
  circle(context, 0, -0.6, 2.9, '#d9a77c');
  context.fillStyle = '#2e4a6b';
  context.beginPath(); context.arc(0, -0.2, 3.0, Math.PI * 0.95, Math.PI * 2.05); context.fill();
  context.fillRect(-1.8, -3.6, 3.6, 1.4);
}

export const PLAYER_SPRITE_SIZE = 30;

export interface Sprites {
  road: HTMLCanvasElement;
  atmosphere: HTMLCanvasElement;
  fogBank: HTMLCanvasElement;
  flickerPool: HTMLCanvasElement;
  /** [kind * ZOMBIE_FRAMES + frame] */
  zombies: HTMLCanvasElement[];
  /** White silhouettes for the hit flash, one per kind. */
  zombieFlashes: HTMLCanvasElement[];
  survivor: HTMLCanvasElement;
  /** Spread, rapid, medkit crates. */
  pickups: HTMLCanvasElement[];
}

const STEPS = [0, 1, 0, -1];

export function createSprites(scale: number): Sprites {
  const zombies: HTMLCanvasElement[] = [];
  const zombieFlashes: HTMLCanvasElement[] = [];
  for (let kind = 0; kind < ZOMBIE_LOOKS.length; kind++) {
    const size = zombieSpriteSize(kind);
    for (let frame = 0; frame < ZOMBIE_FRAMES; frame++) {
      zombies.push(makeSprite(size, size, scale, context => { context.translate(size / 2, size / 2); paintZombie(context, kind, STEPS[frame]); }));
    }
    zombieFlashes.push(makeSprite(size, size, scale, context => {
      context.translate(size / 2, size / 2);
      paintZombie(context, kind, 0);
      context.globalCompositeOperation = 'source-atop';
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.fillRect(-size / 2, -size / 2, size, size);
    }));
  }
  const flickerSize = 72;
  return {
    road: makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, paintRoad),
    atmosphere: makeSprite(WORLD_WIDTH, WORLD_HEIGHT, scale, paintAtmosphere),
    fogBank: makeSprite(WORLD_WIDTH, 100, scale, paintFogBank),
    flickerPool: makeSprite(flickerSize, flickerSize, scale, context => paintLightPool(context, flickerSize / 2, flickerSize / 2 - 4, 1.3)),
    zombies,
    zombieFlashes,
    survivor: makeSprite(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, scale, context => { context.translate(PLAYER_SPRITE_SIZE / 2, PLAYER_SPRITE_SIZE / 2); paintSurvivor(context); }),
    pickups: [PickupKind.Spread, PickupKind.Rapid, PickupKind.Medkit].map(kind => makeSprite(14, 14, scale, context => { context.translate(7, 7); paintPickup(context, kind); })),
  };
}

/** Pickup crate colours (also used for the HUD timers and the controls card legend). */
export const PICKUP_COLORS = ['#ff9a2e', '#36c9f0', '#f4f4f4'] as const;

function paintPickup(context: CanvasRenderingContext2D, kind: PickupKind) {
  const glow = context.createRadialGradient(0, 0, 1, 0, 0, 7);
  glow.addColorStop(0, kind === PickupKind.Medkit ? 'rgba(255,90,90,0.55)' : kind === PickupKind.Spread ? 'rgba(255,160,60,0.55)' : 'rgba(60,200,255,0.55)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = glow;
  context.fillRect(-7, -7, 14, 14);
  roundedRect(context, -4.5, -4.5, 9, 9, 1.6, PICKUP_COLORS[kind]);
  context.strokeStyle = 'rgba(0,0,0,0.45)'; context.lineWidth = 0.6;
  context.strokeRect(-4.5, -4.5, 9, 9);
  if (kind === PickupKind.Medkit) {
    context.fillStyle = '#d8262c';
    context.fillRect(-1, -3.2, 2, 6.4);
    context.fillRect(-3.2, -1, 6.4, 2);
  } else {
    context.fillStyle = '#121212';
    context.font = '900 6.5px system-ui, sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(kind === PickupKind.Spread ? 'S' : 'R', 0, 0.4);
  }
}

// ------------------------------------------------------------------ cover

/** A wrecked car or a barricade, worn down to `health` (0..1); a broken one leaves scorched rubble that blocks nothing. */
export function drawCover(context: CanvasRenderingContext2D, kind: number, x: number, y: number, health: number, clock: number) {
  if (kind === CoverKind.WreckedCar) {
    if (health <= 0) {
      ellipse(context, x, y, 16, 8, 'rgba(0,0,0,0.45)');
      context.fillStyle = '#1b1715';
      context.fillRect(x - 12, y - 5, 9, 4); context.fillRect(x + 2, y, 10, 4); context.fillRect(x - 3, y - 3, 4, 6);
      return;
    }
    ellipse(context, x + 1.5, y + 3, 17, 9, 'rgba(0,0,0,0.4)');
    // wheels peeking out
    context.fillStyle = '#0f0f10';
    for (const [wheelX, wheelY] of [[-10, -9.6], [8, -9.6], [-10, 7.6], [8, 7.6]]) context.fillRect(x + wheelX, y + wheelY, 5, 2);
    roundedRect(context, x - 15, y - 8.5, 30, 17, 4, health > 0.5 ? '#7d2f23' : '#5b261d');
    roundedRect(context, x - 6.5, y - 6.5, 13, 13, 2, '#3e1a14');
    context.fillStyle = '#4c5d6b';
    context.fillRect(x - 9.5, y - 6, 3, 12);
    context.fillRect(x + 6.5, y - 6, 2.4, 12);
    // cracks in the glass, dents and scorch as it takes damage
    context.strokeStyle = 'rgba(220,230,240,0.6)'; context.lineWidth = 0.4;
    context.beginPath(); context.moveTo(x - 9.5, y - 4); context.lineTo(x - 7, y - 1); context.lineTo(x - 8.6, y + 3); context.stroke();
    if (health < 0.7) { ellipse(context, x + 10, y - 3, 3.2, 2.2, 'rgba(0,0,0,0.45)'); ellipse(context, x - 2, y + 6, 3, 1.6, 'rgba(0,0,0,0.4)'); }
    if (health < 0.4) {
      ellipse(context, x - 11, y + 2, 4, 3, 'rgba(0,0,0,0.5)');
      // a small fire on the hood
      const flicker = Math.sin(clock * 18 + x) * 0.6;
      circle(context, x - 11, y - 1, 2.4 + flicker * 0.4, 'rgba(255,120,30,0.85)');
      circle(context, x - 11, y - 1.6, 1.2 + flicker * 0.3, 'rgba(255,230,120,0.9)');
    }
  } else {
    if (health <= 0) {
      context.fillStyle = '#5a5a55';
      for (let chunk = 0; chunk < 6; chunk++) context.fillRect(x - 14 + chunk * 5 + (chunk % 2), y - 2 + (chunk % 3), 3, 2.4);
      return;
    }
    ellipse(context, x + 1, y + 3.5, 16, 4.5, 'rgba(0,0,0,0.4)');
    roundedRect(context, x - 15, y - 5, 30, 10, 2, '#9c9b94');
    roundedRect(context, x - 15, y - 5, 30, 4, 2, '#b8b7af');
    // red and white hazard stripes
    for (let stripe = 0; stripe < 6; stripe++) {
      context.fillStyle = stripe % 2 ? '#f2f2ee' : '#c8321f';
      context.fillRect(x - 13 + stripe * 4.4, y - 0.5, 4.4, 2.6);
    }
    // bites taken out of it
    const chunks = Math.floor((1 - health) * 6);
    context.fillStyle = '#26282d';
    for (let chunk = 0; chunk < chunks; chunk++) {
      const chunkX = x - 13 + ((chunk * 7) % 26);
      context.beginPath(); context.moveTo(chunkX, y - 5.2); context.lineTo(chunkX + 4, y - 5.2); context.lineTo(chunkX + 2, y - 1.5 - (chunk % 2) * 1.5); context.closePath(); context.fill();
    }
  }
  if (health < 1) {
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.fillRect(x - 10, y + 11, 20, 2);
    context.fillStyle = health > 0.5 ? '#9be36a' : health > 0.25 ? '#f2c14e' : '#ef4d3c';
    context.fillRect(x - 10, y + 11, 20 * health, 2);
  }
}

/** Stain colour per zombie kind (dark ichor; spitters leave acid). */
export const STAIN_COLORS = ['rgba(52,70,30,0.5)', 'rgba(80,20,16,0.5)', 'rgba(40,52,26,0.55)', 'rgba(150,180,30,0.35)', 'rgba(36,46,22,0.6)'] as const;
/** Splat particle colours per zombie kind. */
export const SPLAT_COLORS = ['#5f7d3a', '#8a2a20', '#55663a', '#c6e046', '#4a5a30'] as const;

/** Paint a lasting stain on the stains layer where a zombie fell. */
export function stampStain(context: CanvasRenderingContext2D, x: number, y: number, kind: number, random: () => number) {
  context.fillStyle = STAIN_COLORS[kind] ?? STAIN_COLORS[0];
  const size = ZOMBIE_RADIUS[kind] ?? 6;
  for (let blot = 0; blot < 4; blot++) {
    context.beginPath();
    context.arc(x + (random() - 0.5) * size * 1.6, y + (random() - 0.5) * size * 1.2, size * (0.25 + random() * 0.35), 0, Math.PI * 2);
    context.fill();
  }
}
