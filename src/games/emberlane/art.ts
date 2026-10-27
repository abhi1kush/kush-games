/**
 * Ember Lane scenery. World units: x along the street, y up from the cobbles. The view is a camera window; `scale`
 * is CSS pixels per world unit and `ground` the screen y of the street line. Backgrounds are painted once into cached
 * chunks per parallax layer; flames, braziers, the lantern, crates, levers and shutters are drawn per frame.
 */
import { DOOR_X, STAGE_END } from './engine';

export const hash = (value: number) => { let x = (value * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

export interface View { camX: number; scale: number; width: number; height: number; ground: number }
export const toScreenX = (view: View, x: number) => (x - view.camX) * view.scale;
export const toScreenY = (view: View, y: number) => view.ground - y * view.scale;

// ---------------------------------------------------------------- sky
export function paintSky(width: number, height: number, ratio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#050816');
  sky.addColorStop(0.45, '#141634');
  sky.addColorStop(0.75, '#2b1f3e');
  sky.addColorStop(1, '#4a2a35');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 120; index++) {
    const x = hash(index * 3 + 1) * width;
    const y = hash(index * 7 + 2) * height * 0.55;
    const size = 0.4 + hash(index * 11) * 1.1;
    context.globalAlpha = 0.25 + hash(index * 13) * 0.6;
    context.fillStyle = '#e8ecff';
    context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
  // moon with halo
  const moonX = width * 0.78;
  const moonY = height * 0.2;
  const moonR = Math.max(10, height * 0.055);
  const halo = context.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 7);
  halo.addColorStop(0, 'rgba(200, 210, 255, 0.35)'); halo.addColorStop(0.3, 'rgba(150, 160, 230, 0.12)'); halo.addColorStop(1, 'rgba(120, 130, 200, 0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);
  const moon = context.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, moonR * 0.1, moonX, moonY, moonR);
  moon.addColorStop(0, '#fbf8ea'); moon.addColorStop(1, '#c9c6d8');
  context.fillStyle = moon;
  context.beginPath(); context.arc(moonX, moonY, moonR, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'rgba(120, 118, 140, 0.35)';
  for (const [dx, dy, r] of [[-0.3, -0.1, 0.22], [0.25, 0.2, 0.16], [0.05, -0.38, 0.1]]) { context.beginPath(); context.arc(moonX + dx * moonR, moonY + dy * moonR, r * moonR, 0, Math.PI * 2); context.fill(); }
  // far pyres glowing on the horizon
  for (const [fx, strength] of [[0.18, 0.5], [0.52, 0.35], [0.9, 0.42]]) {
    const glow = context.createRadialGradient(width * fx, height, 0, width * fx, height, height * 0.6);
    glow.addColorStop(0, `rgba(255, 120, 50, ${strength * 0.45})`); glow.addColorStop(1, 'rgba(255, 90, 40, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
  return canvas;
}

// ---------------------------------------------------------------- cached parallax layers
type Painter = (context: CanvasRenderingContext2D, u0: number, u1: number, scale: number, ground: number, height: number) => void;
const CHUNK_UNITS = 360;

export class LayerCache {
  private chunks = new Map<number, HTMLCanvasElement>();
  private key = '';
  constructor(private painter: Painter, readonly parallax: number) {}
  draw(context: CanvasRenderingContext2D, view: View, ratio: number) {
    const key = `${view.scale}:${view.height}:${view.ground}:${ratio}`;
    if (key !== this.key) { this.chunks.clear(); this.key = key; }
    const left = view.camX * this.parallax;
    const right = left + view.width / view.scale;
    for (let index = Math.floor(left / CHUNK_UNITS); index * CHUNK_UNITS < right; index++) {
      let chunk = this.chunks.get(index);
      if (!chunk) {
        chunk = document.createElement('canvas');
        chunk.width = Math.ceil(CHUNK_UNITS * view.scale * ratio) + 2;
        chunk.height = Math.ceil(view.height * ratio);
        const chunkContext = chunk.getContext('2d')!;
        chunkContext.scale(ratio, ratio);
        chunkContext.translate(-index * CHUNK_UNITS * view.scale, 0);
        this.painter(chunkContext, index * CHUNK_UNITS, (index + 1) * CHUNK_UNITS, view.scale, view.ground, view.height);
        this.chunks.set(index, chunk);
        if (this.chunks.size > 24) { const first = this.chunks.keys().next().value; if (first !== undefined && first !== index) this.chunks.delete(first); }
      }
      context.drawImage(chunk, Math.round((index * CHUNK_UNITS - left) * view.scale * ratio), 0);
    }
  }
}

/** Distant rooftops, a spire and a watchtower — flat silhouettes. */
export const paintFar: Painter = (context, u0, u1, scale, ground) => {
  const base = ground - 26 * scale;
  context.fillStyle = '#161631';
  let u = Math.floor(u0 / 46) * 46 - 46;
  while (u < u1 + 46) {
    const n = Math.floor(u / 46);
    const w = 46;
    const h = 70 + hash(n * 5) * 60;
    const top = base - h * scale;
    context.beginPath();
    context.moveTo(u * scale, base);
    context.lineTo(u * scale, top + 14 * scale);
    context.lineTo((u + w / 2) * scale, top - 6 * scale);
    context.lineTo((u + w) * scale, top + 14 * scale);
    context.lineTo((u + w) * scale, base);
    context.fill();
    if (n % 13 === 4) {
      // church spire
      context.beginPath();
      context.moveTo((u + 14) * scale, top);
      context.lineTo((u + 23) * scale, top - 90 * scale);
      context.lineTo((u + 32) * scale, top);
      context.fill();
      context.fillRect((u + 12) * scale, top, 22 * scale, h * scale);
    }
    if (hash(n * 9) > 0.8) {
      context.fillStyle = 'rgba(255, 170, 90, 0.5)';
      context.fillRect((u + 18) * scale, top + 30 * scale, 3 * scale, 4 * scale);
      context.fillStyle = '#161631';
    }
    u += w;
  }
  context.fillRect(u0 * scale, base, (u1 - u0) * scale, 40 * scale);
};

/** Closer houses: gables, chimneys and a few warm windows. */
export const paintMid: Painter = (context, u0, u1, scale, ground) => {
  const base = ground - 12 * scale;
  let u = Math.floor(u0 / 70) * 70 - 70;
  while (u < u1 + 70) {
    const n = Math.floor(u / 70) + 1000;
    const w = 58 + hash(n) * 20;
    const h = 95 + hash(n * 3) * 55;
    const top = base - h * scale;
    const shade = 18 + Math.floor(hash(n * 7) * 8);
    context.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 16})`;
    context.beginPath();
    context.moveTo(u * scale, base);
    context.lineTo(u * scale, top);
    context.lineTo((u + w / 2) * scale, top - 30 * scale);
    context.lineTo((u + w) * scale, top);
    context.lineTo((u + w) * scale, base);
    context.fill();
    if (hash(n * 13) > 0.4) context.fillRect((u + w * 0.68) * scale, top - 30 * scale, 7 * scale, 22 * scale);
    context.strokeStyle = 'rgba(70, 60, 90, 0.35)';
    context.lineWidth = Math.max(1, scale * 1.2);
    context.beginPath();
    context.moveTo(u * scale, top + h * 0.45 * scale); context.lineTo((u + w) * scale, top + h * 0.45 * scale);
    context.moveTo((u + w * 0.33) * scale, top); context.lineTo((u + w * 0.33) * scale, base);
    context.moveTo((u + w * 0.66) * scale, top); context.lineTo((u + w * 0.66) * scale, base);
    context.stroke();
    for (let window = 0; window < 2; window++) {
      if (hash(n * 17 + window) < 0.55) continue;
      const wx = u + w * (0.18 + window * 0.45);
      const wy = top + (18 + hash(n + window) * 30) * scale;
      const glow = context.createRadialGradient((wx + 5) * scale, wy + 5 * scale, 0, (wx + 5) * scale, wy + 5 * scale, 22 * scale);
      glow.addColorStop(0, 'rgba(255, 170, 80, 0.35)'); glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
      context.fillStyle = glow;
      context.fillRect((wx - 20) * scale, wy - 20 * scale, 50 * scale, 50 * scale);
      context.fillStyle = '#f2a65a';
      context.fillRect(wx * scale, wy, 9 * scale, 11 * scale);
      context.fillStyle = 'rgba(40, 25, 20, 0.9)';
      context.fillRect((wx + 4) * scale, wy, 1.2 * scale, 11 * scale);
    }
    u += 70;
  }
};

// ---------------------------------------------------------------- the street itself
interface House { x: number; width: number; height: number; plaster: string; door: number; cross: boolean; windows: number[] }
const PLASTERS = ['#b9a68a', '#a89a86', '#c2ae8c', '#9c8f80', '#b5a079'];

/** Houses along the street, fixed per stage; windows A and B and the sanctuary sit where Rust's lights are. */
export const HOUSES: House[] = (() => {
  const houses: House[] = [];
  let x = -40;
  let n = 0;
  while (x < STAGE_END + 200) {
    const width = 130 + Math.floor(hash(n * 31 + 7) * 70);
    houses.push({ x, width, height: 120 + hash(n * 17) * 50, plaster: PLASTERS[n % PLASTERS.length], door: x + width * (0.25 + hash(n * 3) * 0.5), cross: hash(n * 23) > 0.55, windows: [] });
    x += width + 6;
    n++;
  }
  return houses;
})();

function paintHouse(context: CanvasRenderingContext2D, house: House, scale: number, ground: number) {
  const S = (u: number) => u * scale;
  const left = S(house.x);
  const right = S(house.x + house.width);
  const top = ground - S(house.height);
  // stone footing and plaster
  context.fillStyle = house.plaster;
  context.fillRect(left, top, right - left, ground - top);
  const shading = context.createLinearGradient(0, top, 0, ground);
  shading.addColorStop(0, 'rgba(30, 20, 30, 0.35)'); shading.addColorStop(0.7, 'rgba(0, 0, 0, 0)'); shading.addColorStop(1, 'rgba(20, 10, 10, 0.25)');
  context.fillStyle = shading;
  context.fillRect(left, top, right - left, ground - top);
  context.fillStyle = '#6a625c';
  context.fillRect(left, ground - S(16), right - left, S(16));
  context.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (let stone = 0; stone < house.width / 12; stone++) context.fillRect(left + S(stone * 12 + (stone % 2) * 3), ground - S(16), S(0.8), S(16));
  context.fillRect(left, ground - S(8.5), right - left, S(0.8));
  // timber frame
  context.strokeStyle = '#3d2718';
  context.lineWidth = S(3.2);
  context.strokeRect(left + S(1.5), top + S(1.5), right - left - S(3), ground - S(16) - top - S(1.5));
  const floors = [house.height * 0.48];
  context.beginPath();
  for (const level of floors) { context.moveTo(left, ground - S(level)); context.lineTo(right, ground - S(level)); }
  const posts = Math.max(2, Math.round(house.width / 42));
  for (let post = 1; post < posts; post++) { const px = left + ((right - left) * post) / posts; context.moveTo(px, top); context.lineTo(px, ground - S(16)); }
  // braces
  for (let post = 0; post < posts; post++) {
    const px = left + ((right - left) * post) / posts;
    const next = left + ((right - left) * (post + 1)) / posts;
    if ((post + Math.floor(house.x)) % 2) { context.moveTo(px, ground - S(floors[0])); context.lineTo(next, top); }
    else { context.moveTo(px, top); context.lineTo(next, ground - S(floors[0])); }
  }
  context.stroke();
  // roof
  const overhang = S(10);
  context.fillStyle = '#4a2c24';
  context.beginPath();
  context.moveTo(left - overhang, top + S(2));
  context.lineTo(left + S(house.width * 0.18), top - S(46));
  context.lineTo(right - S(house.width * 0.18), top - S(46));
  context.lineTo(right + overhang, top + S(2));
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(20, 8, 6, 0.55)';
  context.lineWidth = Math.max(1, S(0.9));
  context.beginPath();
  for (let row = 1; row < 6; row++) {
    const y = top + S(2) - S(46) * (row / 6);
    const inset = S(house.width * 0.18) * (row / 6) + overhang * (1 - row / 6);
    context.moveTo(left - overhang + inset + overhang * 0, y); context.lineTo(right + overhang - inset, y);
  }
  context.stroke();
  context.fillStyle = '#2f1d18';
  context.fillRect(right - S(house.width * 0.3), top - S(62), S(10), S(24));
  // door with optional chalk cross (a marked house)
  const doorWidth = 22;
  const doorLeft = S(house.door - doorWidth / 2);
  context.fillStyle = '#4b2e1c';
  context.beginPath();
  context.moveTo(doorLeft, ground - S(4));
  context.lineTo(doorLeft, ground - S(32));
  context.quadraticCurveTo(doorLeft + S(doorWidth / 2), ground - S(42), doorLeft + S(doorWidth), ground - S(32));
  context.lineTo(doorLeft + S(doorWidth), ground - S(4));
  context.fill();
  context.strokeStyle = '#2a170d'; context.lineWidth = S(1.4); context.stroke();
  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  context.beginPath(); for (let plank = 1; plank < 4; plank++) { context.moveTo(doorLeft + S(plank * 5.5), ground - S(4)); context.lineTo(doorLeft + S(plank * 5.5), ground - S(36)); } context.stroke();
  if (house.cross) {
    context.strokeStyle = 'rgba(200, 40, 40, 0.85)';
    context.lineWidth = S(2.4);
    context.lineCap = 'round';
    const cx = doorLeft + S(doorWidth / 2);
    const cy = ground - S(24);
    context.beginPath(); context.moveTo(cx - S(6), cy - S(6)); context.lineTo(cx + S(6), cy + S(6)); context.moveTo(cx + S(6), cy - S(6)); context.lineTo(cx - S(6), cy + S(6)); context.stroke();
    context.lineCap = 'butt';
  }
  // dark upper windows
  const windowCount = Math.max(1, Math.round(house.width / 60));
  for (let index = 0; index < windowCount; index++) {
    const wx = left + ((right - left) * (index + 0.5)) / windowCount - S(9);
    const wy = top + S(14);
    context.fillStyle = '#17141f';
    context.fillRect(wx, wy, S(18), S(20));
    context.strokeStyle = '#3d2718'; context.lineWidth = S(2); context.strokeRect(wx, wy, S(18), S(20));
    context.beginPath(); context.moveTo(wx + S(9), wy); context.lineTo(wx + S(9), wy + S(20)); context.moveTo(wx, wy + S(10)); context.lineTo(wx + S(18), wy + S(10)); context.stroke();
  }
}

function paintSanctuary(context: CanvasRenderingContext2D, scale: number, ground: number) {
  const S = (u: number) => u * scale;
  const cx = S(DOOR_X);
  const left = cx - S(90);
  const right = cx + S(110);
  const top = ground - S(190);
  const stone = context.createLinearGradient(left, 0, right, 0);
  stone.addColorStop(0, '#77706a'); stone.addColorStop(0.5, '#8d857c'); stone.addColorStop(1, '#6c655f');
  context.fillStyle = stone;
  context.fillRect(left, top, right - left, ground - top);
  context.strokeStyle = 'rgba(30, 25, 25, 0.35)';
  context.lineWidth = Math.max(1, S(0.8));
  context.beginPath();
  for (let row = 0; row < 19; row++) {
    const y = ground - S(row * 10);
    context.moveTo(left, y); context.lineTo(right, y);
    for (let column = 0; column < 10; column++) { const x = left + S(column * 20 + (row % 2) * 10); context.moveTo(x, y); context.lineTo(x, y - S(10)); }
  }
  context.stroke();
  // gable + bell
  context.fillStyle = '#5b544f';
  context.beginPath(); context.moveTo(left - S(8), top); context.lineTo(cx + S(10), top - S(70)); context.lineTo(right + S(8), top); context.fill();
  context.fillStyle = '#1a1620';
  context.beginPath(); context.arc(cx + S(10), top - S(28), S(12), Math.PI, 0); context.lineTo(cx + S(22), top - S(14)); context.lineTo(cx - S(2), top - S(14)); context.fill();
  // arched open doorway (lit from inside by Rust's door light)
  const doorLeft = cx - S(20);
  const doorRight = cx + S(20);
  context.fillStyle = '#ffcf7a';
  context.beginPath();
  context.moveTo(doorLeft, ground); context.lineTo(doorLeft, ground - S(44)); context.arc(cx, ground - S(44), S(20), Math.PI, 0); context.lineTo(doorRight, ground); context.fill();
  const inside = context.createLinearGradient(0, ground - S(64), 0, ground);
  inside.addColorStop(0, 'rgba(255, 240, 200, 0.9)'); inside.addColorStop(1, 'rgba(230, 140, 60, 0.6)');
  context.fillStyle = inside;
  context.fill();
  context.strokeStyle = '#4a4440'; context.lineWidth = S(4); context.stroke();
  // the open door leaf
  context.fillStyle = '#5a361f';
  context.beginPath(); context.moveTo(doorRight, ground); context.lineTo(doorRight + S(12), ground - S(4)); context.lineTo(doorRight + S(12), ground - S(58)); context.lineTo(doorRight, ground - S(62)); context.fill();
  // round window
  context.fillStyle = '#e6a85a';
  context.beginPath(); context.arc(cx, top + S(40), S(14), 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#3b3532'; context.lineWidth = S(3); context.stroke();
  context.beginPath(); context.moveTo(cx - S(14), top + S(40)); context.lineTo(cx + S(14), top + S(40)); context.moveTo(cx, top + S(26)); context.lineTo(cx, top + S(54)); context.stroke();
}

/** Cobbles, gutter and the odd puddle. */
function paintCobbles(context: CanvasRenderingContext2D, u0: number, u1: number, scale: number, ground: number, height: number) {
  const S = (u: number) => u * scale;
  const street = context.createLinearGradient(0, ground, 0, height);
  street.addColorStop(0, '#4d4744'); street.addColorStop(1, '#2c2826');
  context.fillStyle = street;
  context.fillRect(S(u0), ground, S(u1 - u0), height - ground);
  const rows = Math.ceil((height - ground) / S(6)) + 1;
  for (let row = 0; row < rows; row++) {
    const y = ground + S(row * 6) + S(1);
    const size = 9 + row * 1.6;
    for (let u = Math.floor(u0 / size) * size - size; u < u1 + size; u += size) {
      const n = Math.floor(u / size) * 31 + row * 977;
      const offset = (row % 2) * size * 0.5;
      const light = 70 + Math.floor(hash(n) * 26) - row * 3;
      context.fillStyle = `rgb(${light}, ${light - 4}, ${light - 8})`;
      context.beginPath();
      context.ellipse(S(u + offset + size / 2), y + S(2.4), S(size * 0.44), S(2.4 + row * 0.3), 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  context.fillRect(S(u0), ground, S(u1 - u0), S(1.5));
  for (let u = Math.floor(u0 / 260) * 260; u < u1; u += 260) {
    if (hash(u) < 0.5) continue;
    const px = u + hash(u + 1) * 160;
    const puddle = context.createLinearGradient(0, ground + S(8), 0, ground + S(16));
    puddle.addColorStop(0, 'rgba(120, 130, 180, 0.35)'); puddle.addColorStop(1, 'rgba(40, 45, 70, 0.4)');
    context.fillStyle = puddle;
    context.beginPath(); context.ellipse(S(px), ground + S(12), S(26), S(3.2), 0, 0, Math.PI * 2); context.fill();
  }
}

/** Little props that just dress the street (not interactive). */
function paintProps(context: CanvasRenderingContext2D, u0: number, u1: number, scale: number, ground: number) {
  const S = (u: number) => u * scale;
  const props: [number, string][] = [[200, 'barrel'], [215, 'barrel'], [760, 'cart'], [1080, 'sacks'], [1640, 'barrel'], [1960, 'well'], [2230, 'barrel'], [2330, 'sacks'], [2790, 'cart'], [3540, 'barrel'], [3310, 'sacks'], [430, 'sacks']];
  for (const [x, kind] of props) {
    if (x < u0 - 60 || x > u1 + 60) continue;
    if (kind === 'barrel') {
      const body = context.createLinearGradient(S(x - 9), 0, S(x + 9), 0);
      body.addColorStop(0, '#3d2616'); body.addColorStop(0.5, '#7a5132'); body.addColorStop(1, '#3a2414');
      context.fillStyle = body;
      context.beginPath(); context.roundRect(S(x - 9), ground - S(24), S(18), S(24), S(4)); context.fill();
      context.strokeStyle = '#2a2a2e'; context.lineWidth = S(1.6);
      context.beginPath(); context.moveTo(S(x - 9), ground - S(6)); context.lineTo(S(x + 9), ground - S(6)); context.moveTo(S(x - 9), ground - S(18)); context.lineTo(S(x + 9), ground - S(18)); context.stroke();
    } else if (kind === 'sacks') {
      context.fillStyle = '#8a7556';
      for (const [dx, r] of [[-8, 8], [5, 9], [-2, 7]]) { context.beginPath(); context.ellipse(S(x + dx), ground - S(r * 0.8 + (dx === -2 ? 12 : 0)), S(r), S(r * 0.8), 0, 0, Math.PI * 2); context.fill(); }
      context.strokeStyle = 'rgba(40, 30, 20, 0.5)'; context.lineWidth = S(0.8); context.stroke();
    } else if (kind === 'cart') {
      context.fillStyle = '#5a3b24';
      context.fillRect(S(x - 30), ground - S(26), S(56), S(10));
      context.strokeStyle = '#3a2516'; context.lineWidth = S(2);
      context.beginPath(); context.moveTo(S(x + 26), ground - S(22)); context.lineTo(S(x + 52), ground - S(8)); context.stroke();
      for (const wx of [x - 18, x + 12]) {
        context.strokeStyle = '#2e1d10'; context.lineWidth = S(2.4);
        context.beginPath(); context.arc(S(wx), ground - S(10), S(10), 0, Math.PI * 2); context.stroke();
        context.lineWidth = S(1.2);
        context.beginPath(); for (let spoke = 0; spoke < 4; spoke++) { const a = (spoke * Math.PI) / 4; context.moveTo(S(wx) + Math.cos(a) * S(10), ground - S(10) + Math.sin(a) * S(10)); context.lineTo(S(wx) - Math.cos(a) * S(10), ground - S(10) - Math.sin(a) * S(10)); } context.stroke();
      }
      context.fillStyle = '#6b5a3c';
      context.beginPath(); context.ellipse(S(x - 2), ground - S(28), S(26), S(6), 0, Math.PI, 0); context.fill();
    } else if (kind === 'well') {
      context.fillStyle = '#6d6862';
      context.beginPath(); context.roundRect(S(x - 20), ground - S(22), S(40), S(22), S(3)); context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.3)'; context.lineWidth = S(0.8);
      context.beginPath(); context.moveTo(S(x - 20), ground - S(11)); context.lineTo(S(x + 20), ground - S(11)); context.stroke();
      context.strokeStyle = '#3a2516'; context.lineWidth = S(2.5);
      context.beginPath(); context.moveTo(S(x - 16), ground - S(22)); context.lineTo(S(x - 16), ground - S(56)); context.lineTo(S(x + 16), ground - S(56)); context.lineTo(S(x + 16), ground - S(22)); context.stroke();
      context.fillStyle = '#4a2c24';
      context.beginPath(); context.moveTo(S(x - 24), ground - S(54)); context.lineTo(S(x), ground - S(70)); context.lineTo(S(x + 24), ground - S(54)); context.fill();
    }
  }
}

export const paintStreet: Painter = (context, u0, u1, scale, ground, height) => {
  for (const house of HOUSES) {
    if (house.x + house.width < u0 - 20 || house.x > u1 + 20) continue;
    if (house.x + house.width > DOOR_X - 100 && house.x < DOOR_X + 120) continue;
    paintHouse(context, house, scale, ground);
  }
  paintSanctuary(context, scale, ground);
  paintCobbles(context, u0, u1, scale, ground, height);
  paintProps(context, u0, u1, scale, ground);
};

// ---------------------------------------------------------------- dynamic props
/** A living flame: layered teardrops that lick and sway. `size` in px. */
export function drawFlame(context: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed: number, strength = 1) {
  if (strength <= 0.02) return;
  const sway = Math.sin(time * 7 + seed) * 0.18 + Math.sin(time * 13 + seed * 2) * 0.08;
  const layers: [string, number][] = [['rgba(255, 90, 20, 0.85)', 1], ['rgba(255, 160, 40, 0.95)', 0.72], ['rgba(255, 230, 140, 1)', 0.42]];
  for (const [colour, part] of layers) {
    const height = size * part * strength * (1 + 0.12 * Math.sin(time * 11 + seed * 3 + part));
    const width = size * 0.42 * part * strength;
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(x - width, y);
    context.quadraticCurveTo(x - width * 1.1, y - height * 0.5, x + sway * size, y - height);
    context.quadraticCurveTo(x + width * 1.1, y - height * 0.5, x + width, y);
    context.quadraticCurveTo(x, y + width * 0.6, x - width, y);
    context.fill();
  }
}

export function drawTorch(context: CanvasRenderingContext2D, view: View, light: { x: number; height: number }, intensity: number, time: number, seed: number) {
  const x = toScreenX(view, light.x);
  const y = toScreenY(view, light.height);
  const s = view.scale;
  // wall bracket + handle
  context.strokeStyle = '#2b2b30'; context.lineWidth = 2.2 * s;
  context.beginPath(); context.moveTo(x - 7 * s, y + 18 * s); context.lineTo(x, y + 12 * s); context.lineTo(x, y + 4 * s); context.stroke();
  context.fillStyle = '#5a3b22';
  context.beginPath(); context.moveTo(x - 2 * s, y + 16 * s); context.lineTo(x + 2 * s, y + 16 * s); context.lineTo(x + 3 * s, y); context.lineTo(x - 3 * s, y); context.fill();
  context.fillStyle = '#2a1a10';
  context.beginPath(); context.ellipse(x, y, 4 * s, 2 * s, 0, 0, Math.PI * 2); context.fill();
  drawFlame(context, x, y, 15 * s, time, seed, intensity);
  if (intensity < 0.3) { context.fillStyle = `rgba(255, 90, 30, ${0.6 - intensity})`; context.beginPath(); context.arc(x, y - 1 * s, 1.6 * s, 0, Math.PI * 2); context.fill(); }
}

export function drawBrazier(context: CanvasRenderingContext2D, view: View, light: { x: number; height: number; lit: boolean }, intensity: number, time: number, seed: number, big = false) {
  const x = toScreenX(view, light.x);
  const top = toScreenY(view, light.height);
  const ground = view.ground;
  const s = view.scale;
  const w = (big ? 15 : 12) * s;
  context.strokeStyle = '#26262b'; context.lineWidth = 2.4 * s;
  context.beginPath(); context.moveTo(x - w * 0.6, ground); context.lineTo(x, top + 8 * s); context.lineTo(x + w * 0.6, ground); context.moveTo(x, ground); context.lineTo(x, top + 8 * s); context.stroke();
  const bowl = context.createLinearGradient(x - w, 0, x + w, 0);
  bowl.addColorStop(0, '#2a2a30'); bowl.addColorStop(0.5, '#55555f'); bowl.addColorStop(1, '#25252a');
  context.fillStyle = bowl;
  context.beginPath(); context.moveTo(x - w, top); context.quadraticCurveTo(x, top + 14 * s, x + w, top); context.closePath(); context.fill();
  context.fillStyle = light.lit ? '#ff7a2a' : '#2b2420';
  context.beginPath(); context.ellipse(x, top, w * 0.9, 2.6 * s, 0, 0, Math.PI * 2); context.fill();
  if (light.lit) drawFlame(context, x, top + 1 * s, (big ? 30 : 24) * s, time, seed, intensity);
  else {
    // cold coals with one faint spark
    context.fillStyle = 'rgba(255, 120, 60, 0.35)';
    context.beginPath(); context.arc(x + Math.sin(time * 2 + seed) * 3 * s, top - 1 * s, 1.2 * s, 0, Math.PI * 2); context.fill();
  }
}

export function drawFirePot(context: CanvasRenderingContext2D, view: View, light: { x: number; lit: boolean }, intensity: number, time: number, secondsLeft: number) {
  const x = toScreenX(view, light.x);
  const ground = view.ground;
  const s = view.scale;
  const pot = context.createLinearGradient(x - 9 * s, 0, x + 9 * s, 0);
  pot.addColorStop(0, '#5b2f1c'); pot.addColorStop(0.5, '#9a5a35'); pot.addColorStop(1, '#4a2616');
  context.fillStyle = pot;
  context.beginPath(); context.moveTo(x - 10 * s, ground - 16 * s); context.quadraticCurveTo(x - 11 * s, ground, x, ground); context.quadraticCurveTo(x + 11 * s, ground, x + 10 * s, ground - 16 * s); context.closePath(); context.fill();
  context.fillStyle = '#2b1810';
  context.beginPath(); context.ellipse(x, ground - 16 * s, 10 * s, 2.4 * s, 0, 0, Math.PI * 2); context.fill();
  if (light.lit) {
    drawFlame(context, x, ground - 16 * s, 20 * s, time, 99, intensity);
    // a ring that empties as the pitch burns away
    context.strokeStyle = 'rgba(255, 200, 120, 0.85)'; context.lineWidth = 2 * s;
    context.beginPath(); context.arc(x, ground - 44 * s, 5 * s, -Math.PI / 2, -Math.PI / 2 + (secondsLeft / 8) * Math.PI * 2); context.stroke();
  }
}

export function drawLantern(context: CanvasRenderingContext2D, x: number, y: number, s: number, lit: boolean, intensity: number, time: number) {
  context.strokeStyle = '#2d2d33'; context.lineWidth = 1.4 * s;
  context.beginPath(); context.arc(x, y - 9 * s, 3 * s, Math.PI, 0); context.stroke();
  context.fillStyle = '#3a3a42';
  context.beginPath(); context.moveTo(x - 5 * s, y - 7 * s); context.lineTo(x + 5 * s, y - 7 * s); context.lineTo(x + 3 * s, y - 9 * s); context.lineTo(x - 3 * s, y - 9 * s); context.fill();
  const glass = context.createRadialGradient(x, y - 2 * s, 0.5 * s, x, y - 2 * s, 6 * s);
  if (lit) { glass.addColorStop(0, `rgba(255, 245, 200, ${0.9 * intensity + 0.1})`); glass.addColorStop(1, `rgba(255, 150, 50, ${0.75 * intensity})`); }
  else { glass.addColorStop(0, 'rgba(90, 90, 100, 0.6)'); glass.addColorStop(1, 'rgba(50, 50, 60, 0.7)'); }
  context.fillStyle = glass;
  context.fillRect(x - 4 * s, y - 7 * s, 8 * s, 10 * s);
  context.strokeStyle = '#2d2d33'; context.lineWidth = 1.2 * s;
  context.strokeRect(x - 4 * s, y - 7 * s, 8 * s, 10 * s);
  context.beginPath(); context.moveTo(x, y - 7 * s); context.lineTo(x, y + 3 * s); context.stroke();
  context.fillStyle = '#3a3a42'; context.fillRect(x - 5 * s, y + 3 * s, 10 * s, 2 * s);
  if (lit) drawFlame(context, x, y + 1 * s, 5 * s, time * 1.3, 7, intensity);
}

export function drawCrate(context: CanvasRenderingContext2D, view: View, x: number) {
  const s = view.scale;
  const left = toScreenX(view, x - 15);
  const top = view.ground - 30 * s;
  const wood = context.createLinearGradient(left, top, left + 30 * s, view.ground);
  wood.addColorStop(0, '#8a6038'); wood.addColorStop(1, '#5a3a20');
  context.fillStyle = wood;
  context.fillRect(left, top, 30 * s, 30 * s);
  context.strokeStyle = '#3a2412'; context.lineWidth = 2.2 * s;
  context.strokeRect(left + 1 * s, top + 1 * s, 28 * s, 28 * s);
  context.beginPath(); context.moveTo(left + 2 * s, top + 2 * s); context.lineTo(left + 28 * s, top + 28 * s); context.moveTo(left + 28 * s, top + 2 * s); context.lineTo(left + 2 * s, top + 28 * s); context.stroke();
  context.fillStyle = 'rgba(255, 220, 160, 0.12)';
  context.fillRect(left + 2 * s, top + 2 * s, 26 * s, 4 * s);
}

/** The kerb across the yard: a rounded stone hump with painted hazard chevrons. `lit` (0..1) is how much light
 * reaches it; drawn after the darkness pass, it keeps a faint moonlit edge so it reads even in the dark. */
export function drawCurb(context: CanvasRenderingContext2D, view: View, curb: { x: number; half: number; height: number }, lit: number) {
  const s = view.scale;
  const left = toScreenX(view, curb.x - curb.half);
  const width = curb.half * 2 * s;
  const ground = view.ground;
  const top = ground - curb.height * s;
  const hump = () => {
    context.beginPath();
    context.moveTo(left - 1.5 * s, ground);
    context.quadraticCurveTo(left - 0.5 * s, top, left + width / 2, top);
    context.quadraticCurveTo(left + width + 0.5 * s, top, left + width + 1.5 * s, ground);
    context.closePath();
  };
  context.save();
  const stone = context.createLinearGradient(0, top, 0, ground);
  stone.addColorStop(0, '#8d8a84'); stone.addColorStop(1, '#4f4c48');
  context.fillStyle = stone; hump(); context.fill();
  context.clip();
  // painted chevron bands (ochre and soot), slanted like road paint on a speed breaker
  context.fillStyle = '#d9a23a';
  for (let band = -1; band < 4; band++) {
    const bx = left + band * 3.4 * s;
    context.beginPath(); context.moveTo(bx, ground); context.lineTo(bx + 1.7 * s, ground); context.lineTo(bx + 3.9 * s, top); context.lineTo(bx + 2.2 * s, top); context.fill();
  }
  context.restore();
  context.strokeStyle = '#2c2a28'; context.lineWidth = 1 * s; hump(); context.stroke();
  // darkness over it where no flame reaches, leaving a cool moonlit rim so it stays readable
  context.save();
  context.fillStyle = `rgba(6, 6, 16, ${0.8 * (1 - lit)})`; hump(); context.fill();
  context.strokeStyle = `rgba(190, 205, 235, ${0.35 + 0.25 * (1 - lit)})`; context.lineWidth = 0.9 * s;
  context.beginPath(); context.moveTo(left - 0.5 * s, ground - 2 * s); context.quadraticCurveTo(left + width / 2, top - 1.6 * s, left + width + 0.5 * s, ground - 2 * s); context.stroke();
  context.restore();
}

/** A thrown ember, drawn AFTER the darkness pass with additive light so it blazes in the dark: a wide warm halo, a
 * glowing comet tail (screen points, oldest first), the flame and a white-hot core. */
export function drawThrownEmber(context: CanvasRenderingContext2D, x: number, y: number, s: number, time: number, trail: [number, number][]) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  const pulse = 0.85 + 0.15 * Math.sin(time * 37);
  const halo = context.createRadialGradient(x, y, 0, x, y, 42 * s);
  halo.addColorStop(0, `rgba(255, 190, 90, ${0.55 * pulse})`); halo.addColorStop(0.35, `rgba(255, 110, 30, ${0.22 * pulse})`); halo.addColorStop(1, 'rgba(255, 60, 10, 0)');
  context.fillStyle = halo; context.fillRect(x - 42 * s, y - 42 * s, 84 * s, 84 * s);
  trail.forEach(([tx, ty], index) => {
    const f = (index + 1) / trail.length;
    const r = (1.2 + f * 3.2) * s;
    const glow = context.createRadialGradient(tx, ty, 0, tx, ty, r * 2.6);
    glow.addColorStop(0, `rgba(255, ${170 + Math.floor(70 * f)}, ${70 + Math.floor(80 * f)}, ${0.9 * f})`); glow.addColorStop(1, 'rgba(255, 80, 20, 0)');
    context.fillStyle = glow; context.fillRect(tx - r * 2.6, ty - r * 2.6, r * 5.2, r * 5.2);
  });
  context.restore();
  drawFlame(context, x, y + 3 * s, 11 * s, time * 2, 5, 1);
  context.save();
  context.globalCompositeOperation = 'lighter';
  drawFlame(context, x, y + 3 * s, 11 * s, time * 2 + 0.3, 7, 0.8);
  const core = context.createRadialGradient(x, y, 0, x, y, 4.5 * s);
  core.addColorStop(0, 'rgba(255, 255, 235, 1)'); core.addColorStop(0.5, 'rgba(255, 220, 120, 0.85)'); core.addColorStop(1, 'rgba(255, 140, 40, 0)');
  context.fillStyle = core; context.beginPath(); context.arc(x, y, 4.5 * s, 0, Math.PI * 2); context.fill();
  context.restore();
}

/** An ember's impact: a flash and a widening ring of fire, `t` from 0 to 1 over its life; `strength` 1 for a flame
 * catching, less for a fizzle. */
export function drawEmberFlash(context: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, strength: number) {
  if (t >= 1) return;
  context.save();
  context.globalCompositeOperation = 'lighter';
  const fade = (1 - t) * (1 - t) * strength;
  const radius = (18 + 70 * Math.sqrt(t)) * s * (0.5 + 0.5 * strength);
  const flash = context.createRadialGradient(x, y, 0, x, y, radius);
  flash.addColorStop(0, `rgba(255, 250, 220, ${0.95 * fade})`); flash.addColorStop(0.25, `rgba(255, 190, 80, ${0.6 * fade})`); flash.addColorStop(1, 'rgba(255, 70, 10, 0)');
  context.fillStyle = flash; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  context.strokeStyle = `rgba(255, 170, 60, ${0.8 * fade})`; context.lineWidth = (3 - 2 * t) * s;
  context.beginPath(); context.arc(x, y, radius * 0.55, 0, Math.PI * 2); context.stroke();
  context.restore();
}

export function drawLever(context: CanvasRenderingContext2D, view: View, x: number, pulled: boolean, pulledAt: number, time: number) {
  const s = view.scale;
  const px = toScreenX(view, x);
  const base = view.ground - 30 * s;
  context.fillStyle = '#3a3a40';
  context.fillRect(px - 6 * s, base - 4 * s, 12 * s, 10 * s);
  const t = Math.min(1, (time - pulledAt) / 0.25);
  const angle = pulled ? -0.7 + 1.4 * t : 0.7 - 1.4 * t;
  context.strokeStyle = '#5a3b22'; context.lineWidth = 2.6 * s; context.lineCap = 'round';
  context.beginPath(); context.moveTo(px, base); context.lineTo(px + Math.sin(angle) * 16 * s, base - Math.cos(angle) * 16 * s); context.stroke();
  context.lineCap = 'butt';
  context.fillStyle = '#b02020';
  context.beginPath(); context.arc(px + Math.sin(angle) * 16 * s, base - Math.cos(angle) * 16 * s, 3 * s, 0, Math.PI * 2); context.fill();
  // rope up to the shutters
  context.strokeStyle = 'rgba(160, 130, 90, 0.7)'; context.lineWidth = 1 * s;
  context.beginPath(); context.moveTo(px, base - 4 * s); context.lineTo(px, base - 70 * s); context.stroke();
}

/** A ground-floor window with shutters that swing open (warm room light behind). `open` 0…1. */
export function drawWindow(context: CanvasRenderingContext2D, view: View, x: number, height: number, open: number, time: number) {
  const s = view.scale;
  const cx = toScreenX(view, x);
  const cy = toScreenY(view, height);
  const w = 26 * s;
  const h = 24 * s;
  const room = context.createRadialGradient(cx, cy, 2 * s, cx, cy, 22 * s);
  room.addColorStop(0, `rgba(255, 220, 140, ${0.25 + 0.75 * open})`); room.addColorStop(1, `rgba(200, 110, 50, ${0.15 + 0.7 * open})`);
  context.fillStyle = open > 0.05 ? room : '#120f18';
  context.fillRect(cx - w / 2, cy - h / 2, w, h);
  if (open > 0.05) {
    // a candle on the sill
    context.fillStyle = '#efe6d0'; context.fillRect(cx - 1.5 * s, cy + 4 * s, 3 * s, 7 * s);
    drawFlame(context, cx, cy + 4 * s, 5 * s, time, 3, open);
  }
  context.strokeStyle = '#3d2718'; context.lineWidth = 2.4 * s;
  context.strokeRect(cx - w / 2, cy - h / 2, w, h);
  // shutters: closed they cover the glass; open they fold back against the wall
  context.fillStyle = '#5b3a22';
  context.strokeStyle = '#2e1c0f'; context.lineWidth = 1 * s;
  for (const side of [-1, 1]) {
    const hinge = cx + (side * w) / 2;
    const inward = (1 - open) * (w / 2);
    const outward = open * w * 0.36;
    const a = hinge - side * inward;
    const b = hinge + side * outward;
    const left = Math.min(a, b);
    const width = Math.max(2 * s, Math.abs(b - a));
    context.fillRect(left, cy - h / 2 - 1 * s, width, h + 2 * s);
    context.strokeRect(left, cy - h / 2 - 1 * s, width, h + 2 * s);
    context.beginPath(); context.moveTo(left, cy - h / 6); context.lineTo(left + width, cy - h / 6); context.moveTo(left, cy + h / 6); context.lineTo(left + width, cy + h / 6); context.stroke();
  }
  context.fillStyle = '#3d2718'; context.fillRect(cx - w / 2 - 3 * s, cy + h / 2, w + 6 * s, 3 * s);
}

/** The stone staircase before the guttering torch: a flight of steps up, a flat landing, a flight down. Each tread
 * has a lit nosing and a shadowed riser so it reads as steps to walk up, not a block to push. */
export function drawStairs(context: CanvasRenderingContext2D, view: View, stairs: { x: number; half: number; height: number; steps: number; landing: number }) {
  const s = view.scale;
  const ground = view.ground;
  const tread = (stairs.half - stairs.landing) / stairs.steps;
  const rise = stairs.height / stairs.steps;
  const sx = (x: number) => toScreenX(view, x);
  const sy = (y: number) => ground - y * s;
  // contact shadow on the cobbles
  context.fillStyle = 'rgba(0, 0, 0, 0.4)';
  context.beginPath(); context.ellipse(sx(stairs.x), ground + 1 * s, stairs.half * s * 1.05, 3 * s, 0, 0, Math.PI * 2); context.fill();
  // the silhouette: up the left flight, across the landing, down the right flight
  const outline: [number, number][] = [[stairs.x - stairs.half, 0]];
  for (let step = 1; step <= stairs.steps; step++) {
    const x = stairs.x - stairs.half + (step - 1) * tread;
    outline.push([x, step * rise], [x + tread, step * rise]);
  }
  for (let step = stairs.steps; step >= 1; step--) {
    const x = stairs.x + stairs.landing + (stairs.steps - step) * tread;
    outline.push([x, step * rise], [x + tread, step * rise]);
  }
  outline.push([stairs.x + stairs.half, 0]);
  const face = context.createLinearGradient(0, sy(stairs.height), 0, ground);
  face.addColorStop(0, '#9c8a72'); face.addColorStop(1, '#5a4b3f');
  context.fillStyle = face;
  context.strokeStyle = '#231a14';
  context.lineWidth = 1.6 * s;
  context.beginPath();
  outline.forEach(([x, y], index) => (index ? context.lineTo(sx(x), sy(y)) : context.moveTo(sx(x), sy(y))));
  context.closePath(); context.fill(); context.stroke();
  // mortar: a course line at every step height, staggered joints
  context.strokeStyle = 'rgba(40, 34, 32, 0.7)';
  context.lineWidth = 1 * s;
  context.beginPath();
  for (let step = 1; step < stairs.steps; step++) {
    const inset = stairs.half - step * tread;
    context.moveTo(sx(stairs.x - inset), sy(step * rise)); context.lineTo(sx(stairs.x + inset), sy(step * rise));
  }
  for (let step = 0; step < stairs.steps; step++) {
    const inset = stairs.half - step * tread;
    const y0 = sy(step * rise); const y1 = sy((step + 1) * rise);
    const joints = step % 2 ? [-0.25, 0.25] : [-0.5, 0, 0.5];
    for (const joint of joints) { const jx = sx(stairs.x + joint * inset); context.moveTo(jx, y0); context.lineTo(jx, y1); }
  }
  context.stroke();
  // each tread: a bright worn nosing on top and a dark riser below it, so the steps read at a glance
  for (let step = 1; step <= stairs.steps; step++) {
    const y = sy(step * rise);
    for (const side of [-1, 1]) {
      const outer = stairs.x + side * (stairs.half - (step - 1) * tread);
      const inner = step === stairs.steps ? stairs.x + side * stairs.landing : stairs.x + side * (stairs.half - step * tread);
      const [from, to] = side < 0 ? [outer, inner] : [inner, outer];
      context.fillStyle = 'rgba(255, 238, 210, 0.28)';
      context.fillRect(sx(from), y, (to - from) * s, 1.6 * s);
      context.fillStyle = 'rgba(0, 0, 0, 0.22)';
      context.fillRect(sx(from), y + 1.6 * s, (to - from) * s, Math.min(rise * 0.45, 3) * s);
    }
  }
  // the landing: a broad worn slab with a little moss in the corners
  context.fillStyle = 'rgba(255, 238, 210, 0.3)';
  context.fillRect(sx(stairs.x - stairs.landing), sy(stairs.height), stairs.landing * 2 * s, 1.8 * s);
  context.fillStyle = '#4f6b3a';
  for (const side of [-1, 1]) {
    const cx = sx(stairs.x + side * (stairs.landing - 1.5));
    context.beginPath(); context.ellipse(cx, sy(stairs.height) + 0.6 * s, 2.4 * s, 1.2 * s, 0, Math.PI, 0); context.fill();
  }
}
