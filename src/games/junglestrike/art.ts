/**
 * Jungle Strike's original canvas art. Everything is drawn in world units (the caller sets the scale transform);
 * the scenery, ground, ledges, planks and the gate are pre-rendered once per screen scale into small offscreen
 * canvases, and the moving things are a handful of fillRects each, so a frame stays cheap on a phone.
 */
import { BOSS_WALL_X, EntityKind, LEVEL_END, ParticleKind, Pose, Weapon, WEAPON_LETTERS } from './engine';

export const BACKDROP_WIDTH = 480;
export const CANOPY_WIDTH = 420;
const GROUND_TILE = 32;
const LEDGE_TILE = 32;
const TAU = Math.PI * 2;

function makeCanvas(widthUnits: number, heightUnits: number, scale: number, draw: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(widthUnits * scale));
  canvas.height = Math.max(1, Math.ceil(heightUnits * scale));
  const context = canvas.getContext('2d')!;
  context.scale(canvas.width / widthUnits, canvas.height / heightUnits);
  draw(context);
  return canvas;
}

/** A tiny deterministic random source for scenery details. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

/** Far layer: dusk sky, a low sun and two ridges of mountains (scrolls at 25%). */
export function createBackdrop(scale: number): HTMLCanvasElement {
  return makeCanvas(BACKDROP_WIDTH, 240, scale, context => {
    const sky = context.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, '#0b1a33');
    sky.addColorStop(0.45, '#22466a');
    sky.addColorStop(0.75, '#c8734a');
    sky.addColorStop(1, '#f2b05e');
    context.fillStyle = sky;
    context.fillRect(0, 0, BACKDROP_WIDTH, 240);
    const random = seeded(7);
    context.fillStyle = 'rgba(255,255,255,0.7)';
    for (let star = 0; star < 40; star++) context.fillRect(random() * BACKDROP_WIDTH, random() * 80, 0.8, 0.8);
    context.fillStyle = 'rgba(255,214,140,0.9)';
    context.beginPath(); context.arc(330, 104, 16, 0, TAU); context.fill();
    const ridge = (base: number, height: number, color: string, seed: number) => {
      const ridgeRandom = seeded(seed);
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, 240);
      let y = base;
      context.lineTo(0, y);
      for (let x = 0; x <= BACKDROP_WIDTH; x += 24) {
        y = base - ridgeRandom() * height;
        context.lineTo(x, x === BACKDROP_WIDTH ? base - height * 0.5 : y);
      }
      context.lineTo(BACKDROP_WIDTH, base - height * 0.5);
      context.lineTo(BACKDROP_WIDTH, 240);
      context.closePath();
      context.fill();
    };
    ridge(170, 50, '#3b4f6b', 3);
    ridge(195, 40, '#24384f', 11);
  });
}

/** Middle layer: palm trees and jungle silhouettes (scrolls at 55%, transparent above). */
export function createCanopy(scale: number): HTMLCanvasElement {
  return makeCanvas(CANOPY_WIDTH, 240, scale, context => {
    const random = seeded(21);
    context.fillStyle = '#123527';
    for (let x = -20; x < CANOPY_WIDTH + 20; x += 18) {
      context.beginPath(); context.arc(x, 200 + random() * 10, 16 + random() * 10, 0, TAU); context.fill();
    }
    context.fillRect(0, 205, CANOPY_WIDTH, 35);
    for (let palm = 0; palm < 6; palm++) {
      const x = 30 + palm * 70 + random() * 20;
      const top = 95 + random() * 40;
      context.strokeStyle = '#1b3f2c';
      context.lineWidth = 4;
      context.beginPath(); context.moveTo(x, 215); context.quadraticCurveTo(x + 8, (top + 215) / 2, x + 4, top); context.stroke();
      context.fillStyle = '#1d4a33';
      for (let leaf = 0; leaf < 6; leaf++) {
        const angle = (leaf / 6) * TAU + 0.3;
        context.beginPath();
        context.moveTo(x + 4, top);
        context.quadraticCurveTo(x + 4 + Math.cos(angle) * 18, top + Math.sin(angle) * 8 - 8, x + 4 + Math.cos(angle) * 30, top + Math.abs(Math.sin(angle)) * 14 + 4);
        context.quadraticCurveTo(x + 4 + Math.cos(angle) * 16, top + Math.sin(angle) * 6, x + 4, top + 2);
        context.fill();
      }
    }
  });
}

export interface TerrainSprites { ground: HTMLCanvasElement; ledge: HTMLCanvasElement; plank: HTMLCanvasElement; gate: HTMLCanvasElement; }

export function createTerrainSprites(scale: number): TerrainSprites {
  const ground = makeCanvas(GROUND_TILE, 40, scale, context => {
    context.fillStyle = '#5a3b24';
    context.fillRect(0, 0, GROUND_TILE, 40);
    const random = seeded(5);
    for (let rock = 0; rock < 9; rock++) {
      context.fillStyle = rock % 2 ? '#6e4a2e' : '#47301e';
      context.fillRect(random() * GROUND_TILE, 8 + random() * 30, 3 + random() * 6, 2 + random() * 4);
    }
    context.fillStyle = '#2f8a3a';
    context.fillRect(0, 0, GROUND_TILE, 5);
    context.fillStyle = '#4cc05a';
    context.fillRect(0, 0, GROUND_TILE, 2);
    context.fillStyle = '#2f8a3a';
    for (let blade = 0; blade < GROUND_TILE; blade += 4) context.fillRect(blade, 5, 2, 2 + ((blade * 7) % 3));
  });
  const ledge = makeCanvas(LEDGE_TILE, 14, scale, context => {
    context.fillStyle = '#4b5a3a';
    context.beginPath();
    context.moveTo(0, 2); context.lineTo(LEDGE_TILE, 2); context.lineTo(LEDGE_TILE - 3, 10); context.lineTo(18, 13); context.lineTo(8, 11); context.lineTo(2, 9);
    context.closePath(); context.fill();
    context.fillStyle = '#6b7a4e';
    context.fillRect(0, 2, LEDGE_TILE, 3);
    context.fillStyle = '#3fae4c';
    context.fillRect(0, 0, LEDGE_TILE, 2.5);
    context.fillStyle = '#2a7d36';
    context.fillRect(6, 9, 1.4, 5); context.fillRect(22, 10, 1.4, 4);
  });
  const plank = makeCanvas(20, 10, scale, context => {
    context.fillStyle = '#7a5530';
    context.fillRect(0, 0, 20, 5);
    context.fillStyle = '#a07040';
    context.fillRect(0.5, 0.5, 9, 1.5); context.fillRect(10.5, 0.5, 9, 1.5);
    context.fillStyle = '#4a3018';
    context.fillRect(9.6, 0, 0.8, 5);
    context.fillStyle = '#8c8c8c';
    context.fillRect(0, 5, 20, 1.5);
    context.fillRect(2, 6, 1, 4); context.fillRect(17, 6, 1, 4);
  });
  const gateWidth = LEVEL_END - BOSS_WALL_X;
  const gate = makeCanvas(gateWidth, 200, scale, context => {
    context.fillStyle = '#3a4048';
    context.fillRect(0, 0, gateWidth, 200);
    context.fillStyle = '#4c545e';
    for (let row = 0; row < 200; row += 20) for (let column = (row / 20) % 2 ? 0 : 10; column < gateWidth; column += 20) context.fillRect(column + 1, row + 1, 18, 18);
    context.fillStyle = '#232830';
    context.fillRect(0, 0, 4, 200);
    context.fillStyle = '#c0392b';
    context.fillRect(6, 4, gateWidth - 12, 6);
    context.fillStyle = '#f1c40f';
    for (let stripe = 8; stripe < gateWidth - 8; stripe += 8) context.fillRect(stripe, 4, 3, 6);
    // battlements
    context.fillStyle = '#2b3038';
    for (let tooth = 0; tooth < gateWidth; tooth += 16) context.fillRect(tooth, -1, 9, 4);
    // the core's frame
    context.fillStyle = '#1b1f26';
    context.fillRect(2, 120, 30, 40);
  });
  return { ground, ledge, plank, gate };
}

/** Draw a sprite tiled across [left, right] in world units, only where it's on screen. */
export function drawTiled(context: CanvasRenderingContext2D, sprite: HTMLCanvasElement, tileWidth: number, left: number, right: number, top: number, height: number,
  cameraX: number, viewWidth: number) {
  const from = Math.max(left, cameraX - ((cameraX - left) % tileWidth) - tileWidth);
  const to = Math.min(right, cameraX + viewWidth + tileWidth);
  for (let x = from; x < to; x += tileWidth) {
    const width = Math.min(tileWidth, right - x);
    if (width <= 0) break;
    context.drawImage(sprite, 0, 0, sprite.width * (width / tileWidth), sprite.height, x, top, width + 0.05, height);
  }
}

export function drawWater(context: CanvasRenderingContext2D, left: number, right: number, surfaceY: number, clock: number) {
  context.fillStyle = '#145a73';
  context.fillRect(left, surfaceY, right - left, 240 - surfaceY);
  context.fillStyle = '#1f7f9c';
  context.fillRect(left, surfaceY, right - left, 3);
  context.fillStyle = 'rgba(200,240,255,0.55)';
  const shift = (clock * 14) % 24;
  for (let x = left - 24 + shift; x < right; x += 24) {
    if (x > left) context.fillRect(x, surfaceY + 6, 8, 1);
    if (x + 12 > left && x + 12 < right) context.fillRect(x + 12, surfaceY + 14, 6, 1);
  }
}

export function drawCheckpoint(context: CanvasRenderingContext2D, x: number, groundY: number, isReached: boolean, clock: number) {
  context.fillStyle = '#d9d9d9';
  context.fillRect(x - 1, groundY - 48, 2, 48);
  context.fillStyle = isReached ? '#46d369' : '#e53935';
  const wave = Math.sin(clock * 6) * 1.5;
  const flagTop = isReached ? groundY - 47 : groundY - 20;
  context.beginPath();
  context.moveTo(x + 1, flagTop); context.lineTo(x + 15, flagTop + 4 + wave); context.lineTo(x + 1, flagTop + 9);
  context.fill();
}

// ------------------------------------------------------------------ people

const SKIN = '#e9b48a';
const BANDANA = '#e53935';
const VEST = '#4c6b2f';
const PANTS = '#2d4f8a';
const BOOTS = '#2a1e14';
const GUN = '#26282c';
const GUN_LIGHT = '#8a8f98';

function drawGun(context: CanvasRenderingContext2D, shoulderX: number, shoulderY: number, angle: number, length: number) {
  context.save();
  context.translate(shoulderX, shoulderY);
  context.rotate(angle);
  context.fillStyle = SKIN;
  context.fillRect(0, -1.5, 6, 3);
  context.fillStyle = GUN;
  context.fillRect(3, -1.3, length, 2.6);
  context.fillStyle = GUN_LIGHT;
  context.fillRect(4, -1.3, length - 3, 0.8);
  context.restore();
}

const AIM_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (-3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];

/** The commando, feet at (x, y). */
export function drawHero(context: CanvasRenderingContext2D, x: number, y: number, facing: number, pose: Pose, aim: number, stride: number, clock: number, dyingSeconds: number) {
  context.save();
  context.translate(x, y);
  if (facing < 0) context.scale(-1, 1);
  // aim angle in the hero's own (right-facing) frame
  let aimAngle = AIM_ANGLES[aim] ?? 0;
  if (facing < 0) aimAngle = Math.PI - aimAngle;
  if (pose === Pose.Prone) {
    context.fillStyle = BOOTS; context.fillRect(-16, -4, 3, 4);
    context.fillStyle = PANTS; context.fillRect(-13, -5, 11, 4);
    context.fillStyle = VEST; context.fillRect(-3, -7, 10, 6);
    context.fillStyle = SKIN; context.fillRect(7, -9, 6, 6);
    context.fillStyle = BANDANA; context.fillRect(7, -9, 6, 2); context.fillRect(4, -9, 3, 1.4);
    drawGun(context, 6, -5.5, 0, 12);
  } else if (pose === Pose.Somersault) {
    context.translate(0, -16);
    context.rotate(clock * 20);
    context.fillStyle = PANTS; context.fillRect(-7, -2, 6, 7);
    context.fillStyle = VEST; context.fillRect(-2, -6, 8, 8);
    context.fillStyle = SKIN; context.fillRect(1, 2, 5, 5);
    context.fillStyle = BANDANA; context.fillRect(1, 2, 5, 1.6);
    context.fillStyle = BOOTS; context.fillRect(-8, 4, 4, 3);
  } else if (pose === Pose.Dying) {
    const angle = -Math.min(1, dyingSeconds / 0.5) * (Math.PI / 2);
    context.rotate(angle);
    context.fillStyle = PANTS; context.fillRect(-4, -14, 8, 14);
    context.fillStyle = VEST; context.fillRect(-4, -27, 8, 13);
    context.fillStyle = SKIN; context.fillRect(-3, -34, 7, 7);
    context.fillStyle = BANDANA; context.fillRect(-3.5, -34, 7.5, 2);
  } else {
    const isSwimming = pose === Pose.Swim;
    if (!isSwimming) {
      const swing = pose === Pose.Run ? Math.sin(stride) * 4 : 0;
      const tuck = pose === Pose.Fall ? 3 : 0;
      context.fillStyle = PANTS;
      context.fillRect(-4 + swing, -14, 3.6, 14 - tuck);
      context.fillRect(0.4 - swing, -14, 3.6, 14 - tuck);
      context.fillStyle = BOOTS;
      context.fillRect(-4.5 + swing, -3 - tuck, 4.6, 3);
      context.fillRect(-0.1 - swing, -3 - tuck, 4.6, 3);
    }
    const bob = isSwimming ? Math.sin(clock * 5) * 0.8 : 0;
    context.fillStyle = VEST; context.fillRect(-4, -27 + bob, 8, 13);
    context.fillStyle = '#3a5424'; context.fillRect(-4, -18 + bob, 8, 1.5);
    context.fillStyle = SKIN; context.fillRect(-3, -34 + bob, 7, 7);
    context.fillStyle = BANDANA;
    context.fillRect(-3.5, -34 + bob, 7.5, 2);
    const tail = Math.sin(clock * 12) * 1.2;
    context.fillRect(-7, -33.5 + bob + tail, 3.5, 1.4);
    const shoulderX = aim === 6 || aim === 2 ? 2 : 1;
    drawGun(context, shoulderX, -23 + bob, aimAngle, 12);
    if (isSwimming) {
      context.fillStyle = '#145a73';
      context.fillRect(-9, -12, 18, 12);
      context.fillStyle = 'rgba(220,245,255,0.8)';
      const ripple = (clock * 6) % 1;
      context.fillRect(-7 - ripple * 4, -12.5, 14 + ripple * 8, 1);
    }
  }
  context.restore();
}

function drawSoldierBody(context: CanvasRenderingContext2D, stride: number, isRunning: boolean) {
  const swing = isRunning ? Math.sin(stride) * 4 : 0;
  context.fillStyle = '#5b5a44';
  context.fillRect(-4 + swing, -13, 3.6, 13);
  context.fillRect(0.4 - swing, -13, 3.6, 13);
  context.fillStyle = '#8d8f73';
  context.fillRect(-4, -26, 8, 13);
  context.fillStyle = '#d6a27a';
  context.fillRect(-3, -32, 6, 6);
  context.fillStyle = '#4e5238';
  context.fillRect(-4, -34, 8, 3.5);
}

/** The boss core's pulse, precomputed so a frame builds no colour strings. */
const CORE_COLORS = Array.from({ length: 12 }, (_, step) => { const pulse = step / 11; return `rgb(${200 + pulse * 55 | 0},${40 + pulse * 60 | 0},40)`; });
const PICKUP_COLORS = ['#ffd23f', '#4fc3f7', '#ff7043', '#b388ff'];

export function drawEntity(context: CanvasRenderingContext2D, kind: EntityKind, state: number, x: number, y: number, aim: number, facing: number, timer: number,
  flash: number, clock: number, isBossDown: boolean) {
  context.save();
  context.translate(x, y);
  switch (kind) {
    case EntityKind.Soldier: {
      if (facing < 0) context.scale(-1, 1);
      drawSoldierBody(context, timer * 10, true);
      context.fillStyle = GUN; context.fillRect(1, -22, 8, 2);
      break;
    }
    case EntityKind.Sniper: {
      if (facing < 0) context.scale(-1, 1);
      // a standing sniper (bush snipers are drawn by drawBushSniper)
      drawSoldierBody(context, 0, false);
      context.fillStyle = flash > 0 ? '#ffffff' : GUN;
      context.fillRect(1, -23, 13, 2);
      break;
    }
    case EntityKind.Turret: {
      const rise = state === 0 ? Math.min(1, timer / 0.5) : 1;
      context.fillStyle = '#2b3038';
      context.fillRect(-13, 12 - 24 * rise, 26, 24 * rise);
      if (rise >= 1) {
        context.fillStyle = flash > 0 ? '#ffffff' : '#59606b';
        context.beginPath(); context.arc(0, 0, 10, 0, TAU); context.fill();
        context.fillStyle = '#e53935';
        context.beginPath(); context.arc(0, 0, 3.5 + Math.sin(clock * 8) * 0.8, 0, TAU); context.fill();
        context.rotate(aim * (Math.PI / 6));
        context.fillStyle = '#1b1f26'; context.fillRect(4, -2.5, 13, 5);
        context.fillStyle = '#8a8f98'; context.fillRect(5, -2.5, 11, 1.2);
      }
      break;
    }
    case EntityKind.Cannon: {
      context.fillStyle = '#4a4f45'; // its rock footing
      context.fillRect(-13, 8, 27, 240 - y);
      context.fillStyle = '#6b6f62';
      context.beginPath(); context.moveTo(-12, 10); context.lineTo(-9, -9); context.lineTo(12, -11); context.lineTo(14, 10); context.closePath(); context.fill();
      context.fillStyle = flash > 0 ? '#ffffff' : '#3f4339';
      context.fillRect(-7, -6, 14, 12);
      context.rotate(aim * (Math.PI / 6));
      context.fillStyle = '#1b1f26'; context.fillRect(2, -2.5, 14, 5);
      break;
    }
    case EntityKind.BossCannon: {
      context.fillStyle = state === 2 ? '#1a1a1a' : flash > 0 ? '#ffffff' : '#2b3038';
      context.fillRect(-6, -8, 16, 16);
      if (state !== 2) {
        context.rotate(aim * (Math.PI / 6));
        context.fillStyle = '#111'; context.fillRect(0, -3, 16, 6);
        context.fillStyle = '#e67e22'; context.fillRect(14, -3, 2, 6);
      } else {
        context.fillStyle = '#e67e22';
        context.fillRect(-2 + Math.sin(clock * 30), -2, 3, 3);
      }
      break;
    }
    case EntityKind.BossCore: {
      if (isBossDown) break;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
      context.fillStyle = '#1b1f26';
      context.fillRect(-14, -16, 28, 32);
      context.fillStyle = flash > 0 ? '#ffffff' : CORE_COLORS[Math.min(CORE_COLORS.length - 1, (pulse * CORE_COLORS.length) | 0)];
      context.beginPath(); context.arc(0, 0, 11, 0, TAU); context.fill();
      context.fillStyle = 'rgba(255,240,200,0.8)';
      context.beginPath(); context.arc(-3, -4, 3.5, 0, TAU); context.fill();
      break;
    }
    case EntityKind.Capsule: {
      const flap = Math.sin(clock * 14) * 4;
      context.fillStyle = '#b0bec5';
      context.beginPath(); context.moveTo(-6, 0); context.lineTo(-16, -6 - flap); context.lineTo(-13, 2); context.closePath(); context.fill();
      context.beginPath(); context.moveTo(6, 0); context.lineTo(16, -6 - flap); context.lineTo(13, 2); context.closePath(); context.fill();
      context.fillStyle = flash > 0 ? '#ffffff' : '#eceff1';
      context.beginPath(); context.ellipse(0, 0, 9, 5.5, 0, 0, TAU); context.fill();
      context.fillStyle = '#e53935';
      context.fillRect(-9, -1, 18, 2);
      break;
    }
    case EntityKind.Pickup: {
      const color = PICKUP_COLORS[aim] ?? '#ffd23f';
      const bob = Math.sin(clock * 5) * 1;
      context.fillStyle = '#eceff1';
      context.beginPath(); context.moveTo(-5, -7 + bob); context.lineTo(-13, -11 + bob); context.lineTo(-9, -3 + bob); context.closePath(); context.fill();
      context.beginPath(); context.moveTo(5, -7 + bob); context.lineTo(13, -11 + bob); context.lineTo(9, -3 + bob); context.closePath(); context.fill();
      context.fillStyle = color;
      context.beginPath(); context.arc(0, -6 + bob, 6.5, 0, TAU); context.fill();
      context.fillStyle = '#10161e';
      context.font = 'bold 9px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(WEAPON_LETTERS[aim as Weapon] || 'R', 0, -2.6 + bob);
      break;
    }
  }
  context.restore();
}

/** A bush sniper: the bush is always drawn; the shooter rises out of it while exposed. */
export function drawBushSniper(context: CanvasRenderingContext2D, x: number, y: number, facing: number, isExposed: boolean, exposedSeconds: number) {
  context.save();
  context.translate(x, y);
  if (isExposed) {
    const rise = Math.min(1, exposedSeconds / 0.2) * Math.min(1, (1.3 - exposedSeconds) / 0.2);
    context.save();
    context.translate(0, (1 - rise) * 18);
    if (facing < 0) context.scale(-1, 1);
    drawSoldierBody(context, 0, false);
    context.fillStyle = GUN; context.fillRect(1, -23, 12, 2);
    context.restore();
  }
  context.fillStyle = '#1e6b2c';
  context.beginPath(); context.arc(-7, -6, 8, 0, TAU); context.arc(6, -7, 9, 0, TAU); context.arc(0, -12, 8, 0, TAU); context.fill();
  context.fillStyle = '#2f8f3c';
  context.beginPath(); context.arc(-3, -12, 4, 0, TAU); context.arc(7, -9, 3.5, 0, TAU); context.fill();
  context.restore();
}

export function drawBullet(context: CanvasRenderingContext2D, weapon: Weapon, x: number, y: number, velocityX: number, velocityY: number) {
  if (weapon === Weapon.Laser) {
    const speed = Math.hypot(velocityX, velocityY) || 1;
    const dx = (velocityX / speed) * 16, dy = (velocityY / speed) * 16;
    context.strokeStyle = '#7df9ff';
    context.lineWidth = 3;
    context.beginPath(); context.moveTo(x - dx, y - dy); context.lineTo(x, y); context.stroke();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.2;
    context.stroke();
    return;
  }
  const size = weapon === Weapon.Spread ? 3.6 : 3;
  context.fillStyle = weapon === Weapon.Spread ? '#ff5a3c' : weapon === Weapon.Rapid ? '#ffe066' : '#ffffff';
  context.fillRect(x - size / 2, y - size / 2, size, size);
}

export function drawParticle(context: CanvasRenderingContext2D, kind: ParticleKind, x: number, y: number, progress: number) {
  switch (kind) {
    case ParticleKind.Explosion:
    case ParticleKind.BigExplosion: {
      const radius = (kind === ParticleKind.BigExplosion ? 8 + 22 * progress : 4 + 12 * progress);
      context.globalAlpha = Math.max(0, 1 - progress);
      context.fillStyle = '#ff7a1a';
      context.beginPath(); context.arc(x, y, radius, 0, TAU); context.fill();
      context.fillStyle = '#ffe066';
      context.beginPath(); context.arc(x, y, radius * 0.55, 0, TAU); context.fill();
      context.globalAlpha = 1;
      break;
    }
    case ParticleKind.Spark:
      context.fillStyle = '#fff3b0';
      context.fillRect(x - 1.5, y - 1.5, 3, 3);
      break;
    case ParticleKind.Splash: {
      context.globalAlpha = Math.max(0, 1 - progress);
      context.fillStyle = '#dcf5ff';
      const rise = Math.sin(progress * Math.PI) * 12;
      context.fillRect(x - 8, y - rise, 2, rise);
      context.fillRect(x - 1, y - rise * 1.4, 2, rise * 1.4);
      context.fillRect(x + 6, y - rise, 2, rise);
      context.globalAlpha = 1;
      break;
    }
    case ParticleKind.Muzzle:
      context.fillStyle = '#fff6a8';
      context.fillRect(x - 2.5, y - 2.5, 5, 5);
      break;
  }
}

export function drawEnemyBullet(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#ff2d55';
  context.fillRect(x - 2.5, y - 2.5, 5, 5);
  context.fillStyle = '#ffe3ea';
  context.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
}

/** The small medal used for lives in the HUD. */
export function drawMedal(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#4fc3f7';
  context.fillRect(x, y, 2.5, 5);
  context.fillRect(x + 3.5, y, 2.5, 5);
  context.fillStyle = '#ffd23f';
  context.fillRect(x, y + 5, 6, 5);
}
