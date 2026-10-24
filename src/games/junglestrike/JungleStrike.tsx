import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import {
  BACKDROP_WIDTH, CANOPY_WIDTH, createBackdrop, createCanopy, createTerrainSprites, drawBullet, drawBushSniper, drawCheckpoint, drawEnemyBullet, drawEntity,
  drawHero, drawMedal, drawParticle, drawTiled, drawWater, type TerrainSprites,
} from './art';
import {
  BOSS_WALL_X, Buttons, CHECKPOINT_X, createMemoryViews, EntityKind, Events, GROUND_TOP, JungleStrike, LEVEL_END, loadJungleStrikeEngine, MAX_VIEW_WIDTH,
  MIN_VIEW_WIDTH, type MemoryViews, Phase, PLATFORM_COUNT, PlatformKind, Pose, RenderSlot, WATER_SURFACE_Y, Weapon, WEAPON_LETTERS, WEAPON_NAMES, WORLD_HEIGHT,
} from './engine';
import { createJungleStrikeSaveSlot } from './save';
import { playLimited, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import './junglestrike.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-jungle-strike-best';
const WATER_LEFT = 700;
const WATER_RIGHT = 1290;

export default function JungleStrikeScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadJungleStrikeEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="jungle-strike-loading"><p className="game-help">Loading…</p></div>;
  return <JungleStrikeGame memory={memory} />;
}

/** Which keys do what. Returns the button bit, or 0. */
function buttonForKey(key: string): number {
  switch (key) {
    case 'arrowleft': case 'a': return Buttons.left;
    case 'arrowright': case 'd': return Buttons.right;
    case 'arrowup': case 'w': return Buttons.up;
    case 'arrowdown': case 's': return Buttons.down;
    case 'z': case 'j': case ' ': return Buttons.jump;
    case 'x': case 'k': return Buttons.fire;
    default: return 0;
  }
}

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.heroDown, 'heroDown'], [Events.stageClear, 'stageClear'], [Events.gameOver, 'gameOver'], [Events.powerUp, 'powerUp'], [Events.checkpoint, 'checkpoint'],
  [Events.bossDown, 'bigExplosion'], [Events.bridgeBlast, 'bridgeBlast'], [Events.explosion, 'explosion'], [Events.capsuleOpen, 'capsuleOpen'],
  [Events.bossHit, 'bossHit'], [Events.enemyHit, 'enemyHit'], [Events.laser, 'laser'], [Events.shoot, 'shoot'], [Events.jump, 'jump'], [Events.splash, 'splash'],
  [Events.enemyShoot, 'enemyShoot'],
];

/** Everything the renderer keeps between frames (sprites for the current screen size, cached HUD text). */
interface Renderer {
  context: CanvasRenderingContext2D;
  pixelsPerUnit: number;
  viewWidth: number;
  backdrop: HTMLCanvasElement;
  canopy: HTMLCanvasElement;
  terrain: TerrainSprites;
  shownScore: number;
  scoreText: string;
}

function drawParallax(context: CanvasRenderingContext2D, image: HTMLCanvasElement, widthUnits: number, cameraX: number, factor: number, scale: number) {
  const widthPixels = widthUnits * scale;
  let x = -((cameraX * factor * scale) % widthPixels);
  for (; x < context.canvas.width; x += widthPixels) context.drawImage(image, Math.floor(x), 0, Math.ceil(widthPixels) + 1, context.canvas.height);
}

/** Draw one frame from the wasm render buffer. Only on-screen things are drawn; scenery is pre-rendered. */
function drawFrame(renderer: Renderer, views: MemoryViews, clock: number) {
  const { context, pixelsPerUnit: scale, viewWidth, terrain } = renderer;
  const { render, platforms } = views;
  const cameraX = render[RenderSlot.cameraX];
  const phase = render[RenderSlot.phase] as Phase;
  const isBossDown = phase === Phase.BossDown || phase === Phase.Cleared;
  context.setTransform(1, 0, 0, 1, 0, 0);
  drawParallax(context, renderer.backdrop, BACKDROP_WIDTH, cameraX, 0.25, scale);
  drawParallax(context, renderer.canopy, CANOPY_WIDTH, cameraX, 0.55, scale);

  context.setTransform(scale, 0, 0, scale, -cameraX * scale, 0);
  const viewRight = cameraX + viewWidth;
  if (viewRight > WATER_LEFT && cameraX < WATER_RIGHT) drawWater(context, Math.max(WATER_LEFT, cameraX - 2), Math.min(WATER_RIGHT, viewRight + 2), WATER_SURFACE_Y, clock);
  for (let index = 0; index < PLATFORM_COUNT; index++) {
    const left = platforms[index * 4], right = platforms[index * 4 + 1];
    if (right < cameraX || left > viewRight || render[RenderSlot.platformAlive + index] === 0) continue;
    const top = platforms[index * 4 + 2], kind = platforms[index * 4 + 3];
    if (kind === PlatformKind.Ground) drawTiled(context, terrain.ground, 32, left, right, top, WORLD_HEIGHT - top, cameraX, viewWidth);
    else if (kind === PlatformKind.Ledge) drawTiled(context, terrain.ledge, 32, left, right, top - 0.5, 14, cameraX, viewWidth);
    else context.drawImage(terrain.plank, left, top, 20.05, 10);
  }
  if (viewRight > CHECKPOINT_X - 20 && cameraX < CHECKPOINT_X + 20) drawCheckpoint(context, CHECKPOINT_X, GROUND_TOP, render[RenderSlot.checkpoint] === 1, clock);
  if (viewRight > BOSS_WALL_X) {
    context.drawImage(terrain.gate, BOSS_WALL_X, 40, LEVEL_END - BOSS_WALL_X, 200);
    if (isBossDown) {
      context.globalAlpha = Math.min(0.75, render[RenderSlot.phaseSeconds] / 3 + (phase === Phase.Cleared ? 0.75 : 0));
      context.fillStyle = '#0d0d0d';
      context.fillRect(BOSS_WALL_X, 40, LEVEL_END - BOSS_WALL_X, 200);
      context.globalAlpha = 1;
    }
  }

  const entityCount = render[RenderSlot.entityCount];
  for (let index = 0; index < entityCount; index++) {
    const offset = RenderSlot.entities + index * RenderSlot.entityStride;
    const kind = render[offset] as EntityKind, x = render[offset + 2];
    if (x < cameraX - 40 || x > viewRight + 40) continue;
    if (kind === EntityKind.Sniper && render[offset + 4] === 1) {
      drawBushSniper(context, x, render[offset + 3], render[offset + 5], render[offset + 1] === 1, render[offset + 6]);
      continue;
    }
    drawEntity(context, kind, render[offset + 1], x, render[offset + 3], render[offset + 4], render[offset + 5], render[offset + 6], render[offset + 7], clock, isBossDown);
  }

  const pose = render[RenderSlot.heroPose] as Pose;
  const isBlinking = render[RenderSlot.heroInvulnerable] > 0 && Math.floor(clock * 15) % 2 === 0;
  if (pose !== Pose.Hidden && !isBlinking) {
    drawHero(context, render[RenderSlot.heroX], render[RenderSlot.heroY], render[RenderSlot.heroFacing], pose, render[RenderSlot.heroAim], render[RenderSlot.heroStride],
      clock, render[RenderSlot.phaseSeconds]);
  }
  const bulletCount = render[RenderSlot.bulletCount];
  for (let index = 0; index < bulletCount; index++) {
    const offset = RenderSlot.bullets + index * RenderSlot.bulletStride;
    drawBullet(context, render[offset] as Weapon, render[offset + 1], render[offset + 2], render[offset + 3], render[offset + 4]);
  }
  const enemyBulletCount = render[RenderSlot.enemyBulletCount];
  for (let index = 0; index < enemyBulletCount; index++) {
    const offset = RenderSlot.enemyBullets + index * RenderSlot.enemyBulletStride;
    drawEnemyBullet(context, render[offset], render[offset + 1]);
  }
  const particleCount = render[RenderSlot.particleCount];
  for (let index = 0; index < particleCount; index++) {
    const offset = RenderSlot.particles + index * RenderSlot.particleStride;
    drawParticle(context, render[offset], render[offset + 1], render[offset + 2], render[offset + 3]);
  }

  // HUD (screen space): lives, weapon, score, boss health
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const lives = render[RenderSlot.lives];
  for (let life = 0; life < Math.min(lives, 6); life++) drawMedal(context, 8 + life * 9, 7);
  const weapon = render[RenderSlot.weapon] as Weapon;
  context.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
  context.textAlign = 'left';
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.fillRect(7, 20, 46, 11);
  context.fillStyle = weapon === Weapon.Rifle ? '#ffffff' : '#ffd23f';
  context.fillText(weapon === Weapon.Rifle ? 'RIFLE' : `${WEAPON_LETTERS[weapon]} ${WEAPON_NAMES[weapon].toUpperCase()}`, 10, 28.5);
  const score = render[RenderSlot.score];
  if (score !== renderer.shownScore) { renderer.shownScore = score; renderer.scoreText = `SCORE ${String(score).padStart(6, '0')}`; }
  context.textAlign = 'right';
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.fillText(renderer.scoreText, viewWidth - 7.4, 14.6);
  context.fillStyle = '#ffffff';
  context.fillText(renderer.scoreText, viewWidth - 8, 14);
  const bossHealth = render[RenderSlot.bossHealth];
  if (render[RenderSlot.bossActive] === 1 && bossHealth >= 0 && !isBossDown) {
    const barWidth = Math.min(120, viewWidth * 0.35);
    const barX = (viewWidth - barWidth) / 2;
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.fillRect(barX - 1, 7, barWidth + 2, 6);
    context.fillStyle = '#e53935';
    context.fillRect(barX, 8, barWidth * bossHealth, 4);
  }
}

function JungleStrikeGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createJungleStrikeSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const gameRef = useRef<JungleStrike>(null as unknown as JungleStrike);
  if (!gameRef.current) {
    gameRef.current = new JungleStrike();
    if (initialSave) gameRef.current.restore(initialSave.checkpoint, initialSave.lives, initialSave.score, initialSave.weapon, initialSave.continues);
  }
  const readViews = useMemo(() => createMemoryViews(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(Phase.Ready);
  const [isPaused, setIsPaused] = useState(false);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [wasRestored, setWasRestored] = useState(initialSave !== null);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(false);
  const keyButtonsRef = useRef(0);
  const touchButtonsRef = useRef(0);
  const needsDrawRef = useRef(true);
  const perfRef = useRef<{ workMilliseconds: Float64Array; frameMilliseconds: Float64Array; count: number } | null>(null);

  // Saves happen when play stops (pause, tab hidden, leaving, a life lost, the checkpoint reached), never every frame.
  const saveProgress = useCallback(() => {
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Cleared || currentPhase === Phase.BossDown) { saveSlot.clear(); return; }
    if (currentPhase === Phase.GameOver) {
      // a refresh on the game-over screen is the same as spending a continue
      if (game.continues() === 0) saveSlot.clear();
      else saveSlot.save({ checkpoint: game.checkpoint_reached(), lives: 3, score: 0, weapon: 0, continues: game.continues() - 1 });
      return;
    }
    saveSlot.save({ checkpoint: game.checkpoint_reached(), lives: Math.max(1, game.lives()), score: game.score(), weapon: game.weapon(), continues: game.continues() });
  }, [saveSlot]);

  useEffect(() => () => { saveProgress(); gameRef.current.free(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/jungle-strike.mjs (only with ?jungleStrikeTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('jungleStrikeTest')) return;
    perfRef.current = { workMilliseconds: new Float64Array(1200), frameMilliseconds: new Float64Array(1200), count: 0 };
    const testWindow = window as unknown as { __jungleStrikeTest?: unknown };
    testWindow.__jungleStrikeTest = { game: gameRef.current, views: readViews, touchButtons: touchButtonsRef, perf: perfRef.current };
    return () => { delete testWindow.__jungleStrikeTest; };
  }, [readViews]);

  const pause = useCallback(() => {
    keyButtonsRef.current = 0;
    touchButtonsRef.current = 0;
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress();
  }, [saveProgress]);
  const resume = useCallback(() => {
    primeAudio();
    isPausedRef.current = false;
    setIsPaused(false);
    setShowsPauseControls(false);
    needsDrawRef.current = true;
  }, []);

  const newGame = useCallback(() => {
    gameRef.current.restart();
    gameRef.current.start();
    saveSlot.clear();
    setWasRestored(false);
    needsDrawRef.current = true;
  }, [saveSlot]);

  /** Start, resume, continue after a game over, or play again — whatever the overlay is asking for. */
  const advanceOverlay = useCallback(() => {
    primeAudio();
    const game = gameRef.current;
    if (isPausedRef.current) { resume(); return; }
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Ready) { game.start(); setWasRestored(false); }
    else if (currentPhase === Phase.GameOver) { if (!game.continue_game()) newGame(); else window.setTimeout(saveProgress, 0); }
    else if (currentPhase === Phase.Cleared) newGame();
    needsDrawRef.current = true;
  }, [newGame, resume, saveProgress]);
  const advanceOverlayRef = useRef(advanceOverlay);
  advanceOverlayRef.current = advanceOverlay;

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d', { alpha: false })!;
    let renderer: Renderer | null = null;
    // Size the canvas to its box (device pixels, at most 2× density); sprites are rebuilt only when the scale changes.
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const box = stage.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      canvas.width = Math.round(box.width * pixelRatio);
      canvas.height = Math.round(box.height * pixelRatio);
      const pixelsPerUnit = canvas.height / WORLD_HEIGHT;
      const viewWidth = Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, canvas.width / pixelsPerUnit));
      gameRef.current.set_view_width(viewWidth);
      context.imageSmoothingEnabled = true;
      if (!renderer || Math.abs(renderer.pixelsPerUnit - pixelsPerUnit) > 0.01) {
        renderer = { context, pixelsPerUnit, viewWidth, backdrop: createBackdrop(pixelsPerUnit), canopy: createCanopy(pixelsPerUnit), terrain: createTerrainSprites(pixelsPerUnit),
          shownScore: -1, scoreText: '' };
      } else renderer.viewWidth = viewWidth;
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const handleEvents = (events: number) => {
      const muted = isMutedRef.current;
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      if (events & (Events.checkpoint | Events.lifeLost | Events.gameOver)) window.setTimeout(saveProgress, 0);
      if (events & (Events.gameOver | Events.stageClear)) {
        if (events & Events.stageClear) saveSlot.clear();
        const score = gameRef.current.score();
        setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
      }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current;
        game.set_input(keyButtonsRef.current | touchButtonsRef.current);
        const events = game.advance(seconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        if (events) handleEvents(events);
        const views = readViews();
        const currentPhase = views.render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); needsDrawRef.current = true; }
        // nothing moves on the start / game-over / clear screens: draw once, then idle
        const isStill = (currentPhase === Phase.Ready || currentPhase === Phase.GameOver || currentPhase === Phase.Cleared) && views.render[RenderSlot.particleCount] === 0;
        if (renderer && (!isStill || needsDrawRef.current)) { needsDrawRef.current = false; drawFrame(renderer, views, now / 1000); }
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = seconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Jungle Strike frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
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

  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', prime, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', prime, { capture: true }); window.removeEventListener('keydown', prime, { capture: true }); };
  }, []);

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const button = buttonForKey(key);
      if (button) {
        event.preventDefault();
        keyButtonsRef.current |= button;
        if (event.repeat) return;
        if (isPausedRef.current) return; // only P, Enter or a tap resumes, so a stray arrow key can't unpause
        if (gameRef.current.phase() === Phase.Ready) advanceOverlayRef.current();
        if (button === Buttons.jump) gameRef.current.press_jump();
        if (button === Buttons.fire) gameRef.current.press_fire();
      } else if (key === 'enter' && !event.repeat) { event.preventDefault(); advanceOverlayRef.current(); }
      else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = buttonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pause, resume, toggleMute]);

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver || phase === Phase.Cleared;
  const game = gameRef.current;
  const continuesLeft = game.continues();
  return (
    <div className="game-shell jungle-strike" data-testid="jungle-strike" data-phase={phase} data-paused={isPaused}>
      <div className="jungle-strike__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="jungle-strike-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={() => { game.restart(); saveSlot.clear(); setWasRestored(false); needsDrawRef.current = true; }} data-testid="jungle-strike-restart">Restart</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="jungle-strike__best">Best <b>{bestScore}</b></span>
      </div>
      <div className="jungle-strike__play">
        <div className="jungle-strike__stage" ref={stageRef}>
          <canvas ref={canvasRef} className="jungle-strike__canvas" data-testid="jungle-strike-canvas" aria-label="Jungle Strike stage"
            onPointerDown={() => { if (showsOverlay && !(phase === Phase.GameOver && !isPaused)) advanceOverlay(); }} />
          {showsOverlay && (
            <div className={`jungle-strike__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} data-testid="jungle-strike-overlay"
              onClick={phase === Phase.GameOver && !isPaused ? undefined : advanceOverlay} role="presentation">
              {isPaused ? <>
                  <b>Paused</b><span>Tap or press P to resume</span>
                  <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="jungle-strike-controls-toggle" />
                  {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="jungle-strike-pause-controls" />}
                </>
                : phase === Phase.Ready ? <>
                  <b className="jungle-strike__title">JUNGLE STRIKE</b>
                  <span>Stage 1 · Green Hell Ridge · ♥×{game.lives()}{game.checkpoint_reached() ? ' · from the checkpoint' : ''}</span>
                  {wasRestored && <span className="jungle-strike__restored" data-testid="restored">💾 Saved progress restored</span>}
                  <ControlsPanel guide={CONTROLS_GUIDE} testId="jungle-strike-controls" />
                  <span className="jungle-strike__hint">Press any key or tap to start</span>
                </>
                : phase === Phase.Cleared ? <>
                  <b>Stage clear!</b>
                  <span data-testid="jungle-strike-final-score">Score {game.score()} · Best {Math.max(bestScore, game.score())}</span>
                  <span className="jungle-strike__hint">Tap to play again</span>
                </>
                : <>
                  <b>Game over</b>
                  <span>Score {game.score()}</span>
                  <div className="jungle-strike__choices">
                    {continuesLeft > 0 && <button type="button" className="game-button game-button--primary" onClick={advanceOverlay} data-testid="jungle-strike-continue">
                      Continue ({continuesLeft} left)</button>}
                    <button type="button" className="game-button" onClick={newGame} data-testid="jungle-strike-new-game">New game</button>
                  </div>
                </>}
            </div>
          )}
        </div>
        <TouchControls buttonsRef={touchButtonsRef} onPress={button => {
          const currentPhase = gameRef.current.phase() as Phase;
          if (isPausedRef.current || currentPhase === Phase.Ready) { advanceOverlayRef.current(); }
          if (button === Buttons.jump) gameRef.current.press_jump();
          if (button === Buttons.fire) gameRef.current.press_fire();
        }} />
      </div>
      <p className="game-help">←→↑↓ or WASD move and aim (8 ways; ↓ standing = lie flat) · Z/J/Space jump (↓+jump drops off a ledge) · X/K fire (hold for auto) · P pause · M mute.
        Shoot the flying capsules for R rapid, S spread or L laser.</p>
    </div>
  );
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '↑', '→', '↓'], label: 'Move · aim 8 ways (WASD)' },
    { keys: ['Z', '/', 'J'], label: 'Jump' },
    { keys: ['X', '/', 'K'], label: 'Fire · hold to auto-fire' },
    { keys: ['↓'], label: 'Lie flat (standing still)' },
    { keys: ['↓', '+', 'Z'], label: 'Drop through a ledge' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'stick', leftLabel: 'Move · aim', buttons: [{ name: 'JUMP', label: 'Jump', color: 'rgba(79,188,156,0.6)' }, { name: 'FIRE', label: 'Hold to fire', color: 'rgba(229,57,53,0.65)' }] },
  touchTips: ['Stick ↓ = lie flat', '↓ + JUMP drops through a ledge'],
  weapons: [{ letter: 'R', name: 'Rapid', color: '#4fc3f7' }, { letter: 'S', name: 'Spread', color: '#ff7043' }, { letter: 'L', name: 'Laser', color: '#b388ff' }],
};

const DIRECTION_BITS = [Buttons.right, Buttons.right | Buttons.down, Buttons.down, Buttons.down | Buttons.left, Buttons.left, Buttons.left | Buttons.up, Buttons.up, Buttons.up | Buttons.right];
const STICK_BITS = Buttons.left | Buttons.right | Buttons.up | Buttons.down;

/**
 * On-screen controls for phones: an 8-way stick (drag a thumb anywhere on the pad) plus JUMP and FIRE.
 * Native pointer events, several fingers at once; held buttons go straight into a ref the game loop reads.
 */
function TouchControls({ buttonsRef, onPress }: { buttonsRef: React.MutableRefObject<number>; onPress: (button: number) => void }) {
  const stickPointer = useRef<number | null>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const updateStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const radius = box.width / 2;
    let dx = event.clientX - (box.left + radius), dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy);
    let bits = 0;
    if (distance > radius * 0.22) {
      const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      bits = DIRECTION_BITS[(sector + 8) % 8];
    }
    buttonsRef.current = (buttonsRef.current & ~STICK_BITS) | bits;
    if (distance > radius * 0.6) { dx *= (radius * 0.6) / distance; dy *= (radius * 0.6) / distance; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  };
  const releaseStick = () => {
    stickPointer.current = null;
    buttonsRef.current &= ~STICK_BITS;
    if (knobRef.current) knobRef.current.style.transform = '';
  };
  const holdButton = (button: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      buttonsRef.current |= button;
      onPress(button);
    },
    onPointerUp: () => { buttonsRef.current &= ~button; },
    onPointerCancel: () => { buttonsRef.current &= ~button; },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });
  return (
    <div className="jungle-strike__touch" data-testid="jungle-strike-touch">
      <div className="jungle-strike__stick" data-testid="touch-stick" role="group" aria-label="Move and aim"
        onPointerDown={event => {
          event.preventDefault();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
          stickPointer.current = event.pointerId;
          updateStick(event);
          onPress(0);
        }}
        onPointerMove={event => { if (stickPointer.current === event.pointerId) updateStick(event); }}
        onPointerUp={event => { if (stickPointer.current === event.pointerId) releaseStick(); }}
        onPointerCancel={releaseStick}
        onContextMenu={event => event.preventDefault()}>
        <span className="jungle-strike__knob" ref={knobRef} />
      </div>
      <div className="jungle-strike__actions">
        <button type="button" className="jungle-strike__key jungle-strike__key--jump" data-testid="touch-jump" aria-label="Jump" {...holdButton(Buttons.jump)}>JUMP</button>
        <button type="button" className="jungle-strike__key jungle-strike__key--fire" data-testid="touch-fire" aria-label="Fire" {...holdButton(Buttons.fire)}>FIRE</button>
      </div>
    </div>
  );
}
