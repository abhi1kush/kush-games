import { describe, expect, it } from 'vitest';
import { SAVE_VERSIONS } from './persistence';
import { buildHomeRows, featuredGame, findGame, games } from './registry';

describe('game registry', () => {
  it('has unique, URL-safe ids', () => {
    const ids = games.map(game => game.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('gives every playable game a component', () => {
    games.filter(game => game.status === 'playable').forEach(game => expect(game.component).toBeDefined());
  });

  it('features 2048 and keeps several coming soon placeholders', () => {
    expect(featuredGame.id).toBe('2048');
    expect(featuredGame.status).toBe('playable');
    const placeholderCount = games.filter(game => game.status === 'coming-soon').length;
    expect(placeholderCount).toBeGreaterThanOrEqual(3);
    expect(placeholderCount).toBeLessThanOrEqual(10);
  });

  it('builds home rows by category with a Coming Soon row', () => {
    const rowTitles = buildHomeRows().map(row => row.title);
    expect(rowTitles).toEqual(['Play Now', 'Puzzle', 'Arcade', 'Strategy', 'Classic Board', 'Coming Soon']);
    const puzzleRow = buildHomeRows().find(row => row.title === 'Puzzle')!;
    expect(puzzleRow.games[0].id).toBe('2048');
    const playNowIds = buildHomeRows().find(row => row.title === 'Play Now')!.games.map(game => game.id);
    expect(playNowIds).toEqual(['2048', 'snake', 'blocks', 'minesweeper', 'sudoku', 'chess', 'tic-tac-toe', 'memory-match', 'flappy-wings', 'arrow-out']);
    const arcadeRow = buildHomeRows().find(row => row.title === 'Arcade')!;
    expect(arcadeRow.games[0].id).toBe('snake');
    const comingSoonIds = buildHomeRows().find(row => row.title === 'Coming Soon')!.games.map(game => game.id);
    expect(comingSoonIds).not.toContain('snake');
    expect(comingSoonIds).not.toContain('blocks');
    for (const playableId of ['chess', 'minesweeper', 'sudoku', 'tic-tac-toe', 'memory-match', 'flappy-wings']) expect(comingSoonIds).not.toContain(playableId);
    expect(comingSoonIds).toEqual(['breakout', 'connect-four', 'solitaire', 'checkers']);
  });

  it('every playable game has a save version for the Continue badge', () => {
    games.filter(game => game.status === 'playable').forEach(game => expect(SAVE_VERSIONS[game.id]).toBe(1));
  });

  it('finds games by id', () => {
    expect(findGame('snake')?.title).toBe('Snake');
    expect(findGame('nope')).toBeUndefined();
  });
});
