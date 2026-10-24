/**
 * Network for rooms with more than two players (Ludo): a star around the host over PeerJS/WebRTC, using the same
 * room codes, PeerJS ids (see room.ts), public broker and failure handling as the two-player transport.
 *
 * - `host()` registers the room's PeerJS id. Only one browser can hold it, which is what makes host migration safe:
 *   when the host goes, the next player claims the same id and everyone's link keeps working.
 * - `join()` connects to whoever holds the room id and keeps retrying (with a heartbeat to notice a silent host).
 * Messages are JSON. Tests can swap in an in-memory network (memoryRoomNetwork.ts) or install
 * `window.__kushTestRoomNetwork`.
 */
import type { DataConnection, Peer as PeerType } from 'peerjs';
import { hostPeerId } from './room';

export type RoomNetworkStatus =
  | 'starting'       // contacting the matchmaking server
  | 'hosting'        // we hold the room id
  | 'host-id-taken'  // someone else holds the room id (host() gave up; call join())
  | 'connecting'     // reaching the host
  | 'connected'      // data channel to the host is open
  | 'host-lost'      // was connected; the host went away (still retrying)
  | 'server';        // can't reach the matchmaking server (retrying)

export interface RoomNetworkHandlers {
  onStatus(status: RoomNetworkStatus): void;
  /** Host side: a guest's channel opened / sent data / closed. `peer` is an opaque connection id. */
  onGuestOpen(peer: string): void;
  onGuestMessage(peer: string, data: unknown): void;
  onGuestClose(peer: string): void;
  /** Guest side: data from the host. */
  onHostMessage(data: unknown): void;
}

export interface RoomNetwork {
  start(handlers: RoomNetworkHandlers): void;
  host(): void;
  join(): void;
  sendToGuest(peer: string, message: unknown): void;
  broadcast(message: unknown): void;
  sendToHost(message: unknown): boolean;
  closeGuest(peer: string): void;
  stop(): void;
}

export type RoomNetworkFactory = (gameId: string, roomCode: string) => RoomNetwork;

const OPEN_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 3_000;
const SILENCE_LIMIT_MS = 10_000;
const GUEST_RETRY_MS = 1_500;

export class PeerRoomNetwork implements RoomNetwork {
  private handlers: RoomNetworkHandlers | null = null;
  private peer: PeerType | null = null;
  private mode: 'idle' | 'host' | 'guest' = 'idle';
  private hostConnection: DataConnection | null = null;
  private guests = new Map<string, { connection: DataConnection; lastHeardAt: number }>();
  private lastHeardFromHost = 0;
  private wasConnected = false;
  private stopped = false;
  private timers = new Set<number>();
  private heartbeat: number | undefined;
  private status: RoomNetworkStatus | null = null;
  private nextGuestKey = 1;
  private readonly roomId: string;

  constructor(gameId: string, roomCode: string) { this.roomId = hostPeerId(gameId, roomCode); }

  start(handlers: RoomNetworkHandlers) {
    this.handlers = handlers;
    this.heartbeat = window.setInterval(() => this.beat(), HEARTBEAT_MS);
  }

  host() { this.mode = 'host'; this.wasConnected = false; void this.createPeer(); }
  join() { this.mode = 'guest'; void this.createPeer(); }

  sendToGuest(peer: string, message: unknown) {
    const guest = this.guests.get(peer);
    if (guest?.connection.open) try { void guest.connection.send(message); } catch { /* closed */ }
  }
  broadcast(message: unknown) { for (const peer of this.guests.keys()) this.sendToGuest(peer, message); }
  sendToHost(message: unknown): boolean {
    if (!this.hostConnection?.open) return false;
    try { void this.hostConnection.send(message); return true; } catch { return false; }
  }
  closeGuest(peer: string) {
    const guest = this.guests.get(peer);
    if (!guest) return;
    this.guests.delete(peer);
    // give a last message (e.g. "you were removed") a moment to arrive
    this.later(() => guest.connection.close(), 400);
  }

  stop() {
    this.stopped = true;
    window.clearInterval(this.heartbeat);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.teardown();
  }

  private teardown() {
    this.hostConnection?.close();
    this.hostConnection = null;
    for (const { connection } of this.guests.values()) connection.close();
    this.guests.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  private later(action: () => void, delayMs: number) {
    const timer = window.setTimeout(() => { this.timers.delete(timer); if (!this.stopped) action(); }, delayMs);
    this.timers.add(timer);
  }

  private setStatus(status: RoomNetworkStatus) {
    if (status === this.status) return;
    this.status = status;
    this.handlers?.onStatus(status);
  }

  private async createPeer() {
    const { Peer } = await import('peerjs');
    if (this.stopped) return;
    this.teardown();
    this.setStatus('starting');
    const mode = this.mode;
    const peer = mode === 'host' ? new Peer(this.roomId, { debug: 0 }) : new Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      if (mode === 'host') this.setStatus('hosting');
      else this.connectToHost();
    });
    peer.on('connection', connection => { if (mode === 'host' && peer === this.peer) this.adoptGuest(connection); else connection.close(); });
    peer.on('disconnected', () => {
      if (peer === this.peer && !peer.destroyed) this.later(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2_000);
    });
    peer.on('error', error => {
      if (peer !== this.peer) return;
      const type = String(error.type);
      if (type === 'unavailable-id') { this.teardown(); this.setStatus('host-id-taken'); return; }
      if (type === 'peer-unavailable') { this.setStatus(this.wasConnected ? 'host-lost' : 'connecting'); this.retryGuest(); return; }
      if (type === 'webrtc' || type === 'browser-incompatible') { this.retryGuest(); return; }
      this.setStatus('server');
      this.later(() => void this.createPeer(), 4_000);
    });
  }

  private retryGuest() { if (this.mode === 'guest') this.later(() => this.connectToHost(), GUEST_RETRY_MS); }

  private connectToHost() {
    const peer = this.peer;
    if (this.mode !== 'guest' || !peer || peer.destroyed) return;
    if (peer.disconnected) { peer.reconnect(); return; }
    if (this.hostConnection?.open) return;
    if (!this.wasConnected) this.setStatus('connecting');
    const connection = peer.connect(this.roomId, { reliable: true, serialization: 'json' });
    this.hostConnection?.close();
    this.hostConnection = connection;
    const openTimer = window.setTimeout(() => {
      if (connection !== this.hostConnection || connection.open) return;
      connection.close();
      this.hostConnection = null;
      this.retryGuest();
    }, OPEN_TIMEOUT_MS);
    connection.on('open', () => {
      window.clearTimeout(openTimer);
      if (connection !== this.hostConnection) return;
      this.wasConnected = true;
      this.lastHeardFromHost = Date.now();
      this.setStatus('connected');
    });
    connection.on('data', data => {
      if (connection !== this.hostConnection) return;
      this.lastHeardFromHost = Date.now();
      if ((data as { t?: string })?.t !== 'ping') this.handlers?.onHostMessage(data);
    });
    const lost = () => {
      window.clearTimeout(openTimer);
      if (connection !== this.hostConnection || this.stopped) return;
      this.hostConnection = null;
      this.setStatus(this.wasConnected ? 'host-lost' : 'connecting');
      this.retryGuest();
    };
    connection.on('close', lost);
    connection.on('error', lost);
  }

  private adoptGuest(connection: DataConnection) {
    const key = `g${this.nextGuestKey++}`;
    connection.on('open', () => {
      if (this.stopped || this.mode !== 'host') { connection.close(); return; }
      this.guests.set(key, { connection, lastHeardAt: Date.now() });
      this.handlers?.onGuestOpen(key);
    });
    connection.on('data', data => {
      const guest = this.guests.get(key);
      if (!guest || guest.connection !== connection) return;
      guest.lastHeardAt = Date.now();
      if ((data as { t?: string })?.t !== 'ping') this.handlers?.onGuestMessage(key, data);
    });
    const lost = () => {
      const guest = this.guests.get(key);
      if (!guest || guest.connection !== connection) return;
      this.guests.delete(key);
      this.handlers?.onGuestClose(key);
    };
    connection.on('close', lost);
    connection.on('error', lost);
  }

  private beat() {
    const now = Date.now();
    if (this.mode === 'host') {
      for (const [key, guest] of [...this.guests]) {
        if (now - guest.lastHeardAt > SILENCE_LIMIT_MS) { this.guests.delete(key); guest.connection.close(); this.handlers?.onGuestClose(key); }
      }
      this.broadcast({ t: 'ping' });
    } else if (this.hostConnection?.open) {
      if (now - this.lastHeardFromHost > SILENCE_LIMIT_MS) { this.hostConnection.close(); this.hostConnection = null; this.setStatus('host-lost'); this.retryGuest(); return; }
      this.sendToHost({ t: 'ping' });
    }
  }
}

/** PeerJS normally; browser tests may install `window.__kushTestRoomNetwork`. */
export function createRoomNetwork(gameId: string, roomCode: string): RoomNetwork {
  const factory = (window as unknown as { __kushTestRoomNetwork?: RoomNetworkFactory }).__kushTestRoomNetwork;
  return factory ? factory(gameId, roomCode) : new PeerRoomNetwork(gameId, roomCode);
}
