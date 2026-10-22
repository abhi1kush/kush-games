/** Shared pieces of the online UI: lobby cards, the room panel (code, status, share link) and match controls. */
import { useState, type ReactNode } from 'react';
import type { Role } from './match';
import type { Notice } from './protocol';
import type { OnlineResult } from './result';
import { normalizeRoomCode, roomLink } from './room';
import type { ConnectionInfo } from './transport';
import type { OnlineRoomActions } from './useOnlineRoom';
import './online.css';

export function connectionText(connection: ConnectionInfo, role: Role): string {
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

export function connectionHelp(connection: ConnectionInfo): string | null {
  if (connection.status !== 'failed') return null;
  switch (connection.problem) {
    case 'direct-connection':
      return 'Your networks didn’t allow a direct connection (common on office, school or some mobile networks). Try another network — for example switch between Wi-Fi and mobile data. Still retrying…';
    case 'room-in-use': return 'This room is already open in another tab or device. Close it there, or leave and create a new room.';
    case 'version': return 'You and your friend have different versions of the game. Both reload the page.';
    default: return 'Check your internet connection. Retrying…';
  }
}

/** "Play a friend online" card: create a room, or join one with a code. `children` can add options (e.g. colour). */
export function OnlineLobbyCard({ onCreate, onJoin, children, description }: {
  onCreate(): void;
  onJoin(code: string): void;
  description?: string;
  children?: ReactNode;
}) {
  const [joinCodeText, setJoinCodeText] = useState('');
  const typedCode = normalizeRoomCode(joinCodeText);
  return (
    <div className="online-lobby" data-testid="online-lobby">
      <section className="online-card">
        <h2>Play a friend online</h2>
        <p>{description ?? 'Create a room and send your friend the link. Moves go straight between your two browsers.'}</p>
        {children}
        <button type="button" className="online-button online-button--primary" onClick={onCreate} data-testid="online-create">Create a room</button>
      </section>
      <section className="online-card">
        <h2>Join with a code</h2>
        <form className="online-join" onSubmit={event => { event.preventDefault(); if (typedCode) onJoin(typedCode); }}>
          <input value={joinCodeText} onChange={event => setJoinCodeText(event.target.value)} placeholder="e.g. K7M2Q" maxLength={10}
            aria-label="Room code" data-testid="online-join-code" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          <button type="submit" className="online-button" disabled={!typedCode} data-testid="online-join">Join</button>
        </form>
      </section>
    </div>
  );
}

/** Room code, connection status, connection help and (for the host) the link to share. */
export function RoomPanel({ gameId, gameName, role, roomCode, connection, isRestored }: {
  gameId: string;
  gameName: string;
  role: Role;
  roomCode: string;
  connection: ConnectionInfo;
  isRestored?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const shareLink = roomLink(gameId, roomCode);
  const help = connectionHelp(connection);
  const copyLink = async (input: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyState('copied');
    } catch {
      input?.select();
      setCopyState(document.execCommand?.('copy') ? 'copied' : 'failed');
    }
    window.setTimeout(() => setCopyState('idle'), 2000);
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareRoom = () => {
    navigator.share?.({ title: `${gameName} on Kush Games`, text: `Play ${gameName} with me! Open this link to join my game:`, url: shareLink }).catch(() => undefined);
  };
  const showShare = role === 'host' && connection.status !== 'connected';
  return (
    <div className="online-room" data-testid="online-room">
      <div className="online-room__header">
        <span className="online-room__label">Room</span>
        <b className="online-room__code" data-testid="online-room-code">{roomCode}</b>
        <span className={`online-connection online-connection--${connection.status}`} data-testid="online-connection"
          data-status={connection.status} data-problem={connection.problem ?? ''} role="status">
          {connectionText(connection, role)}
        </span>
      </div>
      {help && <p className="online-room__help" data-testid="online-connection-help">{help}</p>}
      {isRestored && connection.status !== 'connected' && <p className="online-restored" data-testid="online-restored">💾 Saved game restored — rejoining the room</p>}
      {/* The share link stays in the DOM for the host (hidden once the friend is in) so it can still be copied later. */}
      {role === 'host' && (
        <details className="online-share" open={showShare || undefined}>
          <summary>Invite link</summary>
          <input readOnly value={shareLink} data-testid="online-room-link" aria-label="Room link" onFocus={event => event.target.select()} />
          <div className="online-share__buttons">
            <button type="button" className="online-button online-button--small" data-testid="online-copy"
              onClick={event => copyLink(event.currentTarget.closest('details')?.querySelector('input') ?? null)}>
              {copyState === 'copied' ? '✓ Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
            </button>
            {canShare && <button type="button" className="online-button online-button--small" onClick={shareRoom} data-testid="online-share">Share…</button>}
          </div>
        </details>
      )}
    </div>
  );
}

const NOTICE_TEXT: Record<Notice, string> = {
  'draw-declined': 'Your friend declined the draw.',
  'rematch-declined': 'Your friend declined the rematch.',
  'rematch-started': 'New game!',
};

/**
 * Offers and the game-over banner. Put it right above or below the board so it's visible on phones.
 * `drawOfferFrom` / `rematchOfferFrom` are 'me', 'friend' or null.
 */
export function MatchBanner({ result, drawOffer, rematchOffer, notice, actions, swapText }: {
  result: OnlineResult | null;
  drawOffer: 'me' | 'friend' | null;
  rematchOffer: 'me' | 'friend' | null;
  notice: Notice | null;
  actions: OnlineRoomActions;
  /** What changes in the next game, e.g. "You’ll play Yellow". */
  swapText?: string;
}) {
  return (
    <div className="online-banner" aria-live="polite">
      {!result && drawOffer === 'friend' && (
        <div className="online-offer" data-testid="online-draw-offer">
          <span>Your friend offers a draw</span>
          <span className="online-offer__buttons">
            <button type="button" className="online-button online-button--small online-button--primary" onClick={actions.acceptDraw} data-testid="online-accept-draw">Accept</button>
            <button type="button" className="online-button online-button--small" onClick={actions.declineDraw} data-testid="online-decline-draw">Decline</button>
          </span>
        </div>
      )}
      {!result && drawOffer === 'me' && <p className="online-pending" data-testid="online-draw-pending">½ Draw offered — waiting for your friend…</p>}
      {result && (
        <div className={`online-game-over online-game-over--${result.outcome}`} data-testid="online-game-over" data-outcome={result.outcome}>
          <p className="online-game-over__result" data-testid="online-result">{result.text}</p>
          {rematchOffer === 'friend' ? (
            <div className="online-offer online-offer--rematch" data-testid="online-rematch-offer">
              <span>Friend wants a rematch</span>
              <span className="online-offer__buttons">
                <button type="button" className="online-button online-button--small online-button--primary" onClick={actions.requestRematch} data-testid="online-accept-rematch">Accept</button>
                <button type="button" className="online-button online-button--small" onClick={actions.declineRematch} data-testid="online-decline-rematch">Decline</button>
              </span>
            </div>
          ) : rematchOffer === 'me' ? (
            <p className="online-pending" data-testid="online-rematch-pending">Rematch requested — waiting for your friend…</p>
          ) : (
            <button type="button" className="online-button online-button--primary" onClick={actions.requestRematch} data-testid="online-new-game">↻ New game</button>
          )}
          {swapText && <p className="online-game-over__hint">{swapText}</p>}
        </div>
      )}
      {notice && <p className="online-notice" data-testid="online-notice" data-notice={notice}>{NOTICE_TEXT[notice]}</p>}
    </div>
  );
}

/** Offer draw and Resign (with a confirm step), shown while a game is in progress. */
export function MatchActions({ canAct, isDrawPending, actions }: { canAct: boolean; isDrawPending: boolean; actions: OnlineRoomActions }) {
  const [isConfirmingResign, setIsConfirmingResign] = useState(false);
  if (!canAct) return null;
  if (isConfirmingResign) {
    return (
      <div className="online-actions online-actions--confirm" role="group" aria-label="Confirm resign">
        <span>Really resign?</span>
        <button type="button" className="online-button online-button--small online-button--danger" data-testid="online-confirm-resign"
          onClick={() => { setIsConfirmingResign(false); actions.resign(); }}>Yes, resign</button>
        <button type="button" className="online-button online-button--small" onClick={() => setIsConfirmingResign(false)} data-testid="online-cancel-resign">No</button>
      </div>
    );
  }
  return (
    <div className="online-actions">
      <button type="button" className="online-button online-button--small" disabled={isDrawPending} onClick={actions.offerDraw} data-testid="online-offer-draw">½ Offer draw</button>
      <button type="button" className="online-button online-button--small" onClick={() => setIsConfirmingResign(true)} data-testid="online-resign">🏳 Resign</button>
    </div>
  );
}
