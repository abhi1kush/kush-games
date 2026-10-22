import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';

export type PlayMode = 'computer' | 'friends';
export type DiscColor = 'red' | 'yellow';
export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard'] as const;

export interface SavedConnectFour {
  mode: PlayMode;
  level: number;
  /** Color of the player who moved first in this game (you are always red against the computer). */
  firstColor: DiscColor;
  /** Columns played, in order. */
  history: number[];
}

export function parseConnectFourSave(data: unknown): SavedConnectFour | null {
  if (!isRecord(data) || !isOneOf(data.mode, ['computer', 'friends'] as const) || !isInteger(data.level, 0, 2)
    || !isOneOf(data.firstColor, ['red', 'yellow'] as const) || !Array.isArray(data.history) || data.history.length > 42
    || !data.history.every(column => isInteger(column, 0, 6))) return null;
  return { mode: data.mode, level: data.level, firstColor: data.firstColor, history: data.history as number[] };
}

export const createConnectFourSaveSlot = () => createSaveSlot({ gameId: 'connect-four', version: 1, parse: parseConnectFourSave });
