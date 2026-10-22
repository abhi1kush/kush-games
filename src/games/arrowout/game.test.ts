import { describe, expect, it } from 'vitest';
import {
  Arrow, canEscape, countBends, exitPath, fillRatio, findBlocker, findHint, generateLevel, headOf, Level, levelShape, LIVES_PER_LEVEL, MAX_COLUMNS, MAX_ROWS,
  startLevel, tapArrow, undoLast,
} from './game';
import { ARROW_SAVE_VERSION, restoreArrowGame, serializeArrowGame } from './save';
import { SAVE_VERSIONS } from '../persistence';

/** Keep tapping any free arrow; returns true when the board empties without a single blocked tap. */
function clearsBySimulation(levelNumber: number): boolean {
  let state = startLevel(levelNumber);
  while (state.status === 'playing') {
    const freeArrow = findHint(state);
    if (freeArrow === null) return false;
    state = tapArrow(state, freeArrow).state;
  }
  return state.status === 'won' && state.mistakes === 0;
}

const isAdjacent = (first: { row: number; column: number }, second: { row: number; column: number }) =>
  Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;

describe('arrow out level generator', () => {
  it('levels 1–60: connected paths, no overlaps, packed boards, fully clearable', () => {
    for (let levelNumber = 1; levelNumber <= 60; levelNumber++) {
      const level = generateLevel(levelNumber);
      const covered = new Set<string>();
      for (const arrow of level.arrows) {
        expect(arrow.cells.length).toBeGreaterThanOrEqual(2);
        arrow.cells.forEach((cell, index) => {
          expect(cell.row >= 0 && cell.row < level.rows && cell.column >= 0 && cell.column < level.columns).toBe(true);
          if (index) expect(isAdjacent(cell, arrow.cells[index - 1])).toBe(true); // a continuous path
          const key = `${cell.row},${cell.column}`;
          expect(covered.has(key)).toBe(false); // no overlaps, including with itself
          covered.add(key);
        });
        // the head's own ray never crosses its body
        const ownCells = new Set(arrow.cells.map(cell => `${cell.row},${cell.column}`));
        expect(exitPath(arrow, level.rows, level.columns).some(cell => ownCells.has(`${cell.row},${cell.column}`))).toBe(false);
      }
      expect(fillRatio(level)).toBeGreaterThanOrEqual(0.9);
      expect(clearsBySimulation(levelNumber)).toBe(true);
    }
  });

  it('reverse placement order is a valid clearing order', () => {
    for (const levelNumber of [1, 12, 40]) {
      let state = startLevel(levelNumber);
      for (let id = state.level.arrows.length - 1; id >= 0; id--) {
        expect(canEscape(state, id)).toBe(true);
        state = tapArrow(state, id).state;
      }
      expect(state.status).toBe('won');
    }
  });

  it('mid and late levels have winding arrows and blocked arrows', () => {
    for (let levelNumber = 8; levelNumber <= 40; levelNumber++) {
      const level = generateLevel(levelNumber);
      const averageBends = level.arrows.reduce((total, arrow) => total + countBends(arrow), 0) / level.arrows.length;
      expect(averageBends).toBeGreaterThan(1);
      expect(Math.max(...level.arrows.map(arrow => arrow.cells.length))).toBeGreaterThanOrEqual(8);
      const state = startLevel(levelNumber);
      const freeCount = level.arrows.filter(arrow => canEscape(state, arrow.id)).length;
      expect(freeCount).toBeLessThan(level.arrows.length / 2);
    }
  });

  it('is deterministic and grows from 5×5 to 12×16', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
    expect(levelShape(1)).toMatchObject({ rows: 5, columns: 5 });
    const shapes = Array.from({ length: 40 }, (_, index) => levelShape(index + 1));
    shapes.forEach((shape, index) => {
      if (!index) return;
      expect(shape.rows).toBeGreaterThanOrEqual(shapes[index - 1].rows);
      expect(shape.columns).toBeGreaterThanOrEqual(shapes[index - 1].columns);
      expect(shape.maxLength).toBeGreaterThanOrEqual(shapes[index - 1].maxLength);
    });
    expect(levelShape(30)).toMatchObject({ rows: MAX_ROWS, columns: MAX_COLUMNS });
  });
});

describe('arrow out moves', () => {
  // 3×3 board:  an L-shaped arrow (0,0)→(1,0)→(1,1) pointing right is blocked by a 2-cell arrow in column 2.
  const blocked: Arrow = { id: 0, cells: [{ row: 0, column: 0 }, { row: 1, column: 0 }, { row: 1, column: 1 }], direction: 'right' };
  const blocker: Arrow = { id: 1, cells: [{ row: 2, column: 2 }, { row: 1, column: 2 }], direction: 'up' };
  const tinyLevel: Level = { number: 1, rows: 3, columns: 3, arrows: [blocked, blocker] };
  const tinyState = () => ({ ...startLevel(1), level: tinyLevel });

  it('only the straight line from the head to the edge matters', () => {
    expect(headOf(blocked)).toEqual({ row: 1, column: 1 });
    expect(exitPath(blocked, 3, 3)).toEqual([{ row: 1, column: 2 }]);
    expect(countBends(blocked)).toBe(1);
    expect(findBlocker(tinyLevel, [], 0)).toEqual({ blockerId: 1, freeCells: 0 });
    expect(findBlocker(tinyLevel, [], 1)).toBeNull(); // (0,2) is empty
    expect(findBlocker(tinyLevel, [1], 0)).toBeNull();
  });

  it('a blocked tap costs a life; three of them fail the level', () => {
    const first = tapArrow(tinyState(), 0);
    expect(first.result).toEqual({ kind: 'blocked', blockerId: 1, freeCells: 0 });
    expect(first.state.livesLeft).toBe(LIVES_PER_LEVEL - 1);
    expect(first.state.removedIds).toEqual([]);
    const failed = tapArrow(tapArrow(first.state, 0).state, 0).state;
    expect(failed.status).toBe('failed');
    expect(tapArrow(failed, 1).result.kind).toBe('ignored');
  });

  it('free arrows escape, which frees the next; undo puts an arrow back', () => {
    let state = tapArrow(tinyState(), 1).state;
    expect(state.removedIds).toEqual([1]);
    expect(tapArrow(state, 1).result.kind).toBe('ignored');
    const undone = undoLast(state);
    expect(undone.removedIds).toEqual([]);
    expect(canEscape(undone, 0)).toBe(false);
    state = tapArrow(state, 0).state;
    expect(state.status).toBe('won');
    expect(state.livesLeft).toBe(LIVES_PER_LEVEL);
  });

  it('hint points at an arrow that can escape', () => {
    expect(findHint(tinyState())).toBe(1);
    const state = startLevel(12);
    expect(canEscape(state, findHint(state)!)).toBe(true);
  });

  it('saves and restores progress, rejecting impossible saves; old straight-arrow saves use another version', () => {
    expect(ARROW_SAVE_VERSION).toBe(2);
    expect(SAVE_VERSIONS['arrow-out']).toBe(ARROW_SAVE_VERSION);
    let state = startLevel(9);
    for (let step = 0; step < 4; step++) state = tapArrow(state, findHint(state)!).state;
    state = { ...state, livesLeft: 2, mistakes: 1 };
    const restored = restoreArrowGame(JSON.parse(JSON.stringify(serializeArrowGame(state))))!;
    expect(restored.removedIds).toEqual(state.removedIds);
    expect(restored.livesLeft).toBe(2);
    const blockedId = state.level.arrows.find(arrow => !canEscape(startLevel(9), arrow.id))!.id;
    expect(restoreArrowGame({ ...serializeArrowGame(startLevel(9)), removedIds: [blockedId] })).toBeNull();
    expect(restoreArrowGame({ ...serializeArrowGame(state), livesLeft: 0 })).toBeNull();
  });
});
