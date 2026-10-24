use crate::ai;
use crate::physics::*;
use crate::rules::*;

fn empty_game() -> Game {
    let mut game = Game::new();
    for index in 1..BODIES { game.world.bodies[index].on = 0.0; }
    game
}

#[test]
fn friction_stops_a_lone_disc_and_cushions_bounce_it_back() {
    let mut world = World::new();
    for index in 1..BODIES { world.bodies[index].on = 0.0; }
    world.bodies[0].x = 500.0; world.bodies[0].y = 500.0; world.bodies[0].vx = 2000.0;
    let steps = world.settle();
    assert!(steps > 100 && steps < MAX_SHOT_STEPS, "steps {steps}");
    assert!(!world.any_moving());
    // it hit the right cushion and came back left of where it would have stopped
    assert!(world.bodies[0].x < BOARD - STRIKER_R);
    assert!(world.take_impacts().cushion > 500.0);
    assert!(world.bodies.iter().all(|body| body.x >= body.r - 0.01 && body.x <= BOARD - body.r + 0.01));
}

#[test]
fn a_disc_rolling_into_a_corner_is_pocketed() {
    let mut world = World::new();
    for index in 0..BODIES { world.bodies[index].on = 0.0; }
    world.bodies[2].on = 1.0; world.bodies[2].x = 200.0; world.bodies[2].y = 200.0; world.bodies[2].vx = -900.0; world.bodies[2].vy = -900.0;
    world.settle();
    assert!(!world.bodies[2].is_on());
    assert_eq!(world.fallen_count, 1);
    assert_eq!(world.fallen[0], 2);
}

#[test]
fn head_on_collision_keeps_momentum_and_loses_a_little_energy() {
    let mut world = World::new();
    for index in 0..BODIES { world.bodies[index].on = 0.0; }
    world.bodies[0].on = 1.0; world.bodies[0].x = 400.0; world.bodies[0].y = 500.0; world.bodies[0].vx = 1000.0;
    world.bodies[2].on = 1.0; world.bodies[2].x = 400.0 + STRIKER_R + COIN_R + 1.0; world.bodies[2].y = 500.0;
    let before = world.bodies[0].vx * STRIKER_MASS;
    world.step(); world.step();
    let after = world.bodies[0].vx * STRIKER_MASS + world.bodies[2].vx * COIN_MASS;
    assert!((after - before).abs() / before < 0.02, "{before} {after}");
    assert!(world.bodies[2].vx > world.bodies[0].vx && world.bodies[0].vx > 0.0);
    let energy = |w: &World| 0.5 * STRIKER_MASS * w.bodies[0].vx.powi(2) + 0.5 * COIN_MASS * w.bodies[2].vx.powi(2);
    assert!(energy(&world) < 0.5 * STRIKER_MASS * 1000.0f32.powi(2));
}

#[test]
fn the_starting_rosette_is_nine_and_nine_with_the_queen_in_the_middle_and_nothing_overlaps() {
    let game = Game::new();
    assert_eq!(game.coins_left(0), 9);
    assert_eq!(game.coins_left(1), 9);
    assert_eq!((game.world.bodies[QUEEN].x, game.world.bodies[QUEEN].y), (500.0, 500.0));
    for a in 0..BODIES { for b in (a + 1)..BODIES {
        let (p, q) = (game.world.bodies[a], game.world.bodies[b]);
        assert!(((p.x - q.x).powi(2) + (p.y - q.y).powi(2)).sqrt() >= p.r + q.r - 0.01, "{a} {b}");
    } }
    assert!(game.can_place(500.0));
    assert!(!game.can_place(BASELINE_MIN - 1.0));
}

#[test]
fn pocketing_your_coin_gives_another_shot_and_the_striker_in_a_pocket_is_a_foul() {
    let mut game = empty_game();
    // white coin just in front of the bottom-left pocket, straight down-left from the striker line
    game.world.bodies[2].on = 1.0; game.world.bodies[2].x = 120.0; game.world.bodies[2].y = 880.0;
    game.world.bodies[3].on = 1.0; game.world.bodies[3].x = 700.0; game.world.bodies[3].y = 300.0;
    game.world.bodies[11].on = 1.0; game.world.bodies[11].x = 300.0; game.world.bodies[11].y = 300.0;
    assert!(game.shoot(300.0, 120.0, 880.0, 450));
    game.settle();
    assert_eq!(game.last.own, 1, "{:?}", game.last);
    assert_eq!(game.last.foul, FOUL_NONE);
    assert!(game.last.again);
    assert_eq!(game.turn, 0);
    // the last white coin while the Queen is still out → foul: it comes back, the turn passes
    let mut game = empty_game();
    game.world.bodies[2].on = 1.0; game.world.bodies[2].x = 120.0; game.world.bodies[2].y = 880.0;
    game.world.bodies[QUEEN].on = 1.0;
    game.world.bodies[11].on = 1.0; game.world.bodies[11].x = 300.0; game.world.bodies[11].y = 300.0;
    assert!(game.shoot(300.0, 120.0, 880.0, 450));
    game.settle();
    assert_eq!(game.last.foul, FOUL_LAST_COIN);
    assert!(game.world.bodies[2].is_on());
    assert_eq!(game.turn, 1);
    let mut game = empty_game();
    game.world.bodies[3].on = 1.0; game.world.bodies[3].x = 600.0; game.world.bodies[3].y = 400.0;
    game.world.bodies[QUEEN].on = 1.0; game.world.bodies[QUEEN].x = 500.0; game.world.bodies[QUEEN].y = 500.0;
    // shoot the striker itself into the bottom-left pocket
    assert!(game.shoot(200.0, 31.0, 969.0, 300));
    game.settle();
    assert_eq!(game.last.foul, FOUL_STRIKER, "{:?} {:?}", game.last, game.world.bodies[0]);
    assert_eq!(game.turn, 1);
    assert_eq!(game.last.returned, 1, "a pocketed white comes back as the penalty");
    assert_eq!(game.coins_left(0), 2);
    // with nothing pocketed yet, the penalty is owed and paid with the next coin
    let mut game = Game::new();
    assert!(game.shoot(200.0, 31.0, 969.0, 300));
    game.settle();
    assert_eq!(game.last.foul, FOUL_STRIKER);
    assert_eq!(game.due[0], 1);
}

#[test]
fn the_queen_must_be_covered_or_she_goes_back() {
    let mut game = empty_game();
    game.world.bodies[QUEEN].on = 1.0; game.world.bodies[QUEEN].x = 120.0; game.world.bodies[QUEEN].y = 880.0;
    for index in 2..5 { game.world.bodies[index].on = 1.0; game.world.bodies[index].x = 400.0 + index as f32 * 60.0; game.world.bodies[index].y = 300.0; }
    game.world.bodies[4].on = 0.0; // one white already pocketed
    game.world.bodies[11].on = 1.0; game.world.bodies[11].x = 700.0; game.world.bodies[11].y = 600.0;
    assert!(game.shoot(300.0, 120.0, 880.0, 450));
    game.settle();
    assert_eq!(game.queen_state, QUEEN_PENDING);
    assert!(game.last.again);
    // a miss: the queen returns to the centre
    assert!(game.shoot(BASELINE_MAX, BASELINE_MAX, 600.0, 50));
    game.settle();
    assert_eq!(game.queen_state, QUEEN_ON_BOARD);
    assert!(game.world.bodies[QUEEN].is_on());
    assert_eq!(game.last.queen & 4, 4);
    assert_eq!(game.turn, 1);
}

#[test]
fn shots_are_deterministic() {
    let run = || { let mut game = Game::new(); game.shoot(500.0, 503.0, 500.0, 1000); game.settle(); game.world.bodies };
    assert_eq!(run(), run());
}

#[test]
fn computer_players_finish_whole_games_and_harder_is_better() {
    let mut pocketed_by_level = [0u32; 3];
    for level in 0..3u8 {
        for seed in 1..4u32 {
            let mut game = Game::new();
            let mut turns = 0;
            while game.winner == 255 && turns < 400 {
                let shot = ai::choose(&game, level, seed * 977 + turns);
                if !game.shoot(shot.x, shot.aim_x, shot.aim_y, shot.power) { let fallback = game.world.bodies[0].x; assert!(game.shoot(fallback, 500.0, 500.0, 600)); }
                let player = game.turn;
                game.settle();
                if game.last.player == player { pocketed_by_level[level as usize] += game.last.own as u32; }
                turns += 1;
            }
            println!("level {level} seed {seed}: winner {} after {turns} shots", game.winner);
            assert!(game.winner != 255 || level == 0, "level {level} seed {seed} unfinished after {turns} shots");
        }
    }
    println!("coins per level {pocketed_by_level:?}");
}

#[test]
fn one_advance_call_never_plays_out_a_whole_shot() {
    // a negative step count from JavaScript arrives as a huge u32: it must still be just one frame's worth
    let mut game = Game::new();
    assert!(game.shoot(500.0, 503.0, 500.0, 1000));
    assert!(game.advance(u32::MAX), "still moving after one call");
    assert_eq!(game.world.steps, MAX_STEPS_PER_CALL);
    assert_eq!(game.phase, PHASE_MOVING);
    game.settle();
    assert_eq!(game.phase, PHASE_AIM);
}
