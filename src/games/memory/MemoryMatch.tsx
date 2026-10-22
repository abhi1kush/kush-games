import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTimer } from '../GameTimer';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { createMemoryGame, flipCard, GRID_SIZES, gridSizeById, GridSizeId, hideMismatch, isComplete, isMismatchShowing, MemoryState } from './game';
import { createMemorySaveSlot, serializeMemory } from './save';
import { playCompleteSound, playFlipSound, playMatchSound, playMismatchSound } from './sound';
import '../shared.css';
import './memory.css';

const MISMATCH_SHOW_MS = 800;
const BEST_STORAGE_KEY = 'kush-games-memory-best';
const SIZE_STORAGE_KEY = 'kush-games-memory-size';

type BestScores = Partial<Record<GridSizeId, { moves: number; ms: number }>>;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const Card = memo(function Card({ index, face, isUp, isMatched }: { index: number; face: string; isUp: boolean; isMatched: boolean }) {
  return (
    <button type="button" className={`memory-card${isUp ? ' is-up' : ''}${isMatched ? ' is-matched' : ''}`} data-index={index} data-up={isUp}
      aria-label={isUp ? face : 'Hidden card'} disabled={isMatched}>
      <span className="memory-card__inner">
        <span className="memory-card__back" aria-hidden="true">?</span>
        <span className="memory-card__front" aria-hidden="true">{face}</span>
      </span>
    </button>
  );
});

function startingSize(): GridSizeId {
  const stored = readStoredJson<string>(SIZE_STORAGE_KEY, '4x4');
  return GRID_SIZES.some(size => size.id === stored) ? (stored as GridSizeId) : '4x4';
}

export default function MemoryMatch() {
  const saveSlot = useMemo(() => createMemorySaveSlot(), []);
  const [initial] = useState(() => {
    const saved = saveSlot.load();
    return saved ? { game: saved, restored: true } : { game: createMemoryGame(startingSize(), newSeed()), restored: false };
  });
  const [game, setGame] = useState<MemoryState>(initial.game);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [bestScores, setBestScores] = useState<BestScores>(() => readStoredJson<BestScores>(BEST_STORAGE_KEY, {}));
  const [isNewBest, setIsNewBest] = useState(false);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();

  const gameRef = useRef(game);
  const timerStartedAtRef = useRef(timerStartedAt);
  gameRef.current = game;
  timerStartedAtRef.current = timerStartedAt;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const elapsedNow = () => gameRef.current.elapsedMs + (timerStartedAtRef.current === null ? 0 : performance.now() - timerStartedAtRef.current);
  const saveNow = useCallback(() => {
    const data = serializeMemory({ ...gameRef.current, elapsedMs: elapsedNow() });
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
      clearTimeout(hideTimerRef.current);
      saveNow();
    };
  }, [saveNow]);

  const setAndRemember = (next: MemoryState) => { gameRef.current = next; setGame(next); };

  const handleFlip = useCallback((index: number) => {
    const { state: flipped, result } = flipCard(gameRef.current, index);
    if (result === 'ignored') return;
    unlockAudio();
    clearTimeout(hideTimerRef.current);
    setWasRestored(false);
    let next = flipped;
    if (timerStartedAtRef.current === null && !isComplete(next)) {
      const now = performance.now();
      timerStartedAtRef.current = now;
      setTimerStartedAt(now);
    }
    if (result === 'match' && isComplete(next)) {
      next = { ...next, elapsedMs: Math.round(elapsedNow()) };
      timerStartedAtRef.current = null;
      setTimerStartedAt(null);
      playCompleteSound(isMutedRef.current);
      saveSlot.clear();
      const best = bestScores[next.size];
      if (!best || next.moves < best.moves || (next.moves === best.moves && next.elapsedMs < best.ms)) {
        const updated = { ...bestScores, [next.size]: { moves: next.moves, ms: next.elapsedMs } };
        setBestScores(updated);
        saveStoredJson(BEST_STORAGE_KEY, updated);
        setIsNewBest(true);
      }
      setAndRemember(next);
      return;
    }
    if (result === 'match') playMatchSound(isMutedRef.current);
    else if (result === 'mismatch') {
      playMismatchSound(isMutedRef.current);
      hideTimerRef.current = setTimeout(() => setAndRemember(hideMismatch(gameRef.current)), MISMATCH_SHOW_MS);
    } else playFlipSound(isMutedRef.current);
    setAndRemember(next);
    const data = serializeMemory({ ...next, elapsedMs: elapsedNow() });
    if (data) saveSlot.save(data);
  }, [bestScores, isMutedRef, saveSlot]);

  const newGame = useCallback((size: GridSizeId) => {
    clearTimeout(hideTimerRef.current);
    saveStoredJson(SIZE_STORAGE_KEY, size);
    saveSlot.clear();
    timerStartedAtRef.current = null;
    setTimerStartedAt(null);
    setWasRestored(false);
    setIsNewBest(false);
    setAndRemember(createMemoryGame(size, newSeed()));
  }, [saveSlot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'n' || event.key === 'N') newGame(gameRef.current.size);
      else if (event.key === 'm' || event.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newGame, toggleMute]);

  const { columns, rows } = gridSizeById(game.size);
  const isDone = isComplete(game);
  const best = bestScores[game.size];
  const matchedCount = game.matched.filter(Boolean).length / 2;

  return (
    <div className="game-shell memory" data-testid="memory" data-size={game.size} data-moves={game.moves} data-matched={matchedCount}
      data-complete={isDone} data-open={game.openIndexes.join(',')} data-faces={game.faces.join(',')}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Grid size">
          {GRID_SIZES.map(size => (
            <button key={size.id} type="button" className={size.id === game.size ? 'is-selected' : ''} onClick={() => newGame(size.id)}
              data-testid={`size-${size.id}`}>{size.id.replace('x', '×')}</button>
          ))}
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>Moves</span><b data-testid="memory-moves">{game.moves}</b></div>
        <div className="game-stat"><span>Pairs</span><b>{matchedCount}/{game.faces.length / 2}</b></div>
        <div className="game-stat"><span>Time</span><GameTimer baseMs={game.elapsedMs} startedAt={timerStartedAt} testId="memory-timer" /></div>
        <div className="game-stat"><span>Best</span><b data-testid="memory-best">{best ? `${best.moves} mv` : '—'}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved game restored — the clock resumes on your next flip</p>}
      {isDone && (
        <p className="game-banner game-banner--win" data-testid="memory-complete">
          All pairs found in {game.moves} moves and {Math.round(game.elapsedMs / 1000)}s!{isNewBest ? ' 🏆 New best!' : ''}
        </p>
      )}
      <div className={`memory-grid${isMismatchShowing(game) ? ' is-mismatch' : ''}`} data-testid="memory-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, var(--memory-card))`, ['--memory-columns' as string]: columns, ['--memory-rows' as string]: rows }}
        onClick={event => {
          const card = (event.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
          if (card) handleFlip(Number(card.dataset.index));
        }}>
        {game.faces.map((face, index) => (
          <Card key={index} index={index} face={face} isUp={game.matched[index] || game.openIndexes.includes(index)} isMatched={game.matched[index]} />
        ))}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button game-button--primary" onClick={() => newGame(game.size)} data-testid="memory-new">New game</button>
      </div>
    </div>
  );
}
