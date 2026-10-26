//! Includes a scripted run that plays the intended solution of the whole stage, so the stage is known clearable.
use crate::stage::*;
use crate::world::*;
use crate::EmberLane;

fn run(game: &mut EmberLane, buttons: u8, seconds: f32) {
    game.set_input(buttons);
    let steps = (seconds * 60.0).round() as u32;
    for _ in 0..steps { game.advance(1000.0 / 60.0); }
    game.set_input(0);
}

/// Walk right until x (or until `limit` seconds pass).
fn walk_to(game: &mut EmberLane, x: f32) {
    let buttons = if x > game.player_x() { BUTTON_RIGHT } else { BUTTON_LEFT };
    game.set_input(buttons);
    for _ in 0..60 * 60 {
        if (buttons == BUTTON_RIGHT && game.player_x() >= x) || (buttons == BUTTON_LEFT && game.player_x() <= x) || game.state() == STATE_DEAD { break; }
        game.advance(1000.0 / 60.0);
    }
    game.set_input(0);
}

fn wait(game: &mut EmberLane, seconds: f32) { run(game, 0, seconds); }

/// Wait until the guttering torch has just flared up to full.
fn wait_for_flare(game: &mut EmberLane) {
    let mut was_full = game.world.flicker_intensity() >= 1.0;
    for _ in 0..60 * 12 {
        game.advance(1000.0 / 60.0);
        let full = game.world.flicker_intensity() >= 1.0;
        if full && !was_full { return; }
        was_full = full;
    }
    panic!("the torch never flared");
}

#[test]
fn light_falls_off_and_crates_cast_shadows() {
    let world = World::new();
    assert!(world.is_lit(60.0), "the hearth lights the start");
    assert!(!world.is_lit(1300.0), "the first brazier starts cold");
    let brazier = world.lights[11];
    assert!(world.is_lit(brazier.x + 40.0));
    assert!(!world.is_lit(CRATES[0].0 + 40.0), "the crate shades the street behind it");
    assert!(world.light_at(60.0) > world.light_at(60.0 + 190.0 * 0.95), "light fades towards its edge");
}

#[test]
fn rats_stay_in_the_dark_and_bite_in_it() {
    let mut world = World::new();
    for _ in 0..240 { world.step(0); }
    for rat in world.rats.iter() {
        if rat.state == crate::rats::RAT_ACTIVE { assert!(!world.is_lit(rat.x) || rat.vx.abs() > 0.0, "active rats keep out of the light"); }
        let (x0, x1, _) = ZONES[rat.zone as usize];
        assert!(rat.x >= x0 && rat.x <= x1, "rats never leave their nest");
    }
    // stand in the middle of the dark alley: the swarm gets you
    let mut game = EmberLane::new();
    game.debug_warp(2);
    game.world.player_x = 2100.0;
    game.world.sibling_x = 2080.0;
    let mut died = false;
    for _ in 0..60 * 5 { game.advance(1000.0 / 60.0); if game.take_events() & EVENT_DEATH != 0 { died = true; break; } }
    assert!(died, "darkness with rats is deadly");
}

#[test]
fn death_returns_to_the_last_checkpoint() {
    let mut game = EmberLane::new();
    game.debug_warp(1);
    game.world.player_x = 1350.0;
    game.world.sibling_x = 1330.0;
    run(&mut game, 0, 5.0);
    assert_eq!(game.deaths(), 1);
    assert!((game.player_x() - CHECKPOINTS[1].0).abs() < 1.0, "back at the checkpoint ({})", game.player_x());
    assert_eq!(game.embers(), 3, "embers restored");
    assert_ne!(game.state(), STATE_DEAD);
}

#[test]
fn embers_light_braziers_and_the_fire_pot_burns_out() {
    let mut game = EmberLane::new();
    game.debug_warp(1);
    walk_to(&mut game, 1060.0);
    assert_eq!(game.throw_target(), 6);
    assert!(game.throw_ember());
    wait(&mut game, 1.2);
    assert!(game.world.is_lit(1290.0), "the brazier caught");
    assert_eq!(game.embers(), 2);
    let mut fizzle = EmberLane::new();
    fizzle.debug_warp(1);
    fizzle.world.facing = -1.0;
    assert_eq!(fizzle.throw_target(), -1);
    fizzle.throw_ember();
    wait(&mut fizzle, 1.2);
    assert!(fizzle.take_events() & EVENT_FIZZLE != 0, "nothing to light: the ember is wasted");
    assert_eq!(fizzle.embers(), 2);
}

#[test]
fn levers_share_one_rope() {
    let mut world = World::new();
    world.player_x = LEVERS[0].0;
    world.interact();
    assert!(world.base_lit[WINDOW_A] && !world.base_lit[WINDOW_B]);
    world.player_x = LEVERS[1].0;
    world.interact();
    assert!(world.base_lit[WINDOW_B] && !world.base_lit[WINDOW_A], "opening B closes A");
}

#[test]
fn the_advance_clock_survives_bad_frame_gaps() {
    let mut game = EmberLane::new();
    game.advance(-50.0);
    game.advance(f32::NAN);
    game.advance(1.0e9);
    assert!(game.time() <= MAX_STEPS as f32 * STEP + 1e-4);
}

#[test]
fn the_whole_stage_can_be_cleared_without_dying() {
    let mut game = EmberLane::new();
    // 1. torches and the flickering torch: wait for the flare, then cross
    run(&mut game, BUTTON_RIGHT, 6.0); // walk up the staircase; she stops on the landing
    assert_eq!(game.standing_on(), STAIRS as i32);
    wait_for_flare(&mut game); // watch it from the landing
    walk_to(&mut game, 1000.0); // down the far steps and across while it burns
    assert_eq!(game.deaths(), 0, "flicker section");
    assert_eq!(game.checkpoint(), 1);
    // 2. braziers
    walk_to(&mut game, 1060.0);
    assert!(game.throw_ember());
    wait(&mut game, 1.4);
    walk_to(&mut game, 1300.0);
    wait(&mut game, 0.8);
    assert_eq!(game.throw_target(), 7);
    assert!(game.throw_ember());
    wait(&mut game, 1.4);
    walk_to(&mut game, 1705.0);
    assert_eq!(game.deaths(), 0, "brazier section");
    assert_eq!(game.checkpoint(), 2);
    // 3. lantern alley
    walk_to(&mut game, 1765.0);
    assert_eq!(game.prompt(), PROMPT_TAKE_LANTERN);
    game.interact();
    assert!(game.carrying());
    walk_to(&mut game, 2415.0);
    assert_eq!(game.deaths(), 0, "lantern alley");
    assert_eq!(game.checkpoint(), 3);
    if game.carrying() { game.interact(); }
    // 4. crate + fire pot: light the pot, climb onto the crate, hop down beyond it, push the crate back
    walk_to(&mut game, 2530.0);
    assert_eq!(game.throw_target(), 12);
    assert!(game.throw_ember());
    wait(&mut game, 1.2);
    walk_to(&mut game, 2552.0);
    assert_eq!(game.prompt(), PROMPT_CLIMB);
    game.interact();
    wait(&mut game, 0.7);
    assert!(game.on_crate(), "climbed onto the crate");
    run(&mut game, BUTTON_RIGHT, 1.0); // walk off the far edge: hop down beside the burning pot
    assert!(!game.on_crate() && game.player_x() > CRATES[0].0 + CRATES[0].1);
    walk_to(&mut game, 2500.0); // push the crate back past the brazier
    assert!(game.crate_x(0) < 2520.0, "crate moved behind the brazier ({})", game.crate_x(0));
    walk_to(&mut game, 3005.0);
    assert_eq!(game.deaths(), 0, "crate section");
    assert_eq!(game.checkpoint(), 4);
    // 5. shutters
    walk_to(&mut game, LEVERS[0].1 as f32 * 0.0 + 3060.0);
    game.interact();
    wait(&mut game, 1.0);
    walk_to(&mut game, 3262.0);
    game.interact();
    wait(&mut game, 0.5);
    walk_to(&mut game, DOOR_X);
    wait(&mut game, 0.5);
    assert_eq!(game.deaths(), 0, "shutter section");
    assert!(game.cleared(), "reached the sanctuary door");
}


/// Cooper's Yard, played the way that used to dead-end: slide the crate right first. The crate now stops before it
/// covers the fire pot, climbing puts Mira ON the crate (out of the rats' reach), and the section still clears.
#[test]
fn crate_section_survives_sliding_the_crate_first() {
    let mut game = EmberLane::new();
    game.debug_warp(3);
    run(&mut game, BUTTON_RIGHT, 6.0); // walk into the crate and keep pushing
    assert!(game.crate_x(0) <= CRATES[0].4 && CRATES[0].4 < 2625.0 - CRATES[0].1, "the crate can't be slid over the fire pot");
    assert_eq!(game.deaths(), 0, "pushing along the brazier's light is safe");
    assert_eq!(game.prompt(), PROMPT_CLIMB);
    // climb up without lighting anything: safe up there, even in the crate's shadow, for as long as you like
    game.interact();
    wait(&mut game, 0.7);
    assert!(game.on_crate());
    assert_eq!(game.prompt(), PROMPT_HOP_DOWN);
    wait(&mut game, 6.0);
    assert_eq!(game.deaths(), 0, "rats can't reach the top of the crate");
    // light the pot from the top, hop down on the far side, push the crate back behind the brazier
    assert_eq!(game.throw_target(), 12, "the fire pot is still ahead");
    assert!(game.throw_ember());
    wait(&mut game, 1.2);
    assert!(game.pot_left() > 0.0);
    game.interact(); // hop down (facing right)
    wait(&mut game, 0.7);
    assert!(!game.on_crate() && game.player_x() > game.crate_x(0));
    assert!(game.player_lit(), "landing beside the burning pot");
    walk_to(&mut game, 2500.0);
    assert!(game.crate_x(0) < 2520.0);
    walk_to(&mut game, 3005.0);
    assert_eq!(game.deaths(), 0, "Cooper's Yard cleared without a death");
    assert_eq!(game.checkpoint(), 4);
}

/// Hopping down into the dark is recoverable: turn round and climb back up before the rats bite.
#[test]
fn hopping_into_the_dark_can_climb_back() {
    let mut game = EmberLane::new();
    game.debug_warp(3);
    walk_to(&mut game, 2552.0);
    game.interact();
    wait(&mut game, 0.7);
    run(&mut game, BUTTON_RIGHT, 0.8); // off the far edge, no pot lit
    assert!(!game.on_crate() && !game.player_lit());
    run(&mut game, BUTTON_LEFT, 0.05);
    assert_eq!(game.prompt(), PROMPT_CLIMB, "facing the crate again offers the climb");
    game.interact();
    wait(&mut game, 3.0);
    assert!(game.on_crate());
    assert!(game.sibling_y() > OUT_OF_REACH, "Kabir climbs up beside Mira");
    assert_eq!(game.deaths(), 0);
}

/// A new run (Play again, Start over) starts with a full set of embers, and every checkpoint tops them up.
#[test]
fn a_new_run_starts_with_embers_and_checkpoints_top_them_up() {
    let mut game = EmberLane::new();
    assert_eq!(game.embers(), CHECKPOINTS[0].1);
    assert!(game.embers() >= 3);
    walk_to(&mut game, 300.0);
    game.world.facing = 1.0;
    assert!(game.throw_ember()); // waste one
    wait(&mut game, 1.0);
    assert_eq!(game.embers(), 2);
    let again = EmberLane::new();
    assert_eq!(again.embers(), CHECKPOINTS[0].1, "a fresh run is not affected by the old one");
    game.debug_warp(1);
    assert_eq!(game.embers(), 3, "Torch Lane tops up to three");
}

/// The guttering torch burns steadily until Mira is standing on the staircase's landing. Only then does it go out,
/// stay dark for a beat, flare and run its cycle, so she sees the whole pattern from a safe spot.
#[test]
fn the_guttering_torch_starts_its_cycle_when_mira_is_on_the_landing() {
    let mut game = EmberLane::new();
    let torch = FLICKER;
    let foot = STAIRS_X - STAIRS_HALF - HALF_BODY - 4.0;
    run(&mut game, 0, 20.0); // dawdle at the start
    assert_eq!(game.world.lights[torch].intensity, 1.0, "steady before Mira is on the stairs");
    walk_to(&mut game, foot); // at the foot of the staircase
    run(&mut game, 0, 8.0);
    assert!(game.world.flicker_start < 0.0, "approaching doesn't start it");
    assert_eq!(game.world.lights[torch].intensity, 1.0);
    // walk up: not while still on the steps
    game.set_input(BUTTON_RIGHT);
    for _ in 0..60 * 3 { game.advance(1000.0 / 60.0); if game.state() == STATE_CLIMB { break; } }
    assert_eq!(game.state(), STATE_CLIMB, "walking into the staircase walks her up it");
    assert!(game.world.flicker_start < 0.0, "not while still on the steps");
    for _ in 0..60 * 3 { game.advance(1000.0 / 60.0); if game.state() != STATE_CLIMB { break; } }
    game.set_input(0);
    assert_eq!(game.standing_on(), STAIRS as i32);
    assert!(game.world.flicker_start >= 0.0, "on the landing it starts");
    assert_eq!(game.world.lights[torch].intensity, 0.0, "it goes out first");
    run(&mut game, 0, FLICKER_FIRST_DARK - 0.1);
    assert_eq!(game.world.lights[torch].intensity, 0.0, "a dark beat");
    run(&mut game, 0, 0.4);
    assert_eq!(game.world.lights[torch].intensity, 1.0, "then it flares up");
    // and keeps cycling: dark again, then bright again
    let mut seen_dark = false;
    let mut seen_bright_again = false;
    for _ in 0..60 * 7 {
        game.advance(1000.0 / 60.0);
        let level = game.world.lights[torch].intensity;
        if level == 0.0 { seen_dark = true; }
        if seen_dark && level == 1.0 { seen_bright_again = true; }
    }
    assert!(seen_dark && seen_bright_again, "it gutters out and flares again");
    // hopping down doesn't stop it
    game.interact();
    run(&mut game, 0, 1.0);
    assert!(game.world.flicker_start >= 0.0);
    // a fall before Torch Lane's checkpoint resets it: steady again until she's back on the wall
    let mut died = false;
    for _ in 0..60 * 12 {
        game.world.player_x = 690.0;
        game.world.sibling_x = 670.0;
        game.advance(1000.0 / 60.0);
        if game.take_events() & EVENT_DEATH != 0 { died = true; break; }
    }
    assert!(died, "the dark stretch is deadly while it gutters");
    run(&mut game, 0, DEATH_SECONDS + 0.2);
    assert!(game.world.flicker_start < 0.0);
    assert_eq!(game.world.lights[torch].intensity, 1.0);
}

/// The stone wall before the guttering torch can't be walked through or pushed: Mira must climb it, which takes
/// time, so she sees the torch gutter before she can cross. It doesn't shade the street.
/// A fixed stone staircase stands before the guttering torch. Walking into it walks Mira up the steps (Kabir trots up
/// after her); she stops on the landing until the key is let go, then walks on down the far flight. It never moves.
#[test]
fn the_staircase_leads_up_and_over_before_the_guttering_torch() {
    let mut game = EmberLane::new();
    let (stairs_x, half, height, ..) = CRATES[STAIRS];
    assert!(stairs_x + half < LIGHTS[FLICKER].0 - LIGHTS[FLICKER].2 * 0.85, "the stairs stand before the torch's light");
    // the steps rise evenly to the landing on both sides
    let world = World::new();
    let profile: Vec<f32> = (0..=14).map(|i| world.stairs_height(stairs_x - half - 2.0 + i as f32 * 2.0)).collect();
    assert!(profile.windows(2).all(|pair| pair[1] >= pair[0]), "steps go up, never down, towards the landing");
    assert_eq!(world.stairs_height(stairs_x), height);
    assert_eq!(world.stairs_height(stairs_x + half - 1.0), height / STAIRS_STEPS, "one step from the bottom");
    assert_eq!(world.stairs_height(stairs_x + half + 1.0), 0.0);
    // walk up by just holding right
    let start = game.time();
    let mut heights = Vec::new();
    game.set_input(BUTTON_RIGHT);
    for _ in 0..60 * 8 {
        game.advance(1000.0 / 60.0);
        if game.state() == STATE_CLIMB { heights.push(game.player_y()); }
        if game.standing_on() == STAIRS as i32 && game.state() != STATE_CLIMB { break; }
    }
    assert_eq!(game.standing_on(), STAIRS as i32, "walking into the staircase walks her up it");
    assert!(heights.iter().any(|&y| y > 2.0 && y < height - 2.0), "she goes up step by step");
    assert_eq!(game.crate_x(STAIRS), stairs_x, "the staircase never moves");
    assert_eq!(game.deaths(), 0);
    // still holding right: she waits on the landing
    run(&mut game, BUTTON_RIGHT, 1.5);
    assert_eq!(game.standing_on(), STAIRS as i32, "she stops on the landing while the key is held");
    assert!((game.player_x() - stairs_x).abs() <= STAIRS_LANDING && game.player_y() == height);
    assert!(game.sibling_y() >= OUT_OF_REACH && (game.sibling_x() - stairs_x).abs() <= STAIRS_LANDING, "Kabir is up on the landing too ({} {} / {})", game.sibling_x(), game.sibling_y(), game.player_x());
    assert!(game.player_lit(), "the staircase stands in the previous torch's light");
    assert!(game.world.is_lit(stairs_x + half + 12.0), "and it casts no shadow on the far side");
    assert_eq!(game.prompt(), PROMPT_HOP_DOWN);
    // let go, then walk on: down the far flight
    run(&mut game, 0, 0.1);
    let mut down_at = None;
    game.set_input(BUTTON_RIGHT);
    for _ in 0..60 * 5 {
        game.advance(1000.0 / 60.0);
        if game.player_x() > stairs_x + half + HALF_BODY && game.player_y() == 0.0 && game.state() != STATE_CLIMB { down_at = Some(game.time()); break; }
    }
    let took = down_at.expect("down the far side") - start;
    assert!(took >= 2.0 * CLIMB_SECONDS, "up and down takes real time ({took:.2} s)");
    walk_to(&mut game, stairs_x + half + 40.0);
    run(&mut game, 0, 1.5);
    assert!(game.sibling_x() > stairs_x + half && game.sibling_y() < 1.0, "Kabir follows down the steps");
    // E at the foot climbs it too
    let mut game = EmberLane::new();
    walk_to(&mut game, stairs_x - half - HALF_BODY - 4.0);
    run(&mut game, 0, 0.3);
    game.world.facing = 1.0;
    assert_eq!(game.prompt(), PROMPT_CLIMB);
    game.interact();
    run(&mut game, 0, CLIMB_SECONDS + 0.1);
    assert_eq!(game.standing_on(), STAIRS as i32);
}

/// From the lantern's hook, a non-stop walk crosses the dark alley safely, but the oil is spent before Mira reaches
/// Cooper's Yard's crate, so the lantern can't light her way past the crate puzzle. A short stop in the alley is
/// still fine.
#[test]
fn the_lantern_lasts_through_the_alley_but_not_past_the_crate() {
    let crate_foot = CRATES[0].0 - CRATES[0].1 - HALF_BODY;
    // non-stop
    let mut game = EmberLane::new();
    game.debug_warp(2);
    walk_to(&mut game, LIGHTS[LANTERN].0);
    assert_eq!(game.prompt(), PROMPT_TAKE_LANTERN);
    game.interact();
    game.set_input(BUTTON_RIGHT);
    let mut out_at = None;
    for _ in 0..60 * 20 {
        game.advance(1000.0 / 60.0);
        if game.take_events() & EVENT_LANTERN_OUT != 0 { out_at = Some(game.player_x()); break; }
        if game.player_x() >= crate_foot - 1.0 { break; }
    }
    game.set_input(0);
    let out_at = out_at.expect("the lantern went out before the crate");
    assert!(out_at < crate_foot - 40.0, "spent well before the crate ({out_at:.0})");
    assert!(!game.carrying());
    assert!(out_at > ZONES[2].1 - 100.0 && game.world.is_lit(out_at) && game.world.is_lit(game.sibling_x()), "out in the brazier's light, not the alley ({out_at:.0})");
    run(&mut game, 0, 2.0);
    assert_eq!(game.deaths(), 0, "the non-stop walk is safe");
    // walking on to the crate and over it with no lantern is what the puzzle is for
    walk_to(&mut game, crate_foot - 2.0);
    assert!(!game.carrying(), "no lantern at the crate");
    // a short stop in the alley still gets them both into the light
    let mut game = EmberLane::new();
    game.debug_warp(2);
    walk_to(&mut game, LIGHTS[LANTERN].0);
    game.interact();
    walk_to(&mut game, 2000.0);
    run(&mut game, 0, 1.2);
    walk_to(&mut game, 2440.0);
    run(&mut game, 0, 2.0);
    assert_eq!(game.deaths(), 0, "a short stop in the alley is fine");
}
