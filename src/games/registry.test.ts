import { describe, expect, it } from 'vitest';
import { SAVE_VERSIONS } from './persistence';
import { buildHomeSections, featuredGame, findGame, games } from './registry';
import { THUMBNAILS } from '../assets/thumbnails';

describe('game registry', () => {
  it('has unique, URL-safe ids', () => {
    const ids = games.map(game => game.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('gives every playable game a component', () => {
    games.filter(game => game.status === 'playable').forEach(game => expect(game.component).toBeDefined());
  });

  it('features Color Trails by default and every game is playable (no Coming Soon placeholders left)', () => {
    expect(featuredGame.id).toBe('color-trails');
    expect(featuredGame.status).toBe('playable');
    expect(games.filter(game => game.status === 'coming-soon')).toEqual([]);
    expect(games).toHaveLength(24);
  });

  it('builds one All games grid with genre filters and an empty Coming Soon list (each game shown once)', () => {
    const { mostLikedGames, playableGames, comingSoonGames, genres } = buildHomeSections();
    expect(mostLikedGames.map(game => game.title)).toEqual(['Power of 2', 'Color Trails', 'Flappy Wings', 'Paani Pour', 'Connect Four', 'Memory Match', 'Jal Path']);
    expect(findGame('jungle-strike')).toBeUndefined();
    expect(playableGames.map(game => game.id)).toEqual(['power-of-2', 'snake', 'blocks', 'minesweeper', 'sudoku', 'chess', 'tic-tac-toe', 'memory-match', 'flappy-wings', 'breakout', 'arrow-out', 'color-trails', 'connect-four', 'checkers', 'kush-jump', 'antariksh-defenders', 'mithai-match', 'ludo', 'snakes-ladders', 'fleet-clash', 'carrom', 'jal-path', 'paani-pour', 'ember-lane']);
    expect(comingSoonGames).toEqual([]);
    expect(genres.map(entry => entry.genre)).toEqual(['Puzzle', 'Arcade', 'Strategy', 'Classic Board']);
    expect(genres.find(entry => entry.genre === 'Puzzle')!.count).toBe(playableGames.filter(game => game.categories.includes('Puzzle')).length);
    // a genre with no playable game gets no chip
    expect(buildHomeSections(games.filter(game => !game.categories.includes('Arcade') || game.status !== 'playable')).genres.map(entry => entry.genre)).not.toContain('Arcade');
  });

  it('every playable game has a save version for the Continue badge', () => {
    games.filter(game => game.status === 'playable').forEach(game => expect(SAVE_VERSIONS[game.id]).toBeGreaterThanOrEqual(1));
  });

  it('every card has a small hand-made SVG thumbnail', () => {
    const sources = import.meta.glob('../assets/thumbnails/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    let totalBytes = 0;
    for (const game of games) {
      expect(THUMBNAILS[game.id], game.id).toBeTruthy();
      const source = sources[`../assets/thumbnails/${game.id}.svg`];
      expect(source).toContain('viewBox="0 0 320 180"');
      expect(source).not.toContain('<filter'); // no blur filters: cheap to draw while scrolling
      expect(source.length, game.id).toBeLessThan(9 * 1024);
      totalBytes += source.length;
    }
    expect(totalBytes).toBeLessThan(90 * 1024);
  });

  it('finds games by id', () => {
    expect(findGame('snake')?.title).toBe('Snake');
    expect(findGame('nope')).toBeUndefined();
  });
});
