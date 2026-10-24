use crate::rules::*;

fn game_with(mask: u8, board: u8) -> Game {
    let mut game = Game::new(12345);
    assert!(game.set_board(board));
    assert!(game.start(mask, 0));
    game
}
fn roll(game: &mut Game, value: u8) -> u8 { game.forced_roll = value; let dice = game.roll(); game.pass_turn(); dice }

#[test]
fn every_board_is_well_formed() {
    for (index, board) in BOARDS.iter().enumerate() {
        let starts: Vec<u8> = board.iter().map(|&(from, _)| from).collect();
        let ladders = board.iter().filter(|&&(from, to)| to > from).count();
        let snakes = board.len() - ladders;
        assert!(ladders >= 6 && snakes >= 6, "board {index}: {ladders} ladders, {snakes} snakes");
        for &(from, to) in board.iter() {
            assert!((2..=99).contains(&from) && (1..=100).contains(&to) && from != to, "board {index}: {from}->{to}");
            assert!(!starts.contains(&to), "board {index}: {from}->{to} lands on another jump");
            assert_eq!(starts.iter().filter(|&&start| start == from).count(), 1, "board {index}: two jumps start at {from}");
            // a jump never starts and ends on the same row (it must visibly climb or fall)
            assert_ne!((from - 1) / 10, (to - 1) / 10, "board {index}: {from}->{to} stays on one row");
        }
    }
    assert_eq!(BOARD_COUNT, 5);
}

#[test]
fn ladders_climb_snakes_slide_and_the_default_board_is_zero() {
    let game = Game::new(1);
    assert_eq!(game.board, 0);
    assert_eq!(jump(0, 4), 14);
    assert_eq!(jump(0, 99), 78);
    assert_eq!(jump(0, 5), 5);
    let mut game = game_with(0b0101, 0);
    roll(&mut game, 4);
    assert_eq!(game.positions[0], 14);
    assert_eq!(game.last_move.landed, 4);
    assert_eq!(game.last_move.to, 14);
    assert_eq!(game.current, 2);
    game.positions[2] = 12;
    roll(&mut game, 5);
    assert_eq!(game.positions[2], 7, "17 is a snake head on Mango Grove");
}

#[test]
fn exact_roll_to_finish_and_six_rolls_again() {
    let mut game = game_with(0b0011, 1);
    game.positions[0] = 96;
    roll(&mut game, 5);
    assert_eq!(game.positions[0], 96, "overshoot stays");
    assert_eq!(game.current, 1);
    roll(&mut game, 6);
    assert_eq!(game.current, 1, "a six rolls again");
    roll(&mut game, 6);
    let before = game.positions[1];
    game.forced_roll = 6;
    game.roll();
    assert_eq!(game.note, RollNote::ThreeSixes);
    assert_eq!(game.positions[1], before, "the third six doesn't move");
    game.pass_turn();
    assert_eq!(game.current, 0);
    roll(&mut game, 4);
    assert_eq!(game.positions[0], 100);
    assert_eq!(game.places[0], 1);
    assert_eq!(game.phase, Phase::Over, "with two players the other one is 2nd");
    assert_eq!(game.places[1], 2);
}

#[test]
fn finish_order_continues_until_one_is_left() {
    let mut game = game_with(0b0111, 0);
    game.positions[0] = 97;
    roll(&mut game, 3);
    assert_eq!(game.places[0], 1);
    assert_eq!(game.current, 1);
    assert_eq!(game.phase, Phase::AwaitRoll);
    game.positions[1] = 98;
    roll(&mut game, 2);
    assert_eq!(game.places, [1, 2, 3, 0]);
    assert_eq!(game.phase, Phase::Over);
}

#[test]
fn leaving_and_removal() {
    let mut game = game_with(0b1011, 0);
    assert!(game.remove_seat(1));
    assert_eq!(game.positions[1], REMOVED);
    assert_eq!(game.phase, Phase::AwaitRoll);
    assert!(game.remove_seat(0));
    assert_eq!(game.phase, Phase::Over);
    assert_eq!(game.places[3], 1, "the last player left wins");
}

#[test]
fn missed_turns_strike_once_per_turn_and_forfeit_on_the_third() {
    let mut game = game_with(0b0101, 0);
    assert_eq!(game.timeout(), TimeoutResult::AutoPlayed);
    assert_eq!(game.strikes[0], 1);
    assert_eq!(game.phase, Phase::Resolving);
    assert_eq!(game.timeout(), TimeoutResult::Nothing, "nothing to do while resolving");
    if game.dice == 6 { game.pass_turn(); assert_eq!(game.timeout(), TimeoutResult::AutoPlayed); assert_eq!(game.strikes[0], 1, "same turn: no second strike"); }
    game.pass_turn();
    while game.current != 0 { game.forced_roll = 1; game.roll(); game.pass_turn(); }
    game.forced_roll = 1;
    game.timeout();
    game.pass_turn();
    game.forced_roll = 1; game.roll(); game.pass_turn();
    assert_eq!(game.strikes[0], 2);
    assert_eq!(game.timeout(), TimeoutResult::Forfeited);
    assert_eq!(game.phase, Phase::Over);
    assert_eq!(game.places[2], 1);
}

#[test]
fn snapshot_round_trip_and_rejects_bad_data() {
    let mut game = game_with(0b1111, 3);
    for value in [3, 6, 2, 5, 1, 4, 6, 6] { roll(&mut game, value); }
    game.strikes[1] = 2;
    let bytes = game.snapshot();
    let mut copy = Game::new(9);
    assert!(copy.restore(&bytes));
    assert_eq!(copy.snapshot(), bytes);
    let mut bad = bytes;
    bad[11] = 9;
    assert!(!copy.restore(&bad));
    bad = bytes;
    bad[20] = 150;
    assert!(!copy.restore(&bad));
}

#[test]
fn every_board_finishes_with_random_dice() {
    for board in 0..BOARD_COUNT {
        for seed in 1..40u32 {
            let mut game = Game::new(seed * 7919);
            game.set_board(board);
            game.start(0b1111, (seed % 4) as u8);
            let mut steps = 0;
            while game.phase != Phase::Over && steps < 20_000 {
                if game.phase == Phase::AwaitRoll { game.roll(); } else { game.pass_turn(); }
                steps += 1;
            }
            assert_eq!(game.phase, Phase::Over, "board {board} seed {seed}");
            let mut places = game.places;
            places.sort();
            assert_eq!(places, [1, 2, 3, 4]);
        }
    }
}
