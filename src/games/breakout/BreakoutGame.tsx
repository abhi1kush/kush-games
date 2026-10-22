import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, playSound, unlockAudio, useSharedMute } from '../sharedSound';
import {
  BALL_RADIUS, Breakout, BRICK_COLUMNS, BRICK_GAP, BRICK_HEIGHT, BRICK_ROWS, BRICK_WIDTH, BRICKS_LEFT, BRICKS_TOP, createMemoryViews, Events, loadBreakoutEngine,
  PADDLE_HEIGHT, PADDLE_Y, Phase, POWER_UP_COLORS, POWER_UP_LABELS, RenderSlot, STEEL, WORLD_HEIGHT, WORLD_WIDTH,
} from './engine';
import { createBreakoutSaveSlot } from './save';
import '../shared.css';
import './breakout.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-breakout-best';
const ROW_COLORS = ['#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926', '#36949d', '#1982c4', '#4267ac', '#6a4c93'];

// Sounds are cheap Web Audio oscillators, but a multi-ball rally can ask for dozens a second: each kind plays at most
// once per 45 ms and at most 4 short sounds overlap (life lost, level cleared and power-ups always play).
type SoundKind = 'paddle' | 'wall' | 'brick' | 'tough' | 'steel' | 'powerUp' | 'lifeLost' | 'levelCleared';
const SOUND_DURATIONS_MS: Record<SoundKind, number> = { paddle: 60, wall: 40, brick: 70, tough: 60, steel: 50, powerUp: 180, lifeLost: 450, levelCleared: 500 };
const sounds: Record<SoundKind, (muted: boolean) => void> = {
  paddle: muted => playSound({ tones: [{ frequency: 330, durationSeconds: 0.06, volume: 0.05, type: 'square' }] }, muted),
  wall: muted => playSound({ tones: [{ frequency: 220, durationSeconds: 0.04, volume: 0.03, type: 'square' }] }, muted),
  brick: muted => playSound({ tones: [{ frequency: 660, durationSeconds: 0.07, volume: 0.05, type: 'square' }] }, muted),
  tough: muted => playSound({ tones: [{ frequency: 440, durationSeconds: 0.06, volume: 0.04, type: 'triangle' }] }, muted),
  steel: muted => playSound({ tones: [{ frequency: 1200, durationSeconds: 0.05, volume: 0.03, type: 'sine' }] }, muted),
  powerUp: muted => playSound({ tones: [523, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.12, startSeconds: index * 0.06, volume: 0.05 })) }, muted),
  lifeLost: muted => playSound({ tones: [{ frequency: 300, endFrequency: 90, durationSeconds: 0.45, volume: 0.07, type: 'sawtooth' }] }, muted),
  levelCleared: muted => playSound({ tones: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: 0.2, startSeconds: index * 0.1, volume: 0.06 })) }, muted),
};
const ALWAYS_PLAYED: ReadonlySet<SoundKind> = new Set(['powerUp', 'lifeLost', 'levelCleared']);
const MAX_OVERLAPPING_SOUNDS = 4;
const lastPlayedAt: Partial<Record<SoundKind, number>> = {};
const soundEndTimes = new Float64Array(MAX_OVERLAPPING_SOUNDS);

function playLimited(kind: SoundKind, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayedAt[kind] ?? -1e9) < 45) return;
  let slot = 0;
  for (let index = 1; index < MAX_OVERLAPPING_SOUNDS; index++) if (soundEndTimes[index] < soundEndTimes[slot]) slot = index;
  if (soundEndTimes[slot] > now && !ALWAYS_PLAYED.has(kind)) return; // all voices busy: skip this tick
  soundEndTimes[slot] = now + SOUND_DURATIONS_MS[kind];
  lastPlayedAt[kind] = now;
  sounds[kind](muted);
}

/** Create the AudioContext and run a silent tone on the first touch/key, so the first real sound doesn't stall a frame. */
function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}

export default function BreakoutScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadBreakoutEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="breakout-loading"><p className="game-help">Loading…</p></div>;
  return <BreakoutGame memory={memory} />;
}

const BRICK_COUNT = BRICK_COLUMNS * BRICK_ROWS;

function drawBrick(context: CanvasRenderingContext2D, index: number, hits: number) {
  const column = index % BRICK_COLUMNS, row = Math.floor(index / BRICK_COLUMNS);
  const left = BRICKS_LEFT + column * (BRICK_WIDTH + BRICK_GAP), top = BRICKS_TOP + row * (BRICK_HEIGHT + BRICK_GAP);
  context.clearRect(left - 1, top - 1, BRICK_WIDTH + 2, BRICK_HEIGHT + 2);
  if (!hits) return;
  context.fillStyle = hits === STEEL ? '#8d99ae' : ROW_COLORS[row % ROW_COLORS.length];
  context.beginPath();
  context.roundRect(left, top, BRICK_WIDTH, BRICK_HEIGHT, 4);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(left + 3, top + 2, BRICK_WIDTH - 6, 3);
  if (hits === STEEL) { context.strokeStyle = '#dfe6ee'; context.lineWidth = 1.5; context.strokeRect(left + 2, top + 2, BRICK_WIDTH - 4, BRICK_HEIGHT - 4); }
  else if (hits > 1) {
    // tough bricks: one dot per hit still needed after this one
    context.fillStyle = 'rgba(0,0,0,0.45)';
    for (let dot = 0; dot < hits; dot++) { context.beginPath(); context.arc(left + BRICK_WIDTH / 2 + (dot - (hits - 1) / 2) * 9, top + BRICK_HEIGHT / 2 + 1, 2.6, 0, Math.PI * 2); context.fill(); }
  }
}

/** Redraw only the bricks that changed since the last call (the brick layer is its own canvas, under the moving parts). */
function updateBricks(context: CanvasRenderingContext2D, bricks: Uint8Array, drawn: Uint8Array) {
  for (let index = 0; index < BRICK_COUNT; index++) {
    if (bricks[index] === drawn[index]) continue;
    drawn[index] = bricks[index];
    drawBrick(context, index, bricks[index]);
  }
}

function sizeCanvas(canvas: HTMLCanvasElement, pixelRatio: number) {
  canvas.width = Math.round(WORLD_WIDTH * pixelRatio);
  canvas.height = Math.round(WORLD_HEIGHT * pixelRatio);
  const context = canvas.getContext('2d')!;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return context;
}

function BreakoutGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createBreakoutSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const gameRef = useRef<Breakout>(null as unknown as Breakout);
  if (!gameRef.current) {
    gameRef.current = new Breakout((Math.random() * 0xffffffff) >>> 0);
    if (initialSave) gameRef.current.restore(initialSave.level, initialSave.score, initialSave.lives, Uint8Array.from(initialSave.bricks));
  }
  const readViews = useMemo(() => createMemoryViews(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brickCanvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLElement>(null);
  const livesRef = useRef<HTMLElement>(null);
  const levelRef = useRef<HTMLElement>(null);
  const toastRef = useRef<HTMLParagraphElement>(null);
  // React state only for things that change rarely (overlays); per-frame values go straight to the canvas / DOM text.
  const [phase, setPhase] = useState<Phase>(Phase.Serving);
  const [isPaused, setIsPaused] = useState(initialSave !== null);
  const [wasRestored, setWasRestored] = useState(initialSave !== null);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const keysRef = useRef({ left: false, right: false });

  // Saves happen only when play stops (pause, tab hidden, leaving, a life lost, a level cleared): never mid-rally.
  const saveProgress = useCallback(() => {
    const game = gameRef.current;
    if (game.phase() === Phase.GameOver) { saveSlot.clear(); return; }
    saveSlot.save({ level: game.level(), score: game.score(), lives: game.lives(), bricks: Array.from(readViews().bricks) });
  }, [readViews, saveSlot]);

  useEffect(() => () => { saveProgress(); gameRef.current.free(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/perf-breakout.mjs (only with ?breakoutTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('breakoutTest')) return;
    const testWindow = window as unknown as { __breakoutTest?: unknown };
    testWindow.__breakoutTest = { game: gameRef.current, views: readViews };
    return () => { delete testWindow.__breakoutTest; };
  }, [readViews]);

  const pause = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress();
  }, [saveProgress]);

  const resume = useCallback(() => {
    primeAudio();
    setWasRestored(false);
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const context = sizeCanvas(canvasRef.current!, pixelRatio);
    const brickContext = sizeCanvas(brickCanvasRef.current!, pixelRatio);
    context.font = 'bold 12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const drawnBricks = new Uint8Array(BRICK_COUNT).fill(255); // 255 = never drawn
    let drawnBricksVersion = -1;
    // Rectangles drawn last frame (x, y, width, height); only these are cleared, not the whole canvas.
    const dirtyRects = new Float32Array(4 * 8);
    let dirtyCount = 0;
    const markDirty = (x: number, y: number, width: number, height: number) => {
      const offset = dirtyCount * 4;
      dirtyRects[offset] = x; dirtyRects[offset + 1] = y; dirtyRects[offset + 2] = width; dirtyRects[offset + 3] = height;
      dirtyCount++;
    };
    let lastScore = -1, lastLives = -1, lastLevel = -1, lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    let toastTimer = 0;

    const draw = () => {
      const { render, bricks } = readViews();
      if (render[RenderSlot.bricksVersion] !== drawnBricksVersion) { drawnBricksVersion = render[RenderSlot.bricksVersion]; updateBricks(brickContext, bricks, drawnBricks); }
      for (let index = 0; index < dirtyCount; index++) {
        const offset = index * 4;
        context.clearRect(dirtyRects[offset], dirtyRects[offset + 1], dirtyRects[offset + 2], dirtyRects[offset + 3]);
      }
      dirtyCount = 0;
      // paddle
      const paddleX = render[RenderSlot.paddleX], paddleWidth = render[RenderSlot.paddleWidth];
      context.fillStyle = render[RenderSlot.wideSeconds] > 0 ? '#4cc9f0' : '#e9ecef';
      context.beginPath();
      context.roundRect(paddleX - paddleWidth / 2, PADDLE_Y, paddleWidth, PADDLE_HEIGHT, 6);
      context.fill();
      markDirty(paddleX - paddleWidth / 2 - 2, PADDLE_Y - 2, paddleWidth + 4, PADDLE_HEIGHT + 4);
      // balls
      context.fillStyle = '#ffffff';
      for (let index = 0; index < render[RenderSlot.ballCount]; index++) {
        const x = render[RenderSlot.balls + index * 2], y = render[RenderSlot.balls + index * 2 + 1];
        context.beginPath();
        context.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
        context.fill();
        markDirty(x - BALL_RADIUS - 2, y - BALL_RADIUS - 2, BALL_RADIUS * 2 + 4, BALL_RADIUS * 2 + 4);
      }
      // falling power-ups
      for (let index = 0; index < render[RenderSlot.powerUpCount]; index++) {
        const x = render[RenderSlot.powerUps + index * 3], y = render[RenderSlot.powerUps + index * 3 + 1], kind = render[RenderSlot.powerUps + index * 3 + 2];
        context.fillStyle = POWER_UP_COLORS[kind];
        context.beginPath();
        context.roundRect(x - 14, y - 8, 28, 16, 8);
        context.fill();
        context.fillStyle = '#111';
        context.fillText(POWER_UP_LABELS[kind], x, y + 1);
        markDirty(x - 16, y - 10, 32, 20);
      }
      // numbers: only touch the DOM when they change
      const score = render[RenderSlot.score], lives = render[RenderSlot.lives], level = render[RenderSlot.level], currentPhase = render[RenderSlot.phase];
      if (score !== lastScore && scoreRef.current) { lastScore = score; scoreRef.current.textContent = String(score); }
      if (lives !== lastLives && livesRef.current) { lastLives = lives; livesRef.current.textContent = '♥'.repeat(lives); }
      if (level !== lastLevel && levelRef.current) { lastLevel = level; levelRef.current.textContent = String(level); }
      if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
    };

    const showToast = (text: string) => {
      const toast = toastRef.current;
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
    };

    const handleEvents = (events: number) => {
      const game = gameRef.current;
      const muted = isMutedRef.current;
      if (events & Events.levelCleared) playLimited('levelCleared', muted);
      else if (events & Events.lifeLost) playLimited('lifeLost', muted);
      else if (events & Events.powerUp) playLimited('powerUp', muted);
      else if (events & Events.brickBroken) playLimited('brick', muted);
      else if (events & Events.brickHit) playLimited('tough', muted);
      else if (events & Events.steelHit) playLimited('steel', muted);
      else if (events & Events.paddle) playLimited('paddle', muted);
      else if (events & Events.wall) playLimited('wall', muted);
      if (events & Events.freeRelaunch) showToast('The screen froze for a moment — ball back, no life lost');
      // play has stopped (ball on the paddle or level done): a good moment to save, just after this frame
      if (events & (Events.lifeLost | Events.levelCleared | Events.freeRelaunch)) window.setTimeout(saveProgress, 0);
      if (events & (Events.gameOver | Events.levelCleared)) {
        const score = game.score();
        setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
        if (events & Events.gameOver) saveSlot.clear();
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // always keep the loop alive, even if this frame throws
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      try {
        const game = gameRef.current;
        const keys = keysRef.current;
        game.set_paddle_direction(keys.left === keys.right ? 0 : keys.left ? -1 : 1);
        const events = game.advance(seconds); // the wasm side drops hitches and caps slow frames
        if (events) handleEvents(events);
        draw();
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Breakout frame failed', error); }
      }
    };
    draw();
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(toastTimer); };
  }, [isMutedRef, readViews, saveProgress, saveSlot]);

  // Pause when the tab is hidden or the window loses focus; save right away.
  useEffect(() => {
    const handleHide = () => { if (document.hidden) pause(); };
    const handleBlur = () => pause();
    const handlePageHide = () => saveProgress();
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => { document.removeEventListener('visibilitychange', handleHide); window.removeEventListener('blur', handleBlur); window.removeEventListener('pagehide', handlePageHide); };
  }, [pause, saveProgress]);

  const launchOrAdvance = useCallback(() => {
    primeAudio();
    const game = gameRef.current;
    if (isPausedRef.current) { resume(); return; }
    if (game.phase() === Phase.Serving) game.launch();
    else if (game.phase() === Phase.LevelCleared) { game.next_level(); saveProgress(); }
    else if (game.phase() === Phase.GameOver) { game.restart(); saveSlot.clear(); }
  }, [resume, saveProgress, saveSlot]);
  const launchOrAdvanceRef = useRef(launchOrAdvance);
  launchOrAdvanceRef.current = launchOrAdvance;

  // The first touch or key anywhere creates the audio context, before the ball is in play.
  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', prime, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', prime, { capture: true }); window.removeEventListener('keydown', prime, { capture: true }); };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent, isDown: boolean) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') { keysRef.current.left = isDown; gameRef.current.set_paddle_target(-1); event.preventDefault(); }
      else if (key === 'arrowright' || key === 'd') { keysRef.current.right = isDown; gameRef.current.set_paddle_target(-1); event.preventDefault(); }
      else if (isDown && (key === ' ' || key === 'enter')) { event.preventDefault(); launchOrAdvance(); }
      else if (isDown && (key === 'p' || key === 'escape')) { if (isPausedRef.current) resume(); else pause(); }
      else if (isDown && key === 'm') toggleMute();
    };
    const handleDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleUp = (event: KeyboardEvent) => handleKey(event, false);
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [launchOrAdvance, pause, resume, toggleMute]);

  // Pointer / touch: native passive listeners straight into the wasm paddle target (no React events, no state).
  // The canvas box is measured on resize/scroll, not per move (reading layout per move can force a layout pass).
  useEffect(() => {
    const canvas = canvasRef.current!;
    let box = canvas.getBoundingClientRect();
    const measure = () => { box = canvas.getBoundingClientRect(); };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvas);
    window.addEventListener('scroll', measure, { passive: true });
    const toWorldX = (clientX: number) => ((clientX - box.left) / box.width) * WORLD_WIDTH;
    const handleMove = (event: PointerEvent) => {
      // the latest position is all the paddle needs, so coalesced events are not walked
      if (event.pointerType === 'mouse' || event.buttons) gameRef.current.set_paddle_target(toWorldX(event.clientX));
    };
    const handleDown = (event: PointerEvent) => {
      try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic or already released pointer */ }
      measure();
      gameRef.current.set_paddle_target(toWorldX(event.clientX));
      if (isPausedRef.current || gameRef.current.phase() !== Phase.Playing) launchOrAdvanceRef.current();
    };
    canvas.addEventListener('pointermove', handleMove, { passive: true });
    canvas.addEventListener('pointerdown', handleDown, { passive: true });
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', measure);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleDown);
    };
  }, []);

  const game = gameRef.current;
  return (
    <div className="game-shell breakout" data-testid="breakout" data-phase={phase} data-paused={isPaused}>
      <div className="game-shell__header">
        <div className="game-shell__stats">
          <div className="game-stat"><span>Score</span><b ref={scoreRef} data-testid="breakout-score">{game.score()}</b></div>
          <div className="game-stat"><span>Level</span><b ref={levelRef} data-testid="breakout-level">{game.level()}</b></div>
          <div className="game-stat"><span>Lives</span><b ref={livesRef} className="breakout-lives" data-testid="breakout-lives">{'♥'.repeat(game.lives())}</b></div>
          <div className="game-stat"><span>Best</span><b>{bestScore}</b></div>
        </div>
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="breakout-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="breakout-stage">
        <canvas ref={brickCanvasRef} className="breakout-canvas breakout-canvas--bricks" aria-hidden="true" />
        <canvas ref={canvasRef} className="breakout-canvas" data-testid="breakout-canvas" aria-label="Breakout playfield" />
        <p ref={toastRef} className="breakout-toast" data-testid="breakout-toast" role="status" />
        {(isPaused || phase !== Phase.Playing) && (
          <button type="button" className="breakout-overlay" onClick={launchOrAdvance} data-testid="breakout-overlay">
            {isPaused ? <><b>Paused</b>{wasRestored && <span data-testid="restored">💾 Saved game restored</span>}<span>Tap or press Space to resume</span></>
              : phase === Phase.Serving ? <span className="breakout-overlay__hint">Tap or press Space to launch</span>
              : phase === Phase.LevelCleared ? <><b>Level {game.level()} cleared!</b><span>Tap for level {game.level() + 1}</span></>
              : <><b>Game over</b><span>Score {game.score()} · tap to play again</span></>}
          </button>
        )}
      </div>
      <p className="game-help">Move with the mouse, a finger or ←/→. Power-ups: W wider paddle, M multi-ball, S slower ball, + extra life. P pauses.</p>
    </div>
  );
}
