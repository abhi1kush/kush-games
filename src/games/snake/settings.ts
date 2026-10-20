/** localStorage persistence for Snake: speed setting, shared best score and the mode it was set in. */
import { CONSTANT_SPEEDS, DEFAULT_SPEED_SETTING, SpeedSetting } from './game';

export const SPEED_STORAGE_KEY = 'kush-games-snake-speed';
export const BEST_SCORE_STORAGE_KEY = 'kush-games-snake-best';
export const BEST_DETAILS_STORAGE_KEY = 'kush-games-snake-best-details';

export interface BestScoreDetails { speedLabel: string; length: number; }

/** Parse a stored speed setting; anything invalid falls back to the default. */
export function parseSpeedSetting(stored: string | null): SpeedSetting {
  if (!stored) return DEFAULT_SPEED_SETTING;
  try {
    const parsed = JSON.parse(stored) as Partial<SpeedSetting>;
    const mode = parsed.mode === 'constant' || parsed.mode === 'speeding-up' ? parsed.mode : DEFAULT_SPEED_SETTING.mode;
    const constantSpeed = CONSTANT_SPEEDS.some(option => option.id === parsed.constantSpeed)
      ? parsed.constantSpeed! : DEFAULT_SPEED_SETTING.constantSpeed;
    return { mode, constantSpeed };
  } catch {
    return DEFAULT_SPEED_SETTING;
  }
}

export const serializeSpeedSetting = (speed: SpeedSetting) => JSON.stringify(speed);

export function parseBestScore(stored: string | null): number {
  const value = Number(stored);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function parseBestDetails(stored: string | null): BestScoreDetails | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<BestScoreDetails>;
    if (typeof parsed.speedLabel !== 'string' || typeof parsed.length !== 'number') return null;
    return { speedLabel: parsed.speedLabel, length: parsed.length };
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export const readSpeedSetting = () => parseSpeedSetting(readStorage(SPEED_STORAGE_KEY));
export const saveSpeedSetting = (speed: SpeedSetting) => writeStorage(SPEED_STORAGE_KEY, serializeSpeedSetting(speed));
export const readBestScore = () => parseBestScore(readStorage(BEST_SCORE_STORAGE_KEY));
export const readBestDetails = () => parseBestDetails(readStorage(BEST_DETAILS_STORAGE_KEY));
export function saveBestScore(score: number, details: BestScoreDetails) {
  writeStorage(BEST_SCORE_STORAGE_KEY, String(score));
  writeStorage(BEST_DETAILS_STORAGE_KEY, JSON.stringify(details));
}
