import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTimer } from '../GameTimer';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { createSudoku, digitCounts, eraseCell, giveHint, isGiven, placeValue, SudokuState, toggleNote, undo } from './game';
import { createSudokuSaveSlot, serializeSudoku } from './save';
import { playMistakeSound, playNoteSound, playPlaceSound, playSolvedSound } from './sound';
import { boxOf, columnOf, findConflicts, rowOf, SUDOKU_DIFFICULTIES, SudokuDifficulty } from './sudoku';
import '../shared.css';
import './sudoku.css';

const DIFFICULTY_STORAGE_KEY = 'kush-games-sudoku-difficulty';
const BEST_TIMES_STORAGE_KEY = 'kush-games-sudoku-best';
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type BestTimes = Partial<Record<SudokuDifficulty, number>>;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

interface GridProps {
  game: SudokuState;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const Grid = memo(function Grid({ game, selectedIndex, onSelect }: GridProps) {
  const conflicts = useMemo(() => findConflicts(game.values), [game.values]);
  const selectedValue = selectedIndex === null ? 0 : game.values[selectedIndex];
  return (
    <div className="sudoku-grid" data-testid="sudoku-grid" role="grid">
      {game.values.map((value, index) => {
        const classes = ['sudoku-cell'];
        if (isGiven(game, index)) classes.push('is-given');
        if (selectedIndex !== null) {
          if (index === selectedIndex) classes.push('is-selected');
          else if (rowOf(index) === rowOf(selectedIndex) || columnOf(index) === columnOf(selectedIndex) || boxOf(index) === boxOf(selectedIndex)) classes.push('is-peer');
          if (selectedValue && value === selectedValue && index !== selectedIndex) classes.push('is-same');
        }
        if (conflicts.has(index)) classes.push('is-conflict');
        if (columnOf(index) % 3 === 2 && columnOf(index) < 8) classes.push('edge-right');
        if (rowOf(index) % 3 === 2 && rowOf(index) < 8) classes.push('edge-bottom');
        if (columnOf(index) === 8) classes.push('last-column');
        if (rowOf(index) === 8) classes.push('last-row');
        const notes = game.notes[index];
        return (
          <button key={index} type="button" className={classes.join(' ')} data-index={index} data-value={value} onClick={() => onSelect(index)}
            aria-label={`Row ${rowOf(index) + 1} column ${columnOf(index) + 1}${value ? `, ${value}` : ''}`}>
            {value ? value : notes ? (
              <span className="sudoku-notes">
                {DIGITS.map(digit => <span key={digit}>{notes & (1 << digit) ? digit : ''}</span>)}
              </span>
            ) : ''}
          </button>
        );
      })}
    </div>
  );
});

function startingDifficulty(): SudokuDifficulty {
  const stored = readStoredJson<string>(DIFFICULTY_STORAGE_KEY, 'easy');
  return SUDOKU_DIFFICULTIES.some(option => option.id === stored) ? (stored as SudokuDifficulty) : 'easy';
}

export default function Sudoku() {
  const saveSlot = useMemo(() => createSudokuSaveSlot(), []);
  const [initial] = useState(() => {
    const saved = saveSlot.load();
    if (saved) return { game: saved, restored: true };
    const game = createSudoku(startingDifficulty(), newSeed());
    saveSlot.save(serializeSudoku(game)!);
    return { game, restored: false };
  });
  const [game, setGame] = useState(initial.game);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isPencil, setIsPencil] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(() => performance.now());
  const [bestTimes, setBestTimes] = useState<BestTimes>(() => readStoredJson<BestTimes>(BEST_TIMES_STORAGE_KEY, {}));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();

  const gameRef = useRef(game);
  const timerStartedAtRef = useRef(timerStartedAt);
  const selectedIndexRef = useRef(selectedIndex);
  const isPencilRef = useRef(isPencil);
  gameRef.current = game;
  timerStartedAtRef.current = timerStartedAt;
  selectedIndexRef.current = selectedIndex;
  isPencilRef.current = isPencil;

  const elapsedNow = () => gameRef.current.elapsedMs + (timerStartedAtRef.current === null ? 0 : performance.now() - timerStartedAtRef.current);

  const saveNow = useCallback(() => {
    const data = serializeSudoku({ ...gameRef.current, elapsedMs: elapsedNow() });
    if (data) saveSlot.save(data);
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

  const update = useCallback((next: SudokuState, sound: 'place' | 'note' | 'none') => {
    const before = gameRef.current;
    if (next === before) return;
    unlockAudio();
    if (next.isSolved) {
      const total = Math.round(elapsedNow());
      next = { ...next, elapsedMs: total };
      timerStartedAtRef.current = null;
      setTimerStartedAt(null);
      playSolvedSound(isMutedRef.current);
      saveSlot.clear();
      const best = bestTimes[next.difficulty];
      if (best === undefined || total < best) {
        const updated = { ...bestTimes, [next.difficulty]: total };
        setBestTimes(updated);
        saveStoredJson(BEST_TIMES_STORAGE_KEY, updated);
      }
    } else {
      if (next.mistakes > before.mistakes) playMistakeSound(isMutedRef.current);
      else if (sound === 'place') playPlaceSound(isMutedRef.current);
      else if (sound === 'note') playNoteSound(isMutedRef.current);
      saveSlot.save(serializeSudoku({ ...next, elapsedMs: next.elapsedMs + (timerStartedAtRef.current === null ? 0 : performance.now() - timerStartedAtRef.current) })!);
    }
    gameRef.current = next;
    setGame(next);
    setWasRestored(false);
  }, [bestTimes, isMutedRef, saveSlot]);

  const enterDigit = useCallback((digit: number) => {
    const index = selectedIndexRef.current;
    if (index === null) return;
    const current = gameRef.current;
    if (isPencilRef.current && current.values[index] === 0) update(toggleNote(current, index, digit), 'note');
    else update(placeValue(current, index, digit), 'place');
  }, [update]);
  const erase = useCallback(() => { if (selectedIndexRef.current !== null) update(eraseCell(gameRef.current, selectedIndexRef.current), 'note'); }, [update]);
  const undoMove = useCallback(() => update(undo(gameRef.current), 'note'), [update]);
  const hint = useCallback(() => {
    const { state, index } = giveHint(gameRef.current, selectedIndexRef.current);
    if (index !== null) setSelectedIndex(index);
    update(state, 'place');
  }, [update]);

  const newGame = useCallback((difficulty: SudokuDifficulty) => {
    saveStoredJson(DIFFICULTY_STORAGE_KEY, difficulty);
    const fresh = createSudoku(difficulty, newSeed());
    saveSlot.save(serializeSudoku(fresh)!);
    gameRef.current = fresh;
    setGame(fresh);
    setSelectedIndex(null);
    setWasRestored(false);
    const now = performance.now();
    timerStartedAtRef.current = now;
    setTimerStartedAt(now);
  }, [saveSlot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); undoMove(); }
        return;
      }
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9) { enterDigit(digit); return; }
      const index = selectedIndexRef.current ?? 40;
      const moves: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (event.key in moves) {
        event.preventDefault();
        const row = rowOf(index), column = columnOf(index);
        const nextRow = (row + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0) + 9) % 9;
        const nextColumn = (column + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0) + 9) % 9;
        setSelectedIndex(selectedIndexRef.current === null ? 40 : nextRow * 9 + nextColumn);
      } else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') erase();
      else if (event.key === 'p' || event.key === 'P' || event.key === 'n' || event.key === 'N') setIsPencil(value => !value);
      else if (event.key === 'u' || event.key === 'U') undoMove();
      else if (event.key === 'h' || event.key === 'H') hint();
      else if (event.key === 'm' || event.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enterDigit, erase, hint, toggleMute, undoMove]);

  const counts = useMemo(() => digitCounts(game.values), [game.values]);
  const best = bestTimes[game.difficulty];

  return (
    <div className="game-shell sudoku" data-testid="sudoku" data-solved={game.isSolved} data-mistakes={game.mistakes} data-difficulty={game.difficulty}
      data-filled={game.values.filter(Boolean).length} data-selected={selectedIndex ?? ''} data-pencil={isPencil}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Difficulty">
          {SUDOKU_DIFFICULTIES.map(option => (
            <button key={option.id} type="button" className={option.id === game.difficulty ? 'is-selected' : ''} onClick={() => newGame(option.id)}
              data-testid={`difficulty-${option.id}`}>{option.label}</button>
          ))}
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>Time</span><GameTimer baseMs={game.elapsedMs} startedAt={timerStartedAt} testId="sudoku-timer" /></div>
        <div className="game-stat"><span>Mistakes</span><b data-testid="sudoku-mistakes">{game.mistakes}</b></div>
        <div className="game-stat"><span>Best</span><b>{best === undefined ? '—' : `${Math.floor(best / 60000)}:${String(Math.floor(best / 1000) % 60).padStart(2, '0')}`}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved puzzle restored</p>}
      {game.isSolved && (
        <p className="game-banner game-banner--win" data-testid="sudoku-solved">
          Solved! {game.mistakes} mistake{game.mistakes === 1 ? '' : 's'}, {game.hintsUsed} hint{game.hintsUsed === 1 ? '' : 's'}.{' '}
          <button type="button" className="game-button game-button--primary" onClick={() => newGame(game.difficulty)}>New puzzle</button>
        </p>
      )}
      <Grid game={game} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
      <div className="sudoku-pad" data-testid="sudoku-pad">
        {DIGITS.map(digit => (
          <button key={digit} type="button" className={`sudoku-pad__digit${counts[digit] >= 9 ? ' is-done' : ''}`} onClick={() => enterDigit(digit)}
            data-testid={`pad-${digit}`} aria-label={`${isPencil ? 'Note' : 'Enter'} ${digit}`}>
            {digit}<small>{Math.max(0, 9 - counts[digit])}</small>
          </button>
        ))}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undoMove} disabled={game.history.length === 0 || game.isSolved} data-testid="sudoku-undo">↶ Undo</button>
        <button type="button" className="game-button" onClick={erase} data-testid="sudoku-erase">⌫ Erase</button>
        <button type="button" className={`game-button${isPencil ? ' is-active' : ''}`} onClick={() => setIsPencil(value => !value)} aria-pressed={isPencil}
          data-testid="sudoku-pencil">✎ Notes {isPencil ? 'on' : 'off'}</button>
        <button type="button" className="game-button" onClick={hint} disabled={game.isSolved} data-testid="sudoku-hint">💡 Hint</button>
        <button type="button" className="game-button" onClick={() => newGame(game.difficulty)} data-testid="sudoku-new">New</button>
      </div>
    </div>
  );
}
