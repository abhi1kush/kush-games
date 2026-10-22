import { describe, expect, it } from 'vitest';
import {
  applyHint, beginStroke, dotColors, endStroke, extendStroke, getLevel, isConnected, isSolved, Level, pathsWithStroke, starsFor, startLevel,
  Stroke, TrailsState, undoLast,
} from './game';
import { BUNDLED_LEVELS, hardnessScore } from './levelPlan';
import { measurePuzzle, PuzzleMetrics, solvePuzzle } from './puzzle';
import { restoreTrailsGame, serializeTrailsGame, TRAILS_SAVE_VERSION } from './save';
import { SAVE_VERSIONS } from '../persistence';

const TESTED_LEVELS = 60;
const metricsCache = new Map<number, PuzzleMetrics & { hardness: number }>();
function metricsFor(levelNumber: number) {
  let metrics = metricsCache.get(levelNumber);
  if (!metrics) {
    const level = getLevel(levelNumber);
    const measured = measurePuzzle(level, solvePuzzle(level, 2));
    metrics = { ...measured, hardness: hardnessScore(measured) };
    metricsCache.set(levelNumber, metrics);
  }
  return metrics;
}

/** Draw a whole path as one drag. */
function drag(state: TrailsState, cells: number[]): TrailsState {
  let stroke = beginStroke(state, cells[0]);
  if (!stroke) throw new Error('could not start');
  for (const cell of cells.slice(1)) stroke = extendStroke(state, stroke, cell);
  return endStroke(state, stroke);
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('color trails levels', () => {
  it('bundles 100 levels and every one of levels 1–60 fills the board with exactly one solution', () => {
    for (let levelNumber = 1; levelNumber <= TESTED_LEVELS; levelNumber++) {
      const level = getLevel(levelNumber);
      const covered = new Set(level.solution.flat());
      expect(covered.size, `level ${levelNumber} fills the board`).toBe(level.rows * level.columns);
      expect(level.solution.flat().length).toBe(level.rows * level.columns);
      const result = solvePuzzle(level, 2, 20_000_000);
      expect(result.timedOut, `level ${levelNumber} solver finished`).toBe(false);
      expect(result.solutionCount, `level ${levelNumber} unique`).toBe(1);
      expect(result.firstSolution?.map(path => [...path].sort((a, b) => a - b))).toEqual(level.solution.map(path => [...path].sort((a, b) => a - b)));
    }
    expect(getLevel(BUNDLED_LEVELS).rows).toBeGreaterThan(0);
  }, 240_000);

  it('levels after the bundle are turned/mirrored copies that still decode into full boards', () => {
    for (const levelNumber of [101, 151, 201, 999]) {
      const level = getLevel(levelNumber);
      expect(new Set(level.solution.flat()).size).toBe(level.rows * level.columns);
      expect(isSolved(level, level.solution)).toBe(true);
    }
    expect(getLevel(101).endpoints).not.toEqual(getLevel(51).endpoints);
  });

  it('boards grow from 5×5 up to 10 columns × 12 rows', () => {
    const cells = (levelNumber: number) => getLevel(levelNumber).rows * getLevel(levelNumber).columns;
    expect(getLevel(1).columns).toBe(5);
    for (let levelNumber = 2; levelNumber <= 12; levelNumber++) expect(cells(levelNumber)).toBeGreaterThanOrEqual(cells(levelNumber - 1));
    const averageCells = (from: number, to: number) => average(Array.from({ length: to - from + 1 }, (_, index) => cells(from + index)));
    expect(averageCells(13, 24)).toBeGreaterThan(averageCells(1, 12));
    expect(averageCells(25, 60)).toBeGreaterThan(averageCells(13, 24));
    expect(Math.max(...Array.from({ length: BUNDLED_LEVELS }, (_, index) => getLevel(index + 1).columns))).toBe(10);
    expect(Math.max(...Array.from({ length: BUNDLED_LEVELS }, (_, index) => getLevel(index + 1).rows))).toBe(12);
  });

  it('gets harder by level band and stays hard after the board stops growing', () => {
    const bands = [[1, 5], [6, 12], [13, 20], [21, 30], [31, 40], [41, 50], [51, 60]];
    const table = bands.map(([from, to]) => {
      const metrics = Array.from({ length: to - from + 1 }, (_, index) => metricsFor(from + index));
      return {
        band: `${from}-${to}`,
        hardness: average(metrics.map(entry => entry.hardness)),
        pathLength: average(metrics.map(entry => entry.averagePathLength)),
        forcedFill: average(metrics.map(entry => entry.forcedFillShare)),
        guesses: average(metrics.map(entry => entry.guesses)),
        shortPairs: average(metrics.map(entry => entry.shortPaths)),
      };
    });
    console.table(table.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Number(value.toFixed(2)) : value]))));
    table.slice(1).forEach((row, index) => {
      expect(row.hardness, `${row.band} harder than ${table[index].band}`).toBeGreaterThan(table[index].hardness);
      expect(row.pathLength).toBeGreaterThanOrEqual(table[index].pathLength - 0.5);
    });
    expect(table[table.length - 1].forcedFill).toBeLessThan(table[0].forcedFill);
    expect(table[table.length - 1].guesses).toBeGreaterThan(table[1].guesses);
    // from level 13 on, levels are ordered by hardness, so it never drops — including after boards stop growing
    for (let levelNumber = 14; levelNumber <= TESTED_LEVELS; levelNumber++) {
      expect(metricsFor(levelNumber).hardness, `level ${levelNumber}`).toBeGreaterThanOrEqual(metricsFor(levelNumber - 1).hardness - 1e-9);
    }
  }, 240_000);
});

/** A color pair `cutter` whose dot touches a middle cell of `victim`'s solution path (to test cutting). */
function findCutSetup(): { level: Level; victim: number; cutter: number; cell: number } {
  for (let levelNumber = 1; levelNumber <= 20; levelNumber++) {
    const level = getLevel(levelNumber);
    const dots = dotColors(level);
    for (let victim = 0; victim < level.solution.length; victim++) {
      const path = level.solution[victim];
      for (let index = 2; index < path.length - 2; index++) {
        const cell = path[index];
        const neighbours = [cell - level.columns, cell + level.columns, ...(cell % level.columns ? [cell - 1] : []), ...((cell + 1) % level.columns ? [cell + 1] : [])];
        const dotCell = neighbours.find(neighbour => neighbour >= 0 && neighbour < dots.length && dots[neighbour] !== -1 && dots[neighbour] !== victim);
        if (dotCell !== undefined) return { level, victim, cutter: dots[dotCell], cell: dotCell };
      }
    }
  }
  throw new Error('no setup');
}

describe('color trails moves', () => {
  it('draws, connects and counts a perfect solve as one move per color', () => {
    let state = startLevel(1);
    const { solution } = state.level;
    solution.forEach((path, color) => {
      state = drag(state, path);
      expect(isConnected(state.level, color, state.paths[color])).toBe(true);
    });
    expect(state.status).toBe('won');
    expect(state.moves).toBe(solution.length);
    expect(starsFor(state)).toBe(3);
  });

  it('only steps to neighbours, never through another color\'s dot, and stops at the twin dot', () => {
    const state = startLevel(2);
    const { level } = state;
    const path = level.solution[0];
    let stroke = beginStroke(state, path[0]) as Stroke;
    expect(beginStroke(state, level.solution.find(candidate => candidate.length > 2)![1])).toBeNull(); // empty cell: nothing to drag
    const far = path[path.length - 1];
    if (path.length > 2) expect(extendStroke(state, stroke, far)).toBe(stroke); // not adjacent
    const dots = dotColors(level);
    const otherDot = [path[0] - 1, path[0] + 1, path[0] - level.columns, path[0] + level.columns].find(cell => cell >= 0 && cell < dots.length && dots[cell] !== -1 && dots[cell] !== 0
      && Math.abs((cell % level.columns) - (path[0] % level.columns)) <= 1);
    if (otherDot !== undefined) expect(extendStroke(state, stroke, otherDot)).toBe(stroke);
    for (const cell of path.slice(1)) stroke = extendStroke(state, stroke, cell);
    expect(isConnected(level, 0, stroke.path)).toBe(true);
    const beyond = [far - 1, far + 1, far - level.columns, far + level.columns].find(cell => cell >= 0 && cell < dots.length && !stroke.path.includes(cell));
    if (beyond !== undefined) expect(extendStroke(state, stroke, beyond)).toBe(stroke); // already joined
  });

  it('backtracking over your own path shortens it; starting mid-path continues from there', () => {
    let state = startLevel(3);
    const path = state.level.solution.reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest));
    const color = state.level.solution.indexOf(path);
    let stroke = beginStroke(state, path[0]) as Stroke;
    for (const cell of path.slice(1, 4)) stroke = extendStroke(state, stroke, cell);
    stroke = extendStroke(state, stroke, path[1]);
    expect(stroke.path).toEqual(path.slice(0, 2));
    state = drag(state, path.slice(0, 4));
    const resumed = beginStroke(state, path[2]) as Stroke;
    expect(resumed.color).toBe(color);
    expect(resumed.path).toEqual(path.slice(0, 3));
  });

  it('drawing over another path cuts it, and it grows back if you back off during the same drag', () => {
    const { level, victim, cutter, cell } = findCutSetup();
    let state = startLevel(level.number);
    state = drag(state, level.solution[victim]);
    const victimPath = state.paths[victim];
    const crossing = [cell - 1, cell + 1, cell - level.columns, cell + level.columns].find(neighbour => victimPath.slice(2, -2).includes(neighbour))!;
    let stroke = beginStroke(state, cell) as Stroke;
    expect(stroke.color).toBe(cutter);
    stroke = extendStroke(state, stroke, crossing);
    const cut = pathsWithStroke(stroke)[victim];
    expect(cut.length).toBeLessThan(victimPath.length);
    expect(cut).not.toContain(crossing);
    stroke = extendStroke(state, stroke, cell); // back off
    expect(pathsWithStroke(stroke)[victim]).toEqual(victimPath);
    const after = endStroke(state, extendStroke(state, beginStroke(state, cell) as Stroke, crossing));
    expect(after.paths[victim].length).toBeLessThan(victimPath.length);
    expect(after.moves).toBe(2);
  });

  it('counts a move only when switching colors, and undo restores the previous board', () => {
    let state = startLevel(4);
    const path = state.level.solution[0];
    state = drag(state, path.slice(0, 2));
    state = drag(state, path.slice(0, 3));
    expect(state.moves).toBe(1);
    state = drag(state, state.level.solution[1].slice(0, 2));
    expect(state.moves).toBe(2);
    const undone = undoLast(state);
    expect(undone.paths[1]).toEqual([]);
    expect(undone.paths[0]).toEqual(path.slice(0, 3));
  });

  it('hints lay correct paths (cutting wrong ones) until solved, and cost the perfect rating', () => {
    let state = startLevel(12);
    let hints = 0;
    while (state.status === 'playing' && hints < 30) { state = applyHint(state).state; hints++; }
    expect(state.status).toBe('won');
    expect(hints).toBe(state.level.solution.length);
    expect(starsFor(state)).toBeLessThan(3);
  });
});

describe('color trails saves', () => {
  it('registers a save version and round-trips an in-progress board', () => {
    expect(SAVE_VERSIONS['color-trails']).toBe(TRAILS_SAVE_VERSION);
    let state = startLevel(7);
    state = drag(state, state.level.solution[0]);
    state = drag(state, state.level.solution[1].slice(0, 3));
    const data = JSON.parse(JSON.stringify(serializeTrailsGame(state)));
    const restored = restoreTrailsGame(data)!;
    expect(restored.level.number).toBe(7);
    expect(restored.paths).toEqual(state.paths);
    expect(restored.moves).toBe(2);
  });

  it('rejects broken saves', () => {
    const state = drag(startLevel(5), startLevel(5).level.solution[0]);
    const data = serializeTrailsGame(state)!;
    expect(restoreTrailsGame({ ...data, levelNumber: 0 })).toBeNull();
    expect(restoreTrailsGame({ ...data, paths: [[0, 99]] })).toBeNull();
    const jumpy = data.paths.map(path => [...path]);
    jumpy[0] = [jumpy[0][0], jumpy[0][jumpy[0].length - 1]];
    expect(restoreTrailsGame({ ...data, paths: jumpy })).toBeNull();
    expect(restoreTrailsGame('nope')).toBeNull();
  });
});
