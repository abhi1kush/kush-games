/**
 * Ghat Climb backdrop: mountain ranges at dusk under a rose sky. Six ridges, far to near: each one is a flat
 * silhouette with a crisp crest whose foot dissolves into the blue-grey haze lying in the valley in front of it.
 * Far ridges are pale lavender and close to the sky; near ones are dark slate with a fuzzy line of trees along
 * the crest. Painted once per canvas size and copied each frame. Only the scrub in front of the road moves.
 */

export interface View { scale: number; camX: number; camY: number; width: number; height: number }

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function valueNoise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 101.3);
  const b = hash(i + 1 + seed * 101.3);
  return a + (b - a) * f * f * (3 - 2 * f);
}

function fbm(x: number, seed: number, octaves = 4) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise(x * freq, seed + octave * 7) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / norm;
}

/** Ridged noise, about 0 to 1: sharp crests, rounded valleys. */
function ridged(x: number, seed: number, octaves = 5) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total += (1 - Math.abs(valueNoise(x * freq, seed + octave * 13) * 2 - 1)) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return total;
}

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, alpha = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;

// dusk: a rose sky over slate-blue ranges, with blue-grey haze in the valleys
const SKY_TOP = rgb('#a9a3bb');
const SKY_ROSE = rgb('#d9a8ab');
const SKY_LOW = rgb('#c9a6b6');
const FARTHEST = rgb('#9ea4c4');
const NEAREST = rgb('#2c3d5c');
const FAR_MIST = rgb('#b9a9c0');
const NEAR_MIST = rgb('#7c8cab');
const mistAt = (t: number) => mix(FAR_MIST, NEAR_MIST, t);

const RIDGES = 6;

type Paint = CanvasRenderingContext2D;

function paintSky(ctx: Paint, width: number, height: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55);
  sky.addColorStop(0, css(SKY_TOP));
  sky.addColorStop(0.6, css(SKY_ROSE));
  sky.addColorStop(1, css(SKY_LOW));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // thin bands of high haze
  ctx.save();
  ctx.filter = `blur(${Math.max(2, height / 90)}px)`;
  for (let band = 0; band < 3; band++) {
    const y = height * (0.16 + band * 0.08 + hash(band) * 0.03);
    ctx.fillStyle = `rgba(236, 196, 196, ${0.18 + hash(band + 3) * 0.1})`;
    ctx.fillRect(-20, y, width + 40, height * (0.012 + hash(band + 7) * 0.01));
  }
  ctx.restore();
}

/** Foot of ridge t (0 far, 1 near), as a share of the view height. */
const ridgeBase = (t: number) => 0.34 + t * 0.4;

/** One ridge: its crest line, in screen y per screen x. */
function ridgeLine(index: number, width: number, height: number) {
  const t = index / (RIDGES - 1);
  const unit = height / 180;
  const base = height * ridgeBase(t);
  const rise = height * (0.12 + t * 0.1);
  const seed = 11 + index * 7.3;
  const freq = (0.007 + t * 0.003) / unit;
  // far ranges are jagged peaks; nearer ones round off into wooded hills
  const jagged = (1 - t) * 0.6;
  return (x: number) => {
    const sharp = ridged(x * freq, seed, 5);
    const round = fbm(x * freq * 0.8, seed + 3, 4);
    const shape = sharp * jagged + round * (1 - jagged) * 1.15;
    return base - shape * rise;
  };
}

function paintRidge(ctx: Paint, width: number, height: number, index: number) {
  const t = index / (RIDGES - 1);
  const unit = height / 180;
  const top = ridgeLine(index, width, height);
  // aerial perspective: colour runs from near the sky to deep blue, faster at the near end
  const colour = mix(FARTHEST, NEAREST, Math.pow(t, 1.35));
  const trees = t > 0.45;
  const step = 1;
  const crest: number[] = [];
  for (let x = -2; x <= width + 2; x += step) {
    let y = top(x);
    if (trees) {
      // a fuzzy line of treetops along the crest
      const size = unit * (0.4 + t * 0.9);
      y -= (valueNoise(x / (size * 1.6), index * 5.1) * 0.9 + (hash(Math.round(x / size) + index) > 0.7 ? 0.6 : 0)) * size;
    }
    crest.push(y);
  }
  const highest = Math.min(...crest);
  const foot = height * ridgeBase(t) + height * 0.12;

  ctx.beginPath();
  ctx.moveTo(-2, height + 2);
  crest.forEach((y, i) => ctx.lineTo(-2 + i * step, y));
  ctx.lineTo(width + 2, height + 2);
  ctx.closePath();
  // crisp colour at the crest, melting into the mist toward the foot
  const fill = ctx.createLinearGradient(0, highest, 0, foot);
  fill.addColorStop(0, css(colour));
  fill.addColorStop(0.55, css(mix(colour, mistAt(t), 0.2 + (1 - t) * 0.2)));
  fill.addColorStop(1, css(mix(colour, mistAt(t), 0.5 + (1 - t) * 0.25)));
  ctx.fillStyle = fill;
  ctx.fill();


  // the mist that lies in the valley in front of this ridge
  const mistTop = height * ridgeBase(t) - height * 0.05;
  const mistBottom = mistTop + height * 0.11;
  const mist = ctx.createLinearGradient(0, mistTop, 0, mistBottom);
  const haze = mistAt(t);
  mist.addColorStop(0, css(haze, 0));
  mist.addColorStop(0.7, css(haze, 0.55 - t * 0.25));
  mist.addColorStop(1, css(haze, 0.7 - t * 0.3));
  ctx.fillStyle = mist;
  ctx.fillRect(0, mistTop, width, height - mistTop);
}

/** Fine grain over the whole picture, like film, so the smooth fills don't band. */
function grain(ctx: Paint, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let seed = 1234567;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const amount = (((seed >> 16) & 255) / 255 - 0.5) * 6;
    data[i] += amount;
    data[i + 1] += amount;
    data[i + 2] += amount;
  }
  ctx.putImageData(image, 0, 0);
}

function paintMountains(ctx: Paint, width: number, height: number) {
  paintSky(ctx, width, height);
  for (let index = 0; index < RIDGES; index++) paintRidge(ctx, width, height, index);
}

let cache: { canvas: HTMLCanvasElement; key: string } | null = null;

/** The mountains, painted once for this size and reused every frame. */
export function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number, ratio: number) {
  const key = `${Math.round(width)}x${Math.round(height)}@${ratio}`;
  if (!cache || cache.key !== key) {
    const canvas = cache?.canvas ?? document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const paint = canvas.getContext('2d', { willReadFrequently: true });
    if (!paint) return;
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintMountains(paint, width, height);
    paint.setTransform(1, 0, 0, 1, 0, 0);
    grain(paint, canvas.width, canvas.height);
    cache = { canvas, key };
  }
  context.drawImage(cache.canvas, 0, 0, width, height);
}

/** Dark scrub that passes in front of the road, faster than it, at the bottom of the view. */
export function drawForeground(context: CanvasRenderingContext2D, view: View) {
  const { width, height, scale } = view;
  const shift = view.camX * 1.35;
  const baseline = height * 1.02;
  const top = (u: number) => baseline - fbm(u * 0.06, 5, 3) * height * 0.06 - Math.max(0, Math.sin(u * 0.021 + 1.2)) * height * 0.06;
  const step = 5;
  context.beginPath();
  context.moveTo(-step, height + 2);
  for (let px = -step; px <= width + step; px += step) context.lineTo(px, top(px / scale + shift));
  context.lineTo(width + step, height + 2);
  context.closePath();
  context.fillStyle = 'rgba(66, 46, 26, 0.9)';
  context.fill();

  // twigs on top of the scrub
  context.strokeStyle = 'rgba(58, 48, 24, 0.9)';
  context.lineWidth = 1.2;
  context.beginPath();
  const spacing = 3;
  for (let u = Math.floor(shift / spacing) * spacing; u < shift + width / scale; u += spacing) {
    if (hash(u) < 0.6) continue;
    const px = (u - shift) * scale;
    const y = top(u);
    const twig = (3 + hash(u + 3) * 6) * scale;
    const lean = (hash(u + 5) - 0.5) * twig * 0.8;
    context.moveTo(px, y + 2);
    context.lineTo(px + lean, y - twig);
  }
  context.stroke();
}
