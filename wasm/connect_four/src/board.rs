//! Connect Four board as two 64-bit bitboards (the classic layout: 7 bits per column, 6 playable + 1 spare bit on top).
//! `current` holds the stones of the player to move, `mask` all stones.

pub const WIDTH: usize = 7;
pub const HEIGHT: usize = 6;
pub const CELLS: usize = WIDTH * HEIGHT;
const COLUMN_STRIDE: usize = HEIGHT + 1;

pub const fn bottom_mask(column: usize) -> u64 { 1u64 << (column * COLUMN_STRIDE) }
pub const fn top_mask(column: usize) -> u64 { 1u64 << (HEIGHT - 1 + column * COLUMN_STRIDE) }
pub const fn column_mask(column: usize) -> u64 { ((1u64 << HEIGHT) - 1) << (column * COLUMN_STRIDE) }

const fn all_bottoms() -> u64 {
    let mut bits = 0;
    let mut column = 0;
    while column < WIDTH { bits |= bottom_mask(column); column += 1; }
    bits
}
pub const BOTTOMS: u64 = all_bottoms();
pub const BOARD_MASK: u64 = BOTTOMS * ((1u64 << HEIGHT) - 1);

/// Bit of a cell (row 0 = bottom).
pub const fn cell_bit(column: usize, row: usize) -> u64 { 1u64 << (column * COLUMN_STRIDE + row) }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Board {
    pub current: u64,
    pub mask: u64,
    pub moves: u32,
}

impl Default for Board { fn default() -> Self { Self::new() } }

impl Board {
    pub const fn new() -> Self { Board { current: 0, mask: 0, moves: 0 } }

    pub fn can_play(&self, column: usize) -> bool { column < WIDTH && self.mask & top_mask(column) == 0 }

    /// Drop a stone; returns the row it lands on.
    pub fn play(&mut self, column: usize) -> usize {
        let row = (self.mask & column_mask(column)).count_ones() as usize;
        self.current ^= self.mask;
        self.mask |= self.mask + bottom_mask(column);
        self.moves += 1;
        row
    }

    /// Would dropping in `column` complete four for the player to move?
    pub fn is_winning_move(&self, column: usize) -> bool {
        let stones = self.current | ((self.mask + bottom_mask(column)) & column_mask(column));
        has_four(stones)
    }

    /// Stones of the player who just moved.
    pub fn last_mover_stones(&self) -> u64 { self.current ^ self.mask }

    /// 0 for the first player, 1 for the second.
    pub fn player_to_move(&self) -> u32 { self.moves % 2 }

    pub fn is_full(&self) -> bool { self.moves as usize == CELLS }

    /// A key that is unique per position.
    pub fn key(&self) -> u64 { self.current + self.mask }

    /// Empty cells that can be played right now (one per non-full column).
    pub fn playable_cells(&self) -> u64 { (self.mask + BOTTOMS) & BOARD_MASK }

    /// Empty cells (anywhere) that would complete four for `stones`.
    pub fn winning_cells(stones: u64, mask: u64) -> u64 {
        let stride = COLUMN_STRIDE as u32;
        // vertical
        let mut result = (stones << 1) & (stones << 2) & (stones << 3);
        for shift in [stride, stride - 1, stride + 1] {
            let pair = (stones << shift) & (stones << (2 * shift));
            result |= pair & (stones << (3 * shift));
            result |= pair & (stones >> shift);
            let pair = (stones >> shift) & (stones >> (2 * shift));
            result |= pair & (stones << shift);
            result |= pair & (stones >> (3 * shift));
        }
        result & (BOARD_MASK ^ mask)
    }

    /// Playable cells that don't hand the opponent an immediate win (0 = every move loses).
    pub fn non_losing_cells(&self) -> u64 {
        let mut playable = self.playable_cells();
        let opponent_wins = Self::winning_cells(self.current ^ self.mask, self.mask);
        let forced = playable & opponent_wins;
        if forced != 0 {
            if forced & (forced - 1) != 0 { return 0; } // two threats at once: can't block both
            playable = forced;
        }
        playable & !(opponent_wins >> 1)
    }
}

pub fn has_four(stones: u64) -> bool {
    let stride = COLUMN_STRIDE as u32;
    for shift in [1, stride, stride - 1, stride + 1] {
        let pair = stones & (stones >> shift);
        if pair & (pair >> (2 * shift)) != 0 { return true; }
    }
    false
}

/// The cells (column * HEIGHT + row) of every four-in-a-row in `stones`.
pub fn four_cells(stones: u64) -> Vec<u8> {
    let mut cells = Vec::new();
    let directions: [(i32, i32); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];
    for column in 0..WIDTH as i32 {
        for row in 0..HEIGHT as i32 {
            for (column_step, row_step) in directions {
                let line: Vec<(i32, i32)> = (0..4).map(|i| (column + column_step * i, row + row_step * i)).collect();
                let inside = line.iter().all(|&(c, r)| c >= 0 && c < WIDTH as i32 && r >= 0 && r < HEIGHT as i32);
                if inside && line.iter().all(|&(c, r)| stones & cell_bit(c as usize, r as usize) != 0) {
                    for (c, r) in line {
                        let cell = (c as usize * HEIGHT + r as usize) as u8;
                        if !cells.contains(&cell) { cells.push(cell); }
                    }
                }
            }
        }
    }
    cells
}
