/**
 * The 3D view: a perspective projection of the wasm render buffer onto a 2D canvas. Every position in the buffer is
 * already relative to the camera (behind and above the sled), so a point (x, y, z) lands on screen at
 * (centre + x·focal/z, horizon − y·focal/z). The snowy road is drawn far to near as segment strips (snowfield, snowbanks
 * edges, packed trail), with the scenery and obstacles of each strip drawn right after it, so hills hide what is
 * behind them. The sled and its rider are a small 3D model projected the same way, rolled into each turn.
 */
import { type Backdrop, createBackdrop, FOG_LEVELS, fogRamp, PALETTE, type RGB, type Sprites, SPRITE_PIXELS_PER_METRE } from './art';
import {
  CRASH_SECONDS, DRAW_SEGMENTS, ENTITY_DRAW_SIZE, EntityKind, MAX_ENTITIES, Motion, Phase, RAMP_HALF_WIDTH, RAMP_HEIGHT, RenderSlot, SEGMENT_LENGTH,
  TRAIL_HALF_WIDTH, VIEW_DISTANCE,
} from './engine';

const BANK_INNER = TRAIL_HALF_WIDTH;
const BANK_RIDGE = TRAIL_HALF_WIDTH + 1.2;
const BANK_OUTER = TRAIL_HALF_WIDTH + 2.6;
const BANK_HEIGHT = 0.5;
const TYRE_TRACKS = [-0.52, 0.52] as const;
const TYRE_HALF_WIDTH = 0.1;
const LANE_EDGE = 2.6;
const LANE_MARK_HALF_WIDTH = 0.045;
const GROOVE_DISTANCE = 160;
const SPRAY_CAPACITY = 140;
const FLAKE_COUNT = 90;

interface FogRamps { field: string[][]; trail: string[][]; groove: string[]; laneMark: string[]; bankTop: string[]; bankLit: string[]; bankShade: string[] }

export interface Scene {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  horizonY: number;
  focal: number;
  backdrop: Backdrop;
  sprites: Sprites;
  fog: FogRamps;
  /** fog level per segment boundary (by its index in the buffer) */
  boundaryFog: Uint8Array;
  /** projected screen x / y of each boundary's centre line, and pixels per metre there */
  boundaryScreenX: Float32Array;
  boundaryScreenY: Float32Array;
  boundaryScale: Float32Array;
  /** per strip: the first entity in it, and the next entity in the same strip (linked lists, no allocation) */
  stripFirstEntity: Int16Array;
  nextEntityInStrip: Int16Array;
  spray: Float32Array; // x, y, vx, vy, age, life, size per particle
  sprayCount: number;
  sprayDebt: number;
  flakes: Float32Array; // x (0..1), y (0..1), depth, phase per flake
  lastPhase: number;
  shake: number;
  /** screen x range (pixels) covered by the sled and rider in the last frame drawn */
  sledLeft: number;
  sledRight: number;
}

const SPRAY_STRIDE = 7;

/** The view for a canvas size: horizon line, focal length (pixels per metre at 1 m), and half the width ÷ the focal
 *  length, which the wasm camera uses to keep the sled inside the screen. */
export function viewGeometry(width: number, height: number) {
  const isPortrait = height > width * 1.05;
  // upright phones look down a narrower, closer view so the sled sits low on the screen like it does on a computer
  const horizonY = Math.round(height * (isPortrait ? 0.36 : 0.35));
  const focal = isPortrait ? Math.min(width * 1.5, height * 0.95) : Math.min(width * 0.9, height * 1.05);
  return { horizonY, focal, viewHalfWidth: width / 2 / focal };
}

export function createScene(context: CanvasRenderingContext2D, width: number, height: number, sprites: Sprites): Scene {
  const { horizonY, focal } = viewGeometry(width, height);
  const flakes = new Float32Array(FLAKE_COUNT * 4);
  let seed = 99;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let flake = 0; flake < FLAKE_COUNT; flake++) {
    flakes[flake * 4] = random(); flakes[flake * 4 + 1] = random(); flakes[flake * 4 + 2] = 0.3 + random() * 0.7; flakes[flake * 4 + 3] = random() * Math.PI * 2;
  }
  const boundaryFog = new Uint8Array(DRAW_SEGMENTS);
  return {
    context, width, height, horizonY, focal, sprites,
    backdrop: createBackdrop(width, height, horizonY),
    fog: {
      field: PALETTE.snowField.map(color => fogRamp(color as RGB)),
      trail: PALETTE.trail.map(color => fogRamp(color as RGB)),
      groove: fogRamp(PALETTE.groove),
      laneMark: fogRamp(PALETTE.laneMark),
      bankTop: fogRamp(PALETTE.bankTop),
      bankLit: fogRamp([238, 243, 250]),
      bankShade: fogRamp(PALETTE.bankFace),
    },
    boundaryFog,
    boundaryScreenX: new Float32Array(DRAW_SEGMENTS),
    boundaryScreenY: new Float32Array(DRAW_SEGMENTS),
    boundaryScale: new Float32Array(DRAW_SEGMENTS),
    stripFirstEntity: new Int16Array(DRAW_SEGMENTS + 1),
    nextEntityInStrip: new Int16Array(MAX_ENTITIES),
    spray: new Float32Array(SPRAY_CAPACITY * SPRAY_STRIDE),
    sprayCount: 0,
    sprayDebt: 0,
    flakes,
    lastPhase: -1,
    shake: 0,
    sledLeft: 0,
    sledRight: 0,
  };
}

/** 0 … FOG_LEVELS-1 for a distance ahead of the camera. */
function fogLevel(distance: number): number {
  const amount = Math.min(1, Math.max(0, (distance - 25) / (VIEW_DISTANCE - 40)));
  return Math.min(FOG_LEVELS - 1, Math.round(Math.pow(amount, 0.7) * (FOG_LEVELS - 1)));
}

/** Stable pseudo-random 0..1 for a segment index and a salt (so scenery stays put as the sled passes). */
function scenery(segment: number, salt: number): number {
  let value = (segment * 374761393 + salt * 668265263) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function quad(context: CanvasRenderingContext2D, color: string, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x1, y1); context.lineTo(x2, y2); context.lineTo(x3, y3); context.lineTo(x4, y4);
  context.closePath();
  context.fill();
}

// ---------------------------------------------------------------- the trail strips

/** Fill one strip between boundary `near` and the boundary beyond it (screen coordinates given). */
function drawStrip(scene: Scene, nearX: number, nearY: number, nearScale: number, farX: number, farY: number, farScale: number, fog: number, band: number, grooves: boolean) {
  const { context, width } = scene;
  // the open snowfield, edge to edge
  context.fillStyle = scene.fog.field[band & 1][fog];
  context.fillRect(0, farY, width, nearY - farY + 0.8);
  // banked snow edges (a raised berm on each side)
  const ridgeFar = BANK_HEIGHT * farScale, ridgeNear = BANK_HEIGHT * nearScale;
  for (const side of [-1, 1]) {
    const outerFar = farX + side * BANK_OUTER * farScale, outerNear = nearX + side * BANK_OUTER * nearScale;
    const ridgeFarX = farX + side * BANK_RIDGE * farScale, ridgeNearX = nearX + side * BANK_RIDGE * nearScale;
    const innerFar = farX + side * BANK_INNER * farScale, innerNear = nearX + side * BANK_INNER * nearScale;
    quad(context, scene.fog.bankTop[fog], outerFar, farY, ridgeFarX, farY - ridgeFar, ridgeNearX, nearY - ridgeNear, outerNear, nearY);
    quad(context, side < 0 ? scene.fog.bankLit[fog] : scene.fog.bankShade[fog], ridgeFarX, farY - ridgeFar, innerFar, farY, innerNear, nearY, ridgeNearX, nearY - ridgeNear);
  }
  // the packed snowy road
  const halfFar = BANK_INNER * farScale, halfNear = BANK_INNER * nearScale;
  quad(context, scene.fog.trail[(band >> 1) & 1][fog], farX - halfFar, farY, farX + halfFar, farY, nearX + halfNear, nearY, nearX - halfNear, nearY);
  if (grooves) {
    const trackColor = scene.fog.groove[fog];
    for (const offset of TYRE_TRACKS) {
      const trackFar = farX + offset * farScale, trackNear = nearX + offset * nearScale;
      quad(context, trackColor, trackFar - TYRE_HALF_WIDTH * farScale, farY, trackFar + TYRE_HALF_WIDTH * farScale, farY,
        trackNear + TYRE_HALF_WIDTH * nearScale, nearY, trackNear - TYRE_HALF_WIDTH * nearScale, nearY);
    }
    // a soft dashed centre line and faint lane edges, so the trail reads as a road
    if ((band & 1) === 0) {
      const mark = scene.fog.laneMark[fog];
      quad(context, mark, farX - LANE_MARK_HALF_WIDTH * farScale, farY, farX + LANE_MARK_HALF_WIDTH * farScale, farY,
        nearX + LANE_MARK_HALF_WIDTH * nearScale, nearY, nearX - LANE_MARK_HALF_WIDTH * nearScale, nearY);
    }
    for (const side of [-LANE_EDGE, LANE_EDGE]) {
      const farM = farX + side * farScale, nearM = nearX + side * nearScale;
      quad(context, scene.fog.laneMark[fog], farM - LANE_MARK_HALF_WIDTH * 0.6 * farScale, farY, farM + LANE_MARK_HALF_WIDTH * 0.6 * farScale, farY,
        nearM + LANE_MARK_HALF_WIDTH * 0.6 * nearScale, nearY, nearM - LANE_MARK_HALF_WIDTH * 0.6 * nearScale, nearY);
    }
  }
}

// ---------------------------------------------------------------- scenery beside the trail

function drawSprite(context: CanvasRenderingContext2D, sprite: HTMLCanvasElement, centerX: number, baseY: number, widthPixels: number, heightPixels: number, alpha: number) {
  if (heightPixels < 1.2 || centerX + widthPixels < 0 || centerX - widthPixels > context.canvas.width) return;
  context.globalAlpha = alpha;
  context.drawImage(sprite, centerX - widthPixels / 2, baseY - heightPixels, widthPixels, heightPixels);
  context.globalAlpha = 1;
}

/** Pines lining the slopes and fluttering trail flags on the berms, at segment boundary `index`. */
function drawScenery(scene: Scene, index: number, segment: number, clock: number) {
  const { context, sprites } = scene;
  const centerX = scene.boundaryScreenX[index], groundY = scene.boundaryScreenY[index], scale = scene.boundaryScale[index];
  const fog = scene.boundaryFog[index] / (FOG_LEVELS - 1);
  const alpha = 1 - fog * 0.85;
  for (const side of [-1, 1]) {
    const salt = side < 0 ? 1 : 2;
    if (scenery(segment, salt) < 0.62) {
      const lateral = side * (BANK_OUTER + 1.2 + scenery(segment, salt + 10) * 15);
      const size = 0.85 + scenery(segment, salt + 20) * 0.75;
      const sprite = scenery(segment, salt + 30) < 0.5 ? sprites.snowyPine : sprites.pine;
      drawSprite(context, sprite, centerX + lateral * scale, groundY, ENTITY_DRAW_SIZE[EntityKind.Pine][0] * size * scale, ENTITY_DRAW_SIZE[EntityKind.Pine][1] * size * scale, alpha);
    }
    // a second, sparser line of big pines further out
    if (scenery(segment, salt + 40) < 0.35 && index < 70) {
      const lateral = side * (26 + scenery(segment, salt + 50) * 22);
      const size = 1.3 + scenery(segment, salt + 60) * 0.9;
      drawSprite(context, sprites.snowyPine, centerX + lateral * scale, groundY, ENTITY_DRAW_SIZE[EntityKind.Pine][0] * size * scale, ENTITY_DRAW_SIZE[EntityKind.Pine][1] * size * scale, alpha);
    }
  }
  // trail flags on the berm ridges every fifth segment
  if (segment % 5 === 0 && scale > 0.6) {
    const flagColor = PALETTE.flags[(segment / 5) % PALETTE.flags.length];
    context.globalAlpha = alpha;
    for (const side of [-1, 1]) {
      const baseX = centerX + side * BANK_RIDGE * scale;
      const baseY = groundY - BANK_HEIGHT * scale;
      const poleTop = baseY - 1.7 * scale;
      context.strokeStyle = '#7a6a5e';
      context.lineWidth = Math.max(1, 0.06 * scale);
      context.beginPath(); context.moveTo(baseX, baseY); context.lineTo(baseX, poleTop); context.stroke();
      const flutter = Math.sin(clock * 7 + segment) * 0.12 * scale;
      context.fillStyle = flagColor;
      context.beginPath();
      context.moveTo(baseX, poleTop);
      context.quadraticCurveTo(baseX - side * 0.35 * scale, poleTop + 0.2 * scale + flutter, baseX - side * 0.75 * scale, poleTop + 0.25 * scale + flutter * 1.6);
      context.lineTo(baseX, poleTop + 0.5 * scale);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- obstacles, ramps and collectibles

function project(scene: Scene, x: number, y: number, z: number, out: Float32Array, offset: number) {
  const scale = scene.focal / Math.max(0.4, z);
  out[offset] = scene.width / 2 + x * scale;
  out[offset + 1] = scene.horizonY - y * scale;
}
const rampPoints = new Float32Array(16);

function drawRamp(scene: Scene, render: Float32Array, offset: number, fog: number) {
  const { context } = scene;
  let nearZ = render[offset + 1], nearX = render[offset + 2], nearY = render[offset + 3];
  const farX = render[offset + 5], farY = render[offset + 6];
  const length = 4.5;
  const farZ = render[offset + 7] > 0.4 ? render[offset + 7] : nearZ + length;
  let nearLift = 0;
  if (nearZ < 0.6) {
    // the camera is passing over the ramp: cut it at the near plane
    const cut = (0.6 - nearZ) / length;
    nearX += (farX - nearX) * cut; nearY += (farY - nearY) * cut; nearLift = RAMP_HEIGHT * cut; nearZ = 0.6;
  }
  project(scene, nearX - RAMP_HALF_WIDTH, nearY + nearLift, nearZ, rampPoints, 0);
  project(scene, nearX + RAMP_HALF_WIDTH, nearY + nearLift, nearZ, rampPoints, 2);
  project(scene, farX + RAMP_HALF_WIDTH, farY + RAMP_HEIGHT, farZ, rampPoints, 4);
  project(scene, farX - RAMP_HALF_WIDTH, farY + RAMP_HEIGHT, farZ, rampPoints, 6);
  project(scene, farX - RAMP_HALF_WIDTH, farY, farZ, rampPoints, 8);
  project(scene, farX + RAMP_HALF_WIDTH, farY, farZ, rampPoints, 10);
  const alpha = 1 - (fog / (FOG_LEVELS - 1)) * 0.85;
  context.globalAlpha = alpha;
  const points = rampPoints;
  // side walls (dark wood), then the sloping deck with planks and a snowy stripe
  quad(context, PALETTE.woodDark, points[0], points[1], points[6], points[7], points[8], points[9], points[0], points[1]);
  quad(context, PALETTE.woodDark, points[2], points[3], points[4], points[5], points[10], points[11], points[2], points[3]);
  quad(context, PALETTE.wood, points[0], points[1], points[2], points[3], points[4], points[5], points[6], points[7]);
  context.strokeStyle = PALETTE.woodDark;
  context.lineWidth = Math.max(1, (scene.focal / farZ) * 0.05);
  context.beginPath();
  for (let plank = 1; plank < 5; plank++) {
    const share = plank / 5;
    context.moveTo(points[0] + (points[6] - points[0]) * share, points[1] + (points[7] - points[1]) * share);
    context.lineTo(points[2] + (points[4] - points[2]) * share, points[3] + (points[5] - points[3]) * share);
  }
  context.stroke();
  // snow-dusted lip at the top and a warm edge highlight
  context.strokeStyle = PALETTE.snow;
  context.lineWidth = Math.max(1.5, (scene.focal / farZ) * 0.16);
  context.beginPath(); context.moveTo(points[6], points[7]); context.lineTo(points[4], points[5]); context.stroke();
  context.strokeStyle = PALETTE.woodLight;
  context.lineWidth = Math.max(1, (scene.focal / farZ) * 0.06);
  context.beginPath(); context.moveTo(points[0], points[1]); context.lineTo(points[6], points[7]); context.moveTo(points[2], points[3]); context.lineTo(points[4], points[5]); context.stroke();
  context.globalAlpha = 1;
}

function drawEntity(scene: Scene, render: Float32Array, entity: number, clock: number) {
  const offset = RenderSlot.entities + entity * RenderSlot.entityStride;
  const kind = render[offset] as EntityKind;
  const z = render[offset + 1];
  const fog = fogLevel(z);
  if (kind === EntityKind.Ramp) { drawRamp(scene, render, offset, fog); return; }
  if (z < 0.5) return;
  const { context, sprites } = scene;
  const scale = scene.focal / z;
  const screenX = scene.width / 2 + render[offset + 2] * scale;
  const groundY = scene.horizonY - render[offset + 3] * scale;
  const altitude = render[offset + 4];
  const [widthMetres, heightMetres] = ENTITY_DRAW_SIZE[kind];
  const alpha = 1 - (fog / (FOG_LEVELS - 1)) * 0.85;
  const isCollectible = kind >= EntityKind.Gift;
  if (isCollectible || altitude > 0.2) {
    // a soft shadow on the snow under things that float
    context.fillStyle = `rgba(120,140,170,${(0.22 * alpha).toFixed(3)})`;
    context.beginPath();
    context.ellipse(screenX, groundY, widthMetres * 0.45 * scale, widthMetres * 0.12 * scale, 0, 0, Math.PI * 2);
    context.fill();
  }
  const bob = isCollectible ? (0.35 + Math.sin(clock * 3 + z) * 0.12) * scale : 0;
  const baseY = groundY - altitude * scale - bob;
  let width = widthMetres * scale;
  const height = heightMetres * scale;
  if (kind === EntityKind.Star) width *= 0.35 + 0.65 * Math.abs(Math.cos(clock * 2.6 + z * 0.3)); // spinning
  const sprite = kind === EntityKind.Pine ? sprites.pine : kind === EntityKind.Boulder ? sprites.boulder : kind === EntityKind.Snowman ? sprites.snowman
    : kind === EntityKind.Log ? sprites.log : kind === EntityKind.Gift ? sprites.gift : kind === EntityKind.Star ? sprites.star : sprites.shield;
  if (kind === EntityKind.Shield) {
    const pulse = 1 + Math.sin(clock * 4) * 0.06;
    drawSprite(context, sprite, screenX, baseY + height * (pulse - 1) / 2, width * pulse, height * pulse, alpha);
  } else drawSprite(context, sprite, screenX, baseY, width, height, alpha);
}

// ---------------------------------------------------------------- the car

const carPoints = new Float32Array(2);

interface CarPose { baseX: number; baseY: number; baseZ: number; roll: number; slope: number; yaw: number }
function carPoint(scene: Scene, pose: CarPose, modelX: number, modelY: number, modelZ: number): Float32Array {
  const yawC = Math.cos(pose.yaw), yawS = Math.sin(pose.yaw);
  const yawedX = modelX * yawC + modelZ * yawS;
  const yawedZ = -modelX * yawS + modelZ * yawC;
  const cosine = Math.cos(pose.roll), sine = Math.sin(pose.roll);
  const rolledX = yawedX * cosine + modelY * sine;
  const rolledY = -yawedX * sine + modelY * cosine;
  project(scene, pose.baseX + rolledX, pose.baseY + rolledY + yawedZ * pose.slope, pose.baseZ + yawedZ, carPoints, 0);
  if (carPoints[0] < scene.sledLeft) scene.sledLeft = carPoints[0];
  if (carPoints[0] > scene.sledRight) scene.sledRight = carPoints[0];
  return carPoints;
}

function pathCar(scene: Scene, pose: CarPose, points: readonly (readonly [number, number, number])[], close: boolean) {
  const { context } = scene;
  context.beginPath();
  points.forEach(([x, y, z], index) => {
    const screen = carPoint(scene, pose, x, y, z);
    if (index === 0) context.moveTo(screen[0], screen[1]); else context.lineTo(screen[0], screen[1]);
  });
  if (close) context.closePath();
}

function fillCar(scene: Scene, pose: CarPose, points: readonly (readonly [number, number, number])[], color: string) {
  pathCar(scene, pose, points, true);
  scene.context.fillStyle = color;
  scene.context.fill();
}

const BODY_REAR: readonly (readonly [number, number, number])[] = [[-0.5, 0.22, -0.92], [0.5, 0.22, -0.92], [0.5, 0.52, -0.92], [-0.5, 0.52, -0.92]];
const BODY_FRONT: readonly (readonly [number, number, number])[] = [[-0.46, 0.22, 1.05], [0.46, 0.22, 1.05], [0.46, 0.46, 1.05], [-0.46, 0.46, 1.05]];
const HOOD: readonly (readonly [number, number, number])[] = [[-0.48, 0.50, 0.42], [0.48, 0.50, 0.42], [0.46, 0.46, 1.00], [-0.46, 0.46, 1.00]];
const ROOF: readonly (readonly [number, number, number])[] = [[-0.40, 0.90, -0.52], [0.40, 0.90, -0.52], [0.40, 0.88, 0.28], [-0.40, 0.88, 0.28]];
const CABIN_REAR: readonly (readonly [number, number, number])[] = [[-0.44, 0.52, -0.72], [0.44, 0.52, -0.72], [0.40, 0.90, -0.52], [-0.40, 0.90, -0.52]];
const WINDSHIELD: readonly (readonly [number, number, number])[] = [[-0.40, 0.88, 0.28], [0.40, 0.88, 0.28], [0.48, 0.50, 0.42], [-0.48, 0.50, 0.42]];
const REAR_WINDOW: readonly (readonly [number, number, number])[] = [[-0.36, 0.58, -0.70], [0.36, 0.58, -0.70], [0.34, 0.86, -0.54], [-0.34, 0.86, -0.54]];
const SIDE = (side: number, shade: boolean): readonly (readonly [number, number, number])[] => [
  [side * 0.50, 0.22, -0.92], [side * 0.50, 0.52, -0.92], [side * 0.44, 0.52, -0.72], [side * 0.40, 0.90, -0.52],
  [side * 0.40, 0.88, 0.28], [side * 0.48, 0.50, 0.42], [side * 0.46, 0.46, 1.05], [side * 0.46, 0.22, 1.05],
];
const SIDE_WINDOW = (side: number): readonly (readonly [number, number, number])[] => [
  [side * 0.445, 0.58, -0.62], [side * 0.405, 0.86, -0.46], [side * 0.405, 0.84, 0.20], [side * 0.455, 0.56, 0.34],
];
const BUMPER_REAR: readonly (readonly [number, number, number])[] = [[-0.52, 0.22, -0.96], [0.52, 0.22, -0.96], [0.52, 0.36, -0.96], [-0.52, 0.36, -0.96]];
const BUMPER_FRONT: readonly (readonly [number, number, number])[] = [[-0.48, 0.22, 1.10], [0.48, 0.22, 1.10], [0.48, 0.34, 1.10], [-0.48, 0.34, 1.10]];

function drawWheel(scene: Scene, pose: CarPose, side: number, along: number, angle: number, scale: number) {
  const { context } = scene;
  // tyre: a dark ellipse at the hub, slightly flattened; a cream cap with a spinning bar
  const hub = carPoint(scene, pose, side * 0.50, 0.20, along);
  const top = carPoint(scene, pose, side * 0.50, 0.40, along);
  const radiusX = Math.max(3, 0.13 * scale);
  const radiusY = Math.max(3, Math.hypot(hub[0] - top[0], hub[1] - top[1]));
  context.fillStyle = PALETTE.tyre;
  context.beginPath(); context.ellipse(hub[0], hub[1], radiusX, radiusY, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = PALETTE.tyreShade;
  context.beginPath(); context.ellipse(hub[0], hub[1], radiusX * 0.78, radiusY * 0.78, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = PALETTE.hub;
  context.beginPath(); context.ellipse(hub[0], hub[1], radiusX * 0.45, radiusY * 0.45, 0, 0, Math.PI * 2); context.fill();
  // a spoke that spins with the wheels
  const spokeX = Math.sin(angle) * radiusX * 0.4;
  const spokeY = Math.cos(angle) * radiusY * 0.4;
  context.strokeStyle = PALETTE.hubShade;
  context.lineWidth = Math.max(1, 0.03 * scale);
  context.beginPath(); context.moveTo(hub[0] - spokeX, hub[1] - spokeY); context.lineTo(hub[0] + spokeX, hub[1] + spokeY); context.stroke();
  scene.sledLeft = Math.min(scene.sledLeft, hub[0] - radiusX);
  scene.sledRight = Math.max(scene.sledRight, hub[0] + radiusX);
}

function drawSled(scene: Scene, render: Float32Array, clock: number) {
  const { context } = scene;
  const phase = render[RenderSlot.phase] as Phase;
  const phaseSeconds = render[RenderSlot.phaseSeconds];
  const lean = render[RenderSlot.lean];
  const baseZ = render[RenderSlot.playerRelativeZ];
  const scale = scene.focal / Math.max(0.4, baseZ);
  let roll = lean * 0.22;
  if (phase === Phase.Crashing || phase === Phase.GameOver) {
    const tumble = phase === Phase.GameOver ? 1 : Math.min(1, phaseSeconds / (CRASH_SECONDS * 0.6));
    roll = (lean >= 0 ? 1 : -1) * tumble * 1.15 + Math.sin(tumble * Math.PI) * 0.4;
  }
  const pose: CarPose = {
    baseX: render[RenderSlot.playerRelativeX],
    baseY: render[RenderSlot.playerRelativeY],
    baseZ,
    roll,
    slope: render[RenderSlot.slope],
    yaw: render[RenderSlot.carYaw] ?? 0,
  };
  scene.sledLeft = Infinity;
  scene.sledRight = -Infinity;

  // shadow on the snow (smaller and fainter the higher the car flies)
  const altitude = render[RenderSlot.altitude];
  const shadow = carPoint(scene, { ...pose, baseY: render[RenderSlot.playerGroundY], roll: 0 }, 0, 0, 0);
  const shadowSize = 1 / (1 + altitude * 0.35);
  context.fillStyle = `rgba(100,122,156,${(0.28 * shadowSize).toFixed(3)})`;
  context.beginPath(); context.ellipse(shadow[0], shadow[1], 0.85 * scale * shadowSize, 0.32 * scale * shadowSize, pose.yaw * 0.4, 0, Math.PI * 2); context.fill();

  const yaw = pose.yaw;
  const farSide = yaw >= 0 ? -1 : 1; // the far side of a right-turning car is the left
  const nearSide = -farSide;
  const wheelAngle = render[RenderSlot.wheelAngle] ?? 0;

  // far (the nose) to near (the tail), so from the chase camera the rear sits on top
  drawWheel(scene, pose, farSide, 0.62, wheelAngle, scale);
  fillCar(scene, pose, BUMPER_FRONT, PALETTE.carTrim);
  fillCar(scene, pose, BODY_FRONT, PALETTE.carBody);
  for (const side of [-1, 1]) {
    const light = carPoint(scene, pose, side * 0.38, 0.34, 1.07);
    const glow = 0.10 * scale * (1.05 + Math.sin(clock * 6 + side) * 0.04);
    context.fillStyle = `${PALETTE.headlightGlow}0.45)`;
    context.beginPath(); context.ellipse(light[0], light[1], glow * 1.5, glow * 1.1, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = PALETTE.headlight;
    context.beginPath(); context.ellipse(light[0], light[1], glow, glow * 0.7, 0, 0, Math.PI * 2); context.fill();
  }
  fillCar(scene, pose, HOOD, PALETTE.carBodyLit);
  fillCar(scene, pose, WINDSHIELD, PALETTE.carGlass);
  pathCar(scene, pose, WINDSHIELD, true);
  context.fillStyle = PALETTE.carGlassLit;
  context.globalAlpha = 0.28;
  context.fill();
  context.globalAlpha = 1;
  fillCar(scene, pose, [[-0.50, 0.22, -0.92], [0.50, 0.22, -0.92], [0.46, 0.22, 1.05], [-0.46, 0.22, 1.05]], PALETTE.carBodyDeep);
  fillCar(scene, pose, SIDE(farSide, true), farSide < 0 ? PALETTE.carBodyLit : PALETTE.carBodyShade);
  fillCar(scene, pose, SIDE_WINDOW(farSide), PALETTE.carGlassDark);
  fillCar(scene, pose, ROOF, PALETTE.carCabinShade);
  fillCar(scene, pose, SIDE(nearSide, false), nearSide < 0 ? PALETTE.carBodyLit : PALETTE.carBodyShade);
  fillCar(scene, pose, SIDE_WINDOW(nearSide), PALETTE.carGlass);
  fillCar(scene, pose, CABIN_REAR, PALETTE.carCabin);
  fillCar(scene, pose, REAR_WINDOW, PALETTE.carGlassDark);
  fillCar(scene, pose, BODY_REAR, PALETTE.carBodyDeep);
  fillCar(scene, pose, BUMPER_REAR, PALETTE.carBumper);
  for (const side of [-1, 1]) {
    const tail = carPoint(scene, pose, side * 0.40, 0.36, -0.94);
    context.fillStyle = PALETTE.taillight;
    context.beginPath(); context.ellipse(tail[0], tail[1], 0.08 * scale, 0.05 * scale, 0, 0, Math.PI * 2); context.fill();
  }
  drawWheel(scene, pose, farSide, -0.62, wheelAngle, scale);
  drawWheel(scene, pose, nearSide, 0.62, wheelAngle, scale);
  drawWheel(scene, pose, nearSide, -0.62, wheelAngle, scale);

  context.globalAlpha = 1;
  if (render[RenderSlot.shield] > 0) {
    const center = carPoint(scene, { ...pose, roll: 0 }, 0, 0.55, 0);
    const shimmer = 1 + Math.sin(clock * 5) * 0.04;
    context.fillStyle = `${PALETTE.shield}0.16)`;
    context.strokeStyle = `${PALETTE.shield}0.75)`;
    context.lineWidth = Math.max(1.5, 0.04 * scale);
    scene.sledLeft = Math.min(scene.sledLeft, center[0] - 1.05 * scale * shimmer);
    scene.sledRight = Math.max(scene.sledRight, center[0] + 1.05 * scale * shimmer);
    context.beginPath(); context.ellipse(center[0], center[1], 1.05 * scale * shimmer, 0.8 * scale * shimmer, 0, 0, Math.PI * 2); context.fill(); context.stroke();
  }
}

// ---------------------------------------------------------------- snow spray and falling snow

function emitSpray(scene: Scene, x: number, y: number, velocityX: number, velocityY: number, size: number, life: number) {
  if (scene.sprayCount >= SPRAY_CAPACITY) return;
  const offset = scene.sprayCount * SPRAY_STRIDE;
  scene.spray[offset] = x; scene.spray[offset + 1] = y; scene.spray[offset + 2] = velocityX; scene.spray[offset + 3] = velocityY;
  scene.spray[offset + 4] = 0; scene.spray[offset + 5] = life; scene.spray[offset + 6] = size;
  scene.sprayCount++;
}

function updateSpray(scene: Scene, render: Float32Array, seconds: number) {
  const phase = render[RenderSlot.phase] as Phase;
  const baseZ = render[RenderSlot.playerRelativeZ];
  const scale = scene.focal / baseZ;
  const motion = render[RenderSlot.motion] as Motion;
  if (phase !== scene.lastPhase) {
    if (phase === Phase.Crashing) {
      // a burst of snow at the wipeout
      const center = carPoint(scene, { baseX: render[RenderSlot.playerRelativeX], baseY: render[RenderSlot.playerGroundY], baseZ, roll: 0, slope: 0, yaw: 0 }, 0, 0.3, 0);
      for (let puff = 0; puff < 46; puff++) {
        const angle = Math.random() * Math.PI;
        const speed = (1.5 + Math.random() * 3.5) * scale;
        emitSpray(scene, center[0], center[1], Math.cos(angle) * speed, -Math.sin(angle) * speed, (0.06 + Math.random() * 0.1) * scale, 0.7 + Math.random() * 0.6);
      }
      scene.shake = 0.35;
    }
    scene.lastPhase = phase;
  }
  if (phase === Phase.Playing && motion !== Motion.Airborne && seconds > 0) {
    const lean = render[RenderSlot.lean];
    const rate = render[RenderSlot.speed] * 2.2 + lean * lean * 60;
    scene.sprayDebt += rate * seconds;
    const pose: CarPose = { baseX: render[RenderSlot.playerRelativeX], baseY: render[RenderSlot.playerRelativeY], baseZ, roll: lean * 0.22, slope: 0, yaw: render[RenderSlot.carYaw] ?? 0 };
    while (scene.sprayDebt >= 1) {
      scene.sprayDebt -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const point = carPoint(scene, pose, side * 0.50, 0.04, -0.70);
      const outward = (side * 0.6 - lean * 1.6 + (Math.random() - 0.5)) * scale;
      emitSpray(scene, point[0], point[1], outward, -(0.6 + Math.random() * 1.4) * scale, (0.035 + Math.random() * 0.06) * scale, 0.35 + Math.random() * 0.35);
    }
  } else scene.sprayDebt = 0;
  const gravity = 5 * scale;
  let index = 0;
  while (index < scene.sprayCount) {
    const offset = index * SPRAY_STRIDE;
    scene.spray[offset + 4] += seconds;
    if (scene.spray[offset + 4] >= scene.spray[offset + 5]) {
      // remove by moving the last particle into this slot
      scene.sprayCount--;
      scene.spray.copyWithin(offset, scene.sprayCount * SPRAY_STRIDE, scene.sprayCount * SPRAY_STRIDE + SPRAY_STRIDE);
      continue;
    }
    scene.spray[offset + 3] += gravity * seconds;
    scene.spray[offset] += scene.spray[offset + 2] * seconds;
    scene.spray[offset + 1] += scene.spray[offset + 3] * seconds;
    index++;
  }
}

function drawSpray(scene: Scene) {
  const { context, spray } = scene;
  context.fillStyle = '#ffffff';
  for (let index = 0; index < scene.sprayCount; index++) {
    const offset = index * SPRAY_STRIDE;
    const fade = 1 - spray[offset + 4] / spray[offset + 5];
    const size = spray[offset + 6] * (0.6 + fade * 0.6);
    context.globalAlpha = 0.85 * fade;
    context.fillRect(spray[offset] - size / 2, spray[offset + 1] - size / 2, size, size);
  }
  context.globalAlpha = 1;
}

function drawSnowfall(scene: Scene, render: Float32Array, clock: number, seconds: number) {
  const { context, flakes, width, height } = scene;
  const speed = render[RenderSlot.speed];
  const isMoving = (render[RenderSlot.phase] as Phase) === Phase.Playing;
  const drift = -render[RenderSlot.lean] * 0.12 - render[RenderSlot.heading] * 0.2;
  context.fillStyle = '#ffffff';
  for (let layer = 0; layer < 3; layer++) {
    context.globalAlpha = 0.35 + layer * 0.2;
    context.beginPath();
    for (let flake = layer; flake < FLAKE_COUNT; flake += 3) {
      const offset = flake * 4;
      const depth = flakes[offset + 2];
      flakes[offset + 1] += seconds * (0.05 + depth * 0.09 + (isMoving ? speed * 0.004 * depth : 0));
      flakes[offset] += seconds * (drift * depth + Math.sin(clock * 1.3 + flakes[offset + 3]) * 0.015);
      if (flakes[offset + 1] > 1.02) { flakes[offset + 1] = -0.02; flakes[offset] = (flakes[offset] * 7.31 + 0.37) % 1; }
      if (flakes[offset] < -0.02) flakes[offset] += 1.04; else if (flakes[offset] > 1.02) flakes[offset] -= 1.04;
      const radius = (0.7 + depth * 1.9) * (height / 600) * (0.6 + layer * 0.25);
      const x = flakes[offset] * width, y = flakes[offset + 1] * height;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  }
  context.globalAlpha = 1;
}

// ---------------------------------------------------------------- one frame

export function drawScene(scene: Scene, render: Float32Array, clock: number, seconds: number) {
  const { context, width, height, horizonY, focal } = scene;
  context.save();
  if (scene.shake > 0) {
    scene.shake = Math.max(0, scene.shake - seconds);
    const amount = scene.shake * height * 0.03;
    context.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }
  // a slight roll into the turn, like a driving-game chase camera
  const roll = render[RenderSlot.cameraRoll] ?? 0;
  if (Math.abs(roll) > 0.002) {
    context.translate(width / 2, horizonY + height * 0.18);
    context.rotate(roll);
    context.translate(-width / 2, -(horizonY + height * 0.18));
  }
  // sky and the mountain layers sliding with the camera's yaw
  context.drawImage(scene.backdrop.sky, 0, 0);
  const heading = render[RenderSlot.heading];
  const layerBases = [horizonY + height * 0.035, horizonY + height * 0.04, horizonY + height * 0.05];
  scene.backdrop.layers.forEach((layer, index) => {
    const layerWidth = layer.canvas.width;
    const shift = (-heading * focal * layer.parallax) % layerWidth;
    let x = shift > 0 ? shift - layerWidth : shift;
    const top = layerBases[index] - layer.canvas.height;
    while (x < width) { context.drawImage(layer.canvas, x, top); x += layerWidth; }
  });
  // the far valley in the fog (under everything that follows)
  context.fillStyle = scene.fog.field[0][FOG_LEVELS - 1];
  context.fillRect(0, horizonY + height * 0.035, width, height);

  // project every segment boundary once
  const segmentCount = render[RenderSlot.segmentCount];
  const firstSegment = render[RenderSlot.firstSegment];
  for (let index = 0; index < segmentCount; index++) {
    const offset = RenderSlot.segments + index * RenderSlot.segmentStride;
    const z = Math.max(0.5, render[offset]);
    const scale = focal / z;
    scene.boundaryScale[index] = scale;
    scene.boundaryScreenX[index] = width / 2 + render[offset + 1] * scale;
    scene.boundaryScreenY[index] = horizonY - render[offset + 2] * scale;
    scene.boundaryFog[index] = fogLevel(render[offset]);
  }
  // sort the entities into the strips they stand in
  scene.stripFirstEntity.fill(-1);
  const entityCount = render[RenderSlot.entityCount];
  const nearestBoundaryZ = render[RenderSlot.segments];
  for (let entity = 0; entity < entityCount; entity++) {
    const z = render[RenderSlot.entities + entity * RenderSlot.entityStride + 1];
    const strip = z < nearestBoundaryZ ? DRAW_SEGMENTS : Math.min(DRAW_SEGMENTS - 1, Math.floor((z - nearestBoundaryZ) / SEGMENT_LENGTH));
    scene.nextEntityInStrip[entity] = scene.stripFirstEntity[strip];
    scene.stripFirstEntity[strip] = entity;
  }
  const playerZ = render[RenderSlot.playerRelativeZ];
  const playerStrip = playerZ < nearestBoundaryZ ? DRAW_SEGMENTS : Math.floor((playerZ - nearestBoundaryZ) / SEGMENT_LENGTH);
  const drawStripContents = (strip: number) => {
    const holdsSled = strip === playerStrip;
    for (let entity = scene.stripFirstEntity[strip]; entity >= 0; entity = scene.nextEntityInStrip[entity]) {
      if (!holdsSled || render[RenderSlot.entities + entity * RenderSlot.entityStride + 1] > playerZ) drawEntity(scene, render, entity, clock);
    }
    if (!holdsSled) return;
    drawSled(scene, render, clock);
    for (let entity = scene.stripFirstEntity[strip]; entity >= 0; entity = scene.nextEntityInStrip[entity]) {
      if (render[RenderSlot.entities + entity * RenderSlot.entityStride + 1] <= playerZ) drawEntity(scene, render, entity, clock);
    }
  };

  // far to near: strip, then the scenery on its near edge, then whatever stands in it
  for (let strip = segmentCount - 2; strip >= 0; strip--) {
    const nearY = scene.boundaryScreenY[strip], farY = scene.boundaryScreenY[strip + 1];
    if (farY < nearY && nearY > 0 && farY < height) {
      drawStrip(scene, scene.boundaryScreenX[strip], nearY, scene.boundaryScale[strip], scene.boundaryScreenX[strip + 1], farY, scene.boundaryScale[strip + 1],
        scene.boundaryFog[strip], (firstSegment + strip) >> 1, render[RenderSlot.segments + strip * RenderSlot.segmentStride] < GROOVE_DISTANCE);
    }
    drawScenery(scene, strip + 1, firstSegment + strip + 1, clock);
    drawStripContents(strip);
  }
  // the foreground strip from the nearest boundary down to the bottom of the screen
  {
    const nearY = scene.boundaryScreenY[0], farY = scene.boundaryScreenY[1];
    const extend = farY < nearY ? (height + 40 - nearY) / (nearY - farY) : 0;
    const bottomScale = scene.boundaryScale[0] + (scene.boundaryScale[0] - scene.boundaryScale[1]) * extend;
    const bottomX = scene.boundaryScreenX[0] + (scene.boundaryScreenX[0] - scene.boundaryScreenX[1]) * extend;
    if (nearY < height) drawStrip(scene, bottomX, height + 40, bottomScale, scene.boundaryScreenX[0], nearY, scene.boundaryScale[0], 0, (firstSegment - 1) >> 1, true);
    drawScenery(scene, 0, firstSegment, clock);
  }
  drawStripContents(DRAW_SEGMENTS);

  updateSpray(scene, render, seconds);
  drawSpray(scene);
  drawSnowfall(scene, render, clock, seconds);
  context.restore();
}

export const SCENE_SPRITE_PIXELS_PER_METRE = SPRITE_PIXELS_PER_METRE;
