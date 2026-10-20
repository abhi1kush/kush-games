import type { Chess as ChessGame, Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board, { TargetKind } from './Board';
import {
  applyMove, Color, colorName, colorToMove, createMatch, describeOutcome, legalTargets, MatchState, matchOutcome, opposite,
  PromotionPiece, replayMoves,
} from './match';
import { PeerTransport } from './peerTransport';
import { emptyGuestMatch, myColor as colorForRole, Role } from './protocol';
import { createRoomCode, normalizeRoomCode, roomCodeFromHash, roomHash, roomLink } from './room';
import { createChessSaveSlot } from './save';
import { ConnectionInfo, RoomSession, Transport } from './session';
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

type TransportFactory = (role: Role, roomCode: string) => Transport;
/** PeerJS normally. Browser tests may install `window.__kushChessTestTransport` to relay messages themselves. */
function createTransport(role: Role, roomCode: string): Transport {
  const testFactory = (window as unknown as { __kushChessTestTransport?: TransportFactory }).__kushChessTestTransport;
  return testFactory ? testFactory(role, roomCode) : new PeerTransport(role, roomCode);
}

function connectionText(connection: ConnectionInfo, role: Role): string {
  switch (connection.status) {
    case 'starting': return 'Connecting to server…';
    case 'waiting': return 'Waiting for friend…';
    case 'connecting': return connection.problem === 'host-not-found' ? 'Waiting for host…' : 'Connecting…';
    case 'connected': return 'Connected';
    case 'opponent-left': return role === 'host' ? 'Opponent left — waiting for them to come back…' : 'Opponent left — reconnecting…';
    case 'failed':
      switch (connection.problem) {
        case 'direct-connection': return 'Can’t connect to your friend';
        case 'room-in-use': return 'Room is open somewhere else';
        case 'version': return 'Different app versions';
        default: return 'Can’t reach the server — retrying…';
      }
  }
}

function connectionHelp(connection: ConnectionInfo): string | null {
  if (connection.status !== 'failed') return null;
  switch (connection.problem) {
    case 'direct-connection':
      return 'Your networks didn’t allow a direct connection (common on office, school or some mobile networks). Try another network — for example switch between Wi-Fi and mobile data. Still retrying…';
    case 'room-in-use': return 'This room is already open in another tab or device. Close it there, or leave and create a new room.';
    case 'version': return 'You and your friend have different versions of the game. Both reload the page.';
    default: return 'Check your internet connection. Retrying…';
  }
}

/** What to show when the page opens: a link to a room, a saved game, or the lobby. */
function initialScreen(saved: ReturnType<ReturnType<typeof createChessSaveSlot>['load']>): { screen: Screen; match: MatchState; restored: boolean } {
  const linkedRoom = roomCodeFromHash(window.location.hash);
  if (linkedRoom) {
    if (saved?.mode === 'online' && saved.roomCode === linkedRoom) {
      return { screen: { kind: 'online', role: saved.role, roomCode: saved.roomCode }, match: saved.match, restored: true };
    }
    return { screen: { kind: 'online', role: 'guest', roomCode: linkedRoom }, match: emptyGuestMatch(), restored: false };
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

export default function ChessGameScreen() {
  const [saveSlot] = useState(createChessSaveSlot);
  const [initial] = useState(() => initialScreen(saveSlot.load()));
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [match, setMatch] = useState<MatchState>(initial.match);
  const [connection, setConnection] = useState<ConnectionInfo>({ status: 'starting' });
  const [isRestored, setIsRestored] = useState(initial.restored);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [isLocalBoardFlipped, setIsLocalBoardFlipped] = useState(false);
  const [isMuted, setIsMuted] = useState(readMuted);
  const [hostColorChoice, setHostColorChoice] = useState<Color>('w');
  const [joinCodeText, setJoinCodeText] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isConfirmingResign, setIsConfirmingResign] = useState(false);
  const sessionRef = useRef<RoomSession | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;
  const isMutedRef = useRef(isMuted);
  const containerRef = useRef<HTMLDivElement>(null);

  const online = screen.kind === 'online' ? screen : null;
  const role: Role = online?.role ?? 'host';

  // ---------- Derived from the move list (recomputed only when it changes) ----------
  const game = useMemo(() => replayMoves(match.moves) ?? replayMoves([])!, [match.moves]);
  const position = useMemo(() => positionOf(game), [game]);
  const outcome = useMemo(() => matchOutcome(match, game), [match, game]);
  const history = useMemo(() => game.history({ verbose: true }), [game]);
  const lastMoveDetails = history[history.length - 1];
  const lastMove = useMemo(() => (lastMoveDetails ? { from: lastMoveDetails.from, to: lastMoveDetails.to } : null), [lastMoveDetails]);
  const turn = colorToMove(match);
  const checkSquare = useMemo(() => (game.inCheck() ? findKingSquare(game, game.turn()) : null), [game]);
  const myColor: Color = online ? colorForRole(match, role) : turn;
  const orientation: Color = online ? myColor : isLocalBoardFlipped ? 'b' : 'w';
  const hasJoinedGame = !online || match.gameNumber > 0;
  const canMove = screen.kind !== 'lobby' && hasJoinedGame && !outcome.isOver && turn === myColor && !pendingPromotion;

  const targets = useMemo(() => {
    const map = new Map<string, TargetKind>();
    if (!selected || !canMove) return map;
    for (const move of legalTargets(game, selected as Square)) map.set(move.to, move.captured ? 'capture' : 'move');
    return map;
  }, [selected, canMove, game]);

  // ---------- Online session ----------
  const roomCode = online?.roomCode;
  useEffect(() => {
    if (!roomCode) return;
    const session = new RoomSession(role, matchRef.current, createTransport(role, roomCode), update => {
      setMatch(current => (current === update.match ? current : update.match));
      setConnection(current => (current.status === update.connection.status && current.problem === update.connection.problem ? current : update.connection));
    });
    sessionRef.current = session;
    setConnection({ status: 'starting' });
    session.start();
    return () => { session.stop(); if (sessionRef.current === session) sessionRef.current = null; };
  }, [role, roomCode]);

  // ---------- Sounds for each new move (ours or the opponent's) ----------
  const previousMovesRef = useRef({ gameNumber: match.gameNumber, count: match.moves.length });
  useEffect(() => {
    const previous = previousMovesRef.current;
    previousMovesRef.current = { gameNumber: match.gameNumber, count: match.moves.length };
    if (previous.gameNumber === match.gameNumber && match.moves.length === previous.count + 1 && !isMutedRef.current) {
      playMoveSound(soundForLastMove(game));
      containerRef.current?.setAttribute('data-sounds', String(getSoundsPlayed()));
    }
    setSelected(null);
    setIsConfirmingResign(false);
  }, [match.gameNumber, match.moves.length, game]);

  // ---------- Saving ----------
  useEffect(() => {
    if (screen.kind === 'online') saveSlot.save({ mode: 'online', match, role: screen.role, roomCode: screen.roomCode });
    else if (screen.kind === 'local') {
      if (outcome.isOver) saveSlot.clear();
      else if (match.moves.length > 0) saveSlot.save({ mode: 'local', match });
    }
  }, [screen, match, outcome.isOver, saveSlot]);

  // ---------- Actions ----------
  const playUci = useCallback((uci: string) => {
    setIsRestored(false);
    if (sessionRef.current && screen.kind === 'online') {
      sessionRef.current.playMove(uci);
      return;
    }
    const result = applyMove(matchRef.current, uci, colorToMove(matchRef.current));
    if (result) setMatch(result.match);
  }, [screen.kind]);

  const handleSquareClick = useCallback((square: string) => {
    if (!isMutedRef.current) unlockAudio();
    if (!canMove) return;
    if (selected && targets.has(square)) {
      const options = legalTargets(game, selected as Square).filter(move => move.to === square);
      if (options.some(move => move.promotion)) setPendingPromotion({ from: selected, to: square });
      else playUci(`${selected}${square}`);
      setSelected(null);
      return;
    }
    const piece = game.get(square as Square);
    if (piece && piece.color === turn && square !== selected) setSelected(square);
    else setSelected(null);
  }, [canMove, selected, targets, game, turn, playUci]);

  const choosePromotion = (piece: PromotionPiece | null) => {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (pending && piece) playUci(`${pending.from}${pending.to}${piece}`);
  };

  const createRoom = () => {
    unlockAudio();
    const code = createRoomCode();
    setMatch(createMatch(hostColorChoice));
    setIsRestored(false);
    setScreen({ kind: 'online', role: 'host', roomCode: code });
  };

  const joinRoom = useCallback((code: string) => {
    unlockAudio();
    setMatch(emptyGuestMatch());
    setIsRestored(false);
    setScreen({ kind: 'online', role: 'guest', roomCode: code });
    if (roomCodeFromHash(window.location.hash) !== code) window.history.replaceState(null, '', roomHash(code));
  }, []);

  const startLocalGame = () => {
    unlockAudio();
    saveSlot.clear();
    setMatch(createMatch('w'));
    setIsRestored(false);
    setScreen({ kind: 'local' });
  };

  const leave = () => {
    saveSlot.clear();
    setScreen({ kind: 'lobby' });
    setMatch(createMatch());
    setSelected(null);
    setPendingPromotion(null);
    setIsRestored(false);
    if (roomCodeFromHash(window.location.hash)) window.history.replaceState(null, '', LOBBY_HASH);
  };

  const undoLocalMove = () => setMatch(current => ({ ...current, moves: current.moves.slice(0, -1), ending: null, drawOfferFrom: null }));

  const toggleMute = () => {
    setIsMuted(wasMuted => {
      const nowMuted = !wasMuted;
      isMutedRef.current = nowMuted;
      saveMuted(nowMuted);
      if (!nowMuted) unlockAudio();
      return nowMuted;
    });
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

  // ---------- Sharing ----------
  const shareLink = online ? roomLink(online.roomCode) : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyState('copied');
    } catch {
      const input = containerRef.current?.querySelector<HTMLInputElement>('[data-testid=chess-room-link]');
      input?.select();
      setCopyState(document.execCommand?.('copy') ? 'copied' : 'failed');
    }
    window.setTimeout(() => setCopyState('idle'), 2000);
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareRoom = () => {
    navigator.share?.({ title: 'Chess on Kush Games', text: 'Play chess with me! Open this link to join my game:', url: shareLink }).catch(() => undefined);
  };

  // ---------- Text ----------
  const opponentColor = opposite(myColor);
  let statusText: string;
  if (screen.kind === 'lobby') statusText = '';
  else if (!hasJoinedGame) statusText = 'Joining the room…';
  else if (outcome.isOver) {
    const base = describeOutcome(outcome);
    statusText = online && outcome.winner ? `${base} — ${outcome.winner === myColor ? 'you win! 🎉' : 'you lose'}` : base;
  } else if (online) statusText = `${turn === myColor ? 'Your move' : 'Friend’s move'}${checkSquare ? ' · Check!' : ''}`;
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

  // ---------- Lobby ----------
  if (screen.kind === 'lobby') {
    const typedCode = normalizeRoomCode(joinCodeText);
    return (
      <div className="chess-game chess-game--lobby" ref={containerRef} data-testid="chess-game" data-screen="lobby">
        <div className="chess-lobby" data-testid="chess-lobby">
          <h1 className="chess-lobby__title"><span aria-hidden="true">♞</span> Chess</h1>
          <section className="chess-lobby__card">
            <h2>Play a friend online</h2>
            <p>Create a room and send your friend the link. Moves go straight between your two browsers.</p>
            <div className="chess-segments" role="radiogroup" aria-label="Your colour">
              {(['w', 'b'] as Color[]).map(color => (
                <button key={color} type="button" role="radio" aria-checked={hostColorChoice === color}
                  className={hostColorChoice === color ? 'is-selected' : ''} onClick={() => setHostColorChoice(color)}>
                  I play {colorName(color)}
                </button>
              ))}
            </div>
            <button type="button" className="chess-button chess-button--primary" onClick={createRoom} data-testid="chess-create-room">
              Play a friend
            </button>
          </section>
          <section className="chess-lobby__card">
            <h2>Join with a code</h2>
            <form className="chess-join" onSubmit={event => { event.preventDefault(); if (typedCode) joinRoom(typedCode); }}>
              <input value={joinCodeText} onChange={event => setJoinCodeText(event.target.value)} placeholder="e.g. K7M2Q" maxLength={10}
                aria-label="Room code" data-testid="chess-join-code" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
              <button type="submit" className="chess-button" disabled={!typedCode} data-testid="chess-join">Join</button>
            </form>
          </section>
          <section className="chess-lobby__card">
            <h2>Pass and play</h2>
            <p>Two players on this device, taking turns.</p>
            <button type="button" className="chess-button" onClick={startLocalGame} data-testid="chess-local">Play on this device</button>
          </section>
        </div>
      </div>
    );
  }

  // ---------- Game ----------
  const opponentOffersDraw = online && match.drawOfferFrom === opponentColor && !outcome.isOver;
  const iOfferedDraw = online && match.drawOfferFrom === myColor && !outcome.isOver;
  const opponentOffersRematch = online && outcome.isOver && match.rematchOfferFrom === opponentColor;
  const iOfferedRematch = online && outcome.isOver && match.rematchOfferFrom === myColor;
  const help = online ? connectionHelp(connection) : null;
  const playerLabel = (color: Color) => (online ? (color === myColor ? `You · ${colorName(color)}` : `Friend · ${colorName(color)}`) : colorName(color));

  return (
    <div className="chess-game" ref={containerRef} data-testid="chess-game" data-screen={screen.kind}>
      <div className="chess-layout">
        <div className="chess-board-area">
          <div className={`chess-player chess-player--top${turn === opposite(orientation) && !outcome.isOver ? ' is-to-move' : ''}`}>
            <span className={`chess-player__dot chess-player__dot--${opposite(orientation)}`} />{playerLabel(opposite(orientation))}
          </div>
          <div className="chess-board-frame" data-testid="chess-board" data-fen={game.fen()} data-moves={match.moves.length}
            data-turn={turn} data-my-color={online ? myColor : ''} data-orientation={orientation} data-game-number={match.gameNumber}
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
          {online && (
            <div className="chess-room" data-testid="chess-room">
              <div className="chess-room__header">
                <span className="chess-room__label">Room</span>
                <b className="chess-room__code" data-testid="chess-room-code">{online.roomCode}</b>
                <span className={`chess-connection chess-connection--${connection.status}`} data-testid="chess-connection"
                  data-status={connection.status} data-problem={connection.problem ?? ''} role="status">
                  {connectionText(connection, online.role)}
                </span>
              </div>
              {help && <p className="chess-room__help" data-testid="chess-connection-help">{help}</p>}
              {online.role === 'host' && (
                <div className="chess-share">
                  <input readOnly value={shareLink} data-testid="chess-room-link" aria-label="Room link" onFocus={event => event.target.select()} />
                  <div className="chess-share__buttons">
                    <button type="button" className="chess-button chess-button--small" onClick={copyLink} data-testid="chess-copy">
                      {copyState === 'copied' ? '✓ Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
                    </button>
                    {canShare && <button type="button" className="chess-button chess-button--small" onClick={shareRoom} data-testid="chess-share">Share…</button>}
                  </div>
                </div>
              )}
            </div>
          )}
          {isRestored && (!online || connection.status !== 'connected') && <p className="chess-restored" data-testid="chess-restored">💾 Saved game restored{online ? ' — rejoining the room' : ''}</p>}
          <p className={`chess-status${outcome.isOver ? ' is-over' : ''}${checkSquare ? ' is-check' : ''}`} data-testid="chess-status">{statusText}</p>

          {opponentOffersDraw && (
            <div className="chess-offer" data-testid="chess-draw-offer">
              <span>Your friend offers a draw</span>
              <button type="button" className="chess-button chess-button--small chess-button--primary" onClick={() => sessionRef.current?.acceptDraw()} data-testid="chess-accept-draw">Accept</button>
              <button type="button" className="chess-button chess-button--small" onClick={() => sessionRef.current?.declineDraw()}>Decline</button>
            </div>
          )}
          {iOfferedDraw && <p className="chess-note">Draw offered — waiting for your friend.</p>}
          {opponentOffersRematch && (
            <div className="chess-offer" data-testid="chess-rematch-offer">
              <span>Your friend wants a rematch</span>
              <button type="button" className="chess-button chess-button--small chess-button--primary" onClick={() => sessionRef.current?.acceptRematch()} data-testid="chess-accept-rematch">Play again</button>
            </div>
          )}
          {iOfferedRematch && <p className="chess-note">Rematch offered — waiting for your friend.</p>}

          <ol className="chess-moves" ref={moveListRef} data-testid="chess-moves" aria-label="Moves">
            {movePairs.map(pair => (
              <li key={pair.number}><span className="chess-moves__number">{pair.number}.</span><span>{pair.white}</span><span>{pair.black}</span></li>
            ))}
          </ol>

          <div className="chess-actions">
            {online && !outcome.isOver && hasJoinedGame && (
              <>
                <button type="button" className="chess-button chess-button--small" disabled={Boolean(match.drawOfferFrom)}
                  onClick={() => sessionRef.current?.offerDraw()} data-testid="chess-offer-draw">½ Offer draw</button>
                {isConfirmingResign
                  ? <button type="button" className="chess-button chess-button--small chess-button--danger" onClick={() => { sessionRef.current?.resign(); setIsConfirmingResign(false); }} data-testid="chess-confirm-resign">Really resign?</button>
                  : <button type="button" className="chess-button chess-button--small" onClick={() => setIsConfirmingResign(true)} data-testid="chess-resign">🏳 Resign</button>}
              </>
            )}
            {online && outcome.isOver && !match.rematchOfferFrom && (
              <button type="button" className="chess-button chess-button--small chess-button--primary" onClick={() => sessionRef.current?.offerRematch()} data-testid="chess-rematch">↻ Rematch</button>
            )}
            {!online && (
              <>
                <button type="button" className="chess-button chess-button--small" onClick={undoLocalMove} disabled={match.moves.length === 0} data-testid="chess-undo">↶ Undo</button>
                <button type="button" className="chess-button chess-button--small" onClick={() => setIsLocalBoardFlipped(flipped => !flipped)} data-testid="chess-flip">⇅ Flip</button>
                <button type="button" className="chess-button chess-button--small" onClick={startLocalGame} data-testid="chess-new-game">↻ New game</button>
              </>
            )}
            <button type="button" className="chess-button chess-button--small" onClick={toggleMute} data-testid="chess-mute" aria-pressed={isMuted}
              aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}>{isMuted ? '🔇' : '🔊'}</button>
            <button type="button" className="chess-button chess-button--small" onClick={leave} data-testid="chess-leave">{online ? 'Leave room' : 'Exit'}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
