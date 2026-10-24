//! Ludo rules for JavaScript. The room's host runs the only authoritative copy (dice come from its RNG); every
//! browser gets the state as a 56-byte snapshot (see `Game::snapshot`), so a new host can take over mid-game.
pub mod rules;
#[cfg(test)]
mod tests;
use rules::{Game, Phase};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Ludo { game: Game }

#[wasm_bindgen]
impl Ludo {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Ludo { Ludo { game: Game::new(seed) } }
    /// Seats as a bit mask (bit 0 Red, 1 Green, 2 Yellow, 3 Blue); `first` rolls first.
    pub fn start(&mut self, seats_mask: u8, first: u8) -> bool { self.game.start(seats_mask, first) }
    pub fn roll(&mut self) -> u8 { self.game.roll() }
    pub fn move_token(&mut self, token: u8) -> bool { self.game.move_token(token) }
    pub fn pass_turn(&mut self) -> bool { self.game.pass_turn() }
    /// 0 nothing, 1 auto-played (strike added), 2 forfeited on the third strike
    pub fn timeout(&mut self) -> u8 { self.game.timeout() as u8 }
    pub fn remove_seat(&mut self, seat: u8) -> bool { self.game.remove_seat(seat) }
    /// The move a computer player (or an auto-played turn) would make, 255 if none.
    pub fn choose_move(&self) -> u8 { if self.game.phase == Phase::AwaitMove { self.game.choose_move() } else { 255 } }
    pub fn phase(&self) -> u8 { self.game.phase as u8 }
    pub fn current(&self) -> u8 { self.game.current }
    pub fn dice(&self) -> u8 { self.game.dice }
    pub fn legal_mask(&self) -> u8 { self.game.legal_mask() }
    pub fn snapshot(&self) -> Vec<u8> { self.game.snapshot().to_vec() }
    pub fn restore(&mut self, bytes: &[u8]) -> bool { self.game.restore(bytes) }
    pub fn reseed(&mut self, seed: u32) { self.game.rng = seed | 1; }
    /// Tests only: the next roll's value.
    pub fn debug_force_roll(&mut self, value: u8) { self.game.forced_roll = value.min(6); }
    pub fn debug_set_progress(&mut self, seat: u8, token: u8, progress: u8) { self.game.progress[(seat & 3) as usize][(token & 3) as usize] = progress; }
}
