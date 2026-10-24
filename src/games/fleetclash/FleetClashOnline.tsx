/**
 * Fleet Clash against a friend in another browser. Fleets never cross the network during the game: each side sends a
 * sealed fingerprint (sha-256 of fleet + salt) first, answers the friend's shots by itself, and reveals the fleet at
 * the end so the other side can check every answer.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createSaveSlot, ONLINE_SAVE_VERSION, onlineSaveGameId, type SaveSlot } from '../persistence';
import type { OnlineMatch, Role } from '../online/match';
import { MatchBanner, RoomPanel } from '../online/OnlineUI';
import { onlineResult } from '../online/result';
import { parseSavedOnlineRoom, type SavedOnlineRoom } from '../online/save';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { unlockAudio } from '../sharedSound';
import { BattleView, type Callout, resultText } from './Battle';
import { emptySea, type FleetCode, fleetText, isValidFleet, SHIPS, SUNK } from './engine';
import { NAVY, RulesCard, SAFFRON } from './RulesCard';
import { battleOf, colorName, commitmentOf, FLEET_COLORS, type FleetColor, fleetRules, randomSalt, responseText } from './online';
import { PlacementBoard } from './Placement';
import type { FleetSound } from './sounds';
import { resultSound } from './sounds';

export const createFleetOnlineSlot = (): SaveSlot<SavedOnlineRoom<FleetColor>> =>
  createSaveSlot({ gameId: onlineSaveGameId('fleet-clash'), version: ONLINE_SAVE_VERSION, parse: data => parseSavedOnlineRoom(fleetRules, data) });

// ---------- this browser's secret fleets (by room, game and colour) ----------
const SECRET_KEY = 'kush-games-fleet-clash-secrets';
interface Secret { fleet: FleetCode; salt: string; }
function readSecrets(): Record<string, Secret> {
  try { const value = JSON.parse(localStorage.getItem(SECRET_KEY) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function readSecret(key: string): Secret | null {
  const secret = readSecrets()[key];
  return secret && isValidFleet(secret.fleet) && typeof secret.salt === 'string' ? secret : null;
}
function saveSecret(key: string, secret: Secret) {
  const entries = Object.entries(readSecrets()).filter(([existing]) => existing !== key).slice(-9);
  try { localStorage.setItem(SECRET_KEY, JSON.stringify(Object.fromEntries([...entries, [key, secret]]))); } catch { /* storage unavailable */ }
}

export default function FleetClashOnline({ role, roomCode, initialMatch, isRestored, saveSlot, onLeave, sound, mute }: {
  role: Role; roomCode: string; initialMatch: OnlineMatch<FleetColor>; isRestored: boolean;
  saveSlot: SaveSlot<SavedOnlineRoom<FleetColor>>; onLeave(): void; sound(kind: FleetSound): void; mute: ReactNode;
}) {
  const room = useOnlineRoom({
    rules: fleetRules, role, roomCode, initialMatch,
    save: saved => saveSlot.save(saved),
    onConnected: () => sound('turn'),
  });
  const { match, connection, myColor, isOver, actions } = room;
  const hasJoinedGame = match.gameNumber > 0;
  const battle = battleOf(match.moves) ?? battleOf([])!;
  const me = FLEET_COLORS.indexOf(myColor) as 0 | 1;
  const friend = (1 - me) as 0 | 1;
  const friendColor = FLEET_COLORS[friend];
  const secretKey = `${roomCode}:${match.gameNumber}:${myColor}`;
  const [secret, setSecret] = useState<Secret | null>(() => readSecret(secretKey));
  useEffect(() => { setSecret(readSecret(secretKey)); }, [secretKey]);
  const [verified, setVerified] = useState<'checking' | 'ok' | 'bad' | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const calloutId = useRef(0);
  const expected = battle.expected;
  const myCommitted = battle.commits[me] !== null;

  // send my sealed fleet when it's my turn to commit
  useEffect(() => {
    if (!secret || myCommitted || expected.kind !== 'commit' || expected.by !== me || !hasJoinedGame) return;
    let cancelled = false;
    void commitmentOf(fleetText(secret.fleet), secret.salt).then(hash => { if (!cancelled) actions.playMove(`c${hash}`); });
    return () => { cancelled = true; };
  }, [secret, myCommitted, expected, me, hasJoinedGame, actions]);

  // answer the friend's shot / reveal my fleet at the end — automatically
  useEffect(() => {
    if (!secret || !hasJoinedGame) return;
    if (expected.kind === 'respond' && expected.by === me) actions.playMove(responseText(secret.fleet, battle.incoming[me]));
    else if (expected.kind === 'reveal' && expected.by === me) actions.playMove(`v${fleetText(secret.fleet)}.${secret.salt}`);
  }, [secret, expected, me, hasJoinedGame, actions, battle]);

  // check the friend's revealed fleet against their sealed fingerprint and their answers
  const friendReveal = battle.reveals[friend];
  useEffect(() => {
    if (!friendReveal) { setVerified(null); return; }
    setVerified('checking');
    let cancelled = false;
    void commitmentOf(friendReveal.text, friendReveal.salt).then(hash => {
      if (!cancelled) setVerified(hash === battle.commits[friend] && !battle.dishonest[friend] ? 'ok' : 'bad');
    });
    return () => { cancelled = true; };
  }, [friendReveal, battle, friend]);

  // sounds + callouts for each answered shot
  const shown = useRef({ game: match.gameNumber, answers: battle.answers[0].length + battle.answers[1].length });
  useEffect(() => {
    const answers = battle.answers[0].length + battle.answers[1].length;
    const previous = shown.current;
    shown.current = { game: match.gameNumber, answers };
    if (previous.game !== match.gameNumber || answers <= previous.answers || !battle.lastShot || battle.lastShot.result === null) return;
    const { by, cell, result } = battle.lastShot;
    sound('fire');
    window.setTimeout(() => sound(resultSound(result)), 180);
    const text = resultText(cell, result, by === me);
    calloutId.current += 1;
    setCallout({ id: calloutId.current, kind: text.kind, text: by === me ? text.text : result >= SUNK ? `Your ${SHIPS[result - SUNK].name} was sunk!` : `Friend: ${text.text}`, side: by === me ? 'target' : 'own' });
    if (battle.winner !== null && answers > previous.answers) window.setTimeout(() => sound(battle.winner === me ? 'win' : 'lose'), 700);
  }, [battle, match.gameNumber, me, sound]);

  const boardWinner = battle.winner;
  const result = isOver ? onlineResult(match, myColor, boardWinner === null ? null : { winner: FLEET_COLORS[boardWinner], reason: 'the whole fleet is sunk' }) : null;
  const canFire = hasJoinedGame && !isOver && boardWinner === null && expected.kind === 'fire' && expected.by === me && !!secret;
  const waitingForAnswer = expected.kind === 'respond' && expected.by === friend;

  let status: string;
  if (!hasJoinedGame) status = 'Joining the room…';
  else if (match.ending) status = 'Game over';
  else if (boardWinner !== null) status = boardWinner === me ? 'Victory! You sank the whole fleet 🎉' : 'Defeat — your fleet is sunk';
  else if (!myCommitted && !secret) status = 'Place your fleet';
  else if (expected.kind === 'commit') status = expected.by === me ? 'Sealing your fleet…' : 'Waiting for your friend to place their fleet…';
  else if (canFire) status = 'Your turn — fire at the enemy waters';
  else if (waitingForAnswer) status = 'Shot away…';
  else status = 'Friend is aiming…';

  const showPlacement = hasJoinedGame && !myCommitted && !secret && !isOver;
  return (
    <div className="game-shell fleet fleet--online" data-testid="fleet" data-mode="online" data-my-color={hasJoinedGame ? myColor : ''} data-game-number={match.gameNumber}
      data-over={isOver} data-expected={expected.kind} data-expected-by={'by' in expected ? expected.by : ''} data-me={me} data-winner={boardWinner ?? ''} data-verified={verified ?? ''}>
      <div className="game-shell__header">
        <span className="fleet-level">Online · you are {colorName(myColor)}</span>
        {mute}
        <button type="button" className="game-button" onClick={onLeave} data-testid="online-leave">Leave room</button>
      </div>
      <RoomPanel gameId="fleet-clash" gameName="Fleet Clash" role={role} roomCode={roomCode} connection={connection} isRestored={isRestored} />
      <p className={`game-banner ${boardWinner === null && !match.ending ? 'game-banner--info' : (result?.outcome ?? (boardWinner === me ? 'win' : 'loss')) === 'loss' ? 'game-banner--lose' : 'game-banner--win'}`} data-testid="fleet-status">{status}</p>
      {verified && (
        <p className={`fleet-verify fleet-verify--${verified}`} data-testid="fleet-verify" data-state={verified}>
          {verified === 'checking' ? 'Checking your friend’s fleet…' : verified === 'ok' ? '✓ Fleets revealed — your friend’s answers all check out' : '⚠ Your friend’s revealed fleet doesn’t match their answers'}
        </p>
      )}
      <MatchBanner result={result} drawOffer={null} rematchOffer={match.rematchOfferFrom === null ? null : match.rematchOfferFrom === myColor ? 'me' : 'friend'}
        notice={room.notice} actions={actions} swapText={`Next game ${friendColor === FLEET_COLORS[0] ? 'your friend fires' : 'you fire'} first.`} />
      {showPlacement ? (
        <PlacementBoard title="Place your fleet" playerColor={me === 0 ? NAVY : SAFFRON} readyLabel="⚓ Ready — seal my fleet" onSound={sound}
          onReady={fleet => { unlockAudio(); const value = { fleet, salt: randomSalt() }; saveSecret(secretKey, value); setSecret(value); sound('turn'); }} />
      ) : secret && hasJoinedGame ? (
        <BattleView target={battle.seas[me]} incoming={battle.seas[friend] ?? emptySea()} myFleet={secret.fleet} revealFleet={friendReveal?.fleet ?? null}
          canFire={canFire} onFire={cell => { unlockAudio(); if (canFire && battle.seas[me].marks[cell] === 0) actions.playMove(`f${String(cell).padStart(2, '0')}`); }}
          enemyTitle="Friend’s waters" myTitle="Your fleet" myColor={me === 0 ? NAVY : SAFFRON} enemyColor={me === 0 ? SAFFRON : NAVY} callout={callout} />
      ) : hasJoinedGame && !isOver ? (
        <p className="game-help" data-testid="fleet-lost-secret">This browser doesn’t have your fleet for this game any more (storage was cleared). Resign to start a new game.</p>
      ) : null}
      {hasJoinedGame && !isOver && boardWinner === null && myCommitted && (
        confirmResign ? (
          <div className="online-actions online-actions--confirm">
            <span>Really resign?</span>
            <button type="button" className="online-button online-button--small online-button--danger" onClick={() => { setConfirmResign(false); actions.resign(); }} data-testid="online-confirm-resign">Yes, resign</button>
            <button type="button" className="online-button online-button--small" onClick={() => setConfirmResign(false)}>No</button>
          </div>
        ) : <div className="online-actions"><button type="button" className="online-button online-button--small" onClick={() => setConfirmResign(true)} data-testid="online-resign">🏳 Resign</button></div>
      )}
      {!hasJoinedGame || showPlacement ? <RulesCard /> : null}
    </div>
  );
}

