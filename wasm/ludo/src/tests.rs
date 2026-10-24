use crate::rules::*;

fn two_player() -> Game {
    let mut game = Game::new(7);
    assert!(game.start(0b0101, 0)); // Red and Yellow
    game
}

fn roll(game: &mut Game, value: u8) -> u8 { game.forced_roll = value; game.roll() }

#[test]
fn needs_a_six_to_leave_the_yard_and_six_gives_another_roll() {
    let mut game = two_player();
    assert_eq!(roll(&mut game, 4), 4);
    assert_eq!(game.phase, Phase::NoMove);
    assert_eq!(game.no_move_reason, NoMoveReason::NothingLegal);
    assert!(game.pass_turn());
    assert_eq!(game.current, 2);
    roll(&mut game, 6);
    assert_eq!(game.legal_mask(), 0b1111);
    assert!(game.move_token(1));
    assert_eq!(game.progress[2][1], 0);
    assert_eq!(game.current, 2, "a six rolls again");
    roll(&mut game, 3);
    assert!(game.move_token(1));
    assert_eq!(game.progress[2][1], 3);
    assert_eq!(game.current, 0);
}

#[test]
fn three_sixes_forfeit_the_turn() {
    let mut game = two_player();
    game.progress[0][0] = 10;
    for _ in 0..2 { roll(&mut game, 6); assert!(game.move_token(0)); assert_eq!(game.current, 0); }
    roll(&mut game, 6);
    assert_eq!(game.phase, Phase::NoMove);
    assert_eq!(game.no_move_reason, NoMoveReason::ThreeSixes);
    assert!(game.pass_turn());
    assert_eq!(game.current, 2);
    assert_eq!(game.progress[0][0], 22);
}

#[test]
fn capture_sends_home_and_gives_another_roll_but_not_on_safe_squares() {
    let mut game = two_player();
    // Yellow token on absolute square 5 = Yellow progress (5 - 26 + 52) % 52 = 31
    game.progress[2][0] = 31;
    game.progress[0][0] = 2;
    roll(&mut game, 3);
    assert!(game.move_token(0));
    assert_eq!(game.progress[2][0], YARD);
    assert_eq!(game.last_move.capture_count, 1);
    assert_eq!(game.current, 0, "capture rolls again");
    // star square 8 is safe: Yellow progress 34 sits on absolute 8
    game.progress[2][1] = 34;
    roll(&mut game, 3);
    assert!(game.move_token(0));
    assert_eq!(absolute_square(0, game.progress[0][0]), 8);
    assert_eq!(game.progress[2][1], 34, "no capture on a star");
    assert_eq!(game.current, 2);
}

#[test]
fn exact_roll_to_reach_home_and_home_gives_another_roll() {
    let mut game = two_player();
    game.progress[0] = [53, YARD, YARD, YARD];
    roll(&mut game, 5);
    assert_eq!(game.phase, Phase::NoMove, "53 + 5 overshoots home (56)");
    game.pass_turn();
    roll(&mut game, 2); // yellow, nothing out
    game.pass_turn();
    roll(&mut game, 3);
    assert!(game.move_token(0));
    assert_eq!(game.progress[0][0], HOME);
    assert_eq!(game.current, 0, "reaching home rolls again");
}

#[test]
fn finish_order_and_game_end() {
    let mut game = Game::new(3);
    game.start(0b0111, 0);
    game.progress[0] = [HOME, HOME, HOME, 55];
    roll(&mut game, 1);
    assert!(game.move_token(3));
    assert_eq!(game.places[0], 1);
    assert_eq!(game.current, 1, "a finished seat doesn't roll again");
    assert_eq!(game.phase, Phase::AwaitRoll);
    game.progress[1] = [HOME, HOME, HOME, 50];
    roll(&mut game, 6);
    assert!(game.move_token(3));
    assert_eq!(game.places[1], 2);
    assert_eq!(game.places[2], 3, "the last seat playing gets the last place");
    assert_eq!(game.phase, Phase::Over);
}

#[test]
fn leaving_and_removal_drop_tokens_and_the_last_seat_wins() {
    let mut game = Game::new(5);
    game.start(0b1111, 0);
    game.progress[1][0] = 12;
    assert!(game.remove_seat(1));
    assert_eq!(game.progress[1], [REMOVED; 4]);
    assert!(!game.remove_seat(1));
    assert!(game.remove_seat(0), "current seat leaves");
    assert_eq!(game.current, 2);
    assert_eq!(game.phase, Phase::AwaitRoll);
    assert!(game.remove_seat(3));
    assert_eq!(game.phase, Phase::Over);
    assert_eq!(game.places[2], 1, "the only one left wins");
}

#[test]
fn timeouts_auto_play_with_a_strike_and_the_third_forfeits() {
    let mut game = two_player();
    game.forced_roll = 6;
    assert_eq!(game.timeout(), TimeoutResult::AutoPlayed);
    assert_eq!(game.strikes[0], 1);
    assert_eq!(game.progress[0].iter().filter(|&&progress| progress == 0).count(), 1, "auto-rolled a six and moved out");
    assert_eq!(game.current, 0);
    // missing the roll and then the move in the same turn is one strike
    roll(&mut game, 2);
    assert_eq!(game.phase, Phase::AwaitMove);
    game.struck_this_turn = false;
    assert_eq!(game.timeout(), TimeoutResult::AutoPlayed);
    assert_eq!(game.strikes[0], 2);
    assert_eq!(game.current, 2);
    roll(&mut game, 1);
    game.pass_turn();
    assert_eq!(game.timeout(), TimeoutResult::Forfeited);
    assert_eq!(game.active, 0b0100);
    assert_eq!(game.phase, Phase::Over);
    assert_eq!(game.places[2], 1);
}

#[test]
fn strikes_are_once_per_turn() {
    let mut game = two_player();
    game.progress[0][0] = 5;
    roll(&mut game, 2);
    game.timeout();
    assert_eq!(game.strikes[0], 1);
    assert_eq!(game.timeout(), TimeoutResult::AutoPlayed, "Yellow's first timeout");
    assert_eq!(game.strikes[2], 1);
}

#[test]
fn auto_move_prefers_capture_then_home_then_leaving_the_yard() {
    let mut game = two_player();
    game.progress[0] = [2, 52, YARD, 30];
    game.progress[2][0] = 31; // absolute 5: Red token 0 can capture with a 3
    roll(&mut game, 3);
    assert_eq!(game.choose_move(), 0);
    let mut game = two_player();
    game.progress[0] = [10, 50, YARD, YARD];
    roll(&mut game, 6);
    assert_eq!(game.choose_move(), 1, "50 + 6 = home");
    let mut game = two_player();
    game.progress[0] = [10, YARD, YARD, YARD];
    roll(&mut game, 6);
    assert_eq!(game.choose_move(), 1, "leave the yard with a six");
}

#[test]
fn snapshot_round_trips() {
    let mut game = two_player();
    game.progress[0][0] = 2;
    game.progress[2][0] = 31;
    roll(&mut game, 3);
    game.move_token(0);
    let bytes = game.snapshot();
    let mut copy = Game::new(99);
    assert!(copy.restore(&bytes));
    assert_eq!(copy.snapshot(), bytes);
    assert_eq!(copy.last_move, game.last_move);
    let mut bad = bytes;
    bad[20] = 99;
    assert!(!copy.restore(&bad));
    assert!(!copy.restore(&bytes[..10]));
}

#[test]
fn bots_finish_every_game_with_a_full_finish_order() {
    for seed in 1..60u32 {
        let mut game = Game::new(seed * 2654435761);
        let seats = [0b1111u8, 0b0101, 0b0111, 0b1010][seed as usize % 4];
        game.start(seats, (seed % 4) as u8);
        let mut steps = 0;
        while game.phase != Phase::Over {
            steps += 1;
            assert!(steps < 20_000, "seed {seed} never ended");
            match game.phase {
                Phase::AwaitRoll => { game.roll(); }
                Phase::AwaitMove => { let token = game.choose_move(); assert!(game.move_token(token)); }
                Phase::NoMove => { game.pass_turn(); }
                _ => unreachable!(),
            }
        }
        let mut places: Vec<u8> = (0..4).filter(|seat| seats & (1 << seat) != 0).map(|seat| game.places[seat]).collect();
        places.sort();
        assert_eq!(places, (1..=seats.count_ones() as u8).collect::<Vec<_>>(), "seed {seed}");
    }
}

#[test]
fn smarter_bot_beats_random_play() {
    let mut smart_wins = 0;
    for seed in 1..200u32 {
        let mut game = Game::new(seed * 7919);
        game.start(0b0101, (seed % 2 * 2) as u8);
        let mut pick = seed;
        while game.phase != Phase::Over {
            match game.phase {
                Phase::AwaitRoll => { game.roll(); }
                Phase::AwaitMove => {
                    let token = if game.current == 0 { game.choose_move() } else {
                        let mask = game.legal_mask();
                        pick = pick.wrapping_mul(1103515245).wrapping_add(12345);
                        let options: Vec<u8> = (0..4).filter(|token| mask & (1 << token) != 0).collect();
                        options[(pick >> 16) as usize % options.len()]
                    };
                    game.move_token(token);
                }
                _ => { game.pass_turn(); }
            }
        }
        if game.places[0] == 1 { smart_wins += 1; }
    }
    assert!(smart_wins > 120, "smart bot won {smart_wins}/199");
}
