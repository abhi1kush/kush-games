import { createSaveSlot, isInteger, isRecord } from '../persistence';

export interface SavedSolitaire { seed: number; drawCount: 1 | 3; actions: number[]; elapsedSeconds: number; }

export function parseSolitaireSave(data: unknown): SavedSolitaire | null {
  if (!isRecord(data) || !isInteger(data.seed, 0, 0xffffffff) || (data.drawCount !== 1 && data.drawCount !== 3) || !isInteger(data.elapsedSeconds, 0)
    || !Array.isArray(data.actions) || data.actions.length % 3 !== 0 || data.actions.length > 30_000 || !data.actions.every(value => isInteger(value, 0, 255))) return null;
  return { seed: data.seed, drawCount: data.drawCount, actions: data.actions as number[], elapsedSeconds: data.elapsedSeconds };
}

export const createSolitaireSaveSlot = () => createSaveSlot({ gameId: 'solitaire', version: 1, parse: parseSolitaireSave });
