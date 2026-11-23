//! Zombie Road for JavaScript. Rust owns the whole simulation; each frame JavaScript sets the held buttons, calls
//! `advance(seconds)` and reads everything to draw straight out of wasm memory: one fixed f32 render buffer
//! (`render_pointer()`) refilled in place. No allocation per frame.
pub mod waves;
pub mod world;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/zombieroad/engine.ts (checked by a test).
pub mod render_slot {
    use crate::world::{COVER_COUNT, MAX_BULLETS, MAX_PARTICLES, MAX_PICKUPS, MAX_SPITS, MAX_ZOMBIES, STAIN_RING};
    pub const PHASE: usize = 0;
    pub const PHASE_SECONDS: usize = 1;
    pub const WAVE: usize = 2;
    pub const SCORE: usize = 3;
    pub const LIVES: usize = 4;
    pub const HEALTH: usize = 5;
    pub const PLAYER_X: usize = 6;
    pub const INVULNERABLE: usize = 7;
    pub const SPREAD_SECONDS: usize = 8;
    pub const RAPID_SECONDS: usize = 9;
    pub const SHAKE: usize = 10;
    pub const FLASH: usize = 11;
    pub const ZOMBIES_ALIVE: usize = 12;
    pub const ZOMBIES_LEFT: usize = 13;
    pub const ZOMBIE_COUNT: usize = 14;
    pub const BULLET_COUNT: usize = 15;
    pub const SPIT_COUNT: usize = 16;
    pub const PARTICLE_COUNT: usize = 17;
    pub const PICKUP_COUNT: usize = 18;
    pub const KILLS: usize = 19;
    pub const WAVE_TOTAL: usize = 20;
    /// health fraction of the Tank on the road, or -1 when there is none
    pub const TANK_HEALTH: usize = 21;
    pub const AUTO_FIRE: usize = 22;
    pub const SINCE_SHOT: usize = 23;
    /// how many stains have ever been made; the newest STAIN_RING sit in STAINS (serial % STAIN_RING)
    pub const STAIN_SERIAL: usize = 24;
    /// kind, x, y, health fraction for every cover (fixed order)
    pub const COVERS: usize = 32;
    pub const COVER_STRIDE: usize = 4;
    /// kind, x, y, walk cycle, health fraction, hit flash, state per living zombie
    pub const ZOMBIES: usize = COVERS + COVER_COUNT * COVER_STRIDE;
    pub const ZOMBIE_STRIDE: usize = 7;
    /// x, y per bullet
    pub const BULLETS: usize = ZOMBIES + MAX_ZOMBIES * ZOMBIE_STRIDE;
    pub const BULLET_STRIDE: usize = 2;
    /// x, y, age per acid glob
    pub const SPITS: usize = BULLETS + MAX_BULLETS * BULLET_STRIDE;
    pub const SPIT_STRIDE: usize = 3;
    /// kind, x, y, progress (0..1), value per particle
    pub const PARTICLES: usize = SPITS + MAX_SPITS * SPIT_STRIDE;
    pub const PARTICLE_STRIDE: usize = 5;
    /// kind, x, y, age per falling pickup
    pub const PICKUPS: usize = PARTICLES + MAX_PARTICLES * PARTICLE_STRIDE;
    pub const PICKUP_STRIDE: usize = 4;
    /// x, y, zombie kind per stain slot
    pub const STAINS: usize = PICKUPS + MAX_PICKUPS * PICKUP_STRIDE;
    pub const STAIN_STRIDE: usize = 3;
    pub const LENGTH: usize = STAINS + STAIN_RING * STAIN_STRIDE;
}

#[wasm_bindgen]
pub struct ZombieRoad {
    world: World,
    render: [f32; render_slot::LENGTH],
}

impl Default for ZombieRoad { fn default() -> Self { ZombieRoad::new() } }

#[wasm_bindgen]
impl ZombieRoad {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ZombieRoad {
        let mut game = ZombieRoad { world: World::new(), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right, 4 fire.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    /// Where a finger wants the survivor (world x); negative for none.
    pub fn set_target_x(&mut self, x: f32) { self.world.target_x = if x.is_finite() { x } else { -1.0 }; }
    pub fn set_auto_fire(&mut self, on: bool) { self.world.auto_fire = on; self.fill_render(); }
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
        render[HEALTH] = world.health;
        render[PLAYER_X] = world.player_x;
        render[INVULNERABLE] = world.invulnerable_seconds;
        render[SPREAD_SECONDS] = world.spread_seconds;
        render[RAPID_SECONDS] = world.rapid_seconds;
        render[SHAKE] = world.shake;
        render[FLASH] = world.flash;
        render[ZOMBIES_ALIVE] = world.zombies_alive as f32;
        render[ZOMBIES_LEFT] = world.zombies_left() as f32;
        render[KILLS] = world.kills as f32;
        render[WAVE_TOTAL] = (world.plan.regular_total + world.plan.has_tank as u32) as f32;
        render[AUTO_FIRE] = if world.auto_fire { 1.0 } else { 0.0 };
        render[SINCE_SHOT] = world.since_shot;
        render[TANK_HEALTH] = -1.0;
        render[STAIN_SERIAL] = world.stain_serial as f32;
        for (index, stain) in world.stains.iter().enumerate() {
            render[STAINS + index * STAIN_STRIDE..STAINS + index * STAIN_STRIDE + STAIN_STRIDE].copy_from_slice(stain);
        }
        for (index, cover) in world.covers.iter().enumerate() {
            let offset = COVERS + index * COVER_STRIDE;
            render[offset] = cover.kind as u8 as f32;
            render[offset + 1] = cover.x;
            render[offset + 2] = cover.y;
            render[offset + 3] = cover.health / cover.max_health;
        }
        let mut count = 0;
        for zombie in world.zombies.iter().filter(|zombie| zombie.active) {
            let offset = ZOMBIES + count * ZOMBIE_STRIDE;
            render[offset] = zombie.kind as u8 as f32;
            render[offset + 1] = zombie.x;
            render[offset + 2] = zombie.y;
            render[offset + 3] = zombie.walk_cycle;
            render[offset + 4] = zombie.health / zombie.max_health;
            render[offset + 5] = zombie.hit_flash;
            render[offset + 6] = zombie.state as u8 as f32;
            if zombie.kind == ZombieKind::Tank { render[TANK_HEALTH] = zombie.health / zombie.max_health; }
            count += 1;
        }
        render[ZOMBIE_COUNT] = count as f32;
        count = 0;
        for bullet in world.bullets.iter().filter(|bullet| bullet.active) {
            let offset = BULLETS + count * BULLET_STRIDE;
            render[offset] = bullet.x;
            render[offset + 1] = bullet.y;
            count += 1;
        }
        render[BULLET_COUNT] = count as f32;
        count = 0;
        for spit in world.spits.iter().filter(|spit| spit.active) {
            let offset = SPITS + count * SPIT_STRIDE;
            render[offset] = spit.x;
            render[offset + 1] = spit.y;
            render[offset + 2] = spit.age;
            count += 1;
        }
        render[SPIT_COUNT] = count as f32;
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
        for pickup in world.pickups.iter().filter(|pickup| pickup.active) {
            let offset = PICKUPS + count * PICKUP_STRIDE;
            render[offset] = pickup.kind as u8 as f32;
            render[offset + 1] = pickup.x;
            render[offset + 2] = pickup.y;
            render[offset + 3] = pickup.age;
            count += 1;
        }
        render[PICKUP_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn wave(&self) -> u32 { self.world.wave }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn lives(&self) -> u32 { self.world.lives }
    pub fn health(&self) -> f32 { self.world.health }
    pub fn kills(&self) -> u32 { self.world.kills }
    pub fn player_x(&self) -> f32 { self.world.player_x }
    pub fn zombies_alive(&self) -> u32 { self.world.zombies_alive }
    pub fn zombies_left(&self) -> u32 { self.world.zombies_left() }
    pub fn auto_fire(&self) -> bool { self.world.auto_fire }
    pub fn cover_health(&self, index: u32) -> f32 { self.world.covers.get(index as usize).map_or(0.0, |cover| cover.health) }

    // ---- test hooks (used by e2e/zombie-road.mjs through ?zombieTest; harmless in normal play) ----
    pub fn debug_set_invincible(&mut self, invincible: bool) { self.world.debug_invincible = invincible; }
    pub fn debug_set_wave(&mut self, wave: u32) { self.world.setup_wave(wave); self.fill_render(); }
    pub fn debug_clear_wave(&mut self) { self.world.debug_clear_wave(); self.fill_render(); }
    pub fn debug_set_health(&mut self, health: f32) { self.world.health = limit(health, 1.0, MAX_HEALTH); self.fill_render(); }
    pub fn debug_set_lives(&mut self, lives: u32) { self.world.lives = lives.max(1).min(MAX_LIVES); self.fill_render(); }
    pub fn debug_spawn_zombie(&mut self, kind: u32, x: f32, y: f32) -> bool {
        let spawned = self.world.spawn_zombie(ZombieKind::from_index(kind), x, y);
        self.fill_render();
        spawned
    }
    pub fn debug_drop_pickup(&mut self, kind: u32) {
        let x = self.world.player_x;
        self.world.drop_pickup(PickupKind::from_index(kind), x, PLAYER_Y - 30.0);
        self.fill_render();
    }
    /// x of the living zombie lowest on the road (the most dangerous), or -1.
    pub fn debug_most_dangerous_zombie_x(&self) -> f32 {
        self.world.zombies.iter().filter(|zombie| zombie.active && zombie.y > -4.0)
            .fold((-1.0f32, -1.0e9f32), |best, zombie| if zombie.y > best.1 { (zombie.x, zombie.y) } else { best }).0
    }
}
