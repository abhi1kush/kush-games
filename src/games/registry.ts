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
    description: 'Clear the minefield using number clues that tell you how many mines touch each square. Your first click is always safe. Flag the mines, tap a number to open around it, and beat your best time on Beginner, Intermediate or Expert.',
    categories: ['Puzzle', 'Strategy'],
    status: 'playable',
    artwork: { gradientFrom: '#485563', gradientTo: '#29323c', accentColor: '#ff6b6b', glyph: '💣' },
    controls: 'Click to dig, right-click / long-press or Flag mode to flag, tap a number to open around it',
    releaseYear: 2026,
    component: lazy(() => import('./minesweeper/Minesweeper')),
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    tagline: 'Nine boxes. Nine digits. Zero guessing.',
    description: 'Fill the 9×9 grid so every row, column and 3×3 box has the digits 1 to 9. Every puzzle is freshly generated with exactly one solution, in Easy, Medium or Hard. Pencil notes, hints, undo and conflict highlighting included.',
    categories: ['Puzzle', 'Strategy'],
    status: 'playable',
    artwork: { gradientFrom: '#1e3c72', gradientTo: '#2a5298', accentColor: '#9fd3ff', glyph: '9' },
    controls: 'Tap a cell, then a number; keys 1–9, arrows, Backspace, N for notes, Ctrl+Z undo',
    releaseYear: 2026,
    component: lazy(() => import('./sudoku/Sudoku')),
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
    description: 'The classic game of X\u2019s and O\u2019s. Play the computer on Easy, or on Hard where it never loses, or pass the device to a friend. Starters alternate and the score is kept.',
    categories: ['Strategy', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#ff512f', gradientTo: '#dd2476', accentColor: '#ffffff', glyph: '✕○' },
    controls: 'Click or tap a square, or keys 1–9',
    releaseYear: 2026,
    component: lazy(() => import('./tictactoe/TicTacToe')),
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    tagline: 'Flip two. Find the pair.',
    description: 'Flip emoji cards two at a time and remember where everything is. Match every pair in as few moves as you can on a 4×4, 4×5 or 6×6 grid.',
    categories: ['Puzzle', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#11998e', gradientTo: '#38ef7d', accentColor: '#073b35', glyph: '🃏' },
    controls: 'Click or tap cards',
    releaseYear: 2026,
    component: lazy(() => import('./memory/MemoryMatch')),
  },
  {
    id: 'flappy-wings',
    title: 'Flappy Wings',
    tagline: 'Tap to flap through the pipes.',
    description: 'A one-button arcade challenge: tap to keep your bird in the air and squeeze through the gaps between the pipes. Every pipe is a point. How far can you fly?',
    categories: ['Arcade'],
    status: 'playable',
    artwork: { gradientFrom: '#56ccf2', gradientTo: '#2f80ed', accentColor: '#ffd23f', glyph: '🐦' },
    controls: 'Space, ↑, click or tap to flap; P to pause',
    releaseYear: 2026,
    component: lazy(() => import('./flappy/FlappyWings')),
  },
  {
    id: 'breakout',
    title: 'Breakout',
    tagline: 'Bounce the ball. Smash every brick.',
    description: 'Move the paddle, keep the ball in play and break every brick. Levels bring new layouts, tougher multi-hit bricks, steel and a faster ball; catch power-ups for a wider paddle, multi-ball, a slower ball or an extra life. The physics run in Rust compiled to WebAssembly.',
    categories: ['Arcade'],
    status: 'playable',
    artwork: { gradientFrom: '#f7971e', gradientTo: '#c0392b', accentColor: '#fff3c4', glyph: '🧱' },
    controls: 'Mouse, finger or ←/→ to move; Space or tap to launch; P pause',
    releaseYear: 2026,
    component: lazy(() => import('./breakout/BreakoutGame')),
  },
  {
    id: 'arrow-out',
    title: 'Arrow Out',
    tagline: 'Tap the arrows out — in the right order.',
    description: 'A board packed with arrows. Tap one and it slides off the board the way it points, but only if nothing is in its way. Tap a blocked arrow and you lose a life. Clear every arrow to finish the level; boards grow as you go.',
    categories: ['Puzzle'],
    status: 'playable',
    artwork: { gradientFrom: '#0f2027', gradientTo: '#2c5364', accentColor: '#ffd166', glyph: '⇄' },
    controls: 'Tap or click an arrow; U undo, H hint, R restart',
    releaseYear: 2026,
    component: lazy(() => import('./arrowout/ArrowOut')),
  },
  {
    id: 'color-trails',
    title: 'Color Trails',
    tagline: 'Link every pair of dots. Fill the whole board.',
    description: 'Drag to join each pair of same-colored dots with a path. Paths can\u2019t cross, and every square has to be filled. Each puzzle has exactly one solution; boards grow, colors multiply and the paths wind further as you go.',
    categories: ['Puzzle'],
    status: 'playable',
    artwork: { gradientFrom: '#120a2e', gradientTo: '#3a1460', accentColor: '#f6c90e', glyph: '⦿' },
    controls: 'Drag from a dot; U undo, H hint, R restart, L levels',
    releaseYear: 2026,
    component: lazy(() => import('./colortrails/ColorTrails')),
  },
  {
    id: 'connect-four',
    title: 'Connect Four',
    tagline: 'Drop discs. Line up four.',
    description: 'Drop discs and line up four across, up or diagonally. Play the computer on Easy, Medium or Hard (a Rust/WebAssembly alpha-beta search in a background worker), a friend on one device, or a friend online.',
    categories: ['Strategy', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#f12711', gradientTo: '#f5af19', accentColor: '#1e3799', glyph: '🔴' },
    controls: 'Tap a column or press 1–7; U undo, N new game',
    releaseYear: 2026,
    component: lazy(() => import('./connectfour/ConnectFour')),
  },
  {
    id: 'solitaire',
    title: 'Solitaire',
    tagline: 'Build the foundations from Ace to King.',
    description: 'Classic Klondike: build the four foundations from ace to king. Draw 1 or Draw 3, drag or tap cards, undo, hints, safe auto-moves, timer and score. Dealing and rules run in Rust compiled to WebAssembly.',
    categories: ['Puzzle', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#134e5e', gradientTo: '#71b280', accentColor: '#fffbe6', glyph: '🂡' },
    controls: 'Drag or tap cards; D draw, U undo, H hint, N new deal',
    releaseYear: 2026,
    component: lazy(() => import('./solitaire/SolitaireGame')),
  },
  {
    id: 'checkers',
    title: 'Checkers',
    tagline: 'Jump, capture, crown.',
    description: 'English draughts on an 8×8 board: captures are compulsory, jumps chain, and men crown on the far row. Play the computer (Easy, Medium, Hard — a Rust/WebAssembly alpha-beta search in a background worker), a friend on this device, or a friend online.',
    categories: ['Strategy', 'Classic Board'],
    status: 'playable',
    artwork: { gradientFrom: '#232526', gradientTo: '#b31217', accentColor: '#ffd6d6', glyph: '⛀' },
    controls: 'Tap a piece, then a highlighted square; U undo, N new game',
    releaseYear: 2026,
    component: lazy(() => import('./checkers/CheckersGame')),
  },
];

/** Genre filter chips on the home page, in this order (only genres that have a playable game are shown). */
export const GENRE_FILTERS: GameCategory[] = ['Puzzle', 'Arcade', 'Strategy', 'Classic Board'];

export const genreSlug = (genre: GameCategory) => genre.toLowerCase().replace(/\s+/g, '-');

export interface HomeSections {
  /** Every playable game, shown once in the "All games" grid. */
  playableGames: GameDefinition[];
  comingSoonGames: GameDefinition[];
  /** Genres with at least one playable game, and how many. */
  genres: { genre: GameCategory; count: number }[];
}

/** What the home page shows: one grid of all playable games (filterable by genre) and a Coming Soon grid. */
export function buildHomeSections(allGames: GameDefinition[] = games): HomeSections {
  const playableGames = allGames.filter(game => game.status === 'playable');
  return {
    playableGames,
    comingSoonGames: allGames.filter(game => game.status === 'coming-soon'),
    genres: GENRE_FILTERS
      .map(genre => ({ genre, count: playableGames.filter(game => game.categories.includes(genre)).length }))
      .filter(entry => entry.count > 0),
  };
}

export function findGame(gameId: string): GameDefinition | undefined {
  return games.find(game => game.id === gameId);
}

export const featuredGame: GameDefinition = findGame('2048')!;
