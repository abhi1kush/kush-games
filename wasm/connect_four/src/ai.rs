//! Negamax with alpha-beta pruning, a transposition table, centre-first move ordering and a threat-counting
//! evaluation for positions the search can't see to the end of.
use crate::board::{Board, CELLS, HEIGHT, WIDTH, column_mask};

pub const WIN_SCORE: i32 = 10_000;
const COLUMN_ORDER: [usize; WIDTH] = [3, 2, 4, 1, 5, 0, 6];
const TABLE_BITS: u32 = 18;

#[derive(Clone, Copy)]
struct TableEntry { key: u64, score: i16, depth: u8, bound: u8 }
const EXACT: u8 = 0;
const LOWER: u8 = 1;
const UPPER: u8 = 2;

pub struct Searcher {
    table: Vec<TableEntry>,
    pub nodes: u64,
    node_budget: u64,
    out_of_budget: bool,
}

/// Small deterministic random numbers (xorshift) for the easier levels.
pub struct Random(u32);
impl Random {
    pub fn new(seed: u32) -> Self { Random(seed | 1) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    pub fn below(&mut self, limit: u32) -> u32 { self.next() % limit.max(1) }
}

/// Count of 4-cell windows (inside the board) per bit — used to weight the centre.
fn window_lines() -> Vec<u64> {
    let mut lines = Vec::new();
    let directions: [(i32, i32); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];
    for column in 0..WIDTH as i32 {
        for row in 0..HEIGHT as i32 {
            for (column_step, row_step) in directions {
                let end_column = column + column_step * 3;
                let end_row = row + row_step * 3;
                if end_column < 0 || end_column >= WIDTH as i32 || end_row < 0 || end_row >= HEIGHT as i32 { continue; }
                let mut bits = 0u64;
                for i in 0..4 { bits |= crate::board::cell_bit((column + column_step * i) as usize, (row + row_step * i) as usize); }
                lines.push(bits);
            }
        }
    }
    lines
}

impl Searcher {
    pub fn new() -> Self {
        Searcher {
            table: vec![TableEntry { key: 0, score: 0, depth: 0, bound: 0 }; 1 << TABLE_BITS],
            nodes: 0, node_budget: u64::MAX, out_of_budget: false,
        }
    }

    /// Score for the player to move: open threes and twos, and stones near the centre.
    pub fn evaluate(board: &Board, lines: &[u64]) -> i32 {
        let own = board.current;
        let other = board.current ^ board.mask;
        let mut score = 0;
        for &line in lines {
            let own_count = (line & own).count_ones();
            let other_count = (line & other).count_ones();
            if other_count == 0 { score += [0, 1, 6, 40, 0][own_count as usize]; }
            if own_count == 0 { score -= [0, 1, 6, 40, 0][other_count as usize]; }
        }
        score += 3 * ((own & column_mask(3)).count_ones() as i32 - (other & column_mask(3)).count_ones() as i32);
        score.clamp(-WIN_SCORE / 2, WIN_SCORE / 2)
    }

    fn negamax(&mut self, board: &Board, depth: u32, mut alpha: i32, mut beta: i32, lines: &[u64]) -> i32 {
        self.nodes += 1;
        if self.nodes > self.node_budget { self.out_of_budget = true; return 0; }
        if board.moves as usize >= CELLS { return 0; }
        for column in 0..WIDTH {
            if board.can_play(column) && board.is_winning_move(column) { return WIN_SCORE - board.moves as i32; }
        }
        let safe = board.non_losing_cells();
        if safe == 0 { return -(WIN_SCORE - board.moves as i32 - 1); }
        if board.moves as usize >= CELLS - 2 { return 0; }
        if depth == 0 { return Self::evaluate(board, lines); }

        let slot = (board.key() as usize ^ (board.key() >> 32) as usize) & ((1 << TABLE_BITS) - 1);
        let entry = self.table[slot];
        if entry.key == board.key() && entry.depth as u32 >= depth {
            let stored = entry.score as i32;
            match entry.bound {
                EXACT => return stored,
                LOWER => alpha = alpha.max(stored),
                _ => beta = beta.min(stored),
            }
            if alpha >= beta { return stored; }
        }
        let original_alpha = alpha;
        // order: centre first, but moves that make more threats go before
        let mut candidates: [(i32, usize); WIDTH] = [(i32::MIN, 0); WIDTH];
        let mut count = 0;
        for &column in COLUMN_ORDER.iter() {
            let cell = safe & column_mask(column);
            if cell == 0 { continue; }
            let threats = Board::winning_cells(board.current | cell, board.mask).count_ones() as i32;
            candidates[count] = (threats * 4 - count as i32, column);
            count += 1;
        }
        candidates[..count].sort_unstable_by(|first, second| second.0.cmp(&first.0));
        let mut best = -WIN_SCORE * 2;
        for &(_, column) in &candidates[..count] {
            let mut next = *board;
            next.play(column);
            let score = -self.negamax(&next, depth - 1, -beta, -alpha, lines);
            if self.out_of_budget { return 0; }
            if score > best { best = score; }
            if score > alpha { alpha = score; }
            if alpha >= beta { break; }
        }
        let bound = if best <= original_alpha { UPPER } else if best >= beta { LOWER } else { EXACT };
        self.table[slot] = TableEntry { key: board.key(), score: best as i16, depth: depth as u8, bound };
        best
    }

    /// Scores of every playable column at `depth` (None for full columns), or None if the budget ran out.
    fn score_columns(&mut self, board: &Board, depth: u32, lines: &[u64]) -> Option<[Option<i32>; WIDTH]> {
        let mut scores = [None; WIDTH];
        for column in 0..WIDTH {
            if !board.can_play(column) { continue; }
            if board.is_winning_move(column) { scores[column] = Some(WIN_SCORE); continue; }
            let mut next = *board;
            next.play(column);
            let score = -self.negamax(&next, depth.saturating_sub(1), -WIN_SCORE * 2, WIN_SCORE * 2, lines);
            if self.out_of_budget { return None; }
            scores[column] = Some(score);
        }
        Some(scores)
    }

    /// Pick a column. `level`: 0 easy, 1 medium, 2 hard. `node_budget` caps the work for the hard level.
    pub fn best_move(&mut self, board: &Board, level: u32, seed: u32, node_budget: u64) -> Option<usize> {
        let playable: Vec<usize> = (0..WIDTH).filter(|&column| board.can_play(column)).collect();
        if playable.is_empty() { return None; }
        let mut random = Random::new(seed);
        let lines = window_lines();
        self.nodes = 0;
        self.out_of_budget = false;
        let winning = playable.iter().copied().find(|&column| board.is_winning_move(column));
        let opponent_wins = Board::winning_cells(board.current ^ board.mask, board.mask) & board.playable_cells();
        let blocking = playable.iter().copied().find(|&column| opponent_wins & column_mask(column) != 0);
        if level == 0 {
            // easy: usually takes a win or blocks one, otherwise a shallow look with lots of randomness
            if let Some(column) = winning { if random.below(100) < 80 { return Some(column); } }
            if let Some(column) = blocking { if random.below(100) < 60 { return Some(column); } }
            if random.below(100) < 45 { return Some(playable[random.below(playable.len() as u32) as usize]); }
        }
        if let Some(column) = winning { return Some(column); }
        let (max_depth, budget) = match level { 0 => (2, 50_000), 1 => (5, 200_000), _ => (CELLS as u32, node_budget) };
        self.node_budget = budget;
        let mut best_scores = None;
        for depth in 1..=max_depth.min(CELLS as u32 - board.moves) {
            match self.score_columns(board, depth, &lines) {
                Some(scores) => {
                    let decided = scores.iter().flatten().any(|&score| score.abs() > WIN_SCORE / 2 && score > 0)
                        || scores.iter().flatten().all(|&score| score.abs() > WIN_SCORE / 2);
                    best_scores = Some(scores);
                    if decided { break; }
                }
                None => break,
            }
        }
        let scores = best_scores?;
        let noise = if level == 1 { 12 } else if level == 0 { 40 } else { 0 };
        let mut best_column = None;
        let mut best_value = i32::MIN;
        for &column in COLUMN_ORDER.iter() {
            if let Some(score) = scores[column] {
                let value = if score.abs() > WIN_SCORE / 2 { score * 4 } else { score + random.below(noise + 1) as i32 };
                if value > best_value { best_value = value; best_column = Some(column); }
            }
        }
        best_column
    }
}

impl Default for Searcher { fn default() -> Self { Self::new() } }



