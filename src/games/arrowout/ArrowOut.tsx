import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import {
  Arrow, arrowCells, ArrowGameState, arrowsLeft, DIRECTION_STEPS, exitPath, findHint, LIVES_PER_LEVEL, startLevel, tapArrow, undoLast,
} from './game';
import { createArrowSaveSlot, MAX_LEVEL, restoreArrowGame, serializeArrowGame } from './save';
import { playBlockedSound, playFailSound, playHintSound, playLevelClearSound, playSlideSound } from './sound';
import '../shared.css';
import './arrowout.css';

const PROGRESS_STORAGE_KEY = 'kush-games-arrow-out-progress';
const ARROW_COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f43', '#f78fb3', '#7bed9f'];

interface Progress { highestCleared: number; }

/** Feedback animations, each with a token so the same one can play again. */
interface Effect { arrowId: number; token: number; cells: number; }

/** SVG for one arrow, drawn pointing right in a length×1 box and turned to its direction. */
function ArrowShape({ arrow, color }: { arrow: Arrow; color: string }) {
  const long = arrow.length * 100;
  const isVertical = arrow.direction === 'up' || arrow.direction === 'down';
  const turn = {
    right: '',
    left: `translate(${long},100) rotate(180)`,
    down: `translate(100,0) rotate(90)`,
    up: `translate(0,${long}) rotate(-90)`,
  }[arrow.direction];
  return (
    <svg viewBox={`0 0 ${isVertical ? 100 : long} ${isVertical ? long : 100}`} width="100%" height="100%" aria-hidden="true">
      <g transform={turn}>
        <rect x="8" y="8" width={long - 16} height="84" rx="22" fill="rgba(255,255,255,0.06)" />
        <line x1="26" y1="50" x2={long - 44} y2="50" stroke={color} strokeWidth="22" strokeLinecap="round" />
        <polygon points={`${long - 12},50 ${long - 52},16 ${long - 52},84`} fill={color} stroke={color} strokeWidth="8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

interface ArrowPieceProps {
  arrow: Arrow;
  /** Cells from the head to just past the board edge (how far it slides out). */
  exitCells: number;
  isLeaving: boolean;
  isHint: boolean;
  bump: Effect | null;
  flash: Effect | null;
  returnToken: number;
  onLeft: (arrowId: number) => void;
}

/** One arrow. Moves only with transform animations (Web Animations API), so React doesn't re-render while it moves. */
const ArrowPiece = memo(function ArrowPiece({ arrow, exitCells, isLeaving, isHint, bump, flash, returnToken, onLeft }: ArrowPieceProps) {
  const elementRef = useRef<HTMLButtonElement>(null);
  const cells = arrowCells(arrow);
  const top = Math.min(...cells.map(cell => cell.row));
  const left = Math.min(...cells.map(cell => cell.column));
  const isVertical = arrow.direction === 'up' || arrow.direction === 'down';
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  const cellSize = () => {
    const element = elementRef.current;
    if (!element) return 40;
    return (isVertical ? element.offsetHeight : element.offsetWidth) / arrow.length;
  };
  const offset = (cellCount: number) => `translate(${columnStep * cellCount * cellSize()}px, ${rowStep * cellCount * cellSize()}px)`;

  useLayoutEffect(() => {
    if (!isLeaving || !elementRef.current) return;
    const distance = exitCells + arrow.length;
    const animation = elementRef.current.animate(
      [{ transform: 'translate(0, 0)', opacity: 1 }, { transform: offset(distance * 0.75), opacity: 1, offset: 0.7 }, { transform: offset(distance), opacity: 0 }],
      { duration: 160 + distance * 35, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' },
    );
    animation.onfinish = () => onLeft(arrow.id);
    // undo or restart during the slide snaps the arrow back
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [isLeaving]);

  useEffect(() => {
    if (!bump || !elementRef.current) return;
    const reach = bump.cells + 0.22;
    elementRef.current.animate(
      [{ transform: 'translate(0, 0)' }, { transform: offset(reach), offset: 0.35 }, { transform: offset(reach - 0.12), offset: 0.5 }, { transform: 'translate(0, 0)', offset: 0.75 },
        { transform: `translate(${rowStep ? 4 : 0}px, ${columnStep ? 4 : 0}px)`, offset: 0.85 }, { transform: 'translate(0, 0)' }],
      { duration: 160 + bump.cells * 40 + 160, easing: 'ease-out' },
    );
  }, [bump?.token]);

  useEffect(() => {
    if (!flash || !elementRef.current) return;
    elementRef.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.9)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 260, delay: 90 + flash.cells * 40 });
  }, [flash?.token]);

  useEffect(() => {
    if (!returnToken || !elementRef.current) return;
    elementRef.current.animate([{ transform: offset(1.5), opacity: 0 }, { transform: 'translate(0, 0)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }, [returnToken]);

  return (
    <button ref={elementRef} type="button" className={`arrow-piece${isHint ? ' is-hint' : ''}${isLeaving ? ' is-leaving' : ''}${bump ? ' was-blocked' : ''}`}
      data-arrow-id={arrow.id} data-row={arrow.headRow} data-column={arrow.headColumn} data-direction={arrow.direction} data-length={arrow.length}
      aria-label={`Arrow pointing ${arrow.direction}`} disabled={isLeaving}
      style={{
        top: `calc(var(--arrow-cell) * ${top})`, left: `calc(var(--arrow-cell) * ${left})`,
        width: `calc(var(--arrow-cell) * ${isVertical ? 1 : arrow.length})`, height: `calc(var(--arrow-cell) * ${isVertical ? arrow.length : 1})`,
      }}>
      <ArrowShape arrow={arrow} color={ARROW_COLORS[arrow.id % ARROW_COLORS.length]} />
    </button>
  );
});

function loadInitialGame(saveSlot: ReturnType<typeof createArrowSaveSlot>, progress: Progress) {
  const saved = saveSlot.load();
  const restored = saved ? restoreArrowGame(saved) : null;
  if (restored) return { game: restored, restored: restored.removedIds.length > 0 || restored.mistakes > 0 };
  return { game: startLevel(Math.min(MAX_LEVEL, progress.highestCleared + 1)), restored: false };
}

export default function ArrowOut() {
  const saveSlot = useMemo(() => createArrowSaveSlot(), []);
  const [progress, setProgress] = useState<Progress>(() => {
    const stored = readStoredJson<Progress>(PROGRESS_STORAGE_KEY, { highestCleared: 0 });
    return { highestCleared: Number.isInteger(stored.highestCleared) ? Math.max(0, Math.min(MAX_LEVEL - 1, stored.highestCleared)) : 0 };
  });
  const [initial] = useState(() => loadInitialGame(saveSlot, progress));
  const [game, setGame] = useState<ArrowGameState>(initial.game);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [leavingIds, setLeavingIds] = useState<number[]>([]);
  const [bump, setBump] = useState<Effect | null>(null);
  const [flash, setFlash] = useState<Effect | null>(null);
  const [returned, setReturned] = useState<{ arrowId: number; token: number } | null>(null);
  const [hintId, setHintId] = useState<number | null>(null);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const gameRef = useRef(game);
  gameRef.current = game;
  const tokenRef = useRef(0);

  const persist = useCallback((state: ArrowGameState) => {
    const hasProgress = state.removedIds.length > 0 || state.mistakes > 0 || state.hintsUsed > 0 || state.level.number > 1;
    const data = serializeArrowGame(state);
    if (data && hasProgress) saveSlot.save(data);
    else if (!hasProgress) saveSlot.clear();
  }, [saveSlot]);

  const showLevel = useCallback((levelNumber: number) => {
    const fresh = startLevel(Math.max(1, Math.min(MAX_LEVEL, levelNumber)));
    gameRef.current = fresh;
    setGame(fresh);
    setLeavingIds([]);
    setBump(null);
    setFlash(null);
    setHintId(null);
    setWasRestored(false);
    persist(fresh);
  }, [persist]);

  const tap = useCallback((arrowId: number) => {
    const before = gameRef.current;
    const { state: after, result } = tapArrow(before, arrowId);
    if (result.kind === 'ignored') return;
    unlockAudio();
    setWasRestored(false);
    setHintId(null);
    const token = ++tokenRef.current;
    if (result.kind === 'blocked') {
      setBump({ arrowId, token, cells: result.freeCells });
      setFlash({ arrowId: result.blockerId, token, cells: result.freeCells });
      navigator.vibrate?.(after.status === 'failed' ? [40, 60, 80] : 30);
      if (after.status === 'failed') playFailSound(isMutedRef.current); else playBlockedSound(isMutedRef.current);
    } else {
      setLeavingIds(ids => [...ids, arrowId]);
      if (after.status === 'won') {
        playLevelClearSound(isMutedRef.current);
        const updated = { highestCleared: Math.max(progress.highestCleared, after.level.number) };
        setProgress(updated);
        saveStoredJson(PROGRESS_STORAGE_KEY, updated);
      } else playSlideSound(isMutedRef.current);
    }
    gameRef.current = after;
    setGame(after);
    if (after.status === 'won') persist(startLevel(Math.min(MAX_LEVEL, after.level.number + 1))); // refresh goes to the next level
    else if (after.status === 'failed') persist({ ...startLevel(after.level.number), mistakes: after.mistakes }); // refresh retries the level
    else persist(after);
  }, [isMutedRef, persist, progress.highestCleared]);

  const handleLeft = useCallback((arrowId: number) => setLeavingIds(ids => ids.filter(id => id !== arrowId)), []);

  const undo = useCallback(() => {
    const before = gameRef.current;
    const after = undoLast(before);
    if (after === before) return;
    const arrowId = before.removedIds[before.removedIds.length - 1];
    setLeavingIds(ids => ids.filter(id => id !== arrowId));
    setReturned({ arrowId, token: ++tokenRef.current });
    setHintId(null);
    gameRef.current = after;
    setGame(after);
    persist(after);
  }, [persist]);

  const hint = useCallback(() => {
    const current = gameRef.current;
    const arrowId = findHint(current);
    if (arrowId === null) return;
    unlockAudio();
    playHintSound(isMutedRef.current);
    setHintId(arrowId);
    if (hintId !== arrowId) {
      const after = { ...current, hintsUsed: current.hintsUsed + 1 };
      gameRef.current = after;
      setGame(after);
      persist(after);
    }
  }, [hintId, isMutedRef, persist]);

  const restart = useCallback(() => showLevel(gameRef.current.level.number), [showLevel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undo();
      else if (key === 'h') hint();
      else if (key === 'r') restart();
      else if (key === 'm') toggleMute();
      else if ((key === 'n' || key === 'enter') && gameRef.current.status === 'won') showLevel(gameRef.current.level.number + 1);
      else if (key === 'enter' && gameRef.current.status === 'failed') restart();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hint, restart, showLevel, toggleMute, undo]);

  const handleBoardClick = (event: ReactMouseEvent) => {
    const piece = (event.target as HTMLElement).closest('[data-arrow-id]') as HTMLElement | null;
    if (piece) tap(Number(piece.dataset.arrowId));
  };

  const { level } = game;
  const removed = useMemo(() => new Set(game.removedIds), [game.removedIds]);
  const exitCellsById = useMemo(() => level.arrows.map(arrow => exitPath(arrow, level.rows, level.columns).length + 1), [level]);
  const visibleArrows = level.arrows.filter(arrow => !removed.has(arrow.id) || leavingIds.includes(arrow.id));
  const highestPlayable = Math.min(MAX_LEVEL, progress.highestCleared + 1);
  const starCount = game.livesLeft;

  return (
    <div className="game-shell arrow-out" data-testid="arrow-out" data-level={level.number} data-status={game.status} data-lives={game.livesLeft}
      data-arrows-left={arrowsLeft(game)} data-mistakes={game.mistakes} data-rows={level.rows} data-columns={level.columns}>
      <div className="game-shell__header">
        <div className="arrow-level">
          <button type="button" className="game-button arrow-level__step" onClick={() => showLevel(level.number - 1)} disabled={level.number <= 1}
            aria-label="Previous level" data-testid="arrow-prev">‹</button>
          <b data-testid="arrow-level">Level {level.number}</b>
          <button type="button" className="game-button arrow-level__step" onClick={() => showLevel(level.number + 1)} disabled={level.number >= highestPlayable}
            aria-label="Next level" data-testid="arrow-next">›</button>
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>Lives</span><b className="arrow-lives" data-testid="arrow-lives" aria-label={`${game.livesLeft} lives`}>
          {Array.from({ length: LIVES_PER_LEVEL }, (_, index) => <span key={index} className={index < game.livesLeft ? '' : 'is-lost'}>♥</span>)}
        </b></div>
        <div className="game-stat"><span>Arrows</span><b data-testid="arrow-count">{arrowsLeft(game)}</b></div>
        <div className="game-stat"><span>Board</span><b>{level.columns}×{level.rows}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved level restored</p>}
      <div className="arrow-board-wrap">
        <div className={`arrow-board${game.status !== 'playing' ? ' is-over' : ''}`} data-testid="arrow-board" onClick={handleBoardClick}
          style={{ ['--arrow-columns' as string]: level.columns, ['--arrow-rows' as string]: level.rows }}>
          {visibleArrows.map(arrow => (
            <ArrowPiece key={`${level.number}-${arrow.id}`} arrow={arrow} exitCells={exitCellsById[arrow.id]} isLeaving={removed.has(arrow.id)} isHint={hintId === arrow.id}
              bump={bump?.arrowId === arrow.id ? bump : null} flash={flash?.arrowId === arrow.id ? flash : null}
              returnToken={returned?.arrowId === arrow.id ? returned.token : 0} onLeft={handleLeft} />
          ))}
        </div>
        {game.status === 'won' && (
          <div className="arrow-overlay arrow-overlay--won" data-testid="arrow-won">
            <div className="arrow-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
            <p className="arrow-overlay__title">Level {level.number} cleared!</p>
            <p className="arrow-stars" aria-label={`${starCount} of 3 stars`}>{'★'.repeat(starCount)}<span>{'★'.repeat(LIVES_PER_LEVEL - starCount)}</span></p>
            <p className="arrow-overlay__small">{game.mistakes === 0 ? 'Perfect — no wrong taps!' : `${game.mistakes} wrong tap${game.mistakes === 1 ? '' : 's'}`}{game.hintsUsed ? ` · ${game.hintsUsed} hint${game.hintsUsed === 1 ? '' : 's'}` : ''}</p>
            <button type="button" className="game-button game-button--primary" onClick={() => showLevel(level.number + 1)} data-testid="arrow-next-level">Next level ›</button>
          </div>
        )}
        {game.status === 'failed' && (
          <div className="arrow-overlay" data-testid="arrow-failed">
            <p className="arrow-overlay__title">Out of lives</p>
            <p className="arrow-overlay__small">Look for arrows with a clear path before tapping.</p>
            <button type="button" className="game-button game-button--primary" onClick={restart} data-testid="arrow-retry">↻ Try again</button>
          </div>
        )}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undo} disabled={game.status !== 'playing' || game.removedIds.length === 0} data-testid="arrow-undo">↶ Undo</button>
        <button type="button" className="game-button" onClick={hint} disabled={game.status !== 'playing'} data-testid="arrow-hint">💡 Hint</button>
        <button type="button" className="game-button" onClick={restart} data-testid="arrow-restart">↻ Restart</button>
      </div>
      <p className="game-help">Tap an arrow to send it off the board. It only moves if nothing is in its way — a blocked tap costs a life.</p>
    </div>
  );
}
