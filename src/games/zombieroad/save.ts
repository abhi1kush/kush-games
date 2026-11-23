import { createSaveSlot, isInteger, isRecord } from '../persistence';

/** What survives a refresh: the wave you were on (restarted from its beginning), score and lives. The high score is kept separately. */
export interface SavedZombieRoad { wave: number; score: number; lives: number; }

export function parseZombieRoadSave(data: unknown): SavedZombieRoad | null {
  if (!isRecord(data) || !isInteger(data.wave, 1, 999) || !isInteger(data.score, 0, 99_999_999) || !isInteger(data.lives, 1, 5)) return null;
  return { wave: data.wave, score: data.score, lives: data.lives };
}

export const createZombieRoadSaveSlot = () => createSaveSlot({ gameId: 'zombie-road', version: 1, parse: parseZombieRoadSave });
