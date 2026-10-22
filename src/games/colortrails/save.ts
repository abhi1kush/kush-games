import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { isSolved, MAX_LEVEL, pathsAreValid, startLevel, TrailsState } from './game';

export const TRAILS_SAVE_VERSION = 1;

export interface SavedTrailsGame {
  levelNumber: number;
  paths: number[][];
  moves: number;
  lastMovedColor: number | null;
  hintsUsed: number;
}

export function serializeTrailsGame(state: TrailsState): SavedTrailsGame | null {
  if (state.status !== 'playing') return null;
  const { level, paths, moves, lastMovedColor, hintsUsed } = state;
  return { levelNumber: level.number, paths, moves, lastMovedColor, hintsUsed };
}

/** Rebuild a game from a save; null if anything doesn't fit the level (bad paths, a finished board…). */
export function restoreTrailsGame(data: unknown): TrailsState | null {
  if (!isRecord(data) || !isInteger(data.levelNumber, 1, MAX_LEVEL) || !isInteger(data.moves, 0) || !isInteger(data.hintsUsed, 0)) return null;
  const fresh = startLevel(data.levelNumber);
  const colorCount = fresh.level.endpoints.length;
  if (data.lastMovedColor !== null && !isInteger(data.lastMovedColor, 0, colorCount - 1)) return null;
  if (!pathsAreValid(fresh.level, data.paths) || isSolved(fresh.level, data.paths)) return null;
  return { ...fresh, paths: data.paths, moves: data.moves, hintsUsed: data.hintsUsed, lastMovedColor: data.lastMovedColor as number | null };
}

export const parseTrailsSave = (data: unknown): SavedTrailsGame | null => (restoreTrailsGame(data) ? (data as SavedTrailsGame) : null);

export const createTrailsSaveSlot = () => createSaveSlot({ gameId: 'color-trails', version: TRAILS_SAVE_VERSION, parse: parseTrailsSave });
