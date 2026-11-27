import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import { ShareGameButton } from '../ShareGameButton';
import { createSprites, type Sprites } from './art';
import { AlpineSled, Buttons, createRenderView, Events, loadAlpineSledEngine, Phase, RenderSlot } from './engine';
import { createAlpineSledSaveSlot } from './save';
import { createScene, drawScene, type Scene } from './scene';
import { playLimited, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import '../online/online.css';
import './alpinesled.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-alpine-sled-best';
const GAME_ID = 'alpine-sled';
const GAME_NAME = 'Alpine Sled';
/** Canvas pixels per CSS pixel, at most (keeps the fill cost low on phones with very dense screens). */
const MAX_PIXEL_RATIO = 1.5;

export default function AlpineSledScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadAlpineSledEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="sled-loading"><p className="game-help">Loading…</p></div>;
  return <AlpineSledGame memory={memory} />;
}

/** Which held steering button a key is, or 0. */
function steeringButtonForKey(key: string): number {
  switch (key) {
    case 'arrowleft': case 'a': return Buttons.left;
    case 'arrowright': case 'd': return Buttons.right;
    default: return 0;
  }
}
const isJumpKey = (key: string) => key === ' ' || key === 'arrowup' || key === 'w';

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.crash, 'crash'], [Events.gameOver, 'gameOver'], [Events.shieldBreak, 'shieldBreak'], [Events.shield, 'shield'], [Events.milestone, 'milestone'],
  [Events.star, 'star'], [Events.gift, 'gift'], [Events.ramp, 'ramp'], [Events.jump, 'jump'], [Events.land, 'land'], [Events.bankScrape, 'bankScrape'],
];

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

function AlpineSledGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createAlpineSledSaveSlot(), []);
  const gameRef = useRef<AlpineSled>(null as unknown as AlpineSled);
  const [wasRestored, setWasRestored] = useState(false);
  const restoredRef = useRef<boolean | null>(null);
  if (!gameRef.current) {
    gameRef.current = new AlpineSled(randomSeed());
    const saved = saveSlot.load();
    restoredRef.current = saved !== null && gameRef.current.restore(Uint8Array.from(saved.bytes));
    if (saved && !restoredRef.current) saveSlot.clear();
  }
  const readRender = useMemo(() => createRenderView(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(() => gameRef.current.phase() as Phase);
  // a run restored after a refresh waits, paused, exactly where it was
  const [isPaused, setIsPaused] = useState(() => restoredRef.current === true);
  const isPausedRef = useRef(restoredRef.current === true);
  useEffect(() => { if (restoredRef.current) setWasRestored(true); }, []);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const bestScoreRef = useRef(bestScore);
  bestScoreRef.current = bestScore;
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const keyButtonsRef = useRef(0);
  const steerAxisRef = useRef({ pad: 0, canvas: 0 });
  const needsDrawRef = useRef(true);
  const perfRef = useRef<{ workMilliseconds: Float64Array; frameMilliseconds: Float64Array; count: number } | null>(null);
  const hud = {
    distance: useRef<HTMLElement>(null), score: useRef<HTMLElement>(null), gifts: useRef<HTMLElement>(null), stars: useRef<HTMLElement>(null),
    shield: useRef<HTMLElement>(null), toast: useRef<HTMLDivElement>(null),
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

  useEffect(() => () => { saveProgress(); gameRef.current.free(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/alpine-sled.mjs (only with ?sledTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('sledTest')) return;
    perfRef.current = { workMilliseconds: new Float64Array(1200), frameMilliseconds: new Float64Array(1200), count: 0 };
    const testWindow = window as unknown as { __sledTest?: unknown };
    testWindow.__sledTest = { game: gameRef.current, render: readRender, perf: perfRef.current };
    return () => { delete testWindow.__sledTest; };
  }, [readRender]);

  const clearSteering = () => {
    keyButtonsRef.current = 0;
    steerAxisRef.current.pad = 0;
    steerAxisRef.current.canvas = 0;
    gameRef.current.set_input(0);
    gameRef.current.set_steer_axis(0);
  };
  const pause = useCallback(() => {
    clearSteering();
    const currentPhase = gameRef.current.phase() as Phase;
    if (isPausedRef.current || currentPhase !== Phase.Playing) return;
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

  const jump = useCallback(() => {
    if (isPausedRef.current) return;
    const game = gameRef.current;
    if (game.phase() === Phase.Ready) { advanceOverlayRef.current(); return; }
    game.press_jump();
  }, []);

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d', { alpha: false })!;
    let sprites: Sprites | null = null;
    let scene: Scene | null = null;
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const box = stage.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      const width = Math.round(box.width * pixelRatio), height = Math.round(box.height * pixelRatio);
      if (scene && scene.width === width && scene.height === height) return;
      canvas.width = width;
      canvas.height = height;
      sprites ??= createSprites();
      scene = createScene(context, width, height, sprites);
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const shown = { distance: -1, score: -1, gifts: -1, stars: -1, shield: -1 };
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
      const distance = Math.floor(render[RenderSlot.distance]);
      if (distance !== shown.distance && hud.distance.current) { shown.distance = distance; hud.distance.current.textContent = `${distance} m`; }
      const score = render[RenderSlot.score];
      if (score !== shown.score && hud.score.current) { shown.score = score; hud.score.current.textContent = String(score); }
      const gifts = render[RenderSlot.gifts];
      if (gifts !== shown.gifts && hud.gifts.current) { shown.gifts = gifts; hud.gifts.current.textContent = String(gifts); }
      const stars = render[RenderSlot.stars];
      if (stars !== shown.stars && hud.stars.current) { shown.stars = stars; hud.stars.current.textContent = String(stars); }
      const shield = render[RenderSlot.shield];
      if (shield !== shown.shield && hud.shield.current) { shown.shield = shield; hud.shield.current.hidden = shield === 0; }
    };
    const handleEvents = (events: number) => {
      const muted = isMutedRef.current;
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      const game = gameRef.current;
      if (events & Events.milestone) showToast(`${Math.floor(game.distance() / 500) * 500} m!`);
      else if (events & Events.ramp) showToast('Big air!');
      else if (events & Events.shield) showToast(game.has_shield() ? 'Shield ready' : 'Spare shield +100');
      else if (events & Events.shieldBreak) showToast('Shield saved you!');
      if (events & Events.crash) { recordBest(game.score()); saveSlot.clear(); if (navigator.vibrate) { try { navigator.vibrate(120); } catch { /* not allowed */ } } }
      if (events & Events.gameOver) { saveSlot.clear(); recordBest(game.score()); }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const elapsedSeconds = (now - previousTime) / 1000;
      const seconds = Math.min(0.1, elapsedSeconds);
      previousTime = now;
      if (isPausedRef.current) {
        if (needsDrawRef.current && scene) { needsDrawRef.current = false; const render = readRender(); drawScene(scene, render, now / 1000, 0); updateHud(render); }
        return;
      }
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current;
        game.set_input(keyButtonsRef.current);
        game.set_steer_axis(steerAxisRef.current.pad + steerAxisRef.current.canvas);
        const events = game.advance(elapsedSeconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        const render = readRender();
        if (events) handleEvents(events);
        const currentPhase = render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
        if (scene) { needsDrawRef.current = false; drawScene(scene, render, now / 1000, seconds); }
        updateHud(render);
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = seconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Alpine Sled frame failed', error); }
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
      const button = steeringButtonForKey(key);
      if (button) {
        event.preventDefault();
        if (isPausedRef.current) return; // only P, Enter or a tap resumes, so a stray arrow key can't unpause
        keyButtonsRef.current |= button;
        if (!event.repeat && gameRef.current.phase() === Phase.Ready) advanceOverlayRef.current();
      } else if (isJumpKey(key)) {
        event.preventDefault();
        if (!event.repeat) jump();
      } else if (key === 'enter' && !event.repeat) { event.preventDefault(); advanceOverlayRef.current(); }
      else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = steeringButtonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [jump, pause, resume, toggleMute]);

  // Touching the slope itself: drag sideways to steer (relative to where the finger went down), swipe up or tap to jump.
  const canvasGesture = useRef<{ pointer: number; startX: number; startY: number; startTime: number; hasJumped: boolean; hasMoved: boolean } | null>(null);
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (showsOverlay) { if (!(phase === Phase.GameOver && !isPaused)) advanceOverlay(); return; }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    canvasGesture.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: performance.now(), hasJumped: false, hasMoved: false };
  };
  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = canvasGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect();
    const sideways = event.clientX - gesture.startX;
    const upward = gesture.startY - event.clientY;
    if (Math.abs(sideways) > 8 || Math.abs(upward) > 8) gesture.hasMoved = true;
    steerAxisRef.current.canvas = Math.max(-1, Math.min(1, sideways / (box.width * 0.16)));
    if (!gesture.hasJumped && upward > Math.max(30, box.height * 0.06) && upward > Math.abs(sideways) && performance.now() - gesture.startTime < 450) {
      gesture.hasJumped = true;
      jump();
    }
  };
  const onCanvasPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = canvasGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (!gesture.hasMoved && !gesture.hasJumped && performance.now() - gesture.startTime < 300 && event.pointerType !== 'mouse') jump();
    canvasGesture.current = null;
    steerAxisRef.current.canvas = 0;
  };

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver;
  const game = gameRef.current;
  return (
    <div className="game-shell alpine-sled" data-testid="alpine-sled" data-phase={phase} data-paused={isPaused}>
      <div className="alpine-sled__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="sled-pause" aria-label={isPaused ? 'Resume' : 'Pause'}
          disabled={!isPaused && phase !== Phase.Playing}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={newGame} data-testid="sled-restart">Restart</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="alpine-sled__best">Best <b data-testid="sled-best">{bestScore}</b></span>
      </div>
      <div className="alpine-sled__play">
        <div className="alpine-sled__stage" ref={stageRef}>
          <canvas ref={canvasRef} className="alpine-sled__canvas" data-testid="sled-canvas" aria-label="Alpine Sled: a 3D snowy mountain trail"
            onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerEnd} onPointerCancel={onCanvasPointerEnd}
            onContextMenu={event => event.preventDefault()} />
          <div className="alpine-sled__hud" aria-live="off">
            <div className="alpine-sled__hud-left">
              <b ref={hud.distance} data-testid="sled-distance">0 m</b>
              <span>Score <b ref={hud.score} data-testid="sled-score">0</b></span>
            </div>
            <div className="alpine-sled__hud-right">
              <span className="alpine-sled__pill" title="Gifts">🎁 <b ref={hud.gifts} data-testid="sled-gifts">0</b></span>
              <span className="alpine-sled__pill" title="Stars">⭐ <b ref={hud.stars} data-testid="sled-stars">0</b></span>
              <span className="alpine-sled__pill alpine-sled__pill--shield" ref={hud.shield} data-testid="sled-shield" hidden>🛡️ Shield</span>
            </div>
          </div>
          <div className="alpine-sled__toast" ref={hud.toast} aria-live="polite" />
          {showsOverlay && (
            <div className={`alpine-sled__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} data-testid="sled-overlay"
              onClick={phase === Phase.GameOver && !isPaused ? undefined : advanceOverlay} role="presentation">
              {isPaused ? <>
                  <b>Paused</b>
                  {wasRestored && <span className="alpine-sled__restored" data-testid="restored">💾 Your run was saved: {Math.floor(game.distance())} m · {game.score()} pts</span>}
                  <span>Tap or press P to carry on</span>
                  <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="sled-controls-toggle" />
                  {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="sled-pause-controls" />}
                </>
                : phase === Phase.Ready ? <>
                  <b className="alpine-sled__title">ALPINE<small>SLED</small></b>
                  <span className="alpine-sled__tagline">Glide the mountain trail. Dodge, jump, fly.</span>
                  {bestScore > 0 && <span>Best score {bestScore}</span>}
                  <ControlsPanel guide={CONTROLS_GUIDE} testId="sled-controls" />
                  <span className="alpine-sled__hint">Press Enter or tap to start</span>
                  <span className="alpine-sled__share" onClick={event => event.stopPropagation()} role="presentation"><ShareGameButton gameId={GAME_ID} gameName={GAME_NAME} testId="sled-share" /></span>
                </>
                : <>
                  <b className="alpine-sled__gameover">Wipeout!</b>
                  <span data-testid="sled-final-score">{Math.floor(game.distance())} m · Score {game.score()} · 🎁 {game.gifts()} ⭐ {game.stars()}</span>
                  <span>{game.score() >= bestScore && game.score() > 0 ? '🏆 New best score!' : `Best score ${bestScore}`}</span>
                  <span className="alpine-sled__end-actions">
                    <button type="button" className="game-button game-button--primary" onClick={newGame} data-testid="sled-new-game">Play again</button>
                    <ShareGameButton gameId={GAME_ID} gameName={GAME_NAME} testId="sled-share-end" />
                  </span>
                </>}
            </div>
          )}
        </div>
        <TouchControls steerAxisRef={steerAxisRef} onJump={() => {
          if (isPausedRef.current || gameRef.current.phase() !== Phase.Playing) { if (gameRef.current.phase() !== Phase.GameOver || isPausedRef.current) advanceOverlayRef.current(); return; }
          jump();
        }} />
      </div>
      <p className="game-help">←→ or A/D steer · Space, ↑ or W jump · P pause · M mute · Enter start · Esc back to the hub.
        The sled glides downhill on its own and speeds up the further you go. Weave between pine trees, boulders, snowmen and fallen logs; hop the low ones,
        and ride the wooden ramps to fly over everything for the golden stars hanging in the air. Gifts and stars add to your score, and a 🛡️ shield takes one hit for you.</p>
    </div>
  );
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '→'], label: 'Steer (or A / D)' },
    { keys: ['Space', '/', '↑', '/', 'W'], label: 'Jump' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Enter'], label: 'Start · play again' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'drag', leftLabel: 'Drag to steer', buttons: [{ name: 'JUMP', label: 'Tap to jump', color: 'rgba(94,140,196,0.85)' }] },
  touchTips: ['Or drag on the slope to steer · swipe up or tap it to jump', 'Ramps launch you over everything · grab the stars up high'],
  weaponsLabel: 'On the trail',
  weapons: [
    { letter: '🎁', name: 'Gift +25', color: '#eaa5a5' },
    { letter: '⭐', name: 'Star +50', color: '#f4cd6e' },
    { letter: '🛡', name: 'Shield (one hit)', color: '#9fd0ea' },
  ],
};

/**
 * On-screen controls for phones: a wide drag pad (slide a thumb from where it touched and the sled steers that way,
 * further for a harder turn) and a big JUMP button. Native pointer events, both thumbs at once.
 */
function TouchControls({ steerAxisRef, onJump }: { steerAxisRef: React.MutableRefObject<{ pad: number; canvas: number }>; onJump: () => void }) {
  const padPointer = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const knobRef = useRef<HTMLSpanElement>(null);
  const movePad = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const travel = event.clientX - dragStartX.current;
    steerAxisRef.current.pad = Math.max(-1, Math.min(1, travel / (box.width * 0.3)));
    const knobX = Math.min(box.width / 2 - 22, Math.max(-box.width / 2 + 22, steerAxisRef.current.pad * (box.width / 2 - 22)));
    if (knobRef.current) knobRef.current.style.transform = `translateX(${knobX.toFixed(1)}px)`;
  };
  const releasePad = () => {
    padPointer.current = null;
    steerAxisRef.current.pad = 0;
    if (knobRef.current) knobRef.current.style.transform = '';
  };
  return (
    <div className="alpine-sled__touch" data-testid="sled-touch">
      <div className="alpine-sled__pad" data-testid="touch-pad" role="group" aria-label="Drag to steer"
        onPointerDown={event => {
          event.preventDefault();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
          padPointer.current = event.pointerId;
          dragStartX.current = event.clientX;
          movePad(event);
        }}
        onPointerMove={event => { if (padPointer.current === event.pointerId) movePad(event); }}
        onPointerUp={event => { if (padPointer.current === event.pointerId) releasePad(); }}
        onPointerCancel={releasePad}
        onContextMenu={event => event.preventDefault()}>
        <i>◀</i><span className="alpine-sled__knob" ref={knobRef} /><i>▶</i>
      </div>
      <button type="button" className="alpine-sled__jump" data-testid="touch-jump" aria-label="Jump"
        onPointerDown={event => { event.preventDefault(); onJump(); }} onContextMenu={event => event.preventDefault()}>JUMP</button>
    </div>
  );
}
