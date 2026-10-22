//! Breakout for JavaScript. Rust owns the whole simulation; each frame JavaScript calls `advance(seconds)` and then
//! reads positions straight out of wasm memory through `render_pointer()` (a fixed f32 buffer, no allocation per frame).
pub mod world;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots).
pub mod render_slot {
    pub const PADDLE_X: usize = 0;
    pub const PADDLE_WIDTH: usize = 1;
    pub const BALL_COUNT: usize = 2;
    pub const BALLS: usize = 3; // x, y per ball (3 balls)
    pub const POWER_UP_COUNT: usize = 9;
    pub const POWER_UPS: usize = 10; // x, y, kind per power-up (4)
    pub const PHASE: usize = 22;
    pub const LEVEL: usize = 23;
    pub const SCORE: usize = 24;
    pub const LIVES: usize = 25;
    pub const BRICKS_VERSION: usize = 26;
    pub const WIDE_SECONDS: usize = 27;
    pub const LENGTH: usize = 28;
}

#[wasm_bindgen]
pub struct Breakout {
    world: World,
    render: [f32; render_slot::LENGTH],
}

#[wasm_bindgen]
impl Breakout {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Breakout {
        let mut game = Breakout { world: World::new(seed), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Simulate `seconds` of play (fixed 1/120 s steps inside). Returns a bitmask of events for sounds.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        render[PADDLE_X] = world.paddle_x;
        render[PADDLE_WIDTH] = world.paddle_width;
        render[BALL_COUNT] = world.balls.len() as f32;
        for (index, ball) in world.balls.iter().enumerate().take(MAX_BALLS) {
            render[BALLS + index * 2] = ball.x;
            render[BALLS + index * 2 + 1] = ball.y;
        }
        render[POWER_UP_COUNT] = world.power_ups.len() as f32;
        for (index, power_up) in world.power_ups.iter().enumerate().take(MAX_POWER_UPS) {
            render[POWER_UPS + index * 3] = power_up.x;
            render[POWER_UPS + index * 3 + 1] = power_up.y;
            render[POWER_UPS + index * 3 + 2] = power_up.kind as u8 as f32;
        }
        render[PHASE] = world.phase as u8 as f32;
        render[LEVEL] = world.level as f32;
        render[SCORE] = world.score as f32;
        render[LIVES] = world.lives as f32;
        render[BRICKS_VERSION] = world.bricks_version as f32;
        render[WIDE_SECONDS] = world.wide_seconds_left.max(0.0);
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn bricks_pointer(&self) -> *const u8 { self.world.bricks.as_ptr() }
    pub fn bricks(&self) -> Vec<u8> { self.world.bricks.to_vec() }

    /// Pointer / touch: move the paddle centre towards x (world units). Pass a negative number to stop following.
    pub fn set_paddle_target(&mut self, x: f32) { self.world.paddle_target = if x < 0.0 { None } else { Some(x) }; }
    /// Keyboard: -1 left, 0 stop, 1 right.
    pub fn set_paddle_direction(&mut self, direction: i32) { self.world.paddle_direction = direction.signum() as f32; }

    pub fn launch(&mut self) { self.world.launch(); self.fill_render(); }
    pub fn next_level(&mut self) {
        if self.world.phase == Phase::LevelCleared { let level = self.world.level + 1; self.world.start_level(level); }
        self.fill_render();
    }
    pub fn restart(&mut self) {
        self.world.level = 1;
        self.world.score = 0;
        self.world.lives = START_LIVES;
        self.world.start_level(1);
        self.fill_render();
    }
    pub fn restore(&mut self, level: u32, score: u32, lives: u32, bricks: &[u8]) -> bool {
        let restored = self.world.restore(level, score, lives, bricks);
        self.fill_render();
        restored
    }

    pub fn level(&self) -> u32 { self.world.level }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn lives(&self) -> u32 { self.world.lives }
    pub fn phase(&self) -> u32 { self.world.phase as u32 }
}

#[cfg(test)]
mod tests;
