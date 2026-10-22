/** Checkers against a friend in another browser (WebRTC via the shared online module). */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnlineMatch, Role } from '../online/match';
import { MatchActions, MatchBanner, RoomPanel } from '../online/OnlineUI';
import { BoardResult, onlineResult } from '../online/result';
import { parseSavedOnlineRoom, SavedOnlineRoom } from '../online/save';
import { playConnectedSound, playGameOverSound, playOfferSound } from '../online/sounds';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { createSaveSlot, ONLINE_SAVE_VERSION, onlineSaveGameId, SaveSlot } from '../persistence';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import CheckersBoard from './Board';
import { checkersRules, CheckersColor, moveText, replayPaths } from './rules';
import { playCrownSound, playMoveSound } from './sounds';

export const createCheckersOnlineSlot = (): SaveSlot<SavedOnlineRoom<CheckersColor>> =>
  createSaveSlot({ gameId: onlineSaveGameId('checkers'), version: ONLINE_SAVE_VERSION, parse: data => parseSavedOnlineRoom(checkersRules, data) });

const colorName = (color: CheckersColor) => (color === 'dark' ? 'Dark' : 'Light');
/** Cell values: 1 dark man, 2 dark king, 3 light man, 4 light king. */
const ownerColor = (owner: number): CheckersColor | null => (owner === 0 ? null : owner <= 2 ? 'dark' : 'light');

export default function CheckersOnline({ role, roomCode, initialMatch, isRestored, saveSlot, onLeave }: {
  role: Role; roomCode: string; initialMatch: OnlineMatch<CheckersColor>; isRestored: boolean;
  saveSlot: SaveSlot<SavedOnlineRoom<CheckersColor>>; onLeave(): void;
}) {
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const room = useOnlineRoom({
    rules: checkersRules, role, roomCode, initialMatch,
    save: saved => saveSlot.save(saved),
    onConnected: () => playConnectedSound(isMutedRef.current),
    onGameOver: () => { if (resultRef.current) playGameOverSound(resultRef.current.outcome, isMutedRef.current); },
  });
  const { match, connection, myColor, isOver, isMyTurn, actions } = room;
  const friendColor: CheckersColor = myColor === 'dark' ? 'light' : 'dark';
  const hasJoinedGame = match.gameNumber > 0;
  const [selected, setSelected] = useState<number | null>(null);

  const board = useMemo(() => {
    const replayed = replayPaths(match.moves) ?? replayPaths([])!;
    const { engine, legalMoves, lastMove } = replayed;
    return { cells: engine.cells(), legalMoves, lastMove, winner: engine.winner(), mustCapture: legalMoves.some(move => move.captured.length > 0) };
  }, [match.moves]);

  const boardResult: BoardResult<CheckersColor> = board.winner === 0 ? null
    : board.winner === 3 ? { draw: true, reason: '40 moves each without a capture' }
    : { winner: board.winner === 1 ? 'dark' : 'light', reason: 'no moves left' };
  const result = isOver ? onlineResult(match, myColor, boardResult) : null;
  const resultRef = useRef(result);
  resultRef.current = result;

  // Sound for every new move (mine or the friend's), and clear the selection.
  const previousRef = useRef({ gameNumber: match.gameNumber, count: match.moves.length, cells: board.cells });
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { gameNumber: match.gameNumber, count: match.moves.length, cells: board.cells };
    setSelected(null);
    const last = board.lastMove;
    if (previous.gameNumber !== match.gameNumber || match.moves.length !== previous.count + 1 || !last) return;
    playMoveSound(last.captured.length > 0, isMutedRef.current);
    const wasKing = previous.cells[last.from] % 2 === 0;
    if (!wasKing && board.cells[last.to] % 2 === 0) playCrownSound(isMutedRef.current);
  }, [match.gameNumber, match.moves.length, board, isMutedRef]);

  const incomingOffer = (match.drawOfferFrom === friendColor ? 'draw' : '') + (match.rematchOfferFrom === friendColor ? 'rematch' : '');
  useEffect(() => { if (incomingOffer) playOfferSound(isMutedRef.current); }, [incomingOffer, isMutedRef]);

  const canMove = hasJoinedGame && isMyTurn;
  const myMoves = canMove ? board.legalMoves : [];
  const handleSquare = (square: number) => {
    unlockAudio();
    if (!canMove) return;
    if (ownerColor(board.cells[square]) === myColor) { setSelected(myMoves.some(move => move.from === square) ? square : null); return; }
    if (selected === null) return;
    const move = myMoves.find(candidate => candidate.from === selected && candidate.to === square);
    if (move) actions.playMove(moveText(move)); else setSelected(null);
  };

  const offerSide = (color: CheckersColor | null) => (color === null ? null : color === myColor ? 'me' : 'friend');
  const pieceCount = (owner: 1 | 3) => board.cells.filter(cell => cell === owner || cell === owner + 1).length;
  const statusText = !hasJoinedGame ? 'Joining the room…'
    : result ? 'Game over'
    : isMyTurn ? `Your move (${colorName(myColor)})${board.mustCapture ? ' — you must capture!' : ''}` : `Friend’s move (${colorName(friendColor)})`;

  return (
    <div className="game-shell checkers checkers--online" data-testid="checkers" data-mode="online" data-winner={board.winner} data-plies={match.moves.length}
      data-side={match.moves.length % 2} data-my-color={hasJoinedGame ? myColor : ''} data-game-number={match.gameNumber}
      data-over={isOver ? 'true' : 'false'} data-must-capture={board.mustCapture}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Opponent">
          <button type="button" className="is-selected" data-testid="checkers-mode-online">Online</button>
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <button type="button" className="game-button" onClick={onLeave} data-testid="online-leave">Leave room</button>
      </div>
      <RoomPanel gameId="checkers" gameName="Checkers" role={role} roomCode={roomCode} connection={connection} isRestored={isRestored} />
      <p className={`game-banner ${result ? (result.outcome === 'loss' ? 'game-banner--lose' : 'game-banner--win') : isMyTurn && board.mustCapture ? 'game-banner--lose' : 'game-banner--info'}`}
        data-testid="checkers-status">{statusText}</p>
      <MatchBanner result={result} drawOffer={offerSide(match.drawOfferFrom)} rematchOffer={offerSide(match.rematchOfferFrom)}
        notice={room.notice} actions={actions} swapText={`Next game you play ${colorName(friendColor)}${friendColor === 'dark' ? ' and move first' : ''}.`} />
      <CheckersBoard cells={board.cells} moves={myMoves} selected={selected} lastMove={board.lastMove} isLocked={!canMove}
        isFlipped={myColor === 'light'} mustCapture={board.mustCapture} plies={match.moves.length} onSquare={handleSquare} />
      <div className="game-shell__stats">
        <div className="game-stat"><span>You · {colorName(myColor)}</span><b>{pieceCount(myColor === 'dark' ? 1 : 3)}</b></div>
        <div className="game-stat"><span>Friend · {colorName(friendColor)}</span><b>{pieceCount(friendColor === 'dark' ? 1 : 3)}</b></div>
      </div>
      <MatchActions canAct={hasJoinedGame && !isOver} isDrawPending={Boolean(match.drawOfferFrom)} actions={actions} />
      <p className="game-help">Your pieces are at the bottom. Captures are compulsory and jumps continue while they can.</p>
    </div>
  );
}
