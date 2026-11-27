use crate::render_slot;
use crate::track::*;
use crate::world::*;
use crate::AlpineSled;

/// A started run with an empty trail ahead (nothing spawns into view until the sled passes the current rows).
fn open_trail(seed: u32) -> World {
    let mut world = World::new(seed);
    world.start();
    world.clear_entities();
    world
}

fn run(world: &mut World, seconds: f32) -> u32 {
    let mut happened = 0;
    let mut left = seconds;
    while left > 0.0 { happened |= world.step(STEP_SECONDS); left -= STEP_SECONDS; }
    happened
}

/// Run until `stop` says so (or `seconds` pass), returning every event and the highest altitude reached.
fn run_until(world: &mut World, seconds: f32, mut stop: impl FnMut(&World, u32) -> bool) -> (u32, f32) {
    let mut happened = 0;
    let mut highest: f32 = 0.0;
    let mut left = seconds;
    while left > 0.0 {
        let step_events = world.step(STEP_SECONDS);
        happened |= step_events;
        highest = highest.max(world.altitude);
        if stop(world, step_events) { break; }
        left -= STEP_SECONDS;
    }
    (happened, highest)
}

// ---------- the trail ----------
#[test]
fn the_trail_is_the_same_for_a_seed_and_different_for_another() {
    let first = Track::new(42);
    let again = Track::new(42);
    let other = Track::new(43);
    for step in 0..200 {
        let z = step as f64 * 17.0;
        assert_eq!(first.center_x(z), again.center_x(z));
        assert_eq!(first.height(z), again.height(z));
    }
    assert!((0..200).any(|step| (first.center_x(step as f64 * 17.0) - other.center_x(step as f64 * 17.0)).abs() > 1.0));
}

#[test]
fn the_trail_starts_straight_then_curves_gently_and_smoothly() {
    let track = Track::new(7);
    assert_eq!(track.center_x(0.0), 0.0);
    assert_eq!(track.height(0.0), 0.0);
    assert!(track.center_x(40.0).abs() < 1.5, "calm start");
    let mut widest: f64 = 0.0;
    let mut left_bends = 0;
    let mut right_bends = 0;
    let mut sharpest: f64 = 0.0;
    for step in 0..6000 {
        let z = step as f64;
        widest = widest.max(track.center_x(z).abs());
        let curvature = track.curvature(z);
        if curvature > 0.002 { right_bends += 1; }
        if curvature < -0.002 { left_bends += 1; }
        sharpest = sharpest.max(curvature.abs());
        // continuous: no jumps between neighbouring metres
        assert!((track.center_x(z + 1.0) - track.center_x(z)).abs() < 1.0);
        assert!((track.height(z + 1.0) - track.height(z)).abs() < 0.5);
    }
    assert!(widest > 8.0, "the trail swings side to side ({widest})");
    assert!(left_bends > 300 && right_bends > 300, "S-curves both ways ({left_bends} left, {right_bends} right)");
    assert!(sharpest < 0.03, "gentle bends ({sharpest})");
}

#[test]
fn the_trail_runs_downhill_over_rolling_crests() {
    let track = Track::new(9);
    assert!(track.height(3000.0) < track.height(0.0) - 250.0, "a long way downhill");
    let mut crests = 0;
    for step in 200..3000 {
        let z = step as f64;
        if track.slope(z - 1.0) > 0.0 && track.slope(z) <= 0.0 { crests += 1; }
    }
    assert!(crests >= 5, "rolling hills with crests ({crests})");
    assert!((200..3000).any(|step| track.slope(step as f64) > 0.02), "some rises between the drops");
}

// ---------- speed and steering ----------
#[test]
fn the_sled_glides_on_its_own_and_speeds_up_smoothly() {
    assert_eq!(cruise_speed(0.0), START_SPEED);
    let mut previous = cruise_speed(0.0);
    for metres in (100..20000).step_by(100) {
        let speed = cruise_speed(metres as f32);
        assert!(speed > previous && speed < MAX_SPEED);
        previous = speed;
    }
    let mut world = open_trail(1);
    world.debug_invincible = true;
    run(&mut world, 2.0);
    assert!(world.distance() > 20.0, "glides without input ({})", world.distance());
    world.teleport(4000.0);
    run(&mut world, 1.0);
    assert!(world.speed > START_SPEED + 8.0, "faster further down ({})", world.speed);
}

#[test]
fn steering_moves_and_banks_the_sled_and_the_edges_hold_it() {
    let mut world = open_trail(3);
    world.input = buttons::RIGHT;
    run(&mut world, 0.5);
    assert!(world.player_x > 2.0, "steers right ({})", world.player_x);
    assert!(world.sideways_speed > STEER_SPEED * 0.8, "banks into the turn");
    world.input = buttons::LEFT;
    run(&mut world, 1.0);
    assert!(world.player_x < 0.0, "steers left ({})", world.player_x);
    world.input = 0;
    world.steer_axis = -1.0;
    let happened = run(&mut world, 3.0);
    assert!((world.player_x + SIDE_LIMIT).abs() < 1e-4, "stops at the banked edge ({})", world.player_x);
    assert!(happened & events::BANK_SCRAPE != 0);
    world.steer_axis = 0.4;
    let before = world.player_x;
    run(&mut world, 0.5);
    assert!(world.player_x > before + 1.0, "analog drag steering works");
}

// ---------- jumping ----------
#[test]
fn a_jump_lifts_the_sled_in_an_arc_and_lands_it() {
    let mut world = open_trail(4);
    world.press_jump();
    let (happened, highest) = run_until(&mut world, 2.0, |_, step_events| step_events & events::LAND != 0);
    assert!(happened & events::JUMP != 0 && happened & events::LAND != 0);
    let expected_peak = JUMP_SPEED * JUMP_SPEED / (2.0 * GRAVITY);
    assert!((highest - expected_peak).abs() < 0.1, "peak {highest} vs {expected_peak}");
    assert_eq!(world.altitude, 0.0);
    assert_eq!(world.motion, Motion::Sliding);
    // no second jump in the air; a press just before landing still jumps on landing
    world.press_jump();
    run(&mut world, 0.2);
    let height_mid_air = world.altitude;
    world.press_jump();
    run(&mut world, 0.02);
    assert!(world.vertical_speed < JUMP_SPEED - 1.0, "no double jump (altitude {height_mid_air})");
    let (_, _) = run_until(&mut world, 2.0, |world, _| world.vertical_speed < 0.0 && world.altitude < 0.4);
    world.press_jump();
    let (happened, _) = run_until(&mut world, 0.3, |_, step_events| step_events & events::JUMP != 0);
    assert!(happened & events::JUMP != 0, "buffered jump fires on landing");
}

#[test]
fn a_ramp_launches_a_long_high_arc_over_the_obstacles_below() {
    let mut world = open_trail(5);
    let ramp_z = world.player_z + 10.0;
    world.spawn(EntityKind::Ramp, ramp_z, 0.0, 0.0);
    world.spawn(EntityKind::Pine, ramp_z + RAMP_LENGTH as f64 + 6.0, 0.0, 0.0);
    let mut seen_on_ramp = false;
    let mut launch_z = 0.0;
    let mut airborne_steps = 0;
    let (happened, highest) = run_until(&mut world, 4.0, |world, step_events| {
        if world.motion == Motion::OnRamp { seen_on_ramp = true; }
        if step_events & events::RAMP != 0 { launch_z = world.player_z; }
        if world.motion == Motion::Airborne { airborne_steps += 1; }
        step_events & events::LAND != 0
    });
    assert!(seen_on_ramp, "rides up the ramp");
    assert!(happened & events::RAMP != 0);
    assert!(launch_z >= ramp_z + RAMP_LENGTH as f64);
    assert!(highest > kind_size(EntityKind::Pine).height, "flies higher than a pine ({highest})");
    assert!(highest > 3.0 * JUMP_SPEED * JUMP_SPEED / (2.0 * GRAVITY), "much higher than a plain jump");
    assert!(airborne_steps as f32 * STEP_SECONDS > 1.0, "a long flight");
    assert!(happened & events::CRASH == 0, "sails over the pine");
    assert_eq!(world.phase, Phase::Playing);
}

// ---------- obstacles ----------
#[test]
fn hitting_an_obstacle_crashes_then_ends_the_run() {
    for kind in [EntityKind::Pine, EntityKind::Boulder, EntityKind::Snowman, EntityKind::Log] {
        let mut world = open_trail(6);
        world.spawn(kind, world.player_z + 8.0, 0.3, 0.0);
        let (happened, _) = run_until(&mut world, 2.0, |world, _| world.phase != Phase::Playing);
        assert!(happened & events::CRASH != 0, "{kind:?} crashes");
        assert_eq!(world.phase, Phase::Crashing);
        let score = world.score();
        let happened = run(&mut world, CRASH_SECONDS + 0.1);
        assert!(happened & events::GAME_OVER != 0);
        assert_eq!(world.phase, Phase::GameOver);
        assert_eq!(world.score(), score, "the score stops at the crash");
        let still = world.player_z;
        run(&mut world, 1.0);
        assert_eq!(world.player_z, still, "nothing moves after game over");
    }
}

#[test]
fn passing_beside_an_obstacle_or_jumping_a_low_one_is_safe() {
    let mut world = open_trail(8);
    world.spawn(EntityKind::Boulder, world.player_z + 8.0, PLAYER_HALF_WIDTH + 1.0 + 0.05, 0.0);
    run(&mut world, 1.5);
    assert_eq!(world.phase, Phase::Playing, "a near miss beside a boulder");

    // jump a log: press when it is a few metres ahead
    let mut world = open_trail(8);
    let log_z = world.player_z + 12.0;
    world.spawn(EntityKind::Log, log_z, 0.0, 0.0);
    world.spawn(EntityKind::Star, log_z, 0.0, 1.6);
    run_until(&mut world, 2.0, |world, _| world.player_z > log_z - 4.5);
    world.press_jump();
    let happened = run(&mut world, 1.0);
    assert_eq!(world.phase, Phase::Playing, "cleared the log");
    assert!(happened & events::STAR != 0, "and grabbed the star over it");

    // a plain jump can't clear a pine
    let mut world = open_trail(8);
    let pine_z = world.player_z + 12.0;
    world.spawn(EntityKind::Pine, pine_z, 0.0, 0.0);
    run_until(&mut world, 2.0, |world, _| world.player_z > pine_z - 4.5);
    world.press_jump();
    let happened = run(&mut world, 1.0);
    assert!(happened & events::CRASH != 0, "pines are too tall to hop");
}

// ---------- collectibles and the shield ----------
#[test]
fn gifts_and_stars_add_to_the_score() {
    let mut world = open_trail(10);
    world.spawn(EntityKind::Gift, world.player_z + 6.0, 0.0, 0.0);
    world.spawn(EntityKind::Star, world.player_z + 12.0, 0.2, 0.0);
    let happened = run(&mut world, 1.5);
    assert!(happened & events::GIFT != 0 && happened & events::STAR != 0);
    assert_eq!((world.gifts, world.stars, world.collectibles()), (1, 1, 2));
    assert_eq!(world.bonus_points, GIFT_POINTS + STAR_POINTS);
    assert_eq!(world.score(), world.distance() as u32 + GIFT_POINTS + STAR_POINTS);
    assert!(!world.entities.iter().any(|entity| entity.active && entity.kind.is_collectible() && entity.z < world.player_z + 20.0), "picked up items vanish");
}

#[test]
fn stars_in_the_air_need_a_ramp_jump() {
    let mut world = open_trail(11);
    world.spawn(EntityKind::Star, world.player_z + 8.0, 0.0, AIR_STAR_ALTITUDE);
    let happened = run(&mut world, 1.0);
    assert!(happened & events::STAR == 0, "sliding under an air star misses it");

    for speed_distance in [0.0, 6000.0] {
        let mut world = open_trail(11);
        world.teleport(speed_distance);
        world.clear_entities();
        world.speed = cruise_speed(world.distance());
        world.next_row += 40; // nothing new spawns into the flight path
        let ramp_z = world.player_z + 10.0;
        world.spawn(EntityKind::Ramp, ramp_z, 0.0, 0.0);
        for ahead in [3.0, 7.0, 11.0] { world.spawn(EntityKind::Star, ramp_z + RAMP_LENGTH as f64 + ahead, 0.0, AIR_STAR_ALTITUDE); }
        run_until(&mut world, 4.0, |_, step_events| step_events & events::LAND != 0);
        assert_eq!(world.stars, 3, "every air star collected at speed {}", world.speed);
    }
}

#[test]
fn a_shield_absorbs_one_hit() {
    let mut world = open_trail(12);
    world.spawn(EntityKind::Shield, world.player_z + 6.0, 0.0, 0.0);
    world.spawn(EntityKind::Pine, world.player_z + 25.0, 0.0, 0.0);
    let (happened, _) = run_until(&mut world, 3.0, |world, step_events| step_events & events::SHIELD_BREAK != 0 || world.phase != Phase::Playing);
    assert!(happened & events::SHIELD != 0, "picked the shield up");
    assert!(happened & events::SHIELD_BREAK != 0 && happened & events::CRASH == 0, "the shield took the pine");
    assert!(!world.has_shield && world.grace_seconds > 0.0);
    assert_eq!(world.entities.iter().filter(|entity| entity.active && entity.kind == EntityKind::Pine).count(), 0, "the pine is smashed");
    world.spawn(EntityKind::Boulder, world.player_z + 25.0, world.player_x, 0.0);
    let (happened, _) = run_until(&mut world, 4.0, |world, _| world.phase != Phase::Playing);
    assert!(happened & events::CRASH != 0, "the next hit crashes");
    // a spare shield is worth points instead
    let mut world = open_trail(12);
    world.has_shield = true;
    world.spawn(EntityKind::Shield, world.player_z + 6.0, 0.0, 0.0);
    run(&mut world, 1.0);
    assert_eq!(world.bonus_points, SPARE_SHIELD_POINTS);
}

// ---------- the generated trail is always passable ----------
#[test]
fn every_row_leaves_a_way_through_and_items_never_sit_on_obstacles() {
    for seed in 1..40u32 {
        let mut world = World::new(seed);
        world.start();
        let mut ramps = 0;
        let mut shields = 0;
        let mut obstacles = 0;
        world.clear_entities();
        for row in world.next_row..world.next_row + 400 {
            world.clear_entities();
            world.debug_spawn_row(row);
            let spawned: Vec<Entity> = world.entities.iter().copied().filter(|entity| entity.active).collect();
            let row_obstacles: Vec<&Entity> = spawned.iter().filter(|entity| entity.kind.is_obstacle()).collect();
            obstacles += row_obstacles.len();
            ramps += spawned.iter().filter(|entity| entity.kind == EntityKind::Ramp).count();
            shields += spawned.iter().filter(|entity| entity.kind == EntityKind::Shield).count();
            let blocked_lanes = (0..LANE_COUNT).filter(|lane| row_obstacles.iter().any(|entity| (entity.x - lane_x(*lane)).abs() < 1.0)).count();
            assert!(blocked_lanes <= 3, "seed {seed}: a row blocks {blocked_lanes} lanes");
            for item in spawned.iter().filter(|entity| entity.kind.is_collectible() && entity.altitude < 1.0) {
                for obstacle in &row_obstacles {
                    let size = kind_size(obstacle.kind);
                    assert!(!((item.z - obstacle.z).abs() < (size.half_depth + 0.7) as f64 && (item.x - obstacle.x).abs() < size.half_width + 0.7),
                        "seed {seed}: a ground item sits on an obstacle");
                }
            }
        }
        assert!(ramps > 10 && shields > 2 && obstacles > 300, "seed {seed}: {ramps} ramps, {shields} shields, {obstacles} obstacles");
    }
}

#[test]
fn an_unattended_sled_soon_crashes_but_a_careful_bot_survives_a_long_way() {
    // nobody steering: the obstacles end the run
    let mut world = World::new(21);
    world.start();
    let (happened, _) = run_until(&mut world, 120.0, |world, _| world.phase != Phase::Playing);
    assert!(happened & events::CRASH != 0, "an idle sled hits something");

    // a simple bot that looks ahead, steers for the clearest lane and hops low obstacles gets far on every trail tried,
    // so the generated trail is fair
    for seed in 22..26 {
        let mut world = World::new(seed);
        world.start();
        let mut elapsed = 0.0;
        let mut plan = (0.0, 0);
        while world.phase == Phase::Playing && elapsed < 110.0 {
            steer_bot(&mut world, &mut plan);
            world.step(STEP_SECONDS);
            elapsed += STEP_SECONDS;
        }
        assert!(world.distance() > 1800.0, "seed {seed}: bot reached {} m", world.distance());
    }
}

/// A look-ahead bot: every tenth of a second it tries each move (steer left, straight or right, with or without a
/// jump, then a different steer for the rest), plays each one forward on a copy of the world, and keeps the move that
/// stays upright longest (straight ahead wins ties).
fn steer_bot(world: &mut World, plan: &mut (f32, u32)) {
    if plan.1 > 0 { plan.1 -= 1; world.steer_axis = plan.0; return; }
    let mut best = (0.0f32, false, -1.0f32);
    for first_axis in [0.0f32, -1.0, 1.0, -0.5, 0.5] {
        for jump in [false, true] {
            for later_axis in [0.0f32, -1.0, 1.0] {
                let mut trial = world.clone();
                trial.debug_invincible = false;
                trial.steer_axis = first_axis;
                if jump { trial.press_jump(); }
                let mut survived = 0.0;
                while survived < 1.6 && trial.phase == Phase::Playing {
                    if survived > 0.35 { trial.steer_axis = later_axis; }
                    trial.step(STEP_SECONDS);
                    survived += STEP_SECONDS;
                }
                let score = survived - first_axis.abs() * 0.01 - if jump { 0.02 } else { 0.0 };
                if score > best.2 { best = (first_axis, jump, score); }
            }
        }
    }
    world.steer_axis = best.0;
    world.input = 0;
    if best.1 { world.press_jump(); }
    *plan = (best.0, 11);
}

// ---------- save / load ----------
#[test]
fn a_run_survives_save_and_load_exactly() {
    let mut world = World::new(31);
    world.start();
    world.debug_invincible = true;
    world.input = buttons::RIGHT;
    run(&mut world, 1.0);
    world.input = 0;
    world.press_jump();
    run(&mut world, 0.2);
    world.has_shield = true;
    world.gifts = 3;
    world.bonus_points = 75;
    let bytes = world.save();
    let mut restored = World::new(999);
    assert!(restored.restore(&bytes));
    restored.debug_invincible = true;
    assert_eq!(restored.phase, Phase::Playing);
    assert_eq!(restored.save(), bytes, "the round trip is byte-exact");
    assert_eq!((restored.player_z, restored.player_x, restored.altitude, restored.has_shield, restored.gifts, restored.score()),
        (world.player_z, world.player_x, world.altitude, world.has_shield, world.gifts, world.score()));
    // both carry on identically (same trail, same spawns)
    for _ in 0..600 {
        assert_eq!(world.step(STEP_SECONDS), restored.step(STEP_SECONDS));
    }
    assert_eq!(world.save(), restored.save());
}

#[test]
fn broken_saves_are_rejected_and_leave_the_world_alone() {
    let mut world = World::new(32);
    world.start();
    run(&mut world, 0.5);
    let bytes = world.save();
    let mut target = World::new(5);
    let untouched = target.save();
    assert!(!target.restore(&bytes[..bytes.len() - 1]), "truncated");
    assert!(!target.restore(&[]), "empty");
    let mut wrong_magic = bytes.clone();
    wrong_magic[0] = b'X';
    assert!(!target.restore(&wrong_magic));
    let mut wrong_version = bytes.clone();
    wrong_version[2] = 99;
    assert!(!target.restore(&wrong_version));
    let mut extra = bytes.clone();
    extra.push(0);
    assert!(!target.restore(&extra), "trailing bytes");
    let mut bad_kind = bytes.clone();
    let first_entity = bytes.len() - (bytes[bytes.len() - 1 - 0] as usize * 0) - 17 * world.entities.iter().filter(|entity| entity.active).count();
    bad_kind[first_entity] = 42;
    assert!(!target.restore(&bad_kind), "unknown entity kind");
    let mut not_a_number = bytes.clone();
    not_a_number[3 + 8 + 8..3 + 8 + 12].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(!target.restore(&not_a_number), "NaN position");
    assert_eq!(target.save(), untouched);
}

// ---------- the render buffer ----------
#[test]
fn the_render_buffer_holds_the_trail_ahead_relative_to_the_camera() {
    let mut game = AlpineSled::new(77);
    game.start();
    game.advance(0.05);
    let length = AlpineSled::render_length() as usize;
    assert_eq!(length, render_slot::LENGTH);
    let render = unsafe { std::slice::from_raw_parts(game.render_pointer(), length) };
    assert_eq!(render[render_slot::PHASE], Phase::Playing as u8 as f32);
    assert_eq!(render[render_slot::SEGMENT_COUNT], DRAW_SEGMENTS as f32);
    let mut previous_z = 0.0;
    for index in 0..DRAW_SEGMENTS {
        let z = render[render_slot::SEGMENTS + index * render_slot::SEGMENT_STRIDE];
        assert!(z > previous_z && z <= previous_z + SEGMENT_LENGTH + 1e-3, "segments run away from the camera");
        previous_z = z;
    }
    assert!((render[render_slot::PLAYER_RELATIVE_Z] - CAMERA_BACK).abs() < 1e-3);
    assert!(render[render_slot::PLAYER_RELATIVE_Y] < -1.5, "the camera looks down on the sled");
    assert!(render[render_slot::ENTITY_COUNT] > 0.0, "obstacles in view");
    for index in 0..render[render_slot::ENTITY_COUNT] as usize {
        let offset = render_slot::ENTITIES + index * render_slot::ENTITY_STRIDE;
        assert!(render[offset] < ENTITY_KIND_COUNT as f32 && render[offset + 1] <= VIEW_DISTANCE);
    }
}

#[test]
fn hitches_are_dropped_and_slow_frames_capped() {
    let mut world = open_trail(40);
    let before = world.player_z;
    world.advance(0.5);
    assert_eq!(world.player_z, before, "a half-second hitch is dropped");
    world.advance(0.09);
    assert!(world.player_z - before < (MAX_FRAME_SECONDS_FOR_TEST * world.speed + 0.2) as f64, "a slow frame is capped");
}
const MAX_FRAME_SECONDS_FOR_TEST: f32 = 0.05;
