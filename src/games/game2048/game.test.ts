// Tests originally from https://github.com/abhi1kush/2048 (src/game.test.ts @ f37ad66), unchanged.
import { describe, it, expect } from 'vitest';
import { slide, fromGrid, toGrid, spawnTile, canMove, move, newGame, GameState } from './game';

const g = (grid: number[][], dir: 'up' | 'down' | 'left' | 'right') => slide(fromGrid(grid), dir);

describe('slide', () => {
  it('moves tiles left', () => {
    expect(toGrid(g([[0, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [8, 0, 0, 0]], 'left').tiles))
      .toEqual([[2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [8, 0, 0, 0]]);
  });
  it('moves right, up, down', () => {
    const grid = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    expect(toGrid(g(grid, 'right').tiles)[0]).toEqual([0, 0, 0, 2]);
    expect(toGrid(g(grid, 'down').tiles)[3]).toEqual([2, 0, 0, 0]);
    expect(g(grid, 'up').moved).toBe(false);
  });
  it('merges equal tiles and scores', () => {
    const r = g([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left');
    expect(toGrid(r.tiles)[0]).toEqual([4, 0, 0, 0]);
    expect(r.gained).toBe(4);
  });
  it('does not double merge', () => {
    expect(toGrid(g([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left').tiles)[0]).toEqual([4, 4, 0, 0]);
    expect(toGrid(g([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left').tiles)[0]).toEqual([4, 4, 0, 0]);
    expect(toGrid(g([[4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left').tiles)[0]).toEqual([8, 8, 0, 0]);
  });
  it('merges nearest to the move direction first', () => {
    expect(toGrid(g([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'right').tiles)[0]).toEqual([0, 0, 2, 4]);
    const col = toGrid(g([[2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0]], 'up').tiles).map(r => r[0]);
    expect(col).toEqual([4, 2, 0, 0]);
  });
});

describe('spawn', () => {
  it('spawns 2 when rng >= 0.1 and 4 when < 0.9 threshold fails', () => {
    expect(spawnTile([], () => 0.5)[0].value).toBe(2);
    let i = 0; const seq = [0, 0.95];
    expect(spawnTile([], () => seq[i++])[0].value).toBe(4);
  });
  it('spawns only into empty cells', () => {
    const full = fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]);
    const t = spawnTile(full, () => 0);
    expect(t.length).toBe(16);
    expect(t[15].row).toBe(3); expect(t[15].col).toBe(3);
  });
  it('new game has two tiles', () => { expect(newGame().tiles.length).toBe(2); });
});

describe('game over / win', () => {
  it('detects no moves', () => {
    expect(canMove(fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]))).toBe(false);
    expect(canMove(fromGrid([[2, 2, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]))).toBe(true);
  });
  it('sets over after final move', () => {
    const s: GameState = { tiles: fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [0, 8, 16, 32]]), score: 0, won: false, over: false, keepPlaying: false };
    const n = move(s, 'left', () => 0.5);
    expect(n.over).toBe(true);
  });
  it('detects win at 2048 and blocks until continue', () => {
    const s: GameState = { tiles: fromGrid([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), score: 0, won: false, over: false, keepPlaying: false };
    const n = move(s, 'left', () => 0.5);
    expect(n.won).toBe(true); expect(n.score).toBe(2048);
    expect(move(n, 'right')).toBe(n);
    expect(move({ ...n, keepPlaying: true }, 'right')).not.toBe(n);
  });
});
