//! Paani Pour: sort coloured water so every tube holds one colour. Rust owns the tubes, the pour rules, undo,
//! level generation and the solver (par + hints); TypeScript draws and animates.

pub mod levels;
pub mod rules;
pub mod solver;
#[cfg(test)]
mod tests;

use rules::*;
use wasm_bindgen::prelude::*;

pub const MAX_HISTORY: usize = 512;
pub const HINTS_PER_LEVEL: u8 = 3;

#[wasm_bindgen]
pub struct PaaniPour {
    board: Board,
    start: Board,
    level: u8,
    par: u32,
    /// from, to, amount
    history: Vec<(u8, u8, u8)>,
    hints_used: u8,
    /// The solution a hint came from; following it keeps hints consistent (no wandering between solutions).
    plan: Vec<(u8, u8)>,
}

#[wasm_bindgen]
impl PaaniPour {
    #[wasm_bindgen(constructor)]
    pub fn new(level: u8) -> PaaniPour {
        let built = levels::build(level);
        PaaniPour { board: built.board, start: built.board, level: level.min(levels::LEVEL_COUNT - 1), par: built.par, history: Vec::new(), hints_used: 0, plan: Vec::new() }
    }
    pub fn level_count() -> u8 { levels::LEVEL_COUNT }
    pub fn level(&self) -> u8 { self.level }
    pub fn capacity(&self) -> u8 { CAPACITY as u8 }
    pub fn tube_count(&self) -> u8 { self.board.tube_count }
    pub fn colour_count(&self) -> u8 { levels::colours_for(self.level) }
    /// tube_count × capacity bytes, bottom layer first, 0 = empty
    pub fn layers_ptr(&self) -> *const u8 { self.board.layers.as_ptr() }
    pub fn par(&self) -> u32 { self.par }
    pub fn pours(&self) -> u32 { self.history.len() as u32 }
    pub fn can_pour(&self, from: u8, to: u8) -> bool { self.board.pour_amount(from as usize, to as usize) > 0 }
    pub fn is_done(&self, tube: u8) -> bool { (tube as usize) < self.board.tube_count as usize && self.board.is_done(tube as usize) }
    pub fn is_solved(&self) -> bool { self.board.is_solved() }
    /// No allowed pour would change anything: undo or reset.
    pub fn is_stuck(&self) -> bool { !self.board.is_solved() && !self.board.has_useful_pour() }

    /// Pour; returns how many layers moved (0 = not allowed).
    pub fn pour(&mut self, from: u8, to: u8) -> u8 {
        if self.board.is_solved() || self.history.len() >= MAX_HISTORY { return 0; }
        let amount = self.board.pour(from as usize, to as usize);
        if amount > 0 {
            self.history.push((from, to, amount as u8));
            if self.plan.first() == Some(&(from, to)) { self.plan.remove(0); } else { self.plan.clear(); }
        }
        amount as u8
    }

    /// Undo the last pour; returns from * 16 + to + amount * 256, or -1.
    pub fn undo(&mut self) -> i32 {
        match self.history.pop() {
            Some((from, to, amount)) => { self.plan.clear(); self.board.move_layers(to as usize, from as usize, amount as usize); from as i32 * 16 + to as i32 + amount as i32 * 256 }
            None => -1,
        }
    }

    pub fn reset(&mut self) { self.board = self.start; self.history.clear(); self.plan.clear(); }

    pub fn hints_left(&self) -> u8 { HINTS_PER_LEVEL.saturating_sub(self.hints_used) }
    pub fn hints_used(&self) -> u8 { self.hints_used }

    /// The next pour of a solution from here as from * 16 + to; -1 if solved, none found (undo!) or no hints left.
    /// Using it counts as a hint (the pour itself is left to the player).
    pub fn hint(&mut self) -> i32 {
        if self.hints_left() == 0 { return -1; }
        let next = self.peek_hint();
        if next >= 0 { self.hints_used += 1; }
        next
    }

    /// Same as `hint` without using one (tests).
    pub fn peek_hint(&mut self) -> i32 {
        if self.board.is_solved() { return -1; }
        if self.plan.is_empty() { self.plan = solver::solve(&self.board).unwrap_or_default(); }
        match self.plan.first() { Some(&(from, to)) => from as i32 * 16 + to as i32, None => -1 }
    }

    /// 3 stars at or under par, 2 within par + a quarter (at least 3 extra), else 1; any hint caps at 2.
    pub fn stars(&self) -> u8 {
        if !self.board.is_solved() { return 0; }
        let pours = self.history.len() as u32;
        let by_pours = if pours <= self.par { 3 } else if pours <= self.par + (self.par / 4).max(3) { 2 } else { 1 };
        if self.hints_used > 0 { by_pours.min(2) } else { by_pours }
    }

    /// Test hook: pour the rest of a solution.
    pub fn debug_solve(&mut self) -> bool {
        match solver::solve(&self.board) {
            Some(path) => { for (from, to) in path { self.pour(from, to); } self.board.is_solved() }
            None => false,
        }
    }
}
