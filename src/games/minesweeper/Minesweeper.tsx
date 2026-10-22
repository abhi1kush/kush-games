import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GameTimer } from '../GameTimer';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { readStoredJson, saveStoredJson } from '../random';
import {
  chord, createGame, DIFFICULTIES, DifficultyId, isFinished, minesLeft, MinesweeperState, reveal, revealedDifference, toggleFlag,
} from './game';
import { createMinesweeperSaveSlot, restoreMinesweeper, serializeMinesweeper } from './save';
import { playBoomSound, playFlagSound, playRevealSound, playWinSound } from './sound';
import '../shared.css';
import './minesweeper.css';

const BEST_TIMES_STORAGE_KEY = 'kush-games-minesweeper-best';
const DIFFICULTY_STORAGE_KEY = 'kush-games-minesweeper-difficulty';
const LONG_PRESS_MS = 380;
const NARROW_SCREEN_QUERY = '(max-width: 600px)';
const NUMBER_COLORS = ['', '#4aa8ff', '#46d369', '#ff5c5c', '#b47cff', '#ff9f43', '#2ee6d6', '#f5f5f5', '#9e9e9e'];

type BestTimes = Partial<Record<DifficultyId, number>>;
type InputMode = 'dig' | 'flag';

const formatSeconds = (milliseconds: number) => String(Math.min(999, Math.floor(milliseconds / 1000))).padStart(3, '0');

function useIsNarrowScreen() {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia?.(NARROW_SCREEN_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_SCREEN_QUERY);
    if (!query) return;
    const handleChange = () => setIsNarrow(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);
  return isNarrow;
}

interface BoardProps {
  game: MinesweeperState;
  isTransposed: boolean;
}

/** The grid. Re-renders only when the game state or layout changes. */
const Board = memo(function Board({ game, isTransposed }: BoardProps) {
  const displayRows = isTransposed ? game.columns : game.rows;
  const displayColumns = isTransposed ? game.rows : game.columns;
  const cells = [];
  for (let displayRow = 0; displayRow < displayRows; displayRow++) {
    for (let displayColumn = 0; displayColumn < displayColumns; displayColumn++) {
      const index = isTransposed ? displayColumn * game.columns + displayRow : displayRow * game.columns + displayColumn;
      const cellState = game.cellStates[index];
      const isMine = game.isMine[index];
      const count = game.adjacentMines[index];
      let content = '';
      let className = 'ms-cell';
      if (cellState === 'flagged') {
        content = '🚩';
        className += ' ms-cell--flag';
        if (game.status === 'lost' && !isMine) { content = '❌'; className += ' ms-cell--wrong'; }
      } else if (cellState === 'revealed') {
        className += ' ms-cell--open';
        if (isMine) { content = '💣'; className += index === game.explodedIndex ? ' ms-cell--exploded' : ''; }
        else if (count > 0) content = String(count);
      }
      cells.push(
        <button key={index} type="button" className={className} data-index={index} data-state={cellState}
          style={cellState === 'revealed' && !isMine && count > 0 ? { color: NUMBER_COLORS[count] } : undefined}
          aria-label={cellState === 'revealed' ? (isMine ? 'mine' : count ? `${count}` : 'empty') : cellState}>
          {content}
        </button>,
      );
    }
  }
  return (
    <div className="ms-board" data-testid="ms-board" style={{ gridTemplateColumns: `repeat(${displayColumns}, var(--ms-cell))`, ['--ms-columns' as string]: displayColumns }}>
      {cells}
    </div>
  );
});

function startingDifficulty(): DifficultyId {
  const stored = readStoredJson<string>(DIFFICULTY_STORAGE_KEY, 'beginner');
  return DIFFICULTIES.some(difficulty => difficulty.id === stored) ? (stored as DifficultyId) : 'beginner';
}

export default function Minesweeper() {
  const saveSlot = useMemo(() => createMinesweeperSaveSlot(), []);
  const [initial] = useState(() => {
    const saved = saveSlot.load();
    return saved ? { game: restoreMinesweeper(saved), restored: true } : { game: createGame(startingDifficulty()), restored: false };
  });
  const [game, setGame] = useState(initial.game);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  /** performance.now() when the clock last started; null while it is stopped. */
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('dig');
  const [bestTimes, setBestTimes] = useState<BestTimes>(() => readStoredJson<BestTimes>(BEST_TIMES_STORAGE_KEY, {}));
  const [newBest, setNewBest] = useState(false);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isNarrow = useIsNarrowScreen();
  const isTransposed = isNarrow && game.columns > game.rows;

  const gameRef = useRef(game);
  const timerStartedAtRef = useRef(timerStartedAt);
  gameRef.current = game;
  timerStartedAtRef.current = timerStartedAt;
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; index: number } | null>(null);
  const suppressClickRef = useRef(false);
  const lastPointerTypeRef = useRef('mouse');

  const currentElapsed = () => gameRef.current.elapsedMs + (timerStartedAtRef.current === null ? 0 : performance.now() - timerStartedAtRef.current);

  const saveNow = useCallback(() => {
    const current = gameRef.current;
    const data = serializeMinesweeper({ ...current, elapsedMs: currentElapsed() });
    if (data) saveSlot.save(data); else saveSlot.clear();
  }, [saveSlot]);

  useEffect(() => {
    const handleHide = () => saveNow();
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveNow(); };
    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handleHide);
      document.removeEventListener('visibilitychange', handleVisibility);
      saveNow();
    };
  }, [saveNow]);

  /** Apply one move: update the clock, sounds, best time and the save. */
  const applyMove = useCallback((move: (state: MinesweeperState) => MinesweeperState, kind: 'reveal' | 'flag') => {
    const before = gameRef.current;
    const after = move(before);
    if (after === before) return;
    unlockAudio();
    const now = performance.now();
    const startedAt = timerStartedAtRef.current ?? now;
    const elapsedMs = before.elapsedMs + (timerStartedAtRef.current === null ? 0 : now - startedAt);
    let next: MinesweeperState = { ...after, elapsedMs };
    if (isFinished(next)) {
      setTimerStartedAt(null);
      timerStartedAtRef.current = null;
    } else {
      // keep the clock running from the same start; the saved elapsed time already includes the past
      next = { ...after, elapsedMs: before.elapsedMs };
      if (timerStartedAtRef.current === null) { setTimerStartedAt(now); timerStartedAtRef.current = now; }
    }
    if (next.status === 'won') {
      playWinSound(isMutedRef.current);
      const best = bestTimes[next.difficulty];
      if (best === undefined || next.elapsedMs < best) {
        const updated = { ...bestTimes, [next.difficulty]: Math.round(next.elapsedMs) };
        setBestTimes(updated);
        saveStoredJson(BEST_TIMES_STORAGE_KEY, updated);
        setNewBest(true);
      }
    } else if (next.status === 'lost') playBoomSound(isMutedRef.current);
    else if (kind === 'flag') playFlagSound(isMutedRef.current);
    else playRevealSound(revealedDifference(before, next), isMutedRef.current);
    gameRef.current = next;
    setGame(next);
    setWasRestored(false);
    const data = serializeMinesweeper({ ...next, elapsedMs: currentElapsed() });
    if (data) saveSlot.save(data); else saveSlot.clear();
  }, [bestTimes, isMutedRef, saveSlot]);

  const actOnCell = useCallback((index: number, wantsFlag: boolean) => {
    const current = gameRef.current;
    if (current.cellStates[index] === 'revealed') applyMove(state => chord(state, index), 'reveal');
    else if (wantsFlag) applyMove(state => toggleFlag(state, index), 'flag');
    else if (current.cellStates[index] === 'hidden') applyMove(state => reveal(state, index), 'reveal');
  }, [applyMove]);

  const newGame = useCallback((difficultyId: DifficultyId) => {
    const fresh = createGame(difficultyId);
    saveStoredJson(DIFFICULTY_STORAGE_KEY, difficultyId);
    saveSlot.clear();
    gameRef.current = fresh;
    timerStartedAtRef.current = null;
    setGame(fresh);
    setTimerStartedAt(null);
    setWasRestored(false);
    setNewBest(false);
  }, [saveSlot]);

  const cellIndexFromEvent = (event: { target: EventTarget }) => {
    const cell = (event.target as HTMLElement).closest?.('[data-index]') as HTMLElement | null;
    return cell ? Number(cell.dataset.index) : null;
  };
  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent) => {
    lastPointerTypeRef.current = event.pointerType;
    suppressClickRef.current = false;
    const index = cellIndexFromEvent(event);
    if (index === null || event.pointerType === 'mouse') return;
    cancelLongPress();
    longPressRef.current = {
      index,
      timer: setTimeout(() => {
        longPressRef.current = null;
        suppressClickRef.current = true;
        navigator.vibrate?.(15);
        // long press does the opposite of the current mode (flag in dig mode, dig in flag mode)
        actOnCell(index, inputMode === 'dig');
      }, LONG_PRESS_MS),
    };
  };
  const handleClick = (event: ReactMouseEvent) => {
    cancelLongPress();
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const index = cellIndexFromEvent(event);
    if (index !== null) actOnCell(index, inputMode === 'flag');
  };
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    if (lastPointerTypeRef.current !== 'mouse') return; // touch uses the long press instead
    const index = cellIndexFromEvent(event);
    if (index !== null) actOnCell(index, true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' || event.key === 'F') setInputMode(mode => (mode === 'dig' ? 'flag' : 'dig'));
      else if (event.key === 'n' || event.key === 'N') newGame(gameRef.current.difficulty);
      else if (event.key === 'm' || event.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newGame, toggleMute]);

  const best = bestTimes[game.difficulty];
  const faceEmoji = game.status === 'won' ? '😎' : game.status === 'lost' ? '😵' : '🙂';

  return (
    <div className="game-shell ms" data-testid="minesweeper" data-status={game.status} data-difficulty={game.difficulty}
      data-revealed={game.cellStates.filter(cellState => cellState === 'revealed').length} data-flags={game.cellStates.filter(cellState => cellState === 'flagged').length}
      data-mode={inputMode} data-transposed={isTransposed}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map(difficulty => (
            <button key={difficulty.id} type="button" className={difficulty.id === game.difficulty ? 'is-selected' : ''} data-testid={`difficulty-${difficulty.id}`}
              onClick={() => newGame(difficulty.id)} title={`${difficulty.columns}×${difficulty.rows}, ${difficulty.mines} mines`}>
              {difficulty.label}
            </button>
          ))}
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="ms-panel">
        <div className="game-stat"><span>Mines</span><b data-testid="ms-mines-left">{minesLeft(game)}</b></div>
        <button type="button" className="ms-face" onClick={() => newGame(game.difficulty)} data-testid="ms-new" aria-label="New game" title="New game (N)">{faceEmoji}</button>
        <div className="game-stat"><span>Time</span><GameTimer baseMs={game.elapsedMs} startedAt={timerStartedAt} testId="ms-timer" format={formatSeconds} /></div>
      </div>
      <div className="game-segments ms-mode" role="group" aria-label="Tap mode">
        <button type="button" className={inputMode === 'dig' ? 'is-selected' : ''} onClick={() => setInputMode('dig')} data-testid="mode-dig">⛏ Dig</button>
        <button type="button" className={inputMode === 'flag' ? 'is-selected' : ''} onClick={() => setInputMode('flag')} data-testid="mode-flag">🚩 Flag</button>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved game restored — the clock resumes on your next move</p>}
      {game.status === 'won' && <p className="game-banner game-banner--win" data-testid="ms-result">You cleared the field in {Math.floor(game.elapsedMs / 1000)}s!{newBest ? ' 🏆 New best!' : ''}</p>}
      {game.status === 'lost' && <p className="game-banner game-banner--lose" data-testid="ms-result">Boom! Tap the face to try again.</p>}
      <div className="ms-scroll" onPointerDown={handlePointerDown} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={cancelLongPress}
        onClick={handleClick} onContextMenu={handleContextMenu}>
        <Board game={game} isTransposed={isTransposed} />
      </div>
      <p className="game-help">
        Best: <b data-testid="ms-best">{best === undefined ? '—' : `${(best / 1000).toFixed(1)}s`}</b> · Right-click or long-press to flag · Tap a number to open around it
      </p>
    </div>
  );
}
