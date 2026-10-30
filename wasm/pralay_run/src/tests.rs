use crate::world::*;
use crate::{render_slot, PralayRun};

fn run(world: &mut World, seconds: f32, input: u32) -> u32 {
    world.input = input;
    let mut events = 0;
    let steps = (seconds / STEP_SECONDS) as usize;
    for _ in 0..steps { events |= world.step(STEP_SECONDS); }
    events
}

fn flat_world() -> World {
    let mut game = PralayRun::new(7);
    game.debug_flatten(3000.0);
    let mut world = game.world;
    world.start();
    world
}

#[test]
fn starts_ready_on_safe_ground() {
    let mut world = World::new(1);
    assert_eq!(world.phase, Phase::Ready);
    run(&mut world, 1.0, buttons::RIGHT);
    assert_eq!(world.hero.x, START_X, "nothing moves before start");
    world.start();
    run(&mut world, 0.5, 0);
    assert!(world.hero.on_ground);
    assert_eq!(world.hero.y, START_GROUND);
}

#[test]
fn runs_jumps_double_jumps_and_dashes() {
    let mut world = flat_world();
    run(&mut world, 0.6, buttons::RIGHT);
    assert!(world.hero.x > START_X + 60.0);
    world.press_jump();
    let events = run(&mut world, 0.05, buttons::RIGHT | buttons::JUMP);
    assert!(events & events::JUMP != 0);
    run(&mut world, 0.2, buttons::RIGHT | buttons::JUMP);
    let height = world.hero.y;
    world.press_jump();
    let events = run(&mut world, 0.15, buttons::RIGHT | buttons::JUMP);
    assert!(events & events::AIR_JUMP != 0);
    assert!(world.hero.y < height - 10.0, "the double jump goes higher");
    world.press_jump();
    assert_eq!(run(&mut world, 0.05, buttons::RIGHT) & events::AIR_JUMP, 0, "only one air jump");
    let before = world.hero.x;
    world.press_dash();
    let events = run(&mut world, DASH_SECONDS, buttons::RIGHT);
    assert!(events & events::DASH != 0);
    assert!(world.hero.x - before > 60.0, "a dash covers ground fast ({})", world.hero.x - before);
    world.press_dash();
    assert_eq!(run(&mut world, 0.05, buttons::RIGHT) & events::DASH, 0, "one dash per air time");
    run(&mut world, 1.0, buttons::RIGHT);
    assert!(world.hero.on_ground);
    world.press_dash();
    assert!(run(&mut world, 0.05, buttons::RIGHT) & events::DASH != 0, "landing refreshes the dash");
}

#[test]
fn the_pralay_catches_a_hero_who_stands_still() {
    let mut world = World::new(3);
    world.start();
    let mut events = 0;
    for _ in 0..(20 * 120) { events |= world.step(STEP_SECONDS); if world.phase == Phase::GameOver { break; } }
    assert!(events & events::DEATH != 0);
    assert_eq!(world.phase, Phase::GameOver);
    assert!(events & events::GAME_OVER != 0);
}

#[test]
fn the_pralay_speeds_up_and_crumbles_the_ground_behind() {
    let mut world = flat_world();
    run(&mut world, 3.0, 0);
    let early = world.pace();
    world.void_x = world.hero.x - 200.0;
    world.elapsed = 60.0;
    assert!(world.pace() > early + 1.0, "faster after a minute ({} vs {})", world.pace(), early);
    assert!(world.platforms.iter().any(|platform| platform.falling), "blocks behind the Pralay fall");
    assert!((world.pace() - (VOID_BASE_SPEED + 60.0 * VOID_RAMP) / VOID_BASE_SPEED).abs() < 0.01);
    world.elapsed = 1000.0;
    assert!(world.pace() * VOID_BASE_SPEED <= VOID_MAX_SPEED + 0.01, "capped below running speed");
}

#[test]
fn surges_when_the_hero_is_far_ahead() {
    let mut world = flat_world();
    world.elapsed = 5.0;
    world.void_x = world.hero.x - 600.0;
    run(&mut world, STEP_SECONDS * 2.0, 0);
    assert!(world.void_speed > 300.0);
}

#[test]
fn bolts_kill_enemies_and_score() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    let x = world.hero.x;
    world.spawn_enemy(EnemyKind::Shade, x + 90.0, world.hero.y);
    world.enemies[0].min_x = x + 80.0;
    world.enemies[0].max_x = x + 100.0;
    let events = run(&mut world, 1.0, buttons::FIRE);
    assert!(events & events::SHOOT != 0);
    assert!(events & events::KILL != 0, "two bolts drop a shade");
    assert_eq!(world.kills, 1);
    assert!(world.score() >= 50);
}

#[test]
fn stomping_and_dashing_through_enemies() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    let (x, y) = (world.hero.x, world.hero.y);
    world.spawn_enemy(EnemyKind::Shade, x + 4.0, y);
    world.enemies[0].min_x = x;
    world.enemies[0].max_x = x + 8.0;
    world.hero.y = y - 40.0;
    world.hero.velocity_y = 200.0;
    world.hero.on_ground = false;
    let events = run(&mut world, 0.2, 0);
    assert!(events & events::STOMP != 0);
    assert_eq!(world.kills, 1);
    assert_eq!(world.hero.hp, MAX_HP);
    run(&mut world, 1.0, 0);
    let x = world.hero.x;
    world.spawn_enemy(EnemyKind::Wisp, x + 30.0, world.hero.y);
    world.press_dash();
    let events = run(&mut world, DASH_SECONDS, buttons::RIGHT);
    assert!(events & events::HIT != 0);
    assert_eq!(world.hero.hp, MAX_HP, "a dash passes through unharmed");
}

#[test]
fn touching_an_enemy_hurts_then_three_hits_end_the_run() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    for _ in 0..3 {
        let x = world.hero.x;
        world.hero.invulnerable = 0.0;
        world.spawn_enemy(EnemyKind::Idol, x + 2.0, world.hero.y);
        run(&mut world, 0.05, 0);
        world.enemies.clear();
        run(&mut world, 0.6, 0);
    }
    assert!(world.phase == Phase::Dying || world.phase == Phase::GameOver);
}

#[test]
fn idols_shoot_orbs_that_bolts_can_pop() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    let x = world.hero.x;
    world.spawn_enemy(EnemyKind::Idol, x + 160.0, world.hero.y);
    let events = run(&mut world, 2.6, 0);
    assert!(events & events::ENEMY_SHOT != 0);
    let events = run(&mut world, 1.0, buttons::FIRE);
    assert!(events & events::ORB_POP != 0 || world.hero.hp == MAX_HP);
}

#[test]
fn falling_into_a_pit_ends_the_run() {
    let mut world = flat_world();
    world.platforms.clear();
    let events = run(&mut world, 2.0, 0);
    assert!(events & events::DEATH != 0);
}

#[test]
fn gems_and_spikes() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    let (x, y) = (world.hero.x, world.hero.y);
    world.props.push(Prop { kind: PropKind::Gem, x: x + 30.0, y: y - 9.0, w: 0.0, phase: 0.0, taken: false, falling: false, fall_y: 0.0, fall_speed: 0.0 });
    let events = run(&mut world, 0.5, buttons::RIGHT);
    assert!(events & events::GEM != 0);
    assert_eq!(world.gems, 1);
    let x = world.hero.x;
    world.props.push(Prop { kind: PropKind::Spikes, x: x + 10.0, y, w: 16.0, phase: 0.0, taken: false, falling: false, fall_y: 0.0, fall_speed: 0.0 });
    let events = run(&mut world, 0.3, buttons::RIGHT);
    assert!(events & events::HURT != 0);
    assert_eq!(world.hero.hp, MAX_HP - 1);
}

#[test]
fn crumbling_ledges_give_way() {
    let mut world = flat_world();
    world.void_x = -2000.0;
    let (x, y) = (world.hero.x, world.hero.y);
    world.platforms.clear();
    world.platforms.push(Platform { x: x - 30.0, y, w: 60.0, h: 10.0, kind: PlatformKind::Crumble, crumble: -1.0, falling: false, fall_y: 0.0, fall_speed: 0.0, jitter: 0.0 });
    let events = run(&mut world, 0.2, 0);
    assert!(events & events::CRUMBLE != 0);
    run(&mut world, 0.5, 0);
    assert!(world.platforms[0].falling);
    assert!(!world.hero.on_ground);
}

/// Every generated step must be possible: horizontal gaps and climbs within a double jump's reach.
#[test]
fn generated_layouts_stay_reachable() {
    for seed in 1..60u32 {
        let mut world = World::new(seed * 7919);
        let mut all: Vec<Platform> = Vec::new();
        while world.gen_x < 12000.0 {
            world.camera_x = world.gen_x;
            world.platforms.clear();
            world.props.clear();
            world.enemies.clear();
            world.generate();
            all.extend(world.platforms.iter().copied());
        }
        all.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
        for pair in all.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            let gap = b.x - a.right();
            assert!(gap <= 140.0, "seed {seed}: gap {gap} at {}", a.x);
            if gap > 1.0 {
                let rise = a.y - b.y;
                assert!(rise <= 48.0, "seed {seed}: climb {rise} over a {gap} gap at {}", a.x);
                if gap > 96.0 { assert!(rise <= 1.0, "seed {seed}: a wide gap {gap} must not climb ({rise})"); }
            } else {
                assert!(a.y - b.y <= 64.0, "seed {seed}: wall too tall at {}", a.x);
            }
            assert!(b.y >= 90.0 && b.y <= 240.0);
        }
    }
}

#[test]
fn same_seed_same_world() {
    let a = World::new(42);
    let b = World::new(42);
    assert_eq!(a.platforms.len(), b.platforms.len());
    for (p, q) in a.platforms.iter().zip(b.platforms.iter()) { assert_eq!(p.x, q.x); assert_eq!(p.y, q.y); }
}

#[test]
fn a_bot_that_holds_right_and_jumps_goes_a_long_way() {
    // not a proof of anything beyond "the layout flows": a simple bot jumps at edges and walls and double jumps over gaps
    let mut best = 0;
    for seed in 1..12u32 {
        let mut game = PralayRun::new(seed * 31);
        game.set_view_width(480.0);
        game.start();
        for _ in 0..(90 * 60) {
            let world = &game.world;
            let hero = world.hero;
            let ahead = hero.x + 14.0;
            let ground_ahead = world.platforms.iter().any(|p| !p.falling && ahead > p.x && ahead < p.right() && p.y >= hero.y - 2.0 && p.y <= hero.y + 30.0);
            let wall = world.platforms.iter().any(|p| !p.falling && !p.one_way() && hero.x + 16.0 > p.x && hero.x < p.x && p.y < hero.y - 1.0);
            let mut input = buttons::RIGHT | buttons::FIRE | buttons::JUMP;
            if hero.on_ground && (!ground_ahead || wall) { game.world.press_jump(); }
            if !hero.on_ground && hero.velocity_y > 120.0 && hero.air_jumps > 0 { game.world.press_jump(); }
            if !hero.on_ground && hero.velocity_y > 200.0 && hero.air_jumps == 0 { game.world.press_dash(); }
            if game.world.phase != Phase::Playing { input = 0; }
            game.set_input(input);
            game.advance(1.0 / 60.0);
            if game.world.phase == Phase::GameOver { break; }
        }
        best = best.max(game.world.distance());
    }
    eprintln!("bot best {best} m"); assert!(best > 150, "the bot got {best} m");
}

#[test]
fn render_buffer_mirrors_the_world() {
    let mut game = PralayRun::new(5);
    game.start();
    game.set_input(buttons::RIGHT);
    for _ in 0..30 { game.advance(1.0 / 60.0); }
    let render = &game.render;
    assert_eq!(render[render_slot::HERO_X], game.world.hero.x);
    assert_eq!(render[render_slot::PHASE], Phase::Playing as u8 as f32);
    assert!(render[render_slot::PLATFORM_COUNT] > 10.0);
    assert_eq!(render.len(), render_slot::LENGTH);
    // a huge frame gap is a hitch: only one frame is simulated
    let x = game.world.hero.x;
    game.advance(2.0);
    assert!(game.world.hero.x - x < 4.0);
}
