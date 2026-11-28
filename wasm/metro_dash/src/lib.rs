//! Metro Dash for JavaScript. Rust owns the whole simulation (lanes, the runner's switches, jumps and rolls, trains,
//! ramps, barriers, coins, power-ups, stumbles, the chaser, scoring, the run generator and the save format).
//! Each frame JavaScript calls `advance(seconds)` and reads everything it draws straight out of wasm memory: one fixed
//! f32 render buffer (`render_pointer()`) refilled in place, positions relative to the runner. No allocation per frame.
pub mod autopilot;
pub mod save;
pub mod world;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use autopilot::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/metrodash/engine.ts (checked by a test).
pub mod render_slot {
    use crate::world::MAX_ENTITIES;
    pub const PHASE: usize = 0;
    pub const PHASE_SECONDS: usize = 1;
    pub const DISTANCE: usize = 2;
    pub const SCORE: usize = 3;
    pub const COINS: usize = 4;
    pub const SPEED: usize = 5;
    pub const PLAYER_X: usize = 6;
    /// height of the feet above the rails
    pub const PLAYER_Y: usize = 7;
    /// height of what is under the runner (0 rails, a ramp, 3.2 a roof)
    pub const SURFACE: usize = 8;
    /// 0 running, 1 in the air, 2 rolling
    pub const MOTION: usize = 9;
    pub const ROLL_SECONDS: usize = 10;
    /// 0 … 1, one stride
    pub const RUN_CYCLE: usize = 11;
    /// sideways speed as a share of a lane switch's average speed (-1 … 1 or so), for leaning into switches
    pub const LATERAL: usize = 12;
    pub const MULTIPLIER: usize = 13;
    pub const MAGNET_SECONDS: usize = 14;
    pub const SNEAKERS_SECONDS: usize = 15;
    pub const MULTIPLIER_SECONDS: usize = 16;
    pub const HOVERBOARD_SECONDS: usize = 17;
    pub const GHOST_SECONDS: usize = 18;
    pub const STUMBLE_SECONDS: usize = 19;
    /// metres between the chaser and the runner
    pub const CHASER_GAP: usize = 20;
    pub const CRASH_REASON: usize = 21;
    pub const ENTITY_COUNT: usize = 22;
    pub const COIN_STREAK: usize = 23;
    pub const VERTICAL_VELOCITY: usize = 24;
    /// the runner's distance modulo 48 m and which 48 m block it is in (for scenery that must stay put)
    pub const TRACK_OFFSET: usize = 25;
    pub const BLOCK_INDEX: usize = 26;
    pub const LANE: usize = 27;
    pub const LAST_POWER_UP: usize = 28;
    pub const HIT_GRACE: usize = 29;
    pub const RUN_SECONDS: usize = 30;
    /// kind, x, y, near end (metres ahead of the runner), far end, variant, velocity, lane per entity in view
    pub const ENTITIES: usize = 32;
    pub const ENTITY_STRIDE: usize = 8;
    pub const LENGTH: usize = ENTITIES + MAX_ENTITIES * ENTITY_STRIDE;
}
pub const SCENERY_BLOCK: f64 = 48.0;
pub const VIEW_AHEAD: f64 = 175.0;

#[wasm_bindgen]
pub struct MetroDash {
    world: World,
    render: [f32; render_slot::LENGTH],
}

#[wasm_bindgen]
impl MetroDash {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> MetroDash {
        let mut game = MetroDash { world: World::new(seed), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// -1 one lane left, 1 one lane right (a press into the wall just bumps).
    pub fn press_lane(&mut self, direction: i32) { self.world.press_lane(direction); }
    pub fn press_jump(&mut self) { self.world.press_jump(); }
    pub fn press_roll(&mut self) { self.world.press_roll(); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let happened = self.world.advance(seconds);
        self.fill_render();
        happened
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    /// A brand-new run, straight into play.
    pub fn restart(&mut self, seed: u32) {
        let autopilot = self.world.autopilot;
        self.world = World::new(seed);
        self.world.autopilot = autopilot;
        self.world.start();
        self.fill_render();
    }
    pub fn save(&self) -> Vec<u8> { self.world.save() }
    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        let restored = self.world.restore(bytes);
        self.fill_render();
        restored
    }

    #[inline(never)]
    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        render[PHASE] = world.phase as u8 as f32;
        render[PHASE_SECONDS] = world.phase_seconds;
        render[DISTANCE] = world.distance();
        render[SCORE] = world.score() as f32;
        render[COINS] = world.coins as f32;
        render[SPEED] = world.speed();
        render[PLAYER_X] = world.x;
        render[PLAYER_Y] = world.y;
        render[SURFACE] = world.surface;
        render[MOTION] = if world.is_rolling() { 2.0 } else if world.grounded { 0.0 } else { 1.0 };
        render[ROLL_SECONDS] = world.roll_seconds;
        render[RUN_CYCLE] = world.run_cycle;
        render[LATERAL] = world.lateral_velocity * LANE_SWITCH_SECONDS / LANE_WIDTH;
        render[MULTIPLIER] = world.multiplier() as f32;
        render[MAGNET_SECONDS] = world.magnet_seconds;
        render[SNEAKERS_SECONDS] = world.sneakers_seconds;
        render[MULTIPLIER_SECONDS] = world.multiplier_seconds;
        render[HOVERBOARD_SECONDS] = world.hoverboard_seconds;
        render[GHOST_SECONDS] = world.ghost_seconds;
        render[STUMBLE_SECONDS] = world.stumble_window;
        render[CHASER_GAP] = world.chaser_gap;
        render[CRASH_REASON] = world.crash_reason as f32;
        render[COIN_STREAK] = world.coin_streak as f32;
        render[VERTICAL_VELOCITY] = world.vertical_velocity;
        let block = (world.player_z / SCENERY_BLOCK).floor();
        render[TRACK_OFFSET] = (world.player_z - block * SCENERY_BLOCK) as f32;
        render[BLOCK_INDEX] = block as f32;
        render[LANE] = world.lane as f32;
        render[LAST_POWER_UP] = world.last_power_up as f32;
        render[HIT_GRACE] = world.hit_grace;
        render[RUN_SECONDS] = world.run_seconds;
        let mut count = 0;
        for entity in world.entities.iter().filter(|entity| entity.active) {
            let near = entity.z - world.player_z;
            let depth = if entity.kind.is_walkable() { entity.length } else if entity.kind.is_obstacle() { BARRIER_DEPTH } else { 0.0 };
            let far = near + depth as f64;
            if far < -DESPAWN_BEHIND || near > VIEW_AHEAD { continue; }
            let offset = ENTITIES + count * ENTITY_STRIDE;
            render[offset] = entity.kind as u8 as f32;
            render[offset + 1] = entity.x;
            render[offset + 2] = entity.y;
            render[offset + 3] = near as f32;
            render[offset + 4] = far as f32;
            render[offset + 5] = entity.variant as f32;
            render[offset + 6] = entity.velocity;
            render[offset + 7] = entity.lane as f32;
            count += 1;
        }
        render[ENTITY_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn distance(&self) -> f32 { self.world.distance() }
    pub fn score(&self) -> u32 { self.world.score() }
    pub fn coins(&self) -> u32 { self.world.coins }
    pub fn speed(&self) -> f32 { self.world.speed() }
    pub fn lane(&self) -> u32 { self.world.lane as u32 }
    pub fn player_x(&self) -> f32 { self.world.x }
    pub fn player_y(&self) -> f32 { self.world.y }
    pub fn surface(&self) -> f32 { self.world.surface }
    pub fn is_rolling(&self) -> bool { self.world.is_rolling() }
    pub fn is_grounded(&self) -> bool { self.world.grounded }
    pub fn stumbles(&self) -> u32 { self.world.stumbles }
    pub fn crash_reason(&self) -> u32 { self.world.crash_reason as u32 }
    pub fn multiplier(&self) -> u32 { self.world.multiplier() }
    pub fn magnet_seconds(&self) -> f32 { self.world.magnet_seconds }
    pub fn sneakers_seconds(&self) -> f32 { self.world.sneakers_seconds }
    pub fn multiplier_seconds(&self) -> f32 { self.world.multiplier_seconds }
    pub fn hoverboard_seconds(&self) -> f32 { self.world.hoverboard_seconds }
    pub fn last_power_up(&self) -> u32 { self.world.last_power_up as u32 }
    pub fn seed(&self) -> u32 { self.world.seed }

    // ---- test hooks (used by e2e/metro-dash.mjs through ?metroTest; harmless in normal play) ----
    pub fn debug_set_invincible(&mut self, invincible: bool) { self.world.debug_invincible = invincible; }
    pub fn debug_set_autopilot(&mut self, on: bool) { self.world.autopilot = on; }
    /// Clear the track ahead and stop generating it (spawn your own things with debug_spawn).
    pub fn debug_clear_track(&mut self) { self.world.clear_track(); self.fill_render(); }
    pub fn debug_resume_spawning(&mut self) { self.world.resume_spawning(); self.fill_render(); }
    /// Put something `ahead` metres in front of the runner in `lane` (trains and ramps `length` long).
    pub fn debug_spawn(&mut self, kind: u32, lane: u32, ahead: f64, y: f32, length: f32) -> bool {
        let Some(kind) = Kind::from_index(kind) else { return false };
        if lane >= LANE_COUNT as u32 { return false; }
        let velocity = if kind == Kind::MovingTrain { 8.0 } else { 0.0 };
        let spawned = self.world.spawn(kind, lane as usize, self.world.player_z + ahead, y, length, velocity, if kind == Kind::MovingTrain { 4 } else { 0 });
        self.fill_render();
        spawned
    }
    pub fn debug_activate(&mut self, kind: u32) { if let Some(kind) = Kind::from_index(kind) { self.world.activate(kind); self.fill_render(); } }
}
