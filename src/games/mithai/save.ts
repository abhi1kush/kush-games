import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { LEVEL_COUNT } from './engine';

/** Level progress: how far the path is unlocked, stars and best score per level. */
export interface SavedMithai { unlocked: number; stars: number[]; best: number[]; }

export const emptyMithaiProgress = (): SavedMithai => ({ unlocked: 0, stars: new Array(LEVEL_COUNT).fill(0), best: new Array(LEVEL_COUNT).fill(0) });

export function parseMithaiSave(data: unknown): SavedMithai | null {
  if (!isRecord(data) || !isInteger(data.unlocked, 0, LEVEL_COUNT - 1) || !Array.isArray(data.stars) || !Array.isArray(data.best)
    || data.stars.length !== LEVEL_COUNT || data.best.length !== LEVEL_COUNT
    || !data.stars.every(value => isInteger(value, 0, 3)) || !data.best.every(value => isInteger(value, 0, 9_999_999))) return null;
  return { unlocked: data.unlocked, stars: [...data.stars] as number[], best: [...data.best] as number[] };
}

export const createMithaiSaveSlot = () => createSaveSlot({ gameId: 'mithai-match', version: 1, parse: parseMithaiSave });
