/** Saving and restoring an in-progress Power of 2 game (see ../persistence.ts). */
import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { GameState, newId, SIZE } from './game';

export const GAME_2048_SAVE_VERSION = 1;

export interface Saved2048 {
  tiles: { value: number; row: number; col: number }[];
  score: number;
  won: boolean;
  over: boolean;
  keepPlaying: boolean;
}

export function serialize2048(state: GameState): Saved2048 {
  return {
    tiles: state.tiles.map(tile => ({ value: tile.value, row: tile.row, col: tile.col })),
    score: state.score,
    won: state.won,
    over: state.over,
    keepPlaying: state.keepPlaying,
  };
}

const isTileValue = (value: unknown) => isInteger(value, 2, 2 ** 20) && ((value as number) & ((value as number) - 1)) === 0;

/** A finished game (over) is not restored, so it is rejected here too. */
export function parse2048Save(data: unknown): Saved2048 | null {
  if (!isRecord(data) || !Array.isArray(data.tiles) || data.tiles.length > SIZE * SIZE) return null;
  if (!isInteger(data.score, 0) || typeof data.won !== 'boolean' || typeof data.keepPlaying !== 'boolean' || data.over !== false) return null;
  const usedCells = new Set<number>();
  for (const tile of data.tiles) {
    if (!isRecord(tile) || !isTileValue(tile.value) || !isInteger(tile.row, 0, SIZE - 1) || !isInteger(tile.col, 0, SIZE - 1)) return null;
    const cell = (tile.row as number) * SIZE + (tile.col as number);
    if (usedCells.has(cell)) return null;
    usedCells.add(cell);
  }
  if (usedCells.size === 0) return null;
  return data as unknown as Saved2048;
}

export function restore2048(saved: Saved2048): GameState {
  return {
    tiles: saved.tiles.map(tile => ({ id: newId(), value: tile.value, row: tile.row, col: tile.col })),
    score: saved.score,
    won: saved.won,
    over: false,
    keepPlaying: saved.keepPlaying,
  };
}

export const create2048SaveSlot = () => createSaveSlot({ gameId: 'power-of-2', version: GAME_2048_SAVE_VERSION, parse: parse2048Save });
