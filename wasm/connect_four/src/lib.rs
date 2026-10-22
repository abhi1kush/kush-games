//! Connect Four rules and computer opponent, exported to JavaScript with wasm-bindgen.
//! The game is kept as the list of columns played; the board is replayed from it (cheap, and makes undo trivial).
pub mod ai;
mod board;

pub use ai::{Searcher, WIN_SCORE};
pub use board::{four_cells, has_four, Board, CELLS, HEIGHT, WIDTH};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ConnectFour {
    board: Board,
    history: Vec<u8>,
    searcher: Option<Searcher>,
    last_nodes: u32,
}

#[wasm_bindgen]
impl ConnectFour {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ConnectFour { ConnectFour { board: Board::new(), history: Vec::new(), searcher: None, last_nodes: 0 } }

    /// Drop a stone for the player to move. Returns the row (0 = bottom) or -1 if not allowed.
    pub fn play(&mut self, column: u32) -> i32 {
        let column = column as usize;
        if self.winner() != 0 || !self.board.can_play(column) { return -1; }
        self.history.push(column as u8);
        self.board.play(column) as i32
    }

    pub fn undo(&mut self) -> bool {
        if self.history.pop().is_none() { return false; }
        let moves = core::mem::take(&mut self.history);
        self.load(&moves);
        true
    }

    /// Replace the game with these columns (from a save). Returns false if they aren't a legal game.
    pub fn load(&mut self, columns: &[u8]) -> bool {
        self.board = Board::new();
        self.history.clear();
        for &column in columns {
            if self.play(column as u32) < 0 { self.board = Board::new(); self.history.clear(); return false; }
        }
        true
    }

    pub fn history(&self) -> Vec<u8> { self.history.clone() }

    /// 0 or 1: whose turn it is.
    pub fn player_to_move(&self) -> u32 { self.board.player_to_move() }

    /// 0 = still playing, 1 = first player won, 2 = second player won, 3 = draw.
    pub fn winner(&self) -> u32 {
        if self.board.moves > 0 && has_four(self.board.last_mover_stones()) { return 2 - self.board.moves % 2; }
        if self.board.is_full() { 3 } else { 0 }
    }

    /// 42 cells, index = column * 6 + row (row 0 = bottom): 0 empty, 1 first player, 2 second player.
    pub fn cells(&self) -> Vec<u8> {
        let first = if self.board.moves % 2 == 0 { self.board.current } else { self.board.current ^ self.board.mask };
        (0..WIDTH).flat_map(|column| (0..HEIGHT).map(move |row| (column, row))).map(|(column, row)| {
            let bit = board::cell_bit(column, row);
            if self.board.mask & bit == 0 { 0 } else if first & bit != 0 { 1 } else { 2 }
        }).collect()
    }

    /// Cells of the winning line(s), same numbering as `cells`.
    pub fn winning_cells(&self) -> Vec<u8> {
        if self.winner() == 1 || self.winner() == 2 { four_cells(self.board.last_mover_stones()) } else { Vec::new() }
    }

    /// The computer's column for the player to move: level 0 easy, 1 medium, 2 hard. -1 if the game is over.
    pub fn best_move(&mut self, level: u32, seed: u32, node_budget: u32) -> i32 {
        if self.winner() != 0 { return -1; }
        let searcher = self.searcher.get_or_insert_with(Searcher::new);
        let column = searcher.best_move(&self.board, level, seed, node_budget as u64);
        self.last_nodes = searcher.nodes as u32;
        column.map_or(-1, |column| column as i32)
    }

    /// Positions searched by the last `best_move`.
    pub fn last_nodes(&self) -> u32 { self.last_nodes }
}

impl Default for ConnectFour { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests;
