import { describe, expect, it } from 'vitest';
import {
  arrowCells, canEscape, exitPath, findBlocker, findHint, generateLevel, Level, levelShape, LIVES_PER_LEVEL, MAX_COLUMNS, MAX_ROWS, startLevel, tapArrow,
  undoLast,
} from './game';
import { restoreArrowGame, serializeArrowGame } from './save';

/** Keep tapping any free arrow; returns true when the board empties. */
function clearsGreedily(level: Level): boolean {
  let state = { ...startLevel(level.number), level };
  while (state.status === 'playing') {
    const freeArrow = findHint(state);
    if (freeArrow === null) return false;
    state = tapArrow(state, freeArrow).state;
  }
  return state.status === 'won' && state.mistakes === 0;
}

describe('arrow out level generator', () => {
  it('makes valid, solvable boards for the first 60 levels', () => {
    for (let levelNumber = 1; levelNumber <= 60; levelNumber++) {
      const level = generateLevel(levelNumber);
      const covered = new Set<string>();
      for (const arrow of level.arrows) {
        for (const { row, column } of arrowCells(arrow)) {
          expect(row >= 0 && row < level.rows && column >= 0 && column < level.columns).toBe(true);
          const key = `${row},${column}`;
          expect(covered.has(key)).toBe(false); // no overlaps
          covered.add(key);
        }
      }
      expect(covered.size / (level.rows * level.columns)).toBeGreaterThan(0.6); // packed board
      expect(clearsGreedily(level)).toBe(true);
    }
  });

  it('removing arrows in reverse placement order always works', () => {
    for (const levelNumber of [1, 10, 40]) {
      let state = startLevel(levelNumber);
      for (let id = state.level.arrows.length - 1; id >= 0; id--) {
        expect(canEscape(state, id)).toBe(true);
        state = tapArrow(state, id).state;
      }
      expect(state.status).toBe('won');
    }
  });

  it('is deterministic and gets bigger and harder', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
    expect(levelShape(1)).toMatchObject({ rows: 4, columns: 4 });
    const sizes = Array.from({ length: 40 }, (_, index) => levelShape(index + 1)).map(shape => shape.rows * shape.columns);
    sizes.forEach((size, index) => { if (index) expect(size).toBeGreaterThanOrEqual(sizes[index - 1]); });
    expect(levelShape(100)).toMatchObject({ rows: MAX_ROWS, columns: MAX_COLUMNS });
    // after the first couple of levels some arrows start out blocked
    for (let levelNumber = 3; levelNumber <= 20; levelNumber++) {
      const state = startLevel(levelNumber);
      expect(state.level.arrows.some(arrow => !canEscape(state, arrow.id))).toBe(true);
    }
  });
});

describe('arrow out moves', () => {
  // 1×3 board: [→][→][ ]  the left arrow is blocked by the middle one
  const tinyLevel: Level = {
    number: 1, rows: 1, columns: 3,
    arrows: [
      { id: 0, headRow: 0, headColumn: 0, direction: 'right', length: 1 },
      { id: 1, headRow: 0, headColumn: 1, direction: 'right', length: 1 },
    ],
  };
  const tinyState = () => ({ ...startLevel(1), level: tinyLevel });

  it('finds paths and blockers', () => {
    expect(exitPath(tinyLevel.arrows[0], 1, 3)).toEqual([{ row: 0, column: 1 }, { row: 0, column: 2 }]);
    expect(findBlocker(tinyLevel, [], 0)).toEqual({ blockerId: 1, freeCells: 0 });
    expect(findBlocker(tinyLevel, [1], 0)).toBeNull();
    expect(arrowCells({ id: 0, headRow: 2, headColumn: 2, direction: 'up', length: 3 })).toEqual([{ row: 2, column: 2 }, { row: 3, column: 2 }, { row: 4, column: 2 }]);
  });

  it('a blocked tap costs a life; three of them fail the level', () => {
    let state = tinyState();
    const first = tapArrow(state, 0);
    expect(first.result).toEqual({ kind: 'blocked', blockerId: 1, freeCells: 0 });
    expect(first.state.livesLeft).toBe(LIVES_PER_LEVEL - 1);
    expect(first.state.removedIds).toEqual([]);
    state = tapArrow(tapArrow(first.state, 0).state, 0).state;
    expect(state.status).toBe('failed');
    expect(tapArrow(state, 1).result.kind).toBe('ignored');
  });

  it('free arrows escape, then the blocked one can go; undo puts an arrow back', () => {
    let state = tinyState();
    state = tapArrow(state, 1).state;
    expect(state.removedIds).toEqual([1]);
    expect(tapArrow(state, 1).result.kind).toBe('ignored'); // already gone
    expect(undoLast(state).removedIds).toEqual([]);
    state = tapArrow(state, 0).state;
    expect(state.status).toBe('won');
    expect(state.livesLeft).toBe(LIVES_PER_LEVEL);
  });

  it('hint points at an arrow that can escape', () => {
    expect(findHint(tinyState())).toBe(1);
    const state = startLevel(12);
    expect(canEscape(state, findHint(state)!)).toBe(true);
  });

  it('saves and restores progress, rejecting impossible saves', () => {
    let state = startLevel(9);
    for (let step = 0; step < 4; step++) state = tapArrow(state, findHint(state)!).state;
    state = { ...state, livesLeft: 2, mistakes: 1 };
    const restored = restoreArrowGame(JSON.parse(JSON.stringify(serializeArrowGame(state))))!;
    expect(restored.removedIds).toEqual(state.removedIds);
    expect(restored.livesLeft).toBe(2);
    const blockedId = state.level.arrows.find(arrow => !canEscape(startLevel(9), arrow.id))!.id;
    expect(restoreArrowGame({ ...serializeArrowGame(startLevel(9)), removedIds: [blockedId] })).toBeNull();
    expect(restoreArrowGame({ ...serializeArrowGame(state), livesLeft: 0 })).toBeNull();
    expect(restoreArrowGame({ ...serializeArrowGame(state), levelNumber: 0 })).toBeNull();
  });
});
