/**
 * Flappy Wings physics in a fixed 288×512 world (units are world pixels and seconds).
 * Pure functions: the component advances it with a fixed timestep, tests drive it directly.
 */
export const WORLD_WIDTH = 288;
export const WORLD_HEIGHT = 512;
export const GROUND_HEIGHT = 56;
export const GROUND_TOP = WORLD_HEIGHT - GROUND_HEIGHT;
export const BIRD_X = 80;
export const BIRD_RADIUS = 12;
export const GRAVITY = 1500;
export const FLAP_VELOCITY = -420;
export const MAX_FALL_SPEED = 620;
export const PIPE_WIDTH = 52;
export const PIPE_GAP = 130;
export const PIPE_SPACING = 180;
export const PIPE_SPEED = 140;
/** Keep gaps at least this far from the top and the ground. */
const GAP_MARGIN = 50;
export const FIXED_STEP_SECONDS = 1 / 120;

export type FlappyStatus = 'ready' | 'playing' | 'paused' | 'over';

export interface Pipe {
  /** Left edge. */
  x: number;
  /** Centre of the gap. */
  gapY: number;
  scored: boolean;
}

export interface FlappyState {
  status: FlappyStatus;
  birdY: number;
  velocityY: number;
  pipes: Pipe[];
  score: number;
  /** World distance travelled (scrolls the ground). */
  distance: number;
  /** Seconds since start (makes the bird bob while ready). */
  time: number;
  /** Seed of the pipe-gap random generator, kept in the state so saves replay the same pipes. */
  randomSeed: number;
}

/** One step of mulberry32 that returns the value and the next seed. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let mixed = nextSeed;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, seed: nextSeed };
}

const START_Y = WORLD_HEIGHT * 0.42;

export function createFlappy(seed: number): FlappyState {
  return { status: 'ready', birdY: START_Y, velocityY: 0, pipes: [], score: 0, distance: 0, time: 0, randomSeed: seed | 0 };
}

export const MIN_GAP_Y = GAP_MARGIN + PIPE_GAP / 2;
export const MAX_GAP_Y = GROUND_TOP - GAP_MARGIN - PIPE_GAP / 2;

/** Flap: starts the game from ready, or gives the bird an upward kick while playing. */
export function flap(state: FlappyState): FlappyState {
  if (state.status === 'ready') return { ...state, status: 'playing', velocityY: FLAP_VELOCITY };
  if (state.status === 'playing') return { ...state, velocityY: FLAP_VELOCITY };
  return state;
}

export function setPaused(state: FlappyState, paused: boolean): FlappyState {
  if (paused && state.status === 'playing') return { ...state, status: 'paused' };
  if (!paused && state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

/** Does a circle overlap an axis-aligned rectangle? */
export function circleHitsRect(circleX: number, circleY: number, radius: number, left: number, top: number, width: number, height: number): boolean {
  if (height <= 0 || width <= 0) return false;
  const nearestX = Math.max(left, Math.min(circleX, left + width));
  const nearestY = Math.max(top, Math.min(circleY, top + height));
  const deltaX = circleX - nearestX;
  const deltaY = circleY - nearestY;
  return deltaX * deltaX + deltaY * deltaY < radius * radius;
}

/** True when the bird touches the ground or a pipe. */
export function hitsSomething(birdY: number, pipes: Pipe[]): boolean {
  if (birdY + BIRD_RADIUS >= GROUND_TOP) return true;
  return pipes.some(pipe =>
    circleHitsRect(BIRD_X, birdY, BIRD_RADIUS, pipe.x, -1000, PIPE_WIDTH, pipe.gapY - PIPE_GAP / 2 + 1000) ||
    circleHitsRect(BIRD_X, birdY, BIRD_RADIUS, pipe.x, pipe.gapY + PIPE_GAP / 2, PIPE_WIDTH, GROUND_TOP - (pipe.gapY + PIPE_GAP / 2)));
}

/** Advance the world by `seconds` (call with FIXED_STEP_SECONDS). */
export function step(state: FlappyState, seconds: number): FlappyState {
  if (state.status === 'paused') return state;
  const time = state.time + seconds;
  if (state.status === 'ready') {
    return { ...state, time, distance: state.distance + PIPE_SPEED * seconds, birdY: START_Y + Math.sin(time * 4) * 6 };
  }
  if (state.status === 'over') {
    // the bird drops to the ground after a crash
    if (state.birdY + BIRD_RADIUS >= GROUND_TOP) return state;
    const velocityY = Math.min(MAX_FALL_SPEED, state.velocityY + GRAVITY * seconds);
    return { ...state, time, velocityY, birdY: Math.min(GROUND_TOP - BIRD_RADIUS, state.birdY + velocityY * seconds) };
  }
  let velocityY = Math.min(MAX_FALL_SPEED, state.velocityY + GRAVITY * seconds);
  let birdY = state.birdY + velocityY * seconds;
  if (birdY < BIRD_RADIUS) { birdY = BIRD_RADIUS; velocityY = 0; } // the sky is a soft ceiling

  let randomSeed = state.randomSeed;
  let score = state.score;
  const pipes: Pipe[] = [];
  for (const pipe of state.pipes) {
    const moved = { ...pipe, x: pipe.x - PIPE_SPEED * seconds };
    if (moved.x + PIPE_WIDTH < -2) continue;
    if (!moved.scored && moved.x + PIPE_WIDTH / 2 < BIRD_X) { moved.scored = true; score++; }
    pipes.push(moved);
  }
  const lastPipe = pipes[pipes.length - 1];
  if (!lastPipe || lastPipe.x <= WORLD_WIDTH - PIPE_SPACING) {
    const random = nextRandom(randomSeed);
    randomSeed = random.seed;
    // the first pipe starts a little further away to give time to get going
    pipes.push({ x: lastPipe ? lastPipe.x + PIPE_SPACING : WORLD_WIDTH + 60, gapY: MIN_GAP_Y + random.value * (MAX_GAP_Y - MIN_GAP_Y), scored: false });
  }
  const crashed = hitsSomething(birdY, pipes);
  if (crashed && birdY + BIRD_RADIUS > GROUND_TOP) birdY = GROUND_TOP - BIRD_RADIUS;
  return {
    ...state, time, birdY, velocityY, pipes, score, randomSeed, distance: state.distance + PIPE_SPEED * seconds,
    status: crashed ? 'over' : 'playing',
  };
}

/** The first pipe the bird hasn't passed yet (used by the e2e autopilot and the tests). */
export const nextPipe = (state: FlappyState) => state.pipes.find(pipe => pipe.x + PIPE_WIDTH > BIRD_X - BIRD_RADIUS);
