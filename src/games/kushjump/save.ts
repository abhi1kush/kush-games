import { createSaveSlot, isInteger, isRecord } from '../persistence';

/** What survives a refresh: the checkpoint flag, lives, score and coins (the stage itself restarts from the flag). */
export interface SavedKushJump { checkpoint: boolean; lives: number; score: number; coins: number; }

export function parseKushJumpSave(data: unknown): SavedKushJump | null {
  if (!isRecord(data) || typeof data.checkpoint !== 'boolean' || !isInteger(data.lives, 1, 9) || !isInteger(data.score, 0, 9_999_999)
    || !isInteger(data.coins, 0, 99_999)) return null;
  return { checkpoint: data.checkpoint, lives: data.lives, score: data.score, coins: data.coins };
}

export const createKushJumpSaveSlot = () => createSaveSlot({ gameId: 'kush-jump', version: 1, parse: parseKushJumpSave });
