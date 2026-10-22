import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { Board, computerMove, Difficulty, emptyBoard, Mark, markToMove, otherMark, outcomeOf } from './game';
import { createTicTacToeSaveSlot, Opponent, SavedTicTacToe } from './save';
import { playDrawSound, playLoseSound, playPlaceSound, playWinSound } from './sound';
import '../shared.css';
import './tictactoe.css';

const TALLY_STORAGE_KEY = 'kush-games-tictactoe-tally';
const SETTINGS_STORAGE_KEY = 'kush-games-tictactoe-settings';
const COMPUTER_DELAY_MS = 350;

/** Wins for each mark and draws, kept separately for each way of playing. */
type Tally = Record<string, { X: number; O: number; draw: number }>;
const tallyKey = (opponent: Opponent, difficulty: Difficulty) => (opponent === 'friend' ? 'friend' : `computer-${difficulty}`);

interface Round extends SavedTicTacToe {}

function startingRound(saved: SavedTicTacToe | null): Round {
  if (saved) return saved;
  const settings = readStoredJson<{ opponent?: Opponent; difficulty?: Difficulty }>(SETTINGS_STORAGE_KEY, {});
  return {
    board: emptyBoard(), firstMark: 'X', humanMark: 'X',
    opponent: settings.opponent === 'friend' ? 'friend' : 'computer', difficulty: settings.difficulty === 'easy' ? 'easy' : 'hard',
  };
}

export default function TicTacToe() {
  const saveSlot = useMemo(() => createTicTacToeSaveSlot(), []);
  const [initial] = useState(() => { const saved = saveSlot.load(); return { round: startingRound(saved), restored: saved !== null }; });
  const [round, setRound] = useState<Round>(initial.round);
  const [wasRestored, setWasRestored] = useState(initial.restored);
  const [tally, setTally] = useState<Tally>(() => readStoredJson<Tally>(TALLY_STORAGE_KEY, {}));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const roundRef = useRef(round);
  roundRef.current = round;

  const outcome = outcomeOf(round.board);
  const toMove = markToMove(round.board, round.firstMark);
  const computerMark = otherMark(round.humanMark);
  const isComputerTurn = round.opponent === 'computer' && !outcome && toMove === computerMark;
  const currentTally = tally[tallyKey(round.opponent, round.difficulty)] ?? { X: 0, O: 0, draw: 0 };

  const play = useCallback((index: number) => {
    const current = roundRef.current;
    if (current.board[index] !== null || outcomeOf(current.board)) return;
    const mark = markToMove(current.board, current.firstMark);
    const board: Board = [...current.board];
    board[index] = mark;
    const next = { ...current, board };
    roundRef.current = next;
    setRound(next);
    setWasRestored(false);
    const result = outcomeOf(board);
    if (!result) {
      playPlaceSound(mark, isMutedRef.current);
      saveSlot.save(next);
      return;
    }
    saveSlot.clear();
    if (result.winner === 'draw') playDrawSound(isMutedRef.current);
    else if (next.opponent === 'computer' && result.winner !== next.humanMark) playLoseSound(isMutedRef.current);
    else playWinSound(isMutedRef.current);
    setTally(previous => {
      const key = tallyKey(next.opponent, next.difficulty);
      const entry = previous[key] ?? { X: 0, O: 0, draw: 0 };
      const updated = { ...previous, [key]: { ...entry, [result.winner]: entry[result.winner] + 1 } };
      saveStoredJson(TALLY_STORAGE_KEY, updated);
      return updated;
    });
  }, [isMutedRef, saveSlot]);

  // The computer answers after a short pause.
  useEffect(() => {
    if (!isComputerTurn) return;
    const timer = setTimeout(() => play(computerMove(roundRef.current.board, computerMark, roundRef.current.difficulty)), COMPUTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isComputerTurn, computerMark, round.board, play]);

  const startRound = useCallback((changes: Partial<Round> = {}, alternateStarter = true) => {
    const current = roundRef.current;
    const next: Round = { ...current, ...changes, board: emptyBoard(), firstMark: alternateStarter ? otherMark(current.firstMark) : current.firstMark };
    saveStoredJson(SETTINGS_STORAGE_KEY, { opponent: next.opponent, difficulty: next.difficulty });
    saveSlot.clear();
    roundRef.current = next;
    setRound(next);
    setWasRestored(false);
  }, [saveSlot]);

  const resetTally = () => {
    const updated = { ...tally };
    delete updated[tallyKey(round.opponent, round.difficulty)];
    setTally(updated);
    saveStoredJson(TALLY_STORAGE_KEY, updated);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9 && !isComputerTurn) { unlockAudio(); play(digit - 1); }
      else if (event.key === 'n' || event.key === 'N' || (event.key === 'Enter' && outcome)) startRound();
      else if (event.key === 'm' || event.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isComputerTurn, outcome, play, startRound, toggleMute]);

  const vsComputer = round.opponent === 'computer';
  const nameOf = (mark: Mark) => (vsComputer ? (mark === round.humanMark ? 'You' : 'Computer') : `Player ${mark}`);
  let statusText: string;
  if (outcome?.winner === 'draw') statusText = "It's a draw!";
  else if (outcome) statusText = vsComputer ? (outcome.winner === round.humanMark ? 'You win! 🎉' : 'Computer wins') : `${nameOf(outcome.winner)} wins! 🎉`;
  else if (isComputerTurn) statusText = 'Computer is thinking…';
  else statusText = vsComputer ? `Your turn (${round.humanMark})` : `${nameOf(toMove)}’s turn`;

  return (
    <div className="game-shell ttt" data-testid="tictactoe" data-turn={toMove} data-outcome={outcome?.winner ?? ''} data-opponent={round.opponent}
      data-difficulty={round.difficulty} data-board={round.board.map(cell => cell ?? '.').join('')}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Opponent">
          <button type="button" className={vsComputer && round.difficulty === 'easy' ? 'is-selected' : ''} data-testid="ttt-easy"
            onClick={() => startRound({ opponent: 'computer', difficulty: 'easy' }, false)}>🤖 Easy</button>
          <button type="button" className={vsComputer && round.difficulty === 'hard' ? 'is-selected' : ''} data-testid="ttt-hard"
            onClick={() => startRound({ opponent: 'computer', difficulty: 'hard' }, false)}>🤖 Hard</button>
          <button type="button" className={!vsComputer ? 'is-selected' : ''} data-testid="ttt-friend"
            onClick={() => startRound({ opponent: 'friend' }, false)}>👥 2 Players</button>
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="ttt-tally" data-testid="ttt-tally">
        <div className="game-stat ttt-tally--x"><span>{nameOf('X')} · X</span><b data-testid="tally-x">{currentTally.X}</b></div>
        <div className="game-stat"><span>Draws</span><b data-testid="tally-draw">{currentTally.draw}</b></div>
        <div className="game-stat ttt-tally--o"><span>{nameOf('O')} · O</span><b data-testid="tally-o">{currentTally.O}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved round restored</p>}
      <p className={`game-banner ${outcome ? (outcome.winner === 'draw' ? 'game-banner--info' : vsComputer && outcome.winner !== round.humanMark ? 'game-banner--lose' : 'game-banner--win') : 'game-banner--info'}`}
        data-testid="ttt-status">{statusText}</p>
      <div className={`ttt-board${outcome ? ' is-over' : ''}`} data-testid="ttt-board">
        {round.board.map((cell, index) => (
          <button key={index} type="button" className={`ttt-cell${cell ? ` ttt-cell--${cell.toLowerCase()}` : ''}${outcome?.line?.includes(index) ? ' is-winning' : ''}`}
            data-index={index} disabled={cell !== null || outcome !== null || isComputerTurn}
            onClick={() => { unlockAudio(); play(index); }} aria-label={cell ? `${cell}` : `Empty square ${index + 1}`}>
            {cell === 'X' ? '✕' : cell === 'O' ? '○' : ''}
          </button>
        ))}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button game-button--primary" onClick={() => startRound()} data-testid="ttt-new">{outcome ? 'Next round' : 'Restart round'}</button>
        <button type="button" className="game-button" onClick={resetTally} data-testid="ttt-reset-tally">Reset score</button>
      </div>
      <p className="game-help">{round.firstMark === round.humanMark || !vsComputer ? `${nameOf(round.firstMark)} started this round` : 'Computer started this round'} · Starters alternate · Keys 1–9 play</p>
    </div>
  );
}
