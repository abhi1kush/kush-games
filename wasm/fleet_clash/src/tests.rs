use crate::rules::*;

fn fleet() -> Fleet {
    let mut fleet = Fleet::new();
    assert!(fleet.place(0, 0, false)); // 0..4
    assert!(fleet.place(1, 20, true)); // 20,30,40,50
    assert!(fleet.place(2, 77, false)); // 77,78,79
    assert!(fleet.place(3, 9, true)); // 9,19,29
    assert!(fleet.place(4, 95, false)); // 95,96
    fleet
}

#[test]
fn placement_stays_on_the_sea_and_never_overlaps() {
    let mut fleet = Fleet::new();
    assert!(!fleet.place(0, 6, false), "5 long from column 6 leaves the sea");
    assert!(!fleet.place(0, 60, true), "5 long down from row 6 leaves the sea");
    assert!(fleet.place(0, 5, false));
    assert!(!fleet.place(1, 7, true), "overlaps the carrier");
    assert!(fleet.place(1, 15, true), "touching is allowed");
    assert!(!fleet.can_place(2, 14, false, false), "overlaps");
    assert!(!fleet.can_place(2, 25, false, true), "touches when spaced");
    assert!(!fleet.is_complete());
    let full = self::fleet();
    assert!(full.is_complete());
    let copy = Fleet::from_code(&full.code()).unwrap();
    assert_eq!(copy.code(), full.code());
    let mut bad = full.code();
    bad[2] = 1; // destroyer on the carrier
    assert!(Fleet::from_code(&bad).is_none());
}

#[test]
fn shots_miss_hit_and_sink() {
    let mut fleet = fleet();
    assert_eq!(fleet.shoot(55), MISS);
    assert_eq!(fleet.shoot(55), 0, "same cell twice");
    assert_eq!(fleet.shoot(95), HIT);
    assert_eq!(fleet.shoot(96), SUNK + 4);
    for cell in [0, 1, 2, 3] { assert_eq!(fleet.shoot(cell), HIT); }
    assert_eq!(fleet.shoot(4), SUNK);
    assert!(!fleet.all_sunk());
    for cell in [20, 30, 40, 50, 77, 78, 79, 9, 19, 29] { fleet.shoot(cell); }
    assert!(fleet.all_sunk());
}

#[test]
fn random_fleets_are_valid_and_differ() {
    let mut rng = Rng::new(42);
    let mut codes = Vec::new();
    for _ in 0..200 {
        let mut fleet = Fleet::new();
        fleet.randomize(&mut rng);
        assert!(fleet.is_complete());
        assert!(Fleet::from_code(&fleet.code()).is_some());
        let covered = (0..CELLS as u8).filter(|&cell| fleet.ship_at(cell).is_some()).count();
        assert_eq!(covered, 17);
        codes.push(fleet.code());
    }
    codes.sort();
    codes.dedup();
    assert!(codes.len() > 190);
}

/// Shots for the computer to sink a random fleet.
fn shots_to_win(level: u8, seed: u32) -> u32 {
    let mut rng = Rng::new(seed);
    let mut target = Fleet::new();
    target.randomize(&mut rng);
    let mut ai = Ai::new(level, seed.wrapping_mul(31) + 7);
    let mut shots = 0;
    while !target.all_sunk() {
        let cell = ai.choose();
        let result = target.shoot(cell);
        assert_ne!(result, 0, "the computer never fires at the same cell twice");
        let (start, vertical) = if result >= SUNK { let ship = (result - SUNK) as usize; (target.start[ship], target.vertical[ship]) } else { (0, false) };
        ai.record(cell, result, start, vertical);
        shots += 1;
        assert!(shots <= 100);
    }
    shots
}

#[test]
fn harder_computers_need_fewer_shots() {
    let average = |level: u8| (1..=60u32).map(|seed| shots_to_win(level, seed * 977)).sum::<u32>() as f64 / 60.0;
    let (easy, medium, hard) = (average(0), average(1), average(2));
    println!("average shots: easy {easy:.1}, medium {medium:.1}, hard {hard:.1}");
    assert!(easy > medium && medium > hard, "easy {easy}, medium {medium}, hard {hard}");
    assert!(hard < 60.0);
}

#[test]
fn computer_finishes_a_line_after_two_hits() {
    let mut ai = Ai::new(1, 5);
    ai.record(44, HIT, 0, false);
    ai.record(45, HIT, 0, false);
    for _ in 0..10 { let cell = ai.choose(); assert!(cell == 43 || cell == 46, "{cell}"); }
}
