import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { ArrowGameState, canEscape, LIVES_PER_LEVEL, startLevel } from './game';

export const MAX_LEVEL = 999;
/** Version 2: winding arrows (version 1 saves were for straight arrows and are discarded). */
export const ARROW_SAVE_VERSION = 2;

export interface SavedArrowGame {
  levelNumber: number;
  removedIds: number[];
  livesLeft: number;
  mistakes: number;
  hintsUsed: number;
}

/** Levels are rebuilt from their number, so a save is just the level and which arrows have left (in order). */
export function serializeArrowGame(state: ArrowGameState): SavedArrowGame | null {
  if (state.status !== 'playing') return null;
  const { level, removedIds, livesLeft, mistakes, hintsUsed } = state;
  return { levelNumber: level.number, removedIds, livesLeft, mistakes, hintsUsed };
}

/** Rebuilds the game and replays the removals, rejecting any that wouldn't have been legal. */
export function restoreArrowGame(data: unknown): ArrowGameState | null {
  if (!isRecord(data) || !isInteger(data.levelNumber, 1, MAX_LEVEL) || !isInteger(data.livesLeft, 1, LIVES_PER_LEVEL)) return null;
  if (!isInteger(data.mistakes, 0) || !isInteger(data.hintsUsed, 0) || !Array.isArray(data.removedIds)) return null;
  let state = startLevel(data.levelNumber);
  for (const arrowId of data.removedIds) {
    if (!isInteger(arrowId) || !canEscape(state, arrowId)) return null;
    state = { ...state, removedIds: [...state.removedIds, arrowId] };
  }
  if (state.removedIds.length === state.level.arrows.length) return null; // a finished level is never restored
  return { ...state, livesLeft: data.livesLeft, mistakes: data.mistakes, hintsUsed: data.hintsUsed };
}

export const parseArrowSave = (data: unknown): SavedArrowGame | null => (restoreArrowGame(data) ? (data as SavedArrowGame) : null);

export const createArrowSaveSlot = () => createSaveSlot({ gameId: 'arrow-out', version: ARROW_SAVE_VERSION, parse: parseArrowSave });
