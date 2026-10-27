/**
 * Ember Lane — lead Mira and her little brother Kabir down a dark village street at night. Rats swarm any
 * shadow and flee from flame, so keep both children in the light: wait for a windmill's lamp sail to swing low, throw embers into cold
 * braziers, carry a lantern, push a crate out of the light and work the shutter levers to reach the sanctuary door.
 * Stage two ("The Guard Steps") goes down a staircase into a soldier's yard: stay out of his lamp light, snuff it with
 * a thrown stone, take him down in the dark, then relight it with an ember so Kabir will follow to the far gate.
 * Rust/wasm owns the light, rats, puzzles and movement on a fixed step; this file runs screens, input and drawing.
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { homePath, navigate } from '../../routing';
import { createSaveSlot, SAVE_VERSIONS } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { BUTTON, CHECKPOINT_X, EmberLane, emptyProgress, EVENT, GUARD, GUARD_EVENT, GUARD_PROMPT, GUARD_STATE, GuardSteps, guardHint, hintFor, ITEM, KILLED_BY, KIND, LANTERN_OIL, loadEmberLaneEngine, parseProgress, type Progress, PROMPT, readLights, scorpionsOut, SECTION_NAMES, STATE } from './engine';
import { GuardRenderer } from './guardRender';
import { Renderer } from './render';
import { type EmberSound, playEmberSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './emberlane.css';

const createProgressSlot = () => createSaveSlot<Progress>({ gameId: 'ember-lane', version: SAVE_VERSIONS['ember-lane'], parse: parseProgress });
const SECTION_STARTS = [0, 300, 990, 1700, 2410, 3000];
const sectionAt = (x: number) => SECTION_STARTS.reduce((found, start, index) => (x >= start ? index : found), 0);
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
/** Phones held upright: the street is a wide stealth stage, so we ask for landscape instead of playing cramped. */
const PORTRAIT_PHONE = '(pointer: coarse) and (orientation: portrait) and (max-width: 700px)';
const isPortraitPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PORTRAIT_PHONE).matches;
function usePortraitPhone() {
  const [portrait, setPortrait] = useState(isPortraitPhone);
  useEffect(() => {
    const query = window.matchMedia?.(PORTRAIT_PHONE);
    if (!query) return;
    const onChange = () => setPortrait(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    window.addEventListener('resize', onChange);
    return () => { query.removeEventListener?.('change', onChange); window.removeEventListener('resize', onChange); };
  }, []);
  return portrait;
}
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
const canForceLandscape = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !!(window.screen.orientation as LockableOrientation | undefined)?.lock;
/** Android browsers can go full screen and lock sideways; iOS can't, so the prompt just asks to turn the phone. */
async function forceLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await (window.screen.orientation as LockableOrientation).lock?.('landscape');
  } catch { /* not allowed here: the rotate prompt stays up */ }
}

/** Shown over everything on a phone held upright. */
function RotatePrompt({ onBack }: { onBack: () => void }) {
  const [canForce] = useState(canForceLandscape);
  return (
    <div className="ember-rotate" role="dialog" aria-modal="true" aria-labelledby="ember-rotate-title" data-testid="ember-rotate">
      <div className="ember-rotate__phone" aria-hidden="true"><span /></div>
      <h2 id="ember-rotate-title">Turn your phone sideways</h2>
      <p>Ember Lane is played in landscape — you need the whole street in view to keep to the light and slip past the guard.</p>
      <div className="ember-actions">
        {canForce && <button type="button" className="online-button online-button--primary" onClick={() => { unlockAudio(); void forceLandscape(); }} data-testid="ember-rotate-fullscreen">Play full screen</button>}
        <button type="button" className="online-button" onClick={onBack} data-testid="ember-rotate-back">← Back to games</button>
      </div>
      <p className="ember-rotate__note">Your progress waits for you — the game pauses while the phone is upright.</p>
    </div>
  );
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function EmberLaneGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadEmberLaneEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell ember" data-testid="ember-loading"><p className="game-help">Lighting the torches…</p></div>;
  return <EmberLaneScreens />;
}

type Screen = 'start' | 'playing' | 'clear' | 'caught';
type Stage = 1 | 2;
interface Hud { section: number; embers: number; oil: number; carrying: boolean; prompt: number; hint: string; checkpoint: number; deaths: number; dead: boolean; stones: number; item: number }
interface ClearStats { stage: Stage; seconds: number; deaths: number; best: number; isBest: boolean }
const STAGE_TWO_NAME = 'The Guard Steps';

/** A little grey stone (emoji stones don't render everywhere). */
function StoneIcon() {
  return (
    <svg className="ember-stone-icon" viewBox="0 0 14 12" aria-hidden="true">
      <path d="M2 9.5C0.6 8 1.2 4.6 3.4 3 5.6 1.2 9.6 1 11.8 3c1.9 1.8 1.6 5.2-0.4 6.6C9.6 11 4 11.2 2 9.5Z" fill="#8f8a84" stroke="#3c3934" strokeWidth="0.9" />
      <path d="M4 4.6c1.4-1.2 3.6-1.5 5-0.8" fill="none" stroke="#c9c4bc" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

/** Stage two's ember / stone selector for the HUD (desktop): click either, or press Q to switch. */
function ItemSelector({ item, embers, stones, onSelect }: { item: number; embers: number; stones: number; onSelect: (item: number) => void }) {
  return (
    <span className="ember-items" role="radiogroup" aria-label="Throw: ember or stone (Q switches)" data-testid="ember-items">
      <button type="button" role="radio" aria-checked={item === ITEM.ember} className={item === ITEM.ember ? 'is-selected' : ''} onClick={() => onSelect(ITEM.ember)} data-testid="item-ember" title="Ember — relights a lamp (Q)">🔥 Ember ×{embers}</button>
      <button type="button" role="radio" aria-checked={item === ITEM.stone} className={item === ITEM.stone ? 'is-selected' : ''} onClick={() => onSelect(ITEM.stone)} data-testid="item-stone" title="Stone — puts a lamp out (Q)"><StoneIcon /> Stone ×{stones}</button>
      <kbd aria-hidden="true">Q</kbd>
    </span>
  );
}

declare global { interface Window { __emberTest?: Record<string, unknown> } }

function ControlsCard({ touch }: { touch: boolean }) {
  return (
    <section className="ember-card ember-controls" data-testid="ember-controls">
      <h2>How to survive</h2>
      <ul>
        <li><b>Rats own the dark.</b> Step out of the light — or let Kabir fall behind in it — and they swarm. Flame drives them back.</li>
        <li><b>Embers</b> light cold braziers and fire pots in the direction you face. You only carry a few.</li>
        <li>Carry the <b>lantern</b> while its oil lasts, push <b>crates</b> out of the light — or climb onto one: rats can’t climb — and pull <b>levers</b> to open shutters.</li>
        <li>Fall, and you wake at the last lit <b>checkpoint</b>.</li>
        <li><b>Stage 2 · The Guard Steps:</b> a soldier patrols the yard below. In his lamp light the eye over his head fills with suspicion — when it’s full, he comes for you. Throw a <b>stone</b> to put the lamp out. The <b>rats</b> under the drain wake in the dark — then the <b>scorpions</b> from the crack in the yard — and swarm anyone standing in it, him too. Both flee from light: wait on the steps and they’ll take him, or hurry down and take him down from behind before they come up. Then relight the lamp with an <b>ember</b>.</li>
      </ul>
      {touch
        ? <p className="ember-keys">◀ ▶ walk · <b>✋</b> take / pull / climb / strike · the button beside ✋ picks <b>ember or stone</b> · the last button throws it</p>
        : <p className="ember-keys">← → or A D walk · E or ↑ take / pull / climb / strike · F or Space throw · Q switch ember / stone · P or ⋮ menu · M mute</p>}
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
  const portrait = usePortraitPhone();

  const [screen, setScreen] = useState<Screen>('start');
  const [stage, setStage] = useState<Stage>(1);
  const stageNumberRef = useRef<Stage>(1);
  stageNumberRef.current = stage;
  const guardRef = useRef<GuardSteps | null>(null);
  const guardRendererRef = useRef(new GuardRenderer());
  const caughtAtRef = useRef(0);
  const [killedBy, setKilledBy] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hud, setHud] = useState<Hud>({ section: 0, embers: 0, oil: 0, carrying: false, prompt: 0, hint: '', checkpoint: 0, deaths: 0, dead: false, stones: 0, item: ITEM.stone });
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
    const guard = guardRef.current;
    if (stageNumberRef.current === 2 && guard) { guardRendererRef.current.draw(context, guard, width, height, ratio, now, { prompt: screenRef.current === 'playing' ? guard.prompt() : 0, touch }); return; }
    const game = gameRef.current;
    rendererRef.current.draw(context, game, width, height, ratio, now, { prompt: screenRef.current === 'playing' ? game.prompt() : 0, touch });
  }, [touch]);

  const syncHud = useCallback(() => {
    const guard = guardRef.current;
    if (stageNumberRef.current === 2 && guard) {
      const next: Hud = {
        section: -1, embers: guard.embers(), oil: 0, carrying: false, prompt: guard.prompt(), checkpoint: 0, deaths: 0, dead: guard.state() === STATE.dead, stones: guard.stones(), item: guard.item(),
        hint: guardHint({ dead: guard.state() === STATE.dead, x: guard.player_x(), lampLit: guard.lamp_lit(), guardState: guard.guard_state(), kabirFollows: guard.kabir_follows(), stones: guard.stones(), embers: guard.embers(), item: guard.item(), relighting: guard.relight_progress() > 0, ratsOut: guard.dark_time() >= GUARD.drainDelay, guardEaten: guard.guard_eaten(), guardBeset: guard.guard_beset() }),
      };
      const previous = hudRef.current;
      if ((Object.keys(next) as (keyof Hud)[]).some(key => next[key] !== previous[key])) { hudRef.current = next; setHud(next); }
      return;
    }
    const game = gameRef.current;
    const x = game.player_x();
    const next: Hud = {
      section: sectionAt(x), embers: game.embers(), oil: Math.ceil(game.oil()), carrying: game.carrying(), prompt: game.prompt(),
      hint: hintFor(x, game.carrying(), game.embers(), { onCrate: game.on_crate(), potLit: game.pot_left() > 0, crateX: game.crate_x(0) }), checkpoint: game.checkpoint(), deaths: game.deaths(), dead: game.state() === STATE.dead,
      stones: 0, item: ITEM.ember,
    };
    const previous = hudRef.current;
    if ((Object.keys(next) as (keyof Hud)[]).some(key => next[key] !== previous[key])) { hudRef.current = next; setHud(next); }
    if (next.section !== sectionRef.current) { sectionRef.current = next.section; showToast(SECTION_NAMES[next.section]); }
  }, [showToast]);

  const handleEvents = useCallback((events: number) => {
    const game = gameRef.current;
    const renderer = rendererRef.current;
    if (events & EVENT.throw) sound('throw');
    if (events & EVENT.ignite) { sound('ignite'); renderer.burst(lastEmberRef.current[0], lastEmberRef.current[1], 26); renderer.flash(lastEmberRef.current[0], lastEmberRef.current[1], 1); }
    if (events & EVENT.fizzle) { sound('fizzle'); renderer.burst(lastEmberRef.current[0], lastEmberRef.current[1], 8, 2); renderer.burst(lastEmberRef.current[0], lastEmberRef.current[1], 10, 0); renderer.flash(lastEmberRef.current[0], lastEmberRef.current[1], 0.45); }
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
  const lastDarkRef = useRef(0);

  const handleGuardEvents = useCallback((events: number) => {
    const guard = guardRef.current;
    if (!guard) return;
    const renderer = guardRendererRef.current;
    const [mx, my] = lastEmberRef.current;
    if (events & GUARD_EVENT.throw) sound('throw');
    if (events & GUARD_EVENT.snuff) { sound('snuff'); renderer.snuffed(); showToast('The lamp goes out'); }
    if (events & GUARD_EVENT.clatter) { sound('clatter'); renderer.burst(mx, my, 6, 2); }
    if (events & GUARD_EVENT.ignite) { sound('ignite'); renderer.burst(mx, my, 26); renderer.flash(mx, my, 1); }
    if (events & GUARD_EVENT.fizzle) { sound('fizzle'); renderer.burst(mx, my, 8, 2); renderer.burst(mx, my, 10, 0); renderer.flash(mx, my, 0.45); }
    if (events & GUARD_EVENT.take) sound('take');
    if (events & GUARD_EVENT.notice) sound('notice');
    if (events & GUARD_EVENT.alarm) { sound('alarm'); showToast('He’s seen you!'); }
    if (events & GUARD_EVENT.spear) sound('spear');
    if (events & GUARD_EVENT.death) sound('death');
    if (events & GUARD_EVENT.takedown) { sound('takedown'); renderer.burst(guard.guard_x(), guard.guard_y() + 6, 10, 2); }
    if (events & GUARD_EVENT.guardRelit) { sound('ignite'); showToast('He relit the lamp'); }
    if (events & GUARD_EVENT.kabirComes) { sound('checkpoint'); showToast('Kabir comes down to you'); }
    if (events & GUARD_EVENT.clear) { sound('clear'); clearAtRef.current = performance.now(); }
    if (events & GUARD_EVENT.caught) caughtAtRef.current = performance.now();
    if (events & GUARD_EVENT.ratsOut) { sound('scurry'); showToast('Rats! Up out of the drain'); }
    if (events & GUARD_EVENT.guardEaten) { sound('death'); renderer.burst(guard.guard_x(), guard.guard_y() + 6, 12, 2); showToast('Rats and scorpions took the soldier'); }
    if (events & GUARD_EVENT.bitten) setKilledBy(KILLED_BY.rats);
  }, [showToast, sound]);

  const finishStage = useCallback(() => {
    const guard = guardRef.current;
    if (stageNumberRef.current === 2 && guard) {
      const seconds = guard.time();
      const previousBest = progressRef.current.stage2BestSeconds;
      const isBest = previousBest === 0 || seconds < previousBest;
      const best = isBest ? seconds : previousBest;
      update(current => ({ ...current, stage: 2, stage2Unlocked: true, stage2BestSeconds: best, stage2Clears: current.stage2Clears + 1 }));
      setClearStats({ stage: 2, seconds, deaths: 0, best, isBest });
      setScreen('clear');
      return;
    }
    const game = gameRef.current;
    const seconds = game.time();
    const previousBest = progressRef.current.bestSeconds;
    const isBest = previousBest === 0 || seconds < previousBest;
    const best = isBest ? seconds : previousBest;
    // clearing the night street opens stage two; Continue now picks up there
    update(current => ({ ...current, cleared: true, checkpoint: 0, bestSeconds: best, clears: current.clears + 1, stage: 2, stage2Unlocked: true }));
    setClearStats({ stage: 1, seconds, deaths: game.deaths(), best, isBest });
    setScreen('clear');
  }, [update]);

  // the fixed-step loop: only runs while playing and not paused
  useEffect(() => {
    if (screen !== 'playing' || isPaused) return;
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const guard = guardRef.current;
      if (stageNumberRef.current === 2 && guard) {
        const elapsed = Math.min(200, now - lastFrameRef.current);
        lastFrameRef.current = now;
        guard.set_input(keysRef.current | touchRef.current);
        guard.advance(elapsed);
        if (guard.missile_active()) lastEmberRef.current = [guard.missile_x(), guard.missile_y() + 7];
        const events = guard.take_events();
        if (events) handleGuardEvents(events);
        // the scorpions follow the rats out of the dark a little later (watched here: no engine event for it)
        const dark = guard.dark_time();
        if (lastDarkRef.current < GUARD.scorpionDelay && dark >= GUARD.scorpionDelay && guard.state() !== STATE.dead) { sound('scurry'); showToast('Scorpions! Out of the crack in the yard'); }
        lastDarkRef.current = dark;
        const walked = guard.walked();
        if (Math.abs(walked - lastStepRef.current) > 21) { lastStepRef.current = walked; sound('step'); }
        const danger = Math.max(guard.danger(), guard.guard_danger() * 0.6);
        if (danger > 0.2 && Math.random() < danger * 0.08) sound(Math.random() < 0.5 ? 'squeak' : 'scurry');
        drawFrame(now);
        syncHud();
        if (clearAtRef.current && now - clearAtRef.current > 1400) { clearAtRef.current = 0; finishStage(); return; }
        if (caughtAtRef.current) { caughtAtRef.current = 0; setScreen('caught'); return; }
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
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
  }, [screen, isPaused, drawFrame, handleEvents, handleGuardEvents, syncHud, finishStage, sound, showToast]);

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
      if (stageNumberRef.current === 2 && guardRef.current) guardRendererRef.current.snap(guardRef.current, box.width, box.height);
      else rendererRef.current.snap(gameRef.current, box.width, box.height);
      drawFrame();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [drawFrame]);

  // a phone turned upright mid-run pauses (the rotate prompt covers the game); turning back shows the pause menu
  useEffect(() => { if (portrait && screenRef.current === 'playing') { keysRef.current = 0; touchRef.current = 0; setIsPaused(true); } }, [portrait]);

  // leaving the game undoes a full-screen landscape lock taken from the rotate prompt
  useEffect(() => () => {
    if (!document.fullscreenElement) return;
    try { (window.screen.orientation as LockableOrientation & { unlock?: () => void }).unlock?.(); } catch { /* nothing locked */ }
    void document.exitFullscreen?.().catch(() => {});
  }, []);

  // pause when the tab is hidden
  useEffect(() => {
    const onHidden = () => { if (document.hidden && screenRef.current === 'playing') setIsPaused(true); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const dropGuard = () => { guardRef.current?.free(); guardRef.current = null; };
  const begin = useCallback((fromCheckpoint: number) => {
    unlockAudio();
    dropGuard();
    stageNumberRef.current = 1;
    setStage(1);
    gameRef.current.free();
    const game = new EmberLane();
    if (fromCheckpoint > 0) game.debug_warp(fromCheckpoint);
    gameRef.current = game;
    update(current => ({ ...current, checkpoint: fromCheckpoint, stage: 1 }));
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

  /** Stage two: Mira and Kabir step out of the sanctuary's back door onto the terrace above the guarded yard. */
  const beginGuard = useCallback(() => {
    unlockAudio();
    dropGuard();
    const guard = new GuardSteps();
    guardRef.current = guard;
    stageNumberRef.current = 2;
    setStage(2);
    update(current => ({ ...current, stage: 2, stage2Unlocked: true }));
    clearAtRef.current = 0;
    caughtAtRef.current = 0;
    setKilledBy(KILLED_BY.spear);
    lastStepRef.current = 0;
    keysRef.current = 0;
    const { width, height } = sizeRef.current;
    guardRendererRef.current.snap(guard, width, height);
    setClearStats(null);
    setIsPaused(false);
    setScreen('playing');
    showToast(`Stage 2 · ${STAGE_TWO_NAME}`);
    syncHud();
  }, [showToast, syncHud, update]);
  const restartStage = useCallback(() => (stageNumberRef.current === 2 ? beginGuard() : begin(0)), [begin, beginGuard]);

  const interact = useCallback(() => {
    if (screenRef.current !== 'playing' || pausedRef.current) return;
    if (stageNumberRef.current === 2 && guardRef.current) guardRef.current.interact(); else gameRef.current.interact();
  }, []);
  const throwEmber = useCallback(() => {
    if (screenRef.current !== 'playing' || pausedRef.current) return;
    const guard = guardRef.current;
    if (stageNumberRef.current === 2 && guard) {
      if (!guard.throw_selected() && guard.state() !== STATE.dead) {
        if (guard.item() === ITEM.stone && guard.stones() === 0) showToast('No stones — the pile is on the terrace');
        else if (guard.item() === ITEM.ember && guard.embers() === 0) showToast('No ember — take one from the terrace torch');
      }
      return;
    }
    if (!gameRef.current.throw_ember() && gameRef.current.embers() === 0 && gameRef.current.state() !== STATE.dead) showToast('No embers left');
  }, [showToast]);
  const selectItem = useCallback((item: number | 'toggle') => {
    const guard = guardRef.current;
    if (stageNumberRef.current !== 2 || !guard || screenRef.current !== 'playing') return;
    if (item === 'toggle') guard.toggle_item(); else guard.select_item(item);
    sound('select');
    syncHud();
  }, [sound, syncHud]);
  const togglePause = useCallback(() => { if (screenRef.current === 'playing') setIsPaused(paused => !paused); }, []);

  // keyboard
  useEffect(() => {
    const bit = (key: string) => (key === 'ArrowLeft' || key === 'a' || key === 'A' ? BUTTON.left : key === 'ArrowRight' || key === 'd' || key === 'D' ? BUTTON.right : 0);
    const onDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (key === 'm' || key === 'M') { toggleMute(); return; }
      if (screenRef.current === 'start' && key === 'Enter') { event.preventDefault(); if (progressRef.current.stage === 2) beginGuard(); else begin(progressRef.current.checkpoint); return; }
      if (screenRef.current !== 'playing') return;
      if (key === 'p' || key === 'P') { togglePause(); return; }
      const pressed = bit(key);
      if (pressed) { event.preventDefault(); keysRef.current |= pressed; return; }
      if (event.repeat) return;
      if (key === 'e' || key === 'E' || key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); interact(); }
      else if (key === 'f' || key === 'F' || key === ' ') { event.preventDefault(); throwEmber(); }
      else if (key === 'q' || key === 'Q' || key === 'Tab') { if (stageNumberRef.current === 2) { event.preventDefault(); selectItem('toggle'); } }
      else if (key === '1') selectItem(ITEM.ember);
      else if (key === '2') selectItem(ITEM.stone);
    };
    const onUp = (event: KeyboardEvent) => { keysRef.current &= ~bit(event.key); };
    const onBlur = () => { keysRef.current = 0; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); };
  }, [begin, beginGuard, interact, throwEmber, selectItem, togglePause, toggleMute]);

  // test hook
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('emberTest') && !window.location.hash.includes('emberTest')) return;
    window.__emberTest = {
      game: () => gameRef.current,
      begin: (checkpoint: number) => begin(checkpoint),
      beginGuard: () => beginGuard(),
      guard: () => {
        const guard = guardRef.current;
        if (!guard) return null;
        return { x: guard.player_x(), y: guard.player_y(), guardX: guard.guard_x(), guardState: guard.guard_state(), suspicion: guard.suspicion(), lamp: guard.lamp_lit(), stones: guard.stones(), embers: guard.embers(), item: guard.item(), prompt: guard.prompt(), kabirFollows: guard.kabir_follows(), cleared: guard.cleared(), caught: guard.caught(), state: guard.state(), target: guard.throw_target(), relight: guard.relight_progress(), darkTime: guard.dark_time(), danger: guard.danger(), guardDanger: guard.guard_danger(), guardEaten: guard.guard_eaten(), killedBy: guard.killed_by(), scorpionsOut: scorpionsOut(guard) };
      },
      /** Stage two: walk Mira to x synchronously. */
      guardWalkTo: (target: number) => {
        const guard = guardRef.current;
        if (!guard) return null;
        for (let step = 0; step < 4000 && Math.abs(guard.player_x() - target) > 2 && guard.state() !== STATE.dead; step++) {
          guard.set_input(guard.player_x() < target ? BUTTON.right : BUTTON.left);
          guard.advance(1000 / 60);
        }
        guard.set_input(0);
        return guard.player_x();
      },
      guardWait: (seconds: number) => { const guard = guardRef.current; if (!guard) return; guard.set_input(0); for (let step = 0; step < seconds * 60; step++) guard.advance(1000 / 60); },
      guardPlace: (x: number, guardX?: number, facing?: number) => { const guard = guardRef.current; if (!guard) return; guard.debug_place(x); if (guardX !== undefined) guard.debug_guard(guardX, facing ?? 1); },
      info: () => {
        const game = gameRef.current;
        return { x: game.player_x(), sibling: game.sibling_x(), siblingY: game.sibling_y(), onCrate: game.on_crate(), standingOn: game.standing_on(), pot: game.pot_left(), deaths: game.deaths(), checkpoint: game.checkpoint(), cleared: game.cleared(), embers: game.embers(), carrying: game.carrying(), prompt: game.prompt(), lit: game.player_lit(), state: game.state(), time: game.time(), danger: game.danger(), crate: game.crate_x(0) };
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
  }, [begin, beginGuard]);

  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} className="ember-mute" />;
  const continueFrom = progress.checkpoint;

  return (
    <div className={`game-shell ember${touch ? ' is-touch' : ''}`} data-testid="ember-lane">
      {portrait && <RotatePrompt onBack={() => navigate(homePath)} />}
      <div className="ember-frame">
      <div className={`ember-stage${screen === 'playing' ? ' is-playing' : ''}`} ref={stageRef} data-testid="ember-stage">
        <canvas ref={canvasRef} className="ember-canvas" data-testid="ember-canvas" aria-label="Ember Lane street" />
        {screen === 'playing' && (
          <div className="ember-hud" data-testid="ember-hud">
            <div className="ember-hud__left">
              <span className="ember-hud__section" data-testid="ember-section">{stage === 2 ? STAGE_TWO_NAME : SECTION_NAMES[hud.section]}</span>
              {stage === 1 && (
                <span className="ember-hud__checkpoints" aria-label={`Checkpoint ${hud.checkpoint + 1} of ${CHECKPOINT_X.length}`}>
                  {CHECKPOINT_X.map((_, index) => <i key={index} className={index <= hud.checkpoint ? 'is-lit' : ''} />)}
                </span>
              )}
            </div>
            <div className="ember-hud__right">
              {stage === 2 && !touch
                ? <ItemSelector item={hud.item} embers={hud.embers} stones={hud.stones} onSelect={selectItem} />
                : (
                  <span className="ember-hud__embers" data-testid="ember-count" aria-label={`${hud.embers} embers`}>
                    {Array.from({ length: Math.max(hud.embers, 0) }, (_, index) => <i key={index} />)}
                    {hud.embers === 0 && <em>no embers</em>}
                  </span>
                )}
              {hud.carrying && <span className="ember-hud__oil" data-testid="ember-oil" title="Lantern oil"><b style={{ width: `${(hud.oil / LANTERN_OIL) * 100}%` }} /></span>}
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
              <p className="ember-title__kicker">{progress.stage === 2 ? `Chapter one · Stage 2 · ${STAGE_TWO_NAME}` : 'Chapter one · The night street'}</p>
              <h1>Ember Lane</h1>
              <p className="ember-title__tag">Keep to the light. Keep Kabir close.</p>
            </div>
            <div className="ember-actions">
              {progress.stage === 2
                ? <button type="button" className="online-button online-button--primary" onClick={beginGuard} data-testid="ember-continue">Continue · Stage 2 · {STAGE_TWO_NAME}</button>
                : continueFrom > 0 && <button type="button" className="online-button online-button--primary" onClick={() => begin(continueFrom)} data-testid="ember-continue">Continue · {SECTION_NAMES[continueFrom + 1]}</button>}
              <button type="button" className={`online-button${continueFrom > 0 || progress.stage === 2 ? '' : ' online-button--primary'}`} onClick={() => begin(0)} data-testid="ember-play">{progress.stage === 2 ? 'Stage 1 · The night street' : continueFrom > 0 ? 'Start over' : progress.cleared ? 'Play again' : 'Begin'}</button>
              {progress.stage2Unlocked && progress.stage !== 2 && <button type="button" className="online-button" onClick={beginGuard} data-testid="ember-stage2">Stage 2 · {STAGE_TWO_NAME}</button>}
              {mute}
            </div>
            {progress.cleared && <p className="ember-record" data-testid="ember-record">Reached the sanctuary {progress.clears}× · best {formatTime(progress.bestSeconds)}{progress.stage2Clears > 0 ? ` · through the guard’s gate ${progress.stage2Clears}× · best ${formatTime(progress.stage2BestSeconds)}` : ''}</p>}
            <ControlsCard touch={touch} />
          </div>
        )}
        {screen === 'playing' && isPaused && (
          <div className="ember-overlay" data-testid="ember-paused">
            <h2 className="ember-overlay__heading">Paused</h2>
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => setIsPaused(false)} data-testid="ember-resume">Resume</button>
              <button type="button" className="online-button" onClick={restartStage} data-testid="ember-restart">Restart stage</button>
              <button type="button" className="online-button" onClick={() => { setIsPaused(false); setScreen('start'); }} data-testid="ember-title">Title screen</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-quit">Quit game</button>
              {mute}
            </div>
            <ControlsCard touch={touch} />
          </div>
        )}
        {screen === 'clear' && clearStats && clearStats.stage === 1 && (
          <div className="ember-overlay ember-overlay--clear" data-testid="ember-clear">
            <p className="ember-title__kicker">Stage 1 clear</p>
            <h2 className="ember-overlay__heading">Safe in the sanctuary</h2>
            <p className="ember-clear__line">Mira and Kabir made it through the night street.</p>
            <dl className="ember-stats">
              <div><dt>Time</dt><dd data-testid="ember-clear-time">{formatTime(clearStats.seconds)}</dd></div>
              <div><dt>Falls</dt><dd data-testid="ember-clear-deaths">{clearStats.deaths}</dd></div>
              <div><dt>Best</dt><dd>{formatTime(clearStats.best)}{clearStats.isBest ? ' ★' : ''}</dd></div>
            </dl>
            <p className="ember-clear__next">The sanctuary’s back door opens onto a terrace — and a guarded yard below.</p>
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={beginGuard} data-testid="ember-next">Stage 2 · {STAGE_TWO_NAME} →</button>
              <button type="button" className="online-button" onClick={() => begin(0)} data-testid="ember-again">Play stage 1 again</button>
              <button type="button" className="online-button" onClick={() => setScreen('start')} data-testid="ember-menu">Title</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-clear-quit">Quit game</button>
            </div>
          </div>
        )}
        {screen === 'clear' && clearStats && clearStats.stage === 2 && (
          <div className="ember-overlay ember-overlay--clear" data-testid="ember-clear">
            <p className="ember-title__kicker">Stage 2 clear</p>
            <h2 className="ember-overlay__heading">Through the guard’s gate</h2>
            <p className="ember-clear__line">The lamp burns again, the soldier lies still, and Mira and Kabir slip out onto the moonlit road.</p>
            <dl className="ember-stats">
              <div><dt>Time</dt><dd data-testid="ember-clear-time">{formatTime(clearStats.seconds)}</dd></div>
              <div><dt>Best</dt><dd>{formatTime(clearStats.best)}{clearStats.isBest ? ' ★' : ''}</dd></div>
            </dl>
            <p className="ember-clear__next">More of the road waits beyond the gate — the next stage is coming.</p>
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={beginGuard} data-testid="ember-again">Play stage 2 again</button>
              <button type="button" className="online-button" onClick={() => setScreen('start')} data-testid="ember-menu">Title</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-clear-quit">Quit game</button>
            </div>
          </div>
        )}
        {screen === 'caught' && (
          <div className="ember-overlay ember-overlay--caught" data-testid="ember-caught">
            <p className="ember-title__kicker">Game over</p>
            {killedBy === KILLED_BY.rats ? (<>
              <h2 className="ember-overlay__heading">Rats and scorpions</h2>
              <p className="ember-clear__line">Rats came up out of the drain, scorpions out of the crack, once the lamp had been dark a while. Wait on the steps and let them find him — or be quick, and relight the lamp.</p>
            </>) : (<>
              <h2 className="ember-overlay__heading">The guard’s spear</h2>
              <p className="ember-clear__line">He saw you in the light. Keep to the shadows — or put his lamp out first.</p>
            </>)}
            <div className="ember-actions">
              <button type="button" className="online-button online-button--primary" onClick={beginGuard} data-testid="ember-retry">Try again</button>
              <button type="button" className="online-button" onClick={() => setScreen('start')} data-testid="ember-caught-title">Title</button>
              <button type="button" className="online-button" onClick={() => navigate(homePath)} data-testid="ember-caught-quit">Quit game</button>
            </div>
          </div>
        )}
      </div>
      {screen === 'playing' && touch && !isPaused && !portrait && (
        <TouchControls buttonsRef={touchRef} onInteract={interact} onThrow={throwEmber} prompt={hud.prompt} embers={hud.embers}
          items={stage === 2 ? { item: hud.item, stones: hud.stones, onToggle: () => selectItem('toggle') } : undefined} />
      )}
      </div>
    </div>
  );
}

/** Phone controls: a ◀ ▶ pad (slide between the halves) plus interact and throw. */
interface TouchItems { item: number; stones: number; onToggle: () => void }
function TouchControls({ buttonsRef, onInteract, onThrow, prompt, embers, items }: { buttonsRef: React.MutableRefObject<number>; onInteract: () => void; onThrow: () => void; prompt: number; embers: number; items?: TouchItems }) {
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
        <button type="button" className={`ember-touch__key ember-touch__key--action${prompt !== PROMPT.none ? ' is-ready' : ''}`} {...tap(onInteract)} data-testid="touch-interact" aria-label="Take, pull, climb or strike">✋</button>
        {items && (
          <button type="button" className="ember-touch__key ember-touch__key--select" {...tap(items.onToggle)} data-testid="touch-select"
            aria-label={`Selected: ${items.item === ITEM.stone ? 'stone' : 'ember'}. Tap to switch`}>
            {items.item === ITEM.stone ? <StoneIcon /> : <span aria-hidden="true">🔥</span>}
            <small>{items.item === ITEM.stone ? 'Stone' : 'Ember'}</small>
            <b aria-hidden="true">{items.item === ITEM.stone ? items.stones : embers}</b>
          </button>
        )}
        {(() => {
          const stone = items?.item === ITEM.stone;
          const count = stone ? items!.stones : embers;
          return (
            <button type="button" className={`ember-touch__key ember-touch__key--fire${count > 0 ? '' : ' is-empty'}`} {...tap(onThrow)} data-testid="touch-throw" aria-label={stone ? 'Throw a stone' : 'Throw an ember'}>
              {stone ? <StoneIcon /> : '🔥'}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

