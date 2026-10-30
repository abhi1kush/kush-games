//! A driver that eases off when the nose lifts, so the road is known to be climbable, plus the ways a run ends.
use crate::course::*;
use crate::world::*;

fn pump(world: &mut World, seconds: f32, fuel_from_a_can: bool) {
    let steps = (seconds * 120.0) as u32;
    for _ in 0..steps {
        if world.phase != PHASE_DRIVING { return; }
        let grade_now = grade(world.x);
        let nose = wrap_pi(world.angle - grade_now);
        let airborne = world.y - height(world.x) > 17.0;
        // gas on the flat and on the way up; let gravity do the work on the way down
        let (gas, brake) = if airborne {
            // in the air, keep the jeep near level
            (world.fuel > 0.0 && world.angle < -0.35, world.angle > 0.45)
        } else {
            (world.fuel > 0.0 && nose < 0.5 && world.vx < 100.0 && grade_now > -0.4, nose > 0.75)
        };
        world.step(if gas { BUTTON_GAS } else { 0 } | if brake { BUTTON_BRAKE } else { 0 });
        if fuel_from_a_can && world.fuel < 25.0 { world.fuel = FUEL_MAX; }
    }
}

#[test]
fn sine_tracks_the_circle() {
    for step in 0..24 {
        let angle = step as f32 * 0.26 - 3.0;
        let (s, c) = sine_cosine(angle);
        assert!((s * s + c * c - 1.0).abs() < 0.04, "angle {angle}");
    }
    let (s, c) = sine_cosine(0.0);
    assert!(s.abs() < 0.02 && (c - 1.0).abs() < 0.02);
}

#[test]
fn the_road_is_continuous_and_the_finish_sits_on_it() {
    let mut previous = height(0.0);
    let mut x = 0.0;
    while x < COURSE_END {
        let y = height(x);
        assert!((y - previous).abs() < 8.0, "a step at {x}");
        previous = y;
        x += 4.0;
    }
    assert!(FINISH_X < COURSE_END);
    assert!(slope(600.0).abs() < 2.0);
}

#[test]
fn gas_rolls_the_jeep_and_burns_fuel() {
    let mut world = World::new();
    world.start();
    let start = world.x;
    pump(&mut world, 3.0, false);
    assert!(world.x > start + 60.0, "moved ({})", world.x);
    assert!(world.fuel < 99.9, "fuel {}", world.fuel);
    let nose = wrap_pi(world.angle - grade(world.x));
    assert!(nose.abs() < 1.15, "nose stayed drivable ({nose}, road {})", grade(world.x));
    assert_eq!(world.phase, PHASE_DRIVING);
}

fn coast_speed(x: f32) -> f32 {
    let mut world = World::new();
    world.start();
    world.place(x);
    for _ in 0..120 { world.step(BUTTON_GAS); }
    world.vx
}

#[test]
fn climbs_are_slower_than_the_flat_and_descents_are_faster() {
    let flat = coast_speed(50.0);
    let climb = coast_speed(140.0);
    assert!(flat > climb + 10.0, "flat {flat} should beat the climb {climb}");
    let mut down = World::new();
    down.start();
    down.place(210.0);
    for _ in 0..90 { down.step(0); }
    let mut flat_coast = World::new();
    flat_coast.start();
    flat_coast.place(50.0);
    for _ in 0..90 { flat_coast.step(0); }
    assert!(down.vx > flat_coast.vx + 6.0, "descent {} should roll faster than the flat {}", down.vx, flat_coast.vx);
}

fn set_along(world: &mut World, x: f32, speed: f32) {
    world.place(x);
    let (nx, ny) = normal(x);
    let (tx, ty) = (ny, -nx);
    world.vx = tx * speed;
    world.vy = ty * speed;
}

fn along_speed(world: &World) -> f32 {
    let (nx, ny) = normal(world.x);
    world.vx * ny + world.vy * -nx
}

#[test]
fn momentum_follows_the_slope_and_coasts_on_the_flat() {
    let mut flat = World::new();
    flat.start();
    set_along(&mut flat, 40.0, 60.0);
    for _ in 0..120 { flat.step(0); }
    let flat_speed = along_speed(&flat);
    assert!(flat_speed < 56.0 && flat_speed > 44.0, "the flat should bleed speed slowly ({flat_speed})");

    let mut climb = World::new();
    climb.start();
    set_along(&mut climb, 290.0, 55.0);
    let climb_before = along_speed(&climb);
    for _ in 0..120 { climb.step(0); }
    assert!(along_speed(&climb) < climb_before - 12.0, "an uphill with no gas should slow down ({})", along_speed(&climb));

    let mut descent = World::new();
    descent.start();
    set_along(&mut descent, 210.0, 15.0);
    let down_before = along_speed(&descent);
    for _ in 0..140 { descent.step(0); }
    assert!(along_speed(&descent) > down_before + 10.0, "a downhill with no gas should speed up ({})", along_speed(&descent));
}

#[test]
fn without_gas_a_drop_cannot_climb_back_to_the_same_height() {
    let mut world = World::new();
    world.start();
    // on the drop from the crest at x = 190 (height 74) toward the valley at 270 (height 38)
    world.place(205.0);
    let start_h = height(world.x);
    let mut lowest = start_h;
    let mut highest_after = 0.0f32;
    let mut went_down = false;
    for _ in 0..120 * 25 {
        world.step(0);
        if world.phase != PHASE_DRIVING { break; }
        let h = height(world.x);
        if h < start_h - 10.0 { went_down = true; }
        if went_down { highest_after = highest_after.max(h); }
        lowest = lowest.min(h);
    }
    assert!(went_down, "it should roll down the hill (lowest {lowest}, start {start_h})");
    assert!(highest_after < start_h - 4.0, "friction stops it short of the height it fell from (back to {highest_after}, start {start_h})");
}

#[test]
fn a_tap_of_gas_does_not_carry_over_the_hills() {
    let mut world = World::new();
    world.start();
    let start_h = height(world.x);
    for _ in 0..18 { world.step(BUTTON_GAS); } // a short tap, 0.15 s
    let mut max_h = start_h;
    for _ in 0..120 * 20 {
        world.step(0);
        if world.phase != PHASE_DRIVING { break; }
        max_h = max_h.max(height(world.x));
    }
    assert!(max_h < start_h + 14.0, "one tap must not climb the hills (reached {max_h}, start {start_h})");
}

#[test]
fn gas_from_the_bottom_reaches_the_peak() {
    // the steep rise after the valley at x = 450
    let mut world = World::new();
    world.start();
    world.place(455.0);
    for _ in 0..120 * 8 {
        if world.phase != PHASE_DRIVING || world.x > 545.0 { break; }
        world.step(BUTTON_GAS);
    }
    assert!(world.x > 545.0, "did not crest (x {:.0}, phase {})", world.x, world.phase);
    assert_eq!(world.phase, PHASE_DRIVING);
}

#[test]
fn gas_and_brake_respond_quickly() {
    let mut world = World::new();
    world.start();
    let mut steps = 0;
    while along_speed(&world) < 40.0 && steps < 600 { world.step(BUTTON_GAS); steps += 1; }
    assert!(steps < 120, "0 to 40 on the flat took {:.2} s", steps as f32 / 120.0);
    let mut brake_steps = 0;
    while along_speed(&world) > 2.0 && brake_steps < 600 { world.step(BUTTON_BRAKE); brake_steps += 1; }
    assert!(brake_steps < 100, "braking from 40 took {:.2} s", brake_steps as f32 / 120.0);
    assert_eq!(world.phase, PHASE_DRIVING);
}

#[test]
fn holding_gas_drives_forward_instead_of_spinning() {
    let mut world = World::new();
    world.start();
    for _ in 0..120 * 2 { world.step(BUTTON_GAS); }
    assert!(world.x > 90.0, "drove forward ({})", world.x);
    let nose = wrap_pi(world.angle - grade(world.x));
    assert!(nose.abs() < 0.5, "did not wheelie over ({nose})");
    assert_eq!(world.phase, PHASE_DRIVING);
}

#[test]
fn gas_pulls_steadily_out_of_a_valley() {
    // level at the bottom of the valley at x = 450, the rise starting under the front tyre
    let mut world = World::new();
    world.start();
    world.place(452.0);
    let mut speeds = [0.0f32; 4];
    for (index, speed) in speeds.iter_mut().enumerate() {
        for _ in 0..60 { world.step(BUTTON_GAS); }
        *speed = along_speed(&world);
        assert!(world.contact & 1 != 0 || index == 3, "the rear tyre kept the road ({index})");
    }
    assert!(speeds[0] > 8.0, "it moves off at once ({speeds:?})");
    for pair in speeds.windows(2) {
        assert!(pair[1] - pair[0] < 25.0, "no sudden surge once the slope starts ({speeds:?})");
    }
}

#[test]
fn holding_gas_off_a_jump_can_flip_the_jeep() {
    let mut world = World::new();
    world.start();
    world.place(630.0);
    world.vx = 80.0;
    world.vy = 90.0;
    world.fuel = FUEL_MAX;
    for _ in 0..120 * 5 {
        if world.phase != PHASE_DRIVING { break; }
        world.step(BUTTON_GAS);
    }
    assert_eq!(world.phase, PHASE_CRASHED, "angle {} at x {:.0} y {:.0}", world.angle, world.x, world.y);
}

#[test]
fn an_empty_tank_strands_a_jeep_that_stops() {
    let mut world = World::new();
    world.start();
    world.fuel = 0.0;
    world.vx = 4.0;
    for _ in 0..120 * 3 { world.step(0); }
    assert_eq!(world.phase, PHASE_STRANDED);
}

#[test]
fn a_careful_climb_reaches_the_pass() {
    let mut world = World::new();
    world.start();
    pump(&mut world, 140.0, false);
    assert_eq!(world.phase, PHASE_FINISHED, "phase {} at x {:.0} fuel {:.0} coins {}", world.phase, world.x, world.fuel, world.coins);
    assert!(world.coins >= 8, "coins along the road {}", world.coins);
    assert!(world.score() > FINISH_X as u32);
}

#[test]
fn a_saved_climb_continues_from_the_road() {
    let mut world = World::new();
    world.restore(800.0, 40.0, 3);
    assert_eq!(world.phase, PHASE_DRIVING);
    assert!((world.x - 800.0).abs() < 1.0);
    assert!((world.y - height(800.0)).abs() < 20.0);
    assert!(world.pickups.iter().filter(|pickup| pickup.x < 790.0).all(|pickup| pickup.taken > 0.5));
    pump(&mut world, 4.0, false);
    assert!(world.x > 810.0, "x {}", world.x);
}

#[test]
fn a_long_frame_gap_does_not_throw_the_jeep() {
    let mut game = crate::GhatClimb::new();
    game.start();
    game.set_input(BUTTON_GAS);
    game.advance(-20.0);
    game.advance(f32::NAN);
    game.advance(1.0e9);
    assert!(game.time() < 0.2);
    assert_eq!(game.phase(), PHASE_DRIVING);
}
