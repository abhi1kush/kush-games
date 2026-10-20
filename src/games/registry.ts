/**
 * The single list of every game in Kush Games.
 * To add a game: create src/games/<your-game>/<YourGame>.tsx (default export a component)
 * and add one entry below with status 'playable' and a lazy `component`.
 */
import { lazy } from 'react';
import type { GameCategory, GameDefinition } from './types';

export const games: GameDefinition[] = [
  {
    id: '2048',
    title: '2048',
    tagline: 'Slide. Merge. Reach 2048.',
    description:
      'Slide numbered tiles on a 4×4 grid. When two tiles with the same number touch, they merge into one. Keep merging until you build the legendary 2048 tile — or keep going for a high score.',
    categories: ['Puzzle'],
    status: 'playable',
    artwork: { gradientFrom: '#f59563', gradientTo: '#edc22e', accentColor: '#776e65', glyph: '2048' },
    controls: 'Arrow keys / WASD, or swipe on mobile',
    releaseYear: 2026,
    component: lazy(() => import('./game2048/Game2048')),
  },
  {
    id: 'snake',
    title: 'Snake',
    tagline: 'Eat apples, wrap around the edges, don\u2019t bite your tail.',
    description: 'Guide a hungry snake around the board and gobble up red apples. Every apple makes you longer and a little faster. The edges wrap around, so leave one side and you come back on the other. Only biting your own tail ends the game.',
    categories: ['Arcade', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#0f9b0f', gradientTo: '#023020', accentColor: '#b8ff9f', glyph: '🐍' },
    controls: 'Arrow keys / WASD, Space to pause; swipe or D-pad on mobile',
    releaseYear: 2026,
    component: lazy(() => import('./snake/Snake')),
  },
  {
    id: 'blocks',
    title: 'Blocks',
    tagline: 'Stack falling shapes. Clear full rows.',
    description: 'Seven shapes fall one at a time. Move and rotate them to fill whole rows, which flash and vanish. Clear four at once for a big bonus. Every 10 lines the level goes up and the shapes fall faster.',
    categories: ['Puzzle', 'Arcade'],
    status: 'playable',
    artwork: { gradientFrom: '#6a11cb', gradientTo: '#2575fc', accentColor: '#ffe066', glyph: '▦' },
    controls: 'Arrows / WASD, ↑ rotate, Space hard drop, C hold; tap, swipe or buttons on mobile',
    releaseYear: 2026,
    component: lazy(() => import('./blocks/Blocks')),
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    tagline: 'Read the numbers. Avoid the mines.',
    description: 'Clear the minefield using number clues that tell you how many mines are hiding nearby. Flag carefully!',
    categories: ['Puzzle', 'Strategy'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#485563', gradientTo: '#29323c', accentColor: '#ff6b6b', glyph: '💣' },
    controls: 'Click to reveal, right-click / long-press to flag',
    releaseYear: 2026,
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    tagline: 'Nine boxes. Nine digits. Zero guessing.',
    description: 'Fill the 9×9 grid so every row, column and 3×3 box contains the digits 1 to 9 exactly once.',
    categories: ['Puzzle', 'Strategy'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#1e3c72', gradientTo: '#2a5298', accentColor: '#9fd3ff', glyph: '9' },
    controls: 'Tap a cell, then a number',
    releaseYear: 2026,
  },
  {
    id: 'chess',
    title: 'Chess',
    tagline: 'Send a link, play a friend anywhere.',
    description: 'Classic chess with all the rules: castling, en passant, promotion, check, checkmate and draws. Create a room and send the link to play a friend over the internet, or pass and play on one device.',
    categories: ['Strategy', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#3e2723', gradientTo: '#8d6e63', accentColor: '#f5deb3', glyph: '♞' },
    controls: 'Tap a piece, then tap where it should go',
    releaseYear: 2026,
    component: lazy(() => import('./chess/Chess')),
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    tagline: 'Three in a row wins.',
    description: 'The classic game of X\u2019s and O\u2019s. Get three in a row before your opponent does.',
    categories: ['Strategy', 'Classic Board'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#ff512f', gradientTo: '#dd2476', accentColor: '#ffffff', glyph: '✕○' },
    controls: 'Click or tap a square',
    releaseYear: 2026,
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    tagline: 'Flip two. Find the pair.',
    description: 'Flip cards two at a time and remember where everything is. Match all the pairs in as few moves as possible.',
    categories: ['Puzzle', 'Classic Board'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#11998e', gradientTo: '#38ef7d', accentColor: '#073b35', glyph: '🃏' },
    controls: 'Click or tap cards',
    releaseYear: 2026,
  },
  {
    id: 'flappy',
    title: 'Flappy Flight',
    tagline: 'Tap to flap through the pipes.',
    description: 'A Flappy-style one-button arcade challenge: tap to keep your bird in the air and squeeze through the gaps.',
    categories: ['Arcade'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#56ccf2', gradientTo: '#2f80ed', accentColor: '#ffd23f', glyph: '🐦' },
    controls: 'Space, click or tap to flap',
    releaseYear: 2026,
  },
  {
    id: 'breakout',
    title: 'Breakout',
    tagline: 'Bounce the ball. Smash every brick.',
    description: 'Move the paddle, keep the ball in play and break every brick on the wall to clear the level.',
    categories: ['Arcade'],
    status: 'coming-soon',
    artwork: { gradientFrom: '#f7971e', gradientTo: '#c0392b', accentColor: '#fff3c4', glyph: '🧱' },
    controls: 'Mouse, arrow keys, or drag',
    releaseYear: 2026,
  },
];

export interface GameRow {
  id: string;
  title: string;
  games: GameDefinition[];
}

const genreRows: GameCategory[] = ['Puzzle', 'Arcade', 'Strategy', 'Classic Board'];

/** Rows shown on the home page, Netflix style. */
export function buildHomeRows(allGames: GameDefinition[] = games): GameRow[] {
  const playableGames = allGames.filter(game => game.status === 'playable');
  const comingSoonGames = allGames.filter(game => game.status === 'coming-soon');
  const rows: GameRow[] = [{ id: 'play-now', title: 'Play Now', games: playableGames }];
  for (const category of genreRows) {
    // playable games first within each genre
    const gamesInCategory = allGames
      .filter(game => game.categories.includes(category))
      .sort((first, second) => Number(second.status === 'playable') - Number(first.status === 'playable'));
    rows.push({ id: category.toLowerCase().replace(/\s+/g, '-'), title: category, games: gamesInCategory });
  }
  rows.push({ id: 'coming-soon', title: 'Coming Soon', games: comingSoonGames });
  return rows.filter(row => row.games.length > 0);
}

export function findGame(gameId: string): GameDefinition | undefined {
  return games.find(game => game.id === gameId);
}

export const featuredGame: GameDefinition = findGame('2048')!;
