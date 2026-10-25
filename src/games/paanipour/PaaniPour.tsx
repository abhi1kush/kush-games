/**
 * Paani Pour — sort the water: tap a tube, then another, to pour its top colour across. Every tube must end up one
 * colour. Rust/wasm owns the tubes, pour rules, undo, levels and the solver (par and hints); this file runs the
 * screens, input and an animation loop that sleeps whenever nothing moves.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createSaveSlot, SAVE_VERSIONS } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { CAPACITY, emptyProgress, HINTS_PER_LEVEL, LEVEL_COUNT, loadPaaniPourEngine, PaaniPour, parseProgress, type Progress, readTubes, recordWin, replayPours } from './engine';
import { drawScene, isAnimating, type Layout, layoutTubes, POUR_MS, type Scene, tubeAt, tubeOrigin } from './render';
import { playPour, playPourSound, type PourSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './paanipour.css';

const createProgressSlot = () => createSaveSlot<Progress>({ gameId: 'paani-pour', version: SAVE_VERSIONS['paani-pour'], parse: parseProgress });

export default function PaaniPourGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadPaaniPourEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="pour-loading"><p className="game-help">Loading…</p></div>;
  return <PaaniPourScreens />;
}

function PaaniPourScreens() {
  const [slot] = useState(createProgressSlot);
  const [progress, setProgress] = useState<Progress>(() => slot.load() ?? emptyProgress());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [playing, setPlaying] = useState<number | null>(null);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: PourSound) => playPourSound(kind, isMutedRef.current), [isMutedRef]);
  const pourSound = useCallback((from: number, to: number, delay: number) => playPour(from, to, delay, isMutedRef.current), [isMutedRef]);
  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} />;

  const update = useCallback((change: (current: Progress) => Progress) => {
    setProgress(current => { const next = change(current); slot.save(next); return next; });
  }, [slot]);
  const play = (level: number) => { unlockAudio(); update(current => ({ ...current, current: level })); setPlaying(level); };

  useEffect(() => {
    if (playing !== null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'm' || event.key === 'M') toggleMute(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, toggleMute]);

  if (playing !== null) {
    const saved = progressRef.current.savedLevel === playing ? progressRef.current.savedPours : [];
    return <LevelScreen key={playing} level={playing} savedPours={saved} sound={sound} pourSound={pourSound} mute={mute} toggleMute={toggleMute}
      onSave={pours => update(current => ({ ...current, savedLevel: playing, savedPours: pours }))}
      onWin={stars => update(current => recordWin(current, playing, stars))} onLevel={setPlaying} onExit={() => setPlaying(null)} />;
  }
  return <StartScreen progress={progress} onPlay={play} mute={mute} />;
}

function Stars({ count, size = 'small' }: { count: number; size?: 'small' | 'big' }) {
  return <span className={`pour-stars pour-stars--${size}`} aria-label={`${count} of 3 stars`}>{[0, 1, 2].map(index => <span key={index} className={index < count ? 'is-lit' : ''}>★</span>)}</span>;
}

function HowToCard() {
  return (
    <section className="pour-card pour-howto" data-testid="pour-controls">
      <h2>How to play</h2>
      <ul>
        <li><b>Tap a tube</b> to lift it, then <b>tap another</b> to pour. Tap the lifted tube again to put it down.</li>
        <li>Only the <b>top colour</b> pours, and only onto an <b>empty tube</b> or the <b>same colour</b> — as many layers as fit (each tube holds {CAPACITY}).</li>
        <li>Sort until every tube holds a single colour. Finished tubes get a cork.</li>
        <li><b>Stars:</b> finish in par pours (what the built-in solver needed) for ★★★, a few more for ★★. Undo is free — only pours that stay count.</li>
        <li><b>Hint</b> shows one good pour ({HINTS_PER_LEVEL} per level); using any caps the level at ★★. Stuck? Undo or Reset.</li>
      </ul>
      <p className="pour-keys">Keys: ← → choose a tube · Space/Enter lift / pour · U or Ctrl+Z undo · R reset · H hint · M mute</p>
    </section>
  );
}

function StartScreen({ progress, onPlay, mute }: { progress: Progress; onPlay: (level: number) => void; mute: React.ReactNode }) {
  const totalStars = progress.stars.reduce((sum, value) => sum + value, 0);
  return (
    <div className="game-shell pour" data-testid="pour-start">
      <div className="pour-hero">
        <div className="pour-hero__title"><h1 className="game-shell__title">Paani Pour</h1><p>Sort the water</p></div>
        {mute}
      </div>
      <button type="button" className="online-button online-button--primary pour-play" data-testid="pour-play" onClick={() => onPlay(progress.current)}>
        {totalStars === 0 && progress.savedLevel < 0 ? 'Play' : 'Continue'} · Level {progress.current + 1}
      </button>
      <section className="pour-card">
        <h2>Levels <span className="pour-total">★ {totalStars}/{LEVEL_COUNT * 3}</span></h2>
        <div className="pour-levels" data-testid="pour-levels">
          {Array.from({ length: LEVEL_COUNT }, (_, level) => {
            const isLocked = level >= progress.unlocked;
            return (
              <button type="button" key={level} className={`pour-level${isLocked ? ' is-locked' : ''}${level === progress.current ? ' is-current' : ''}`}
                disabled={isLocked} onClick={() => onPlay(level)} data-testid={`pour-level-${level + 1}`} aria-label={isLocked ? `Level ${level + 1} (locked)` : `Level ${level + 1}`}>
                <b>{isLocked ? '🔒' : level + 1}</b>{!isLocked && <Stars count={progress.stars[level]} />}
              </button>
            );
          })}
        </div>
      </section>
      <HowToCard />
    </div>
  );
}

interface Hud { pours: number; par: number; solved: boolean; stuck: boolean; stars: number; hintsLeft: number; done: number }
const readHud = (game: PaaniPour): Hud => {
  let done = 0;
  for (let tube = 0; tube < game.tube_count(); tube++) if (game.is_done(tube)) done++;
  return { pours: game.pours(), par: game.par(), solved: game.is_solved(), stuck: game.is_stuck(), stars: game.stars(), hintsLeft: game.hints_left(), done };
};

interface LevelProps {
  level: number;
  savedPours: number[];
  sound: (kind: PourSound) => void;
  pourSound: (from: number, to: number, delay: number) => void;
  mute: React.ReactNode;
  toggleMute: () => void;
  onSave: (pours: number[]) => void;
  onWin: (stars: number) => void;
  onLevel: (level: number) => void;
  onExit: () => void;
}

function LevelScreen({ level, savedPours, sound, pourSound, mute, toggleMute, onSave, onWin, onLevel, onExit }: LevelProps) {
  const gameRef = useRef<PaaniPour | null>(null);
  const poursRef = useRef<number[]>([]);
  if (!gameRef.current) {
    const game = new PaaniPour(level);
    replayPours(game, savedPours);
    gameRef.current = game;
    poursRef.current = savedPours.slice(0, game.pours());
  }
  const [hud, setHud] = useState<Hud>(() => readHud(gameRef.current!));
  const [restored] = useState(() => savedPours.length > 0 && gameRef.current!.pours() > 0);
  const [note, setNote] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const sceneRef = useRef<Scene>({ tubes: readTubes(gameRef.current), done: [], selected: null, cursor: null, pour: null, shakes: new Map(), hint: null, finishedAt: new Map(), now: 0 });
  const frameRef = useRef(0);
  const wonRef = useRef(false);
  const count = gameRef.current.tube_count();

  useEffect(() => () => { gameRef.current?.free(); gameRef.current = null; }, []);

  const syncScene = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const scene = sceneRef.current;
    scene.tubes = readTubes(game);
    scene.done = scene.tubes.map((_, tube) => game.is_done(tube));
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const currentLayout = layoutRef.current;
    if (!canvas || !currentLayout) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    sceneRef.current.now = performance.now();
    drawScene(context, sceneRef.current, currentLayout, window.devicePixelRatio || 1);
  }, []);

  const frame = useCallback(() => {
    frameRef.current = 0;
    const scene = sceneRef.current;
    if (scene.pour && performance.now() - scene.pour.start >= POUR_MS) {
      scene.pour = null;
      const game = gameRef.current;
      if (game?.is_solved() && !wonRef.current) { wonRef.current = true; sound('win'); onWin(game.stars()); }
      if (game) setHud(readHud(game));
    }
    draw();
    if (isAnimating(scene)) frameRef.current = requestAnimationFrame(frame);
  }, [draw, onWin, sound]);

  const wake = useCallback(() => { if (!frameRef.current) frameRef.current = requestAnimationFrame(frame); }, [frame]);
  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = 0; }, []);

  // size to the space available (portrait/landscape); never wider than the screen
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth - 8;
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const maxHeight = Math.max(240, Math.min(620, window.innerHeight - Math.min(top, 200) - 30));
      const next = layoutTubes(count, width, maxHeight);
      const previous = layoutRef.current;
      if (!previous || previous.width !== next.width || previous.tubeWidth !== next.tubeWidth || previous.rows !== next.rows) { layoutRef.current = next; setLayout(next); }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [count]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * ratio);
    canvas.height = Math.round(layout.height * ratio);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    syncScene();
    draw();
  }, [layout, draw, syncScene]);

  const afterChange = useCallback(() => {
    const game = gameRef.current!;
    setHud(readHud(game));
    onSave(poursRef.current.slice());
  }, [onSave]);

  const tap = useCallback((tube: number) => {
    const game = gameRef.current;
    const scene = sceneRef.current;
    if (!game || scene.pour || game.is_solved()) return;
    setNote('');
    const selected = scene.selected;
    if (selected === null) {
      if (scene.tubes[tube].length === 0 || game.is_done(tube)) { scene.shakes.set(tube, performance.now()); sound('invalid'); wake(); return; }
      scene.selected = tube; sound('select'); draw(); return;
    }
    if (selected === tube) { scene.selected = null; draw(); return; }
    if (!game.can_pour(selected, tube)) {
      if (scene.tubes[tube].length > 0 && !game.is_done(tube)) { scene.selected = tube; sound('select'); draw(); return; }
      scene.shakes.set(tube, performance.now()); sound('invalid'); wake(); return;
    }
    const before = scene.tubes.map(layers => layers.slice());
    const colour = before[selected][before[selected].length - 1];
    const targetBefore = before[tube].length;
    const amount = game.pour(selected, tube);
    poursRef.current.push(selected * 16 + tube);
    syncScene();
    scene.pour = { from: selected, to: tube, amount, colour, start: performance.now(), before };
    scene.selected = null;
    pourSound(targetBefore, targetBefore + amount, (POUR_MS * 0.3) / 1000);
    if (game.is_done(tube)) { scene.finishedAt.set(tube, performance.now() + POUR_MS * 0.75); window.setTimeout(() => sound('done'), POUR_MS * 0.75); }
    if (game.hints_left() < HINTS_PER_LEVEL) scene.hint = null;
    afterChange();
    wake();
  }, [afterChange, draw, pourSound, sound, syncScene, wake]);

  const undo = useCallback(() => {
    const game = gameRef.current;
    const scene = sceneRef.current;
    if (!game || scene.pour || game.is_solved()) return;
    if (game.undo() < 0) { setNote('Nothing to undo.'); return; }
    poursRef.current.pop();
    scene.selected = null; scene.hint = null;
    syncScene(); sound('undo'); afterChange(); draw();
  }, [afterChange, draw, sound, syncScene]);

  const reset = useCallback(() => {
    const game = gameRef.current;
    const scene = sceneRef.current;
    if (!game || scene.pour) return;
    game.reset();
    poursRef.current = [];
    wonRef.current = false;
    scene.selected = null; scene.hint = null; scene.finishedAt.clear();
    setNote('');
    syncScene(); afterChange(); draw();
  }, [afterChange, draw, syncScene]);

  const hint = useCallback(() => {
    const game = gameRef.current;
    const scene = sceneRef.current;
    if (!game || scene.pour || game.is_solved()) return;
    if (game.hints_left() === 0) { setNote('No hints left on this level.'); sound('invalid'); return; }
    const result = game.hint();
    if (result < 0) { setNote('No solution from here — undo a few pours or reset.'); sound('invalid'); return; }
    const from = result >> 4;
    const to = result & 15;
    scene.selected = null;
    scene.hint = { from, to, start: performance.now() };
    setNote(`Hint: pour tube ${from + 1} into tube ${to + 1}. ${game.hints_left()} left.`);
    sound('hint');
    setHud(readHud(game));
    wake();
  }, [sound, wake]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'Z')) { event.preventDefault(); undo(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        event.preventDefault();
        const step = key === 'ArrowRight' ? 1 : -1;
        scene.cursor = scene.cursor === null ? 0 : (scene.cursor + step + count) % count;
        draw();
      } else if ((key === ' ' || key === 'Enter') && scene.cursor !== null && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); tap(scene.cursor); }
      else if (key === 'u' || key === 'U' || key === 'Backspace') undo();
      else if (key === 'r' || key === 'R') reset();
      else if (key === 'h' || key === 'H') hint();
      else if (key === 'm' || key === 'M') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, draw, tap, undo, reset, hint, toggleMute]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    unlockAudio();
    const currentLayout = layoutRef.current;
    if (!currentLayout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const tube = tubeAt(event.clientX - rect.left, event.clientY - rect.top, count, currentLayout);
    if (tube === null) { sceneRef.current.selected = null; draw(); return; }
    sceneRef.current.cursor = null;
    tap(tube);
  };

  // test hook (?pourTest)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('pourTest')) return;
    const hook = {
      state: () => ({ ...readHud(gameRef.current!), level, tubes: gameRef.current!.tube_count(), colours: gameRef.current!.colour_count(), selected: sceneRef.current.selected, animating: frameRef.current !== 0 }),
      layers: () => readTubes(gameRef.current!),
      canPour: (from: number, to: number) => gameRef.current!.can_pour(from, to),
      peekHint: () => gameRef.current!.peek_hint(),
      tubePoint: (tube: number) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const currentLayout = layoutRef.current!;
        const [x, y] = tubeOrigin(tube, count, currentLayout);
        return { x: rect.left + x + currentLayout.tubeWidth / 2, y: rect.top + y + currentLayout.tubeHeight * 0.6 };
      },
    };
    (window as unknown as { __pourTest?: typeof hook }).__pourTest = hook;
    return () => { delete (window as unknown as { __pourTest?: typeof hook }).__pourTest; };
  }, [level, count]);

  return (
    <div className="game-shell pour" data-testid="pour-screen" data-level={level + 1}>
      <div className="game-shell__header pour-header">
        <button type="button" className="game-button" onClick={onExit} data-testid="pour-exit">← Levels</button>
        <h1 className="pour-title">Level {level + 1}</h1>
        {mute}
      </div>
      <div className="pour-hud">
        <span className="pour-stat" data-testid="pour-count">Pours <b>{hud.pours}</b><small> / par {hud.par}</small></span>
        <button type="button" className="game-button" onClick={undo} disabled={hud.pours === 0 || hud.solved} data-testid="pour-undo">↶ Undo</button>
        <button type="button" className="game-button" onClick={reset} disabled={hud.pours === 0} data-testid="pour-reset">↻ Reset</button>
        <button type="button" className="game-button pour-hint" onClick={hint} disabled={hud.hintsLeft === 0 || hud.solved} data-testid="pour-hint" aria-label={`Hint, ${hud.hintsLeft} left`}>💡 Hint <b>{hud.hintsLeft}</b></button>
      </div>
      {restored && hud.pours > 0 && !hud.solved && !note && <p className="game-restored" data-testid="pour-restored">Picked up where you left off</p>}
      {hud.stuck && <p className="game-banner game-banner--lose" data-testid="pour-stuck">No useful pours left — Undo or Reset.</p>}
      {note && !hud.solved && <p className="pour-note" role="status" data-testid="pour-note">{note}</p>}
      <div className="pour-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="pour-canvas" onPointerDown={onPointerDown} data-testid="pour-canvas" aria-label="Tubes of coloured water" />
        {hud.solved && !sceneRef.current.pour && (
          <div className="pour-overlay" data-testid="pour-won">
            <div className="pour-card pour-result">
              <h2>{level + 1 === LEVEL_COUNT ? 'Every colour sorted!' : 'Sorted!'}</h2>
              <Stars count={hud.stars} size="big" />
              <p>{hud.pours} pours · par {hud.par}{hud.hintsLeft < HINTS_PER_LEVEL ? ' · hint used (★★ max)' : ''}</p>
              <div className="game-actions">
                {level + 1 < LEVEL_COUNT && <button type="button" className="online-button online-button--primary" onClick={() => onLevel(level + 1)} data-testid="pour-next">Next level →</button>}
                <button type="button" className="game-button" onClick={reset} data-testid="pour-replay">Replay</button>
                <button type="button" className="game-button" onClick={onExit}>Levels</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="game-help">Tap a tube, then another to pour. Every tube must end up one colour.</p>
    </div>
  );
}

