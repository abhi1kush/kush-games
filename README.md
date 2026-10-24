# Kush Games

A Netflix-style home for browser games — dark UI, a big hero banner, and a wrapping grid of game cards (no sideways scrolling), filterable by genre. Click **Play** and the game opens full screen on its own route.

**Live:** https://abhi1kush.github.io/kush-games/

Built with **React + TypeScript + Vite**; Breakout, Connect Four, Solitaire, Checkers, Kush Jump, Jungle Strike and Antariksh Defenders run their game logic in **Rust compiled to WebAssembly**. Deployed to GitHub Pages from the `gh-pages` branch.

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
| Jungle Strike — side-scrolling run-and-gun shooter, one stage (Rust/WebAssembly) | ✅ Playable |
| Antariksh Defenders — fixed shooter with Indian space-mission flair, Earth orbit → Moon → Mars (Rust/WebAssembly) | ✅ Playable |

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

### Rust/WebAssembly games: Breakout, Connect Four, Solitaire, Checkers, Kush Jump, Jungle Strike, Antariksh Defenders

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
  - Keyboard: ←/→ or A/D move, Space/↑/W/Z jump (hold for higher), Shift/X run, P pause, M mute, Enter/any key starts. Phones: ◀ ▶ pad (slide between halves), RUN and JUMP buttons, multi-touch; below the stage in portrait, over its corners in landscape. The start screen shows the shared controls card and the pause screen has a “? Controls” button. Saves checkpoint, lives, score and coins (`kush-games:kush-jump:save:v1`) when the checkpoint is reached, a life is lost, on pause, tab hidden, `pagehide` and leaving; a refresh restarts from the start or the checkpoint. `?kushJumpTest` exposes `window.__kushJumpTest` (teleport/drop hooks) for `e2e/kush-jump.mjs`.

- **Jungle Strike** — an original side-scrolling run-and-gun stage (own commando, enemies, canvas-drawn art and Web Audio sounds; no image or audio files, no borrowed names or maps). Stage 1 "Green Hell Ridge" is 3 900 units long: jungle ground with rock ledges at two heights (Down + Jump drops through a ledge, not the ground), a bridge over a river that blows up plank by plank once stepped on, the river itself (swim: move and shoot forward or up only, wade out on the far bank), turrets that rise out of the ground and turn 30° at a time toward you, wall cannons (down-left / left / up-left), standing snipers and bush snipers that are bulletproof until they pop up, foot soldiers that keep running in from both screen edges (and leap or drop off ledges), a pit with a ledge over it, a midway checkpoint flag, a second collapsing bridge over a gorge, and the fortified gate: two cannons and a 40-hit core (boss health bar). Flying capsules drop **R** Rapid, **S** Spread (5 pellets) or **L** Laser (piercing). One hit costs a life (the weapon is lost), 3 lives with 2.5 s respawn invincibility, then up to 3 continues from the last checkpoint (score resets).
  - Rust (`wasm/jungle_strike`) owns everything: 8-way aim (running + up/down = diagonals, standing + down = lie flat, any direction in the air, forward/up in water), somersault jump (small hitbox), one-way platforms, bridges, water, enemies, bullets and particles in fixed-size pools (32 enemies, 40 player bullets, 48 enemy bullets, 96 particles — no allocation after start), scoring, checkpoint, continues and the boss. Same hitch rules as Breakout/Kush Jump: fixed 1/120 s steps, at most 50 ms simulated per frame, gaps over 100 ms dropped and 0.3 s of protection afterwards. The wasm is ~35 KB (≈16 KB gzipped) and loads only when the game opens; JS reads one `Float32Array` render buffer straight from wasm memory each frame.
  - One canvas (240 units tall, 256–480 wide), forward-only camera; the sky/mountains and palm silhouettes are two pre-rendered parallax strips, ground/ledge/plank/gate are pre-rendered sprites (rebuilt only on resize), only on-screen platforms and objects are drawn.
  - Keyboard: arrows/WASD move and aim, Z/J/Space jump, X/K fire (hold for auto-fire), P pause, M mute, Enter/any key starts. Phones: an 8-way stick plus JUMP and FIRE (several fingers at once), below the stage in portrait and over its corners in landscape. The start screen shows a compact controls card (key caps on keyboards, a labelled sketch of the stick and buttons on touch screens, both on hybrids; `src/games/ControlsPanel.tsx`) with the R/S/L weapon legend; the pause screen has a “? Controls” button that opens the same card. Saves checkpoint, lives, score, weapon and continues (`kush-games:jungle-strike:save:v1`) on the checkpoint, a lost life, game over, pause, tab hidden, `pagehide` and leaving. `cargo test -p jungle_strike` includes a bot that plays the whole stage without cheats. `?jungleStrikeTest` exposes `window.__jungleStrikeTest` (teleport, invincibility, weapon, spawn hooks and frame timings) for `e2e/jungle-strike.mjs`.
- **Antariksh Defenders** — an original fixed shooter inspired by Indian space exploration (no agency names, logos, emblems or real mission names). You fly a white-and-saffron launcher with green bands and strap-on boosters along the pad; a formation of asteroids (10 pts), space-debris clusters (20) and rogue alien drones (30) marches side to side, steps down at the edges and speeds up as it thins (a 4-note march tick that speeds up with it). Four satellites with solar-panel wings shield you and erode cell by cell (a 24 × 16 grid each, ragged craters from both sides). A comet (Earth/Moon legs) or an alien mothership (Mars/deep space) crosses the top for 50–300 points and drops a capsule: **T** triple shot or **S** a one-hit shield bubble (9 s each; enemies very rarely drop one too). Mission-control countdown (T-3, T-2, T-1, LIFTOFF) at the start; the journey runs Low Earth Orbit → Earth Departure → Lunar Orbit → Lunar Far Side → Mars Transfer → Mars Approach → Deep Space (repeating, still harder), with Earth, Moon, Mars and nebula backdrops. Each wave starts lower, marches faster, fires more often with more bullets allowed, aims more at you, and from wave 3 the second-lowest enemy of a column can fire too; formations vary (full, wide, chevron, ring, checker). 3 lives, an extra ship every 5 000 points, game over when the formation reaches the shields' line or the last ship is lost; high score saved separately (`kush-games-antariksh-defenders-best`).
  - Rust (`wasm/antariksh_defenders`) owns everything (formation, shots, shields, mothership, capsules, particles in fixed pools: 55 enemies, 8 + 10 bullets, 160 particles, 2 capsules), with the same hitch rules (1/120 s steps, ≤ 50 ms per frame, gaps over 100 ms dropped with 0.3 s of protection). The wasm is ~36 KB (≈16.5 KB gzipped) and loads only when the game opens; JS reads a `Float32Array` render buffer and the shield bytes straight from wasm memory. Sprites and backdrops are pre-rendered per scale; the shield strip repaints only when a shield is hit.
  - Keyboard: ←/→ or A/D move, Space, Z or ↑ fire (hold to keep firing at the allowed rate: 2 shots in flight, 6 with triple shot), P pause, M mute, Esc back to the hub. Phones: a wide drag pad (the ship follows your thumb relative to where you touched) plus a big FIRE button, several fingers at once; touching the playfield itself flies the ship to your finger. Portrait puts the controls under the playfield; landscape puts them either side. Saves wave, score and lives (`kush-games:antariksh-defenders:save:v1`) on a new wave, a lost life, pause, tab hidden, `pagehide` and leaving; a reload resumes at the start of that wave; cleared on game over. `?antarikshTest` exposes `window.__antarikshTest` for `e2e/antariksh-defenders.mjs`.
