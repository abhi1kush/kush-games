/**
 * Ember Lane — lead Mira and her little brother Lio down a dark village street at night. Rats swarm any
 * shadow and flee from flame, so keep both children in the light: wait out a guttering torch, throw embers into cold
 * braziers, carry a lantern, push a crate out of the light and work the shutter levers to reach the sanctuary door.
 * Rust/wasm owns the light, rats, puzzles and movement on a fixed step; this file runs screens, input and drawing.
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { homePath, navigate } from '../../routing';
import { createSaveSlot, SAVE_VERSIONS } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { BUTTON, CHECKPOINT_X, EmberLane, emptyProgress, EVENT, hintFor, KIND, loadEmberLaneEngine, parseProgress, type Progress, PROMPT, readLights, SECTION_NAMES, STATE } from './engine';
import { Renderer } from './render';
import { type EmberSound, playEmberSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './emberlane.css';

const createProgressSlot = () => createSaveSlot<Progress>({ gameId: 'ember-lane', version: SAVE_VERSIONS['ember-lane'], parse: parseProgress });
const SECTION_STARTS = [0, 300, 990, 1700, 2410, 3000];
const sectionAt = (x: number) => SECTION_STARTS.reduce((found, start, index) => (x >= start ? index : found), 0);
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function EmberLaneGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadEmberLaneEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell ember" data-testid="ember-loading"><p className="game-help">Lighting the torches…</p></div>;
  return <EmberLaneScreens />;
}

type Screen = 'start' | 'playing' | 'clear';
interface Hud { section: number; embers: number; oil: number; carrying: boolean; prompt: number; hint: string; checkpoint: number; deaths: number; dead: boolean }
interface ClearStats { seconds: number; deaths: number; best: number; isBest: boolean }

declare global { interface Window { __emberTest?: Record<string, unknown> } }

function ControlsCard({ touch }: { touch: boolean }) {
  return (
    <section className="ember-card ember-controls" data-testid="ember-controls">
      <h2>How to survive</h2>
      <ul>
        <li><b>Rats own the dark.</b> Step out of the light — or let Lio fall behind in it — and they swarm. Flame drives them back.</li>
        <li><b>Embers</b> light cold braziers and fire pots in the direction you face. You only carry a few.</li>
        <li>Carry the <b>lantern</b> while its oil lasts, push <b>crates</b> out of the light — or climb onto one: rats can’t climb — and pull <b>levers</b> to open shutters.</li>
        <li>Fall, and you wake at the last lit <b>checkpoint</b>.</li>
      </ul>
      {touch
        ? <p className="ember-keys">◀ ▶ walk · <b>✋</b> take / pull / climb · <b>🔥</b> throw an ember</p>
        : <p className="ember-keys">← → or A D walk · E or ↑ take / pull / climb · F or Space throw an ember · P or ⋮ menu · M mute</p>}
    </section>
  );
}

function EmberLaneScreens() {
  const [slot] = useState(createProgressSlot);
  const [progress, setProgress] = useState<Progress>(() => slot.load() ?? emptyProgress());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const update = useCallback((change: (current: Progress) => Progress) => {
    setProgress(current => { const next = change(current); slot.save(next); return next; });
  }, [slot]);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: EmberSound) => playEmberSound(kind, isMutedRef.current), [isMutedRef]);
  const [touch] = useState(isTouchDevice);

  const [screen, setScreen] = useState<Screen>('start');
  const [isPaused, setIsPaused] = useState(false);
  const [hud, setHud] = useState<Hud>({ section: 0, embers: 0, oil: 0, carrying: false, prompt: 0, hint: '', checkpoint: 0, deaths: 0, dead: false });
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [clearStats, setClearStats] = useState<ClearStats | null>(null);
  const gameRef = useRef<EmberLane>(new EmberLane());
  const rendererRef = useRef(new Renderer());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, ratio: 1 });
  const keysRef = useRef(0);
  const touchRef = useRef(0);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const frameRef = useRef(0);
  const lastFrameRef = useRef(0);
  const hudRef = useRef(hud);
  const clearAtRef = useRef(0);
  const lastStepRef = useRef(0);
  const sectionRef = useRef(0);

  const showToast = useCallback((text: string) => setToast({ text, key: performance.now() }), []);

  const drawFrame = useCallback((now = performance.now()) => {
    const canvas = canvasRef.current;
    const { width, height, ratio } = sizeRef.current;
    if (!canvas || width === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const game = gameRef.current;
    rendererRef.current.draw(context, game, width, height, ratio, now, { prompt: screenRef.current === 'playing' ? game.prompt() : 0, touch });
  }, [touch]);

  const syncHud = useCallback(() => {
    const game = gameRef.current;
    const x = game.player_x();
    const next: Hud = {
      section: sectionAt(x), embers: game.embers(), oil: Math.ceil(game.oil()), carrying: game.carrying(), prompt: game.prompt(),
      hint: hintFor(x, game.carrying(), game.embers(), { onCrate: game.on_crate(), potLit: game.pot_left() > 0, crateX: game.crate_x(0) }), checkpoint: game.checkpoint(), deaths: game.deaths(), dead: game.state() === STATE.dead,
    };
    const previous = hudRef.current;
    if ((Object.keys(next) as (keyof Hud)[]).some(key => next[key] !== previous[key])) { hudRef.current = next; setHud(next); }
    if (next.section !== sectionRef.current) { sectionRef.current = next.section; showToast(SECTION_NAMES[next.section]); }
  }, [showToast]);

  const handleEvents = useCallback((events: number) => {
    const game = gameRef.current;
    const renderer = rendererRef.current;
    if (events & EVENT.throw) sound('throw');
    if (events & EVENT.ignite) { sound('ignite'); renderer.burst(lastEmberRef.current[0], lastEmberRef.current[1], 26); }
    if (events & EVENT.fizzle) { sound('fizzle'); renderer.burst(lastEmberRef.current[0], lastEmberRef.current[1], 8, 2); }
    if (events & EVENT.take) sound('take');
    if (events & EVENT.drop) sound('drop');
    if (events & EVENT.lever) sound('lever');
    if (events & EVENT.climb) sound('climb');
    if (events & EVENT.push) sound('push');
    if (events & EVENT.lanternOut) { sound('lanternOut'); showToast('The lantern’s oil is spent'); }
    if (events & EVENT.potOut) sound('potOut');
    if (events & EVENT.death) { sound('death'); renderer.burst(game.player_x(), 8, 18, 2); }
    if (events & EVENT.respawn) { sound('respawn'); const { width, height } = sizeRef.current; renderer.snap(game, width, height); showToast('Back at the last light'); }
    if (events & EVENT.checkpoint) {
      sound('checkpoint');
      showToast('Checkpoint — the light holds');
      const checkpoint = game.checkpoint();
      update(current => ({ ...current, checkpoint }));
    }
    if (events & EVENT.clear) {
      sound('clear');
      clearAtRef.current = performance.now();
    }
  }, [showToast, sound, update]);
  const lastEmberRef = useRef<[number, number]>([0, 0]);

  const finishStage = useCallback(() => {
    const game = gameRef.current;
    const seconds = game.time();
    const previousBest = progressRef.current.bestSeconds;
    const isBest = previousBest === 0 || seconds < previousBest;
    const best = isBest ? seconds : previousBest;
    update(current => ({ cleared: true, checkpoint: 0, bestSeconds: best, clears: current.clears + 1 }));
    setClearStats({ seconds, deaths: game.deaths(), best, isBest });
    setScreen('clear');
  }, [update]);

  // the fixed-step loop: only runs while playing and not paused
  useEffect(() => {
    if (screen !== 'playing' || isPaused) return;
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const game = gameRef.current;
      const elapsed = Math.min(200, now - lastFrameRef.current);
      lastFrameRef.current = now;
      game.set_input(keysRef.current | touchRef.current);
      game.advance(elapsed);
      if (game.ember_active()) lastEmberRef.current = [game.ember_x(), game.ember_y() + 7];
      const events = game.take_events();
      if (events) handleEvents(events);
      // footsteps and rats
      const walked = game.walked();
      if (Math.abs(walked - lastStepRef.current) > 21) { lastStepRef.current = walked; sound('step'); }
      const danger = game.danger();
      if (danger > 0.2 && Math.random() < danger * 0.08) sound(Math.random() < 0.5 ? 'squeak' : 'scurry');
      drawFrame(now);
      syncHud();
      if (clearAtRef.current && now - clearAtRef.current > 1400) { clearAtRef.current = 0; finishStage(); return; }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [screen, isPaused, drawFrame, handleEvents, syncHud, finishStage, sound]);

  // size the canvas to the stage; redraw once when idle
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const resize = () => {
      const box = stage.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width: box.width, height: box.height, ratio };
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(box.height * ratio);
      rendererRef.current.snap(gameRef.current, box.width, box.height);
      drawFrame();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [drawFrame]);

  // pause when the tab is hidden
  useEffect(() => {
    const onHidden = () => { if (document.hidden && screenRef.current === 'playing') setIsPaused(true); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const begin = useCallback((fromCheckpoint: number) => {
    unlockAudio();
    gameRef.current.free();
    const game = new EmberLane();
    if (fromCheckpoint > 0) game.debug_warp(fromCheckpoint);
    gameRef.current = game;
    update(current => ({ ...current, checkpoint: fromCheckpoint }));
    clearAtRef.current = 0;
    lastStepRef.current = 0;
    sectionRef.current = sectionAt(game.player_x());
    keysRef.current = 0;
    const { width, height } = sizeRef.current;
    rendererRef.current.snap(game, width, height);
    setClearStats(null);
    setIsPaused(false);
    setScreen('playing');
    showToast(SECTION_NAMES[sectionRef.current]);
    syncHud();
  }, [showToast, syncHud, update]);

  const interact = useCallback(() => { if (screenRef.current === 'playing' && !pausedRef.current) gameRef.current.interact(); }, []);
  const throwEmber = useCallback(() => {
    if (screenRef.current !== 'playing' || pausedRef.current) return;
    if (!gameRef.current.throw_ember() && gameRef.current.embers() === 0 && gameRef.current.state() !== STATE.dead) showToast('No embers left');
  }, [showToast]);
  const togglePause = useCallback(() => { if (screenRef.current === 'playing') setIsPaused(paused => !paused); }, []);

  // keyboard
  useEffect(() => {
    const bit = (key: string) => (key === 'ArrowLeft' || key === 'a' || key === 'A' ? BUTTON.left : key === 'ArrowRight' || key === 'd' || key === 'D' ? BUTTON.right : 0);
    const onDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (key === 'm' || key === 'M') { toggleMute(); return; }
      if (screenRef.current === 'start' && key === 'Enter') { event.preventDefault(); begin(progressRef.current.checkpoint); return; }
      if (screenRef.current !== 'playing') return;
      if (key === 'p' || key === 'P') { togglePause(); return; }
      const pressed = bit(key);
      if (pressed) { event.preventDefault(); keysRef.current |= pressed; return; }
      if (event.repeat) return;
      if (key === 'e' || key === 'E' || key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); interact(); }
      else if (key === 'f' || key === 'F' || key === ' ') { event.preventDefault(); throwEmber(); }
    };
    const onUp = (event: KeyboardEvent) => { keysRef.current &= ~bit(event.key); };
    const onBlur = () => { keysRef.current = 0; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); };
  }, [begin, interact, throwEmber, togglePause, toggleMute]);

  // test hook
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('emberTest') && !window.location.hash.includes('emberTest')) return;
    window.__emberTest = {
      game: () => gameRef.current,
      begin: (checkpoint: number) => begin(checkpoint),
      info: () => {
        const game = gameRef.current;
        return { x: game.player_x(), sibling: game.sibling_x(), siblingY: game.sibling_y(), onCrate: game.on_crate(), pot: game.pot_left(), deaths: game.deaths(), checkpoint: game.checkpoint(), cleared: game.cleared(), embers: game.embers(), carrying: game.carrying(), prompt: game.prompt(), lit: game.player_lit(), state: game.state(), time: game.time(), danger: game.danger(), crate: game.crate_x(0) };
      },
      flicker: () => readLights(gameRef.current).filter(light => light.kind === KIND.flicker)[0].intensity,
      windows: () => readLights(gameRef.current).filter(light => light.kind === KIND.window).map(light => light.lit),
      /** Walk Mira to x synchronously (the frame loop then catches up on drawing and events). */
      walkTo: (target: number) => {
        const game = gameRef.current;
        for (let step = 0; step < 4000 && Math.abs(game.player_x() - target) > 2 && game.state() !== STATE.dead; step++) {
          game.set_input(game.player_x() < target ? BUTTON.right : BUTTON.left);
          game.advance(1000 / 60);
        }
        game.set_input(0);
        return game.player_x();
      },
      wait: (seconds: number) => { const game = gameRef.current; game.set_input(0); for (let step = 0; step < seconds * 60; step++) game.advance(1000 / 60); },
    };
    return () => { delete window.__emberTest; };
  }, [begin]);

  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} className="ember-mute" />;
  const continueFrom = progress.checkpoint;

  return (
    <div className="game-shell ember" data-testid="ember-lane">
      <div className="ember-frame">
      <div className={`ember-stage${screen === 'playing' ? ' is-playing' : ''}`} ref={stageRef} data-testid="ember-stage">
        <canvas ref={canvasRef} className="ember-canvas" data-testid="ember-canvas" aria-label="Ember Lane street" />
        {screen === 'playing' && (
          <div className="ember-hud" data-testid="ember-hud">
            <div className="ember-hud__left">
              <span className="ember-hud__section" data-testid="ember-section">{SECTION_NAMES[hud.section]}</span>
              <span className="ember-hud__checkpoints" aria-label={`Checkpoint ${hud.checkpoint + 1} of ${CHECKPOINT_X.length}`}>
                {CHECKPOINT_X.map((_, index) => <i key={index} className={index <= hud.checkpoint ? 'is-lit' : ''} />)}
              </span>
            </div>
            <div className="ember-hud__right">
              <span className="ember-hud__embers" data-testid="ember-count" aria-label={`${hud.embers} embers`}>
                {Array.from({ length: Math.max(hud.embers, 0) }, (_, index) => <i key={index} />)}
                {hud.embers === 0 && <em>no embers</em>}
              </span>
              {hud.carrying && <span className="ember-hud__oil" data-testid="ember-oil" title="Lantern oil"><b style={{ width: `${(hud.oil / 16) * 100}%` }} /></span>}
              <button type="button" className="ember-icon-button ember-icon-button--menu" onClick={togglePause} data-testid="ember-pause" aria-label="Menu — pause, restart or quit (P)" title="Menu (P)" aria-haspopup="dialog">⋮</button>
              {mute}
            </div>
          </div>
        )}
        {screen === 'playing' && hud.hint && !isPaused && <p className="ember-hint" data-testid="ember-hint">{hud.hint}</p>}
        {screen === 'playing' && toast && !isPaused && <p key={toast.key} className="ember-toast" data-testid="ember-toast">{toast.text}</p>}
        {screen === 'start' && (
          <div className="ember-overlay ember-overlay--start" data-testid="ember-start">
            <div className="ember-title">
              <p className="ember-title__kicker">Chapter one · The night street</p>
              <h1>Ember Lane</h1>
              <p className="ember-title__tag">Keep to the light. Keep Lio close.</p>
            </div>
            <div className="ember-actions">
              {continueFrom > 0 && <button type="button" className="online-button online-button--primary" onClick={() => begin(continueFrom)} data-testid="ember-continue">Continue · {SECTION_NAMES[continueFrom + 1]}</button>}
              <button type="button" className={`online-button${continueFrom > 0 ? '' : ' online-button--primary'}`} onClick={() => begin(0)} data-testid="ember-play">{continueFrom > 0 ? 'Start over' : progress.cleared ? 'Play again' : 'Begin'}</button>
              {mute}
            </div>
            {progress.cleared && <p className="ember-record" data-testid="ember-record">Reached the sanctuary {progress.clears}× · best {formatTime(progress.bestSeconds)}</p>}
            <ControlsCard touch={touch} />
          </div>
        )}
        {screen === 'playing' && isPaused && (
          <div className="ember-overlay" data-testid="ember-paused">
            <h2 className="ember-overlay__heading">Paused</h2>
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => setIsPaused(false)} data-testid="ember-resume">Resume</button>
              <button type="button" className="online-button" onClick={() => begin(0)} data-testid="ember-restart">Restart stage</button>
              <button type="button" className="online-button" onClick={() => { setIsPaused(false); setScreen('start'); }} data-testid="ember-title">Title screen</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-quit">Quit game</button>
              {mute}
            </div>
            <ControlsCard touch={touch} />
          </div>
        )}
        {screen === 'clear' && clearStats && (
          <div className="ember-overlay ember-overlay--clear" data-testid="ember-clear">
            <p className="ember-title__kicker">Stage clear</p>
            <h2 className="ember-overlay__heading">Safe in the sanctuary</h2>
            <p className="ember-clear__line">Mira and Lio made it through the night street.</p>
            <dl className="ember-stats">
              <div><dt>Time</dt><dd data-testid="ember-clear-time">{formatTime(clearStats.seconds)}</dd></div>
              <div><dt>Falls</dt><dd data-testid="ember-clear-deaths">{clearStats.deaths}</dd></div>
              <div><dt>Best</dt><dd>{formatTime(clearStats.best)}{clearStats.isBest ? ' ★' : ''}</dd></div>
            </dl>
            <p className="ember-clear__next">More of the village waits beyond the sanctuary — the next stage is coming.</p>
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => begin(0)} data-testid="ember-again">Play again</button>
              <button type="button" className="online-button" onClick={() => setScreen('start')} data-testid="ember-menu">Title</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-clear-quit">Quit game</button>
            </div>
          </div>
        )}
      </div>
      {screen === 'playing' && touch && !isPaused && (
        <TouchControls buttonsRef={touchRef} onInteract={interact} onThrow={throwEmber} prompt={hud.prompt} embers={hud.embers} />
      )}
      </div>
    </div>
  );
}

/** Phone controls: a ◀ ▶ pad (slide between the halves) plus interact and throw. */
function TouchControls({ buttonsRef, onInteract, onThrow, prompt, embers }: { buttonsRef: React.MutableRefObject<number>; onInteract: () => void; onThrow: () => void; prompt: number; embers: number }) {
  const pointers = useRef(new Map<number, number>());
  const sync = () => { let held = 0; pointers.current.forEach(button => { held |= button; }); buttonsRef.current = held; };
  const buttonAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left + box.width / 2 ? BUTTON.left : BUTTON.right;
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    unlockAudio();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    pointers.current.set(event.pointerId, buttonAt(event)); sync();
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => { if (pointers.current.has(event.pointerId)) { pointers.current.set(event.pointerId, buttonAt(event)); sync(); } };
  const up = (event: ReactPointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); sync(); };
  useEffect(() => () => { buttonsRef.current = 0; }, [buttonsRef]);
  const tap = (action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { event.preventDefault(); unlockAudio(); action(); },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });
  return (
    <div className="ember-touch" data-testid="ember-touch">
      <div className="ember-touch__pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={event => event.preventDefault()} role="group" aria-label="Walk">
        <span className="ember-touch__key" data-testid="touch-left" aria-label="Walk left">◀</span>
        <span className="ember-touch__key" data-testid="touch-right" aria-label="Walk right">▶</span>
      </div>
      <div className="ember-touch__actions">
        <button type="button" className={`ember-touch__key ember-touch__key--action${prompt !== PROMPT.none ? ' is-ready' : ''}`} {...tap(onInteract)} data-testid="touch-interact" aria-label="Take, pull or climb">✋</button>
        <button type="button" className={`ember-touch__key ember-touch__key--fire${embers > 0 ? '' : ' is-empty'}`} {...tap(onThrow)} data-testid="touch-throw" aria-label="Throw an ember">🔥</button>
      </div>
    </div>
  );
}

