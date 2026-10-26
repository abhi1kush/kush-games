/** Connect Four against a friend in another browser (WebRTC via the shared online module). */
import { useEffect, useMemo, useRef } from 'react';
import { createSaveSlot, ONLINE_SAVE_VERSION, onlineSaveGameId, SaveSlot } from '../persistence';
import type { OnlineMatch, Role } from '../online/match';
import { MatchActions, MatchBanner, RoomPanel } from '../online/OnlineUI';
import { BoardResult, onlineResult } from '../online/result';
import { parseSavedOnlineRoom, SavedOnlineRoom } from '../online/save';
import { playConnectedSound, playGameOverSound, playOfferSound } from '../online/sounds';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { getSharedSoundsPlayed, MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import ConnectFourBoard from './Board';
import { ROWS } from './engine';
import { connectFourRules, replayColumns } from './rules';
import type { DiscColor } from './save';
import { playDropSound } from './sounds';

export const createConnectFourOnlineSlot = (): SaveSlot<SavedOnlineRoom<DiscColor>> =>
  createSaveSlot({ gameId: onlineSaveGameId('connect-four'), version: ONLINE_SAVE_VERSION, parse: data => parseSavedOnlineRoom(connectFourRules, data) });

const colorName = (color: DiscColor) => (color === 'red' ? 'Red' : 'Yellow');

export default function ConnectFourOnline({ role, roomCode, initialMatch, isRestored, saveSlot, onLeave }: {
  role: Role; roomCode: string; initialMatch: OnlineMatch<DiscColor>; isRestored: boolean;
  saveSlot: SaveSlot<SavedOnlineRoom<DiscColor>>; onLeave(): void;
}) {
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const room = useOnlineRoom({
    rules: connectFourRules, role, roomCode, initialMatch,
    save: saved => saveSlot.save(saved),
    onConnected: () => playConnectedSound(isMutedRef.current),
    onGameOver: () => { if (resultRef.current) playGameOverSound(resultRef.current.outcome, isMutedRef.current); },
  });
  const { match, connection, myColor, isOver, isMyTurn, actions } = room;
  const friendColor: DiscColor = myColor === 'red' ? 'yellow' : 'red';
  const hasJoinedGame = match.gameNumber > 0;

  // Board from the move list (wasm replay). Red always moves first, so owner 1 = red.
  const board = useMemo(() => {
    const engine = replayColumns(match.moves) ?? replayColumns([])!;
    const cells = engine.cells();
    const lastColumn = match.moves.length > 0 ? Number(match.moves[match.moves.length - 1]) : -1;
    let lastDropCell: number | null = null;
    if (lastColumn >= 0) for (let row = ROWS - 1; row >= 0; row--) if (cells[lastColumn * ROWS + row] !== 0) { lastDropCell = lastColumn * ROWS + row; break; }
    return { cells, winner: engine.winner(), winningCells: new Set(engine.winning_cells()), lastDropCell };
  }, [match.moves]);

  const boardResult: BoardResult<DiscColor> = board.winner === 0 ? null
    : board.winner === 3 ? { draw: true, reason: 'the board is full' } : { winner: board.winner === 1 ? 'red' : 'yellow', reason: 'four in a row' };
  const result = isOver ? onlineResult(match, myColor, boardResult) : null;
  const resultRef = useRef(result);
  resultRef.current = result;

  // Drop sound for every new disc (mine or the friend's).
  const previousRef = useRef({ gameNumber: match.gameNumber, count: match.moves.length });
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { gameNumber: match.gameNumber, count: match.moves.length };
    if (previous.gameNumber === match.gameNumber && match.moves.length === previous.count + 1 && board.lastDropCell !== null) {
      playDropSound(board.lastDropCell % ROWS, isMutedRef.current);
    }
  }, [match.gameNumber, match.moves.length, board.lastDropCell, isMutedRef]);

  const incomingOffer = (match.drawOfferFrom === friendColor ? 'draw' : '') + (match.rematchOfferFrom === friendColor ? 'rematch' : '');
  useEffect(() => { if (incomingOffer) playOfferSound(isMutedRef.current); }, [incomingOffer, isMutedRef]);

  const handleColumn = (column: number) => {
    unlockAudio();
    if (isMyTurn && hasJoinedGame) actions.playMove(String(column));
  };

  const offerSide = (color: DiscColor | null) => (color === null ? null : color === myColor ? 'me' : 'friend');
  const turnColor = connectFourRules.colorToMove(match.moves);
  const statusText = !hasJoinedGame ? 'Joining the room…'
    : result ? 'Game over'
    : isMyTurn ? `Your turn (${colorName(myColor)})` : `Friend’s turn (${colorName(friendColor)})`;

  return (
    <div className="game-shell connect-four connect-four--online" data-testid="connect-four" data-mode="online" data-winner={board.winner}
      data-moves={match.moves.length} data-sounds={getSharedSoundsPlayed()} data-my-color={hasJoinedGame ? myColor : ''} data-game-number={match.gameNumber}
      data-over={isOver ? 'true' : 'false'} data-turn={turnColor}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Opponent">
          <button type="button" className="is-selected" data-testid="c4-mode-online">Online</button>
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <button type="button" className="game-button" onClick={onLeave} data-testid="online-leave">Leave room</button>
      </div>
      <RoomPanel gameId="connect-four" gameName="Connect Four" role={role} roomCode={roomCode} connection={connection} isRestored={isRestored} />
      <p className={`game-banner ${result ? (result.outcome === 'loss' ? 'game-banner--lose' : 'game-banner--win') : 'game-banner--info'}`} data-testid="c4-status">
        {!result && hasJoinedGame && <i className={`c4-turn-disc c4-turn-disc--${turnColor}`} aria-hidden="true" />}{statusText}
      </p>
      <MatchBanner result={result} drawOffer={offerSide(match.drawOfferFrom)} rematchOffer={offerSide(match.rematchOfferFrom)}
        notice={room.notice} actions={actions} swapText={`Next game you play ${colorName(friendColor)}${friendColor === 'red' ? ' and go first' : ''}.`} />
      <ConnectFourBoard cells={board.cells} winningCells={board.winningCells} lastDropCell={board.lastDropCell}
        colorOfOwner={owner => (owner === 1 ? 'red' : 'yellow')} isLocked={!isMyTurn || !hasJoinedGame} onColumn={handleColumn} />
      <MatchActions canAct={hasJoinedGame && !isOver} isDrawPending={Boolean(match.drawOfferFrom)} actions={actions} />
      <p className="game-help">You are {colorName(myColor)}. Red moves first; colours swap every new game.</p>
    </div>
  );
}
