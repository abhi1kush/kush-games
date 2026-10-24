/**
 * Drawing the Ludo board on a canvas: a static layer (yards, track, stars, home columns, centre triangles) rendered
 * once per size/rotation, and the tokens on top (redrawn only when something moves). Everything is canvas paths.
 */
import { absoluteSquare, HOME_COLUMNS, rotatePoint, SAFE_SQUARES, SEATS, TRACK, YARD_ORIGINS, yardSpot } from './engine';

type Context = CanvasRenderingContext2D;
const BOARD_BASE = '#fbf8f1';
const LINE = '#cfc6b2';

function star(context: Context, x: number, y: number, outer: number, inner: number) {
  context.beginPath();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const pointX = x + Math.cos(angle) * radius, pointY = y + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(pointX, pointY); else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

/** The static board at `pixels` × `pixels`, rotated by `quarterTurns` (so the viewer's yard is bottom-left). */
export function drawBoard(canvas: HTMLCanvasElement, pixels: number, quarterTurns: number) {
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext('2d')!;
  const unit = pixels / 15;
  context.save();
  context.translate(pixels / 2, pixels / 2);
  context.rotate((-quarterTurns * Math.PI) / 2);
  context.translate(-pixels / 2, -pixels / 2);
  context.scale(unit, unit);
  context.fillStyle = BOARD_BASE;
  context.fillRect(0, 0, 15, 15);
  context.lineWidth = 0.035;

  // yards
  YARD_ORIGINS.forEach(([originX, originY], seat) => {
    const colors = SEATS[seat];
    const gradient = context.createLinearGradient(originX, originY, originX + 6, originY + 6);
    gradient.addColorStop(0, colors.color);
    gradient.addColorStop(1, colors.dark);
    context.fillStyle = gradient;
    context.fillRect(originX, originY, 6, 6);
    context.fillStyle = '#ffffff';
    context.beginPath(); context.roundRect(originX + 0.8, originY + 0.8, 4.4, 4.4, 0.5); context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.12)';
    context.stroke();
    for (let token = 0; token < 4; token++) {
      const [x, y] = yardSpot(seat, token);
      context.fillStyle = colors.light;
      context.beginPath(); context.arc(x, y, 0.55, 0, Math.PI * 2); context.fill();
      context.strokeStyle = colors.color;
      context.lineWidth = 0.09;
      context.stroke();
    }
    context.lineWidth = 0.035;
  });

  // track squares
  TRACK.forEach(([x, y], square) => {
    const startSeat = SAFE_SQUARES.indexOf(square) % 2 === 0 ? square / 13 : -1;
    context.fillStyle = startSeat >= 0 ? SEATS[startSeat].color : '#ffffff';
    context.fillRect(x, y, 1, 1);
    context.strokeStyle = LINE;
    context.strokeRect(x, y, 1, 1);
    if (SAFE_SQUARES.includes(square)) {
      star(context, x + 0.5, y + 0.5, 0.36, 0.16);
      context.fillStyle = startSeat >= 0 ? 'rgba(255,255,255,0.92)' : '#e8dcbc';
      context.fill();
      context.strokeStyle = startSeat >= 0 ? 'rgba(0,0,0,0.18)' : '#b49a5c';
      context.stroke();
    }
  });
  // home columns + the arrow into each
  HOME_COLUMNS.forEach((column, seat) => {
    for (const [x, y] of column) {
      context.fillStyle = SEATS[seat].color;
      context.fillRect(x, y, 1, 1);
      context.strokeStyle = 'rgba(0,0,0,0.15)';
      context.strokeRect(x, y, 1, 1);
    }
    const [entryX, entryY] = TRACK[absoluteSquare(seat, 50)];
    const [firstX, firstY] = column[0];
    context.strokeStyle = SEATS[seat].color;
    context.lineWidth = 0.12;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(entryX + 0.5, entryY + 0.5);
    context.lineTo(entryX + 0.5 + (firstX - entryX) * 0.45, entryY + 0.5 + (firstY - entryY) * 0.45);
    context.stroke();
    context.lineWidth = 0.035;
  });
  // centre: four triangles pointing at the home columns
  const triangles: [number, number, number, number][] = [[6, 9, 9, 9], [6, 6, 6, 9], [6, 6, 9, 6], [9, 6, 9, 9]];
  triangles.forEach(([ax, ay, bx, by], seat) => {
    const gradient = context.createLinearGradient((ax + bx) / 2, (ay + by) / 2, 7.5, 7.5);
    gradient.addColorStop(0, SEATS[seat].color);
    gradient.addColorStop(1, SEATS[seat].light);
    context.fillStyle = gradient;
    context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.lineTo(7.5, 7.5); context.closePath(); context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.7)';
    context.stroke();
  });
  star(context, 7.5, 7.5, 0.45, 0.2);
  context.fillStyle = '#ffffff';
  context.fill();
  // outer frame
  context.strokeStyle = 'rgba(0,0,0,0.25)';
  context.lineWidth = 0.08;
  context.strokeRect(0.04, 0.04, 14.92, 14.92);
  context.restore();
}

/** A glossy pawn token centred on (x, y) pixels with radius `radius`. */
export function drawToken(context: Context, x: number, y: number, radius: number, seat: number, lift = 0, alpha = 1) {
  const colors = SEATS[seat];
  context.globalAlpha = alpha;
  // shadow stays on the board while the token hops
  context.fillStyle = `rgba(0,0,0,${(0.28 - lift * 0.12).toFixed(3)})`;
  context.beginPath(); context.ellipse(x, y + radius * 0.55, radius * (0.95 - lift * 0.2), radius * 0.42, 0, 0, Math.PI * 2); context.fill();
  const top = y - lift * radius * 1.6;
  // base
  context.fillStyle = colors.dark;
  context.beginPath(); context.ellipse(x, top + radius * 0.35, radius * 0.9, radius * 0.45, 0, 0, Math.PI * 2); context.fill();
  // body
  const gradient = context.createRadialGradient(x - radius * 0.35, top - radius * 0.55, radius * 0.1, x, top - radius * 0.1, radius * 1.1);
  gradient.addColorStop(0, colors.light);
  gradient.addColorStop(0.55, colors.color);
  gradient.addColorStop(1, colors.dark);
  context.fillStyle = gradient;
  context.beginPath(); context.arc(x, top - radius * 0.15, radius * 0.78, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, radius * 0.16);
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.beginPath(); context.arc(x, top - radius * 0.15, radius * 0.28, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.5)';
  context.beginPath(); context.ellipse(x - radius * 0.3, top - radius * 0.5, radius * 0.22, radius * 0.12, -0.6, 0, Math.PI * 2); context.fill();
  context.globalAlpha = 1;
}

/** Board point (grid units) → canvas pixels, after rotation. */
export function toPixels(point: [number, number], unit: number, quarterTurns: number): [number, number] {
  const [x, y] = rotatePoint(point[0], point[1], quarterTurns);
  return [x * unit, y * unit];
}
