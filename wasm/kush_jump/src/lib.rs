//! Kush Jump for JavaScript. Rust owns the whole simulation; each frame JavaScript sets the held buttons, calls
//! `advance(seconds)` and reads everything to draw straight out of wasm memory through `render_pointer()` (a fixed
//! f32 buffer) and `tiles_pointer()` (the tile map), with no allocation per frame.
pub mod level;
pub mod world;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/kushjump/engine.ts.
pub mod render_slot {
    pub const HERO_X: usize = 0;
    pub const HERO_Y: usize = 1;
    pub const HERO_BIG: usize = 2;
    pub const HERO_FACING: usize = 3;
    pub const HERO_POSE: usize = 4;
    pub const HERO_STRIDE: usize = 5;
    pub const HERO_INVULNERABLE: usize = 6;
    pub const CAMERA_X: usize = 7;
    pub const PHASE: usize = 8;
    pub const SCORE: usize = 9;
    pub const COINS: usize = 10;
    pub const LIVES: usize = 11;
    pub const TIME: usize = 12;
    pub const CHECKPOINT: usize = 13;
    pub const FLAG_Y: usize = 14;
    pub const TILES_VERSION: usize = 15;
    pub const ENTITY_COUNT: usize = 16;
    pub const EFFECT_COUNT: usize = 17;
    pub const HERO_VELOCITY_X: usize = 18;
    /// kind, state, x, y, facing, timer per entity
    pub const ENTITIES: usize = 19;
    pub const ENTITY_STRIDE: usize = 6;
    /// kind, x, y, age, value per effect
    pub const EFFECTS: usize = ENTITIES + super::MAX_ENTITIES * ENTITY_STRIDE;
    pub const EFFECT_STRIDE: usize = 5;
    pub const LENGTH: usize = EFFECTS + super::MAX_EFFECTS * EFFECT_STRIDE;
}

#[wasm_bindgen]
pub struct KushJump {
    world: World,
    render: [f32; render_slot::LENGTH],
}

#[wasm_bindgen]
impl KushJump {
    #[wasm_bindgen(constructor)]
    pub fn new() -> KushJump {
        let mut game = KushJump { world: World::new(), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right, 4 jump, 8 run.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    pub fn press_jump(&mut self) { self.world.press_jump(); }
    /// Visible width in world units (the height is always 240); the camera keeps the hero in view with it.
    pub fn set_view_width(&mut self, width: f32) { self.world.view_width = clamp_between(width, 160.0, 960.0); self.fill_render(); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    pub fn restart(&mut self) { self.world.restart(); self.fill_render(); }
    pub fn restore(&mut self, checkpoint_reached: bool, lives: u32, score: u32, coins: u32) -> bool {
        let restored = self.world.restore(checkpoint_reached, lives, score, coins);
        self.fill_render();
        restored
    }

    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        let hero = &world.hero;
        render[HERO_X] = hero.x;
        render[HERO_Y] = hero.y;
        render[HERO_BIG] = if hero.is_big { 1.0 } else { 0.0 };
        render[HERO_FACING] = hero.facing;
        render[HERO_POSE] = hero.pose as u8 as f32;
        render[HERO_STRIDE] = hero.stride;
        render[HERO_INVULNERABLE] = hero.invulnerable_seconds;
        render[HERO_VELOCITY_X] = hero.velocity_x;
        render[CAMERA_X] = world.camera_x;
        render[PHASE] = world.phase as u8 as f32;
        render[SCORE] = world.score as f32;
        render[COINS] = world.coins as f32;
        render[LIVES] = world.lives as f32;
        render[TIME] = world.time_left.ceil();
        render[CHECKPOINT] = if world.checkpoint_reached { 1.0 } else { 0.0 };
        render[FLAG_Y] = world.flag_y;
        render[TILES_VERSION] = (world.tiles_version % 1_000_000) as f32;
        let mut count = 0;
        for entity in world.entities.iter() {
            if entity.state == EntityState::Dormant || count >= MAX_ENTITIES { continue; }
            let offset = ENTITIES + count * ENTITY_STRIDE;
            render[offset] = entity.kind as u8 as f32;
            render[offset + 1] = entity.state as u8 as f32;
            render[offset + 2] = entity.x;
            render[offset + 3] = entity.y;
            render[offset + 4] = if entity.velocity_x < 0.0 { -1.0 } else { 1.0 };
            render[offset + 5] = entity.timer;
            count += 1;
        }
        render[ENTITY_COUNT] = count as f32;
        for (index, effect) in world.effects.iter().enumerate().take(MAX_EFFECTS) {
            let offset = EFFECTS + index * EFFECT_STRIDE;
            render[offset] = effect.kind as u8 as f32;
            render[offset + 1] = effect.x;
            render[offset + 2] = effect.y;
            render[offset + 3] = effect.age;
            render[offset + 4] = effect.value;
        }
        render[EFFECT_COUNT] = world.effects.len().min(MAX_EFFECTS) as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn tiles_pointer(&self) -> *const u8 { self.world.tiles.as_ptr() }
    pub fn level_columns() -> u32 { level::LEVEL_COLUMNS as u32 }
    pub fn level_rows() -> u32 { level::LEVEL_ROWS as u32 }
    pub fn flag_column() -> u32 { level::FLAG_COLUMN as u32 }
    pub fn checkpoint_column() -> u32 { level::CHECKPOINT_COLUMN as u32 }
    pub fn fort_door_column() -> u32 { level::FORT_DOOR_COLUMN as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn coins(&self) -> u32 { self.world.coins }
    pub fn lives(&self) -> u32 { self.world.lives }
    pub fn checkpoint_reached(&self) -> bool { self.world.checkpoint_reached }
    pub fn hero_x(&self) -> f32 { self.world.hero.x }
    pub fn hero_y(&self) -> f32 { self.world.hero.y }
    pub fn is_big(&self) -> bool { self.world.hero.is_big }

    // ---- test hooks (used by e2e/kush-jump.mjs through ?kushJumpTest; harmless in normal play) ----
    pub fn debug_teleport(&mut self, column: f32) { self.world.teleport(column); self.fill_render(); }
    /// Teleport, then lift the hero `height` units into the air (to drop onto an enemy).
    pub fn debug_drop(&mut self, column: f32, height: f32) {
        self.world.teleport(column);
        self.world.hero.y -= height;
        self.world.hero.on_ground = false;
        self.fill_render();
    }
    pub fn debug_set_big(&mut self, is_big: bool) {
        if is_big != self.world.hero.is_big {
            self.world.hero.y += if is_big { SMALL_HEIGHT - BIG_HEIGHT } else { BIG_HEIGHT - SMALL_HEIGHT };
            self.world.hero.is_big = is_big;
        }
        self.fill_render();
    }
    /// Enemies stomped or knocked out so far.
    pub fn enemies_defeated(&self) -> u32 { self.world.enemies_defeated }
}

impl Default for KushJump { fn default() -> Self { KushJump::new() } }

#[cfg(test)]
mod tests;
