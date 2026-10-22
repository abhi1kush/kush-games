import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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

const sounds = {
  paddle: (muted: boolean) => playSound({ tones: [{ frequency: 330, durationSeconds: 0.06, volume: 0.05, type: 'square' }] }, muted),
  wall: (muted: boolean) => playSound({ tones: [{ frequency: 220, durationSeconds: 0.04, volume: 0.03, type: 'square' }] }, muted),
  brick: (muted: boolean) => playSound({ tones: [{ frequency: 660, durationSeconds: 0.07, volume: 0.05, type: 'square' }] }, muted),
  tough: (muted: boolean) => playSound({ tones: [{ frequency: 440, durationSeconds: 0.06, volume: 0.04, type: 'triangle' }] }, muted),
  steel: (muted: boolean) => playSound({ tones: [{ frequency: 1200, durationSeconds: 0.05, volume: 0.03, type: 'sine' }] }, muted),
  powerUp: (muted: boolean) => playSound({ tones: [523, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.12, startSeconds: index * 0.06, volume: 0.05 })) }, muted),
  lifeLost: (muted: boolean) => playSound({ tones: [{ frequency: 300, endFrequency: 90, durationSeconds: 0.45, volume: 0.07, type: 'sawtooth' }] }, muted),
  levelCleared: (muted: boolean) => playSound({ tones: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: 0.2, startSeconds: index * 0.1, volume: 0.06 })) }, muted),
};

export default function BreakoutScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadBreakoutEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="breakout-loading"><p className="game-help">Loading…</p></div>;
  return <BreakoutGame memory={memory} />;
}

/** Bricks change rarely, so they're drawn onto an offscreen canvas and copied each frame. */
function drawBricks(context: CanvasRenderingContext2D, bricks: Uint8Array) {
  context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  for (let index = 0; index < bricks.length; index++) {
    const hits = bricks[index];
    if (!hits) continue;
    const column = index % BRICK_COLUMNS, row = Math.floor(index / BRICK_COLUMNS);
    const left = BRICKS_LEFT + column * (BRICK_WIDTH + BRICK_GAP), top = BRICKS_TOP + row * (BRICK_HEIGHT + BRICK_GAP);
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
  const scoreRef = useRef<HTMLElement>(null);
  const livesRef = useRef<HTMLElement>(null);
  const levelRef = useRef<HTMLElement>(null);
  // React state only for things that change rarely (overlays); per-frame values go straight to the canvas / DOM text.
  const [phase, setPhase] = useState<Phase>(Phase.Serving);
  const [isPaused, setIsPaused] = useState(initialSave !== null);
  const [wasRestored, setWasRestored] = useState(initialSave !== null);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const keysRef = useRef({ left: false, right: false });
  useEffect(() => () => gameRef.current.free(), []);

  const saveProgress = useCallback((immediately = false) => {
    const game = gameRef.current;
    if (game.phase() === Phase.GameOver) { saveSlot.clear(); return; }
    const data = { level: game.level(), score: game.score(), lives: game.lives(), bricks: Array.from(game.bricks()) };
    if (immediately) saveSlot.save(data); else saveSlot.saveThrottled(data);
  }, [saveSlot]);

  const pause = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress(true);
  }, [saveProgress]);

  const resume = useCallback(() => {
    unlockAudio();
    setWasRestored(false);
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_WIDTH * pixelRatio;
    canvas.height = WORLD_HEIGHT * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const brickLayer = document.createElement('canvas');
    brickLayer.width = WORLD_WIDTH * pixelRatio;
    brickLayer.height = WORLD_HEIGHT * pixelRatio;
    const brickContext = brickLayer.getContext('2d')!;
    brickContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    let drawnBricksVersion = -1;
    let lastScore = -1, lastLives = -1, lastLevel = -1, lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;

    const draw = () => {
      const { render, bricks } = readViews();
      if (render[RenderSlot.bricksVersion] !== drawnBricksVersion) { drawnBricksVersion = render[RenderSlot.bricksVersion]; drawBricks(brickContext, bricks); }
      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      context.drawImage(brickLayer, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      // paddle
      const paddleX = render[RenderSlot.paddleX], paddleWidth = render[RenderSlot.paddleWidth];
      context.fillStyle = render[RenderSlot.wideSeconds] > 0 ? '#4cc9f0' : '#e9ecef';
      context.beginPath();
      context.roundRect(paddleX - paddleWidth / 2, PADDLE_Y, paddleWidth, PADDLE_HEIGHT, 6);
      context.fill();
      // balls
      context.fillStyle = '#ffffff';
      for (let index = 0; index < render[RenderSlot.ballCount]; index++) {
        context.beginPath();
        context.arc(render[RenderSlot.balls + index * 2], render[RenderSlot.balls + index * 2 + 1], BALL_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
      // falling power-ups
      context.font = 'bold 12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (let index = 0; index < render[RenderSlot.powerUpCount]; index++) {
        const x = render[RenderSlot.powerUps + index * 3], y = render[RenderSlot.powerUps + index * 3 + 1], kind = render[RenderSlot.powerUps + index * 3 + 2];
        context.fillStyle = POWER_UP_COLORS[kind];
        context.beginPath();
        context.roundRect(x - 14, y - 8, 28, 16, 8);
        context.fill();
        context.fillStyle = '#111';
        context.fillText(POWER_UP_LABELS[kind], x, y + 1);
      }
      // numbers: only touch the DOM when they change
      const score = render[RenderSlot.score], lives = render[RenderSlot.lives], level = render[RenderSlot.level], currentPhase = render[RenderSlot.phase];
      if (score !== lastScore && scoreRef.current) { lastScore = score; scoreRef.current.textContent = String(score); }
      if (lives !== lastLives && livesRef.current) { lastLives = lives; livesRef.current.textContent = '♥'.repeat(lives); }
      if (level !== lastLevel && levelRef.current) { lastLevel = level; levelRef.current.textContent = String(level); }
      if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      const game = gameRef.current;
      game.set_paddle_direction(keysRef.current.left === keysRef.current.right ? 0 : keysRef.current.left ? -1 : 1);
      const events = game.advance(seconds);
      if (events) {
        const muted = isMutedRef.current;
        if (events & Events.levelCleared) sounds.levelCleared(muted);
        else if (events & Events.lifeLost) sounds.lifeLost(muted);
        else if (events & Events.powerUp) sounds.powerUp(muted);
        else if (events & Events.brickBroken) sounds.brick(muted);
        else if (events & Events.brickHit) sounds.tough(muted);
        else if (events & Events.steelHit) sounds.steel(muted);
        else if (events & Events.paddle) sounds.paddle(muted);
        else if (events & Events.wall) sounds.wall(muted);
        if (events & (Events.brickHit | Events.brickBroken | Events.lifeLost | Events.levelCleared)) saveProgress(events & (Events.lifeLost | Events.levelCleared) ? true : false);
        if (events & (Events.gameOver | Events.levelCleared)) {
          const score = game.score();
          setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
          if (events & Events.gameOver) saveSlot.clear();
        }
      }
      draw();
    };
    draw();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isMutedRef, readViews, saveProgress, saveSlot]);

  // Pause when the tab is hidden or the window loses focus; save right away.
  useEffect(() => {
    const handleHide = () => { if (document.hidden) pause(); };
    const handleBlur = () => pause();
    const handlePageHide = () => saveProgress(true);
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => { document.removeEventListener('visibilitychange', handleHide); window.removeEventListener('blur', handleBlur); window.removeEventListener('pagehide', handlePageHide); };
  }, [pause, saveProgress]);

  const launchOrAdvance = useCallback(() => {
    unlockAudio();
    const game = gameRef.current;
    if (isPausedRef.current) { resume(); return; }
    if (game.phase() === Phase.Serving) game.launch();
    else if (game.phase() === Phase.LevelCleared) { game.next_level(); saveProgress(true); }
    else if (game.phase() === Phase.GameOver) { game.restart(); saveSlot.clear(); }
  }, [resume, saveProgress, saveSlot]);

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

  const pointerToWorldX = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - box.left) / box.width) * WORLD_WIDTH;
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' || event.buttons) gameRef.current.set_paddle_target(pointerToWorldX(event));
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gameRef.current.set_paddle_target(pointerToWorldX(event));
    if (isPausedRef.current || gameRef.current.phase() !== Phase.Playing) launchOrAdvance();
  };

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
        <canvas ref={canvasRef} className="breakout-canvas" data-testid="breakout-canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          aria-label="Breakout playfield" />
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
