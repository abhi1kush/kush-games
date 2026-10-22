import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';

export type PlayMode = 'computer' | 'friends';
export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard'] as const;
export interface SavedCheckers { mode: PlayMode; level: number; history: number[]; }

export function parseCheckersSave(data: unknown): SavedCheckers | null {
  if (!isRecord(data) || !isOneOf(data.mode, ['computer', 'friends'] as const) || !isInteger(data.level, 0, 2)
    || !Array.isArray(data.history) || data.history.length > 2000 || !data.history.every(index => isInteger(index, 0, 255))) return null;
  return { mode: data.mode, level: data.level, history: data.history as number[] };
}

export const createCheckersSaveSlot = () => createSaveSlot({ gameId: 'checkers', version: 1, parse: parseCheckersSave });
