//! English draughts (8×8 checkers) on the 32 dark squares.
//! Square numbering: 0–31 left to right, top to bottom; row = square / 4. Dark moves up (towards row 0) and moves first.
//! Captures are compulsory, a capture must continue while it can, and a man that reaches the far row is crowned and stops.

pub const SQUARES: usize = 32;
pub const DARK: u8 = 0;
pub const LIGHT: u8 = 1;
/// Plies without a capture or a man moving before the game is a draw (40 moves each).
pub const DRAW_PLIES: u16 = 80;

pub const fn row_of(square: usize) -> i32 { (square / 4) as i32 }
pub const fn column_of(square: usize) -> i32 { let row = square / 4; (2 * (square % 4) + if row % 2 == 0 { 1 } else { 0 }) as i32 }

fn square_at(row: i32, column: i32) -> Option<usize> {
    if !(0..8).contains(&row) || !(0..8).contains(&column) || (row + column) % 2 == 0 { return None; }
    Some((row * 4 + column / 2) as usize)
}

/// Directions: 0 up-left, 1 up-right, 2 down-left, 3 down-right.
const DIRECTIONS: [(i32, i32); 4] = [(-1, -1), (-1, 1), (1, -1), (1, 1)];

pub struct Geometry { pub step: [[Option<usize>; 4]; SQUARES], pub jump: [[Option<usize>; 4]; SQUARES] }

pub fn geometry() -> &'static Geometry {
    static GEOMETRY: std::sync::OnceLock<Geometry> = std::sync::OnceLock::new();
    GEOMETRY.get_or_init(|| {
        let mut step = [[None; 4]; SQUARES];
        let mut jump = [[None; 4]; SQUARES];
        for square in 0..SQUARES {
            for (direction, (row_step, column_step)) in DIRECTIONS.iter().enumerate() {
                step[square][direction] = square_at(row_of(square) + row_step, column_of(square) + column_step);
                jump[square][direction] = square_at(row_of(square) + 2 * row_step, column_of(square) + 2 * column_step);
            }
        }
        Geometry { step, jump }
    })
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Position {
    pub dark: u32,
    pub light: u32,
    pub kings: u32,
    pub side: u8,
    pub quiet_plies: u16,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Move {
    pub from: u8,
    /// Squares landed on, in order (one for a simple step).
    pub path: [u8; 9],
    pub path_length: u8,
    pub captured: u32,
}

impl Move {
    pub fn to(&self) -> u8 { self.path[self.path_length as usize - 1] }
    pub fn is_capture(&self) -> bool { self.captured != 0 }
}

const fn bit(square: usize) -> u32 { 1u32 << square }

impl Default for Position { fn default() -> Self { Self::start() } }

impl Position {
    pub fn start() -> Self { Position { dark: 0xFFF0_0000, light: 0x0000_0FFF, kings: 0, side: DARK, quiet_plies: 0 } }

    pub fn own(&self) -> u32 { if self.side == DARK { self.dark } else { self.light } }
    pub fn opponent(&self) -> u32 { if self.side == DARK { self.light } else { self.dark } }
    pub fn occupied(&self) -> u32 { self.dark | self.light }

    fn directions_for(&self, square: usize) -> &'static [usize] {
        if self.kings & bit(square) != 0 { &[0, 1, 2, 3] } else if self.side == DARK { &[0, 1] } else { &[2, 3] }
    }
    fn is_crowning_square(&self, square: usize) -> bool { if self.side == DARK { square < 4 } else { square >= 28 } }

    pub fn legal_moves(&self) -> Vec<Move> {
        let mut moves = Vec::new();
        let own = self.own();
        for square in 0..SQUARES {
            if own & bit(square) == 0 { continue; }
            let start = Move { from: square as u8, path: [0; 9], path_length: 0, captured: 0 };
            self.collect_jumps(square, square, self.kings & bit(square) != 0, start, &mut moves);
        }
        if !moves.is_empty() { return moves; }
        let geometry = geometry();
        for square in 0..SQUARES {
            if own & bit(square) == 0 { continue; }
            for &direction in self.directions_for(square) {
                if let Some(target) = geometry.step[square][direction] {
                    if self.occupied() & bit(target) == 0 {
                        let mut path = [0; 9];
                        path[0] = target as u8;
                        moves.push(Move { from: square as u8, path, path_length: 1, captured: 0 });
                    }
                }
            }
        }
        moves
    }

    /// Depth-first search for capture chains from `square` (the moving piece started at `origin`).
    fn collect_jumps(&self, origin: usize, square: usize, is_king: bool, so_far: Move, moves: &mut Vec<Move>) {
        let geometry = geometry();
        let directions: &[usize] = if is_king { &[0, 1, 2, 3] } else if self.side == DARK { &[0, 1] } else { &[2, 3] };
        let mut extended = false;
        for &direction in directions {
            let (Some(over), Some(landing)) = (geometry.step[square][direction], geometry.jump[square][direction]) else { continue };
            let landing_free = (self.occupied() & !bit(origin)) & bit(landing) == 0;
            if self.opponent() & bit(over) == 0 || so_far.captured & bit(over) != 0 || !landing_free { continue; }
            if so_far.path_length as usize >= so_far.path.len() { continue; }
            let mut next = so_far;
            next.path[next.path_length as usize] = landing as u8;
            next.path_length += 1;
            next.captured |= bit(over);
            extended = true;
            if !is_king && self.is_crowning_square(landing) { moves.push(next); } // crowning ends the move
            else { self.collect_jumps(origin, landing, is_king, next, moves); }
        }
        if !extended && so_far.path_length > 0 { moves.push(so_far); }
    }

    pub fn apply(&self, chosen: &Move) -> Position {
        let mut next = *self;
        let from = bit(chosen.from as usize);
        let to_square = chosen.to() as usize;
        let to = bit(to_square);
        let was_king = self.kings & from != 0;
        if self.side == DARK { next.dark = (next.dark & !from) | to; next.light &= !chosen.captured; }
        else { next.light = (next.light & !from) | to; next.dark &= !chosen.captured; }
        next.kings &= !from & !chosen.captured;
        if was_king || self.is_crowning_square(to_square) { next.kings |= to; }
        next.quiet_plies = if chosen.is_capture() || !was_king { 0 } else { self.quiet_plies + 1 };
        next.side = 1 - self.side;
        next
    }
}
