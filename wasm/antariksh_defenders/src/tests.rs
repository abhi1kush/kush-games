use crate::waves::{self, COLUMNS, ROWS};
use crate::world::*;
use crate::AntarikshDefenders;

const FRAME: f32 = 1.0 / 60.0;

fn playing_world() -> World {
    let mut world = World::new();
    world.start();
    for _ in 0..((COUNTDOWN_SECONDS / FRAME) as usize + 2) { world.advance(FRAME); }
    assert_eq!(world.phase, Phase::Playing);
    world
}

fn run(world: &mut World, seconds: f32) -> u32 {
    let mut all = 0;
    for _ in 0..(seconds / FRAME) as usize { all |= world.advance(FRAME); }
    all
}

fn silence_enemies(world: &mut World) { world.shot_timer = 1.0e9; world.mystery_timer = 1.0e9; }

#[test]
fn countdown_ticks_then_lifts_off() {
    let mut world = World::new();
    assert_eq!(world.phase, Phase::Ready);
    world.start();
    let mut ticks = 0;
    let mut liftoff = false;
    let mut started = false;
    for _ in 0..((COUNTDOWN_SECONDS / FRAME) as usize + 2) {
        let events = world.advance(FRAME);
        if events & events::COUNTDOWN_TICK != 0 { ticks += 1; }
        if events & events::LIFTOFF != 0 { liftoff = true; }
        if events & events::WAVE_START != 0 { started = true; }
    }
    assert_eq!(ticks, 3);
    assert!(liftoff && started);
    assert_eq!(world.phase, Phase::Playing);
}

#[test]
fn formation_marches_sideways_then_descends_and_turns_at_the_edge() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    let start_x = world.formation_x;
    let start_y = world.formation_y;
    world.march_step();
    assert_eq!(world.formation_x, start_x + MARCH_STEP);
    assert_eq!(world.formation_y, start_y);
    let mut steps = 0;
    while world.formation_y == start_y && steps < 500 { world.march_step(); steps += 1; }
    assert_eq!(world.formation_y, start_y + DESCENT_STEP, "descends after reaching the edge");
    assert_eq!(world.march_direction, -1.0, "and turns around");
    let right = world.enemies.iter().filter(|enemy| enemy.alive).map(|enemy| enemy.x + ENEMY_HALF_WIDTH).fold(0.0, f32::max);
    assert!(right <= WORLD_WIDTH - MARCH_EDGE + 0.01, "never leaves the screen: {right}");
    let x_before = world.formation_x;
    world.march_step();
    assert!(world.formation_x < x_before, "now marches left");
}

#[test]
fn march_speeds_up_as_the_formation_thins() {
    let mut world = playing_world();
    let full = world.march_interval();
    world.debug_thin_formation(world.enemies_alive / 2);
    let half = world.march_interval();
    world.debug_thin_formation(1);
    world.shields = [0; SHIELD_COUNT * SHIELD_CELLS];
    let last = world.march_interval();
    assert!(full > half && half > last, "{full} > {half} > {last}");
    assert!(last <= 0.051);
    // and the steps really come faster
    silence_enemies(&mut world);
    let mut marches = 0;
    for _ in 0..60 { if world.advance(FRAME) & events::MARCH != 0 { marches += 1; } }
    assert!(marches >= 18, "the lone survivor marches every frame or two: {marches}");
}

#[test]
fn player_moves_and_stays_on_screen() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    let start = world.player_x;
    world.input = buttons::RIGHT;
    run(&mut world, 0.5);
    assert!((world.player_x - (start + PLAYER_SPEED * 0.5)).abs() < 2.0);
    run(&mut world, 5.0);
    assert_eq!(world.player_x, PLAYER_MAX_X);
    world.input = 0;
    world.target_x = 40.0;
    run(&mut world, 3.0);
    assert!((world.player_x - 40.0).abs() < 0.01, "finger target reached: {}", world.player_x);
}

#[test]
fn shots_fly_up_at_the_allowed_rate_and_kill_enemies() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9; // freeze the formation
    // under a column
    let target = world.enemies.iter().filter(|enemy| enemy.alive && enemy.row == 4).map(|enemy| enemy.x).find(|x| (x - 64.0).abs() < 9.0).unwrap();
    world.player_x = target;
    world.input = buttons::FIRE;
    let mut shots = 0;
    let mut kills = 0;
    for _ in 0..60 {
        let events = world.advance(FRAME);
        if events & events::SHOOT != 0 { shots += 1; }
        if events & events::ENEMY_DOWN != 0 { kills += 1; }
    }
    assert!(shots >= 2 && shots <= 4, "held fire repeats at the cooldown: {shots}");
    assert!(kills >= 1);
    assert_eq!(world.score, 10 * kills as u32, "bottom rows are asteroids");
    assert_eq!(world.enemies_alive, world.enemies_at_start - kills as u32);
    assert!(world.player_bullets.iter().filter(|bullet| bullet.active).count() <= MAX_PLAYER_SHOTS_IN_FLIGHT);
}

#[test]
fn rows_are_worth_more_higher_up() {
    assert_eq!(EnemyKind::for_row(4).points(), 10);
    assert_eq!(EnemyKind::for_row(2).points(), 20);
    assert_eq!(EnemyKind::for_row(0).points(), 30);
}

#[test]
fn enemy_shots_cost_a_life_then_respawn_with_grace() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.player_x = 120.0;
    world.enemy_bullets[0] = Bullet { active: true, x: 120.0, y: 240.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    let events = run(&mut world, 0.4);
    assert!(events & events::PLAYER_DOWN != 0);
    assert_eq!(world.lives, STARTING_LIVES - 1);
    assert_eq!(world.phase, Phase::Dying);
    run(&mut world, DYING_SECONDS + 0.05);
    assert_eq!(world.phase, Phase::Playing);
    assert!(world.invulnerable_seconds > 1.0);
    world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: 245.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    run(&mut world, 0.3);
    assert_eq!(world.lives, STARTING_LIVES - 1, "invulnerable right after respawn");
}

#[test]
fn no_barriers_in_front_of_the_ship() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    assert_eq!(world.shield_cells_left(), 0, "no satellite barriers");
    // an enemy shot falling through the old barrier line keeps going and reaches the ship
    world.player_x = 36.0;
    world.enemy_bullets[0] = Bullet { active: true, x: 36.0, y: 200.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    let events = run(&mut world, 1.0);
    assert!(events & events::SHIELD_HIT == 0);
    assert_eq!(world.lives, STARTING_LIVES - 1, "nothing blocked the shot");
    world.setup_wave(2);
    assert_eq!(world.shield_cells_left(), 0, "the next wave doesn't rebuild them");
}

#[test]
fn clearing_a_wave_moves_the_journey_on_and_rebuilds() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.debug_thin_formation(1);
    world.shields = [0; SHIELD_COUNT * SHIELD_CELLS];
    let last = world.enemies.iter().position(|enemy| enemy.alive).unwrap();
    world.player_x = world.enemies[last].x;
    world.march_timer = -1.0e9;
    world.input = buttons::FIRE;
    let events = run(&mut world, 1.0);
    world.input = 0;
    assert!(events & events::WAVE_CLEAR != 0);
    assert_eq!(world.phase, Phase::WaveClear);
    run(&mut world, WAVE_CLEAR_SECONDS + 0.05);
    assert_eq!(world.phase, Phase::WaveIntro);
    assert_eq!(world.wave, 2);
    let events = run(&mut world, WAVE_INTRO_SECONDS + 0.05);
    assert!(events & events::WAVE_START != 0);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.enemies_alive, (ROWS * COLUMNS) as u32, "wave 2 is the full 11-column formation");
}

#[test]
fn waves_get_genuinely_harder() {
    let mut previous = waves::difficulty_for_wave(1);
    for wave in 2..=8 {
        let next = waves::difficulty_for_wave(wave);
        assert!(next.start_y >= previous.start_y, "starts lower or equal");
        assert!(next.slowest_step_seconds <= previous.slowest_step_seconds, "marches faster");
        assert!(next.shot_interval_seconds <= previous.shot_interval_seconds, "shoots more often");
        assert!(next.max_enemy_bullets >= previous.max_enemy_bullets);
        assert!(next.aimed_shot_chance >= previous.aimed_shot_chance);
        assert!(next.extra_shooter_chance >= previous.extra_shooter_chance);
        previous = next;
    }
    let first = waves::difficulty_for_wave(1);
    let sixth = waves::difficulty_for_wave(6);
    assert!(sixth.start_y >= first.start_y + 30.0);
    assert!(sixth.slowest_step_seconds < first.slowest_step_seconds * 0.6);
    assert!(sixth.extra_shooter_chance > 0.0, "lower rows double up on fire later on");
    // varied formations
    assert_ne!(waves::formation_for_wave(1), waves::formation_for_wave(2));
    assert_ne!(waves::formation_for_wave(3), waves::formation_for_wave(4));
    // the journey
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(1)], "Low Earth Orbit");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(3)], "Lunar Orbit");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(6)], "Mars Approach");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(40)], "Deep Space");
    assert_eq!((waves::backdrop_for_wave(1), waves::backdrop_for_wave(3), waves::backdrop_for_wave(5), waves::backdrop_for_wave(9)), (0, 1, 2, 3));
}

#[test]
fn later_waves_fire_far_more() {
    let count_shots = |wave: u32| {
        let mut world = playing_world();
        world.setup_wave(wave);
        world.debug_invincible = true;
        world.march_timer = -1.0e9;
        world.mystery_timer = 1.0e9;
        let mut shots = 0;
        for _ in 0..(20.0 / FRAME) as usize { if world.advance(FRAME) & events::ENEMY_SHOOT != 0 { shots += 1; } }
        shots
    };
    let early = count_shots(1);
    let late = count_shots(7);
    assert!(late as f32 > early as f32 * 1.8, "wave 7 fires {late} vs wave 1 {early}");
}

#[test]
fn mystery_ship_crosses_and_pays_out() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.launch_mystery();
    assert!(world.mystery.active && world.mystery.direction > 0.0);
    assert!(MYSTERY_POINTS.contains(&world.mystery.points));
    // it flies right across and leaves on its own
    run(&mut world, (WORLD_WIDTH + 60.0) / MYSTERY_SPEED);
    assert!(!world.mystery.active);
    // the next comes from the other side; shoot it down
    world.launch_mystery();
    assert!(world.mystery.direction < 0.0);
    let points = world.mystery.points;
    let score = world.score;
    let mut hit = false;
    world.player_bullets[0] = Bullet { active: true, x: 0.0, y: MYSTERY_Y + 3.0, velocity_x: 0.0, velocity_y: 0.0, kind: 0, age: 0.0 };
    for _ in 0..600 {
        world.player_bullets[0].x = world.mystery.x;
        world.player_bullets[0].active = world.mystery.active;
        let events = world.advance(FRAME);
        if events & events::MYSTERY_DOWN != 0 { hit = true; break; }
    }
    assert!(hit);
    assert_eq!(world.score, score + points);
    assert!(world.capsules.iter().any(|capsule| capsule.active), "drops a power-up capsule");
    // and it appears by itself every so often
    let mut world = playing_world();
    world.debug_invincible = true;
    world.march_timer = -1.0e9;
    let events = run(&mut world, 30.0);
    assert!(events & events::MYSTERY_APPEAR != 0);
}

#[test]
fn power_ups_triple_shot_and_bubble() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.player_x = 120.0;
    world.drop_capsule(120.0, PLAYER_Y - 20.0, Power::TripleShot);
    let events = run(&mut world, 0.8);
    assert!(events & events::POWER_UP != 0);
    assert_eq!(world.power, Power::TripleShot);
    world.input = buttons::FIRE;
    world.advance(FRAME);
    world.input = 0;
    assert_eq!(world.player_bullets.iter().filter(|bullet| bullet.active).count(), 3);
    run(&mut world, TRIPLE_SHOT_SECONDS);
    assert_eq!(world.power, Power::None, "wears off");
    world.drop_capsule(120.0, PLAYER_Y - 20.0, Power::Bubble);
    run(&mut world, 0.8);
    assert_eq!(world.power, Power::Bubble);
    world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: 240.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    let events = run(&mut world, 0.4);
    assert!(events & events::BUBBLE_POP != 0);
    assert_eq!(world.lives, STARTING_LIVES, "the bubble took the hit");
    assert_eq!(world.power, Power::None);
}

#[test]
fn extra_life_at_the_milestone() {
    let mut world = playing_world();
    world.score = EXTRA_LIFE_EVERY - 5;
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    let target = world.enemies.iter().filter(|enemy| enemy.alive && enemy.row == 4).map(|enemy| enemy.x).find(|x| (x - 64.0).abs() < 9.0).unwrap();
    world.player_x = target;
    world.input = buttons::FIRE;
    let events = run(&mut world, 0.6);
    assert!(events & events::EXTRA_LIFE != 0);
    assert_eq!(world.lives, STARTING_LIVES + 1);
}

#[test]
fn game_over_when_the_formation_reaches_the_invasion_line() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.formation_y = INVASION_LINE - (ROWS as f32 - 1.0) * CELL_HEIGHT - ENEMY_HALF_HEIGHT - DESCENT_STEP + 1.0;
    world.descend_next = true;
    world.march_step();
    assert_eq!(world.phase, Phase::GameOver);
    assert_eq!(world.lives, 0);
}

#[test]
fn game_over_when_out_of_lives() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    let mut saw_game_over = false;
    for _ in 0..STARTING_LIVES {
        world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: 240.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
        world.invulnerable_seconds = 0.0;
        let events = run(&mut world, 0.4 + DYING_SECONDS + 0.1);
        if events & events::GAME_OVER != 0 { saw_game_over = true; }
    }
    assert!(saw_game_over);
    assert_eq!(world.phase, Phase::GameOver);
    world.restart();
    assert_eq!((world.lives, world.score, world.wave, world.phase), (STARTING_LIVES, 0, 1, Phase::Countdown));
}

#[test]
fn saved_runs_restore_at_the_start_of_their_wave() {
    let mut world = World::new();
    assert!(world.restore(4, 2450, 2));
    assert_eq!((world.wave, world.score, world.lives, world.phase), (4, 2450, 2, Phase::Ready));
    assert_eq!(world.difficulty, waves::difficulty_for_wave(4));
    assert_eq!(world.enemies_alive, world.enemies_at_start);
    assert_eq!(world.next_extra_life, EXTRA_LIFE_EVERY);
    assert!(!world.restore(0, 10, 3));
    assert!(!world.restore(2, 10, 0));
    assert!(!world.restore(2, 10, 99));
    let mut world = World::new();
    world.restore(9, 12_300, 3);
    assert_eq!(world.next_extra_life, 15_000, "no free life replayed for points already scored");
    world.start();
    run(&mut world, COUNTDOWN_SECONDS + 0.1);
    assert_eq!(world.phase, Phase::Playing);
}

#[test]
fn hitches_are_dropped_and_slow_frames_capped() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.input = buttons::RIGHT;
    let start = world.player_x;
    let events = world.advance(2.0);
    assert!(events & events::HITCH != 0);
    assert!(world.player_x - start < PLAYER_SPEED / 60.0 + 0.5, "only one frame simulated");
    assert!(world.hitch_grace_seconds > 0.0);
    let start = world.player_x;
    world.advance(0.09);
    assert!(world.player_x - start <= PLAYER_SPEED * MAX_FRAME_SECONDS + 0.5, "slow frame capped at 50 ms");
    // nothing can hurt the player in the grace window
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.advance(1.0);
    world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: PLAYER_Y - 1.0, velocity_x: 0.0, velocity_y: 10.0, kind: 0, age: 0.0 };
    world.advance(FRAME);
    assert_eq!(world.lives, STARTING_LIVES);
}

#[test]
fn render_buffer_matches_the_world() {
    let game = AntarikshDefenders::new();
    let length = AntarikshDefenders::render_length() as usize;
    assert_eq!(length, crate::render_slot::LENGTH);
    let render = unsafe { std::slice::from_raw_parts(game.render_pointer(), length) };
    assert_eq!(render[crate::render_slot::WAVE], 1.0);
    assert_eq!(render[crate::render_slot::LIVES], STARTING_LIVES as f32);
    assert_eq!(render[crate::render_slot::ENEMIES_ALIVE], 45.0);
    assert_eq!(AntarikshDefenders::stage_name(5), "Mars Transfer");
}

#[test]
fn a_full_game_never_panics_and_pools_hold() {
    let mut world = World::new();
    world.seed(7);
    world.start();
    let mut seconds = 0.0;
    while world.phase != Phase::GameOver && seconds < 600.0 {
        // a scrappy bot: chase the nearest column and fire
        let target = world.enemies.iter().filter(|enemy| enemy.alive).map(|enemy| enemy.x)
            .fold(-1.0, |best: f32, x| if best < 0.0 || (x - world.player_x).abs() < (best - world.player_x).abs() { x } else { best });
        world.target_x = target;
        world.input = buttons::FIRE;
        // dodge the nearest incoming shot
        let threat = world.enemy_bullets.iter().filter(|bullet| bullet.active && bullet.y > 170.0 && (bullet.x - world.player_x).abs() < 12.0).map(|bullet| bullet.x).next();
        if let Some(x) = threat { world.target_x = -1.0; world.input |= if x > world.player_x || world.player_x > PLAYER_MAX_X - 15.0 { buttons::LEFT } else { buttons::RIGHT }; }
        world.advance(FRAME);
        seconds += FRAME;
        assert!(world.particles.iter().filter(|particle| particle.active).count() <= MAX_PARTICLES);
    }
    assert!(world.wave >= 2, "the bot clears at least one wave (reached {}, kills {}, alive {}, lives {}, {:?}, {seconds})", world.wave, world.kills, world.enemies_alive, world.lives, world.phase);
}
