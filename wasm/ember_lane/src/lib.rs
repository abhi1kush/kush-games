//! Ember Lane: a light-and-shadow escape through a rat-infested village at night. Rust owns the stage, light
//! (with crate shadows), the rat swarms, the puzzles, movement and checkpoints on a fixed 60 Hz step; TypeScript
//! paints it.

pub mod guard;
pub mod rats;
pub mod stage;
pub mod world;
#[cfg(test)]
mod tests;

use wasm_bindgen::prelude::*;

/// `clamp` without the panic check (f32::clamp would pull float formatting into the .wasm).
pub trait Within { fn within(self, low: f32, high: f32) -> f32; }
impl Within for f32 { fn within(self, low: f32, high: f32) -> f32 { if self < low { low } else if self > high { high } else { self } } }
use world::*;

#[wasm_bindgen]
pub struct EmberLane { world: World, checkpoint: World, buttons: u8, carry: f32, events: u32, deaths: u32 }

impl Default for EmberLane { fn default() -> Self { Self::new() } }

#[wasm_bindgen]
impl EmberLane {
    #[wasm_bindgen(constructor)]
    pub fn new() -> EmberLane { let world = World::new(); EmberLane { world, checkpoint: world, buttons: 0, carry: 0.0, events: 0, deaths: 0 } }

    /// Held buttons: 1 left, 2 right.
    pub fn set_input(&mut self, buttons: u8) { self.buttons = buttons; }
    pub fn interact(&mut self) { self.world.interact(); self.collect(); }
    pub fn throw_ember(&mut self) -> bool { let thrown = self.world.throw_ember(); self.collect(); thrown }

    /// Run the fixed 60 Hz simulation for `ms` (at most 12 steps per call; negative or huge gaps are clamped).
    pub fn advance(&mut self, ms: f32) {
        let ms = if ms.is_finite() { ms.within(0.0, 200.0) } else { 0.0 };
        self.carry += ms / 1000.0;
        let mut steps = 0;
        while self.carry >= STEP && steps < MAX_STEPS {
            self.carry -= STEP;
            steps += 1;
            self.world.step(self.buttons);
            self.collect();
        }
        if steps == MAX_STEPS { self.carry = 0.0; }
    }

    fn collect(&mut self) {
        let events = self.world.events;
        self.world.events = 0;
        if events & EVENT_CHECKPOINT != 0 { self.checkpoint = self.world; }
        if events & EVENT_DEATH != 0 { self.deaths += 1; }
        if events & EVENT_RESPAWN != 0 {
            self.world = self.checkpoint;
            self.world.danger = 0.0;
            self.world.sibling_danger = 0.0;
            self.world.state = STATE_IDLE;
        }
        self.events |= events;
    }

    /// Events since the last call (bit flags, see world.rs) — sounds and effects.
    pub fn take_events(&mut self) -> u32 { let events = self.events; self.events = 0; events }

    pub fn player_x(&self) -> f32 { self.world.player_x }
    pub fn player_y(&self) -> f32 { self.world.player_y }
    /// Standing on a crate (safe from the rats).
    pub fn on_crate(&self) -> bool { self.world.on_crate >= 0 }
    pub fn facing(&self) -> f32 { self.world.facing }
    pub fn state(&self) -> u8 { self.world.state }
    pub fn state_time(&self) -> f32 { self.world.state_time }
    pub fn walked(&self) -> f32 { self.world.walked }
    pub fn sibling_x(&self) -> f32 { self.world.sibling_x }
    pub fn sibling_y(&self) -> f32 { self.world.sibling_y }
    pub fn sibling_facing(&self) -> f32 { self.world.sibling_facing }
    pub fn sibling_walked(&self) -> f32 { self.world.sibling_walked }
    pub fn danger(&self) -> f32 { self.world.danger.max(self.world.sibling_danger).min(1.0) }
    pub fn player_lit(&self) -> bool { self.world.is_lit(self.world.player_x) }
    pub fn sibling_lit(&self) -> bool { self.world.is_lit(self.world.sibling_x) }
    pub fn light_at(&self, x: f32) -> f32 { self.world.light_at(x) }
    pub fn carrying(&self) -> bool { self.world.carrying }
    pub fn oil(&self) -> f32 { if self.world.lantern_used { self.world.oil } else { LANTERN_OIL } }
    pub fn embers(&self) -> u8 { self.world.embers }
    pub fn prompt(&self) -> u8 { self.world.prompt() }
    pub fn throw_target(&self) -> i32 { if self.world.embers == 0 { -1 } else { self.world.throw_target().map_or(-1, |index| index as i32) } }
    pub fn checkpoint(&self) -> u8 { self.world.checkpoint }
    pub fn deaths(&self) -> u32 { self.deaths }
    pub fn cleared(&self) -> bool { self.world.cleared }
    pub fn time(&self) -> f32 { self.world.time }
    pub fn pot_left(&self) -> f32 { self.world.pot_left }
    /// Seconds into the windmill's light cycle (see World::windmill_angle for the sails it turns into).
    pub fn flicker_phase(&self) -> f32 { self.world.flicker_phase() }

    pub fn light_count(&self) -> usize { stage::LIGHT_COUNT }
    /// light_count × 8 f32: x, flame height, radius, intensity, kind, lit, left bound, right bound
    pub fn lights_ptr(&self) -> *const Light { self.world.lights.as_ptr() }
    pub fn rat_count(&self) -> usize { stage::RAT_COUNT }
    /// rat_count × 8 × 4 bytes: x, vx, lane, state (0 hidden, 1 active, 2 fleeing), timer, phase, nest, rng
    pub fn rats_ptr(&self) -> *const rats::Rat { self.world.rats.as_ptr() }
    pub fn crate_x(&self, index: usize) -> f32 { self.world.crates.get(index).map_or(0.0, |c| c.x) }
    /// Which block Mira stands on (-1: the ground; 0 the crate, 1 the stone wall).
    pub fn standing_on(&self) -> i32 { self.world.on_crate as i32 }
    pub fn lever(&self, index: usize) -> bool { self.world.levers.get(index).copied().unwrap_or(false) }
    pub fn ember_active(&self) -> bool { self.world.ember.active }
    pub fn ember_x(&self) -> f32 { self.world.ember.x }
    pub fn ember_y(&self) -> f32 { self.world.ember.y }

    /// Test hook: jump to a checkpoint (as if reached), keeping the stage as it is.
    pub fn debug_warp(&mut self, checkpoint: u8) {
        let index = (checkpoint as usize).min(stage::CHECKPOINTS.len() - 1);
        let x = stage::CHECKPOINTS[index].0;
        self.world.player_x = x;
        self.world.sibling_x = x - SIBLING_GAP;
        self.world.checkpoint = index as u8;
        self.world.embers = self.world.embers.max(stage::CHECKPOINTS[index].1);
        self.world.update_lights();
        self.checkpoint = self.world;
    }
}
