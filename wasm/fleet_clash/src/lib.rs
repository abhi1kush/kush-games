//! Fleet Clash for JavaScript: fleets (placement, random placement, shots) and the computer player.
pub mod rules;
#[cfg(test)]
mod tests;
use rules::{Ai, Fleet, Rng};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct FleetBoard { fleet: Fleet }

#[wasm_bindgen]
impl FleetBoard {
    #[wasm_bindgen(constructor)]
    pub fn new() -> FleetBoard { FleetBoard { fleet: Fleet::new() } }
    /// A complete fleet from its 10-byte code, or undefined.
    pub fn from_code(code: &[u8]) -> Option<FleetBoard> { Fleet::from_code(code).map(|fleet| FleetBoard { fleet }) }
    pub fn can_place(&self, ship: u8, start: u8, vertical: bool) -> bool { self.fleet.can_place(ship as usize, start, vertical, false) }
    pub fn place(&mut self, ship: u8, start: u8, vertical: bool) -> bool { self.fleet.place(ship as usize, start, vertical) }
    pub fn remove(&mut self, ship: u8) { self.fleet.remove(ship as usize) }
    pub fn randomize(&mut self, seed: u32) { self.fleet.randomize(&mut Rng::new(seed)) }
    pub fn is_complete(&self) -> bool { self.fleet.is_complete() }
    /// 255 if no ship is there.
    pub fn ship_at(&self, cell: u8) -> u8 { self.fleet.ship_at(cell).map_or(255, |ship| ship as u8) }
    /// 0 not allowed, 1 miss, 2 hit, 10 + ship when it sinks that ship.
    pub fn shoot(&mut self, cell: u8) -> u8 { self.fleet.shoot(cell) }
    pub fn all_sunk(&self) -> bool { self.fleet.all_sunk() }
    pub fn sunk_mask(&self) -> u8 { self.fleet.sunk }
    pub fn code(&self) -> Vec<u8> { self.fleet.code().to_vec() }
}

impl Default for FleetBoard { fn default() -> Self { FleetBoard::new() } }

#[wasm_bindgen]
pub struct FleetAi { ai: Ai }

#[wasm_bindgen]
impl FleetAi {
    /// level 0 Easy, 1 Medium, 2 Hard
    #[wasm_bindgen(constructor)]
    pub fn new(level: u8, seed: u32) -> FleetAi { FleetAi { ai: Ai::new(level, seed) } }
    pub fn record(&mut self, cell: u8, result: u8, ship_start: u8, ship_vertical: bool) { self.ai.record(cell, result, ship_start, ship_vertical) }
    pub fn choose(&mut self) -> u8 { self.ai.choose() }
}
