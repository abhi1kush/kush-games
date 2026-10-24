/** Draws a Snakes & Ladders board (squares, numbers, ladders, snakes) and the player tokens on a canvas. */
import { BOARD_JUMPS, BOARDS, bezierPoint, type Point, SEATS, snakeCurve, squarePoint } from './engine';

type Context = CanvasRenderingContext2D;

/** Deterministic little random numbers for decorations (same picture every time). */
function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export function drawBoard(canvas: HTMLCanvasElement, size: number, boardIndex: number) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const theme = BOARDS[boardIndex] ?? BOARDS[0];
  const unit = size / 10;
  // squares
  for (let square = 1; square <= 100; square++) {
    const [cx, cy] = squarePoint(square);
    const x = (cx - 0.5) * unit, y = (cy - 0.5) * unit;
    const isDark = (Math.floor(cx) + Math.floor(cy)) % 2 === 1;
    const gradient = context.createLinearGradient(x, y, x + unit, y + unit);
    gradient.addColorStop(0, isDark ? theme.dark : theme.light);
    gradient.addColorStop(1, shade(isDark ? theme.dark : theme.light, theme.night ? 0.08 : -0.07));
    context.fillStyle = gradient;
    context.fillRect(x, y, unit + 0.5, unit + 0.5);
  }
  // decorations: stars at night, soft dots otherwise
  const random = seeded(boardIndex * 97 + 13);
  for (let index = 0; index < (theme.night ? 90 : 40); index++) {
    const x = random() * size, y = random() * size, radius = unit * (theme.night ? 0.015 + random() * 0.03 : 0.04 + random() * 0.05);
    context.fillStyle = theme.night ? `rgba(255,255,230,${(0.35 + random() * 0.55).toFixed(2)})` : 'rgba(255,255,255,0.35)';
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  // grid lines
  context.strokeStyle = theme.night ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  context.lineWidth = Math.max(1, unit * 0.015);
  for (let line = 1; line < 10; line++) {
    context.beginPath(); context.moveTo(line * unit, 0); context.lineTo(line * unit, size); context.stroke();
    context.beginPath(); context.moveTo(0, line * unit); context.lineTo(size, line * unit); context.stroke();
  }
  // start and finish squares
  const [startX, startY] = squarePoint(1);
  context.fillStyle = theme.night ? 'rgba(120,255,170,0.25)' : 'rgba(46,160,67,0.22)';
  context.fillRect((startX - 0.5) * unit, (startY - 0.5) * unit, unit, unit);
  const [endX, endY] = squarePoint(100);
  const glow = context.createRadialGradient(endX * unit, endY * unit, unit * 0.05, endX * unit, endY * unit, unit * 0.7);
  glow.addColorStop(0, '#fff6b0'); glow.addColorStop(0.6, '#ffc934'); glow.addColorStop(1, '#e08a00');
  context.fillStyle = glow;
  context.fillRect((endX - 0.5) * unit, (endY - 0.5) * unit, unit, unit);
  star(context, endX * unit, (endY + 0.08) * unit, unit * 0.3, unit * 0.13, 'rgba(255,255,255,0.85)');
  // numbers
  context.textBaseline = 'top';
  context.textAlign = 'left';
  for (let square = 1; square <= 100; square++) {
    const [cx, cy] = squarePoint(square);
    const isEnd = square === 100;
    context.font = `800 ${Math.round(unit * (isEnd ? 0.3 : 0.24))}px system-ui, sans-serif`;
    context.fillStyle = isEnd ? '#6b3a00' : theme.ink;
    context.globalAlpha = isEnd ? 1 : 0.8;
    context.fillText(String(square), (cx - 0.38) * unit, (cy - 0.4) * unit);
  }
  context.globalAlpha = 1;
  context.font = `900 ${Math.round(unit * 0.17)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = theme.night ? '#b9ffd0' : '#1b6a2b';
  context.fillText('START', startX * unit, (startY + 0.18) * unit);
  // ladders, then snakes on top
  const jumps = BOARD_JUMPS[boardIndex] ?? BOARD_JUMPS[0];
  for (const [from, to] of jumps) if (to > from) drawLadder(context, squarePoint(from), squarePoint(to), unit);
  jumps.filter(([from, to]) => to < from).forEach(([from, to], index) => drawSnake(context, snakeCurve(from, to, index), unit, theme.snakes[index % theme.snakes.length]));
  // frame
  context.strokeStyle = theme.frame;
  context.lineWidth = unit * 0.07;
  context.strokeRect(unit * 0.035, unit * 0.035, size - unit * 0.07, size - unit * 0.07);
}

function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) + amount * 255)));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function star(context: Context, x: number, y: number, outer: number, inner: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const radius = point % 2 === 0 ? outer : inner;
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

function drawLadder(context: Context, [fromX, fromY]: Point, [toX, toY]: Point, unit: number) {
  const dx = toX - fromX, dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  const ux = dx / length, uy = dy / length, nx = -uy * 0.17, ny = ux * 0.17;
  // ends reach a little past the square centres
  const start: Point = [fromX - ux * 0.22, fromY - uy * 0.22], end: Point = [toX + ux * 0.22, toY + uy * 0.22];
  const total = length + 0.44;
  const rails: [Point, Point][] = [[[start[0] + nx, start[1] + ny], [end[0] + nx, end[1] + ny]], [[start[0] - nx, start[1] - ny], [end[0] - nx, end[1] - ny]]];
  context.lineCap = 'round';
  // shadow
  context.strokeStyle = 'rgba(0,0,0,0.25)';
  context.lineWidth = unit * 0.09;
  for (const [a, b] of rails) { context.beginPath(); context.moveTo((a[0] + 0.05) * unit, (a[1] + 0.07) * unit); context.lineTo((b[0] + 0.05) * unit, (b[1] + 0.07) * unit); context.stroke(); }
  // rungs
  context.strokeStyle = '#c98a4b';
  context.lineWidth = unit * 0.06;
  for (let distance = 0.25; distance < total - 0.1; distance += 0.34) {
    const x = start[0] + ux * distance, y = start[1] + uy * distance;
    context.beginPath(); context.moveTo((x + nx) * unit, (y + ny) * unit); context.lineTo((x - nx) * unit, (y - ny) * unit); context.stroke();
  }
  // rails
  for (const [a, b] of rails) {
    context.strokeStyle = '#8a5223';
    context.lineWidth = unit * 0.09;
    context.beginPath(); context.moveTo(a[0] * unit, a[1] * unit); context.lineTo(b[0] * unit, b[1] * unit); context.stroke();
    context.strokeStyle = '#e0a868';
    context.lineWidth = unit * 0.03;
    context.beginPath(); context.moveTo((a[0] - nx * 0.12) * unit, (a[1] - ny * 0.12) * unit); context.lineTo((b[0] - nx * 0.12) * unit, (b[1] - ny * 0.12) * unit); context.stroke();
  }
}

const SNAKE_SAMPLES = 44;
/** Half-width of a snake's body along its length (t = 0 head … 1 tail tip), in board units. */
const snakeWidth = (t: number) => 0.16 * (t < 0.1 ? 0.7 + t * 3 : Math.max(0.12, 1 - Math.pow((t - 0.1) / 0.9, 1.3) * 0.9));

function drawSnake(context: Context, curve: [Point, Point, Point, Point], unit: number, [body, pattern]: readonly [string, string]) {
  const points: Point[] = [];
  for (let index = 0; index <= SNAKE_SAMPLES; index++) points.push(bezierPoint(curve, index / SNAKE_SAMPLES));
  const left: Point[] = [], right: Point[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 1)];
    const dx = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const width = snakeWidth(index / SNAKE_SAMPLES);
    left.push([point[0] - (dy / length) * width, point[1] + (dx / length) * width]);
    right.push([point[0] + (dy / length) * width, point[1] - (dx / length) * width]);
  });
  const outline = (offsetX: number, offsetY: number) => {
    context.beginPath();
    left.forEach(([x, y], index) => (index ? context.lineTo : context.moveTo).call(context, (x + offsetX) * unit, (y + offsetY) * unit));
    for (let index = right.length - 1; index >= 0; index--) context.lineTo((right[index][0] + offsetX) * unit, (right[index][1] + offsetY) * unit);
    context.closePath();
  };
  outline(0.05, 0.08);
  context.fillStyle = 'rgba(0,0,0,0.28)';
  context.fill();
  outline(0, 0);
  const [headX, headY] = points[0], [tailX, tailY] = points[points.length - 1];
  const gradient = context.createLinearGradient(headX * unit, headY * unit, tailX * unit, tailY * unit);
  gradient.addColorStop(0, body);
  gradient.addColorStop(1, shade(body.length === 7 ? body : '#448844', 0.12));
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.45)';
  context.lineWidth = Math.max(1, unit * 0.025);
  context.stroke();
  // pattern: diamonds along the back
  context.fillStyle = pattern;
  for (let index = 5; index < SNAKE_SAMPLES - 3; index += 3) {
    const [x, y] = points[index], [nextX, nextY] = points[index + 1];
    const angle = Math.atan2(nextY - y, nextX - x);
    const width = snakeWidth(index / SNAKE_SAMPLES);
    context.save();
    context.translate(x * unit, y * unit);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(-width * 0.9 * unit, 0); context.lineTo(0, -width * 0.55 * unit); context.lineTo(width * 0.9 * unit, 0); context.lineTo(0, width * 0.55 * unit);
    context.closePath();
    context.fill();
    context.restore();
  }
  // head
  const [nextX, nextY] = points[2];
  const angle = Math.atan2(headY - nextY, headX - nextX);
  context.save();
  context.translate(headX * unit, headY * unit);
  context.rotate(angle);
  // tongue
  context.strokeStyle = '#e53935';
  context.lineWidth = Math.max(1, unit * 0.025);
  context.beginPath(); context.moveTo(0.2 * unit, 0); context.lineTo(0.36 * unit, 0); context.lineTo(0.42 * unit, -0.05 * unit);
  context.moveTo(0.36 * unit, 0); context.lineTo(0.42 * unit, 0.05 * unit); context.stroke();
  context.fillStyle = body;
  context.beginPath(); context.ellipse(0.04 * unit, 0, 0.21 * unit, 0.17 * unit, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.45)';
  context.stroke();
  for (const side of [-1, 1]) {
    context.fillStyle = '#fff';
    context.beginPath(); context.arc(0.1 * unit, side * 0.085 * unit, 0.055 * unit, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#111';
    context.beginPath(); context.arc(0.12 * unit, side * 0.085 * unit, 0.028 * unit, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

export function drawToken(context: Context, x: number, y: number, radius: number, seat: number, lift = 0) {
  const colors = SEATS[seat];
  context.fillStyle = `rgba(0,0,0,${(0.3 - lift * 0.14).toFixed(3)})`;
  context.beginPath(); context.ellipse(x, y + radius * 0.55, radius * (0.9 - lift * 0.2), radius * 0.38, 0, 0, Math.PI * 2); context.fill();
  const top = y - lift * radius * 1.8;
  context.fillStyle = colors.dark;
  context.beginPath(); context.ellipse(x, top + radius * 0.38, radius * 0.82, radius * 0.4, 0, 0, Math.PI * 2); context.fill();
  // cone body
  const body = context.createLinearGradient(x - radius, 0, x + radius, 0);
  body.addColorStop(0, colors.dark); body.addColorStop(0.35, colors.light); body.addColorStop(1, colors.dark);
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(x - radius * 0.72, top + radius * 0.38);
  context.quadraticCurveTo(x - radius * 0.2, top - radius * 0.2, x - radius * 0.22, top - radius * 0.62);
  context.lineTo(x + radius * 0.22, top - radius * 0.62);
  context.quadraticCurveTo(x + radius * 0.2, top - radius * 0.2, x + radius * 0.72, top + radius * 0.38);
  context.closePath();
  context.fill();
  // head ball
  const head = context.createRadialGradient(x - radius * 0.15, top - radius * 0.95, radius * 0.05, x, top - radius * 0.8, radius * 0.45);
  head.addColorStop(0, '#ffffff'); head.addColorStop(0.3, colors.light); head.addColorStop(1, colors.color);
  context.fillStyle = head;
  context.beginPath(); context.arc(x, top - radius * 0.8, radius * 0.38, 0, Math.PI * 2); context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  context.lineWidth = Math.max(1, radius * 0.1);
  context.beginPath(); context.ellipse(x, top + radius * 0.38, radius * 0.82, radius * 0.4, 0, 0, Math.PI * 2); context.stroke();
}

/** Confetti for reaching 100 (drawn over the board for a moment). */
export interface Confetti { x: number; y: number; vx: number; vy: number; color: string; spin: number; size: number; }
export function makeConfetti(x: number, y: number, count = 70): Confetti[] {
  const colors = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ffffff'];
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 4.5;
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3, color: colors[index % colors.length], spin: Math.random() * 6, size: 0.06 + Math.random() * 0.07 };
  });
}
export function drawConfetti(context: Context, pieces: Confetti[], seconds: number, unit: number) {
  const fade = Math.max(0, 1 - seconds / 1.8);
  context.globalAlpha = fade;
  for (const piece of pieces) {
    const x = piece.x + piece.vx * seconds, y = piece.y + piece.vy * seconds + 4.5 * seconds * seconds;
    context.save();
    context.translate(x * unit, y * unit);
    context.rotate(piece.spin + seconds * 8);
    context.fillStyle = piece.color;
    context.fillRect(-piece.size * unit, -piece.size * unit * 0.5, piece.size * 2 * unit, piece.size * unit);
    context.restore();
  }
  context.globalAlpha = 1;
}
