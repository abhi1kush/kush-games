/** How a room session talks to the other browser (PeerJS/WebRTC in the app, in-memory pairs in tests). */
import type { Message } from './protocol';

export type ConnectionStatus =
  | 'starting'       // contacting the matchmaking server
  | 'waiting'        // host: room is open, nobody joined yet
  | 'connecting'     // guest: reaching the host
  | 'connected'
  | 'opponent-left'  // was connected; trying to get the opponent back
  | 'failed';        // could not connect (see problem)

export type ConnectionProblem = 'direct-connection' | 'server' | 'room-in-use' | 'host-not-found' | 'version';

export interface ConnectionInfo { status: ConnectionStatus; problem?: ConnectionProblem; }

export interface TransportHandlers {
  /** A data channel to the other browser is open. */
  onOpen(): void;
  onMessage(data: unknown): void;
  onStatus(info: ConnectionInfo): void;
}

export interface Transport {
  start(handlers: TransportHandlers): void;
  /** False when there is no open connection (the message is dropped; a sync follows on reconnect). */
  send(message: Message): boolean;
  stop(): void;
}

export type TransportFactory = (role: 'host' | 'guest', roomCode: string, gameId: string) => Transport;
