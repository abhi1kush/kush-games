import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { createFlappy, FIXED_STEP_SECONDS, flap, FlappyState, FlappyStatus, nextPipe, setPaused, step, WORLD_HEIGHT, WORLD_WIDTH } from './physics';
import { FlappyRenderer } from './renderer';
import { createFlappySaveSlot, serializeFlappy } from './save';
import { playFlapSound, playHitSound, playScoreSound } from './sound';
import '../shared.css';
import './flappy.css';

const BEST_STORAGE_KEY = 'kush-games-flappy-best';
/** Longest frame we simulate in one go (after a stall the game slows down instead of jumping). */
const MAX_FRAME_SECONDS = 0.25;
/** Ignore taps for a moment after crashing, so a frantic tap doesn't skip the score screen. */
const RESTART_GRACE_MS = 450;

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
function readBest(): number { try { return Number(localStorage.getItem(BEST_STORAGE_KEY)) || 0; } catch { return 0; } }
function saveBest(score: number) { try { localStorage.setItem(BEST_STORAGE_KEY, String(score)); } catch { /* storage unavailable */ } }

export default function FlappyWings() {
  const saveSlot = useMemo(() => createFlappySaveSlot(), []);
  const [initial] = useState(() => {
    const saved = saveSlot.load();
    return saved ? { state: saved, restored: true } : { state: createFlappy(newSeed()), restored: false };
  });
  const stateRef = useRef<FlappyState>(initial.state);
  const [status, setStatus] = useState<FlappyStatus>(initial.state.status);
  const [score, setScore] = useState(initial.state.score);
  const [best, setBest] = useState(readBest);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [isNewBest, setIsNewBest] = useState(false);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FlappyRenderer | null>(null);
  const bestRef = useRef(best);
  const crashedAtRef = useRef(0);
  const needsDrawRef = useRef(true);
  const wakeLoopRef = useRef<() => void>(() => {});

  /** React state changes only when status or score change, not every frame. */
  const publish = useCallback((previous: FlappyState, next: FlappyState) => {
    if (previous.status !== next.status) setStatus(next.status);
    if (previous.score !== next.score) setScore(next.score);
  }, []);

  const persist = useCallback((state: FlappyState, immediately = false) => {
    const data = serializeFlappy(state);
    if (!data) saveSlot.clear();
    else if (immediately) saveSlot.save(data);
    else saveSlot.saveThrottled(data);
  }, [saveSlot]);

  const replace = useCallback((next: FlappyState) => {
    const previous = stateRef.current;
    stateRef.current = next;
    needsDrawRef.current = true;
    publish(previous, next);
    wakeLoopRef.current();
  }, [publish]);

  // Game loop: fixed 1/120 s steps from an accumulator; sleeps while paused or after the crash settles.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new FlappyRenderer(canvas);
    rendererRef.current = renderer;
    let frameId = 0;
    let lastTime = 0;
    let accumulator = 0;

    const frame = (time: number) => {
      frameId = 0;
      const elapsed = lastTime ? Math.min(MAX_FRAME_SECONDS, (time - lastTime) / 1000) : 0;
      lastTime = time;
      accumulator += elapsed;
      const before = stateRef.current;
      let current = before;
      while (accumulator >= FIXED_STEP_SECONDS) {
        current = step(current, FIXED_STEP_SECONDS);
        accumulator -= FIXED_STEP_SECONDS;
      }
      if (current !== before) {
        stateRef.current = current;
        needsDrawRef.current = true;
        if (current.score > before.score) playScoreSound(isMutedRef.current);
        if (before.status === 'playing' && current.status === 'over') {
          playHitSound(isMutedRef.current);
          crashedAtRef.current = performance.now();
          if (current.score > bestRef.current) { bestRef.current = current.score; setBest(current.score); saveBest(current.score); setIsNewBest(true); }
          persist(current, true);
        } else if (current.status === 'playing') persist(current);
        publish(before, current);
      }
      if (needsDrawRef.current) {
        renderer.draw(current);
        needsDrawRef.current = false;
        const root = rootRef.current;
        if (root) {
          root.dataset.birdY = current.birdY.toFixed(1);
          root.dataset.velocity = current.velocityY.toFixed(0);
          const upcoming = nextPipe(current);
          root.dataset.gapY = upcoming ? upcoming.gapY.toFixed(1) : '';
        }
      }
      const settled = current.status === 'paused' || (current.status === 'over' && current === before);
      if (!settled) frameId = requestAnimationFrame(frame);
      else lastTime = 0;
    };
    const wake = () => {
      if (!frameId) { lastTime = 0; accumulator = 0; frameId = requestAnimationFrame(frame); }
    };
    wakeLoopRef.current = wake;

    const resize = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const available = stage.getBoundingClientRect();
      const width = Math.max(160, Math.min(available.width, (available.height * WORLD_WIDTH) / WORLD_HEIGHT));
      canvas.style.width = `${Math.floor(width)}px`;
      canvas.style.height = `${Math.floor((width * WORLD_HEIGHT) / WORLD_WIDTH)}px`;
      renderer.resize(Math.floor(width));
      needsDrawRef.current = true;
      renderer.draw(stateRef.current);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stageRef.current!);
    wake();
    return () => { cancelAnimationFrame(frameId); observer.disconnect(); wakeLoopRef.current = () => {}; };
  }, [isMutedRef, persist, publish]);

  const doFlap = useCallback(() => {
    const current = stateRef.current;
    if (current.status === 'over') {
      if (performance.now() - crashedAtRef.current < RESTART_GRACE_MS) return;
      setIsNewBest(false);
      replace(createFlappy(newSeed()));
      return;
    }
    if (current.status === 'paused') return;
    unlockAudio();
    playFlapSound(isMutedRef.current);
    setWasRestored(false);
    replace(flap(current));
  }, [isMutedRef, replace]);

  const pause = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'playing') return;
    const paused = setPaused(current, true);
    replace(paused);
    persist(paused, true);
  }, [persist, replace]);

  const resume = useCallback(() => {
    unlockAudio();
    setWasRestored(false);
    replace(setPaused(stateRef.current, false));
  }, [replace]);

  const newGame = useCallback(() => {
    setWasRestored(false);
    setIsNewBest(false);
    saveSlot.clear();
    replace(createFlappy(newSeed()));
  }, [replace, saveSlot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        if (stateRef.current.status === 'paused') resume(); else doFlap();
      } else if (event.key === 'p' || event.key === 'P') {
        if (stateRef.current.status === 'paused') resume(); else pause();
      } else if (event.key === 'm' || event.key === 'M') toggleMute();
    };
    const handleHide = () => { pause(); saveSlot.flush(); persist(stateRef.current, true); };
    const handleVisibility = () => { if (document.visibilityState === 'hidden') handleHide(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pagehide', handleHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [doFlap, pause, persist, resume, saveSlot, toggleMute]);

  // Leaving the page keeps the run, paused.
  useEffect(() => () => { persist(setPaused(stateRef.current, true), true); }, [persist]);

  useLayoutEffect(() => { bestRef.current = best; }, [best]);

  return (
    <div className="game-shell flappy" ref={rootRef} data-testid="flappy" data-status={status} data-score={score}>
      <div className="game-shell__header">
        <div className="game-shell__stats">
          <div className="game-stat"><span>Score</span><b data-testid="flappy-score">{score}</b></div>
          <div className="game-stat"><span>Best</span><b data-testid="flappy-best">{best}</b></div>
        </div>
        <button type="button" className="game-button" onClick={() => (status === 'paused' ? resume() : pause())} disabled={status !== 'playing' && status !== 'paused'}
          data-testid="flappy-pause">{status === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="flappy-stage" ref={stageRef}>
        <div className="flappy-frame" onPointerDown={event => { if (event.button === 0) { event.preventDefault(); doFlap(); } }}>
          <canvas ref={canvasRef} className="flappy-canvas" data-testid="flappy-canvas" aria-label="Flappy Wings game area" />
          {status === 'ready' && <div className="flappy-overlay flappy-overlay--hint" data-testid="flappy-hint">Tap, click or press Space to flap</div>}
          {status === 'paused' && (
            <div className="flappy-overlay" onPointerDown={event => event.stopPropagation()} data-testid="flappy-paused">
              <p className="flappy-overlay__title">{wasRestored ? '💾 Saved game restored' : 'Paused'}</p>
              <p>Score {score}</p>
              <div className="game-actions">
                <button type="button" className="game-button game-button--primary" onClick={resume} data-testid="flappy-resume">▶ Resume</button>
                <button type="button" className="game-button" onClick={newGame} data-testid="flappy-new">New game</button>
              </div>
            </div>
          )}
          {status === 'over' && (
            <div className="flappy-overlay" data-testid="flappy-over">
              <p className="flappy-overlay__title">Game over</p>
              <p>Score {score} · Best {best}{isNewBest ? ' 🏆' : ''}</p>
              <p className="flappy-overlay__small">Tap to play again</p>
            </div>
          )}
        </div>
      </div>
      <p className="game-help">Space / ↑ / tap to flap · P to pause · M to mute</p>
    </div>
  );
}
