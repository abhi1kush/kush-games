//! Jungle Strike for JavaScript. Rust owns the whole simulation; each frame JavaScript sets the held buttons, calls
//! `advance(seconds)` and reads everything to draw straight out of wasm memory through `render_pointer()` (one fixed
//! f32 buffer refilled in place), with no allocation per frame on either side.
pub mod level;
pub mod world;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/junglestrike/engine.ts.
pub mod render_slot {
    use crate::level::PLATFORM_COUNT;
    use crate::world::{MAX_ENEMY_BULLETS, MAX_ENTITIES, MAX_PARTICLES, MAX_PLAYER_BULLETS};
    pub const HERO_X: usize = 0;
    pub const HERO_Y: usize = 1;
    pub const HERO_FACING: usize = 2;
    pub const HERO_POSE: usize = 3;
    pub const HERO_AIM: usize = 4;
    pub const HERO_STRIDE: usize = 5;
    pub const HERO_INVULNERABLE: usize = 6;
    pub const CAMERA_X: usize = 7;
    pub const PHASE: usize = 8;
    pub const SCORE: usize = 9;
    pub const LIVES: usize = 10;
    pub const CONTINUES: usize = 11;
    pub const WEAPON: usize = 12;
    pub const CHECKPOINT: usize = 13;
    pub const BOSS_ACTIVE: usize = 14;
    pub const PHASE_SECONDS: usize = 15;
    pub const BOSS_HEALTH: usize = 16;
    pub const ENTITY_COUNT: usize = 17;
    pub const BULLET_COUNT: usize = 18;
    pub const ENEMY_BULLET_COUNT: usize = 19;
    pub const PARTICLE_COUNT: usize = 20;
    /// 1 or 0 per platform (bridge planks blow up).
    pub const PLATFORM_ALIVE: usize = 21;
    /// kind, state, x, y, aim (gun direction; the param for snipers, capsules and pickups), facing, timer, flash per entity
    pub const ENTITIES: usize = PLATFORM_ALIVE + PLATFORM_COUNT;
    pub const ENTITY_STRIDE: usize = 8;
    /// weapon, x, y, velocity x, velocity y per bullet
    pub const BULLETS: usize = ENTITIES + MAX_ENTITIES * ENTITY_STRIDE;
    pub const BULLET_STRIDE: usize = 5;
    /// x, y per enemy bullet
    pub const ENEMY_BULLETS: usize = BULLETS + MAX_PLAYER_BULLETS * BULLET_STRIDE;
    pub const ENEMY_BULLET_STRIDE: usize = 2;
    /// kind, x, y, progress (0..1) per particle
    pub const PARTICLES: usize = ENEMY_BULLETS + MAX_ENEMY_BULLETS * ENEMY_BULLET_STRIDE;
    pub const PARTICLE_STRIDE: usize = 4;
    pub const LENGTH: usize = PARTICLES + MAX_PARTICLES * PARTICLE_STRIDE;
}

#[wasm_bindgen]
pub struct JungleStrike {
    world: World,
    render: [f32; render_slot::LENGTH],
    /// left, right, top, kind per platform (for drawing; never changes).
    platform_table: [f32; level::PLATFORM_COUNT * 4],
}

#[wasm_bindgen]
impl JungleStrike {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JungleStrike {
        let mut game = JungleStrike { world: World::new(), render: [0.0; render_slot::LENGTH], platform_table: [0.0; level::PLATFORM_COUNT * 4] };
        for (index, platform) in level::PLATFORMS.iter().enumerate() {
            game.platform_table[index * 4] = platform.left;
            game.platform_table[index * 4 + 1] = platform.right;
            game.platform_table[index * 4 + 2] = platform.top;
            game.platform_table[index * 4 + 3] = platform.kind as u8 as f32;
        }
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right, 4 up, 8 down, 16 jump, 32 fire.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    /// A jump or fire tap that may be released before the next frame.
    pub fn press_jump(&mut self) { self.world.press_jump(); }
    pub fn press_fire(&mut self) { self.world.press_fire(); }
    /// Visible width in world units (the height is always 240).
    pub fn set_view_width(&mut self, width: f32) { self.world.view_width = clamp_between(width, 200.0, 480.0); self.fill_render(); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    pub fn restart(&mut self) { self.world.restart(); self.fill_render(); }
    pub fn continue_game(&mut self) -> bool { let continued = self.world.continue_game(); self.fill_render(); continued }
    pub fn restore(&mut self, checkpoint_reached: bool, lives: u32, score: u32, weapon: u8, continues: u32) -> bool {
        let restored = self.world.restore(checkpoint_reached, lives, score, weapon, continues);
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
        render[HERO_FACING] = hero.facing;
        render[HERO_POSE] = hero.pose as u8 as f32;
        render[HERO_AIM] = hero.aim as f32;
        render[HERO_STRIDE] = hero.stride;
        render[HERO_INVULNERABLE] = hero.invulnerable_seconds;
        render[CAMERA_X] = world.camera_x;
        render[PHASE] = world.phase as u8 as f32;
        render[SCORE] = world.score as f32;
        render[LIVES] = world.lives as f32;
        render[CONTINUES] = world.continues as f32;
        render[WEAPON] = world.weapon as u8 as f32;
        render[CHECKPOINT] = if world.checkpoint_reached { 1.0 } else { 0.0 };
        render[BOSS_ACTIVE] = if world.boss_active { 1.0 } else { 0.0 };
        render[PHASE_SECONDS] = world.phase_seconds;
        render[BOSS_HEALTH] = -1.0;
        for (index, alive) in world.platform_alive.iter().enumerate() { render[PLATFORM_ALIVE + index] = if *alive { 1.0 } else { 0.0 }; }
        let mut count = 0;
        for entity in world.entities.iter().filter(|entity| entity.active) {
            let offset = ENTITIES + count * ENTITY_STRIDE;
            render[offset] = entity.kind as u8 as f32;
            render[offset + 1] = entity.state as f32;
            render[offset + 2] = entity.x;
            render[offset + 3] = entity.y;
            render[offset + 4] = if matches!(entity.kind, EntityKind::Pickup | EntityKind::Capsule | EntityKind::Sniper) { entity.param as f32 } else { entity.aim as f32 };
            render[offset + 5] = entity.facing;
            render[offset + 6] = entity.timer;
            render[offset + 7] = entity.flash;
            if entity.kind == EntityKind::BossCore { render[BOSS_HEALTH] = entity.hit_points.max(0) as f32 / 40.0; }
            count += 1;
        }
        render[ENTITY_COUNT] = count as f32;
        count = 0;
        for bullet in world.bullets.iter().filter(|bullet| bullet.active) {
            let offset = BULLETS + count * BULLET_STRIDE;
            render[offset] = bullet.weapon as u8 as f32;
            render[offset + 1] = bullet.x;
            render[offset + 2] = bullet.y;
            render[offset + 3] = bullet.velocity_x;
            render[offset + 4] = bullet.velocity_y;
            count += 1;
        }
        render[BULLET_COUNT] = count as f32;
        count = 0;
        for bullet in world.enemy_bullets.iter().filter(|bullet| bullet.active) {
            let offset = ENEMY_BULLETS + count * ENEMY_BULLET_STRIDE;
            render[offset] = bullet.x;
            render[offset + 1] = bullet.y;
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
            count += 1;
        }
        render[PARTICLE_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }
    pub fn platforms_pointer(&self) -> *const f32 { self.platform_table.as_ptr() }
    pub fn platform_count() -> u32 { level::PLATFORM_COUNT as u32 }
    pub fn water_left() -> f32 { level::WATER[0].0 }
    pub fn water_right() -> f32 { level::WATER[0].1 }
    pub fn boss_wall_x() -> f32 { level::BOSS_WALL_X }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn lives(&self) -> u32 { self.world.lives }
    pub fn continues(&self) -> u32 { self.world.continues }
    pub fn weapon(&self) -> u32 { self.world.weapon as u32 }
    pub fn checkpoint_reached(&self) -> bool { self.world.checkpoint_reached }
    pub fn hero_x(&self) -> f32 { self.world.hero.x }
    pub fn hero_y(&self) -> f32 { self.world.hero.y }
    pub fn hero_aim(&self) -> u32 { self.world.hero.aim as u32 }
    pub fn hero_pose(&self) -> u32 { self.world.hero.pose as u32 }
    pub fn camera_x(&self) -> f32 { self.world.camera_x }
    pub fn enemies_defeated(&self) -> u32 { self.world.enemies_defeated }
    pub fn checkpoint_x() -> f32 { level::CHECKPOINT_X }
    pub fn level_end() -> f32 { level::LEVEL_END }

    // ---- test hooks (used by e2e/jungle-strike.mjs through ?jungleStrikeTest; harmless in normal play) ----
    pub fn debug_teleport(&mut self, x: f32) { self.world.teleport(x); self.fill_render(); }
    pub fn debug_set_invincible(&mut self, invincible: bool) { self.world.debug_invincible = invincible; }
    pub fn debug_set_weapon(&mut self, weapon: u8) { self.world.weapon = Weapon::from_u8(weapon); self.fill_render(); }
    /// Put a soldier `distance` units in front of the hero, running at it.
    pub fn debug_spawn_soldier(&mut self, distance: f32) -> bool {
        let world = &mut self.world;
        let x = world.hero.x + world.hero.facing * distance;
        let Some(platform) = world.platform_under(x, world.hero.y) else { return false };
        let slot = world.entities.iter_mut().find(|entity| !entity.active);
        let Some(slot) = slot else { return false };
        *slot = Entity { active: true, kind: EntityKind::Soldier, state: 0, x, y: level::PLATFORMS[platform].top, velocity_x: -world.hero.facing * SOLDIER_SPEED,
            velocity_y: 0.0, timer: 0.0, hit_points: 1, aim: 0, facing: -world.hero.facing, base_y: 0.0, param: 0, flash: 0.0, on_ground: true };
        true
    }
    /// Release a weapon capsule just above the hero.
    pub fn debug_spawn_capsule(&mut self, weapon: u8) -> bool {
        let world = &mut self.world;
        let (x, y) = (world.hero.x - 30.0, world.hero.y - 60.0);
        let Some(slot) = world.entities.iter_mut().find(|entity| !entity.active) else { return false };
        *slot = Entity { active: true, kind: EntityKind::Capsule, state: 0, x, y, velocity_x: 0.0, velocity_y: 0.0, timer: 0.0, hit_points: 1, aim: 0, facing: 1.0,
            base_y: y, param: weapon, flash: 0.0, on_ground: false };
        true
    }
    pub fn active_enemies(&self) -> u32 {
        self.world.entities.iter().filter(|entity| entity.active && entity.kind != EntityKind::Pickup).count() as u32
    }
}

impl Default for JungleStrike { fn default() -> Self { JungleStrike::new() } }

#[cfg(test)]
mod tests;
