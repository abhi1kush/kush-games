/**
 * Builds src/games/colortrails/levels.json: the first BUNDLED_LEVELS levels of Color Trails.
 * Run with: npx vite-node scripts/generate-color-trails.ts [fromLevel] [toLevel] [outputFile]
 * (ranges can run in parallel into separate files; merge them with scripts/merge-color-trails.ts)
 *
 * Each level: board size and color count come from its number (levelPlan). Several boards with exactly one
 * solution are generated from seeds derived from the level number, measured, and the one at the level's
 * difficulty target is kept (pickCandidate), so difficulty rises level by level.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { encodeSolution, generateUniquePuzzle, measurePuzzle, Puzzle } from '../src/games/colortrails/puzzle';
import { BUNDLED_LEVELS, candidateCount, hardnessScore, levelPlan, levelSeed, pickCandidate, targetHardness } from '../src/games/colortrails/levelPlan';

const fromLevel = Number(process.argv[2] ?? 1), toLevel = Number(process.argv[3] ?? BUNDLED_LEVELS);
const outputPath = process.argv[4] ?? new URL('../src/games/colortrails/levels.json', import.meta.url).pathname;
const levels: { r: number; c: number; g: string }[] = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : [];

for (let levelNumber = fromLevel; levelNumber <= toLevel; levelNumber++) {
  const plan = levelPlan(levelNumber);
  const started = Date.now();
  const candidates: { puzzle: Puzzle; score: number }[] = [];
  for (let candidate = 0; candidate < candidateCount(levelNumber) * 3 && candidates.length < candidateCount(levelNumber); candidate++) {
    const generated = generateUniquePuzzle(plan, levelSeed(levelNumber) + candidate * 104729);
    if (!generated) continue;
    candidates.push({ puzzle: generated.puzzle, score: hardnessScore(measurePuzzle(generated.puzzle, generated.result)) });
  }
  if (!candidates.length) throw new Error(`level ${levelNumber}: no unique board`);
  const chosen = pickCandidate(candidates, levelNumber);
  levels[levelNumber - 1] = { r: plan.rows, c: plan.columns, g: encodeSolution(plan.rows, plan.columns, chosen.puzzle.solution) };
  writeFileSync(outputPath, JSON.stringify(levels).replace(/\},\{/g, '},\n{'));
  console.log(`level ${levelNumber}: ${plan.columns}x${plan.rows}, ${chosen.puzzle.solution.length} colors, score ${chosen.score.toFixed(2)} / target ${targetHardness(levelNumber).toFixed(2)} (${candidates.length} candidates, ${Date.now() - started} ms)`);
}
