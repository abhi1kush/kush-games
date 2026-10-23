/**
 * Kush Jump's original art, all drawn with canvas paths (no image files). Tiles and the far backdrop are rendered once
 * per screen size into small offscreen canvases and then blitted; the hero, enemies and effects are a handful of paths
 * each frame, drawn in world units (the caller sets the camera transform).
 */
import { EntityKind, EntityState, HeroPose, Tile, TILE, TILE_KIND_COUNT, WORLD_HEIGHT } from './engine';

type Context = CanvasRenderingContext2D;

const COLORS = {
  grass: '#5bd16a', grassDark: '#2f9e44', dirt: '#b86a35', dirtDark: '#8a4b22', dirtLight: '#d48a4f',
  brick: '#d4553a', brickDark: '#8f2f1f', mortar: '#f2b48a',
  crate: '#ffb627', crateDark: '#b86e00', crateLight: '#ffe08a', usedCrate: '#8d6e63', usedCrateDark: '#5d4037',
  stone: '#8fa3bf', stoneDark: '#5a6b85', stoneLight: '#c5d3e8',
  pipe: '#17a398', pipeDark: '#0b5f58', pipeLight: '#7ff0de',
  coin: '#ffd23f', coinDark: '#c98a00',
} as const;

function rect(context: Context, color: string, x: number, y: number, width: number, height: number) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function star(context: Context, centerX: number, centerY: number, outer: number, inner: number) {
  context.beginPath();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 ? inner : outer;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

/** Draw one 16×16 tile kind at the origin. `grassy` = ground with open sky above it. */
function drawTileArt(context: Context, kind: number, grassy: boolean) {
  switch (kind) {
    case Tile.ground:
      rect(context, COLORS.dirt, 0, 0, 16, 16);
      rect(context, COLORS.dirtDark, 0, 15, 16, 1);
      rect(context, COLORS.dirtLight, 3, 6, 3, 2); rect(context, COLORS.dirtDark, 10, 9, 3, 2); rect(context, COLORS.dirtLight, 11, 3, 2, 2); rect(context, COLORS.dirtDark, 4, 12, 2, 2);
      if (grassy) {
        rect(context, COLORS.grass, 0, 0, 16, 4);
        rect(context, COLORS.grassDark, 0, 4, 16, 1);
        rect(context, COLORS.grass, 2, 4, 2, 2); rect(context, COLORS.grass, 9, 4, 3, 2);
      }
      return;
    case Tile.brick:
    case Tile.coinBrick:
      rect(context, COLORS.mortar, 0, 0, 16, 16);
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 ? 4 : 0;
        for (let left = -offset; left < 16; left += 8) {
          rect(context, COLORS.brick, Math.max(0, left) + 0.5, row * 4 + 0.5, Math.min(left + 8, 16) - Math.max(0, left) - 1, 3);
          rect(context, COLORS.brickDark, Math.max(0, left) + 0.5, row * 4 + 3, Math.min(left + 8, 16) - Math.max(0, left) - 1, 0.6);
        }
      }
      return;
    case Tile.coinCrate:
    case Tile.berryCrate:
      rect(context, COLORS.crateDark, 0, 0, 16, 16);
      rect(context, COLORS.crate, 1, 1, 14, 14);
      rect(context, COLORS.crateLight, 1, 1, 14, 1.5);
      context.fillStyle = '#fff6d6';
      star(context, 8, 8.4, 5, 2.2);
      context.fillStyle = COLORS.crateDark;
      for (const [x, y] of [[2.5, 2.5], [13.5, 2.5], [2.5, 13.5], [13.5, 13.5]]) { context.beginPath(); context.arc(x, y, 0.9, 0, Math.PI * 2); context.fill(); }
      return;
    case Tile.usedCrate:
      rect(context, COLORS.usedCrateDark, 0, 0, 16, 16);
      rect(context, COLORS.usedCrate, 1, 1, 14, 14);
      context.fillStyle = COLORS.usedCrateDark;
      for (const [x, y] of [[2.5, 2.5], [13.5, 2.5], [2.5, 13.5], [13.5, 13.5]]) { context.beginPath(); context.arc(x, y, 0.9, 0, Math.PI * 2); context.fill(); }
      return;
    case Tile.stone:
      rect(context, COLORS.stoneDark, 0, 0, 16, 16);
      rect(context, COLORS.stone, 0, 0, 15, 15);
      rect(context, COLORS.stoneLight, 0, 0, 15, 1.5); rect(context, COLORS.stoneLight, 0, 0, 1.5, 15);
      rect(context, COLORS.stoneDark, 5, 5, 6, 6);
      rect(context, COLORS.stone, 5.8, 5.8, 4.4, 4.4);
      return;
    case Tile.pipeTopLeft:
    case Tile.pipeTopRight: {
      const isLeft = kind === Tile.pipeTopLeft;
      rect(context, COLORS.pipeDark, 0, 0, 16, 16);
      rect(context, COLORS.pipe, isLeft ? 1 : 0, 1, 15, 8);
      rect(context, COLORS.pipe, isLeft ? 3 : 0, 10, isLeft ? 13 : 13, 6);
      if (isLeft) { rect(context, COLORS.pipeLight, 4, 2, 3, 6); rect(context, COLORS.pipeLight, 6, 10, 2.5, 6); }
      else { rect(context, COLORS.pipeDark, 10, 2, 2, 6); rect(context, '#000', 13, 10, 3, 6); }
      rect(context, '#000', 0, 9, 16, 1);
      if (isLeft) rect(context, '#000', 0, 10, 3, 6);
      return;
    }
    case Tile.pipeLeft:
      rect(context, '#000', 2, 0, 1, 16);
      rect(context, COLORS.pipe, 3, 0, 13, 16);
      rect(context, COLORS.pipeLight, 6, 0, 2.5, 16);
      return;
    case Tile.pipeRight:
      rect(context, COLORS.pipe, 0, 0, 13, 16);
      rect(context, COLORS.pipeDark, 9, 0, 2, 16);
      rect(context, '#000', 13, 0, 1, 16);
      return;
  }
}

export interface TileSprites {
  /** Indexed by tile kind; index TILE_KIND_COUNT is grassy ground. */
  sprites: (HTMLCanvasElement | null)[];
  coin: HTMLCanvasElement;
}

/** Pre-render every tile kind at `pixelsPerUnit` (device pixels per world unit). */
export function createTileSprites(pixelsPerUnit: number): TileSprites {
  const size = Math.max(1, Math.round(TILE * pixelsPerUnit));
  const make = (paint: (context: Context) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.scale(size / TILE, size / TILE);
    paint(context);
    return canvas;
  };
  const sprites: (HTMLCanvasElement | null)[] = [];
  for (let kind = 0; kind < TILE_KIND_COUNT; kind++) {
    sprites.push(kind === Tile.empty || kind === Tile.coin ? null : make(context => drawTileArt(context, kind, false)));
  }
  sprites.push(make(context => drawTileArt(context, Tile.ground, true)));
  const coin = make(context => {
    context.fillStyle = COLORS.coinDark;
    context.beginPath(); context.ellipse(8, 8, 5, 6.5, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = COLORS.coin;
    context.beginPath(); context.ellipse(7.5, 7.6, 4.2, 5.8, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff3b0';
    rect(context, '#fff3b0', 6.5, 4.5, 1.6, 6);
    context.fillStyle = COLORS.coinDark;
    star(context, 7.6, 7.8, 2, 0.9);
  });
  return { sprites, coin };
}

/** The far scenery (sky, hills, clouds) as one 512-unit-wide strip that repeats; drawn at half the screen's pixel density. */
export const BACKDROP_WIDTH = 512;
export function createBackdrop(pixelsPerUnit: number): HTMLCanvasElement {
  const density = Math.max(1, Math.min(pixelsPerUnit, 2.5));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(BACKDROP_WIDTH * density);
  canvas.height = Math.round(WORLD_HEIGHT * density);
  const context = canvas.getContext('2d')!;
  context.scale(canvas.width / BACKDROP_WIDTH, canvas.height / WORLD_HEIGHT);
  const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  sky.addColorStop(0, '#5ec8ff'); sky.addColorStop(0.7, '#a8e4ff'); sky.addColorStop(1, '#d8f5ff');
  context.fillStyle = sky;
  context.fillRect(0, 0, BACKDROP_WIDTH, WORLD_HEIGHT);
  // far hills, two layers, tiled seamlessly across the strip edges
  const hill = (centerX: number, width: number, height: number, color: string) => {
    for (const shift of [-BACKDROP_WIDTH, 0, BACKDROP_WIDTH]) {
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(centerX + shift, 208, width / 2, height, 0, Math.PI, 0);
      context.fill();
    }
  };
  hill(60, 220, 70, '#9fe0b5'); hill(330, 260, 60, '#9fe0b5');
  hill(170, 150, 44, '#6fcf8f'); hill(440, 170, 52, '#6fcf8f');
  rect(context, '#6fcf8f', 0, 207, BACKDROP_WIDTH, WORLD_HEIGHT - 207);
  const cloud = (x: number, y: number, size: number) => {
    for (const shift of [-BACKDROP_WIDTH, 0, BACKDROP_WIDTH]) {
      context.fillStyle = 'rgba(255,255,255,0.95)';
      context.beginPath();
      context.arc(x + shift, y, size, 0, Math.PI * 2);
      context.arc(x + shift + size * 1.1, y - size * 0.45, size * 1.15, 0, Math.PI * 2);
      context.arc(x + shift + size * 2.2, y, size * 0.95, 0, Math.PI * 2);
      context.fill();
      rect(context, 'rgba(255,255,255,0.95)', x + shift, y, size * 2.2, size * 0.9);
    }
  };
  cloud(40, 46, 9); cloud(210, 30, 7); cloud(360, 58, 10); cloud(470, 36, 6);
  return canvas;
}

// ---------------- characters (world units, origin = the entity's top-left) ----------------

const HERO = { hood: '#ff7a1a', hoodDark: '#c4500a', skin: '#ffd3a8', goggles: '#2ec4b6', pants: '#2b2d42', shoes: '#f8f9fa' } as const;

/** The hero, Kush: an orange hoodie, teal goggles and white sneakers. */
export function drawHero(context: Context, x: number, y: number, isBig: boolean, facing: number, pose: HeroPose, stride: number, velocityX: number) {
  const height = isBig ? 27 : 14;
  context.save();
  context.translate(x + 6, y + height); // bottom centre
  if (facing < 0) context.scale(-1, 1);
  const headRadius = isBig ? 5 : 4.4;
  const headY = -height + headRadius + 0.3;
  const legHeight = isBig ? 7 : 3;
  const bodyTop = headY + headRadius - 1.5;
  const bodyBottom = -legHeight;
  const swing = pose === HeroPose.Walking ? Math.sin(stride / (isBig ? 6 : 4.5)) * (isBig ? 3 : 2) : 0;
  const isAirborne = pose === HeroPose.Jumping;
  // legs
  const leg = (offsetX: number, lift: number) => {
    rect(context, HERO.pants, offsetX - 1.6, bodyBottom - 0.5, 3.2, legHeight + 0.5 - lift);
    rect(context, HERO.shoes, offsetX - 1.8 + 0.8, -1.8 - lift, 4, 1.8);
  };
  if (pose === HeroPose.Dead) { leg(-2.5, 0); leg(2.5, 0); }
  else if (isAirborne) { leg(-2.5 - 1, 0); leg(3, isBig ? 3 : 1.5); }
  else if (pose === HeroPose.OnPole) { leg(-1, 1); leg(2, 2); }
  else { leg(-2 + swing, swing > 0 ? 0 : -swing * 0.4); leg(2 - swing, swing < 0 ? 0 : swing * 0.4); }
  // hoodie body
  context.fillStyle = HERO.hood;
  context.beginPath();
  context.roundRect(-4.8, bodyTop, 9.6, bodyBottom - bodyTop + 0.5, 2.2);
  context.fill();
  rect(context, HERO.hoodDark, -4.8, bodyBottom - 1.4, 9.6, 1.4); // hem
  if (isBig) { rect(context, HERO.hoodDark, -2.5, bodyTop + 6, 5, 3); } // front pocket
  // arm (raised while jumping or holding the pole)
  const armUp = isAirborne || pose === HeroPose.OnPole;
  context.fillStyle = HERO.hoodDark;
  if (armUp) { rect(context, HERO.hood, 2.5, bodyTop - 3.5, 2.6, 5); rect(context, HERO.skin, 2.6, bodyTop - 5, 2.4, 1.8); }
  else { rect(context, HERO.hoodDark, -1 - swing * 0.6, bodyTop + 1.5, 2.6, isBig ? 7 : 3.5); rect(context, HERO.skin, -1 - swing * 0.6, bodyTop + (isBig ? 8.3 : 4.8), 2.6, 1.6); }
  // head: hood behind, face, goggles
  context.fillStyle = HERO.hoodDark;
  context.beginPath(); context.arc(-0.6, headY, headRadius + 0.9, 0, Math.PI * 2); context.fill();
  context.fillStyle = HERO.skin;
  context.beginPath(); context.arc(0.6, headY + 0.3, headRadius - 0.3, 0, Math.PI * 2); context.fill();
  if (pose === HeroPose.Dead) {
    context.strokeStyle = '#222'; context.lineWidth = 0.8;
    context.beginPath();
    for (const eyeX of [-1.2, 2]) { context.moveTo(eyeX - 0.9, headY - 0.6); context.lineTo(eyeX + 0.9, headY + 1.2); context.moveTo(eyeX + 0.9, headY - 0.6); context.lineTo(eyeX - 0.9, headY + 1.2); }
    context.stroke();
  } else {
    rect(context, '#222', headRadius * 0.45, headY - 0.2, 1.2, 1.6); // eye
    rect(context, '#c9725a', headRadius * 0.35, headY + 2, 2, 0.7); // mouth
  }
  rect(context, HERO.goggles, -headRadius - 0.6, headY - headRadius * 0.62, headRadius * 2 + 0.8, 1.6);
  context.fillStyle = HERO.goggles;
  context.beginPath(); context.arc(headRadius * 0.55, headY - headRadius * 0.55, 1.6, 0, Math.PI * 2); context.fill();
  rect(context, '#e9fffd', headRadius * 0.55 - 0.3, headY - headRadius * 0.55 - 1, 0.8, 0.8);
  // skid dust
  if (pose === HeroPose.Skidding && Math.abs(velocityX) > 20) {
    context.fillStyle = 'rgba(255,255,255,0.8)';
    context.beginPath(); context.arc(7, -1.5, 1.6, 0, Math.PI * 2); context.arc(9, -2.5, 1.1, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

/** Walkers ("grumbles"): angry purple blobs. Shellbugs: green beetles whose shells slide when kicked. Sun Berries grow the hero. */
export function drawEntity(context: Context, kind: EntityKind, state: EntityState, x: number, y: number, facing: number, timer: number, clock: number) {
  context.save();
  context.translate(x, y);
  if (state === EntityState.Knocked) { context.translate(0, kind === EntityKind.Shellbug ? 20 : 14); context.scale(1, -1); }
  switch (kind) {
    case EntityKind.Walker: drawWalker(context, state === EntityState.Squashed, clock); break;
    case EntityKind.Shellbug: drawShellbug(context, facing, clock); break;
    case EntityKind.Shell: drawShell(context, timer, clock); break;
    case EntityKind.Berry: drawBerry(context); break;
  }
  context.restore();
}

function drawWalker(context: Context, isSquashed: boolean, clock: number) {
  if (isSquashed) {
    context.fillStyle = '#6a3fc4';
    context.beginPath(); context.ellipse(7, 12, 7.5, 2.6, 0, 0, Math.PI * 2); context.fill();
    rect(context, '#fff', 3.5, 11, 2, 1); rect(context, '#fff', 8.5, 11, 2, 1);
    return;
  }
  const step = Math.sin(clock * 12) > 0 ? 1 : -1;
  context.fillStyle = '#3a1f6e';
  context.beginPath(); context.ellipse(3.5 + step, 13, 3, 1.6, 0, 0, Math.PI * 2); context.ellipse(10.5 - step, 13, 3, 1.6, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#7b4bd6';
  context.beginPath();
  context.moveTo(0.5, 12.5);
  context.bezierCurveTo(0, 3, 3, 0.5, 7, 0.5);
  context.bezierCurveTo(11, 0.5, 14, 3, 13.5, 12.5);
  context.closePath();
  context.fill();
  rect(context, '#a07ff0', 3, 2.5, 3, 1.4);
  for (const eyeX of [4.2, 9.8]) {
    context.fillStyle = '#fff';
    context.beginPath(); context.ellipse(eyeX, 6.5, 1.7, 2.2, 0, 0, Math.PI * 2); context.fill();
    rect(context, '#1b1035', eyeX - 0.5, 6.4, 1.2, 1.8);
  }
  context.strokeStyle = '#1b1035'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(2.5, 3.6); context.lineTo(5.8, 4.8); context.moveTo(11.5, 3.6); context.lineTo(8.2, 4.8); context.stroke();
  rect(context, '#1b1035', 5.5, 10, 3, 0.8);
}

function drawShellbug(context: Context, facing: number, clock: number) {
  context.save();
  if (facing < 0) { context.translate(14, 0); context.scale(-1, 1); }
  const step = Math.sin(clock * 12) > 0 ? 1 : 0;
  rect(context, '#5c3b00', 2 + step, 17, 3, 3); rect(context, '#5c3b00', 8 - step, 17, 3, 3);
  context.fillStyle = '#2fae66';
  context.beginPath(); context.ellipse(5.5, 12, 6, 7, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#17693c'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, 12); context.lineTo(11, 12); context.moveTo(5.5, 5.5); context.lineTo(5.5, 18.5); context.stroke();
  context.fillStyle = '#f4c542';
  context.beginPath(); context.arc(11, 6, 3.4, 0, Math.PI * 2); context.fill();
  rect(context, '#222', 12, 4.6, 1.2, 1.8);
  context.strokeStyle = '#5c3b00';
  context.beginPath(); context.moveTo(11, 2.8); context.lineTo(12.5, 0.4); context.stroke();
  context.restore();
}

function drawShell(context: Context, wakeTimer: number, clock: number) {
  const shake = wakeTimer > 0 && wakeTimer < 1.6 ? Math.sin(clock * 50) * 0.7 : 0;
  context.translate(shake, 0);
  context.fillStyle = '#2fae66';
  context.beginPath(); context.ellipse(7, 9, 7, 6.2, 0, Math.PI, 0); context.fill();
  rect(context, '#f5f0d8', 0, 9, 14, 2.5);
  rect(context, '#17693c', 0, 11.5, 14, 2.5);
  context.strokeStyle = '#17693c'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(7, 3); context.lineTo(7, 9); context.moveTo(2.5, 5.5); context.lineTo(11.5, 5.5); context.stroke();
  if (wakeTimer > 0 && wakeTimer < 1.6) { rect(context, '#5c3b00', 2, 13.5, 2, 0.8); rect(context, '#5c3b00', 10, 13.5, 2, 0.8); }
}

function drawBerry(context: Context) {
  context.fillStyle = '#ff9f1c';
  context.beginPath(); context.arc(7, 8, 6.2, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ffd166';
  context.beginPath(); context.arc(5, 6, 2.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#3fae49';
  context.beginPath(); context.ellipse(9.5, 1.8, 3, 1.4, -0.4, 0, Math.PI * 2); context.fill();
  rect(context, '#6b4226', 6.5, 0.5, 1, 2.5);
  rect(context, '#3b2200', 4.5, 8, 1.2, 1.8); rect(context, '#3b2200', 8.5, 8, 1.2, 1.8);
}

/** The goal: a striped pole with a pennant, and a small stone fort with a door. */
export function drawGoal(context: Context, poleX: number, poleTopY: number, poleBaseY: number, flagY: number, fortX: number, groundY: number) {
  rect(context, '#e8eef5', poleX - 1, poleTopY, 2, poleBaseY - poleTopY);
  rect(context, '#9fb0c4', poleX + 0.3, poleTopY, 0.7, poleBaseY - poleTopY);
  context.fillStyle = '#ffd23f';
  context.beginPath(); context.arc(poleX, poleTopY - 2, 3, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ff4d6d';
  context.beginPath(); context.moveTo(poleX - 1, flagY); context.lineTo(poleX - 15, flagY + 6); context.lineTo(poleX - 1, flagY + 12); context.closePath(); context.fill();
  context.fillStyle = '#fff';
  star(context, poleX - 6, flagY + 6, 2.6, 1.1);
  // fort: 5 tiles wide, 5 tall, crenellations, a dark arched door
  const width = 80, height = 72, top = groundY - height;
  rect(context, '#9c6644', fortX, top + 16, width, height - 16);
  rect(context, '#7f5539', fortX + 16, top, width - 32, 16);
  for (let index = 0; index < 5; index++) rect(context, '#7f5539', fortX + index * 16 + 2, top + 10, 12, 6);
  for (let index = 0; index < 3; index++) rect(context, '#7f5539', fortX + 16 + index * 18 + 2, top - 6, 10, 6);
  context.strokeStyle = 'rgba(0,0,0,0.25)'; context.lineWidth = 1;
  context.beginPath();
  for (let row = top + 24; row < groundY; row += 8) { context.moveTo(fortX, row); context.lineTo(fortX + width, row); }
  context.stroke();
  context.fillStyle = '#1a1a1a';
  context.beginPath(); context.moveTo(fortX + 32, groundY); context.lineTo(fortX + 32, groundY - 18); context.arc(fortX + 40, groundY - 18, 8, Math.PI, 0); context.lineTo(fortX + 48, groundY); context.closePath(); context.fill();
  rect(context, '#1a1a1a', fortX + 36, top + 2, 8, 6);
}

/** The midway checkpoint: a post with a banner that turns gold once reached. */
export function drawCheckpoint(context: Context, x: number, groundY: number, isReached: boolean) {
  rect(context, '#6b4226', x - 1, groundY - 40, 2, 40);
  context.fillStyle = isReached ? '#ffd23f' : '#adb5bd';
  context.beginPath(); context.moveTo(x + 1, groundY - 40); context.lineTo(x + 15, groundY - 34); context.lineTo(x + 1, groundY - 28); context.closePath(); context.fill();
}

export function drawDebrisPiece(context: Context, x: number, y: number, rotation: number) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  rect(context, COLORS.brick, -2.5, -2, 5, 4);
  rect(context, COLORS.brickDark, -2.5, 1.2, 5, 0.8);
  context.restore();
}
