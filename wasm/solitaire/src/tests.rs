use super::*;

fn card(rank: u8, suit: u8) -> u8 { suit * 13 + rank }

/// A hand-built position for move tests: every column empty, stock and waste empty.
fn empty_game() -> Klondike {
    let mut game = Klondike::deal(1, 1);
    game.stock.clear();
    game.waste.clear();
    game.columns = Default::default();
    game.face_down = [0; 7];
    game
}

#[test]
fn deals_are_reproducible_and_complete() {
    let first = Klondike::deal(42, 1);
    let second = Klondike::deal(42, 1);
    assert_eq!(first.layout(), second.layout());
    assert_ne!(first.layout(), Klondike::deal(43, 1).layout());
    let mut all: Vec<u8> = first.stock.clone();
    for column in &first.columns { all.extend_from_slice(column); }
    all.sort();
    assert_eq!(all, (0..52).collect::<Vec<u8>>());
    assert_eq!(first.stock.len(), 24);
    assert_eq!(first.columns.iter().map(|column| column.len()).collect::<Vec<_>>(), vec![1, 2, 3, 4, 5, 6, 7]);
}

#[test]
fn draw_one_and_draw_three_then_recycle() {
    let mut game = Klondike::deal(7, 3);
    assert!(game.perform(Action::Draw));
    assert_eq!(game.waste.len(), 3);
    for _ in 0..7 { game.perform(Action::Draw); }
    assert!(game.stock.is_empty());
    assert_eq!(game.waste.len(), 24);
    assert!(game.perform(Action::Draw)); // turn the waste back over
    assert_eq!(game.stock.len(), 24);
    let mut single = Klondike::deal(7, 1);
    single.perform(Action::Draw);
    assert_eq!(single.waste.len(), 1);
}

#[test]
fn column_moves_need_alternating_colors_and_one_rank_lower() {
    let mut game = empty_game();
    game.columns[0] = vec![card(7, 0)]; // 8♠
    game.columns[1] = vec![card(6, 1)]; // 7♥
    game.columns[2] = vec![card(6, 3)]; // 7♣
    assert!(game.can_move(7, 1, 6), "7♥ on 8♠");
    assert!(!game.can_move(8, 1, 6), "7♣ on 8♠ (same color)");
    assert!(game.perform(Action::Move { from: 7, count: 1, to: 6 }));
    assert_eq!(game.columns[0], vec![card(7, 0), card(6, 1)]);
    // only kings go to empty columns
    assert!(!game.can_move(8, 1, 7));
    game.columns[3] = vec![card(12, 2)];
    assert!(game.can_move(9, 1, 7));
    // runs move together
    assert!(game.perform(Action::Move { from: 6, count: 2, to: 8 }) == false);
    game.columns[4] = vec![card(8, 1)]; // 9♥
    assert!(game.perform(Action::Move { from: 6, count: 2, to: 10 }));
    assert_eq!(game.columns[4].len(), 3);
}

#[test]
fn foundations_build_up_by_suit_from_the_ace() {
    let mut game = empty_game();
    game.columns[0] = vec![card(1, 2), card(0, 2)]; // 2♦ under A♦
    assert!(!game.can_move(6, 1, 2), "A♦ is not a spade");
    assert!(game.perform(Action::Move { from: 6, count: 1, to: 4 }));
    assert!(game.perform(Action::Move { from: 6, count: 1, to: 4 }));
    assert_eq!(game.foundations[2].len(), 2);
    assert_eq!(game.score, 20);
}

#[test]
fn turning_a_face_down_card_scores_and_undo_replays() {
    let mut game = Klondike::deal(11, 1);
    let before = game.layout();
    let mut played = false;
    'search: for from in 6..=12u8 {
        for to in 2..=12u8 {
            if game.can_move(from, 1, to) { assert!(game.perform(Action::Move { from, count: 1, to })); played = true; break 'search; }
        }
    }
    if !played { assert!(game.perform(Action::Draw)); }
    assert!(game.undo());
    assert_eq!(game.layout(), before);
    assert!(!game.undo());
    // saved actions replay to the same layout
    let mut long = Klondike::deal(5, 3);
    for _ in 0..40 { match long.hint() { Some(action) => { long.perform(action); } None => break } }
    let copy = Klondike::replay(5, 3, &long.encoded_actions()).unwrap();
    assert_eq!(copy.layout(), long.layout());
    assert_eq!(copy.score, long.score);
    assert!(Klondike::replay(5, 3, &[6, 1, 2, 6]).is_none());
}

#[test]
fn hints_are_legal_and_auto_finish_wins() {
    for seed in 0..30 {
        let mut game = Klondike::deal(seed, 1);
        for _ in 0..300 {
            let Some(action) = game.hint() else { break };
            assert!(game.perform(action), "seed {seed}: hint {:?} must be legal", action);
            if game.is_won() { break; }
        }
    }
    let mut game = empty_game();
    for suit in 0..4u8 { game.foundations[suit as usize] = (0..12).map(|rank| card(rank, suit)).collect(); }
    game.columns[0] = vec![card(12, 0)];
    game.columns[1] = vec![card(12, 1)];
    game.columns[2] = vec![card(12, 2)];
    game.columns[3] = vec![card(12, 3)];
    assert!(game.can_auto_finish());
    while let Some((from, to)) = game.foundation_candidate(false) { game.perform(Action::Move { from, count: 1, to }); }
    assert!(game.is_won());
}

#[test]
fn safe_auto_moves_keep_cards_that_may_still_be_needed() {
    let mut game = empty_game();
    game.foundations[0] = vec![card(0, 0)];
    game.foundations[1] = vec![card(0, 1), card(1, 1), card(2, 1)]; // hearts up to 3
    game.columns[0] = vec![card(3, 1)]; // 4♥: black 3s are not on the foundations yet → not safe
    assert_eq!(game.foundation_candidate(true), None);
    assert_eq!(game.foundation_candidate(false), Some((6, 3)));
}

#[test]
fn tap_to_move_prefers_foundations_and_does_not_shuffle_kings_between_empty_columns() {
    let mut game = empty_game();
    game.columns[0] = vec![card(0, 3)];
    assert_eq!(game.best_destination(6, 1), Some(5));
    game.columns[1] = vec![card(12, 0)];
    assert_eq!(game.best_destination(7, 1), None);
}
