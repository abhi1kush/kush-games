import { describe, expect, it } from 'vitest';
import { canvasPixelSize, cellBounds, diffBoard } from './boardDiff';
import { changeDirection, createInitialState, SnakeState, startGame, step } from './game';

const firstCell = () => 0;
const running = (overrides: Partial<SnakeState> = {}): SnakeState => ({ ...startGame(createInitialState(10, 10, firstCell)), ...overrides });

describe('diffBoard', () => {
  it('asks for a full redraw with no previous state or a different board size', () => {
    const state = running();
    expect(diffBoard(null, state)).toEqual({ kind: 'full' });
    expect(diffBoard(createInitialState(5, 5), state)).toEqual({ kind: 'full' });
  });

  it('reports nothing when only the direction queue changed', () => {
    const state = running();
    expect(diffBoard(state, changeDirection(state, 'up'))).toEqual({ kind: 'none' });
    expect(diffBoard(state, state)).toEqual({ kind: 'none' });
  });

  it('describes a normal move: erase the tail, old head becomes body, draw the new head', () => {
    const state = running({ apple: { x: 0, y: 0 } });
    expect(diffBoard(state, step(state))).toEqual({
      kind: 'incremental',
      previousHeadAsBody: { x: 5, y: 5 },
      newHead: { x: 6, y: 5 },
      erasedTail: { x: 3, y: 5 },
      appleToDraw: null,
    });
  });

  it('keeps the tail and draws the new apple when the snake eats', () => {
    const state = running({ apple: { x: 6, y: 5 } });
    const next = step(state, firstCell);
    const change = diffBoard(state, next);
    expect(change.kind).toBe('incremental');
    if (change.kind !== 'incremental') return;
    expect(change.erasedTail).toBeNull();
    expect(change.newHead).toEqual({ x: 6, y: 5 });
    expect(change.appleToDraw).toEqual(next.apple);
  });

  it('stays incremental across a wrapped edge', () => {
    const state = running({ snake: [{ x: 9, y: 2 }, { x: 8, y: 2 }, { x: 7, y: 2 }], apple: { x: 0, y: 0 } });
    const change = diffBoard(state, step(state));
    expect(change).toMatchObject({ kind: 'incremental', newHead: { x: 0, y: 2 }, erasedTail: { x: 7, y: 2 } });
  });

  it('handles moving into the cell the tail is leaving', () => {
    const snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
    const state = running({ snake, direction: 'left', directionQueue: ['down'], apple: { x: 0, y: 0 } });
    const change = diffBoard(state, step(state));
    // the tail cell is erased first, then the head is drawn on it
    expect(change).toMatchObject({ kind: 'incremental', newHead: { x: 5, y: 6 }, erasedTail: { x: 5, y: 6 } });
  });

  it('asks for a full redraw on restart', () => {
    let state = running({ apple: { x: 0, y: 0 } });
    for (let tick = 0; tick < 3; tick++) state = step(state);
    expect(diffBoard(state, startGame(createInitialState(10, 10, firstCell)))).toEqual({ kind: 'full' });
  });

  it('reports nothing when the game ends without moving (self-collision)', () => {
    const snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
    const state = running({ snake, direction: 'left', directionQueue: ['down'] });
    const over = step(state);
    expect(over.status).toBe('over');
    expect(diffBoard(state, over)).toEqual({ kind: 'none' });
  });
});

describe('cellBounds', () => {
  it('tiles the board exactly with integer edges', () => {
    const boardPixels = 345 * 2;
    let expectedLeft = 0;
    for (let column = 0; column < 17; column++) {
      const bounds = cellBounds(column, 0, boardPixels, 17);
      expect(bounds.left).toBe(expectedLeft);
      expect(Number.isInteger(bounds.width)).toBe(true);
      expectedLeft = bounds.left + bounds.width;
    }
    expect(expectedLeft).toBe(boardPixels);
  });
});

describe('canvasPixelSize', () => {
  it('scales by devicePixelRatio, capped at 2', () => {
    expect(canvasPixelSize(345, 1)).toBe(345);
    expect(canvasPixelSize(345, 2)).toBe(690);
    expect(canvasPixelSize(345, 3)).toBe(690);
    expect(canvasPixelSize(345, 0)).toBe(345);
  });
});
