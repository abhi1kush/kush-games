import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import { createScene, createVisualState, drawFrame, heartsFor, type Scene } from './art';
import { Buttons, createRenderView, Events, loadPralayRunEngine, MAX_HP, MAX_VIEW_WIDTH, MIN_VIEW_WIDTH, Phase, PralayRun, RenderSlot, VIEW_HEIGHT } from './engine';
import { emptyBest, loadBest, recordRun, type PralayBest } from './save';
import { playLimited, primeAudio, type PralaySound } from './sounds';
import '../shared.css';
import './pralayrun.css';

export default function PralayRunScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadPralayRunEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="pralay-loading"><p className="game-help">Loading…</p></div>;
  return <PralayRunGame memory={memory} />;
}

function buttonForKey(key: string): number {
  switch (key) {
    case 'arrowleft': case 'a': return Buttons.left;
    case 'arrowright': case 'd': return Buttons.right;
    case 'arrowup': case 'w': case ' ': case 'z': return Buttons.jump;
    case 'shift': case 'x': case 'k': case 'l': return Buttons.dash;
    case 'j': case 'f': case 'c': return Buttons.fire;
    default: return 0;
  }
}

const EVENT_SOUNDS: [number, PralaySound][] = [
  [Events.death, 'death'], [Events.hurt, 'hurt'], [Events.heart, 'heart'], [Events.kill, 'kill'], [Events.stomp, 'stomp'], [Events.dash, 'dash'],
  [Events.airJump, 'airJump'], [Events.jump, 'jump'], [Events.gem, 'gem'], [Events.orbPop, 'orbPop'], [Events.hit, 'hit'], [Events.enemyShot, 'enemyShot'],
  [Events.crumble, 'crumble'], [Events.collapse, 'collapse'], [Events.land, 'land'], [Events.shoot, 'shoot'],
];

export const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '→'], label: 'Run (A / D)' },
    { keys: ['Space', '/', '↑', '/', 'Z'], label: 'Jump · again in the air to double jump' },
    { keys: ['Shift', '/', 'X', '/', 'K'], label: 'Dash · passes through enemies & orbs' },
    { keys: ['J', '/', 'F', '/', 'C'], label: 'Shoot a light bolt (hold to keep firing)' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['R', '/', 'Enter'], label: 'Run again after a fall' },
  ],
  touch: {
    leftControl: 'pad', leftLabel: 'Run',
    buttons: [{ name: 'DASH', label: 'Burst', color: 'rgba(80,230,220,0.55)' }, { name: 'FIRE', label: 'Hold', color: 'rgba(255,90,190,0.55)' }, { name: 'JUMP', label: '×2 in air', color: 'rgba(255,160,60,0.65)' }],
  },
  touchTips: ['Turn your phone sideways for a wider view'],
};

const newSeed = () => (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;

interface RunResult { score: number; distance: number; kills: number; gems: number; isBest: boolean; }

function PralayRunGame({ memory }: { memory: WebAssembly.Memory }) {
  const gameRef = useRef<PralayRun>(null as unknown as PralayRun);
  if (!gameRef.current) gameRef.current = new PralayRun(newSeed());
  const readRender = useMemo(() => createRenderView(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(Phase.Ready);
  const [isPaused, setIsPaused] = useState(false);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [best, setBest] = useState<PralayBest>(() => loadBest() ?? emptyBest());
  const [result, setResult] = useState<RunResult | null>(null);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(false);
  const keyButtonsRef = useRef(0);
  const touchButtonsRef = useRef(0);
  const visualRef = useRef(createVisualState());
  const gameOverAtRef = useRef(0);
  const needsDrawRef = useRef(true);

  useEffect(() => () => { gameRef.current.free(); }, []);
  // Test hook for e2e/pralay-run.mjs (only with ?pralayTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('pralayTest')) return;
    const testWindow = window as unknown as { __pralayTest?: unknown };
    testWindow.__pralayTest = { game: () => gameRef.current, render: readRender, touchButtons: touchButtonsRef };
    return () => { delete testWindow.__pralayTest; };
  }, [readRender]);

  const pause = useCallback(() => {
    keyButtonsRef.current = 0;
    touchButtonsRef.current = 0;
    if (isPausedRef.current || gameRef.current.phase() !== Phase.Playing) return;
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);
  const resume = useCallback(() => {
    primeAudio();
    isPausedRef.current = false;
    setIsPaused(false);
    setShowsPauseControls(false);
    needsDrawRef.current = true;
  }, []);
  const begin = useCallback(() => {
    primeAudio();
    const game = gameRef.current;
    if (game.phase() !== Phase.Ready) { game.restart(newSeed()); visualRef.current = createVisualState(); }
    game.start();
    setResult(null);
    isPausedRef.current = false;
    setIsPaused(false);
    playLimited('start', isMutedRef.current);
    needsDrawRef.current = true;
  }, [isMutedRef]);
  /** Start, resume, or run again — whatever the overlay is asking for. */
  const advanceOverlay = useCallback(() => {
    if (isPausedRef.current) { resume(); return; }
    const current = gameRef.current.phase() as Phase;
    if (current === Phase.Ready) begin();
    else if (current === Phase.GameOver && performance.now() - gameOverAtRef.current > 450) begin();
  }, [begin, resume]);
  const advanceOverlayRef = useRef(advanceOverlay);
  advanceOverlayRef.current = advanceOverlay;

  // ---------- the loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d', { alpha: false })!;
    let scene: Scene | null = null;
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const box = stage.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      const width = Math.round(box.width * pixelRatio), height = Math.round(box.height * pixelRatio);
      if (scene && canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      const viewWidth = Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, width / (height / VIEW_HEIGHT)));
      gameRef.current.set_view_width(viewWidth);
      scene = createScene(context, width, height);
      scene.viewWidth = viewWidth;
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const hud = { distance: -1, score: -1, hp: -1, pace: -1, dash: -1 };
    const updateHud = (render: Float32Array) => {
      const root = hudRef.current;
      if (!root) return;
      const distance = render[RenderSlot.distance], score = render[RenderSlot.score], hp = heartsFor(render[RenderSlot.hp]);
      const pace = Math.round(render[RenderSlot.pace] * 10) / 10, dash = render[RenderSlot.canDash];
      if (distance !== hud.distance) { hud.distance = distance; root.querySelector('[data-hud=distance]')!.textContent = `${distance}`; }
      if (score !== hud.score) { hud.score = score; root.querySelector('[data-hud=score]')!.textContent = `${score}`; }
      if (hp !== hud.hp) {
        hud.hp = hp;
        root.querySelectorAll('[data-hud=hearts] i').forEach((heart, index) => heart.classList.toggle('is-lost', index >= hp));
        root.querySelector('[data-hud=hearts]')!.setAttribute('aria-label', `${hp} of ${MAX_HP} lives`);
      }
      if (pace !== hud.pace) { hud.pace = pace; root.querySelector('[data-hud=pace]')!.textContent = `×${pace.toFixed(1)}`; }
      if (dash !== hud.dash) { hud.dash = dash; root.querySelector('[data-hud=dash]')!.classList.toggle('is-ready', dash === 1); }
    };
    const finishRun = () => {
      const game = gameRef.current;
      const run = { score: game.score(), distance: game.distance(), kills: game.kills(), gems: game.gems() };
      const { best: next, isBest } = recordRun(run);
      setBest(next);
      setResult({ ...run, isBest });
      gameOverAtRef.current = performance.now();
      if (isBest && run.score > 0) window.setTimeout(() => playLimited('best', isMutedRef.current), 500);
    };
    const handleEvents = (events: number) => {
      const muted = isMutedRef.current;
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      const visual = visualRef.current;
      if (events & Events.hurt) { visual.hurtFlash = 1; visual.shake = Math.max(visual.shake, 1.2); }
      if (events & Events.death) { visual.shake = Math.max(visual.shake, 2); visual.hurtFlash = 0.8; }
      if (events & Events.kill) visual.shake = Math.max(visual.shake, 0.5);
      if (events & Events.gameOver) finishRun();
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current && !needsDrawRef.current) return;
      try {
        const game = gameRef.current;
        let events = 0;
        if (!isPausedRef.current) {
          game.set_input(keyButtonsRef.current | touchButtonsRef.current);
          events = game.advance(seconds);
        }
        if (events) handleEvents(events);
        const render = readRender();
        const currentPhase = render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
        if (scene) { drawFrame(scene, render, visualRef.current, now / 1000); updateHud(render); }
        needsDrawRef.current = false;
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Pralay Run frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [isMutedRef, readRender]);

  // Pause when the tab is hidden or the window loses focus.
  useEffect(() => {
    const handleHide = () => { if (document.hidden) pause(); };
    const handleBlur = () => pause();
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('blur', handleBlur);
    return () => { document.removeEventListener('visibilitychange', handleHide); window.removeEventListener('blur', handleBlur); };
  }, [pause]);

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
      const game = gameRef.current;
      const current = game.phase() as Phase;
      if (button) {
        event.preventDefault();
        keyButtonsRef.current |= button;
        if (event.repeat) return;
        if (isPausedRef.current || current === Phase.Ready) { if (button === Buttons.jump || isPausedRef.current) advanceOverlayRef.current(); }
        else if (current === Phase.GameOver) { if (button === Buttons.jump) advanceOverlayRef.current(); }
        if (button === Buttons.jump && !isPausedRef.current) game.press_jump();
        if (button === Buttons.dash && !isPausedRef.current) game.press_dash();
      } else if ((key === 'enter' || key === 'r') && !event.repeat) {
        event.preventDefault();
        if (current === Phase.GameOver || current === Phase.Ready || isPausedRef.current) advanceOverlayRef.current();
      } else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = buttonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
      if (event.key === 'Shift') keyButtonsRef.current &= ~Buttons.dash;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pause, resume, toggleMute]);

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver;
  const isPlaying = phase === Phase.Playing || phase === Phase.Dying;
  return (
    <div className="game-shell pralay" data-testid="pralay-run" data-phase={phase} data-paused={isPaused}>
      <div className="pralay__play">
        <div className="pralay__stage" ref={stageRef} data-testid="pralay-stage">
          <canvas ref={canvasRef} className="pralay__canvas" data-testid="pralay-canvas" aria-label="Pralay Run: the collapsing sky-temple" />
          <div className={`pralay-hud${isPlaying && !isPaused ? '' : ' is-dim'}`} ref={hudRef} data-testid="pralay-hud">
            <div className="pralay-hud__left">
              <span className="pralay-hud__hearts" data-hud="hearts" aria-label={`${MAX_HP} of ${MAX_HP} lives`}>{Array.from({ length: MAX_HP }, (_, index) => <i key={index} />)}</span>
              <span className="pralay-hud__dash is-ready" data-hud="dash" title="Dash ready">DASH</span>
            </div>
            <div className="pralay-hud__center"><b data-hud="distance" data-testid="pralay-distance">0</b><small>m</small></div>
            <div className="pralay-hud__right">
              <span className="pralay-hud__score"><small>Score</small><b data-hud="score" data-testid="pralay-score">0</b></span>
              <span className="pralay-hud__pace" title="How fast the Pralay is moving"><small>Pralay</small><b data-hud="pace">×1.0</b></span>
              <button type="button" className="pralay-icon" onClick={() => (isPaused ? resume() : pause())} data-testid="pralay-pause" aria-label={isPaused ? 'Resume' : 'Pause'} disabled={!isPlaying && !isPaused}>{isPaused ? '▶' : '❚❚'}</button>
              <MuteButton isMuted={isMuted} onToggle={toggleMute} />
            </div>
          </div>
          {showsOverlay && (
            <div className={`pralay-overlay${phase === Phase.Ready && !isPaused ? ' pralay-overlay--start' : ''}`} onClick={advanceOverlay} data-testid="pralay-overlay" role="presentation">
              {isPaused ? <>
                  <h2 className="pralay-overlay__heading">Paused</h2>
                  <div className="pralay-actions">
                    <button type="button" className="pralay-cta" onClick={event => { event.stopPropagation(); resume(); }} data-testid="pralay-resume">Resume</button>
                    <button type="button" className="pralay-ghost" onClick={event => { event.stopPropagation(); begin(); }} data-testid="pralay-restart">New run</button>
                  </div>
                  <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="pralay-controls-toggle" />
                  {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="pralay-pause-controls" />}
                  <span className="pralay-hint"><span className="for-keys">Press P to resume</span><span className="for-touch">Tap to resume</span></span>
                </>
                : phase === Phase.Ready ? <>
                  <div className="pralay-title">
                    <p className="pralay-title__kicker">प्रलय · the sky-temple is falling</p>
                    <h1>Pralay Run</h1>
                    <p className="pralay-title__tag">Aru, the last lamp-bearer, must outrun the collapse. Keep moving — it never stops.</p>
                  </div>
                  <button type="button" className="pralay-cta" onClick={event => { event.stopPropagation(); begin(); }} data-testid="pralay-start">Run</button>
                  {best.score > 0 && <p className="pralay-record" data-testid="pralay-best">Best {best.score} · {best.distance} m</p>}
                  <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="pralay-controls" />
                  <span className="pralay-hint"><span className="for-keys">Press Space or click Run</span><span className="for-touch">Tap Run · hold ◀ ▶ to steer</span></span>
                </>
                : <>
                  <h2 className="pralay-overlay__heading">{result?.isBest && (result?.score ?? 0) > 0 ? 'New best!' : 'Swallowed by the Pralay'}</h2>
                  <div className="pralay-stats" data-testid="pralay-result">
                    <div><b>{result?.distance ?? 0}</b><small>metres</small></div>
                    <div><b>{result?.kills ?? 0}</b><small>foes</small></div>
                    <div><b>{result?.gems ?? 0}</b><small>tejas</small></div>
                    <div className="is-score"><b data-testid="pralay-final-score">{result?.score ?? 0}</b><small>score</small></div>
                  </div>
                  <p className="pralay-record">Best {best.score} · {best.distance} m · {best.runs} {best.runs === 1 ? 'run' : 'runs'}</p>
                  <button type="button" className="pralay-cta" onClick={event => { event.stopPropagation(); begin(); }} data-testid="pralay-again">Run again</button>
                  <span className="pralay-hint"><span className="for-keys">Space, R or Enter to run again</span><span className="for-touch">Tap to run again</span></span>
                </>}
            </div>
          )}
        </div>
        <TouchControls buttonsRef={touchButtonsRef} onPress={button => {
            const game = gameRef.current;
            if (isPausedRef.current) return;
            const current = game.phase() as Phase;
            if (current === Phase.Ready || current === Phase.GameOver) return;
            if (button === Buttons.jump) game.press_jump();
            if (button === Buttons.dash) game.press_dash();
          }} />
      </div>
      <p className="game-help">←/→ run · Space/↑/Z jump (again in the air for a double jump) · Shift/X dash · J/F shoot · P pause · M mute. The Pralay eats the world behind you and speeds up — keep running.</p>
    </div>
  );
}

/**
 * On-screen buttons for phones: a left/right pad plus Dash, Fire (hold) and Jump. Native pointer events, several
 * fingers at once; held buttons go straight into a ref the game loop reads.
 */
function TouchControls({ buttonsRef, onPress }: { buttonsRef: React.MutableRefObject<number>; onPress: (button: number) => void }) {
  const padPointers = useRef(new Map<number, number>());
  const updatePad = () => {
    let held = 0;
    padPointers.current.forEach(button => { held |= button; });
    buttonsRef.current = (buttonsRef.current & ~(Buttons.left | Buttons.right)) | held;
  };
  const padButtonAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left + box.width / 2 ? Buttons.left : Buttons.right;
  };
  const handlePadDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    padPointers.current.set(event.pointerId, padButtonAt(event));
    updatePad();
  };
  const handlePadMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!padPointers.current.has(event.pointerId)) return;
    padPointers.current.set(event.pointerId, padButtonAt(event));
    updatePad();
  };
  const handlePadUp = (event: ReactPointerEvent<HTMLDivElement>) => { padPointers.current.delete(event.pointerId); updatePad(); };
  const holdButton = (button: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      buttonsRef.current |= button;
      onPress(button);
    },
    onPointerUp: () => { buttonsRef.current &= ~button; },
    onPointerCancel: () => { buttonsRef.current &= ~button; },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });
  return (
    <div className="pralay-touch" data-testid="pralay-touch">
      <div className="pralay-touch__pad" onPointerDown={handlePadDown} onPointerMove={handlePadMove} onPointerUp={handlePadUp} onPointerCancel={handlePadUp}
        onContextMenu={event => event.preventDefault()} role="group" aria-label="Run left or right">
        <span className="pralay-key" data-testid="touch-left" aria-label="Left">◀</span>
        <span className="pralay-key" data-testid="touch-right" aria-label="Right">▶</span>
      </div>
      <div className="pralay-touch__actions">
        <button type="button" className="pralay-key pralay-key--dash" data-testid="touch-dash" aria-label="Dash" {...holdButton(Buttons.dash)}>DASH</button>
        <button type="button" className="pralay-key pralay-key--fire" data-testid="touch-fire" aria-label="Fire" {...holdButton(Buttons.fire)}>FIRE</button>
        <button type="button" className="pralay-key pralay-key--jump" data-testid="touch-jump" aria-label="Jump" {...holdButton(Buttons.jump)}>JUMP</button>
      </div>
    </div>
  );
}
