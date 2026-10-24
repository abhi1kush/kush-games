/**
 * The host's authoritative room: seats, the rules engine (Rust/wasm, with the host's dice), turn clocks, missed-turn
 * strikes, leaving, removing players and rematches. Guests' intents and the local (pass-and-play) UI both go through
 * here, so online and local games follow exactly the same rules. Time comes from `now()` so tests can drive it.
 */
import { cleanName, type EventKind, isSeated, MAX_PLAYERS, type RejectReason, type RoomPlayer, type RoomState, successorsOf } from './protocol';
import { MAX_STRIKES, placeText, type TurnEngine, type TurnGameSpec, TurnPhase as EnginePhase, type TurnView } from './spec';

export type { TurnEngine };

export interface AuthorityOptions {
  now(): number;
  random(): number;
  /** Seconds to roll and to move; 0 turns the clock off (local games). */
  turnSeconds: number;
  /** Starting variant for a new room / local game. */
  variant?: number;
}

/** Computer players think this long. */
export const BOT_DELAY_MS = 750;
/** A player who drops out mid-game keeps their seat this long (their turns still time out meanwhile). */
export const RECONNECT_GRACE_MS = 90_000;
/** In the lobby a dropped player is let go sooner. */
export const LOBBY_GRACE_MS = 20_000;
const EVENT_LIMIT = 12;

export type JoinResult = { ok: true } | { ok: false; reason: RejectReason };

export class TurnAuthority<View extends TurnView = TurnView> {
  state: RoomState;
  private deadline = 0;
  private passAt = 0;
  private botAt = 0;
  private turnKey = '';
  private disconnectedAt = new Map<string, number>();

  constructor(private readonly spec: TurnGameSpec<View>, private readonly engine: TurnEngine, state: RoomState, private readonly options: AuthorityOptions) {
    this.state = { ...state, players: state.players.map(player => ({ ...player })), banned: [...state.banned], events: [...state.events], clock: null };
    if (state.snapshot) engine.restore(Uint8Array.from(state.snapshot));
    engine.reseed(Math.floor(options.random() * 0xffffffff));
    const now = options.now();
    for (const player of this.state.players) if (!player.connected && !player.isBot) this.disconnectedAt.set(player.clientId, now);
    this.syncTurn(true);
  }

  /** A new online room with its creator in the first seat. */
  static createRoom<V extends TurnView>(spec: TurnGameSpec<V>, engine: TurnEngine, roomCode: string, host: { clientId: string; name: string }, options: AuthorityOptions) {
    const state: RoomState = {
      version: 1, roomCode, hostId: host.clientId, phase: 'lobby', gameNumber: 0, banned: [], snapshot: null, clock: null, turnSeconds: options.turnSeconds, variant: options.variant ?? 0,
      players: [{ clientId: host.clientId, name: cleanName(host.name), seat: spec.seatOrder[0], connected: true, isBot: false, status: 'lobby', wantsRematch: false }],
      events: [],
    };
    return new TurnAuthority(spec, engine, state, options);
  }

  /** Pass-and-play: everybody on this device (some may be computer players); the game starts right away. */
  static createLocal<V extends TurnView>(spec: TurnGameSpec<V>, engine: TurnEngine, seats: { seat: number; name: string; isBot: boolean }[], options: AuthorityOptions) {
    const state: RoomState = {
      version: 1, roomCode: 'LOCAL', hostId: 'local-host', phase: 'lobby', gameNumber: 0, banned: [], snapshot: null, clock: null, turnSeconds: options.turnSeconds, variant: options.variant ?? 0,
      players: seats.map(({ seat, name, isBot }) => ({ clientId: `local-${seat}`, name: cleanName(name, spec.seatNames[seat]), seat, connected: true, isBot, status: 'lobby', wantsRematch: false })),
      events: [],
    };
    const authority = new TurnAuthority(spec, engine, state, options);
    authority.startGame();
    return authority;
  }

  /**
   * Host migration: this browser takes over a room from the last state it saw. The dice get a fresh seed, the turn
   * clock restarts, and the old host (if it didn't leave on purpose) keeps its seat for the reconnect grace period.
   */
  static adopt<V extends TurnView>(spec: TurnGameSpec<V>, engine: TurnEngine, previous: RoomState, myId: string, options: AuthorityOptions) {
    const oldHostId = previous.hostId;
    const authority = new TurnAuthority(spec, engine, { ...previous, version: previous.version + 1000 }, options);
    const state = authority.state;
    state.hostId = myId;
    const me = authority.player(myId);
    if (me) me.connected = true;
    authority.disconnectedAt.delete(myId);
    const oldHost = authority.player(oldHostId);
    if (oldHost && oldHostId !== myId && oldHost.connected) { oldHost.connected = false; authority.disconnectedAt.set(oldHostId, options.now()); }
    authority.turnKey = '';
    authority.syncTurn(true);
    authority.log(`${me?.name ?? 'A player'} is now the host`, 'host');
    return authority;
  }

  player(clientId: string) { return this.state.players.find(player => player.clientId === clientId); }
  get view(): View | null { return this.spec.decode(this.state.snapshot); }
  private get now() { return this.options.now(); }

  private log(text: string, kind: EventKind) {
    const lastId = this.state.events.length ? this.state.events[this.state.events.length - 1].id : 0;
    this.state.events = [...this.state.events, { id: lastId + 1, text, kind }].slice(-EVENT_LIMIT);
  }

  private changed() { this.state.version += 1; }

  private seatName(seat: number) { return this.state.players.find(player => player.seat === seat && player.status !== 'left' && player.status !== 'kicked')?.name ?? this.spec.seatNames[seat]; }

  /** Copy the engine into the state; restart clocks when the turn moves on; finish places; game over. */
  private syncTurn(force = false) {
    if (this.state.phase === 'lobby') { this.state.snapshot = null; return; }
    this.state.snapshot = Array.from(this.engine.snapshot());
    const view = this.view!;
    for (const player of this.state.players) {
      if (player.status === 'playing' && view.places[player.seat] > 0) player.status = 'finished';
    }
    const key = `${this.state.gameNumber}-${view.current}-${view.phase}-${view.rollId}`;
    if (key !== this.turnKey || force) {
      this.turnKey = key;
      if (view.phase === EnginePhase.AwaitRoll || view.phase === EnginePhase.AwaitMove) this.deadline = this.now + this.options.turnSeconds * 1000;
      if (view.phase === EnginePhase.Resolving) this.passAt = this.now + this.spec.resolveMs(view);
      this.botAt = this.now + BOT_DELAY_MS;
    }
    if (view.phase === EnginePhase.Over && this.state.phase === 'playing') {
      this.state.phase = 'finished';
      const order = this.state.players.filter(player => view.places[player.seat] > 0).sort((a, b) => view.places[a.seat] - view.places[b.seat]);
      this.log(`Game over: ${order.map(player => `${placeText(view.places[player.seat])} ${player.name}`).join(', ')}`, 'over');
    }
  }

  /** Log what the last engine action did (the game's own descriptions, then finishing places). */
  private describe(before: View, after: View) {
    this.spec.describe(before, after, seat => this.seatName(seat), (text, kind) => this.log(text, kind));
    for (let seat = 0; seat < 4; seat++) {
      if (after.places[seat] > 0 && before.places[seat] === 0 && after.active & (1 << seat)) this.log(`${this.seatName(seat)} finished ${placeText(after.places[seat])}!`, 'finish');
    }
  }

  private runEngine(action: () => unknown) {
    const before = this.view!;
    action();
    this.state.snapshot = Array.from(this.engine.snapshot());
    this.describe(before, this.view!);
    this.syncTurn();
    this.changed();
  }

  private currentPlayer() {
    const view = this.view;
    return view ? this.state.players.find(player => player.seat === view.current && player.status === 'playing') : undefined;
  }

  // ---------- lobby ----------
  join(clientId: string, name: string): JoinResult {
    if (this.state.banned.includes(clientId)) return { ok: false, reason: 'kicked' };
    const existing = this.player(clientId);
    if (existing) {
      if (existing.status === 'kicked') return { ok: false, reason: 'kicked' };
      if (existing.status === 'left') {
        if (this.state.phase !== 'lobby') return { ok: false, reason: 'left' };
      } else {
        existing.connected = true;
        existing.name = cleanName(name, existing.name);
        this.disconnectedAt.delete(clientId);
        this.changed();
        return { ok: true };
      }
    }
    if (this.state.phase === 'playing') return { ok: false, reason: 'in-progress' };
    const seated = this.state.players.filter(isSeated);
    if (seated.length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    if (this.state.phase === 'finished') this.backToLobby();
    const taken = new Set(this.state.players.filter(isSeated).map(player => player.seat));
    const seat = this.spec.seatOrder.find(candidate => !taken.has(candidate))!;
    this.state.players = [...this.state.players.filter(player => player.clientId !== clientId),
      { clientId, name: cleanName(name), seat, connected: true, isBot: false, status: 'lobby', wantsRematch: false }];
    this.log(`${cleanName(name)} joined`, 'join');
    this.changed();
    return { ok: true };
  }

  setConnected(clientId: string, connected: boolean) {
    const player = this.player(clientId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    if (connected) this.disconnectedAt.delete(clientId); else this.disconnectedAt.set(clientId, this.now);
    this.changed();
  }

  rename(clientId: string, name: string) {
    const player = this.player(clientId);
    if (!player) return;
    const clean = cleanName(name, player.name);
    if (clean === player.name) return;
    player.name = clean;
    this.changed();
  }

  /** The host starts (2–4 players). The first player to roll is picked at random. */
  start(byId: string): boolean {
    if (byId !== this.state.hostId || this.state.phase !== 'lobby') return false;
    return this.startGame();
  }

  private startGame(): boolean {
    const seated = this.state.players.filter(player => player.status === 'lobby');
    if (seated.length < 2) return false;
    const mask = seated.reduce((bits, player) => bits | (1 << player.seat), 0);
    const first = seated[Math.floor(this.options.random() * seated.length)].seat;
    this.engine.reseed(Math.floor(this.options.random() * 0xffffffff));
    this.engine.set_variant?.(this.state.variant);
    if (!this.engine.start(mask, first)) return false;
    this.state.players = this.state.players.filter(player => player.status === 'lobby');
    for (const player of this.state.players) { player.status = 'playing'; player.wantsRematch = false; }
    this.state.phase = 'playing';
    this.state.gameNumber += 1;
    this.state.events = [];
    this.log(`Game ${this.state.gameNumber} started — ${this.seatName(first)} rolls first`, 'start');
    this.turnKey = '';
    this.syncTurn(true);
    this.changed();
    return true;
  }

  private backToLobby() {
    this.state.phase = 'lobby';
    this.state.snapshot = null;
    this.state.players = this.state.players.filter(player => (player.connected || player.isBot) && player.status !== 'left' && player.status !== 'kicked');
    for (const player of this.state.players) { player.status = 'lobby'; player.wantsRematch = false; }
  }

  /** The host picks the variant (board) in the lobby. */
  setVariant(byId: string, value: number): boolean {
    if (byId !== this.state.hostId || this.state.phase === 'playing' || value < 0 || value >= this.spec.variantCount || value === this.state.variant) return false;
    this.state.variant = value;
    this.changed();
    return true;
  }

  // ---------- turns ----------
  roll(byId: string): boolean {
    const player = this.currentPlayer();
    if (this.state.phase !== 'playing' || !player || player.clientId !== byId || this.engine.phase() !== EnginePhase.AwaitRoll) return false;
    this.runEngine(() => this.engine.roll());
    return true;
  }

  move(byId: string, token: number): boolean {
    const player = this.currentPlayer();
    if (this.state.phase !== 'playing' || !player || player.clientId !== byId || this.engine.phase() !== EnginePhase.AwaitMove) return false;
    if (!(this.engine.legal_mask() & (1 << token))) return false;
    this.runEngine(() => this.engine.move_token(token));
    return true;
  }

  // ---------- leaving ----------
  /**
   * A player leaves. In the lobby they're simply gone; in a game their tokens go and play goes on (one left = winner).
   * Returns the new host's id if the host left (null if nobody can take over).
   */
  leave(clientId: string): string | null | undefined {
    const player = this.player(clientId);
    if (!player || player.status === 'left' || player.status === 'kicked') return undefined;
    const wasHost = clientId === this.state.hostId;
    this.removePlayer(player, 'left');
    this.log(`${player.name} left the ${this.state.phase === 'lobby' ? 'room' : 'game'}`, 'leave');
    let successor: string | null | undefined;
    if (wasHost) {
      successor = successorsOf(this.state)[0] ?? null;
      if (successor) { this.state.hostId = successor; this.log(`${this.player(successor)!.name} is now the host`, 'host'); }
    }
    this.changed();
    return successor;
  }

  /** The host removes a player (lobby or mid-game). They can't come back with the same session. */
  kick(byId: string, targetId: string): boolean {
    const target = this.player(targetId);
    if (byId !== this.state.hostId || targetId === byId || !target || target.status === 'left' || target.status === 'kicked') return false;
    this.removePlayer(target, 'kicked');
    if (!this.state.banned.includes(targetId)) this.state.banned = [...this.state.banned, targetId];
    this.log(`The host removed ${target.name}`, 'kick');
    this.changed();
    return true;
  }

  private removePlayer(player: RoomPlayer, status: 'left' | 'kicked' | 'forfeited') {
    this.disconnectedAt.delete(player.clientId);
    if (this.state.phase === 'lobby') {
      this.state.players = this.state.players.filter(other => other !== player);
      return;
    }
    const wasPlaying = player.status === 'playing';
    player.status = status;
    player.wantsRematch = false;
    if (this.state.phase === 'playing' && wasPlaying) {
      const before = this.view!;
      this.engine.remove_seat(player.seat);
      this.state.snapshot = Array.from(this.engine.snapshot());
      this.describe(before, this.view!);
      this.syncTurn();
    }
  }

  // ---------- rematch ----------
  /** "New game": the host starts it right away; a guest asks, and it starts once every connected player has asked. */
  rematch(byId: string): boolean {
    if (this.state.phase !== 'finished') return false;
    const player = this.player(byId);
    if (!player || player.status === 'left' || player.status === 'kicked') return false;
    if (byId !== this.state.hostId) {
      if (player.wantsRematch) return false;
      player.wantsRematch = true;
      this.log(`${player.name} wants a new game`, 'info');
      const waiting = this.state.players.filter(other => other.connected && !other.isBot && other.status !== 'left' && other.status !== 'kicked' && !other.wantsRematch && other.clientId !== this.state.hostId);
      this.changed();
      if (waiting.length > 0) return true;
      const host = this.player(this.state.hostId);
      if (host?.connected && !host.wantsRematch) return true; // the host still decides
    }
    this.backToLobby();
    if (!this.startGame()) this.changed();
    return true;
  }

  // ---------- the clock ----------
  /** Advance timers: pass a dead roll, computer moves, missed turns, dropped players. True if anything changed. */
  tick(): boolean {
    const now = this.now;
    let changed = false;
    for (const [clientId, since] of [...this.disconnectedAt]) {
      const player = this.player(clientId);
      if (!player || player.connected) { this.disconnectedAt.delete(clientId); continue; }
      const grace = this.state.phase === 'lobby' ? LOBBY_GRACE_MS : RECONNECT_GRACE_MS;
      if (now - since >= grace && player.status !== 'finished') {
        const successor = this.leave(clientId);
        void successor;
        changed = true;
      }
    }
    if (this.state.phase !== 'playing') return changed;
    const phase = this.engine.phase();
    const player = this.currentPlayer();
    if (phase === EnginePhase.Resolving) {
      if (now >= this.passAt) { this.runEngine(() => this.engine.pass_turn()); changed = true; }
      return changed;
    }
    if (player?.isBot) {
      if (now >= this.botAt) {
        if (phase === EnginePhase.AwaitRoll) this.runEngine(() => this.engine.roll());
        else if (phase === EnginePhase.AwaitMove) this.runEngine(() => this.engine.move_token(this.engine.choose_move()));
        changed = true;
      }
      return changed;
    }
    if (this.options.turnSeconds > 0 && now >= this.deadline && (phase === EnginePhase.AwaitRoll || phase === EnginePhase.AwaitMove) && player) {
      const before = this.view!;
      const result = this.engine.timeout();
      this.state.snapshot = Array.from(this.engine.snapshot());
      const after = this.view!;
      if (result === 2) {
        player.status = 'forfeited';
        this.log(`${player.name} missed ${MAX_STRIKES} turns and is out of the game`, 'forfeit');
      } else if (result === 1) {
        this.log(`${player.name} ran out of time — played automatically (strike ${after.strikes[player.seat]}/${MAX_STRIKES})`, 'strike');
      }
      this.describe(before, after);
      this.syncTurn();
      this.changed();
      changed = true;
    }
    return changed;
  }

  /** The state to broadcast, with the turn clock as "milliseconds left" (browsers' clocks differ). */
  toState(): RoomState {
    const view = this.view;
    let clock: RoomState['clock'] = null;
    if (this.state.phase === 'playing' && this.options.turnSeconds > 0 && view && (view.phase === EnginePhase.AwaitRoll || view.phase === EnginePhase.AwaitMove)) {
      clock = { remainingMs: Math.max(0, Math.round(this.deadline - this.now)), totalMs: this.options.turnSeconds * 1000, key: this.turnKey };
    }
    return { ...this.state, clock, turnSeconds: this.options.turnSeconds };
  }
}
