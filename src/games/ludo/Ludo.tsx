import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import { createRoomCode, normalizeRoomCode, roomCodeFromHash, roomHash, roomLink } from '../online/room';
import { createRoomNetwork, type RoomNetworkStatus } from '../online/roomNetwork';
import { LudoAuthority } from './authority';
import { BoardView } from './BoardView';
import { decodeSnapshot, EnginePhase, Ludo, loadLudoEngine, MAX_STRIKES, NoMoveReason, placeText, SEATS } from './engine';
import { cleanName, createClientId, MAX_PLAYERS, NAME_MAX_LENGTH, type RoomEvent, type RoomPlayer, type RoomState } from './protocol';
import { LudoRoom, type RoomView, type SavedRoom } from './room';
import { createLudoSaveSlot, readKickedRooms, readName, rememberKicked, saveName, type SavedLudo, sessionClientId } from './save';
import { type LudoSound, playLudoSound } from './sounds';
import '../shared.css';
import '../online/online.css';
import './ludo.css';

const GAME_ID = 'ludo';
const DEFAULT_TURN_SECONDS = 20;

export default function LudoScreen() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadLudoEngine().then(() => setReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!ready) return <div className="game-shell" data-testid="ludo-loading"><p className="game-help">Loading…</p></div>;
  return <LudoApp />;
}

const createEngine = () => new Ludo((Math.random() * 0xffffffff) >>> 0);
const searchParams = () => new URLSearchParams(window.location.search);
/** Test-only: shorter turn clocks, e.g. ?ludoTurn=3 */
function turnSeconds(): number {
  const value = Number(searchParams().get('ludoTurn'));
  return Number.isFinite(value) && value >= 2 && value <= 60 ? Math.round(value) : DEFAULT_TURN_SECONDS;
}
const setHash = (hash: string) => { if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`); };

type Mode =
  | { kind: 'menu' }
  | { kind: 'setup' }
  | { kind: 'local'; seats: LocalSeat[] | null; saved: RoomState | null }
  | { kind: 'online'; roomCode: string; startAsHost: boolean; saved: SavedRoom | null }
  | { kind: 'blocked'; roomCode: string };

interface LocalSeat { seat: number; name: string; isBot: boolean; }

function initialMode(saved: SavedLudo | null): Mode {
  const code = roomCodeFromHash(window.location.hash);
  if (code) {
    if (readKickedRooms().includes(code)) return { kind: 'blocked', roomCode: code };
    if (saved?.kind === 'online' && saved.room.roomCode === code) return { kind: 'online', roomCode: code, startAsHost: saved.room.role === 'host', saved: saved.room };
    return { kind: 'online', roomCode: code, startAsHost: false, saved: null };
  }
  if (saved?.kind === 'online') return { kind: 'online', roomCode: saved.room.roomCode, startAsHost: saved.room.role === 'host', saved: saved.room };
  return { kind: 'menu' };
}

function LudoApp() {
  const slot = useMemo(createLudoSaveSlot, []);
  const [saved, setSaved] = useState(() => slot.load());
  const [mode, setMode] = useState<Mode>(() => initialMode(saved));
  const [name, setName] = useState(readName);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const sound = useCallback((kind: LudoSound, step?: number) => playLudoSound(kind, isMutedRef.current, step), [isMutedRef]);

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
  }, [mode, slot]);
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
        onContinue={state => setMode({ kind: 'local', seats: null, saved: state })} />;
    case 'setup':
      return <LocalSetup name={myName} mute={mute} onBack={toMenu} onStart={seats => { unlockAudio(); slot.clear(); setMode({ kind: 'local', seats, saved: null }); }} />;
    case 'local':
      return <LocalGame key={JSON.stringify(mode.seats)} seats={mode.seats} saved={mode.saved} slot={slot} mute={mute} sound={sound} onMenu={toMenu}
        onSetup={() => setMode({ kind: 'setup' })} />;
    case 'online':
      return <OnlineGame key={mode.roomCode} mode={mode} name={myName} onName={changeName} slot={slot} mute={mute} sound={sound}
        onMenu={() => { setMode({ kind: 'menu' }); setSaved(slot.load()); }} />;
    case 'blocked':
      return <Ending title="You were removed from this room" text="The host removed you from this room, so this link can’t be used to join it again. Ask for a new room link."
        testId="ludo-ending-kicked" onBack={() => { setHash(`#/play/${GAME_ID}`); setMode({ kind: 'menu' }); }} />;
  }
}

// ---------------------------------------------------------------- rules card
function RulesCard({ online = true }: { online?: boolean }) {
  return (
    <section className="ludo-rules" data-testid="ludo-rules">
      <h2>How to play</h2>
      <ul>
        <li><b>Roll</b>: tap the dice (or press <kbd>Space</kbd>). Then tap a glowing token (or press <kbd>1</kbd>–<kbd>4</kbd>).</li>
        <li>Roll a <b>6</b> to bring a token out. A 6 gives another roll — but three 6s in a row lose the turn.</li>
        <li>Land on an opponent to <b>capture</b> it: it goes back to its yard and you roll again. Tokens on ★ squares are safe.</li>
        <li>Go round the board, up your coloured column and into the centre with an <b>exact</b> roll. Getting a token home gives another roll.</li>
        <li>First to bring all 4 tokens home is 1st; play goes on until 2nd and 3rd are decided.</li>
        {online && <li><b>Turn timer</b>: {DEFAULT_TURN_SECONDS}s to roll and {DEFAULT_TURN_SECONDS}s to move. If time runs out the game plays for you and you get a strike. Strikes add up for the whole game: on the {MAX_STRIKES}rd missed turn you’re out.</li>}
        {online && <li>Up to {MAX_PLAYERS} players per room. The host starts the game and can remove players. Anyone can leave; their tokens are taken off and the game goes on. If the host leaves, another player takes over the room.</li>}
      </ul>
    </section>
  );
}

function Logo() {
  return <h1 className="ludo-logo" aria-label="Ludo">{['L', 'U', 'D', 'O'].map((letter, index) => <span key={letter} style={{ color: SEATS[[0, 1, 2, 3][index]].color }}>{letter}</span>)}</h1>;
}

// ---------------------------------------------------------------- menu
function Menu({ name, onName, mute, savedLocal, onCreate, onJoin, onLocal, onContinue }: {
  name: string; onName(name: string): void; mute: ReactNode; savedLocal: RoomState | null;
  onCreate(): void; onJoin(code: string): void; onLocal(): void; onContinue(state: RoomState): void;
}) {
  const [code, setCode] = useState('');
  const typed = normalizeRoomCode(code);
  return (
    <div className="game-shell ludo" data-testid="ludo-menu">
      <div className="ludo-card ludo-card--title">
        <div className="ludo-card__top"><Logo />{mute}</div>
        <p className="ludo-tagline">The classic race home for 2–4 players — online with friends or on one device.</p>
        <label className="ludo-field">Your name
          <input value={name} onChange={event => onName(event.target.value.slice(0, NAME_MAX_LENGTH))} maxLength={NAME_MAX_LENGTH} placeholder="Player" data-testid="ludo-name" />
        </label>
        <div className="ludo-menu__online">
          <button type="button" className="online-button online-button--primary" onClick={onCreate} data-testid="ludo-create">Create online room</button>
          <form className="online-join" onSubmit={event => { event.preventDefault(); if (typed) onJoin(typed); }}>
            <input value={code} onChange={event => setCode(event.target.value)} placeholder="Room code" maxLength={10} aria-label="Room code" data-testid="ludo-join-code"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            <button type="submit" className="online-button" disabled={!typed} data-testid="ludo-join">Join</button>
          </form>
        </div>
        <div className="ludo-menu__local">
          <button type="button" className="online-button" onClick={onLocal} data-testid="ludo-local">Play on this device</button>
          {savedLocal && <button type="button" className="online-button" onClick={() => onContinue(savedLocal)} data-testid="ludo-continue">Continue local game</button>}
        </div>
      </div>
      <RulesCard />
    </div>
  );
}

// ---------------------------------------------------------------- local setup
type SeatChoice = 'human' | 'computer' | 'off';
function LocalSetup({ name, mute, onBack, onStart }: { name: string; mute: ReactNode; onBack(): void; onStart(seats: LocalSeat[]): void }) {
  const [choices, setChoices] = useState<SeatChoice[]>(['human', 'computer', 'human', 'computer']);
  const [names, setNames] = useState<string[]>([name, 'Computer', 'Player 2', 'Computer']);
  const active = choices.filter(choice => choice !== 'off').length;
  const order = [0, 1, 2, 3];
  return (
    <div className="game-shell ludo" data-testid="ludo-setup">
      <div className="ludo-card">
        <div className="ludo-card__top"><h2>Play on this device</h2>{mute}</div>
        <p className="game-help">Pass the device around. Pick 2–4 players; any seat can be a computer player.</p>
        <ul className="ludo-setup">
          {order.map(seat => (
            <li key={seat} style={{ ['--seat' as string]: SEATS[seat].color }}>
              <span className="ludo-chip" />
              <input value={choices[seat] === 'computer' ? `Computer (${SEATS[seat].name})` : names[seat]} disabled={choices[seat] !== 'human'} maxLength={NAME_MAX_LENGTH}
                onChange={event => setNames(list => list.map((value, index) => index === seat ? event.target.value : value))} aria-label={`${SEATS[seat].name} name`} />
              <span className="game-segments">
                {(['human', 'computer', 'off'] as const).map(choice => (
                  <button key={choice} type="button" className={choices[seat] === choice ? 'is-selected' : ''} data-testid={`ludo-seat-${seat}-${choice}`}
                    onClick={() => setChoices(list => list.map((value, index) => index === seat ? choice : value))}>{choice === 'human' ? 'Player' : choice === 'computer' ? 'CPU' : 'Off'}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="game-actions">
          <button type="button" className="online-button" onClick={onBack}>Back</button>
          <button type="button" className="online-button online-button--primary" disabled={active < 2} data-testid="ludo-local-start"
            onClick={() => onStart(order.filter(seat => choices[seat] !== 'off').map(seat => ({ seat, isBot: choices[seat] === 'computer', name: choices[seat] === 'computer' ? `CPU ${SEATS[seat].name}` : cleanName(names[seat], SEATS[seat].name) })))}>
            Start ({active} players)
          </button>
        </div>
      </div>
      <RulesCard online={false} />
    </div>
  );
}

// ---------------------------------------------------------------- local game
function LocalGame({ seats, saved, slot, mute, sound, onMenu, onSetup }: {
  seats: LocalSeat[] | null; saved: RoomState | null; slot: ReturnType<typeof createLudoSaveSlot>; mute: ReactNode; sound(kind: LudoSound): void; onMenu(): void; onSetup(): void;
}) {
  const options = useMemo(() => ({ now: () => Date.now(), random: Math.random, turnSeconds: 0 }), []);
  const authorityRef = useRef<LudoAuthority | null>(null);
  if (!authorityRef.current) {
    authorityRef.current = saved ? new LudoAuthority(createEngine(), saved, options) : LudoAuthority.createLocal(createEngine(), seats ?? [], options);
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
    authorityRef.current = LudoAuthority.createLocal(createEngine(), players.map(player => ({ seat: player.seat, name: player.name, isBot: player.isBot })), options);
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
function OnlineGame({ mode, name, onName, slot, mute, sound, onMenu }: {
  mode: Extract<Mode, { kind: 'online' }>; name: string; onName(name: string): void; slot: ReturnType<typeof createLudoSaveSlot>;
  mute: ReactNode; sound(kind: LudoSound): void; onMenu(): void;
}) {
  const [view, setView] = useState<RoomView | null>(null);
  const roomRef = useRef<LudoRoom | null>(null);
  useEffect(() => {
    const myId = mode.saved?.clientId ?? sessionClientId(createClientId);
    const room = new LudoRoom({
      roomCode: mode.roomCode, myId, myName: mode.saved?.name ?? name, startAsHost: mode.startAsHost, savedState: mode.saved?.state ?? null,
      network: createRoomNetwork(GAME_ID, mode.roomCode), createEngine,
      authority: { now: () => Date.now(), random: Math.random, turnSeconds: turnSeconds() },
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
  useEffect(() => { if (ending?.kind === 'kicked') { rememberKicked(mode.roomCode); slot.clear(); } }, [ending?.kind, mode.roomCode, slot]);
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
    return <Ending title={text.title} text={text.body} onBack={onMenu} testId={`ludo-ending-${ending.kind}`} />;
  }
  if (!view || !state || !room) return <Connecting roomCode={mode.roomCode} network={view?.network ?? 'starting'} role={view?.role ?? 'guest'} onBack={() => { room?.leave(); onMenu(); }} />;
  if (state.phase === 'lobby') return <Lobby view={view} room={room} name={name} onName={value => { onName(value); room.rename(cleanName(value, 'Player')); }} mute={mute} onLeft={onMenu} />;
  return (
    <Table state={state} receivedAt={view.receivedAt} myId={view.myId} isLocal={false} mute={mute} sound={sound} network={view.network} role={view.role}
      onRoll={() => room.roll()} onMove={token => room.move(token)} onLeave={() => room.leave()} onRematch={() => room.rematch()} onMenu={onMenu}
      onKick={view.role === 'host' ? clientId => room.kick(clientId) : undefined} />
  );
}

function useTestHook(view: RoomView | null, room: LudoRoom | null) {
  useEffect(() => {
    if (!searchParams().has('ludoTest')) return;
    (window as unknown as { __ludoTest?: unknown }).__ludoTest = {
      view: () => view && { ...view, game: decodeSnapshot(view.state?.snapshot) },
      roll: () => room?.roll(),
      move: (token: number) => room?.move(token),
    };
  }, [view, room]);
}

function Connecting({ roomCode, network, role, onBack }: { roomCode: string; network: RoomNetworkStatus; role: string; onBack(): void }) {
  const text = network === 'server' ? 'Can’t reach the matchmaking server — retrying…' : network === 'connecting' ? 'Looking for the room…' : network === 'starting' ? 'Connecting to server…' : role === 'host' ? 'Opening the room…' : 'Joining…';
  return (
    <div className="game-shell ludo" data-testid="ludo-connecting">
      <div className="ludo-card">
        <Logo />
        <p className="ludo-room-code">Room <b>{roomCode}</b></p>
        <p className="ludo-status" data-testid="ludo-network" data-status={network}><span className="ludo-spinner" /> {text}</p>
        <p className="game-help">If the room was just created, it can take a few seconds. Links work while the host (or another player) has the room open.</p>
        <button type="button" className="online-button" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function Ending({ title, text, onBack, testId = 'ludo-ending' }: { title: string; text: string; onBack(): void; testId?: string }) {
  return (
    <div className="game-shell ludo" data-testid={testId}>
      <div className="ludo-card ludo-card--ending">
        <Logo />
        <h2>{title}</h2>
        <p>{text}</p>
        <button type="button" className="online-button online-button--primary" onClick={onBack} data-testid="ludo-back">Back to Ludo</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lobby
function Lobby({ view, room, name, onName, mute, onLeft }: { view: RoomView; room: LudoRoom; name: string; onName(name: string): void; mute: ReactNode; onLeft(): void }) {
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
    <div className="game-shell ludo" data-testid="ludo-lobby" data-role={view.role}>
      <div className="ludo-card ludo-lobby">
        <div className="ludo-card__top"><Logo />{mute}</div>
        <p className="ludo-room-code">Room <b data-testid="ludo-room-code">{state.roomCode}</b></p>
        <div className="ludo-share">
          <input ref={linkInput} readOnly value={link} aria-label="Room link" data-testid="ludo-link" onFocus={event => event.target.select()} />
          <button type="button" className="online-button" onClick={copy} data-testid="ludo-copy">{copied === 'copied' ? 'Copied!' : copied === 'failed' ? 'Copy failed' : 'Copy link'}</button>
          {canShare && <button type="button" className="online-button" onClick={() => navigator.share({ title: 'Play Ludo with me', text: `Join my Ludo room ${state.roomCode}`, url: link }).catch(() => undefined)}>Share</button>}
        </div>
        <NetworkLine network={view.network} role={view.role} />
        <h3>Players ({seated.length}/{MAX_PLAYERS})</h3>
        <ul className="ludo-players" data-testid="ludo-lobby-players">
          {[0, 1, 2, 3].map(index => {
            const player = seated[index];
            if (!player) return <li key={`empty-${index}`} className="is-empty"><span className="ludo-chip" /> Waiting for a player…</li>;
            return (
              <li key={player.clientId} style={{ ['--seat' as string]: SEATS[player.seat].color }} data-testid="ludo-lobby-player" data-name={player.name}>
                <span className="ludo-chip" />
                <span className="ludo-players__name">{player.name}</span>
                {player.clientId === state.hostId && <span className="ludo-tag ludo-tag--host">♛ Host</span>}
                {player.clientId === view.myId && <span className="ludo-tag">You</span>}
                {!player.connected && <span className="ludo-tag ludo-tag--warn">Reconnecting…</span>}
                {isHost && player.clientId !== view.myId && <button type="button" className="ludo-kick" onClick={() => room.kick(player.clientId)} data-testid={`ludo-kick-${player.name}`} aria-label={`Remove ${player.name}`}>Remove</button>}
              </li>
            );
          })}
        </ul>
        <label className="ludo-field">Your name
          <input value={name} onChange={event => onName(event.target.value.slice(0, NAME_MAX_LENGTH))} maxLength={NAME_MAX_LENGTH} data-testid="ludo-lobby-name" />
        </label>
        <div className="game-actions">
          <button type="button" className="online-button" onClick={() => setConfirmLeave(true)} data-testid="ludo-leave">Leave room</button>
          {isHost
            ? <button type="button" className="online-button online-button--primary" disabled={seated.length < 2} onClick={() => room.startGame()} data-testid="ludo-start">
              {seated.length < 2 ? 'Waiting for players…' : `Start game (${seated.length} players)`}</button>
            : <p className="ludo-status">Waiting for the host to start…</p>}
        </div>
      </div>
      <RulesCard />
      {confirmLeave && <Confirm title="Leave the room?" text={isHost ? 'Another player will become the host.' : 'You can join again with the link while the game hasn’t started.'}
        yes="Leave" onYes={() => { room.leave(); onLeft(); }} onNo={() => setConfirmLeave(false)} />}
    </div>
  );
}

function NetworkLine({ network, role }: { network: RoomNetworkStatus; role: 'host' | 'guest' }) {
  const text = role === 'host'
    ? (network === 'server' ? 'Can’t reach the server — retrying…' : 'Room open — share the link')
    : network === 'connected' ? 'Connected to the host' : network === 'host-lost' ? 'Host disconnected — reconnecting…' : network === 'server' ? 'Can’t reach the server — retrying…' : 'Connecting to the host…';
  const isOk = role === 'host' ? network !== 'server' : network === 'connected';
  return <p className={`ludo-status${isOk ? ' is-ok' : ' is-warn'}`} data-testid="ludo-network" data-status={network}>{!isOk && <span className="ludo-spinner" />}{text}</p>;
}

function Confirm({ title, text, yes, onYes, onNo }: { title: string; text: string; yes: string; onYes(): void; onNo(): void }) {
  return (
    <div className="ludo-modal" role="dialog" aria-modal="true" aria-label={title} data-testid="ludo-confirm" onClick={onNo}>
      <div className="ludo-modal__card" onClick={event => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="game-actions">
          <button type="button" className="online-button" onClick={onNo} data-testid="ludo-confirm-no">Stay</button>
          <button type="button" className="online-button online-button--danger" onClick={onYes} data-testid="ludo-confirm-yes">{yes}</button>
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
  sound(kind: LudoSound, step?: number): void;
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
  const view = useMemo(() => decodeSnapshot(state.snapshot), [state.snapshot]);
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
      if (token >= 0 && token < 4 && game.phase === EnginePhase.AwaitMove && game.legalMask & (1 << token)) latest.current.onMove(token);
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
  else if (view.phase === EnginePhase.NoMove) turnText = view.noMoveReason === NoMoveReason.ThreeSixes ? `Three 6s — ${current?.name ?? ''} loses the turn` : `${current?.name ?? ''} rolled ${view.dice} — no move`;
  else if (current) turnText = isMyTurn
    ? (view.phase === EnginePhase.AwaitRoll ? `${isLocal ? `${current.name}: ` : 'Your turn — '}roll the dice` : `${isLocal ? `${current.name}: ` : ''}pick a token to move ${view.dice}`)
    : `${currentName} turn — ${view.phase === EnginePhase.AwaitRoll ? 'rolling' : 'moving'}`;
  const ordered = [...state.players].sort((a, b) => a.seat - b.seat);
  const isHost = role === 'host';
  const hostLost = !isLocal && role === 'guest' && network !== 'connected';

  return (
    <div className="game-shell ludo ludo--table" data-testid="ludo-game" data-phase={state.phase} data-my-turn={isMyTurn}>
      <div className="ludo-table">
        <div className="ludo-table__main">
          <div className="ludo-turn" style={{ ['--seat' as string]: current ? SEATS[current.seat].color : 'var(--highlight)' }} data-testid="ludo-turn" data-seat={view.current}>
            <span className="ludo-chip" /><span>{turnText}</span>
          </div>
          <BoardView view={view} players={state.players} rotation={rotation} canAct={canAct} hostId={state.hostId} myId={myId} clock={state.phase === 'playing' ? clock : null}
            onRoll={() => { unlockAudio(); onRoll(); }} onMove={onMove} sound={sound} />
        </div>
        <aside className="ludo-table__side">
          <div className="ludo-actions">
            <button type="button" className="online-button" onClick={() => setMenuOpen(true)} data-testid="ludo-menu-button">☰ Menu</button>
            {mute}
            <button type="button" className="online-button" onClick={() => setConfirmLeave(true)} data-testid="ludo-leave">Leave</button>
          </div>
          {hostLost && <p className="ludo-status is-warn" data-testid="ludo-host-lost"><span className="ludo-spinner" />Host disconnected — another player takes over in a few seconds…</p>}
          <ul className="ludo-players ludo-players--game" data-testid="ludo-players">
            {ordered.map(player => (
              <li key={player.clientId} style={{ ['--seat' as string]: SEATS[player.seat].color }} className={`${current?.clientId === player.clientId ? 'is-turn' : ''} is-${player.status}`}
                data-testid="ludo-player" data-name={player.name} data-status={player.status}>
                <span className="ludo-chip" />
                <span className="ludo-players__name">{player.name}{player.clientId === myId ? ' (you)' : ''}</span>
                {player.clientId === state.hostId && !isLocal && <span className="ludo-tag ludo-tag--host" title="Host">♛</span>}
                {player.isBot && <span className="ludo-tag">CPU</span>}
                {view.places[player.seat] > 0 && <span className="ludo-tag ludo-tag--place">{placeText(view.places[player.seat])}</span>}
                {view.strikes[player.seat] > 0 && <span className="ludo-tag ludo-tag--warn" data-testid={`ludo-player-strikes-${player.seat}`}>⚠ {view.strikes[player.seat]}/{MAX_STRIKES}</span>}
                {!player.connected && !player.isBot && player.status === 'playing' && <span className="ludo-tag ludo-tag--warn">offline</span>}
                {player.status !== 'playing' && player.status !== 'finished' && <span className="ludo-players__status">{STATUS_TEXT[player.status]}</span>}
                {onKick && isHost && player.clientId !== myId && (player.status === 'playing' || player.status === 'finished') &&
                  <button type="button" className="ludo-kick" onClick={() => setKickTarget(player)} data-testid={`ludo-kick-${player.name}`} aria-label={`Remove ${player.name}`}>Remove</button>}
              </li>
            ))}
          </ul>
          <ol className="ludo-log" data-testid="ludo-log" aria-label="Game log">
            {state.events.slice(-5).reverse().map(event => <li key={event.id} className={`is-${event.kind}`}>{event.text}</li>)}
          </ol>
        </aside>
      </div>
      <div className="ludo-toasts" aria-live="polite" hidden={state.phase === 'finished'}>
        {toasts.map(event => <p key={event.id} className={`ludo-toast is-${event.kind}`} data-testid="ludo-toast">{event.text}</p>)}
      </div>
      {state.phase === 'finished' && !hideFinish && (
        <FinishCard state={state} view={view} myId={myId} isLocal={isLocal} isHost={isHost} onRematch={onRematch} onMenu={isLocal ? onMenu : () => setConfirmLeave(true)} onHide={() => setHideFinish(true)} />
      )}
      {state.phase === 'finished' && hideFinish && <button type="button" className="online-button online-button--primary ludo-show-results" onClick={() => setHideFinish(false)}>Show results</button>}
      {menuOpen && (
        <div className="ludo-modal" role="dialog" aria-modal="true" aria-label="Menu" data-testid="ludo-pause" onClick={() => setMenuOpen(false)}>
          <div className="ludo-modal__card ludo-modal__card--wide" onClick={event => event.stopPropagation()}>
            <h2>{isLocal ? 'Paused' : 'Menu'}</h2>
            {!isLocal && <p className="game-help">The game keeps going while this is open — your turn timer still runs.</p>}
            <RulesCard online={!isLocal} />
            <div className="game-actions">
              <button type="button" className="online-button online-button--primary" onClick={() => setMenuOpen(false)} data-testid="ludo-resume">{isLocal ? 'Resume' : 'Back to the game'}</button>
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
  state: RoomState; view: NonNullable<ReturnType<typeof decodeSnapshot>>; myId: string | null; isLocal: boolean; isHost: boolean; onRematch(): void; onMenu(): void; onHide(): void;
}) {
  const placed = state.players.filter(player => view.places[player.seat] > 0).sort((a, b) => view.places[a.seat] - view.places[b.seat]);
  const others = state.players.filter(player => view.places[player.seat] === 0);
  const me = state.players.find(player => player.clientId === myId);
  const myPlace = me ? view.places[me.seat] : 0;
  const waiting = state.players.filter(player => player.connected && !player.isBot && player.status !== 'left' && player.status !== 'kicked' && player.wantsRematch);
  const medals = ['', '🥇', '🥈', '🥉', '4th'];
  return (
    <div className="ludo-modal ludo-modal--finish" role="dialog" aria-label="Game over" data-testid="ludo-finish">
      <div className="ludo-modal__card ludo-finish">
        <h2>{isLocal ? `${placed[0]?.name ?? ''} wins!` : myPlace === 1 ? 'You win! 🎉' : myPlace > 0 ? `You finished ${placeText(myPlace)}` : 'Game over'}</h2>
        <ol className="ludo-finish__list">
          {placed.map(player => (
            <li key={player.clientId} style={{ ['--seat' as string]: SEATS[player.seat].color }} data-testid="ludo-finish-place">
              <span className="ludo-finish__medal">{medals[view.places[player.seat]]}</span><span className="ludo-chip" /><b>{player.name}</b><span>{placeText(view.places[player.seat])}</span>
            </li>
          ))}
          {others.map(player => (
            <li key={player.clientId} className="is-out" style={{ ['--seat' as string]: SEATS[player.seat].color }}>
              <span className="ludo-finish__medal">—</span><span className="ludo-chip" /><b>{player.name}</b><span>{STATUS_TEXT[player.status]}</span>
            </li>
          ))}
        </ol>
        <div className="game-actions">
          <button type="button" className="online-button online-button--primary" onClick={onRematch} data-testid="ludo-rematch" disabled={!isLocal && !isHost && !!me?.wantsRematch}>
            {isLocal || isHost ? 'New game' : me?.wantsRematch ? 'Waiting for the others…' : 'New game'}
          </button>
          <button type="button" className="online-button" onClick={onHide}>View board</button>
          <button type="button" className="online-button" onClick={onMenu} data-testid="ludo-finish-leave">{isLocal ? 'Menu' : 'Leave room'}</button>
        </div>
        {!isLocal && <p className="game-help">{isHost ? 'New game starts right away for everyone still here.' : `New game starts when the host presses it, or when everyone asks${waiting.length ? ` (${waiting.length} asked)` : ''}.`}</p>}
      </div>
    </div>
  );
}
