/** Loads the Klondike wasm once (only when the game opens) and decodes its layout bytes. */
import init, { Solitaire } from '../../wasm/solitaire/solitaire.js';

let ready: Promise<unknown> | null = null;
export const loadSolitaireEngine = () => (ready ??= init());
export { Solitaire };

export const STOCK = 0;
export const WASTE = 1;
export const FIRST_FOUNDATION = 2;
export const FIRST_COLUMN = 6;
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const suitOf = (card: number) => Math.floor(card / 13);
export const rankOf = (card: number) => card % 13;
export const isRed = (card: number) => suitOf(card) === 1 || suitOf(card) === 2;
export const cardName = (card: number) => `${RANK_NAMES[rankOf(card)]}${SUIT_SYMBOLS[suitOf(card)]}`;

export interface Layout {
  stockCount: number;
  waste: number[];
  foundations: number[][];
  columns: { cards: number[]; faceDown: number }[];
}

export function decodeLayout(bytes: Uint8Array): Layout {
  let offset = 0;
  const take = (count: number) => { const part = Array.from(bytes.subarray(offset, offset + count)); offset += count; return part; };
  const stockCount = bytes[offset++];
  const waste = take(bytes[offset++]);
  const foundations = Array.from({ length: 4 }, () => take(bytes[offset++]));
  const columns = Array.from({ length: 7 }, () => {
    const length = bytes[offset++];
    const faceDown = bytes[offset++];
    return { cards: take(length), faceDown };
  });
  return { stockCount, waste, foundations, columns };
}
