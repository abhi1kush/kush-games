//! Carrom for JavaScript: the board (physics + rules) and the computer player. JavaScript reads the 20 discs
//! straight from wasm memory (7 floats each: x, y, vx, vy, r, mass, on) — no copies per frame.
pub mod ai;
pub mod physics;
pub mod rules;
#[cfg(test)]
mod tests;
use rules::Game;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Carrom { game: Game }

#[wasm_bindgen]
impl Carrom {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Carrom { Carrom { game: Game::new() } }
    pub fn reset(&mut self) { self.game.reset() }
    /// Address of the disc pool in wasm memory (20 × 7 f32: striker, queen, 9 white, 9 black).
    pub fn bodies_ptr(&self) -> *const f32 { self.game.world.bodies.as_ptr() as *const f32 }
    pub fn turn(&self) -> u8 { self.game.turn }
    /// 0 aiming, 1 discs moving, 2 over
    pub fn phase(&self) -> u8 { self.game.phase }
    /// 255 while playing
    pub fn winner(&self) -> u8 { self.game.winner }
    pub fn points(&self) -> u8 { self.game.points }
    /// 0 on the board, 1 pocketed and waiting to be covered, 2 covered
    pub fn queen_state(&self) -> u8 { self.game.queen_state }
    pub fn queen_owner(&self) -> u8 { self.game.queen_owner }
    pub fn pocketed(&self, player: u8) -> u8 { self.game.pocketed(player & 1) }
    pub fn due(&self, player: u8) -> u8 { self.game.due[(player & 1) as usize] }
    pub fn shots(&self) -> u32 { self.game.shots }
    pub fn can_place(&self, x: f32) -> bool { self.game.can_place(x) }
    pub fn place_striker(&mut self, x: f32) -> bool { self.game.place_striker(x) }
    pub fn shoot(&mut self, x: f32, aim_x: f32, aim_y: f32, power: u32) -> bool { self.game.shoot(x, aim_x, aim_y, power) }
    /// Up to `steps` fixed steps (1/400 s each). False once everything rests and the shot is scored.
    pub fn advance(&mut self, steps: u32) -> bool { self.game.advance(steps) }
    pub fn settle(&mut self) { self.game.settle() }
    /// Last finished shot: [player, foul, own, opponent, queen bits, returned, again]
    pub fn last_outcome(&self) -> Vec<u8> {
        let o = self.game.last;
        vec![o.player, o.foul, o.own, o.opponent, o.queen, o.returned, o.again as u8]
    }
    /// Strongest coin hit and cushion hit (speed) and pockets since the last call: coin | cushion << 12 | pockets << 24.
    pub fn take_impacts(&mut self) -> u32 {
        let impacts = self.game.world.take_impacts();
        (impacts.coin as u32).min(4095) | ((impacts.cushion as u32).min(4095) << 12) | (impacts.pockets.min(255) << 24)
    }
    /// The computer's shot: [x, aim_x, aim_y, power].
    pub fn ai_shot(&self, level: u8, seed: u32) -> Vec<f32> {
        let shot = ai::choose(&self.game, level, seed);
        vec![shot.x, shot.aim_x, shot.aim_y, shot.power as f32]
    }
    /// Test hook: move a disc (on = false pockets it).
    pub fn debug_put(&mut self, index: usize, x: f32, y: f32, on: bool) {
        if let Some(body) = self.game.world.bodies.get_mut(index) { body.x = x; body.y = y; body.vx = 0.0; body.vy = 0.0; body.on = if on { 1.0 } else { 0.0 }; }
    }
}

impl Default for Carrom { fn default() -> Self { Carrom::new() } }
