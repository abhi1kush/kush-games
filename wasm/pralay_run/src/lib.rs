//! Pralay Run for JavaScript. Rust owns the whole simulation; each frame JavaScript sets the held buttons, calls
//! `advance(seconds)` and reads everything to draw straight out of wasm memory through `render_pointer()` (a fixed
//! f32 buffer), with no allocation per frame.
pub mod gen;
pub mod world;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/pralayrun/engine.ts.
pub mod render_slot {
    pub const HERO_X: usize = 0;
    pub const HERO_Y: usize = 1;
    pub const HERO_VELOCITY_X: usize = 2;
    pub const HERO_VELOCITY_Y: usize = 3;
    pub const HERO_FACING: usize = 4;
    pub const HERO_POSE: usize = 5;
    pub const HERO_INVULNERABLE: usize = 6;
    pub const HERO_DASH: usize = 7;
    pub const CAMERA_X: usize = 8;
    pub const VOID_X: usize = 9;
    pub const PHASE: usize = 10;
    pub const SCORE: usize = 11;
    pub const DISTANCE: usize = 12;
    pub const HP: usize = 13;
    pub const KILLS: usize = 14;
    pub const GEMS: usize = 15;
    pub const PACE: usize = 16;
    pub const PLATFORM_COUNT: usize = 17;
    pub const PROP_COUNT: usize = 18;
    pub const ENEMY_COUNT: usize = 19;
    pub const BULLET_COUNT: usize = 20;
    pub const EFFECT_COUNT: usize = 21;
    pub const CLOCK: usize = 22;
    pub const HERO_STRIDE: usize = 23;
    pub const AIR_JUMPS: usize = 24;
    pub const CAN_DASH: usize = 25;
    pub const SHOT_COOLDOWN: usize = 26;
    pub const DYING_TIME: usize = 27;
    pub const VOID_SPEED: usize = 28;
    pub const ELAPSED: usize = 29;
    /// x, y (with fall), w, h, kind, crumble timer, fall distance
    pub const PLATFORMS: usize = 32;
    pub const PLATFORM_STRIDE: usize = 7;
    /// kind, x, y (with fall), w, state (vent cycle seconds), fall distance
    pub const PROPS: usize = PLATFORMS + super::MAX_PLATFORMS * PLATFORM_STRIDE;
    pub const PROP_STRIDE: usize = 6;
    /// kind, x, y, facing, flash, timer, hp
    pub const ENEMIES: usize = PROPS + super::MAX_PROPS * PROP_STRIDE;
    pub const ENEMY_STRIDE: usize = 7;
    /// from hero (1/0), x, y, velocity x, velocity y
    pub const BULLETS: usize = ENEMIES + super::MAX_ENEMIES * ENEMY_STRIDE;
    pub const BULLET_STRIDE: usize = 5;
    /// kind, x, y, age, value
    pub const EFFECTS: usize = BULLETS + super::MAX_BULLETS * BULLET_STRIDE;
    pub const EFFECT_STRIDE: usize = 5;
    pub const LENGTH: usize = EFFECTS + super::MAX_EFFECTS * EFFECT_STRIDE;
}

#[wasm_bindgen]
pub struct PralayRun {
    world: World,
    render: Vec<f32>,
}

#[wasm_bindgen]
impl PralayRun {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> PralayRun {
        let mut game = PralayRun { world: World::new(seed), render: vec![0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right, 4 jump, 8 dash, 16 fire.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    pub fn press_jump(&mut self) { self.world.press_jump(); }
    pub fn press_dash(&mut self) { self.world.press_dash(); }
    /// Visible width in world units (the height is always 270).
    pub fn set_view_width(&mut self, width: f32) {
        self.world.view_width = clamp_between(width, 240.0, 720.0);
        self.world.generate();
        self.fill_render();
    }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    /// A fresh run on a new layout.
    pub fn restart(&mut self, seed: u32) {
        let view_width = self.world.view_width;
        self.world = World::new(seed);
        self.world.view_width = view_width;
        self.world.camera_x = START_X - view_width * 0.36;
        self.world.generate();
        self.fill_render();
    }

    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        let hero = &world.hero;
        render[HERO_X] = hero.x;
        render[HERO_Y] = hero.y;
        render[HERO_VELOCITY_X] = hero.velocity_x;
        render[HERO_VELOCITY_Y] = hero.velocity_y;
        render[HERO_FACING] = hero.facing;
        render[HERO_POSE] = hero.pose as u8 as f32;
        render[HERO_INVULNERABLE] = hero.invulnerable.max(0.0);
        render[HERO_DASH] = hero.dash_time.max(0.0);
        render[CAMERA_X] = world.camera_x;
        render[VOID_X] = world.void_x;
        render[PHASE] = world.phase as u8 as f32;
        render[SCORE] = world.score() as f32;
        render[DISTANCE] = world.distance() as f32;
        render[HP] = hero.hp as f32;
        render[KILLS] = world.kills as f32;
        render[GEMS] = world.gems as f32;
        render[PACE] = world.pace();
        render[CLOCK] = world.clock;
        render[HERO_STRIDE] = hero.stride;
        render[AIR_JUMPS] = hero.air_jumps as f32;
        render[CAN_DASH] = if hero.can_dash && hero.dash_cooldown <= 0.0 { 1.0 } else { 0.0 };
        render[SHOT_COOLDOWN] = hero.shot_cooldown.max(0.0);
        render[DYING_TIME] = world.dying_time;
        render[VOID_SPEED] = world.void_speed;
        render[ELAPSED] = world.elapsed;
        let count = world.platforms.len().min(MAX_PLATFORMS);
        for (index, platform) in world.platforms.iter().take(count).enumerate() {
            let offset = PLATFORMS + index * PLATFORM_STRIDE;
            render[offset] = platform.x;
            render[offset + 1] = platform.y + platform.fall_y;
            render[offset + 2] = platform.w;
            render[offset + 3] = platform.h;
            render[offset + 4] = platform.kind as u8 as f32;
            render[offset + 5] = platform.crumble;
            render[offset + 6] = platform.fall_y;
        }
        render[PLATFORM_COUNT] = count as f32;
        let mut count = 0;
        for prop in world.props.iter() {
            if prop.taken || count >= MAX_PROPS { continue; }
            let offset = PROPS + count * PROP_STRIDE;
            render[offset] = prop.kind as u8 as f32;
            render[offset + 1] = prop.x;
            render[offset + 2] = prop.y + prop.fall_y;
            render[offset + 3] = prop.w;
            render[offset + 4] = if prop.kind == PropKind::Vent { world.vent_cycle(prop) } else { prop.phase };
            render[offset + 5] = prop.fall_y;
            count += 1;
        }
        render[PROP_COUNT] = count as f32;
        let count = world.enemies.len().min(MAX_ENEMIES);
        for (index, enemy) in world.enemies.iter().take(count).enumerate() {
            let offset = ENEMIES + index * ENEMY_STRIDE;
            render[offset] = enemy.kind as u8 as f32;
            render[offset + 1] = enemy.x;
            render[offset + 2] = enemy.y;
            render[offset + 3] = enemy.facing;
            render[offset + 4] = enemy.flash.max(0.0);
            render[offset + 5] = enemy.timer;
            render[offset + 6] = enemy.hp as f32;
        }
        render[ENEMY_COUNT] = count as f32;
        let count = world.bullets.len().min(MAX_BULLETS);
        for (index, bullet) in world.bullets.iter().take(count).enumerate() {
            let offset = BULLETS + index * BULLET_STRIDE;
            render[offset] = if bullet.from_hero { 1.0 } else { 0.0 };
            render[offset + 1] = bullet.x;
            render[offset + 2] = bullet.y;
            render[offset + 3] = bullet.velocity_x;
            render[offset + 4] = bullet.velocity_y;
        }
        render[BULLET_COUNT] = count as f32;
        let count = world.effects.len().min(MAX_EFFECTS);
        for (index, effect) in world.effects.iter().take(count).enumerate() {
            let offset = EFFECTS + index * EFFECT_STRIDE;
            render[offset] = effect.kind as u8 as f32;
            render[offset + 1] = effect.x;
            render[offset + 2] = effect.y;
            render[offset + 3] = effect.age;
            render[offset + 4] = effect.value;
        }
        render[EFFECT_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn score(&self) -> u32 { self.world.score() }
    pub fn distance(&self) -> u32 { self.world.distance() }
    pub fn kills(&self) -> u32 { self.world.kills }
    pub fn gems(&self) -> u32 { self.world.gems }
    pub fn hp(&self) -> u32 { self.world.hero.hp }
    pub fn pace(&self) -> f32 { self.world.pace() }
    pub fn hero_x(&self) -> f32 { self.world.hero.x }
    pub fn hero_y(&self) -> f32 { self.world.hero.y }
    pub fn void_x(&self) -> f32 { self.world.void_x }
    pub fn enemy_count(&self) -> u32 { self.world.enemies.len() as u32 }

    // ---- test hooks (used by e2e/pralay-run.mjs through ?pralayTest; harmless in normal play) ----
    /// Push the Pralay back (or forward) to `x`.
    pub fn debug_set_void(&mut self, x: f32) { self.world.void_x = x; self.fill_render(); }
    /// Put an enemy (0 shade, 1 wisp, 2 idol) at x on the ground the hero stands on.
    pub fn debug_spawn(&mut self, kind: u32, x: f32) {
        let kind = match kind { 1 => EnemyKind::Wisp, 2 => EnemyKind::Idol, _ => EnemyKind::Shade };
        let y = if kind == EnemyKind::Wisp { self.world.hero.y - 6.0 } else { self.world.hero.y };
        self.world.spawn_enemy(kind, x, y);
        self.fill_render();
    }
    /// Remove every hazard and enemy and lay flat ground from the hero to `until` (for deterministic e2e checks).
    pub fn debug_flatten(&mut self, until: f32) {
        let world = &mut self.world;
        let y = world.hero.y;
        world.platforms.retain(|platform| platform.right() < world.hero.x - 40.0);
        world.props.clear();
        world.enemies.clear();
        let mut x = ((world.hero.x - 40.0) / gen::BLOCK).floor() * gen::BLOCK;
        while x < until && world.platforms.len() < MAX_PLATFORMS - 2 {
            world.platforms.push(Platform { x, y, w: gen::BLOCK, h: VIEW_HEIGHT + 60.0 - y, kind: PlatformKind::Ground, crumble: -1.0, falling: false, fall_y: 0.0, fall_speed: 0.0, jitter: 0.0 });
            x += gen::BLOCK;
        }
        world.gen_x = x;
        world.ground_y = y;
        world.need_ground = true;
        self.fill_render();
    }
}

#[cfg(test)]
mod tests;
