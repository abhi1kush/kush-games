//! Fleet Clash rules: a 10 × 10 sea, five ships, shots and the computer's targeting.
//!
//! Cells are numbered row by row: cell = row * 10 + column (0..100). A ship is placed by its first (top/left) cell
//! and its direction. Ships may touch but not overlap. A shot answers miss, hit, or "sunk" with the ship.

pub const SIZE: u8 = 10;
pub const CELLS: usize = 100;
/// Ship lengths: carrier, destroyer, frigate, submarine, patrol boat.
pub const SHIPS: [u8; 5] = [5, 4, 3, 3, 2];
pub const UNPLACED: u8 = 255;

pub const MISS: u8 = 1;
pub const HIT: u8 = 2;
/// Sunk results are SUNK + ship index.
pub const SUNK: u8 = 10;

/// xorshift32: small, fast, deterministic.
#[derive(Clone)]
pub struct Rng(u32);
impl Rng {
    pub fn new(seed: u32) -> Rng { Rng(if seed == 0 { 0x9e37_79b9 } else { seed }) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    pub fn below(&mut self, limit: u32) -> u32 { if limit == 0 { 0 } else { self.next() % limit } }
}

/// The cells a ship of `length` covers from `start`, or None if it leaves the sea.
pub fn ship_cells(start: u8, vertical: bool, length: u8) -> Option<[u8; 5]> {
    if start as usize >= CELLS { return None; }
    let (row, column) = (start / SIZE, start % SIZE);
    if (vertical && row + length > SIZE) || (!vertical && column + length > SIZE) { return None; }
    let mut cells = [UNPLACED; 5];
    for step in 0..length { cells[step as usize] = if vertical { start + step * SIZE } else { start + step }; }
    Some(cells)
}

#[derive(Clone)]
pub struct Fleet {
    pub start: [u8; 5],
    pub vertical: [bool; 5],
    pub hits: [bool; CELLS],
    pub shots: [bool; CELLS],
    pub sunk: u8,
}

impl Default for Fleet { fn default() -> Self { Fleet::new() } }

impl Fleet {
    pub fn new() -> Fleet { Fleet { start: [UNPLACED; 5], vertical: [false; 5], hits: [false; CELLS], shots: [false; CELLS], sunk: 0 } }

    pub fn cells_of(&self, ship: usize) -> Option<[u8; 5]> {
        if ship >= SHIPS.len() || self.start[ship] == UNPLACED { return None; }
        ship_cells(self.start[ship], self.vertical[ship], SHIPS[ship])
    }

    pub fn ship_at(&self, cell: u8) -> Option<usize> {
        (0..SHIPS.len()).find(|&ship| self.cells_of(ship).is_some_and(|cells| cells[..SHIPS[ship] as usize].contains(&cell)))
    }

    /// Could `ship` go at `start` (ignoring where it is now)? With `spaced`, it may not touch another ship either.
    pub fn can_place(&self, ship: usize, start: u8, vertical: bool, spaced: bool) -> bool {
        let Some(cells) = (if ship < SHIPS.len() { ship_cells(start, vertical, SHIPS[ship]) } else { None }) else { return false; };
        for &cell in &cells[..SHIPS[ship] as usize] {
            for other in 0..SHIPS.len() {
                if other == ship { continue; }
                let Some(other_cells) = self.cells_of(other) else { continue };
                for &taken in &other_cells[..SHIPS[other] as usize] {
                    if taken == cell { return false; }
                    if spaced {
                        let (row, column) = ((cell / SIZE) as i8, (cell % SIZE) as i8);
                        let (taken_row, taken_column) = ((taken / SIZE) as i8, (taken % SIZE) as i8);
                        if (row - taken_row).abs() <= 1 && (column - taken_column).abs() <= 1 { return false; }
                    }
                }
            }
        }
        true
    }

    pub fn place(&mut self, ship: usize, start: u8, vertical: bool) -> bool {
        if !self.can_place(ship, start, vertical, false) { return false; }
        self.start[ship] = start;
        self.vertical[ship] = vertical;
        true
    }

    pub fn remove(&mut self, ship: usize) { if ship < SHIPS.len() { self.start[ship] = UNPLACED; } }

    pub fn is_complete(&self) -> bool { self.start.iter().all(|&start| start != UNPLACED) }

    /// Place every ship at random (keeping a gap between ships when it can; biggest ships first).
    pub fn randomize(&mut self, rng: &mut Rng) {
        for attempt in 0..200 {
            let spaced = attempt < 150;
            *self = Fleet::new();
            let mut ok = true;
            for ship in 0..SHIPS.len() {
                let mut placed = false;
                for _ in 0..300 {
                    let vertical = rng.below(2) == 1;
                    let start = rng.below(CELLS as u32) as u8;
                    if self.can_place(ship, start, vertical, spaced) { self.start[ship] = start; self.vertical[ship] = vertical; placed = true; break; }
                }
                if !placed { ok = false; break; }
            }
            if ok { return; }
        }
    }

    /// Fire at `cell`: 0 if not allowed (already shot / outside), MISS, HIT, or SUNK + ship.
    pub fn shoot(&mut self, cell: u8) -> u8 {
        if cell as usize >= CELLS || self.shots[cell as usize] || !self.is_complete() { return 0; }
        self.shots[cell as usize] = true;
        let Some(ship) = self.ship_at(cell) else { return MISS };
        self.hits[cell as usize] = true;
        let cells = self.cells_of(ship).unwrap();
        if cells[..SHIPS[ship] as usize].iter().all(|&part| self.hits[part as usize]) {
            self.sunk |= 1 << ship;
            return SUNK + ship as u8;
        }
        HIT
    }

    pub fn all_sunk(&self) -> bool { self.sunk == 0b11111 }

    /// 10 bytes: (start, vertical) per ship.
    pub fn code(&self) -> [u8; 10] {
        let mut bytes = [0u8; 10];
        for ship in 0..SHIPS.len() { bytes[ship * 2] = self.start[ship]; bytes[ship * 2 + 1] = self.vertical[ship] as u8; }
        bytes
    }

    /// A complete, non-overlapping fleet from `code`, or None.
    pub fn from_code(bytes: &[u8]) -> Option<Fleet> {
        if bytes.len() != 10 { return None; }
        let mut fleet = Fleet::new();
        for ship in 0..SHIPS.len() {
            if bytes[ship * 2 + 1] > 1 || !fleet.place(ship, bytes[ship * 2], bytes[ship * 2 + 1] == 1) { return None; }
        }
        Some(fleet)
    }
}

// ---------- the computer ----------
const UNKNOWN: u8 = 0;
const SEEN_MISS: u8 = 1;
const SEEN_HIT: u8 = 2;
const SEEN_SUNK: u8 = 3;

#[derive(Clone)]
pub struct Ai {
    pub level: u8,
    pub rng: Rng,
    pub seen: [u8; CELLS],
    pub afloat: [bool; 5],
}

impl Ai {
    pub fn new(level: u8, seed: u32) -> Ai { Ai { level: level.min(2), rng: Rng::new(seed), seen: [UNKNOWN; CELLS], afloat: [true; 5] } }

    /// What a shot at `cell` did. A sunk result also says where that ship was (the defender shows it).
    pub fn record(&mut self, cell: u8, result: u8, ship_start: u8, ship_vertical: bool) {
        if cell as usize >= CELLS { return; }
        match result {
            MISS => self.seen[cell as usize] = SEEN_MISS,
            HIT => self.seen[cell as usize] = SEEN_HIT,
            r if r >= SUNK && ((r - SUNK) as usize) < SHIPS.len() => {
                let ship = (r - SUNK) as usize;
                self.afloat[ship] = false;
                self.seen[cell as usize] = SEEN_HIT;
                if let Some(cells) = ship_cells(ship_start, ship_vertical, SHIPS[ship]) {
                    for &part in &cells[..SHIPS[ship] as usize] { self.seen[part as usize] = SEEN_SUNK; }
                }
            }
            _ => {}
        }
    }

    fn unknown_cells(&self) -> Vec<u8> { (0..CELLS as u8).filter(|&cell| self.seen[cell as usize] == UNKNOWN).collect() }

    fn open_hits(&self) -> Vec<u8> { (0..CELLS as u8).filter(|&cell| self.seen[cell as usize] == SEEN_HIT).collect() }

    fn pick(&mut self, cells: &[u8]) -> u8 { cells[self.rng.below(cells.len() as u32) as usize] }

    fn neighbours(cell: u8) -> Vec<u8> {
        let (row, column) = (cell / SIZE, cell % SIZE);
        let mut list = Vec::with_capacity(4);
        if row > 0 { list.push(cell - SIZE); }
        if row < SIZE - 1 { list.push(cell + SIZE); }
        if column > 0 { list.push(cell - 1); }
        if column < SIZE - 1 { list.push(cell + 1); }
        list
    }

    /// Cells next to open hits; when two open hits line up, only the ends of that line.
    fn target_cells(&self) -> Vec<u8> {
        let hits = self.open_hits();
        let mut ends = Vec::new();
        for &hit in &hits {
            for (step, horizontal) in [(1i16, true), (SIZE as i16, false)] {
                let next = hit as i16 + step;
                let aligned = next < CELLS as i16 && (!horizontal || (hit % SIZE) < SIZE - 1) && self.seen[next as usize] == SEEN_HIT;
                if !aligned { continue; }
                // walk both ways along the line to the first non-hit cell
                for direction in [-1i16, 1] {
                    let mut cell = hit as i16;
                    loop {
                        let column = cell % SIZE as i16;
                        let nextcell = cell + direction * step;
                        if nextcell < 0 || nextcell >= CELLS as i16 { break; }
                        if horizontal && ((direction == -1 && column == 0) || (direction == 1 && column == SIZE as i16 - 1)) { break; }
                        match self.seen[nextcell as usize] {
                            SEEN_HIT => cell = nextcell,
                            UNKNOWN => { ends.push(nextcell as u8); break; }
                            _ => break,
                        }
                    }
                }
            }
        }
        if !ends.is_empty() { ends.sort_unstable(); ends.dedup(); return ends; }
        let mut around: Vec<u8> = hits.iter().flat_map(|&hit| Ai::neighbours(hit)).filter(|&cell| self.seen[cell as usize] == UNKNOWN).collect();
        around.sort_unstable();
        around.dedup();
        around
    }

    /// How many ways the ships still afloat could cover each unknown cell (open hits weigh heavily).
    pub fn density(&self) -> [u32; CELLS] {
        let mut weights = [0u32; CELLS];
        let has_hits = self.seen.contains(&SEEN_HIT);
        for ship in 0..SHIPS.len() {
            if !self.afloat[ship] { continue; }
            let length = SHIPS[ship];
            for start in 0..CELLS as u8 {
                for vertical in [false, true] {
                    let Some(cells) = ship_cells(start, vertical, length) else { continue };
                    let cells = &cells[..length as usize];
                    if cells.iter().any(|&cell| matches!(self.seen[cell as usize], SEEN_MISS | SEEN_SUNK)) { continue; }
                    let covered = cells.iter().filter(|&&cell| self.seen[cell as usize] == SEEN_HIT).count() as u32;
                    if has_hits && covered == 0 { continue; }
                    let weight = if covered == 0 { 1 } else { 30u32.pow(covered.min(4)) };
                    for &cell in cells { if self.seen[cell as usize] == UNKNOWN { weights[cell as usize] += weight; } }
                }
            }
        }
        weights
    }

    /// The computer's next shot (always a cell it hasn't fired at).
    pub fn choose(&mut self) -> u8 {
        let unknown = self.unknown_cells();
        if unknown.is_empty() { return 0; }
        match self.level {
            0 => {
                let targets = self.target_cells();
                if !targets.is_empty() && self.rng.below(100) < 45 { let pick = self.pick(&targets); return pick; }
                self.pick(&unknown)
            }
            1 => {
                let targets = self.target_cells();
                if !targets.is_empty() { return self.pick(&targets); }
                let smallest = (0..SHIPS.len()).filter(|&ship| self.afloat[ship]).map(|ship| SHIPS[ship]).min().unwrap_or(2);
                let parity: Vec<u8> = unknown.iter().copied().filter(|&cell| ((cell / SIZE) + (cell % SIZE)) % smallest == 0).collect();
                if parity.is_empty() { self.pick(&unknown) } else { self.pick(&parity) }
            }
            _ => {
                let weights = self.density();
                let best = unknown.iter().map(|&cell| weights[cell as usize]).max().unwrap_or(0);
                if best == 0 { return self.pick(&unknown); }
                let top: Vec<u8> = unknown.iter().copied().filter(|&cell| weights[cell as usize] == best).collect();
                self.pick(&top)
            }
        }
    }
}
