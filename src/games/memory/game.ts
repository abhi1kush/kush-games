/** Memory Match: find all the pairs of emoji cards. Pure logic. */
import { createRandom, shuffled } from '../random';

export type GridSizeId = '4x4' | '4x5' | '6x6';
export const GRID_SIZES: { id: GridSizeId; columns: number; rows: number }[] = [
  { id: '4x4', columns: 4, rows: 4 },
  { id: '4x5', columns: 4, rows: 5 },
  { id: '6x6', columns: 6, rows: 6 },
];
export const gridSizeById = (id: GridSizeId) => GRID_SIZES.find(size => size.id === id) ?? GRID_SIZES[0];

export const EMOJI_FACES = ['🍎', '🐶', '🚀', '🌈', '🎸', '🍕', '🦄', '⚽', '🐙', '🌵', '🎲', '🍩', '🐢', '⭐', '🧩', '🍉', '🦊', '🎈'];

export interface MemoryState {
  size: GridSizeId;
  /** Face of each card; every face appears exactly twice. */
  faces: string[];
  matched: boolean[];
  /** Face-up cards that are not matched yet (0, 1 or 2). */
  openIndexes: number[];
  /** One move = turning over a pair. */
  moves: number;
  elapsedMs: number;
}

export function createMemoryGame(size: GridSizeId, seed: number): MemoryState {
  const { columns, rows } = gridSizeById(size);
  const pairCount = (columns * rows) / 2;
  const random = createRandom(seed);
  const chosenFaces = shuffled(EMOJI_FACES, random).slice(0, pairCount);
  const faces = shuffled([...chosenFaces, ...chosenFaces], random);
  return { size, faces, matched: Array(faces.length).fill(false), openIndexes: [], moves: 0, elapsedMs: 0 };
}

/** Two cards are open and don't match: they wait to be turned back. */
export const isMismatchShowing = (state: MemoryState) => state.openIndexes.length === 2;
export const isComplete = (state: MemoryState) => state.matched.every(Boolean);

export type FlipResult = 'ignored' | 'first' | 'match' | 'mismatch';

/**
 * Turn over a card. A matching second card stays up; a mismatch stays visible until hideMismatch()
 * (called after a short delay, or straight away when a third card is tapped).
 */
export function flipCard(state: MemoryState, index: number): { state: MemoryState; result: FlipResult } {
  if (isComplete(state) || state.matched[index] || state.openIndexes.includes(index)) return { state, result: 'ignored' };
  const current = isMismatchShowing(state) ? hideMismatch(state) : state;
  if (current.openIndexes.length === 0) return { state: { ...current, openIndexes: [index] }, result: 'first' };
  const firstIndex = current.openIndexes[0];
  const moves = current.moves + 1;
  if (current.faces[firstIndex] === current.faces[index]) {
    const matched = [...current.matched];
    matched[firstIndex] = matched[index] = true;
    return { state: { ...current, matched, openIndexes: [], moves }, result: 'match' };
  }
  return { state: { ...current, openIndexes: [firstIndex, index], moves }, result: 'mismatch' };
}

export function hideMismatch(state: MemoryState): MemoryState {
  return isMismatchShowing(state) ? { ...state, openIndexes: [] } : state;
}
