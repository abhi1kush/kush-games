//! The whole Mithai Match simulation: an 8 × 8 board of sweets, swaps, matches, specials, cascades, blockers and level rules.
//! Animations (swap slides, falls, pops) are timed here too, in fixed STEP_SECONDS steps with the usual lag protections:
//! a frame gap longer than HITCH_SECONDS is dropped (one 60 Hz frame is simulated) and a slow frame simulates at most
//! MAX_FRAME_SECONDS. Everything lives in fixed arrays; cell sets are u64 bitmasks; nothing allocates after `World::new`.
use crate::levels::{Goal, Level, LEVELS, LEVEL_COUNT};

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const MAX_FRAME_SECONDS: f32 = 0.05;
pub const HITCH_SECONDS: f32 = 0.1;

pub const SIZE: usize = 8;
pub const CELLS: usize = SIZE * SIZE;
pub const NO_PIECE: u8 = 255;
/// Colour bombs carry this pseudo-colour (they never match by colour).
pub const BOMB_COLOUR: u8 = 6;

pub const SWAP_SECONDS: f32 = 0.16;
pub const CLEAR_SECONDS: f32 = 0.24;
pub const SHUFFLE_SECONDS: f32 = 0.6;
pub const FALL_GRAVITY: f32 = 75.0; // cells / s²
pub const HINT_AFTER_SECONDS: f32 = 5.0;
pub const BONUS_PER_MOVE: u32 = 250;

pub const MAX_GHOSTS: usize = CELLS;
pub const MAX_PARTICLES: usize = 200;
pub const MAX_EFFECTS: usize = 24;

pub mod events {
    pub const SWAP: u32 = 1;
    pub const INVALID: u32 = 2;
    pub const MATCH: u32 = 4;
    pub const SPECIAL_MADE: u32 = 8;
    pub const STRIPED: u32 = 16;
    pub const WRAPPED: u32 = 32;
    pub const COLOUR_BOMB: u32 = 64;
    pub const JELLY: u32 = 128;
    pub const STONE: u32 = 256;
    pub const LOCK: u32 = 512;
    pub const SHUFFLE: u32 = 1024;
    pub const WON: u32 = 2048;
    pub const LOST: u32 = 4096;
    pub const LANDED: u32 = 8192;
    pub const BONUS: u32 = 16384;
    pub const HITCH: u32 = 32768;
    pub const SELECT: u32 = 65536;
    pub const COMBO: u32 = 131072;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Special { None = 0, StripedH = 1, StripedV = 2, Wrapped = 3, ColourBomb = 4 }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Phase { Ready = 0, Idle = 1, Swapping = 2, SwapBack = 3, Clearing = 4, Falling = 5, Shuffling = 6, Won = 7, Lost = 8 }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum EffectKind { RowBeam = 0, ColumnBeam = 1, Blast = 2, BombRays = 3, ScoreText = 4, BigBlast = 5, Made = 6 }

#[derive(Clone, Copy, Debug)]
pub struct Cell {
    pub colour: u8,
    pub special: Special,
    pub locked: bool,
    pub jelly: u8,
    pub stone: u8,
    pub hole: bool,
    /// Where the piece slid from (in cells, relative), eased to 0 over a swap or shuffle.
    pub slide_x: f32,
    pub slide_y: f32,
    /// Rows above its cell while falling (negative), and its fall speed.
    pub fall_offset: f32,
    pub fall_velocity: f32,
}

impl Default for Cell {
    fn default() -> Self { Cell { colour: NO_PIECE, special: Special::None, locked: false, jelly: 0, stone: 0, hole: false, slide_x: 0.0, slide_y: 0.0, fall_offset: 0.0, fall_velocity: 0.0 } }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Ghost { pub active: bool, pub colour: u8, pub special: u8, pub cell: u8, pub age: f32 }

#[derive(Clone, Copy, Debug, Default)]
pub struct Particle { pub active: bool, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub age: f32, pub life: f32, pub colour: u8 }

#[derive(Clone, Copy, Debug)]
pub struct Effect { pub active: bool, pub kind: EffectKind, pub cell: u8, pub age: f32, pub life: f32, pub value: u32 }

impl Default for Effect { fn default() -> Self { Effect { active: false, kind: EffectKind::Blast, cell: 0, age: 0.0, life: 1.0, value: 0 } } }

/// A run of 3+ same-coloured pieces in a row or column.
#[derive(Clone, Copy, Debug, Default)]
struct Run { mask: u64, length: usize, horizontal: bool, colour: u8, start: usize }

/// What a clearing stage hits: `mask` cells are hit (pieces cleared, jelly peeled, locks broken, stones chipped);
/// `match_cells` are cells in colour matches (they also chip neighbouring stones); new specials are placed at `creations`.
#[derive(Clone, Copy)]
struct ClearPlan {
    mask: u64,
    match_cells: u64,
    pre_activated: u64,
    creations: [(u8, u8, Special); 16],
    creation_count: usize,
}

impl ClearPlan {
    fn new() -> ClearPlan { ClearPlan { mask: 0, match_cells: 0, pre_activated: 0, creations: [(0, 0, Special::None); 16], creation_count: 0 } }
    fn creation_at(&self, cell: usize) -> Option<(u8, Special)> {
        self.creations[..self.creation_count].iter().find(|creation| creation.0 as usize == cell).map(|creation| (creation.1, creation.2))
    }
}

pub const fn bit(cell: usize) -> u64 { 1u64 << cell }
pub const fn row_of(cell: usize) -> usize { cell / SIZE }
pub const fn column_of(cell: usize) -> usize { cell % SIZE }
pub const fn cell_at(row: usize, column: usize) -> usize { row * SIZE + column }
pub fn row_mask(row: usize) -> u64 { 0xffu64 << (row * SIZE) }
pub fn column_mask(column: usize) -> u64 { 0x0101_0101_0101_0101u64 << column }
/// Every cell within `radius` (square) of `cell`.
pub fn area_mask(cell: usize, radius: i32) -> u64 {
    let (row, column) = (row_of(cell) as i32, column_of(cell) as i32);
    let mut mask = 0;
    for r in (row - radius).max(0)..=(row + radius).min(SIZE as i32 - 1) {
        for c in (column - radius).max(0)..=(column + radius).min(SIZE as i32 - 1) { mask |= bit(cell_at(r as usize, c as usize)); }
    }
    mask
}
fn neighbours_mask(mask: u64) -> u64 {
    let not_left = !column_mask(0);
    let not_right = !column_mask(SIZE - 1);
    ((mask << 1) & not_left) | ((mask >> 1) & not_right) | (mask << SIZE) | (mask >> SIZE)
}
pub fn adjacent(a: usize, b: usize) -> bool {
    let (row_a, column_a, row_b, column_b) = (row_of(a) as i32, column_of(a) as i32, row_of(b) as i32, column_of(b) as i32);
    (row_a - row_b).abs() + (column_a - column_b).abs() == 1
}
fn ease_out(t: f32) -> f32 { let t = t.clamp(0.0, 1.0); 1.0 - (1.0 - t) * (1.0 - t) }

#[derive(Clone)]
pub struct World {
    pub cells: [Cell; CELLS],
    pub level_index: usize,
    pub level: Level,
    pub phase: Phase,
    pub phase_seconds: f32,
    pub score: u32,
    pub moves_left: u32,
    pub moves_used: u32,
    /// 1 for the first clear of a move, then +1 per cascade (the score multiplier).
    pub cascade: u32,
    pub best_cascade: u32,
    pub collected: u32,
    pub selected: i32,
    pub hint: (i32, i32),
    pub idle_seconds: f32,
    pub stars: u32,
    pub swap_a: usize,
    pub swap_b: usize,
    pub stage_points: u32,
    pub specials_made: u32,
    pub ghosts: [Ghost; MAX_GHOSTS],
    pub particles: [Particle; MAX_PARTICLES],
    pub effects: [Effect; MAX_EFFECTS],
    pub accumulator: f32,
    pub events: u32,
    random_state: u32,
}

impl World {
    pub fn new() -> World {
        let mut world = World {
            cells: [Cell::default(); CELLS], level_index: 0, level: LEVELS[0], phase: Phase::Ready, phase_seconds: 0.0, score: 0, moves_left: 0, moves_used: 0,
            cascade: 0, best_cascade: 0, collected: 0, selected: -1, hint: (-1, -1), idle_seconds: 0.0, stars: 0, swap_a: 0, swap_b: 0, stage_points: 0,
            specials_made: 0, ghosts: [Ghost::default(); MAX_GHOSTS], particles: [Particle::default(); MAX_PARTICLES], effects: [Effect::default(); MAX_EFFECTS],
            accumulator: 0.0, events: 0, random_state: 0x1234_5679,
        };
        world.start_level(0, 1);
        world
    }

    fn random(&mut self) -> f32 {
        self.random_state ^= self.random_state << 13;
        self.random_state ^= self.random_state >> 17;
        self.random_state ^= self.random_state << 5;
        (self.random_state >> 8) as f32 / 16_777_216.0
    }
    fn random_below(&mut self, count: usize) -> usize { ((self.random() * count as f32) as usize).min(count.saturating_sub(1)) }
    fn random_colour(&mut self) -> u8 { self.random_below(self.level.colours as usize) as u8 }

    // ------------------------------------------------------------------ cells

    pub fn is_open(&self, cell: usize) -> bool { !self.cells[cell].hole && self.cells[cell].stone == 0 }
    pub fn has_piece(&self, cell: usize) -> bool { self.is_open(cell) && self.cells[cell].colour != NO_PIECE }
    pub fn can_swap(&self, cell: usize) -> bool { self.has_piece(cell) && !self.cells[cell].locked }
    fn matchable(&self, cell: usize) -> Option<u8> {
        if self.has_piece(cell) && self.cells[cell].colour < BOMB_COLOUR { Some(self.cells[cell].colour) } else { None }
    }
    /// Cells that hold their place during gravity (and split a column into segments).
    fn is_fixed(&self, cell: usize) -> bool { let c = &self.cells[cell]; c.hole || c.stone > 0 || (c.locked && c.colour != NO_PIECE) }

    // ------------------------------------------------------------------ levels

    /// Lay out level `index` (0-based) with a fresh board from `seed`; waits on the Ready screen until `begin()`.
    pub fn start_level(&mut self, index: usize, seed: u32) {
        let index = index.min(LEVEL_COUNT - 1);
        self.level_index = index;
        self.level = LEVELS[index];
        self.random_state = seed.wrapping_mul(2_654_435_761).wrapping_add(index as u32 * 97 + 1) | 1;
        for _ in 0..4 { self.random(); }
        self.score = 0;
        self.moves_left = self.level.moves;
        self.moves_used = 0;
        self.cascade = 0;
        self.best_cascade = 0;
        self.collected = 0;
        self.selected = -1;
        self.stars = 0;
        self.specials_made = 0;
        self.idle_seconds = 0.0;
        for ghost in self.ghosts.iter_mut() { ghost.active = false; }
        for particle in self.particles.iter_mut() { particle.active = false; }
        for effect in self.effects.iter_mut() { effect.active = false; }
        for row in 0..SIZE {
            let line = self.level.layout[row].as_bytes();
            for column in 0..SIZE {
                let mut cell = Cell::default();
                match line[column] {
                    b'j' => cell.jelly = 1,
                    b'J' => cell.jelly = 2,
                    b's' => cell.stone = 1,
                    b'S' => cell.stone = 2,
                    b'l' => cell.locked = true,
                    b'm' => { cell.locked = true; cell.jelly = 1; }
                    b'#' => cell.hole = true,
                    _ => {}
                }
                self.cells[cell_at(row, column)] = cell;
            }
        }
        self.fill_without_matches();
        let mut tries = 0;
        while self.find_move().is_none() && tries < 50 { self.fill_without_matches(); tries += 1; }
        self.hint = self.find_move().map(|(a, b)| (a as i32, b as i32)).unwrap_or((-1, -1));
        self.set_phase(Phase::Ready);
    }

    pub fn begin(&mut self) { if self.phase == Phase::Ready { self.set_phase(Phase::Idle); } }

    /// Fill every open cell with a random colour that doesn't complete a line of three.
    fn fill_without_matches(&mut self) {
        for cell in 0..CELLS {
            if !self.is_open(cell) { continue; }
            self.cells[cell].special = Special::None;
            let mut colour = self.random_colour();
            for _ in 0..24 {
                if !self.would_match_while_filling(cell, colour) { break; }
                colour = self.random_colour();
            }
            self.cells[cell].colour = colour;
        }
    }

    fn would_match_while_filling(&self, cell: usize, colour: u8) -> bool {
        let (row, column) = (row_of(cell), column_of(cell));
        let same = |other: usize| self.matchable(other) == Some(colour);
        (column >= 2 && same(cell - 1) && same(cell - 2)) || (row >= 2 && same(cell - SIZE) && same(cell - 2 * SIZE))
    }

    fn set_phase(&mut self, phase: Phase) { self.phase = phase; self.phase_seconds = 0.0; }

    // ------------------------------------------------------------------ goals

    pub fn jelly_left(&self) -> u32 { self.cells.iter().map(|cell| cell.jelly as u32).sum() }
    pub fn blockers_left(&self) -> u32 { self.cells.iter().map(|cell| cell.stone as u32 + if cell.locked && cell.colour != NO_PIECE { 1 } else { 0 }).sum() }

    /// How much of the goal is still to do (points, pieces, jelly layers or blocker hits).
    pub fn goal_remaining(&self) -> u32 {
        match self.level.goal {
            Goal::Score(target) => target.saturating_sub(self.score),
            Goal::Collect { count, .. } => count.saturating_sub(self.collected),
            Goal::ClearJelly => self.jelly_left(),
            Goal::ClearBlockers => self.blockers_left(),
        }
    }

    pub fn goal_met(&self) -> bool { self.goal_remaining() == 0 }

    // ------------------------------------------------------------------ input

    /// Tap a cell: select it, tap a neighbour to swap, tap again to deselect.
    pub fn tap(&mut self, cell: usize) {
        if self.phase != Phase::Idle || cell >= CELLS { return; }
        self.idle_seconds = 0.0;
        if self.selected < 0 {
            if self.can_swap(cell) { self.selected = cell as i32; self.events |= events::SELECT; }
            return;
        }
        let selected = self.selected as usize;
        if selected == cell { self.selected = -1; return; }
        if adjacent(selected, cell) { self.selected = -1; self.try_swap(selected, cell); return; }
        self.selected = if self.can_swap(cell) { self.events |= events::SELECT; cell as i32 } else { -1 };
    }

    /// Swipe from `cell` toward a neighbour: 0 up, 1 right, 2 down, 3 left.
    pub fn swipe(&mut self, cell: usize, direction: u32) {
        if self.phase != Phase::Idle || cell >= CELLS { return; }
        self.idle_seconds = 0.0;
        let (row, column) = (row_of(cell) as i32, column_of(cell) as i32);
        let (row, column) = match direction { 0 => (row - 1, column), 1 => (row, column + 1), 2 => (row + 1, column), _ => (row, column - 1) };
        self.selected = -1;
        if row < 0 || column < 0 || row >= SIZE as i32 || column >= SIZE as i32 { return; }
        self.try_swap(cell, cell_at(row as usize, column as usize));
    }

    /// Start swapping two neighbours (false if that's not allowed right now).
    pub fn try_swap(&mut self, a: usize, b: usize) -> bool {
        if self.phase != Phase::Idle || a >= CELLS || b >= CELLS || !adjacent(a, b) || !self.can_swap(a) || !self.can_swap(b) {
            if self.phase == Phase::Idle { self.events |= events::INVALID; }
            return false;
        }
        self.exchange(a, b);
        self.swap_a = a;
        self.swap_b = b;
        self.idle_seconds = 0.0;
        self.set_phase(Phase::Swapping);
        self.events |= events::SWAP;
        true
    }

    /// Exchange the pieces in two cells and set them sliding from where they were.
    fn exchange(&mut self, a: usize, b: usize) {
        let (piece_a, special_a) = (self.cells[a].colour, self.cells[a].special);
        self.cells[a].colour = self.cells[b].colour;
        self.cells[a].special = self.cells[b].special;
        self.cells[b].colour = piece_a;
        self.cells[b].special = special_a;
        let delta_x = column_of(b) as f32 - column_of(a) as f32;
        let delta_y = row_of(b) as f32 - row_of(a) as f32;
        self.cells[a].slide_x = delta_x;
        self.cells[a].slide_y = delta_y;
        self.cells[b].slide_x = -delta_x;
        self.cells[b].slide_y = -delta_y;
    }

    fn clear_slides(&mut self) { for cell in self.cells.iter_mut() { cell.slide_x = 0.0; cell.slide_y = 0.0; } }

    // ------------------------------------------------------------------ time

    pub fn advance(&mut self, seconds: f32) -> u32 {
        let seconds = if seconds > 0.0 { seconds } else { 0.0 };
        let frame_seconds = if seconds > HITCH_SECONDS { self.events |= events::HITCH; 1.0 / 60.0 } else { seconds.min(MAX_FRAME_SECONDS) };
        self.accumulator += frame_seconds;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            self.step(STEP_SECONDS);
        }
        let events = self.events;
        self.events = 0;
        events
    }

    pub fn step(&mut self, dt: f32) {
        self.phase_seconds += dt;
        self.update_decorations(dt);
        match self.phase {
            Phase::Ready | Phase::Won | Phase::Lost => {}
            Phase::Idle => self.idle_seconds += dt,
            Phase::Swapping => if self.phase_seconds >= SWAP_SECONDS { self.clear_slides(); self.after_swap(); },
            Phase::SwapBack => if self.phase_seconds >= SWAP_SECONDS { self.clear_slides(); self.set_phase(Phase::Idle); },
            Phase::Clearing => if self.phase_seconds >= CLEAR_SECONDS { self.apply_gravity(); self.set_phase(Phase::Falling); },
            Phase::Falling => {
                let mut falling = false;
                for cell in self.cells.iter_mut() {
                    if cell.fall_offset >= 0.0 { continue; }
                    cell.fall_velocity += FALL_GRAVITY * dt;
                    cell.fall_offset += cell.fall_velocity * dt;
                    if cell.fall_offset >= 0.0 { cell.fall_offset = 0.0; cell.fall_velocity = 0.0; } else { falling = true; }
                }
                if !falling { self.events |= events::LANDED; self.after_fall(); }
            }
            Phase::Shuffling => if self.phase_seconds >= SHUFFLE_SECONDS { self.clear_slides(); self.settle(); },
        }
    }

    /// For tests and the bot: run the current move to completion instantly.
    pub fn finish_animations(&mut self) {
        let mut guard = 0;
        while matches!(self.phase, Phase::Swapping | Phase::SwapBack | Phase::Clearing | Phase::Falling | Phase::Shuffling) && guard < 10_000 {
            self.step(1.0);
            guard += 1;
        }
        self.events = 0;
    }

    fn after_swap(&mut self) {
        let (a, b) = (self.swap_a, self.swap_b);
        let (special_a, special_b) = (self.cells[a].special, self.cells[b].special);
        let is_combo = special_a == Special::ColourBomb || special_b == Special::ColourBomb || (special_a != Special::None && special_b != Special::None);
        if is_combo {
            self.spend_move();
            let plan = self.combo_plan(a, b);
            self.execute(plan);
            self.events |= events::COMBO;
            return;
        }
        let mut plan = ClearPlan::new();
        if self.plan_matches(&mut plan, a, b) {
            self.spend_move();
            self.execute(plan);
        } else {
            self.exchange(a, b);
            self.set_phase(Phase::SwapBack);
            self.events |= events::INVALID;
        }
    }

    fn spend_move(&mut self) {
        self.moves_left = self.moves_left.saturating_sub(1);
        self.moves_used += 1;
        self.cascade = 1;
    }

    fn after_fall(&mut self) {
        let mut plan = ClearPlan::new();
        if self.plan_matches(&mut plan, CELLS, CELLS) {
            self.cascade += 1;
            self.best_cascade = self.best_cascade.max(self.cascade);
            self.execute(plan);
        } else {
            self.settle();
        }
    }

    /// The board is still: win, lose, reshuffle if stuck, or wait for the next move.
    fn settle(&mut self) {
        if self.goal_met() {
            let bonus = self.moves_left * BONUS_PER_MOVE;
            if bonus > 0 { self.score += bonus; self.events |= events::BONUS; }
            self.stars = 1 + (self.score >= self.level.two_stars) as u32 + (self.score >= self.level.three_stars) as u32;
            self.set_phase(Phase::Won);
            self.events |= events::WON;
            return;
        }
        if self.moves_left == 0 { self.set_phase(Phase::Lost); self.events |= events::LOST; return; }
        match self.find_move() {
            Some((a, b)) => { self.hint = (a as i32, b as i32); self.idle_seconds = 0.0; self.set_phase(Phase::Idle); }
            None => self.shuffle(),
        }
    }

    // ------------------------------------------------------------------ matching

    /// Collect runs of 3+ (horizontal then vertical) into `runs`; returns how many.
    fn find_runs(&self, runs: &mut [Run; 32]) -> usize {
        let mut count = 0;
        for horizontal in [true, false] {
            for line in 0..SIZE {
                let mut position = 0;
                while position < SIZE {
                    let cell = if horizontal { cell_at(line, position) } else { cell_at(position, line) };
                    let Some(colour) = self.matchable(cell) else { position += 1; continue };
                    let mut length = 1;
                    let mut mask = bit(cell);
                    while position + length < SIZE {
                        let next = if horizontal { cell_at(line, position + length) } else { cell_at(position + length, line) };
                        if self.matchable(next) != Some(colour) { break; }
                        mask |= bit(next);
                        length += 1;
                    }
                    if length >= 3 && count < runs.len() { runs[count] = Run { mask, length, horizontal, colour, start: cell }; count += 1; }
                    position += length;
                }
            }
        }
        count
    }

    /// Fill `plan` with every current match and the specials they create (placed on `preferred_a`/`b` when possible).
    /// Returns false when there is no match.
    fn plan_matches(&self, plan: &mut ClearPlan, preferred_a: usize, preferred_b: usize) -> bool {
        let mut runs = [Run::default(); 32];
        let count = self.find_runs(&mut runs);
        if count == 0 { return false; }
        // group runs that share a cell (L and T shapes)
        let mut group = [0usize; 32];
        for index in 0..count { group[index] = index; }
        for first in 0..count {
            for second in first + 1..count {
                if runs[first].mask & runs[second].mask != 0 {
                    let (root_first, root_second) = (group[first], group[second]);
                    for entry in group.iter_mut().take(count) { if *entry == root_second { *entry = root_first; } }
                }
            }
        }
        let preferred = if preferred_a < CELLS { bit(preferred_a) | bit(preferred_b) } else { 0 };
        for root in 0..count {
            if group[root] != root { continue; }
            let (mut mask, mut horizontal_mask, mut vertical_mask, mut longest, mut longest_run) = (0u64, 0u64, 0u64, 0usize, root);
            for index in 0..count {
                if group[index] != root { continue; }
                mask |= runs[index].mask;
                if runs[index].horizontal { horizontal_mask |= runs[index].mask } else { vertical_mask |= runs[index].mask }
                if runs[index].length > longest { longest = runs[index].length; longest_run = index; }
            }
            plan.mask |= mask;
            plan.match_cells |= mask;
            let run = runs[longest_run];
            let special = if longest >= 5 { Special::ColourBomb }
                else if horizontal_mask != 0 && vertical_mask != 0 { Special::Wrapped }
                else if longest == 4 { if run.horizontal { Special::StripedH } else { Special::StripedV } }
                else { Special::None };
            if special == Special::None || plan.creation_count >= plan.creations.len() { continue; }
            let usable = |cell_mask: u64| -> u64 {
                let mut result = 0;
                let mut remaining = cell_mask;
                while remaining != 0 {
                    let cell = remaining.trailing_zeros() as usize;
                    remaining &= remaining - 1;
                    if self.cells[cell].special == Special::None && !self.cells[cell].locked { result |= bit(cell); }
                }
                result
            };
            let middle = if run.horizontal { run.start + run.length / 2 } else { run.start + (run.length / 2) * SIZE };
            let choices = [usable(mask & preferred), usable(horizontal_mask & vertical_mask), usable(bit(middle)), usable(mask)];
            if let Some(choice) = choices.iter().find(|choice| **choice != 0) {
                let cell = choice.trailing_zeros() as u8;
                let colour = if special == Special::ColourBomb { BOMB_COLOUR } else { run.colour };
                plan.creations[plan.creation_count] = (cell, colour, special);
                plan.creation_count += 1;
            }
        }
        true
    }

    fn colour_mask(&self, colour: u8) -> u64 {
        let mut mask = 0;
        for cell in 0..CELLS { if self.matchable(cell) == Some(colour) { mask |= bit(cell); } }
        mask
    }

    fn most_common_colour(&self, excluding: u64) -> u8 {
        let mut counts = [0u32; 6];
        for cell in 0..CELLS { if excluding & bit(cell) == 0 { if let Some(colour) = self.matchable(cell) { counts[colour as usize] += 1; } } }
        (0..6).max_by_key(|&colour| counts[colour]).unwrap_or(0) as u8
    }

    /// Two specials swapped together (or a colour bomb with anything).
    fn combo_plan(&mut self, a: usize, b: usize) -> ClearPlan {
        let mut plan = ClearPlan::new();
        let (mut bomb_cell, mut other) = (a, b);
        if self.cells[b].special == Special::ColourBomb { bomb_cell = b; other = a; }
        plan.pre_activated = bit(a) | bit(b);
        plan.mask = bit(a) | bit(b);
        let (special_bomb, special_other) = (self.cells[bomb_cell].special, self.cells[other].special);
        if special_bomb == Special::ColourBomb {
            self.add_effect(EffectKind::BombRays, bomb_cell, 0.6, 0);
            self.events |= events::COLOUR_BOMB;
            if special_other == Special::ColourBomb {
                plan.mask = u64::MAX;
                self.add_effect(EffectKind::BigBlast, bomb_cell, 0.7, 0);
                return plan;
            }
            let colour = self.cells[other].colour;
            let targets = self.colour_mask(colour);
            plan.mask |= targets;
            if special_other != Special::None {
                // every piece of that colour turns into the other special, then they all go off
                let mut remaining = targets & !bit(other);
                while remaining != 0 {
                    let cell = remaining.trailing_zeros() as usize;
                    remaining &= remaining - 1;
                    if self.cells[cell].locked { continue; }
                    self.cells[cell].special = match special_other {
                        Special::Wrapped => Special::Wrapped,
                        _ => if self.random() < 0.5 { Special::StripedH } else { Special::StripedV },
                    };
                }
                plan.pre_activated = bit(bomb_cell);
            }
            return plan;
        }
        let striped = |special: Special| special == Special::StripedH || special == Special::StripedV;
        let (row, column) = (row_of(b), column_of(b));
        if striped(special_bomb) && striped(special_other) {
            plan.mask |= row_mask(row) | column_mask(column);
            self.add_effect(EffectKind::RowBeam, b, 0.4, 0);
            self.add_effect(EffectKind::ColumnBeam, b, 0.4, 0);
            self.events |= events::STRIPED;
        } else if special_bomb == Special::Wrapped && special_other == Special::Wrapped {
            plan.mask |= area_mask(b, 2);
            self.add_effect(EffectKind::BigBlast, b, 0.5, 0);
            self.events |= events::WRAPPED;
        } else {
            // striped + wrapped: three rows and three columns
            for offset in -1i32..=1 {
                let r = row as i32 + offset;
                let c = column as i32 + offset;
                if (0..SIZE as i32).contains(&r) { plan.mask |= row_mask(r as usize); self.add_effect(EffectKind::RowBeam, cell_at(r as usize, column), 0.45, 0); }
                if (0..SIZE as i32).contains(&c) { plan.mask |= column_mask(c as usize); self.add_effect(EffectKind::ColumnBeam, cell_at(row, c as usize), 0.45, 0); }
            }
            self.events |= events::STRIPED | events::WRAPPED;
        }
        plan
    }

    /// Carry out a clearing stage: set off specials caught in it (chains), chip stones, peel jelly, break locks,
    /// remove pieces (ghosts + sparks), place new specials, score, then wait CLEAR_SECONDS before gravity.
    fn execute(&mut self, mut plan: ClearPlan) {
        self.stage_points = 0;
        self.events |= events::MATCH;
        let mut activated = plan.pre_activated;
        loop {
            let mut candidates = 0u64;
            let mut remaining = plan.mask & !activated;
            while remaining != 0 {
                let cell = remaining.trailing_zeros() as usize;
                remaining &= remaining - 1;
                if self.has_piece(cell) && self.cells[cell].special != Special::None && plan.creation_at(cell).is_none() { candidates |= bit(cell); }
            }
            if candidates == 0 { break; }
            let mut remaining = candidates;
            while remaining != 0 {
                let cell = remaining.trailing_zeros() as usize;
                remaining &= remaining - 1;
                activated |= bit(cell);
                match self.cells[cell].special {
                    Special::StripedH => { plan.mask |= row_mask(row_of(cell)); self.add_effect(EffectKind::RowBeam, cell, 0.35, 0); self.events |= events::STRIPED; }
                    Special::StripedV => { plan.mask |= column_mask(column_of(cell)); self.add_effect(EffectKind::ColumnBeam, cell, 0.35, 0); self.events |= events::STRIPED; }
                    Special::Wrapped => { plan.mask |= area_mask(cell, 1); self.add_effect(EffectKind::Blast, cell, 0.4, 0); self.events |= events::WRAPPED; }
                    Special::ColourBomb => {
                        let colour = self.most_common_colour(plan.mask);
                        plan.mask |= self.colour_mask(colour);
                        self.add_effect(EffectKind::BombRays, cell, 0.5, 0);
                        self.events |= events::COLOUR_BOMB;
                    }
                    Special::None => {}
                }
            }
        }
        // stones: chipped once by a match next to them or a blast over them
        let mut stone_hits = (neighbours_mask(plan.match_cells) | plan.mask) & !0;
        let mut stones_before = 0u64;
        for cell in 0..CELLS { if self.cells[cell].stone > 0 && !self.cells[cell].hole { stones_before |= bit(cell); } }
        stone_hits &= stones_before;
        let mut remaining = stone_hits;
        while remaining != 0 {
            let cell = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            self.cells[cell].stone -= 1;
            self.add_points(40);
            self.events |= events::STONE;
            self.burst(cell, 7, 6);
            if self.cells[cell].stone == 0 { self.cells[cell].colour = NO_PIECE; self.cells[cell].special = Special::None; }
        }
        let goal_colour = if let Goal::Collect { colour, .. } = self.level.goal { colour } else { NO_PIECE };
        let mut remaining = plan.mask & !stones_before;
        let mut centre_sum = (0usize, 0usize, 0usize);
        while remaining != 0 {
            let cell = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            if self.cells[cell].hole { continue; }
            if self.cells[cell].jelly > 0 { self.cells[cell].jelly -= 1; self.add_points(60); self.events |= events::JELLY; }
            if self.cells[cell].colour == NO_PIECE { continue; }
            if self.cells[cell].locked { self.cells[cell].locked = false; self.add_points(30); self.events |= events::LOCK; self.burst(cell, 8, 4); continue; }
            let colour = self.cells[cell].colour;
            if colour == goal_colour { self.collected += 1; }
            centre_sum = (centre_sum.0 + row_of(cell), centre_sum.1 + column_of(cell), centre_sum.2 + 1);
            let cascade = self.cascade.max(1);
            self.add_points(20 * cascade);
            if let Some((new_colour, special)) = plan.creation_at(cell) {
                self.add_ghost(cell);
                self.cells[cell].colour = new_colour;
                self.cells[cell].special = special;
                self.specials_made += 1;
                self.add_points(match special { Special::ColourBomb => 200, Special::Wrapped => 120, _ => 60 });
                self.add_effect(EffectKind::Made, cell, 0.5, special as u32);
                self.events |= events::SPECIAL_MADE;
                continue;
            }
            self.add_ghost(cell);
            self.burst(cell, colour, 5);
            self.cells[cell].colour = NO_PIECE;
            self.cells[cell].special = Special::None;
        }
        if centre_sum.2 > 0 {
            let cell = cell_at(centre_sum.0 / centre_sum.2, centre_sum.1 / centre_sum.2);
            let points = self.stage_points;
            self.add_effect(EffectKind::ScoreText, cell, 0.8, points);
        }
        self.set_phase(Phase::Clearing);
    }

    fn add_points(&mut self, points: u32) { self.score += points; self.stage_points += points; }

    // ------------------------------------------------------------------ gravity

    /// Pieces drop down each column (stones, holes and locked pieces stay put and split the column);
    /// new random pieces drop into the gaps at the top of each segment.
    fn apply_gravity(&mut self) {
        for column in 0..SIZE {
            let mut row = SIZE as i32 - 1;
            while row >= 0 {
                if self.is_fixed(cell_at(row as usize, column)) { row -= 1; continue; }
                let bottom = row;
                while row >= 0 && !self.is_fixed(cell_at(row as usize, column)) { row -= 1; }
                let top = row + 1;
                let mut write = bottom;
                for read in (top..=bottom).rev() {
                    let from = cell_at(read as usize, column);
                    if self.cells[from].colour == NO_PIECE { continue; }
                    if read != write {
                        let to = cell_at(write as usize, column);
                        self.cells[to].colour = self.cells[from].colour;
                        self.cells[to].special = self.cells[from].special;
                        self.cells[to].fall_offset = (read - write) as f32;
                        self.cells[to].fall_velocity = 0.0;
                        self.cells[from].colour = NO_PIECE;
                        self.cells[from].special = Special::None;
                    }
                    write -= 1;
                }
                let empty = write - top + 1;
                for fill in top..=write {
                    let to = cell_at(fill as usize, column);
                    let colour = self.random_colour();
                    self.cells[to].colour = colour;
                    self.cells[to].special = Special::None;
                    self.cells[to].fall_offset = -(empty as f32) - 0.15;
                    self.cells[to].fall_velocity = 0.0;
                }
            }
        }
    }

    // ------------------------------------------------------------------ moves, hints, shuffles

    fn line_length(&self, cell: usize, step_row: i32, step_column: i32, colour: u8) -> usize {
        let mut length = 0;
        let (mut row, mut column) = (row_of(cell) as i32 + step_row, column_of(cell) as i32 + step_column);
        while row >= 0 && column >= 0 && row < SIZE as i32 && column < SIZE as i32 && self.matchable(cell_at(row as usize, column as usize)) == Some(colour) {
            length += 1;
            row += step_row;
            column += step_column;
        }
        length
    }

    fn makes_match_at(&self, cell: usize) -> bool {
        let Some(colour) = self.matchable(cell) else { return false };
        1 + self.line_length(cell, 0, -1, colour) + self.line_length(cell, 0, 1, colour) >= 3
            || 1 + self.line_length(cell, -1, 0, colour) + self.line_length(cell, 1, 0, colour) >= 3
    }

    fn swap_pieces_quietly(&mut self, a: usize, b: usize) {
        let (colour, special) = (self.cells[a].colour, self.cells[a].special);
        self.cells[a].colour = self.cells[b].colour;
        self.cells[a].special = self.cells[b].special;
        self.cells[b].colour = colour;
        self.cells[b].special = special;
    }

    pub fn is_valid_move(&mut self, a: usize, b: usize) -> bool {
        if !adjacent(a, b) || !self.can_swap(a) || !self.can_swap(b) { return false; }
        let (special_a, special_b) = (self.cells[a].special, self.cells[b].special);
        if special_a == Special::ColourBomb || special_b == Special::ColourBomb || (special_a != Special::None && special_b != Special::None) { return true; }
        self.swap_pieces_quietly(a, b);
        let valid = self.makes_match_at(a) || self.makes_match_at(b);
        self.swap_pieces_quietly(a, b);
        valid
    }

    /// Some valid swap, or None if the board is stuck.
    pub fn find_move(&mut self) -> Option<(usize, usize)> {
        for cell in 0..CELLS {
            if column_of(cell) + 1 < SIZE && self.is_valid_move(cell, cell + 1) { return Some((cell, cell + 1)); }
            if row_of(cell) + 1 < SIZE && self.is_valid_move(cell, cell + SIZE) { return Some((cell, cell + SIZE)); }
        }
        None
    }

    /// Every valid swap (for the bot and tests); returns how many were written.
    #[cfg(test)]
    pub fn valid_moves(&mut self, moves: &mut [(usize, usize); 128]) -> usize {
        let mut count = 0;
        for cell in 0..CELLS {
            if column_of(cell) + 1 < SIZE && self.is_valid_move(cell, cell + 1) && count < moves.len() { moves[count] = (cell, cell + 1); count += 1; }
            if row_of(cell) + 1 < SIZE && self.is_valid_move(cell, cell + SIZE) && count < moves.len() { moves[count] = (cell, cell + SIZE); count += 1; }
        }
        count
    }

    fn has_any_match(&self) -> bool { (0..CELLS).any(|cell| self.makes_match_at(cell)) }

    /// No moves left: mix up the free pieces until there are no ready-made matches and at least one move.
    pub fn shuffle(&mut self) {
        let mut free = [0u8; CELLS];
        let mut count = 0;
        for cell in 0..CELLS { if self.can_swap(cell) { free[count] = cell as u8; count += 1; } }
        let mut origin = [0u8; CELLS];
        let mut done = false;
        for _ in 0..60 {
            for index in 0..count { origin[free[index] as usize] = free[index]; }
            for index in (1..count).rev() {
                let other = self.random_below(index + 1);
                let (cell_a, cell_b) = (free[index] as usize, free[other] as usize);
                self.swap_pieces_quietly(cell_a, cell_b);
                origin.swap(cell_a, cell_b);
            }
            if !self.has_any_match() && self.find_move().is_some() { done = true; break; }
        }
        if !done {
            // re-roll plain pieces as a last resort
            for _ in 0..30 {
                for index in 0..count {
                    let cell = free[index] as usize;
                    if self.cells[cell].special == Special::None { self.cells[cell].colour = self.random_colour(); }
                }
                if !self.has_any_match() && self.find_move().is_some() { break; }
            }
        }
        for index in 0..count {
            let cell = free[index] as usize;
            let from = origin[cell] as usize;
            self.cells[cell].slide_x = column_of(from) as f32 - column_of(cell) as f32;
            self.cells[cell].slide_y = row_of(from) as f32 - row_of(cell) as f32;
        }
        self.selected = -1;
        self.set_phase(Phase::Shuffling);
        self.events |= events::SHUFFLE;
    }

    /// 0..1 progress of slides (swap or shuffle) for drawing: the piece is drawn at its cell + slide × (1 − this).
    pub fn slide_progress(&self) -> f32 {
        match self.phase {
            Phase::Swapping | Phase::SwapBack => ease_out(self.phase_seconds / SWAP_SECONDS),
            Phase::Shuffling => ease_out(self.phase_seconds / SHUFFLE_SECONDS),
            _ => 1.0,
        }
    }

    // ------------------------------------------------------------------ decorations

    fn add_ghost(&mut self, cell: usize) {
        let piece = self.cells[cell];
        if let Some(ghost) = self.ghosts.iter_mut().find(|ghost| !ghost.active) {
            *ghost = Ghost { active: true, colour: piece.colour, special: piece.special as u8, cell: cell as u8, age: 0.0 };
        }
    }

    pub fn add_effect(&mut self, kind: EffectKind, cell: usize, life: f32, value: u32) {
        let mut slot = 0;
        let mut oldest = -1.0;
        for (index, effect) in self.effects.iter().enumerate() {
            if !effect.active { slot = index; break; }
            let progress = effect.age / effect.life;
            if progress > oldest { oldest = progress; slot = index; }
        }
        self.effects[slot] = Effect { active: true, kind, cell: cell as u8, age: 0.0, life, value };
    }

    /// Sparks flying out of a cell; colour 0–5 the sweet's colour, 6 gold, 7 stone dust, 8 metal.
    fn burst(&mut self, cell: usize, colour: u8, count: usize) {
        let (x, y) = (column_of(cell) as f32 + 0.5, row_of(cell) as f32 + 0.5);
        for index in 0..count {
            let angle = (index as f32 + self.random()) / count as f32 * core::f32::consts::TAU;
            let speed = 2.0 + self.random() * 3.5;
            let life = 0.35 + self.random() * 0.3;
            let mut slot = None;
            for (position, particle) in self.particles.iter().enumerate() { if !particle.active { slot = Some(position); break; } }
            let Some(slot) = slot else { return };
            self.particles[slot] = Particle { active: true, x, y, velocity_x: angle.cos() * speed, velocity_y: angle.sin() * speed - 1.5, age: 0.0, life, colour };
        }
    }

    fn update_decorations(&mut self, dt: f32) {
        for ghost in self.ghosts.iter_mut().filter(|ghost| ghost.active) {
            ghost.age += dt;
            if ghost.age >= CLEAR_SECONDS { ghost.active = false; }
        }
        for particle in self.particles.iter_mut().filter(|particle| particle.active) {
            particle.age += dt;
            if particle.age >= particle.life { particle.active = false; continue; }
            particle.velocity_y += 9.0 * dt;
            particle.x += particle.velocity_x * dt;
            particle.y += particle.velocity_y * dt;
        }
        for effect in self.effects.iter_mut().filter(|effect| effect.active) {
            effect.age += dt;
            if effect.age >= effect.life { effect.active = false; }
        }
    }

    pub fn is_animating(&self) -> bool {
        !matches!(self.phase, Phase::Ready | Phase::Idle | Phase::Won | Phase::Lost)
            || self.particles.iter().any(|particle| particle.active)
            || self.effects.iter().any(|effect| effect.active)
            || self.ghosts.iter().any(|ghost| ghost.active)
    }

    // ------------------------------------------------------------------ test hooks

    /// Put a special piece (of `colour`) on a cell.
    pub fn debug_place(&mut self, cell: usize, colour: u8, special: Special) {
        if cell >= CELLS || !self.is_open(cell) { return; }
        self.cells[cell].colour = if special == Special::ColourBomb { BOMB_COLOUR } else { colour };
        self.cells[cell].special = special;
    }
}

impl Default for World { fn default() -> Self { World::new() } }

/// The greedy bot's choice (see lib.rs).
#[cfg(test)]
pub fn best_move(world: &World) -> Option<(usize, usize)> { crate::best_move_impl(world) }
