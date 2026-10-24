use crate::level::{self, PLATFORMS};
use crate::world::*;
use buttons::*;

const FRAME: f32 = 1.0 / 60.0;

fn playing_world() -> World {
    let mut world = World::new();
    world.view_width = 400.0;
    world.start();
    world
}

fn run(world: &mut World, input: u32, frames: usize) -> u32 {
    world.input = input;
    let mut all = 0;
    for _ in 0..frames { all |= world.advance(FRAME); }
    all
}

/// Clear every enemy so a mechanic can be tested in peace.
fn calm(world: &mut World) {
    for entity in world.entities.iter_mut() { entity.active = false; }
    for bullet in world.enemy_bullets.iter_mut() { bullet.active = false; }
}

#[test]
fn runs_and_jumps_about_57_units() {
    let mut world = playing_world();
    world.debug_invincible = true;
    let start_x = world.hero.x;
    run(&mut world, RIGHT, 30);
    assert!(world.hero.x > start_x + 35.0, "ran to {}", world.hero.x);
    assert_eq!(world.hero.pose, Pose::Run);
    let ground = world.hero.y;
    world.input = JUMP;
    let mut highest = ground;
    for _ in 0..60 { world.advance(FRAME); highest = highest.min(world.hero.y); world.input = 0; if world.hero.pose == Pose::Somersault { assert!(!world.hero.on_ground); } }
    let rise = ground - highest;
    assert!(rise > 50.0 && rise < 60.0, "rose {rise}");
    assert!(world.hero.on_ground);
}

#[test]
fn aims_in_eight_directions_and_goes_prone() {
    let mut world = playing_world();
    world.debug_invincible = true;
    calm(&mut world);
    run(&mut world, UP, 2);
    assert_eq!(world.hero.aim, 6, "standing + up aims straight up");
    run(&mut world, RIGHT | UP, 2);
    assert_eq!(world.hero.aim, 7, "running + up aims diagonally up");
    run(&mut world, RIGHT | DOWN, 2);
    assert_eq!(world.hero.aim, 1, "running + down aims diagonally down");
    run(&mut world, DOWN, 2);
    assert_eq!(world.hero.pose, Pose::Prone);
    let prone_box = world.hero.hurt_box();
    assert!(prone_box.1 > world.hero.y - 10.0, "prone is low");
    let (_, muzzle_y) = world.hero.muzzle();
    assert!(muzzle_y > world.hero.y - 10.0);
    // in the air: straight down and every diagonal
    world.press_jump();
    run(&mut world, 0, 2);
    run(&mut world, DOWN, 2);
    assert_eq!(world.hero.aim, 2, "airborne + down aims straight down");
    run(&mut world, LEFT | DOWN, 2);
    assert_eq!(world.hero.aim, 3);
    run(&mut world, LEFT | UP, 2);
    assert_eq!(world.hero.aim, 5);
}

#[test]
fn shoots_while_running_and_weapons_differ() {
    let mut world = playing_world();
    world.debug_invincible = true;
    calm(&mut world);
    let events = run(&mut world, RIGHT | FIRE, 6);
    assert!(events & events::SHOOT != 0);
    let rifle = world.bullets.iter().filter(|bullet| bullet.active).count();
    assert!(rifle >= 1 && rifle <= 4);
    for bullet in world.bullets.iter_mut() { bullet.active = false; }
    world.weapon = Weapon::Spread;
    world.hero.fire_cooldown = 0.0;
    run(&mut world, FIRE, 1);
    assert_eq!(world.bullets.iter().filter(|bullet| bullet.active).count(), 5, "spread fires five pellets");
    // holding fire for a long time never overflows the fixed pools
    world.weapon = Weapon::Rapid;
    run(&mut world, FIRE | UP, 600);
    assert!(world.bullets.iter().filter(|bullet| bullet.active).count() <= MAX_PLAYER_BULLETS);
}

#[test]
fn drops_through_ledges_but_not_ground() {
    let mut world = playing_world();
    world.debug_invincible = true;
    calm(&mut world);
    // stand on the low ledge at 150..330
    world.teleport(200.0);
    world.hero.y = level::LOW_LEDGE_TOP - 20.0;
    world.hero.on_ground = false;
    run(&mut world, 0, 30);
    assert_eq!(world.hero.y, level::LOW_LEDGE_TOP, "landed on the ledge");
    world.press_jump();
    run(&mut world, DOWN, 40);
    assert_eq!(world.hero.y, level::GROUND_TOP, "dropped through to the ground");
    world.press_jump();
    run(&mut world, DOWN, 40);
    assert_eq!(world.hero.y, level::GROUND_TOP, "the ground can't be dropped through");
}

#[test]
fn bridge_blows_up_behind_a_runner_and_drops_a_stander() {
    let mut world = playing_world();
    world.debug_invincible = true;
    calm(&mut world);
    world.teleport(690.0);
    run(&mut world, RIGHT, 20);
    assert!(world.bridge_timers[0] >= 0.0, "stepping on the bridge arms it");
    let events = run(&mut world, 0, 200);
    assert!(events & events::BRIDGE_BLAST != 0);
    assert!(world.hero.in_water, "standing still, the hero falls into the river");
    let alive = (0..level::PLANKS_PER_BRIDGE).filter(|plank| world.platform_alive[level::BRIDGES[0] + plank]).count();
    assert_eq!(alive, 0);
    // a runner outruns the blasts on bridge 2 (over a gorge)
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(2990.0);
    calm(&mut world);
    run(&mut world, RIGHT, 220);
    assert!(world.hero.x > 3170.0 && world.hero.on_ground, "made it across ({}, {})", world.hero.x, world.hero.y);
    assert_eq!(world.phase, Phase::Playing);
}

#[test]
fn water_limits_aim_and_the_bank_can_be_climbed() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(1000.0);
    calm(&mut world);
    assert!(world.hero.in_water);
    run(&mut world, DOWN | RIGHT, 2);
    assert_eq!(world.hero.aim, 0, "no shooting down in the water");
    run(&mut world, UP, 2);
    assert_eq!(world.hero.aim, 6, "up is fine");
    world.press_jump();
    run(&mut world, 0, 10);
    assert!(world.hero.in_water, "no jumping out of the water");
    world.teleport(1270.0);
    calm(&mut world);
    run(&mut world, RIGHT, 40);
    assert!(!world.hero.in_water && world.hero.y == level::GROUND_TOP && world.hero.x > 1290.0, "climbed the far bank");
}

#[test]
fn pits_kill_and_lives_respawn_with_invulnerability() {
    let mut world = playing_world();
    world.teleport(2190.0);
    calm(&mut world);
    world.hero.y = level::GROUND_TOP;
    let events = run(&mut world, RIGHT, 90);
    assert!(events & events::HERO_DOWN != 0, "fell into the pit");
    let events = run(&mut world, 0, 120);
    assert!(events & events::LIFE_LOST != 0);
    assert_eq!(world.lives, START_LIVES - 1);
    assert_eq!(world.phase, Phase::Playing);
    assert!(world.hero.invulnerable_seconds > 0.0);
    run(&mut world, 0, 120);
    assert!(world.hero.on_ground || world.hero.in_water, "dropped back onto solid ground");
}

#[test]
fn enemy_bullets_and_soldiers_are_one_hit_kills_and_game_over_offers_continues() {
    let mut world = playing_world();
    world.teleport(1200.0);
    calm(&mut world);
    world.weapon = Weapon::Laser;
    for life in 0..START_LIVES {
        world.hero.invulnerable_seconds = 0.0;
        let (x, y) = (world.hero.x, world.hero.y - 15.0);
        world.enemy_bullets[0] = EnemyBullet { active: true, x: x + 3.0, y, velocity_x: -20.0, velocity_y: 0.0 };
        let events = run(&mut world, 0, 2);
        assert!(events & events::HERO_DOWN != 0, "life {life}: one hit");
        run(&mut world, 0, 100);
        calm(&mut world);
    }
    assert_eq!(world.phase, Phase::GameOver);
    assert_eq!(world.weapon, Weapon::Rifle, "a lost life drops the weapon");
    assert!(world.continue_game());
    assert_eq!(world.continues, START_CONTINUES - 1);
    assert_eq!(world.lives, START_LIVES);
    assert_eq!(world.phase, Phase::Playing);
    assert_eq!(world.hero.x, level::HERO_START_X, "no checkpoint yet: back to the start");
}

#[test]
fn soldiers_run_in_from_the_edges_and_die_to_one_shot() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(1450.0);
    calm(&mut world);
    let mut first_seen_x = None;
    for _ in 0..360 {
        run(&mut world, 0, 1);
        if let Some(soldier) = world.entities.iter().find(|entity| entity.active && entity.kind == EntityKind::Soldier) { first_seen_x = Some(soldier.x); break; }
    }
    let x = first_seen_x.expect("soldiers appear");
    assert!(x < world.camera_x || x > world.camera_x + world.view_width, "came in from just off an edge ({x})");
    calm(&mut world);
    let x = world.hero.x + 60.0;
    world.entities[0] = Entity { active: true, kind: EntityKind::Soldier, state: 0, x, y: level::GROUND_TOP, velocity_x: -SOLDIER_SPEED, velocity_y: 0.0, timer: 0.0,
        hit_points: 1, aim: 0, facing: -1.0, base_y: 0.0, param: 0, flash: 0.0, on_ground: true };
    let defeated = world.enemies_defeated;
    let events = run(&mut world, FIRE, 30);
    assert!(events & events::ENEMY_DOWN != 0);
    assert_eq!(world.enemies_defeated, defeated + 1);
}

#[test]
fn turrets_turn_toward_the_hero_and_fire() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(500.0);
    calm(&mut world);
    world.entities[0] = Entity { active: true, kind: EntityKind::Turret, state: 1, x: 600.0, y: level::GROUND_TOP - 12.0, velocity_x: 0.0, velocity_y: 0.0,
        timer: 0.0, hit_points: 8, aim: 0, facing: 1.0, base_y: 0.0, param: 0, flash: 0.0, on_ground: false };
    let events = run(&mut world, 0, 300);
    assert_eq!(world.entities[0].aim, 6, "turned to face left at the hero");
    assert!(events & events::ENEMY_SHOOT != 0);
    assert!(world.enemy_bullets.iter().any(|bullet| bullet.active && bullet.velocity_x < 0.0));
}

#[test]
fn hidden_snipers_are_bulletproof_until_they_pop_up() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(1700.0);
    calm(&mut world);
    world.entities[0] = Entity { active: true, kind: EntityKind::Sniper, state: 0, x: 1780.0, y: level::GROUND_TOP, velocity_x: 0.0, velocity_y: 0.0, timer: 0.0,
        hit_points: 1, aim: 0, facing: -1.0, base_y: 0.0, param: 1, flash: 0.0, on_ground: true };
    assert!(!world.entities[0].is_target());
    run(&mut world, FIRE, 60);
    assert!(world.entities[0].active, "shots pass over the bush");
    let mut fired = false;
    for _ in 0..200 { fired |= run(&mut world, 0, 1) & events::ENEMY_SHOOT != 0; if world.entities[0].state == 1 { assert!(world.entities[0].is_target()); } }
    assert!(fired, "it pops up and shoots");
}

#[test]
fn capsules_drop_a_weapon_pickup() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(1300.0);
    calm(&mut world);
    let (x, y) = (world.hero.x - 15.0, world.hero.y - 60.0);
    world.entities[0] = Entity { active: true, kind: EntityKind::Capsule, state: 0, x, y, velocity_x: 0.0, velocity_y: 0.0, timer: 0.0, hit_points: 1,
        aim: 0, facing: 1.0, base_y: y, param: 2, flash: 0.0, on_ground: false };
    let mut events = 0;
    for _ in 0..90 { events |= run(&mut world, UP | FIRE, 1); calm_soldiers(&mut world); if events & events::CAPSULE_OPEN != 0 { break; } }
    assert!(events & events::CAPSULE_OPEN != 0, "shot the capsule open");
    let events = run(&mut world, 0, 120);
    // the pickup lands a little ahead; walk into it
    let events = events | run(&mut world, RIGHT, 40);
    assert!(events & events::POWER_UP != 0, "collected the pickup");
    assert_eq!(world.weapon, Weapon::Spread);
}

fn calm_soldiers(world: &mut World) {
    for entity in world.entities.iter_mut() { if entity.kind == EntityKind::Soldier { entity.active = false; } }
}

#[test]
fn checkpoint_is_kept_by_restore_and_continue() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(level::CHECKPOINT_X - 20.0);
    let events = run(&mut world, RIGHT, 30);
    assert!(events & events::CHECKPOINT != 0 && world.checkpoint_reached);
    let mut restored = World::new();
    assert!(restored.restore(true, 2, 4200, Weapon::Laser as u8, 1));
    assert_eq!(restored.phase, Phase::Ready);
    assert_eq!((restored.hero.x, restored.lives, restored.score, restored.weapon, restored.continues), (level::CHECKPOINT_START_X, 2, 4200, Weapon::Laser, 1));
    assert!(!restored.restore(false, 0, 0, 0, 0), "rejects zero lives");
    assert!(!restored.restore(false, 3, 0, 9, 0), "rejects an unknown weapon");
}

#[test]
fn hitches_are_dropped_and_slow_frames_capped() {
    let mut world = playing_world();
    world.debug_invincible = true;
    calm(&mut world);
    world.input = RIGHT;
    world.advance(FRAME);
    let before = world.hero.x;
    let events = world.advance(2.0);
    assert!(events & events::HITCH != 0);
    assert!(world.hero.x - before < 2.0, "a 2 s freeze is not simulated");
    let before = world.hero.x;
    world.advance(0.09);
    assert!(world.hero.x - before <= RUN_SPEED * MAX_FRAME_SECONDS + 0.01, "a 90 ms frame simulates at most 50 ms");
    // the grace period after a hitch: an enemy bullet on the hero doesn't count
    world.debug_invincible = false;
    world.advance(0.5);
    let (x, y) = (world.hero.x, world.hero.y - 15.0);
    world.enemy_bullets[0] = EnemyBullet { active: true, x, y, velocity_x: 0.0, velocity_y: 0.0 };
    world.advance(FRAME);
    assert_eq!(world.phase, Phase::Playing, "protected right after a hitch");
}

#[test]
fn the_boss_core_falls_and_the_stage_clears() {
    let mut world = playing_world();
    world.debug_invincible = true;
    world.teleport(3700.0);
    run(&mut world, 0, 10);
    assert!(world.boss_active);
    assert_eq!(world.active_count(EntityKind::BossCore), 1);
    assert_eq!(world.active_count(EntityKind::BossCannon), 2);
    world.weapon = Weapon::Laser;
    let mut events = 0;
    for _ in 0..1200 { events |= run(&mut world, FIRE, 1); if world.phase != Phase::Playing { break; } }
    assert!(events & events::BOSS_HIT != 0);
    assert_eq!(world.phase, Phase::BossDown);
    let events = run(&mut world, 0, 240);
    assert!(events & events::STAGE_CLEAR != 0);
    assert_eq!(world.phase, Phase::Cleared);
    assert!(world.score >= 15_000);
    assert!(world.hero.x < level::BOSS_WALL_X, "nobody walks through the gate");
}

#[test]
fn every_gap_is_jumpable_and_ledges_are_reachable() {
    let jump_height = JUMP_SPEED * JUMP_SPEED / (2.0 * GRAVITY);
    let air_distance = 2.0 * JUMP_SPEED / GRAVITY * RUN_SPEED;
    assert!(jump_height > level::GROUND_TOP - level::LOW_LEDGE_TOP + 4.0);
    assert!(jump_height > level::LOW_LEDGE_TOP - level::HIGH_LEDGE_TOP + 4.0);
    assert!(air_distance > 2256.0 - 2200.0 + 6.0, "the pit can be cleared ({air_distance})");
    for platform in PLATFORMS.iter() { assert!(platform.left < platform.right); }
    // plank blasts move slower than a runner
    assert!(level::BRIDGE_PLANK_WIDTH / 0.3 < RUN_SPEED);
}

// ---------------------------------------------------------------- the bot

/// A simple bot that plays the stage with no cheats: run right holding fire, aim up at things above, jump over
/// gaps and incoming bullets, prone-shoot the boss core, and spend continues if it must.
fn bot_input(world: &World) -> u32 {
    let hero = &world.hero;
    let mut input = FIRE;
    let near_boss = world.boss_active && hero.x > level::BOSS_WALL_X - 140.0;
    if !near_boss { input |= RIGHT; }
    // the nearest target ahead
    let mut target: Option<(f32, f32)> = None;
    for entity in world.entities.iter() {
        if !entity.active || !entity.is_target() || entity.x < hero.x - 10.0 || entity.x > hero.x + 220.0 { continue; }
        let center_y = match entity.kind { EntityKind::Soldier | EntityKind::Sniper => entity.y - 16.0, _ => entity.y };
        if target.map_or(true, |(x, _)| entity.x < x) { target = Some((entity.x, center_y)); }
    }
    if let Some((target_x, target_y)) = target {
        let rise = hero.y - 21.0 - target_y;
        let distance = target_x - hero.x;
        if rise > 30.0 && distance < rise * 0.6 && !near_boss { input &= !RIGHT; input |= UP; } // nearly overhead: stop and shoot up
        else if rise > 30.0 { input |= UP; if near_boss { input |= RIGHT; } }
    }
    if near_boss && hero.on_ground && hero.y < level::GROUND_TOP - 1.0 { return DOWN | JUMP; } // drop off a ledge first
    if near_boss { input = DOWN | FIRE; } // lie flat and shoot the core: shots aimed at a standing hero pass overhead
    // incoming bullets: jump
    let threatened = world.enemy_bullets.iter().any(|bullet| {
        if !bullet.active { return false; }
        let dx = bullet.x - hero.x;
        let dy = bullet.y - (hero.y - 15.0);
        dx.abs() < 46.0 && dy.abs() < 30.0 && dx * bullet.velocity_x < 0.0
    });
    // gaps ahead
    let ahead = hero.x + 16.0;
    let gap_ahead = hero.on_ground && world.platform_under(ahead, hero.y).map_or(true, |index| PLATFORMS[index].top > hero.y + 1.0) && water_at(ahead).is_none();
    let soldier_close = world.entities.iter().any(|entity| entity.active && entity.kind == EntityKind::Soldier && (entity.x - hero.x).abs() < 18.0 && (entity.y - hero.y).abs() < 4.0);
    if hero.on_ground && (threatened || gap_ahead || soldier_close) { input = (input & !DOWN) | JUMP; }
    input
}

#[test]
fn a_simple_bot_can_finish_the_stage() {
    let mut world = World::new();
    world.view_width = 400.0;
    world.start();
    let mut deaths = 0;
    let mut continues_used = 0;
    let mut seconds = 0.0;
    let mut checkpoint_seen = false;
    let mut death_spots = Vec::new();
    while world.phase != Phase::Cleared && seconds < 900.0 {
        if world.phase == Phase::GameOver {
            if !world.continue_game() { world.restore(world.checkpoint_reached, START_LIVES, 0, 0, START_CONTINUES); world.start(); }
            continues_used += 1;
        }
        world.input = bot_input(&world);
        let events = world.advance(FRAME);
        if events & events::HERO_DOWN != 0 { deaths += 1; death_spots.push(world.hero.x as i32); }
        checkpoint_seen |= world.checkpoint_reached;
        seconds += FRAME;
    }
    println!("bot: cleared={} in {:.0} s, deaths {deaths}, continues {continues_used}, score {}, defeated {}, died at x {death_spots:?}", world.phase == Phase::Cleared, seconds, world.score, world.enemies_defeated);
    assert_eq!(world.phase, Phase::Cleared, "bot stuck at ({}, {}) pose {:?} boss {} entities {:?}", world.hero.x, world.hero.y, world.hero.pose, world.boss_active, world.entities.iter().filter(|e| e.active).map(|e| (e.kind, e.x as i32, e.y as i32, e.hit_points)).collect::<Vec<_>>());
    assert!(checkpoint_seen);
    assert!(continues_used <= 6, "the stage should be fair: {continues_used} continues");
}
