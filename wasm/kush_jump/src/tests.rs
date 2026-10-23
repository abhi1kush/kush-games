use crate::level::{tile, CHECKPOINT_COLUMN, FLAG_COLUMN, GROUND_ROW, LEVEL_COLUMNS, TILE};
use crate::world::*;

const FRAME: f32 = 1.0 / 60.0;

fn playing_world() -> World {
    let mut world = World::new();
    world.view_width = 400.0;
    world.reset_stage();
    world.start();
    world
}

fn run(world: &mut World, buttons: u32, seconds: f32) -> u32 {
    world.input = buttons;
    let mut all_events = 0;
    let mut elapsed = 0.0;
    while elapsed < seconds { all_events |= world.advance(FRAME); elapsed += FRAME; }
    all_events
}

fn ground_y(world: &World) -> f32 { GROUND_ROW as f32 * TILE - world.hero.height() }

/// Put a single enemy right next to the hero (the stage's own enemies removed).
fn place_enemy(world: &mut World, kind: EntityKind, column: f32) {
    world.entities.clear();
    let mut entity = Entity { kind, state: EntityState::Active, x: column * TILE, y: 0.0, velocity_x: -0.0, velocity_y: 0.0, timer: 0.0 };
    entity.y = GROUND_ROW as f32 * TILE - entity.height();
    world.entities.push(entity);
}

#[test]
fn the_stage_has_pits_pipes_crates_stairs_and_a_goal() {
    let world = World::new();
    let count = |kind: u8| world.tiles.iter().filter(|&&tile_kind| tile_kind == kind).count();
    assert!(count(tile::BERRY_CRATE) >= 2);
    assert!(count(tile::COIN_CRATE) >= 8);
    assert!(count(tile::BRICK) >= 20);
    assert!(count(tile::PIPE_TOP_LEFT) >= 5);
    assert!(count(tile::STONE) >= 40);
    let pits = (1..LEVEL_COLUMNS).filter(|&column| world.tile_at(column as i32, GROUND_ROW as i32) == tile::EMPTY
        && world.tile_at(column as i32 - 1, GROUND_ROW as i32) != tile::EMPTY).count();
    assert_eq!(pits, 3);
    assert!(world.entities.len() >= 15);
    assert!(CHECKPOINT_COLUMN > 90 && CHECKPOINT_COLUMN < 120);
}

#[test]
fn ready_until_started_then_walks_runs_and_the_camera_only_scrolls_forward() {
    let mut world = World::new();
    world.view_width = 400.0;
    run(&mut world, input::RIGHT, 0.5);
    assert_eq!(world.phase, Phase::Ready);
    assert_eq!(world.hero.x, 3.0 * TILE);
    world.start();
    world.entities.clear();
    run(&mut world, input::RIGHT, 1.0);
    let walked = world.hero.x - 3.0 * TILE;
    assert!(walked > 60.0 && walked < 100.0, "walked {walked}");
    run(&mut world, input::RIGHT | input::RUN, 1.0);
    assert!(world.hero.velocity_x > 150.0, "running speed {}", world.hero.velocity_x);
    assert!(world.camera_x > 0.0);
    let camera = world.camera_x;
    run(&mut world, input::LEFT, 2.5);
    assert!(world.camera_x >= camera, "the camera never scrolls back");
    assert!(world.hero.x >= camera - 0.01, "can't walk back off screen");
}

#[test]
fn jump_height_depends_on_how_long_jump_is_held() {
    let peak = |hold_seconds: f32| {
        let mut world = playing_world();
        world.entities.clear();
        let start = world.hero.y;
        let mut highest = start;
        world.input = input::JUMP;
        let mut time = 0.0;
        while time < 1.2 {
            if time >= hold_seconds { world.input = 0; }
            world.advance(FRAME);
            highest = highest.min(world.hero.y);
            time += FRAME;
        }
        assert!(world.hero.on_ground);
        start - highest
    };
    let tap = peak(0.02);
    let full = peak(1.0);
    assert!(tap > 20.0 && tap < 45.0, "short hop {tap}");
    assert!(full > 68.0 && full < 90.0, "full jump {full}");
}

#[test]
fn a_walking_jump_clears_the_tallest_pipe() {
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(43.0); // pipe of height 4 at columns 47–48
    run(&mut world, input::RIGHT, 0.6);
    let mut time = 0.0;
    while time < 2.5 && world.hero.x < 50.0 * TILE {
        let near_pipe = world.hero.x + HERO_WIDTH > 45.5 * TILE;
        world.input = input::RIGHT | if near_pipe { input::JUMP } else { 0 };
        if near_pipe && world.hero.on_ground { world.press_jump(); }
        world.advance(FRAME);
        time += FRAME;
    }
    assert!(world.hero.x >= 50.0 * TILE, "stuck at {}", world.hero.x / TILE);
}

#[test]
fn bumping_crates_gives_coins_and_a_berry_that_makes_the_hero_big_and_lets_it_break_bricks() {
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(15.1); // coin crate above at column 15
    world.press_jump();
    let events = run(&mut world, input::JUMP, 0.8);
    assert!(events & events::COIN != 0);
    assert_eq!(world.coins, 1);
    assert_eq!(world.tile_at(15, 9), tile::USED_CRATE);
    assert_eq!(world.score, 200);

    world.teleport(20.1); // berry crate
    world.press_jump();
    let events = run(&mut world, input::JUMP, 0.5);
    assert!(events & events::POWER_UP_APPEARS != 0);
    let berry = world.entities.iter().find(|entity| entity.kind == EntityKind::Berry).copied().expect("berry");
    assert!(berry.y < 9.0 * TILE);
    // the berry slides off its crate to the right and drops; walk after it
    let mut grew = false;
    for _ in 0..240 { if run(&mut world, input::RIGHT, FRAME) & events::POWER_UP != 0 { grew = true; break; } }
    assert!(grew && world.hero.is_big, "berry collected");
    assert_eq!(world.hero.height(), BIG_HEIGHT);

    // big: a brick breaks; small: it only bumps
    world.teleport(19.1);
    world.press_jump();
    let events = run(&mut world, input::JUMP, 0.5);
    assert!(events & events::BREAK != 0);
    assert_eq!(world.tile_at(19, 9), tile::EMPTY);
    let mut small = playing_world();
    small.teleport(19.1);
    small.press_jump();
    let events = run(&mut small, input::JUMP, 0.5);
    assert!(events & events::BREAK == 0 && events & events::BUMP != 0);
    assert_eq!(small.tile_at(19, 9), tile::BRICK);
}

#[test]
fn stomping_a_walker_squashes_it_and_bounces_the_hero() {
    let mut world = playing_world();
    world.teleport(10.0);
    place_enemy(&mut world, EntityKind::Walker, 11.0);
    world.hero.y -= 40.0; // falling onto it
    world.hero.x = 11.0 * TILE;
    let events = run(&mut world, 0, 0.3);
    assert!(events & events::STOMP != 0);
    assert_eq!(world.enemies_defeated, 1);
    assert!(events & events::DEATH == 0);
    assert_eq!(world.score, 100);
}

#[test]
fn walking_into_a_walker_hurts_big_shrinks_and_small_dies_then_respawns() {
    let mut world = playing_world();
    world.teleport(10.0);
    world.hero.is_big = true;
    world.hero.y = ground_y(&world) - (BIG_HEIGHT - SMALL_HEIGHT);
    place_enemy(&mut world, EntityKind::Walker, 11.0);
    let events = run(&mut world, input::RIGHT, 0.3);
    assert!(events & events::SHRINK != 0);
    assert!(!world.hero.is_big && world.hero.invulnerable_seconds > 0.0);
    assert_eq!(world.phase, Phase::Playing);
    world.entities.clear();
    run(&mut world, 0, INVULNERABLE_TEST_WAIT);
    let hero_column = world.hero.x / TILE;
    place_enemy(&mut world, EntityKind::Walker, hero_column + 0.5);
    let events = run(&mut world, 0, 0.2);
    assert!(events & events::DEATH != 0);
    assert_eq!(world.phase, Phase::Dying);
    let events = run(&mut world, 0, 3.0);
    assert!(events & events::LIFE_LOST != 0);
    assert_eq!(world.lives, START_LIVES - 1);
    assert_eq!(world.phase, Phase::Ready);
    assert_eq!(world.hero.x, 3.0 * TILE, "back at the start (no checkpoint yet)");
}
const INVULNERABLE_TEST_WAIT: f32 = 2.2;

#[test]
fn a_kicked_shell_slides_and_knocks_out_walkers() {
    let mut world = playing_world();
    world.teleport(10.0);
    place_enemy(&mut world, EntityKind::Shellbug, 11.0);
    world.hero.x = 11.0 * TILE;
    world.hero.y -= 40.0;
    run(&mut world, 0, 0.3);
    assert_eq!(world.entities[0].kind, EntityKind::Shell);
    world.entities[0].velocity_x = 0.0; // (the bounce may have landed on it and kicked it already)
    world.entities[0].x = 11.0 * TILE;
    // a walker further right, then kick the shell toward it
    let mut walker = Entity { kind: EntityKind::Walker, state: EntityState::Active, x: 20.0 * TILE, y: 0.0, velocity_x: -32.0, velocity_y: 0.0, timer: 0.0 };
    walker.y = GROUND_ROW as f32 * TILE - walker.height();
    world.entities.push(walker);
    world.hero.x = world.entities[0].x - HERO_WIDTH - 2.0;
    world.hero.y = ground_y(&world);
    let events = run(&mut world, input::RIGHT, 0.2);
    assert!(events & events::KICK != 0);
    assert!(world.entities[0].velocity_x > 200.0);
    assert_eq!(world.phase, Phase::Playing, "kicking doesn't hurt");
    run(&mut world, 0, 1.0);
    assert_eq!(world.enemies_defeated, 2, "stomp + shell hit");
}

#[test]
fn falling_into_a_pit_costs_a_life_and_the_checkpoint_is_the_restart_point() {
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(CHECKPOINT_COLUMN as f32 + 1.0);
    run(&mut world, 0, 0.1);
    assert!(world.checkpoint_reached);
    world.teleport(150.0);
    world.entities.clear();
    // walk off the edge into the pit at 152–154
    run(&mut world, input::RIGHT, 3.0);
    let events = run(&mut world, 0, 4.0);
    assert!(events & events::LIFE_LOST != 0, "life lost");
    assert_eq!(world.phase, Phase::Ready);
    assert_eq!(world.hero.x, CHECKPOINT_COLUMN as f32 * TILE);
}

#[test]
fn a_hitch_drops_the_frame_and_never_kills_the_hero() {
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(10.0);
    world.input = input::RIGHT;
    let before = world.hero.x;
    let events = world.advance(2.0); // the tab froze for two seconds
    assert!(events & events::HITCH != 0);
    assert!(world.hero.x - before < 4.0, "moved {} in a 2 s hitch", world.hero.x - before);
    // slow frames are capped at 50 ms
    let before = world.hero.x;
    world.advance(0.09);
    assert!(world.hero.x - before < 0.06 * RUN_TEST_SPEED_LIMIT);
    // an enemy touch during the grace period doesn't hurt
    let hero_column = world.hero.x / TILE;
    place_enemy(&mut world, EntityKind::Walker, hero_column + 0.3);
    world.advance(0.5);
    let events = world.advance(FRAME);
    assert!(events & (events::DEATH | events::SHRINK) == 0);
    // a pit fall right after a hitch puts the hero back on safe ground
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(66.5);
    run(&mut world, input::RIGHT | input::RUN, 0.3);
    world.hero.x = 69.0 * TILE;
    world.hero.y = LEVEL_HEIGHT + 16.0;
    let mut events = world.advance(0.4);
    for _ in 0..8 { events |= world.advance(FRAME); }
    assert!(events & events::RESCUE != 0, "rescued");
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.lives, START_LIVES);
}
const RUN_TEST_SPEED_LIMIT: f32 = 200.0;

#[test]
fn reaching_the_pole_slides_down_walks_to_the_fort_and_counts_the_time_bonus() {
    let mut world = playing_world();
    world.entities.clear();
    world.teleport(FLAG_COLUMN as f32 - 4.0);
    let score_before = world.score;
    let events = run(&mut world, input::RIGHT, 2.0);
    assert!(events & events::FLAG != 0);
    assert_eq!(world.phase, Phase::Goal);
    let time_left = world.time_left.ceil() as u32;
    let mut all_events = 0;
    for _ in 0..1200 { all_events |= run(&mut world, 0, FRAME); if world.phase == Phase::Cleared { break; } }
    assert!(all_events & events::STAGE_CLEAR != 0);
    assert_eq!(world.phase, Phase::Cleared);
    assert!(world.score >= score_before + 100 + time_left * 50 - 50, "score {} (time left {time_left})", world.score);
    assert_eq!(world.hero.pose, HeroPose::Hidden);
}

#[test]
fn running_out_of_time_or_lives_ends_the_game_and_restart_resets_everything() {
    let mut world = playing_world();
    world.lives = 1;
    world.time_left = 0.2;
    let events = run(&mut world, 0, 0.3);
    assert!(events & events::DEATH != 0);
    let events = run(&mut world, 0, 3.0);
    assert!(events & events::GAME_OVER != 0);
    assert_eq!(world.phase, Phase::GameOver);
    world.restart();
    assert_eq!((world.lives, world.score, world.coins, world.phase), (START_LIVES, 0, 0, Phase::Ready));
}

#[test]
fn saved_progress_restores_at_the_checkpoint() {
    let mut world = World::new();
    assert!(world.restore(true, 2, 4500, 12));
    assert_eq!((world.lives, world.score, world.coins), (2, 4500, 12));
    assert_eq!(world.hero.x, CHECKPOINT_COLUMN as f32 * TILE);
    assert!(!world.restore(false, 0, 0, 0));
}

/// A simple bot holds run + right and jumps at walls and pits: with enemies removed, the stage can be finished
/// from the start without a life lost (the layout has no impossible jumps).
#[test]
fn the_whole_stage_can_be_run_through() {
    let mut world = playing_world();
    world.entities.clear();
    let mut time = 0.0;
    let mut jump_hold = 0.0;
    while time < 120.0 && world.phase == Phase::Playing {
        world.entities.clear();
        let hero = world.hero;
        let feet_row = ((hero.y + hero.height()) / TILE) as i32;
        let ahead = ((hero.x + HERO_WIDTH + 10.0) / TILE) as i32;
        let wall_ahead = (0..3).any(|rows_up| world.tile_at(ahead, feet_row - 1 - rows_up) != tile::EMPTY && world.tile_at(ahead, feet_row - 1 - rows_up) != tile::COIN);
        let pit_ahead = hero.on_ground && (0..3).any(|step| world.tile_at(ahead + step, GROUND_ROW as i32) == tile::EMPTY && world.tile_at(ahead + step, feet_row) == tile::EMPTY);
        if hero.on_ground && (wall_ahead || pit_ahead) { world.press_jump(); jump_hold = 0.5; }
        world.input = input::RIGHT | input::RUN | if jump_hold > 0.0 { input::JUMP } else { 0 };
        jump_hold -= FRAME;
        world.advance(FRAME);
        time += FRAME;
    }
    assert_eq!(world.phase, Phase::Goal, "bot stopped at column {} ({:?}) after {time:.1}s", world.hero.x / TILE, world.phase);
    assert_eq!(world.lives, START_LIVES);
}
