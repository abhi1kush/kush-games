/**
 * Drawing the carrom board: the static board (wooden frame, maple surface, pockets, baselines, arrows and the centre
 * rangoli) is painted once per size into an offscreen canvas; each frame only copies it and draws the discs.
 */
import { BASELINE_MAX, BASELINE_MIN, BOARD, BODY_COUNT, BODY_STRIDE, COIN_R, POCKET_R, POCKETS, STRIKER_R } from './engine';

/** Frame width around the 1000 × 1000 playing surface, in board units. */
export const FRAME = 72;
export const TOTAL = BOARD + 2 * FRAME;
const LINE_GAP = 32;
const BASE_OFFSET = 137 - LINE_GAP / 2; // the two baseline lines sit at 121 and 153 from each cushion

export interface View { size: number; ratio: number; flipped: boolean; }
/** Canvas pixels per board unit. */
export const unit = (view: View) => (view.size * view.ratio) / TOTAL;

/** Board units → canvas pixels (the board turns 180° for the second player online). */
export function toCanvas(view: View, x: number, y: number): [number, number] {
  const scale = unit(view);
  return view.flipped ? [(FRAME + BOARD - x) * scale, (FRAME + BOARD - y) * scale] : [(FRAME + x) * scale, (FRAME + y) * scale];
}
/** Client pixels (relative to the canvas box) → board units. */
export function toBoard(view: View, px: number, py: number): [number, number] {
  const scale = view.size / TOTAL;
  const x = px / scale - FRAME, y = py / scale - FRAME;
  return view.flipped ? [BOARD - x, BOARD - y] : [x, y];
}

export function paintBoard(view: View): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const pixels = Math.round(view.size * view.ratio);
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext('2d')!;
  const scale = pixels / TOTAL;
  context.scale(scale, scale);
  // frame: dark rosewood with grain and a rounded outer edge
  const frame = context.createLinearGradient(0, 0, TOTAL, TOTAL);
  frame.addColorStop(0, '#5a2a14'); frame.addColorStop(0.5, '#3d1a0c'); frame.addColorStop(1, '#5c2c15');
  context.fillStyle = frame;
  roundRect(context, 0, 0, TOTAL, TOTAL, 40); context.fill();
  context.strokeStyle = 'rgba(255, 200, 150, 0.07)'; context.lineWidth = 3;
  for (let line = 10; line < TOTAL; line += 17) { context.beginPath(); context.moveTo(0, line); context.bezierCurveTo(TOTAL * 0.3, line + 8, TOTAL * 0.7, line - 8, TOTAL, line + 3); context.stroke(); }
  context.strokeStyle = 'rgba(0,0,0,0.45)'; context.lineWidth = 6; roundRect(context, 6, 6, TOTAL - 12, TOTAL - 12, 36); context.stroke();
  context.translate(FRAME, FRAME);
  // playing surface: light maple
  const surface = context.createRadialGradient(BOARD / 2, BOARD / 2, 80, BOARD / 2, BOARD / 2, BOARD * 0.75);
  surface.addColorStop(0, '#f6dfae'); surface.addColorStop(1, '#e2b673');
  context.fillStyle = surface; context.fillRect(0, 0, BOARD, BOARD);
  context.strokeStyle = 'rgba(150, 90, 30, 0.08)'; context.lineWidth = 2;
  for (let line = 6; line < BOARD; line += 11) { context.beginPath(); context.moveTo(line, 0); context.bezierCurveTo(line + 6, BOARD * 0.33, line - 6, BOARD * 0.66, line + 2, BOARD); context.stroke(); }
  // inner shadow along the cushions
  context.strokeStyle = 'rgba(60, 25, 5, 0.35)'; context.lineWidth = 8; context.strokeRect(0, 0, BOARD, BOARD);
  const ink = '#2b1a10', red = '#b3121d';
  // baselines on all four sides: two lines with a red circle at each end
  for (let side = 0; side < 4; side++) {
    context.save();
    context.translate(BOARD / 2, BOARD / 2); context.rotate((side * Math.PI) / 2); context.translate(-BOARD / 2, -BOARD / 2);
    const near = BOARD - BASE_OFFSET - LINE_GAP;
    context.strokeStyle = ink; context.lineWidth = 2.5;
    for (const y of [near, near + LINE_GAP]) { context.beginPath(); context.moveTo(BASELINE_MIN, y); context.lineTo(BASELINE_MAX, y); context.stroke(); }
    for (const x of [BASELINE_MIN, BASELINE_MAX]) {
      context.beginPath(); context.arc(x, near + LINE_GAP / 2, LINE_GAP / 2, 0, Math.PI * 2);
      context.fillStyle = red; context.fill(); context.stroke();
      context.beginPath(); context.arc(x, near + LINE_GAP / 2, LINE_GAP / 2 - 6, 0, Math.PI * 2); context.strokeStyle = '#f6dfae'; context.lineWidth = 1.5; context.stroke();
      context.strokeStyle = ink; context.lineWidth = 2.5;
    }
    // the diagonal arrow from the corner towards the middle
    context.beginPath(); context.moveTo(BOARD - 110, BOARD - 110); context.lineTo(BOARD - 330, BOARD - 330); context.stroke();
    context.beginPath(); context.moveTo(BOARD - 330, BOARD - 330); context.lineTo(BOARD - 330 + 26, BOARD - 330 + 4); context.moveTo(BOARD - 330, BOARD - 330); context.lineTo(BOARD - 330 + 4, BOARD - 330 + 26); context.stroke();
    context.beginPath(); context.arc(BOARD - 290, BOARD - 290, 34, Math.PI * 0.75 - 1.2, Math.PI * 0.75 + 1.2); context.stroke();
    context.restore();
  }
  // centre: outer ring, rangoli petals, red queen spot
  context.save(); context.translate(BOARD / 2, BOARD / 2);
  context.strokeStyle = ink; context.lineWidth = 2.5;
  context.beginPath(); context.arc(0, 0, 118, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.arc(0, 0, 110, 0, Math.PI * 2); context.lineWidth = 1.2; context.stroke();
  for (let petal = 0; petal < 8; petal++) {
    context.save(); context.rotate((petal * Math.PI) / 4);
    context.beginPath(); context.moveTo(0, -26); context.quadraticCurveTo(26, -64, 0, -104); context.quadraticCurveTo(-26, -64, 0, -26);
    context.fillStyle = petal % 2 ? 'rgba(179, 18, 29, 0.85)' : 'rgba(43, 26, 16, 0.85)'; context.fill();
    context.restore();
  }
  context.beginPath(); context.arc(0, 0, COIN_R + 3, 0, Math.PI * 2); context.fillStyle = red; context.fill(); context.lineWidth = 2; context.strokeStyle = ink; context.stroke();
  context.restore();
  // pockets with a brass rim and a net
  for (const [px, py] of POCKETS) {
    const hole = context.createRadialGradient(px, py, 4, px, py, POCKET_R + 4);
    hole.addColorStop(0, '#000'); hole.addColorStop(0.75, '#140a05'); hole.addColorStop(1, '#3a2010');
    context.beginPath(); context.arc(px, py, POCKET_R + 4, 0, Math.PI * 2); context.fillStyle = hole; context.fill();
    context.strokeStyle = '#c9a24a'; context.lineWidth = 3; context.stroke();
    context.strokeStyle = 'rgba(255,255,255,0.08)'; context.lineWidth = 1;
    for (let line = -POCKET_R; line <= POCKET_R; line += 9) { context.beginPath(); context.moveTo(px + line, py - POCKET_R); context.lineTo(px + line, py + POCKET_R); context.moveTo(px - POCKET_R, py + line); context.lineTo(px + POCKET_R, py + line); context.stroke(); }
  }
  return canvas;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y); context.arcTo(x + width, y, x + width, y + height, radius); context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath();
}

const COIN_STYLE = [
  null,
  { face: '#d6132a', edge: '#7d0612', ring: '#ff8a8a' }, // the Queen
  { face: '#f4ead2', edge: '#a8946a', ring: '#c9b48a' }, // White
  { face: '#2a211c', edge: '#0b0705', ring: '#5c4a3e' }, // Black
] as const;

export interface Overlay {
  /** striker on the baseline while aiming (bad = it overlaps a coin) */
  striker?: { x: number; y: number; bad: boolean; glow: string } | null;
  aim?: { fromX: number; fromY: number; toX: number; toY: number; contact: { x: number; y: number; push?: readonly [number, number] } | null; power: number } | null;
}

/** One frame: the static board, then every disc on the board, then the aim overlay. */
export function drawFrame(context: CanvasRenderingContext2D, board: HTMLCanvasElement, view: View, bodies: Float32Array, overlay: Overlay, hidden: number[] = []) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(board, 0, 0);
  const scale = unit(view);
  for (let index = BODY_COUNT - 1; index >= 0; index--) {
    const base = index * BODY_STRIDE;
    if (bodies[base + 6] < 0.5 || hidden.includes(index)) continue;
    if (index === 0 && overlay.striker) continue;
    const [cx, cy] = toCanvas(view, bodies[base], bodies[base + 1]);
    drawDisc(context, index, cx, cy, bodies[base + 4] * scale, null);
  }
  if (overlay.aim) {
    const { aim } = overlay;
    const [ax, ay] = toCanvas(view, aim.fromX, aim.fromY);
    const [bx, by] = toCanvas(view, aim.toX, aim.toY);
    context.save();
    context.lineCap = 'round';
    context.setLineDash([10 * scale, 9 * scale]);
    context.strokeStyle = `rgba(255, 255, 255, ${0.55 + aim.power * 0.4})`; context.lineWidth = 4 * scale;
    context.shadowColor = 'rgba(0,0,0,0.6)'; context.shadowBlur = 3 * scale;
    context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke();
    context.setLineDash([]);
    if (aim.contact) {
      const [gx, gy] = toCanvas(view, aim.contact.x, aim.contact.y);
      context.beginPath(); context.arc(gx, gy, STRIKER_R * scale, 0, Math.PI * 2); context.strokeStyle = 'rgba(255,255,255,0.85)'; context.lineWidth = 2.5 * scale; context.stroke();
      if (aim.contact.push) {
        const [px, py] = toCanvas(view, aim.contact.x + aim.contact.push[0] * 150, aim.contact.y + aim.contact.push[1] * 150);
        const [sx, sy] = toCanvas(view, aim.contact.x + aim.contact.push[0] * (STRIKER_R + COIN_R), aim.contact.y + aim.contact.push[1] * (STRIKER_R + COIN_R));
        context.strokeStyle = 'rgba(255, 225, 77, 0.9)'; context.lineWidth = 3 * scale;
        context.beginPath(); context.moveTo(sx, sy); context.lineTo(px, py); context.stroke();
      }
    }
    context.restore();
  }
  if (overlay.striker) {
    const { striker } = overlay;
    const [cx, cy] = toCanvas(view, striker.x, striker.y);
    if (overlay.aim) {
      // power ring around the striker (a faint full track, then the power)
      context.beginPath(); context.arc(cx, cy, (STRIKER_R + 12) * scale, 0, Math.PI * 2); context.strokeStyle = 'rgba(0,0,0,0.35)'; context.lineWidth = 9 * scale; context.stroke();
      context.beginPath(); context.arc(cx, cy, (STRIKER_R + 12) * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * overlay.aim.power);
      context.strokeStyle = powerColor(overlay.aim.power); context.lineWidth = 9 * scale; context.lineCap = 'round'; context.stroke();
    }
    drawDisc(context, 0, cx, cy, STRIKER_R * scale, striker.bad ? '#ff3b3b' : striker.glow);
  }
}

export const powerColor = (power: number) => (power < 0.45 ? '#3ddc84' : power < 0.8 ? '#ffd23f' : '#ff4b3a');

function drawDisc(context: CanvasRenderingContext2D, index: number, cx: number, cy: number, radius: number, glow: string | null) {
  context.save();
  context.beginPath(); context.ellipse(cx + radius * 0.12, cy + radius * 0.2, radius, radius * 0.96, 0, 0, Math.PI * 2); context.fillStyle = 'rgba(40, 15, 0, 0.35)'; context.fill();
  if (index === 0) {
    if (glow) { context.shadowColor = glow; context.shadowBlur = radius * 0.9; }
    const face = context.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, '#ffffff'); face.addColorStop(1, '#ddd6c4');
    context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fillStyle = face; context.fill();
    context.shadowBlur = 0;
    context.lineWidth = radius * 0.12; context.strokeStyle = glow ?? '#1aa39a'; context.stroke();
    context.beginPath(); context.arc(cx, cy, radius * 0.62, 0, Math.PI * 2); context.lineWidth = radius * 0.08; context.strokeStyle = '#1aa39a'; context.stroke();
    for (let petal = 0; petal < 6; petal++) {
      const angle = (petal * Math.PI) / 3;
      context.beginPath(); context.arc(cx + Math.cos(angle) * radius * 0.32, cy + Math.sin(angle) * radius * 0.32, radius * 0.16, 0, Math.PI * 2); context.fillStyle = '#e50914'; context.fill();
    }
  } else {
    const style = COIN_STYLE[index === 1 ? 1 : index < 11 ? 2 : 3]!;
    const face = context.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, style.ring); face.addColorStop(0.35, style.face); face.addColorStop(1, style.edge);
    context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fillStyle = face; context.fill();
    context.lineWidth = Math.max(1, radius * 0.08); context.strokeStyle = style.edge;
    for (const ring of [0.78, 0.5]) { context.beginPath(); context.arc(cx, cy, radius * ring, 0, Math.PI * 2); context.stroke(); }
    if (index === 1) { context.beginPath(); context.arc(cx, cy, radius * 0.22, 0, Math.PI * 2); context.fillStyle = '#ffd34d'; context.fill(); }
  }
  context.restore();
}
