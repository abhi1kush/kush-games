/**
 * Ghat Climb — drive a jeep up one mountain road. Gas lifts the nose, brake brings it down. Coins and jerry cans
 * sit on the dirt; the tank runs dry if you hold the gas the whole way. Rust/wasm owns the road and the jeep.
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createSaveSlot, SAVE_VERSIONS } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { BUTTON, EVENT, engineMood, FUEL_MAX, GhatClimb, loadGhatEngine, parseRun, PHASE, type RunSave } from './engine';
import { Renderer } from './render';
import { playGhatSound, type GhatSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './ghat.css';

const BEST_KEY = 'kush-games-ghat-climb-best';
const createRunSlot = () => createSaveSlot<RunSave>({ gameId: 'ghat-climb', version: SAVE_VERSIONS['ghat-climb'], parse: parseRun });
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (score: number) => { try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* storage unavailable */ } };
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

interface Hud { meters: number; fuel: number; coins: number; score: number; phase: number }

declare global { interface Window { __ghatTest?: Record<string, unknown> } }

export default function GhatClimbGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadGhatEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell ghat" data-testid="ghat-loading"><p className="game-help">Warming the engine…</p></div>;
  return <GhatClimbScreens />;
}

function GhatClimbScreens() {
  const [slot] = useState(createRunSlot);
  const savedRun = useRef<RunSave | null>(slot.load());
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: GhatSound) => playGhatSound(kind, isMutedRef.current), [isMutedRef]);
  const [touch] = useState(isTouchDevice);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(readBest);
  const [hud, setHud] = useState<Hud>({ meters: 0, fuel: FUEL_MAX, coins: 0, score: 0, phase: PHASE.ready });
  const gameRef = useRef<GhatClimb>(new GhatClimb());
  const rendererRef = useRef(new Renderer());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, ratio: 1 });
  const keysRef = useRef(0);
  const touchRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const hudRef = useRef(hud);
  const frameRef = useRef(0);
  const lastRef = useRef(0);
  const engineAtRef = useRef(0);
  const saveAtRef = useRef(0);
  const gaugeRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const [debug, setDebug] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ghatDebug'));

  const draw = useCallback((now = performance.now()) => {
    const canvas = canvasRef.current;
    const { width, height, ratio } = sizeRef.current;
    if (!canvas || width === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gasHeld = ((keysRef.current | touchRef.current) & BUTTON.gas) !== 0;
    rendererRef.current.draw(context, gameRef.current, width, height, ratio, now, gasHeld);
  }, []);

  /** Engine gauge and debug panel, written straight to the DOM every frame. */
  const readout = useCallback(() => {
    const game = gameRef.current;
    const buttons = keysRef.current | touchRef.current;
    const { mood, effort } = engineMood((buttons & BUTTON.gas) !== 0, game.fuel(), game.strain(), game.contact());
    const gauge = gaugeRef.current;
    if (gauge) {
      gauge.dataset.mood = mood;
      const bar = gauge.querySelector('b');
      if (bar) bar.style.width = `${Math.round(effort * 100)}%`;
      const label = gauge.querySelector('em');
      if (label && label.textContent !== mood) label.textContent = mood;
    }
    const panel = debugRef.current;
    if (panel) {
      const grade = game.grade_at(game.x());
      const contact = game.contact();
      const degrees = (radians: number) => `${Math.round(radians * 57.3)}°`;
      panel.textContent = [
        `x ${game.x().toFixed(1)}  speed ${game.speed().toFixed(1)}`,
        `road ${degrees(grade)}  nose ${degrees(game.angle() - grade)}`,
        `input ${buttons & BUTTON.gas ? 'GAS' : buttons & BUTTON.brake ? 'BRAKE' : '-'}  pull ${Math.round(game.drive() * 100)}%`,
        `slope load ${Math.round(game.strain() * 100)}%  ${mood}`,
        `tyres rear ${contact & 1 ? 'on' : 'off'}  front ${contact & 2 ? 'on' : 'off'}`,
        `fuel ${game.fuel().toFixed(1)}`,
      ].join('\n');
    }
  }, []);

  const publish = useCallback(() => {
    const game = gameRef.current;
    const next: Hud = { meters: Math.floor(game.distance()), fuel: game.fuel(), coins: game.coins(), score: game.score(), phase: game.phase() };
    const previous = hudRef.current;
    if (next.meters !== previous.meters || next.coins !== previous.coins || next.phase !== previous.phase || Math.ceil(next.fuel) !== Math.ceil(previous.fuel) || next.score !== previous.score) {
      hudRef.current = next;
      setHud(next);
    }
    return next;
  }, []);

  const rememberBest = useCallback((score: number) => {
    setBest(current => {
      if (score <= current) return current;
      writeBest(score);
      return score;
    });
  }, []);

  useEffect(() => {
    lastRef.current = performance.now();
    const tick = (now: number) => {
      try {
        const game = gameRef.current;
        const elapsed = Math.min(200, now - lastRef.current);
        lastRef.current = now;
        if (!pausedRef.current && game.phase() === PHASE.driving) {
          game.set_input(keysRef.current | touchRef.current);
          game.advance(elapsed);
          const events = game.take_events();
          if (events & EVENT.coin) sound('coin');
          if (events & EVENT.fuel) sound('fuel');
          if (events & EVENT.crash) sound('crash');
          if (events & EVENT.finish) sound('finish');
          if (events & EVENT.stranded) sound('crash');
          if ((keysRef.current | touchRef.current) & BUTTON.gas && now - engineAtRef.current > 140) {
            engineAtRef.current = now;
            sound('engine');
          }
          if (game.phase() !== PHASE.driving) {
            slot.clear();
            rememberBest(game.score());
          } else if (saveAtRef.current === 0) {
            saveAtRef.current = now;
          } else if (now - saveAtRef.current > 800) {
            saveAtRef.current = now;
            slot.save({ x: game.x(), fuel: game.fuel(), coins: game.coins() });
          }
        }
        draw(now);
        readout();
        publish();
      } catch (error) {
        (window as unknown as { __ghatError?: string }).__ghatError = error instanceof Error ? (error.stack ?? error.message) : String(error);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw, publish, readout, rememberBest, slot, sound]);

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
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    const onHidden = () => { if (document.hidden && gameRef.current.phase() === PHASE.driving) setPaused(true); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const begin = useCallback((run: RunSave | null) => {
    unlockAudio();
    gameRef.current.free();
    const game = new GhatClimb();
    if (run) game.restore(run.x, run.fuel, run.coins);
    else game.start();
    gameRef.current = game;
    keysRef.current = 0;
    touchRef.current = 0;
    setPaused(false);
    if (!run) slot.clear();
    publish();
    draw();
  }, [draw, publish, slot]);

  useEffect(() => {
      const bit = (key: string) => (key === 'ArrowRight' || key === 'd' || key === 'D' || key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ' ? BUTTON.gas
      : key === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'ArrowDown' || key === 's' || key === 'S' ? BUTTON.brake : 0);
    const onDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (key === 'm' || key === 'M') { toggleMute(); return; }
      if (key === 'g' || key === 'G') { setDebug(value => !value); return; }
      if (gameRef.current.phase() === PHASE.ready && key === 'Enter') { event.preventDefault(); begin(savedRun.current); savedRun.current = null; return; }
      if (key === 'p' || key === 'P') { if (gameRef.current.phase() === PHASE.driving) setPaused(value => !value); return; }
      const pressed = bit(key);
      if (pressed) { event.preventDefault(); if (gameRef.current.phase() === PHASE.driving) keysRef.current |= pressed; }
    };
    const onUp = (event: KeyboardEvent) => { keysRef.current &= ~bit(event.key); };
    const onBlur = () => { keysRef.current = 0; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); };
  }, [begin, toggleMute]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('ghatTest')) return;
    window.__ghatTest = {
      begin: () => begin(null),
      game: () => gameRef.current,
      info: () => {
        const game = gameRef.current;
        return { x: game.x(), y: game.y(), angle: game.angle(), fuel: game.fuel(), coins: game.coins(), phase: game.phase(), score: game.score(), speed: game.speed() };
      },
    };
    return () => { delete window.__ghatTest; };
  }, [begin]);

  const phase = hud.phase;
  const driving = phase === PHASE.driving;
  const ended = phase === PHASE.crashed || phase === PHASE.stranded || phase === PHASE.finished;
  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} className="ghat-icon" />;

  return (
    <div className="game-shell ghat" data-testid="ghat-climb" data-phase={phase}>
      <div className="ghat-frame">
      <div className="ghat-stage" ref={stageRef} data-testid="ghat-stage">
        <canvas ref={canvasRef} className="ghat-canvas" data-testid="ghat-canvas" aria-label="Ghat Climb mountain road" />
        {driving && (
          <div className="ghat-hud" data-testid="ghat-hud">
            <div className="ghat-hud__stats">
              <span className="ghat-pill" data-testid="ghat-meters"><span>m</span>{hud.meters}</span>
              <span className="ghat-pill" data-testid="ghat-coins"><span>coins</span>{hud.coins}</span>
              <span className={`ghat-fuel${hud.fuel < 25 ? ' is-low' : ''}`} data-testid="ghat-fuel" title="Fuel"><b style={{ width: `${Math.max(0, Math.min(100, hud.fuel))}%` }} /></span>
              <span className="ghat-engine" ref={gaugeRef} data-mood="idle" data-testid="ghat-engine" title="How much of the engine the slope is eating">
                <span>engine</span><i><b /></i><em>idle</em>
              </span>
            </div>
            <button type="button" className="ghat-icon" onClick={() => setPaused(value => !value)} data-testid="ghat-pause" aria-label="Pause">❚❚</button>
          </div>
        )}
        {driving && debug && <pre className="ghat-debug" ref={debugRef} data-testid="ghat-debug" />}
        {phase === PHASE.ready && (
          <div className="ghat-overlay" data-testid="ghat-start">
            <h1>Ghat Climb</h1>
            <p>One road to the pass. Gas lifts the nose. Brake brings it down.</p>
            <div className="ghat-card" data-testid="ghat-controls">
              Hold the gas on the flat, ease off on the steep faces, and grab the jerry cans. Flip past vertical, or roll to a stop on an empty tank, and the climb is over.
              <p style={{ marginTop: 8 }}>{touch ? 'GAS and BRAKE sit under the road.' : '→ or Space gas · ← brake · P pause · M mute · G engine debug'}</p>
            </div>
            <div className="ghat-actions">
              {savedRun.current && <button type="button" className="online-button online-button--primary" onClick={() => { const run = savedRun.current; savedRun.current = null; begin(run); }} data-testid="ghat-continue">Continue climb</button>}
              <button type="button" className={`online-button${savedRun.current ? '' : ' online-button--primary'}`} onClick={() => { savedRun.current = null; begin(null); }} data-testid="ghat-play">{savedRun.current ? 'New climb' : 'Begin'}</button>
              {mute}
            </div>
            {best > 0 && <p data-testid="ghat-best">Best {best}</p>}
          </div>
        )}
        {driving && paused && (
          <div className="ghat-overlay" data-testid="ghat-paused">
            <h2>Paused</h2>
            <div className="ghat-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => setPaused(false)} data-testid="ghat-resume">Resume</button>
              <button type="button" className="online-button" onClick={() => begin(null)} data-testid="ghat-restart">Restart</button>
              {mute}
            </div>
          </div>
        )}
        {ended && (
          <div className="ghat-overlay" data-testid="ghat-end">
            <h2>{phase === PHASE.finished ? 'The pass' : phase === PHASE.stranded ? 'Out of fuel' : 'Flipped'}</h2>
            <p data-testid="ghat-result">{phase === PHASE.finished ? 'The jeep made the pass.' : phase === PHASE.stranded ? 'The tank ran dry before the flag.' : 'The nose went past vertical.'}</p>
            <p data-testid="ghat-score">Score {hud.score} · {hud.meters} m · {hud.coins} coins{hud.score >= best && hud.score > 0 ? ' · best' : ''}</p>
            <div className="ghat-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => begin(null)} data-testid="ghat-again">Climb again</button>
              {mute}
            </div>
          </div>
        )}
      </div>
      {driving && !paused && touch && <TouchPads buttonsRef={touchRef} />}
      </div>
    </div>
  );
}

function TouchPads({ buttonsRef }: { buttonsRef: React.MutableRefObject<number> }) {
  const hold = (bit: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      unlockAudio();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      buttonsRef.current |= bit;
    },
    onPointerUp: () => { buttonsRef.current &= ~bit; },
    onPointerCancel: () => { buttonsRef.current &= ~bit; },
  });
  useEffect(() => () => { buttonsRef.current = 0; }, [buttonsRef]);
  return (
    <div className="ghat-touch" data-testid="ghat-touch">
      <button type="button" data-testid="ghat-brake" aria-label="Brake" {...hold(BUTTON.brake)}>BRAKE</button>
      <button type="button" data-testid="ghat-gas" aria-label="Gas" {...hold(BUTTON.gas)}>GAS</button>
    </div>
  );
}
