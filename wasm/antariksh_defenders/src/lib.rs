//! Antariksh Defenders for JavaScript. Rust owns the whole simulation; each frame JavaScript sets the held buttons,
//! calls `advance(seconds)` and reads everything to draw straight out of wasm memory: one fixed f32 render buffer
//! (`render_pointer()`) refilled in place, and the shield cells as bytes (`shields_pointer()`). No allocation per frame.
pub mod waves;
pub mod world;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/antariksh/engine.ts.
pub mod render_slot {
    use crate::world::{MAX_CAPSULES, MAX_ENEMIES, MAX_ENEMY_BULLETS, MAX_PARTICLES, MAX_PLAYER_BULLETS};
    pub const PHASE: usize = 0;
    pub const PHASE_SECONDS: usize = 1;
    pub const WAVE: usize = 2;
    pub const SCORE: usize = 3;
    pub const LIVES: usize = 4;
    pub const PLAYER_X: usize = 5;
    pub const INVULNERABLE: usize = 6;
    pub const POWER: usize = 7;
    pub const POWER_SECONDS: usize = 8;
    pub const MARCH_FRAME: usize = 9;
    pub const MYSTERY_ACTIVE: usize = 10;
    pub const MYSTERY_X: usize = 11;
    pub const MYSTERY_DIRECTION: usize = 12;
    pub const SHAKE: usize = 13;
    pub const FLASH: usize = 14;
    pub const SHIELD_VERSION: usize = 15;
    pub const ENEMIES_ALIVE: usize = 16;
    pub const PLAYER_BULLET_COUNT: usize = 17;
    pub const ENEMY_BULLET_COUNT: usize = 18;
    pub const PARTICLE_COUNT: usize = 19;
    pub const CAPSULE_COUNT: usize = 20;
    pub const STAGE: usize = 21;
    pub const BACKDROP: usize = 22;
    pub const MARCH_NOTE: usize = 23;
    pub const ENEMIES_AT_START: usize = 24;
    /// alive (0/1), kind, x, y for every formation slot (fixed order, dead ones included)
    pub const ENEMIES: usize = 32;
    pub const ENEMY_STRIDE: usize = 4;
    /// x, y, velocity x per player bullet
    pub const PLAYER_BULLETS: usize = ENEMIES + MAX_ENEMIES * ENEMY_STRIDE;
    pub const PLAYER_BULLET_STRIDE: usize = 3;
    /// kind, x, y, age per enemy bullet
    pub const ENEMY_BULLETS: usize = PLAYER_BULLETS + MAX_PLAYER_BULLETS * PLAYER_BULLET_STRIDE;
    pub const ENEMY_BULLET_STRIDE: usize = 4;
    /// kind, x, y, progress (0..1), value (palette or points) per particle
    pub const PARTICLES: usize = ENEMY_BULLETS + MAX_ENEMY_BULLETS * ENEMY_BULLET_STRIDE;
    pub const PARTICLE_STRIDE: usize = 5;
    /// power, x, y per falling capsule
    pub const CAPSULES: usize = PARTICLES + MAX_PARTICLES * PARTICLE_STRIDE;
    pub const CAPSULE_STRIDE: usize = 3;
    pub const LENGTH: usize = CAPSULES + MAX_CAPSULES * CAPSULE_STRIDE;
}

#[wasm_bindgen]
pub struct AntarikshDefenders {
    world: World,
    render: [f32; render_slot::LENGTH],
}

impl Default for AntarikshDefenders { fn default() -> Self { AntarikshDefenders::new() } }

#[wasm_bindgen]
impl AntarikshDefenders {
    #[wasm_bindgen(constructor)]
    pub fn new() -> AntarikshDefenders {
        let mut game = AntarikshDefenders { world: World::new(), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right, 4 fire.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    /// Where a finger wants the ship (world x); negative for none.
    pub fn set_target_x(&mut self, x: f32) { self.world.target_x = if x.is_finite() { x } else { -1.0 }; }
    pub fn seed(&mut self, seed: u32) { self.world.seed(seed); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    pub fn restart(&mut self) { self.world.restart(); self.fill_render(); }
    pub fn restore(&mut self, wave: u32, score: u32, lives: u32) -> bool {
        let restored = self.world.restore(wave, score, lives);
        self.fill_render();
        restored
    }

    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        render[PHASE] = world.phase as u8 as f32;
        render[PHASE_SECONDS] = world.phase_seconds;
        render[WAVE] = world.wave as f32;
        render[SCORE] = world.score as f32;
        render[LIVES] = world.lives as f32;
        render[PLAYER_X] = world.player_x;
        render[INVULNERABLE] = world.invulnerable_seconds;
        render[POWER] = world.power as u8 as f32;
        render[POWER_SECONDS] = world.power_seconds;
        render[MARCH_FRAME] = world.march_frame as f32;
        render[MYSTERY_ACTIVE] = if world.mystery.active { 1.0 } else { 0.0 };
        render[MYSTERY_X] = world.mystery.x;
        render[MYSTERY_DIRECTION] = world.mystery.direction;
        render[SHAKE] = world.shake;
        render[FLASH] = world.flash;
        render[SHIELD_VERSION] = world.shield_version as f32;
        render[ENEMIES_ALIVE] = world.enemies_alive as f32;
        render[STAGE] = waves::stage_index(world.wave) as f32;
        render[BACKDROP] = waves::backdrop_for_wave(world.wave) as f32;
        render[MARCH_NOTE] = world.march_note as f32;
        render[ENEMIES_AT_START] = world.enemies_at_start as f32;
        for (index, enemy) in world.enemies.iter().enumerate() {
            let offset = ENEMIES + index * ENEMY_STRIDE;
            render[offset] = if enemy.alive { 1.0 } else { 0.0 };
            render[offset + 1] = enemy.kind() as u8 as f32;
            render[offset + 2] = enemy.x;
            render[offset + 3] = enemy.y;
        }
        let mut count = 0;
        for bullet in world.player_bullets.iter().filter(|bullet| bullet.active) {
            let offset = PLAYER_BULLETS + count * PLAYER_BULLET_STRIDE;
            render[offset] = bullet.x;
            render[offset + 1] = bullet.y;
            render[offset + 2] = bullet.velocity_x;
            count += 1;
        }
        render[PLAYER_BULLET_COUNT] = count as f32;
        count = 0;
        for bullet in world.enemy_bullets.iter().filter(|bullet| bullet.active) {
            let offset = ENEMY_BULLETS + count * ENEMY_BULLET_STRIDE;
            render[offset] = bullet.kind as f32;
            render[offset + 1] = bullet.x;
            render[offset + 2] = bullet.y;
            render[offset + 3] = bullet.age;
            count += 1;
        }
        render[ENEMY_BULLET_COUNT] = count as f32;
        count = 0;
        for particle in world.particles.iter().filter(|particle| particle.active) {
            let offset = PARTICLES + count * PARTICLE_STRIDE;
            render[offset] = particle.kind as u8 as f32;
            render[offset + 1] = particle.x;
            render[offset + 2] = particle.y;
            render[offset + 3] = particle.age / particle.life;
            render[offset + 4] = particle.value;
            count += 1;
        }
        render[PARTICLE_COUNT] = count as f32;
        count = 0;
        for capsule in world.capsules.iter().filter(|capsule| capsule.active) {
            let offset = CAPSULES + count * CAPSULE_STRIDE;
            render[offset] = capsule.power as u8 as f32;
            render[offset + 1] = capsule.x;
            render[offset + 2] = capsule.y;
            count += 1;
        }
        render[CAPSULE_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }
    pub fn shields_pointer(&self) -> *const u8 { self.world.shields.as_ptr() }
    pub fn shields_length() -> u32 { (SHIELD_COUNT * SHIELD_CELLS) as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn wave(&self) -> u32 { self.world.wave }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn lives(&self) -> u32 { self.world.lives }
    pub fn player_x(&self) -> f32 { self.world.player_x }
    pub fn enemies_alive(&self) -> u32 { self.world.enemies_alive }
    pub fn kills(&self) -> u32 { self.world.kills }
    pub fn formation_y(&self) -> f32 { self.world.formation_y }
    pub fn power(&self) -> u32 { self.world.power as u32 }
    pub fn march_interval(&self) -> f32 { self.world.march_interval() }
    pub fn shield_cells_left(&self) -> u32 { self.world.shield_cells_left() as u32 }
    /// The stage name for a wave ("Low Earth Orbit", "Lunar Orbit", "Mars Approach", ...).
    pub fn stage_name(wave: u32) -> String { waves::STAGE_NAMES[waves::stage_index(wave)].to_string() }

    // ---- test hooks (used by e2e/antariksh-defenders.mjs through ?antarikshTest; harmless in normal play) ----
    pub fn debug_set_invincible(&mut self, invincible: bool) { self.world.debug_invincible = invincible; }
    pub fn debug_thin_formation(&mut self, keep: u32) { self.world.debug_thin_formation(keep); self.fill_render(); }
    pub fn debug_launch_mystery(&mut self) { self.world.launch_mystery(); self.fill_render(); }
    pub fn debug_set_wave(&mut self, wave: u32) { self.world.setup_wave(wave); self.fill_render(); }
    pub fn debug_drop_capsule(&mut self, power: u8) {
        let power = if power == 2 { Power::Bubble } else { Power::TripleShot };
        let x = self.world.player_x;
        self.world.drop_capsule(x, PLAYER_Y - 30.0, power);
        self.fill_render();
    }
    /// x of the living enemy closest to the ship (for aiming in tests), or -1.
    pub fn debug_nearest_enemy_x(&self) -> f32 {
        let x = self.world.player_x;
        self.world.enemies.iter().filter(|enemy| enemy.alive).map(|enemy| enemy.x)
            .fold(-1.0, |best, candidate| if best < 0.0 || (candidate - x).abs() < (best - x).abs() { candidate } else { best })
    }
}
