/**
 * Arrow Out: a board packed with winding arrows. Each arrow is a snake-like path of cells ending in an arrowhead.
 * Tapping an arrow sends it out of the board: the head goes straight the way it points and the body follows its
 * trail. That only works when every cell between the head and the board edge is empty; tapping a blocked arrow
 * costs a life. Pure logic: levels, legality, lives, undo and hints.
 */
import { createRandom, shuffled } from '../random';
import { dependencies, hardnessScore, measureLevel } from './metrics';

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
export const DIRECTION_STEPS: Record<Direction, { rowStep: number; columnStep: number }> = {
  up: { rowStep: -1, columnStep: 0 },
  down: { rowStep: 1, columnStep: 0 },
  left: { rowStep: 0, columnStep: -1 },
  right: { rowStep: 0, columnStep: 1 },
};

export interface Cell { row: number; column: number; }

export interface Arrow {
  id: number;
  /** The path from the tail to the head (the last cell carries the arrowhead). */
  cells: Cell[];
  /** Where the arrowhead points. */
  direction: Direction;
}

export interface Level {
  number: number;
  rows: number;
  columns: number;
  arrows: Arrow[];
}

export const LIVES_PER_LEVEL = 3;
export const MAX_COLUMNS = 12;
export const MAX_ROWS = 16;

export const headOf = (arrow: Arrow) => arrow.cells[arrow.cells.length - 1];
export const arrowCells = (arrow: Arrow) => arrow.cells;

/** The cells from just past the head to the board edge, in the arrow's direction. */
export function exitPath(arrow: Arrow, rows: number, columns: number): Cell[] {
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  const head = headOf(arrow);
  const path: Cell[] = [];
  let row = head.row + rowStep;
  let column = head.column + columnStep;
  while (row >= 0 && row < rows && column >= 0 && column < columns) {
    path.push({ row, column });
    row += rowStep;
    column += columnStep;
  }
  return path;
}

/** Number of 90° turns along an arrow's path (counting the turn into the arrowhead's direction). */
export function countBends(arrow: Arrow): number {
  let bends = 0;
  let previousStep: string | null = null;
  for (let index = 1; index <= arrow.cells.length; index++) {
    const step = index < arrow.cells.length
      ? `${arrow.cells[index].row - arrow.cells[index - 1].row},${arrow.cells[index].column - arrow.cells[index - 1].column}`
      : `${DIRECTION_STEPS[arrow.direction].rowStep},${DIRECTION_STEPS[arrow.direction].columnStep}`;
    if (previousStep !== null && step !== previousStep) bends++;
    previousStep = step;
  }
  return bends;
}

export interface LevelShape {
  rows: number;
  columns: number;
  minLength: number;
  maxLength: number;
  turnChance: number;
  /** 0 for the tutorial levels 1–3, rising to 1 by level 21: how hard the generator tries to tangle the arrows. */
  difficulty: number;
}

/**
 * Boards grow from 5×5 to 12×16 (reached at level 14). After that the size stays the same and the
 * difficulty setting keeps rising to level 21, so the puzzles keep getting harder.
 */
export function levelShape(levelNumber: number): LevelShape {
  const growth = Math.max(0, levelNumber - 1);
  return {
    columns: Math.min(MAX_COLUMNS, 5 + Math.floor((growth * 7) / 13)),
    rows: Math.min(MAX_ROWS, 5 + Math.floor((growth * 11) / 13)),
    minLength: 2,
    maxLength: Math.min(8, 4 + Math.floor(levelNumber / 5)),
    turnChance: Math.min(0.65, 0.35 + levelNumber * 0.015),
    difficulty: Math.max(0, Math.min(1, (levelNumber - 3) / 18)),
  };
}

const levelSeed = (levelNumber: number) => Math.imul(levelNumber, 2654435761) ^ 0x5eed;

/** Boards at least this full are accepted. */
export const TARGET_FILL = 0.9;

/**
 * Generates a level: the same level number always gives the same board, and every board can be cleared.
 * Harder levels try several boards and keep the one that measures hardest (fewest free arrows, longest
 * chains of arrows waiting on each other, mixed directions, few trivial same-direction lanes).
 */
export function generateLevel(levelNumber: number): Level {
  const shape = levelShape(levelNumber);
  const boardsToCompare = 1 + Math.round(shape.difficulty * 6);
  const scoreBoard = (level: Level) => {
    const isFullEnough = fillRatio(level) >= TARGET_FILL;
    // full boards always beat boards with gaps; among full boards the hardest wins
    return (isFullEnough ? 100 : fillRatio(level) * 10) + (shape.difficulty > 0 ? hardnessScore(measureLevel(level)) : 0);
  };
  const drafts: { level: Level; score: number }[] = [];
  let acceptedBoards = 0;
  for (let attempt = 0; attempt < boardsToCompare + 6 && acceptedBoards < boardsToCompare; attempt++) {
    const level = buildLevel(levelNumber, levelSeed(levelNumber) + attempt * 7919, shape);
    if (fillRatio(level) >= TARGET_FILL) acceptedBoards++;
    drafts.push({ level, score: scoreBoard(level) });
  }
  drafts.sort((first, second) => second.score - first.score);
  if (shape.difficulty === 0) return drafts[0].level;
  // the slower tangling pass only runs on the two most promising drafts
  const random = createRandom(levelSeed(levelNumber) ^ 0x7a9e1);
  const tangled = drafts.slice(0, 2).map(draft => tangleLevel(draft.level, 0.4 - 0.33 * shape.difficulty, shape.maxLength + 8, random));
  return tangled.map(level => ({ level, score: scoreBoard(level) })).sort((first, second) => second.score - first.score)[0].level;
}

interface PlacedArrow {
  cells: number[];
  direction: Direction;
  ray: number[];
  /** How many arrows placed later sit on this arrow's exit line (0 = it will start free). */
  blockedBy: number;
}

/**
 * Builds one board.
 *
 * Arrows are placed one after another, and the board is cleared in the reverse order: the arrow placed last
 * leaves first. So when arrow k leaves, only arrows placed before it are still on the board, which means arrow
 * k's exit line only has to be clear of arrows placed BEFORE it. Arrows placed later may sit on that line; they
 * are already gone by then. Each new arrow therefore picks a head whose line to the edge is empty right now,
 * then grows a winding body backwards from the head (never onto its own line).
 *
 * That freedom is what makes a level hard: a later arrow's body lying across an earlier arrow's exit line is a
 * dependency the player has to discover. On harder levels each step samples several candidate arrows and keeps
 * the one that blocks the most still-unblocked arrows, especially ones pointing another way, with a deep head
 * (its own long exit line is likely to be crossed later), while avoiding same-direction lanes and keeping the
 * four directions balanced.
 *
 * To pack the board, a second pass lengthens arrows at the tail into empty cells. Arrow k may take a cell only
 * if no arrow placed after k (and not k itself) needs that cell for its line; the same reasoning keeps the
 * level solvable. The two passes repeat until nothing more fits.
 */
export function buildLevel(levelNumber: number, seed: number, shape: LevelShape): Level {
  const { rows, columns, difficulty } = shape;
  const random = createRandom(seed);
  const cellCount = rows * columns;
  const longestLine = Math.max(rows, columns);
  const indexOf = (row: number, column: number) => row * columns + column;
  const inside = (row: number, column: number) => row >= 0 && row < rows && column >= 0 && column < columns;
  /** Which arrow covers each cell (-1 = empty). */
  const owner: number[] = Array(cellCount).fill(-1);
  /** Arrows whose exit line crosses each cell. */
  const rayOwners: number[][] = Array.from({ length: cellCount }, () => []);
  const placed: PlacedArrow[] = [];
  const directionCounts: Record<Direction, number> = { up: 0, down: 0, left: 0, right: 0 };
  const maxTotalLength = shape.maxLength + 5;
  const samplesPerArrow = 1 + Math.round(difficulty * 11);

  const rayFrom = (headIndex: number, direction: Direction): number[] | null => {
    const { rowStep, columnStep } = DIRECTION_STEPS[direction];
    const ray: number[] = [];
    let row = Math.floor(headIndex / columns) + rowStep;
    let column = (headIndex % columns) + columnStep;
    while (inside(row, column)) {
      const index = indexOf(row, column);
      if (owner[index] !== -1) return null;
      ray.push(index);
      row += rowStep;
      column += columnStep;
    }
    return ray;
  };
  const emptyNeighbors = (index: number, excluded: Set<number>) => {
    const row = Math.floor(index / columns), column = index % columns;
    const neighbors: number[] = [];
    for (const direction of DIRECTIONS) {
      const { rowStep, columnStep } = DIRECTION_STEPS[direction];
      const neighborRow = row + rowStep, neighborColumn = column + columnStep;
      if (!inside(neighborRow, neighborColumn)) continue;
      const neighbor = indexOf(neighborRow, neighborColumn);
      if (owner[neighbor] === -1 && !excluded.has(neighbor)) neighbors.push(neighbor);
    }
    return neighbors;
  };
  /** Would putting a cell into a body pointing `direction` block a still-free arrow that points another way? */
  const blocksFreeCrossArrow = (cell: number, direction: Direction) =>
    rayOwners[cell].some(arrowIndex => placed[arrowIndex].blockedBy === 0 && placed[arrowIndex].direction !== direction);

  type HeadCandidate = { head: number; neck: number; direction: Direction; ray: number[]; weight: number };

  /** Grow a body backwards from the neck; on hard levels it bends towards other arrows' exit lines. */
  const growBody = (candidate: HeadCandidate): number[] => {
    const rayCells = new Set(candidate.ray);
    const path = [candidate.head, candidate.neck];
    const inPath = new Set(path);
    const targetLength = shape.minLength + Math.floor(random() * (shape.maxLength - shape.minLength + 1));
    let lastRowStep = Math.floor(candidate.neck / columns) - Math.floor(candidate.head / columns);
    let lastColumnStep = (candidate.neck % columns) - (candidate.head % columns);
    while (path.length < targetLength) {
      const current = path[path.length - 1];
      const currentRow = Math.floor(current / columns), currentColumn = current % columns;
      const options = emptyNeighbors(current, new Set([...rayCells, ...inPath]));
      if (!options.length) break;
      const straightRow = currentRow + lastRowStep, straightColumn = currentColumn + lastColumnStep;
      const straight = inside(straightRow, straightColumn) ? options.find(option => option === indexOf(straightRow, straightColumn)) : undefined;
      let next: number;
      const blocking = options.filter(option => blocksFreeCrossArrow(option, candidate.direction));
      if (blocking.length && random() < difficulty * 0.7) next = blocking[Math.floor(random() * blocking.length)];
      else if (straight !== undefined && random() > shape.turnChance) next = straight;
      else {
        // prefer cells with few free neighbours, so the snake hugs walls and fills pockets
        const scored = options.map(option => ({ option, score: emptyNeighbors(option, inPath).length + random() * 1.5 }));
        scored.sort((first, second) => first.score - second.score);
        next = scored[0].option;
      }
      lastRowStep = Math.floor(next / columns) - currentRow;
      lastColumnStep = (next % columns) - currentColumn;
      path.push(next);
      inPath.add(next);
    }
    return path.reverse(); // tail → head
  };

  /** How much a candidate arrow would add to the puzzle (only matters on harder levels). */
  const scoreCandidate = (cells: number[], candidate: HeadCandidate): number => {
    const newlyBlockedCross = new Set<number>();
    const newlyBlockedSameDirection = new Set<number>();
    const alsoBlocked = new Set<number>();
    for (const cell of cells) {
      for (const arrowIndex of rayOwners[cell]) {
        const earlier = placed[arrowIndex];
        if (earlier.blockedBy > 0) alsoBlocked.add(arrowIndex);
        else if (earlier.direction !== candidate.direction) newlyBlockedCross.add(arrowIndex);
        else newlyBlockedSameDirection.add(arrowIndex);
      }
    }
    // the new head sits in an earlier arrow's lane, pointing the same way: that arrow just follows it out
    const laneRuns = rayOwners[candidate.head].filter(arrowIndex => placed[arrowIndex].direction === candidate.direction).length;
    const directionShare = (directionCounts[candidate.direction] + 1) / (placed.length + 1);
    return 3 * newlyBlockedCross.size + 1.2 * newlyBlockedSameDirection.size + 0.4 * alsoBlocked.size
      - 4 * laneRuns - (placed.length >= 4 ? 12 * Math.max(0, directionShare - 0.27) : 0)
      + 1.5 * (candidate.ray.length / longestLine) - (candidate.ray.length === 0 ? 1.5 : 0)
      + 0.5 * (cells.length / shape.maxLength);
  };

  /** Place one new arrow; false when no head has a clear exit line any more. */
  const placeArrow = (allowEdgeHeads: boolean): boolean => {
    const candidates: HeadCandidate[] = [];
    let totalWeight = 0;
    for (let head = 0; head < cellCount; head++) {
      if (owner[head] !== -1) continue;
      for (const direction of DIRECTIONS) {
        const { rowStep, columnStep } = DIRECTION_STEPS[direction];
        const neckRow = Math.floor(head / columns) - rowStep, neckColumn = (head % columns) - columnStep;
        if (!inside(neckRow, neckColumn) || owner[indexOf(neckRow, neckColumn)] !== -1) continue;
        const ray = rayFrom(head, direction);
        if (!ray || (!allowEdgeHeads && ray.length === 0)) continue;
        // heads deep inside the board (long exit lines) are preferred: later arrows will likely block them
        const weight = (1 + ray.length) ** (1.5 + difficulty) * (ray.length === 0 ? 1 - 0.8 * difficulty : 1);
        candidates.push({ head, neck: indexOf(neckRow, neckColumn), direction, ray, weight });
        totalWeight += weight;
      }
    }
    if (!candidates.length) return false;
    const pickCandidate = () => {
      let pick = random() * totalWeight;
      for (const candidate of candidates) { pick -= candidate.weight; if (pick <= 0) return candidate; }
      return candidates[candidates.length - 1];
    };
    let best: { candidate: HeadCandidate; cells: number[]; score: number } | null = null;
    for (let sample = 0; sample < samplesPerArrow; sample++) {
      const candidate = pickCandidate();
      const cells = growBody(candidate);
      const score = samplesPerArrow > 1 ? scoreCandidate(cells, candidate) + random() * 0.3 : 0;
      if (!best || score > best.score) best = { candidate, cells, score };
    }
    const { candidate, cells } = best!;
    const arrowIndex = placed.length;
    const newlyBlocked = new Set<number>();
    for (const cell of cells) { owner[cell] = arrowIndex; rayOwners[cell].forEach(earlier => newlyBlocked.add(earlier)); }
    newlyBlocked.forEach(earlier => { placed[earlier].blockedBy++; });
    for (const cell of candidate.ray) rayOwners[cell].push(arrowIndex);
    placed.push({ cells, direction: candidate.direction, ray: candidate.ray, blockedBy: 0 });
    directionCounts[candidate.direction]++;
    return true;
  };

  /** Lengthen arrows at the tail into empty cells where that stays solvable. */
  const extendTails = (): boolean => {
    let changed = false;
    for (let index = 0; index < cellCount; index++) {
      if (owner[index] !== -1) continue;
      const row = Math.floor(index / columns), column = index % columns;
      const usable: number[] = [];
      for (const direction of DIRECTIONS) {
        const { rowStep, columnStep } = DIRECTION_STEPS[direction];
        if (!inside(row + rowStep, column + columnStep)) continue;
        const neighbor = indexOf(row + rowStep, column + columnStep);
        const arrowIndex = owner[neighbor];
        if (arrowIndex === -1 || placed[arrowIndex].cells[0] !== neighbor || placed[arrowIndex].cells.length >= maxTotalLength) continue;
        if (rayOwners[index].every(rayOwner => rayOwner < arrowIndex)) usable.push(arrowIndex);
      }
      if (!usable.length) continue;
      const arrowIndex = usable[Math.floor(random() * usable.length)];
      placed[arrowIndex].cells.unshift(index);
      owner[index] = arrowIndex;
      for (const earlier of rayOwners[index]) {
        if (!placed[arrowIndex].cells.some(cell => cell !== index && rayOwners[cell].includes(earlier))) placed[earlier].blockedBy++;
      }
      changed = true;
    }
    return changed;
  };

  // On harder levels, first fill the board without heads that sit on the edge pointing straight out (those are
  // always free); tails grow into the gaps, and only the pockets left after that get edge arrows.
  const phases = difficulty > 0.3 ? [false, true] : [true];
  for (const allowEdgeHeads of phases) {
    for (let round = 0; round < 50; round++) {
      let placedAny = false;
      while (placeArrow(allowEdgeHeads)) placedAny = true;
      const extended = extendTails();
      if (!placedAny && !extended) break;
    }
  }

  /**
   * Arrows that end up free at the start are mostly small leftovers squeezed against an edge. On harder levels
   * such an arrow is merged into a neighbour: if one end of it touches another arrow's tail, that arrow simply
   * becomes longer at its tail (the same tail rule as above keeps the level solvable), so the board stays just
   * as full but has one less obvious first move.
   */
  const isRemoved = (arrowIndex: number) => placed[arrowIndex].cells.length === 0;
  const isFreeNow = (arrowIndex: number) => placed[arrowIndex].ray.every(cell => owner[cell] === -1);
  const neighborsOf = (index: number) => DIRECTIONS.map(direction => {
    const { rowStep, columnStep } = DIRECTION_STEPS[direction];
    const row = Math.floor(index / columns) + rowStep, column = (index % columns) + columnStep;
    return inside(row, column) ? indexOf(row, column) : -1;
  }).filter(neighbor => neighbor !== -1);
  const mergeFreeArrow = (freeIndex: number): boolean => {
    const free = placed[freeIndex];
    const ends = [free.cells[free.cells.length - 1], free.cells[0]];
    for (const [endPosition, end] of ends.entries()) {
      for (const neighbor of neighborsOf(end)) {
        const absorberIndex = owner[neighbor];
        if (absorberIndex === -1 || absorberIndex === freeIndex) continue;
        const absorber = placed[absorberIndex];
        if (absorber.cells[0] !== neighbor || absorber.cells.length + free.cells.length > shape.maxLength + 8) continue;
        const allowed = free.cells.every(cell => rayOwners[cell].every(rayOwner => rayOwner === freeIndex || rayOwner < absorberIndex));
        if (!allowed) continue;
        // the free arrow's cells, ordered so the end touching the absorber's tail comes last
        const addedCells = endPosition === 0 ? [...free.cells] : [...free.cells].reverse();
        for (const cell of free.ray) rayOwners[cell] = rayOwners[cell].filter(rayOwner => rayOwner !== freeIndex);
        for (const cell of addedCells) owner[cell] = absorberIndex;
        absorber.cells = [...addedCells, ...absorber.cells];
        free.cells = [];
        free.ray = [];
        directionCounts[free.direction]--;
        return true;
      }
    }
    return false;
  };
  if (difficulty > 0) {
    const targetFreeShare = 0.4 - 0.33 * difficulty;
    for (let pass = 0; pass < 4; pass++) {
      let merged = false;
      for (let arrowIndex = placed.length - 1; arrowIndex >= 0; arrowIndex--) {
        if (isRemoved(arrowIndex) || !isFreeNow(arrowIndex)) continue;
        const liveArrows = placed.filter((_, index) => !isRemoved(index));
        const freeCount = liveArrows.filter(arrow => arrow.ray.every(cell => owner[cell] === -1)).length;
        if (freeCount <= Math.max(1, Math.round(targetFreeShare * liveArrows.length))) break;
        if (mergeFreeArrow(arrowIndex)) merged = true;
      }
      if (!merged) break;
    }
  }

  const arrows: Arrow[] = placed.filter((_, index) => !isRemoved(index)).map((arrow, id) => ({
    id, direction: arrow.direction, cells: arrow.cells.map(cell => ({ row: Math.floor(cell / columns), column: cell % columns })),
  }));
  return { number: levelNumber, rows, columns, arrows };
}

/** The order to clear a level in (all free arrows each round), or null when it cannot be cleared. */
export function clearingOrder(level: Level): number[] | null {
  const blockersOf = dependencies(level);
  const remaining = new Set(level.arrows.map(arrow => arrow.id));
  const order: number[] = [];
  while (remaining.size) {
    const free = [...remaining].filter(arrowId => blockersOf[arrowId].every(blocker => !remaining.has(blocker)));
    if (!free.length) return null;
    free.forEach(arrowId => { remaining.delete(arrowId); order.push(arrowId); });
  }
  return order;
}

/**
 * Last pass for harder levels. The placement order is one valid way to clear the board, but any board whose
 * "must leave before" graph has no loops can be cleared, so here small edits are tried and kept only when the
 * whole level still clears (checked by simulation):
 * - an empty cell is added to the tail of a touching arrow (fuller board, and the cell may block an exit line);
 * - an arrow that is free at the start is turned around (same cells, head at the other end) so it points into
 *   the board and has to wait;
 * - a free arrow is appended to the tail of a touching arrow, so one obvious first move disappears.
 * Arrows are then renumbered so the highest id can leave first.
 */
function tangleLevel(level: Level, targetFreeShare: number, maxArrowLength: number, random: () => number): Level {
  const targetFreeCount = Math.max(1, Math.round(targetFreeShare * level.arrows.length));
  let arrows = level.arrows.map(arrow => ({ ...arrow, cells: [...arrow.cells] }));
  const asLevel = (candidateArrows: Arrow[]): Level => ({ ...level, arrows: candidateArrows.map((arrow, id) => ({ ...arrow, id })) });
  const freeCount = (candidateArrows: Arrow[]) => dependencies(asLevel(candidateArrows)).filter(blockers => !blockers.length).length;
  const isClearable = (candidateArrows: Arrow[]) => clearingOrder(asLevel(candidateArrows)) !== null;
  const key = (cell: Cell) => `${cell.row},${cell.column}`;
  const isAdjacent = (first: Cell, second: Cell) => Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
  const rayCrossesBody = (arrow: Arrow) => {
    const ownCells = new Set(arrow.cells.map(key));
    return exitPath(arrow, level.rows, level.columns).some(cell => ownCells.has(key(cell)));
  };
  const directionFrom = (neck: Cell, head: Cell) => DIRECTIONS.find(direction =>
    DIRECTION_STEPS[direction].rowStep === head.row - neck.row && DIRECTION_STEPS[direction].columnStep === head.column - neck.column)!;

  const fillEmptyCells = () => {
    const covered = new Set(arrows.flatMap(arrow => arrow.cells.map(key)));
    for (let row = 0; row < level.rows; row++) {
      for (let column = 0; column < level.columns; column++) {
        const cell = { row, column };
        if (covered.has(key(cell))) continue;
        for (const arrowIndex of shuffled(arrows.map((_, index) => index), random)) {
          const arrow = arrows[arrowIndex];
          if (arrow.cells.length >= maxArrowLength || !isAdjacent(arrow.cells[0], cell)) continue;
          const trial = arrows.map((other, index) => (index === arrowIndex ? { ...other, cells: [cell, ...other.cells] } : other));
          if (rayCrossesBody(trial[arrowIndex]) || !isClearable(trial)) continue;
          arrows = trial;
          covered.add(key(cell));
          break;
        }
      }
    }
  };

  const removeFreeArrows = () => {
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      const blockersOf = dependencies(asLevel(arrows));
      const freeArrows = shuffled(arrows.filter((_, index) => !blockersOf[index].length), random);
      for (const freeArrow of freeArrows) {
        if (freeCount(arrows) <= targetFreeCount) return;
        const freeIndex = arrows.indexOf(freeArrow);
        const before = freeCount(arrows);
        // 1) turn it around
        const reversedCells = [...freeArrow.cells].reverse();
        const turned = { ...freeArrow, cells: reversedCells, direction: directionFrom(reversedCells[reversedCells.length - 2], reversedCells[reversedCells.length - 1]) };
        const turnedTrial = arrows.map((arrow, index) => (index === freeIndex ? turned : arrow));
        if (!rayCrossesBody(turned) && freeCount(turnedTrial) < before && isClearable(turnedTrial)) { arrows = turnedTrial; changed = true; continue; }
        // 2) join it onto the tail of a touching arrow
        let joined = false;
        for (const [endIndex, end] of [freeArrow.cells[freeArrow.cells.length - 1], freeArrow.cells[0]].entries()) {
          for (let absorberIndex = 0; absorberIndex < arrows.length && !joined; absorberIndex++) {
            const absorber = arrows[absorberIndex];
            if (absorberIndex === freeIndex || !isAdjacent(absorber.cells[0], end)) continue;
            if (absorber.cells.length + freeArrow.cells.length > maxArrowLength) continue;
            const addedCells = endIndex === 0 ? [...freeArrow.cells] : reversedCells;
            const longer = { ...absorber, cells: [...addedCells, ...absorber.cells] };
            if (rayCrossesBody(longer)) continue;
            const joinTrial = arrows.map((arrow, index) => (index === absorberIndex ? longer : arrow)).filter((_, index) => index !== freeIndex);
            if (freeCount(joinTrial) < before && isClearable(joinTrial)) { arrows = joinTrial; joined = true; }
          }
          if (joined) break;
        }
        if (joined) changed = true;
      }
      if (!changed) return;
    }
  };

  /**
   * Cut a long arrow in two: the tail half becomes its own arrow whose head points into the rest of the old
   * arrow, so it always has to wait for it. More arrows, no extra free ones. Only cuts where the new arrow
   * points a different way than the arrow in front of it (no same-direction lanes).
   */
  const splitLongArrows = (targetFreeShare: number) => {
    for (const arrowIndex of shuffled(arrows.map((_, index) => index), random)) {
      if (freeCount(arrows) / arrows.length <= targetFreeShare) return;
      const arrow = arrows[arrowIndex];
      if (arrow.cells.length < 6) continue;
      const freeBefore = freeCount(arrows);
      const cutPoints = shuffled(Array.from({ length: arrow.cells.length - 5 }, (_, index) => index + 3), random);
      for (const cut of cutPoints) {
        const tailPart = arrow.cells.slice(0, cut);
        const direction = directionFrom(tailPart[tailPart.length - 2], tailPart[tailPart.length - 1]);
        // the new head must point straight into the rest of the old arrow
        if (directionFrom(tailPart[tailPart.length - 1], arrow.cells[cut]) !== direction || direction === arrow.direction) continue;
        const tailArrow: Arrow = { id: -1, direction, cells: tailPart };
        if (rayCrossesBody(tailArrow)) continue;
        const trial = [...arrows.map((other, index) => (index === arrowIndex ? { ...other, cells: other.cells.slice(cut) } : other)), tailArrow];
        if (freeCount(trial) > freeBefore || !isClearable(trial)) continue;
        arrows = trial;
        break;
      }
    }
  };

  fillEmptyCells();
  removeFreeArrows();
  fillEmptyCells();
  splitLongArrows(targetFreeShare);
  // renumber: the arrow that leaves first gets the highest id
  const order = clearingOrder(asLevel(arrows))!;
  const renumbered = order.reverse().map((oldId, newId) => ({ ...arrows[oldId], id: newId }));
  return { ...level, arrows: renumbered };
}

export const fillRatio = (level: Level) => level.arrows.reduce((total, arrow) => total + arrow.cells.length, 0) / (level.rows * level.columns);

export type PlayStatus = 'playing' | 'won' | 'failed';

export interface ArrowGameState {
  level: Level;
  /** Ids of arrows that have left the board, in order. */
  removedIds: number[];
  livesLeft: number;
  mistakes: number;
  hintsUsed: number;
  status: PlayStatus;
}

const levelCache = new Map<number, Level>();
/** Generated levels are cached (they never change). */
export function getLevel(levelNumber: number): Level {
  let level = levelCache.get(levelNumber);
  if (!level) {
    level = generateLevel(levelNumber);
    if (levelCache.size > 20) levelCache.clear();
    levelCache.set(levelNumber, level);
  }
  return level;
}

export function startLevel(levelNumber: number): ArrowGameState {
  return { level: getLevel(levelNumber), removedIds: [], livesLeft: LIVES_PER_LEVEL, mistakes: 0, hintsUsed: 0, status: 'playing' };
}

/** Grid of arrow ids for the arrows still on the board. */
export function occupancy(level: Level, removedIds: readonly number[]): (number | null)[][] {
  const removed = new Set(removedIds);
  const grid: (number | null)[][] = Array.from({ length: level.rows }, () => Array(level.columns).fill(null));
  for (const arrow of level.arrows) {
    if (removed.has(arrow.id)) continue;
    for (const { row, column } of arrow.cells) grid[row][column] = arrow.id;
  }
  return grid;
}

/** The first arrow in the way, and how many free cells there are before it (null when the path is clear). */
export function findBlocker(level: Level, removedIds: readonly number[], arrowId: number): { blockerId: number; freeCells: number } | null {
  const grid = occupancy(level, removedIds);
  const path = exitPath(level.arrows[arrowId], level.rows, level.columns);
  for (let index = 0; index < path.length; index++) {
    const blockerId = grid[path[index].row][path[index].column];
    if (blockerId !== null) return { blockerId, freeCells: index };
  }
  return null;
}

export const isOnBoard = (state: ArrowGameState, arrowId: number) => arrowId >= 0 && arrowId < state.level.arrows.length && !state.removedIds.includes(arrowId);
export const canEscape = (state: ArrowGameState, arrowId: number) => isOnBoard(state, arrowId) && findBlocker(state.level, state.removedIds, arrowId) === null;

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'escaped' }
  | { kind: 'blocked'; blockerId: number; freeCells: number };

/** Tap an arrow: it escapes if its path is clear, otherwise it bumps into the first arrow in the way and a life is lost. */
export function tapArrow(state: ArrowGameState, arrowId: number): { state: ArrowGameState; result: TapResult } {
  if (state.status !== 'playing' || !isOnBoard(state, arrowId)) return { state, result: { kind: 'ignored' } };
  const blocker = findBlocker(state.level, state.removedIds, arrowId);
  if (blocker) {
    const livesLeft = state.livesLeft - 1;
    return {
      state: { ...state, livesLeft, mistakes: state.mistakes + 1, status: livesLeft <= 0 ? 'failed' : 'playing' },
      result: { kind: 'blocked', ...blocker },
    };
  }
  const removedIds = [...state.removedIds, arrowId];
  const status: PlayStatus = removedIds.length === state.level.arrows.length ? 'won' : 'playing';
  return { state: { ...state, removedIds, status }, result: { kind: 'escaped' } };
}

/** Put the last escaped arrow back. Lives lost stay lost. */
export function undoLast(state: ArrowGameState): ArrowGameState {
  if (state.status !== 'playing' || state.removedIds.length === 0) return state;
  return { ...state, removedIds: state.removedIds.slice(0, -1) };
}

/** An arrow that can escape right now (the one whose head is nearest the top-left), or null. */
export function findHint(state: ArrowGameState): number | null {
  if (state.status !== 'playing') return null;
  const free = state.level.arrows.filter(arrow => canEscape(state, arrow.id));
  if (free.length === 0) return null;
  free.sort((first, second) => headOf(first).row - headOf(second).row || headOf(first).column - headOf(second).column);
  return free[0].id;
}

export const arrowsLeft = (state: ArrowGameState) => state.level.arrows.length - state.removedIds.length;
