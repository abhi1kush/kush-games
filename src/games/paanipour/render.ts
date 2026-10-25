/**
 * Paani Pour canvas drawing: glass tubes with layered glossy water, a lifted selected tube, the pour (the tube
 * flies over, tilts, a stream falls while one tube drains and the other fills, then it flies back), finished tubes
 * that sparkle, and hint markers. Drawn only while something moves.
 */
import { CAPACITY, WATER_COLOURS } from './engine';

export interface Layout { columns: number; rows: number; tubeWidth: number; tubeHeight: number; cellWidth: number; rowHeight: number; width: number; height: number; top: number }
export interface PourAnimation { from: number; to: number; amount: number; colour: number; start: number; before: number[][] }
export interface Scene {
  tubes: number[][];
  done: boolean[];
  selected: number | null;
  cursor: number | null;
  pour: PourAnimation | null;
  shakes: Map<number, number>;
  hint: { from: number; to: number; start: number } | null;
  /** When each tube was finished (sparkles). */
  finishedAt: Map<number, number>;
  now: number;
}

export const POUR_MS = 760;
export const SHAKE_MS = 320;
export const HINT_MS = 2600;
export const SPARKLE_MS = 1200;
const MAX_TUBE_WIDTH = 68;

/** Fit `count` tubes into width × maxHeight with 1–3 rows; returns sizes in CSS pixels. */
export function layoutTubes(count: number, width: number, maxHeight: number): Layout {
  let best: Layout | null = null;
  for (let rows = 1; rows <= 3; rows++) {
    const columns = Math.ceil(count / rows);
    const cellWidth = width / columns;
    let tubeWidth = Math.min(MAX_TUBE_WIDTH, cellWidth * 0.62);
    const rowFor = (tw: number) => tw * 3.4 + tw * 0.9;
    const totalFor = (tw: number) => tw * 1.8 + rowFor(tw) * rows - tw * 0.6;
    const fitHeight = maxHeight - 10;
    if (totalFor(tubeWidth) > fitHeight) tubeWidth = fitHeight / (1.2 + 4.3 * rows);
    tubeWidth = Math.floor(Math.max(18, tubeWidth));
    const candidate: Layout = { columns, rows, tubeWidth, tubeHeight: Math.round(tubeWidth * 3.4), cellWidth, rowHeight: Math.round(rowFor(tubeWidth)), width, height: 0, top: Math.round(tubeWidth * 1.8) };
    candidate.height = Math.round(candidate.top + candidate.rowHeight * rows - tubeWidth * 0.6);
    if (!best || candidate.tubeWidth > best.tubeWidth + 1) best = candidate;
  }
  return best!;
}

/** Top-left of a tube at rest. Rows are centred when not full. */
export function tubeOrigin(tube: number, count: number, layout: Layout): [number, number] {
  const row = Math.floor(tube / layout.columns);
  const inRow = Math.min(layout.columns, count - row * layout.columns);
  const column = tube - row * layout.columns;
  const rowWidth = inRow * layout.cellWidth;
  const left = (layout.width - rowWidth) / 2 + column * layout.cellWidth + (layout.cellWidth - layout.tubeWidth) / 2;
  return [left, layout.top + row * layout.rowHeight];
}

/** Which tube (or null) is at canvas point (x, y). Generous: the whole column cell, including the lift space. */
export function tubeAt(x: number, y: number, count: number, layout: Layout): number | null {
  for (let tube = 0; tube < count; tube++) {
    const [left, top] = tubeOrigin(tube, count, layout);
    const pad = (layout.cellWidth - layout.tubeWidth) / 2;
    if (x >= left - pad && x <= left + layout.tubeWidth + pad && y >= top - layout.tubeWidth * 0.75 && y <= top + layout.tubeHeight + layout.tubeWidth * 0.2) return tube;
  }
  return null;
}

function tubePath(context: CanvasRenderingContext2D, width: number, height: number) {
  const radius = width / 2;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, height - radius);
  context.arc(radius, height - radius, radius, Math.PI, 0, true);
  context.lineTo(width, 0);
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Layers (bottom first) with the top `partialCount` layers scaled to `partialScale` (0…1). */
function drawTube(context: CanvasRenderingContext2D, layers: number[], width: number, height: number, partialCount: number, partialScale: number, now: number, glow: string | null) {
  const layerHeight = (height - width * 0.4) / CAPACITY;
  // glass back
  context.save();
  tubePath(context, width, height);
  context.closePath();
  context.fillStyle = 'rgba(255, 255, 255, 0.07)';
  context.fill();
  context.clip();
  let y = height;
  for (let index = 0; index < layers.length; index++) {
    const isPartial = index >= layers.length - partialCount;
    const thickness = layerHeight * (isPartial ? partialScale : 1);
    if (thickness <= 0.2) continue;
    const colour = WATER_COLOURS[layers[index]] ?? '#888';
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, shade(colour, -0.25));
    gradient.addColorStop(0.35, colour);
    gradient.addColorStop(0.6, shade(colour, 0.18));
    gradient.addColorStop(1, shade(colour, -0.35));
    context.fillStyle = gradient;
    // the bottom layer also fills the rounded bottom
    const bottom = index === 0 ? height + 2 : y;
    context.fillRect(-2, y - thickness, width + 4, bottom - (y - thickness) + 0.6);
    y -= thickness;
  }
  if (layers.length) {
    // surface shine + a few bubbles
    context.fillStyle = 'rgba(255, 255, 255, 0.35)';
    context.beginPath(); context.ellipse(width / 2, y + 1, width * 0.42, Math.max(1.5, width * 0.06), 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let bubble = 0; bubble < 3; bubble++) {
      const phase = ((now / 2400 + bubble * 0.37 + layers.length * 0.13) % 1);
      const by = height - (height - y) * phase;
      if (by > y + 3) { context.beginPath(); context.arc(width * (0.3 + 0.2 * bubble), by, Math.max(1, width * 0.035), 0, Math.PI * 2); context.fill(); }
    }
  }
  context.restore();
  // glass highlight + rim
  context.save();
  tubePath(context, width, height);
  if (glow) { context.shadowColor = glow; context.shadowBlur = width * 0.4; }
  context.strokeStyle = glow ?? 'rgba(220, 238, 255, 0.85)';
  context.lineWidth = Math.max(2, width * 0.06);
  context.stroke();
  context.restore();
  context.fillStyle = 'rgba(255, 255, 255, 0.28)';
  context.beginPath(); context.roundRect(width * 0.14, width * 0.3, width * 0.12, height - width * 0.9, width * 0.06); context.fill();
  // lip
  context.fillStyle = 'rgba(220, 238, 255, 0.9)';
  context.beginPath(); context.roundRect(-width * 0.1, -width * 0.06, width * 1.2, width * 0.14, width * 0.07); context.fill();
}

function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function drawScene(context: CanvasRenderingContext2D, scene: Scene, layout: Layout, ratio: number) {
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, layout.width, layout.height);
  const count = scene.tubes.length;
  const width = layout.tubeWidth;
  const height = layout.tubeHeight;
  const pour = scene.pour;
  const pourT = pour ? Math.min(1, (scene.now - pour.start) / POUR_MS) : 0;
  let pourTube: { x: number; y: number; angle: number; layers: number[]; partial: number; scale: number } | null = null;
  let stream: { x: number; y1: number; y2: number; colour: string; alpha: number } | null = null;

  for (let tube = 0; tube < count; tube++) {
    let [x, y] = tubeOrigin(tube, count, layout);
    let layers = scene.tubes[tube];
    let partial = 0;
    let scale = 1;
    if (pour && tube === pour.to) {
      // fills during the stream phase
      const p = Math.max(0, Math.min(1, (pourT - 0.3) / 0.45));
      partial = pour.amount; scale = p;
    }
    if (pour && tube === pour.from) {
      const p = Math.max(0, Math.min(1, (pourT - 0.3) / 0.45));
      layers = pour.before[tube]; partial = pour.amount; scale = 1 - p;
      const [tx, ty] = tubeOrigin(pour.to, count, layout);
      const toRight = tx >= x;
      const angle = (toRight ? 1 : -1) * Math.PI * 0.56;
      // the mouth ends just above and beside the target's mouth
      const destX = tx + (toRight ? -width * 0.14 : width * 0.14);
      const destY = ty - width * 0.5;
      const homeY = y - width * 0.45;
      const move = pourT < 0.3 ? easeInOut(pourT / 0.3) : pourT < 0.75 ? 1 : 1 - easeInOut((pourT - 0.75) / 0.25);
      const px = x + (destX - x) * move;
      const py = homeY + (destY - homeY) * move;
      pourTube = { x: px, y: py, angle: angle * move, layers, partial, scale };
      if (pourT > 0.28 && pourT < 0.8) {
        const mouthX = destX + width / 2;
        const surface = ty + height - (scene.tubes[pour.to].length - pour.amount * (1 - p)) * ((height - width * 0.4) / CAPACITY);
        stream = { x: mouthX, y1: destY, y2: surface, colour: WATER_COLOURS[pour.colour], alpha: Math.min(1, (pourT - 0.28) * 12, (0.8 - pourT) * 12) };
      }
      continue;
    }
    if (scene.selected === tube) y -= width * 0.45;
    const shakeStart = scene.shakes.get(tube);
    if (shakeStart !== undefined) {
      const t = (scene.now - shakeStart) / SHAKE_MS;
      if (t >= 1) scene.shakes.delete(tube); else x += Math.sin(t * 36) * width * 0.12 * (1 - t);
    }
    const isHintFrom = scene.hint && scene.hint.from === tube;
    const isHintTo = scene.hint && scene.hint.to === tube;
    const glow = scene.done[tube] ? '#ffe27a' : scene.selected === tube ? '#7fe3ff' : isHintFrom || isHintTo ? '#ffd84d' : null;
    context.save();
    context.translate(x, y);
    drawTube(context, layers, width, height, partial, scale, scene.now, glow);
    context.restore();
    if (scene.cursor === tube) {
      context.save();
      context.setLineDash([5, 4]);
      context.strokeStyle = '#ffffff'; context.lineWidth = 2;
      context.beginPath(); context.roundRect(x - width * 0.3, y - width * 0.35, width * 1.6, height + width * 0.6, 10); context.stroke();
      context.restore();
    }
    if (scene.done[tube]) drawDone(context, scene, tube, x, y, width);
  }
  if (scene.hint) drawHint(context, scene, layout);
  if (stream) {
    context.save();
    context.globalAlpha = Math.max(0, stream.alpha);
    context.strokeStyle = stream.colour;
    context.lineCap = 'round';
    context.lineWidth = Math.max(3, width * 0.16);
    context.beginPath(); context.moveTo(stream.x, stream.y1); context.lineTo(stream.x, stream.y2); context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    context.lineWidth = Math.max(1, width * 0.04);
    context.beginPath(); context.moveTo(stream.x - width * 0.03, stream.y1); context.lineTo(stream.x - width * 0.03, stream.y2); context.stroke();
    context.fillStyle = stream.colour;
    for (let drop = 0; drop < 5; drop++) {
      const angle = (scene.now / 90 + drop * 1.3) % (Math.PI * 2);
      context.beginPath(); context.arc(stream.x + Math.cos(angle) * width * 0.22, stream.y2 - Math.abs(Math.sin(angle)) * width * 0.25, Math.max(1, width * 0.04), 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
  if (pourTube) {
    context.save();
    context.translate(pourTube.x + width / 2, pourTube.y);
    context.rotate(pourTube.angle);
    context.translate(-width / 2, 0);
    drawTube(context, pourTube.layers, width, height, pourTube.partial, pourTube.scale, scene.now, '#7fe3ff');
    context.restore();
  }
}

function drawDone(context: CanvasRenderingContext2D, scene: Scene, tube: number, x: number, y: number, width: number) {
  // a cork, and sparkles for a moment after finishing
  context.fillStyle = '#b07a43';
  context.strokeStyle = '#5c3a1a';
  context.lineWidth = 1.5;
  context.beginPath(); context.roundRect(x + width * 0.12, y - width * 0.36, width * 0.76, width * 0.36, width * 0.08); context.fill(); context.stroke();
  const finished = scene.finishedAt.get(tube);
  if (finished === undefined) return;
  const t = (scene.now - finished) / SPARKLE_MS;
  if (t >= 1) { scene.finishedAt.delete(tube); return; }
  context.fillStyle = `rgba(255, 236, 140, ${1 - t})`;
  for (let spark = 0; spark < 8; spark++) {
    const angle = (spark / 8) * Math.PI * 2;
    const distance = width * (0.4 + t * 1.1);
    const sx = x + width / 2 + Math.cos(angle) * distance;
    const sy = y + width * 0.6 + Math.sin(angle) * distance;
    const size = width * 0.09 * (1 - t);
    context.beginPath(); context.moveTo(sx, sy - size * 2); context.lineTo(sx + size, sy); context.lineTo(sx, sy + size * 2); context.lineTo(sx - size, sy); context.closePath(); context.fill();
  }
}

function drawHint(context: CanvasRenderingContext2D, scene: Scene, layout: Layout) {
  const hint = scene.hint!;
  const t = (scene.now - hint.start) / HINT_MS;
  if (t >= 1) { scene.hint = null; return; }
  const count = scene.tubes.length;
  const width = layout.tubeWidth;
  const [fx, fy] = tubeOrigin(hint.from, count, layout);
  const [tx, ty] = tubeOrigin(hint.to, count, layout);
  const bob = Math.sin(t * Math.PI * 8) * width * 0.08;
  context.save();
  context.globalAlpha = Math.min(1, (1 - t) * 4);
  context.fillStyle = '#ffd84d';
  // "from" arrow points up out of the tube, "to" arrow points down into it
  for (const [x, y, down] of [[fx, fy - width * 0.55, false], [tx, ty - width * 0.55, true]] as const) {
    const cx = x + width / 2;
    const cy = y + (down ? bob : -bob) - width * 0.2;
    context.beginPath();
    if (down) { context.moveTo(cx - width * 0.28, cy - width * 0.2); context.lineTo(cx + width * 0.28, cy - width * 0.2); context.lineTo(cx, cy + width * 0.15); }
    else { context.moveTo(cx - width * 0.28, cy + width * 0.15); context.lineTo(cx + width * 0.28, cy + width * 0.15); context.lineTo(cx, cy - width * 0.2); }
    context.closePath(); context.fill();
  }
  context.restore();
}

export function isAnimating(scene: Scene) {
  return scene.pour !== null || scene.shakes.size > 0 || scene.hint !== null || scene.finishedAt.size > 0;
}
