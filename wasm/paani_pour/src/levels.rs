//! Level generator: level n has more colours (3 → 12) and always two empty tubes; layers are shuffled from a fixed
//! seed until the solver finds a solution and no tube starts sorted. `par` is the solver's pour count.

use crate::rules::*;
use crate::solver;

pub const LEVEL_COUNT: u8 = 20;

pub struct Rng(u32);
impl Rng {
    pub fn new(seed: u32) -> Rng { Rng(if seed == 0 { 0x9e37_79b9 } else { seed }) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    pub fn below(&mut self, limit: u32) -> u32 { if limit == 0 { 0 } else { self.next() % limit } }
}

pub fn colours_for(level: u8) -> u8 { (3 + level / 2).min(12) }

pub struct Level { pub board: Board, pub par: u32 }

pub fn build(level: u8) -> Level {
    let level = level.min(LEVEL_COUNT - 1);
    let colours = colours_for(level) as usize;
    let tubes = colours + 2;
    for attempt in 0..400u32 {
        let mut rng = Rng::new(0x5eed_0000 ^ (level as u32 * 7919) ^ (attempt.wrapping_mul(2_654_435_761)));
        let mut units = [0u8; MAX_TUBES * CAPACITY];
        for index in 0..colours * CAPACITY { units[index] = (index / CAPACITY) as u8 + 1; }
        for index in (1..colours * CAPACITY).rev() { let other = rng.below(index as u32 + 1) as usize; units.swap(index, other); }
        let mut board = Board::new(tubes as u8);
        board.layers[..colours * CAPACITY].copy_from_slice(&units[..colours * CAPACITY]);
        if (0..colours).any(|tube| board.top_run(tube) >= 3) { continue; }
        if let Some(path) = solver::solve(&board) { return Level { board, par: path.len() as u32 }; }
    }
    // unreachable in practice (tests build every level); fall back to a simple solvable layout
    let mut board = Board::new(tubes as u8);
    for tube in 0..colours { for depth in 0..CAPACITY { board.layers[tube * CAPACITY + depth] = ((tube + depth) % colours) as u8 + 1; } }
    let par = solver::solve(&board).map_or(0, |path| path.len() as u32);
    Level { board, par }
}
