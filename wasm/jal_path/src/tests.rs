use crate::board::*;
use crate::game::*;
use crate::levels::*;

fn run(game: &mut Game) { let mut steps = 0; while game.phase <= PHASE_FLOWING && steps < 60 * 300 { game.step(STEP_MS / 1000.0); steps += 1; } }

#[test]
fn tiles_are_eight_bytes_and_masks_rotate_clockwise() {
    assert_eq!(core::mem::size_of::<Tile>(), 8);
    assert_eq!(rotate_mask(0b0001), 0b0010); // north → east
    assert_eq!(rotate_mask(0b1000), 0b0001); // west → north
    assert_eq!(rotate_mask(0b0101), 0b1010); // straight
    assert_eq!(rotate_mask(rotate_mask(rotate_mask(rotate_mask(0b0011)))), 0b0011);
}

#[test]
fn every_level_is_solvable_with_its_tank_and_starts_unsolved() {
    let mut previous_size = 0;
    for level in 0..LEVEL_COUNT {
        let mut game = build(level);
        assert!(game.board.width >= previous_size);
        previous_size = game.board.width;
        assert!(game.board.mark_connected() < 3, "level {level} starts solved");
        game.solve();
        assert_eq!(game.board.mark_connected(), 3, "level {level} route reaches all houses");
        game.open_valve();
        run(&mut game);
        assert_eq!(game.phase, PHASE_WON, "level {level}: tank {} of {}", game.tank, game.capacity);
        assert!(game.tank > 0.0);
    }
}

#[test]
fn levels_are_the_same_every_time_and_get_harder() {
    let a = build(7);
    let b = build(7);
    assert_eq!(a.board.tiles, b.board.tiles);
    assert_eq!(a.capacity, b.capacity);
    let first = settings(0);
    let last = settings(LEVEL_COUNT - 1);
    assert!(last.size > first.size && last.rocks > first.rocks && last.margin < first.margin && last.plan_ms < first.plan_ms && last.leaks_on_route > 0);
    let leaks = build(LEVEL_COUNT - 1).board.tiles.iter().filter(|tile| tile.is_pipe() && tile.flags & FLAG_LEAK != 0).count();
    assert!(leaks >= 3);
}

#[test]
fn rocks_bolted_and_wet_pipes_do_not_turn() {
    let mut game = build(10);
    let rock = (0..game.board.cells() as u8).find(|&cell| game.board.tiles[cell as usize].kind == KIND_ROCK).unwrap();
    assert!(!game.rotate(rock));
    let bolted = (0..game.board.cells() as u8).find(|&cell| game.board.tiles[cell as usize].is_pipe() && game.board.tiles[cell as usize].flags & FLAG_FIXED != 0).unwrap();
    let mask = game.board.tiles[bolted as usize].mask;
    assert!(!game.rotate(bolted));
    assert_eq!(game.board.tiles[bolted as usize].mask, mask);
    game.solve();
    game.open_valve();
    for _ in 0..90 { game.step(STEP_MS / 1000.0); }
    let source = game.board.source.cell;
    assert!(game.board.tiles[source as usize].fill > 0.0);
    assert!(!game.rotate(source), "a pipe with water in it is locked");
}

#[test]
fn the_tank_drains_only_once_the_valve_opens_and_the_planning_clock_opens_it() {
    let mut game = build(0);
    let full = game.tank;
    game.advance(1000.0);
    assert_eq!(game.tank, full);
    assert_eq!(game.phase, PHASE_PLANNING);
    let plan = game.plan_left_ms;
    for _ in 0..((plan / 1000.0) as u32 + 2) * 2 { game.advance(500.0); }
    assert_eq!(game.phase, PHASE_FLOWING, "the valve opens by itself when planning time is up");
    game.advance(500.0);
    assert!(game.tank < full);
}

#[test]
fn spills_waste_water_and_an_empty_tank_loses() {
    // a scrambled board: water spills somewhere and the tank runs dry
    let mut game = build(2);
    game.open_valve();
    for _ in 0..30 { game.step(STEP_MS / 1000.0); }
    run(&mut game);
    assert_eq!(game.phase, PHASE_LOST);
    assert_eq!(game.tank, 0.0);
    assert_eq!(game.stars(), 0);
    assert!(!game.rotate(game.board.source.cell));
    // the solved board uses less water than a spilling one over the same time
    let mut good = build(2);
    good.solve();
    good.open_valve();
    let mut bad = build(2);
    bad.open_valve();
    for _ in 0..300 { good.step(STEP_MS / 1000.0); bad.step(STEP_MS / 1000.0); }
    assert!(bad.spill_count > 0, "the scrambled board spills");
    let before = bad.tank;
    bad.step(STEP_MS / 1000.0);
    let dt = STEP_MS / 1000.0;
    assert!(before - bad.tank >= bad.spill_count as f32 * SPILL_RATE * dt + EVAPORATION * dt - 1e-4, "every open end spills from the tank");
}

#[test]
fn a_win_gives_stars_by_water_left() {
    let mut game = build(0);
    game.solve();
    game.open_valve();
    run(&mut game);
    assert_eq!(game.phase, PHASE_WON);
    assert!(game.stars() >= 2, "a clean solution on level 1 keeps plenty of water ({} of {})", game.tank, game.capacity);
}

#[test]
fn advance_is_capped_per_call() {
    let mut game = build(0);
    game.open_valve();
    game.advance(1e9);
    let after_one = game.tank;
    let mut other = build(0);
    other.open_valve();
    for _ in 0..MAX_STEPS_PER_CALL { other.step(STEP_MS / 1000.0); }
    assert!((after_one - other.tank).abs() < 0.01);
}

#[test]
fn a_clean_solution_earns_three_stars_on_every_level() {
    for level in 0..crate::levels::LEVEL_COUNT {
        let mut game = crate::levels::build(level);
        game.solve();
        game.open_valve();
        for _ in 0..60 * 600 { if game.phase != PHASE_FLOWING { break; } game.step(STEP_MS / 1000.0); }
        assert_eq!(game.phase, PHASE_WON, "level {}", level + 1);
        assert_eq!(game.stars(), 3, "level {}: {} left of {} (needs {})", level + 1, game.tank, game.capacity, game.needed);
    }
}
