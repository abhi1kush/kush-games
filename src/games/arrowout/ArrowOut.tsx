import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import {
  Arrow, ArrowGameState, arrowsLeft, DIRECTION_STEPS, exitPath, findHint, LIVES_PER_LEVEL, startLevel, tapArrow, undoLast,
} from './game';
import { createArrowSaveSlot, MAX_LEVEL, restoreArrowGame, serializeArrowGame } from './save';
import { playBlockedSound, playFailSound, playHintSound, playLevelClearSound, playSlideSound } from './sound';
import '../shared.css';
import './arrowout.css';

const PROGRESS_STORAGE_KEY = 'kush-games-arrow-out-progress';

interface Progress { highestCleared: number; }

/** Feedback animations, each with a token so the same one can play again. */
interface Effect { arrowId: number; token: number; cells: number; }

/** SVG units per board cell. */
const UNIT = 10;
const BOARD_MARGIN = 3;
const centerOf = (cell: { row: number; column: number }) => ({ x: cell.column * UNIT + UNIT / 2, y: cell.row * UNIT + UNIT / 2 });

interface ArrowPieceProps {
  arrow: Arrow;
  /** Free cells from the head to the board edge (how far the head travels before the body follows it out). */
  exitCells: number;
  isLeaving: boolean;
  isHint: boolean;
  bump: Effect | null;
  flash: Effect | null;
  returnToken: number;
  onLeft: (arrowId: number) => void;
}

/**
 * One winding arrow. The line is drawn along its path plus a straight run past the board edge, with a dash
 * exactly as long as the arrow. Sliding the dash forward (stroke-dashoffset) moves the arrow along its own trail
 * like a train, while the arrowhead slides straight ahead. Both run as Web Animations, so React does nothing per frame.
 */
const ArrowPiece = memo(function ArrowPiece({ arrow, exitCells, isLeaving, isHint, bump, flash, returnToken, onLeft }: ArrowPieceProps) {
  const groupRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGPolygonElement>(null);
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  const bodyLength = (arrow.cells.length - 1) * UNIT;
  /** Distance the head moves until the whole arrow is off the board. */
  const travel = (exitCells + arrow.cells.length + 1) * UNIT;
  const points = arrow.cells.map(centerOf);
  const head = points[points.length - 1];
  const exitPoint = { x: head.x + columnStep * travel, y: head.y + rowStep * travel };
  const trackPath = `M${points.map(point => `${point.x} ${point.y}`).join('L')}L${exitPoint.x} ${exitPoint.y}`;
  const bodyPath = `M${points.map(point => `${point.x} ${point.y}`).join('L')}`;
  const dash = `${bodyLength} ${bodyLength + travel + UNIT * 2}`;
  // arrowhead triangle: tip ahead of the head's centre, base across the line
  const tipX = head.x + columnStep * 4.2, tipY = head.y + rowStep * 4.2;
  const baseX = head.x - columnStep * 0.6, baseY = head.y - rowStep * 0.6;
  const headPoints = `${tipX},${tipY} ${baseX + rowStep * 2.8},${baseY + columnStep * 2.8} ${baseX - rowStep * 2.8},${baseY - columnStep * 2.8}`;
  const hitPath = `${bodyPath}L${head.x + columnStep * 3} ${head.y + rowStep * 3}`;

  /** Move the arrow `distance` units along its track (keyframes of distances). */
  const moveAlongTrack = (distances: number[], timing: KeyframeAnimationOptions) => {
    const lineFrames = distances.map(distance => ({ strokeDashoffset: `${-distance}` }));
    const headFrames = distances.map(distance => ({ transform: `translate(${columnStep * distance}px, ${rowStep * distance}px)` }));
    return [lineRef.current?.animate(lineFrames, timing), glowRef.current?.animate(lineFrames, timing), headRef.current?.animate(headFrames, timing)]
      .filter((animation): animation is Animation => !!animation);
  };

  useLayoutEffect(() => {
    if (!isLeaving) return;
    const animations = moveAlongTrack([0, travel], { duration: 220 + (travel / UNIT) * 32, easing: 'cubic-bezier(0.45, 0, 0.85, 0.5)', fill: 'forwards' });
    if (animations[0]) animations[0].onfinish = () => onLeft(arrow.id);
    // undo or restart during the slide snaps the arrow back
    return () => animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
  }, [isLeaving]);

  useEffect(() => {
    if (!bump) return;
    const reach = (bump.cells + 0.35) * UNIT;
    moveAlongTrack([0, reach, reach * 0.8, 0, 0], { duration: 260 + bump.cells * 45, easing: 'ease-out' });
    groupRef.current?.animate(
      [{ transform: 'translate(0, 0)' }, { transform: `translate(${rowStep * 1.2}px, ${columnStep * 1.2}px)`, offset: 0.7 },
        { transform: `translate(${-rowStep * 1.2}px, ${-columnStep * 1.2}px)`, offset: 0.8 }, { transform: `translate(${rowStep * 0.8}px, ${columnStep * 0.8}px)`, offset: 0.9 },
        { transform: 'translate(0, 0)' }],
      { duration: 360 + bump.cells * 45 },
    );
    flashRed(lineRef.current, headRef.current, 420 + bump.cells * 45, 0);
  }, [bump?.token]);

  useEffect(() => {
    if (!flash) return;
    flashRed(lineRef.current, headRef.current, 380, 80 + flash.cells * 45);
  }, [flash?.token]);

  useEffect(() => {
    if (!returnToken) return;
    moveAlongTrack([travel, 0], { duration: 360, easing: 'cubic-bezier(0.15, 0.5, 0.55, 1)' });
  }, [returnToken]);

  return (
    <g ref={groupRef} className={`arrow-piece${isHint ? ' is-hint' : ''}${isLeaving ? ' is-leaving' : ''}`} data-arrow-id={arrow.id}
      data-cells={arrow.cells.map(cell => `${cell.row},${cell.column}`).join(';')} data-direction={arrow.direction}
      role="button" aria-label={`Arrow pointing ${arrow.direction}, ${arrow.cells.length} cells long`}>
      <path ref={glowRef} className="arrow-glow" d={trackPath} strokeDasharray={dash} />
      <path ref={lineRef} className="arrow-line" d={trackPath} strokeDasharray={dash} />
      <polygon ref={headRef} className="arrow-head" points={headPoints} />
      {!isLeaving && <path className="arrow-hit" d={hitPath} />}
    </g>
  );
});

/** Briefly turn an arrow red (it was blocked, or it was in the way). */
function flashRed(line: SVGPathElement | null, head: SVGPolygonElement | null, duration: number, delay: number) {
  if (!line || !head) return;
  const lineColor = getComputedStyle(line).stroke;
  const headColor = getComputedStyle(head).fill;
  line.animate([{ stroke: '#ff4d5e' }, { stroke: '#ff4d5e', offset: 0.6 }, { stroke: lineColor }], { duration, delay });
  head.animate([{ fill: '#ff4d5e' }, { fill: '#ff4d5e', offset: 0.6 }, { fill: headColor }], { duration, delay });
}

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
    const piece = (event.target as Element).closest('[data-arrow-id]') as SVGGElement | null;
    if (piece) tap(Number(piece.getAttribute('data-arrow-id')));
  };

  const { level } = game;
  const removed = useMemo(() => new Set(game.removedIds), [game.removedIds]);
  const exitCellsById = useMemo(() => level.arrows.map(arrow => exitPath(arrow, level.rows, level.columns).length), [level]);
  // arrows sliding out are drawn last, so they pass over the others
  const orderedArrows = [
    ...level.arrows.filter(arrow => !removed.has(arrow.id)),
    ...leavingIds.map(arrowId => level.arrows[arrowId]),
  ];
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
        <div className={`arrow-board${game.status !== 'playing' ? ' is-over' : ''}`} data-testid="arrow-board"
          style={{ ['--arrow-columns' as string]: level.columns, ['--arrow-rows' as string]: level.rows }}>
          <svg className="arrow-svg" viewBox={`${-BOARD_MARGIN} ${-BOARD_MARGIN} ${level.columns * UNIT + BOARD_MARGIN * 2} ${level.rows * UNIT + BOARD_MARGIN * 2}`}
            onClick={handleBoardClick} data-testid="arrow-svg">
            {orderedArrows.map(arrow => (
              <ArrowPiece key={`${level.number}-${arrow.id}`} arrow={arrow} exitCells={exitCellsById[arrow.id]} isLeaving={removed.has(arrow.id)} isHint={hintId === arrow.id}
                bump={bump?.arrowId === arrow.id ? bump : null} flash={flash?.arrowId === arrow.id ? flash : null}
                returnToken={returned?.arrowId === arrow.id ? returned.token : 0} onLeft={handleLeft} />
            ))}
          </svg>
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
