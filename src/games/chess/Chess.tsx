import type { Chess as ChessGame, Square } from 'chess.js';
import { MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyGuestMatch, Role } from '../online/match';
import { MatchActions, MatchBanner, OnlineLobbyCard, RoomPanel } from '../online/OnlineUI';
import { onlineResult } from '../online/result';
import { createRoomCode, roomCodeFromHash, roomHash } from '../online/room';
import { playConnectedSound, playGameOverSound, playOfferSound } from '../online/sounds';
import { useOnlineRoom } from '../online/useOnlineRoom';
import Board, { TargetKind } from './Board';
import {
  applyMove, chessRules, Color, colorName, colorToMove, createMatch, describeOutcome, legalTargets, MatchState, matchOutcome, opposite,
  PromotionPiece, replayMoves,
} from './match';
import { createChessSaveSlot, SavedChess } from './save';
import { getSoundsPlayed, MoveSound, playMoveSound, readMuted, saveMuted, unlockAudio } from './sound';
import './chess.css';

type Screen =
  | { kind: 'lobby' }
  | { kind: 'local' }
  | { kind: 'online'; role: Role; roomCode: string };

const LOBBY_HASH = '#/play/chess';
const PROMOTION_CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const PROMOTION_GLYPHS: Record<PromotionPiece, string> = { q: '♛\uFE0E', r: '♜\uFE0E', b: '♝\uFE0E', n: '♞\uFE0E' };
const PROMOTION_NAMES: Record<PromotionPiece, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

type SaveSlot = ReturnType<typeof createChessSaveSlot>;

/** What to show when the page opens: a link to a room, a saved game, or the lobby. */
function initialScreen(saved: SavedChess | null): { screen: Screen; match: MatchState; restored: boolean } {
  const linkedRoom = roomCodeFromHash(window.location.hash);
  if (linkedRoom) {
    if (saved?.mode === 'online' && saved.roomCode === linkedRoom) {
      return { screen: { kind: 'online', role: saved.role, roomCode: saved.roomCode }, match: saved.match, restored: true };
    }
    return { screen: { kind: 'online', role: 'guest', roomCode: linkedRoom }, match: emptyGuestMatch(chessRules), restored: false };
  }
  if (saved?.mode === 'online') return { screen: { kind: 'online', role: saved.role, roomCode: saved.roomCode }, match: saved.match, restored: true };
  if (saved?.mode === 'local') return { screen: { kind: 'local' }, match: saved.match, restored: true };
  return { screen: { kind: 'lobby' }, match: createMatch(), restored: false };
}

function soundForLastMove(game: ChessGame): MoveSound {
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  if (game.inCheck()) return 'check';
  return last?.captured ? 'capture' : 'move';
}

/** Board position as 8×8 strings like "wn" (rank 8 first). */
function positionOf(game: ChessGame): string[][] {
  return game.board().map(row => row.map(cell => (cell ? `${cell.color}${cell.type}` : '')));
}

function findKingSquare(game: ChessGame, color: Color): string | null {
  for (const row of game.board()) for (const cell of row) if (cell && cell.type === 'k' && cell.color === color) return cell.square;
  return null;
}

/** The chess mute setting (chess keeps its own key, as before). */
function useChessMute() {
  const [isMuted, setIsMuted] = useState(readMuted);
  const isMutedRef = useRef(isMuted);
  const toggleMute = () => {
    const nowMuted = !isMutedRef.current;
    isMutedRef.current = nowMuted;
    saveMuted(nowMuted);
    if (!nowMuted) unlockAudio();
    setIsMuted(nowMuted);
  };
  return { isMuted, isMutedRef, toggleMute };
}

export default function ChessGameScreen() {
  const [saveSlot] = useState(createChessSaveSlot);
  const [initial] = useState(() => initialScreen(saveSlot.load()));
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [startMatch, setStartMatch] = useState<MatchState>(initial.match);
  const [isRestored, setIsRestored] = useState(initial.restored);
  const [hostColorChoice, setHostColorChoice] = useState<Color>('w');
  const mute = useChessMute();

  const joinRoom = useCallback((code: string) => {
    unlockAudio();
    setStartMatch(emptyGuestMatch(chessRules));
    setIsRestored(false);
    setScreen({ kind: 'online', role: 'guest', roomCode: code });
    if (roomCodeFromHash(window.location.hash) !== code) window.history.replaceState(null, '', roomHash('chess', code));
  }, []);

  const createRoom = () => {
    unlockAudio();
    setStartMatch(createMatch(hostColorChoice));
    setIsRestored(false);
    setScreen({ kind: 'online', role: 'host', roomCode: createRoomCode() });
  };

  const startLocalGame = () => {
    unlockAudio();
    saveSlot.clear();
    setStartMatch(createMatch('w'));
    setIsRestored(false);
    setScreen({ kind: 'local' });
  };

  const leave = () => {
    saveSlot.clear();
    setScreen({ kind: 'lobby' });
    setIsRestored(false);
    if (roomCodeFromHash(window.location.hash)) window.history.replaceState(null, '', LOBBY_HASH);
  };

  // Opening a room link while the game is open joins that room.
  useEffect(() => {
    const handleHashChange = () => {
      const code = roomCodeFromHash(window.location.hash);
      if (code && !(screen.kind === 'online' && screen.roomCode === code)) joinRoom(code);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [screen, joinRoom]);

  if (screen.kind === 'lobby') {
    return (
      <div className="chess-game chess-game--lobby" data-testid="chess-game" data-screen="lobby">
        <div className="chess-lobby" data-testid="chess-lobby">
          <h1 className="chess-lobby__title"><span aria-hidden="true">♞</span> Chess</h1>
          <OnlineLobbyCard onCreate={createRoom} onJoin={joinRoom}>
            <div className="chess-segments" role="radiogroup" aria-label="Your colour">
              {(['w', 'b'] as Color[]).map(color => (
                <button key={color} type="button" role="radio" aria-checked={hostColorChoice === color}
                  className={hostColorChoice === color ? 'is-selected' : ''} onClick={() => setHostColorChoice(color)}>
                  I play {colorName(color)}
                </button>
              ))}
            </div>
          </OnlineLobbyCard>
          <section className="chess-lobby__card">
            <h2>Pass and play</h2>
            <p>Two players on this device, taking turns.</p>
            <button type="button" className="chess-button" onClick={startLocalGame} data-testid="chess-local">Play on this device</button>
          </section>
        </div>
      </div>
    );
  }
  if (screen.kind === 'local') {
    return <LocalChess initialMatch={startMatch} isRestored={isRestored} saveSlot={saveSlot} mute={mute} onNewGame={startLocalGame} onExit={leave} />;
  }
  return (
    <OnlineChess key={`${screen.role}:${screen.roomCode}`} role={screen.role} roomCode={screen.roomCode} initialMatch={startMatch}
      isRestored={isRestored} saveSlot={saveSlot} mute={mute} onLeave={leave} />
  );
}

type Mute = ReturnType<typeof useChessMute>;

function LocalChess({ initialMatch, isRestored, saveSlot, mute, onNewGame, onExit }: {
  initialMatch: MatchState; isRestored: boolean; saveSlot: SaveSlot; mute: Mute; onNewGame(): void; onExit(): void;
}) {
  const [match, setMatch] = useState(initialMatch);
  const [isFlipped, setIsFlipped] = useState(false);
  useEffect(() => setMatch(initialMatch), [initialMatch]);
  const isOver = useMemo(() => matchOutcome(match, replayMoves(match.moves) ?? replayMoves([])!).isOver, [match]);
  useEffect(() => {
    if (isOver) saveSlot.clear();
    else if (match.moves.length > 0) saveSlot.save({ mode: 'local', match });
  }, [match, isOver, saveSlot]);
  const playUci = (uci: string) => {
    const result = applyMove(match, uci, colorToMove(match));
    if (result) setMatch(result.match);
  };
  const undo = () => setMatch(current => ({ ...current, moves: current.moves.slice(0, -1), ending: null, drawOfferFrom: null }));
  return (
    <ChessTable match={match} myColor={null} orientation={isFlipped ? 'b' : 'w'} canPlay isMuted={mute.isMutedRef} screen="local" onMove={playUci}
      playerLabel={colorName}
      panelTop={isRestored && match.moves.length > 0 ? <p className="chess-restored" data-testid="chess-restored">💾 Saved game restored</p> : null}
      actions={(
        <>
          <button type="button" className="chess-button chess-button--small" onClick={undo} disabled={match.moves.length === 0} data-testid="chess-undo">↶ Undo</button>
          <button type="button" className="chess-button chess-button--small" onClick={() => setIsFlipped(flipped => !flipped)} data-testid="chess-flip">⇅ Flip</button>
          <button type="button" className="chess-button chess-button--small" onClick={onNewGame} data-testid="chess-new-game">↻ New game</button>
          <MuteToggle mute={mute} />
          <button type="button" className="chess-button chess-button--small" onClick={onExit} data-testid="chess-leave">Exit</button>
        </>
      )} />
  );
}

function OnlineChess({ role, roomCode, initialMatch, isRestored, saveSlot, mute, onLeave }: {
  role: Role; roomCode: string; initialMatch: MatchState; isRestored: boolean; saveSlot: SaveSlot; mute: Mute; onLeave(): void;
}) {
  const room = useOnlineRoom({
    rules: chessRules, role, roomCode, initialMatch,
    save: saved => saveSlot.save(saved),
    onConnected: () => playConnectedSound(mute.isMutedRef.current),
    onGameOver: finished => {
      const game = replayMoves(finished.moves);
      const outcome = game ? matchOutcome(finished, game) : null;
      const mine = role === 'host' ? finished.hostColor : opposite(finished.hostColor);
      playGameOverSound(!outcome?.winner ? 'draw' : outcome.winner === mine ? 'win' : 'loss', mute.isMutedRef.current);
    },
  });
  const { match, connection, myColor, isOver, actions } = room;
  const opponent = opposite(myColor);
  const hasJoinedGame = match.gameNumber > 0;

  // A ping when the friend offers a draw or a rematch.
  const incomingOffer = (match.drawOfferFrom === opponent ? 'draw' : '') + (match.rematchOfferFrom === opponent ? 'rematch' : '');
  useEffect(() => { if (incomingOffer) playOfferSound(mute.isMutedRef.current); }, [incomingOffer, mute.isMutedRef]);

  const result = useMemo(() => {
    if (!isOver) return null;
    const game = replayMoves(match.moves);
    const outcome = game ? matchOutcome(match, game) : null;
    if (!outcome || match.ending) return onlineResult(match, myColor, null);
    return onlineResult(match, myColor, outcome.winner ? { winner: outcome.winner, reason: `by ${outcome.reason}` } : { draw: true, reason: `by ${outcome.reason}` });
  }, [isOver, match, myColor]);

  const offerSide = (color: Color | null) => (color === null ? null : color === myColor ? 'me' : 'friend');
  const banner = (
    <MatchBanner result={result} drawOffer={offerSide(match.drawOfferFrom)} rematchOffer={offerSide(match.rematchOfferFrom)}
      notice={room.notice} actions={actions} swapText={`Next game you play ${colorName(opponent)}.`} />
  );
  return (
    <ChessTable match={match} myColor={myColor} orientation={myColor} canPlay={hasJoinedGame} isMuted={mute.isMutedRef} screen="online"
      onMove={uci => { actions.playMove(uci); }}
      statusOverride={!hasJoinedGame ? 'Joining the room…' : result ? result.text : null}
      playerLabel={color => (color === myColor ? `You · ${colorName(color)}` : `Friend · ${colorName(color)}`)}
      banner={banner}
      panelTop={<RoomPanel gameId="chess" gameName="Chess" role={role} roomCode={roomCode} connection={connection} isRestored={isRestored} />}
      actions={(
        <>
          <MatchActions canAct={hasJoinedGame && !isOver} isDrawPending={Boolean(match.drawOfferFrom)} actions={actions} />
          <MuteToggle mute={mute} />
          <button type="button" className="chess-button chess-button--small" onClick={onLeave} data-testid="chess-leave">Leave room</button>
        </>
      )} />
  );
}

function MuteToggle({ mute }: { mute: Mute }) {
  return (
    <button type="button" className="chess-button chess-button--small" onClick={mute.toggleMute} data-testid="chess-mute" aria-pressed={mute.isMuted}
      aria-label={mute.isMuted ? 'Unmute sound' : 'Mute sound'}>{mute.isMuted ? '🔇' : '🔊'}</button>
  );
}

/** The board, players, status and move list; local and online play add their own panels and buttons. */
function ChessTable({ match, myColor, orientation, canPlay, isMuted, screen, onMove, playerLabel, statusOverride, banner, panelTop, actions }: {
  match: MatchState;
  /** null in pass-and-play (whoever's turn it is moves). */
  myColor: Color | null;
  orientation: Color;
  canPlay: boolean;
  isMuted: MutableRefObject<boolean>;
  screen: 'local' | 'online';
  onMove(uci: string): void;
  playerLabel(color: Color): string;
  statusOverride?: string | null;
  banner?: ReactNode;
  panelTop?: ReactNode;
  actions: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const game = useMemo(() => replayMoves(match.moves) ?? replayMoves([])!, [match.moves]);
  const position = useMemo(() => positionOf(game), [game]);
  const outcome = useMemo(() => matchOutcome(match, game), [match, game]);
  const history = useMemo(() => game.history({ verbose: true }), [game]);
  const lastMoveDetails = history[history.length - 1];
  const lastMove = useMemo(() => (lastMoveDetails ? { from: lastMoveDetails.from, to: lastMoveDetails.to } : null), [lastMoveDetails]);
  const turn = colorToMove(match);
  const checkSquare = useMemo(() => (game.inCheck() ? findKingSquare(game, game.turn()) : null), [game]);
  const canMove = canPlay && !outcome.isOver && (myColor === null || turn === myColor) && !pendingPromotion;

  const targets = useMemo(() => {
    const map = new Map<string, TargetKind>();
    if (!selected || !canMove) return map;
    for (const move of legalTargets(game, selected as Square)) map.set(move.to, move.captured ? 'capture' : 'move');
    return map;
  }, [selected, canMove, game]);

  // Sound for each new move (ours or the opponent's); clear the selection.
  const previousMovesRef = useRef({ gameNumber: match.gameNumber, count: match.moves.length });
  useEffect(() => {
    const previous = previousMovesRef.current;
    previousMovesRef.current = { gameNumber: match.gameNumber, count: match.moves.length };
    if (previous.gameNumber === match.gameNumber && match.moves.length === previous.count + 1 && !isMuted.current) {
      playMoveSound(soundForLastMove(game));
      containerRef.current?.setAttribute('data-sounds', String(getSoundsPlayed()));
    }
    setSelected(null);
    setPendingPromotion(null);
  }, [match.gameNumber, match.moves.length, game, isMuted]);

  const handleSquareClick = useCallback((square: string) => {
    if (!isMuted.current) unlockAudio();
    if (!canMove) return;
    if (selected && targets.has(square)) {
      const options = legalTargets(game, selected as Square).filter(move => move.to === square);
      if (options.some(move => move.promotion)) setPendingPromotion({ from: selected, to: square });
      else onMove(`${selected}${square}`);
      setSelected(null);
      return;
    }
    const piece = game.get(square as Square);
    if (piece && piece.color === turn && square !== selected) setSelected(square);
    else setSelected(null);
  }, [canMove, selected, targets, game, turn, onMove, isMuted]);

  const choosePromotion = (piece: PromotionPiece | null) => {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (pending && piece) onMove(`${pending.from}${pending.to}${piece}`);
  };

  let statusText: string;
  if (statusOverride) statusText = statusOverride;
  else if (outcome.isOver) statusText = describeOutcome(outcome);
  else if (myColor) statusText = `${turn === myColor ? 'Your move' : 'Friend’s move'}${checkSquare ? ' · Check!' : ''}`;
  else statusText = `${colorName(turn)} to move${checkSquare ? ' · Check!' : ''}`;

  const movePairs = useMemo(() => {
    const pairs: { number: number; white: string; black: string }[] = [];
    history.forEach((move, index) => {
      if (index % 2 === 0) pairs.push({ number: index / 2 + 1, white: move.san, black: '' });
      else pairs[pairs.length - 1].black = move.san;
    });
    return pairs;
  }, [history]);
  const moveListRef = useRef<HTMLOListElement>(null);
  useEffect(() => { const list = moveListRef.current; if (list) list.scrollTop = list.scrollHeight; }, [movePairs]);

  return (
    <div className="chess-game" ref={containerRef} data-testid="chess-game" data-screen={screen}>
      <div className="chess-layout">
        <div className="chess-board-area">
          {banner}
          <div className={`chess-player chess-player--top${turn === opposite(orientation) && !outcome.isOver ? ' is-to-move' : ''}`}>
            <span className={`chess-player__dot chess-player__dot--${opposite(orientation)}`} />{playerLabel(opposite(orientation))}
          </div>
          <div className="chess-board-frame" data-testid="chess-board" data-fen={game.fen()} data-moves={match.moves.length}
            data-turn={turn} data-my-color={myColor ?? ''} data-orientation={orientation} data-game-number={match.gameNumber}
            data-over={outcome.isOver ? 'true' : 'false'} data-result={outcome.isOver ? (outcome.winner ?? 'draw') : ''}>
            <Board position={position} orientation={orientation} selected={selected} targets={targets} lastMove={lastMove}
              checkSquare={checkSquare} onSquareClick={handleSquareClick} />
            {pendingPromotion && (
              <div className="chess-promotion" data-testid="chess-promotion" role="dialog" aria-label="Promote pawn to">
                <p>Promote to</p>
                <div className="chess-promotion__choices">
                  {PROMOTION_CHOICES.map(piece => (
                    <button key={piece} type="button" onClick={() => choosePromotion(piece)} aria-label={PROMOTION_NAMES[piece]} data-piece={piece}>
                      <span className={`chess-piece chess-piece--${turn}`}>{PROMOTION_GLYPHS[piece]}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="chess-button chess-button--small" onClick={() => choosePromotion(null)}>Cancel</button>
              </div>
            )}
          </div>
          <div className={`chess-player chess-player--bottom${turn === orientation && !outcome.isOver ? ' is-to-move' : ''}`}>
            <span className={`chess-player__dot chess-player__dot--${orientation}`} />{playerLabel(orientation)}
          </div>
        </div>

        <aside className="chess-panel">
          {panelTop}
          <p className={`chess-status${outcome.isOver ? ' is-over' : ''}${checkSquare ? ' is-check' : ''}`} data-testid="chess-status">{statusText}</p>
          <ol className="chess-moves" ref={moveListRef} data-testid="chess-moves" aria-label="Moves">
            {movePairs.map(pair => (
              <li key={pair.number}><span className="chess-moves__number">{pair.number}.</span><span>{pair.white}</span><span>{pair.black}</span></li>
            ))}
          </ol>
          <div className="chess-actions">{actions}</div>
        </aside>
      </div>
    </div>
  );
}
