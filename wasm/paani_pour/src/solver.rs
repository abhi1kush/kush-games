//! Depth-first search for a sequence of pours that sorts the board. States are remembered by a hash of the tubes in
//! sorted order (tube order doesn't matter), so the search never repeats a position. Bounded by `NODE_LIMIT`.

use crate::rules::*;

pub const NODE_LIMIT: u32 = 60_000;
const TABLE_BITS: u32 = 16;
pub const MAX_SOLUTION: usize = 160;

struct Search {
    seen: Vec<u64>,
    nodes: u32,
    path: [(u8, u8); MAX_SOLUTION],
    length: usize,
}

fn state_hash(board: &Board) -> u64 {
    let count = board.tube_count as usize;
    let mut keys = [0u32; MAX_TUBES];
    for tube in 0..count {
        let mut key = 0u32;
        for &layer in board.tube(tube) { key = key * 16 + layer as u32; }
        keys[tube] = key;
    }
    keys[..count].sort_unstable();
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for &key in &keys[..count] { hash ^= key as u64 + 1; hash = hash.wrapping_mul(0x0000_0100_0000_01b3); hash ^= hash >> 29; }
    if hash == 0 { 1 } else { hash }
}

impl Search {
    /// true if newly inserted
    fn remember(&mut self, hash: u64) -> bool {
        let mask = (1usize << TABLE_BITS) - 1;
        let mut slot = (hash as usize) & mask;
        for _ in 0..64 {
            if self.seen[slot] == hash { return false; }
            if self.seen[slot] == 0 { self.seen[slot] = hash; return true; }
            slot = (slot + 1) & mask;
        }
        true // table crowded: just search on
    }

    fn solve(&mut self, board: &Board, depth: usize) -> bool {
        if board.is_solved() { self.length = depth; return true; }
        if depth >= MAX_SOLUTION || self.nodes >= NODE_LIMIT { return false; }
        self.nodes += 1;
        let count = board.tube_count as usize;
        // move ordering: pours onto a matching colour first, then into empty tubes
        let mut moves = [(0u8, 0u8, 0u8); MAX_TUBES * MAX_TUBES];
        let mut move_count = 0;
        let mut tried_empty = false;
        for from in 0..count {
            if board.is_done(from) { continue; }
            for to in 0..count {
                let amount = board.pour_amount(from, to);
                if amount == 0 || board.is_pointless(from, to) { continue; }
                let to_empty = board.height(to) == 0;
                // all empty tubes are alike: only try the first one per source
                if to_empty && (0..to).any(|other| board.height(other) == 0) { continue; }
                let mut score = if to_empty { 1 } else { 3 };
                if !to_empty && amount == board.top_run(from) { score += 1; }
                if board.height(to) + amount == CAPACITY && !to_empty { score += 1; }
                moves[move_count] = (from as u8, to as u8, score);
                move_count += 1;
                tried_empty |= to_empty;
            }
        }
        let _ = tried_empty;
        moves[..move_count].sort_unstable_by(|a, b| b.2.cmp(&a.2));
        for &(from, to, _) in &moves[..move_count] {
            let mut next = *board;
            next.pour(from as usize, to as usize);
            if !self.remember(state_hash(&next)) { continue; }
            self.path[depth] = (from, to);
            if self.solve(&next, depth + 1) { return true; }
        }
        false
    }
}

/// A solution (list of pours) from `board`, or None if none was found within the node limit.
pub fn solve(board: &Board) -> Option<Vec<(u8, u8)>> {
    let mut search = Search { seen: vec![0; 1 << TABLE_BITS], nodes: 0, path: [(0, 0); MAX_SOLUTION], length: 0 };
    search.remember(state_hash(board));
    if search.solve(board, 0) { Some(search.path[..search.length].to_vec()) } else { None }
}
