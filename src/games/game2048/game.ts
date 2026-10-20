/**
 * 2048 game logic.
 * Originally from https://github.com/abhi1kush/2048 (src/game.ts @ f37ad66).
 * Logic is unchanged; local variable names were expanded for readability.
 */
export const SIZE = 4;
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Tile { id: number; value: number; row: number; col: number; merged?: boolean; isNew?: boolean; }
export interface GameState { tiles: Tile[]; score: number; won: boolean; over: boolean; keepPlaying: boolean; }

let nextId = 1;
export const newId = () => nextId++;

export type Rng = () => number;

export function emptyCells(tiles: Tile[]): [number, number][] {
  const occupiedCells = new Set(tiles.map(tile => tile.row * SIZE + tile.col));
  const emptyPositions: [number, number][] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!occupiedCells.has(row * SIZE + col)) emptyPositions.push([row, col]);
    }
  }
  return emptyPositions;
}

export function spawnTile(tiles: Tile[], random: Rng = Math.random): Tile[] {
  const cells = emptyCells(tiles);
  if (!cells.length) return tiles;
  const [row, col] = cells[Math.floor(random() * cells.length)];
  const value = random() < 0.9 ? 2 : 4;
  return [...tiles, { id: newId(), value, row, col, isNew: true }];
}

export function newGame(random: Rng = Math.random): GameState {
  return { tiles: spawnTile(spawnTile([], random), random), score: 0, won: false, over: false, keepPlaying: false };
}

/** Build a state from a 2D grid of values (0 = empty). Useful for tests. */
export function fromGrid(grid: number[][]): Tile[] {
  const tiles: Tile[] = [];
  grid.forEach((rowValues, row) => rowValues.forEach((value, col) => {
    if (value) tiles.push({ id: newId(), value, row, col });
  }));
  return tiles;
}

export function toGrid(tiles: Tile[]): number[][] {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  tiles.forEach(tile => (grid[tile.row][tile.col] = tile.value));
  return grid;
}

export interface MoveResult { tiles: Tile[]; gained: number; moved: boolean; }

/** Slide tiles in a direction. Each tile merges at most once per move. Merged-away tiles are dropped. */
export function slide(tiles: Tile[], direction: Direction): MoveResult {
  const isHorizontal = direction === 'left' || direction === 'right';
  const towardStart = direction === 'left' || direction === 'up';
  const resultTiles: Tile[] = [];
  let gained = 0;
  let moved = false;
  for (let line = 0; line < SIZE; line++) {
    // collect tiles in this line ordered from the edge they move toward
    const tilesInLine = tiles.filter(tile => (isHorizontal ? tile.row : tile.col) === line);
    const positionAlongLine = (tile: Tile) => (isHorizontal ? tile.col : tile.row);
    tilesInLine.sort((first, second) => towardStart
      ? positionAlongLine(first) - positionAlongLine(second)
      : positionAlongLine(second) - positionAlongLine(first));
    let placedCount = 0;
    let lastPlaced: Tile | null = null;
    for (const tile of tilesInLine) {
      if (lastPlaced && lastPlaced.value === tile.value && !lastPlaced.merged) {
        lastPlaced.value *= 2;
        lastPlaced.merged = true;
        gained += lastPlaced.value;
        moved = true;
        continue;
      }
      const targetIndex = towardStart ? placedCount : SIZE - 1 - placedCount;
      const row = isHorizontal ? line : targetIndex;
      const col = isHorizontal ? targetIndex : line;
      if (row !== tile.row || col !== tile.col) moved = true;
      lastPlaced = { id: tile.id, value: tile.value, row, col };
      resultTiles.push(lastPlaced);
      placedCount++;
    }
  }
  return { tiles: resultTiles, gained, moved };
}

export function canMove(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return true;
  const grid = toGrid(tiles);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (col + 1 < SIZE && grid[row][col] === grid[row][col + 1]) return true;
      if (row + 1 < SIZE && grid[row][col] === grid[row + 1][col]) return true;
    }
  }
  return false;
}

export function move(state: GameState, direction: Direction, random: Rng = Math.random): GameState {
  if (state.over || (state.won && !state.keepPlaying)) return state;
  const slideResult = slide(state.tiles, direction);
  if (!slideResult.moved) return state;
  const tiles = spawnTile(slideResult.tiles, random);
  const won = state.won || tiles.some(tile => tile.value >= 2048);
  return { ...state, tiles, score: state.score + slideResult.gained, won, over: !canMove(tiles) };
}
