/**
 * The whole app around a turn-based dice game (Ludo, Snakes & Ladders): menu, local setup, online lobby, the table
 * (board + players + log + menu), finish card and the "removed / full / left" screens. The game supplies its board,
 * rules card, logo, colours and engine through a TurnGameUi (see GameContext).
 */
import { type ComponentType, createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MuteButton, unlockAudio, useSharedMute } from '../../sharedSound';
import { createRoomCode, normalizeRoomCode, roomCodeFromHash, roomHash, roomLink } from '../room';
import { createRoomNetwork, type RoomNetworkStatus } from '../roomNetwork';
import { TurnAuthority } from './authority';
import type { DiceClock } from './Dice';
import { cleanName, createClientId, MAX_PLAYERS, NAME_MAX_LENGTH, type RoomEvent, type RoomPlayer, type RoomState } from './protocol';
import { TurnRoom, type RoomView, type SavedRoom } from './room';
import { createTurnSaveSlot, type SavedTurnGame, turnStorage } from './save';
import { MAX_STRIKES, placeText, type TurnEngine, type TurnGameSpec, TurnPhase as EnginePhase, type TurnView } from './spec';
import { playTurnSound, type TurnSound } from './sounds';
import '../../shared.css';
import '../online.css';
import './turnRoom.css';

export const DEFAULT_TURN_SECONDS = 20;

/** What the board component gets from the table. */
export interface TurnBoardProps<View extends TurnView = TurnView> {
  view: View;
  players: RoomPlayer[];
  /** Quarter turns so the viewer's own seat is at the bottom (online); 0 locally. */
  rotation: number;
  canAct: boolean;
  hostId: string;
  myId: string | null;
  clock: DiceClock | null;
  variant: number;
  onRoll(): void;
  onMove(token: number): void;
  sound(kind: TurnSound, step?: number): void;
}

export interface TurnGameUi<View extends TurnView = TurnView> {
  spec: TurnGameSpec<View>;
  title: string;
  /** Root class (game-specific styles) and the prefix of test ids / test URL params (e.g. "ludo" → ?ludoTest, ludo-dice). */
  className: string;
  testPrefix: string;
  logo: ReactNode;
  tagline: string;
  seatColors: readonly string[];
  /** Default local setup: what each seat is (human, computer or off). */
  defaultSeats: readonly ('human' | 'computer' | 'off')[];
  loadEngine(): Promise<unknown>;
  createEngine(): TurnEngine;
  Board: ComponentType<TurnBoardProps<View>>;
  /** Rules bullet points (the room/timer bullets are added for online games). */
  rules: ReactNode;
  /** Text above the board for the current turn (null: the default "X's turn — rolling"). */
  turnText?(view: View, current: RoomPlayer | undefined, isMine: boolean, isLocal: boolean): string | null;
  /** Variant picker (boards): shown in the local setup and the lobby. */
  variants?: { label: string; names: readonly string[]; Preview?: ComponentType<{ variant: number }>; storageKey: string };
}

const GameContext = createContext<TurnGameUi | null>(null);
const useGame = () => useContext(GameContext)!;
const useIds = () => useGame().testPrefix;

/** Loads the wasm engine, then runs the app. */
export function TurnGameScreen<View extends TurnView>({ game }: { game: TurnGameUi<View> }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { game.loadEngine().then(() => setReady(true), () => setLoadError(true)); }, [game]);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!ready) return <div className="game-shell" data-testid={`${game.testPrefix}-loading`}><p className="game-help">Loading…</p></div>;
  return <GameContext.Provider value={game as unknown as TurnGameUi}><TurnGameApp /></GameContext.Provider>;
}

const searchParams = () => new URLSearchParams(window.location.search);
/** Test-only: shorter turn clocks, e.g. ?ludoTurn=3 */
function turnSeconds(testPrefix: string): number {
  const value = Number(searchParams().get(`${testPrefix}Turn`));
  return Number.isFinite(value) && value >= 2 && value <= 60 ? Math.round(value) : DEFAULT_TURN_SECONDS;
}
const setHash = (hash: string) => { if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`); };

type Mode =
  | { kind: 'menu' }
  | { kind: 'setup' }
  | { kind: 'local'; seats: LocalSeat[] | null; variant: number; saved: RoomState | null }
  | { kind: 'online'; roomCode: string; startAsHost: boolean; saved: SavedRoom | null }
  | { kind: 'blocked'; roomCode: string };

interface LocalSeat { seat: number; name: string; isBot: boolean; }

function initialMode(saved: SavedTurnGame | null, readKickedRooms: () => string[]): Mode {
  const code = roomCodeFromHash(window.location.hash);
  if (code) {
    if (readKickedRooms().includes(code)) return { kind: 'blocked', roomCode: code };
    if (saved?.kind === 'online' && saved.room.roomCode === code) return { kind: 'online', roomCode: code, startAsHost: saved.room.role === 'host', saved: saved.room };
    return { kind: 'online', roomCode: code, startAsHost: false, saved: null };
  }
  if (saved?.kind === 'online') return { kind: 'online', roomCode: saved.room.roomCode, startAsHost: saved.room.role === 'host', saved: saved.room };
  return { kind: 'menu' };
}

function TurnGameApp() {
  const game = useGame();
  const GAME_ID = game.spec.gameId;
  const storage = useMemo(() => turnStorage(GAME_ID), [GAME_ID]);
  const { readKickedRooms, saveName } = storage;
  const slot = useMemo(() => createTurnSaveSlot(game.spec), [game]);
  const [saved, setSaved] = useState(() => slot.load());
  const [mode, setMode] = useState<Mode>(() => initialMode(saved, storage.readKickedRooms));
  const [name, setName] = useState(storage.readName);
  const ids = game.testPrefix;
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: TurnSound, step?: number) => playTurnSound(kind, isMutedRef.current, step), [isMutedRef]);

  useEffect(() => {
    if (mode.kind === 'online') setHash(roomHash(GAME_ID, mode.roomCode));
    else if (mode.kind !== 'blocked') setHash(`#/play/${GAME_ID}`);
  }, [mode]);
  // opening another room link while this page is open
  useEffect(() => {
    const onHash = () => {
      const code = roomCodeFromHash(window.location.hash);
      if (!code) { if (mode.kind === 'online' || mode.kind === 'blocked') setMode({ kind: 'menu' }); return; }
      if (mode.kind === 'online' && mode.roomCode === code) return;
      const stored = slot.load();
      setMode(readKickedRooms().includes(code) ? { kind: 'blocked', roomCode: code }
        : { kind: 'online', roomCode: code, startAsHost: stored?.kind === 'online' && stored.room.roomCode === code && stored.room.role === 'host', saved: stored?.kind === 'online' && stored.room.roomCode === code ? stored.room : null });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [mode, slot, readKickedRooms]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => { if ((event.key === 'm' || event.key === 'M') && !(event.target instanceof HTMLInputElement)) toggleMute(); };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [toggleMute]);
  useEffect(() => () => slot.flush(), [slot]);

  const changeName = (value: string) => { setName(value); saveName(value); };
  const toMenu = () => { setSaved(slot.load()); setMode({ kind: 'menu' }); };
  const myName = cleanName(name, 'Player');

  const mute = <MuteButton isMuted={isMuted} onToggle={toggleMute} />;
  switch (mode.kind) {
    case 'menu':
      return <Menu name={name} onName={changeName} mute={mute} savedLocal={saved?.kind === 'local' ? saved.state : null}
        onCreate={() => { unlockAudio(); setMode({ kind: 'online', roomCode: createRoomCode(), startAsHost: true, saved: null }); }}
        onJoin={code => { unlockAudio(); setMode(readKickedRooms().includes(code) ? { kind: 'blocked', roomCode: code } : { kind: 'online', roomCode: code, startAsHost: false, saved: null }); }}
        onLocal={() => setMode({ kind: 'setup' })}
        onContinue={state => setMode({ kind: 'local', seats: null, variant: state.variant, saved: state })} />;
    case 'setup':
      return <LocalSetup name={myName} mute={mute} onBack={toMenu} onStart={(seats, variant) => { unlockAudio(); slot.clear(); setMode({ kind: 'local', seats, variant, saved: null }); }} />;
    case 'local':
      return <LocalGame key={JSON.stringify(mode.seats)} seats={mode.seats} variant={mode.variant} saved={mode.saved} slot={slot} mute={mute} sound={sound} onMenu={toMenu}
        onSetup={() => setMode({ kind: 'setup' })} />;
    case 'online':
      return <OnlineGame key={mode.roomCode} storage={storage} mode={mode} name={myName} onName={changeName} slot={slot} mute={mute} sound={sound}
        onMenu={() => { setMode({ kind: 'menu' }); setSaved(slot.load()); }} />;
    case 'blocked':
      return <Ending title="You were removed from this room" text="The host removed you from this room, so this link can’t be used to join it again. Ask for a new room link."
        testId={`${ids}-ending-kicked`} onBack={() => { setHash(`#/play/${GAME_ID}`); setMode({ kind: 'menu' }); }} />;
  }
}

// ---------------------------------------------------------------- rules card
function RulesCard({ online = true }: { online?: boolean }) {
  const game = useGame();
  return (
    <section className="turn-rules" data-testid={`${game.testPrefix}-rules`}>
      <h2>How to play</h2>
      <ul>
        {game.rules}
        {online && <li><b>Turn timer</b>: {DEFAULT_TURN_SECONDS}s for each roll or move. If time runs out the game plays for you and you get a strike. Strikes add up for the whole game: on the {MAX_STRIKES}rd missed turn you’re out.</li>}
        {online && <li>Up to {MAX_PLAYERS} players per room. The host starts the game and can remove players. Anyone can leave; their pieces are taken off and the game goes on. If the host leaves, another player takes over the room.</li>}
      </ul>
    </section>
  );
}

function Logo() {
  return <>{useGame().logo}</>;
}

/** The variant (board) picker: buttons for whoever may choose, a label for everyone else. */
function VariantPicker({ value, onChange }: { value: number; onChange?(value: number): void }) {
  const game = useGame();
  const variants = game.variants;
  if (!variants) return null;
  const Preview = variants.Preview;
  return (
    <div className="turn-variants" data-testid={`${game.testPrefix}-variants`}>
      <h3>{variants.label}: <b data-testid={`${game.testPrefix}-variant-name`}>{variants.names[value]}</b></h3>
      {onChange ? (
        <ul className="turn-variants__list">
          {variants.names.map((variantName, index) => (
            <li key={variantName}>
              <button type="button" className={index === value ? 'is-selected' : ''} onClick={() => onChange(index)} aria-pressed={index === value} data-testid={`${game.testPrefix}-variant-${index}`}>
                {Preview && <Preview variant={index} />}
                <span>{variantName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : Preview && <div className="turn-variants__one"><Preview variant={value} /></div>}
    </div>
  );
}

function readFavouriteVariant(game: TurnGameUi): number {
  if (!game.variants) return 0;
  try {
    const value = Number(localStorage.getItem(game.variants.storageKey));
    return Number.isInteger(value) && value >= 0 && value < game.variants.names.length ? value : 0;
  } catch { return 0; }
}
function saveFavouriteVariant(game: TurnGameUi, value: number) {
  if (!game.variants) return;
  try { localStorage.setItem(game.variants.storageKey, String(value)); } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- menu
function Menu({ name, onName, mute, savedLocal, onCreate, onJoin, onLocal, onContinue }: {
  name: string; onName(name: string): void; mute: ReactNode; savedLocal: RoomState | null;
  onCreate(): void; onJoin(code: string): void; onLocal(): void; onContinue(state: RoomState): void;
}) {
  const game = useGame();
  const ids = game.testPrefix;
  const [code, setCode] = useState('');
  const typed = normalizeRoomCode(code);
  return (
    <div className={`game-shell turn-game ${game.className}`} data-testid={`${ids}-menu`}>
      <div className="turn-card turn-card--title">
        <div className="turn-card__top"><Logo />{mute}</div>
        <p className="turn-tagline">{game.tagline}</p>
        <label className="turn-field">Your name
          <input value={name} onChange={event => onName(event.target.value.slice(0, NAME_MAX_LENGTH))} maxLength={NAME_MAX_LENGTH} placeholder="Player" data-testid={`${ids}-name`} />
        </label>
        <div className="turn-menu__online">
          <button type="button" className="online-button online-button--primary" onClick={onCreate} data-testid={`${ids}-create`}>Create online room</button>
          <form className="online-join" onSubmit={event => { event.preventDefault(); if (typed) onJoin(typed); }}>
            <input value={code} onChange={event => setCode(event.target.value)} placeholder="Room code" maxLength={10} aria-label="Room code" data-testid={`${ids}-join-code`}
              autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            <button type="submit" className="online-button" disabled={!typed} data-testid={`${ids}-join`}>Join</button>
          </form>
        </div>
        <div className="turn-menu__local">
          <button type="button" className="online-button" onClick={onLocal} data-testid={`${ids}-local`}>Play on this device</button>
          {savedLocal && <button type="button" className="online-button" onClick={() => onContinue(savedLocal)} data-testid={`${ids}-continue`}>Continue local game</button>}
        </div>
      </div>
      <RulesCard />
    </div>
  );
}

// ---------------------------------------------------------------- local setup
type SeatChoice = 'human' | 'computer' | 'off';
function LocalSetup({ name, mute, onBack, onStart }: { name: string; mute: ReactNode; onBack(): void; onStart(seats: LocalSeat[], variant: number): void }) {
  const game = useGame();
  const ids = game.testPrefix;
  const SEAT_NAMES = game.spec.seatNames;
  const [variant, setVariant] = useState(() => readFavouriteVariant(game));
  const [choices, setChoices] = useState<SeatChoice[]>([...game.defaultSeats]);
  const [names, setNames] = useState<string[]>([name, 'Computer', 'Player 2', 'Computer']);
  const active = choices.filter(choice => choice !== 'off').length;
  const order = [0, 1, 2, 3];
  return (
    <div className={`game-shell turn-game ${game.className}`} data-testid={`${ids}-setup`}>
      <div className="turn-card">
        <div className="turn-card__top"><h2>Play on this device</h2>{mute}</div>
        <p className="game-help">Pass the device around. Pick 2–4 players; any seat can be a computer player.</p>
        <ul className="turn-setup">
          {order.map(seat => (
            <li key={seat} style={{ ['--seat' as string]: game.seatColors[seat] }}>
              <span className="turn-chip" />
              <input value={choices[seat] === 'computer' ? `Computer (${SEAT_NAMES[seat]})` : names[seat]} disabled={choices[seat] !== 'human'} maxLength={NAME_MAX_LENGTH}
                onChange={event => setNames(list => list.map((value, index) => index === seat ? event.target.value : value))} aria-label={`${SEAT_NAMES[seat]} name`} />
              <span className="game-segments">
                {(['human', 'computer', 'off'] as const).map(choice => (
                  <button key={choice} type="button" className={choices[seat] === choice ? 'is-selected' : ''} data-testid={`${ids}-seat-${seat}-${choice}`}
                    onClick={() => setChoices(list => list.map((value, index) => index === seat ? choice : value))}>{choice === 'human' ? 'Player' : choice === 'computer' ? 'CPU' : 'Off'}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <VariantPicker value={variant} onChange={value => { setVariant(value); saveFavouriteVariant(game, value); }} />
        <div className="game-actions">
          <button type="button" className="online-button" onClick={onBack}>Back</button>
          <button type="button" className="online-button online-button--primary" disabled={active < 2} data-testid={`${ids}-local-start`}
            onClick={() => onStart(order.filter(seat => choices[seat] !== 'off').map(seat => ({ seat, isBot: choices[seat] === 'computer', name: choices[seat] === 'computer' ? `CPU ${SEAT_NAMES[seat]}` : cleanName(names[seat], SEAT_NAMES[seat]) })), variant)}>
            Start ({active} players)
          </button>
        </div>
      </div>
      <RulesCard online={false} />
    </div>
  );
}

// ---------------------------------------------------------------- local game
function LocalGame({ seats, variant, saved, slot, mute, sound, onMenu, onSetup }: {
  seats: LocalSeat[] | null; variant: number; saved: RoomState | null; slot: ReturnType<typeof createTurnSaveSlot>; mute: ReactNode; sound(kind: TurnSound): void; onMenu(): void; onSetup(): void;
}) {
  const game = useGame();
  const { spec, createEngine } = game;
  const options = useMemo(() => ({ now: () => Date.now(), random: Math.random, turnSeconds: 0, variant }), [variant]);
  const authorityRef = useRef<TurnAuthority | null>(null);
  if (!authorityRef.current) {
    authorityRef.current = saved ? new TurnAuthority(spec, createEngine(), saved, options) : TurnAuthority.createLocal(spec, createEngine(), seats ?? [], options);
  }
  const authority = authorityRef.current;
  const [state, setState] = useState(() => authority.toState());
  const [paused, setPaused] = useState(false);
  const publish = useCallback(() => {
    const next = authority.toState();
    setState(next);
    if (next.phase === 'playing') slot.saveThrottled({ kind: 'local', state: next }); else slot.clear();
  }, [authority, slot]);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => { if (authority.tick()) publish(); }, 200);
    return () => window.clearInterval(timer);
  }, [authority, paused, publish]);
  const currentId = () => { const view = authority.view; return view ? authority.state.players.find(player => player.seat === view.current)?.clientId ?? '' : ''; };
  const rematch = () => {
    const players = authority.state.players.filter(player => player.status !== 'left');
    authorityRef.current = TurnAuthority.createLocal(spec, createEngine(), players.map(player => ({ seat: player.seat, name: player.name, isBot: player.isBot })), { ...options, variant: authority.state.variant });
    const next = authorityRef.current.toState();
    setState(next);
    slot.saveThrottled({ kind: 'local', state: next });
    sound('start');
  };
  void onSetup;
  return (
    <Table state={state} receivedAt={0} myId={null} isLocal mute={mute} sound={sound} paused={paused} setPaused={setPaused}
      onRoll={() => { if (authority.roll(currentId())) publish(); }}
      onMove={token => { if (authority.move(currentId(), token)) publish(); }}
      onLeave={() => { slot.clear(); onMenu(); }}
      onRematch={rematch} onMenu={onMenu} />
  );
}

// ---------------------------------------------------------------- online game
function OnlineGame({ storage, mode, name, onName, slot, mute, sound, onMenu }: {
  storage: ReturnType<typeof turnStorage>; mode: Extract<Mode, { kind: 'online' }>; name: string; onName(name: string): void; slot: ReturnType<typeof createTurnSaveSlot>;
  mute: ReactNode; sound(kind: TurnSound): void; onMenu(): void;
}) {
  const game = useGame();
  const ids = game.testPrefix;
  const [view, setView] = useState<RoomView | null>(null);
  const roomRef = useRef<TurnRoom | null>(null);
  useEffect(() => {
    const myId = mode.saved?.clientId ?? storage.sessionClientId(createClientId);
    const room = new TurnRoom({
      spec: game.spec as TurnGameSpec, roomCode: mode.roomCode, myId, myName: mode.saved?.name ?? name, startAsHost: mode.startAsHost, savedState: mode.saved?.state ?? null,
      network: createRoomNetwork(game.spec.gameId, mode.roomCode), createEngine: game.createEngine,
      authority: { now: () => Date.now(), random: Math.random, turnSeconds: turnSeconds(game.testPrefix), variant: readFavouriteVariant(game) },
      timers: { setTimeout: (action, ms) => window.setTimeout(action, ms), clearTimeout: handle => window.clearTimeout(handle as number), setInterval: (action, ms) => window.setInterval(action, ms), clearInterval: handle => window.clearInterval(handle as number) },
      onView: next => setView(next),
      onSave: data => { if (data) slot.saveThrottled({ kind: 'online', room: data }); else slot.clear(); },
    });
    roomRef.current = room;
    room.start();
    const flush = () => slot.flush();
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); slot.flush(); room.stop(); roomRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const room = roomRef.current;
  const state = view?.state ?? null;
  const me = state?.players.find(player => player.clientId === view?.myId);
  const ending = view?.ending ?? (me?.status === 'kicked' ? { kind: 'kicked' as const } : null);
  useEffect(() => { if (ending?.kind === 'kicked') { storage.rememberKicked(mode.roomCode); slot.clear(); } }, [ending?.kind, mode.roomCode, slot, storage]);
  useTestHook(view, room);

  // join / leave sounds in the lobby
  const seatedCount = state?.players.filter(player => player.status === 'lobby').length ?? 0;
  const lastCount = useRef(seatedCount);
  useEffect(() => {
    if (state?.phase === 'lobby' && lastCount.current !== seatedCount) sound(seatedCount > lastCount.current ? 'join' : 'leave');
    lastCount.current = seatedCount;
  }, [seatedCount, state?.phase, sound]);

  if (ending) {
    const text = ending.kind === 'kicked' ? { title: 'You were removed from this room', body: 'The host removed you from this room. You can’t rejoin it with this link — ask for a new room.' }
      : ending.kind === 'left' ? { title: 'You left the game', body: 'Your tokens were taken off the board and the game goes on without you.' }
        : ending.reason === 'full' ? { title: 'This room is full', body: `A room holds ${MAX_PLAYERS} players. Ask the host for a new room.` }
          : ending.reason === 'in-progress' ? { title: 'That game has already started', body: 'You can join this room when the next game starts, or create your own room.' }
            : ending.reason === 'left' ? { title: 'You left this game', body: 'You can join again when the next game starts.' }
              : ending.reason === 'version' ? { title: 'Different app versions', body: 'Everyone in the room should reload the page to get the same version.' }
                : { title: 'You were removed from this room', body: 'You can’t rejoin it with this link.' };
    return <Ending title={text.title} text={text.body} onBack={onMenu} testId={`${ids}-ending-${ending.kind}`} />;
  }
  if (!view || !state || !room) return <Connecting roomCode={mode.roomCode} network={view?.network ?? 'starting'} role={view?.role ?? 'guest'} onBack={() => { room?.leave(); onMenu(); }} />;
  if (state.phase === 'lobby') return <Lobby view={view} room={room} name={name} onName={value => { onName(value); room.rename(cleanName(value, 'Player')); }} mute={mute} onLeft={onMenu} />;
  return (
    <Table state={state} receivedAt={view.receivedAt} myId={view.myId} isLocal={false} mute={mute} sound={sound} network={view.network} role={view.role}
      onRoll={() => room.roll()} onMove={token => room.move(token)} onLeave={() => room.leave()} onRematch={() => room.rematch()} onMenu={onMenu}
      onKick={view.role === 'host' ? clientId => room.kick(clientId) : undefined} />
  );
}

function useTestHook(view: RoomView | null, room: TurnRoom | null) {
  const game = useGame();
  useEffect(() => {
    if (!searchParams().has(`${game.testPrefix}Test`)) return;
    (window as unknown as Record<string, unknown>)[`__${game.testPrefix}Test`] = {
      view: () => view && { ...view, game: game.spec.decode(view.state?.snapshot) },
      roll: () => room?.roll(),
      move: (token: number) => room?.move(token),
    };
  }, [view, room, game]);
}

function Connecting({ roomCode, network, role, onBack }: { roomCode: string; network: RoomNetworkStatus; role: string; onBack(): void }) {
  const game = useGame();
  const ids = game.testPrefix;
  const text = network === 'server' ? 'Can’t reach the matchmaking server — retrying…' : network === 'connecting' ? 'Looking for the room…' : network === 'starting' ? 'Connecting to server…' : role === 'host' ? 'Opening the room…' : 'Joining…';
  return (
    <div className={`game-shell turn-game ${game.className}`} data-testid={`${ids}-connecting`}>
      <div className="turn-card">
        <Logo />
        <p className="turn-room-code">Room <b>{roomCode}</b></p>
        <p className="turn-status" data-testid={`${ids}-network`} data-status={network}><span className="turn-spinner" /> {text}</p>
        <p className="game-help">If the room was just created, it can take a few seconds. Links work while the host (or another player) has the room open.</p>
        <button type="button" className="online-button" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function Ending({ title, text, onBack, testId }: { title: string; text: string; onBack(): void; testId?: string }) {
  const game = useGame();
  const ids = game.testPrefix;
  return (
    <div className={`game-shell turn-game ${game.className}`} data-testid={testId ?? `${ids}-ending`}>
      <div className="turn-card turn-card--ending">
        <Logo />
        <h2>{title}</h2>
        <p>{text}</p>
        <button type="button" className="online-button online-button--primary" onClick={onBack} data-testid={`${ids}-back`}>Back to {game.title}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lobby
function Lobby({ view, room, name, onName, mute, onLeft }: { view: RoomView; room: TurnRoom; name: string; onName(name: string): void; mute: ReactNode; onLeft(): void }) {
  const game = useGame();
  const ids = game.testPrefix;
  const GAME_ID = game.spec.gameId;
  const SEAT_COLORS = game.seatColors;
  const state = view.state!;
  const isHost = view.role === 'host';
  const seated = state.players.filter(player => player.status === 'lobby');
  const link = roomLink(GAME_ID, state.roomCode);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied('copied'); } catch {
      linkInput.current?.select();
      try { setCopied(document.execCommand('copy') ? 'copied' : 'failed'); } catch { setCopied('failed'); }
    }
    window.setTimeout(() => setCopied('idle'), 2000);
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <div className={`game-shell turn-game ${game.className}`} data-testid={`${ids}-lobby`} data-role={view.role}>
      <div className="turn-card turn-lobby">
        <div className="turn-card__top"><Logo />{mute}</div>
        <p className="turn-room-code">Room <b data-testid={`${ids}-room-code`}>{state.roomCode}</b></p>
        <div className="turn-share">
          <input ref={linkInput} readOnly value={link} aria-label="Room link" data-testid={`${ids}-link`} onFocus={event => event.target.select()} />
          <button type="button" className="online-button" onClick={copy} data-testid={`${ids}-copy`}>{copied === 'copied' ? 'Copied!' : copied === 'failed' ? 'Copy failed' : 'Copy link'}</button>
          {canShare && <button type="button" className="online-button" onClick={() => navigator.share({ title: `Play ${game.title} with me`, text: `Join my ${game.title} room ${state.roomCode}`, url: link }).catch(() => undefined)}>Share</button>}
        </div>
        <NetworkLine network={view.network} role={view.role} />
        <h3>Players ({seated.length}/{MAX_PLAYERS})</h3>
        <ul className="turn-players" data-testid={`${ids}-lobby-players`}>
          {[0, 1, 2, 3].map(index => {
            const player = seated[index];
            if (!player) return <li key={`empty-${index}`} className="is-empty"><span className="turn-chip" /> Waiting for a player…</li>;
            return (
              <li key={player.clientId} style={{ ['--seat' as string]: SEAT_COLORS[player.seat] }} data-testid={`${ids}-lobby-player`} data-name={player.name}>
                <span className="turn-chip" />
                <span className="turn-players__name">{player.name}</span>
                {player.clientId === state.hostId && <span className="turn-tag turn-tag--host">♛ Host</span>}
                {player.clientId === view.myId && <span className="turn-tag">You</span>}
                {!player.connected && <span className="turn-tag turn-tag--warn">Reconnecting…</span>}
                {isHost && player.clientId !== view.myId && <button type="button" className="turn-kick" onClick={() => room.kick(player.clientId)} data-testid={`${ids}-kick-${player.name}`} aria-label={`Remove ${player.name}`}>Remove</button>}
              </li>
            );
          })}
        </ul>
        <VariantPicker value={state.variant} onChange={isHost ? value => { room.setVariant(value); saveFavouriteVariant(game, value); } : undefined} />
        <label className="turn-field">Your name
          <input value={name} onChange={event => onName(event.target.value.slice(0, NAME_MAX_LENGTH))} maxLength={NAME_MAX_LENGTH} data-testid={`${ids}-lobby-name`} />
        </label>
        <div className="game-actions">
          <button type="button" className="online-button" onClick={() => setConfirmLeave(true)} data-testid={`${ids}-leave`}>Leave room</button>
          {isHost
            ? <button type="button" className="online-button online-button--primary" disabled={seated.length < 2} onClick={() => room.startGame()} data-testid={`${ids}-start`}>
              {seated.length < 2 ? 'Waiting for players…' : `Start game (${seated.length} players)`}</button>
            : <p className="turn-status">Waiting for the host to start…</p>}
        </div>
      </div>
      <RulesCard />
      {confirmLeave && <Confirm title="Leave the room?" text={isHost ? 'Another player will become the host.' : 'You can join again with the link while the game hasn’t started.'}
        yes="Leave" onYes={() => { room.leave(); onLeft(); }} onNo={() => setConfirmLeave(false)} />}
    </div>
  );
}

function NetworkLine({ network, role }: { network: RoomNetworkStatus; role: 'host' | 'guest' }) {
  const ids = useIds();
  const text = role === 'host'
    ? (network === 'server' ? 'Can’t reach the server — retrying…' : 'Room open — share the link')
    : network === 'connected' ? 'Connected to the host' : network === 'host-lost' ? 'Host disconnected — reconnecting…' : network === 'server' ? 'Can’t reach the server — retrying…' : 'Connecting to the host…';
  const isOk = role === 'host' ? network !== 'server' : network === 'connected';
  return <p className={`turn-status${isOk ? ' is-ok' : ' is-warn'}`} data-testid={`${ids}-network`} data-status={network}>{!isOk && <span className="turn-spinner" />}{text}</p>;
}

function Confirm({ title, text, yes, onYes, onNo }: { title: string; text: string; yes: string; onYes(): void; onNo(): void }) {
  const ids = useIds();
  return (
    <div className="turn-modal" role="dialog" aria-modal="true" aria-label={title} data-testid={`${ids}-confirm`} onClick={onNo}>
      <div className="turn-modal__card" onClick={event => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="game-actions">
          <button type="button" className="online-button" onClick={onNo} data-testid={`${ids}-confirm-no`}>Stay</button>
          <button type="button" className="online-button online-button--danger" onClick={onYes} data-testid={`${ids}-confirm-yes`}>{yes}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the table (board + players + menu)
interface TableProps {
  state: RoomState;
  receivedAt: number;
  myId: string | null;
  isLocal: boolean;
  mute: ReactNode;
  sound(kind: TurnSound, step?: number): void;
  network?: RoomNetworkStatus;
  role?: 'host' | 'guest';
  paused?: boolean;
  setPaused?(paused: boolean): void;
  onRoll(): void;
  onMove(token: number): void;
  onLeave(): void;
  onRematch(): void;
  onMenu(): void;
  onKick?(clientId: string): void;
}

const STATUS_TEXT: Record<RoomPlayer['status'], string> = { lobby: 'Ready', playing: 'Playing', finished: 'Finished', left: 'Left', kicked: 'Removed', forfeited: 'Out (3 missed turns)' };

function Table({ state, receivedAt, myId, isLocal, mute, sound, network, role, paused = false, setPaused, onRoll, onMove, onLeave, onRematch, onMenu, onKick }: TableProps) {
  const game = useGame();
  const ids = game.testPrefix;
  const Board = game.Board;
  const SEAT_COLORS = game.seatColors;
  const view = useMemo(() => game.spec.decode(state.snapshot), [state.snapshot, game]);
  const [menuOpen, setMenuOpenState] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickTarget, setKickTarget] = useState<RoomPlayer | null>(null);
  const [hideFinish, setHideFinish] = useState(false);
  const setMenuOpen = (open: boolean) => { setMenuOpenState(open); setPaused?.(open); };
  const me = state.players.find(player => player.clientId === myId);
  const current = view ? state.players.find(player => player.seat === view.current && player.status === 'playing') : undefined;
  const isMyTurn = !!current && (isLocal ? !current.isBot : current.clientId === myId);
  const canAct = state.phase === 'playing' && isMyTurn && !paused;
  const rotation = !isLocal && me ? me.seat : 0;
  const clock = state.clock ? { ...state.clock, remainingMs: Math.max(0, state.clock.remainingMs - (receivedAt ? Math.max(0, Date.now() - receivedAt) : 0)) } : null;

  // keyboard: Space/Enter roll, 1–4 move
  const latest = useRef({ view, canAct, onRoll, onMove });
  latest.current = { view, canAct, onRoll, onMove };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const { view: game, canAct: allowed } = latest.current;
      if (!game || !allowed || event.target instanceof HTMLInputElement) return;
      if ((event.key === ' ' || event.key === 'Enter') && game.phase === EnginePhase.AwaitRoll) { event.preventDefault(); unlockAudio(); latest.current.onRoll(); }
      const token = Number(event.key) - 1;
      if (token >= 0 && token < 4 && game.phase === EnginePhase.AwaitMove) latest.current.onMove(token);
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);

  // sounds + toasts for what happened
  const [toasts, setToasts] = useState<RoomEvent[]>([]);
  const lastEvent = useRef<number | null>(null);
  const lastGame = useRef(state.gameNumber);
  useEffect(() => {
    const newest = state.events.length ? state.events[state.events.length - 1].id : 0;
    if (lastEvent.current === null || lastGame.current !== state.gameNumber) { lastEvent.current = newest; lastGame.current = state.gameNumber; if (state.phase === 'playing') sound('start'); return; }
    const fresh = state.events.filter(event => event.id > (lastEvent.current ?? 0));
    lastEvent.current = Math.max(newest, lastEvent.current);
    if (!fresh.length) return;
    for (const event of fresh) {
      if (event.kind === 'strike') sound('strike');
      else if (event.kind === 'forfeit') sound('forfeit');
      else if (event.kind === 'leave' || event.kind === 'kick') sound('leave');
      else if (event.kind === 'finish') sound('finish');
      else if (event.kind === 'six') sound('strike');
    }
    const shown = fresh.filter(event => event.kind !== 'info' && event.kind !== 'join' && event.kind !== 'home');
    if (!shown.length) return;
    setToasts(list => [...list, ...shown].slice(-3));
    const ids = new Set(shown.map(event => event.id));
    window.setTimeout(() => setToasts(list => list.filter(event => !ids.has(event.id))), 4200);
  }, [state.events, state.gameNumber, state.phase, sound]);
  // roll + six + my-turn sounds
  const lastRoll = useRef(view?.rollId ?? 0);
  useEffect(() => {
    if (!view || view.rollId === lastRoll.current) return;
    lastRoll.current = view.rollId;
    sound('roll');
    if (view.dice === 6) window.setTimeout(() => sound('six'), 450);
  }, [view, sound]);
  const turnSignature = view && state.phase === 'playing' ? `${view.current}-${isMyTurn}` : '';
  const lastTurn = useRef('');
  useEffect(() => {
    if (turnSignature && turnSignature !== lastTurn.current && isMyTurn && !isLocal) sound('turn');
    lastTurn.current = turnSignature;
  }, [turnSignature, isMyTurn, isLocal, sound]);
  // game over fanfare
  const wasOver = useRef(state.phase === 'finished');
  useEffect(() => {
    const over = state.phase === 'finished';
    if (over && !wasOver.current) { sound(view && me && view.places[me.seat] === 1 ? 'win' : 'finish'); setHideFinish(false); }
    wasOver.current = over;
  }, [state.phase, view, me, sound]);
  // last seconds tick on my turn
  useEffect(() => {
    if (!clock || !isMyTurn || isLocal) return;
    const timers: number[] = [];
    for (let second = 5; second >= 1; second--) {
      const at = clock.remainingMs - second * 1000;
      if (at > 0) timers.push(window.setTimeout(() => sound('tick'), at));
    }
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [clock?.key, isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return null;
  const currentName = current ? (current.clientId === myId && !isLocal ? 'Your' : `${current.name}’s`) : '';
  let turnText = '';
  if (state.phase === 'finished') turnText = 'Game over';
  else if (game.turnText?.(view, current, isMyTurn, isLocal)) turnText = game.turnText(view, current, isMyTurn, isLocal)!;
  else if (current) turnText = isMyTurn
    ? (view.phase === EnginePhase.AwaitRoll ? `${isLocal ? `${current.name}: ` : 'Your turn — '}roll the dice` : `${isLocal ? `${current.name}: ` : ''}pick a token to move ${view.dice}`)
    : `${currentName} turn — ${view.phase === EnginePhase.AwaitRoll ? 'rolling' : 'moving'}`;
  const ordered = [...state.players].sort((a, b) => a.seat - b.seat);
  const isHost = role === 'host';
  const hostLost = !isLocal && role === 'guest' && network !== 'connected';

  return (
    <div className={`game-shell turn-game turn-game--table ${game.className}`} data-testid={`${ids}-game`} data-phase={state.phase} data-my-turn={isMyTurn}>
      <div className="turn-table">
        <div className="turn-table__main">
          <div className="turn-turn" style={{ ['--seat' as string]: current ? SEAT_COLORS[current.seat] : 'var(--highlight)' }} data-testid={`${ids}-turn`} data-seat={view.current}>
            <span className="turn-chip" /><span>{turnText}</span>
          </div>
          <Board view={view} players={state.players} variant={state.variant} rotation={rotation} canAct={canAct} hostId={state.hostId} myId={myId} clock={state.phase === 'playing' ? clock : null}
            onRoll={() => { unlockAudio(); onRoll(); }} onMove={onMove} sound={sound} />
        </div>
        <aside className="turn-table__side">
          <div className="turn-actions">
            <button type="button" className="online-button" onClick={() => setMenuOpen(true)} data-testid={`${ids}-menu-button`}>☰ Menu</button>
            {mute}
            <button type="button" className="online-button" onClick={() => setConfirmLeave(true)} data-testid={`${ids}-leave`}>Leave</button>
          </div>
          {hostLost && <p className="turn-status is-warn" data-testid={`${ids}-host-lost`}><span className="turn-spinner" />Host disconnected — another player takes over in a few seconds…</p>}
          <ul className="turn-players turn-players--game" data-testid={`${ids}-players`}>
            {ordered.map(player => (
              <li key={player.clientId} style={{ ['--seat' as string]: SEAT_COLORS[player.seat] }} className={`${current?.clientId === player.clientId ? 'is-turn' : ''} is-${player.status}`}
                data-testid={`${ids}-player`} data-name={player.name} data-status={player.status}>
                <span className="turn-chip" />
                <span className="turn-players__name">{player.name}{player.clientId === myId ? ' (you)' : ''}</span>
                {player.clientId === state.hostId && !isLocal && <span className="turn-tag turn-tag--host" title="Host">♛</span>}
                {player.isBot && <span className="turn-tag">CPU</span>}
                {view.places[player.seat] > 0 && <span className="turn-tag turn-tag--place">{placeText(view.places[player.seat])}</span>}
                {view.strikes[player.seat] > 0 && <span className="turn-tag turn-tag--warn" data-testid={`${ids}-player-strikes-${player.seat}`}>⚠ {view.strikes[player.seat]}/{MAX_STRIKES}</span>}
                {!player.connected && !player.isBot && player.status === 'playing' && <span className="turn-tag turn-tag--warn">offline</span>}
                {player.status !== 'playing' && player.status !== 'finished' && <span className="turn-players__status">{STATUS_TEXT[player.status]}</span>}
                {onKick && isHost && player.clientId !== myId && (player.status === 'playing' || player.status === 'finished') &&
                  <button type="button" className="turn-kick" onClick={() => setKickTarget(player)} data-testid={`${ids}-kick-${player.name}`} aria-label={`Remove ${player.name}`}>Remove</button>}
              </li>
            ))}
          </ul>
          <ol className="turn-log" data-testid={`${ids}-log`} aria-label="Game log">
            {state.events.slice(-5).reverse().map(event => <li key={event.id} className={`is-${event.kind}`}>{event.text}</li>)}
          </ol>
        </aside>
      </div>
      <div className="turn-toasts" aria-live="polite" hidden={state.phase === 'finished'}>
        {toasts.map(event => <p key={event.id} className={`turn-toast is-${event.kind}`} data-testid={`${ids}-toast`}>{event.text}</p>)}
      </div>
      {state.phase === 'finished' && !hideFinish && (
        <FinishCard state={state} view={view} myId={myId} isLocal={isLocal} isHost={isHost} onRematch={onRematch} onMenu={isLocal ? onMenu : () => setConfirmLeave(true)} onHide={() => setHideFinish(true)} />
      )}
      {state.phase === 'finished' && hideFinish && <button type="button" className="online-button online-button--primary turn-show-results" onClick={() => setHideFinish(false)}>Show results</button>}
      {menuOpen && (
        <div className="turn-modal" role="dialog" aria-modal="true" aria-label="Menu" data-testid={`${ids}-pause`} onClick={() => setMenuOpen(false)}>
          <div className="turn-modal__card turn-modal__card--wide" onClick={event => event.stopPropagation()}>
            <h2>{isLocal ? 'Paused' : 'Menu'}</h2>
            {!isLocal && <p className="game-help">The game keeps going while this is open — your turn timer still runs.</p>}
            <RulesCard online={!isLocal} />
            <div className="game-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => setMenuOpen(false)} data-testid={`${ids}-resume`}>{isLocal ? 'Resume' : 'Back to the game'}</button>
              <button type="button" className="online-button" onClick={() => { setMenuOpen(false); setConfirmLeave(true); }}>{isLocal ? 'Quit game' : 'Leave game'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmLeave && (
        <Confirm title={isLocal ? 'Quit this game?' : 'Leave the game?'}
          text={isLocal ? 'The game will be lost.' : state.phase === 'playing' ? 'Your tokens are taken off the board and the game goes on without you. You can’t come back to this game.' : 'You’ll leave the room.'}
          yes={isLocal ? 'Quit' : 'Leave'} onYes={() => { setConfirmLeave(false); onLeave(); if (isLocal) return; }} onNo={() => setConfirmLeave(false)} />
      )}
      {kickTarget && (
        <Confirm title={`Remove ${kickTarget.name}?`} text="Their tokens are taken off the board and they can’t rejoin this room with the same link." yes="Remove"
          onYes={() => { onKick?.(kickTarget.clientId); setKickTarget(null); }} onNo={() => setKickTarget(null)} />
      )}
    </div>
  );
}

function FinishCard({ state, view, myId, isLocal, isHost, onRematch, onMenu, onHide }: {
  state: RoomState; view: TurnView; myId: string | null; isLocal: boolean; isHost: boolean; onRematch(): void; onMenu(): void; onHide(): void;
}) {
  const game = useGame();
  const ids = game.testPrefix;
  const SEAT_COLORS = game.seatColors;
  const placed = state.players.filter(player => view.places[player.seat] > 0).sort((a, b) => view.places[a.seat] - view.places[b.seat]);
  const others = state.players.filter(player => view.places[player.seat] === 0);
  const me = state.players.find(player => player.clientId === myId);
  const myPlace = me ? view.places[me.seat] : 0;
  const waiting = state.players.filter(player => player.connected && !player.isBot && player.status !== 'left' && player.status !== 'kicked' && player.wantsRematch);
  const medals = ['', '🥇', '🥈', '🥉', '4th'];
  return (
    <div className="turn-modal turn-modal--finish" role="dialog" aria-label="Game over" data-testid={`${ids}-finish`}>
      <div className="turn-modal__card turn-finish">
        <h2>{isLocal ? `${placed[0]?.name ?? ''} wins!` : myPlace === 1 ? 'You win! 🎉' : myPlace > 0 ? `You finished ${placeText(myPlace)}` : 'Game over'}</h2>
        <ol className="turn-finish__list">
          {placed.map(player => (
            <li key={player.clientId} style={{ ['--seat' as string]: SEAT_COLORS[player.seat] }} data-testid={`${ids}-finish-place`}>
              <span className="turn-finish__medal">{medals[view.places[player.seat]]}</span><span className="turn-chip" /><b>{player.name}</b><span>{placeText(view.places[player.seat])}</span>
            </li>
          ))}
          {others.map(player => (
            <li key={player.clientId} className="is-out" style={{ ['--seat' as string]: SEAT_COLORS[player.seat] }}>
              <span className="turn-finish__medal">—</span><span className="turn-chip" /><b>{player.name}</b><span>{STATUS_TEXT[player.status]}</span>
            </li>
          ))}
        </ol>
        <div className="game-actions">
          <button type="button" className="online-button online-button--primary" onClick={onRematch} data-testid={`${ids}-rematch`} disabled={!isLocal && !isHost && !!me?.wantsRematch}>
            {isLocal || isHost ? 'New game' : me?.wantsRematch ? 'Waiting for the others…' : 'New game'}
          </button>
          <button type="button" className="online-button" onClick={onHide}>View board</button>
          <button type="button" className="online-button" onClick={onMenu} data-testid={`${ids}-finish-leave`}>{isLocal ? 'Menu' : 'Leave room'}</button>
        </div>
        {!isLocal && <p className="game-help">{isHost ? 'New game starts right away for everyone still here.' : `New game starts when the host presses it, or when everyone asks${waiting.length ? ` (${waiting.length} asked)` : ''}.`}</p>}
      </div>
    </div>
  );
}
