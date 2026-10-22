//! Checkers (English draughts) rules and computer opponent for JavaScript.
//! A game is the list of chosen move indices (into each position's legal move list), replayed for undo and saves.
pub mod ai;
pub mod rules;

pub use ai::Searcher;
pub use rules::{Move, Position, DARK, LIGHT};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Checkers {
    position: Position,
    history: Vec<u8>,
    moves: Vec<Move>,
    searcher: Option<Searcher>,
    last_nodes: u32,
}

#[wasm_bindgen]
impl Checkers {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Checkers {
        let position = Position::start();
        Checkers { moves: position.legal_moves(), position, history: Vec::new(), searcher: None, last_nodes: 0 }
    }

    /// 32 squares: 0 empty, 1 dark man, 2 dark king, 3 light man, 4 light king.
    pub fn cells(&self) -> Vec<u8> {
        (0..32).map(|square| {
            let mask = 1u32 << square;
            let king = if self.position.kings & mask != 0 { 1 } else { 0 };
            if self.position.dark & mask != 0 { 1 + king } else if self.position.light & mask != 0 { 3 + king } else { 0 }
        }).collect()
    }

    /// Legal moves, flattened: for each move `from, capturedMask, pathLength, path…`.
    pub fn legal_moves(&self) -> Vec<u32> {
        let mut flat = Vec::new();
        for candidate in &self.moves {
            flat.push(candidate.from as u32);
            flat.push(candidate.captured);
            flat.push(candidate.path_length as u32);
            for &square in &candidate.path[..candidate.path_length as usize] { flat.push(square as u32); }
        }
        flat
    }

    pub fn move_count(&self) -> u32 { self.moves.len() as u32 }

    /// Play legal move number `index`.
    pub fn apply(&mut self, index: u32) -> bool {
        if self.winner() != 0 { return false; }
        let Some(chosen) = self.moves.get(index as usize).copied() else { return false };
        self.position = self.position.apply(&chosen);
        self.moves = self.position.legal_moves();
        self.history.push(index as u8);
        true
    }

    /// Take back `plies` moves (e.g. 2 to undo your move and the computer's reply).
    pub fn undo(&mut self, plies: u32) -> bool {
        if self.history.is_empty() { return false; }
        let keep = self.history.len().saturating_sub(plies as usize);
        let replay: Vec<u8> = self.history[..keep].to_vec();
        self.load(&replay)
    }

    pub fn load(&mut self, history: &[u8]) -> bool {
        *self = Checkers { searcher: self.searcher.take(), ..Checkers::new() };
        for &index in history {
            if !self.apply(index as u32) { *self = Checkers { searcher: self.searcher.take(), ..Checkers::new() }; return false; }
        }
        true
    }

    pub fn history(&self) -> Vec<u8> { self.history.clone() }
    pub fn side_to_move(&self) -> u8 { self.position.side }
    pub fn quiet_plies(&self) -> u32 { self.position.quiet_plies as u32 }

    /// 0 playing, 1 dark won, 2 light won, 3 draw.
    pub fn winner(&self) -> u32 {
        if self.moves.is_empty() { return if self.position.side == DARK { 2 } else { 1 }; }
        if self.position.quiet_plies >= rules::DRAW_PLIES { 3 } else { 0 }
    }

    /// Bitmask of pieces that have a capture (captures are compulsory).
    pub fn capturing_pieces(&self) -> u32 { ai::capturing_pieces(&self.moves) }

    /// The computer's move index for the side to move (level 0 easy, 1 medium, 2 hard), -1 if none.
    pub fn best_move(&mut self, level: u32, seed: u32, node_budget: u32) -> i32 {
        if self.winner() != 0 { return -1; }
        let searcher = self.searcher.get_or_insert_with(Searcher::new);
        let index = searcher.best_move(&self.position, level, seed, node_budget as u64);
        self.last_nodes = searcher.nodes as u32;
        index.map_or(-1, |index| index as i32)
    }

    pub fn last_nodes(&self) -> u32 { self.last_nodes }

    /// Set up an arbitrary position (used by tests): bitmasks plus side to move.
    pub fn set_position(&mut self, dark: u32, light: u32, kings: u32, side: u8) {
        self.position = Position { dark, light, kings, side, quiet_plies: 0 };
        self.moves = self.position.legal_moves();
        self.history.clear();
    }
}

impl Default for Checkers { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests;
