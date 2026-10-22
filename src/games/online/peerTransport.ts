/**
 * Transport over a WebRTC data channel set up with PeerJS (free public PeerJS server for
 * matchmaking, the library's default ICE servers). The host registers the room's peer id;
 * the guest connects to it. Handles reconnects, a heartbeat and friendly failure states.
 */
import type { DataConnection, Peer as PeerType } from 'peerjs';
import type { Role } from './match';
import type { Message } from './protocol';
import { hostPeerId } from './room';
import type { ConnectionInfo, Transport, TransportHandlers } from './transport';

const OPEN_TIMEOUT_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 4_000;
const SILENCE_LIMIT_MS = 15_000;
const MAX_ROOM_IN_USE_RETRIES = 12;

export class PeerTransport implements Transport {
  private handlers: TransportHandlers | null = null;
  private peer: PeerType | null = null;
  private connection: DataConnection | null = null;
  private wasConnected = false;
  private stopped = false;
  private timers = new Set<number>();
  private heartbeatTimer: number | undefined;
  private lastHeardAt = 0;
  private roomInUseRetries = 0;
  private guestRetryDelayMs = 2_000;
  private lastStatus: ConnectionInfo = { status: 'starting' };

  private readonly hostId: string;

  constructor(private readonly role: Role, roomCode: string, gameId: string) {
    this.hostId = hostPeerId(gameId, roomCode);
  }

  start(handlers: TransportHandlers) {
    this.handlers = handlers;
    this.setStatus({ status: 'starting' });
    void this.createPeer();
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  send(message: Message): boolean {
    if (!this.connection?.open) return false;
    try { void this.connection.send(message); return true; } catch { return false; }
  }

  stop() {
    this.stopped = true;
    window.clearInterval(this.heartbeatTimer);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.connection?.close();
    this.peer?.destroy();
    this.connection = null;
    this.peer = null;
  }

  private later(action: () => void, delayMs: number) {
    const timer = window.setTimeout(() => { this.timers.delete(timer); if (!this.stopped) action(); }, delayMs);
    this.timers.add(timer);
  }

  private setStatus(info: ConnectionInfo) {
    if (info.status === this.lastStatus.status && info.problem === this.lastStatus.problem) return;
    this.lastStatus = info;
    this.handlers?.onStatus(info);
  }

  private async createPeer() {
    const { Peer } = await import('peerjs');
    if (this.stopped) return;
    this.peer?.destroy();
    const peer = this.role === 'host' ? new Peer(this.hostId, { debug: 0 }) : new Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.roomInUseRetries = 0;
      if (this.role === 'host') {
        if (!this.connection?.open) this.setStatus({ status: this.wasConnected ? 'opponent-left' : 'waiting' });
      } else {
        this.connectToHost();
      }
    });
    peer.on('connection', connection => {
      if (this.role === 'host') this.adopt(connection);
      else connection.close();
    });
    peer.on('disconnected', () => {
      // Lost the matchmaking server (the data channel may still work); quietly reconnect.
      if (peer === this.peer && !peer.destroyed) this.later(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2_000);
    });
    peer.on('error', error => { if (peer === this.peer) this.handlePeerError(String(error.type)); });
  }

  private handlePeerError(type: string) {
    switch (type) {
      case 'unavailable-id':
        // The room id is still held, usually by this same host a moment before a refresh.
        if (++this.roomInUseRetries > MAX_ROOM_IN_USE_RETRIES) { this.setStatus({ status: 'failed', problem: 'room-in-use' }); return; }
        this.setStatus({ status: 'starting' });
        this.later(() => void this.createPeer(), 3_000);
        return;
      case 'peer-unavailable':
        // The host isn't online (yet, or right now). Keep trying.
        this.setStatus({ status: this.wasConnected ? 'opponent-left' : 'connecting', problem: 'host-not-found' });
        this.retryGuest();
        return;
      case 'webrtc':
      case 'browser-incompatible':
        this.setStatus({ status: 'failed', problem: 'direct-connection' });
        this.retryGuest();
        return;
      default:
        // network / server-error / socket-error / socket-closed / ssl-unavailable / disconnected
        this.setStatus({ status: 'failed', problem: 'server' });
        this.later(() => void this.createPeer(), 5_000);
    }
  }

  private retryGuest() {
    if (this.role !== 'guest') return;
    const delay = this.guestRetryDelayMs;
    this.guestRetryDelayMs = Math.min(10_000, Math.round(this.guestRetryDelayMs * 1.5));
    this.later(() => this.connectToHost(), delay);
  }

  private connectToHost() {
    const peer = this.peer;
    if (!peer || peer.destroyed) return;
    if (peer.disconnected) { peer.reconnect(); return; }
    if (this.connection?.open) return;
    if (!this.wasConnected) this.setStatus({ status: 'connecting', problem: this.lastStatus.problem === 'host-not-found' ? 'host-not-found' : undefined });
    this.adopt(peer.connect(this.hostId, { reliable: true, serialization: 'json' }));
  }

  private adopt(connection: DataConnection) {
    if (this.connection && this.connection !== connection) this.connection.close();
    this.connection = connection;
    const openTimer = window.setTimeout(() => {
      if (connection !== this.connection || connection.open || this.stopped) return;
      // Matchmaking worked but the browsers couldn't reach each other directly (strict NAT / firewall).
      this.setStatus({ status: 'failed', problem: 'direct-connection' });
      connection.close();
      this.connection = null;
      this.retryGuest();
    }, OPEN_TIMEOUT_MS);
    connection.on('open', () => {
      window.clearTimeout(openTimer);
      if (connection !== this.connection) return;
      this.wasConnected = true;
      this.guestRetryDelayMs = 2_000;
      this.lastHeardAt = Date.now();
      this.setStatus({ status: 'connected' });
      this.handlers?.onOpen();
    });
    connection.on('data', data => {
      if (connection !== this.connection) return;
      this.lastHeardAt = Date.now();
      this.handlers?.onMessage(data);
    });
    const lost = () => {
      window.clearTimeout(openTimer);
      if (connection !== this.connection || this.stopped) return;
      this.connection = null;
      if (this.wasConnected) this.setStatus({ status: 'opponent-left' });
      this.retryGuest();
    };
    connection.on('close', lost);
    connection.on('error', lost);
  }

  private heartbeat() {
    const connection = this.connection;
    if (!connection?.open) return;
    if (Date.now() - this.lastHeardAt > SILENCE_LIMIT_MS) {
      // No pings for a while: the other side is gone even if the channel didn't say so.
      connection.close();
      if (connection === this.connection) {
        this.connection = null;
        this.setStatus({ status: 'opponent-left' });
        this.retryGuest();
      }
      return;
    }
    this.send({ type: 'ping' });
  }
}
