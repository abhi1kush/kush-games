/**
 * Fleet Clash online: a move list, like the other two-player games, but with hidden fleets.
 *
 * - Each player first sends a commitment `c<sha-256>` of their fleet and a random salt (the first player, then the
 *   second), so neither fleet ever crosses the network during the game.
 * - Then players alternate: the shooter sends `f<cell>` and the defender's browser answers by itself with
 *   `rm` (miss), `rh` (hit) or `rs<ship><start><h|v>` (sunk, showing where that ship was).
 * - When a fleet is gone, both browsers reveal `v<fleet>.<salt>` (loser first); each side checks the reveal against
 *   the commitment and every answer given during the game.
 */
import type { OnlineRules } from '../online/match';
import { applyResult, emptySea, type FleetCode, HIT, MISS, occupancy, parseFleetText, type Placement, type SeaView, shipCells, SHIPS, SUNK, ALL_SUNK } from './engine';

export type FleetColor = 'navy' | 'saffron';
export const FLEET_COLORS: readonly [FleetColor, FleetColor] = ['navy', 'saffron'];
export const colorName = (color: FleetColor) => (color === 'navy' ? 'Navy' : 'Saffron');

const COMMIT = /^c[0-9a-f]{64}$/;
const FIRE = /^f\d{2}$/;
const RESPONSE = /^r(m|h|s[0-4]\d{2}[hv])$/;
const REVEAL = /^v(\d{2}[hv]){5}\.[0-9a-f]{16,64}$/;

export type Expected =
  | { kind: 'commit'; by: 0 | 1 }
  | { kind: 'fire'; by: 0 | 1 }
  | { kind: 'respond'; by: 0 | 1; cell: number }
  | { kind: 'reveal'; by: 0 | 1 }
  | { kind: 'done' };

export interface Reveal { fleet: FleetCode; salt: string; text: string; }
export interface OnlineBattle {
  commits: [string | null, string | null];
  /** seas[i]: what player i (0 = first colour) knows about the other fleet. */
  seas: [SeaView, SeaView];
  /** Shots fired at player i's fleet, in order. */
  incoming: [number[], number[]];
  /** Answers player i gave (cell, result) — checked when they reveal. */
  answers: [{ cell: number; result: number }[], { cell: number; result: number }[]];
  reveals: [Reveal | null, Reveal | null];
  /** True when a revealed fleet doesn't match that player's answers. */
  dishonest: [boolean, boolean];
  winner: 0 | 1 | null;
  expected: Expected;
  lastShot: { by: 0 | 1; cell: number; result: number | null } | null;
}

/** Replays a move list; null if a move is out of place or malformed. */
export function replayBattle(moves: readonly string[]): OnlineBattle | null {
  const battle: OnlineBattle = {
    commits: [null, null], seas: [emptySea(), emptySea()], incoming: [[], []], answers: [[], []], reveals: [null, null], dishonest: [false, false],
    winner: null, expected: { kind: 'commit', by: 0 }, lastShot: null,
  };
  for (const move of moves) if (!step(battle, move)) return null;
  return battle;
}

function step(battle: OnlineBattle, move: string): boolean {
  const expected = battle.expected;
  switch (expected.kind) {
    case 'commit':
      if (!COMMIT.test(move)) return false;
      battle.commits[expected.by] = move.slice(1);
      battle.expected = expected.by === 0 ? { kind: 'commit', by: 1 } : { kind: 'fire', by: 0 };
      return true;
    case 'fire': {
      if (!FIRE.test(move)) return false;
      const cell = Number(move.slice(1));
      const defender = (1 - expected.by) as 0 | 1;
      if (battle.incoming[defender].includes(cell)) return false;
      battle.incoming[defender].push(cell);
      battle.lastShot = { by: expected.by, cell, result: null };
      battle.expected = { kind: 'respond', by: defender, cell };
      return true;
    }
    case 'respond': {
      if (!RESPONSE.test(move)) return false;
      const defender = expected.by, shooter = (1 - defender) as 0 | 1;
      const sea = battle.seas[shooter];
      let result: number, placement: Placement | null = null;
      if (move === 'rm') result = MISS;
      else if (move === 'rh') result = HIT;
      else {
        const ship = Number(move[2]);
        placement = { ship, start: Number(move.slice(3, 5)), vertical: move[5] === 'v' };
        const cells = shipCells(placement.start, placement.vertical, SHIPS[ship].length);
        if (!cells || sea.sunkMask & (1 << ship) || !cells.includes(expected.cell)) return false;
        // every other part of the sunk ship must have been answered "hit" before
        if (!cells.every(cell => cell === expected.cell || sea.marks[cell] === HIT)) return false;
        result = SUNK + ship;
      }
      battle.seas[shooter] = applyResult(sea, expected.cell, result, placement);
      battle.answers[defender].push({ cell: expected.cell, result });
      battle.lastShot = { by: shooter, cell: expected.cell, result };
      if (battle.seas[shooter].sunkMask === ALL_SUNK) { battle.winner = shooter; battle.expected = { kind: 'reveal', by: defender }; }
      else battle.expected = { kind: 'fire', by: defender };
      return true;
    }
    case 'reveal': {
      if (!REVEAL.test(move)) return false;
      const [text, salt] = move.slice(1).split('.');
      const fleet = parseFleetText(text);
      if (!fleet) return false;
      battle.reveals[expected.by] = { fleet, salt, text };
      battle.dishonest[expected.by] = !answersMatch(fleet, battle.incoming[expected.by], battle.answers[expected.by]);
      battle.expected = battle.reveals[0] && battle.reveals[1] ? { kind: 'done' } : { kind: 'reveal', by: (1 - expected.by) as 0 | 1 };
      return true;
    }
    case 'done':
      return false;
  }
}

/** The answer a fleet gives to each shot in order (1 miss, 2 hit, 10 + ship sunk). */
export function answersFor(fleet: FleetCode, shots: readonly number[]): number[] {
  const owner = occupancy(fleet);
  const left = SHIPS.map(ship => ship.length);
  const seen = new Set<number>();
  return shots.map(cell => {
    const ship = owner[cell];
    if (ship < 0 || seen.has(cell)) { seen.add(cell); return MISS; }
    seen.add(cell);
    left[ship] -= 1;
    return left[ship] === 0 ? SUNK + ship : HIT;
  });
}

function answersMatch(fleet: FleetCode, shots: readonly number[], answers: readonly { cell: number; result: number }[]): boolean {
  const truth = answersFor(fleet, shots.slice(0, answers.length));
  return answers.every((answer, index) => answer.result === truth[index]);
}

/** The defender's answer text for the last shot at `fleet`. */
export function responseText(fleet: FleetCode, shots: readonly number[]): string {
  const answers = answersFor(fleet, shots);
  const result = answers[answers.length - 1];
  if (result === MISS) return 'rm';
  if (result === HIT) return 'rh';
  const ship = result - SUNK;
  return `rs${ship}${String(fleet[ship * 2]).padStart(2, '0')}${fleet[ship * 2 + 1] ? 'v' : 'h'}`;
}

/** sha-256 of the fleet and salt (hex). */
export async function commitmentOf(fleetTextValue: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fleet-clash|${fleetTextValue}|${salt}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export const randomSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map(byte => byte.toString(16).padStart(2, '0')).join('');

let cachedLine = '';
let cachedBattle: OnlineBattle | null = null;
export function battleOf(moves: readonly string[]): OnlineBattle | null {
  const line = moves.join(' ');
  if (line !== cachedLine || (!cachedBattle && moves.length === 0)) { cachedLine = line; cachedBattle = replayBattle(moves); }
  return cachedBattle;
}

const byOf = (moves: readonly string[]): 0 | 1 | null => { const expected = battleOf(moves)?.expected; return expected && expected.kind !== 'done' ? expected.by : null; };

export const fleetRules: OnlineRules<FleetColor> = {
  gameId: 'fleet-clash',
  colors: FLEET_COLORS,
  isMoveText: (value): value is string => typeof value === 'string' && (COMMIT.test(value) || FIRE.test(value) || RESPONSE.test(value) || REVEAL.test(value)),
  isLegalLine: moves => moves.length <= 420 && replayBattle(moves) !== null,
  legalMove(moves, move) {
    const battle = battleOf(moves);
    if (!battle || battle.expected.kind === 'done') return null;
    return replayBattle([...moves, move]) ? move : null;
  },
  colorToMove: moves => FLEET_COLORS[byOf(moves) ?? 0],
  isOverOnBoard: moves => battleOf(moves)?.expected.kind === 'done',
};
