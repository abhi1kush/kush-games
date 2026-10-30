import { isInteger, isRecord } from '../persistence';

/** Best run, kept across refreshes (a run itself always starts fresh — the world is new each time). */
export interface PralayBest { score: number; distance: number; kills: number; runs: number; }
export const BEST_STORAGE_KEY = 'kush-games-pralay-run-best';

export const emptyBest = (): PralayBest => ({ score: 0, distance: 0, kills: 0, runs: 0 });

export function parseBest(data: unknown): PralayBest | null {
  if (!isRecord(data) || !isInteger(data.score, 0, 99_999_999) || !isInteger(data.distance, 0, 9_999_999) || !isInteger(data.kills, 0, 9_999_999)
    || !isInteger(data.runs, 0, 99_999_999)) return null;
  return { score: data.score, distance: data.distance, kills: data.kills, runs: data.runs };
}

export function loadBest(storage: Pick<Storage, 'getItem'> | null = safeStorage()): PralayBest | null {
  try { const text = storage?.getItem(BEST_STORAGE_KEY); return text ? parseBest(JSON.parse(text)) : null; } catch { return null; }
}

/** Fold one finished run into the saved best (best score, longest distance, most foes; runs counted). */
export function recordRun(run: { score: number; distance: number; kills: number }, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): { best: PralayBest; isBest: boolean } {
  const previous = loadBest(storage) ?? emptyBest();
  const isBest = run.score > previous.score;
  const best: PralayBest = {
    score: Math.max(previous.score, run.score), distance: Math.max(previous.distance, run.distance), kills: Math.max(previous.kills, run.kills), runs: previous.runs + 1,
  };
  try { storage?.setItem(BEST_STORAGE_KEY, JSON.stringify(best)); } catch { /* storage unavailable */ }
  return { best, isBest };
}

function safeStorage(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
