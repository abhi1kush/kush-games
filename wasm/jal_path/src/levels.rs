//! The 18 levels, generated from fixed seeds so every player gets the same boards. Each level grows harder: bigger
//! grids (5×5 → 8×8), houses farther from the source, more rocks, more cracked pipes (some on the only route), fewer
//! bolted helper pipes, a shorter planning time, faster water and a tank with less to spare.
use crate::board::*;
use crate::game::*;

pub const LEVEL_COUNT: u8 = 18;

pub struct Rng(u32);
impl Rng {
    pub fn new(seed: u32) -> Rng { Rng(if seed == 0 { 0x9e37_79b9 } else { seed }) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    pub fn below(&mut self, limit: u32) -> u32 { if limit == 0 { 0 } else { self.next() % limit } }
}

#[derive(Clone, Copy, Debug)]
pub struct Settings { pub size: u8, pub rocks: u8, pub leaks_on_route: u8, pub leaks_elsewhere: u8, pub bolted_helpers: u8, pub bolted_decoys: u8, pub margin: f32, pub plan_ms: f32, pub speed: f32, pub far: bool }

pub fn settings(level: u8) -> Settings {
    let n = level.min(LEVEL_COUNT - 1);
    Settings {
        size: if n < 3 { 5 } else if n < 7 { 6 } else if n < 12 { 7 } else { 8 },
        rocks: n / 2 + 1,
        leaks_on_route: if n < 5 { 0 } else { ((n - 3) / 5).min(3) },
        leaks_elsewhere: n / 3,
        bolted_helpers: 4u8.saturating_sub(n / 4),
        bolted_decoys: n / 4,
        margin: 2.0 - n as f32 * 0.045,
        plan_ms: (40_000.0 - n as f32 * 1_500.0).max(15_000.0),
        speed: 1.8 + n as f32 * 0.06,
        far: n >= 6,
    }
}

const DECOYS: [u8; 3] = [0b0101, 0b0011, 0b0111]; // straight, elbow, tee

/// Builds level `level` (0-based).
pub fn build(level: u8) -> Game {
    let config = settings(level);
    let mut attempt = 0u32;
    loop {
        if let Some(game) = try_build(&config, 0x5eed_0000 ^ ((level as u32 + 1) * 2_654_435_761) ^ attempt.wrapping_mul(97)) { return game; }
        attempt += 1;
    }
}

fn try_build(config: &Settings, seed: u32) -> Option<Game> {
    let mut rng = Rng::new(seed);
    let size = config.size;
    let mut board = Board::new(size, size);
    let cells = board.cells();
    // source on the left edge (away from the corners), houses on the top, right and bottom edges
    let source_row = 1 + rng.below(size as u32 - 2) as u8;
    board.source = Port { cell: board.index(source_row, 0), side: WEST };
    let pick = |rng: &mut Rng| if config.far { size / 2 + rng.below((size - size / 2) as u32) as u8 } else { 1 + rng.below(size as u32 - 1) as u8 };
    let top = pick(&mut rng);
    let bottom = pick(&mut rng);
    let right = rng.below(size as u32) as u8;
    board.houses = [
        Port { cell: board.index(0, top), side: NORTH },
        Port { cell: board.index(right, size - 1), side: EAST },
        Port { cell: board.index(size - 1, bottom), side: SOUTH },
    ];
    // random spanning tree from the source cell (depth-first, random order)
    let mut parent = [255u8; MAX_CELLS];
    let mut parent_side = [0u8; MAX_CELLS];
    let mut seen = [false; MAX_CELLS];
    let mut stack = [0u8; MAX_CELLS];
    let mut top_of_stack = 1;
    stack[0] = board.source.cell;
    seen[board.source.cell as usize] = true;
    while top_of_stack > 0 {
        let cell = stack[top_of_stack - 1];
        let mut options = [0u8; 4];
        let mut count = 0;
        for side in 0..4 { if let Some(next) = board.neighbour(cell, side) { if !seen[next as usize] { options[count] = side; count += 1; } } }
        if count == 0 { top_of_stack -= 1; continue; }
        let side = options[rng.below(count as u32) as usize];
        let next = board.neighbour(cell, side).unwrap();
        seen[next as usize] = true;
        parent[next as usize] = cell;
        parent_side[next as usize] = opposite(side); // side of `next` facing its parent
        stack[top_of_stack] = next;
        top_of_stack += 1;
    }
    // the route: union of the tree paths from each house back to the source
    let mut solution = [0u8; MAX_CELLS];
    solution[board.source.cell as usize] |= 1 << WEST;
    for house in board.houses {
        solution[house.cell as usize] |= 1 << house.side;
        let mut cell = house.cell;
        while cell != board.source.cell {
            let up = parent[cell as usize];
            let side = parent_side[cell as usize];
            solution[cell as usize] |= 1 << side;
            solution[up as usize] |= 1 << opposite(side);
            cell = up;
        }
    }
    let route: u32 = solution[..cells].iter().filter(|&&mask| mask != 0).count() as u32;
    if route < (cells as u32) / 3 || route > (cells as u32) * 3 / 4 { return None; }
    // tiles: the route, then rocks and decoy pipes elsewhere
    let mut off_route = [0u8; MAX_CELLS];
    let mut off_count = 0;
    for cell in 0..cells {
        if solution[cell] != 0 { board.tiles[cell] = Tile { mask: solution[cell], kind: KIND_PIPE, ..Tile::EMPTY }; }
        else { off_route[off_count] = cell as u8; off_count += 1; }
    }
    shuffle(&mut off_route[..off_count], &mut rng);
    let rocks = (config.rocks as usize).min(off_count / 2);
    for (index, &cell) in off_route[..off_count].iter().enumerate() {
        board.tiles[cell as usize] = if index < rocks { Tile { kind: KIND_ROCK, ..Tile::EMPTY } } else { Tile { mask: DECOYS[rng.below(3) as usize], kind: KIND_PIPE, ..Tile::EMPTY } };
    }
    let decoys = &off_route[rocks..off_count];
    for &cell in decoys.iter().take(config.leaks_elsewhere as usize) { board.tiles[cell as usize].flags |= FLAG_LEAK; }
    for &cell in decoys.iter().rev().take(config.bolted_decoys as usize) { board.tiles[cell as usize].flags |= FLAG_FIXED; }
    // route tiles: a few bolted in the right orientation (helpers), some cracked (unavoidable leaks)
    let mut route_cells = [0u8; MAX_CELLS];
    let mut route_count = 0;
    for cell in 0..cells { if solution[cell] != 0 && cell as u8 != board.source.cell { route_cells[route_count] = cell as u8; route_count += 1; } }
    shuffle(&mut route_cells[..route_count], &mut rng);
    for &cell in route_cells[..route_count].iter().take(config.bolted_helpers as usize) { board.tiles[cell as usize].flags |= FLAG_FIXED; }
    for &cell in route_cells[..route_count].iter().rev().take(config.leaks_on_route as usize) { board.tiles[cell as usize].flags |= FLAG_LEAK; }
    // the water this level needs: play the solved board with the decoys turned away from the route as far as they go
    let mut solved = board;
    for &cell in decoys { if solved.tiles[cell as usize].flags & FLAG_FIXED == 0 { solved.tiles[cell as usize].mask = least_joined(&solved, cell); } }
    let mut trial = Game::new(solved, solution, 10_000.0, 0.0, config.speed);
    trial.open_valve();
    let mut steps = 0;
    while trial.phase == PHASE_FLOWING && steps < 60 * 120 { trial.step(STEP_MS / 1000.0); steps += 1; }
    if trial.phase != PHASE_WON { return None; }
    let needed = 10_000.0 - trial.tank;
    // scramble every movable pipe
    for cell in 0..cells {
        let tile = &mut board.tiles[cell];
        if tile.is_pipe() && tile.flags & FLAG_FIXED == 0 { for _ in 0..rng.below(4) { tile.mask = rotate_mask(tile.mask); } }
    }
    let mut game = Game::new(board, solution, (needed * config.margin).ceil(), config.plan_ms, config.speed);
    game.needed = needed;
    if game.board.mark_connected() == 3 {
        // never start already solved: turn the first movable route tile that isn't symmetric
        let cell = route_cells[..route_count].iter().copied().find(|&cell| game.can_rotate(cell) && rotate_mask(game.board.tiles[cell as usize].mask) != game.board.tiles[cell as usize].mask)?;
        game.rotate(cell);
        game.moves = 0;
        if game.board.mark_connected() == 3 { return None; }
    }
    Some(game)
}

/// The orientation of a decoy that opens onto the fewest route pipes.
fn least_joined(board: &Board, cell: u8) -> u8 {
    let mut mask = board.tiles[cell as usize].mask;
    let mut best = (u8::MAX, mask);
    for _ in 0..4 {
        let mut test = *board;
        test.tiles[cell as usize].mask = mask;
        let joins = (0..4u8).filter(|&side| test.joined(cell, side).is_some() || (test.tiles[cell as usize].has(side) && test.neighbour(cell, side).is_none())).count() as u8;
        if joins < best.0 { best = (joins, mask); }
        mask = rotate_mask(mask);
    }
    best.1
}

fn shuffle(values: &mut [u8], rng: &mut Rng) {
    for index in (1..values.len()).rev() { let other = rng.below(index as u32 + 1) as usize; values.swap(index, other); }
}
