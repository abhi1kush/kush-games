import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import {
  applyHint, beginStroke, connectedCount, endStroke, extendStroke, fillPercent, getLevel, isConnected, isPerfect, Level, MAX_LEVEL,
  pathsWithStroke, starsFor, startLevel, Stroke, TrailsState, undoLast,
} from './game';
import { colorOf, DotSymbol } from './palette';
import { createTrailsSaveSlot, restoreTrailsGame, serializeTrailsGame } from './save';
import { playConnectSound, playCutSound, playHintSound, playLevelClearSound, playStepSound } from './sound';
import '../shared.css';
import './colortrails.css';

const PROGRESS_STORAGE_KEY = 'kush-games-color-trails-progress';

interface Progress {
  highestCleared: number;
  /** Best stars per cleared level (index = level number - 1). */
  stars: number[];
}

/** SVG units per board cell. */
const UNIT = 10;
const centerX = (level: Level, cell: number) => (cell % level.columns) * UNIT + UNIT / 2;
const centerY = (level: Level, cell: number) => Math.floor(cell / level.columns) * UNIT + UNIT / 2;

interface TrailLayerProps {
  level: Level;
  color: number;
  path: number[];
  isConnected: boolean;
  /** Changes each time this pair gets connected, to replay the dot pulse. */
  pulseToken: number;
  isHint: boolean;
}

/**
 * One color: tinted cells under its path, the thick rounded line and its two dots. Memoized, and paths keep their
 * array identity while untouched, so a drag only re-renders the color being drawn (and any color it cuts).
 */
const TrailLayer = memo(function TrailLayer({ level, color, path, isConnected: connected, pulseToken, isHint }: TrailLayerProps) {
  const { fill } = colorOf(color);
  const cellsPath = path.map(cell => `M${(cell % level.columns) * UNIT} ${Math.floor(cell / level.columns) * UNIT}h${UNIT}v${UNIT}h${-UNIT}z`).join('');
  const linePath = path.length > 1 ? `M${path.map(cell => `${centerX(level, cell)} ${centerY(level, cell)}`).join('L')}` : '';
  const [first, second] = level.endpoints[color];
  return (
    <g className={`trail${connected ? ' is-connected' : ''}${isHint ? ' is-hint' : ''}`} data-color={color} data-cells={path.join(',')}>
      {cellsPath && <path className="trail__cells" d={cellsPath} fill={fill} />}
      {linePath && <path className="trail__line" d={linePath} stroke={fill} />}
      {[first, second].map(cell => (
        <g key={cell} data-testid="trail-dot" data-dot-color={color} data-cell={cell}>
          {pulseToken > 0 && <circle key={pulseToken} className="trail__pulse" cx={centerX(level, cell)} cy={centerY(level, cell)} r={3.6} fill={fill} />}
          <circle className="trail__dot" cx={centerX(level, cell)} cy={centerY(level, cell)} r={3.6} fill={fill} />
          <DotSymbol color={color} x={centerX(level, cell)} y={centerY(level, cell)} />
        </g>
      ))}
    </g>
  );
});

const BoardGrid = memo(function BoardGrid({ rows, columns }: { rows: number; columns: number }) {
  let lines = '';
  for (let row = 1; row < rows; row++) lines += `M0 ${row * UNIT}H${columns * UNIT}`;
  for (let column = 1; column < columns; column++) lines += `M${column * UNIT} 0V${rows * UNIT}`;
  return <path className="trail-grid" d={lines} />;
});

function loadInitialGame(saveSlot: ReturnType<typeof createTrailsSaveSlot>, progress: Progress) {
  const saved = saveSlot.load();
  const restored = saved ? restoreTrailsGame(saved) : null;
  if (restored) return { game: restored, restored: restored.paths.some(path => path.length > 0) };
  return { game: startLevel(Math.min(MAX_LEVEL, progress.highestCleared + 1)), restored: false };
}

function readProgress(): Progress {
  const stored = readStoredJson<Partial<Progress>>(PROGRESS_STORAGE_KEY, {});
  const highestCleared = Number.isInteger(stored.highestCleared) ? Math.max(0, Math.min(MAX_LEVEL - 1, stored.highestCleared as number)) : 0;
  const stars = Array.isArray(stored.stars) ? stored.stars.slice(0, highestCleared).map(star => (Number.isInteger(star) ? Math.max(0, Math.min(3, star)) : 0)) : [];
  return { highestCleared, stars };
}

export default function ColorTrails() {
  const saveSlot = useMemo(() => createTrailsSaveSlot(), []);
  const [progress, setProgress] = useState<Progress>(readProgress);
  const [initial] = useState(() => loadInitialGame(saveSlot, progress));
  const [game, setGame] = useState<TrailsState>(initial.game);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const [pulse, setPulse] = useState<{ color: number; token: number } | null>(null);
  const [hintColor, setHintColor] = useState<number | null>(null);
  const [isPickingLevel, setIsPickingLevel] = useState(false);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const gameRef = useRef(game);
  gameRef.current = game;
  const strokeRef = useRef<Stroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pendingCellRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const tokenRef = useRef(0);

  const persist = useCallback((state: TrailsState) => {
    const hasProgress = state.paths.some(path => path.length > 0) || state.level.number > 1;
    const data = serializeTrailsGame(state);
    if (data && hasProgress) saveSlot.save(data);
    else if (!hasProgress) saveSlot.clear();
  }, [saveSlot]);

  const commit = useCallback((after: TrailsState) => {
    gameRef.current = after;
    setGame(after);
    if (after.status === 'won') {
      playLevelClearSound(isMutedRef.current);
      setProgress(previous => {
        const stars = [...previous.stars];
        stars[after.level.number - 1] = Math.max(stars[after.level.number - 1] ?? 0, starsFor(after));
        const updated = { highestCleared: Math.max(previous.highestCleared, after.level.number), stars };
        saveStoredJson(PROGRESS_STORAGE_KEY, updated);
        return updated;
      });
      persist(startLevel(Math.min(MAX_LEVEL, after.level.number + 1))); // refresh goes on to the next level
    } else persist(after);
  }, [isMutedRef, persist]);

  const showLevel = useCallback((levelNumber: number) => {
    const fresh = startLevel(Math.max(1, Math.min(MAX_LEVEL, levelNumber)));
    strokeRef.current = null;
    setStroke(null);
    setHintColor(null);
    setWasRestored(false);
    setIsPickingLevel(false);
    gameRef.current = fresh;
    setGame(fresh);
    persist(fresh);
  }, [persist]);

  // ---------- Drawing ----------

  const cellAt = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const { level } = gameRef.current;
    const box = svg.getBoundingClientRect();
    const column = Math.floor(((clientX - box.left) / box.width) * level.columns);
    const row = Math.floor(((clientY - box.top) / box.height) * level.rows);
    if (row < 0 || column < 0 || row >= level.rows || column >= level.columns) return null;
    return row * level.columns + column;
  };

  /** Walk the drag head towards the finger one neighbouring cell at a time (fast swipes skip cells). */
  const processPendingCell = useCallback(() => {
    frameRef.current = 0;
    const target = pendingCellRef.current;
    const before = strokeRef.current;
    if (target === null || !before) return;
    const state = gameRef.current;
    const { columns } = state.level;
    let current = before;
    for (let step = 0; step < 40; step++) {
      const head = current.path[current.path.length - 1];
      if (head === target) break;
      let steps = [target];
      if (!current.path.includes(target)) {
        const rowGap = Math.floor(target / columns) - Math.floor(head / columns), columnGap = (target % columns) - (head % columns);
        const rowStep = head + Math.sign(rowGap) * columns, columnStep = head + Math.sign(columnGap);
        steps = Math.abs(rowGap) >= Math.abs(columnGap) ? [rowStep, columnStep] : [columnStep, rowStep];
        if (!rowGap) steps = [columnStep];
        if (!columnGap) steps = [rowStep];
      }
      const extended = steps.map(next => extendStroke(state, current, next)).find(candidate => candidate !== current);
      if (!extended) break;
      current = extended;
    }
    if (current === before) return;
    const wasConnected = isConnected(state.level, before.color, before.path);
    const nowConnected = isConnected(state.level, current.color, current.path);
    if (nowConnected && !wasConnected) {
      playConnectSound(current.color, isMutedRef.current);
      setPulse({ color: current.color, token: ++tokenRef.current });
      navigator.vibrate?.(15);
    } else if (current.path.length > before.path.length) {
      const cutsSomething = before.startPaths.some((path, color) => color !== current.color && current.path.slice(before.path.length).some(cell => path.includes(cell)));
      if (cutsSomething) playCutSound(isMutedRef.current); else playStepSound(current.path.length, isMutedRef.current);
    }
    strokeRef.current = current;
    setStroke(current);
  }, [isMutedRef]);

  const finishStroke = useCallback(() => {
    const finished = strokeRef.current;
    if (!finished) return;
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); processPendingCell(); }
    const last = strokeRef.current ?? finished;
    strokeRef.current = null;
    pendingCellRef.current = null;
    setStroke(null);
    const before = gameRef.current;
    const after = endStroke(before, last);
    if (after !== before) commit(after);
  }, [commit, processPendingCell]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button > 0 || strokeRef.current) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;
    const started = beginStroke(gameRef.current, cell);
    if (!started) return;
    event.preventDefault();
    unlockAudio();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setWasRestored(false);
    setHintColor(null);
    strokeRef.current = started;
    setStroke(started);
    playStepSound(started.path.length, isMutedRef.current);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!strokeRef.current) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null || cell === pendingCellRef.current) return;
    pendingCellRef.current = cell;
    if (!frameRef.current) frameRef.current = requestAnimationFrame(processPendingCell);
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // ---------- Buttons ----------

  const undo = useCallback(() => {
    const before = gameRef.current;
    const after = undoLast(before);
    if (after === before) return;
    setHintColor(null);
    commit(after);
  }, [commit]);

  const hint = useCallback(() => {
    const { state: after, color } = applyHint(gameRef.current);
    if (color === null) return;
    unlockAudio();
    playHintSound(isMutedRef.current);
    setHintColor(color);
    setPulse({ color, token: ++tokenRef.current });
    setWasRestored(false);
    commit(after);
  }, [commit, isMutedRef]);

  const restart = useCallback(() => showLevel(gameRef.current.level.number), [showLevel]);

  // Decode the next level while the player is thinking.
  const currentLevelNumber = game.level.number;
  useEffect(() => {
    if (currentLevelNumber >= MAX_LEVEL) return;
    const timer = window.setTimeout(() => getLevel(currentLevelNumber + 1), 1200);
    return () => window.clearTimeout(timer);
  }, [currentLevelNumber]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undo();
      else if (key === 'h') hint();
      else if (key === 'r') restart();
      else if (key === 'm') toggleMute();
      else if (key === 'l') setIsPickingLevel(open => !open);
      else if (key === 'escape') setIsPickingLevel(false);
      else if ((key === 'n' || key === 'enter') && gameRef.current.status === 'won') showLevel(gameRef.current.level.number + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hint, restart, showLevel, toggleMute, undo]);

  const { level } = game;
  const shownPaths = useMemo(() => (stroke ? pathsWithStroke(stroke) : game.paths), [stroke, game.paths]);
  const shownState = useMemo(() => ({ ...game, paths: shownPaths }), [game, shownPaths]);
  const connected = connectedCount(shownState);
  const fill = fillPercent(shownState);
  const highestPlayable = Math.min(MAX_LEVEL, progress.highestCleared + 1);
  const colorCount = level.endpoints.length;
  const strokeHead = stroke ? stroke.path[stroke.path.length - 1] : null;
  const stars = game.status === 'won' ? starsFor(game) : 0;

  return (
    <div className="game-shell color-trails" data-testid="color-trails" data-level={level.number} data-status={game.status} data-moves={game.moves}
      data-connected={connected} data-colors={colorCount} data-fill={fill} data-rows={level.rows} data-columns={level.columns}>
      <div className="game-shell__header">
        <div className="trails-level">
          <button type="button" className="game-button trails-level__step" onClick={() => showLevel(level.number - 1)} disabled={level.number <= 1}
            aria-label="Previous level" data-testid="trails-prev">‹</button>
          <button type="button" className="trails-level__name" onClick={() => setIsPickingLevel(open => !open)} aria-label="Choose a level" data-testid="trails-level">Level {level.number}</button>
          <button type="button" className="game-button trails-level__step" onClick={() => showLevel(level.number + 1)} disabled={level.number >= highestPlayable}
            aria-label="Next level" data-testid="trails-next">›</button>
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>Moves</span><b data-testid="trails-moves">{game.moves}<small> / {colorCount}</small></b></div>
        <div className="game-stat"><span>Pairs</span><b data-testid="trails-pairs">{connected}/{colorCount}</b></div>
        <div className="game-stat"><span>Filled</span><b data-testid="trails-fill">{fill}%</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved board restored</p>}
      <div className="trails-board-wrap">
        <div className={`trails-board${game.status === 'won' ? ' is-won' : ''}`} style={{ ['--trail-columns' as string]: level.columns, ['--trail-rows' as string]: level.rows }}>
          <svg ref={svgRef} className="trails-svg" viewBox={`0 0 ${level.columns * UNIT} ${level.rows * UNIT}`} data-testid="trails-board"
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishStroke} onPointerCancel={finishStroke}
            onLostPointerCapture={finishStroke}>
            <BoardGrid rows={level.rows} columns={level.columns} />
            {level.endpoints.map((_, color) => (
              <TrailLayer key={`${level.number}-${color}`} level={level} color={color} path={shownPaths[color]} isConnected={isConnected(level, color, shownPaths[color])}
                pulseToken={pulse?.color === color ? pulse.token : 0} isHint={hintColor === color} />
            ))}
            {stroke && strokeHead !== null && (
              <circle className="trails-finger" cx={centerX(level, strokeHead)} cy={centerY(level, strokeHead)} r={7} fill={colorOf(stroke.color).fill} />
            )}
          </svg>
        </div>
        {game.status === 'won' && (
          <div className="trails-overlay" data-testid="trails-won">
            <div className="trails-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
            <p className="trails-overlay__title">{isPerfect(game) ? 'Perfect!' : `Level ${level.number} cleared!`}</p>
            <p className="trails-stars" aria-label={`${stars} of 3 stars`} data-testid="trails-stars" data-stars={stars}>{'★'.repeat(stars)}<span>{'★'.repeat(3 - stars)}</span></p>
            <p className="trails-overlay__small">{game.moves} move{game.moves === 1 ? '' : 's'} for {colorCount} colors{game.hintsUsed ? ` · ${game.hintsUsed} hint${game.hintsUsed === 1 ? '' : 's'}` : ''}</p>
            <div className="trails-overlay__actions">
              <button type="button" className="game-button" onClick={restart}>↻ Replay</button>
              <button type="button" className="game-button game-button--primary" onClick={() => showLevel(level.number + 1)} data-testid="trails-next-level">Next level ›</button>
            </div>
          </div>
        )}
        {isPickingLevel && (
          <div className="trails-overlay trails-picker" data-testid="trails-picker" role="dialog" aria-label="Choose a level">
            <p className="trails-overlay__title">Levels</p>
            <div className="trails-picker__grid">
              {Array.from({ length: highestPlayable }, (_, index) => index + 1).map(levelNumber => (
                <button type="button" key={levelNumber} className={`trails-picker__level${levelNumber === level.number ? ' is-current' : ''}`}
                  onClick={() => showLevel(levelNumber)} data-testid="trails-pick">
                  <b>{levelNumber}</b>
                  <small>{levelNumber <= progress.highestCleared ? '★'.repeat(progress.stars[levelNumber - 1] ?? 0) || '✓' : 'new'}</small>
                </button>
              ))}
            </div>
            <button type="button" className="game-button" onClick={() => setIsPickingLevel(false)}>Close</button>
          </div>
        )}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undo} disabled={game.status !== 'playing' || game.history.length === 0} data-testid="trails-undo">↶ Undo</button>
        <button type="button" className="game-button" onClick={hint} disabled={game.status !== 'playing'} data-testid="trails-hint">💡 Hint</button>
        <button type="button" className="game-button" onClick={restart} data-testid="trails-restart">↻ Restart</button>
      </div>
      <p className="game-help">Drag from a dot to its twin of the same color. Paths can't cross — fill every square. One move per color is a perfect solve.</p>
    </div>
  );
}
