import { createSaveSlot, isInteger, isRecord } from '../persistence';

/** What survives a refresh: checkpoint, lives, score, weapon and continues (the stage restarts from the checkpoint). */
export interface SavedJungleStrike { checkpoint: boolean; lives: number; score: number; weapon: number; continues: number; }

export function parseJungleStrikeSave(data: unknown): SavedJungleStrike | null {
  if (!isRecord(data) || typeof data.checkpoint !== 'boolean' || !isInteger(data.lives, 1, 9) || !isInteger(data.score, 0, 9_999_999)
    || !isInteger(data.weapon, 0, 3) || !isInteger(data.continues, 0, 3)) return null;
  return { checkpoint: data.checkpoint, lives: data.lives, score: data.score, weapon: data.weapon, continues: data.continues };
}

export const createJungleStrikeSaveSlot = () => createSaveSlot({ gameId: 'jungle-strike', version: 1, parse: parseJungleStrikeSave });
