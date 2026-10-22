/**
 * Color Trails puzzles: a grid where every color has two dots. A solution joins each pair with one path
 * (orthogonal steps, no crossing) so that every cell is covered.
 *
 * This file has the puzzle format, an exact solver (it counts solutions, so it can prove a puzzle has exactly
 * one), difficulty metrics and the generator. Levels are generated ahead of time by
 * `scripts/generate-color-trails.ts` into `levels.json`; the game only decodes them.
 */
import { createRandom } from '../random';

export interface Puzzle {
  rows: number;
  columns: number;
  /** Two endpoint cells per color (cell index = row * columns + column). */
  endpoints: [number, number][];
  /** The unique solution: one path of cell indices per color, from endpoints[color][0] to endpoints[color][1]. */
  solution: number[][];
}

export const COLOR_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// ---------- Encoding: the solution grid as one letter per cell ----------

/**
 * Generated solutions never touch themselves (no cell of a path is next to a non-neighbouring cell of the
 * same path), so each color's cells form a simple chain and the endpoints are the cells with one same-color neighbour.
 */
export function decodePuzzle(rows: number, columns: number, grid: string): Puzzle {
  const colorCount = Math.max(...[...grid].map(letter => COLOR_LETTERS.indexOf(letter))) + 1;
  const colorOf = [...grid].map(letter => COLOR_LETTERS.indexOf(letter));
  const neighbors = buildNeighbors(rows, columns);
  const solution: number[][] = [];
  const endpoints: [number, number][] = [];
  for (let color = 0; color < colorCount; color++) {
    const cells = colorOf.flatMap((cellColor, cell) => (cellColor === color ? [cell] : []));
    const sameColorNeighbors = (cell: number) => neighbors[cell].filter(neighbor => colorOf[neighbor] === color);
    const ends = cells.filter(cell => sameColorNeighbors(cell).length === 1);
    if (ends.length !== 2) throw new Error(`color ${color} is not a simple path`);
    const path = [ends[0]];
    while (path[path.length - 1] !== ends[1]) {
      const next = sameColorNeighbors(path[path.length - 1]).find(neighbor => neighbor !== path[path.length - 2]);
      if (next === undefined) throw new Error(`color ${color} is broken`);
      path.push(next);
    }
    if (path.length !== cells.length) throw new Error(`color ${color} has stray cells`);
    solution.push(path);
    endpoints.push([ends[0], ends[1]]);
  }
  return { rows, columns, endpoints, solution };
}

export function encodeSolution(rows: number, columns: number, solution: number[][]): string {
  const letters = Array<string>(rows * columns).fill('?');
  solution.forEach((path, color) => path.forEach(cell => { letters[cell] = COLOR_LETTERS[color]; }));
  return letters.join('');
}

const neighborCache = new Map<string, number[][]>();
export function buildNeighbors(rows: number, columns: number): number[][] {
  const key = `${rows}x${columns}`;
  let neighbors = neighborCache.get(key);
  if (!neighbors) {
    neighbors = Array.from({ length: rows * columns }, (_, cell) => {
      const row = Math.floor(cell / columns), column = cell % columns;
      const list: number[] = [];
      if (row > 0) list.push(cell - columns);
      if (row < rows - 1) list.push(cell + columns);
      if (column > 0) list.push(cell - 1);
      if (column < columns - 1) list.push(cell + 1);
      return list;
    });
    neighborCache.set(key, neighbors);
  }
  return neighbors;
}

// ---------- Solver ----------

export interface SolveResult {
  /** Number of solutions found, stopping at `limit`. */
  solutionCount: number;
  firstSolution: number[][] | null;
  /** Search nodes visited (the whole search, i.e. the work to prove uniqueness). */
  nodes: number;
  /** Branch points (2+ moves still looked possible) the solver met before it found the first solution. */
  guesses: number;
  /** True if the node budget ran out before the search finished (the answer is then unknown). */
  timedOut: boolean;
}

/**
 * Exact solver. Every color grows from both of its dots ("heads"); at each step the head with the fewest legal
 * moves is extended, trying each move in turn, so every solution is counted exactly once. Dead branches are cut by:
 * a head with no move; an empty cell that can't get two path connections; an empty region that no color can
 * enter from both of its heads; a color whose two heads can no longer meet.
 */
export function solvePuzzle(puzzle: Pick<Puzzle, 'rows' | 'columns' | 'endpoints'>, limit = 2, nodeBudget = 2_000_000): SolveResult {
  const { rows, columns, endpoints } = puzzle;
  const cellCount = rows * columns;
  const colorCount = endpoints.length;
  const neighbors = buildNeighbors(rows, columns);
  const owner = new Int16Array(cellCount).fill(-1);
  const heads = endpoints.map(([first, second]) => [first, second]);
  const paths = endpoints.map(([first, second]) => [[first], [second]]);
  const isDone = new Uint8Array(colorCount);
  endpoints.forEach(([first, second], color) => { owner[first] = color; owner[second] = color; });
  let emptyCount = cellCount - colorCount * 2;
  const region = new Int32Array(cellCount);
  const queue = new Int32Array(cellCount);
  let nodes = 0, solutionCount = 0, guesses = 0, timedOut = false;
  let firstSolution: number[][] | null = null;

  const isHead = (cell: number) => {
    const color = owner[cell];
    return color >= 0 && !isDone[color] && (heads[color][0] === cell || heads[color][1] === cell);
  };

  /** Label empty regions; returns false if the position is already hopeless. */
  const positionIsAlive = (): boolean => {
    // every empty cell needs two possible connections (empty neighbours or unfinished heads)
    for (let cell = 0; cell < cellCount; cell++) {
      if (owner[cell] !== -1) continue;
      let open = 0;
      for (const neighbor of neighbors[cell]) if (owner[neighbor] === -1 || isHead(neighbor)) open++;
      if (open < 2) return false;
    }
    region.fill(-1);
    let regionCount = 0;
    for (let start = 0; start < cellCount; start++) {
      if (owner[start] !== -1 || region[start] !== -1) continue;
      let read = 0, write = 0;
      queue[write++] = start;
      region[start] = regionCount;
      while (read < write) {
        const cell = queue[read++];
        for (const neighbor of neighbors[cell]) if (owner[neighbor] === -1 && region[neighbor] === -1) { region[neighbor] = regionCount; queue[write++] = neighbor; }
      }
      regionCount++;
    }
    const regionServed = new Uint8Array(regionCount);
    for (let color = 0; color < colorCount; color++) {
      if (isDone[color]) continue;
      const [first, second] = heads[color];
      let canMeet = neighbors[first].includes(second);
      for (const firstNeighbor of neighbors[first]) {
        if (owner[firstNeighbor] !== -1) continue;
        const firstRegion = region[firstNeighbor];
        for (const secondNeighbor of neighbors[second]) {
          if (owner[secondNeighbor] === -1 && region[secondNeighbor] === firstRegion) { canMeet = true; regionServed[firstRegion] = 1; }
        }
      }
      if (!canMeet) return false;
    }
    for (let index = 0; index < regionCount; index++) if (!regionServed[index]) return false;
    return true;
  };

  /** Moves for one head: each empty neighbour, or -2 meaning "join the other head". */
  const movesFor = (color: number, side: number, into: number[]) => {
    into.length = 0;
    const head = heads[color][side];
    const otherHead = heads[color][1 - side];
    for (const neighbor of neighbors[head]) {
      if (owner[neighbor] === -1) into.push(neighbor);
      else if (neighbor === otherHead) into.push(-2);
    }
    return into;
  };

  const scratch: number[] = [];
  const search = (onSolutionPath: boolean): void => {
    if (timedOut || solutionCount >= limit) return;
    if (++nodes > nodeBudget) { timedOut = true; return; }
    if (emptyCount === 0 && isDone.every(done => done === 1)) {
      solutionCount++;
      if (!firstSolution) firstSolution = paths.map(([fromFirst, fromSecond]) => [...fromFirst, ...[...fromSecond].reverse()]);
      return;
    }
    if (!positionIsAlive()) return;
    // the most constrained head
    let bestColor = -1, bestSide = 0, bestCount = 99;
    for (let color = 0; color < colorCount; color++) {
      if (isDone[color]) continue;
      for (let side = 0; side < 2; side++) {
        const count = movesFor(color, side, scratch).length;
        if (count < bestCount) { bestCount = count; bestColor = color; bestSide = side; }
      }
    }
    if (bestColor === -1 || bestCount === 0) return;
    const moves = [...movesFor(bestColor, bestSide, scratch)];
    if (moves.length > 1 && onSolutionPath && !firstSolution) guesses++;
    for (const move of moves) {
      if (move === -2) {
        isDone[bestColor] = 1;
        search(onSolutionPath && !firstSolution);
        isDone[bestColor] = 0;
      } else {
        const previousHead = heads[bestColor][bestSide];
        owner[move] = bestColor;
        heads[bestColor][bestSide] = move;
        paths[bestColor][bestSide].push(move);
        emptyCount--;
        search(onSolutionPath && !firstSolution);
        emptyCount++;
        paths[bestColor][bestSide].pop();
        heads[bestColor][bestSide] = previousHead;
        owner[move] = -1;
      }
      if (timedOut || solutionCount >= limit) break;
    }
  };
  search(true);
  return { solutionCount, firstSolution, nodes, guesses, timedOut };
}

// ---------- Metrics ----------

export interface PuzzleMetrics {
  cells: number;
  colors: number;
  averagePathLength: number;
  /** Average number of turns per path. */
  averageBends: number;
  /** Paths of 2–3 cells (near-trivial pairs). */
  shortPaths: number;
  /** Average of (straight-line distance between the dots) / (path length): low = the path wanders far from the direct route. */
  directness: number;
  /** Colors completed by forced moves alone (a head with only one way to go), from the start. */
  forcedColors: number;
  /** Share of the empty cells filled by forced moves alone. */
  forcedFillShare: number;
  /** Branch points the solver met before finding the solution (how much trial and error it took). */
  guesses: number;
  /** Search nodes to prove the solution is the only one. */
  searchNodes: number;
}

export const bendsOf = (path: number[], columns: number) => {
  let bends = 0;
  for (let index = 2; index < path.length; index++) {
    if (path[index] - path[index - 1] !== path[index - 1] - path[index - 2]) bends++;
  }
  return bends;
};

/** Apply only forced moves (heads with exactly one way to go) and see how far that gets. */
export function forcedProgress(puzzle: Puzzle): { forcedColors: number; forcedFillShare: number } {
  const { rows, columns, endpoints } = puzzle;
  const neighbors = buildNeighbors(rows, columns);
  const owner = new Int16Array(rows * columns).fill(-1);
  const heads = endpoints.map(([first, second]) => [first, second]);
  const isDone = new Uint8Array(endpoints.length);
  endpoints.forEach(([first, second], color) => { owner[first] = color; owner[second] = color; });
  const emptyAtStart = rows * columns - endpoints.length * 2;
  let filled = 0, changed = true;
  while (changed) {
    changed = false;
    for (let color = 0; color < endpoints.length; color++) {
      if (isDone[color]) continue;
      for (let side = 0; side < 2 && !isDone[color]; side++) {
        const head = heads[color][side], otherHead = heads[color][1 - side];
        const empty = neighbors[head].filter(neighbor => owner[neighbor] === -1);
        const canJoin = neighbors[head].includes(otherHead);
        if (canJoin && empty.length === 0) { isDone[color] = 1; changed = true; }
        else if (!canJoin && empty.length === 1) {
          owner[empty[0]] = color; heads[color][side] = empty[0]; filled++; changed = true;
        }
      }
    }
  }
  return { forcedColors: isDone.reduce((total, done) => total + done, 0), forcedFillShare: emptyAtStart ? filled / emptyAtStart : 1 };
}

export function measurePuzzle(puzzle: Puzzle, solveResult?: SolveResult): PuzzleMetrics {
  const result = solveResult ?? solvePuzzle(puzzle);
  const { columns } = puzzle;
  const lengths = puzzle.solution.map(path => path.length);
  const directness = puzzle.solution.map(path => {
    const [first, last] = [path[0], path[path.length - 1]];
    const distance = Math.abs(Math.floor(first / columns) - Math.floor(last / columns)) + Math.abs((first % columns) - (last % columns));
    return distance / (path.length - 1);
  });
  const forced = forcedProgress(puzzle);
  return {
    cells: puzzle.rows * puzzle.columns,
    colors: puzzle.solution.length,
    averagePathLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    averageBends: puzzle.solution.reduce((total, path) => total + bendsOf(path, columns), 0) / lengths.length,
    shortPaths: lengths.filter(length => length <= 3).length,
    directness: directness.reduce((a, b) => a + b, 0) / directness.length,
    forcedColors: forced.forcedColors,
    forcedFillShare: forced.forcedFillShare,
    guesses: result.guesses,
    searchNodes: result.nodes,
  };
}

// ---------- Generator ----------

export interface LevelPlan {
  rows: number;
  columns: number;
  /** Aim for about this many colors (fewer colors = longer, more tangled paths). */
  colors: number;
}

/**
 * Cover the board with random winding paths that never touch themselves, then merge paths end-to-end until
 * the target color count is reached. Returns null when this attempt can't make a valid board.
 */
export function randomPartition(plan: LevelPlan, random: () => number): number[][] | null {
  const { rows, columns } = plan;
  const cellCount = rows * columns;
  const neighbors = buildNeighbors(rows, columns);
  const owner = new Int16Array(cellCount).fill(-1);
  const paths: number[][] = [];
  const freeNeighborCount = (cell: number) => neighbors[cell].reduce((total, neighbor) => total + (owner[neighbor] === -1 ? 1 : 0), 0);
  /** Adding `cell` to the end of path `pathIndex` keeps the path from touching itself. */
  const keepsPathSimple = (pathIndex: number, cell: number, attachTo: number) =>
    neighbors[cell].every(neighbor => neighbor === attachTo || owner[neighbor] !== pathIndex);
  const targetLength = Math.max(3, Math.round(cellCount / (plan.colors * 1.6)));

  while (true) {
    // start where the board is tightest, so corners and pockets get used
    let start = -1, startScore = Infinity;
    for (let cell = 0; cell < cellCount; cell++) {
      if (owner[cell] !== -1) continue;
      const score = freeNeighborCount(cell) + random() * 0.9;
      if (score < startScore) { startScore = score; start = cell; }
    }
    if (start === -1) break;
    const pathIndex = paths.length;
    const path = [start];
    owner[start] = pathIndex;
    const wanted = targetLength + Math.floor(random() * targetLength);
    while (path.length < wanted) {
      const head = path[path.length - 1];
      const options = neighbors[head].filter(cell => owner[cell] === -1 && keepsPathSimple(pathIndex, cell, head));
      if (!options.length) break;
      // mostly hug walls/other paths (fewest free neighbours), sometimes go anywhere
      options.sort((first, second) => freeNeighborCount(first) - freeNeighborCount(second) + (random() - 0.5) * 2.2);
      const next = options[0];
      owner[next] = pathIndex;
      path.push(next);
    }
    paths.push(path);
  }

  // merge paths end to end: single cells first, then until the color count is reached
  const endsTouch = (first: number[], second: number[]) => {
    for (const [firstEnd, firstAtStart] of [[first[0], true], [first[first.length - 1], false]] as const) {
      for (const [secondEnd, secondAtStart] of [[second[0], true], [second[second.length - 1], false]] as const) {
        if (neighbors[firstEnd].includes(secondEnd)) return { firstAtStart, secondAtStart };
      }
    }
    return null;
  };
  const tryMerge = (mustInclude: (path: number[]) => boolean, preferShort: boolean): boolean => {
    const order = paths.map((_, index) => index).sort((first, second) => (preferShort ? paths[first].length - paths[second].length : 0) + (random() - 0.5) * (preferShort ? 0.5 : 4));
    for (const firstIndex of order) {
      if (!mustInclude(paths[firstIndex])) continue;
      for (const secondIndex of order) {
        if (secondIndex === firstIndex) continue;
        const touch = endsTouch(paths[firstIndex], paths[secondIndex]);
        if (!touch) continue;
        const first = touch.firstAtStart ? [...paths[firstIndex]].reverse() : paths[firstIndex];
        const second = touch.secondAtStart ? paths[secondIndex] : [...paths[secondIndex]].reverse();
        const merged = [...first, ...second];
        // the merged path must not touch itself
        const positions = new Map(merged.map((cell, index) => [cell, index]));
        const simple = merged.every((cell, index) => neighbors[cell].every(neighbor => {
          const other = positions.get(neighbor);
          return other === undefined || Math.abs(other - index) === 1;
        }));
        if (!simple) continue;
        const keep = Math.min(firstIndex, secondIndex), drop = Math.max(firstIndex, secondIndex);
        paths[keep] = merged;
        paths.splice(drop, 1);
        return true;
      }
    }
    return false;
  };
  while (paths.some(path => path.length < 3)) {
    if (!tryMerge(path => path.length < 3, true)) return null;
  }
  while (paths.length > plan.colors) {
    if (!tryMerge(() => true, true)) break;
  }
  if (paths.length > plan.colors + 2 || paths.length > COLOR_LETTERS.length) return null;
  return paths;
}

export function puzzleFromPaths(rows: number, columns: number, paths: number[][]): Puzzle {
  return { rows, columns, endpoints: paths.map(path => [path[0], path[path.length - 1]]), solution: paths };
}

/** Try seeds until a board with exactly one solution comes out. */
export function generateUniquePuzzle(plan: LevelPlan, seed: number, maxAttempts = 400, nodeBudget = 300_000):
  { puzzle: Puzzle; result: SolveResult; attempts: number } | null {
  const random = createRandom(seed);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const paths = randomPartition(plan, random);
    if (!paths) continue;
    const puzzle = puzzleFromPaths(plan.rows, plan.columns, paths);
    const result = solvePuzzle(puzzle, 2, nodeBudget);
    if (result.solutionCount === 1 && !result.timedOut) return { puzzle, result, attempts: attempt };
  }
  return null;
}
