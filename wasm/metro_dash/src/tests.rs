use crate::autopilot::Action;
use crate::world::*;

/// A started run on an empty track (nothing generated) so a test can build exactly what it needs.
fn empty_run() -> World {
    let mut world = World::new(7);
    world.start();
    world.clear_track();
    world
}
fn run_for(world: &mut World, seconds: f32) -> u32 {
    let mut happened = 0;
    for _ in 0..(seconds / STEP_SECONDS).round() as u32 { happened |= world.step(); }
    happened
}
fn run_until(world: &mut World, seconds: f32, mut done: impl FnMut(&World) -> bool) -> Option<f32> {
    for step in 0..(seconds / STEP_SECONDS).round() as u32 {
        world.step();
        if done(world) { return Some((step + 1) as f32 * STEP_SECONDS); }
    }
    None
}
fn put(world: &mut World, kind: Kind, lane: usize, ahead: f64, y: f32, length: f32) {
    let velocity = if kind == Kind::MovingTrain { 8.0 } else { 0.0 };
    assert!(world.spawn(kind, lane, world.player_z + ahead, y, length, velocity, 0));
}

// ---------- lanes ----------
#[test]
fn a_lane_switch_is_a_quick_eased_snap() {
    let mut world = empty_run();
    assert_eq!(world.lane, 1);
    world.press_lane(1);
    assert_eq!(world.lane, 2);
    let took = run_until(&mut world, 1.0, |world| (world.x - LANE_WIDTH).abs() < 1e-4).unwrap();
    assert!((0.12..=0.15).contains(&took), "switch took {took}s");
    // eased: slower at the ends than in the middle
    let mut world = empty_run();
    world.press_lane(-1);
    let mut positions = vec![];
    for _ in 0..16 { world.step(); positions.push(world.x); }
    let first = (positions[1] - positions[0]).abs();
    let middle = (positions[8] - positions[7]).abs();
    assert!(middle > first * 2.0);
}

#[test]
fn lanes_stop_at_the_edges_and_double_presses_cross_two_lanes() {
    let mut world = empty_run();
    world.press_lane(-1);
    world.step();
    world.press_lane(-1);
    let happened = world.advance(0.0);
    assert_eq!(world.lane, 0);
    assert!(happened & events::LANE_BUMP != 0);
    run_for(&mut world, 0.3);
    assert!((world.x + LANE_WIDTH).abs() < 1e-4);
    // two quick presses: straight across, about as fast as one switch
    world.press_lane(1);
    run_for(&mut world, 0.05);
    world.press_lane(1);
    let took = run_until(&mut world, 1.0, |world| (world.x - LANE_WIDTH).abs() < 1e-4).unwrap();
    assert_eq!(world.lane, 2);
    assert!(took < 0.16, "second switch finished {took}s after the second press");
}

#[test]
fn lane_switches_work_in_the_air() {
    let mut world = empty_run();
    world.press_jump();
    run_for(&mut world, 0.1);
    assert!(!world.grounded);
    world.press_lane(1);
    run_for(&mut world, 0.15);
    assert!(!world.grounded);
    assert!((world.x - LANE_WIDTH).abs() < 1e-4);
}

// ---------- jump and roll ----------
#[test]
fn a_jump_has_a_crisp_arc() {
    let mut world = empty_run();
    world.press_jump();
    let mut peak = 0.0f32;
    let air = run_until(&mut world, 2.0, |world| { peak = peak.max(world.y); world.grounded && world.y == 0.0 && peak > 0.0 }).unwrap();
    assert!((1.45..1.7).contains(&peak), "peak {peak}");
    assert!((0.52..0.62).contains(&air), "air time {air}");
}

#[test]
fn jumps_are_buffered_and_have_coyote_time() {
    // pressed just before landing: jumps again as soon as you touch down
    let mut world = empty_run();
    world.press_jump();
    run_for(&mut world, 0.5);
    assert!(!world.grounded);
    world.press_jump();
    let mut landings = 0;
    let mut jumps = 0;
    for _ in 0..(0.2 / STEP_SECONDS) as u32 {
        let happened = world.step();
        if happened & events::LAND != 0 { landings += 1; }
        if happened & events::JUMP != 0 { jumps += 1; }
    }
    assert_eq!((landings, jumps), (1, 1));
    assert!(world.vertical_velocity > 0.0);
    // pressed too early (well before landing): forgotten
    let mut world = empty_run();
    world.press_jump();
    run_for(&mut world, 0.2);
    world.press_jump();
    run_for(&mut world, 0.6);
    assert!(world.grounded);
    // coyote time: run off the end of a train roof and jump a moment later
    let mut world = empty_run();
    put(&mut world, Kind::Train, 1, -10.0, 0.0, 10.5);
    world.y = TRAIN_HEIGHT;
    world.surface = TRAIN_HEIGHT;
    let fell = run_until(&mut world, 1.0, |world| !world.grounded).unwrap();
    assert!(fell < 0.1);
    run_for(&mut world, 0.05);
    world.press_jump();
    let happened = world.step();
    assert!(happened & events::JUMP != 0, "coyote jump");
    // but not long after
    let mut world = empty_run();
    put(&mut world, Kind::Train, 1, -10.0, 0.0, 10.5);
    world.y = TRAIN_HEIGHT;
    run_until(&mut world, 1.0, |world| !world.grounded).unwrap();
    run_for(&mut world, 0.15);
    world.press_jump();
    assert_eq!(world.step() & events::JUMP, 0);
}

#[test]
fn rolling_ducks_low_for_a_moment_and_a_jump_cancels_it() {
    let mut world = empty_run();
    world.press_roll();
    let happened = world.step();
    assert!(happened & events::ROLL != 0);
    assert!(world.is_rolling());
    assert_eq!(world.height(), ROLL_HEIGHT);
    let rolled = run_until(&mut world, 2.0, |world| !world.is_rolling()).unwrap();
    assert!((ROLL_SECONDS - 0.05..ROLL_SECONDS + 0.05).contains(&rolled));
    world.press_roll();
    run_for(&mut world, 0.1);
    world.press_jump();
    world.step();
    assert!(!world.is_rolling());
    assert!(!world.grounded);
}

#[test]
fn rolling_in_the_air_slams_you_down_then_rolls() {
    let mut world = empty_run();
    world.press_jump();
    run_for(&mut world, 0.2);
    let height = world.y;
    assert!(height > 1.2);
    world.press_roll();
    let landed = run_until(&mut world, 1.0, |world| world.grounded).unwrap();
    assert!(landed < 0.12, "fast drop took {landed}s from {height} m");
    assert!(world.is_rolling());
}

// ---------- obstacles ----------
#[test]
fn a_jump_clears_a_low_barrier_and_running_into_it_is_a_crash() {
    let mut world = empty_run();
    put(&mut world, Kind::LowBarrier, 1, 6.0, 0.0, 0.0);
    // jump with the barrier about a quarter of the arc ahead
    let take_off = (speed_at(world.player_z) * 0.2) as f64;
    run_until(&mut world, 2.0, |world| world.entities.iter().any(|entity| entity.active && entity.kind == Kind::LowBarrier && entity.z - world.player_z < take_off + 0.35));
    world.press_jump();
    run_for(&mut world, 1.5);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.stumbles, 0);

    let mut world = empty_run();
    put(&mut world, Kind::LowBarrier, 1, 6.0, 0.0, 0.0);
    let happened = run_for(&mut world, 1.0);
    assert!(happened & events::CRASH != 0);
    assert_eq!(world.phase, Phase::Crashed);
    assert_eq!(world.crash_reason, CRASH_HEAD_ON);
    let happened = run_for(&mut world, CRASH_SECONDS + 0.1);
    assert!(happened & events::GAME_OVER != 0);
    assert_eq!(world.phase, Phase::GameOver);
    // rolling into a low barrier is a crash too
    let mut world = empty_run();
    put(&mut world, Kind::LowBarrier, 1, 2.0, 0.0, 0.0);
    world.press_roll();
    run_for(&mut world, 0.5);
    assert_eq!(world.phase, Phase::Crashed);
}

#[test]
fn rolling_passes_a_high_barrier_and_a_sign_and_standing_or_jumping_does_not() {
    for kind in [Kind::HighBarrier, Kind::Sign] {
        let mut world = empty_run();
        put(&mut world, kind, 1, 4.0, 0.0, 0.0);
        world.press_roll();
        run_for(&mut world, 1.0);
        assert_eq!(world.phase, Phase::Playing, "{kind:?} rolled");
        // a roll that's still going when you arrive is enough (pressed early, it lasts 0.6 s)
        let mut world = empty_run();
        put(&mut world, kind, 1, speed_at(0.0) as f64 * 0.45, 0.0, 0.0);
        world.press_roll();
        run_for(&mut world, 1.2);
        assert_eq!(world.phase, Phase::Playing, "{kind:?} rolled early");

        let mut world = empty_run();
        put(&mut world, kind, 1, 4.0, 0.0, 0.0);
        run_for(&mut world, 1.0);
        assert_eq!(world.phase, Phase::Crashed, "{kind:?} stood");

        let mut world = empty_run();
        put(&mut world, kind, 1, 4.0, 0.0, 0.0);
        world.press_jump();
        run_for(&mut world, 1.0);
        assert_eq!(world.phase, Phase::Crashed, "{kind:?} jumped");
    }
}

#[test]
fn running_into_the_front_of_a_train_is_a_crash() {
    for kind in [Kind::Train, Kind::MovingTrain] {
        let mut world = empty_run();
        put(&mut world, kind, 1, 15.0, 0.0, 26.0);
        let happened = run_for(&mut world, 2.0);
        assert!(happened & events::CRASH != 0, "{kind:?}");
        assert_eq!(world.crash_reason, CRASH_HEAD_ON);
        assert!(world.player_z < world.entities.iter().find(|entity| entity.active && entity.kind == kind).unwrap().z + 0.5);
    }
    // a plain jump does not get you onto a train
    let mut world = empty_run();
    put(&mut world, Kind::Train, 1, 6.0, 0.0, 13.0);
    world.press_jump();
    run_for(&mut world, 1.5);
    assert_eq!(world.phase, Phase::Crashed);
}

#[test]
fn a_moving_train_comes_toward_you() {
    let mut world = empty_run();
    put(&mut world, Kind::MovingTrain, 0, 60.0, 0.0, 13.0);
    let start = world.entities.iter().find(|entity| entity.active).unwrap().z;
    run_for(&mut world, 1.0);
    let now = world.entities.iter().find(|entity| entity.active).unwrap().z;
    assert!((start - now - 8.0).abs() < 0.01);
    assert_eq!(world.phase, Phase::Playing, "it is in another lane");
}

#[test]
fn switching_into_the_side_of_a_train_is_a_stumble_that_bounces_you_back() {
    let mut world = empty_run();
    put(&mut world, Kind::Train, 2, -5.0, 0.0, 30.0);
    world.press_lane(1);
    let happened = run_for(&mut world, 0.3);
    assert!(happened & events::STUMBLE != 0);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.stumbles, 1);
    assert_eq!(world.lane, 1, "bounced back");
    run_for(&mut world, 0.3);
    assert!(world.x.abs() < 1e-4);
    assert!(world.chaser_gap < CHASER_NEAR_GAP + 2.0, "the chaser closes in");
    // a second stumble soon after: caught
    world.press_lane(1);
    let happened = run_for(&mut world, 0.4);
    assert!(happened & events::CAUGHT != 0);
    assert_eq!(world.phase, Phase::Crashed);
    assert_eq!(world.crash_reason, CRASH_CAUGHT);
    run_for(&mut world, CRASH_SECONDS + 0.1);
    assert_eq!(world.phase, Phase::GameOver);
}

#[test]
fn you_can_never_slip_through_the_side_of_a_train() {
    // a double swipe across a train in the middle lane: bounced back to where you started
    let mut world = empty_run();
    world.press_lane(-1);
    run_for(&mut world, 0.3);
    put(&mut world, Kind::Train, 1, -5.0, 0.0, 60.0);
    world.press_lane(1);
    world.press_lane(1);
    let happened = run_for(&mut world, 0.4);
    assert!(happened & events::STUMBLE != 0);
    assert_eq!(world.lane, 0);
    assert!((world.x + LANE_WIDTH).abs() < 1e-4);
    // and straight after (during the bounce's grace), trying again still bounces you off
    world.press_lane(1);
    let happened = run_for(&mut world, 0.4);
    assert_eq!(happened & events::CAUGHT, 0, "no second stumble while being bounced clear");
    assert_eq!(world.phase, Phase::Playing);
    assert!((world.x + LANE_WIDTH).abs() < 1e-4, "x {}", world.x);
    // dropping onto a train's front edge lands you on the roof
    let mut world = empty_run();
    put(&mut world, Kind::Train, 1, 6.0, 0.0, 26.0);
    world.y = TRAIN_HEIGHT + 0.3;
    world.grounded = false;
    world.has_jumped = true;
    world.player_z += 6.0 - PLAYER_HALF_DEPTH + 0.05 - world.player_z.fract() * 0.0;
    run_for(&mut world, 0.3);
    assert_eq!(world.phase, Phase::Playing);
    assert!(world.grounded && (world.y - TRAIN_HEIGHT).abs() < 1e-3);
}

#[test]
fn a_stumble_is_forgiven_after_the_window() {
    let mut world = empty_run();
    put(&mut world, Kind::Train, 2, -5.0, 0.0, 200.0);
    world.press_lane(1);
    run_for(&mut world, 0.5);
    assert_eq!(world.stumbles, 1);
    run_for(&mut world, STUMBLE_WINDOW_SECONDS + 3.0);
    assert!(world.chaser_gap > 10.0, "the chaser drops back");
    world.press_lane(1);
    run_for(&mut world, 0.5);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.stumbles, 2);
}

#[test]
fn a_glancing_hit_on_a_corner_mid_switch_is_a_stumble_not_a_crash() {
    let mut world = empty_run();
    // switch right just as a barrier in the next lane arrives: the edge clips you
    put(&mut world, Kind::HighBarrier, 2, speed_at(0.0) as f64 * 0.06 + PLAYER_HALF_DEPTH, 0.0, 0.0);
    world.press_lane(1);
    let happened = run_for(&mut world, 0.4);
    assert_eq!(world.phase, Phase::Playing);
    assert!(happened & events::STUMBLE != 0);
    assert_eq!(world.lane, 1);
}

#[test]
fn ramps_lead_up_onto_train_roofs_and_you_can_ride_them() {
    let mut world = empty_run();
    put(&mut world, Kind::Ramp, 1, 5.0, 0.0, RAMP_LENGTH);
    put(&mut world, Kind::Train, 1, 5.0 + RAMP_LENGTH as f64, 0.0, 26.0);
    let happened = run_until(&mut world, 3.0, |world| world.y >= TRAIN_HEIGHT - 1e-3).unwrap();
    let _ = happened;
    assert_eq!(world.phase, Phase::Playing);
    assert!(world.grounded);
    // ride the roof, switch lanes up there onto a neighbouring roof, jump on it
    put(&mut world, Kind::Train, 2, -2.0, 0.0, 30.0);
    world.press_lane(1);
    run_for(&mut world, 0.3);
    assert_eq!(world.lane, 2);
    assert_eq!(world.stumbles, 0);
    assert!((world.y - TRAIN_HEIGHT).abs() < 1e-3);
    world.press_jump();
    run_for(&mut world, 0.7);
    assert!((world.y - TRAIN_HEIGHT).abs() < 1e-3 && world.grounded);
    // then drop off the end back to the rails
    let dropped = run_until(&mut world, 4.0, |world| world.y == 0.0 && world.grounded);
    assert!(dropped.is_some());
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.stumbles, 0);
}

#[test]
fn the_ramp_event_fires_and_a_side_step_onto_a_high_ramp_is_a_stumble() {
    let mut world = empty_run();
    put(&mut world, Kind::Ramp, 1, 3.0, 0.0, RAMP_LENGTH);
    let happened = run_for(&mut world, 0.6);
    assert!(happened & events::RAMP != 0);
    let mut world = empty_run();
    put(&mut world, Kind::Ramp, 2, -5.0, 0.0, RAMP_LENGTH);
    world.press_lane(1);
    let happened = run_for(&mut world, 0.2);
    assert!(happened & events::STUMBLE != 0);
}

// ---------- coins and power-ups ----------
#[test]
fn coins_add_to_the_score_and_streaks_are_counted() {
    let mut world = empty_run();
    for index in 0..12 { put(&mut world, Kind::Coin, 1, 3.0 + index as f64 * 1.5, 0.7, 0.0); }
    put(&mut world, Kind::Coin, 0, 5.0, 0.7, 0.0);
    let score_before = world.score();
    let happened = run_for(&mut world, 2.0);
    assert_eq!(world.coins, 12, "only the coins in your lane");
    assert!(happened & events::COIN != 0);
    assert!(happened & events::STREAK != 0);
    assert!(world.score() >= score_before + 12 * COIN_SCORE);
    assert_eq!(world.score(), world.distance_score as u32 + 12 * COIN_SCORE);
    // coins up in the air are only taken by jumping
    let mut world = empty_run();
    put(&mut world, Kind::Coin, 1, 4.0, 2.6, 0.0);
    run_for(&mut world, 1.0);
    assert_eq!(world.coins, 0);
}

#[test]
fn the_magnet_pulls_in_coins_from_every_lane() {
    let mut world = empty_run();
    put(&mut world, Kind::Magnet, 1, 3.0, 1.0, 0.0);
    for lane in [0, 2] { for index in 0..4 { put(&mut world, Kind::Coin, lane, 12.0 + index as f64 * 2.0, 0.7, 0.0); } }
    let happened = run_for(&mut world, 2.0);
    assert!(happened & events::POWER_UP != 0);
    assert_eq!(world.last_power_up, Kind::Magnet as u8);
    assert!(world.magnet_seconds > 0.0);
    assert_eq!(world.coins, 8);
    // without it they stay put
    let mut world = empty_run();
    for lane in [0, 2] { put(&mut world, Kind::Coin, lane, 8.0, 0.7, 0.0); }
    run_for(&mut world, 2.0);
    assert_eq!(world.coins, 0);
}

#[test]
fn super_sneakers_jump_high_enough_to_land_on_a_train() {
    let mut world = empty_run();
    world.activate(Kind::Sneakers);
    world.press_jump();
    let happened = world.step();
    assert!(happened & events::SUPER_JUMP != 0);
    let mut peak = 0.0f32;
    run_until(&mut world, 2.0, |world| { peak = peak.max(world.y); world.grounded });
    assert!(peak > TRAIN_HEIGHT + PLAYER_HALF_WIDTH + 0.5, "peak {peak}");
    // onto a parked train with no ramp
    let mut world = empty_run();
    world.activate(Kind::Sneakers);
    put(&mut world, Kind::Train, 1, 9.0, 0.0, 39.0);
    world.press_jump();
    run_for(&mut world, 1.6);
    assert_eq!(world.phase, Phase::Playing);
    assert!((world.y - TRAIN_HEIGHT).abs() < 1e-3);
    // and they wear off
    run_for(&mut world, SNEAKERS_SECONDS);
    assert_eq!(world.sneakers_seconds, 0.0);
}

#[test]
fn the_multiplier_doubles_distance_points() {
    let mut plain = empty_run();
    let mut doubled = empty_run();
    doubled.activate(Kind::Multiplier);
    assert_eq!(doubled.multiplier(), 2);
    run_for(&mut plain, 5.0);
    run_for(&mut doubled, 5.0);
    assert!((doubled.distance_score - 2.0 * plain.distance_score).abs() < 1.0);
    run_for(&mut doubled, MULTIPLIER_SECONDS);
    assert_eq!(doubled.multiplier(), 1);
}

#[test]
fn the_hoverboard_takes_one_crash_for_you() {
    let mut world = empty_run();
    put(&mut world, Kind::Hoverboard, 1, 2.0, 1.0, 0.0);
    run_for(&mut world, 0.4);
    assert!(world.hoverboard_seconds > 0.0);
    put(&mut world, Kind::Train, 1, 8.0, 0.0, 26.0);
    let happened = run_for(&mut world, 3.0);
    assert!(happened & events::HOVERBOARD_BREAK != 0);
    assert_eq!(world.phase, Phase::Playing, "went through the train");
    assert_eq!(world.hoverboard_seconds, 0.0);
    // the next one is a crash
    put(&mut world, Kind::LowBarrier, 1, 6.0, 0.0, 0.0);
    run_for(&mut world, 1.0);
    assert_eq!(world.phase, Phase::Crashed);
}

// ---------- the chaser ----------
#[test]
fn the_chaser_is_there_at_the_start_and_then_drops_back() {
    let mut world = empty_run();
    assert!(world.chaser_gap <= CHASER_NEAR_GAP);
    run_for(&mut world, 1.0);
    assert!(world.chaser_gap <= CHASER_NEAR_GAP + 0.01);
    run_for(&mut world, 4.0);
    assert!(world.chaser_gap > 12.0);
}

// ---------- speed and score ----------
#[test]
fn speed_ramps_up_gradually() {
    assert_eq!(speed_at(0.0), START_SPEED);
    let mut previous = START_SPEED;
    for metres in (100..20000).step_by(100) {
        let speed = speed_at(metres as f64);
        assert!(speed > previous && speed - previous < 0.8 && speed < MAX_SPEED);
        previous = speed;
    }
    assert!(speed_at(1800.0) < 18.5, "about two minutes in, not yet frantic");
}

// ---------- the generator ----------
/// Every row leaves a way through: at every point along the track, at least one lane has no train you can't get onto.
#[test]
fn generated_rows_never_wall_off_all_three_lanes() {
    for seed in 1..=120u32 {
        let mut world = World::new(seed);
        world.start();
        world.debug_invincible = true;
        let mut checked = 0;
        while world.player_z < 5000.0 {
            run_for(&mut world, 1.0);
            // sample the stretch 40–60 m ahead
            let mut z = world.player_z + 40.0;
            while z < world.player_z + 60.0 {
                let mut blocked = 0;
                for lane in 0..LANE_COUNT {
                    let x = lane_x(lane);
                    let wall = world.entities.iter().any(|entity| entity.active && entity.kind == Kind::Train && (entity.x - x).abs() < 0.1
                        && z >= entity.z && z <= entity.z + entity.length as f64
                        && !world.entities.iter().any(|ramp| ramp.active && ramp.kind == Kind::Ramp && (ramp.x - x).abs() < 0.1 && (ramp.z + ramp.length as f64 - entity.z).abs() < 0.01));
                    if wall { blocked += 1; }
                }
                assert!(blocked < 3, "seed {seed}: all lanes walled at {z}");
                z += 0.5;
                checked += 1;
            }
        }
        assert!(checked > 1000);
    }
}

#[test]
fn nothing_overlaps_in_a_lane() {
    for seed in 1..=60u32 {
        let mut world = World::new(seed);
        world.start();
        world.debug_invincible = true;
        while world.player_z < 4000.0 {
            run_for(&mut world, 2.0);
            let obstacles: Vec<_> = world.entities.iter().filter(|entity| entity.active && entity.kind.is_obstacle() && entity.kind != Kind::MovingTrain).collect();
            for (index, first) in obstacles.iter().enumerate() {
                for second in obstacles.iter().skip(index + 1) {
                    if first.lane != second.lane { continue; }
                    let (a0, a1) = (first.z, first.z + first.length.max(BARRIER_DEPTH) as f64);
                    let (b0, b1) = (second.z, second.z + second.length.max(BARRIER_DEPTH) as f64);
                    let ramp_joint = (first.kind == Kind::Ramp || second.kind == Kind::Ramp) && ((a1 - b0).abs() < 0.01 || (b1 - a0).abs() < 0.01);
                    assert!(a1 <= b0 + 0.01 || b1 <= a0 + 0.01 || ramp_joint, "seed {seed}: {first:?} overlaps {second:?}");
                }
            }
            // coins are never inside a parked train or a barrier
            for coin in world.entities.iter().filter(|entity| entity.active && entity.kind == Kind::Coin && entity.variant == 0) {
                for obstacle in obstacles.iter().filter(|entity| entity.lane == coin.lane && entity.kind == Kind::Train) {
                    let inside = coin.z > obstacle.z && coin.z < obstacle.z + obstacle.length as f64 && coin.y < TRAIN_HEIGHT;
                    assert!(!inside, "seed {seed}: coin inside a train");
                }
            }
        }
    }
}

#[test]
fn runs_bring_trains_ramps_barriers_coins_and_power_ups() {
    let mut seen = [0u32; KIND_COUNT as usize];
    let mut world = World::new(99);
    world.start();
    world.debug_invincible = true;
    let mut known = std::collections::HashSet::new();
    while world.player_z < 6000.0 {
        run_for(&mut world, 1.0);
        for entity in world.entities.iter().filter(|entity| entity.active) {
            let key = (entity.kind as u8, entity.lane, (entity.z * 4.0).round() as i64, entity.velocity != 0.0);
            if entity.kind != Kind::MovingTrain && entity.kind != Kind::Coin && known.insert(key) { seen[entity.kind as usize] += 1; }
            if entity.kind == Kind::MovingTrain && known.insert((1, entity.lane, 0, (entity.length * 10.0) as i64 > 0)) { }
        }
        for entity in world.entities.iter().filter(|entity| entity.active && entity.kind == Kind::MovingTrain) { let _ = entity; seen[1] = seen[1].max(1); }
    }
    for kind in [Kind::Train, Kind::MovingTrain, Kind::Ramp, Kind::LowBarrier, Kind::HighBarrier, Kind::Sign] { assert!(seen[kind as usize] > 0, "{kind:?}"); }
    assert!(seen[Kind::Magnet as usize] + seen[Kind::Sneakers as usize] + seen[Kind::Multiplier as usize] + seen[Kind::Hoverboard as usize] >= 8);
}

/// The look-ahead autopilot plays two and a half minutes on many seeds without ever crashing or getting caught:
/// the generator always leaves a fair way through, even as the speed climbs.
#[test]
fn the_autopilot_survives_long_runs_on_many_seeds() {
    let mut total_stumbles = 0;
    let mut slowest = f32::MAX;
    for seed in 1..=24u32 {
        let mut world = World::new(seed * 7919);
        world.start();
        world.autopilot = true;
        let mut coins_at_minute = 0;
        for second in 0..150 {
            world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05);
            world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05);
            world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05);
            world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05); world.advance(0.05);
            assert_eq!(world.phase, Phase::Playing, "seed {} crashed ({}) after {second} s at {} m", seed * 7919, world.crash_reason, world.player_z);
            if second == 60 { coins_at_minute = world.coins; }
        }
        assert!(world.player_z > 2000.0);
        assert!(coins_at_minute > 20, "coins are along the way");
        total_stumbles += world.stumbles;
        slowest = slowest.min(world.player_z as f32);
    }
    assert!(total_stumbles <= 6, "{total_stumbles} stumbles");
    assert!(slowest > 2000.0);
}

#[test]
fn the_autopilot_uses_ramps_and_lane_switches() {
    let mut world = empty_run();
    // a train in the middle lane, the left lane clear: it moves over
    put(&mut world, Kind::Train, 1, 20.0, 0.0, 26.0);
    let action = world.choose_action();
    assert!(matches!(action, Action::Left | Action::Right | Action::Wait));
    world.autopilot = true;
    for _ in 0..60 { world.advance(0.05); }
    assert_eq!(world.phase, Phase::Playing);
    assert_ne!(world.lane, 1);
}

// ---------- save / load ----------
#[test]
fn a_saved_run_continues_exactly() {
    let mut world = World::new(31337);
    world.start();
    world.autopilot = true;
    for _ in 0..400 { world.advance(0.05); }
    world.autopilot = false;
    world.activate(Kind::Magnet);
    world.press_lane(-1);
    world.press_jump();
    world.step();
    let bytes = world.save();
    let mut restored = World::new(1);
    assert!(restored.restore(&bytes));
    assert_eq!(restored.save(), bytes);
    assert_eq!(restored.phase, Phase::Playing);
    for _ in 0..240 {
        let a = world.step();
        let b = restored.step();
        assert_eq!(a, b);
    }
    assert_eq!(world.save(), restored.save());
    assert_eq!((world.score(), world.coins, world.lane), (restored.score(), restored.coins, restored.lane));
}

#[test]
fn damaged_saves_are_refused() {
    let mut world = World::new(5);
    world.start();
    for _ in 0..240 { world.step(); }
    let bytes = world.save();
    let mut target = World::new(9);
    let before = target.save();
    assert!(!target.restore(&bytes[..bytes.len() - 1]));
    assert!(!target.restore(&[]));
    let mut longer = bytes.clone();
    longer.push(0);
    assert!(!target.restore(&longer));
    let mut wrong_magic = bytes.clone();
    wrong_magic[0] = b'X';
    assert!(!target.restore(&wrong_magic));
    let mut bad_lane = bytes.clone();
    bad_lane[2 + 1 + 4 + 4 + 8 * 3] = 7;
    assert!(!target.restore(&bad_lane));
    let mut nan = bytes.clone();
    let float_at = 2 + 1 + 4 + 4 + 8 * 3 + 8 + 4 * 3; // the runner's x
    nan[float_at..float_at + 4].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(!target.restore(&nan));
    assert_eq!(target.save(), before, "unchanged");
}

#[test]
fn hitches_are_dropped_and_slow_frames_capped() {
    let mut world = empty_run();
    let start = world.player_z;
    world.advance(0.5);
    assert_eq!(world.player_z, start);
    world.advance(0.08);
    assert!(((world.player_z - start) as f32 - START_SPEED * 0.05).abs() < 0.2);
}
