/**
 * Mithai Match art, all drawn with canvas paths (no image files). Each sweet has its own silhouette AND colour, so the
 * board reads without colour vision: round laddoo, spiral jalebi, square barfi, diamond kaju katli, drop-shaped gulab
 * jamun and heart-shaped sandesh. Pieces are pre-rendered once per cell size into small sprite canvases.
 */
import { BOMB_COLOUR, Special } from './engine';

type Context = CanvasRenderingContext2D;

/** Main colour, light highlight and dark outline per sweet (and per spark colour 6 gold, 7 stone dust, 8 metal). */
export const SWEET_COLOURS = [
  { main: '#f39a2b', light: '#ffd27a', dark: '#a85512' },
  { main: '#ffd23f', light: '#fff1a8', dark: '#b58400' },
  { main: '#5cbf5a', light: '#c8f0b0', dark: '#2a7a32' },
  { main: '#e4e0d4', light: '#ffffff', dark: '#8e8774' },
  { main: '#8a2530', light: '#e0707a', dark: '#4a0d14' },
  { main: '#9d6be0', light: '#dcc6ff', dark: '#5a2e9c' },
];
export const SPARK_COLOURS = ['#f39a2b', '#ffd23f', '#5cbf5a', '#f4f1e8', '#c0404c', '#b48cf0', '#ffe27a', '#9b9b92', '#d6d9de'];

function shapePath(context: Context, colour: number) {
  context.beginPath();
  switch (colour) {
    case 0: context.arc(0.5, 0.52, 0.36, 0, Math.PI * 2); break;
    case 1: // jalebi: a scalloped ring
      for (let step = 0; step <= 64; step += 1) {
        const angle = (step / 64) * Math.PI * 2, radius = 0.35 + Math.sin(angle * 7) * 0.045;
        const x = 0.5 + Math.cos(angle) * radius, y = 0.5 + Math.sin(angle) * radius;
        if (step === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      break;
    case 2: context.roundRect(0.17, 0.17, 0.66, 0.66, 0.08); break;
    case 3: context.moveTo(0.5, 0.1); context.lineTo(0.9, 0.5); context.lineTo(0.5, 0.9); context.lineTo(0.1, 0.5); context.closePath(); break;
    case 4:
      context.moveTo(0.5, 0.12);
      context.bezierCurveTo(0.62, 0.3, 0.84, 0.44, 0.84, 0.62);
      context.bezierCurveTo(0.84, 0.82, 0.68, 0.9, 0.5, 0.9);
      context.bezierCurveTo(0.32, 0.9, 0.16, 0.82, 0.16, 0.62);
      context.bezierCurveTo(0.16, 0.44, 0.38, 0.3, 0.5, 0.12);
      break;
    default:
      context.moveTo(0.5, 0.86);
      context.bezierCurveTo(0.22, 0.66, 0.1, 0.5, 0.12, 0.34);
      context.bezierCurveTo(0.14, 0.18, 0.4, 0.12, 0.5, 0.3);
      context.bezierCurveTo(0.6, 0.12, 0.86, 0.18, 0.88, 0.34);
      context.bezierCurveTo(0.9, 0.5, 0.78, 0.66, 0.5, 0.86);
  }
}

function drawSweetBody(context: Context, colour: number) {
  const palette = SWEET_COLOURS[colour];
  shapePath(context, colour);
  const gradient = context.createRadialGradient(0.38, 0.32, 0.04, 0.5, 0.5, 0.5);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.55, palette.main);
  gradient.addColorStop(1, palette.dark);
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = 0.035;
  context.strokeStyle = palette.dark;
  context.stroke();
  context.save();
  shapePath(context, colour);
  context.clip();
  switch (colour) {
    case 0: // laddoo: little boondi bumps
      context.fillStyle = 'rgba(168,85,18,0.45)';
      for (let index = 0; index < 14; index += 1) {
        const angle = index * 2.4, radius = 0.08 + (index % 4) * 0.07;
        context.beginPath();
        context.arc(0.5 + Math.cos(angle) * radius, 0.52 + Math.sin(angle) * radius, 0.03, 0, Math.PI * 2);
        context.fill();
      }
      break;
    case 1: { // jalebi: a syrupy spiral
      context.beginPath();
      for (let step = 0; step <= 60; step += 1) {
        const angle = step * 0.32, radius = 0.03 + step * 0.0052;
        const x = 0.5 + Math.cos(angle) * radius, y = 0.5 + Math.sin(angle) * radius;
        if (step === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.lineWidth = 0.06;
      context.strokeStyle = '#d98a00';
      context.lineCap = 'round';
      context.stroke();
      break;
    }
    case 2: // barfi: silver varq sheen and pistachio specks
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.beginPath(); context.moveTo(0.17, 0.42); context.lineTo(0.42, 0.17); context.lineTo(0.56, 0.17); context.lineTo(0.17, 0.56); context.fill();
      context.fillStyle = '#2a7a32';
      for (const [x, y] of [[0.6, 0.6], [0.7, 0.42], [0.42, 0.7], [0.66, 0.72]]) { context.fillRect(x, y, 0.04, 0.025); }
      break;
    case 3: // kaju katli: inner diamond edge and silver leaf
      context.strokeStyle = 'rgba(142,135,116,0.6)';
      context.lineWidth = 0.025;
      context.beginPath(); context.moveTo(0.5, 0.24); context.lineTo(0.76, 0.5); context.lineTo(0.5, 0.76); context.lineTo(0.24, 0.5); context.closePath(); context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.fillRect(0.4, 0.36, 0.12, 0.06);
      break;
    case 4: // gulab jamun: glossy syrup highlight
      context.fillStyle = 'rgba(255,220,220,0.55)';
      context.beginPath(); context.ellipse(0.38, 0.52, 0.06, 0.13, -0.4, 0, Math.PI * 2); context.fill();
      break;
    default: // sandesh: pressed-mould ridges
      context.strokeStyle = 'rgba(90,46,156,0.55)';
      context.lineWidth = 0.025;
      for (const radius of [0.12, 0.22]) { context.beginPath(); context.arc(0.5, 0.48, radius, 0.2 * Math.PI, 0.8 * Math.PI); context.stroke(); }
  }
  context.restore();
  // top shine
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.beginPath(); context.ellipse(0.4, 0.3, 0.1, 0.05, -0.5, 0, Math.PI * 2); context.fill();
}

function drawStripes(context: Context, colour: number, vertical: boolean) {
  context.save();
  shapePath(context, colour);
  context.clip();
  context.fillStyle = 'rgba(255,255,255,0.85)';
  for (const at of [0.3, 0.5, 0.7]) {
    if (vertical) context.fillRect(at - 0.04, 0, 0.08, 1); else context.fillRect(0, at - 0.04, 1, 0.08);
  }
  context.restore();
  shapePath(context, colour);
  context.lineWidth = 0.04;
  context.strokeStyle = '#ffffff';
  context.stroke();
}

function drawWrapper(context: Context) {
  // a sweet-box wrapper: foil square with twisted ends
  context.strokeStyle = '#ffd86b';
  context.lineWidth = 0.06;
  context.beginPath(); context.roundRect(0.07, 0.07, 0.86, 0.86, 0.18); context.stroke();
  context.fillStyle = '#ffd86b';
  for (const [x, y] of [[0.07, 0.07], [0.93, 0.07], [0.07, 0.93], [0.93, 0.93]]) {
    context.beginPath(); context.arc(x, y, 0.06, 0, Math.PI * 2); context.fill();
  }
  context.strokeStyle = 'rgba(255,255,255,0.7)';
  context.lineWidth = 0.02;
  context.beginPath(); context.roundRect(0.07, 0.07, 0.86, 0.86, 0.18); context.stroke();
}

function drawBomb(context: Context) {
  const gradient = context.createRadialGradient(0.4, 0.36, 0.03, 0.5, 0.5, 0.4);
  gradient.addColorStop(0, '#8a5a3c');
  gradient.addColorStop(0.6, '#4a2a18');
  gradient.addColorStop(1, '#22120a');
  context.fillStyle = gradient;
  context.beginPath(); context.arc(0.5, 0.5, 0.38, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#ffe27a';
  context.lineWidth = 0.03;
  context.stroke();
  for (let index = 0; index < 18; index += 1) {
    const angle = index * 2.39, radius = 0.06 + (index % 5) * 0.058;
    const x = 0.5 + Math.cos(angle) * radius, y = 0.5 + Math.sin(angle) * radius;
    context.save();
    context.translate(x, y);
    context.rotate(angle * 1.7);
    context.fillStyle = SWEET_COLOURS[index % 6].light === '#ffffff' ? '#ffffff' : SWEET_COLOURS[index % 6].main;
    context.fillRect(-0.035, -0.012, 0.07, 0.024);
    context.restore();
  }
  context.fillStyle = 'rgba(255,255,255,0.4)';
  context.beginPath(); context.ellipse(0.38, 0.3, 0.1, 0.05, -0.5, 0, Math.PI * 2); context.fill();
}

/** Draws one piece into a 1x1 unit square (caller scales). */
export function drawPiece(context: Context, colour: number, special: number) {
  if (special === Special.ColourBomb || colour === BOMB_COLOUR) { drawBomb(context); return; }
  if (special === Special.Wrapped) {
    context.save();
    context.translate(0.5, 0.5); context.scale(0.82, 0.82); context.translate(-0.5, -0.5);
    drawSweetBody(context, colour);
    context.restore();
    drawWrapper(context);
    return;
  }
  drawSweetBody(context, colour);
  if (special === Special.StripedH || special === Special.StripedV) drawStripes(context, colour, special === Special.StripedV);
}

/** Pre-rendered piece sprites at one pixel size: index colour * 5 + special (bomb at 6 * 5 + 4). */
export class SpriteSheet {
  readonly sprites: (HTMLCanvasElement | null)[] = new Array(35).fill(null);
  constructor(readonly pixels: number) {}
  get(colour: number, special: number): HTMLCanvasElement {
    const index = special === Special.ColourBomb ? 34 : colour * 5 + special;
    let sprite = this.sprites[index];
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = this.pixels;
      const context = sprite.getContext('2d')!;
      context.scale(this.pixels, this.pixels);
      drawPiece(context, colour, special);
      this.sprites[index] = sprite;
    }
    return sprite;
  }
}

/** Stone blocker (hp 1 or 2) in a 1x1 unit square. */
export function drawStone(context: Context, x: number, y: number, size: number, hitPoints: number) {
  context.save();
  context.translate(x, y);
  context.scale(size, size);
  const gradient = context.createLinearGradient(0, 0, 1, 1);
  gradient.addColorStop(0, hitPoints > 1 ? '#8d8d86' : '#b7b4a8');
  gradient.addColorStop(1, hitPoints > 1 ? '#4d4c48' : '#7d7a70');
  context.fillStyle = gradient;
  context.beginPath(); context.roundRect(0.06, 0.06, 0.88, 0.88, 0.14); context.fill();
  context.strokeStyle = 'rgba(30,28,24,0.55)';
  context.lineWidth = 0.04;
  context.stroke();
  context.beginPath();
  context.moveTo(0.3, 0.06); context.lineTo(0.42, 0.34); context.lineTo(0.32, 0.56);
  if (hitPoints > 1) { context.moveTo(0.94, 0.5); context.lineTo(0.66, 0.6); context.lineTo(0.6, 0.94); context.moveTo(0.42, 0.34); context.lineTo(0.7, 0.3); }
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(0.14, 0.14, 0.3, 0.06);
  context.restore();
}

/** A silver chain lock over a piece. */
export function drawLock(context: Context, x: number, y: number, size: number) {
  context.save();
  context.translate(x, y);
  context.scale(size, size);
  context.strokeStyle = '#d6d9de';
  context.lineWidth = 0.07;
  context.beginPath(); context.moveTo(0.1, 0.1); context.lineTo(0.9, 0.9); context.moveTo(0.9, 0.1); context.lineTo(0.1, 0.9); context.stroke();
  context.strokeStyle = '#6b7078';
  context.lineWidth = 0.02;
  context.stroke();
  context.fillStyle = '#c9a43a';
  context.beginPath(); context.roundRect(0.36, 0.44, 0.28, 0.24, 0.04); context.fill();
  context.strokeStyle = '#c9a43a';
  context.lineWidth = 0.05;
  context.beginPath(); context.arc(0.5, 0.44, 0.09, Math.PI, 0); context.stroke();
  context.fillStyle = '#5a4510';
  context.fillRect(0.48, 0.52, 0.04, 0.08);
  context.restore();
}

/** Small goal icons for the HUD / level map (CSS-sized SVG would also work; one canvas keeps it consistent). */
const iconCache = new Map<number, string>();
export function sweetIconDataUrl(colour: number, pixels = 48): string {
  const cached = iconCache.get(colour * 1000 + pixels);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext('2d')!;
  context.scale(pixels, pixels);
  drawPiece(context, colour, Special.None);
  const url = canvas.toDataURL();
  iconCache.set(colour * 1000 + pixels, url);
  return url;
}
