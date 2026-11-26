use crate::waves;
use crate::world::*;
use crate::{render_slot, ZombieRoad};

const FRAME: f32 = 1.0 / 60.0;

fn run(world: &mut World, seconds: f32) -> u32 {
    let mut all = 0;
    for _ in 0..(seconds / FRAME) as usize { all |= world.advance(FRAME); }
    all
}

fn playing_world() -> World {
    let mut world = World::new();
    world.seed(7);
    world.start();
    assert_eq!(world.phase, Phase::WaveIntro);
    run(&mut world, WAVE_INTRO_SECONDS + 0.1);
    assert_eq!(world.phase, Phase::Playing);
    world
}

/// No new zombies arrive on their own (tests place them by hand); one stays "unspawned" so the wave never ends.
fn stop_spawning(world: &mut World) {
    world.regular_spawned = world.plan.regular_total - 1;
    world.tank_spawned = true;
    world.spawn_timer = 1.0e9;
}

#[test]
fn starts_ready_then_shows_the_wave_banner_then_plays() {
    let mut world = World::new();
    assert_eq!(world.phase, Phase::Ready);
    assert_eq!(run(&mut world, 1.0), 0, "nothing happens before start");
    world.start();
    let events = run(&mut world, WAVE_INTRO_SECONDS + 0.1);
    assert!(events & events::WAVE_START != 0);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!((world.wave, world.lives, world.health), (1, START_LIVES, MAX_HEALTH));
}

#[test]
fn moves_with_buttons_and_follows_a_finger_within_the_road() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    let start = world.player_x;
    world.input = buttons::RIGHT;
    run(&mut world, 0.5);
    assert!(world.player_x > start + 50.0);
    world.input = buttons::LEFT;
    run(&mut world, 5.0);
    assert_eq!(world.player_x, PLAYER_MIN_X);
    world.input = 0;
    world.target_x = 180.0;
    run(&mut world, 2.0);
    assert!((world.player_x - 180.0).abs() < 0.5);
}

#[test]
fn shooting_a_zombie_scores_and_counts_a_kill() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    assert!(world.spawn_zombie(ZombieKind::Walker, world.player_x, 80.0));
    world.input = buttons::FIRE;
    let events = run(&mut world, 2.0);
    assert!(events & events::SHOOT != 0);
    assert!(events & events::ZOMBIE_DOWN != 0);
    assert_eq!(world.kills, 1);
    assert_eq!(world.score % 10, 0);
    assert!(world.score >= stats(ZombieKind::Walker).points);
}

#[test]
fn auto_fire_shoots_without_holding_fire() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.auto_fire = true;
    let events = run(&mut world, 1.0);
    assert!(events & events::SHOOT != 0);
    world.auto_fire = false;
    run(&mut world, 1.0);
    assert_eq!(run(&mut world, 1.0) & events::SHOOT, 0);
}

#[test]
fn a_brute_takes_many_hits() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.spawn_zombie(ZombieKind::Brute, world.player_x, 40.0);
    world.input = buttons::FIRE;
    let events = run(&mut world, 1.0);
    assert!(events & events::ZOMBIE_HIT != 0);
    assert_eq!(world.kills, 0, "three shots don't drop a brute");
    run(&mut world, 5.0);
    assert_eq!(world.kills, 1);
}

#[test]
fn a_zombie_reaching_the_line_hurts_then_lives_run_out_into_game_over() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.player_x = PLAYER_MIN_X;
    world.spawn_zombie(ZombieKind::Walker, 200.0, DEFENSE_LINE_Y - 2.0);
    let events = run(&mut world, 1.0);
    assert!(events & events::BREACH != 0 && events & events::PLAYER_HURT != 0);
    assert_eq!(world.health, MAX_HEALTH - stats(ZombieKind::Walker).damage);

    // a Tank reaching the survivor takes the whole health bar: a life is lost
    world.spawn_zombie(ZombieKind::Tank, world.player_x, PLAYER_Y - 2.0);
    let events = run(&mut world, 0.2);
    assert!(events & events::LIFE_LOST != 0);
    assert_eq!(world.lives, START_LIVES - 1);
    assert_eq!(world.phase, Phase::Dying);
    run(&mut world, DYING_SECONDS + 0.1);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.health, MAX_HEALTH);
    assert!(world.invulnerable_seconds > 0.0);

    let mut game_over = false;
    for _ in 0..10 {
        run(&mut world, 2.5);
        if world.phase == Phase::GameOver { game_over = true; break; }
        world.invulnerable_seconds = 0.0;
        world.spawn_zombie(ZombieKind::Tank, world.player_x, PLAYER_Y - 2.0);
        run(&mut world, 0.1);
    }
    assert!(game_over);
    assert_eq!(world.lives, 0);
    // nothing moves after game over
    let score = world.score;
    assert_eq!(run(&mut world, 2.0) & !0, 0);
    assert_eq!(world.score, score);
}

#[test]
fn zombies_chew_through_cover_and_runners_slip_around_it() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.debug_invincible = true;
    let barricade = world.covers[1];
    world.spawn_zombie(ZombieKind::Walker, barricade.x, barricade.y - 20.0);
    let events = run(&mut world, 4.0);
    assert!(events & events::COVER_HIT != 0);
    assert!(world.covers[1].health < barricade.max_health);
    let zombie = world.zombies.iter().find(|zombie| zombie.active).unwrap();
    assert_eq!(zombie.state, ZombieState::Biting);
    assert!(zombie.y < barricade.y, "held at the barricade");
    let events = run(&mut world, 30.0);
    assert!(events & events::COVER_BROKEN != 0);
    assert_eq!(world.covers[1].health, 0.0);

    let mut world = playing_world();
    stop_spawning(&mut world);
    world.debug_invincible = true;
    let car = world.covers[0];
    world.spawn_zombie(ZombieKind::Runner, car.x + 2.0, car.y - 20.0);
    run(&mut world, 6.0);
    assert_eq!(world.covers[0].health, car.max_health, "runners don't stop to bite");
}

#[test]
fn crawlers_come_in_packs_and_squeeze_under_wrecked_cars_but_chew_barricades() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.debug_invincible = true;
    let car = world.covers[0];
    world.spawn_zombie(ZombieKind::Crawler, car.x, car.y - 20.0);
    run(&mut world, 3.0);
    assert_eq!(world.covers[0].health, car.max_health, "crawlers don't bite the cars");
    let past_the_car = world.zombies.iter().all(|zombie| !zombie.active || zombie.y > car.y) || world.zombies_alive == 0;
    assert!(past_the_car, "the crawler went under the car");

    let mut world = playing_world();
    stop_spawning(&mut world);
    world.debug_invincible = true;
    let barricade = world.covers[1];
    world.spawn_zombie(ZombieKind::Crawler, barricade.x, barricade.y - 20.0);
    run(&mut world, 4.0);
    assert!(world.covers[1].health < barricade.max_health, "barricades stop crawlers");

    // packs: from wave 3 on, crawlers turn up at least three at a time
    let mut world = World::new();
    world.seed(3);
    world.start();
    world.wave = 6;
    world.plan = waves::plan(6);
    world.debug_invincible = true;
    let mut most_crawlers = 0;
    for _ in 0..(40.0 / FRAME) as usize {
        world.advance(FRAME);
        let crawlers = world.zombies.iter().filter(|zombie| zombie.active && zombie.kind == ZombieKind::Crawler).count();
        most_crawlers = most_crawlers.max(crawlers);
    }
    assert!(most_crawlers >= 3, "a pack of crawlers ({most_crawlers})");
}

#[test]
fn zombies_never_attack_from_range() {
    // every kind standing still up the road for half a minute: the survivor is never hurt, in the open or not
    let mut world = playing_world();
    stop_spawning(&mut world);
    for (index, kind) in [ZombieKind::Walker, ZombieKind::Runner, ZombieKind::Brute, ZombieKind::Crawler, ZombieKind::Tank].into_iter().enumerate() {
        world.spawn_zombie(kind, 30.0 + index as f32 * 45.0, 70.0);
    }
    world.zombies.iter_mut().for_each(|zombie| zombie.speed = 0.0);
    for _ in 0..30 {
        assert_eq!(run(&mut world, 1.0) & events::PLAYER_HURT, 0);
        world.player_x = if world.player_x < 120.0 { 200.0 } else { 40.0 };
    }
    assert_eq!(world.health, MAX_HEALTH);
    assert!(world.covers.iter().all(|cover| cover.health == cover.max_health), "nothing thrown at the cover either");
}

#[test]
fn pickups_give_spread_rapid_fire_and_health() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.drop_pickup(PickupKind::Spread, world.player_x, PLAYER_Y - 20.0);
    assert!(run(&mut world, 1.0) & events::PICKUP != 0);
    assert!(world.spread_seconds > 0.0);
    world.input = buttons::FIRE;
    run(&mut world, 0.05);
    assert!(world.bullets.iter().filter(|bullet| bullet.active).count() >= 3, "three bullets per shot");
    world.input = 0;
    assert!((world.shots_per_second() - 1.0 / FIRE_COOLDOWN_SECONDS).abs() < 0.01);
    world.drop_pickup(PickupKind::Rapid, world.player_x, PLAYER_Y - 20.0);
    run(&mut world, 1.0);
    assert!(world.shots_per_second() > 7.0);
    world.health = 50.0;
    world.drop_pickup(PickupKind::Medkit, world.player_x, PLAYER_Y - 20.0);
    run(&mut world, 1.0);
    assert_eq!(world.health, 50.0 + MEDKIT_HEALTH);
    // a medkit at full health is an extra life
    world.health = MAX_HEALTH;
    world.drop_pickup(PickupKind::Medkit, world.player_x, PLAYER_Y - 20.0);
    assert!(run(&mut world, 1.0) & events::EXTRA_LIFE != 0);
    assert_eq!(world.lives, START_LIVES + 1);
    run(&mut world, POWER_SECONDS + 0.5);
    assert_eq!((world.spread_seconds, world.rapid_seconds), (0.0, 0.0));
}

#[test]
fn clearing_a_wave_moves_on_to_a_harder_one() {
    let mut world = playing_world();
    world.debug_clear_wave();
    let score = world.score;
    let events = run(&mut world, 0.1);
    assert!(events & events::WAVE_CLEAR != 0);
    assert!(world.score > score, "wave bonus");
    run(&mut world, WAVE_CLEAR_SECONDS + WAVE_INTRO_SECONDS + 0.2);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.wave, 2);
    let (first, second, later) = (waves::plan(1), waves::plan(2), waves::plan(8));
    assert!(second.regular_total > first.regular_total && second.speed_factor > first.speed_factor);
    assert_eq!(first.kind_weights[1..], [0, 0, 0], "wave 1 is walkers only");
    assert!(later.kind_weights.iter().all(|weight| *weight > 0), "later waves mix every kind");
    assert!(waves::plan(5).has_tank && !waves::plan(4).has_tank);
}

#[test]
fn a_whole_wave_spawns_and_can_be_cleared_by_shooting() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.auto_fire = true;
    let mut cleared = false;
    let mut kinds_seen = [false; 5];
    world.setup_wave(5);
    for _ in 0..(240.0 / FRAME) as usize {
        // stand under the lowest zombie
        let target = world.zombies.iter().filter(|zombie| zombie.active && zombie.y > 0.0).max_by(|a, b| a.y.total_cmp(&b.y)).map(|zombie| zombie.x);
        world.target_x = target.unwrap_or(-1.0);
        for zombie in world.zombies.iter().filter(|zombie| zombie.active) { kinds_seen[zombie.kind as usize] = true; }
        if world.advance(FRAME) & events::WAVE_CLEAR != 0 { cleared = true; break; }
    }
    assert!(cleared, "wave 5 cleared; {} left", world.zombies_left());
    assert!(kinds_seen.iter().all(|seen| *seen), "every kind showed up on wave 5: {kinds_seen:?}");
    assert!(world.kills >= waves::total_zombies(5) / 2);
}

#[test]
fn restore_validates_and_resumes_at_the_start_of_the_wave() {
    let mut world = World::new();
    assert!(!world.restore(0, 10, 3));
    assert!(!world.restore(3, 10, 0));
    assert!(!world.restore(3, 10, MAX_LIVES + 1));
    assert!(world.restore(4, 1234, 2));
    assert_eq!((world.phase, world.wave, world.score, world.lives, world.health), (Phase::Ready, 4, 1234, 2, MAX_HEALTH));
    assert_eq!(world.zombies_left(), waves::total_zombies(4));
}

#[test]
fn restart_begins_a_fresh_game() {
    let mut world = playing_world();
    world.score = 900;
    world.lives = 1;
    world.setup_wave(6);
    world.restart();
    assert_eq!((world.phase, world.wave, world.score, world.lives), (Phase::WaveIntro, 1, 0, START_LIVES));
}

#[test]
fn hitches_are_dropped_and_slow_frames_capped() {
    let mut world = playing_world();
    stop_spawning(&mut world);
    world.input = buttons::RIGHT;
    let start = world.player_x;
    world.advance(5.0);
    assert!(world.player_x - start < 3.0);
    world.advance(f32::NAN);
    world.advance(-1.0);
    assert!(world.player_x.is_finite());
}

#[test]
fn a_long_random_session_never_breaks_the_pools() {
    let mut world = World::new();
    world.seed(99);
    world.start();
    world.auto_fire = true;
    let mut highest_wave = 0;
    for frame in 0..(600.0 / FRAME) as usize {
        world.input = match (frame / 50) % 3 { 0 => buttons::LEFT, 1 => buttons::RIGHT, _ => 0 };
        let (kills, stains) = (world.kills, world.stain_serial);
        let events = world.advance(FRAME);
        if events & events::PLAYER_HURT != 0 {
            // only ever hurt up close: a zombie reached the survivor or the line (and was used up doing it)
            assert!(world.stain_serial - stains > world.kills - kills, "hurt with no zombie at the survivor or the line");
        }
        let alive = world.zombies.iter().filter(|zombie| zombie.active).count() as u32;
        assert_eq!(alive, world.zombies_alive);
        assert!(world.health >= 0.0 && world.health <= MAX_HEALTH);
        highest_wave = highest_wave.max(world.wave);
        if world.phase == Phase::GameOver { world.restart(); }
    }
    assert!(highest_wave >= 2);
}

#[test]
fn render_buffer_matches_the_world() {
    let mut game = ZombieRoad::new();
    game.start();
    game.advance(0.5);
    assert_eq!(ZombieRoad::render_length() as usize, render_slot::LENGTH);
    assert!(game.debug_spawn_zombie(2, 100.0, 50.0));
    game.advance(FRAME);
    let render = unsafe { std::slice::from_raw_parts(game.render_pointer(), render_slot::LENGTH) };
    assert_eq!(render[render_slot::ZOMBIE_COUNT], 1.0);
    assert_eq!(render[render_slot::ZOMBIES], ZombieKind::Brute as u8 as f32);
    assert_eq!(render[render_slot::COVERS], CoverKind::WreckedCar as u8 as f32);
    assert_eq!(render[render_slot::HEALTH], MAX_HEALTH);
    assert_eq!(render[render_slot::TANK_HEALTH], -1.0);
}

/// Balance probe: a simple bot that stands under the lowest zombie with auto-fire on. Run with --ignored --nocapture.
#[test]
#[ignore]
fn balance_probe() {
    for seed in 1..6u32 {
        let mut world = World::new();
        world.seed(seed);
        world.start();
        world.auto_fire = true;
        let mut seconds = 0.0;
        while world.phase != Phase::GameOver && seconds < 1500.0 {
            let target = world.zombies.iter().filter(|zombie| zombie.active && zombie.y > 0.0).max_by(|a, b| a.y.total_cmp(&b.y)).map(|zombie| zombie.x);
            world.target_x = target.unwrap_or(120.0);
            world.advance(FRAME);
            seconds += FRAME;
        }
        println!("seed {seed}: reached wave {} score {} kills {} in {:.0}s", world.wave, world.score, world.kills, seconds);
    }
}
