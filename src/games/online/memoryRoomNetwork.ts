/** In-memory stand-in for the PeerJS broker and data channels, for testing multi-player rooms (incl. host migration). */
import type { RoomNetwork, RoomNetworkHandlers, RoomNetworkStatus } from './roomNetwork';

interface Endpoint { handlers: RoomNetworkHandlers | null; mode: 'idle' | 'host' | 'guest'; hostKey: string | null; online: boolean; }

export class MemoryBroker {
  /** room id → the endpoint holding it */
  private holders = new Map<string, MemoryRoomNetwork>();
  private queue: (() => void)[] = [];
  private nextKey = 1;

  network(roomId: string) { return new MemoryRoomNetwork(this, roomId); }
  newKey() { return `m${this.nextKey++}`; }
  holder(roomId: string) { return this.holders.get(roomId) ?? null; }
  claim(roomId: string, network: MemoryRoomNetwork) {
    const holder = this.holders.get(roomId);
    if (holder && holder !== network) return false;
    this.holders.set(roomId, network);
    return true;
  }
  release(roomId: string, network: MemoryRoomNetwork) { if (this.holders.get(roomId) === network) this.holders.delete(roomId); }
  enqueue(action: () => void) { this.queue.push(action); }
  /** Deliver everything queued (including messages sent while delivering). */
  flush(limit = 10_000) {
    let count = 0;
    while (this.queue.length && count++ < limit) this.queue.shift()!();
  }
}

export class MemoryRoomNetwork implements RoomNetwork {
  readonly endpoint: Endpoint = { handlers: null, mode: 'idle', hostKey: null, online: true };
  /** host side: guest key → guest network */
  readonly guests = new Map<string, MemoryRoomNetwork>();
  private status: RoomNetworkStatus | null = null;
  private stopped = false;
  constructor(private readonly broker: MemoryBroker, private readonly roomId: string) {}

  start(handlers: RoomNetworkHandlers) { this.endpoint.handlers = handlers; }
  private setStatus(status: RoomNetworkStatus) { if (status !== this.status) { this.status = status; this.endpoint.handlers?.onStatus(status); } }

  host() {
    this.leaveCurrent();
    this.endpoint.mode = 'host';
    if (this.broker.claim(this.roomId, this)) this.setStatus('hosting');
    else { this.endpoint.mode = 'idle'; this.setStatus('host-id-taken'); }
  }
  join() {
    this.leaveCurrent();
    this.endpoint.mode = 'guest';
    this.tryConnect();
  }
  /** Guests retry on every `retry()` call (tests drive time). */
  retry() { if (this.endpoint.mode === 'guest' && !this.endpoint.hostKey && !this.stopped) this.tryConnect(); }
  private tryConnect() {
    const host = this.broker.holder(this.roomId);
    if (!host || host === this) { this.setStatus(this.status === 'connected' || this.status === 'host-lost' ? 'host-lost' : 'connecting'); return; }
    const key = this.broker.newKey();
    this.endpoint.hostKey = key;
    host.guests.set(key, this);
    this.setStatus('connected');
    host.endpoint.handlers?.onGuestOpen(key);
  }
  private hostNetwork() { return this.endpoint.hostKey ? this.broker.holder(this.roomId) : null; }
  sendToGuest(peer: string, message: unknown) {
    const guest = this.guests.get(peer);
    if (!guest) return;
    const data = JSON.parse(JSON.stringify(message));
    this.broker.enqueue(() => { if (this.guests.get(peer) === guest) guest.endpoint.handlers?.onHostMessage(data); });
  }
  broadcast(message: unknown) { for (const peer of this.guests.keys()) this.sendToGuest(peer, message); }
  sendToHost(message: unknown) {
    const host = this.hostNetwork();
    const key = this.endpoint.hostKey;
    if (!host || !key) return false;
    const data = JSON.parse(JSON.stringify(message));
    this.broker.enqueue(() => { if (host.guests.get(key) === this) host.endpoint.handlers?.onGuestMessage(key, data); });
    return true;
  }
  closeGuest(peer: string) {
    const guest = this.guests.get(peer);
    if (!guest) return;
    this.broker.enqueue(() => {
      this.guests.delete(peer);
      if (guest.endpoint.hostKey === peer) { guest.endpoint.hostKey = null; guest.setStatus('host-lost'); }
    });
  }
  /** Simulates the tab closing / losing the network without saying goodbye. */
  crash() { this.stop(); }
  private leaveCurrent() {
    if (this.endpoint.mode === 'host') {
      this.broker.release(this.roomId, this);
      for (const [key, guest] of this.guests) { if (guest.endpoint.hostKey === key) { guest.endpoint.hostKey = null; guest.setStatus('host-lost'); } }
      this.guests.clear();
    } else if (this.endpoint.mode === 'guest') {
      const host = this.hostNetwork();
      const key = this.endpoint.hostKey;
      if (host && key && host.guests.get(key) === this) { host.guests.delete(key); host.endpoint.handlers?.onGuestClose(key); }
      this.endpoint.hostKey = null;
    }
    this.endpoint.mode = 'idle';
  }
  stop() { this.leaveCurrent(); this.stopped = true; this.endpoint.handlers = null; }
}
