//! Klondike solitaire rules for JavaScript: seeded deal, draw-1 / draw-3, legal moves, scoring, hints, undo.
//! A game is (seed, draw count, list of actions); undo and saves replay that list.
mod klondike;
pub use klondike::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Solitaire { game: Klondike }

#[wasm_bindgen]
impl Solitaire {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32, draw_count: u32) -> Solitaire { Solitaire { game: Klondike::deal(seed, if draw_count == 3 { 3 } else { 1 }) } }

    /// Turn cards from the stock (or turn the waste back over when the stock is empty).
    pub fn draw(&mut self) -> bool { self.game.perform(Action::Draw) }

    /// Move `count` cards from location `from` to location `to` (0 stock, 1 waste, 2–5 foundations ♠♥♦♣, 6–12 columns).
    pub fn move_cards(&mut self, from: u32, count: u32, to: u32) -> bool {
        self.game.perform(Action::Move { from: from as u8, count: count as u8, to: to as u8 })
    }

    /// Tap-to-move: send the cards to the best legal place (foundation first). Returns the destination or -1.
    pub fn auto_move(&mut self, from: u32, count: u32) -> i32 {
        match self.game.best_destination(from as u8, count as u8) {
            Some(to) => { self.game.perform(Action::Move { from: from as u8, count: count as u8, to }); to as i32 }
            None => -1,
        }
    }

    /// Move one card to a foundation if it's safe (or any card when `safe_only` is false). Returns [from, to] or empty.
    pub fn foundation_step(&mut self, safe_only: bool) -> Vec<u8> {
        match self.game.foundation_candidate(safe_only) {
            Some((from, to)) => { self.game.perform(Action::Move { from, count: 1, to }); vec![from, to] }
            None => Vec::new(),
        }
    }

    /// A useful move as [from, count, to], [0] for "draw", or empty when nothing helps.
    pub fn hint(&self) -> Vec<u8> {
        match self.game.hint() {
            Some(Action::Draw) => vec![0],
            Some(Action::Move { from, count, to }) => vec![from, count, to],
            None => Vec::new(),
        }
    }

    pub fn undo(&mut self) -> bool { self.game.undo() }

    /// Layout: stockCount, wasteCount, waste…, then per foundation count, cards…, then per column count, faceDownCount, cards….
    /// Cards are 0–51: suit = card / 13 (♠ ♥ ♦ ♣), rank = card % 13 (0 = ace).
    pub fn layout(&self) -> Vec<u8> { self.game.layout() }

    pub fn actions(&self) -> Vec<u8> { self.game.encoded_actions() }

    /// Rebuild a saved game. Returns false (and leaves a fresh deal) if the actions don't replay.
    pub fn load(&mut self, seed: u32, draw_count: u32, actions: &[u8]) -> bool {
        match Klondike::replay(seed, if draw_count == 3 { 3 } else { 1 }, actions) {
            Some(game) => { self.game = game; true }
            None => { self.game = Klondike::deal(seed, if draw_count == 3 { 3 } else { 1 }); false }
        }
    }

    pub fn score(&self) -> i32 { self.game.score }
    pub fn moves(&self) -> u32 { self.game.actions.len() as u32 }
    pub fn is_won(&self) -> bool { self.game.is_won() }
    /// Every card is face up and the stock/waste are empty: the rest can be played automatically.
    pub fn can_auto_finish(&self) -> bool { self.game.can_auto_finish() }
    pub fn seed(&self) -> u32 { self.game.seed }
    pub fn draw_count(&self) -> u32 { self.game.draw_count as u32 }
}

#[cfg(test)]
mod tests;
