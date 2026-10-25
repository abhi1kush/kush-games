use crate::levels::*;
use crate::rules::*;
use crate::solver;
use crate::PaaniPour;

fn board(tubes: &[&[u8]]) -> Board {
    let mut board = Board::new(tubes.len() as u8);
    for (index, tube) in tubes.iter().enumerate() { for (depth, &colour) in tube.iter().enumerate() { board.layers[index * CAPACITY + depth] = colour; } }
    board
}

#[test]
fn pours_follow_the_top_layer_rules() {
    let mut b = board(&[&[1, 2, 2], &[3, 2], &[1], &[], &[3, 3, 3, 1]]);
    assert_eq!(b.top_run(0), 2);
    assert_eq!(b.pour_amount(0, 1), 2, "two reds fit onto a red top");
    assert_eq!(b.pour_amount(0, 2), 0, "different top colour");
    assert_eq!(b.pour_amount(0, 4), 0, "full tube");
    assert_eq!(b.pour_amount(0, 0), 0);
    assert_eq!(b.pour_amount(3, 0), 0, "empty source");
    assert_eq!(b.pour(0, 3), 2, "the whole run goes into an empty tube");
    assert_eq!(b.tube(3), &[2, 2, 0, 0]);
    let mut partial = board(&[&[2, 2, 2], &[1, 1, 2]]);
    assert_eq!(partial.pour(0, 1), 1, "only as much as fits");
    assert_eq!(partial.tube(1), &[1, 1, 2, 2]);
    assert_eq!(partial.tube(0), &[2, 2, 0, 0]);
}

#[test]
fn solved_and_stuck_are_detected() {
    let done = board(&[&[1, 1, 1, 1], &[], &[2, 2, 2, 2]]);
    assert!(done.is_solved());
    let stuck = board(&[&[1, 2, 1, 2], &[2, 1, 2, 1]]);
    assert!(!stuck.is_solved());
    assert!(!stuck.has_useful_pour());
    assert!(board(&[&[1, 1, 1, 1], &[]]).is_pointless(0, 1));
}

#[test]
fn every_level_is_solvable_harder_and_starts_unsorted() {
    let mut last_colours = 0;
    for level in 0..LEVEL_COUNT {
        let built = build(level);
        let colours = colours_for(level);
        assert!(colours >= last_colours);
        last_colours = colours;
        assert_eq!(built.board.tube_count, colours + 2);
        for colour in 1..=colours { assert_eq!(built.board.layers.iter().filter(|&&layer| layer == colour).count(), CAPACITY, "level {} colour {}", level + 1, colour); }
        assert!(!built.board.is_solved());
        assert!((0..built.board.tube_count as usize).all(|tube| !built.board.is_done(tube)));
        let path = solver::solve(&built.board).expect("solvable");
        assert_eq!(path.len() as u32, built.par);
        let mut replay = built.board;
        for (from, to) in path { assert!(replay.pour(from as usize, to as usize) > 0); }
        assert!(replay.is_solved(), "level {}", level + 1);
        assert_eq!(build(level).board, built.board, "levels are the same every time");
    }
    assert_eq!(colours_for(LEVEL_COUNT - 1), 12);
}

#[test]
fn undo_reset_hints_and_stars() {
    let mut game = PaaniPour::new(0);
    let start = game.board;
    let hint = game.peek_hint();
    assert!(hint >= 0);
    let (from, to) = ((hint / 16) as u8, (hint % 16) as u8);
    let amount = game.pour(from, to);
    assert!(amount > 0);
    assert_eq!(game.pours(), 1);
    assert_eq!(game.undo(), from as i32 * 16 + to as i32 + amount as i32 * 256);
    assert_eq!(game.board, start);
    assert_eq!(game.undo(), -1);
    game.pour(from, to);
    game.reset();
    assert_eq!(game.board, start);
    assert_eq!(game.pours(), 0);
    assert!(game.debug_solve());
    assert!(game.is_solved());
    assert_eq!(game.stars(), 3, "the solver's own line is par");
    assert_eq!(game.pour(0, 1), 0, "no pours after the win");
    let mut hinted = PaaniPour::new(1);
    assert!(hinted.hint() >= 0);
    assert_eq!(hinted.hints_left(), 2);
    hinted.debug_solve();
    assert_eq!(hinted.stars(), 2, "a hint caps the stars at two");
    hinted.hint(); hinted.hint();
    assert_eq!(hinted.hint(), -1);
}

#[test]
fn following_hints_always_finishes_a_level() {
    for level in [0u8, 7, 14, 19] {
        let mut game = PaaniPour::new(level);
        for _ in 0..400 {
            if game.is_solved() { break; }
            let next = game.peek_hint();
            assert!(next >= 0, "level {}", level + 1);
            assert!(game.pour((next / 16) as u8, (next % 16) as u8) > 0);
        }
        assert!(game.is_solved(), "level {}", level + 1);
    }
}
