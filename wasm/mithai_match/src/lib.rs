//! Mithai Match for JavaScript. Rust owns the board, matching, specials, cascades, the seeded RNG and the level rules;
//! each frame JavaScript calls `advance(seconds)` and draws from one fixed f32 render buffer read straight out of wasm
//! memory (`render_pointer()`), refilled in place with no allocation.
pub mod levels;
pub mod world;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/mithai/engine.ts.
pub mod render_slot {
    use crate::world::{CELLS, MAX_EFFECTS, MAX_GHOSTS, MAX_PARTICLES};
    pub const PHASE: usize = 0;
    pub const PHASE_SECONDS: usize = 1;
    pub const SCORE: usize = 2;
    pub const MOVES_LEFT: usize = 3;
    pub const LEVEL: usize = 4;
    pub const GOAL_REMAINING: usize = 5;
    pub const CASCADE: usize = 6;
    pub const STARS: usize = 7;
    pub const SELECTED: usize = 8;
    pub const HINT_A: usize = 9;
    pub const HINT_B: usize = 10;
    pub const SHOW_HINT: usize = 11;
    pub const SLIDE_PROGRESS: usize = 12;
    pub const GHOST_COUNT: usize = 13;
    pub const PARTICLE_COUNT: usize = 14;
    pub const EFFECT_COUNT: usize = 15;
    pub const ANIMATING: usize = 16;
    /// colour (255 none), special, locked, jelly, stone, hole, x offset, y offset per cell (offsets in cells, already eased)
    pub const CELLS_START: usize = 20;
    pub const CELL_STRIDE: usize = 8;
    /// colour, special, cell, progress per clearing piece
    pub const GHOSTS: usize = CELLS_START + CELLS * CELL_STRIDE;
    pub const GHOST_STRIDE: usize = 4;
    /// x, y (cells), colour, progress per spark
    pub const PARTICLES: usize = GHOSTS + MAX_GHOSTS * GHOST_STRIDE;
    pub const PARTICLE_STRIDE: usize = 4;
    /// kind, cell, progress, value per effect
    pub const EFFECTS: usize = PARTICLES + MAX_PARTICLES * PARTICLE_STRIDE;
    pub const EFFECT_STRIDE: usize = 4;
    pub const LENGTH: usize = EFFECTS + MAX_EFFECTS * EFFECT_STRIDE;
}

#[wasm_bindgen]
pub struct MithaiMatch {
    world: World,
    render: [f32; render_slot::LENGTH],
}

impl Default for MithaiMatch { fn default() -> Self { MithaiMatch::new() } }

#[wasm_bindgen]
impl MithaiMatch {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MithaiMatch {
        let mut game = MithaiMatch { world: World::new(), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    pub fn start_level(&mut self, index: u32, seed: u32) { self.world.start_level(index as usize, seed); self.fill_render(); }
    pub fn begin(&mut self) { self.world.begin(); self.fill_render(); }
    pub fn tap(&mut self, cell: u32) { self.world.tap(cell as usize); self.fill_render(); }
    /// 0 up, 1 right, 2 down, 3 left
    pub fn swipe(&mut self, cell: u32, direction: u32) { self.world.swipe(cell as usize, direction); self.fill_render(); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let events = self.world.advance(seconds);
        self.fill_render();
        events
    }

    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let render = &mut self.render;
        render[PHASE] = world.phase as u8 as f32;
        render[PHASE_SECONDS] = world.phase_seconds;
        render[SCORE] = world.score as f32;
        render[MOVES_LEFT] = world.moves_left as f32;
        render[LEVEL] = world.level_index as f32;
        render[GOAL_REMAINING] = world.goal_remaining() as f32;
        render[CASCADE] = world.cascade as f32;
        render[STARS] = world.stars as f32;
        render[SELECTED] = world.selected as f32;
        render[HINT_A] = world.hint.0 as f32;
        render[HINT_B] = world.hint.1 as f32;
        render[SHOW_HINT] = if world.phase == Phase::Idle && world.idle_seconds >= HINT_AFTER_SECONDS { 1.0 } else { 0.0 };
        let slide = 1.0 - world.slide_progress();
        render[SLIDE_PROGRESS] = slide;
        render[ANIMATING] = if world.is_animating() { 1.0 } else { 0.0 };
        for (index, cell) in world.cells.iter().enumerate() {
            let offset = CELLS_START + index * CELL_STRIDE;
            let has_piece = !cell.hole && cell.stone == 0 && cell.colour != NO_PIECE;
            render[offset] = if has_piece { cell.colour as f32 } else { 255.0 };
            render[offset + 1] = cell.special as u8 as f32;
            render[offset + 2] = if cell.locked { 1.0 } else { 0.0 };
            render[offset + 3] = cell.jelly as f32;
            render[offset + 4] = cell.stone as f32;
            render[offset + 5] = if cell.hole { 1.0 } else { 0.0 };
            render[offset + 6] = cell.slide_x * slide;
            render[offset + 7] = cell.slide_y * slide + cell.fall_offset;
        }
        let mut count = 0;
        for ghost in world.ghosts.iter().filter(|ghost| ghost.active) {
            let offset = GHOSTS + count * GHOST_STRIDE;
            render[offset] = ghost.colour as f32;
            render[offset + 1] = ghost.special as f32;
            render[offset + 2] = ghost.cell as f32;
            render[offset + 3] = ghost.age / CLEAR_SECONDS;
            count += 1;
        }
        render[GHOST_COUNT] = count as f32;
        count = 0;
        for particle in world.particles.iter().filter(|particle| particle.active) {
            let offset = PARTICLES + count * PARTICLE_STRIDE;
            render[offset] = particle.x;
            render[offset + 1] = particle.y;
            render[offset + 2] = particle.colour as f32;
            render[offset + 3] = particle.age / particle.life;
            count += 1;
        }
        render[PARTICLE_COUNT] = count as f32;
        count = 0;
        for effect in world.effects.iter().filter(|effect| effect.active) {
            let offset = EFFECTS + count * EFFECT_STRIDE;
            render[offset] = effect.kind as u8 as f32;
            render[offset + 1] = effect.cell as f32;
            render[offset + 2] = effect.age / effect.life;
            render[offset + 3] = effect.value as f32;
            count += 1;
        }
        render[EFFECT_COUNT] = count as f32;
    }

    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }
    pub fn level_count() -> u32 { levels::LEVEL_COUNT as u32 }
    /// One fact about a level by `field`: 0 moves, colours, 1 colours, 2 goal kind (0 score, 1 collect, 2 jelly, 3 blockers), 3 goal amount, 4 goal colour, 5 two-star score, 6 three-star score.
    pub fn level_info(index: u32, field: u32) -> u32 {
        let level = levels::LEVELS[(index as usize).min(levels::LEVEL_COUNT - 1)];
        let (kind, amount, colour) = match level.goal {
            levels::Goal::Score(target) => (0, target, 0),
            levels::Goal::Collect { colour, count } => (1, count, colour as u32),
            levels::Goal::ClearJelly => (2, 0, 0),
            levels::Goal::ClearBlockers => (3, 0, 0),
        };
        match field { 0 => level.moves, 1 => level.colours as u32, 2 => kind, 3 => amount, 4 => colour, 5 => level.two_stars, _ => level.three_stars }
    }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn score(&self) -> u32 { self.world.score }
    pub fn moves_left(&self) -> u32 { self.world.moves_left }
    pub fn stars(&self) -> u32 { self.world.stars }
    pub fn level(&self) -> u32 { self.world.level_index as u32 }
    pub fn goal_remaining(&self) -> u32 { self.world.goal_remaining() }
    pub fn goal_total(&self) -> u32 {
        match self.world.level.goal {
            levels::Goal::Score(target) => target,
            levels::Goal::Collect { count, .. } => count,
            _ => 0,
        }
    }
    pub fn specials_made(&self) -> u32 { self.world.specials_made }
    pub fn colour_at(&self, cell: u32) -> u32 { if self.world.has_piece(cell as usize) { self.world.cells[cell as usize].colour as u32 } else { 255 } }
    pub fn special_at(&self, cell: u32) -> u32 { self.world.cells[cell as usize].special as u32 }
    /// A valid swap as (a × 64 + b), or -1.
    pub fn hint_move(&mut self) -> i32 { self.world.find_move().map(|(a, b)| (a * 64 + b) as i32).unwrap_or(-1) }

    // ---- test hooks (used by e2e/mithai-match.mjs through ?mithaiTest; harmless in normal play) ----
    pub fn debug_place(&mut self, cell: u32, colour: u32, special: u32) {
        let special = match special { 1 => Special::StripedH, 2 => Special::StripedV, 3 => Special::Wrapped, 4 => Special::ColourBomb, _ => Special::None };
        self.world.debug_place(cell as usize, colour as u8, special);
        self.fill_render();
    }
    pub fn debug_set_moves(&mut self, moves: u32) { self.world.moves_left = moves; self.fill_render(); }
    pub fn debug_set_score(&mut self, score: u32) { self.world.score = score; self.fill_render(); }
}

#[cfg(test)]
impl World {
    /// Goal progress weighted far above points, for the greedy bot.
    pub fn bot_value(&self) -> i64 { -(self.goal_remaining() as i64) * 1000 + self.score as i64 }
}

#[cfg(test)]
/// One-ply greedy: try every valid swap on a copy, keep the one that leaves the best `bot_value`.
pub fn best_move_impl(world: &World) -> Option<(usize, usize)> {
    let mut scratch = world.clone();
    let mut moves = [(0usize, 0usize); 128];
    let count = scratch.valid_moves(&mut moves);
    let mut best = None;
    let mut best_value = i64::MIN;
    for &(a, b) in moves.iter().take(count) {
        let mut trial = world.clone();
        trial.phase = Phase::Idle;
        if !trial.try_swap(a, b) { continue; }
        trial.finish_animations();
        let value = trial.bot_value();
        if value > best_value { best_value = value; best = Some((a, b)); }
    }
    best
}
