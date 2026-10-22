/** Print the difficulty metrics table for some Color Trails levels: npx vite-node scripts/color-trails-metrics.ts 1 5 10 20 30 40 60 */
import { getLevel } from '../src/games/colortrails/game';
import { hardnessScore } from '../src/games/colortrails/levelPlan';
import { measurePuzzle, solvePuzzle } from '../src/games/colortrails/puzzle';

const levels = process.argv.slice(2).map(Number);
console.log('| Level | Board | Colors | Avg path | Bends/path | Short pairs (≤3) | Pairs forced at start | Forced fill | Solver guesses | Search nodes | Hardness |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const levelNumber of levels.length ? levels : [1, 5, 10, 20, 30, 40, 60]) {
  const level = getLevel(levelNumber);
  const metrics = measurePuzzle(level, solvePuzzle(level, 2, 20_000_000));
  console.log(`| ${levelNumber} | ${level.columns}×${level.rows} | ${metrics.colors} | ${metrics.averagePathLength.toFixed(1)} | ${metrics.averageBends.toFixed(1)} | ${metrics.shortPaths} | ${metrics.forcedColors} | ${(metrics.forcedFillShare * 100).toFixed(0)}% | ${metrics.guesses} | ${metrics.searchNodes} | ${hardnessScore(metrics).toFixed(2)} |`);
}
