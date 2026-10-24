/**
 * Fleet Clash: hide your five ships on a 10 × 10 sea and sink the enemy fleet first. Play the computer (Easy,
 * Medium, Hard), pass and play on one device, or play a friend online (fleets stay hidden until the end).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OnlineLobbyCard } from '../online/OnlineUI';
import { useOnlineScreen } from '../online/useOnlineScreen';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { BattleView, type Callout, resultText } from './Battle';
import { emptySea, type FleetCode, LEVEL_NAMES, loadFleetEngine, randomFleet, SHIPS, SUNK } from './engine';
import FleetClashOnline, { createFleetOnlineSlot } from './FleetClashOnline';
import { computerShot, createFleetSaveSlot, type LocalGame, type LocalMode, replayLocal } from './local';
import { fleetRules } from './online';
import { PlacementBoard } from './Placement';
import { NAVY, RulesCard, SAFFRON } from './RulesCard';
import { type FleetSound, playFleetSound, resultSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './fleetclash.css';

const SETTINGS_KEY = 'kush-games-fleet-clash-settings';
const PASS_DELAY_MS = 1300;
const COMPUTER_DELAY_MS = 850;

export default function FleetClash() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadFleetEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="fleet-loading"><p className="game-help">Loading…</p></div>;
  return <FleetScreens />;
}

function FleetScreens() {
  const [onlineSlot] = useState(createFleetOnlineSlot);
  const { screen, createRoom, joinRoom, showLobby, showLocal } = useOnlineScreen(fleetRules, onlineSlot);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: FleetSound) => playFleetSound(kind, isMutedRef.current), [isMutedRef]);
  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} />;
  if (screen.kind === 'room') {
    return <FleetClashOnline key={`${screen.role}:${screen.roomCode}`} role={screen.role} roomCode={screen.roomCode} initialMatch={screen.initialMatch}
      isRestored={screen.isRestored} saveSlot={onlineSlot} onLeave={showLocal} sound={sound} mute={mute} />;
  }
  if (screen.kind === 'lobby') {
    return (
      <div className="game-shell fleet" data-testid="fleet" data-mode="online-lobby">
        <div className="game-shell__header">
          <button type="button" className="game-button" onClick={showLocal} data-testid="fleet-back">← Back</button>
          {mute}
        </div>
        <OnlineLobbyCard onCreate={() => { unlockAudio(); createRoom(); }} onJoin={code => { unlockAudio(); joinRoom(code); }}
          description="Create a room and send your friend the link. Fleets stay secret: each browser only sends a sealed fingerprint of its fleet, and both fleets are revealed and checked at the end." />
      </div>
    );
  }
  return <LocalScreens onOnline={showLobby} sound={sound} mute={mute} />;
}

interface Settings { mode: LocalMode; level: number; games: number; }
function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { mode: value.mode === 'friends' ? 'friends' : 'computer', level: [0, 1, 2].includes(value.level) ? value.level : 1, games: Number.isInteger(value.games) ? value.games : 0 };
  } catch { return { mode: 'computer', level: 1, games: 0 }; }
}
const saveSettings = (settings: Settings) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } };

type Stage =
  | { kind: 'menu' }
  | { kind: 'place'; player: 0 | 1; fleets: [FleetCode | null, FleetCode | null]; curtain: boolean }
  | { kind: 'battle'; game: LocalGame };

function LocalScreens({ onOnline, sound, mute }: { onOnline(): void; sound(kind: FleetSound): void; mute: React.ReactNode }) {
  const slot = useMemo(() => createFleetSaveSlot(), []);
  const [settings, setSettings] = useState(readSettings);
  const [stage, setStage] = useState<Stage>(() => { const saved = slot.load(); return saved ? { kind: 'battle', game: saved } : { kind: 'menu' }; });
  const update = (next: Partial<Settings>) => setSettings(current => { const value = { ...current, ...next }; saveSettings(value); return value; });
  const names = (mode: LocalMode): [string, string] => (mode === 'computer' ? ['You', 'Computer'] : ['Player 1', 'Player 2']);

  const startBattle = (fleets: [FleetCode, FleetCode]) => {
    const first = (settings.games % 2) as 0 | 1;
    update({ games: settings.games + 1 });
    const game: LocalGame = { mode: settings.mode, level: settings.level, first: settings.mode === 'computer' ? 0 : first, names: names(settings.mode), fleets, shots: [], seed: (Math.random() * 0xffffffff) >>> 0 };
    slot.save(game);
    setStage({ kind: 'battle', game });
  };

  if (stage.kind === 'menu') {
    return (
      <div className="game-shell fleet" data-testid="fleet" data-mode="menu">
        <div className="fleet-menu">
          <div className="fleet-menu__head">
            <h1 className="fleet-logo"><span>Fleet</span> <span>Clash</span></h1>
            {mute}
          </div>
          <p className="fleet-menu__tagline">Hide your fleet. Hunt theirs. First to sink all five ships wins.</p>
          <div className="game-segments" role="group" aria-label="Opponent">
            <button type="button" className={settings.mode === 'computer' ? 'is-selected' : ''} onClick={() => update({ mode: 'computer' })} data-testid="fleet-mode-computer">vs Computer</button>
            <button type="button" className={settings.mode === 'friends' ? 'is-selected' : ''} onClick={() => update({ mode: 'friends' })} data-testid="fleet-mode-friends">2 players</button>
            <button type="button" onClick={onOnline} data-testid="fleet-mode-online">Online</button>
          </div>
          {settings.mode === 'computer' && (
            <div className="game-segments" role="group" aria-label="Difficulty">
              {LEVEL_NAMES.map((name, level) => <button key={name} type="button" className={settings.level === level ? 'is-selected' : ''} onClick={() => update({ level })} data-testid={`fleet-level-${level}`}>{name}</button>)}
            </div>
          )}
          <button type="button" className="online-button online-button--primary fleet-menu__start" onClick={() => { unlockAudio(); setStage({ kind: 'place', player: 0, fleets: [null, null], curtain: false }); }} data-testid="fleet-start">
            ⚓ Place your fleet
          </button>
          <RulesCard />
        </div>
      </div>
    );
  }

  if (stage.kind === 'place') {
    const isSecond = stage.player === 1;
    if (stage.curtain) {
      return <Curtain text={`${names('friends')[1]}: place your fleet`} sub={`${names('friends')[0]}, look away!`} onContinue={() => setStage({ ...stage, curtain: false })} />;
    }
    return (
      <div className="game-shell fleet" data-testid="fleet" data-mode="place">
        <div className="game-shell__header">
          <button type="button" className="game-button" onClick={() => setStage({ kind: 'menu' })} data-testid="fleet-menu">← Menu</button>
          {mute}
        </div>
        <PlacementBoard key={stage.player} title={settings.mode === 'friends' ? `${names('friends')[stage.player]}: place your fleet` : 'Place your fleet'}
          playerColor={isSecond ? SAFFRON : NAVY} readyLabel={settings.mode === 'friends' && !isSecond ? 'Done — pass the device' : '⚔ Start the battle'} onSound={sound}
          onReady={code => {
            sound('turn');
            if (settings.mode === 'computer') startBattle([code, randomFleet()]);
            else if (!isSecond) setStage({ kind: 'place', player: 1, fleets: [code, null], curtain: true });
            else startBattle([stage.fleets[0]!, code]);
          }} />
      </div>
    );
  }
  return <LocalBattle key={stage.game.seed} initial={stage.game} slot={slot} sound={sound} mute={mute}
    onMenu={() => { slot.clear(); setStage({ kind: 'menu' }); }}
    onNewGame={() => { slot.clear(); unlockAudio(); setStage({ kind: 'place', player: 0, fleets: [null, null], curtain: false }); }} />;
}

function LocalBattle({ initial, slot, sound, mute, onMenu, onNewGame }: {
  initial: LocalGame; slot: ReturnType<typeof createFleetSaveSlot>; sound(kind: FleetSound): void; mute: React.ReactNode; onMenu(): void; onNewGame(): void;
}) {
  const [game, setGame] = useState(initial);
  const state = useMemo(() => replayLocal(game), [game]);
  const isFriends = game.mode === 'friends';
  // pass and play: whose boards are on screen (null = the pass-the-device curtain)
  const [viewer, setViewer] = useState<0 | 1 | null>(() => (isFriends ? null : 0));
  const [callout, setCallout] = useState<Callout | null>(null);
  const [locked, setLocked] = useState(false);
  const calloutId = useRef(0);
  const announced = useRef(false);

  const fire = useCallback((cell: number) => {
    setGame(current => {
      const next = { ...current, shots: [...current.shots, cell] };
      const after = replayLocal(next);
      if (after.winner !== null) slot.clear(); else slot.save(next);
      return next;
    });
  }, [slot]);

  // sound + callout for every new shot
  const shotCount = useRef(game.shots.length);
  useEffect(() => {
    if (game.shots.length === shotCount.current || !state.last) return;
    shotCount.current = game.shots.length;
    const { by, cell, result } = state.last;
    const mine = isFriends ? true : by === 0;
    sound('fire');
    window.setTimeout(() => sound(resultSound(result)), 180);
    const text = resultText(cell, result, mine);
    calloutId.current += 1;
    const shipName = result >= SUNK ? SHIPS[result - SUNK].name : '';
    const words = isFriends && result >= SUNK ? `${game.names[by]} sank the ${shipName}!` : !mine && result < SUNK ? `Computer: ${text.text}` : text.text;
    setCallout({ id: calloutId.current, kind: text.kind, text: words, side: isFriends || by === 0 ? 'target' : 'own' });
    if (state.winner !== null && !announced.current) {
      announced.current = true;
      window.setTimeout(() => sound(isFriends || state.winner === 0 ? 'win' : 'lose'), 700);
    }
    // pass and play: show the result, then hand the device over
    if (isFriends && state.winner === null) {
      setLocked(true);
      const timer = window.setTimeout(() => { setLocked(false); setViewer(null); }, PASS_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
  }, [game.shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // the computer's turn
  useEffect(() => {
    if (isFriends || state.winner !== null || state.turn !== 1) return;
    const timer = window.setTimeout(() => fire(computerShot(game, state)), COMPUTER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [game, state, isFriends, fire]);

  useEffect(() => {
    if (!isFriends || state.winner === null) return;
    setViewer(state.winner);
  }, [isFriends, state.winner]);

  if (isFriends && viewer === null && state.winner === null) {
    return <Curtain text={`${game.names[state.turn]}’s turn`} sub="Pass the device — no peeking!" onContinue={() => { unlockAudio(); setViewer(state.turn); }} />;
  }
  const me = (viewer ?? 0) as 0 | 1;
  const enemy = (1 - me) as 0 | 1;
  const canFire = state.winner === null && state.turn === me && !locked;
  const status = state.winner !== null
    ? (isFriends ? `${game.names[state.winner]} wins!` : state.winner === 0 ? 'Victory! You sank the whole fleet 🎉' : 'Defeat — the computer sank your fleet')
    : canFire ? (isFriends ? `${game.names[me]}: fire at the enemy waters` : 'Your turn — fire at the enemy waters')
      : isFriends ? 'Pass the device…' : 'Computer is aiming…';
  const colors = me === 0 ? [NAVY, SAFFRON] : [SAFFRON, NAVY];
  return (
    <div className="game-shell fleet" data-testid="fleet" data-mode={game.mode} data-turn={state.turn} data-winner={state.winner ?? ''} data-shots={game.shots.length}>
      <div className="game-shell__header">
        <button type="button" className="game-button" onClick={onMenu} data-testid="fleet-menu">← Menu</button>
        <span className="fleet-level">{isFriends ? '2 players' : `vs Computer · ${LEVEL_NAMES[game.level]}`}</span>
        {mute}
        <button type="button" className="game-button" onClick={onNewGame} data-testid="fleet-new-game">New game</button>
      </div>
      <p className={`game-banner ${state.winner === null ? 'game-banner--info' : !isFriends && state.winner === 1 ? 'game-banner--lose' : 'game-banner--win'}`} data-testid="fleet-status">{status}</p>
      <BattleView target={state.seas[me]} incoming={state.seas[enemy] ?? emptySea()} myFleet={game.fleets[me]} revealFleet={state.winner !== null ? game.fleets[enemy] : null}
        canFire={canFire} onFire={cell => { unlockAudio(); if (canFire && state.seas[me].marks[cell] === 0) fire(cell); }}
        enemyTitle={isFriends ? `${game.names[enemy]}’s waters` : 'Enemy waters'} myTitle={isFriends ? `${game.names[me]}’s fleet` : 'Your fleet'}
        myColor={colors[0]} enemyColor={colors[1]} callout={callout} />
      {state.winner !== null && (
        <div className="fleet-finish" data-testid="fleet-finish">
          <h2>{status}</h2>
          <p>{game.names[state.winner]} won in {state.seas[state.winner].shots} shots ({Math.round((state.seas[state.winner].hits / Math.max(1, state.seas[state.winner].shots)) * 100)}% accuracy).</p>
          <div className="fleet-finish__buttons">
            <button type="button" className="online-button online-button--primary" onClick={onNewGame} data-testid="fleet-play-again">↻ New game</button>
            <button type="button" className="online-button" onClick={onMenu}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Curtain({ text, sub, onContinue }: { text: string; sub: string; onContinue(): void }) {
  return (
    <div className="game-shell fleet" data-testid="fleet" data-mode="curtain">
      <div className="fleet-curtain" data-testid="fleet-curtain">
        <span className="fleet-curtain__icon" aria-hidden="true">⚓</span>
        <h2>{text}</h2>
        <p>{sub}</p>
        <button type="button" className="online-button online-button--primary" onClick={onContinue} data-testid="fleet-curtain-continue">I’m ready</button>
      </div>
    </div>
  );
}
