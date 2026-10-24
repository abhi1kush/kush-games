import { createSaveSlot, isInteger, isRecord } from '../persistence';

/** What survives a refresh: the wave you were on (restarted from its beginning), score and lives. The high score is kept separately. */
export interface SavedAntariksh { wave: number; score: number; lives: number; }

export function parseAntarikshSave(data: unknown): SavedAntariksh | null {
  if (!isRecord(data) || !isInteger(data.wave, 1, 999) || !isInteger(data.score, 0, 99_999_999) || !isInteger(data.lives, 1, 6)) return null;
  return { wave: data.wave, score: data.score, lives: data.lives };
}

export const createAntarikshSaveSlot = () => createSaveSlot({ gameId: 'antariksh-defenders', version: 1, parse: parseAntarikshSave });
