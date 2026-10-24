//! A level being played: planning, then water flowing out of the tank until the three houses are full (win) or the
//! tank runs dry (lose).
//!
//! Water costs: filling a pipe or a house tank takes TILE_COST units, every open pipe end that water reaches spills
//! SPILL_RATE units a second, each cracked pipe with water in it leaks LEAK_RATE a second, and a little evaporates
//! (EVAPORATION a second) so a stalled network still runs dry. The tank only drains once the valve is open.
use crate::board::*;

pub const TILE_COST: f32 = 2.0;
pub const SPILL_RATE: f32 = 4.0;
pub const LEAK_RATE: f32 = 3.0;
pub const EVAPORATION: f32 = 0.5;
pub const STEP_MS: f32 = 1000.0 / 60.0;
/// The most fixed steps one `advance` call runs (a frame needs one or two).
pub const MAX_STEPS_PER_CALL: u32 = 30;
pub const MAX_SPILLS: usize = 64;

pub const PHASE_PLANNING: u8 = 0;
pub const PHASE_FLOWING: u8 = 1;
pub const PHASE_WON: u8 = 2;
pub const PHASE_LOST: u8 = 3;

#[derive(Clone, Copy)]
pub struct Game {
    pub board: Board,
    /// The intended orientation of every tile (a level is guaranteed solvable with it).
    pub solution: [u8; MAX_CELLS],
    pub phase: u8,
    pub tank: f32,
    pub capacity: f32,
    pub plan_left_ms: f32,
    /// Tiles per second the water front moves.
    pub speed: f32,
    /// Water the intended route needs (0 when unknown).
    pub needed: f32,
    pub house_fill: [f32; 3],
    /// Open ends spilling right now: cell * 4 + side.
    pub spills: [u8; MAX_SPILLS],
    pub spill_count: usize,
    pub carry_ms: f32,
    pub moves: u32,
}

impl Game {
    pub fn new(board: Board, solution: [u8; MAX_CELLS], capacity: f32, plan_ms: f32, speed: f32) -> Game {
        let mut game = Game { board, solution, phase: PHASE_PLANNING, tank: capacity, capacity, plan_left_ms: plan_ms, speed, needed: 0.0, house_fill: [0.0; 3], spills: [0; MAX_SPILLS], spill_count: 0, carry_ms: 0.0, moves: 0 };
        game.board.mark_connected();
        game
    }

    pub fn can_rotate(&self, cell: u8) -> bool {
        if (cell as usize) >= self.board.cells() || self.phase > PHASE_FLOWING { return false; }
        let tile = self.board.tiles[cell as usize];
        tile.is_pipe() && tile.flags & FLAG_FIXED == 0 && tile.fill <= 0.0
    }

    /// A quarter turn clockwise; false for rocks, bolted (fixed) pipes, pipes with water in them, or a finished game.
    pub fn rotate(&mut self, cell: u8) -> bool {
        if !self.can_rotate(cell) { return false; }
        let tile = &mut self.board.tiles[cell as usize];
        tile.mask = rotate_mask(tile.mask);
        self.moves += 1;
        self.board.mark_connected();
        true
    }

    pub fn open_valve(&mut self) -> bool {
        if self.phase != PHASE_PLANNING { return false; }
        self.phase = PHASE_FLOWING;
        self.plan_left_ms = 0.0;
        true
    }

    pub fn houses_full(&self) -> u8 { self.house_fill.iter().filter(|&&fill| fill >= 1.0).count() as u8 }

    /// Runs the clock for `ms` milliseconds in fixed steps (at most MAX_STEPS_PER_CALL). Planning counts down to the
    /// valve opening by itself.
    pub fn advance(&mut self, ms: f32) {
        if !(ms > 0.0) || self.phase > PHASE_FLOWING { return; }
        self.carry_ms += ms.min(STEP_MS * MAX_STEPS_PER_CALL as f32);
        let mut steps = 0;
        while self.carry_ms >= STEP_MS && steps < MAX_STEPS_PER_CALL && self.phase <= PHASE_FLOWING {
            self.carry_ms -= STEP_MS;
            steps += 1;
            self.step(STEP_MS / 1000.0);
        }
    }

    /// One fixed step of `dt` seconds.
    pub fn step(&mut self, dt: f32) {
        match self.phase {
            PHASE_PLANNING => {
                self.plan_left_ms -= dt * 1000.0;
                if self.plan_left_ms <= 0.0 { self.open_valve(); }
            }
            PHASE_FLOWING => self.flow(dt),
            _ => {}
        }
    }

    fn flow(&mut self, dt: f32) {
        let gain = self.speed * dt;
        let mut used = EVAPORATION * dt;
        let mut fed = [false; MAX_CELLS];
        let mut next = [0f32; MAX_CELLS];
        for (index, tile) in self.board.tiles.iter().enumerate() { next[index] = tile.fill; }
        self.spill_count = 0;
        let board = self.board;
        let mut feed = |cell: u8, from: u8, next: &mut [f32; MAX_CELLS], tiles: &mut [Tile; MAX_CELLS], used: &mut f32| {
            let index = cell as usize;
            if fed[index] || next[index] >= 1.0 { return; }
            fed[index] = true;
            if tiles[index].entry == NO_ENTRY { tiles[index].entry = from; }
            let added = gain.min(1.0 - next[index]);
            next[index] += added;
            *used += added * TILE_COST;
        };
        // the source feeds its cell
        let source = board.source;
        let first = board.tiles[source.cell as usize];
        if first.is_pipe() && first.has(source.side) { feed(source.cell, source.side, &mut next, &mut self.board.tiles, &mut used); }
        else { self.add_spill(source.cell, source.side); used += SPILL_RATE * dt; }
        for cell in 0..board.cells() as u8 {
            let tile = board.tiles[cell as usize];
            if !tile.is_pipe() { continue; }
            if tile.fill > 0.0 && tile.flags & FLAG_LEAK != 0 { used += LEAK_RATE * dt; }
            if tile.fill < 1.0 { continue; }
            for side in 0..4u8 {
                if !tile.has(side) || board.is_source(cell, side) { continue; }
                if let Some(house) = board.house_at(cell, side) {
                    if self.house_fill[house] < 1.0 { let added = gain.min(1.0 - self.house_fill[house]); self.house_fill[house] += added; used += added * TILE_COST; }
                    continue;
                }
                match board.joined(cell, side) {
                    Some(other) => feed(other, opposite(side), &mut next, &mut self.board.tiles, &mut used),
                    None => { self.add_spill(cell, side); used += SPILL_RATE * dt; }
                }
            }
        }
        for (index, tile) in self.board.tiles.iter_mut().enumerate() { tile.fill = next[index]; }
        self.tank -= used;
        if self.houses_full() == 3 { self.phase = PHASE_WON; }
        else if self.tank <= 0.0 { self.tank = 0.0; self.phase = PHASE_LOST; }
    }

    fn add_spill(&mut self, cell: u8, side: u8) {
        if self.spill_count < MAX_SPILLS { self.spills[self.spill_count] = cell * 4 + side; self.spill_count += 1; }
    }

    /// 3 stars with half the tank left, 2 with a quarter, 1 otherwise (0 unless won).
    pub fn stars(&self) -> u8 {
        if self.phase != PHASE_WON { return 0; }
        // judged on the spare water (what the tank holds beyond the best route's need), so late levels with a
        // tight tank can still earn three stars
        let spare = self.capacity - self.needed;
        if spare <= 0.0 { return 3; }
        let left = self.tank / spare;
        if left >= 0.7 { 3 } else if left >= 0.35 { 2 } else { 1 }
    }

    /// Turns every movable tile to its intended orientation (test/hint helper).
    pub fn solve(&mut self) {
        for cell in 0..self.board.cells() {
            let tile = &mut self.board.tiles[cell];
            if tile.is_pipe() && tile.flags & FLAG_FIXED == 0 && tile.fill <= 0.0 && self.solution[cell] != 0 { tile.mask = self.solution[cell]; }
        }
        self.board.mark_connected();
    }
}
