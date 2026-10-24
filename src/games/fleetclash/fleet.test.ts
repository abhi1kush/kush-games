import { describe, expect, it } from 'vitest';
import { ALL_SUNK, fleetText, isValidFleet, Mark, occupancy, parseFleetText } from './engine';
import { answersFor, commitmentOf, fleetRules, replayBattle, responseText } from './online';

// Carrier A1–E1, Destroyer A3–A6, Frigate H8–J8, Submarine J1–J3, Patrol boat F10–G10
const FLEET = [0, 0, 20, 1, 77, 0, 9, 1, 95, 0];
const OTHER = [90, 0, 0, 1, 33, 0, 55, 1, 18, 0];
const cells = (code: number[]) => occupancy(code).flatMap((ship, cell) => (ship >= 0 ? [cell] : []));

describe('Fleet Clash fleets', () => {
  it('checks placements and round-trips the network text', () => {
    expect(isValidFleet(FLEET)).toBe(true);
    expect(isValidFleet([0, 0, 2, 0, 77, 0, 9, 1, 95, 0])).toBe(false); // destroyer on the carrier
    expect(isValidFleet([6, 0, 20, 1, 77, 0, 9, 1, 95, 0])).toBe(false); // carrier off the sea
    expect(fleetText(FLEET)).toBe('00h20v77h09v95h');
    expect(parseFleetText(fleetText(FLEET))).toEqual(FLEET);
    expect(cells(FLEET)).toHaveLength(17);
  });
  it('answers shots: miss, hit, sunk', () => {
    expect(answersFor(FLEET, [55, 95, 96, 97])).toEqual([1, 2, 14, 1]);
    expect(responseText(FLEET, [95, 96])).toBe('rs495h');
    expect(responseText(FLEET, [11])).toBe('rm');
  });
});

describe('Fleet Clash online move list', () => {
  const hash = 'c' + 'a'.repeat(64);
  it('commits first, then alternates fire and answers', () => {
    expect(fleetRules.colorToMove([])).toBe('navy');
    expect(fleetRules.legalMove([], 'f00')).toBeNull();
    expect(fleetRules.legalMove([], hash)).toBe(hash);
    expect(fleetRules.colorToMove([hash])).toBe('saffron');
    const start = [hash, hash];
    expect(fleetRules.colorToMove(start)).toBe('navy');
    expect(fleetRules.legalMove(start, 'f42')).toBe('f42');
    expect(fleetRules.colorToMove([...start, 'f42'])).toBe('saffron'); // the defender answers
    expect(fleetRules.legalMove([...start, 'f42'], 'f10')).toBeNull();
    expect(fleetRules.colorToMove([...start, 'f42', 'rm'])).toBe('saffron'); // then fires
    expect(fleetRules.legalMove([...start, 'f42', 'rm', 'f42'], 'rh')).toBe('rh');
    expect(fleetRules.legalMove([...start, 'f42', 'rm', 'f42', 'rh'], 'f42')).toBeNull(); // same cell twice
  });
  it('only accepts a sunk answer after the rest of the ship was hit', () => {
    const start = [hash, hash, 'f95', 'rh', 'f00', 'rm', 'f96'];
    expect(fleetRules.legalMove(start, 'rs495h')).toBe('rs495h');
    expect(fleetRules.legalMove([hash, hash, 'f96'], 'rs495h')).toBeNull();
    expect(fleetRules.legalMove(start, 'rs496h')).toBeNull(); // would leave the sea
  });
  it('plays a whole game, reveals both fleets and spots a dishonest answer', async () => {
    const moves = ['c' + await commitmentOf(fleetText(FLEET), 'aa'), 'c' + await commitmentOf(fleetText(OTHER), 'bb')];
    const atOther: number[] = [], atFleet: number[] = [];
    const misses = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 31, 32, 34, 35];
    const targets = cells(OTHER);
    targets.forEach((cell, index) => {
      atOther.push(cell);
      moves.push(`f${String(cell).padStart(2, '0')}`, responseText(OTHER, atOther));
      if (index < targets.length - 1) { atFleet.push(misses[index]); moves.push(`f${misses[index]}`, responseText(FLEET, atFleet)); }
      expect(fleetRules.isLegalLine(moves)).toBe(true);
    });
    const battle = replayBattle(moves)!;
    expect(battle.winner).toBe(0);
    expect(battle.seas[0].sunkMask).toBe(ALL_SUNK);
    expect(battle.seas[0].marks.filter(mark => mark === Mark.Sunk)).toHaveLength(17);
    expect(battle.expected).toEqual({ kind: 'reveal', by: 1 });
    expect(fleetRules.isOverOnBoard(moves)).toBe(false);
    expect(fleetRules.legalMove(moves, 'f00')).toBeNull();
    const done = replayBattle([...moves, `v${fleetText(OTHER)}.00112233445566778899`, `v${fleetText(FLEET)}.99887766554433221100`])!;
    expect(done.expected.kind).toBe('done');
    expect(done.dishonest).toEqual([false, false]);
    expect(await commitmentOf(fleetText(OTHER), 'bb')).toBe(moves[1].slice(1));
    // a defender whose revealed fleet contradicts an answer is flagged
    const misplaced = [...moves, `v${fleetText([0, 0, 20, 1, 77, 0, 9, 1, 95, 0])}.00112233445566778899`];
    expect(replayBattle(misplaced)!.dishonest[1]).toBe(true);
  });
});
