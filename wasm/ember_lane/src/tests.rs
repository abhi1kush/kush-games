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
    walk_to(&mut game, 540.0);
    while game.world.time % 5.0 > 0.05 { game.advance(1000.0 / 60.0); }
    wait(&mut game, 0.1);
    walk_to(&mut game, 1000.0);
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
    assert!(game.sibling_y() > OUT_OF_REACH, "Lio climbs up beside Mira");
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
