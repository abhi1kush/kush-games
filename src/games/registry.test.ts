import { describe, expect, it } from 'vitest';
import { SAVE_VERSIONS } from './persistence';
import { buildHomeSections, featuredGame, findGame, games } from './registry';

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

  it('builds one All games grid with genre filters and a Coming Soon grid (each game shown once)', () => {
    const { playableGames, comingSoonGames, genres } = buildHomeSections();
    expect(playableGames.map(game => game.id)).toEqual(['2048', 'snake', 'blocks', 'minesweeper', 'sudoku', 'chess', 'tic-tac-toe', 'memory-match', 'flappy-wings', 'arrow-out']);
    expect(comingSoonGames.map(game => game.id)).toEqual(['breakout', 'connect-four', 'solitaire', 'checkers']);
    expect(genres.map(entry => entry.genre)).toEqual(['Puzzle', 'Arcade', 'Strategy', 'Classic Board']);
    expect(genres.find(entry => entry.genre === 'Puzzle')!.count).toBe(playableGames.filter(game => game.categories.includes('Puzzle')).length);
    // a genre with no playable game gets no chip
    expect(buildHomeSections(games.filter(game => !game.categories.includes('Arcade') || game.status !== 'playable')).genres.map(entry => entry.genre)).not.toContain('Arcade');
  });

  it('every playable game has a save version for the Continue badge', () => {
    games.filter(game => game.status === 'playable').forEach(game => expect(SAVE_VERSIONS[game.id]).toBeGreaterThanOrEqual(1));
  });

  it('finds games by id', () => {
    expect(findGame('snake')?.title).toBe('Snake');
    expect(findGame('nope')).toBeUndefined();
  });
});
