/**
 * An online room on one side: keeps the match, talks to the other browser through a Transport,
 * and reports changes to the UI. The rules live in match.ts / protocol.ts; the network in the
 * Transport (PeerJS in the app, an in-memory pair in tests).
 */
import type { Move } from 'chess.js';
import {
  acceptDraw, applyMove, colorToMove, declineDraw, MatchState, matchOutcome, offerDraw, offerRematch, replayMoves, resign, startRematch,
} from './match';
import { handleMessage, Message, myColor, parseMessage, PROTOCOL_VERSION, Role, syncMessage } from './protocol';

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
  /** Returns false when there is no open connection (the message is dropped; a sync follows on reconnect). */
  send(message: Message): boolean;
  stop(): void;
}

export interface SessionUpdate {
  match: MatchState;
  connection: ConnectionInfo;
  /** The move that just arrived from the opponent, if any. */
  opponentMove?: string;
}

export class RoomSession {
  match: MatchState;
  connection: ConnectionInfo = { status: 'starting' };
  private stopped = false;

  constructor(
    readonly role: Role,
    initialMatch: MatchState,
    private readonly transport: Transport,
    private readonly onUpdate: (update: SessionUpdate) => void,
  ) {
    this.match = initialMatch;
  }

  start() {
    this.transport.start({
      onOpen: () => {
        // Both sides introduce themselves and send their whole match, so they converge.
        this.transport.send({ type: 'hello', protocol: PROTOCOL_VERSION, role: this.role });
        this.transport.send(syncMessage(this.match));
      },
      onMessage: data => this.receive(data),
      onStatus: info => {
        if (this.stopped) return;
        if (info.status === this.connection.status && info.problem === this.connection.problem) return;
        this.connection = info;
        this.notify();
      },
    });
  }

  stop() {
    this.stopped = true;
    this.transport.stop();
  }

  get color() { return myColor(this.match, this.role); }
  get isMyTurn() { return colorToMove(this.match) === this.color; }

  /** Play our move; returns the move when legal and it is our turn. */
  playMove(uci: string): Move | null {
    const result = applyMove(this.match, uci, this.color);
    if (!result) return null;
    const ply = this.match.moves.length;
    this.match = result.match;
    this.transport.send({ type: 'move', gameNumber: this.match.gameNumber, ply, uci: this.match.moves[ply], san: result.move.san });
    this.notify();
    return result.move;
  }

  resign() { this.change(resign(this.match, this.color), { type: 'resign', gameNumber: this.match.gameNumber }); }
  offerDraw() { this.change(offerDraw(this.match, this.color), { type: 'draw-offer', gameNumber: this.match.gameNumber }); }
  acceptDraw() { this.change(acceptDraw(this.match, this.color), { type: 'draw-accept', gameNumber: this.match.gameNumber }); }
  declineDraw() { this.change(declineDraw(this.match), { type: 'draw-decline', gameNumber: this.match.gameNumber }); }

  offerRematch() {
    const game = replayMoves(this.match.moves);
    if (!game || !matchOutcome(this.match, game).isOver || this.match.rematchOfferFrom) return;
    this.change(offerRematch(this.match, this.color), { type: 'rematch-offer', gameNumber: this.match.gameNumber });
  }

  acceptRematch() {
    if (!this.match.rematchOfferFrom || this.match.rematchOfferFrom === this.color) return;
    const finishedGame = this.match.gameNumber;
    this.change(startRematch(this.match), { type: 'rematch-accept', gameNumber: finishedGame });
  }

  private change(next: MatchState, message: Message) {
    if (next === this.match) return;
    this.match = next;
    this.transport.send(message);
    this.notify();
  }

  private receive(data: unknown) {
    if (this.stopped) return;
    const message = parseMessage(data);
    if (!message || message.type === 'ping') return;
    const result = handleMessage(this.match, message, this.role);
    for (const reply of result.replies) this.transport.send(reply);
    if (result.versionMismatch) {
      this.connection = { status: 'failed', problem: 'version' };
      this.notify();
      return;
    }
    if (result.match !== this.match) {
      this.match = result.match;
      this.notify(result.appliedMove);
    }
  }

  private notify(opponentMove?: string) {
    this.onUpdate({ match: this.match, connection: this.connection, opponentMove });
  }
}
