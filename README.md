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
| Snake | ✅ Playable |
| Blocks (Tetris-like), Minesweeper, Sudoku, Chess, Tic-Tac-Toe, Memory Match, Flappy Flight, Breakout | 🕒 Coming soon |

### Snake

`src/games/snake/` has a Snake game written for Kush Games:

- `game.ts`: pure logic with no React or timers. The edges wrap around (modulo the 17×17 grid): leave the right edge and you come back on the left, leave the top and you come back at the bottom. Only running into yourself ends the game. It covers state, `step`, `changeDirection` (instant reverses are ignored and quick turns are queued, up to 3), `spawnApple` (never on the snake), pause/resume, and `tickInterval` (starts at 150 ms per step, 3 ms faster per apple, never below 60 ms).
- `game.test.ts`: unit tests for movement, wrapping in all 4 directions, growing, scoring, dying on itself (including across an edge), the queued turns, apple placement and speed.
- `settings.ts`: saves and loads the speed setting (`kush-games-snake-speed`) and the shared best score with the mode it was set in (`kush-games-snake-best`, `kush-games-snake-best-details`). Tests are in `settings.test.ts`; the scoring and speed tests are in `scoring.test.ts`.
- `boardDiff.ts`: pure helpers (with tests in `boardDiff.test.ts`) that work out which cells changed between two states (old tail to erase, old head to repaint as body, new head, new apple), integer cell bounds, and canvas size for the devicePixelRatio (capped at 2).
- `canvasRenderer.ts`: draws on one `<canvas>`. The checker background and the sprites (body, the head for each direction, the apple) are drawn once per size and cached. Each tick then repaints only the changed cells with solid fills. The whole board is redrawn only on start, restart and resize/DPR change; a `ResizeObserver` keeps it sharp.
- `sound.ts`: a generated "chomp" when an apple is eaten (Web Audio: a band-passed noise burst plus a short pitch-dropping square blip, about 120 ms, low volume). There are no audio files. The `AudioContext` is created on the first key press or tap and reused.
- `Snake.tsx` / `snake.css`: the game state lives in a ref and the tick loop (a `setInterval` at the game speed, stopped while paused, over or the tab is hidden) draws straight to the canvas. React only re-renders when the score, status, best score or mute setting changes. The head is bright green and rounded, with eyes (and a small tongue) facing the way it moves; the body is a darker green rounded square. Start, Paused and Game Over screens. The high score is saved in `localStorage` (`kush-games-snake-best`), and so is the 🔊/🔇 mute toggle (`kush-games-snake-muted`, sound is on by default).

#### Speed modes and scoring

Pick the speed on the Start or Game Over screen (or with the ⚡/⏱ chip in the header before a game). It can't be changed mid-game; a change made on the Game Over screen applies when you restart. The choice is saved.

| Mode | Step interval |
| --- | --- |
| ⚡ Speeding up (default) | 150 ms, 3 ms faster per apple, never below 60 ms |
| ⏱ Constant · Slow / Normal / Fast / Very fast | 150 / 110 / 80 / 60 ms |

Both modes use the same formula, so the same speed and length are always worth the same:

```
points per apple = round(10 × speedMultiplier × lengthMultiplier)
speedMultiplier  = 150 ms / current step interval     (150 → x1.0, 110 → x1.4, 80 → x1.9, 60 → x2.5)
lengthMultiplier = 1 + (length − 3) / 20              (length 3 → 1.0, 13 → 1.5, 23 → 2.0)
```

The speed and length are taken just before the apple is eaten. Examples: 150 ms at length 3 → **10**; 110 ms at length 3 → **14**; 80 ms at length 3 → **19**; 60 ms at length 3 → **25**; 120 ms at length 13 → **19**; 60 ms at length 23 → **50**. The header shows the current speed multiplier (e.g. `x1.4`), and each apple shows a floating `+N`. There is one shared best score; the Game Over screen shows the length, speed and score, plus the mode the best score was set in.

Controls: arrow keys / WASD to steer, Space (or P) to pause and resume, M to mute, Space or Enter to restart. On phones, swipe anywhere on the game or use the on-screen D-pad. The game pauses on its own when the tab is hidden.

Measure rendering cost with `node e2e/perf-snake.mjs [url]`: it plays for 5 s and reports React commits, DOM mutations and main-thread time.

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
npm test           # unit tests (2048 + Snake logic, registry, routing)
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
