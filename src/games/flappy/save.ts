import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { FlappyState, GROUND_TOP, hitsSomething, MAX_GAP_Y, MIN_GAP_Y, WORLD_WIDTH } from './physics';

const isFiniteNumber = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

/** Only a run in progress (playing or paused) is saved, always as paused. */
export function serializeFlappy(state: FlappyState): FlappyState | null {
  if (state.status !== 'playing' && state.status !== 'paused') return null;
  return { ...state, status: 'paused' };
}

/** Saves always come back paused, so the player chooses when to continue. */
export function parseFlappySave(data: unknown): FlappyState | null {
  if (!isRecord(data) || !isFiniteNumber(data.birdY, 0, GROUND_TOP) || !isFiniteNumber(data.velocityY, -2000, 2000)) return null;
  if (!isInteger(data.score, 0) || !isFiniteNumber(data.distance, 0, 1e9) || !isFiniteNumber(data.time, 0, 1e9) || !isInteger(data.randomSeed, -(2 ** 31), 2 ** 31)) return null;
  if (!Array.isArray(data.pipes) || data.pipes.length > 10) return null;
  const pipesValid = data.pipes.every(pipe => isRecord(pipe) && isFiniteNumber(pipe.x, -100, WORLD_WIDTH + 400) && isFiniteNumber(pipe.gapY, MIN_GAP_Y - 1, MAX_GAP_Y + 1) && typeof pipe.scored === 'boolean');
  if (!pipesValid) return null;
  const state: FlappyState = { ...(data as unknown as FlappyState), status: 'paused' };
  return hitsSomething(state.birdY, state.pipes) ? null : state;
}

export const createFlappySaveSlot = () => createSaveSlot({ gameId: 'flappy-wings', version: 1, parse: parseFlappySave, throttleMs: 1000 });
