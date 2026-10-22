import { createSaveSlot, isInteger, isRecord } from '../persistence';

export interface SavedBreakout { level: number; score: number; lives: number; bricks: number[]; }

export function parseBreakoutSave(data: unknown): SavedBreakout | null {
  if (!isRecord(data) || !isInteger(data.level, 1, 999) || !isInteger(data.score, 0) || !isInteger(data.lives, 1, 5)
    || !Array.isArray(data.bricks) || data.bricks.length !== 90 || !data.bricks.every(hits => isInteger(hits, 0, 9))) return null;
  return { level: data.level, score: data.score, lives: data.lives, bricks: data.bricks as number[] };
}

export const createBreakoutSaveSlot = () => createSaveSlot({ gameId: 'breakout', version: 1, parse: parseBreakoutSave, throttleMs: 1500 });
