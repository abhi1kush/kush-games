//! Snakes & Ladders rules for JavaScript. Same method names and phases as the Ludo engine, so the shared turn-game
//! room code (host authority, strikes, host migration) drives both. The state travels as a 34-byte snapshot.
pub mod rules;
#[cfg(test)]
mod tests;
use rules::Game;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SnakesLadders { game: Game }

#[wasm_bindgen]
impl SnakesLadders {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> SnakesLadders { SnakesLadders { game: Game::new(seed) } }
    pub fn set_variant(&mut self, board: u8) -> bool { self.game.set_board(board) }
    pub fn start(&mut self, seats_mask: u8, first: u8) -> bool { self.game.start(seats_mask, first) }
    pub fn roll(&mut self) -> u8 { self.game.roll() }
    /// No choices in this game: every roll moves the token by itself.
    pub fn move_token(&mut self, _token: u8) -> bool { false }
    pub fn pass_turn(&mut self) -> bool { self.game.pass_turn() }
    /// 0 nothing, 1 auto-rolled (strike added), 2 forfeited on the third strike
    pub fn timeout(&mut self) -> u8 { self.game.timeout() as u8 }
    pub fn remove_seat(&mut self, seat: u8) -> bool { self.game.remove_seat(seat) }
    pub fn choose_move(&self) -> u8 { 255 }
    pub fn phase(&self) -> u8 { self.game.phase as u8 }
    pub fn current(&self) -> u8 { self.game.current }
    pub fn legal_mask(&self) -> u8 { 0 }
    pub fn snapshot(&self) -> Vec<u8> { self.game.snapshot().to_vec() }
    pub fn restore(&mut self, bytes: &[u8]) -> bool { self.game.restore(bytes) }
    pub fn reseed(&mut self, seed: u32) { self.game.rng = seed | 1; }
    /// The board's jumps as [from, to, from, to, …] (for drawing it).
    pub fn board_jumps(board: u8) -> Vec<u8> {
        rules::BOARDS[(board % rules::BOARD_COUNT) as usize].iter().flat_map(|&(from, to)| [from, to]).collect()
    }
    pub fn board_count() -> u8 { rules::BOARD_COUNT }
    /// Tests only: the next roll's value.
    pub fn debug_force_roll(&mut self, value: u8) { self.game.forced_roll = value.min(6); }
    pub fn debug_set_position(&mut self, seat: u8, square: u8) { self.game.positions[(seat & 3) as usize] = square.min(100); }
}
