/** A local game (vs computer or pass and play): two fleets and the shots, replayed with the wasm rules. */
import { applyResult, emptySea, FleetAi, FleetBoard, type FleetCode, isValidFleet, MISS, placementsOf, type SeaView, SUNK } from './engine';
import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';

export type LocalMode = 'computer' | 'friends';
export interface LocalGame {
  mode: LocalMode;
  level: number;
  /** Who fires first (0 or 1); against the computer, you are player 0. */
  first: 0 | 1;
  names: [string, string];
  fleets: [FleetCode, FleetCode];
  /** Every shot, in order (players alternate, starting with `first`). */
  shots: number[];
  seed: number;
}

export interface LocalState {
  /** seas[i]: what player i knows about the other fleet. */
  seas: [SeaView, SeaView];
  /** Who fires next (or who won when over). */
  turn: 0 | 1;
  winner: 0 | 1 | null;
  /** The last shot: who fired, where, and the result (1 miss, 2 hit, 10+ship sunk). */
  last: { by: 0 | 1; cell: number; result: number } | null;
}

export function replayLocal(game: LocalGame): LocalState {
  const boards = game.fleets.map(code => FleetBoard.from_code(Uint8Array.from(code))!);
  const seas: [SeaView, SeaView] = [emptySea(), emptySea()];
  let turn = game.first;
  let winner: 0 | 1 | null = null;
  let last: LocalState['last'] = null;
  for (const cell of game.shots) {
    if (winner !== null) break;
    const defender = (1 - turn) as 0 | 1;
    const result = boards[defender].shoot(cell);
    if (result === 0) break;
    const placement = result >= SUNK ? placementsOf(game.fleets[defender])[result - SUNK] : null;
    seas[turn] = applyResult(seas[turn], cell, result, placement);
    last = { by: turn, cell, result };
    if (boards[defender].all_sunk()) winner = turn;
    else turn = defender;
  }
  boards.forEach(board => board.free());
  return { seas, turn: winner ?? turn, winner, last };
}

/** The computer's next shot, rebuilt from what it has seen (player 1 attacks player 0). */
export function computerShot(game: LocalGame, state: LocalState): number {
  const ai = new FleetAi(game.level, (game.seed ^ (game.shots.length * 2654435761)) >>> 0 || 1);
  const sea = state.seas[1];
  for (let cell = 0; cell < 100; cell++) if (sea.marks[cell] === 1) ai.record(cell, MISS, 0, false); else if (sea.marks[cell] === 2) ai.record(cell, 2, 0, false);
  for (const placement of sea.sunk) ai.record(placement.start, SUNK + placement.ship, placement.start, placement.vertical);
  const cell = ai.choose();
  ai.free();
  return cell;
}

export function parseLocalGame(data: unknown): LocalGame | null {
  if (!isRecord(data) || !isOneOf(data.mode, ['computer', 'friends'] as const) || !isInteger(data.level, 0, 2) || (data.first !== 0 && data.first !== 1)) return null;
  if (!Array.isArray(data.fleets) || data.fleets.length !== 2 || !data.fleets.every(isValidFleet)) return null;
  if (!Array.isArray(data.shots) || data.shots.length > 200 || !data.shots.every(cell => isInteger(cell, 0, 99))) return null;
  if (!Array.isArray(data.names) || data.names.length !== 2 || !data.names.every(name => typeof name === 'string' && name.length <= 24)) return null;
  if (!isInteger(data.seed, 0, 0xffffffff)) return null;
  return { mode: data.mode, level: data.level, first: data.first, names: [data.names[0], data.names[1]], fleets: [data.fleets[0], data.fleets[1]], shots: data.shots as number[], seed: data.seed as number };
}

export const createFleetSaveSlot = () => createSaveSlot<LocalGame>({ gameId: 'fleet-clash', version: 1, parse: parseLocalGame });
