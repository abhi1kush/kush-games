/**
 * Difficulty metrics for an Arrow Out level, measured by simulation.
 * "A depends on B" means part of B lies on A's exit line, so B has to leave before A can.
 */
import { Arrow, DIRECTIONS, exitPath, Level } from './game';

export interface LevelMetrics {
  arrowCount: number;
  fillRatio: number;
  /** Share of arrows that can leave at the start (lower = harder). */
  initialFreeRatio: number;
  /** Average number of free arrows at each step of a clear (fewer = fewer choices). */
  averageFreeCount: number;
  /** Average share of the remaining arrows that are free at each step. */
  averageFreeRatio: number;
  /** Rounds needed when every free arrow leaves at once each round (longest dependency chain). */
  dependencyDepth: number;
  /** Share of the most common arrowhead direction (lower = more mixed). */
  directionShare: number;
  /** Arrows blocked only by a same-direction arrow in their own lane (trivial front-to-back peeling). */
  laneRuns: number;
  /** Share of dependencies between arrows pointing in different directions. */
  crossBlockShare: number;
  /** Arrows that are blocked at the start but have open space in front of the head (tempting wrong taps). */
  trapCount: number;
  averageBends: number;
}

/** For each arrow, the arrows that sit on its exit line (in the order the line meets them). */
export function dependencies(level: Level): number[][] {
  const ownerByCell = new Map<string, number>();
  for (const arrow of level.arrows) for (const cell of arrow.cells) ownerByCell.set(`${cell.row},${cell.column}`, arrow.id);
  return level.arrows.map(arrow => {
    const blockers: number[] = [];
    for (const cell of exitPath(arrow, level.rows, level.columns)) {
      const owner = ownerByCell.get(`${cell.row},${cell.column}`);
      if (owner !== undefined && !blockers.includes(owner)) blockers.push(owner);
    }
    return blockers;
  });
}

function bendsOf(arrow: Arrow): number {
  const steps: string[] = [];
  for (let index = 1; index < arrow.cells.length; index++) {
    steps.push(`${arrow.cells[index].row - arrow.cells[index - 1].row},${arrow.cells[index].column - arrow.cells[index - 1].column}`);
  }
  const headStep = { up: '-1,0', down: '1,0', left: '0,-1', right: '0,1' }[arrow.direction];
  steps.push(headStep);
  return steps.filter((step, index) => index > 0 && step !== steps[index - 1]).length;
}

export function measureLevel(level: Level): LevelMetrics {
  const arrowCount = level.arrows.length;
  const blockersOf = dependencies(level);
  const remaining = new Set(level.arrows.map(arrow => arrow.id));
  const isFree = (arrowId: number) => blockersOf[arrowId].every(blocker => !remaining.has(blocker));

  // one arrow per step (the lowest free id): how many choices were there each time?
  let freeCountTotal = 0, freeRatioTotal = 0, steps = 0;
  const stepByStep = new Set(remaining);
  while (stepByStep.size) {
    const free = [...stepByStep].filter(arrowId => blockersOf[arrowId].every(blocker => !stepByStep.has(blocker)));
    if (!free.length) break; // unsolvable (never happens for generated levels)
    freeCountTotal += free.length;
    freeRatioTotal += free.length / stepByStep.size;
    steps++;
    stepByStep.delete(free[0]);
  }

  // all free arrows at once, round after round
  let dependencyDepth = 0;
  while (remaining.size) {
    const free = [...remaining].filter(isFree);
    if (!free.length) break;
    free.forEach(arrowId => remaining.delete(arrowId));
    dependencyDepth++;
  }
  remaining.clear();
  level.arrows.forEach(arrow => remaining.add(arrow.id));

  const directionCounts = DIRECTIONS.map(direction => level.arrows.filter(arrow => arrow.direction === direction).length);
  let relations = 0, crossRelations = 0, laneRuns = 0, trapCount = 0, initialFree = 0;
  level.arrows.forEach(arrow => {
    const blockers = blockersOf[arrow.id];
    if (!blockers.length) { initialFree++; return; }
    for (const blocker of blockers) {
      relations++;
      if (level.arrows[blocker].direction !== arrow.direction) crossRelations++;
    }
    if (blockers.length === 1 && level.arrows[blockers[0]].direction === arrow.direction) laneRuns++;
    const firstRayCell = exitPath(arrow, level.rows, level.columns)[0];
    const blockerCells = new Set(level.arrows[blockers[0]].cells.map(cell => `${cell.row},${cell.column}`));
    if (firstRayCell && !blockerCells.has(`${firstRayCell.row},${firstRayCell.column}`)) trapCount++;
  });

  return {
    arrowCount,
    fillRatio: level.arrows.reduce((total, arrow) => total + arrow.cells.length, 0) / (level.rows * level.columns),
    initialFreeRatio: initialFree / arrowCount,
    averageFreeCount: freeCountTotal / Math.max(1, steps),
    averageFreeRatio: freeRatioTotal / Math.max(1, steps),
    dependencyDepth,
    directionShare: Math.max(...directionCounts) / arrowCount,
    laneRuns,
    crossBlockShare: relations ? crossRelations / relations : 0,
    trapCount,
    averageBends: level.arrows.reduce((total, arrow) => total + bendsOf(arrow), 0) / arrowCount,
  };
}

/** One number for "how hard": fewer free arrows, longer chains, mixed directions, few trivial lanes. */
export function hardnessScore(metrics: LevelMetrics): number {
  return -6 * metrics.initialFreeRatio
    - 2 * metrics.averageFreeRatio
    + 4 * (metrics.dependencyDepth / Math.max(1, metrics.arrowCount))
    + 0.8 * metrics.crossBlockShare
    - 2 * (metrics.laneRuns / Math.max(1, metrics.arrowCount))
    - 6 * Math.max(0, metrics.directionShare - 0.3);
}
