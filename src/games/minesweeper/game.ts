/** Pure Minesweeper logic: no React, no timers. Cells are stored in flat arrays (index = row * columns + column). */
import { shuffled } from '../random';

export type DifficultyId = 'beginner' | 'intermediate' | 'expert';
export interface Difficulty { id: DifficultyId; label: string; rows: number; columns: number; mines: number; }

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: 'Beginner', rows: 9, columns: 9, mines: 10 },
  { id: 'intermediate', label: 'Intermediate', rows: 16, columns: 16, mines: 40 },
  { id: 'expert', label: 'Expert', rows: 16, columns: 30, mines: 99 },
];
export const difficultyById = (id: DifficultyId) => DIFFICULTIES.find(difficulty => difficulty.id === id) ?? DIFFICULTIES[0];

export type CellState = 'hidden' | 'revealed' | 'flagged';
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface MinesweeperState {
  difficulty: DifficultyId;
  rows: number;
  columns: number;
  mineCount: number;
  /** Empty until the first reveal, so the first click is always safe. */
  isMine: boolean[];
  adjacentMines: number[];
  cellStates: CellState[];
  status: GameStatus;
  /** The mine that was clicked, when lost. */
  explodedIndex: number | null;
  /** Play time so far (the component adds the running time). */
  elapsedMs: number;
}

export function createGame(difficultyId: DifficultyId): MinesweeperState {
  const { rows, columns, mines } = difficultyById(difficultyId);
  return {
    difficulty: difficultyId, rows, columns, mineCount: mines,
    isMine: Array(rows * columns).fill(false), adjacentMines: Array(rows * columns).fill(0),
    cellStates: Array(rows * columns).fill('hidden'), status: 'ready', explodedIndex: null, elapsedMs: 0,
  };
}

/** Indexes of the up to 8 cells around a cell. */
export function neighborIndexes(index: number, rows: number, columns: number): number[] {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const neighbors: number[] = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (neighborRow >= 0 && neighborRow < rows && neighborColumn >= 0 && neighborColumn < columns) neighbors.push(neighborRow * columns + neighborColumn);
    }
  }
  return neighbors;
}

export function countAdjacentMines(isMine: boolean[], rows: number, columns: number): number[] {
  return isMine.map((_, index) => neighborIndexes(index, rows, columns).filter(neighbor => isMine[neighbor]).length);
}

/** Put mines at exact positions (for tests and restoring). */
export function withMines(state: MinesweeperState, mineIndexes: number[]): MinesweeperState {
  const isMine = Array(state.rows * state.columns).fill(false);
  for (const index of mineIndexes) isMine[index] = true;
  return { ...state, isMine, mineCount: mineIndexes.length, adjacentMines: countAdjacentMines(isMine, state.rows, state.columns), status: 'playing' };
}

/** Place mines anywhere except the clicked cell and its neighbours, so the first click opens an area. */
export function placeMines(state: MinesweeperState, safeIndex: number, random: () => number = Math.random): MinesweeperState {
  const total = state.rows * state.columns;
  const safeArea = new Set([safeIndex, ...neighborIndexes(safeIndex, state.rows, state.columns)]);
  // Tiny boards may not have room to keep the neighbours clear; then only the clicked cell is safe.
  if (total - safeArea.size < state.mineCount) { safeArea.clear(); safeArea.add(safeIndex); }
  const candidates = Array.from({ length: total }, (_, index) => index).filter(index => !safeArea.has(index));
  return withMines(state, shuffled(candidates, random).slice(0, state.mineCount));
}

const countRevealed = (cellStates: CellState[]) => cellStates.reduce((total, cellState) => total + (cellState === 'revealed' ? 1 : 0), 0);
export const countFlags = (state: MinesweeperState) => state.cellStates.reduce((total, cellState) => total + (cellState === 'flagged' ? 1 : 0), 0);
export const minesLeft = (state: MinesweeperState) => state.mineCount - countFlags(state);

/** When every safe cell is open the game is won and the remaining mines get flags. */
function checkWin(state: MinesweeperState): MinesweeperState {
  if (countRevealed(state.cellStates) !== state.rows * state.columns - state.mineCount) return state;
  return { ...state, status: 'won', cellStates: state.cellStates.map((cellState, index) => (state.isMine[index] ? 'flagged' : cellState)) };
}

function loseAt(state: MinesweeperState, index: number): MinesweeperState {
  // show every mine (flags on real mines stay)
  const cellStates = state.cellStates.map((cellState, cellIndex) => (state.isMine[cellIndex] && cellState !== 'flagged' ? 'revealed' : cellState));
  return { ...state, status: 'lost', explodedIndex: index, cellStates };
}

/** Open cells starting at the given ones; cells with no adjacent mines keep opening their neighbours (flood fill). */
function openCells(state: MinesweeperState, startIndexes: number[]): MinesweeperState {
  const cellStates = [...state.cellStates];
  const queue = startIndexes.filter(index => cellStates[index] === 'hidden');
  for (const index of queue) cellStates[index] = 'revealed';
  while (queue.length) {
    const index = queue.pop()!;
    if (state.adjacentMines[index] !== 0 || state.isMine[index]) continue;
    for (const neighbor of neighborIndexes(index, state.rows, state.columns)) {
      if (cellStates[neighbor] !== 'hidden') continue;
      cellStates[neighbor] = 'revealed';
      queue.push(neighbor);
    }
  }
  return { ...state, cellStates };
}

export const isFinished = (state: MinesweeperState) => state.status === 'won' || state.status === 'lost';

/** Reveal a cell (the first reveal places the mines). */
export function reveal(state: MinesweeperState, index: number, random: () => number = Math.random): MinesweeperState {
  if (isFinished(state) || state.cellStates[index] !== 'hidden') return state;
  const current = state.status === 'ready' ? placeMines(state, index, random) : state;
  if (current.isMine[index]) return loseAt(current, index);
  return checkWin(openCells(current, [index]));
}

/** Flag or unflag a hidden cell. */
export function toggleFlag(state: MinesweeperState, index: number): MinesweeperState {
  if (state.status !== 'playing') return state;
  const cellState = state.cellStates[index];
  if (cellState === 'revealed') return state;
  const cellStates = [...state.cellStates];
  cellStates[index] = cellState === 'flagged' ? 'hidden' : 'flagged';
  return { ...state, cellStates };
}

/** Chording: on an open number whose flags are all placed, open all the other neighbours at once. */
export function chord(state: MinesweeperState, index: number): MinesweeperState {
  if (state.status !== 'playing' || state.cellStates[index] !== 'revealed' || state.adjacentMines[index] === 0) return state;
  const neighbors = neighborIndexes(index, state.rows, state.columns);
  const flaggedCount = neighbors.filter(neighbor => state.cellStates[neighbor] === 'flagged').length;
  if (flaggedCount !== state.adjacentMines[index]) return state;
  const toOpen = neighbors.filter(neighbor => state.cellStates[neighbor] === 'hidden');
  if (toOpen.length === 0) return state;
  const wrongMine = toOpen.find(neighbor => state.isMine[neighbor]);
  if (wrongMine !== undefined) return loseAt(openCells(state, toOpen.filter(neighbor => !state.isMine[neighbor])), wrongMine);
  return checkWin(openCells(state, toOpen));
}

/** How many cells one action opened (for choosing a sound). */
export const revealedDifference = (before: MinesweeperState, after: MinesweeperState) => countRevealed(after.cellStates) - countRevealed(before.cellStates);
