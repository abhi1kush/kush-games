//! Stage 1 of Kush Jump: an original layout (not a copy of any existing level), built in code from a few helpers.
//! Rows count down from the top: row 0 is the sky line, rows 13–14 are the ground. One tile is 16 world units.

pub const TILE: f32 = 16.0;
pub const LEVEL_COLUMNS: usize = 214;
pub const LEVEL_ROWS: usize = 15;
pub const GROUND_ROW: usize = 13;
/// Hero start, midway checkpoint and goal pole (tile columns).
pub const START_COLUMN: usize = 3;
pub const CHECKPOINT_COLUMN: usize = 102;
pub const FLAG_COLUMN: usize = 199;
/// The door of the little fort the hero walks into after the pole.
pub const FORT_DOOR_COLUMN: usize = 206;
/// Top row of the goal pole.
pub const FLAG_TOP_ROW: usize = 2;

pub mod tile {
    pub const EMPTY: u8 = 0;
    pub const GROUND: u8 = 1;
    pub const BRICK: u8 = 2;
    /// "Star crate": gives a coin when bumped.
    pub const COIN_CRATE: u8 = 3;
    /// Star crate holding a Sun Berry (the grow power-up).
    pub const BERRY_CRATE: u8 = 4;
    pub const USED_CRATE: u8 = 5;
    pub const STONE: u8 = 6;
    pub const PIPE_TOP_LEFT: u8 = 7;
    pub const PIPE_TOP_RIGHT: u8 = 8;
    pub const PIPE_LEFT: u8 = 9;
    pub const PIPE_RIGHT: u8 = 10;
    /// A floating coin (not solid; collected by touching it).
    pub const COIN: u8 = 11;
    /// A brick that pays out several coins before it turns into a used crate.
    pub const COIN_BRICK: u8 = 12;
}

pub fn is_solid(tile_kind: u8) -> bool { tile_kind != tile::EMPTY && tile_kind != tile::COIN }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EnemyKind { Walker, Shellbug }

pub struct Layout {
    pub tiles: [u8; LEVEL_COLUMNS * LEVEL_ROWS],
    /// Enemy kind and tile column (they start standing on whatever is below).
    pub enemies: [(EnemyKind, f32); ENEMY_COUNT],
}

pub const ENEMY_COUNT: usize = 18;

struct Builder { tiles: [u8; LEVEL_COLUMNS * LEVEL_ROWS] }

impl Builder {
    fn set(&mut self, column: usize, row: usize, kind: u8) {
        if column < LEVEL_COLUMNS && row < LEVEL_ROWS { self.tiles[row * LEVEL_COLUMNS + column] = kind; }
    }
    fn ground(&mut self, from: usize, to: usize) {
        for column in from..=to { self.set(column, GROUND_ROW, tile::GROUND); self.set(column, GROUND_ROW + 1, tile::GROUND); }
    }
    fn row(&mut self, from: usize, row: usize, pattern: &[u8]) {
        for (offset, &kind) in pattern.iter().enumerate() { self.set(from + offset, row, kind); }
    }
    /// A pipe `height` tiles tall standing on the ground at `column` (two tiles wide).
    fn pipe(&mut self, column: usize, height: usize) {
        let top = GROUND_ROW - height;
        self.set(column, top, tile::PIPE_TOP_LEFT);
        self.set(column + 1, top, tile::PIPE_TOP_RIGHT);
        for row in top + 1..GROUND_ROW { self.set(column, row, tile::PIPE_LEFT); self.set(column + 1, row, tile::PIPE_RIGHT); }
    }
    /// A stone column `height` tiles tall.
    fn column(&mut self, column: usize, height: usize) {
        for row in GROUND_ROW - height..GROUND_ROW { self.set(column, row, tile::STONE); }
    }
    fn stairs_up(&mut self, from: usize, steps: usize) { for step in 0..steps { self.column(from + step, step + 1); } }
    fn stairs_down(&mut self, from: usize, steps: usize) { for step in 0..steps { self.column(from + step, steps - step); } }
}

pub fn build_stage_one() -> Layout {
    use tile::*;
    let mut builder = Builder { tiles: [EMPTY; LEVEL_COLUMNS * LEVEL_ROWS] };
    // Ground with three pits (68–70, 89–91, 152–154).
    builder.ground(0, 67);
    builder.ground(71, 88);
    builder.ground(92, 151);
    builder.ground(155, LEVEL_COLUMNS - 1);

    // Opening: a lone crate, then a row with the first Sun Berry and a high crate above it.
    builder.row(15, 9, &[COIN_CRATE]);
    builder.row(19, 9, &[BRICK, BERRY_CRATE, BRICK, COIN_CRATE, BRICK]);
    builder.row(21, 5, &[COIN_CRATE]);
    // Pipes of rising height.
    builder.pipe(29, 2);
    builder.pipe(38, 3);
    builder.pipe(47, 4);
    builder.pipe(58, 4);
    // Coins arc over the first pit; a high brick walkway with a coin brick.
    builder.row(67, 8, &[COIN, COIN, COIN, COIN]);
    builder.row(76, 9, &[BRICK, COIN_CRATE, BRICK]);
    builder.row(79, 5, &[BRICK, BRICK, BRICK, BRICK, BRICK, BRICK, BRICK, BRICK]);
    builder.row(80, 4, &[COIN, COIN, COIN]);
    builder.row(89, 5, &[BRICK, BRICK, COIN_CRATE]);
    builder.row(95, 9, &[COIN_BRICK]);
    // Past the checkpoint: a crate triangle, a second Sun Berry up high.
    builder.row(104, 9, &[BRICK, BRICK]);
    builder.row(109, 9, &[COIN_CRATE]);
    builder.row(112, 9, &[COIN_CRATE]);
    builder.row(112, 5, &[BERRY_CRATE]);
    builder.row(115, 9, &[COIN_CRATE]);
    builder.row(121, 9, &[BRICK]);
    builder.row(124, 5, &[BRICK, BRICK, BRICK]);
    builder.row(129, 5, &[BRICK, COIN_CRATE, COIN_CRATE, BRICK]);
    builder.row(130, 9, &[BRICK, BRICK]);
    // Stone stairs: a pyramid, then a pit between two staircases.
    builder.stairs_up(135, 4);
    builder.stairs_down(141, 4);
    builder.stairs_up(147, 4);
    builder.column(151, 4);
    builder.stairs_down(155, 4);
    // Last stretch: two short pipes around a brick row, coins over it.
    builder.pipe(164, 2);
    builder.row(169, 9, &[BRICK, BRICK, COIN_CRATE, BRICK]);
    builder.row(169, 7, &[COIN, COIN, COIN, COIN]);
    builder.pipe(180, 2);
    // The big staircase up to the goal pole.
    builder.stairs_up(183, 8);
    builder.column(191, 8);
    builder.set(FLAG_COLUMN, GROUND_ROW - 1, STONE); // pole base

    use EnemyKind::*;
    let enemies = [
        (Walker, 23.0), (Walker, 42.0), (Walker, 52.0), (Walker, 53.5), (Shellbug, 64.0), (Walker, 83.0), (Walker, 85.0),
        (Walker, 97.0), (Walker, 98.5), (Shellbug, 110.0), (Walker, 118.0), (Walker, 119.5), (Walker, 127.0), (Walker, 128.5),
        (Walker, 160.0), (Shellbug, 172.0), (Walker, 175.0), (Walker, 176.5),
    ];
    Layout { tiles: builder.tiles, enemies }
}
