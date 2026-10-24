/**
 * Carrom online: the match is the shot list. Both browsers replay it in wasm (the physics is deterministic), so a
 * shot only needs the striker's spot, the aim point and the power. One cached board follows the longest line seen.
 */
import type { OnlineRules } from '../online/match';
import { BASELINE_Y, Carrom, isShotText, parseShot, PHASE_AIM, startShot } from './engine';

export type CarromColor = 'white' | 'black';
export const CARROM_COLORS: readonly [CarromColor, CarromColor] = ['white', 'black'];

let cache: { line: string[]; game: Carrom; valid: boolean } | null = null;

/** The board after `moves` (shared, don't free); `valid` false if a shot in the list was illegal. */
export function boardAfter(moves: readonly string[]): { game: Carrom; valid: boolean } {
  if (!cache) cache = { line: [], game: new Carrom(), valid: true };
  const isExtension = moves.length >= cache.line.length && cache.line.every((move, index) => moves[index] === move);
  if (!isExtension) { cache.game.reset(); cache.line = []; cache.valid = true; }
  for (let index = cache.line.length; index < moves.length; index++) {
    if (cache.valid && startShot(cache.game, moves[index])) cache.game.settle(); else cache.valid = false;
    cache.line.push(moves[index]);
  }
  return cache;
}

export const carromRules: OnlineRules<CarromColor> = {
  gameId: 'carrom',
  colors: CARROM_COLORS,
  isMoveText: isShotText,
  isLegalLine: moves => moves.length <= 600 && boardAfter(moves).valid,
  legalMove(moves, move) {
    const { game, valid } = boardAfter(moves);
    const shot = parseShot(move);
    if (!valid || !shot || game.phase() !== PHASE_AIM || game.winner() !== 255 || !game.can_place(shot.x)) return null;
    if (Math.hypot(shot.aimX - shot.x, shot.aimY - BASELINE_Y[game.turn()]) < 1) return null;
    return move;
  },
  colorToMove: moves => CARROM_COLORS[boardAfter(moves).game.turn()],
  isOverOnBoard: moves => boardAfter(moves).game.winner() !== 255,
};
