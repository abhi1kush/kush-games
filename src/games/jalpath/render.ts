/**
 * Jal Path canvas drawing. The canvas is the board plus a one-tile margin all round: the water tank sits in the left
 * margin, the three houses in the margins next to their board-edge ports. Stone tiles and rocks are painted once
 * into a cached layer; pipes, water, bubbles, sprays, tank and houses are drawn per frame (only while something moves).
 */
import { EAST, FLAG_CONNECTED, FLAG_FIXED, FLAG_LEAK, isElbow, KIND_PIPE, KIND_ROCK, NO_ENTRY, NORTH, PHASE_FLOWING, PHASE_WON, type Port, SOUTH, type Tile, WEST } from './engine';

export interface RotateAnimation { start: number; from: number }
export interface Scene {
  level: number;
  width: number;
  height: number;
  tiles: Tile[];
  source: Port;
  houses: Port[];
  houseFill: number[];
  spills: Port[];
  tankFraction: number;
  phase: number;
  /** Seconds, for bubbles/sprays. */
  time: number;
  /** ms clock used by the rotate / shake animations. */
  now: number;
  rotations: Map<number, RotateAnimation>;
  shakes: Map<number, number>;
  cursor: number | null;
}

export const ROTATE_MS = 150;
export const SHAKE_MS = 320;
const PIPE_COLORS = ['#f39c32', '#4cbb5c', '#a46ee0', '#ec5f93', '#f2c94c', '#38c1b6'];
const ROOF_COLORS = ['#e50914', '#17a589', '#f08c1a'];
const WATER = '#2b9cf2';
const WATER_LIGHT = '#bfe9ff';

const hash = (value: number) => { let x = (value * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

/** Middle of a tile edge, tile-local. */
function edgePoint(side: number, size: number): [number, number] {
  const half = size / 2;
  if (side === NORTH) return [half, 0];
  if (side === EAST) return [size, half];
  if (side === SOUTH) return [half, size];
  return [0, half];
}
function sidesOf(mask: number) { const sides: number[] = []; for (let side = 0; side < 4; side++) if (mask & (1 << side)) sides.push(side); return sides; }
function elbowGeometry(mask: number, from: number, size: number) {
  const sides = sidesOf(mask);
  const to = sides[0] === from ? sides[1] : sides[0];
  const cornerX = sides.includes(EAST) ? size : 0;
  const cornerY = sides.includes(SOUTH) ? size : 0;
  const [fx, fy] = edgePoint(from, size);
  const [tx, ty] = edgePoint(to, size);
  const start = Math.atan2(fy - cornerY, fx - cornerX);
  let delta = Math.atan2(ty - cornerY, tx - cornerX) - start;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return { cornerX, cornerY, start, delta, radius: size / 2 };
}

/** Stroke the pipe's centre line, optionally only the part water has reached (`fill` 0…1 from side `entry`). */
function strokePipe(context: CanvasRenderingContext2D, mask: number, size: number, entry: number, fill: number) {
  const half = size / 2;
  if (isElbow(mask)) {
    const from = entry === NO_ENTRY || !(mask & (1 << entry)) ? sidesOf(mask)[0] : entry;
    const { cornerX, cornerY, start, delta, radius } = elbowGeometry(mask, from, size);
    context.beginPath();
    context.arc(cornerX, cornerY, radius, start, start + delta * fill, delta < 0);
    context.stroke();
    return;
  }
  const hasEntry = entry !== NO_ENTRY && (mask & (1 << entry)) !== 0;
  context.beginPath();
  for (const side of sidesOf(mask)) {
    const [x, y] = edgePoint(side, size);
    if (fill >= 1 || !hasEntry) { context.moveTo(half, half); context.lineTo(x, y); continue; }
    if (side === entry) {
      const part = Math.min(1, fill * 2);
      context.moveTo(x, y); context.lineTo(x + (half - x) * part, y + (half - y) * part);
    } else if (fill > 0.5) {
      const part = (fill - 0.5) * 2;
      context.moveTo(half, half); context.lineTo(half + (x - half) * part, half + (y - half) * part);
    }
  }
  context.stroke();
}

/** A point on the water's path through a tile: from the entry side to `exit`, u in 0…1. */
function pointAlong(mask: number, entry: number, exit: number, size: number, u: number): [number, number] {
  if (isElbow(mask)) {
    const { cornerX, cornerY, start, delta, radius } = elbowGeometry(mask, entry, size);
    const angle = start + delta * u;
    return [cornerX + Math.cos(angle) * radius, cornerY + Math.sin(angle) * radius];
  }
  const half = size / 2;
  const [ex, ey] = edgePoint(entry, size);
  const [xx, xy] = edgePoint(exit, size);
  if (u < 0.5) return [ex + (half - ex) * u * 2, ey + (half - ey) * u * 2];
  return [half + (xx - half) * (u - 0.5) * 2, half + (xy - half) * (u - 0.5) * 2];
}

function pipeColor(level: number, cell: number, tile: Tile) {
  if (tile.flags & FLAG_FIXED) return '#8d9aac';
  return PIPE_COLORS[Math.floor(hash(level * 131 + cell * 7 + 3) * PIPE_COLORS.length)];
}

function drawRings(context: CanvasRenderingContext2D, mask: number, size: number, pipeWidth: number) {
  for (const side of sidesOf(mask)) {
    const [x, y] = edgePoint(side, size);
    const inset = size * 0.1;
    const horizontal = side === EAST || side === WEST;
    const cx = side === EAST ? x - inset : side === WEST ? x + inset : x;
    const cy = side === SOUTH ? y - inset : side === NORTH ? y + inset : y;
    const long = pipeWidth + size * 0.08;
    const thick = size * 0.085;
    const w = horizontal ? thick : long;
    const h = horizontal ? long : thick;
    const gradient = horizontal ? context.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2) : context.createLinearGradient(cx - w / 2, cy, cx + w / 2, cy);
    gradient.addColorStop(0, '#eef3f8'); gradient.addColorStop(0.5, '#a7b3c2'); gradient.addColorStop(1, '#5f6b7b');
    context.fillStyle = gradient;
    context.strokeStyle = '#2a3242';
    context.lineWidth = Math.max(1, size * 0.02);
    context.beginPath();
    context.roundRect(cx - w / 2, cy - h / 2, w, h, size * 0.02);
    context.fill(); context.stroke();
  }
}

/** One pipe tile (tile-local coordinates, origin top-left). */
function drawPipe(context: CanvasRenderingContext2D, scene: Scene, cell: number, tile: Tile, size: number) {
  const pipeWidth = size * 0.34;
  context.lineCap = 'butt';
  if (tile.flags & FLAG_CONNECTED && scene.phase < PHASE_WON) {
    context.strokeStyle = 'rgba(96, 205, 255, 0.28)';
    context.lineWidth = pipeWidth + size * 0.2;
    strokePipe(context, tile.mask, size, NO_ENTRY, 1);
  }
  context.strokeStyle = '#141b2b';
  context.lineWidth = pipeWidth + size * 0.07;
  strokePipe(context, tile.mask, size, NO_ENTRY, 1);
  context.strokeStyle = pipeColor(scene.level, cell, tile);
  context.lineWidth = pipeWidth;
  strokePipe(context, tile.mask, size, NO_ENTRY, 1);
  // gloss
  context.save();
  context.translate(-pipeWidth * 0.2, -pipeWidth * 0.2);
  context.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  context.lineWidth = pipeWidth * 0.2;
  strokePipe(context, tile.mask, size, NO_ENTRY, 1);
  context.restore();
  // hollow inside, then water
  context.strokeStyle = 'rgba(8, 16, 36, 0.62)';
  context.lineWidth = pipeWidth * 0.56;
  strokePipe(context, tile.mask, size, NO_ENTRY, 1);
  if (tile.fill > 0) {
    context.lineCap = 'round';
    context.strokeStyle = WATER;
    context.lineWidth = pipeWidth * 0.56;
    strokePipe(context, tile.mask, size, tile.entry, Math.min(1, tile.fill));
    context.save();
    context.translate(-pipeWidth * 0.08, -pipeWidth * 0.08);
    context.strokeStyle = WATER_LIGHT;
    context.globalAlpha = 0.75;
    context.lineWidth = pipeWidth * 0.12;
    strokePipe(context, tile.mask, size, tile.entry, Math.min(1, tile.fill));
    context.restore();
    context.lineCap = 'butt';
  }
  if (tile.flags & FLAG_LEAK) drawCrack(context, tile, size, pipeWidth);
  drawRings(context, tile.mask, size, pipeWidth);
  if (tile.fill >= 1 && tile.entry !== NO_ENTRY && scene.phase <= PHASE_WON) drawBubbles(context, scene, cell, tile, size, pipeWidth);
}

function drawCrack(context: CanvasRenderingContext2D, tile: Tile, size: number, pipeWidth: number) {
  // a rusty patch with a crack, on the pipe's first arm near the centre
  const side = sidesOf(tile.mask)[0];
  const [x, y] = edgePoint(side, size);
  const px = size / 2 + (x - size / 2) * 0.42;
  const py = size / 2 + (y - size / 2) * 0.42;
  context.fillStyle = 'rgba(150, 70, 20, 0.85)';
  context.beginPath(); context.ellipse(px, py, pipeWidth * 0.55, pipeWidth * 0.42, 0.6, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#1a0d05';
  context.lineWidth = Math.max(1.2, size * 0.025);
  context.beginPath();
  context.moveTo(px - pipeWidth * 0.45, py - pipeWidth * 0.2);
  context.lineTo(px - pipeWidth * 0.12, py + pipeWidth * 0.12);
  context.lineTo(px + pipeWidth * 0.1, py - pipeWidth * 0.16);
  context.lineTo(px + pipeWidth * 0.45, py + pipeWidth * 0.22);
  context.stroke();
}

function drawBubbles(context: CanvasRenderingContext2D, scene: Scene, cell: number, tile: Tile, size: number, pipeWidth: number) {
  const exits = sidesOf(tile.mask).filter(side => side !== tile.entry);
  if (!exits.length || !(tile.mask & (1 << tile.entry))) return;
  context.fillStyle = 'rgba(255, 255, 255, 0.78)';
  for (let index = 0; index < 3; index++) {
    const u = (scene.time * 0.9 + hash(cell * 5 + index) + index / 3) % 1;
    const [x, y] = pointAlong(tile.mask, tile.entry, exits[index % exits.length], size, u);
    const radius = pipeWidth * (0.07 + 0.05 * hash(cell * 11 + index));
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
}

/** Droplets flying out from (x, y) in direction `angle`, falling under gravity. */
function spray(context: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, time: number, seed: number, strength: number) {
  for (let index = 0; index < 10; index++) {
    const t = (time * 1.7 + index / 10 + hash(seed + index) * 0.1) % 1;
    const spread = (hash(seed * 3 + index) - 0.5) * 0.9;
    const reach = size * strength * t;
    const dx = Math.cos(angle + spread) * reach;
    const dy = Math.sin(angle + spread) * reach + size * 0.5 * t * t;
    context.globalAlpha = 0.85 * (1 - t);
    context.fillStyle = index % 3 ? '#7fd0ff' : '#e4f6ff';
    context.beginPath(); context.arc(x + dx, y + dy, size * (0.045 - 0.025 * t), 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
}

const SIDE_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

function cellOrigin(cell: number, width: number, size: number): [number, number] {
  return [((cell % width) + 1) * size, (Math.floor(cell / width) + 1) * size];
}
/** Top-left of the margin cell just outside `port`. */
function outsideOrigin(port: Port, width: number, size: number): [number, number] {
  const [x, y] = cellOrigin(port.cell, width, size);
  if (port.side === NORTH) return [x, y - size];
  if (port.side === SOUTH) return [x, y + size];
  if (port.side === EAST) return [x + size, y];
  return [x - size, y];
}

export interface StaticLayer { key: string; canvas: HTMLCanvasElement }

function paintStatic(scene: Scene, size: number, ratio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const fullWidth = (scene.width + 2) * size;
  const fullHeight = (scene.height + 2) * size;
  canvas.width = Math.round(fullWidth * ratio);
  canvas.height = Math.round(fullHeight * ratio);
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);
  // tray
  const pad = size * 0.16;
  const tray = context.createLinearGradient(0, size - pad, 0, (scene.height + 1) * size + pad);
  tray.addColorStop(0, '#173a78'); tray.addColorStop(1, '#0c2152');
  context.fillStyle = tray;
  context.strokeStyle = '#4c7fd6';
  context.lineWidth = Math.max(2, size * 0.05);
  context.beginPath();
  context.roundRect(size - pad, size - pad, scene.width * size + pad * 2, scene.height * size + pad * 2, size * 0.22);
  context.fill(); context.stroke();
  for (let cell = 0; cell < scene.width * scene.height; cell++) {
    const [x, y] = cellOrigin(cell, scene.width, size);
    const tile = scene.tiles[cell];
    const inset = size * 0.04;
    const stone = context.createLinearGradient(x, y, x + size, y + size);
    const isFixed = tile.kind === KIND_PIPE && (tile.flags & FLAG_FIXED) !== 0;
    stone.addColorStop(0, isFixed ? '#3c4a63' : '#2c4f8f'); stone.addColorStop(1, isFixed ? '#27324a' : '#1c3567');
    context.fillStyle = stone;
    context.beginPath(); context.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.12); context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.lineWidth = 1;
    context.stroke();
    if (isFixed) {
      context.fillStyle = '#c8d1dc';
      for (const [rx, ry] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
        context.beginPath(); context.arc(x + rx * size, y + ry * size, size * 0.045, 0, Math.PI * 2); context.fill();
      }
    }
    if (tile.kind === KIND_ROCK) drawRock(context, x, y, size, cell);
  }
  return canvas;
}

function drawRock(context: CanvasRenderingContext2D, x: number, y: number, size: number, cell: number) {
  const cx = x + size / 2;
  const cy = y + size * 0.54;
  const gradient = context.createRadialGradient(cx - size * 0.12, cy - size * 0.14, size * 0.05, cx, cy, size * 0.4);
  gradient.addColorStop(0, '#b9b2a6'); gradient.addColorStop(0.6, '#7b746b'); gradient.addColorStop(1, '#4b4640');
  context.fillStyle = gradient;
  context.beginPath();
  const points = 9;
  for (let index = 0; index <= points; index++) {
    const angle = (index / points) * Math.PI * 2;
    const radius = size * (0.3 + 0.07 * hash(cell * 13 + index % points));
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius * 0.82;
    if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
  }
  context.closePath(); context.fill();
  context.strokeStyle = 'rgba(30, 25, 20, 0.6)'; context.lineWidth = Math.max(1, size * 0.025); context.stroke();
  context.strokeStyle = 'rgba(40, 34, 28, 0.55)';
  context.beginPath(); context.moveTo(cx - size * 0.1, cy - size * 0.05); context.lineTo(cx + size * 0.04, cy + size * 0.08); context.lineTo(cx + size * 0.14, cy + size * 0.02); context.stroke();
}

function drawTank(context: CanvasRenderingContext2D, scene: Scene, size: number) {
  const [ox, oy] = outsideOrigin(scene.source, scene.width, size);
  const [bx, by] = cellOrigin(scene.source.cell, scene.width, size);
  const centerY = oy + size / 2;
  const isOpen = scene.phase >= PHASE_FLOWING;
  // feed pipe from tank to board edge
  const pipeWidth = size * 0.34;
  context.fillStyle = '#141b2b';
  context.fillRect(ox + size * 0.5, centerY - pipeWidth / 2 - size * 0.035, bx - ox - size * 0.5, pipeWidth + size * 0.07);
  context.fillStyle = '#9aa7b8';
  context.fillRect(ox + size * 0.5, centerY - pipeWidth / 2, bx - ox - size * 0.5, pipeWidth);
  context.fillStyle = isOpen && scene.tankFraction > 0 ? WATER : 'rgba(8, 16, 36, 0.62)';
  context.fillRect(ox + size * 0.5, centerY - pipeWidth * 0.28, bx - ox - size * 0.5, pipeWidth * 0.56);
  // tank body
  const tankHeight = size * 1.9;
  const tankWidth = size * 0.78;
  const top = Math.max(size * 0.1, Math.min(centerY - tankHeight * 0.62, (scene.height + 2) * size - tankHeight - size * 0.1));
  const left = ox + (size - tankWidth) / 2;
  context.fillStyle = '#1b2438';
  context.strokeStyle = '#c9d4e2';
  context.lineWidth = Math.max(2, size * 0.05);
  context.beginPath(); context.roundRect(left, top, tankWidth, tankHeight, size * 0.14); context.fill();
  const level = Math.max(0, Math.min(1, scene.tankFraction));
  const waterTop = top + tankHeight * (1 - level);
  context.save();
  context.beginPath(); context.roundRect(left, top, tankWidth, tankHeight, size * 0.14); context.clip();
  const water = context.createLinearGradient(left, 0, left + tankWidth, 0);
  water.addColorStop(0, '#1572d3'); water.addColorStop(0.45, '#45b3ff'); water.addColorStop(1, '#1366c0');
  context.fillStyle = level < 0.2 ? '#e0603a' : water;
  context.beginPath();
  context.moveTo(left, waterTop);
  for (let step = 0; step <= 12; step++) {
    const x = left + (tankWidth * step) / 12;
    context.lineTo(x, waterTop + Math.sin(scene.time * 3 + step * 0.9) * size * 0.025);
  }
  context.lineTo(left + tankWidth, top + tankHeight); context.lineTo(left, top + tankHeight); context.closePath(); context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let index = 0; index < 4 && level > 0.05; index++) {
    const u = (scene.time * 0.35 + hash(index + 40)) % 1;
    const y = top + tankHeight - u * (tankHeight * level);
    context.beginPath(); context.arc(left + tankWidth * (0.25 + 0.5 * hash(index + 9)), y, size * 0.03, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = 'rgba(255, 255, 255, 0.18)';
  context.fillRect(left + tankWidth * 0.12, top + size * 0.08, tankWidth * 0.12, tankHeight - size * 0.16);
  context.restore();
  context.beginPath(); context.roundRect(left, top, tankWidth, tankHeight, size * 0.14); context.stroke();
  // tick marks
  context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  context.lineWidth = 1;
  for (let tick = 1; tick < 4; tick++) {
    const y = top + (tankHeight * tick) / 4;
    context.beginPath(); context.moveTo(left + tankWidth * 0.7, y); context.lineTo(left + tankWidth, y); context.stroke();
  }
  context.fillStyle = '#fff';
  context.font = `700 ${Math.round(size * 0.2)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.fillText(`${Math.round(level * 100)}%`, left + tankWidth / 2, top - size * 0.04 > size * 0.12 ? top - size * 0.05 : top + size * 0.24);
  // valve wheel (spins while open)
  const valveX = ox + size * 0.86;
  const angle = isOpen ? scene.time * 4 : 0;
  context.save();
  context.translate(valveX, centerY - pipeWidth * 0.75);
  context.rotate(angle);
  context.strokeStyle = isOpen ? '#4cd964' : '#e50914';
  context.lineWidth = Math.max(2, size * 0.055);
  context.beginPath(); context.arc(0, 0, size * 0.15, 0, Math.PI * 2); context.stroke();
  for (let spoke = 0; spoke < 3; spoke++) {
    const a = (spoke * Math.PI) / 3;
    context.beginPath(); context.moveTo(Math.cos(a) * size * 0.15, Math.sin(a) * size * 0.15); context.lineTo(-Math.cos(a) * size * 0.15, -Math.sin(a) * size * 0.15); context.stroke();
  }
  context.restore();
}

function drawHouse(context: CanvasRenderingContext2D, scene: Scene, index: number, size: number) {
  const port = scene.houses[index];
  const [ox, oy] = outsideOrigin(port, scene.width, size);
  const [bx, by] = cellOrigin(port.cell, scene.width, size);
  const fill = Math.max(0, Math.min(1, scene.houseFill[index] ?? 0));
  const isFull = fill >= 1;
  const pipeWidth = size * 0.34;
  // stub pipe from the board edge to the house
  const [ex, ey] = edgePoint(port.side, size);
  const sx = bx + ex;
  const sy = by + ey;
  const cx = ox + size / 2;
  const cy = oy + size / 2;
  const horizontal = port.side === EAST || port.side === WEST;
  const stubEndX = horizontal ? cx + (port.side === EAST ? -size * 0.25 : size * 0.25) : sx;
  const stubEndY = horizontal ? sy : cy + (port.side === SOUTH ? -size * 0.25 : size * 0.25);
  context.lineCap = 'butt';
  context.strokeStyle = '#141b2b'; context.lineWidth = pipeWidth + size * 0.07;
  context.beginPath(); context.moveTo(sx, sy); context.lineTo(stubEndX, stubEndY); context.stroke();
  context.strokeStyle = '#9aa7b8'; context.lineWidth = pipeWidth;
  context.stroke();
  context.strokeStyle = fill > 0 ? WATER : 'rgba(8, 16, 36, 0.62)'; context.lineWidth = pipeWidth * 0.56;
  context.stroke();
  // glow when watered
  if (isFull) {
    const glow = context.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.75);
    glow.addColorStop(0, `rgba(255, 214, 90, ${0.55 + 0.15 * Math.sin(scene.time * 4)})`); glow.addColorStop(1, 'rgba(255, 214, 90, 0)');
    context.fillStyle = glow;
    context.beginPath(); context.arc(cx, cy, size * 0.75, 0, Math.PI * 2); context.fill();
  }
  const houseWidth = size * 0.66;
  const wallHeight = size * 0.4;
  const left = cx - houseWidth / 2;
  const wallTop = cy - size * 0.05;
  context.fillStyle = isFull ? '#fff4d6' : '#d9d2c3';
  context.strokeStyle = '#2b2118';
  context.lineWidth = Math.max(1.2, size * 0.03);
  context.beginPath(); context.rect(left, wallTop, houseWidth, wallHeight); context.fill(); context.stroke();
  context.fillStyle = ROOF_COLORS[index % ROOF_COLORS.length];
  context.beginPath();
  context.moveTo(left - size * 0.08, wallTop + 1); context.lineTo(cx, wallTop - size * 0.34); context.lineTo(left + houseWidth + size * 0.08, wallTop + 1);
  context.closePath(); context.fill(); context.stroke();
  // door + windows
  context.fillStyle = '#6b4226';
  context.fillRect(cx - size * 0.06, wallTop + wallHeight - size * 0.22, size * 0.12, size * 0.22);
  context.fillStyle = isFull ? '#ffd84d' : '#3a4256';
  for (const offset of [-0.21, 0.21]) {
    context.beginPath(); context.rect(cx + offset * size - size * 0.065, wallTop + size * 0.08, size * 0.13, size * 0.11); context.fill(); context.stroke();
  }
  // fill badge
  const badgeX = left + houseWidth + size * 0.02;
  const badgeY = wallTop - size * 0.2;
  context.fillStyle = 'rgba(10, 20, 40, 0.85)';
  context.beginPath(); context.arc(badgeX, badgeY, size * 0.13, 0, Math.PI * 2); context.fill();
  if (fill > 0) {
    context.strokeStyle = isFull ? '#4cd964' : '#4fb6ff';
    context.lineWidth = size * 0.045;
    context.beginPath(); context.arc(badgeX, badgeY, size * 0.1, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); context.stroke();
  }
  context.fillStyle = isFull ? '#4cd964' : '#7fcaff';
  context.beginPath();
  context.moveTo(badgeX, badgeY - size * 0.07);
  context.quadraticCurveTo(badgeX + size * 0.06, badgeY + size * 0.01, badgeX, badgeY + size * 0.055);
  context.quadraticCurveTo(badgeX - size * 0.06, badgeY + size * 0.01, badgeX, badgeY - size * 0.07);
  context.fill();
}

/** Draw everything. `layer` caches the stone tiles between frames. */
export function drawScene(context: CanvasRenderingContext2D, scene: Scene, size: number, ratio: number, layer: { current: StaticLayer | null }) {
  const key = `${scene.level}:${size}:${ratio}:${scene.width}`;
  if (!layer.current || layer.current.key !== key) layer.current = { key, canvas: paintStatic(scene, size, ratio) };
  const fullWidth = (scene.width + 2) * size;
  const fullHeight = (scene.height + 2) * size;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(layer.current.canvas, 0, 0);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (let cell = 0; cell < scene.width * scene.height; cell++) {
    const tile = scene.tiles[cell];
    if (tile.kind !== KIND_PIPE) continue;
    const [x, y] = cellOrigin(cell, scene.width, size);
    context.save();
    let angle = 0;
    const rotation = scene.rotations.get(cell);
    if (rotation) {
      const t = Math.min(1, (scene.now - rotation.start) / ROTATE_MS);
      angle = rotation.from * (1 - easeOut(t));
      if (t >= 1) scene.rotations.delete(cell);
    }
    let shake = 0;
    const shakeStart = scene.shakes.get(cell);
    if (shakeStart !== undefined) {
      const t = (scene.now - shakeStart) / SHAKE_MS;
      if (t >= 1) scene.shakes.delete(cell); else shake = Math.sin(t * 40) * size * 0.06 * (1 - t);
    }
    context.translate(x + size / 2 + shake, y + size / 2);
    context.rotate(angle);
    context.translate(-size / 2, -size / 2);
    context.beginPath(); context.rect(-size * 0.2, -size * 0.2, size * 1.4, size * 1.4); context.clip();
    drawPipe(context, scene, cell, tile, size);
    context.restore();
  }
  for (const [cell, start] of scene.shakes) {
    if (scene.tiles[cell]?.kind === KIND_PIPE) continue;
    const t = (scene.now - start) / SHAKE_MS;
    if (t >= 1) { scene.shakes.delete(cell); continue; }
    const [x, y] = cellOrigin(cell, scene.width, size);
    context.strokeStyle = `rgba(229, 9, 20, ${1 - t})`; context.lineWidth = 3;
    context.beginPath(); context.roundRect(x + 3, y + 3, size - 6, size - 6, size * 0.12); context.stroke();
  }
  drawTank(context, scene, size);
  for (let index = 0; index < scene.houses.length; index++) drawHouse(context, scene, index, size);
  if (scene.phase === PHASE_FLOWING) {
    for (let cell = 0; cell < scene.width * scene.height; cell++) {
      const tile = scene.tiles[cell];
      if (tile.kind !== KIND_PIPE || !(tile.flags & FLAG_LEAK) || tile.fill <= 0) continue;
      const [x, y] = cellOrigin(cell, scene.width, size);
      spray(context, x + size / 2, y + size / 2, -Math.PI / 2, size, scene.time, cell * 17, 0.6);
    }
    for (const spill of scene.spills) {
      const [x, y] = cellOrigin(spill.cell, scene.width, size);
      const [ex, ey] = edgePoint(spill.side, size);
      spray(context, x + ex, y + ey, SIDE_ANGLE[spill.side], size, scene.time, spill.cell * 4 + spill.side, 0.75);
    }
  }
  if (scene.cursor !== null && scene.cursor < scene.width * scene.height) {
    const [x, y] = cellOrigin(scene.cursor, scene.width, size);
    context.setLineDash([size * 0.12, size * 0.08]);
    context.strokeStyle = '#ffffff'; context.lineWidth = 2.5;
    context.beginPath(); context.roundRect(x + 2, y + 2, size - 4, size - 4, size * 0.14); context.stroke();
    context.setLineDash([]);
  }
  return { fullWidth, fullHeight };
}

/** Which board cell (or null) is under canvas-local point (x, y) in CSS pixels. */
export function cellAt(x: number, y: number, width: number, height: number, size: number): number | null {
  const column = Math.floor(x / size) - 1;
  const row = Math.floor(y / size) - 1;
  if (column < 0 || row < 0 || column >= width || row >= height) return null;
  return row * width + column;
}

/** Centre of a cell in canvas CSS pixels (for tests). */
export function cellCenter(cell: number, width: number, size: number): [number, number] {
  const [x, y] = cellOrigin(cell, width, size);
  return [x + size / 2, y + size / 2];
}

/** True while something on screen still moves. */
export function isAnimating(scene: Scene) {
  return scene.rotations.size > 0 || scene.shakes.size > 0;
}
