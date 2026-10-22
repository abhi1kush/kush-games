/** How big each level is, how many colors it has, and how hard a board it keeps. */
import type { LevelPlan, PuzzleMetrics } from './puzzle';

/** Levels generated ahead of time into levels.json; later levels reuse the hardest ones, mirrored and recolored. */
export const BUNDLED_LEVELS = 100;
export const MAX_COLUMNS = 10;
export const MAX_ROWS = 12;

/**
 * Board size grows from 5×5 to 10×12 (reached at level 40). Within each size the color count drops, so paths get
 * longer and twistier; after the size stops growing the color count keeps dropping to 8, and each level keeps the
 * hardest of more candidate boards.
 */
export function levelPlan(levelNumber: number): LevelPlan {
  const bands: { upTo: number; rows: number; columns: number; colors: [number, number] }[] = [
    { upTo: 3, rows: 5, columns: 5, colors: [5, 4] },
    { upTo: 7, rows: 6, columns: 6, colors: [5, 4] },
    { upTo: 12, rows: 7, columns: 7, colors: [6, 5] },
    { upTo: 18, rows: 8, columns: 8, colors: [8, 7] },
    { upTo: 25, rows: 9, columns: 9, colors: [9, 8] },
    { upTo: 32, rows: 11, columns: 9, colors: [10, 8] },
    { upTo: 40, rows: 12, columns: 10, colors: [11, 9] },
    { upTo: Infinity, rows: 12, columns: 10, colors: [9, 8] },
  ];
  let bandStart = 1;
  for (const band of bands) {
    if (levelNumber <= band.upTo) {
      const bandLength = Number.isFinite(band.upTo) ? band.upTo - bandStart + 1 : 30;
      const progress = Math.min(1, (levelNumber - bandStart) / Math.max(1, bandLength - 1));
      return { rows: band.rows, columns: band.columns, colors: Math.round(band.colors[0] + (band.colors[1] - band.colors[0]) * progress) };
    }
    bandStart = band.upTo + 1;
  }
  throw new Error('unreachable');
}

export const levelSeed = (levelNumber: number) => (Math.imul(levelNumber, 2654435761) ^ 0xc0102) >>> 0;

/** Candidate boards per level (small boards are cheap, so more of them). */
export const candidateCount = (levelNumber: number) => (levelNumber <= 25 ? 24 : 5);

/** The hardness each level aims for: rises steadily, then keeps creeping up after the board stops growing. */
export const targetHardness = (levelNumber: number) =>
  levelNumber <= 45 ? -1.5 + 10.5 * ((levelNumber - 1) / 44) ** 0.85 : Math.min(11, 9 + (levelNumber - 45) * 0.04);

/** Keep the candidate closest to the target (or the hardest, if none reaches it). */
export function pickCandidate<Candidate extends { score: number }>(candidates: Candidate[], levelNumber: number): Candidate {
  const target = targetHardness(levelNumber);
  const sorted = [...candidates].sort((first, second) => first.score - second.score);
  if (sorted[sorted.length - 1].score <= target) return sorted[sorted.length - 1];
  return sorted.reduce((best, candidate) => (Math.abs(candidate.score - target) < Math.abs(best.score - target) ? candidate : best));
}

/**
 * One number for how hard a board is: little forced progress, lots of trial and error for the solver,
 * long winding paths that stray from the direct route, few near-trivial short pairs.
 */
export function hardnessScore(metrics: PuzzleMetrics): number {
  return 3 * (1 - metrics.forcedFillShare)
    + Math.log10(1 + metrics.guesses)
    + 0.08 * metrics.averagePathLength
    + 0.3 * metrics.averageBends
    + 1.5 * (1 - metrics.directness)
    - 0.4 * metrics.shortPaths
    - 0.3 * metrics.forcedColors;
}
