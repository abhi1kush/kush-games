//! Alpha-beta search (negamax) with iterative deepening, a transposition table and capture extensions.
use crate::rules::{row_of, column_of, Move, Position, DARK, DRAW_PLIES, SQUARES};

pub const WIN_SCORE: i32 = 100_000;
const TABLE_BITS: u32 = 17;

#[derive(Clone, Copy, Default)]
struct TableEntry { key: u64, score: i32, depth: i8, bound: u8, best: u8 }
const EXACT: u8 = 0;
const LOWER: u8 = 1;
const UPPER: u8 = 2;

pub struct Random(u32);
impl Random {
    pub fn new(seed: u32) -> Self { Random(seed | 1) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    pub fn below(&mut self, limit: u32) -> u32 { self.next() % limit.max(1) }
}

fn position_key(position: &Position) -> u64 {
    let mut key = (position.dark as u64) | ((position.light as u64) << 32);
    key ^= (position.kings as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (position.side as u64) << 63;
    key ^= key >> 31;
    key = key.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    key ^ (key >> 29)
}

/// Material plus small positional terms, from the side to move's point of view.
pub fn evaluate(position: &Position) -> i32 {
    let mut score = 0;
    for square in 0..SQUARES {
        let mask = 1u32 << square;
        let sign = if position.dark & mask != 0 { 1 } else if position.light & mask != 0 { -1 } else { continue };
        let is_king = position.kings & mask != 0;
        let row = row_of(square);
        let column = column_of(square);
        let mut value = if is_king { 175 } else { 100 };
        if !is_king {
            // men gain value as they advance; keeping the back row guarded helps defence
            let advance = if sign == 1 { 7 - row } else { row };
            value += advance * 3;
            if advance == 0 { value += 6; }
        }
        if (2..=5).contains(&column) && (2..=5).contains(&row) { value += 4; }
        score += sign * value;
    }
    if position.side == DARK { score } else { -score }
}

pub struct Searcher { table: Vec<TableEntry>, pub nodes: u64, budget: u64, out_of_budget: bool }

impl Default for Searcher { fn default() -> Self { Self::new() } }

impl Searcher {
    pub fn new() -> Self { Searcher { table: vec![TableEntry::default(); 1 << TABLE_BITS], nodes: 0, budget: u64::MAX, out_of_budget: false } }

    fn negamax(&mut self, position: &Position, depth: i32, mut alpha: i32, beta: i32, ply: i32) -> i32 {
        self.nodes += 1;
        if self.nodes > self.budget { self.out_of_budget = true; return 0; }
        if position.quiet_plies >= DRAW_PLIES { return 0; }
        let moves = position.legal_moves();
        if moves.is_empty() { return -(WIN_SCORE - ply); }
        let must_capture = moves[0].is_capture();
        // keep searching while captures are on the board, so exchanges are seen to the end
        if depth <= 0 && (!must_capture || depth < -8) { return evaluate(position); }

        let key = position_key(position);
        let slot = (key as usize) & ((1 << TABLE_BITS) - 1);
        let entry = self.table[slot];
        let mut best_index = 0usize;
        if entry.key == key {
            if entry.depth as i32 >= depth {
                match entry.bound {
                    EXACT => return entry.score,
                    LOWER if entry.score >= beta => return entry.score,
                    UPPER if entry.score <= alpha => return entry.score,
                    _ => {}
                }
            }
            if (entry.best as usize) < moves.len() { best_index = entry.best as usize; }
        }
        let original_alpha = alpha;
        let mut order: Vec<usize> = (0..moves.len()).collect();
        order.sort_by_key(|&index| (index != best_index, -(moves[index].captured.count_ones() as i32)));
        let mut best = -WIN_SCORE * 2;
        let mut best_move = best_index;
        for index in order {
            let score = -self.negamax(&position.apply(&moves[index]), depth - 1, -beta, -alpha, ply + 1);
            if self.out_of_budget { return 0; }
            if score > best { best = score; best_move = index; }
            if score > alpha { alpha = score; }
            if alpha >= beta { break; }
        }
        let bound = if best <= original_alpha { UPPER } else if best >= beta { LOWER } else { EXACT };
        self.table[slot] = TableEntry { key, score: best, depth: depth.clamp(-100, 100) as i8, bound, best: best_move as u8 };
        best
    }

    /// Choose a move index into `position.legal_moves()`. level 0 easy, 1 medium, 2 hard.
    pub fn best_move(&mut self, position: &Position, level: u32, seed: u32, node_budget: u64) -> Option<usize> {
        let moves = position.legal_moves();
        if moves.is_empty() { return None; }
        if moves.len() == 1 { return Some(0); }
        let mut random = Random::new(seed);
        if level == 0 && random.below(100) < 35 { return Some(random.below(moves.len() as u32) as usize); }
        let (max_depth, budget) = match level { 0 => (2, 20_000), 1 => (5, 150_000), _ => (20, node_budget) };
        self.nodes = 0;
        self.budget = budget;
        self.out_of_budget = false;
        let mut chosen: Option<Vec<i32>> = None;
        for depth in 1..=max_depth {
            let mut scores = Vec::with_capacity(moves.len());
            let mut alpha = -WIN_SCORE * 2;
            for chosen_move in &moves {
                let score = -self.negamax(&position.apply(chosen_move), depth - 1, -WIN_SCORE * 2, -alpha + 1, 1);
                if self.out_of_budget { break; }
                alpha = alpha.max(score);
                scores.push(score);
            }
            if self.out_of_budget { break; }
            let found_win = scores.iter().any(|&score| score > WIN_SCORE / 2);
            chosen = Some(scores);
            if found_win { break; }
        }
        let scores = chosen.unwrap_or_else(|| vec![0; moves.len()]);
        let noise = match level { 0 => 60, 1 => 15, _ => 0 };
        let mut best_index = 0;
        let mut best_value = i32::MIN;
        for (index, &score) in scores.iter().enumerate() {
            let value = if score.abs() > WIN_SCORE / 2 { score } else { score + random.below(noise + 1) as i32 };
            if value > best_value { best_value = value; best_index = index; }
        }
        Some(best_index)
    }
}

/// Used by the UI to show which pieces must capture.
pub fn capturing_pieces(moves: &[Move]) -> u32 { moves.iter().filter(|candidate| candidate.is_capture()).fold(0, |mask, candidate| mask | 1 << candidate.from) }
