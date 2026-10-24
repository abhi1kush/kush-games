/**
 * Ludo room messages and the room state the host broadcasts. Guests only ever send intents (roll, move a token,
 * leave, rename, rematch); the host checks them against its own copy of the rules and its own dice.
 */
import { normalizeRoomCode } from '../online/room';
import { decodeSnapshot, SNAPSHOT_LENGTH } from './engine';

export const LUDO_PROTOCOL = 1;
export const MAX_PLAYERS = 4;
export const NAME_MAX_LENGTH = 16;

export type PlayerStatus = 'lobby' | 'playing' | 'finished' | 'left' | 'kicked' | 'forfeited';
export interface RoomPlayer {
  clientId: string;
  name: string;
  seat: number;
  connected: boolean;
  isBot: boolean;
  status: PlayerStatus;
  wantsRematch: boolean;
}
export interface RoomEvent { id: number; text: string; kind: EventKind; }
export type EventKind = 'info' | 'capture' | 'home' | 'finish' | 'strike' | 'forfeit' | 'leave' | 'kick' | 'host' | 'join' | 'six' | 'start' | 'over';
export interface TurnClock { remainingMs: number; totalMs: number; key: string; }

export interface RoomState {
  version: number;
  roomCode: string;
  hostId: string;
  phase: 'lobby' | 'playing' | 'finished';
  gameNumber: number;
  players: RoomPlayer[];
  banned: string[];
  snapshot: number[] | null;
  clock: TurnClock | null;
  turnSeconds: number;
  events: RoomEvent[];
}

export type RejectReason = 'full' | 'in-progress' | 'kicked' | 'left' | 'version';
export type GuestMessage =
  | { t: 'join'; protocol: number; clientId: string; name: string }
  | { t: 'roll' }
  | { t: 'move'; token: number }
  | { t: 'leave' }
  | { t: 'rename'; name: string }
  | { t: 'rematch' };
export type HostMessage =
  | { t: 'state'; state: RoomState }
  | { t: 'kicked' }
  | { t: 'rejected'; reason: RejectReason }
  | { t: 'host-leaving'; successor: string | null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInteger = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
const isClientId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{4,40}$/i.test(value);

/** Trim, collapse spaces, drop control characters and cut to the maximum length. */
export function cleanName(value: unknown, fallback = 'Player'): string {
  if (typeof value !== 'string') return fallback;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return name || fallback;
}

export function parseGuestMessage(data: unknown): GuestMessage | null {
  if (!isRecord(data) || typeof data.t !== 'string') return null;
  switch (data.t) {
    case 'join': return isInteger(data.protocol, 1, 1000) && isClientId(data.clientId) ? { t: 'join', protocol: data.protocol, clientId: data.clientId, name: cleanName(data.name) } : null;
    case 'roll': case 'leave': case 'rematch': return { t: data.t };
    case 'move': return isInteger(data.token, 0, 3) ? { t: 'move', token: data.token } : null;
    case 'rename': return { t: 'rename', name: cleanName(data.name) };
    default: return null;
  }
}

const STATUSES: readonly PlayerStatus[] = ['lobby', 'playing', 'finished', 'left', 'kicked', 'forfeited'];
const EVENT_KINDS: readonly EventKind[] = ['info', 'capture', 'home', 'finish', 'strike', 'forfeit', 'leave', 'kick', 'host', 'join', 'six', 'start', 'over'];

function parsePlayer(value: unknown): RoomPlayer | null {
  if (!isRecord(value) || !isClientId(value.clientId) || !isInteger(value.seat, 0, 3) || !STATUSES.includes(value.status as PlayerStatus)) return null;
  return {
    clientId: value.clientId, name: cleanName(value.name), seat: value.seat, connected: value.connected === true, isBot: value.isBot === true,
    status: value.status as PlayerStatus, wantsRematch: value.wantsRematch === true,
  };
}

/** Validate a room state from the network or storage (the shape, not the game: only the host can change that). */
export function parseRoomState(value: unknown): RoomState | null {
  if (!isRecord(value) || !isInteger(value.version, 0, Number.MAX_SAFE_INTEGER) || !isClientId(value.hostId) || !isInteger(value.gameNumber, 0, 1e6)) return null;
  const roomCode = typeof value.roomCode === 'string' ? (value.roomCode === 'LOCAL' ? 'LOCAL' : normalizeRoomCode(value.roomCode)) : null;
  if (!roomCode || !['lobby', 'playing', 'finished'].includes(value.phase as string)) return null;
  if (!Array.isArray(value.players) || value.players.length > MAX_PLAYERS) return null;
  const players = value.players.map(parsePlayer);
  if (players.some(player => player === null)) return null;
  const seats = new Set(players.map(player => player!.seat));
  if (seats.size !== players.length) return null;
  const banned = Array.isArray(value.banned) ? value.banned.filter(isClientId).slice(0, 50) : [];
  let snapshot: number[] | null = null;
  if (value.snapshot !== null && value.snapshot !== undefined) {
    if (!Array.isArray(value.snapshot) || value.snapshot.length !== SNAPSHOT_LENGTH || !value.snapshot.every(byte => isInteger(byte, 0, 255))) return null;
    snapshot = [...value.snapshot] as number[];
    if (!decodeSnapshot(snapshot)) return null;
  }
  let clock: TurnClock | null = null;
  if (isRecord(value.clock) && isInteger(value.clock.remainingMs, 0, 600_000) && isInteger(value.clock.totalMs, 1, 600_000) && typeof value.clock.key === 'string') {
    clock = { remainingMs: value.clock.remainingMs, totalMs: value.clock.totalMs, key: value.clock.key.slice(0, 40) };
  }
  const events = Array.isArray(value.events) ? value.events.filter((event): event is RoomEvent =>
    isRecord(event) && isInteger(event.id, 0, Number.MAX_SAFE_INTEGER) && typeof event.text === 'string' && EVENT_KINDS.includes(event.kind as EventKind))
    .slice(-12).map(event => ({ id: event.id, text: event.text.slice(0, 140), kind: event.kind })) : [];
  return {
    version: value.version, roomCode, hostId: value.hostId, phase: value.phase as RoomState['phase'], gameNumber: value.gameNumber,
    players: players as RoomPlayer[], banned, snapshot, clock, turnSeconds: isInteger(value.turnSeconds, 0, 120) ? value.turnSeconds : 20, events,
  };
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data) || typeof data.t !== 'string') return null;
  switch (data.t) {
    case 'state': { const state = parseRoomState(data.state); return state ? { t: 'state', state } : null; }
    case 'kicked': return { t: 'kicked' };
    case 'rejected': return ['full', 'in-progress', 'kicked', 'left', 'version'].includes(data.reason as string) ? { t: 'rejected', reason: data.reason as RejectReason } : null;
    case 'host-leaving': return { t: 'host-leaving', successor: isClientId(data.successor) ? data.successor : null };
    default: return null;
  }
}

/** Players still in the current game (or the lobby). */
export const isSeated = (player: RoomPlayer) => player.status === 'lobby' || player.status === 'playing' || player.status === 'finished';

/** Who takes over as host if the host goes: seated, connected humans in join order. */
export const successorsOf = (state: RoomState) =>
  state.players.filter(player => player.clientId !== state.hostId && isSeated(player) && player.connected && !player.isBot).map(player => player.clientId);

export function createClientId(random: () => number = Math.random): string {
  let id = 'p-';
  for (let index = 0; index < 12; index++) id += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(random() * 32)];
  return id;
}
