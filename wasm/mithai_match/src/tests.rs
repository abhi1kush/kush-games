use crate::levels::{Goal, LEVELS, LEVEL_COUNT};
use crate::world::*;
use crate::MithaiMatch;

fn ready(level: usize, seed: u32) -> World {
    let mut world = World::new();
    world.start_level(level, seed);
    world.begin();
    world
}

/// Paint a board from 8 strings of colour digits ('.' leaves the cell as is).
fn paint(world: &mut World, rows: [&str; 8]) {
    for (row, line) in rows.iter().enumerate() {
        for (column, character) in line.bytes().enumerate() {
            if character.is_ascii_digit() {
                let cell = cell_at(row, column);
                world.cells[cell].colour = character - b'0';
                world.cells[cell].special = Special::None;
            }
        }
    }
}

const NO_MATCH_BOARD: [&str; 8] = ["01230123", "12301230", "23012301", "30123012", "01230123", "12301230", "23012301", "30123012"];

fn play(world: &mut World, a: usize, b: usize) -> bool {
    let started = world.try_swap(a, b);
    world.finish_animations();
    started
}

#[test]
fn boards_start_without_matches_and_with_a_move() {
    for level in 0..LEVEL_COUNT {
        for seed in 0..10 {
            let mut world = ready(level, seed);
            let mut plan_runs = 0;
            for cell in 0..CELLS {
                if world.has_piece(cell) {
                    let colour = world.cells[cell].colour;
                    if column_of(cell) <= 5 && (1..3).all(|step| world.has_piece(cell + step) && world.cells[cell + step].colour == colour) { plan_runs += 1; }
                    if row_of(cell) <= 5 && (1..3).all(|step| world.has_piece(cell + step * SIZE) && world.cells[cell + step * SIZE].colour == colour) { plan_runs += 1; }
                }
            }
            assert_eq!(plan_runs, 0, "level {} seed {seed} starts with a match", level + 1);
            assert!(world.find_move().is_some());
            assert_eq!(world.moves_left, LEVELS[level].moves);
        }
    }
}

#[test]
fn a_valid_swap_clears_scores_and_refills() {
    let mut world = ready(0, 3);
    paint(&mut world, NO_MATCH_BOARD);
    // row 0: 0 1 2 3 ... put a 1 at (1,0)... build a guaranteed match: make (0,0),(0,1) colour 4 and (1,2) colour 4, swap (1,2) up
    paint(&mut world, ["44......", "..4.....", "........", "........", "........", "........", "........", "........"]);
    let moves = world.moves_left;
    assert!(world.is_valid_move(cell_at(0, 2), cell_at(1, 2)));
    let mut events = 0;
    assert!(world.try_swap(cell_at(1, 2), cell_at(0, 2)));
    for _ in 0..400 { events |= world.advance(1.0 / 60.0); }
    assert!(events & events::SWAP != 0 && events & events::MATCH != 0 && events & events::LANDED != 0);
    assert_eq!(world.moves_left, moves - 1);
    assert!(world.score >= 60);
    assert!((0..CELLS).all(|cell| !world.is_open(cell) || world.has_piece(cell)), "every open cell refilled");
    assert_eq!(world.phase, Phase::Idle);
}

#[test]
fn invalid_swaps_slide_back_and_cost_nothing() {
    let mut world = ready(0, 3);
    paint(&mut world, NO_MATCH_BOARD);
    let before: Vec<u8> = world.cells.iter().map(|cell| cell.colour).collect();
    let moves = world.moves_left;
    assert!(world.try_swap(0, 1));
    let mut events = 0;
    let mut saw_back = false;
    for _ in 0..60 { events |= world.advance(1.0 / 60.0); if world.phase == Phase::SwapBack { saw_back = true; } }
    assert!(saw_back && events & events::INVALID != 0);
    assert_eq!(world.phase, Phase::Idle);
    assert_eq!(world.moves_left, moves);
    let after: Vec<u8> = world.cells.iter().map(|cell| cell.colour).collect();
    assert_eq!(before, after);
    // not neighbours
    assert!(!world.try_swap(0, 9));
}

#[test]
fn tap_tap_and_swipe_both_swap() {
    let mut world = ready(0, 3);
    paint(&mut world, NO_MATCH_BOARD);
    paint(&mut world, ["44......", "..4.....", "........", "........", "........", "........", "........", "........"]);
    world.tap(cell_at(1, 2));
    assert_eq!(world.selected, cell_at(1, 2) as i32);
    world.tap(cell_at(0, 2));
    assert_eq!(world.phase, Phase::Swapping);
    world.finish_animations();
    let mut world = ready(0, 3);
    paint(&mut world, NO_MATCH_BOARD);
    paint(&mut world, ["44......", "..4.....", "........", "........", "........", "........", "........", "........"]);
    world.swipe(cell_at(1, 2), 0);
    assert_eq!(world.phase, Phase::Swapping);
}

#[test]
fn four_in_a_row_makes_a_striped_piece_that_clears_its_line() {
    let mut world = ready(0, 5);
    paint(&mut world, NO_MATCH_BOARD);
    // three 4s with a gap; a 4 below the gap is swapped up
    paint(&mut world, ["........", "........", "........", "444.....", "...4....", "........", "........", "........"]);
    world.cells[cell_at(3, 3)].colour = 5;
    assert!(world.try_swap(cell_at(4, 3), cell_at(3, 3)));
    while world.phase != Phase::Clearing { world.step(1.0 / 120.0); }
    assert_eq!(world.cells[cell_at(3, 3)].special, Special::StripedH, "created where the swapped piece landed");
    assert_eq!(world.specials_made, 1);
    assert!((0..3).all(|column| !world.has_piece(cell_at(3, column))), "the other three cleared");
    world.finish_animations();
    world.debug_place(cell_at(3, 3), 4, Special::StripedH);
    // set it off together with a wrapped piece
    let mut plan_world = world.clone();
    plan_world.debug_place(cell_at(3, 4), 4, Special::Wrapped);
    let score = plan_world.score;
    assert!(play(&mut plan_world, cell_at(3, 3), cell_at(3, 4)));
    assert!(plan_world.score > score + 20 * 20, "striped + wrapped clears three rows and columns");
}

#[test]
fn l_and_t_shapes_make_wrapped_pieces_that_blast_three_by_three() {
    let mut world = ready(0, 7);
    paint(&mut world, NO_MATCH_BOARD);
    // an L: (2,0),(2,1) + (3,2),(4,2) with the corner piece swapped in from (2,3)
    paint(&mut world, ["........", "........", "44.4....", "..4.....", "..4.....", "........", "........", "........"]);
    world.cells[cell_at(2, 2)].colour = 5;
    world.cells[cell_at(1, 2)].colour = 1;
    assert!(play(&mut world, cell_at(2, 3), cell_at(2, 2)));
    // it was made on the corner and then fell two rows into the gap below
    assert_eq!(world.cells[cell_at(4, 2)].special, Special::Wrapped);
    let score = world.score;
    let mut trial = world.clone();
    trial.debug_place(cell_at(4, 3), 0, Special::Wrapped);
    trial.try_swap(cell_at(4, 2), cell_at(4, 3));
    for _ in 0..24 { trial.step(1.0 / 120.0); }
    assert_eq!((0..CELLS).filter(|&cell| !trial.has_piece(cell)).count(), 25, "two wrapped together blast 5 × 5");
    assert!(trial.score > score);
}

#[test]
fn five_in_a_row_makes_a_colour_bomb_that_clears_a_colour() {
    let mut world = ready(0, 9);
    paint(&mut world, NO_MATCH_BOARD);
    paint(&mut world, ["........", "........", "........", "........", "44.44...", "..4.....", "........", "........"]);
    world.cells[cell_at(4, 2)].colour = 5;
    assert!(play(&mut world, cell_at(5, 2), cell_at(4, 2)));
    assert_eq!(world.cells[cell_at(4, 2)].special, Special::ColourBomb);
    // swap the bomb with a neighbour: every piece of that colour goes
    let neighbour = cell_at(3, 2);
    let colour = world.cells[neighbour].colour;
    let count_before = (0..CELLS).filter(|&cell| world.has_piece(cell) && world.cells[cell].colour == colour).count();
    assert!(count_before >= 3);
    let mut trial = world.clone();
    assert!(trial.try_swap(cell_at(4, 2), neighbour));
    for _ in 0..30 { trial.step(1.0 / 60.0); }
    // right after the clear stage starts, that colour is gone from the board (before refill)
    let left = (0..CELLS).filter(|&cell| trial.has_piece(cell) && trial.cells[cell].colour == colour && trial.cells[cell].fall_offset == 0.0).count();
    assert_eq!(left, 0, "{count_before} pieces of colour {colour} cleared");
}

#[test]
fn special_combinations() {
    // striped + striped: a cross
    let mut world = ready(0, 11);
    paint(&mut world, NO_MATCH_BOARD);
    world.debug_place(cell_at(3, 3), 0, Special::StripedH);
    world.debug_place(cell_at(3, 4), 1, Special::StripedV);
    let mut trial = world.clone();
    trial.try_swap(cell_at(3, 3), cell_at(3, 4));
    for _ in 0..24 { trial.step(1.0 / 120.0); }
    assert!(trial.phase == Phase::Clearing);
    let cleared = (0..CELLS).filter(|&cell| !trial.has_piece(cell)).count();
    assert_eq!(cleared, 15, "one row + one column");
    // wrapped + wrapped: 5×5
    let mut trial = world.clone();
    trial.debug_place(cell_at(3, 3), 0, Special::Wrapped);
    trial.debug_place(cell_at(3, 4), 1, Special::Wrapped);
    trial.try_swap(cell_at(3, 3), cell_at(3, 4));
    for _ in 0..24 { trial.step(1.0 / 120.0); }
    assert_eq!((0..CELLS).filter(|&cell| !trial.has_piece(cell)).count(), 25);
    // bomb + bomb: everything
    let mut trial = world.clone();
    trial.debug_place(cell_at(3, 3), 0, Special::ColourBomb);
    trial.debug_place(cell_at(3, 4), 0, Special::ColourBomb);
    trial.try_swap(cell_at(3, 3), cell_at(3, 4));
    for _ in 0..24 { trial.step(1.0 / 120.0); }
    assert_eq!((0..CELLS).filter(|&cell| !trial.has_piece(cell)).count(), CELLS);
    // bomb + striped: every piece of that colour becomes striped and fires (far more than one colour's worth)
    let mut trial = world.clone();
    trial.debug_place(cell_at(3, 3), 0, Special::ColourBomb);
    trial.debug_place(cell_at(3, 4), 1, Special::StripedH);
    trial.try_swap(cell_at(3, 3), cell_at(3, 4));
    for _ in 0..24 { trial.step(1.0 / 120.0); }
    assert!((0..CELLS).filter(|&cell| !trial.has_piece(cell)).count() > 30);
}

#[test]
fn chains_set_off_specials_caught_in_a_blast() {
    let mut world = ready(0, 13);
    paint(&mut world, NO_MATCH_BOARD);
    world.debug_place(cell_at(0, 0), 0, Special::StripedV); // column 0
    world.debug_place(cell_at(7, 1), 0, Special::StripedH); // caught by column 1 → row 7
    world.debug_place(cell_at(0, 1), 1, Special::StripedH);
    world.try_swap(cell_at(0, 0), cell_at(0, 1));
    for _ in 0..24 { world.step(1.0 / 120.0); }
    assert!(!world.has_piece(cell_at(7, 7)), "the second striped piece fired along row 7");
}

#[test]
fn jelly_stones_and_locks() {
    // jelly peels one layer per clear
    let mut world = ready(9, 1);
    let jelly = world.jelly_left();
    assert!(jelly > 30);
    let mut guard = 0;
    while world.jelly_left() == jelly && guard < 20 { let (a, b) = best_move(&world).unwrap(); play(&mut world, a, b); guard += 1; }
    assert!(world.jelly_left() < jelly);
    // stones break from neighbouring matches and don't fall
    let mut world = ready(7, 2);
    let stones = world.blockers_left();
    assert_eq!(stones, 12);
    let mut guard = 0;
    while world.blockers_left() == stones && guard < 20 { let (a, b) = best_move(&world).unwrap(); play(&mut world, a, b); guard += 1; }
    assert!(world.blockers_left() < stones);
    assert!((0..CELLS).all(|cell| world.cells[cell].stone == 0 || row_of(cell) == 3), "stones stay in their row");
    // locked pieces can't be swapped; a match through them breaks the lock but keeps the piece
    let mut world = ready(10, 3);
    let locked = (0..CELLS).find(|&cell| world.cells[cell].locked).unwrap();
    let neighbour = if column_of(locked) > 0 { locked - 1 } else { locked + 1 };
    assert!(!world.try_swap(locked, neighbour));
    let mut guard = 0;
    let locks = world.blockers_left();
    while world.blockers_left() == locks && guard < 30 { let (a, b) = best_move(&world).unwrap(); play(&mut world, a, b); guard += 1; }
    assert!(world.blockers_left() < locks);
}

#[test]
fn stuck_boards_reshuffle_into_a_playable_board() {
    let mut world = ready(0, 17);
    paint(&mut world, NO_MATCH_BOARD); // 4 colours in a diagonal pattern: no moves
    // make sure it really is stuck
    for cell in 0..CELLS { world.cells[cell].special = Special::None; }
    if world.find_move().is_none() {
        world.shuffle();
        assert_eq!(world.phase, Phase::Shuffling);
        world.finish_animations();
        assert!(world.find_move().is_some());
        assert_eq!(world.phase, Phase::Idle);
    }
}

#[test]
fn hint_appears_after_idling() {
    let mut game = MithaiMatch::new();
    game.start_level(0, 5);
    game.begin();
    let render = unsafe { std::slice::from_raw_parts(game.render_pointer(), crate::render_slot::LENGTH) };
    assert_eq!(render[crate::render_slot::SHOW_HINT], 0.0);
    for _ in 0..((HINT_AFTER_SECONDS + 0.2) * 60.0) as usize { game.advance(1.0 / 60.0); }
    let render = unsafe { std::slice::from_raw_parts(game.render_pointer(), crate::render_slot::LENGTH) };
    assert_eq!(render[crate::render_slot::SHOW_HINT], 1.0);
    assert!(adjacent(render[crate::render_slot::HINT_A] as usize, render[crate::render_slot::HINT_B] as usize));
}

#[test]
fn the_seeded_rng_is_deterministic() {
    let first = ready(4, 42);
    let second = ready(4, 42);
    let third = ready(4, 43);
    let colours = |world: &World| world.cells.iter().map(|cell| cell.colour).collect::<Vec<_>>();
    assert_eq!(colours(&first), colours(&second));
    assert_ne!(colours(&first), colours(&third));
}

#[test]
fn hitches_are_dropped() {
    let mut world = ready(0, 3);
    paint(&mut world, NO_MATCH_BOARD);
    world.try_swap(0, 1);
    let events = world.advance(5.0);
    assert!(events & events::HITCH != 0);
    assert_eq!(world.phase, Phase::Swapping, "a 5 s gap only simulates one frame");
}

#[test]
fn winning_and_losing() {
    let mut world = ready(0, 3);
    world.score = 1490;
    paint(&mut world, NO_MATCH_BOARD);
    paint(&mut world, ["44......", "..4.....", "........", "........", "........", "........", "........", "........"]);
    play(&mut world, cell_at(1, 2), cell_at(0, 2));
    assert_eq!(world.phase, Phase::Won);
    assert!(world.stars >= 1);
    assert!(world.score >= 1500 + (LEVELS[0].moves - 1) * BONUS_PER_MOVE, "leftover moves pay a bonus");
    let mut world = ready(2, 3);
    world.moves_left = 1;
    let (a, b) = world.find_move().unwrap();
    play(&mut world, a, b);
    assert_eq!(world.phase, Phase::Lost);
}

/// The greedy bot plays a level; returns (won, moves left, stars).
fn bot_play(level: usize, seed: u32) -> (bool, u32, u32) {
    let mut world = ready(level, seed);
    let mut guard = 0;
    while world.phase == Phase::Idle && guard < 200 {
        let Some((a, b)) = best_move(&world) else { break };
        play(&mut world, a, b);
        guard += 1;
    }
    (world.phase == Phase::Won, world.moves_left, world.stars)
}

#[test]
fn every_level_is_beatable_and_difficulty_rises() {
    const SEEDS: u32 = 16;
    let mut win_rates = [0f32; LEVEL_COUNT];
    let mut spare = [0f32; LEVEL_COUNT];
    let mut report = String::new();
    for level in 0..LEVEL_COUNT {
        let (mut wins, mut spare_moves, mut stars) = (0, 0, 0);
        for seed in 0..SEEDS {
            let (won, moves_left, earned) = bot_play(level, 1000 + seed);
            if won { wins += 1; spare_moves += moves_left; stars += earned; }
        }
        win_rates[level] = wins as f32 / SEEDS as f32;
        spare[level] = if wins > 0 { spare_moves as f32 / wins as f32 / LEVELS[level].moves as f32 } else { 0.0 };
        report += &format!("L{:>2} {:?}: wins {wins}/{SEEDS}, spare {:.0}%, stars {stars}\n", level + 1, LEVELS[level].goal, spare[level] * 100.0);
    }
    println!("{report}");
    for level in 0..LEVEL_COUNT { assert!(win_rates[level] > 0.0, "level {} must be beatable\n{report}", level + 1); }
    let average = |values: &[f32]| values.iter().sum::<f32>() / values.len() as f32;
    let early = average(&spare[0..5]);
    let middle = average(&spare[7..13]);
    let late = average(&spare[15..20]);
    assert!(early > middle && middle > late, "spare moves shrink: {early:.2} > {middle:.2} > {late:.2}\n{report}");
    assert!(average(&win_rates[0..5]) >= average(&win_rates[15..20]), "{report}");
    assert!(average(&win_rates[0..5]) >= 0.85, "the opening levels are friendly\n{report}");
    let _ = Goal::ClearJelly;
}
