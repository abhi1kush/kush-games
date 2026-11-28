/**
 * The 3D view: a steady camera behind and above the runner, a perspective projection of the wasm render buffer onto a
 * 2D canvas. A point (x, y, z) — z metres ahead of the runner — lands on screen at
 * (centre + (x − cameraX)·focal/(z + CAMERA_BACK), horizon + (cameraY − y)·focal/(z + CAMERA_BACK)).
 * The camera never rotates; it only slides a little sideways after the runner and rises onto train roofs with them.
 * Drawn back to front: sky, ground, ballast, sleepers and rails, platforms and buildings, then trains, barriers,
 * coins, power-ups, the runner and the chaser sorted by distance, then particles, pop-ups and speed lines.
 */
import { BUILDING_COLORS, createSky, FOG_LEVELS, fogRamp, PALETTE, rgb, type RGB, type Sprites, TRAIN_COLORS } from './art';
import {
  CrashReason, EntityField, EntityKind, HIGH_BARRIER_BOTTOM, LANE_WIDTH, LOW_BARRIER_HEIGHT, MAX_ENTITIES, Motion, Phase, RenderSlot, SCENERY_BLOCK,
  SIGN_BOTTOM, SIGN_TOP, TRAIN_HALF_WIDTH, TRAIN_HEIGHT, CAR_LENGTH,
} from './engine';

export const CAMERA_BACK = 6.2;
const NEAR = 0.45;
const VIEW = 175;
const FADE_FROM = 135;
const SLEEPER_SPACING = 1.25;
const SLEEPER_DISTANCE = 75;
const RAIL_GAUGE = 0.72;
const BALLAST_HALF_WIDTH = 1.3;
const PLATFORM_INNER = 3.95;
const PLATFORM_OUTER = 7.2;
const PLATFORM_HEIGHT = 0.35;
const BUILDING_INNER = 8.2;
const BUILDING_LENGTH = 16;
const BUILDINGS_PER_BLOCK = SCENERY_BLOCK / BUILDING_LENGTH;
const POLE_SPACING = 24;
const PARTICLE_CAPACITY = 72;
const PARTICLE_STRIDE = 7; // x, y, vx, vy, age, life, kind
const POPUP_CAPACITY = 6;
const SKY_MARGIN = 60;

export interface Popup { text: string; x: number; y: number; age: number; life: number; size: number; color: string }

export interface Scene {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  focal: number;
  horizonY: number;
  cameraHeight: number;
  sprites: Sprites;
  sky: HTMLCanvasElement;
  groundGradient: CanvasGradient;
  hazeGradient: CanvasGradient;
  trainRamps: { body: string[]; side: string[]; dark: string[]; roof: string[] }[];
  buildingRamps: { wall: string[]; end: string[] }[];
  cameraX: number;
  cameraLift: number;
  shake: number;
  sortKeys: Float32Array;
  sortOrder: Int16Array;
  particles: Float32Array;
  particleCount: number;
  popups: Popup[];
  lastTime: number;
  /** where the runner was drawn last frame (pixels), for tests */
  runnerLeft: number;
  runnerRight: number;
  runnerTop: number;
  runnerBottom: number;
}

/** The view for a canvas size: focal length (pixels per metre at 1 m), camera height and horizon line. The three lanes
 *  fit across an upright phone (the camera rises to look down on them), and the runner stands low on the screen. */
export function viewGeometry(width: number, height: number) {
  const fitHalfWidth = 3.1;
  const focal = Math.min(height * 0.72, (width / 2 / fitHalfWidth) * CAMERA_BACK);
  const feetY = height * 0.84;
  const cameraHeight = Math.max(3.8, Math.min(8, ((feetY - height * 0.3) * CAMERA_BACK) / focal));
  const horizonY = feetY - (cameraHeight * focal) / CAMERA_BACK;
  return { focal, cameraHeight, horizonY, feetY };
}

export function createScene(context: CanvasRenderingContext2D, width: number, height: number, sprites: Sprites): Scene {
  const { focal, cameraHeight, horizonY } = viewGeometry(width, height);
  const groundGradient = context.createLinearGradient(0, horizonY, 0, height);
  groundGradient.addColorStop(0, '#f3e4d4'); groundGradient.addColorStop(0.25, PALETTE.ground); groundGradient.addColorStop(1, '#e2d3bb');
  const hazeGradient = context.createLinearGradient(0, horizonY - 2, 0, horizonY + height * 0.08);
  hazeGradient.addColorStop(0, 'rgba(250,230,214,0.9)'); hazeGradient.addColorStop(1, 'rgba(250,230,214,0)');
  return {
    context, width, height, focal, horizonY, cameraHeight, sprites,
    sky: createSky(width, horizonY, SKY_MARGIN),
    groundGradient, hazeGradient,
    trainRamps: TRAIN_COLORS.map(color => ({ body: fogRamp(color), side: fogRamp(color, 0.86), dark: fogRamp(color, 0.62), roof: fogRamp([Math.min(255, color[0] * 0.55 + 112), Math.min(255, color[1] * 0.55 + 112), Math.min(255, color[2] * 0.55 + 112)]) })),
    buildingRamps: BUILDING_COLORS.map(color => ({ wall: fogRamp(color, 0.92, 0.85), end: fogRamp(color, 1.04, 0.85) })),
    cameraX: 0, cameraLift: 0, shake: 0,
    sortKeys: new Float32Array(MAX_ENTITIES + 2), sortOrder: new Int16Array(MAX_ENTITIES + 2),
    particles: new Float32Array(PARTICLE_CAPACITY * PARTICLE_STRIDE), particleCount: 0,
    popups: [], lastTime: 0,
    runnerLeft: 0, runnerRight: 0, runnerTop: 0, runnerBottom: 0,
  };
}

// ---------- projection (module state set once per frame: no allocation) ----------
let centreX = 0, horizon = 0, focal = 1, cameraX = 0, cameraY = 0;
const depthOf = (z: number) => Math.max(NEAR, z + CAMERA_BACK);
const screenX = (x: number, z: number) => centreX + ((x - cameraX) * focal) / depthOf(z);
const screenY = (y: number, z: number) => horizon + ((cameraY - y) * focal) / depthOf(z);
const scaleAt = (z: number) => focal / depthOf(z);
/** Nearest z that is still in front of the camera. */
const NEAREST_Z = NEAR - CAMERA_BACK;
const fogLevel = (z: number) => Math.max(0, Math.min(FOG_LEVELS - 1, Math.floor(((z - 10) / (VIEW - 10)) * FOG_LEVELS * 1.1)));

/** A quad on a plane of constant x (a train side, a wall), clipped to the near plane. */
function sideQuad(context: CanvasRenderingContext2D, x: number, bottom: number, top: number, near: number, far: number) {
  const z0 = Math.max(near, NEAREST_Z);
  if (far <= z0) return;
  context.moveTo(screenX(x, z0), screenY(bottom, z0));
  context.lineTo(screenX(x, far), screenY(bottom, far));
  context.lineTo(screenX(x, far), screenY(top, far));
  context.lineTo(screenX(x, z0), screenY(top, z0));
  context.closePath();
}
/** A quad on a plane of constant y (a roof, the ground), clipped to the near plane. */
function flatQuad(context: CanvasRenderingContext2D, left: number, right: number, y: number, near: number, far: number) {
  const z0 = Math.max(near, NEAREST_Z);
  if (far <= z0) return;
  context.moveTo(screenX(left, z0), screenY(y, z0));
  context.lineTo(screenX(right, z0), screenY(y, z0));
  context.lineTo(screenX(right, far), screenY(y, far));
  context.lineTo(screenX(left, far), screenY(y, far));
  context.closePath();
}
/** A rectangle facing the camera at distance z. */
function frontRect(context: CanvasRenderingContext2D, left: number, right: number, bottom: number, top: number, z: number) {
  const x0 = screenX(left, z), x1 = screenX(right, z), y0 = screenY(top, z), y1 = screenY(bottom, z);
  context.rect(x0, y0, x1 - x0, y1 - y0);
}

const hash = (value: number) => {
  let h = (value | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- the frame ----------
export function drawScene(scene: Scene, render: Float32Array, time: number, seconds: number) {
  const { context, width, height } = scene;
  const runnerX = render[RenderSlot.playerX];
  const runnerY = render[RenderSlot.playerY];
  const surface = render[RenderSlot.surface];
  const phase = render[RenderSlot.phase];
  // the camera slides after the runner (part of the way, quickly) and rises with the surface underfoot, not with jumps
  const follow = seconds > 0 ? 1 - Math.exp(-seconds * 14) : 0;
  scene.cameraX += (runnerX * 0.55 - scene.cameraX) * (seconds > 0 ? follow : 1);
  const liftTarget = surface + Math.max(0, runnerY - surface) * 0.18;
  scene.cameraLift += (liftTarget - scene.cameraLift) * (seconds > 0 ? 1 - Math.exp(-seconds * 6) : 1);
  scene.shake = Math.max(0, scene.shake - seconds * 2.2);
  const shakeX = scene.shake > 0 ? Math.sin(time * 71) * scene.shake * 9 : 0;
  const shakeY = scene.shake > 0 ? Math.cos(time * 57) * scene.shake * 6 : 0;
  centreX = width / 2 + shakeX;
  horizon = scene.horizonY + shakeY;
  focal = scene.focal;
  cameraX = scene.cameraX;
  cameraY = scene.cameraHeight + scene.cameraLift;

  // sky (fixed; a little parallax sideways)
  context.drawImage(scene.sky, -SKY_MARGIN - cameraX * 6 + shakeX, shakeY - 1);
  context.fillStyle = scene.groundGradient;
  context.fillRect(0, horizon, width, height - horizon + 12);
  drawTrack(scene, render);
  // a soft morning haze where the tracks meet the sky (buildings fade by distance on their own)
  context.fillStyle = scene.hazeGradient;
  context.fillRect(0, horizon - 2, width, height * 0.08 + 2);
  drawBuildings(scene, render);
  drawObjects(scene, render, time);
  drawEffects(scene, render, time, seconds);
  if (phase === Phase.Crashed || phase === Phase.GameOver) {
    const fade = Math.min(1, render[RenderSlot.phaseSeconds] * (phase === Phase.GameOver ? 3 : 0.5)) * 0.18;
    if (fade > 0) { context.fillStyle = `rgba(60,50,80,${fade.toFixed(3)})`; context.fillRect(0, 0, width, height); }
  }
}

function drawTrack(scene: Scene, render: Float32Array) {
  const { context } = scene;
  const offset = render[RenderSlot.trackOffset];
  const far = VIEW;
  // platforms (raised, a cream walkway with a yellow safety edge) and ballast beds
  context.fillStyle = PALETTE.platformSide;
  context.beginPath();
  sideQuad(context, -PLATFORM_INNER, 0, PLATFORM_HEIGHT, -CAMERA_BACK, far);
  sideQuad(context, PLATFORM_INNER, 0, PLATFORM_HEIGHT, -CAMERA_BACK, far);
  context.fill();
  context.fillStyle = PALETTE.platform;
  context.beginPath();
  flatQuad(context, -PLATFORM_OUTER - 2, -PLATFORM_INNER, PLATFORM_HEIGHT, -CAMERA_BACK, far);
  flatQuad(context, PLATFORM_INNER, PLATFORM_OUTER + 2, PLATFORM_HEIGHT, -CAMERA_BACK, far);
  context.fill();
  context.fillStyle = PALETTE.platformEdge;
  context.beginPath();
  flatQuad(context, -PLATFORM_INNER - 0.35, -PLATFORM_INNER - 0.12, PLATFORM_HEIGHT + 0.001, -CAMERA_BACK, far);
  flatQuad(context, PLATFORM_INNER + 0.12, PLATFORM_INNER + 0.35, PLATFORM_HEIGHT + 0.001, -CAMERA_BACK, far);
  context.fill();
  context.fillStyle = PALETTE.ballast;
  context.beginPath();
  for (let lane = -1; lane <= 1; lane++) flatQuad(context, lane * LANE_WIDTH - BALLAST_HALF_WIDTH, lane * LANE_WIDTH + BALLAST_HALF_WIDTH, 0, -CAMERA_BACK, far);
  context.fill();
  // sleepers, scrolling with the run
  context.fillStyle = PALETTE.sleeper;
  context.beginPath();
  const first = -((offset % SLEEPER_SPACING) + SLEEPER_SPACING * 3);
  for (let z = first; z < SLEEPER_DISTANCE; z += SLEEPER_SPACING) {
    if (z + 0.3 < NEAREST_Z) continue;
    for (let lane = -1; lane <= 1; lane++) flatQuad(context, lane * LANE_WIDTH - 1.05, lane * LANE_WIDTH + 1.05, 0.02, z, z + 0.3);
  }
  context.fill();
  // rails
  context.fillStyle = PALETTE.rail;
  context.beginPath();
  for (let lane = -1; lane <= 1; lane++) {
    for (const side of [-1, 1]) {
      const x = lane * LANE_WIDTH + side * RAIL_GAUGE;
      sideQuad(context, x - 0.04, 0, 0.14, -CAMERA_BACK, far);
      flatQuad(context, x - 0.05, x + 0.05, 0.14, -CAMERA_BACK, far);
    }
  }
  context.fill();
  context.fillStyle = PALETTE.railShine;
  context.beginPath();
  for (let lane = -1; lane <= 1; lane++) for (const side of [-1, 1]) {
    const x = lane * LANE_WIDTH + side * RAIL_GAUGE;
    flatQuad(context, x - 0.015, x + 0.025, 0.141, -CAMERA_BACK, far * 0.6);
  }
  context.fill();
  // lamp poles along the platform edges
  const poleOffset = offset % POLE_SPACING;
  context.fillStyle = PALETTE.pole;
  context.beginPath();
  for (let z = POLE_SPACING - poleOffset - POLE_SPACING; z < VIEW; z += POLE_SPACING) {
    if (z < NEAREST_Z + 0.4) continue;
    for (const side of [-1, 1]) {
      const x = side * (PLATFORM_INNER + 0.8);
      frontRect(context, x - 0.08, x + 0.08, PLATFORM_HEIGHT, 5.4, z);
      const arm = side * -0.9;
      frontRect(context, Math.min(x, x + arm), Math.max(x, x + arm), 5.3, 5.42, z);
    }
  }
  context.fill();
  context.fillStyle = PALETTE.lamp;
  context.beginPath();
  for (let z = POLE_SPACING - poleOffset - POLE_SPACING; z < VIEW; z += POLE_SPACING) {
    if (z < NEAREST_Z + 0.4) continue;
    for (const side of [-1, 1]) {
      const x = side * (PLATFORM_INNER - 0.1);
      frontRect(context, x - 0.28, x + 0.28, 5.12, 5.3, z);
    }
  }
  context.fill();
}

function drawBuildings(scene: Scene, render: Float32Array) {
  const { context, buildingRamps } = scene;
  const absolute = render[RenderSlot.blockIndex] * SCENERY_BLOCK + render[RenderSlot.trackOffset];
  const firstIndex = Math.floor((absolute - CAMERA_BACK) / BUILDING_LENGTH);
  const lastIndex = Math.floor((absolute + VIEW) / BUILDING_LENGTH);
  // far to near, both sides
  for (let index = lastIndex; index >= firstIndex; index--) {
    const near = index * BUILDING_LENGTH - absolute;
    for (const side of [-1, 1]) {
      const seed = index * 2 + (side > 0 ? 1 : 0);
      const gapBefore = hash(seed * 3 + 1) < 0.25 ? 2.5 : 0.4;
      const z0 = near + gapBefore;
      const z1 = near + BUILDING_LENGTH - 0.4;
      if (z1 < NEAREST_Z) continue;
      const tall = 5 + hash(seed * 7 + 3) * 13;
      const setBack = hash(seed * 5 + 2) * 1.6;
      const inner = side * (BUILDING_INNER + setBack);
      const outer = side * (BUILDING_INNER + setBack + 9);
      const color = buildingRamps[Math.floor(hash(seed * 11 + 5) * buildingRamps.length)];
      const fog = fogLevel(z0);
      context.fillStyle = color.wall[fog];
      context.beginPath();
      sideQuad(context, inner, 0, tall, z0, z1);
      context.fill();
      if (z0 > NEAREST_Z) {
        context.fillStyle = color.end[fog];
        context.beginPath();
        frontRect(context, Math.min(inner, outer), Math.max(inner, outer), 0, tall, z0);
        context.fill();
      }
      // a roof trim and windows on the wall facing the tracks (near buildings only)
      if (z0 < 95) {
        context.fillStyle = fog < 3 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)';
        context.beginPath();
        sideQuad(context, inner, tall - 0.45, tall, z0, z1);
        context.fill();
        context.fillStyle = hash(seed * 13 + 9) < 0.5 ? 'rgba(96,120,160,0.42)' : 'rgba(120,110,160,0.38)';
        context.beginPath();
        for (let floor = 1.6; floor < tall - 1.2; floor += 2.8) {
          for (let along = z0 + 1.2; along < z1 - 1.6; along += 3.2) sideQuad(context, inner, floor, floor + 1.5, along, along + 1.8);
        }
        context.fill();
      }
    }
  }
}

// ---------- trains, barriers, pickups, the runner and the chaser, far to near ----------
const RUNNER = -1;
const CHASER = -2;

function drawObjects(scene: Scene, render: Float32Array, time: number) {
  const { sortKeys, sortOrder } = scene;
  const count = render[RenderSlot.entityCount];
  const runnerX = render[RenderSlot.playerX];
  let size = 0;
  for (let index = 0; index < count; index++) {
    const base = RenderSlot.entities + index * RenderSlot.entityStride;
    const near = render[base + EntityField.near];
    const far = render[base + EntityField.far];
    if (far < NEAREST_Z || near > VIEW) continue;
    let key = near;
    // something the runner stands on or is beside in the same lane goes behind the runner
    if (near <= 0.2 && far >= -0.6 && Math.abs(render[base + EntityField.x] - runnerX) < 1.7) key = 0.05;
    else if (near < 0 && far > 0) key = Math.max(near, -0.4); // beside the runner, in another lane: drawn after
    sortKeys[size] = key;
    sortOrder[size] = index;
    size++;
  }
  sortKeys[size] = 0; sortOrder[size] = RUNNER; size++;
  const chaserGap = render[RenderSlot.chaserGap];
  if (chaserGap < CAMERA_BACK - 0.6) { sortKeys[size] = -chaserGap; sortOrder[size] = CHASER; size++; }
  // insertion sort, far first (few items, mostly already in order)
  for (let i = 1; i < size; i++) {
    const key = sortKeys[i], value = sortOrder[i];
    let j = i - 1;
    while (j >= 0 && sortKeys[j] < key) { sortKeys[j + 1] = sortKeys[j]; sortOrder[j + 1] = sortOrder[j]; j--; }
    sortKeys[j + 1] = key; sortOrder[j + 1] = value;
  }
  for (let i = 0; i < size; i++) {
    const index = sortOrder[i];
    if (index === RUNNER) drawRunner(scene, render, time);
    else if (index === CHASER) drawChaser(scene, render, time);
    else drawEntity(scene, render, RenderSlot.entities + index * RenderSlot.entityStride, time);
  }
}

function drawEntity(scene: Scene, render: Float32Array, base: number, time: number) {
  const { context } = scene;
  const kind = render[base + EntityField.kind] as EntityKind;
  const x = render[base + EntityField.x];
  const y = render[base + EntityField.y];
  const near = render[base + EntityField.near];
  const far = render[base + EntityField.far];
  const variant = render[base + EntityField.variant];
  const fade = near > FADE_FROM ? Math.max(0, (VIEW - near) / (VIEW - FADE_FROM)) : 1;
  if (fade <= 0) return;
  context.globalAlpha = fade;
  switch (kind) {
    case EntityKind.Train: case EntityKind.MovingTrain: drawTrain(scene, x, near, far, kind === EntityKind.MovingTrain ? 4 : variant % 4, kind === EntityKind.MovingTrain, time); break;
    case EntityKind.Ramp: drawRamp(scene, x, near, far); break;
    case EntityKind.LowBarrier: drawLowBarrier(scene, x, near); break;
    case EntityKind.HighBarrier: drawHighBarrier(scene, x, near, time); break;
    case EntityKind.Sign: drawSign(scene, x, near); break;
    case EntityKind.Coin: {
      if (near < -CAMERA_BACK + 1.2) break;
      const scale = scaleAt(near);
      const spin = Math.cos(time * 5 + near * 0.35);
      const coinSize = 0.62 * scale;
      const coinWidth = Math.max(coinSize * 0.18, coinSize * Math.abs(spin));
      context.drawImage(scene.sprites.coin, screenX(x, near) - coinWidth / 2, screenY(y, near) - coinSize / 2, coinWidth, coinSize);
      break;
    }
    default: {
      if (near < -CAMERA_BACK + 1.2) break;
      const sprite = kind === EntityKind.Magnet ? scene.sprites.magnet : kind === EntityKind.Sneakers ? scene.sprites.sneakers
        : kind === EntityKind.Multiplier ? scene.sprites.multiplier : scene.sprites.hoverboard;
      const scale = scaleAt(near);
      const bob = Math.sin(time * 3 + near) * 0.12;
      const spriteSize = 1.15 * scale;
      context.drawImage(sprite, screenX(x, near) - spriteSize / 2, screenY(y + bob, near) - spriteSize / 2, spriteSize, spriteSize);
    }
  }
  context.globalAlpha = 1;
}

function drawTrain(scene: Scene, x: number, near: number, far: number, colorIndex: number, isMoving: boolean, time: number) {
  const { context } = scene;
  const ramps = scene.trainRamps[colorIndex];
  const fog = fogLevel(Math.max(near, 0));
  const left = x - TRAIN_HALF_WIDTH, right = x + TRAIN_HALF_WIDTH;
  // roof (seen when the camera is above it)
  if (cameraY > TRAIN_HEIGHT) {
    context.fillStyle = ramps.roof[fog];
    context.beginPath();
    flatQuad(context, left, right, TRAIN_HEIGHT, near, far);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.beginPath();
    flatQuad(context, left + 0.12, left + 0.3, TRAIN_HEIGHT + 0.005, near, far);
    flatQuad(context, right - 0.3, right - 0.12, TRAIN_HEIGHT + 0.005, near, far);
    context.fill();
    context.fillStyle = 'rgba(110,100,140,0.22)';
    context.beginPath();
    for (let z = near + CAR_LENGTH; z < far - 0.5; z += CAR_LENGTH) flatQuad(context, left, right, TRAIN_HEIGHT + 0.01, z - 0.25, z + 0.25);
    flatQuad(context, x - 0.35, x + 0.35, TRAIN_HEIGHT + 0.01, near + 2, Math.min(far - 2, near + 5));
    context.fill();
  }
  // the side facing the camera
  const sideX = cameraX < left ? left : cameraX > right ? right : null;
  if (sideX !== null) {
    context.fillStyle = ramps.side[fog];
    context.beginPath();
    sideQuad(context, sideX, 0.3, TRAIN_HEIGHT, near, far);
    context.fill();
    context.fillStyle = ramps.dark[fog];
    context.beginPath();
    sideQuad(context, sideX, 0, 0.42, near, far);
    context.fill();
    if (near < 90) {
      context.fillStyle = fog < 3 ? 'rgba(255,250,240,0.85)' : 'rgba(255,250,240,0.6)';
      context.beginPath();
      sideQuad(context, sideX, 1.15, 1.35, near, far);
      context.fill();
      context.fillStyle = 'rgba(82,104,138,0.75)';
      context.beginPath();
      for (let z = near + 1.1; z < far - 1.5; z += 2.2) {
        if ((z - near) % CAR_LENGTH > CAR_LENGTH - 1.6) continue;
        sideQuad(context, sideX, 1.65, 2.55, z, z + 1.3);
      }
      context.fill();
      context.fillStyle = 'rgba(60,70,90,0.35)';
      context.beginPath();
      for (let z = near + CAR_LENGTH; z < far - 0.5; z += CAR_LENGTH) sideQuad(context, sideX, 0.3, TRAIN_HEIGHT, z - 0.12, z + 0.12);
      context.fill();
    }
  }
  // the front
  if (near > NEAREST_Z) {
    context.fillStyle = ramps.body[fog];
    context.beginPath();
    frontRect(context, left, right, 0.3, TRAIN_HEIGHT, near);
    context.fill();
    context.fillStyle = ramps.dark[fog];
    context.beginPath();
    frontRect(context, left, right, 0, 0.42, near);
    context.fill();
    context.fillStyle = fog < 3 ? 'rgba(255,250,240,0.9)' : 'rgba(255,250,240,0.6)';
    context.beginPath();
    frontRect(context, left, right, 1.15, 1.35, near);
    context.fill();
    context.fillStyle = 'rgba(78,100,134,0.85)';
    context.beginPath();
    frontRect(context, left + 0.3, right - 0.3, 1.75, 2.85, near);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.28)';
    context.beginPath();
    frontRect(context, left + 0.4, left + 0.85, 2.0, 2.75, near);
    context.fill();
    // headlights (bright and glowing on a train coming at you)
    const scale = scaleAt(near);
    const lightY = screenY(0.8, near);
    const lightRadius = 0.16 * scale;
    for (const side of [-1, 1]) {
      const lightX = screenX(x + side * 0.7, near);
      if (isMoving) {
        const pulse = 0.55 + 0.25 * Math.sin(time * 10);
        context.fillStyle = `rgba(255,238,170,${pulse.toFixed(2)})`;
        context.beginPath(); context.arc(lightX, lightY, lightRadius * 3, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = isMoving ? '#fff6cc' : '#f6efe0';
      context.beginPath(); context.arc(lightX, lightY, lightRadius, 0, Math.PI * 2); context.fill();
    }
    if (isMoving && near < 120) {
      // a warning lamp on top
      const blink = Math.sin(time * 9) > 0;
      context.fillStyle = blink ? '#ff9f8a' : '#f6c9bf';
      context.beginPath(); context.arc(screenX(x, near), screenY(TRAIN_HEIGHT + 0.15, near), 0.17 * scale, 0, Math.PI * 2); context.fill();
    }
  }
}

function drawRamp(scene: Scene, x: number, near: number, far: number) {
  const { context } = scene;
  const left = x - TRAIN_HALF_WIDTH, right = x + TRAIN_HALF_WIDTH;
  const length = far - near;
  const heightAt = (z: number) => TRAIN_HEIGHT * Math.max(0, Math.min(1, (z - near) / length));
  const z0 = Math.max(near, NEAREST_Z);
  if (far <= z0) return;
  const fog = fogLevel(Math.max(near, 0));
  const sideX = cameraX < left ? left : cameraX > right ? right : null;
  if (sideX !== null) {
    context.fillStyle = fog < 4 ? '#b9875a' : '#cfae90';
    context.beginPath();
    context.moveTo(screenX(sideX, z0), screenY(0, z0));
    context.lineTo(screenX(sideX, far), screenY(0, far));
    context.lineTo(screenX(sideX, far), screenY(TRAIN_HEIGHT, far));
    context.lineTo(screenX(sideX, z0), screenY(heightAt(z0), z0));
    context.closePath();
    context.fill();
  }
  context.fillStyle = fog < 4 ? '#e3b27c' : '#ead0b4';
  context.beginPath();
  context.moveTo(screenX(left, z0), screenY(heightAt(z0), z0));
  context.lineTo(screenX(right, z0), screenY(heightAt(z0), z0));
  context.lineTo(screenX(right, far), screenY(TRAIN_HEIGHT, far));
  context.lineTo(screenX(left, far), screenY(TRAIN_HEIGHT, far));
  context.closePath();
  context.fill();
  // planks and two bright guide stripes
  context.strokeStyle = 'rgba(150,100,60,0.45)';
  context.lineWidth = Math.max(1, scaleAt(Math.max(near, 0)) * 0.05);
  context.beginPath();
  for (let z = near + 0.8; z < far; z += 0.8) {
    if (z < z0) continue;
    context.moveTo(screenX(left, z), screenY(heightAt(z), z));
    context.lineTo(screenX(right, z), screenY(heightAt(z), z));
  }
  context.stroke();
  context.fillStyle = 'rgba(255,248,230,0.75)';
  context.beginPath();
  for (const stripe of [-0.6, 0.6]) {
    context.moveTo(screenX(x + stripe - 0.08, z0), screenY(heightAt(z0) + 0.01, z0));
    context.lineTo(screenX(x + stripe + 0.08, z0), screenY(heightAt(z0) + 0.01, z0));
    context.lineTo(screenX(x + stripe + 0.08, far), screenY(TRAIN_HEIGHT + 0.01, far));
    context.lineTo(screenX(x + stripe - 0.08, far), screenY(TRAIN_HEIGHT + 0.01, far));
    context.closePath();
  }
  context.fill();
}

function drawLowBarrier(scene: Scene, x: number, near: number) {
  const { context } = scene;
  if (near < NEAREST_Z) return;
  context.fillStyle = '#8b95a6';
  context.beginPath();
  frontRect(context, x - 1.0, x - 0.86, 0, LOW_BARRIER_HEIGHT - 0.05, near);
  frontRect(context, x + 0.86, x + 1.0, 0, LOW_BARRIER_HEIGHT - 0.05, near);
  context.fill();
  // a striped board: soft white and coral
  const segment = (TRAIN_HALF_WIDTH * 2) / 6;
  for (let index = 0; index < 6; index++) {
    context.fillStyle = index % 2 === 0 ? '#fbf6ee' : '#f19a8a';
    context.beginPath();
    frontRect(context, x - TRAIN_HALF_WIDTH + index * segment, x - TRAIN_HALF_WIDTH + (index + 1) * segment, 0.5, LOW_BARRIER_HEIGHT, near);
    context.fill();
  }
  context.fillStyle = 'rgba(255,255,255,0.65)';
  context.beginPath();
  flatQuad(context, x - TRAIN_HALF_WIDTH, x + TRAIN_HALF_WIDTH, LOW_BARRIER_HEIGHT, near, near + 0.2);
  context.fill();
}

function drawHighBarrier(scene: Scene, x: number, near: number, time: number) {
  const { context } = scene;
  if (near < NEAREST_Z) return;
  context.fillStyle = '#7f8aa0';
  context.beginPath();
  frontRect(context, x - 1.1, x - 0.94, 0, 3.0, near);
  frontRect(context, x + 0.94, x + 1.1, 0, 3.0, near);
  frontRect(context, x - 1.1, x + 1.1, 2.86, 3.0, near);
  context.fill();
  const segment = (TRAIN_HALF_WIDTH * 2) / 5;
  for (let index = 0; index < 5; index++) {
    context.fillStyle = index % 2 === 0 ? '#f4cf6f' : '#5f7192';
    context.beginPath();
    frontRect(context, x - TRAIN_HALF_WIDTH + index * segment, x - TRAIN_HALF_WIDTH + (index + 1) * segment, HIGH_BARRIER_BOTTOM + 0.12, HIGH_BARRIER_BOTTOM + 0.85, near);
    context.fill();
  }
  // "duck" chevrons under the board
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.beginPath();
  const scale = scaleAt(near);
  const chevronX = screenX(x, near), chevronY = screenY(HIGH_BARRIER_BOTTOM + 0.5, near);
  context.moveTo(chevronX - 0.22 * scale, chevronY - 0.14 * scale);
  context.lineTo(chevronX, chevronY + 0.1 * scale);
  context.lineTo(chevronX + 0.22 * scale, chevronY - 0.14 * scale);
  context.lineTo(chevronX + 0.22 * scale, chevronY - 0.04 * scale);
  context.lineTo(chevronX, chevronY + 0.2 * scale);
  context.lineTo(chevronX - 0.22 * scale, chevronY - 0.04 * scale);
  context.closePath();
  context.fill();
  context.fillStyle = Math.sin(time * 6 + x) > 0 ? '#ffc56b' : '#f7e2b0';
  context.beginPath(); context.arc(screenX(x, near), screenY(3.12, near), 0.13 * scale, 0, Math.PI * 2); context.fill();
}

function drawSign(scene: Scene, x: number, near: number) {
  const { context } = scene;
  if (near < NEAREST_Z) return;
  context.fillStyle = '#6f7f96';
  context.beginPath();
  frontRect(context, x - 1.15, x - 1.0, 0, 3.4, near);
  frontRect(context, x + 1.0, x + 1.15, 0, 3.4, near);
  frontRect(context, x - 1.15, x + 1.15, 3.25, 3.4, near);
  frontRect(context, x - 0.55, x - 0.5, SIGN_TOP, 3.25, near);
  frontRect(context, x + 0.5, x + 0.55, SIGN_TOP, 3.25, near);
  context.fill();
  context.fillStyle = '#5fb5a0';
  context.beginPath();
  frontRect(context, x - 0.95, x + 0.95, SIGN_BOTTOM + 0.1, SIGN_TOP, near);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  const scale = scaleAt(near);
  context.lineWidth = Math.max(1, 0.06 * scale);
  context.beginPath();
  frontRect(context, x - 0.85, x + 0.85, SIGN_BOTTOM + 0.2, SIGN_TOP - 0.1, near);
  context.stroke();
  // a train symbol on the board
  context.fillStyle = '#ffffff';
  context.beginPath();
  frontRect(context, x - 0.35, x + 0.35, SIGN_BOTTOM + 0.6, SIGN_BOTTOM + 1.15, near);
  context.fill();
  context.fillStyle = '#5fb5a0';
  context.beginPath();
  frontRect(context, x - 0.25, x + 0.25, SIGN_BOTTOM + 0.85, SIGN_BOTTOM + 1.05, near);
  context.fill();
}

// ---------- characters ----------
/** The runner (an original character: teal hoodie, peach cap on backwards, sunny backpack), seen from behind. */
function drawRunner(scene: Scene, render: Float32Array, time: number) {
  const { context } = scene;
  const x = render[RenderSlot.playerX];
  const y = render[RenderSlot.playerY];
  const surface = render[RenderSlot.surface];
  const motion = render[RenderSlot.motion] as Motion;
  const phase = render[RenderSlot.phase] as Phase;
  const hoverboard = render[RenderSlot.hoverboardSeconds] > 0;
  const ghost = render[RenderSlot.ghostSeconds] > 0;
  const lean = Math.max(-1, Math.min(1, render[RenderSlot.lateral])) * 0.22;
  const scale = scaleAt(0);
  const feetX = screenX(x, 0);
  const lift = hoverboard ? 0.22 : 0;
  const feetY = screenY(y + lift, 0);
  // shadow on whatever is underfoot
  const shadowY = screenY(surface, 0);
  const heightAbove = Math.max(0, y - surface);
  context.fillStyle = PALETTE.shadow;
  context.beginPath();
  context.ellipse(feetX, shadowY, 0.42 * scale * (1 - Math.min(0.5, heightAbove * 0.12)), 0.13 * scale, 0, 0, Math.PI * 2);
  context.fill();
  if (ghost && Math.sin(time * 40) > 0.3) context.globalAlpha = 0.45;
  context.save();
  context.translate(feetX, feetY);
  const crashed = phase === Phase.Crashed || phase === Phase.GameOver;
  const caught = crashed && render[RenderSlot.crashReason] === CrashReason.Caught;
  let tilt = lean;
  if (render[RenderSlot.hitGrace] > 0 && !crashed) tilt += Math.sin(time * 30) * 0.18;
  if (crashed && !caught) tilt = Math.min(1.35, render[RenderSlot.phaseSeconds] * 6) * -1;
  context.rotate(tilt);
  context.scale(scale, scale);
  if (hoverboard) {
    const board = context.createLinearGradient(-0.6, 0, 0.6, 0);
    board.addColorStop(0, '#6cc3f0'); board.addColorStop(1, '#b49af0');
    context.fillStyle = 'rgba(150,220,255,0.35)';
    context.beginPath(); context.ellipse(0, 0.16, 0.75, 0.16, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = board;
    context.beginPath(); context.ellipse(0, 0.06, 0.62, 0.1, 0, 0, Math.PI * 2); context.fill();
  }
  const sneakers = render[RenderSlot.sneakersSeconds] > 0;
  if (motion === Motion.Rolling && !crashed) drawRolledRunner(context, render[RenderSlot.rollSeconds], time);
  else drawStandingRunner(context, render[RenderSlot.runCycle], motion === Motion.Airborne && !crashed, render[RenderSlot.verticalVelocity], sneakers, phase === Phase.Ready);
  if (crashed && !caught) {
    // dizzy stars
    context.fillStyle = '#f6cf6a';
    for (let star = 0; star < 3; star++) {
      const angle = time * 5 + (star * Math.PI * 2) / 3;
      context.beginPath(); context.arc(Math.cos(angle) * 0.3, -1.85 + Math.sin(angle) * 0.08, 0.06, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
  context.globalAlpha = 1;
  scene.runnerLeft = feetX - 0.45 * scale;
  scene.runnerRight = feetX + 0.45 * scale;
  scene.runnerTop = feetY - (motion === Motion.Rolling ? 0.85 : 1.75) * scale;
  scene.runnerBottom = feetY;
  // the magnet's pull: a soft ring
  if (render[RenderSlot.magnetSeconds] > 0) {
    context.strokeStyle = `rgba(240,140,140,${(0.35 + 0.2 * Math.sin(time * 8)).toFixed(2)})`;
    context.lineWidth = Math.max(1.5, 0.05 * scale);
    context.beginPath(); context.ellipse(feetX, feetY - 0.9 * scale, 0.75 * scale, 0.95 * scale, 0, 0, Math.PI * 2); context.stroke();
  }
}

const HOODIE = '#4fb3a9', HOODIE_DARK = '#3d968e', SHORTS = '#5a6b8f', SKIN = '#e9b48f', HAIR = '#6b4a3a', CAP = '#f39c7f', PACK = '#f6cf6a', SHOE = '#ffffff';

function limb(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, width: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath(); context.moveTo(fromX, fromY); context.lineTo(toX, toY); context.stroke();
}

function drawStandingRunner(context: CanvasRenderingContext2D, cycle: number, airborne: boolean, verticalVelocity: number, sneakers: boolean, idle: boolean) {
  const swing = Math.sin(cycle * Math.PI * 2);
  const bob = airborne ? 0 : Math.abs(Math.cos(cycle * Math.PI * 2)) * 0.05;
  const hipY = -0.86 - bob;
  // legs: from behind, a running stride shows as feet lifting in turn
  const tuck = airborne ? (verticalVelocity > 0 ? 0.35 : 0.2) : 0;
  const leftLift = airborne ? tuck : idle ? 0 : Math.max(0, swing) * 0.32;
  const rightLift = airborne ? tuck * 0.7 : idle ? 0 : Math.max(0, -swing) * 0.32;
  limb(context, -0.11, hipY, -0.14, -0.08 - leftLift, 0.17, SHORTS);
  limb(context, 0.11, hipY, 0.14, -0.08 - rightLift, 0.17, SHORTS);
  limb(context, -0.14, -0.3 - leftLift, -0.14, -0.1 - leftLift, 0.13, SKIN);
  limb(context, 0.14, -0.3 - rightLift, 0.14, -0.1 - rightLift, 0.13, SKIN);
  context.fillStyle = sneakers ? '#8fdc7e' : SHOE;
  context.beginPath();
  context.ellipse(-0.15, -0.05 - leftLift, 0.12, 0.07 + leftLift * 0.12, 0, 0, Math.PI * 2);
  context.ellipse(0.15, -0.05 - rightLift, 0.12, 0.07 + rightLift * 0.12, 0, 0, Math.PI * 2);
  context.fill();
  if (sneakers) {
    context.fillStyle = 'rgba(200,255,170,0.6)';
    context.beginPath(); context.ellipse(0, -0.05, 0.36, 0.1, 0, 0, Math.PI * 2); context.fill();
  }
  // arms swing opposite the legs (up high in a jump)
  const armLift = airborne ? 0.45 : 0;
  limb(context, -0.27, hipY - 0.45, -0.36, hipY - 0.12 - armLift + (idle ? 0 : swing * 0.12), 0.14, HOODIE_DARK);
  limb(context, 0.27, hipY - 0.45, 0.36, hipY - 0.12 - armLift - (idle ? 0 : swing * 0.12), 0.14, HOODIE_DARK);
  context.fillStyle = SKIN;
  context.beginPath();
  context.arc(-0.37, hipY - 0.1 - armLift + (idle ? 0 : swing * 0.12), 0.07, 0, Math.PI * 2);
  context.arc(0.37, hipY - 0.1 - armLift - (idle ? 0 : swing * 0.12), 0.07, 0, Math.PI * 2);
  context.fill();
  // body and backpack
  context.fillStyle = HOODIE;
  context.beginPath(); context.roundRect(-0.27, hipY - 0.62, 0.54, 0.66, 0.14); context.fill();
  context.fillStyle = PACK;
  context.beginPath(); context.roundRect(-0.19, hipY - 0.52, 0.38, 0.42, 0.1); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(-0.13, hipY - 0.36, 0.26, 0.05);
  // head: hair from behind and a cap on backwards
  const headY = hipY - 0.8;
  context.fillStyle = SKIN;
  context.beginPath(); context.arc(-0.16, headY + 0.04, 0.05, 0, Math.PI * 2); context.arc(0.16, headY + 0.04, 0.05, 0, Math.PI * 2); context.fill();
  context.fillStyle = HAIR;
  context.beginPath(); context.arc(0, headY, 0.17, 0, Math.PI * 2); context.fill();
  context.fillStyle = CAP;
  context.beginPath(); context.arc(0, headY - 0.03, 0.175, Math.PI, 0); context.fill();
  context.beginPath(); context.roundRect(-0.12, headY - 0.02, 0.24, 0.07, 0.03); context.fill();
}

function drawRolledRunner(context: CanvasRenderingContext2D, rollSeconds: number, time: number) {
  const spin = time * 14;
  context.fillStyle = HOODIE;
  context.beginPath(); context.ellipse(0, -0.42, 0.42, 0.4, 0, 0, Math.PI * 2); context.fill();
  context.save();
  context.translate(0, -0.42);
  context.rotate(spin);
  context.fillStyle = PACK;
  context.beginPath(); context.roundRect(-0.2, -0.14, 0.4, 0.28, 0.08); context.fill();
  context.restore();
  context.fillStyle = CAP;
  context.beginPath(); context.arc(0, -0.78, 0.13, Math.PI, 0); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.beginPath(); context.ellipse(0, -0.02, 0.45 * Math.min(1, rollSeconds * 3 + 0.4), 0.06, 0, 0, Math.PI * 2); context.fill();
}

/** The chaser: a station guard (navy coat, peaked cap, waving a hand) with a little sandy dog, seen from behind. */
function drawChaser(scene: Scene, render: Float32Array, time: number) {
  const { context } = scene;
  const gap = render[RenderSlot.chaserGap];
  const z = -gap;
  const x = render[RenderSlot.playerX] * 0.85;
  const phase = render[RenderSlot.phase];
  const scale = scaleAt(z);
  const step = Math.sin(time * (phase === Phase.Playing ? 14 : 6));
  // the guard, a step to the left of the runner's lane
  const guardX = screenX(x - 0.7, z), guardY = screenY(render[RenderSlot.surface], z);
  context.save();
  context.translate(guardX, guardY);
  context.scale(scale, scale);
  limb(context, -0.13, -0.9, -0.15, -0.06 - Math.max(0, step) * 0.25, 0.2, '#3c4766');
  limb(context, 0.13, -0.9, 0.15, -0.06 - Math.max(0, -step) * 0.25, 0.2, '#3c4766');
  context.fillStyle = '#2f3550';
  context.beginPath(); context.ellipse(-0.15, -0.04, 0.12, 0.07, 0, 0, Math.PI * 2); context.ellipse(0.15, -0.04, 0.12, 0.07, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#4a5a86';
  context.beginPath(); context.roundRect(-0.32, -1.62, 0.64, 0.82, 0.16); context.fill();
  limb(context, -0.3, -1.5, -0.42, -1.05 + step * 0.08, 0.16, '#4a5a86');
  limb(context, 0.3, -1.5, 0.5, -1.95 - Math.abs(step) * 0.1, 0.16, '#4a5a86'); // a hand waving "stop!"
  context.fillStyle = '#efc19f';
  context.beginPath(); context.arc(0.52, -2.02 - Math.abs(step) * 0.1, 0.08, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#e8b896';
  context.beginPath(); context.arc(0, -1.82, 0.19, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#2f3550';
  context.beginPath(); context.ellipse(0, -1.95, 0.24, 0.08, 0, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(0, -1.98, 0.17, Math.PI, 0); context.fill();
  context.fillStyle = '#f2cf78';
  context.fillRect(-0.04, -2.1, 0.08, 0.06);
  context.restore();
  // the dog, on the other side
  const dogX = screenX(x + 0.75, z), dogY = screenY(render[RenderSlot.surface], z);
  context.save();
  context.translate(dogX, dogY);
  context.scale(scale, scale);
  const hop = Math.abs(step) * 0.08;
  context.fillStyle = '#d9a66f';
  context.beginPath(); context.ellipse(0, -0.42 - hop, 0.2, 0.22, 0, 0, Math.PI * 2); context.fill();
  limb(context, -0.1, -0.3 - hop, -0.11, -0.04, 0.08, '#c28f5a');
  limb(context, 0.1, -0.3 - hop, 0.11, -0.04, 0.08, '#c28f5a');
  context.beginPath(); context.arc(0, -0.72 - hop, 0.15, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#a5743f';
  context.beginPath(); context.ellipse(-0.13, -0.78 - hop, 0.05, 0.1, -0.4, 0, Math.PI * 2); context.ellipse(0.13, -0.78 - hop, 0.05, 0.1, 0.4, 0, Math.PI * 2); context.fill();
  limb(context, 0, -0.52 - hop, Math.sin(time * 20) * 0.15, -0.72 - hop, 0.06, '#c28f5a'); // a wagging tail
  context.restore();
}

// ---------- particles, pop-ups, speed lines ----------
export function addSparkles(scene: Scene, count: number, color: number) {
  const x = scene.runnerLeft + (scene.runnerRight - scene.runnerLeft) / 2;
  const y = scene.runnerTop + (scene.runnerBottom - scene.runnerTop) * 0.35;
  const size = scene.runnerRight - scene.runnerLeft;
  for (let index = 0; index < count; index++) {
    if (scene.particleCount >= PARTICLE_CAPACITY) break;
    const base = scene.particleCount * PARTICLE_STRIDE;
    const angle = Math.random() * Math.PI * 2;
    const speed = size * (1.2 + Math.random() * 2.2);
    scene.particles[base] = x + Math.cos(angle) * size * 0.2;
    scene.particles[base + 1] = y + Math.sin(angle) * size * 0.2;
    scene.particles[base + 2] = Math.cos(angle) * speed;
    scene.particles[base + 3] = Math.sin(angle) * speed - size * 1.5;
    scene.particles[base + 4] = 0;
    scene.particles[base + 5] = 0.45 + Math.random() * 0.3;
    scene.particles[base + 6] = color;
    scene.particleCount++;
  }
}

export function addPopup(scene: Scene, text: string, color = '#fff3c4', size = 1) {
  if (scene.popups.length >= POPUP_CAPACITY) scene.popups.shift();
  const x = (scene.runnerLeft + scene.runnerRight) / 2 + (Math.random() - 0.5) * (scene.runnerRight - scene.runnerLeft);
  scene.popups.push({ text, x, y: scene.runnerTop - 6, age: 0, life: 0.8, size, color });
}

const SPARKLE_COLORS = ['#ffe28a', '#ffffff', '#b8ecff', '#d6c4ff'];

function drawEffects(scene: Scene, render: Float32Array, time: number, seconds: number) {
  const { context, width, height } = scene;
  // speed lines toward the vanishing point: faster runs, super jumps
  const speed = render[RenderSlot.speed];
  const boosted = render[RenderSlot.verticalVelocity] > 12;
  const strength = Math.max(0, (speed - 15) / 12) + (boosted ? 0.6 : 0);
  if (strength > 0.02 && render[RenderSlot.phase] === Phase.Playing) {
    const vanishX = centreX - (cameraX * focal) / 200;
    const lines = Math.min(18, Math.floor(6 + strength * 10));
    context.strokeStyle = `rgba(255,255,255,${Math.min(0.5, 0.18 + strength * 0.25).toFixed(2)})`;
    context.lineWidth = Math.max(1, width / 500);
    context.beginPath();
    const reach = Math.hypot(width, height);
    for (let line = 0; line < lines; line++) {
      const seed = Math.floor(time * 12) * 31 + line * 7;
      const angle = hash(seed) * Math.PI * 2;
      const from = reach * (0.32 + hash(seed + 1) * 0.2);
      const length = reach * (0.06 + hash(seed + 2) * 0.1) * (0.6 + strength);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      context.moveTo(vanishX + cos * from, horizon + sin * from);
      context.lineTo(vanishX + cos * (from + length), horizon + sin * (from + length));
    }
    context.stroke();
  }
  // sparkles
  const particles = scene.particles;
  let alive = 0;
  for (let index = 0; index < scene.particleCount; index++) {
    const base = index * PARTICLE_STRIDE;
    const age = particles[base + 4] + seconds;
    const life = particles[base + 5];
    if (age >= life) continue;
    const target = alive * PARTICLE_STRIDE;
    if (target !== base) particles.copyWithin(target, base, base + PARTICLE_STRIDE);
    particles[target + 4] = age;
    particles[target] += particles[target + 2] * seconds;
    particles[target + 1] += particles[target + 3] * seconds;
    particles[target + 3] += height * 1.2 * seconds;
    const fade = 1 - age / life;
    const size = Math.max(1.5, (scene.runnerRight - scene.runnerLeft) * 0.07 * (0.5 + fade));
    context.globalAlpha = fade;
    context.fillStyle = SPARKLE_COLORS[particles[target + 6] | 0] ?? '#ffffff';
    const px = particles[target], py = particles[target + 1];
    context.beginPath();
    context.moveTo(px, py - size); context.lineTo(px + size * 0.3, py - size * 0.3); context.lineTo(px + size, py); context.lineTo(px + size * 0.3, py + size * 0.3);
    context.lineTo(px, py + size); context.lineTo(px - size * 0.3, py + size * 0.3); context.lineTo(px - size, py); context.lineTo(px - size * 0.3, py - size * 0.3);
    context.closePath();
    context.fill();
    alive++;
  }
  scene.particleCount = alive;
  context.globalAlpha = 1;
  // score pop-ups float up and fade
  if (scene.popups.length) {
    const baseSize = Math.max(14, Math.min(30, height * 0.035));
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    for (let index = scene.popups.length - 1; index >= 0; index--) {
      const popup = scene.popups[index];
      popup.age += seconds;
      if (popup.age >= popup.life) { scene.popups.splice(index, 1); continue; }
      const progress = popup.age / popup.life;
      context.globalAlpha = 1 - progress * progress;
      context.font = `900 ${Math.round(baseSize * popup.size * (progress < 0.15 ? 0.8 + progress * 1.4 : 1))}px system-ui, sans-serif`;
      const y = popup.y - progress * height * 0.09;
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(70,60,100,0.55)';
      context.strokeText(popup.text, popup.x, y);
      context.fillStyle = popup.color;
      context.fillText(popup.text, popup.x, y);
    }
    context.globalAlpha = 1;
  }
}
