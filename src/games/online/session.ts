/**
 * One side of an online room: keeps the match, talks to the other browser through a Transport and reports changes
 * to the UI. Game rules come from OnlineRules; message rules from protocol.ts; the network from the Transport.
 */
import {
  acceptDraw, applyOnlineMove, colorOfRole, declineDraw, declineRematch, isMatchOver, offerDraw, offerRematch,
  OnlineMatch, OnlineRules, resignMatch, Role, startRematch,
} from './match';
import { GameMessageType, handleMessage, Message, Notice, parseMessage, PROTOCOL_VERSION, syncMessage } from './protocol';
import type { ConnectionInfo, Transport } from './transport';

export interface SessionUpdate<Color extends string> {
  match: OnlineMatch<Color>;
  connection: ConnectionInfo;
  /** The move that just arrived from the opponent, if any. */
  opponentMove?: string;
  notice?: Notice;
}

export class RoomSession<Color extends string> {
  match: OnlineMatch<Color>;
  connection: ConnectionInfo = { status: 'starting' };
  private stopped = false;

  constructor(
    private readonly rules: OnlineRules<Color>,
    readonly role: Role,
    initialMatch: OnlineMatch<Color>,
    private readonly transport: Transport,
    private readonly onUpdate: (update: SessionUpdate<Color>) => void,
  ) {
    this.match = initialMatch;
  }

  start() {
    this.transport.start({
      onOpen: () => {
        // Both sides introduce themselves and send their whole match, so they converge.
        this.transport.send({ type: 'hello', protocol: PROTOCOL_VERSION, role: this.role, game: this.rules.gameId });
        this.transport.send(syncMessage(this.match));
      },
      onMessage: data => this.receive(data),
      onStatus: info => {
        if (this.stopped || this.connection.problem === 'version') return;
        if (info.status === this.connection.status && info.problem === this.connection.problem) return;
        this.connection = info;
        this.notify({});
      },
    });
  }

  stop() {
    this.stopped = true;
    this.transport.stop();
  }

  get color(): Color { return colorOfRole(this.rules, this.match, this.role); }
  get isMyTurn() { return !isMatchOver(this.rules, this.match) && this.rules.colorToMove(this.match.moves) === this.color; }

  /** Play our move; returns its normal form when legal and it is our turn, else null. */
  playMove(move: string): string | null {
    const next = applyOnlineMove(this.rules, this.match, move, this.color);
    if (!next) return null;
    const ply = this.match.moves.length;
    this.match = next;
    this.transport.send({ type: 'move', gameNumber: next.gameNumber, ply, move: next.moves[ply] });
    this.notify({});
    return next.moves[ply];
  }

  resign() { this.change(resignMatch(this.rules, this.match, this.color), 'resign'); }
  offerDraw() { this.change(offerDraw(this.rules, this.match, this.color), 'draw-offer'); }
  acceptDraw() { this.change(acceptDraw(this.rules, this.match, this.color), 'draw-accept'); }
  declineDraw() {
    if (this.match.drawOfferFrom === this.color) return; // only the player it was offered to can decline
    this.change(declineDraw(this.match), 'draw-decline');
  }

  /** "New game" after a finished game: accepts the friend's request, or asks for a rematch. */
  requestRematch() {
    if (this.match.rematchOfferFrom && this.match.rematchOfferFrom !== this.color) this.acceptRematch();
    else this.change(offerRematch(this.rules, this.match, this.color), 'rematch-offer');
  }

  acceptRematch() {
    if (!this.match.rematchOfferFrom || this.match.rematchOfferFrom === this.color || !isMatchOver(this.rules, this.match)) return;
    this.change(startRematch(this.rules, this.match), 'rematch-accept');
  }

  declineRematch() {
    if (!this.match.rematchOfferFrom || this.match.rematchOfferFrom === this.color) return;
    this.change(declineRematch(this.match), 'rematch-decline');
  }

  /** Apply a local change and tell the other side; messages carry the game number the action was about. */
  private change(next: OnlineMatch<Color>, type: GameMessageType) {
    if (next === this.match) return;
    const gameNumber = this.match.gameNumber;
    this.match = next;
    this.transport.send({ type, gameNumber } as Message);
    this.notify({});
  }

  private receive(data: unknown) {
    if (this.stopped) return;
    const message = parseMessage(this.rules, data);
    if (!message || message.type === 'ping') return;
    const result = handleMessage(this.rules, this.match, message, this.role);
    for (const reply of result.replies) this.transport.send(reply);
    if (result.versionMismatch) {
      this.connection = { status: 'failed', problem: 'version' };
      this.notify({});
      return;
    }
    if (result.match !== this.match || result.notice) {
      this.match = result.match;
      this.notify({ opponentMove: result.appliedMove, notice: result.notice });
    }
  }

  private notify(extra: { opponentMove?: string; notice?: Notice }) {
    this.onUpdate({ match: this.match, connection: this.connection, ...extra });
  }
}
