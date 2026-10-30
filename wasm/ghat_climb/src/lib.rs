//! Ghat Climb: drive a jeep up one mountain road. Rust owns the road, the two-wheel jeep, fuel, coins and the
//! pass on a fixed 1/120 s step. TypeScript paints it.

pub mod course;
pub mod world;
#[cfg(test)]
mod tests;

use wasm_bindgen::prelude::*;
use world::*;

#[wasm_bindgen]
pub struct GhatClimb { world: World, buttons: u8, carry: f32, events: u32 }

impl Default for GhatClimb { fn default() -> Self { Self::new() } }

#[wasm_bindgen]
impl GhatClimb {
    #[wasm_bindgen(constructor)]
    pub fn new() -> GhatClimb { GhatClimb { world: World::new(), buttons: 0, carry: 0.0, events: 0 } }

    /// Held buttons: 1 gas, 2 brake.
    pub fn set_input(&mut self, buttons: u8) { self.buttons = buttons; }
    pub fn start(&mut self) { self.world.start(); }

    /// Run the fixed step for `ms` (at most 10 steps per call; negative or huge gaps are dropped).
    pub fn advance(&mut self, ms: f32) {
        let ms = if ms.is_finite() && ms > 0.0 { if ms > 200.0 { 200.0 } else { ms } } else { 0.0 };
        if ms >= 100.0 { self.carry = 0.0; self.world.step(self.buttons); self.events |= self.world.events; self.world.events = 0; return; }
        self.carry += ms / 1000.0;
        let mut steps = 0;
        while self.carry >= STEP && steps < MAX_STEPS {
            self.carry -= STEP;
            steps += 1;
            self.world.step(self.buttons);
            self.events |= self.world.events;
            self.world.events = 0;
        }
        if steps == MAX_STEPS { self.carry = 0.0; }
    }

    pub fn take_events(&mut self) -> u32 { let events = self.events; self.events = 0; events }

    pub fn x(&self) -> f32 { self.world.x }
    pub fn y(&self) -> f32 { self.world.y }
    pub fn angle(&self) -> f32 { self.world.angle }
    pub fn spin(&self) -> f32 { self.world.spin }
    pub fn speed(&self) -> f32 { self.world.vx }
    pub fn fuel(&self) -> f32 { self.world.fuel }
    pub fn coins(&self) -> u32 { self.world.coins }
    pub fn distance(&self) -> f32 { self.world.best_x }
    pub fn score(&self) -> u32 { self.world.score() }
    pub fn phase(&self) -> u8 { self.world.phase }
    pub fn time(&self) -> f32 { self.world.time }
    /// Engine pull this step, 0 to 1.
    pub fn drive(&self) -> f32 { self.world.drive }
    /// Share of the engine spent holding the slope; past 1 the hill wins.
    pub fn strain(&self) -> f32 { self.world.strain }
    /// Bit 1 rear tyre on the road, bit 2 front tyre.
    pub fn contact(&self) -> u8 { self.world.contact }
    pub fn grade_at(&self, x: f32) -> f32 { course::grade(x) }
    pub fn touch(&self) -> f32 { TOUCH }
    pub fn height_at(&self, x: f32) -> f32 { course::height(x) }
    pub fn finish_x(&self) -> f32 { course::FINISH_X }
    pub fn course_end(&self) -> f32 { course::COURSE_END }

    pub fn pickup_count(&self) -> usize { course::PICKUP_COUNT }
    /// pickup_count × 4 f32: x, y, kind, taken
    pub fn pickups_ptr(&self) -> *const Pickup { self.world.pickups.as_ptr() }

    /// Test and resume hook: put the jeep back on the road.
    pub fn restore(&mut self, x: f32, fuel: f32, coins: u32) { self.world.restore(x, fuel, coins); }
}
