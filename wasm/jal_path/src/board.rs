//! Jal Path board: pipe tiles on a grid, a water source on the left edge and three houses on the other edges.
//!
//! Openings are a 4-bit mask: 1 north, 2 east, 4 south, 8 west. Rotating a tile a quarter turn clockwise moves each
//! opening one side clockwise. Water runs from the source into connected pipes (both tiles must have facing openings);
//! a pipe end that faces nothing spills, a cracked pipe leaks, and every drop comes out of a limited tank.

pub const NORTH: u8 = 0;
pub const EAST: u8 = 1;
pub const SOUTH: u8 = 2;
pub const WEST: u8 = 3;
pub const MAX_SIDE: usize = 8;
pub const MAX_CELLS: usize = MAX_SIDE * MAX_SIDE;

pub const KIND_NONE: u8 = 0;
pub const KIND_PIPE: u8 = 1;
pub const KIND_ROCK: u8 = 2;

pub const FLAG_FIXED: u8 = 1;
pub const FLAG_LEAK: u8 = 2;
/// Set on pipes currently joined to the source (shown while planning).
pub const FLAG_CONNECTED: u8 = 4;

pub const NO_ENTRY: u8 = 255;

/// One tile. `#[repr(C)]` so JavaScript reads the tiles straight from wasm memory (8 bytes each).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tile {
    pub mask: u8,
    pub kind: u8,
    pub flags: u8,
    /// Side the water came in from (NO_ENTRY while dry).
    pub entry: u8,
    /// 0 dry … 1 full of water.
    pub fill: f32,
}

impl Tile {
    pub const EMPTY: Tile = Tile { mask: 0, kind: KIND_NONE, flags: 0, entry: NO_ENTRY, fill: 0.0 };
    pub fn is_pipe(&self) -> bool { self.kind == KIND_PIPE }
    pub fn has(&self, side: u8) -> bool { self.mask & (1 << side) != 0 }
}

pub const fn opposite(side: u8) -> u8 { (side + 2) & 3 }
/// The mask turned a quarter clockwise.
pub const fn rotate_mask(mask: u8) -> u8 { ((mask << 1) | (mask >> 3)) & 15 }

/// A port on the board's rim: the cell it attaches to and the side of that cell it faces.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Port { pub cell: u8, pub side: u8 }

#[derive(Clone, Copy)]
pub struct Board {
    pub width: u8,
    pub height: u8,
    pub tiles: [Tile; MAX_CELLS],
    pub source: Port,
    pub houses: [Port; 3],
}

impl Board {
    pub fn new(width: u8, height: u8) -> Board {
        Board { width, height, tiles: [Tile::EMPTY; MAX_CELLS], source: Port { cell: 0, side: WEST }, houses: [Port { cell: 0, side: NORTH }; 3] }
    }
    pub fn cells(&self) -> usize { self.width as usize * self.height as usize }
    pub fn index(&self, row: u8, column: u8) -> u8 { row * self.width + column }
    /// The neighbouring cell through `side`, or None at the rim.
    pub fn neighbour(&self, cell: u8, side: u8) -> Option<u8> {
        let (row, column) = (cell / self.width, cell % self.width);
        match side {
            NORTH if row > 0 => Some(cell - self.width),
            SOUTH if row + 1 < self.height => Some(cell + self.width),
            WEST if column > 0 => Some(cell - 1),
            EAST if column + 1 < self.width => Some(cell + 1),
            _ => None,
        }
    }
    pub fn house_at(&self, cell: u8, side: u8) -> Option<usize> { self.houses.iter().position(|port| port.cell == cell && port.side == side) }
    pub fn is_source(&self, cell: u8, side: u8) -> bool { self.source.cell == cell && self.source.side == side }

    /// Do the two cells have facing openings (water can pass)?
    pub fn joined(&self, cell: u8, side: u8) -> Option<u8> {
        let tile = self.tiles[cell as usize];
        if !tile.is_pipe() || !tile.has(side) { return None; }
        let next = self.neighbour(cell, side)?;
        let other = self.tiles[next as usize];
        if other.is_pipe() && other.has(opposite(side)) { Some(next) } else { None }
    }

    /// Marks the pipes joined to the source; returns how many houses that network reaches.
    pub fn mark_connected(&mut self) -> u8 {
        for tile in self.tiles.iter_mut() { tile.flags &= !FLAG_CONNECTED; }
        let start = self.source.cell;
        let first = self.tiles[start as usize];
        if !first.is_pipe() || !first.has(self.source.side) { return 0; }
        let mut stack = [0u8; MAX_CELLS];
        let mut top = 1;
        stack[0] = start;
        self.tiles[start as usize].flags |= FLAG_CONNECTED;
        let mut reached = [false; 3];
        while top > 0 {
            top -= 1;
            let cell = stack[top];
            for side in 0..4 {
                if !self.tiles[cell as usize].has(side) { continue; }
                if let Some(house) = self.house_at(cell, side) { reached[house] = true; }
                if let Some(next) = self.joined(cell, side) {
                    if self.tiles[next as usize].flags & FLAG_CONNECTED == 0 { self.tiles[next as usize].flags |= FLAG_CONNECTED; stack[top] = next; top += 1; }
                }
            }
        }
        reached.iter().filter(|&&value| value).count() as u8
    }
}
