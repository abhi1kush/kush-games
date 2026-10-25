//! Jal Path for JavaScript: the level, rotating pipes, the water flow and the tank. JavaScript draws the board from
//! the tile pool in wasm memory (8 bytes a tile: mask, kind, flags, entry side, fill as f32).
pub mod board;
pub mod game;
pub mod levels;
#[cfg(test)]
mod tests;
use board::*;
use game::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct JalPath { game: Game, level: u8 }

#[wasm_bindgen]
impl JalPath {
    /// Level `level` (0-based).
    #[wasm_bindgen(constructor)]
    pub fn new(level: u8) -> JalPath { let level = level.min(levels::LEVEL_COUNT - 1); JalPath { game: levels::build(level), level } }
    pub fn level_count() -> u8 { levels::LEVEL_COUNT }
    pub fn level(&self) -> u8 { self.level }
    pub fn width(&self) -> u8 { self.game.board.width }
    pub fn height(&self) -> u8 { self.game.board.height }
    pub fn tiles_ptr(&self) -> *const u8 { self.game.board.tiles.as_ptr() as *const u8 }
    /// [source cell, source side, house cell, house side × 3]
    pub fn ports(&self) -> Vec<u8> {
        let board = &self.game.board;
        let mut out = vec![board.source.cell, board.source.side];
        for house in board.houses { out.push(house.cell); out.push(house.side); }
        out
    }
    pub fn house_fill(&self, house: usize) -> f32 { self.game.house_fill.get(house).copied().unwrap_or(0.0) }
    pub fn houses_full(&self) -> u8 { self.game.houses_full() }
    /// 0 planning, 1 water flowing, 2 won, 3 tank empty (lost)
    pub fn phase(&self) -> u8 { self.game.phase }
    pub fn tank(&self) -> f32 { self.game.tank }
    pub fn capacity(&self) -> f32 { self.game.capacity }
    pub fn plan_left_ms(&self) -> f32 { self.game.plan_left_ms.max(0.0) }
    pub fn moves(&self) -> u32 { self.game.moves }
    pub fn stars(&self) -> u8 { self.game.stars() }
    pub fn can_rotate(&self, cell: u8) -> bool { self.game.can_rotate(cell) }
    pub fn rotate(&mut self, cell: u8) -> bool { self.game.rotate(cell) }
    pub fn open_valve(&mut self) -> bool { self.game.open_valve() }
    pub fn add_plan_time(&mut self, ms: f32) -> bool { self.game.add_plan_time(ms) }
    pub fn hints_left(&self) -> u8 { self.game.hints_left() }
    pub fn hints_used(&self) -> u8 { self.game.hints_used }
    /// The pipe a hint would fix (or -1), without using one.
    pub fn hint_cell(&self) -> i32 { self.game.hint_cell().map_or(-1, |cell| cell as i32) }
    /// Use a hint: turns one pipe into place. Returns cell * 4 + quarter turns, or -1 (none left / nothing to fix).
    pub fn hint(&mut self) -> i32 { self.game.hint().map_or(-1, |(cell, turns)| cell as i32 * 4 + turns as i32) }
    /// Advance the clock (fixed 1/60 s steps inside; at most half a second per call).
    pub fn advance(&mut self, ms: f32) { self.game.advance(ms) }
    /// Open pipe ends spilling right now, each `cell * 4 + side`.
    pub fn spills(&self) -> Vec<u8> { self.game.spills[..self.game.spill_count].to_vec() }
    /// How many houses the pipes joined to the source reach right now.
    pub fn connected_houses(&mut self) -> u8 { self.game.board.mark_connected() }
    /// Test hook: turn every movable dry pipe to the intended route.
    pub fn debug_solve(&mut self) { self.game.solve() }
    /// Test hook: the intended orientation of a cell.
    pub fn debug_solution(&self, cell: u8) -> u8 { self.game.solution.get(cell as usize).copied().unwrap_or(0) }
}

/// Fill levels reached so JavaScript can tell a dry tile without reading memory.
pub const TILE_BYTES: usize = core::mem::size_of::<Tile>();
