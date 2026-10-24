// Ludo rooms end to end in memory: real Rust/wasm rules, real authority and room code, an in-memory PeerJS broker.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync, Ludo } from '../../wasm/ludo/ludo.js';
import { MemoryBroker, MemoryRoomNetwork } from '../online/memoryRoomNetwork';
import { hostPeerId } from '../online/room';
import { TurnAuthority, RECONNECT_GRACE_MS } from '../online/turnRoom/authority';
import { ludoSpec } from './spec';
import { decodeSnapshot, EnginePhase, HOME_COLUMNS, rotatePoint, TRACK, tokenPoint, YARD } from './engine';
import { cleanName, parseGuestMessage, parseRoomState } from '../online/turnRoom/protocol';
import { HOST_GRACE_MS, TurnRoom, type RoomView, type SavedRoom } from '../online/turnRoom/room';

beforeAll(() => { initSync({ module: readFileSync(new URL('../../wasm/ludo/ludo_bg.wasm', import.meta.url)) }); });

/** A fake clock + timers shared by every "browser" in a test. */
function createWorld() {
  let time = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; every: number | null; action: () => void }>();
  const broker = new MemoryBroker();
  const networks: MemoryRoomNetwork[] = [];
  const clock = {
    setTimeout: (action: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: time + ms, every: null, action }); return id; },
    clearTimeout: (handle: unknown) => { timers.delete(handle as number); },
    setInterval: (action: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: time + ms, every: ms, action }); return id; },
    clearInterval: (handle: unknown) => { timers.delete(handle as number); },
  };
  let seed = 12345;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const world = {
    broker,
    now: () => time,
    advance(ms: number) {
      const end = time + ms;
      while (true) {
        broker.flush();
        for (const network of networks) network.retry();
        broker.flush();
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        time = Math.max(time, timer.at);
        if (timer.every) timer.at += timer.every; else timers.delete(id);
        timer.action();
      }
      time = end;
      broker.flush();
    },
    browser(roomCode: string, myId: string, name: string, startAsHost: boolean, savedState: SavedRoom['state'] = null, turnSeconds = 20) {
      const network = broker.network(hostPeerId('ludo', roomCode));
      networks.push(network);
      let view: RoomView | null = null;
      let saved: SavedRoom | null = null;
      const room = new TurnRoom({
        spec: ludoSpec, roomCode, myId, myName: name, startAsHost, savedState, network, timers: clock,
        createEngine: () => new Ludo(7) as never,
        authority: { now: () => time, random, turnSeconds },
        onView: next => { view = next; },
        onSave: next => { saved = next; },
      });
      room.start();
      return { room, network, get view() { return view!; }, get saved() { return saved; } };
    },
  };
  return world;
}

const seatOf = (view: RoomView, clientId: string) => view.state!.players.find(player => player.clientId === clientId)!.seat;
const game = (view: RoomView) => decodeSnapshot(view.state!.snapshot)!;

describe('Ludo board geometry and protocol', () => {
  it('has a 52-square track of distinct cells and home columns off the track', () => {
    expect(TRACK).toHaveLength(52);
    expect(new Set(TRACK.map(cell => cell.join())).size).toBe(52);
    for (let index = 0; index < 52; index++) {
      const [x, y] = TRACK[index], [nextX, nextY] = TRACK[(index + 1) % 52];
      expect(Math.abs(x - nextX) + Math.abs(y - nextY), `step ${index}`).toBeLessThanOrEqual(2);
    }
    const trackCells = new Set(TRACK.map(cell => cell.join()));
    for (const column of HOME_COLUMNS) for (const cell of column) expect(trackCells.has(cell.join())).toBe(false);
    // each seat's last track square is next to the start of its home column
    for (let seat = 0; seat < 4; seat++) {
      const [lastX, lastY] = tokenPoint(seat, 0, 50), [homeX, homeY] = tokenPoint(seat, 0, 51);
      expect(Math.abs(lastX - homeX) + Math.abs(lastY - homeY)).toBe(1);
    }
    expect(rotatePoint(0.5, 0.5, 1)).toEqual([0.5, 14.5]);
    expect(rotatePoint(3, 4, 4)).toEqual([3, 4]);
  });

  it('cleans names and validates messages and states', () => {
    expect(cleanName('  Asha\u0007   Rao  ')).toBe('Asha Rao');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName('')).toBe('Player');
    expect(parseGuestMessage({ t: 'move', token: 9 })).toBeNull();
    expect(parseGuestMessage({ t: 'join', protocol: 1, clientId: 'p-abcdefgh', name: 'A' })).toEqual({ t: 'join', protocol: 1, clientId: 'p-abcdefgh', name: 'A' });
    expect(parseRoomState({ version: 1 }, ludoSpec)).toBeNull();
  });
});

describe('Ludo authority (local pass-and-play)', () => {
  it('plays a whole game of computer players to a full finish order', () => {
    let time = 0;
    const authority = TurnAuthority.createLocal(ludoSpec, new Ludo(3) as never, [0, 1, 2, 3].map(seat => ({ seat, name: `Bot ${seat}`, isBot: true })), { now: () => time, random: Math.random, turnSeconds: 0 });
    for (let step = 0; step < 50_000 && authority.state.phase === 'playing'; step++) { time += 800; authority.tick(); }
    expect(authority.state.phase).toBe('finished');
    const places = decodeSnapshot(authority.state.snapshot)!.places;
    expect([...places].sort()).toEqual([1, 2, 3, 4]);
    expect(authority.state.events.some(event => event.kind === 'over')).toBe(true);
  });
});

describe('Ludo online room (memory network)', () => {
  function fourPlayers() {
    const world = createWorld();
    const host = world.browser('ABCDE', 'p-host0000', 'Host', true);
    world.advance(10);
    const guests = ['p-asha0000', 'p-ben00000', 'p-chen0000'].map((id, index) => world.browser('ABCDE', id, ['Asha', 'Ben', 'Chen'][index], false));
    world.advance(50);
    return { world, host, guests };
  }

  it('seats up to four, rejects a fifth, lets the host kick (no rejoining) and start', () => {
    const { world, host, guests } = fourPlayers();
    expect(host.view.state!.players.map(player => player.name)).toEqual(['Host', 'Asha', 'Ben', 'Chen']);
    expect(host.view.state!.players.map(player => player.seat)).toEqual([0, 2, 1, 3]);
    expect(guests[2].view.state!.players).toHaveLength(4);
    const fifth = world.browser('ABCDE', 'p-dev00000', 'Dev', false);
    world.advance(50);
    expect(fifth.view.ending).toEqual({ kind: 'rejected', reason: 'full' });
    host.room.kick('p-chen0000');
    world.advance(500);
    expect(guests[2].view.ending).toEqual({ kind: 'kicked' });
    expect(host.view.state!.players).toHaveLength(3);
    const again = world.browser('ABCDE', 'p-chen0000', 'Chen', false);
    world.advance(500);
    expect(again.view.ending).toEqual({ kind: 'kicked' });
    guests[0].room.startGame(); // not the host: ignored
    world.advance(50);
    expect(host.view.state!.phase).toBe('lobby');
    host.room.startGame();
    world.advance(50);
    expect(guests[0].view.state!.phase).toBe('playing');
    expect(game(guests[1].view).active).toBe(0b0111);
  });

  it('only the current player can roll; dice come from the host', () => {
    const { world, host, guests } = fourPlayers();
    host.room.startGame();
    world.advance(50);
    const current = game(host.view).current;
    const players = [host, ...guests];
    const ids = ['p-host0000', 'p-asha0000', 'p-ben00000', 'p-chen0000'];
    const notCurrent = players.find((_, index) => seatOf(host.view, ids[index]) !== current)!;
    notCurrent.room.roll();
    world.advance(50);
    expect(game(host.view).rollId).toBe(0);
    const currentPlayer = players[ids.findIndex(id => seatOf(host.view, id) === current)];
    currentPlayer.room.roll();
    world.advance(50);
    expect(game(host.view).rollId).toBe(1);
    expect(game(guests[0].view).dice).toBeGreaterThanOrEqual(1);
  });

  it('auto-plays missed turns with strikes and forfeits on the third; leaving and host migration keep the game going', () => {
    const { world, host, guests } = fourPlayers();
    host.room.startGame();
    world.advance(50);
    const ids = ['p-host0000', 'p-asha0000', 'p-ben00000', 'p-chen0000'];
    const browsers = [host, ...guests];
    const ben = ids.indexOf('p-ben00000');
    // everybody except Ben plays instantly; Ben never acts
    const playActive = () => {
      const view = host.view;
      if (view.state!.phase !== 'playing') return;
      const current = game(view);
      const index = ids.findIndex(id => view.state!.players.find(player => player.clientId === id && player.status === 'playing')?.seat === current.current);
      if (index < 0 || index === ben) return;
      const room = browsers[index].room;
      if (current.phase === EnginePhase.AwaitRoll) room.roll();
      else if (current.phase === EnginePhase.AwaitMove) room.move(Math.log2(current.legalMask & -current.legalMask));
    };
    for (let step = 0; step < 4000; step++) {
      playActive();
      world.advance(250);
      const benPlayer = host.view.state!.players.find(player => player.clientId === 'p-ben00000')!;
      if (benPlayer.status === 'forfeited') break;
    }
    const benState = host.view.state!.players.find(player => player.clientId === 'p-ben00000')!;
    expect(benState.status).toBe('forfeited');
    expect(host.view.state!.events.some(event => event.kind === 'forfeit' && event.text.includes('Ben'))).toBe(true);
    expect(guests[0].view.state!.events.some(event => event.kind === 'forfeit')).toBe(true);
    expect(game(host.view).progress[benState.seat]).toEqual([254, 254, 254, 254]);

    // Chen leaves (confirm happens in the UI)
    guests[2].room.leave();
    world.advance(600);
    expect(host.view.state!.players.find(player => player.clientId === 'p-chen0000')!.status).toBe('left');
    expect(host.view.state!.phase).toBe('playing');

    // the host leaves: Asha takes over and the game continues
    host.room.leave();
    world.advance(1500);
    expect(guests[0].view.role).toBe('host');
    expect(guests[0].view.state!.hostId).toBe('p-asha0000');
    // only Asha remains → she wins
    expect(guests[0].view.state!.phase).toBe('finished');
    expect(game(guests[0].view).places[seatOf(guests[0].view, 'p-asha0000')]).toBe(1);
  });

  it('migrates the host after a crash and keeps playing with the others', () => {
    const { world, host, guests } = fourPlayers();
    host.room.startGame();
    world.advance(50);
    host.network.crash();
    world.advance(HOST_GRACE_MS + 1500);
    expect(guests[0].view.role).toBe('host');
    world.advance(200);
    expect(guests[1].view.network).toBe('connected');
    expect(guests[1].view.state!.hostId).toBe('p-asha0000');
    const oldHost = guests[0].view.state!.players.find(player => player.clientId === 'p-host0000')!;
    expect(oldHost.connected).toBe(false);
    expect(oldHost.status).toBe('playing');
    // the game goes on: whoever's turn it is can still roll (the old host's turns time out)
    world.advance(25_000);
    expect(guests[1].view.state!.events.some(event => event.kind === 'host')).toBe(true);
    // after the grace period the old host's seat is let go
    world.advance(RECONNECT_GRACE_MS);
    expect(guests[0].view.state!.players.find(player => player.clientId === 'p-host0000')!.status).not.toBe('playing');
  });

  it('a refreshed guest rejoins the same seat; a refreshed host resumes the room', () => {
    const { world, host, guests } = fourPlayers();
    host.room.startGame();
    world.advance(50);
    const seat = seatOf(host.view, 'p-ben00000');
    const saved = guests[1].saved!;
    guests[1].room.stop();
    world.advance(100);
    expect(host.view.state!.players.find(player => player.clientId === 'p-ben00000')!.connected).toBe(false);
    const again = world.browser('ABCDE', saved.clientId, saved.name, false, saved.state);
    world.advance(100);
    expect(seatOf(again.view, 'p-ben00000')).toBe(seat);
    expect(host.view.state!.players.find(player => player.clientId === 'p-ben00000')!.connected).toBe(true);

    const hostSave = host.saved!;
    host.room.stop();
    world.advance(1000);
    const resumed = world.browser('ABCDE', hostSave.clientId, hostSave.name, true, hostSave.state);
    world.advance(3000);
    expect(resumed.view.role).toBe('host');
    expect(guests[0].view.state!.hostId).toBe('p-host0000');
    expect(game(resumed.view).progress.flat().filter(progress => progress === YARD).length).toBeGreaterThan(0);
  });
});
