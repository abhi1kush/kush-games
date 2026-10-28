import { describe, expect, it } from 'vitest';
import { fromGrid, GameState, move, toGrid } from './game';
import { parse2048Save, restore2048, serialize2048 } from './save';

const roundTrip = (state: GameState) => {
  const saved = parse2048Save(JSON.parse(JSON.stringify(serialize2048(state))));
  return saved ? restore2048(saved) : null;
};

describe('Power of 2 save', () => {
  const state: GameState = { tiles: fromGrid([[2, 0, 0, 4], [0, 8, 0, 0], [0, 0, 16, 0], [2048, 0, 0, 2]]), score: 2500, won: true, over: false, keepPlaying: true };

  it('round-trips the board, score and win / keep-playing state', () => {
    const restored = roundTrip(state)!;
    expect(toGrid(restored.tiles)).toEqual(toGrid(state.tiles));
    expect(restored).toMatchObject({ score: 2500, won: true, over: false, keepPlaying: true });
    expect(new Set(restored.tiles.map(tile => tile.id)).size).toBe(restored.tiles.length);
  });

  it('a restored game keeps playing', () => {
    const restored = roundTrip(state)!;
    const moved = move(restored, 'left', () => 0);
    expect(moved).not.toBe(restored);
    expect(toGrid(moved.tiles)[0].slice(0, 2)).toEqual([2, 4]);
  });

  it('does not restore a finished game', () => {
    expect(roundTrip({ ...state, over: true })).toBeNull();
  });

  it('rejects invalid boards', () => {
    const saved = serialize2048(state);
    expect(parse2048Save({ ...saved, tiles: [...saved.tiles, { value: 2, row: 0, col: 0 }] })).toBeNull(); // two tiles in one cell
    expect(parse2048Save({ ...saved, tiles: [{ value: 3, row: 0, col: 0 }] })).toBeNull();
    expect(parse2048Save({ ...saved, tiles: [{ value: 2, row: 4, col: 0 }] })).toBeNull();
    expect(parse2048Save({ ...saved, tiles: [] })).toBeNull();
    expect(parse2048Save({ ...saved, score: -1 })).toBeNull();
    expect(parse2048Save(null)).toBeNull();
  });
});
