# Kush Games

A Netflix-style home for browser games — dark UI, a big hero banner, and horizontally scrolling rows of game cards by category. Click **Play** and the game opens full screen on its own route.

**Live:** https://abhi1kush.github.io/kush-games/

Built with **React + TypeScript + Vite**. Deployed to GitHub Pages from the `gh-pages` branch.

## Features

- Top nav with the **Kush Games** logo and quick links to each row
- Hero banner featuring **2048** with *Play* and *More Info*
- Rows: Play Now, Puzzle, Arcade, Strategy, Classic Board, Coming Soon — arrow buttons on desktop, swipe on mobile
- Cards scale up on hover and show the title, tagline and genres
- Game detail modal (`#/title/<id>`) with "More Like This"
- Full-screen player (`#/play/<id>`) with a Back button (Escape also works)
- Placeholder games show a "Coming Soon" screen
- Hash routing, so deep links work on GitHub Pages without server rewrites
- Card art is generated from CSS gradients + SVG patterns + a glyph — no images

## Games

| Game | Status |
| --- | --- |
| 2048 | ✅ Playable |
| Snake, Blocks (Tetris-like), Minesweeper, Sudoku, Chess, Tic-Tac-Toe, Memory Match, Flappy Flight, Breakout | 🕒 Coming soon |

### Where 2048 came from

The 2048 game was copied from [abhi1kush/2048](https://github.com/abhi1kush/2048) (commit `f37ad66`) into `src/games/game2048/`:

- `game.ts` — game logic (same behaviour; local variable names expanded for readability)
- `game.test.ts` — the original unit tests, unchanged
- `Game2048.tsx` — the original `App.tsx` turned into a component
- `game2048.css` — the original styles, scoped under `.game-2048` so they don't leak into the rest of the site

Controls: arrow keys / WASD, or swipe on the board on mobile.

## Adding a game

1. Create a folder with a component that has a default export, e.g. `src/games/snake/Snake.tsx`.
   It gets the whole screen below the Back bar, so make it fill its container.
2. Add (or update) one entry in [`src/games/registry.ts`](src/games/registry.ts):

```ts
{
  id: 'snake',                       // used in #/play/snake
  title: 'Snake',
  tagline: 'Eat, grow, don’t bite your tail.',
  description: '…',
  categories: ['Arcade'],            // which rows it shows up in
  status: 'playable',                // or 'coming-soon'
  artwork: { gradientFrom: '#0f9b0f', gradientTo: '#023020', accentColor: '#b8ff9f', glyph: '🐍' },
  controls: 'Arrow keys, or swipe',
  releaseYear: 2026,
  component: lazy(() => import('./snake/Snake')),
},
```

That's it — the rows, modal and player all read from the registry. Each game is lazy-loaded, so it only downloads when someone plays it.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/kush-games/
npm test           # unit tests (2048 logic, registry, routing)
npm run build      # type-check + production build into dist/
```

Browser check (needs Chrome at `/usr/bin/google-chrome` or `CHROME_PATH`):

```bash
npm run e2e -- https://abhi1kush.github.io/kush-games/ /tmp
```

## Deploying

```bash
npm run deploy
```

This builds the site and pushes `dist/` to the `gh-pages` branch using the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package.
GitHub Pages is configured to serve from the `gh-pages` branch (root). The Vite `base` is `/kush-games/`.

No GitHub Actions workflow is used.
