use super::*;

fn game(columns: &[u8]) -> ConnectFour {
    let mut game = ConnectFour::new();
    assert!(game.load(columns), "legal game");
    game
}
const HARD_BUDGET: u32 = 400_000;

#[test]
fn stones_stack_and_full_columns_refuse() {
    let mut game = ConnectFour::new();
    for expected_row in 0..6 { assert_eq!(game.play(3), expected_row); }
    assert_eq!(game.play(3), -1);
    assert_eq!(game.play(7), -1);
}

#[test]
fn detects_wins_in_every_direction_and_reports_cells() {
    let vertical = game(&[0, 1, 0, 1, 0, 1, 0]);
    assert_eq!(vertical.winner(), 1);
    assert_eq!(vertical.winning_cells(), vec![0, 1, 2, 3]);
    let horizontal = game(&[0, 0, 1, 1, 2, 2, 3]);
    assert_eq!(horizontal.winner(), 1);
    assert_eq!(horizontal.winning_cells().len(), 4);
    // second player wins on a rising diagonal
    let diagonal = game(&[6, 0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    assert_eq!(diagonal.winner(), 2);
    // falling diagonal for the first player
    let falling = game(&[3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);
    assert_eq!(falling.winner(), 1);
    // no moves after a win
    let mut finished = vertical;
    assert_eq!(finished.play(4), -1);
}

#[test]
fn draw_when_the_board_fills() {
    // a known drawn fill order
    let columns: Vec<u8> = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6].to_vec();
    let game = game(&columns);
    assert_eq!(game.winner(), 3);
}

#[test]
fn undo_and_reload_replay_the_same_board() {
    let mut game = game(&[3, 3, 4, 2]);
    assert!(game.undo());
    assert_eq!(game.history(), vec![3, 3, 4]);
    let copy = self::game(&game.history());
    assert_eq!(copy.cells(), game.cells());
    assert!(!ConnectFour::new().load(&[0, 0, 0, 0, 0, 0, 0]));
}

#[test]
fn every_level_takes_an_immediate_win_and_hard_and_medium_block() {
    // first player (to move) has three in the bottom row: 0,1,2 → must play 3
    for level in 0..3 {
        let wins = (0..20).filter(|&seed| game(&[0, 6, 1, 6, 2, 5]).best_move(level, seed, HARD_BUDGET) == 3).count();
        if level == 0 { assert!(wins >= 12, "easy usually wins ({wins}/20)"); } else { assert_eq!(wins, 20); }
    }
    // second player to move must block column 3
    for level in 1..3 { assert_eq!(game(&[0, 6, 1, 6, 2]).best_move(level, 7, HARD_BUDGET), 3); }
}

#[test]
fn hard_finds_a_forced_win_by_double_threat() {
    // first player: stones at 2 and 3 in the bottom row with 1 and 4 open on both sides and 0/5 too → playing 1 or 4 makes two threats
    let mut game = game(&[2, 2, 3, 3]);
    let column = game.best_move(2, 1, HARD_BUDGET);
    assert!(column == 1 || column == 4, "picked {column}");
    // and it actually wins against any defence
    game.play(column as u32);
    for defence in 0..7u32 {
        let mut line = self::game(&game.history());
        if line.play(defence) < 0 { continue; }
        let finisher = line.best_move(2, 1, HARD_BUDGET);
        line.play(finisher as u32);
        assert_eq!(line.winner(), 1, "after defence {defence}");
    }
}

#[test]
fn medium_and_hard_never_hand_over_an_immediate_win_when_a_safe_move_exists() {
    let mut random = ai::Random::new(99);
    let mut checked = 0;
    for _ in 0..60 {
        let mut position = ConnectFour::new();
        let length = 4 + random.below(20);
        for _ in 0..length {
            let column = random.below(7);
            if position.play(column) < 0 || position.winner() != 0 { break; }
        }
        if position.winner() != 0 { continue; }
        let replies_win = |game: &ConnectFour, column: u32| {
            let mut after = self::game(&game.history());
            if after.play(column) < 0 { return true; }
            if after.winner() != 0 { return false; }
            (0..7u32).any(|reply| { let mut line = self::game(&after.history()); line.play(reply) >= 0 && line.winner() != 0 && line.winner() != 3 })
        };
        if !(0..7u32).any(|column| !replies_win(&position, column)) { continue; }
        for level in 1..3 {
            let column = position.best_move(level, 5, HARD_BUDGET);
            assert!(!replies_win(&position, column as u32), "level {level} picked {column} in {:?}", position.history());
        }
        checked += 1;
    }
    assert!(checked > 20);
}

#[test]
fn hard_stays_within_its_node_budget() {
    let mut game = ConnectFour::new();
    game.best_move(2, 1, HARD_BUDGET);
    assert!(game.last_nodes() <= HARD_BUDGET + 1);
}
