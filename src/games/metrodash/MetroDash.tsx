import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import { ShareGameButton } from '../ShareGameButton';
import { createSprites, type Sprites } from './art';
import { CrashReason, createRenderView, EntityKind, Events, HOVERBOARD_SECONDS, loadMetroDashEngine, MAGNET_SECONDS, MetroDash, MILESTONE_METRES, MULTIPLIER_SECONDS, Phase, RenderSlot, SNEAKERS_SECONDS } from './engine';
import { createMetroDashSaveSlot } from './save';
import { addPopup, addSparkles, createScene, drawScene, type Scene } from './scene';
import { playCoin, playLimited, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import '../online/online.css';
import './metrodash.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-metro-dash-best';
const GAME_ID = 'metro-dash';
const GAME_NAME = 'Metro Dash';
/** Canvas pixels per CSS pixel, at most (keeps the fill cost low on phones with very dense screens). */
const MAX_PIXEL_RATIO = 1.5;

export default function MetroDashScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadMetroDashEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="metro-loading"><p className="game-help">Loading…</p></div>;
  return <MetroDashGame memory={memory} />;
}

type Move = 'left' | 'right' | 'up' | 'down';
function moveForKey(key: string): Move | null {
  switch (key) {
    case 'arrowleft': case 'a': return 'left';
    case 'arrowright': case 'd': return 'right';
    case 'arrowup': case 'w': case ' ': return 'up';
    case 'arrowdown': case 's': return 'down';
    default: return null;
  }
}

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.gameOver, 'gameOver'], [Events.caught, 'caught'], [Events.crash, 'crash'], [Events.hoverboardBreak, 'hoverboardBreak'], [Events.stumble, 'stumble'],
  [Events.powerUp, 'powerUp'], [Events.powerUpEnd, 'powerUpEnd'], [Events.milestone, 'milestone'], [Events.streak, 'streak'], [Events.superJump, 'superJump'],
  [Events.jump, 'jump'], [Events.roll, 'roll'], [Events.ramp, 'ramp'], [Events.land, 'land'], [Events.lane, 'lane'], [Events.laneBump, 'bump'],
];
const POWER_UP_NAMES: Record<number, string> = {
  [EntityKind.Magnet]: 'Coin magnet!', [EntityKind.Sneakers]: 'Super sneakers!', [EntityKind.Multiplier]: 'Double score!', [EntityKind.Hoverboard]: 'Hoverboard!',
};
const POWER_UPS = [
  { slot: RenderSlot.magnetSeconds, full: MAGNET_SECONDS, icon: '🧲', label: 'Magnet', testId: 'metro-magnet' },
  { slot: RenderSlot.sneakersSeconds, full: SNEAKERS_SECONDS, icon: '👟', label: 'Super sneakers', testId: 'metro-sneakers' },
  { slot: RenderSlot.multiplierSeconds, full: MULTIPLIER_SECONDS, icon: '2×', label: 'Double score', testId: 'metro-multiplier' },
  { slot: RenderSlot.hoverboardSeconds, full: HOVERBOARD_SECONDS, icon: '🛹', label: 'Hoverboard', testId: 'metro-hoverboard' },
] as const;

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

function MetroDashGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createMetroDashSaveSlot(), []);
  const gameRef = useRef<MetroDash>(null as unknown as MetroDash);
  const restoredRef = useRef<boolean | null>(null);
  if (!gameRef.current) {
    gameRef.current = new MetroDash(randomSeed());
    const saved = saveSlot.load();
    restoredRef.current = saved !== null && gameRef.current.restore(Uint8Array.from(saved.bytes));
    if (saved && !restoredRef.current) saveSlot.clear();
  }
  const readRender = useMemo(() => createRenderView(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(() => gameRef.current.phase() as Phase);
  // a run restored after a refresh waits, paused, exactly where it was
  const [isPaused, setIsPaused] = useState(() => restoredRef.current === true);
  const isPausedRef = useRef(restoredRef.current === true);
  const [wasRestored, setWasRestored] = useState(() => restoredRef.current === true);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const needsDrawRef = useRef(true);
  const sceneRef = useRef<Scene | null>(null);
  /** test-only frame log: work and frame times */
  const perfRef = useRef<{ workMilliseconds: Float64Array; frameMilliseconds: Float64Array; count: number } | null>(null);
  const hud = {
    score: useRef<HTMLElement>(null), distance: useRef<HTMLElement>(null), coins: useRef<HTMLElement>(null), multiplier: useRef<HTMLElement>(null),
    toast: useRef<HTMLDivElement>(null), powerUps: useRef<(HTMLElement | null)[]>([]), bars: useRef<(HTMLElement | null)[]>([]),
  };

  const recordBest = useCallback((score: number) => {
    setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
  }, []);

  // Saves happen when play stops (pause, tab hidden, leaving), never every frame.
  const saveProgress = useCallback(() => {
    const game = gameRef.current;
    recordBest(game.score());
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Playing) saveSlot.save({ bytes: Array.from(game.save()) });
    else if (currentPhase !== Phase.Ready) saveSlot.clear();
  }, [recordBest, saveSlot]);

  // Free the wasm game when the screen goes away (deferred, so React's development double-mount doesn't free it early).
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      saveProgress();
      isMountedRef.current = false;
      window.setTimeout(() => { if (!isMountedRef.current) gameRef.current.free(); }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/metro-dash.mjs (only with ?metroTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('metroTest')) return;
    perfRef.current = { workMilliseconds: new Float64Array(2400), frameMilliseconds: new Float64Array(2400), count: 0 };
    const testWindow = window as unknown as { __metroTest?: unknown };
    testWindow.__metroTest = { game: gameRef.current, render: readRender, perf: perfRef.current, scene: () => sceneRef.current };
    return () => { delete testWindow.__metroTest; };
  }, [readRender]);

  const pause = useCallback(() => {
    if (isPausedRef.current || gameRef.current.phase() !== Phase.Playing) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress();
  }, [saveProgress]);
  const resume = useCallback(() => {
    primeAudio();
    isPausedRef.current = false;
    setIsPaused(false);
    setShowsPauseControls(false);
    setWasRestored(false);
    needsDrawRef.current = true;
  }, []);
  const newGame = useCallback(() => {
    primeAudio();
    gameRef.current.restart(randomSeed());
    saveSlot.clear();
    setWasRestored(false);
    if (isPausedRef.current) { isPausedRef.current = false; setIsPaused(false); setShowsPauseControls(false); }
    playLimited('start', isMutedRef.current);
    needsDrawRef.current = true;
  }, [isMutedRef, saveSlot]);

  /** Start, resume, or play again: whatever the overlay is asking for. */
  const advanceOverlay = useCallback(() => {
    primeAudio();
    if (isPausedRef.current) { resume(); return; }
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Ready) { game.start(); playLimited('start', isMutedRef.current); }
    else if (currentPhase === Phase.GameOver) newGame();
    needsDrawRef.current = true;
  }, [isMutedRef, newGame, resume]);
  const advanceOverlayRef = useRef(advanceOverlay);
  advanceOverlayRef.current = advanceOverlay;

  /** A lane switch, jump or roll from a key or a swipe. Starts the run from the start screen. */
  const move = useCallback((direction: Move) => {
    if (isPausedRef.current) return;
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Ready) { advanceOverlayRef.current(); return; }
    if (currentPhase !== Phase.Playing) return;
    if (direction === 'left') game.press_lane(-1);
    else if (direction === 'right') game.press_lane(1);
    else if (direction === 'up') game.press_jump();
    else game.press_roll();
  }, []);

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d', { alpha: false })!;
    let sprites: Sprites | null = null;
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const box = stage.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      const width = Math.round(box.width * pixelRatio), height = Math.round(box.height * pixelRatio);
      const previous = sceneRef.current;
      if (previous && previous.width === width && previous.height === height) return;
      canvas.width = width;
      canvas.height = height;
      sprites ??= createSprites();
      const scene = createScene(context, width, height, sprites);
      if (previous) { scene.cameraX = previous.cameraX; scene.cameraLift = previous.cameraLift; }
      sceneRef.current = scene;
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const shown = { score: -1, distance: -1, coins: -1, multiplier: -1, bars: [-1, -1, -1, -1] };
    let toastTimer = 0;
    const showToast = (text: string) => {
      const toast = hud.toast.current;
      if (!toast) return;
      toast.textContent = text;
      toast.classList.remove('is-showing');
      void toast.offsetWidth; // restart the animation
      toast.classList.add('is-showing');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('is-showing'), 1500);
    };
    const updateHud = (render: Float32Array) => {
      const score = render[RenderSlot.score];
      if (score !== shown.score && hud.score.current) { shown.score = score; hud.score.current.textContent = String(score); }
      const distance = Math.floor(render[RenderSlot.distance]);
      if (distance !== shown.distance && hud.distance.current) { shown.distance = distance; hud.distance.current.textContent = `${distance} m`; }
      const coins = render[RenderSlot.coins];
      if (coins !== shown.coins && hud.coins.current) { shown.coins = coins; hud.coins.current.textContent = String(coins); }
      const multiplier = render[RenderSlot.multiplier];
      if (multiplier !== shown.multiplier && hud.multiplier.current) { shown.multiplier = multiplier; hud.multiplier.current.hidden = multiplier < 2; }
      POWER_UPS.forEach((powerUp, index) => {
        const share = Math.ceil((render[powerUp.slot] / powerUp.full) * 50) / 50;
        if (share === shown.bars[index]) return;
        shown.bars[index] = share;
        const pill = hud.powerUps.current[index];
        const bar = hud.bars.current[index];
        if (pill) pill.hidden = share <= 0;
        if (bar) bar.style.transform = `scaleX(${share})`;
      });
    };
    const handleEvents = (events: number, render: Float32Array) => {
      const muted = isMutedRef.current;
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      const scene = sceneRef.current;
      const game = gameRef.current;
      if (events & Events.coin) {
        const streak = render[RenderSlot.coinStreak];
        playCoin(streak, muted);
        if (scene) { addSparkles(scene, 4, streak % 2); addPopup(scene, '+5', '#fff1b8', 0.8); }
      }
      if (events & Events.powerUp) {
        showToast(POWER_UP_NAMES[render[RenderSlot.lastPowerUp]] ?? 'Power-up!');
        if (scene) addSparkles(scene, 14, 2);
      } else if (events & Events.hoverboardBreak) { showToast('Hoverboard saved you!'); if (scene) { scene.shake = 0.7; addSparkles(scene, 12, 2); } }
      else if (events & Events.milestone) showToast(`${Math.floor(game.distance() / MILESTONE_METRES) * MILESTONE_METRES} m!`);
      else if (events & Events.streak) { const streak = render[RenderSlot.coinStreak]; showToast(`Coin streak ×${streak}`); if (scene) addPopup(scene, `×${streak}`, '#ffd68a', 1.3); }
      else if (events & Events.superJump && scene) addSparkles(scene, 8, 3);
      if (events & Events.stumble && !(events & Events.caught)) { showToast('Careful! One more and you’re caught'); if (scene) scene.shake = 0.6; }
      if (events & (Events.crash | Events.caught)) {
        if (scene) scene.shake = 1;
        recordBest(game.score());
        saveSlot.clear();
        if (navigator.vibrate) { try { navigator.vibrate(120); } catch { /* not allowed */ } }
      }
      if (events & Events.gameOver) { saveSlot.clear(); recordBest(game.score()); }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const elapsedSeconds = (now - previousTime) / 1000;
      const seconds = Math.min(0.05, elapsedSeconds);
      previousTime = now;
      const scene = sceneRef.current;
      if (isPausedRef.current) {
        if (needsDrawRef.current && scene) { needsDrawRef.current = false; const render = readRender(); drawScene(scene, render, now / 1000, 0); updateHud(render); }
        return;
      }
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current;
        const events = game.advance(elapsedSeconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        const render = readRender();
        if (events) handleEvents(events, render);
        const currentPhase = render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
        if (scene) { needsDrawRef.current = false; drawScene(scene, render, now / 1000, seconds); }
        updateHud(render);
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = elapsedSeconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Metro Dash frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); window.clearTimeout(toastTimer); };
  }, [isMutedRef, readRender, recordBest, saveSlot]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const direction = moveForKey(key);
      if (direction) {
        event.preventDefault();
        if (!event.repeat) move(direction); // one press, one move: holding a key never repeats a lane switch
      } else if (key === 'enter' && !event.repeat) {
        if ((event.target as HTMLElement | null)?.closest?.('button')) return; // Enter on a focused button clicks it
        event.preventDefault();
        advanceOverlayRef.current();
      } else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
    };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [move, pause, resume, toggleMute]);

  // Swipes anywhere in the game: a short, quick drag is enough, and it fires as soon as it passes the threshold
  // (no need to lift the finger). Keep dragging another way for a second move in the same touch.
  useEffect(() => {
    const root = rootRef.current!;
    let gesture: { pointer: number; startX: number; startY: number; startTime: number; fired: boolean } | null = null;
    const threshold = () => {
      const box = stageRef.current?.getBoundingClientRect();
      return Math.max(14, Math.min(34, Math.min(box?.width ?? 400, box?.height ?? 400) * 0.045));
    };
    const fire = (dx: number, dy: number) => {
      move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
    };
    const handleDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button, a, [data-no-swipe]')) return;
      gesture = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: performance.now(), fired: false };
    };
    const handleMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (event.pointerType === 'mouse' && event.buttons === 0) { gesture = null; return; }
      const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold()) return;
      if (event.cancelable) event.preventDefault();
      fire(dx, dy);
      gesture.fired = true;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.startTime = performance.now();
    };
    const handleUp = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
      // a quick little flick that never reached the threshold still counts
      if (!gesture.fired && Math.max(Math.abs(dx), Math.abs(dy)) >= threshold() * 0.55 && performance.now() - gesture.startTime < 250) fire(dx, dy);
      gesture = null;
    };
    const handleCancel = () => { gesture = null; };
    root.addEventListener('pointerdown', handleDown, { passive: true });
    root.addEventListener('pointermove', handleMove, { passive: false });
    root.addEventListener('pointerup', handleUp, { passive: true });
    root.addEventListener('pointercancel', handleCancel, { passive: true });
    return () => {
      root.removeEventListener('pointerdown', handleDown);
      root.removeEventListener('pointermove', handleMove);
      root.removeEventListener('pointerup', handleUp);
      root.removeEventListener('pointercancel', handleCancel);
    };
  }, [move]);

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver;
  const game = gameRef.current;
  const wasCaught = phase === Phase.GameOver && game.crash_reason() === CrashReason.Caught;
  return (
    <div className="game-shell metro-dash" ref={rootRef} data-testid="metro-dash" data-phase={phase} data-paused={isPaused}>
      <div className="metro-dash__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="metro-pause" aria-label={isPaused ? 'Resume' : 'Pause'}
          disabled={!isPaused && phase !== Phase.Playing}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={newGame} data-testid="metro-restart">Restart</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="metro-dash__best">Best <b data-testid="metro-best">{bestScore}</b></span>
      </div>
      <div className="metro-dash__stage" ref={stageRef}>
        <canvas ref={canvasRef} className="metro-dash__canvas" data-testid="metro-canvas" aria-label="Metro Dash: running along the railway tracks"
          onContextMenu={event => event.preventDefault()}
          onClick={() => { if (showsOverlay && !(phase === Phase.GameOver && !isPaused)) advanceOverlay(); }} />
        <div className="metro-dash__hud" aria-live="off">
          <div className="metro-dash__hud-left">
            <b ref={hud.score} data-testid="metro-score">0</b>
            <span ref={hud.distance} data-testid="metro-distance">0 m</span>
          </div>
          <div className="metro-dash__hud-right">
            <span className="metro-dash__pill metro-dash__pill--coins" title="Coins"><i className="metro-dash__coin" aria-hidden="true" /> <b ref={hud.coins} data-testid="metro-coins">0</b></span>
            <span className="metro-dash__pill metro-dash__pill--multiplier" ref={hud.multiplier} data-testid="metro-multiplier-badge" hidden>×2 score</span>
            <div className="metro-dash__powerups">
              {POWER_UPS.map((powerUp, index) => (
                <span key={powerUp.slot} className="metro-dash__powerup" title={powerUp.label} data-testid={powerUp.testId} hidden
                  ref={element => { hud.powerUps.current[index] = element; }}>
                  <em>{powerUp.icon}</em><span className="metro-dash__powerup-track"><span ref={element => { hud.bars.current[index] = element; }} /></span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="metro-dash__toast" ref={hud.toast} aria-live="polite" data-testid="metro-toast" />
        {showsOverlay && (
          <div className={`metro-dash__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} data-testid="metro-overlay"
            onClick={phase === Phase.GameOver && !isPaused ? undefined : advanceOverlay} role="presentation">
            {isPaused ? <>
                <b>Paused</b>
                {wasRestored && <span className="metro-dash__restored" data-testid="restored">💾 Your run was saved: {Math.floor(game.distance())} m · {game.score()} pts</span>}
                <span>Tap or press P to carry on</span>
                <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="metro-controls-toggle" />
                {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="metro-pause-controls" />}
              </>
              : phase === Phase.Ready ? <>
                <b className="metro-dash__title">METRO<small>DASH</small></b>
                <span className="metro-dash__tagline">Dash the rails. Dodge the trains. Grab the coins.</span>
                {bestScore > 0 && <span>Best score {bestScore}</span>}
                <ControlsPanel guide={CONTROLS_GUIDE} testId="metro-controls" />
                <span className="metro-dash__hint">Press Enter, tap or swipe to start</span>
                <span className="metro-dash__share" onClick={event => event.stopPropagation()} role="presentation"><ShareGameButton gameId={GAME_ID} gameName={GAME_NAME} testId="metro-share" /></span>
              </>
              : <>
                <b className="metro-dash__gameover">{wasCaught ? 'Caught!' : 'Crash!'}</b>
                <span data-testid="metro-final-score">Score {game.score()} · {Math.floor(game.distance())} m · 🪙 {game.coins()}</span>
                <span>{game.score() >= bestScore && game.score() > 0 ? '🏆 New best score!' : `Best score ${bestScore}`}</span>
                <span className="metro-dash__end-actions">
                  <button type="button" className="game-button game-button--primary" onClick={newGame} data-testid="metro-new-game">Play again</button>
                  <ShareGameButton gameId={GAME_ID} gameName={GAME_NAME} testId="metro-share-end" />
                </span>
              </>}
          </div>
        )}
      </div>
      <p className="game-help">←/→ or A/D switch lanes · ↑, W or Space jump · ↓ or S roll (in the air: drop fast) · P pause · M mute · Enter start · Esc back to the hub.
        On phones, swipe anywhere: left/right to switch lanes, up to jump, down to roll.
        Run up the ramps to ride on the train roofs, jump the low barriers, roll under the high ones and the signs, and never run into the front of a train.
        Clipping the side of a train makes you stumble — the guard catches you if you stumble twice in a row.</p>
    </div>
  );
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '→'], label: 'Switch lanes (or A / D)' },
    { keys: ['↑', '/', 'Space'], label: 'Jump (or W)' },
    { keys: ['↓'], label: 'Roll · drop fast (or S)' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Enter'], label: 'Start · play again' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'swipe', leftLabel: 'Swipe anywhere', buttons: [], where: '← → lanes · ↑ jump · ↓ roll' },
  touchTips: ['Short quick swipes are enough', 'Swipe down in the air to drop fast', 'Ramps take you up onto the train roofs'],
  weaponsLabel: 'Power-ups',
  weapons: [
    { letter: '🧲', name: 'Magnet', color: '#f3b0a8' },
    { letter: '👟', name: 'Super jump', color: '#a9df9f' },
    { letter: '2×', name: 'Double score', color: '#c7b9f2' },
    { letter: '🛹', name: 'Hoverboard (one crash)', color: '#a7d7f2' },
  ],
};
