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
    assert_eq!(world.score, 10 * kills as u32, "the bottom rows are the leg's rocks");
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
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(1)], "Leaving for Mars");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(2)], "Approaching Mars");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(3)], "Reached Mars");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(4)], "Leaving for Jupiter");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(18)], "Reached Pluto");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(21)], "Reached Aranya");
    assert_eq!(waves::STAGE_NAMES[waves::stage_index(40)], "Reached Aranya", "the rescue repeats");
    assert_eq!((waves::leg_for_wave(1), waves::leg_for_wave(4), waves::leg_for_wave(19), waves::leg_for_wave(99)), (0, 1, 6, 6));
    assert_eq!((waves::sub_stage_for_wave(4), waves::sub_stage_for_wave(5), waves::sub_stage_for_wave(6)), (0, 1, 2));
    assert_eq!((waves::backdrop_for_wave(1), waves::backdrop_for_wave(5), waves::backdrop_for_wave(30)), (0, 4, 20));
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
    assert!(events & events::WEAPON_UNLOCK != 0);
    assert_eq!(world.weapons, weapons::TRIPLE);
    world.input = buttons::FIRE;
    world.advance(FRAME);
    world.input = 0;
    assert_eq!(world.player_bullets.iter().filter(|bullet| bullet.active).count(), 3);
    run(&mut world, 20.0);
    assert_eq!(world.weapons, weapons::TRIPLE, "weapon bonuses don't wear off");
    world.drop_capsule(120.0, PLAYER_Y - 20.0, Power::Bubble);
    run(&mut world, 0.8);
    assert_eq!(world.power, Power::Bubble);
    world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: 240.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    let events = run(&mut world, 0.4);
    assert!(events & events::BUBBLE_POP != 0);
    assert_eq!(world.lives, STARTING_LIVES, "the bubble took the hit");
    assert_eq!(world.power, Power::None);
    assert_eq!(world.weapons, weapons::TRIPLE, "a popped bubble keeps the weapon");
}

#[test]
fn a_missed_queen_capsule_is_lost_but_a_last_kill_capsule_survives_the_wave_change() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.debug_thin_formation(0);
    world.force_capsule(120.0, 100.0, Power::MachineGun);
    world.force_capsule(60.0, 90.0, Power::TripleShot);
    world.force_capsule(30.0, 80.0, Power::Bubble);
    assert_eq!(world.capsules.iter().filter(|capsule| capsule.active).count(), MAX_CAPSULES);
    assert!(world.capsules.iter().any(|capsule| capsule.active && capsule.power == Power::Bubble), "a forced drop always lands");
    world.setup_wave(2);
    assert!(world.capsules.iter().any(|capsule| capsule.active), "falling capsules carry into the next wave");
    world.restart();
    assert!(world.capsules.iter().all(|capsule| !capsule.active), "a new game clears them");
}

#[test]
fn each_leg_brings_a_new_enemy_kind_and_aranya_has_captives_to_free() {
    let mut seen = Vec::new();
    for leg in 0..waves::LEGS {
        let wave = (leg * waves::STAGES_PER_LEG + 2) as u32;
        let mut world = World::new();
        world.setup_wave(wave);
        let middle = world.enemies[1 * COLUMNS + 0].kind;
        assert_eq!(middle, EnemyKind::introduced_on_leg(leg), "leg {leg}");
        assert!(!seen.contains(&middle), "leg {leg} repeats {middle:?}");
        seen.push(middle);
    }
    // every leg's formation is entirely its own: no kind (other than the shared rocks) carries over between legs
    let roster = |leg: usize| {
        let mut world = World::new();
        world.setup_wave((leg * waves::STAGES_PER_LEG + 1) as u32);
        let mut kinds: Vec<EnemyKind> = world.enemies.iter().filter(|enemy| enemy.alive && !enemy.queen && enemy.kind != EnemyKind::Asteroid).map(|enemy| enemy.kind).collect();
        kinds.sort_by_key(|kind| *kind as u8);
        kinds.dedup();
        kinds
    };
    for leg in 1..waves::LEGS {
        let (before, now) = (roster(leg - 1), roster(leg));
        assert!(now.iter().all(|kind| !before.contains(kind)), "leg {leg} shares {now:?} with {before:?}");
    }
    // the three stages of a leg keep the same roster
    for leg in 0..waves::LEGS {
        let mut first = World::new();
        first.setup_wave((leg * 3 + 1) as u32);
        let mut last = World::new();
        last.setup_wave((leg * 3 + 3) as u32);
        assert_eq!(first.enemies[0].kind, last.enemies[0].kind);
    }
    // armour: Saturn's ring shards take two hits
    let mut world = playing_world();
    world.setup_wave(8);
    world.set_phase_for_test(Phase::Playing);
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    let index = 2 * COLUMNS + 1;
    assert_eq!(world.enemies[index].kind, EnemyKind::RingShard);
    assert_eq!(world.enemies[index].hits_left, 2);
    // Aranya: the bottom rows hold caged natives; shooting a cage frees one (and they never shoot)
    let mut world = playing_world();
    world.setup_wave(21);
    world.set_phase_for_test(Phase::Playing);
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    let captive = world.enemies.iter().position(|enemy| enemy.alive && enemy.kind == EnemyKind::Captive && enemy.row == 4).unwrap();
    world.player_x = world.enemies[captive].x;
    world.input = buttons::FIRE;
    let mut all = 0;
    for _ in 0..60 { all |= world.advance(FRAME); if world.rescued > 0 { break; } }
    assert!(all & events::RESCUE != 0);
    assert_eq!(world.rescued, 1);
    assert!(!world.enemies[captive].alive);
}

#[test]
fn reaching_a_new_planet_gives_an_extra_life() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.debug_thin_formation(0);
    // wave 2 (approaching Mars) clears → wave 3 is "Reached Mars"
    world.setup_wave(2);
    world.debug_thin_formation(0);
    let lives = world.lives;
    let mut all = 0;
    for _ in 0..((WAVE_CLEAR_SECONDS + 0.2) / FRAME) as usize { all |= world.advance(FRAME); }
    assert_eq!(world.wave, 3);
    assert!(all & events::PLANET_REACHED != 0);
    assert_eq!(world.lives, lives + 1);
    // leaving for the next planet is not an arrival
    world.set_phase_for_test(Phase::Playing);
    world.debug_thin_formation(0);
    let lives = world.lives;
    let mut all = 0;
    for _ in 0..((WAVE_CLEAR_SECONDS + 0.2) / FRAME) as usize { all |= world.advance(FRAME); }
    assert_eq!(world.wave, 4);
    assert!(all & events::PLANET_REACHED == 0);
    assert_eq!(world.lives, lives);
    // never past the cap
    world.lives = MAX_LIVES;
    world.set_phase_for_test(Phase::Playing);
    world.setup_wave(5);
    world.debug_thin_formation(0);
    for _ in 0..((WAVE_CLEAR_SECONDS + 0.2) / FRAME) as usize { world.advance(FRAME); }
    assert_eq!(world.wave, 6);
    assert_eq!(world.lives, MAX_LIVES);
}

#[test]
fn queen_sits_in_the_centre_with_a_guard_ring_in_every_formation() {
    for wave in 1..=8 {
        let mut world = World::new();
        world.setup_wave(wave);
        let queen = world.enemies[QUEEN_ROW * COLUMNS + QUEEN_COLUMN];
        assert!(queen.alive && queen.queen, "wave {wave}");
        assert_eq!(queen.kind(), EnemyKind::Queen);
        assert_eq!(world.enemies.iter().filter(|enemy| enemy.queen).count(), 1);
        assert_eq!(queen.hits_left as u32, World::queen_hits(wave));
        for row in QUEEN_ROW - 1..=QUEEN_ROW + 1 {
            for column in QUEEN_COLUMN - 1..=QUEEN_COLUMN + 1 {
                assert!(world.enemies[row * COLUMNS + column].alive, "guard at {row},{column} on wave {wave}");
            }
        }
    }
}

#[test]
fn killing_the_queen_unlocks_the_machine_gun_and_both_make_a_triple_stream() {
    let mut world = playing_world();
    silence_enemies(&mut world);
    world.march_timer = -1.0e9;
    world.debug_invincible = true;
    let queen_index = QUEEN_ROW * COLUMNS + QUEEN_COLUMN;
    // clear the guards below her, then shoot her repeatedly from straight underneath
    for row in QUEEN_ROW + 1..ROWS { if world.enemies[row * COLUMNS + QUEEN_COLUMN].alive { world.enemies[row * COLUMNS + QUEEN_COLUMN].alive = false; world.enemies_alive -= 1; } }
    world.player_x = world.enemies[queen_index].x;
    let hits = World::queen_hits(1);
    let mut all = 0;
    world.input = buttons::FIRE;
    for _ in 0..(10.0 / FRAME) as usize {
        all |= world.advance(FRAME);
        if !world.enemies[queen_index].alive { break; }
    }
    world.input = 0;
    assert!(all & events::QUEEN_HIT != 0, "she soaks hits first ({hits})");
    assert!(all & events::QUEEN_DOWN != 0);
    assert_eq!(world.weapons, 0, "nothing is granted on the kill itself");
    let capsule = world.capsules.iter().find(|capsule| capsule.active).copied().expect("the queen drops a capsule");
    assert_eq!(capsule.power, Power::MachineGun);
    // fly under it and catch it
    world.input = 0;
    world.player_x = capsule.x;
    let mut caught = 0;
    for _ in 0..(6.0 / FRAME) as usize { caught |= world.advance(FRAME); if world.weapons != 0 { break; } }
    assert!(caught & events::WEAPON_UNLOCK != 0);
    assert_eq!(world.weapons, weapons::RAPID);
    // machine gun: a stream of single shots far faster than normal
    for bullet in world.player_bullets.iter_mut() { bullet.active = false; }
    world.player_x = 20.0;
    world.input = buttons::FIRE;
    let mut shots = 0;
    for _ in 0..60 { if world.advance(FRAME) & events::SHOOT != 0 { shots += 1; } }
    assert!(shots >= 9, "rapid fire: {shots} volleys in 1 s");
    // triple shot on top → three continuous streams
    world.input = 0;
    run(&mut world, 1.5);
    world.player_x = 120.0;
    world.drop_capsule(120.0, PLAYER_Y - 20.0, Power::TripleShot);
    run(&mut world, 0.8);
    assert_eq!(world.weapons, weapons::BOTH);
    for bullet in world.player_bullets.iter_mut() { bullet.active = false; }
    world.player_x = 20.0;
    world.input = buttons::FIRE;
    for _ in 0..30 { world.advance(FRAME); }
    let in_flight = world.player_bullets.iter().filter(|bullet| bullet.active).count();
    assert!(in_flight >= 12, "three streams: {in_flight} bullets");
    assert!(world.player_bullets.iter().any(|bullet| bullet.active && bullet.velocity_x < 0.0));
    assert!(world.player_bullets.iter().any(|bullet| bullet.active && bullet.velocity_x > 0.0));
    // bonuses survive into the next wave, but are lost with the ship
    world.setup_wave(2);
    assert_eq!(world.weapons, weapons::BOTH);
    world.debug_invincible = false;
    world.invulnerable_seconds = 0.0;
    world.input = 0;
    world.enemy_bullets[0] = Bullet { active: true, x: world.player_x, y: 245.0, velocity_x: 0.0, velocity_y: 80.0, kind: 0, age: 0.0 };
    run(&mut world, 0.4);
    assert_eq!(world.weapons, 0);
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
    assert_eq!(AntarikshDefenders::stage_name(5), "Approaching Jupiter");
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
