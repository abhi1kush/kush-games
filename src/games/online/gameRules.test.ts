// Connect Four and Checkers online rules, validated through the real Rust/wasm engines.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as checkersModule from '../../wasm/checkers/checkers.js';
import * as connectFourModule from '../../wasm/connect_four/connect_four.js';
import { checkersRules, CheckersColor, moveText, replayPaths } from '../checkers/rules';
import { connectFourRules } from '../connectfour/rules';
import type { DiscColor } from '../connectfour/save';
import { createMatch as createChessMatch } from '../chess/match';
import { createOnlineMatch, emptyGuestMatch, OnlineRules } from './match';
import { createMemoryLink } from './memoryTransport';
import { handleMessage, parseMessage } from './protocol';
import { parseSavedOnlineRoom } from './save';
import { RoomSession } from './session';

const wasmBytes = (name: string) => readFileSync(new URL(`../../wasm/${name}/${name}_bg.wasm`, import.meta.url));
beforeAll(() => {
  checkersModule.initSync({ module: wasmBytes('checkers') });
  connectFourModule.initSync({ module: wasmBytes('connect_four') });
});

function pair<Color extends string>(rules: OnlineRules<Color>) {
  const link = createMemoryLink();
  const host = new RoomSession(rules, 'host', createOnlineMatch(rules), link.host, () => undefined);
  const guest = new RoomSession(rules, 'guest', emptyGuestMatch(rules), link.guest, () => undefined);
  host.start();
  guest.start();
  link.connect();
  link.flush();
  return { link, host, guest };
}

describe('Connect Four online rules', () => {
  it('moves are column digits checked by the wasm rules', () => {
    expect(connectFourRules.isMoveText('3')).toBe(true);
    expect(connectFourRules.isMoveText('7')).toBe(false);
    expect(connectFourRules.isMoveText(3)).toBe(false);
    expect(parseMessage(connectFourRules, { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' })).toBeNull();
    const fullColumn = ['0', '0', '0', '0', '0', '0'];
    expect(connectFourRules.isLegalLine(fullColumn)).toBe(true);
    expect(connectFourRules.legalMove(fullColumn, '0')).toBeNull();
    expect(connectFourRules.isLegalLine([...fullColumn, '0'])).toBe(false);
    const redWins = ['0', '6', '1', '6', '2', '6', '3'];
    expect(connectFourRules.isOverOnBoard(redWins)).toBe(true);
    expect(connectFourRules.legalMove(redWins, '5')).toBeNull(); // no moves after a win
  });

  it('host is Red and moves first; win detected on both ends; rematch swaps first player', () => {
    const { link, host, guest } = pair<DiscColor>(connectFourRules);
    expect(host.color).toBe('red');
    expect(guest.color).toBe('yellow');
    expect(guest.playMove('3')).toBeNull();
    for (const [index, column] of ['0', '6', '1', '6', '2', '6', '3'].entries()) {
      expect((index % 2 === 0 ? host : guest).playMove(column)).toBe(column);
      link.flush();
    }
    expect(host.match).toEqual(guest.match);
    expect(connectFourRules.isOverOnBoard(guest.match.moves)).toBe(true);
    expect(guest.isMyTurn).toBe(false);
    guest.requestRematch();
    link.flush();
    host.requestRematch();
    link.flush();
    expect(guest.color).toBe('red');
    expect(guest.isMyTurn).toBe(true);
    expect(host.match).toEqual(guest.match);
  });

  it('an illegal column from the other side is refused and answered with a sync', () => {
    const match = { ...createOnlineMatch(connectFourRules), moves: ['0', '0', '0', '0', '0', '0'] };
    const result = handleMessage(connectFourRules, match, { type: 'move', gameNumber: 1, ply: 6, move: '0' }, 'host');
    expect(result.match).toBe(match);
    expect(result.replies[0].type).toBe('sync');
  });

  it('validates saved rooms', () => {
    const match = { ...createOnlineMatch(connectFourRules), moves: ['3', '3'] };
    expect(parseSavedOnlineRoom(connectFourRules, { mode: 'online', role: 'host', roomCode: 'K7M2Q', match })).toEqual({ mode: 'online', role: 'host', roomCode: 'K7M2Q', match });
    expect(parseSavedOnlineRoom(connectFourRules, { mode: 'online', role: 'host', roomCode: 'K7M2Q', match: createChessMatch() })).toBeNull(); // a chess match isn't a Connect Four match
    expect(parseSavedOnlineRoom(connectFourRules, { mode: 'online', role: 'host', roomCode: 'K7M2Q', match: { ...match, moves: ['9'] } })).toBeNull();
    expect(parseSavedOnlineRoom(connectFourRules, { mode: 'online', role: 'host', roomCode: 'K7M2Q', match: { ...match, hostColor: 'w' } })).toBeNull();
  });
});

describe('Checkers online rules', () => {
  it('moves are from/to paths; only the engine’s legal paths are accepted; captures are forced', () => {
    expect(checkersRules.isMoveText('21-17')).toBe(true);
    expect(checkersRules.isMoveText('21-40')).toBe(false);
    expect(checkersRules.isMoveText('21')).toBe(false);
    const opening = replayPaths([])!.legalMoves.map(moveText);
    expect(opening).toHaveLength(7);
    expect(checkersRules.legalMove([], opening[0])).toBe(opening[0]);
    expect(checkersRules.legalMove([], '0-4')).toBeNull(); // light piece / wrong side
    expect(checkersRules.legalMove([], '21-13')).toBeNull(); // not a legal step
    // Play legal moves until a capture comes up.
    let line: string[] = [];
    for (let attempt = 0; attempt < 40 && !replayPaths(line)!.legalMoves.some(move => move.captured.length > 0); attempt++) {
      const legal = replayPaths(line)!.legalMoves;
      line = [...line, moveText(legal[attempt % legal.length])];
    }
    const replayed = replayPaths(line)!;
    expect(replayed.legalMoves.every(move => move.captured.length > 0)).toBe(true); // forced capture: only jumps are legal
    const capture = moveText(replayed.legalMoves[0]);
    expect(checkersRules.legalMove(line, capture)).toBe(capture);
    expect(checkersRules.isLegalLine([...line, capture])).toBe(true);
  });

  it('host plays Dark and moves first; guest gets Light; moves sync; rematch swaps', () => {
    const { link, host, guest } = pair<CheckersColor>(checkersRules);
    expect(host.color).toBe('dark');
    expect(guest.color).toBe('light');
    for (let ply = 0; ply < 6; ply++) {
      const mover = ply % 2 === 0 ? host : guest;
      const legal = replayPaths(mover.match.moves)!.legalMoves;
      expect(mover.playMove(moveText(legal[0]))).not.toBeNull();
      link.flush();
    }
    expect(guest.match).toEqual(host.match);
    expect(guest.match.moves).toHaveLength(6);
    const forged = handleMessage(checkersRules, host.match, { type: 'move', gameNumber: 1, ply: 6, move: '0-4' }, 'host');
    expect(forged.match).toBe(host.match);
    guest.offerDraw();
    link.flush();
    host.acceptDraw();
    link.flush();
    expect(guest.match.ending).toEqual({ kind: 'draw-agreed' });
    host.requestRematch();
    link.flush();
    guest.requestRematch();
    link.flush();
    expect(host.color).toBe('light');
    expect(guest.color).toBe('dark');
    expect(guest.isMyTurn).toBe(true);
  });
});
