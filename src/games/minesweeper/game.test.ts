import { describe, expect, it } from 'vitest';
import { createRandom } from '../random';
import { chord, createGame, DIFFICULTIES, minesLeft, neighborIndexes, reveal, toggleFlag, withMines } from './game';
import { parseMinesweeperSave, restoreMinesweeper, serializeMinesweeper } from './save';

const countState = (cellStates: string[], wanted: string) => cellStates.filter(cellState => cellState === wanted).length;

describe('minesweeper first click', () => {
  it('is always safe and opens an area on every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 40; seed++) {
        const random = createRandom(seed);
        const firstIndex = Math.floor(random() * difficulty.rows * difficulty.columns);
        const game = reveal(createGame(difficulty.id), firstIndex, random);
        expect(game.status === 'playing' || game.status === 'won').toBe(true);
        expect(game.isMine[firstIndex]).toBe(false);
        expect(game.adjacentMines[firstIndex]).toBe(0);
        for (const neighbor of neighborIndexes(firstIndex, game.rows, game.columns)) expect(game.isMine[neighbor]).toBe(false);
        expect(game.isMine.filter(Boolean)).toHaveLength(difficulty.mines);
        expect(countState(game.cellStates, 'revealed')).toBeGreaterThan(1);
      }
    }
  });
});

describe('minesweeper flood fill', () => {
  // 5x5 board with one mine in the bottom-right corner
  const board = () => ({ ...withMines({ ...createGame('beginner'), rows: 5, columns: 5, cellStates: Array(25).fill('hidden'), isMine: [], adjacentMines: [] }, [24]) });

  it('opens every connected empty cell and its numbered border, but not the mine', () => {
    const game = reveal(board(), 0);
    expect(game.status).toBe('won'); // only the mine is left
    expect(countState(game.cellStates, 'revealed')).toBe(24);
    expect(game.cellStates[24]).toBe('flagged'); // winning flags the mines
  });

  it('stops at numbers', () => {
    // mines along column 2 split the board; opening the left side never crosses
    const walled = withMines({ ...createGame('beginner'), rows: 5, columns: 5, cellStates: Array(25).fill('hidden'), isMine: [], adjacentMines: [] }, [2, 7, 12, 17, 22]);
    const game = reveal(walled, 0);
    const opened = game.cellStates.flatMap((cellState, index) => (cellState === 'revealed' ? [index] : []));
    expect(opened.sort((a, b) => a - b)).toEqual([0, 1, 5, 6, 10, 11, 15, 16, 20, 21]);
    expect(game.status).toBe('playing');
  });

  it('a number cell opens only itself', () => {
    const game = reveal(board(), 18);
    expect(countState(game.cellStates, 'revealed')).toBe(1);
  });
});

describe('minesweeper flags, chording and losing', () => {
  const setup = () => withMines({ ...createGame('beginner'), rows: 3, columns: 3, cellStates: Array(9).fill('hidden'), isMine: [], adjacentMines: [] }, [0, 8]);

  it('flags count toward the mine counter and block reveals', () => {
    let game = toggleFlag(setup(), 0);
    expect(minesLeft(game)).toBe(1);
    expect(reveal(game, 0)).toBe(game);
    game = toggleFlag(game, 0);
    expect(minesLeft(game)).toBe(2);
  });

  it('chords a satisfied number and wins', () => {
    let game = reveal(setup(), 4); // centre shows 2
    expect(game.adjacentMines[4]).toBe(2);
    expect(chord(game, 4)).toBe(game); // no flags yet: nothing happens
    game = toggleFlag(toggleFlag(game, 0), 8);
    game = chord(game, 4);
    expect(game.status).toBe('won');
  });

  it('chording with a wrong flag loses', () => {
    let game = reveal(setup(), 4);
    game = toggleFlag(toggleFlag(game, 0), 1); // 1 is not a mine
    game = chord(game, 4);
    expect(game.status).toBe('lost');
    expect(game.explodedIndex).toBe(8);
  });

  it('revealing a mine loses and shows all mines', () => {
    const game = reveal(reveal(setup(), 4), 8);
    expect(game.status).toBe('lost');
    expect(game.cellStates[0]).toBe('revealed');
    expect(reveal(game, 1)).toBe(game);
  });
});

describe('minesweeper save', () => {
  it('round-trips a game in progress and rejects finished or broken saves', () => {
    const game = toggleFlag(reveal(createGame('intermediate'), 100, createRandom(7)), 0);
    const data = serializeMinesweeper({ ...game, elapsedMs: 4200 })!;
    const parsed = parseMinesweeperSave(JSON.parse(JSON.stringify(data)))!;
    const restored = restoreMinesweeper(parsed);
    expect(restored.cellStates).toEqual(game.cellStates);
    expect(restored.isMine).toEqual(game.isMine);
    expect(restored.adjacentMines).toEqual(game.adjacentMines);
    expect(restored.elapsedMs).toBe(4200);
    expect(serializeMinesweeper(createGame('beginner'))).toBeNull();
    expect(parseMinesweeperSave({ ...data, mineIndexes: data.mineIndexes.slice(1) })).toBeNull();
    expect(parseMinesweeperSave({ ...data, cells: 'x' })).toBeNull();
    expect(parseMinesweeperSave({ ...data, difficulty: 'nightmare' })).toBeNull();
  });
});
