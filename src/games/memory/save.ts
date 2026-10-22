import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';
import { GRID_SIZES, gridSizeById, GridSizeId, hideMismatch, isComplete, MemoryState } from './game';

const SIZE_IDS = GRID_SIZES.map(size => size.id) as GridSizeId[];

/** Only unfinished games are saved; a showing mismatch is saved turned back. */
export function serializeMemory(state: MemoryState): MemoryState | null {
  if (isComplete(state) || (state.moves === 0 && state.openIndexes.length === 0)) return null;
  return { ...hideMismatch(state), elapsedMs: Math.round(state.elapsedMs) };
}

export function parseMemorySave(data: unknown): MemoryState | null {
  if (!isRecord(data) || !isOneOf(data.size, SIZE_IDS)) return null;
  const { columns, rows } = gridSizeById(data.size);
  const cardCount = columns * rows;
  const { faces, matched, openIndexes } = data;
  if (!Array.isArray(faces) || faces.length !== cardCount || !faces.every(face => typeof face === 'string' && face.length > 0 && face.length < 12)) return null;
  const faceCounts = new Map<string, number>();
  for (const face of faces as string[]) faceCounts.set(face, (faceCounts.get(face) ?? 0) + 1);
  if ([...faceCounts.values()].some(count => count !== 2)) return null;
  if (!Array.isArray(matched) || matched.length !== cardCount || !matched.every(value => typeof value === 'boolean')) return null;
  const faceList = faces as string[];
  const partnerOf = (index: number) => faceList.findIndex((face, other) => other !== index && face === faceList[index]);
  if (faceList.some((_, index) => matched[index] !== matched[partnerOf(index)])) return null;
  if (!Array.isArray(openIndexes) || openIndexes.length > 1 || !openIndexes.every(index => isInteger(index, 0, cardCount - 1) && !matched[index])) return null;
  if (!isInteger(data.moves, 0) || !isInteger(data.elapsedMs, 0)) return null;
  const state = data as unknown as MemoryState;
  return isComplete(state) ? null : state;
}

export const createMemorySaveSlot = () => createSaveSlot({ gameId: 'memory-match', version: 1, parse: parseMemorySave });
