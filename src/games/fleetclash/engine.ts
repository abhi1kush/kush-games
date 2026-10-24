/** Loads the Fleet Clash wasm (fleets, shots, the computer player) once, plus the shared sea helpers. */
import init, { FleetAi, FleetBoard } from '../../wasm/fleet_clash/fleet_clash.js';

let ready: Promise<unknown> | null = null;
export const loadFleetEngine = () => (ready ??= init());
export { FleetAi, FleetBoard };

export const SIZE = 10;
export const CELLS = 100;
export const SHIPS = [
  { name: 'Carrier', length: 5 },
  { name: 'Destroyer', length: 4 },
  { name: 'Frigate', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Patrol boat', length: 2 },
] as const;
export const ALL_SUNK = 0b11111;
export const MISS = 1;
export const HIT = 2;
export const SUNK = 10;
export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard'] as const;

/** What a player knows about a cell of the enemy sea. */
export const enum Mark { Unknown = 0, Miss = 1, Hit = 2, Sunk = 3 }

export interface Placement { ship: number; start: number; vertical: boolean; }
/** A whole fleet: (start, vertical 0/1) for each of the five ships, the same 10 bytes the wasm uses. */
export type FleetCode = number[];

export const columnLetter = (column: number) => 'ABCDEFGHIJ'[column];
export const cellName = (cell: number) => `${columnLetter(cell % SIZE)}${Math.floor(cell / SIZE) + 1}`;

export function shipCells(start: number, vertical: boolean, length: number): number[] | null {
  if (!Number.isInteger(start) || start < 0 || start >= CELLS) return null;
  const row = Math.floor(start / SIZE), column = start % SIZE;
  if ((vertical && row + length > SIZE) || (!vertical && column + length > SIZE)) return null;
  return Array.from({ length }, (_, step) => (vertical ? start + step * SIZE : start + step));
}

export const placementsOf = (code: FleetCode): Placement[] => SHIPS.map((_, ship) => ({ ship, start: code[ship * 2], vertical: code[ship * 2 + 1] === 1 }));
export const codeOf = (placements: readonly Placement[]): FleetCode => {
  const code: number[] = [];
  for (let ship = 0; ship < SHIPS.length; ship++) { const placement = placements.find(item => item.ship === ship); code.push(placement?.start ?? 255, placement?.vertical ? 1 : 0); }
  return code;
};

/** A complete fleet with every ship on the sea and no overlaps (same check as the wasm). */
export function isValidFleet(code: unknown): code is FleetCode {
  if (!Array.isArray(code) || code.length !== 10) return false;
  const taken = new Set<number>();
  for (let ship = 0; ship < SHIPS.length; ship++) {
    if (code[ship * 2 + 1] !== 0 && code[ship * 2 + 1] !== 1) return false;
    const cells = shipCells(code[ship * 2], code[ship * 2 + 1] === 1, SHIPS[ship].length);
    if (!cells) return false;
    for (const cell of cells) { if (taken.has(cell)) return false; taken.add(cell); }
  }
  return true;
}

/** Fleet text for the network: "00h12v…" (two-digit start + h/v per ship). */
export const fleetText = (code: FleetCode) => placementsOf(code).map(({ start, vertical }) => `${String(start).padStart(2, '0')}${vertical ? 'v' : 'h'}`).join('');
export function parseFleetText(text: string): FleetCode | null {
  if (!/^(\d{2}[hv]){5}$/.test(text)) return null;
  const code: number[] = [];
  for (let ship = 0; ship < 5; ship++) code.push(Number(text.slice(ship * 3, ship * 3 + 2)), text[ship * 3 + 2] === 'v' ? 1 : 0);
  return isValidFleet(code) ? code : null;
}

/** Which ship (index) covers each cell of a fleet, or -1. */
export function occupancy(code: FleetCode): number[] {
  const cells = new Array<number>(CELLS).fill(-1);
  placementsOf(code).forEach(({ ship, start, vertical }) => shipCells(start, vertical, SHIPS[ship].length)?.forEach(cell => { cells[cell] = ship; }));
  return cells;
}

export function randomFleet(seed = (Math.random() * 0xffffffff) >>> 0): FleetCode {
  const board = new FleetBoard();
  board.randomize(seed || 1);
  const code = Array.from(board.code());
  board.free();
  return code;
}

/** A sea seen by an attacker: marks per cell, the enemy ships sunk so far (revealed), and the last shot. */
export interface SeaView {
  marks: Mark[];
  sunk: Placement[];
  sunkMask: number;
  lastShot: number | null;
  shots: number;
  hits: number;
}
export const emptySea = (): SeaView => ({ marks: new Array<Mark>(CELLS).fill(Mark.Unknown), sunk: [], sunkMask: 0, lastShot: null, shots: 0, hits: 0 });

/** Record a shot result on an attacker's view (immutably). For a sunk ship, `placement` is where it was. */
export function applyResult(sea: SeaView, cell: number, result: number, placement: Placement | null): SeaView {
  const marks = [...sea.marks];
  const next: SeaView = { ...sea, marks, lastShot: cell, shots: sea.shots + 1, hits: sea.hits + (result === MISS ? 0 : 1) };
  if (result === MISS) marks[cell] = Mark.Miss;
  else if (result === HIT) marks[cell] = Mark.Hit;
  else if (result >= SUNK && placement) {
    for (const part of shipCells(placement.start, placement.vertical, SHIPS[placement.ship].length) ?? []) marks[part] = Mark.Sunk;
    next.sunk = [...sea.sunk, placement];
    next.sunkMask = sea.sunkMask | (1 << placement.ship);
  }
  return next;
}
