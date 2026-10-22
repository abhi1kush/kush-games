/**
 * Merge part files from parallel generate-color-trails runs into levels.json (later files win), then order them by
 * measured hardness: the small starter boards (levels 1–12) by hardness within each size, everything after that purely
 * by hardness, so difficulty never dips (a board can be a size smaller than the one before when it is harder).
 * Run with: npx vite-node scripts/merge-color-trails.ts part1.json part2.json …
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { hardnessScore } from '../src/games/colortrails/levelPlan';
import { decodePuzzle, measurePuzzle, solvePuzzle } from '../src/games/colortrails/puzzle';

type StoredLevel = { r: number; c: number; g: string };
const STARTER_LEVELS = 12;
const outputPath = new URL('../src/games/colortrails/levels.json', import.meta.url);
const merged: StoredLevel[] = [];
for (const file of process.argv.slice(2)) {
  (JSON.parse(readFileSync(file, 'utf8')) as (StoredLevel | null)[]).forEach((level, index) => { if (level) merged[index] = level; });
}
for (let index = 0; index < merged.length; index++) if (!merged[index]) throw new Error(`missing level ${index + 1}`);

const scored = merged.map(level => {
  const puzzle = decodePuzzle(level.r, level.c, level.g);
  return { level, score: hardnessScore(measurePuzzle(puzzle, solvePuzzle(puzzle, 2, 20_000_000))) };
});
const byScore = (first: { score: number }, second: { score: number }) => first.score - second.score;
const ordered: typeof scored = [];
for (let start = 0; start < STARTER_LEVELS;) {
  let end = start;
  while (end < STARTER_LEVELS && scored[end].level.r === scored[start].level.r && scored[end].level.c === scored[start].level.c) end++;
  ordered.push(...scored.slice(start, end).sort(byScore));
  start = end;
}
ordered.push(...scored.slice(STARTER_LEVELS).sort(byScore));
console.log(ordered.map((entry, index) => `${index + 1}:${entry.level.c}x${entry.level.r}=${entry.score.toFixed(2)}`).join(' '));
writeFileSync(outputPath, JSON.stringify(ordered.map(entry => entry.level)).replace(/\},\{/g, '},\n{'));
console.log(`${ordered.length} levels written`);
