import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import { drawLock, drawStone, SPARK_COLOURS, SpriteSheet, sweetIconDataUrl } from './art';
import {
  CELLS, createRenderView, EffectKind, Events, GoalKind, LEVEL_COUNT, levelInfo, type LevelInfo, loadMithaiEngine, MithaiMatch, NO_PIECE, Phase, RenderSlot,
  SIZE, SWEETS,
} from './engine';
import { createMithaiSaveSlot, emptyMithaiProgress, type SavedMithai } from './save';
import { playLimited, playMatch, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import './mithai.css';

export default function MithaiMatchScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadMithaiEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="mithai-loading"><p className="game-help">Loading…</p></div>;
  return <MithaiGame memory={memory} />;
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['Click', '+', 'Click'], label: 'Pick a sweet, then a neighbour to swap' },
    { keys: ['Drag'], label: 'Or drag a sweet onto its neighbour' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'drag', leftLabel: 'Swipe a sweet', buttons: [], where: 'or tap a sweet, then the one next to it' },
  touchTips: ['Line up 3 or more of the same sweet', 'Swaps that make no line slide back'],
  weaponsLabel: 'Specials',
  weapons: [
    { letter: '≡', name: '4 in a row: striped (clears a line)', color: '#e0707a' },
    { letter: '▣', name: 'L or T: wrapped (3×3 blast)', color: '#c9a43a' },
    { letter: '✦', name: '5 in a row: sprinkle bomb', color: '#5a3420' },
  ],
};

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.won, 'won'], [Events.lost, 'lost'], [Events.colourBomb, 'colourBomb'], [Events.wrapped, 'wrapped'], [Events.striped, 'striped'],
  [Events.specialMade, 'specialMade'], [Events.invalid, 'invalid'], [Events.swap, 'swap'], [Events.jelly, 'jelly'], [Events.stone, 'stone'],
  [Events.lock, 'lock'], [Events.shuffle, 'shuffle'], [Events.bonus, 'bonus'], [Events.select, 'select'], [Events.landed, 'land'],
];

/** Board colours come from the hub theme (read from CSS variables); the sweets keep their own colours. */
interface BoardColours { cellA: string; cellB: string; brand: string; highlight: string; text: string; }
function readBoardColours(): BoardColours {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { cellA: read('--surface', '#1d4144'), cellB: read('--surface-2', '#245256'), brand: read('--brand', '#4fbc9c'), highlight: read('--highlight', '#efca7c'), text: read('--text-strong', '#ffffff') };
}

interface Renderer { context: CanvasRenderingContext2D; pixels: number; cell: number; sprites: SpriteSheet; colours: BoardColours; }

const PI2 = Math.PI * 2;

/** Draw one frame from the wasm render buffer. */
function drawFrame(renderer: Renderer, render: Float32Array, clock: number) {
  const { context, cell, sprites, colours, pixels } = renderer;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixels, pixels);
  const gap = Math.max(1, cell * 0.04);
  // board cells, jelly
  for (let index = 0; index < CELLS; index++) {
    const offset = RenderSlot.cells + index * RenderSlot.cellStride;
    if (render[offset + 5] === 1) continue; // hole
    const x = (index % SIZE) * cell, y = Math.floor(index / SIZE) * cell;
    context.fillStyle = ((index % SIZE) + Math.floor(index / SIZE)) % 2 === 0 ? colours.cellA : colours.cellB;
    context.beginPath(); context.roundRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap, cell * 0.14); context.fill();
    const jelly = render[offset + 3];
    if (jelly > 0) {
      context.fillStyle = jelly > 1 ? 'rgba(255,92,160,0.72)' : 'rgba(255,128,184,0.42)';
      context.beginPath(); context.roundRect(x + gap * 1.5, y + gap * 1.5, cell - gap * 3, cell - gap * 3, cell * 0.16); context.fill();
      if (jelly > 1) { context.strokeStyle = 'rgba(255,220,236,0.9)'; context.lineWidth = gap; context.stroke(); }
    }
  }
  // hint glow
  if (render[RenderSlot.showHint] === 1) {
    const glow = 0.35 + 0.35 * Math.sin(clock * 6);
    context.strokeStyle = colours.highlight;
    context.lineWidth = cell * 0.07;
    context.globalAlpha = glow;
    for (const slot of [RenderSlot.hintA, RenderSlot.hintB]) {
      const index = render[slot];
      if (index < 0) continue;
      context.beginPath(); context.roundRect((index % SIZE) * cell + gap * 2, Math.floor(index / SIZE) * cell + gap * 2, cell - gap * 4, cell - gap * 4, cell * 0.16); context.stroke();
    }
    context.globalAlpha = 1;
  }
  const selected = render[RenderSlot.selected];
  if (selected >= 0) {
    context.fillStyle = 'rgba(255,255,255,0.28)';
    context.strokeStyle = colours.text;
    context.lineWidth = cell * 0.05;
    context.beginPath(); context.roundRect((selected % SIZE) * cell + gap, Math.floor(selected / SIZE) * cell + gap, cell - gap * 2, cell - gap * 2, cell * 0.16); context.fill(); context.stroke();
  }
  // pieces
  const hint = render[RenderSlot.showHint] === 1;
  for (let index = 0; index < CELLS; index++) {
    const offset = RenderSlot.cells + index * RenderSlot.cellStride;
    const colour = render[offset];
    if (colour === NO_PIECE) continue;
    let x = (index % SIZE + render[offset + 6]) * cell, y = (Math.floor(index / SIZE) + render[offset + 7]) * cell;
    let size = cell;
    if (index === selected) { const pulse = 1 + 0.06 * Math.sin(clock * 10); x -= (pulse - 1) * cell / 2; y -= (pulse - 1) * cell / 2; size = cell * pulse; }
    else if (hint && (index === render[RenderSlot.hintA] || index === render[RenderSlot.hintB])) y += Math.sin(clock * 12) * cell * 0.04;
    context.drawImage(sprites.get(colour, render[offset + 1]), x, y, size, size);
    if (render[offset + 2] === 1) drawLock(context, x, y, cell);
  }
  // stones on top (refills from above a stone slide in underneath)
  for (let index = 0; index < CELLS; index++) {
    const stone = render[RenderSlot.cells + index * RenderSlot.cellStride + 4];
    if (stone > 0) drawStone(context, (index % SIZE) * cell, Math.floor(index / SIZE) * cell, cell, stone);
  }
  // clearing pieces pop and fade
  const ghostCount = render[RenderSlot.ghostCount];
  for (let ghost = 0; ghost < ghostCount; ghost++) {
    const offset = RenderSlot.ghosts + ghost * RenderSlot.ghostStride;
    const progress = Math.min(1, render[offset + 3]);
    const index = render[offset + 2];
    const scale = 1 + progress * 0.35;
    const size = cell * scale;
    context.globalAlpha = 1 - progress;
    context.drawImage(sprites.get(render[offset], render[offset + 1]), (index % SIZE) * cell + (cell - size) / 2, Math.floor(index / SIZE) * cell + (cell - size) / 2, size, size);
  }
  context.globalAlpha = 1;
  drawEffects(renderer, render);
  // sparks
  const particleCount = render[RenderSlot.particleCount];
  for (let particle = 0; particle < particleCount; particle++) {
    const offset = RenderSlot.particles + particle * RenderSlot.particleStride;
    const progress = render[offset + 3];
    const size = cell * 0.12 * (1 - progress * 0.6);
    context.globalAlpha = 1 - progress;
    context.fillStyle = SPARK_COLOURS[render[offset + 2]] ?? '#fff';
    context.fillRect(render[offset] * cell - size / 2, render[offset + 1] * cell - size / 2, size, size);
  }
  context.globalAlpha = 1;
}

function drawEffects(renderer: Renderer, render: Float32Array) {
  const { context, cell, pixels } = renderer;
  const count = render[RenderSlot.effectCount];
  for (let effect = 0; effect < count; effect++) {
    const offset = RenderSlot.effects + effect * RenderSlot.effectStride;
    const kind = render[offset] as EffectKind;
    const index = render[offset + 1];
    const progress = Math.min(1, render[offset + 2]);
    const centreX = (index % SIZE + 0.5) * cell, centreY = (Math.floor(index / SIZE) + 0.5) * cell;
    const fade = 1 - progress;
    switch (kind) {
      case EffectKind.RowBeam: case EffectKind.ColumnBeam: {
        const thickness = cell * (0.2 + 0.45 * fade);
        context.fillStyle = `rgba(255,250,220,${(0.6 * fade).toFixed(3)})`;
        if (kind === EffectKind.RowBeam) context.fillRect(0, centreY - thickness / 2, pixels, thickness);
        else context.fillRect(centreX - thickness / 2, 0, thickness, pixels);
        break;
      }
      case EffectKind.Blast: case EffectKind.BigBlast: {
        const reach = (kind === EffectKind.Blast ? 1.6 : 2.6) * cell;
        context.strokeStyle = `rgba(255,216,107,${fade.toFixed(3)})`;
        context.lineWidth = cell * 0.25 * fade + 1;
        context.beginPath(); context.arc(centreX, centreY, reach * (0.3 + progress * 0.7), 0, PI2); context.stroke();
        context.fillStyle = `rgba(255,240,200,${(0.35 * fade).toFixed(3)})`;
        context.fill();
        break;
      }
      case EffectKind.BombRays: {
        context.strokeStyle = `rgba(255,255,255,${(0.8 * fade).toFixed(3)})`;
        context.lineWidth = cell * 0.08;
        context.beginPath();
        for (let ray = 0; ray < 12; ray++) {
          const angle = ray * (PI2 / 12) + progress;
          context.moveTo(centreX, centreY);
          context.lineTo(centreX + Math.cos(angle) * pixels * progress, centreY + Math.sin(angle) * pixels * progress);
        }
        context.stroke();
        break;
      }
      case EffectKind.Made: {
        context.strokeStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
        context.lineWidth = cell * 0.06;
        context.beginPath(); context.arc(centreX, centreY, cell * (0.3 + progress * 0.5), 0, PI2); context.stroke();
        break;
      }
      case EffectKind.ScoreText: {
        context.font = `800 ${Math.round(cell * 0.36)}px system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.globalAlpha = fade;
        context.lineWidth = cell * 0.08;
        context.strokeStyle = 'rgba(0,0,0,0.55)';
        const text = String(render[offset + 3]);
        context.strokeText(text, centreX, centreY - progress * cell * 0.7);
        context.fillStyle = '#fff6d0';
        context.fillText(text, centreX, centreY - progress * cell * 0.7);
        context.globalAlpha = 1;
        break;
      }
    }
  }
}

type Screen = 'title' | 'map' | 'level';
interface Hud { score: number; moves: number; remaining: number; }

function goalText(info: LevelInfo): string {
  switch (info.goalKind) {
    case GoalKind.Score: return `Score ${info.goalAmount.toLocaleString()} points`;
    case GoalKind.Collect: return `Collect ${info.goalAmount} ${SWEETS[info.goalColour].name}`;
    case GoalKind.Jelly: return 'Clear all the rose jelly';
    default: return 'Break every stone and chain';
  }
}

function GoalIcon({ info }: { info: LevelInfo }) {
  const source = useMemo(() => (info.goalKind === GoalKind.Collect ? sweetIconDataUrl(info.goalColour) : ''), [info.goalKind, info.goalColour]);
  if (info.goalKind === GoalKind.Collect) return <img className="mithai__goal-icon" src={source} alt={SWEETS[info.goalColour].name} />;
  return <span className={`mithai__goal-icon mithai__goal-icon--${['score', 'collect', 'jelly', 'stone'][info.goalKind]}`} aria-hidden="true">{info.goalKind === GoalKind.Score ? '★' : ''}</span>;
}

const Stars = ({ count, testId }: { count: number; testId?: string }) => (
  <span className="mithai__stars" data-testid={testId} data-stars={count} aria-label={`${count} of 3 stars`}>
    {[0, 1, 2].map(star => <b key={star} className={star < count ? 'is-on' : ''}>★</b>)}
  </span>
);

function MithaiGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(createMithaiSaveSlot, []);
  const [progress, setProgress] = useState<SavedMithai>(() => saveSlot.load() ?? emptyMithaiProgress());
  const gameRef = useRef<MithaiMatch | null>(null);
  if (!gameRef.current) gameRef.current = new MithaiMatch();
  const readView = useMemo(() => createRenderView(memory, gameRef.current!), [memory]);
  const isTest = useMemo(() => new URLSearchParams(window.location.search).has('mithaiTest'), []);
  const [screen, setScreen] = useState<Screen>('title');
  const [levelIndex, setLevelIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(Phase.Ready);
  const [isPaused, setIsPaused] = useState(false);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [showsEnd, setShowsEnd] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, moves: 0, remaining: 0 });
  const [result, setResult] = useState({ stars: 0, score: 0, isBest: false });
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(false);
  const needsDrawRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const attemptsRef = useRef(0);
  const perfRef = useRef<{ workMilliseconds: Float64Array; frameMilliseconds: Float64Array; count: number; draws: number } | null>(null);
  const info = useMemo(() => levelInfo(levelIndex), [levelIndex]);

  useEffect(() => () => { saveSlot.flush(); gameRef.current?.free(); gameRef.current = null; }, [saveSlot]);
  useEffect(() => {
    if (!isTest) return;
    perfRef.current = { workMilliseconds: new Float64Array(1200), frameMilliseconds: new Float64Array(1200), count: 0, draws: 0 };
    const testWindow = window as unknown as { __mithaiTest?: unknown };
    testWindow.__mithaiTest = { game: gameRef.current, views: readView, perf: perfRef.current, RenderSlot, redraw: () => { needsDrawRef.current = true; } };
    return () => { delete testWindow.__mithaiTest; };
  }, [isTest, readView]);

  const openLevel = useCallback((index: number) => {
    primeAudio();
    attemptsRef.current += 1;
    const seed = isTest ? index * 7919 + 1 : (Date.now() ^ (attemptsRef.current * 2654435761)) >>> 0;
    gameRef.current!.start_level(index, seed);
    setLevelIndex(index);
    setScreen('level');
    setShowsEnd(false);
    setIsPaused(false);
    isPausedRef.current = false;
    needsDrawRef.current = true;
  }, [isTest]);

  const pause = useCallback(() => {
    if (isPausedRef.current) return;
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
  const begin = useCallback(() => { primeAudio(); gameRef.current!.begin(); needsDrawRef.current = true; }, []);

  const recordWin = useCallback(() => {
    const game = gameRef.current!;
    const index = game.level(), stars = game.stars(), score = game.score();
    setProgress(previous => {
      const next: SavedMithai = { unlocked: Math.max(previous.unlocked, Math.min(LEVEL_COUNT - 1, index + 1)), stars: [...previous.stars], best: [...previous.best] };
      next.stars[index] = Math.max(next.stars[index], stars);
      next.best[index] = Math.max(next.best[index], score);
      setResult({ stars, score, isBest: score > previous.best[index] });
      saveSlot.save(next);
      return next;
    });
  }, [saveSlot]);

  // ---------- The loop: advance the wasm world, draw from its memory (only while a level is open) ----------
  useEffect(() => {
    if (screen !== 'level') return;
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d')!;
    let renderer: Renderer | null = null;
    let colours = readBoardColours();
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const box = stage.getBoundingClientRect();
      if (box.width < 10) return;
      const pixels = Math.round(box.width * pixelRatio);
      canvas.width = canvas.height = pixels;
      const cell = pixels / SIZE;
      const sprites = renderer && renderer.sprites.pixels === Math.round(cell) ? renderer.sprites : new SpriteSheet(Math.round(cell));
      renderer = { context, pixels, cell, sprites, colours };
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    const themeObserver = new MutationObserver(() => { colours = readBoardColours(); if (renderer) renderer.colours = colours; needsDrawRef.current = true; });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let lastPhase = -1, lastScore = -1, lastMoves = -1, lastRemaining = -1;
    let endTimer = 0;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current!;
        const events = game.advance(seconds); // wasm drops hitches (> 100 ms) and caps slow frames
        const render = readView();
        if (events) {
          const muted = isMutedRef.current;
          if (events & Events.match) playMatch(render[RenderSlot.cascade], muted);
          for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
          if (events & Events.won) recordWin();
        }
        const currentPhase = render[RenderSlot.phase];
        if (currentPhase !== lastPhase) {
          lastPhase = currentPhase;
          setPhase(currentPhase as Phase);
          window.clearTimeout(endTimer);
          if (currentPhase === Phase.Won || currentPhase === Phase.Lost) endTimer = window.setTimeout(() => setShowsEnd(true), currentPhase === Phase.Won ? 900 : 600);
          else setShowsEnd(false);
          needsDrawRef.current = true;
        }
        const score = render[RenderSlot.score], moves = render[RenderSlot.movesLeft], remaining = render[RenderSlot.goalRemaining];
        if (score !== lastScore || moves !== lastMoves || remaining !== lastRemaining) {
          lastScore = score; lastMoves = moves; lastRemaining = remaining;
          setHud({ score, moves, remaining });
        }
        // a settled board with no hint or selection doesn't change: skip drawing
        const isMoving = render[RenderSlot.animating] === 1 || render[RenderSlot.showHint] === 1 || render[RenderSlot.selected] >= 0
          || render[RenderSlot.particleCount] > 0 || render[RenderSlot.effectCount] > 0 || render[RenderSlot.ghostCount] > 0;
        if (renderer && (isMoving || needsDrawRef.current)) {
          needsDrawRef.current = false;
          drawFrame(renderer, render, now / 1000);
          if (perfRef.current) perfRef.current.draws++;
        }
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = seconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Mithai Match frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(endTimer); resizeObserver.disconnect(); themeObserver.disconnect(); };
  }, [screen, readView, isMutedRef, recordWin]);

  useEffect(() => {
    const handleHide = () => { if (document.hidden) { pause(); saveSlot.flush(); } };
    document.addEventListener('visibilitychange', handleHide);
    return () => document.removeEventListener('visibilitychange', handleHide);
  }, [pause, saveSlot]);

  const nextAction = useRef<() => void>(() => {});
  nextAction.current = () => {
    if (screen === 'title') { setScreen('map'); return; }
    if (screen !== 'level') return;
    if (isPausedRef.current) { resume(); return; }
    if (phase === Phase.Ready) begin();
    else if (showsEnd && phase === Phase.Won) { if (levelIndex + 1 < LEVEL_COUNT) openLevel(levelIndex + 1); else setScreen('map'); }
    else if (showsEnd && phase === Phase.Lost) openLevel(levelIndex);
  };
  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'enter' || key === ' ') { event.preventDefault(); nextAction.current(); }
      else if (key === 'p' && screen === 'level') { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm') toggleMute();
    };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [screen, pause, resume, toggleMute]);

  // Tap-tap or swipe: a drag past ~0.35 of a cell becomes a swipe in that direction; otherwise it's a tap.
  const pointer = useRef<{ id: number; cell: number; x: number; y: number; swiped: boolean } | null>(null);
  const cellAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.floor(((event.clientX - box.left) / box.width) * SIZE);
    const row = Math.floor(((event.clientY - box.top) / box.height) * SIZE);
    return column < 0 || column >= SIZE || row < 0 || row >= SIZE ? -1 : row * SIZE + column;
  };
  const canPlay = screen === 'level' && !isPaused && phase !== Phase.Ready && phase !== Phase.Won && phase !== Phase.Lost;

  const totalStars = progress.stars.reduce((sum, stars) => sum + stars, 0);
  const meterMaximum = Math.max(1, info.threeStars);
  const liveStars = hud.score >= info.threeStars ? 3 : hud.score >= info.twoStars ? 2 : 0;

  const bar = (
    <div className="mithai__bar">
      {screen === 'level' && <>
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="mithai-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={() => openLevel(levelIndex)} data-testid="mithai-restart">Restart</button>
        <button type="button" className="game-button" onClick={() => setScreen('map')} data-testid="mithai-map-button">Map</button>
      </>}
      {screen === 'map' && <button type="button" className="game-button" onClick={() => setScreen('title')} data-testid="mithai-title-button">How to play</button>}
      <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      <span className="mithai__total" data-testid="mithai-total-stars">★ {totalStars}/{LEVEL_COUNT * 3}</span>
    </div>
  );

  return (
    <div className="game-shell mithai" data-testid="mithai" data-screen={screen} data-phase={phase} data-paused={isPaused}>
      {screen !== 'level' && bar}

      {screen === 'title' && (
        <div className="mithai__card mithai__title-card" data-testid="mithai-title">
          <b className="mithai__logo">Mithai <span>Match</span></b>
          <span className="mithai__tagline">Swap the sweets, line up three, and clear the sweet-shop counter.</span>
          <span className="mithai__sweets" aria-hidden="true">{SWEETS.map((sweet, colour) => <img key={sweet.name} src={sweetIconDataUrl(colour)} alt="" title={sweet.name} />)}</span>
          <ControlsPanel guide={CONTROLS_GUIDE} testId="mithai-controls" />
          <button type="button" className="game-button game-button--primary" onClick={() => { primeAudio(); setScreen('map'); }} data-testid="mithai-play">
            {progress.unlocked > 0 || progress.stars[0] > 0 ? 'Continue' : 'Play'}
          </button>
        </div>
      )}

      {screen === 'map' && (
        <div className="mithai__map" data-testid="mithai-map">
          <h2>Sweet-shop trail · pick a level</h2>
          <ol className="mithai__path">
            {Array.from({ length: LEVEL_COUNT }, (_, index) => {
              const isLocked = index > progress.unlocked;
              const isNext = index === progress.unlocked && progress.stars[index] === 0;
              const levelGoal = levelInfo(index).goalKind;
              return (
                <li key={index} className={`mithai__node${isLocked ? ' is-locked' : ''}${isNext ? ' is-next' : ''}`}
                  style={{ gridRow: Math.floor(index / 4) + 1, gridColumn: Math.floor(index / 4) % 2 === 0 ? (index % 4) + 1 : 4 - (index % 4) }}>
                  <button type="button" disabled={isLocked} onClick={() => openLevel(index)} data-testid={`mithai-level-${index + 1}`}
                    aria-label={`Level ${index + 1}${isLocked ? ' (locked)' : `, ${progress.stars[index]} stars`}`}>
                    <span className="mithai__node-number">{isLocked ? '🔒' : index + 1}</span>
                    <span className={`mithai__node-goal mithai__node-goal--${['score', 'collect', 'jelly', 'stone'][levelGoal]}`} aria-hidden="true" />
                  </button>
                  {!isLocked && <Stars count={progress.stars[index]} testId={`mithai-level-${index + 1}-stars`} />}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {screen === 'level' && (
        <div className="mithai__play">
          <div className="mithai__side">
            {bar}
            <div className="mithai__hud" data-testid="mithai-hud">
            <span className="mithai__hud-level">Level {levelIndex + 1}</span>
            <span className="mithai__hud-goal" data-testid="mithai-goal" title={goalText(info)}>
              <GoalIcon info={info} />
              <b data-testid="mithai-goal-remaining">{info.goalKind === GoalKind.Score ? hud.remaining.toLocaleString() : hud.remaining}</b>
              <small>{info.goalKind === GoalKind.Score ? 'points to go' : info.goalKind === GoalKind.Collect ? 'to collect' : info.goalKind === GoalKind.Jelly ? 'jelly left' : 'blockers left'}</small>
            </span>
            <span className="mithai__hud-moves"><b data-testid="mithai-moves">{hud.moves}</b><small>moves</small></span>
            <span className="mithai__hud-score">
              <b data-testid="mithai-score">{hud.score.toLocaleString()}</b>
              <span className="mithai__meter" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (hud.score / meterMaximum) * 100).toFixed(1)}%` }} />
                <em style={{ left: `${((info.twoStars / meterMaximum) * 100).toFixed(1)}%` }} className={liveStars >= 2 ? 'is-on' : ''}>★</em>
                <em style={{ left: '100%' }} className={liveStars >= 3 ? 'is-on' : ''}>★</em>
              </span>
            </span>
          </div>
          </div>
          <div className="mithai__stage" ref={stageRef}>
            <canvas ref={canvasRef} className="mithai__canvas" data-testid="mithai-canvas" aria-label="Mithai Match board"
              onPointerDown={event => {
                if (!canPlay) return;
                const cell = cellAt(event);
                if (cell < 0) return;
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
                pointer.current = { id: event.pointerId, cell, x: event.clientX, y: event.clientY, swiped: false };
              }}
              onPointerMove={event => {
                const start = pointer.current;
                if (!start || start.id !== event.pointerId || start.swiped) return;
                const box = event.currentTarget.getBoundingClientRect();
                const threshold = (box.width / SIZE) * 0.35;
                const deltaX = event.clientX - start.x, deltaY = event.clientY - start.y;
                if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) return;
                start.swiped = true;
                const direction = Math.abs(deltaX) > Math.abs(deltaY) ? (deltaX > 0 ? 1 : 3) : (deltaY > 0 ? 2 : 0);
                gameRef.current!.swipe(start.cell, direction);
                needsDrawRef.current = true;
              }}
              onPointerUp={event => {
                const start = pointer.current;
                if (!start || start.id !== event.pointerId) return;
                pointer.current = null;
                if (!start.swiped) { gameRef.current!.tap(start.cell); needsDrawRef.current = true; }
              }}
              onPointerCancel={() => { pointer.current = null; }} />
            {isPaused && (
              <div className="mithai__overlay" data-testid="mithai-overlay" onClick={resume} role="presentation">
                <b>Paused</b><span>Tap or press P to resume</span>
                <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="mithai-controls-toggle" />
                {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="mithai-pause-controls" />}
              </div>
            )}
            {!isPaused && phase === Phase.Ready && (
              <div className="mithai__overlay" data-testid="mithai-overlay">
                <b>Level {levelIndex + 1}</b>
                <span className="mithai__intro-goal"><GoalIcon info={info} /> {goalText(info)}</span>
                <span>in {info.moves} moves</span>
                <button type="button" className="game-button game-button--primary" onClick={begin} data-testid="mithai-start">Start</button>
              </div>
            )}
            {!isPaused && showsEnd && phase === Phase.Won && (
              <div className="mithai__overlay" data-testid="mithai-overlay">
                <b>Sweet! Level {levelIndex + 1} cleared</b>
                <Stars count={result.stars} testId="mithai-result-stars" />
                <span data-testid="mithai-final-score">Score {result.score.toLocaleString()}{result.isBest ? ' · new best!' : ''}</span>
                <span className="mithai__buttons">
                  <button type="button" className="game-button" onClick={() => setScreen('map')} data-testid="mithai-to-map">Map</button>
                  <button type="button" className="game-button" onClick={() => openLevel(levelIndex)} data-testid="mithai-replay">Replay</button>
                  {levelIndex + 1 < LEVEL_COUNT && <button type="button" className="game-button game-button--primary" onClick={() => openLevel(levelIndex + 1)} data-testid="mithai-next">Next level</button>}
                </span>
              </div>
            )}
            {!isPaused && showsEnd && phase === Phase.Lost && (
              <div className="mithai__overlay" data-testid="mithai-overlay">
                <b>Out of moves</b>
                <span>{goalText(info)} · {hud.remaining.toLocaleString()} to go</span>
                <span className="mithai__buttons">
                  <button type="button" className="game-button" onClick={() => setScreen('map')} data-testid="mithai-to-map">Map</button>
                  <button type="button" className="game-button game-button--primary" onClick={() => openLevel(levelIndex)} data-testid="mithai-retry">Try again</button>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      <p className="game-help">Click or tap a sweet, then a neighbour to swap (or drag/swipe it) · 4 in a row makes a striped sweet, an L or T makes a wrapped one,
        5 in a row a sprinkle bomb · swap two specials together for a bigger blast · P pause · M mute · Esc back to the hub.</p>
    </div>
  );
}
