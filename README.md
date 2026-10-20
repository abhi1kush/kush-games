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
- Games in progress are saved in the browser, so a refresh doesn't lose them; their cards show a **▶ Continue** badge

## Games

| Game | Status |
| --- | --- |
| 2048 | ✅ Playable |
| Snake | ✅ Playable |
| Blocks | ✅ Playable |
| Chess (online with a friend, or pass and play) | ✅ Playable |
| Minesweeper, Sudoku, Tic-Tac-Toe, Memory Match, Flappy Flight, Breakout | 🕒 Coming soon |

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

Pick the speed on the Start or Game Over screen (or with the ⚡/⏱ chip in the header before a game). It can't be changed mid-game; a change made on the Game Over screen applies when you restart. The choice is saved. With nothing saved, the default is Constant · Slow (150 ms, x1.0); a saved choice is always kept.

| Mode | Step interval |
| --- | --- |
| ⏱ Constant · Slow / Normal / Fast / Very fast | 150 / 110 / 80 / 60 ms (default: **Constant · Slow**) |
| ⚡ Speeding up | 150 ms, 3 ms faster per apple, never below 60 ms |

Both modes use the same formula, so the same speed and length are always worth the same:

```
points per apple = round(10 × speedMultiplier × lengthMultiplier)
speedMultiplier  = 150 ms / current step interval     (150 → x1.0, 110 → x1.4, 80 → x1.9, 60 → x2.5)
lengthMultiplier = 1 + (length − 3) / 20              (length 3 → 1.0, 13 → 1.5, 23 → 2.0)
```

The speed and length are taken just before the apple is eaten. Examples: 150 ms at length 3 → **10**; 110 ms at length 3 → **14**; 80 ms at length 3 → **19**; 60 ms at length 3 → **25**; 120 ms at length 13 → **19**; 60 ms at length 23 → **50**. The header shows the current speed multiplier (e.g. `x1.4`), and each apple shows a floating `+N`. There is one shared best score; the Game Over screen shows the length, speed and score, plus the mode the best score was set in.

Controls: arrow keys / WASD to steer, Space (or P) to pause and resume, M to mute, Space or Enter to restart. On phones, swipe anywhere on the game or use the on-screen D-pad. The game pauses on its own when the tab is hidden.

Measure rendering cost with `node e2e/perf-snake.mjs [url]`: it plays for 5 s and reports React commits, DOM mutations and main-thread time.

### Blocks

`src/games/blocks/` has a falling-blocks puzzle game: random shapes drop into a 10×20 well, and every full horizontal row is cleared with a flash and a sound.

- `game.ts`: pure logic with no React or timers. It covers the 7 shapes (I, O, T, S, Z, J, L) with a seeded 7-bag randomiser, gravity, moves, soft and hard drop, clockwise rotation with simple wall kicks, the ghost piece, a 5-piece next queue, hold (once per piece), a 500 ms lock delay (moving or rotating resets it, up to 15 times), line clears, scoring, levels, pause and game over (a piece can't spawn, or locks above the top). `advanceTime(state, ms)` is the only clock; `msUntilNextEvent` tells the component when to wake up next.
- `game.test.ts`: unit tests for rotation, kicks, walls, the ghost, drop scoring, the lock delay and its resets, gravity, game over, single and 4-line clears, levels, the 7-bag, hold and pause.
- `renderer.ts`: draws on one `<canvas>`. The grid and one sprite per colour are drawn once per size and cached; a frame is only drawn when something changes. Cleared rows flash white and then shrink and fade over 280 ms (the only time `requestAnimationFrame` runs).
- `sound.ts`: Web Audio sounds made on the fly (no audio files): a lock tick, a rising chime that grows with the number of lines, a chord for 4 lines, and a low game-over tone. The `AudioContext` is created on the first key press or tap. 🔊/🔇 mute is saved in `localStorage` (`kush-games-blocks-muted`).
- `Blocks.tsx` / `blocks.css`: the state lives in a ref and a single `setTimeout` drives gravity. React only re-renders when the score, lines, level or status changes. A 4-line clear shows **BLOCKS!** and shakes the board (no shake with `prefers-reduced-motion`). The best score is saved in `localStorage` (`kush-games-blocks-best`). The game pauses on its own when the tab is hidden.

Scoring: 100 / 300 / 500 / 800 × level for 1 / 2 / 3 / 4 lines, plus 1 point per soft-dropped cell and 2 per hard-dropped cell. The level goes up every 10 lines, and gravity gets faster: `max(80, 800 × 0.85^(level − 1))` ms per row.

Controls: ←/→ or A/D to move (hold to repeat), ↑/W to rotate, ↓/S soft drop, Space hard drop, C/Shift hold, P pause, M mute. On phones: tap the board to rotate, drag left/right to move by cells, drag down to soft drop, flick down to hard drop, or use the ◀ ⟳ ▶ ▼ ⤓ ⇄ buttons.

For tests, `?blocksSeed=N` fixes the piece order and `?blocksSetup=quad` starts with the bottom 4 rows full except one column and an I piece first (e.g. `…/kush-games/?blocksSetup=quad#/play/blocks`).

### Chess

`src/games/chess/` has chess you can play against a friend over the internet, or on one device.

- **Rules:** [`chess.js`](https://github.com/jhlywa/chess.js) handles legal moves, check, checkmate, stalemate, threefold repetition, insufficient material, the fifty-move rule, castling, en passant and promotion. `match.ts` wraps it: a match is just the list of moves in UCI (`e2e4`, `e7e8q`) plus resignation or an agreed draw.
- **Board:** `Board.tsx` draws 64 memoised squares. Tap a piece to see its legal squares (dots, or rings for captures), then tap where it should go. The last move and a king in check are highlighted. A pawn reaching the last rank opens a promotion picker. The board flips for Black. Pieces are Unicode glyphs coloured with CSS, so there are no images.
- **Online:** *Play a friend* creates a room with a 5-character code (no 0/O/1/I/L). The host registers the PeerJS id `kushchess-<code>` on the free public PeerJS server and gets a link like `https://abhi1kush.github.io/kush-games/#/play/chess?room=K7M2Q`, with **Copy link** and **Share…** (`navigator.share`) buttons. Opening the link joins automatically, or you can type the code in *Join with a code*. The host chooses White or Black, and each rematch swaps colours.
  - Moves go directly between the two browsers over a WebRTC data channel (`peerTransport.ts`), using PeerJS's default ICE servers. No game server is involved.
  - Connection status is always shown: *Waiting for friend*, *Connected*, *Opponent left — reconnecting*. The guest keeps retrying, and a heartbeat notices a silent disconnect.
  - If the browsers can't reach each other directly (strict office, school or mobile networks), the game says so and suggests trying another network.
- **Protocol** (`protocol.ts`, tested in `protocol.test.ts` and `session.test.ts`):
  - Each move is sent as UCI + SAN with its ply and game number, and the receiver checks it with chess.js.
  - On every (re)connect both sides send their whole match (moves + FEN). The newer game wins. In the same game the longer move list wins when the other is a prefix of it, otherwise the host's version wins, so both sides always converge.
  - Also covered: resign (with a confirm step), offer/accept/decline a draw, and rematch.
- **Pass and play:** two players on one device, with Undo, Flip and New game.
- **Saving:** the game is saved under `kush-games:chess:save:v1`, including the room code and your role. A refresh restores the board and re-joins the room (a refreshed host re-opens the same room). A finished pass-and-play game isn't kept. *Leave room* / *Exit* clears the save.
- **Sound:** small Web Audio sounds for a move, a capture and check, with a 🔊/🔇 toggle saved as `kush-games-chess-muted`.
- **Browser test:** `node e2e/chess-online.mjs [url]` plays a local game, then two browser contexts (a 1280px host and a 375px phone guest) play an online game: moves both ways, reloads on both sides, draw, resign, rematch and leave. If WebRTC can't connect on the test machine, it still checks the PeerJS server part, then runs the same two-browser test over a relay transport that the script installs (`window.__kushChessTestTransport`, a test-only hook).

### Where 2048 came from

The 2048 game was copied from [abhi1kush/2048](https://github.com/abhi1kush/2048) (commit `f37ad66`) into `src/games/game2048/`:

- `game.ts` — game logic (same behaviour; local variable names expanded for readability)
- `game.test.ts` — the original unit tests, unchanged
- `Game2048.tsx` — the original `App.tsx` turned into a component
- `game2048.css` — the original styles, scoped under `.game-2048` so they don't leak into the rest of the site

Controls: arrow keys / WASD, or swipe on the board on mobile.

## Saved games

Every playable game (2048, Snake, Blocks and Chess) saves its game in progress to `localStorage` and restores it after a reload, Back, or closing the tab. Settings and best scores were already saved and still are.

[`src/games/persistence.ts`](src/games/persistence.ts) is the shared helper:

- One versioned key per game: `kush-games:<gameId>:save:v1`, holding `{ version, savedAt, data }`.
- Loading never throws. Corrupt JSON, a different version, or data that fails the game's own check is discarded (and removed), and a fresh game is shown. Saves from older versions are removed. Bump the version when a save's shape changes.
- `save` writes at once, `saveThrottled` writes at most once per second (newest data wins), and `flush`/`clear` do what they say. Storage errors (full or blocked) are ignored, so the game keeps working.
- `hasSavedGame(id)` drives the home page's **Continue** badge.

| Game | What is saved | When |
| --- | --- | --- |
| Chess | moves, game number, colours, resign/draw state, mode, room code and role | after every change (moves are rare) |
| 2048 | tiles (value, row, column), score, won, keep-playing | after every move (and *Keep going*) |
| Snake | body, direction, apple, score, length, apples eaten, speed setting + step interval, status | on every apple and pause at once; at most once per second while moving; on `pagehide`, tab hidden, and leaving the game |
| Blocks | board cells, current piece (type, position, rotation), next queue, 7-bag and random-generator state (so the piece order carries on), hold + can-hold, score, lines, level, timers | on every lock, line clear, hold and pause; on `pagehide`, tab hidden, and leaving the game |

Restoring:

- 2048 comes back as it was.
- A Snake or Blocks game comes back **paused**, with a *Saved game restored* overlay and **Resume** / **New game** buttons.
- A finished game is never restored. Game Over clears the save, so the next visit starts fresh.
- *New Game* / *New game* / *Play again* clear the save and start over.
- The Blocks test parameters (`?blocksSetup`, `?blocksSeed`) never load or write saves, so the tests stay deterministic.
- The save logic for each game lives in its `save.ts`, with tests in `save.test.ts` (round trip, rejected bad data, and the Blocks piece order carrying on after a restore). Saving doesn't re-render React: Snake and Blocks still show 0 React commits while playing.

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
npm test           # unit tests (2048, Snake and Blocks logic, saved games, registry, routing)
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
