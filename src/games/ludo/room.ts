/**
 * One browser's side of an online Ludo room. It is either the host (runs the LudoAuthority and broadcasts the state)
 * or a guest (sends intents, shows the host's state) and can switch from guest to host:
 *
 * Host migration: every guest keeps the latest room state (including the 56-byte rules snapshot). If the host leaves
 * on purpose it names a successor, who takes over at once. If the host just disappears, the guests first wait
 * HOST_GRACE_MS (a refresh brings it back), then try to take over in join order, HOST_STAGGER_MS apart. Taking over
 * means claiming the room's PeerJS id; the broker lets only one browser hold it, so there's never two hosts, and
 * everyone else simply reconnects to the same id. A returning old host finds its id taken and rejoins as a guest.
 */
import type { RoomNetwork, RoomNetworkStatus } from '../online/roomNetwork';
import { type AuthorityOptions, LudoAuthority, type LudoEngine } from './authority';
import { type GuestMessage, LUDO_PROTOCOL, parseGuestMessage, parseHostMessage, type RejectReason, type RoomState, successorsOf } from './protocol';

export const HOST_GRACE_MS = 8_000;
export const HOST_STAGGER_MS = 5_000;
const HOST_TICK_MS = 200;
const CLAIM_CHECK_MS = 500;

export type RoomEnding = { kind: 'kicked' } | { kind: 'rejected'; reason: RejectReason } | { kind: 'left' };

export interface RoomView {
  state: RoomState | null;
  myId: string;
  role: 'host' | 'guest';
  network: RoomNetworkStatus;
  ending: RoomEnding | null;
  /** `now()` when this state arrived (the turn clock counts down from here). */
  receivedAt: number;
}

export interface SavedRoom { roomCode: string; clientId: string; name: string; role: 'host' | 'guest'; state: RoomState | null; }

export interface Timers {
  setTimeout(action: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(action: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface LudoRoomOptions {
  roomCode: string;
  myId: string;
  myName: string;
  /** Create the room (or resume hosting a saved one). Guests join. */
  startAsHost: boolean;
  savedState: RoomState | null;
  network: RoomNetwork;
  createEngine(): LudoEngine;
  authority: AuthorityOptions;
  timers: Timers;
  onView(view: RoomView): void;
  onSave(room: SavedRoom | null): void;
}

export class LudoRoom {
  private role: 'host' | 'guest' = 'guest';
  private authority: LudoAuthority | null = null;
  private lastState: RoomState | null;
  private receivedAt = 0;
  private networkStatus: RoomNetworkStatus = 'starting';
  private ending: RoomEnding | null = null;
  private peers = new Map<string, string>(); // host: connection → clientId
  private claiming: 'fresh' | 'resume' | 'takeover' | null = null;
  private hostLostAt: number | null = null;
  private explicitSuccessor: string | null = null;
  private nextClaimAt = 0;
  private tickTimer: unknown = null;
  private claimTimer: unknown = null;
  private name: string;
  private stopped = false;

  constructor(private readonly options: LudoRoomOptions) {
    this.lastState = options.savedState;
    this.name = options.myName;
  }

  get myId() { return this.options.myId; }
  private get now() { return this.options.authority.now(); }

  start() {
    const { network } = this.options;
    network.start({
      onStatus: status => this.handleStatus(status),
      onGuestOpen: () => undefined,
      onGuestMessage: (peer, data) => this.handleGuestMessage(peer, data),
      onGuestClose: peer => this.handleGuestClose(peer),
      onHostMessage: data => this.handleHostMessage(data),
    });
    if (this.options.startAsHost) { this.claiming = this.lastState ? 'resume' : 'fresh'; network.host(); }
    else network.join();
    this.claimTimer = this.options.timers.setInterval(() => this.checkHostLoss(), CLAIM_CHECK_MS);
    this.emit();
  }

  stop() {
    this.stopped = true;
    this.options.timers.clearInterval(this.tickTimer);
    this.options.timers.clearInterval(this.claimTimer);
    this.options.network.stop();
  }

  view(): RoomView {
    return { state: this.lastState, myId: this.myId, role: this.role, network: this.networkStatus, ending: this.ending, receivedAt: this.receivedAt };
  }

  private emit() {
    this.options.onView(this.view());
  }

  private save() {
    if (this.ending) { this.options.onSave(null); return; }
    this.options.onSave({ roomCode: this.options.roomCode, clientId: this.myId, name: this.name, role: this.role, state: this.lastState });
  }

  // ---------- network status ----------
  private handleStatus(status: RoomNetworkStatus) {
    if (this.stopped) return;
    this.networkStatus = status;
    if (status === 'hosting' && this.claiming) this.becomeHost();
    else if (status === 'host-id-taken') {
      // Someone else holds the room: join them (an old host coming back, or a successor that lost the race).
      this.claiming = null;
      this.role = 'guest';
      this.nextClaimAt = this.now + (this.explicitSuccessor === this.myId ? 700 : HOST_STAGGER_MS);
      if (this.hostLostAt === null && this.lastState) this.hostLostAt = this.now;
      this.options.network.join();
    } else if (status === 'connected' && this.role === 'guest') {
      this.hostLostAt = null;
      this.options.network.sendToHost({ t: 'join', protocol: LUDO_PROTOCOL, clientId: this.myId, name: this.name });
    } else if ((status === 'host-lost' || status === 'connecting') && this.role === 'guest' && this.hostLostAt === null && this.lastState) {
      this.hostLostAt = this.now;
    }
    this.emit();
  }

  private becomeHost() {
    const mode = this.claiming;
    this.claiming = null;
    this.role = 'host';
    this.hostLostAt = null;
    this.explicitSuccessor = null;
    const engine = this.options.createEngine();
    if (mode === 'fresh' || !this.lastState) {
      this.authority = LudoAuthority.createRoom(engine, this.options.roomCode, { clientId: this.myId, name: this.name }, this.options.authority);
    } else if (this.lastState.hostId === this.myId && mode === 'resume') {
      this.authority = new LudoAuthority(engine, this.lastState, this.options.authority);
      // everyone reconnects after a host refresh
      for (const player of this.authority.state.players) if (player.clientId !== this.myId && !player.isBot) this.authority.setConnected(player.clientId, false);
    } else {
      this.authority = LudoAuthority.adopt(engine, this.lastState, this.myId, this.options.authority);
    }
    this.peers.clear();
    this.options.timers.clearInterval(this.tickTimer);
    this.tickTimer = this.options.timers.setInterval(() => this.hostTick(), HOST_TICK_MS);
    this.publish();
  }

  /** Guest: no host for a while → take over if it's our turn in the succession order. */
  private checkHostLoss() {
    if (this.stopped || this.role !== 'guest' || this.ending || this.claiming || !this.lastState || this.networkStatus === 'connected') return;
    if (this.hostLostAt === null) { this.hostLostAt = this.now; return; }
    if (this.now < this.nextClaimAt) return;
    const order = successorsOf(this.lastState);
    const index = order.indexOf(this.myId);
    // the old host already handed the room to us (its last state names us as host)
    const handedToMe = this.lastState.hostId === this.myId;
    if (index < 0 && !handedToMe) return;
    let wait = handedToMe ? 0 : HOST_GRACE_MS + index * HOST_STAGGER_MS;
    if (this.explicitSuccessor && !handedToMe) {
      // the host said who's next: they go now, the rest only if that player doesn't take over
      wait = this.explicitSuccessor === this.myId ? 0 : HOST_STAGGER_MS * (index + 1);
    }
    if (this.now - this.hostLostAt < wait) return;
    this.takeOver();
  }

  private takeOver() {
    this.claiming = 'takeover';
    this.options.network.host();
  }

  // ---------- host side ----------
  private hostTick() {
    if (!this.authority || this.stopped) return;
    if (this.authority.tick()) this.publish();
  }

  private publish() {
    if (!this.authority) return;
    const state = this.authority.toState();
    this.lastState = state;
    this.receivedAt = this.now;
    this.options.network.broadcast({ t: 'state', state });
    this.save();
    this.emit();
  }

  private handleGuestMessage(peer: string, data: unknown) {
    const authority = this.authority;
    if (!authority || this.role !== 'host') return;
    const message = parseGuestMessage(data);
    if (!message) return;
    if (message.t === 'join') {
      if (message.protocol !== LUDO_PROTOCOL) { this.reject(peer, 'version'); return; }
      const result = authority.join(message.clientId, message.name);
      if (!result.ok) {
        if (result.reason === 'kicked') { this.options.network.sendToGuest(peer, { t: 'kicked' }); this.options.network.closeGuest(peer); }
        else this.reject(peer, result.reason);
        return;
      }
      for (const [otherPeer, clientId] of this.peers) if (clientId === message.clientId && otherPeer !== peer) { this.peers.delete(otherPeer); this.options.network.closeGuest(otherPeer); }
      this.peers.set(peer, message.clientId);
      this.publish();
      return;
    }
    const clientId = this.peers.get(peer);
    if (!clientId) return;
    if (this.applyIntent(clientId, message)) this.publish();
    if (message.t === 'leave') { this.peers.delete(peer); this.options.network.closeGuest(peer); }
  }

  private applyIntent(clientId: string, message: GuestMessage): boolean {
    const authority = this.authority!;
    switch (message.t) {
      case 'roll': return authority.roll(clientId);
      case 'move': return authority.move(clientId, message.token);
      case 'rename': { const before = authority.state.version; authority.rename(clientId, message.name); return authority.state.version !== before; }
      case 'rematch': return authority.rematch(clientId);
      case 'leave': return authority.leave(clientId) !== undefined;
      default: return false;
    }
  }

  private reject(peer: string, reason: RejectReason) {
    this.options.network.sendToGuest(peer, { t: 'rejected', reason });
    this.options.network.closeGuest(peer);
  }

  private handleGuestClose(peer: string) {
    const clientId = this.peers.get(peer);
    this.peers.delete(peer);
    if (!clientId || !this.authority) return;
    if ([...this.peers.values()].includes(clientId)) return;
    this.authority.setConnected(clientId, false);
    this.publish();
  }

  // ---------- guest side ----------
  private handleHostMessage(data: unknown) {
    if (this.role !== 'guest' || this.ending) return;
    const message = parseHostMessage(data);
    if (!message) return;
    switch (message.t) {
      case 'state':
        if (message.state.roomCode !== this.options.roomCode) return;
        this.lastState = message.state;
        this.receivedAt = this.now;
        this.explicitSuccessor = null;
        this.save();
        this.emit();
        return;
      case 'kicked': this.end({ kind: 'kicked' }); return;
      case 'rejected': this.end({ kind: 'rejected', reason: message.reason }); return;
      case 'host-leaving':
        this.explicitSuccessor = message.successor;
        this.hostLostAt = this.now;
        if (message.successor === this.myId && this.lastState) { this.lastState = { ...this.lastState, hostId: this.myId }; this.takeOver(); }
        return;
    }
  }

  private end(ending: RoomEnding) {
    this.ending = ending;
    this.save();
    this.stop();
    this.emit();
  }

  // ---------- what this player does ----------
  private act(message: GuestMessage) {
    if (this.ending) return;
    if (this.role === 'host' && this.authority) { if (this.applyIntent(this.myId, message)) this.publish(); }
    else this.options.network.sendToHost(message);
  }

  roll() { this.act({ t: 'roll' }); }
  move(token: number) { this.act({ t: 'move', token }); }
  rematch() { this.act({ t: 'rematch' }); }
  rename(name: string) { this.name = name; this.act({ t: 'rename', name }); this.save(); }

  /** Host only. */
  startGame() { if (this.authority?.start(this.myId)) this.publish(); }
  kick(clientId: string) {
    if (!this.authority || !this.authority.kick(this.myId, clientId)) return;
    for (const [peer, id] of [...this.peers]) {
      if (id !== clientId) continue;
      this.options.network.sendToGuest(peer, { t: 'kicked' });
      this.peers.delete(peer);
      this.options.network.closeGuest(peer);
    }
    this.publish();
  }

  /** Leave for good. A leaving host hands the room to the next player first. */
  leave() {
    if (this.ending) return;
    if (this.role === 'host' && this.authority) {
      const successor = this.authority.leave(this.myId);
      this.publish();
      this.options.network.broadcast({ t: 'host-leaving', successor: successor ?? null });
      this.options.timers.clearInterval(this.tickTimer);
      this.authority = null;
      this.ending = { kind: 'left' };
      this.save();
      this.emit();
      this.options.timers.setTimeout(() => this.stop(), 600);
      return;
    }
    this.options.network.sendToHost({ t: 'leave' });
    this.ending = { kind: 'left' };
    this.save();
    this.emit();
    this.options.timers.setTimeout(() => this.stop(), 400);
  }
}
