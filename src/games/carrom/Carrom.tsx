/**
 * Carrom: the classic Indian board game — flick the striker, pocket your coins, cover the Queen. Play the computer
 * (Easy, Medium, Hard), a friend on the same device, or a friend online. Physics, rules and the computer player run
 * in Rust compiled to WebAssembly.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSaveSlot, isInteger, isOneOf, isRecord, ONLINE_SAVE_VERSION, onlineSaveGameId, type SaveSlot } from '../persistence';
import type { OnlineMatch, Role } from '../online/match';
import { MatchBanner, OnlineLobbyCard, RoomPanel } from '../online/OnlineUI';
import { onlineResult } from '../online/result';
import { parseSavedOnlineRoom, type SavedOnlineRoom } from '../online/save';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { useOnlineScreen } from '../online/useOnlineScreen';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { CarromTable, type TableState } from './CarromTable';
import { FOUL_NONE, isShotText, LEVEL_NAMES, loadCarromEngine, type Outcome, outcomeText, replay, type Shot } from './engine';
import { CARROM_COLORS, type CarromColor, carromRules } from './online';
import { RulesCard, ScoreCards } from './Panels';
import { type CarromSound, playCarromSound, playClick } from './sounds';
import '../shared.css';
import '../online/online.css';
import './carrom.css';

const SETTINGS_KEY = 'kush-games-carrom-settings';
const THINK_MS = 650;
const AIM_SHOW_MS = 900;

export default function CarromGame() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadCarromEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="carrom-loading"><p className="game-help">Loading…</p></div>;
  return <CarromScreens />;
}

const createOnlineSlot = (): SaveSlot<SavedOnlineRoom<CarromColor>> =>
  createSaveSlot({ gameId: onlineSaveGameId('carrom'), version: ONLINE_SAVE_VERSION, parse: data => parseSavedOnlineRoom(carromRules, data) });

interface Sounds { sound(kind: CarromSound): void; click(strength: number, cushion: boolean): void; mute: ReactNode; }

function CarromScreens() {
  const [onlineSlot] = useState(createOnlineSlot);
  const { screen, createRoom, joinRoom, showLobby, showLocal } = useOnlineScreen(carromRules, onlineSlot);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: CarromSound) => playCarromSound(kind, isMutedRef.current), [isMutedRef]);
  const click = useCallback((strength: number, cushion: boolean) => playClick(strength, cushion, isMutedRef.current), [isMutedRef]);
  const sounds: Sounds = { sound, click, mute: <MuteButton isMuted={isMuted} onToggle={toggleMute} /> };
  if (screen.kind === 'room') {
    return <CarromOnline key={`${screen.role}:${screen.roomCode}`} role={screen.role} roomCode={screen.roomCode} initialMatch={screen.initialMatch}
      isRestored={screen.isRestored} saveSlot={onlineSlot} onLeave={showLocal} {...sounds} />;
  }
  if (screen.kind === 'lobby') {
    return (
      <div className="game-shell carrom" data-testid="carrom-screen" data-mode="online-lobby">
        <div className="game-shell__header">
          <button type="button" className="game-button" onClick={showLocal} data-testid="carrom-back">← Back</button>
          {sounds.mute}
        </div>
        <OnlineLobbyCard onCreate={() => { unlockAudio(); createRoom(); }} onJoin={code => { unlockAudio(); joinRoom(code); }}
          description="Create a room and send your friend the link. Only each shot (striker spot, aim and power) travels between your browsers — both boards run the same physics." />
      </div>
    );
  }
  return <LocalScreens onOnline={showLobby} {...sounds} />;
}

// ---------- local games ----------
type LocalMode = 'computer' | 'friends';
interface LocalGame { mode: LocalMode; level: number; names: [string, string]; shots: string[]; seed: number; }
interface Settings { mode: LocalMode; level: number; }

function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { mode: value.mode === 'friends' ? 'friends' : 'computer', level: [0, 1, 2].includes(value.level) ? value.level : 1 };
  } catch { return { mode: 'computer', level: 1 }; }
}
const saveSettings = (settings: Settings) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } };

function parseLocalGame(data: unknown): LocalGame | null {
  if (!isRecord(data) || !isOneOf(data.mode, ['computer', 'friends'] as const) || !isInteger(data.level, 0, 2) || !isInteger(data.seed, 0, 0xffffffff)) return null;
  if (!Array.isArray(data.names) || data.names.length !== 2 || !data.names.every(name => typeof name === 'string' && name.length <= 24)) return null;
  if (!Array.isArray(data.shots) || data.shots.length > 600 || !data.shots.every(isShotText)) return null;
  const board = replay(data.shots as string[]);
  if (!board) return null;
  const over = board.winner() !== 255;
  board.free();
  if (over) return null;
  return { mode: data.mode, level: data.level, names: [data.names[0], data.names[1]], shots: data.shots as string[], seed: data.seed as number };
}
const createLocalSlot = () => createSaveSlot<LocalGame>({ gameId: 'carrom', version: 1, parse: parseLocalGame });

function LocalScreens({ onOnline, sound, click, mute }: Sounds & { onOnline(): void }) {
  const slot = useMemo(createLocalSlot, []);
  const [settings, setSettings] = useState(readSettings);
  const [game, setGame] = useState<LocalGame | null>(() => slot.load());
  const update = (next: Partial<Settings>) => setSettings(current => { const value = { ...current, ...next }; saveSettings(value); return value; });
  const start = () => {
    unlockAudio();
    const value: LocalGame = { mode: settings.mode, level: settings.level, names: settings.mode === 'computer' ? ['You', 'Computer'] : ['Player 1', 'Player 2'], shots: [], seed: (Math.random() * 0xffffffff) >>> 0 };
    slot.save(value);
    setGame(value);
    sound('turn');
  };
  if (!game) {
    return (
      <div className="game-shell carrom" data-testid="carrom-screen" data-mode="menu">
        <div className="carrom-menu">
          <div className="carrom-menu__head">
            <h1 className="carrom-logo"><span className="carrom-logo__coin" aria-hidden="true" />Carrom</h1>
            {mute}
          </div>
          <p className="carrom-menu__tagline">Flick the striker, pocket your coins, cover the Queen.</p>
          <div className="game-segments" role="group" aria-label="Opponent">
            <button type="button" className={settings.mode === 'computer' ? 'is-selected' : ''} onClick={() => update({ mode: 'computer' })} data-testid="carrom-mode-computer">vs Computer</button>
            <button type="button" className={settings.mode === 'friends' ? 'is-selected' : ''} onClick={() => update({ mode: 'friends' })} data-testid="carrom-mode-friends">2 players</button>
            <button type="button" onClick={onOnline} data-testid="carrom-mode-online">Online</button>
          </div>
          {settings.mode === 'computer' && (
            <div className="game-segments" role="group" aria-label="Difficulty">
              {LEVEL_NAMES.map((name, level) => <button key={name} type="button" className={settings.level === level ? 'is-selected' : ''} onClick={() => update({ level })} data-testid={`carrom-level-${level}`}>{name}</button>)}
            </div>
          )}
          <button type="button" className="online-button online-button--primary carrom-menu__start" onClick={start} data-testid="carrom-start">🎯 Start</button>
          <RulesCard />
        </div>
      </div>
    );
  }
  return <LocalGameView key={game.seed} game={game} slot={slot} sound={sound} click={click} mute={mute}
    onMenu={() => { slot.clear(); setGame(null); }} onNewGame={start} setGame={setGame} />;
}

function LocalGameView({ game, slot, sound, click, mute, onMenu, onNewGame, setGame }: Sounds & {
  game: LocalGame; slot: SaveSlot<LocalGame>; onMenu(): void; onNewGame(): void; setGame(game: LocalGame): void;
}) {
  const [table, setTable] = useState<TableState | null>(null);
  const [preview, setPreview] = useState<Shot | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; kind: string } | null>(null);
  const isComputer = game.mode === 'computer';
  const gameRef = useRef(game); gameRef.current = game;

  const shoot = useCallback((text: string) => {
    const next = { ...gameRef.current, shots: [...gameRef.current.shots, text] };
    gameRef.current = next;
    slot.save(next);
    setGame(next);
  }, [slot, setGame]);

  const onOutcome = useCallback((outcome: Outcome) => {
    const text = outcomeText(outcome, game.names);
    if (outcome.foul !== FOUL_NONE) sound('foul'); else if (outcome.queen & 3) sound('queen');
    if (text) setToast(current => ({ id: (current?.id ?? 0) + 1, ...text }));
  }, [game.names, sound]);

  const onState = useCallback((state: TableState) => {
    setTable(previous => {
      if (state.winner !== null && previous?.winner === null) {
        slot.clear();
        window.setTimeout(() => sound(!isComputer || state.winner === 0 ? 'win' : 'lose'), 300);
      } else if (previous && state.turn !== previous.turn && state.winner === null) sound('turn');
      return state;
    });
  }, [slot, sound, isComputer]);

  // the computer's turn: think, show the aim, shoot
  const shotCount = game.shots.length;
  const computerToPlay = isComputer && !!table && table.winner === null && table.turn === 1 && !table.animating && table.applied === shotCount && table.phase === 0;
  useEffect(() => {
    if (!computerToPlay) return;
    let timer = window.setTimeout(() => {
      const board = replay(gameRef.current.shots);
      if (!board) return;
      const [x, aimX, aimY, power] = board.ai_shot(game.level, (game.seed ^ Math.imul(shotCount + 1, 2654435761)) >>> 0);
      board.free();
      const shot = { x: Math.round(x), aimX: Math.round(aimX), aimY: Math.round(aimY), power: Math.round(power) };
      setPreview(shot);
      timer = window.setTimeout(() => {
        setPreview(null);
        shoot(`s${String(shot.x).padStart(3, '0')}.${shot.aimX}.${shot.aimY}.${Math.max(1, Math.min(1000, shot.power))}`);
      }, AIM_SHOW_MS);
    }, THINK_MS);
    return () => window.clearTimeout(timer);
  }, [computerToPlay, shotCount, game.level, game.seed, shoot]);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const winner = table?.winner ?? null;
  let status = 'Setting up the board…';
  if (table) {
    if (winner !== null) status = isComputer ? (winner === 0 ? 'You win! 🎉' : 'The computer wins') : `${game.names[winner]} wins! 🎉`;
    else if (table.animating) status = '…';
    else if (isComputer) status = table.turn === 0 ? 'Your turn — you play White (bottom)' : 'Computer is aiming…';
    else status = `${game.names[table.turn]}’s turn — ${table.turn === 0 ? 'White, bottom' : 'Black, top'}`;
  }
  return (
    <div className="game-shell carrom" data-testid="carrom-screen" data-mode={game.mode} data-level={game.level}>
      <div className="game-shell__header">
        <button type="button" className="game-button" onClick={onMenu} data-testid="carrom-menu">← Menu</button>
        <span className="carrom-mode">{isComputer ? `vs Computer · ${LEVEL_NAMES[game.level]}` : '2 players'}</span>
        {mute}
        <button type="button" className="game-button" onClick={onNewGame} data-testid="carrom-new-game">New game</button>
      </div>
      <div className="carrom-layout">
        <div className="carrom-side">
          {table && <ScoreCards state={table} names={game.names} />}
          <p className={`game-banner ${winner === null ? 'game-banner--info' : isComputer && winner === 1 ? 'game-banner--lose' : 'game-banner--win'}`} data-testid="carrom-status">{status}</p>
          {toast && <p key={toast.id} className={`carrom-toast carrom-toast--${toast.kind}`} data-testid="carrom-toast" role="status">{toast.text}</p>}
        </div>
        <CarromTable shots={game.shots} controllable={isComputer ? [0] : [0, 1]} flipped={false} onShoot={shoot} onState={onState} onOutcome={onOutcome}
          sound={sound} click={click} preview={preview} />
      </div>
      {winner !== null && table && (
        <div className="carrom-finish" data-testid="carrom-finish">
          <h2>{status}</h2>
          <p>{game.names[winner]} cleared the board — {table.points} point{table.points === 1 ? '' : 's'} in {game.shots.length} shots.</p>
          <div className="carrom-finish__buttons">
            <button type="button" className="online-button online-button--primary" onClick={onNewGame} data-testid="carrom-play-again">↻ New game</button>
            <button type="button" className="online-button" onClick={onMenu}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- online ----------
function CarromOnline({ role, roomCode, initialMatch, isRestored, saveSlot, onLeave, sound, click, mute }: Sounds & {
  role: Role; roomCode: string; initialMatch: OnlineMatch<CarromColor>; isRestored: boolean; saveSlot: SaveSlot<SavedOnlineRoom<CarromColor>>; onLeave(): void;
}) {
  const room = useOnlineRoom({ rules: carromRules, role, roomCode, initialMatch, save: saved => saveSlot.save(saved), onConnected: () => sound('turn') });
  const { match, connection, myColor, isOver, actions } = room;
  const hasJoinedGame = match.gameNumber > 0;
  const me = CARROM_COLORS.indexOf(myColor) as 0 | 1;
  const [table, setTable] = useState<TableState | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; kind: string } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const names: [string, string] = me === 0 ? ['You', 'Friend'] : ['Friend', 'You'];
  const isConnected = connection.status === 'connected';

  const onOutcome = useCallback((outcome: Outcome) => {
    const text = outcomeText(outcome, names);
    if (outcome.foul !== FOUL_NONE) sound('foul'); else if (outcome.queen & 3) sound('queen');
    if (text) setToast(current => ({ id: (current?.id ?? 0) + 1, ...text }));
  }, [names[0], sound]); // eslint-disable-line react-hooks/exhaustive-deps
  const onState = useCallback((state: TableState) => {
    setTable(previous => {
      if (state.winner !== null && previous && previous.winner === null) window.setTimeout(() => sound(state.winner === me ? 'win' : 'lose'), 300);
      else if (previous && state.turn !== previous.turn && state.turn === me && state.winner === null) sound('turn');
      return state;
    });
  }, [me, sound]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const boardWinner = table?.winner ?? null;
  const settled = !!table && table.applied === match.moves.length && !table.animating;
  const result = isOver && (match.ending || settled) ? onlineResult(match, myColor, boardWinner === null ? null : { winner: CARROM_COLORS[boardWinner], reason: 'board cleared' }) : null;
  const myTurn = hasJoinedGame && !isOver && !!table && table.turn === me && settled;
  let status: string;
  if (!hasJoinedGame) status = 'Joining the room…';
  else if (match.ending) status = 'Game over';
  else if (boardWinner !== null && settled) status = boardWinner === me ? 'You win! 🎉' : 'Your friend wins';
  else if (!table || !settled) status = '…';
  else if (myTurn) status = `Your turn — you play ${me === 0 ? 'White' : 'Black'}`;
  else status = isConnected ? 'Friend is aiming…' : 'Waiting for your friend…';

  return (
    <div className="game-shell carrom carrom--online" data-testid="carrom-screen" data-mode="online" data-my-color={hasJoinedGame ? myColor : ''} data-game-number={match.gameNumber}
      data-over={isOver} data-moves={match.moves.length}>
      <div className="game-shell__header">
        <span className="carrom-mode">Online · you are {me === 0 ? 'White' : 'Black'}</span>
        {mute}
        <button type="button" className="game-button" onClick={onLeave} data-testid="online-leave">Leave room</button>
      </div>
      <RoomPanel gameId="carrom" gameName="Carrom" role={role} roomCode={roomCode} connection={connection} isRestored={isRestored} />
      <MatchBanner result={result} drawOffer={null} rematchOffer={match.rematchOfferFrom === null ? null : match.rematchOfferFrom === myColor ? 'me' : 'friend'}
        notice={room.notice} actions={actions} swapText={`Next game you play ${me === 0 ? 'Black' : 'White'}.`} />
      {hasJoinedGame && (
        <div className="carrom-layout">
          <div className="carrom-side">
            {table && <ScoreCards state={table} names={names} />}
            <p className={`game-banner ${boardWinner === null && !match.ending ? 'game-banner--info' : (result?.outcome ?? 'win') === 'loss' ? 'game-banner--lose' : 'game-banner--win'}`} data-testid="carrom-status">{status}</p>
            {toast && <p key={toast.id} className={`carrom-toast carrom-toast--${toast.kind}`} data-testid="carrom-toast" role="status">{toast.text}</p>}
            {!isOver && (confirmResign ? (
              <div className="online-actions online-actions--confirm">
                <span>Really resign?</span>
                <button type="button" className="online-button online-button--small online-button--danger" onClick={() => { setConfirmResign(false); actions.resign(); }} data-testid="online-confirm-resign">Yes, resign</button>
                <button type="button" className="online-button online-button--small" onClick={() => setConfirmResign(false)}>No</button>
              </div>
            ) : <div className="online-actions"><button type="button" className="online-button online-button--small" onClick={() => setConfirmResign(true)} data-testid="online-resign">🏳 Resign</button></div>)}
          </div>
          <CarromTable key={match.gameNumber} shots={match.moves} controllable={!isOver && isConnected ? [me] : []} flipped={me === 1}
            onShoot={text => { unlockAudio(); actions.playMove(text); }} onState={onState} onOutcome={onOutcome} sound={sound} click={click} />
        </div>
      )}
      {!hasJoinedGame && <RulesCard />}
    </div>
  );
}
