# Kush Games

A Netflix-style home for browser games — dark UI, a big hero banner, and a wrapping grid of game cards (no sideways scrolling), filterable by genre. Click **Play** and the game opens full screen on its own route.

**Live:** https://abhi1kush.github.io/kush-games/

Built with **React + TypeScript + Vite**; Breakout, Connect Four, Solitaire, Checkers and Kush Jump run their game logic in **Rust compiled to WebAssembly**. Deployed to GitHub Pages from the `gh-pages` branch.

## Features

- Top nav with the **Kush Games** logo and quick links (genre links filter the grid; the links wrap instead of scrolling)
- Hero banner featuring **2048** with *Play* and *More Info*
- **All games**: every playable game once, in a responsive CSS grid (`auto-fill`, min card width 190px; 140px on phones) — about 2 columns at 375px, 3–4 on tablets, 5–6 on desktop. Genre chips (All / Puzzle / Arcade / Strategy / Classic Board, with counts) filter it. A **Coming Soon** grid (and nav link) appears below only while some game is still a placeholder — right now there are none.
- Cards scale up on hover and show the title, tagline and genres
- Game detail modal (`#/title/<id>`) with "More Like This"
- Full-screen player (`#/play/<id>`) with a Back button (Escape also works)
- Placeholder games show a "Coming Soon" screen
- Hash routing, so deep links work on GitHub Pages without server rewrites
- Card art is generated from CSS gradients + SVG patterns + a glyph — no images
- **Thumbnails**: every card has a hand-drawn SVG scene of its game in `src/assets/thumbnails/` (320×180, no filters, ~1 KB each gzipped, lazy-loaded `<img>` with fixed width/height). The title is set over the scene in HTML and scales with the card; Coming Soon cards are slightly desaturated with a small pill.
- Games in progress are saved in the browser, so a refresh doesn't lose them; their cards show a **▶ Continue** badge

## Games

| Game | Status |
| --- | --- |
| 2048 | ✅ Playable |
| Snake | ✅ Playable |
| Blocks | ✅ Playable |
| Chess (online with a friend, or pass and play) | ✅ Playable |
| Minesweeper | ✅ Playable |
| Sudoku | ✅ Playable |
| Tic-Tac-Toe (vs computer or 2 players) | ✅ Playable |
| Memory Match | ✅ Playable |
| Flappy Wings | ✅ Playable |
| Arrow Out | ✅ Playable |
| Color Trails | ✅ Playable |
| Breakout (Rust/WebAssembly) | ✅ Playable |
| Connect Four (vs computer, 2 players, or online with a friend; Rust/WebAssembly) | ✅ Playable |
| Solitaire — Klondike (Rust/WebAssembly) | ✅ Playable |
| Checkers (vs computer, 2 players, or online with a friend; Rust/WebAssembly) | ✅ Playable |
| Kush Jump — side-scrolling platformer, one stage (Rust/WebAssembly) | ✅ Playable |

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

### Minesweeper

`src/games/minesweeper/` — Beginner (9×9, 10 mines), Intermediate (16×16, 40) and Expert (30×16, 99).

- `game.ts` keeps the board in flat arrays (mines, neighbour counts, cell states). Mines are placed on the **first click**, never on the clicked cell or its neighbours, so the first click always opens an area. Opening an empty cell flood-fills (iteratively) to the numbered border. Tapping an open number whose flags are all placed **chords** (opens the rest of its neighbours). Winning flags every mine; losing shows them all and marks wrong flags.
- Controls: click/tap to dig; right-click, **long-press** (380 ms) or the **⛏ Dig / 🚩 Flag** toggle to flag (`F` switches, `N` new game). Mine counter, timer and best time per difficulty (`kush-games-minesweeper-best`).
- Phones: cells shrink to fit (22–34 px) and on screens ≤ 600 px Expert turns sideways into a tall 16-wide board; the page scrolls vertically.
- Sounds: click, cascade sweep, flag blip, boom and a win jingle.

### Sudoku

`src/games/sudoku/` — Easy (~40 clues), Medium (~32) and Hard (~26).

- `sudoku.ts` has a bit-mask backtracking solver (fewest-candidates cell first). Puzzles are generated from a random solved grid by removing clues in random order and **keeping a removal only if the puzzle still has exactly one solution** (`countSolutions(grid, 2)`), using a seeded generator.
- `game.ts`: number pad (with how many of each digit are left), pencil notes (placing a number clears that note from its row, column and box), undo for every change, erase, hint (fills the selected cell, or the first empty/wrong one), mistakes counter (a number that isn't the answer), timer and best time per difficulty.
- Highlights: the selected cell's row, column and box, every cell with the same number, and red conflicts (duplicates).
- Keyboard: 1–9, arrows, Backspace/Delete/0, `N`/`P` notes, `U` or Ctrl+Z undo, `H` hint.

### Tic-Tac-Toe

`src/games/tictactoe/` — play the computer (**Easy**: wins or blocks about half the time, otherwise random; **Hard**: minimax that prefers the quickest win and never loses) or **2 Players** on one device. The starter alternates each round, the winning line is highlighted, and a score tally is kept per mode (`kush-games-tictactoe-tally`). A unit test plays every possible line against Hard, as X and as O, and checks it never loses.

### Memory Match

`src/games/memory/` — emoji cards on a 4×4, 4×5 or 6×6 grid. Two different cards stay up for 0.8 s (tapping a third card turns them back at once). Moves, timer and best (fewest moves, then time) per size. The flip is a CSS `rotateY` with `backface-visibility`, only on the cards that change (memoised).

### Flappy Wings

`src/games/flappy/` — one-button flying through pipe gaps.

- `physics.ts` is pure: a 288×512 world, gravity, flap impulse, pipes every 180 px with a random gap (seeded, and the seed is part of the state), circle-vs-rectangle collision, one point per pipe passed.
- `FlappyWings.tsx` runs a `requestAnimationFrame` loop with a **fixed 1/120 s timestep** (accumulator), so speed is the same at 60 Hz or 144 Hz. The sky, pipes, ground and bird are drawn once into offscreen canvases. React only re-renders when the score or status changes, and the loop sleeps while paused or after the crash.
- Space / ↑ / click / tap to flap, `P` or the button to pause; switching tabs pauses. Score and best (`kush-games-flappy-best`). Flap, score and hit sounds.

### Arrow Out

`src/games/arrowout/` — our own take on the "tap away" arrow puzzle.

- The board is packed like a maze with **winding arrows**: each arrow is a path of cells (tail → head) with 90° bends and an arrowhead. Tap anywhere on an arrow and, if every cell in a straight line from its head to the board edge is empty, it slides out: the head goes straight ahead and the body follows its own trail like a train (it glows gold while it goes). Tapping a blocked arrow lunges it into the first arrow in the way, flashes both red, shakes, and **costs one of 3 lives**; losing all three fails the level (*Try again*). **Undo** brings the last arrow back (lost lives stay lost), **Hint** highlights an arrow that can escape now, **Restart** resets the level. Clearing the board shows stars (lives left) and *Next level*.
- **Levels** (`game.ts`) are generated from their number, so a level is the same every time. Boards grow from 5×5 to 12×16 (reached at level 14); a separate *difficulty* setting goes from 0 (levels 1–3) to 1 (level 21+), so puzzles keep getting harder after the size stops growing.
  - *Placement:* arrows are placed one at a time and the level can be cleared in the reverse order, so a new arrow only needs its head's exit line to be clear of the arrows placed *before* it; its winding body is grown backwards from the head and never touches its own exit line. On harder levels each step samples several candidate arrows and keeps the one whose body lands across the exit lines of still-free arrows (especially ones pointing another way), whose head is deep inside the board, which doesn't sit in a same-direction lane, and which keeps the four directions balanced. A tail-growth pass fills leftover cells where that stays solvable.
  - *Selection:* several seeded drafts are built and scored with the difficulty metrics; the best two go through a *tangle* pass that turns free arrows around to point into the board, joins free leftovers onto a neighbour's tail, fills empty cells, and cuts long arrows in two so the tail half points into the rest. Every edit is kept only if the whole level still clears (checked by simulation), and arrows are renumbered so the highest id can leave first. Levels are cached, and the next one is generated in idle time (about 30 ms on a laptop for a 12×16 level).
  - *Metrics* (`metrics.ts`): share of arrows free at the start, average free arrows per step of a clear, dependency depth (rounds when every free arrow leaves at once), most common direction's share, same-direction lane runs, share of blocks between different directions, and tempting blocked arrows. Level 1: 50% free, depth 3; levels 21–60: about 10–12% free on average, depth ~18–21, no direction above 40%. Unit tests clear levels 1–60 and check these trends.
- **Drawing:** one SVG. Each arrow's line runs along its path and on past the board edge, with a dash exactly as long as the arrow. Sliding the dash with `stroke-dashoffset` (Web Animations API) moves the arrow along its own path while the arrowhead slides straight on, so React doesn't re-render per frame (about 2 commits per tap). A wide invisible stroke over each arrow's cells is its tap target.
- Saved (save version 3; saves from older generators are dropped, the cleared-level progress is kept): the level number and the order arrows left (replayed and checked on load), lives, mistakes and hints. The highest level cleared is kept in `kush-games-arrow-out-progress`. Keys: `U` undo, `H` hint, `R` restart, `N` next level, `M` mute. Browser test: `node e2e/arrow-out.mjs [url]`.

### Color Trails

A connect-the-dots path puzzle in the style of the "same color / connect two dots" Android games. Drag from a dot to its twin of the same color; paths go up, down, left and right, can't cross, and every square must be filled.

- **Rules:** drawing over another color's path cuts it (it grows back if you back off within the same drag); dragging back over your own path shortens it; you can't draw through another color's dot. A *move* is counted each time you start drawing a different color than last time (like Flow), so a perfect solve is one move per color.
- **Stars:** 3 = perfect (moves = colors, no hints), 2 = up to half as many extra moves (or hints used), 1 otherwise. Undo (`U`), Hint (`H`, lays one correct path), Restart (`R`), level select (`L` or tap the level name) for cleared levels.
- **Levels:** 100 generated boards are bundled in `src/games/colortrails/levels.json` (12.6 KB, ≈4 KB gzipped). Each one fills the whole board and has exactly one solution, proven by an exact solver. They are generated at build time with `npx vite-node scripts/generate-color-trails.ts [from] [to] [outFile]` (seeded per level, so reruns give the same boards), then `scripts/merge-color-trails.ts` orders them by measured hardness (levels 1–12 within each board size; from level 13 on strictly by hardness, so now and then a harder board is a size smaller than the one before). Levels 101+ replay the hardest 50 (levels 51–100) mirrored/turned with colors reshuffled.
- **Difficulty:** boards grow 5×5 → 6×6 → 7×7 → 8×8/9×9 → 10×12 (≈ 30px cells on a 375×667 phone). For each level the generator keeps the candidate closest to a rising hardness target, from: share of the board solvable by forced moves alone, solver guesses, average path length and bends, how far paths wander from the direct route, and short (≤ 3 cell) pairs. `npx vite-node scripts/color-trails-metrics.ts 1 5 10 20 30 40 60` prints the table.
- **Colors:** a color-blind friendlier palette, and every color also has its own small symbol inside its dots.

### Rust/WebAssembly games: Breakout, Connect Four, Solitaire, Checkers, Kush Jump

The UI is React + TypeScript; the rules, physics and AI are Rust crates in `wasm/` (one crate per game, a Cargo workspace), built with `wasm-pack --target web` into `src/wasm/<crate>/`. Each game's `.wasm` is only fetched when that game opens (the hub downloads none). Data crosses the boundary as small typed arrays and integers — never JSON.

| Crate | `.wasm` raw | gzipped |
| --- | --- | --- |
| breakout | 26.5 KB | 12.4 KB |
| connect_four | 26.0 KB | 12.4 KB |
| solitaire | 25.7 KB | 11.8 KB |
| checkers | 31.1 KB | 14.6 KB |
| kush_jump | 30.3 KB | 13.9 KB |

Size settings: `opt-level = "z"`, `lto`, `codegen-units = 1`, `panic = "abort"`, `strip`, then `wasm-opt -Oz`; `wasm-bindgen` without default features. Float formatting (pulled in by `f32::clamp`'s panic message) and libm `sin`/`cos` were avoided by hand (≈ 30 KB saved in Breakout).

- **Breakout** — fixed 1/120 s physics step in Rust, driven by a `requestAnimationFrame` loop; JS draws from a `Float32Array` view of wasm memory (no per-frame allocation). Two stacked canvases: the bricks layer is redrawn only for bricks that changed; the top canvas clears only the rectangles it drew last frame. Mouse/finger (native passive pointer listeners straight into the wasm paddle target) or ←/→, Space/tap to launch, P pause. Levels add rows, multi-hit and steel bricks and a faster ball. Power-ups (1 in 9 bricks): wide paddle, multi-ball, slower ball, extra life. Pauses when the tab is hidden; a refreshed game comes back paused.
  - **Phone hiccups:** a frame simulates at most 50 ms (slower frames play in slight slow motion); a gap over 100 ms (GC, a notification, a busy phone) is dropped — the game freezes instead of the ball jumping — and a ball lost within 0.3 s after such a freeze is served again without costing a life ("The screen froze for a moment — ball back, no life lost"). The ball moves in sub-steps of at most 3 units (half its radius), so it can't pass through the paddle or a brick at any speed; it never goes exactly vertical or flat, gets nudged if it bounces 8 s without touching a breakable brick, and is moved out if it ends up overlapping a brick.
  - **No work in the rally:** saving happens only when play stops (pause, tab hidden, leaving, a life lost, a level cleared); sounds are rate-limited (≤ 4 overlapping) and the audio context is created on the first touch. `node e2e/perf-breakout.mjs <url> --assert` plays ~80 s at 375 px with 4× and 6× CPU throttling and checks frame times, storage writes, React commits, ball jumps and that six simulated 300 ms freezes cost no life.
- **Connect Four** — bitboards; negamax with alpha-beta, a transposition table, threat-first move ordering and iterative deepening under a node budget. Easy (shallow and a bit random), Medium (depth 5 with noise), Hard (as deep as 160 000 nodes allow — about 30–50 ms on a desktop, roughly 4× that on a mid-range phone). The search runs in a Web Worker. 2-player pass-and-play, drop animation, highlighted four, win/draw tally, undo.
- **Solitaire** — Klondike with a seeded (mulberry32) deal, Draw 1 / Draw 3, drag-and-drop or tap a card to send it to its best spot, safe cards go to the foundations by themselves, undo (replays the action list), hint, timer, moves, Windows-style score and a CSS win cascade. Seven columns fit a 375 px screen.
- **Checkers** — English draughts: compulsory captures, multi-jumps, crowning ends the move, draw after 40 moves each without a capture or man move. Negamax alpha-beta with a transposition table and capture extension, in a Web Worker; Easy/Medium/Hard (Hard: 120 000-node budget, ≈ 50 ms desktop). Legal moves are highlighted, pieces that must capture are ringed, moves animate along their path.
- **Kush Jump** — an original side-scrolling platformer stage (own hero, enemies, art and sounds, all drawn with canvas paths / generated with Web Audio; no image or audio files). Stage 1 "Sunny Hills" is 214 tiles long: ground with three pits, ★ crates (coins; two hold a Sun Berry that makes Kush big — bigger hitbox, smashes bricks, survives one hit), a 6-coin brick, floating coins, six pipes of three heights, grumbles (walk, stomp them — stomp chains score 100→1000) and shellbugs (stomp → shell, kick it to slide and knock out others; it wakes after 8 s), stone stair pyramids, a midway checkpoint, a final staircase and a flag pole (higher grab = bigger bonus: 100–5000) before a fort, then the time left ×50 is counted into the score. 300-tick timer (2 ticks/s), 3 lives, extra life every 100 coins.
  - Rust (`wasm/kush_jump`) owns the level, physics (fixed 1/120 s step; acceleration, skid, run speed, variable jump height via lighter gravity while jump is held, jump buffering, coyote time, corner slip), enemies, scoring, checkpoint and goal sequence. JS sets the held buttons, calls `advance(seconds)` and draws from a `Float32Array` render buffer + the tile map in wasm memory. Same hitch rules as Breakout: a frame simulates at most 50 ms, gaps over 100 ms are dropped, and for 0.3 s after a dropped gap enemies can't hurt and a pit fall puts the hero back on the last safe ground.
  - One canvas, 240 world units tall and 256–480 wide (fits the screen), camera scrolls forward only. Tiles are pre-rendered sprites (one per kind, rebuilt only on resize) and only on-screen columns are drawn; the far hills/clouds are one repeating strip with parallax; the start, game-over and clear screens stop redrawing.
  - Keyboard: ←/→ or A/D move, Space/↑/W/Z jump (hold for higher), Shift/X run, P pause, M mute, Enter/any key starts. Phones: ◀ ▶ pad (slide between halves), RUN and JUMP buttons, multi-touch; below the stage in portrait, over its corners in landscape. Saves checkpoint, lives, score and coins (`kush-games:kush-jump:save:v1`) when the checkpoint is reached, a life is lost, on pause, tab hidden, `pagehide` and leaving; a refresh restarts from the start or the checkpoint. `?kushJumpTest` exposes `window.__kushJumpTest` (teleport/drop hooks) for `e2e/kush-jump.mjs`.

#### Toolchain

```bash
curl https://sh.rustup.rs -sSf | sh            # Rust stable (tested with 1.99)
rustup target add wasm32-unknown-unknown
cargo install wasm-pack                          # 0.13+ (downloads wasm-bindgen and wasm-opt/binaryen itself)
```

`npm run build` runs `npm run build:wasm` (`scripts/build-wasm.mjs`, prints the sizes) and then `tsc -b && vite build`. The built `src/wasm/` output is committed, so without `wasm-pack` the script warns and keeps the committed files — `npm ci && npm run build` works either way. `npm run test:rust` runs the cargo tests.

### Colour themes

The ⚙ button in the top-right corner (hub header and game pages) opens a theme picker:

- **Lagoon** (default for anyone who hasn't picked a theme) — `#163235` page background, `#106967` cards / panels / game bar, `#4fbc9c` logo and accents, `#32bfda` focus rings, links and selected-option highlights, `#efca7c` primary buttons, selected chips and badges (with dark `#163235` text on it). Body text is near-white `#f2fbf8` and secondary text `#cfe9e3`, both ≥ 4.5:1 on both teals (`src/theme.test.ts` checks the contrast pairs).

- **Netflix Red** — the dark Netflix-style look with red accents.

Themes are CSS custom properties (`:root` and `:root[data-theme="lagoon"]` in `src/styles.css`); hub, cards, chips, buttons, the player bar, shared game chrome and the online-room UI use the variables, while game boards, canvases and SVG thumbnails keep their own art. The tab icon (a tall ribbon "K" with gradient-shaded bar, arm and leg: reds on near-black, or greens `#4fbc9c` → `#1f5c4a` on `#163235` in Lagoon; the 32 px PNG uses a higher-contrast variant) and the header avatar follow the theme too; `node scripts/build-favicons.mjs [preview.png]` redraws `public/favicon*.svg|png` and `apple-touch-icon*.png` (bump `ICON_VERSION` in `src/theme.ts` and the `?v=` in `index.html` after changing them). The choice is saved as `kush-games:theme:save:v1` (the usual versioned envelope) and `index.html` ships with Lagoon (attribute, theme-color, icons) and an inline script switches to a saved Netflix Red before the first paint. Any explicit choice, including Lagoon, is saved. The panel closes on an outside tap or Esc; on a game page Esc closes the panel first and only the next Esc leaves the game. `node e2e/theme.mjs <url> /tmp` checks it.

### Shared sound setting

The newer games (Minesweeper, Sudoku, Tic-Tac-Toe, Memory Match, Flappy Wings, Arrow Out, Color Trails, Breakout, Connect Four, Solitaire, Checkers and Kush Jump) share `src/games/sharedSound.tsx`: generated Web Audio sounds and one 🔊/🔇 button saved as `kush-games-muted` (`M` toggles). Snake, Blocks and Chess keep their own mute settings.

### Chess

`src/games/chess/` has chess you can play against a friend over the internet, or on one device.

- **Rules:** [`chess.js`](https://github.com/jhlywa/chess.js) handles legal moves, check, checkmate, stalemate, threefold repetition, insufficient material, the fifty-move rule, castling, en passant and promotion. `match.ts` wraps it: a match is just the list of moves in UCI (`e2e4`, `e7e8q`) plus resignation or an agreed draw.
- **Board:** `Board.tsx` draws 64 memoised squares. Tap a piece to see its legal squares (dots, or rings for captures), then tap where it should go. The last move and a king in check are highlighted. A pawn reaching the last rank opens a promotion picker. The board flips for Black. Pieces are Unicode glyphs coloured with CSS, so there are no images.
- **Online:** built on the shared online module (see *Online play with a friend* below). The host chooses White or Black; each rematch swaps colours. Chess keeps its PeerJS id prefix `kushchess-` and its save key.
- **Pass and play:** two players on one device, with Undo, Flip and New game.
- **Saving:** the game is saved under `kush-games:chess:save:v1`, including the room code and your role. A refresh restores the board and re-joins the room (a refreshed host re-opens the same room). A finished pass-and-play game isn't kept. *Leave room* / *Exit* clears the save.
- **Sound:** small Web Audio sounds for a move, a capture and check, with a 🔊/🔇 toggle saved as `kush-games-chess-muted`.
- **Browser test:** `node e2e/chess-online.mjs [url]` plays a local game, then two browser contexts (a 1280px host and a 375px phone guest) play an online game: moves both ways, reloads on both sides, draw offer/decline/accept, resign, game over + New game on both ends, rematch request/accept (colours swap), both pressing New game at once, and leave. If WebRTC can't connect on the test machine, it still checks the PeerJS server part, then runs the same two-browser test over the relay transport in `e2e/relay.mjs`.

### Online play with a friend (Chess, Connect Four, Checkers)

`src/games/online/` holds everything the three games share; each game only adds a small rules adapter (`OnlineRules`: move format, legality, whose turn, finished on the board).

| Game | Move on the wire | Checked by | Host plays in game 1 |
|---|---|---|---|
| Chess | UCI, e.g. `e2e4`, `e7e8q` | chess.js (`chess/match.ts`) | White or Black (chosen) |
| Connect Four | column `"0"`–`"6"` | Rust/wasm rules (`connectfour/rules.ts`) | Red (moves first) |
| Checkers | path of squares, e.g. `22-15-6` for a double jump | Rust/wasm legal-move list, so forced captures and full multi-jumps are enforced (`checkers/rules.ts`) | Dark (moves first); the guest's board is flipped |

- **Rooms** (`room.ts`): 5-character codes (no 0/O/1/I/L); the host registers the PeerJS id `kushchess-` / `kushc4-` / `kushcheckers-` + code on the free public PeerJS broker. Share link `#/play/<game>?room=CODE` with **Copy link** and **Share…**; opening it joins automatically, or type the code.
- **Transport** (`peerTransport.ts`): a WebRTC data channel with PeerJS's default ICE servers, a heartbeat, reconnects, and clear states: *Waiting for friend*, *Connected*, *Opponent left — reconnecting*, and a "try another network" hint when a direct connection is impossible. No game server.
- **Protocol** (`protocol.ts`, version 2): `hello` (protocol + game id), full `sync` on every (re)connect (newer game wins; a longer move list wins over its prefix; otherwise the host's version), `move` with ply + game number (validated on receipt; anything odd triggers a sync), `resign`, `draw-offer/accept/decline`, `rematch-offer/accept/decline`, `ping`.
- **Match** (`match.ts`): the move list plus resignation / agreed draw / pending draw offer (cancelled by the next move) / pending rematch request. A rematch swaps colours, so the other player moves first next game. If both players press New game, it starts at once.
- **UI** (`OnlineUI.tsx`, `online.css`): room panel; *½ Offer draw* and *🏳 Resign* (with "Really resign?"); incoming offers with Accept / Decline; a game-over banner above the board on **both** ends with the result and **↻ New game**; the other side then sees "Friend wants a rematch — Accept / Decline".
- **Saving:** Chess keeps the room in `kush-games:chess:save:v1`; Connect Four and Checkers use a second slot (`kush-games:connect-four-online:save:v1`, `kush-games:checkers-online:save:v1`) so a local game in progress isn't overwritten. A refresh rejoins the room; the hub shows ▶ Continue; *Leave room* clears it.
- **Sounds:** opponent moves use the game's move sound; a chime on connect, a ping for incoming offers and a jingle at game over (shared mute; Chess keeps its own mute).
- **Tests:** `online/protocol.test.ts`, `online/session.test.ts` (sync, reconnect, reload, draw offer/decline/auto-cancel/accept, resign, rematch handshake incl. crossing requests and decline) and `online/gameRules.test.ts` (Connect Four and Checkers rules through the real wasm). Browser: `node e2e/online-games.mjs [url]` checks the real PeerJS broker for both games, then plays Connect Four and Checkers between a desktop host and a 375px phone guest over the relay transport (`window.__kushTestTransport`, test-only; `__kushChessTestTransport` still works).

### Where 2048 came from

The 2048 game was copied from [abhi1kush/2048](https://github.com/abhi1kush/2048) (commit `f37ad66`) into `src/games/game2048/`:

- `game.ts` — game logic (same behaviour; local variable names expanded for readability)
- `game.test.ts` — the original unit tests, unchanged
- `Game2048.tsx` — the original `App.tsx` turned into a component
- `game2048.css` — the original styles, scoped under `.game-2048` so they don't leak into the rest of the site

Controls: arrow keys / WASD, or swipe on the board on mobile.

## Saved games

Every playable game saves its game in progress to `localStorage` and restores it after a reload, Back, or closing the tab. Settings and best scores were already saved and still are.

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
| Minesweeper | difficulty, mine positions, cell states (hidden/open/flagged), time | after every move; on `pagehide`, tab hidden and leaving |
| Sudoku | puzzle, solution, numbers, notes, undo history, mistakes, hints, time | as soon as a puzzle is made, after every change; on `pagehide`, tab hidden and leaving |
| Tic-Tac-Toe | board, who started, opponent, difficulty (the tally is kept separately) | after every move |
| Memory Match | card faces, matched cards, open card, moves, time | after every flip; on `pagehide`, tab hidden and leaving |
| Arrow Out | level number, arrows that have left (in order), lives, mistakes, hints | after every tap, undo and hint; after a win the next level is saved |
| Color Trails | level number, every drawn path, moves, last color drawn, hints | after every drag, undo and hint; after a win the next level is saved |
| Flappy Wings | bird position and speed, pipes, score, distance, random seed | at most once per second while flying; at once on pause, `pagehide`, tab hidden and leaving |
| Breakout | level, score, lives, each brick's remaining hits | only when play stops: a lost life, level clear, pause, `pagehide`, tab hidden and leaving the game (never during a rally) |
| Connect Four | moves played, opponent, difficulty, who started (tally kept separately) | after every move |
| Solitaire | deal seed, Draw 1/3, the list of actions (3 bytes each), time | after every action; time on `pagehide` / tab hidden |
| Checkers | moves played (as legal-move indexes), opponent, difficulty (tally kept separately) | after every move |
| Kush Jump | checkpoint reached, lives, score, coins | checkpoint reached, a life lost, pause, `pagehide`, tab hidden and leaving (cleared on game over / stage clear) |
| Blocks | board cells, current piece (type, position, rotation), next queue, 7-bag and random-generator state (so the piece order carries on), hold + can-hold, score, lines, level, timers | on every lock, line clear, hold and pause; on `pagehide`, tab hidden, and leaving the game |

Restoring:

- 2048 comes back as it was.
- Minesweeper, Sudoku, Tic-Tac-Toe and Memory Match come back as they were, with a *Saved game restored* note (the Minesweeper and Memory clocks wait for your next move).
- A Snake, Blocks, Flappy Wings or Breakout game comes back **paused**, with a *Saved game restored* overlay and **Resume** / **New game** buttons.
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
npm test           # unit tests (game logic for every game, saved games, registry, routing) + wasm integration tests
npm run test:rust  # cargo tests for the four Rust crates
npm run build      # build:wasm, then type-check + production build into dist/
```

Browser check (needs Chrome at `/usr/bin/google-chrome` or `CHROME_PATH`):

```bash
npm run e2e -- https://abhi1kush.github.io/kush-games/ /tmp
node e2e/new-games.mjs https://abhi1kush.github.io/kush-games/ /tmp   # Minesweeper, Sudoku, Tic-Tac-Toe, Memory, Flappy smoke tests
node e2e/four-games.mjs https://abhi1kush.github.io/kush-games/ /tmp  # Breakout, Connect Four, Solitaire, Checkers at 1280 and 375 px
node e2e/chess-online.mjs https://abhi1kush.github.io/kush-games/ /tmp  # Chess local + online (two browsers)
node e2e/online-games.mjs https://abhi1kush.github.io/kush-games/ /tmp  # Connect Four + Checkers online (add --peerjs-only for the broker check)
node e2e/kush-jump.mjs https://abhi1kush.github.io/kush-games/ /tmp     # Kush Jump: move, jump, stomp, checkpoint reload, finish, phone layouts
```

## Deploying

```bash
npm run deploy
```

This builds the site and pushes `dist/` to the `gh-pages` branch using the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package.
GitHub Pages is configured to serve from the `gh-pages` branch (root). The Vite `base` is `/kush-games/`.

No GitHub Actions workflow is used.
