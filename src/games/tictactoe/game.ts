/** Tic-Tac-Toe rules and the computer player. A board is 9 cells in row order. */
export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[];

export const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const emptyBoard = (): Board => Array(9).fill(null);
export const otherMark = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');
export const emptyCells = (board: Board) => board.flatMap((cell, index) => (cell === null ? [index] : []));

/** The winner and the winning line, a draw, or null while the game goes on. */
export function outcomeOf(board: Board): { winner: Mark; line: number[] } | { winner: 'draw'; line: null } | null {
  for (const line of WIN_LINES) {
    const [first, second, third] = line;
    const mark = board[first];
    if (mark && mark === board[second] && mark === board[third]) return { winner: mark, line };
  }
  return board.every(Boolean) ? { winner: 'draw', line: null } : null;
}

/** Whose turn it is, given who started. */
export function markToMove(board: Board, firstMark: Mark): Mark {
  const placed = board.filter(Boolean).length;
  return placed % 2 === 0 ? firstMark : otherMark(firstMark);
}

/**
 * Minimax score from `computer`'s point of view. Wins score higher the sooner they come and losses
 * lower the later, so the computer finishes quickly and resists as long as possible.
 */
function minimax(board: Board, toMove: Mark, computer: Mark, depth: number): number {
  const outcome = outcomeOf(board);
  if (outcome) {
    if (outcome.winner === 'draw') return 0;
    return outcome.winner === computer ? 10 - depth : depth - 10;
  }
  let bestScore = toMove === computer ? -Infinity : Infinity;
  for (const index of emptyCells(board)) {
    board[index] = toMove;
    const score = minimax(board, otherMark(toMove), computer, depth + 1);
    board[index] = null;
    bestScore = toMove === computer ? Math.max(bestScore, score) : Math.min(bestScore, score);
  }
  return bestScore;
}

/** The best move for `computer`; among equally good moves picks with `random` so games vary. */
export function bestMove(board: Board, computer: Mark, random: () => number = Math.random): number {
  const working = [...board];
  let bestScore = -Infinity;
  let bestMoves: number[] = [];
  for (const index of emptyCells(working)) {
    working[index] = computer;
    const score = minimax(working, otherMark(computer), computer, 1);
    working[index] = null;
    if (score > bestScore) { bestScore = score; bestMoves = [index]; }
    else if (score === bestScore) bestMoves.push(index);
  }
  return bestMoves[Math.floor(random() * bestMoves.length)] ?? -1;
}

/** Easy computer: takes an immediate win or blocks about half the time, otherwise plays randomly. */
export function easyMove(board: Board, computer: Mark, random: () => number = Math.random): number {
  const open = emptyCells(board);
  const completing = (mark: Mark) => open.find(index => { const trial = [...board]; trial[index] = mark; return outcomeOf(trial)?.winner === mark; });
  if (random() < 0.5) {
    const winning = completing(computer);
    if (winning !== undefined) return winning;
    const blocking = completing(otherMark(computer));
    if (blocking !== undefined) return blocking;
  }
  return open[Math.floor(random() * open.length)] ?? -1;
}

export type Difficulty = 'easy' | 'hard';
export const computerMove = (board: Board, computer: Mark, difficulty: Difficulty, random: () => number = Math.random) =>
  difficulty === 'hard' ? bestMove(board, computer, random) : easyMove(board, computer, random);
