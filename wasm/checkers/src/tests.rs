use super::*;
use rules::{column_of, row_of};

const fn bit(square: usize) -> u32 { 1 << square }
/// Square number from (row, column) on the 8×8 board.
fn square(row: i32, column: i32) -> usize {
    let found = (0..32).find(|&s| row_of(s) == row && column_of(s) == column);
    found.expect("dark square")
}
fn moves_of(position: &Position) -> Vec<(u8, u8, u32)> { position.legal_moves().iter().map(|m| (m.from, m.to(), m.captured)).collect() }

#[test]
fn opening_has_seven_moves_and_alternates_sides() {
    let mut game = Checkers::new();
    assert_eq!(game.move_count(), 7);
    assert!(game.apply(0));
    assert_eq!(game.side_to_move(), LIGHT);
    assert_eq!(game.move_count(), 7);
    assert_eq!(game.cells().iter().filter(|&&cell| cell == 1).count(), 12);
}

#[test]
fn captures_are_compulsory() {
    // dark man at (5,2), light man at (4,3) with (3,4) empty; another dark man elsewhere could step quietly
    let dark = bit(square(5, 2)) | bit(square(6, 7));
    let light = bit(square(4, 3)) | bit(square(0, 1));
    let position = Position { dark, light, kings: 0, side: DARK, quiet_plies: 0 };
    let moves = moves_of(&position);
    assert_eq!(moves, vec![(square(5, 2) as u8, square(3, 4) as u8, bit(square(4, 3)))]);
}

#[test]
fn multi_jumps_must_continue_and_take_every_piece() {
    // dark at (7,0); light at (6,1) and (4,3): double jump to (3,4)
    let dark = bit(square(7, 0));
    let light = bit(square(6, 1)) | bit(square(4, 3)) | bit(square(0, 7));
    let position = Position { dark, light, kings: 0, side: DARK, quiet_plies: 0 };
    let moves = position.legal_moves();
    assert_eq!(moves.len(), 1);
    assert_eq!(moves[0].path_length, 2);
    assert_eq!(moves[0].to() as usize, square(3, 4));
    let after = position.apply(&moves[0]);
    assert_eq!(after.light, bit(square(0, 7)));
}

#[test]
fn men_crown_on_the_far_row_and_crowning_ends_the_jump() {
    let dark = bit(square(1, 2));
    let light = bit(square(7, 0));
    let position = Position { dark, light, kings: 0, side: DARK, quiet_plies: 0 };
    let step = position.legal_moves().into_iter().find(|m| m.to() as usize == square(0, 1)).unwrap();
    let after = position.apply(&step);
    assert!(after.kings & bit(square(0, 1)) != 0);
    // jump that lands on the crowning row stops there even if a king could continue
    let dark = bit(square(2, 3));
    let light = bit(square(1, 2)) | bit(square(1, 0)) | bit(square(7, 6));
    let position = Position { dark, light, kings: 0, side: DARK, quiet_plies: 0 };
    let moves = position.legal_moves();
    assert_eq!(moves.len(), 1);
    assert_eq!(moves[0].path_length, 1, "crowning ends the move");
    assert!(position.apply(&moves[0]).kings & bit(square(0, 1)) != 0);
}

#[test]
fn kings_move_and_capture_backwards() {
    let dark = bit(square(3, 2));
    let light = bit(square(4, 3)) | bit(square(0, 7));
    let position = Position { dark, light, kings: dark, side: DARK, quiet_plies: 0 };
    let moves = moves_of(&position);
    assert_eq!(moves, vec![(square(3, 2) as u8, square(5, 4) as u8, bit(square(4, 3)))]);
    let man = Position { kings: 0, ..position };
    assert!(moves_of(&man).iter().all(|&(_, _, captured)| captured == 0), "a man can't capture backwards");
}

#[test]
fn no_moves_loses_and_quiet_kings_draw() {
    let mut game = Checkers::new();
    game.set_position(bit(square(7, 0)), bit(square(6, 1)) | bit(square(5, 2)), 0, DARK);
    assert_eq!(game.winner(), 2, "dark is blocked");
    let mut quiet = Position { dark: bit(square(0, 1)), light: bit(square(7, 6)), kings: bit(square(0, 1)) | bit(square(7, 6)), side: DARK, quiet_plies: 79 };
    let step = quiet.legal_moves()[0];
    quiet = quiet.apply(&step);
    assert_eq!(quiet.quiet_plies, 80);
}

#[test]
fn undo_and_load_replay_the_game() {
    let mut game = Checkers::new();
    for _ in 0..6 { let index = game.best_move(1, 3, 0); assert!(game.apply(index as u32)); }
    let cells = game.cells();
    let history = game.history();
    assert!(game.undo(2));
    assert_eq!(game.history().len(), 4);
    let mut copy = Checkers::new();
    assert!(copy.load(&history));
    assert_eq!(copy.cells(), cells);
    assert!(!copy.load(&[200]));
}

#[test]
fn hard_takes_a_winning_double_jump_and_avoids_hanging_pieces() {
    // dark to move can double-jump both light men and win
    let mut game = Checkers::new();
    game.set_position(bit(square(7, 0)) | bit(square(7, 6)), bit(square(6, 1)) | bit(square(4, 3)), 0, DARK);
    let index = game.best_move(2, 1, 300_000);
    assert!(game.apply(index as u32));
    assert_eq!(game.winner(), 1);
    // a quiet position: hard must not step into a free capture
    let mut position = Checkers::new();
    position.set_position(bit(square(5, 2)) | bit(square(6, 7)), bit(square(2, 3)) | bit(square(0, 5)), 0, DARK);
    let index = position.best_move(2, 1, 300_000) as u32;
    position.apply(index);
    let replies = position.legal_moves();
    assert!(position.capturing_pieces() == 0, "hard hung a piece: replies {:?}", replies);
}

#[test]
fn hard_beats_easy_most_of_the_time() {
    let mut hard_wins = 0;
    for game_number in 0..4u32 {
        let mut game = Checkers::new();
        for ply in 0..200u32 {
            if game.winner() != 0 { break; }
            let level = if (ply % 2 == 0) == (game_number % 2 == 0) { 2 } else { 0 };
            let index = game.best_move(level, game_number * 1000 + ply, 60_000);
            game.apply(index as u32);
        }
        let hard_side_won = if game_number % 2 == 0 { 1 } else { 2 };
        if game.winner() == hard_side_won { hard_wins += 1; }
    }
    assert!(hard_wins >= 3, "hard won {hard_wins}/4");
}
