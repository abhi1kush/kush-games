/**
 * Jal Path — "Save the thirsty village": turn the pipe tiles so water from the tank reaches all three houses before
 * the tank runs dry. The Rust/wasm engine owns the board, which tiles may turn, how water flows, the tank and
 * win/lose; this file runs the screens, input and the draw loop (which sleeps whenever nothing moves).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createSaveSlot, SAVE_VERSIONS } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { emptyProgress, JalPath, LEVEL_COUNT, loadJalPathEngine, parseProgress, PHASE_FLOWING, PHASE_LOST, PHASE_PLANNING, PHASE_WON,
  EXTRA_OFF_ON_WIN, EXTRA_ON_FAIL, MAX_EXTRA_SECONDS, type Progress, RATES, readPorts, readSpills, readTiles, recordLoss, recordWin } from './engine';
import { cellAt, cellCenter, drawScene, HINT_ROTATE_MS, isAnimating, type RotateAnimation, type Scene, type StaticLayer } from './render';
import { type JalSound, playJalSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './jalpath.css';

/** After a win/loss keep animating this long (bubbles, glowing houses), then the loop sleeps. */
const SETTLE_MS = 2500;
const PLAN_TICK_MS = 250;

const createProgressSlot = () => createSaveSlot<Progress>({ gameId: 'jal-path', version: SAVE_VERSIONS['jal-path'], parse: parseProgress });

export default function JalPathGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadJalPathEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="jal-loading"><p className="game-help">Loading…</p></div>;
  return <JalPathScreens />;
}

function JalPathScreens() {
  const [slot] = useState(createProgressSlot);
  const [progress, setProgress] = useState<Progress>(() => slot.load() ?? emptyProgress());
  const [playing, setPlaying] = useState<number | null>(null);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: JalSound) => playJalSound(kind, isMutedRef.current), [isMutedRef]);
  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} />;

  const play = (level: number) => {
    unlockAudio();
    const next = { ...progress, current: level };
    setProgress(next); slot.save(next);
    setPlaying(level);
  };
  const handleWin = useCallback((level: number, stars: number) => {
    setProgress(current => { const next = recordWin(current, level, stars); slot.save(next); return next; });
  }, [slot]);
  const handleLoss = useCallback((level: number) => {
    setProgress(current => { const next = recordLoss(current, level); slot.save(next); return next; });
  }, [slot]);

  useEffect(() => {
    if (playing !== null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'm' || event.key === 'M') toggleMute(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, toggleMute]);

  if (playing !== null) {
    return <LevelScreen key={playing} level={playing} progress={progress} sound={sound} mute={mute} toggleMute={toggleMute}
      onWin={handleWin} onLoss={handleLoss} onLevel={setPlaying} onExit={() => setPlaying(null)} />;
  }
  return <StartScreen progress={progress} onPlay={play} mute={mute} />;
}

function Stars({ count, size = 'small' }: { count: number; size?: 'small' | 'big' }) {
  return <span className={`jal-stars jal-stars--${size}`} aria-label={`${count} of 3 stars`}>
    {[0, 1, 2].map(index => <span key={index} className={index < count ? 'is-lit' : ''}>★</span>)}
  </span>;
}

function ControlsCard() {
  return (
    <section className="jal-card jal-controls" data-testid="jal-controls">
      <h2>How to play</h2>
      <ul>
        <li><b>Tap a pipe</b> to turn it 90° clockwise. Bolted pipes (grey, with rivets) and rocks never turn.</li>
        <li>Join the tank on the left to <b>all three houses</b>. A pipe that joins up glows blue.</li>
        <li><b>Timing:</b> you get a planning countdown (40 s on level 1, shorter later). The tank only drains once the valve opens —
          when the countdown ends, or earlier with <b>Open valve</b>.</li>
        <li><b>Adaptive time:</b> if the tank runs dry, that level gives you {EXTRA_ON_FAIL} s more planning next try (up to +{MAX_EXTRA_SECONDS} s);
          each win takes {EXTRA_OFF_ON_WIN} s of that extra back — never below the level’s normal time.</li>
        <li>Water then moves about two tiles a second. Every pipe it fills uses {RATES.tile} units; each open end spills {RATES.spill} units/s;
          each cracked (rusty) pipe leaks {RATES.leak} units/s once wet; {RATES.evaporation} units/s evaporate.</li>
        <li>Dry pipes can still be turned while water flows; wet pipes are locked. Pause stops the clock.</li>
        <li><b>Hint</b> (💡 or H): turns one pipe on the route into place and makes it glow — the first wrong, still-dry pipe walking out
          from the tank. 3 per level, before or during the flow. One or two hints cap that level at ★★, three at ★.</li>
        <li>All three houses full = win. Tank empty first = try again. Stars count the spare water left (the tank holds a bit more than the best route needs): keep ≥ 70% of it for ★★★, ≥ 35% for ★★.</li>
      </ul>
      <p className="jal-keys">Keys: arrows move · Space/Enter turn · V open valve · H hint · P pause · R restart · M mute</p>
    </section>
  );
}

function StartScreen({ progress, onPlay, mute }: { progress: Progress; onPlay: (level: number) => void; mute: React.ReactNode }) {
  const totalStars = progress.stars.reduce((sum, value) => sum + value, 0);
  return (
    <div className="game-shell jal" data-testid="jal-start">
      <div className="jal-hero">
        <div className="jal-hero__title">
          <h1 className="game-shell__title">Jal Path</h1>
          <p>Save the thirsty village</p>
        </div>
        {mute}
      </div>
      <button type="button" className="online-button online-button--primary jal-play" data-testid="jal-play" onClick={() => onPlay(progress.current)}>
        {progress.current === 0 && totalStars === 0 ? 'Play' : 'Continue'} · Level {progress.current + 1}
      </button>
      <section className="jal-card">
        <h2>Levels <span className="jal-total">★ {totalStars}/{LEVEL_COUNT * 3}</span></h2>
        <div className="jal-levels" data-testid="jal-levels">
          {Array.from({ length: LEVEL_COUNT }, (_, level) => {
            const isLocked = level >= progress.unlocked;
            return (
              <button type="button" key={level} className={`jal-level${isLocked ? ' is-locked' : ''}${level === progress.current ? ' is-current' : ''}`}
                disabled={isLocked} onClick={() => onPlay(level)} data-testid={`jal-level-${level + 1}`} aria-label={isLocked ? `Level ${level + 1} (locked)` : `Level ${level + 1}`}>
                <b>{isLocked ? '🔒' : level + 1}</b>
                {!isLocked && <Stars count={progress.stars[level]} />}
              </button>
            );
          })}
        </div>
      </section>
      <ControlsCard />
    </div>
  );
}

interface Hud { phase: number; tank: number; planLeft: number; housesFull: number; stars: number; moves: number; hintsLeft: number }
const readHud = (game: JalPath): Hud => ({
  phase: game.phase(), tank: game.capacity() > 0 ? game.tank() / game.capacity() : 0, planLeft: game.plan_left_ms(),
  housesFull: game.houses_full(), stars: game.stars(), moves: game.moves(), hintsLeft: game.hints_left(),
});

interface LevelProps {
  level: number;
  progress: Progress;
  sound: (kind: JalSound) => void;
  mute: React.ReactNode;
  toggleMute: () => void;
  onWin: (level: number, stars: number) => void;
  onLoss: (level: number) => void;
  onLevel: (level: number) => void;
  onExit: () => void;
}

function LevelScreen({ level, progress, sound, mute, toggleMute, onWin, onLoss, onLevel, onExit }: LevelProps) {
  const extraSeconds = progress.extraSeconds[level] ?? 0;
  const extraRef = useRef(extraSeconds);
  extraRef.current = extraSeconds;
  const createGame = () => { const created = new JalPath(level); if (extraRef.current > 0) created.add_plan_time(extraRef.current * 1000); return created; };
  const [startExtra, setStartExtra] = useState(extraSeconds);
  const [attempt, setAttempt] = useState(0);
  const gameRef = useRef<JalPath | null>(null);
  if (!gameRef.current) gameRef.current = createGame();
  const [hud, setHud] = useState<Hud>(() => readHud(gameRef.current!));
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(48);
  const sizeRef = useRef(48);
  const layerRef = useRef<StaticLayer | null>(null);
  const rotationsRef = useRef(new Map<number, RotateAnimation>());
  const shakesRef = useRef(new Map<number, number>());
  const hintsRef = useRef(new Map<number, number>());
  const [hintNote, setHintNote] = useState('');
  const cursorRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const lastFrameRef = useRef(0);
  const settleUntilRef = useRef(0);
  const clockRef = useRef(0);
  const seenRef = useRef({ spills: 0, houses: 0, phase: PHASE_PLANNING });
  const reportedRef = useRef(false);

  const game = gameRef.current;
  const width = game.width();
  const height = game.height();

  useEffect(() => () => { gameRef.current?.free(); gameRef.current = null; }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const current = gameRef.current;
    if (!canvas || !current) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    current.connected_houses();
    const ports = readPorts(current);
    const scene: Scene = {
      level, width: current.width(), height: current.height(), tiles: readTiles(current), source: ports.source, houses: ports.houses,
      houseFill: [0, 1, 2].map(index => current.house_fill(index)), spills: readSpills(current),
      tankFraction: current.capacity() > 0 ? current.tank() / current.capacity() : 0, phase: current.phase(), time: clockRef.current / 1000,
      now: performance.now(), rotations: rotationsRef.current, shakes: shakesRef.current, hints: hintsRef.current, cursor: cursorRef.current,
    };
    drawScene(context, scene, sizeRef.current, window.devicePixelRatio || 1, layerRef);
  }, [level]);

  const react = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const spills = current.spills().length;
    const houses = current.houses_full();
    const phase = current.phase();
    const seen = seenRef.current;
    if (spills > seen.spills) sound('splash');
    if (houses > seen.houses && phase !== PHASE_WON) sound('house');
    if (phase !== seen.phase) {
      if (phase === PHASE_WON) { sound('win'); settleUntilRef.current = performance.now() + SETTLE_MS; }
      if (phase === PHASE_LOST) { sound('lose'); settleUntilRef.current = performance.now() + SETTLE_MS; }
    }
    if (phase === PHASE_WON && !reportedRef.current) { reportedRef.current = true; onWin(level, current.stars()); }
    if (phase === PHASE_LOST && !reportedRef.current) { reportedRef.current = true; onLoss(level); }
    seenRef.current = { spills, houses, phase };
  }, [level, onWin, onLoss, sound]);

  const needsFrames = useCallback(() => {
    const current = gameRef.current;
    if (!current) return false;
    const scene = { rotations: rotationsRef.current, shakes: shakesRef.current, hints: hintsRef.current } as Scene;
    if (isAnimating(scene)) return true;
    if (pausedRef.current) return false;
    return current.phase() === PHASE_FLOWING || performance.now() < settleUntilRef.current;
  }, []);

  const hudTimeRef = useRef(0);
  const frame = useCallback(() => {
    frameRef.current = 0;
    const current = gameRef.current;
    if (!current) return;
    const now = performance.now();
    // performance.now() (not the rAF timestamp, which can be earlier) and never a negative or huge gap
    const elapsed = Math.max(0, Math.min(100, now - lastFrameRef.current));
    lastFrameRef.current = now;
    if (!pausedRef.current) {
      clockRef.current += elapsed;
      if (current.phase() === PHASE_FLOWING) current.advance(elapsed);
    }
    react();
    draw();
    if (now - hudTimeRef.current > 100 || current.phase() !== PHASE_FLOWING) { hudTimeRef.current = now; setHud(readHud(current)); }
    if (needsFrames()) frameRef.current = requestAnimationFrame(frame);
  }, [draw, needsFrames, react]);

  const wake = useCallback(() => {
    if (frameRef.current) return;
    lastFrameRef.current = performance.now();
    frameRef.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = 0; }, []);

  // Planning countdown: a slow timer (no redraws) until the valve opens.
  useEffect(() => {
    if (hud.phase !== PHASE_PLANNING || isPaused) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const current = gameRef.current;
      if (!current) return;
      const now = performance.now();
      current.advance(Math.max(0, Math.min(1000, now - last)));
      last = now;
      if (current.phase() !== PHASE_PLANNING) { sound('valve'); wake(); }
      setHud(readHud(current));
    }, PLAN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [hud.phase, isPaused, sound, wake, attempt]);

  // Size the board to the space available (portrait and landscape), never wider than the screen.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const availableWidth = stage.clientWidth - 12;
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const availableHeight = Math.max(260, window.innerHeight - Math.min(top, 190) - 24);
      const size = Math.floor(Math.max(24, Math.min(78, availableWidth / (width + 2), availableHeight / (height + 2))));
      if (size !== sizeRef.current) { sizeRef.current = size; setTileSize(size); }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [width, height]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round((width + 2) * tileSize * ratio);
    canvas.height = Math.round((height + 2) * tileSize * ratio);
    canvas.style.width = `${(width + 2) * tileSize}px`;
    canvas.style.height = `${(height + 2) * tileSize}px`;
    draw();
  }, [tileSize, width, height, draw, attempt]);

  const turn = useCallback((cell: number) => {
    const current = gameRef.current;
    if (!current || pausedRef.current) return;
    const phase = current.phase();
    if (phase === PHASE_WON || phase === PHASE_LOST) return;
    setHintNote('');
    if (current.can_rotate(cell) && current.rotate(cell)) {
      const now = performance.now();
      const previous = rotationsRef.current.get(cell);
      let remaining = 0;
      if (previous) { const t = Math.min(1, (now - previous.start) / 150); remaining = previous.from * Math.pow(1 - t, 3); }
      rotationsRef.current.set(cell, { start: now, from: remaining - Math.PI / 2 });
      sound('turn');
    } else {
      shakesRef.current.set(cell, performance.now());
      sound('blocked');
    }
    setHud(readHud(current));
    wake();
  }, [sound, wake]);

  const showHint = useCallback(() => {
    const current = gameRef.current;
    if (!current || pausedRef.current) return;
    const phase = current.phase();
    if (phase === PHASE_WON || phase === PHASE_LOST) return;
    if (current.hints_left() === 0) { setHintNote('No hints left on this level.'); sound('blocked'); return; }
    const result = current.hint();
    if (result < 0) { setHintNote(phase === PHASE_PLANNING ? 'The route is already right — open the valve!' : 'Nothing left that a hint can turn.'); sound('blocked'); return; }
    const cell = result >> 2;
    const turns = result & 3;
    const now = performance.now();
    rotationsRef.current.set(cell, { start: now, from: -turns * Math.PI / 2, duration: HINT_ROTATE_MS });
    hintsRef.current.set(cell, now);
    setHintNote(current.hints_left() === 0 ? 'That was your last hint for this level.' : `Hint: that glowing pipe is now turned the right way. ${current.hints_left()} left.`);
    sound('turn');
    setHud(readHud(current));
    wake();
  }, [sound, wake]);

  const openValve = useCallback(() => {
    const current = gameRef.current;
    if (!current || pausedRef.current) return;
    if (current.open_valve()) { sound('valve'); setHud(readHud(current)); wake(); }
  }, [sound, wake]);

  const setPaused = useCallback((paused: boolean) => {
    const current = gameRef.current;
    if (!current) return;
    if (paused && (current.phase() === PHASE_WON || current.phase() === PHASE_LOST)) return;
    pausedRef.current = paused;
    setIsPaused(paused);
    if (!paused) wake();
  }, [wake]);

  const restart = useCallback(() => {
    gameRef.current?.free();
    gameRef.current = createGame();
    setStartExtra(extraRef.current);
    rotationsRef.current.clear(); shakesRef.current.clear(); hintsRef.current.clear(); setHintNote('');
    seenRef.current = { spills: 0, houses: 0, phase: PHASE_PLANNING };
    reportedRef.current = false;
    settleUntilRef.current = 0;
    pausedRef.current = false;
    setIsPaused(false);
    layerRef.current = null;
    setHud(readHud(gameRef.current));
    setAttempt(value => value + 1);
  }, [level]);

  // Pause when the tab is hidden so the tank never drains unseen.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setPaused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key;
      const cursor = cursorRef.current;
      const move = (dx: number, dy: number) => {
        event.preventDefault();
        if (cursor === null) { cursorRef.current = 0; } else {
          const x = Math.max(0, Math.min(width - 1, (cursor % width) + dx));
          const y = Math.max(0, Math.min(height - 1, Math.floor(cursor / width) + dy));
          cursorRef.current = y * width + x;
        }
        draw();
      };
      if (key === 'ArrowLeft') move(-1, 0);
      else if (key === 'ArrowRight') move(1, 0);
      else if (key === 'ArrowUp') move(0, -1);
      else if (key === 'ArrowDown') move(0, 1);
      else if ((key === ' ' || key === 'Enter') && cursor !== null && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); turn(cursor); }
      else if (key === 'v' || key === 'V') openValve();
      else if (key === 'h' || key === 'H') showHint();
      else if (key === 'p' || key === 'P') setPaused(!pausedRef.current);
      else if (key === 'r' || key === 'R') restart();
      else if (key === 'm' || key === 'M') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [width, height, draw, turn, openValve, showHint, setPaused, restart, toggleMute]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    unlockAudio();
    const rect = event.currentTarget.getBoundingClientRect();
    const cell = cellAt(event.clientX - rect.left, event.clientY - rect.top, width, height, sizeRef.current);
    if (cell === null) return;
    cursorRef.current = null;
    turn(cell);
  };

  // test hook (?jalTest)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('jalTest')) return;
    const hook = {
      state: () => { const current = gameRef.current!; return { ...readHud(current), level, width, height, capacity: current.capacity(), tankUnits: current.tank(), spills: current.spills().length, paused: pausedRef.current, animating: frameRef.current !== 0 }; },
      solve: () => { gameRef.current!.debug_solve(); setHud(readHud(gameRef.current!)); draw(); },
      openValve: () => openValve(),
      hintCell: () => gameRef.current!.hint_cell(),
      cellPoint: (cell: number) => { const rect = canvasRef.current!.getBoundingClientRect(); const [x, y] = cellCenter(cell, width, sizeRef.current); return { x: rect.left + x, y: rect.top + y }; },
      tiles: () => readTiles(gameRef.current!),
      solution: (cell: number) => gameRef.current!.debug_solution(cell),
      canRotate: (cell: number) => gameRef.current!.can_rotate(cell),
    };
    (window as unknown as { __jalTest?: typeof hook }).__jalTest = hook;
    return () => { delete (window as unknown as { __jalTest?: typeof hook }).__jalTest; };
  }, [level, width, height, draw, openValve, attempt]);

  const tankPercent = Math.round(Math.max(0, hud.tank) * 100);
  const isOver = hud.phase === PHASE_WON || hud.phase === PHASE_LOST;
  const hintButton = (
    <button type="button" className="game-button jal-hint" onClick={showHint} disabled={isPaused || hud.hintsLeft === 0} data-testid="jal-hint"
      title="Hint (H): turns one pipe on the route into place" aria-label={`Hint, ${hud.hintsLeft} left`}>💡 Hint <b>{hud.hintsLeft}</b></button>
  );
  return (
    <div className="game-shell jal" data-testid="jal-screen" data-phase={hud.phase} data-level={level + 1}>
      <div className="game-shell__header jal-header">
        <button type="button" className="game-button" onClick={onExit} data-testid="jal-exit">← Levels</button>
        <h1 className="jal-title">Level {level + 1} <small>{width}×{height}</small></h1>
        <button type="button" className="game-button" onClick={() => setPaused(!isPaused)} disabled={isOver} data-testid="jal-pause">{isPaused ? '▶ Resume' : '⏸ Pause'}</button>
        <button type="button" className="game-button" onClick={restart} data-testid="jal-restart">↻ Restart</button>
        {mute}
      </div>
      <div className="jal-hud">
        <div className="jal-meter" role="meter" aria-label="Water in tank" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tankPercent} data-testid="jal-tank">
          <span className="jal-meter__label">Tank</span>
          <span className="jal-meter__bar"><span className={`jal-meter__fill${tankPercent < 20 ? ' is-low' : ''}`} style={{ width: `${tankPercent}%` }} /></span>
          <b>{tankPercent}%</b>
        </div>
        <div className="jal-houses" data-testid="jal-houses" aria-label={`${hud.housesFull} of 3 houses watered`}>
          {[0, 1, 2].map(index => <span key={index} className={index < hud.housesFull ? 'is-lit' : ''}>🏠</span>)}
          <b>{hud.housesFull}/3</b>
        </div>
      </div>
      {hud.phase === PHASE_PLANNING && (
        <div className="jal-status" data-testid="jal-status">
          <span>Valve opens in <b data-testid="jal-countdown">{Math.ceil(hud.planLeft / 1000)} s</b>{startExtra > 0 && <small className="jal-extra" data-testid="jal-extra"> (+{startExtra} s extra from earlier tries)</small>}</span>
          <button type="button" className="online-button online-button--primary online-button--small" onClick={openValve} disabled={isPaused} data-testid="jal-valve">Open valve now</button>
          {hintButton}
        </div>
      )}
      {hud.phase === PHASE_FLOWING && <div className="jal-status" data-testid="jal-status"><span>💧 Water is flowing — dry pipes can still turn</span>{hintButton}</div>}
      {hintNote && !isOver && <p className="jal-hint-note" data-testid="jal-hint-note" role="status">{hintNote}</p>}
      <div className="jal-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="jal-canvas" onPointerDown={onPointerDown} data-testid="jal-canvas" aria-label="Pipe board" />
        {isPaused && !isOver && (
          <div className="jal-overlay" data-testid="jal-paused">
            <div className="jal-card jal-result"><h2>Paused</h2><p>The tank and the countdown are stopped.</p>
              <button type="button" className="online-button online-button--primary" onClick={() => setPaused(false)}>▶ Resume</button></div>
          </div>
        )}
        {hud.phase === PHASE_WON && (
          <div className="jal-overlay" data-testid="jal-won">
            <div className="jal-card jal-result">
              <h2>{level + 1 === LEVEL_COUNT ? 'You saved every village!' : 'Village saved!'}</h2>
              <Stars count={hud.stars} size="big" />
              <p>All three houses have water · {tankPercent}% left in the tank</p>
              <div className="game-actions">
                {level + 1 < LEVEL_COUNT && <button type="button" className="online-button online-button--primary" onClick={() => onLevel(level + 1)} data-testid="jal-next">Next level →</button>}
                <button type="button" className="game-button" onClick={restart} data-testid="jal-replay">Replay</button>
                <button type="button" className="game-button" onClick={onExit}>Levels</button>
              </div>
            </div>
          </div>
        )}
        {hud.phase === PHASE_LOST && (
          <div className="jal-overlay" data-testid="jal-lost">
            <div className="jal-card jal-result jal-result--lost">
              <h2>The tank ran dry</h2>
              <p>{hud.housesFull} of 3 houses got water. Close the open ends and avoid cracked pipes.</p>
              <p className="jal-extra-note" data-testid="jal-extra-note">{extraSeconds > startExtra ? `Next try: +${extraSeconds} s extra planning time.` : extraSeconds >= MAX_EXTRA_SECONDS ? `Extra planning time is at the +${MAX_EXTRA_SECONDS} s maximum.` : ''}</p>
              <div className="game-actions">
                <button type="button" className="online-button online-button--primary" onClick={restart} data-testid="jal-retry">↻ Retry</button>
                <button type="button" className="game-button" onClick={onExit}>Levels</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="game-help">Tap a pipe to turn it. Join the tank to all three houses before the water runs out.</p>
    </div>
  );
}
