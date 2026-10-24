//! Jungle Strike's simulation: the commando, enemies, bullets and particles, all in fixed-size pools (no allocation
//! after start-up). Time runs in fixed 1/120 s steps with the same lag protections as Breakout and Kush Jump:
//! - a frame gap longer than HITCH_SECONDS (the page froze) is dropped: only one 60 Hz frame is simulated, and for
//!   HITCH_GRACE_SECONDS afterwards nothing can hurt the hero
//! - otherwise at most MAX_FRAME_SECONDS are simulated per frame (a slow frame plays in slight slow motion).
use crate::level::{self, PlatformKind, SpawnKind, PLATFORMS, PLATFORM_COUNT};

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const MAX_FRAME_SECONDS: f32 = 0.05;
pub const HITCH_SECONDS: f32 = 0.1;
pub const HITCH_GRACE_SECONDS: f32 = 0.3;

pub const GRAVITY: f32 = 640.0;
pub const JUMP_SPEED: f32 = 270.0;
pub const RUN_SPEED: f32 = 80.0;
pub const SWIM_SPEED: f32 = 52.0;
pub const MAX_FALL_SPEED: f32 = 360.0;
pub const RESPAWN_INVULNERABLE_SECONDS: f32 = 2.5;
pub const START_LIVES: u32 = 3;
pub const START_CONTINUES: u32 = 3;
pub const SOLDIER_SPEED: f32 = 55.0;
pub const ENEMY_BULLET_SPEED: f32 = 95.0;

pub const MAX_ENTITIES: usize = 32;
pub const MAX_PLAYER_BULLETS: usize = 40;
pub const MAX_ENEMY_BULLETS: usize = 48;
pub const MAX_PARTICLES: usize = 96;
const MAX_SOLDIERS: usize = 6;

pub mod buttons {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const UP: u32 = 4;
    pub const DOWN: u32 = 8;
    pub const JUMP: u32 = 16;
    pub const FIRE: u32 = 32;
}

/// Bitmask returned by `advance` (sounds and saves on the JavaScript side).
pub mod events {
    pub const SHOOT: u32 = 1;
    pub const ENEMY_HIT: u32 = 2;
    pub const ENEMY_DOWN: u32 = 4;
    pub const EXPLOSION: u32 = 8;
    pub const HERO_DOWN: u32 = 16;
    pub const POWER_UP: u32 = 32;
    pub const CAPSULE_OPEN: u32 = 64;
    pub const BRIDGE_BLAST: u32 = 128;
    pub const CHECKPOINT: u32 = 256;
    pub const LIFE_LOST: u32 = 512;
    pub const GAME_OVER: u32 = 1024;
    pub const STAGE_CLEAR: u32 = 2048;
    pub const BOSS_HIT: u32 = 4096;
    pub const JUMP: u32 = 8192;
    pub const SPLASH: u32 = 16384;
    pub const HITCH: u32 = 32768;
    pub const ENEMY_SHOOT: u32 = 65536;
    pub const LASER: u32 = 131072;
    pub const BOSS_DOWN: u32 = 262144;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3, BossDown = 4, Cleared = 5 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Pose { Stand = 0, Run = 1, Somersault = 2, Fall = 3, Prone = 4, Swim = 5, Dying = 6, Hidden = 7 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Weapon { Rifle = 0, Rapid = 1, Spread = 2, Laser = 3 }

impl Weapon {
    pub fn from_u8(value: u8) -> Weapon {
        match value { 1 => Weapon::Rapid, 2 => Weapon::Spread, 3 => Weapon::Laser, _ => Weapon::Rifle }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EntityKind { Soldier = 0, Turret = 1, Cannon = 2, Sniper = 3, Capsule = 4, Pickup = 5, BossCannon = 6, BossCore = 7 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ParticleKind { Explosion = 0, BigExplosion = 1, Spark = 2, Splash = 3, Muzzle = 4 }

/// The 8 aim directions, index 0 = right, going clockwise (y grows downward).
pub const AIM_DIRECTIONS: [(f32, f32); 8] = [
    (1.0, 0.0), (0.70710677, 0.70710677), (0.0, 1.0), (-0.70710677, 0.70710677),
    (-1.0, 0.0), (-0.70710677, -0.70710677), (0.0, -1.0), (0.70710677, -0.70710677),
];
/// Turret directions: 12 steps of 30°, index 0 = right, clockwise.
pub const TURRET_DIRECTIONS: [(f32, f32); 12] = [
    (1.0, 0.0), (0.8660254, 0.5), (0.5, 0.8660254), (0.0, 1.0), (-0.5, 0.8660254), (-0.8660254, 0.5),
    (-1.0, 0.0), (-0.8660254, -0.5), (-0.5, -0.8660254), (0.0, -1.0), (0.5, -0.8660254), (0.8660254, -0.5),
];
/// Wall cannons only swing between down-left, left and up-left.
const CANNON_DIRECTIONS: [u8; 3] = [5, 6, 7];

#[derive(Clone, Copy, Debug)]
pub struct Hero {
    /// Feet position.
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub facing: f32,
    pub on_ground: bool,
    /// Platform under the feet, or -1.
    pub platform: i32,
    pub in_water: bool,
    pub is_prone: bool,
    pub is_spinning: bool,
    /// AIM_DIRECTIONS index.
    pub aim: u8,
    pub pose: Pose,
    pub stride: f32,
    pub invulnerable_seconds: f32,
    pub fire_cooldown: f32,
    /// A ledge being dropped through (ignored until the feet are below it), or -1.
    pub drop_through: i32,
}

impl Hero {
    fn new(x: f32) -> Hero {
        Hero { x, y: level::GROUND_TOP, velocity_x: 0.0, velocity_y: 0.0, facing: 1.0, on_ground: true, platform: 0, in_water: false, is_prone: false,
            is_spinning: false, aim: 0, pose: Pose::Stand, stride: 0.0, invulnerable_seconds: 0.0, fire_cooldown: 0.0, drop_through: -1 }
    }

    /// The hurt box (left, top, right, bottom): tiny while prone or somersaulting.
    pub fn hurt_box(&self) -> (f32, f32, f32, f32) {
        let (x, y) = (self.x, self.y);
        match self.pose {
            Pose::Prone => (x - 12.0, y - 9.0, x + 12.0, y),
            Pose::Somersault => (x - 7.0, y - 24.0, x + 7.0, y - 8.0),
            Pose::Swim => (x - 6.0, y - 24.0, x + 6.0, y - 12.0),
            _ => (x - 5.0, y - 30.0, x + 5.0, y),
        }
    }

    /// Where bullets leave the gun for the current pose and aim.
    pub fn muzzle(&self) -> (f32, f32) {
        let (direction_x, direction_y) = AIM_DIRECTIONS[self.aim as usize];
        match self.pose {
            Pose::Prone => (self.x + self.facing * 16.0, self.y - 7.0),
            Pose::Somersault => (self.x + direction_x * 10.0, self.y - 16.0 + direction_y * 10.0),
            Pose::Swim => {
                let lift = if self.aim == 6 { self.facing * 2.0 } else { 0.0 };
                (self.x + direction_x * 12.0 + lift, self.y - 20.0 + direction_y * 13.0)
            }
            _ => {
                let lift = if self.aim == 6 || self.aim == 2 { self.facing * 3.0 } else { 0.0 };
                (self.x + direction_x * 13.0 + lift, self.y - 21.0 + direction_y * 13.0)
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Entity {
    pub active: bool,
    pub kind: EntityKind,
    /// Kind-specific: sniper 0 hidden / 1 exposed; turret 0 rising / 1 armed; boss cannon 2 = wrecked.
    pub state: u8,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub timer: f32,
    pub hit_points: i32,
    /// TURRET_DIRECTIONS index for guns; facing sign for soldiers and snipers.
    pub aim: u8,
    pub facing: f32,
    pub base_y: f32,
    pub param: u8,
    /// Seconds left of the white hit flash.
    pub flash: f32,
    pub on_ground: bool,
}

impl Entity {
    const EMPTY: Entity = Entity { active: false, kind: EntityKind::Soldier, state: 0, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, timer: 0.0,
        hit_points: 0, aim: 0, facing: -1.0, base_y: 0.0, param: 0, flash: 0.0, on_ground: false };

    /// (left, top, right, bottom); soldiers and snipers stand on y, guns and capsules are centred on it.
    pub fn hit_box(&self) -> (f32, f32, f32, f32) {
        let (x, y) = (self.x, self.y);
        match self.kind {
            EntityKind::Soldier | EntityKind::Sniper => (x - 6.0, y - 28.0, x + 6.0, y),
            EntityKind::Turret => (x - 11.0, y - 11.0, x + 11.0, y + 11.0),
            EntityKind::Cannon => (x - 10.0, y - 9.0, x + 10.0, y + 9.0),
            EntityKind::Capsule => (x - 10.0, y - 6.0, x + 10.0, y + 6.0),
            EntityKind::Pickup => (x - 8.0, y - 12.0, x + 8.0, y),
            EntityKind::BossCannon => (x - 10.0, y - 7.0, x + 10.0, y + 7.0),
            EntityKind::BossCore => (x - 12.0, y - 14.0, x + 12.0, y + 14.0),
        }
    }

    /// Can a bullet hit it right now?
    pub fn is_target(&self) -> bool {
        match self.kind {
            EntityKind::Pickup => false,
            EntityKind::Sniper => self.param == 0 || self.state == 1,
            EntityKind::BossCannon => self.state != 2,
            _ => true,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Bullet {
    pub active: bool,
    pub weapon: Weapon,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    /// Laser beams pierce: one bit per entity slot already hit.
    pub hit_mask: u32,
}

impl Bullet {
    const EMPTY: Bullet = Bullet { active: false, weapon: Weapon::Rifle, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, hit_mask: 0 };
}

#[derive(Clone, Copy, Debug)]
pub struct EnemyBullet { pub active: bool, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32 }

impl EnemyBullet { const EMPTY: EnemyBullet = EnemyBullet { active: false, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0 }; }

#[derive(Clone, Copy, Debug)]
pub struct Particle { pub active: bool, pub kind: ParticleKind, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub age: f32, pub life: f32 }

impl Particle {
    const EMPTY: Particle = Particle { active: false, kind: ParticleKind::Spark, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, age: 0.0, life: 0.0 };
}

pub struct World {
    pub phase: Phase,
    pub phase_seconds: f32,
    pub hero: Hero,
    pub entities: [Entity; MAX_ENTITIES],
    pub bullets: [Bullet; MAX_PLAYER_BULLETS],
    pub enemy_bullets: [EnemyBullet; MAX_ENEMY_BULLETS],
    pub particles: [Particle; MAX_PARTICLES],
    pub platform_alive: [bool; PLATFORM_COUNT],
    /// Seconds since each bridge was stepped on, or -1.
    pub bridge_timers: [f32; level::BRIDGE_COUNT],
    pub camera_x: f32,
    pub view_width: f32,
    pub input: u32,
    previous_input: u32,
    jump_buffer_seconds: f32,
    fire_tapped: bool,
    accumulator: f32,
    events: u32,
    pub score: u32,
    pub lives: u32,
    pub continues: u32,
    pub weapon: Weapon,
    pub checkpoint_reached: bool,
    next_spawn: usize,
    soldier_timer: f32,
    soldiers_spawned: u32,
    random_state: u32,
    hitch_grace_seconds: f32,
    pub boss_active: bool,
    pub enemies_defeated: u32,
    pub debug_invincible: bool,
    pub clock: f32,
}

/// True if the boxes overlap.
fn overlaps(a: (f32, f32, f32, f32), b: (f32, f32, f32, f32)) -> bool { a.0 < b.2 && a.2 > b.0 && a.1 < b.3 && a.3 > b.1 }
fn contains(rect: (f32, f32, f32, f32), x: f32, y: f32) -> bool { x >= rect.0 && x <= rect.2 && y >= rect.1 && y <= rect.3 }
pub fn clamp_between(value: f32, low: f32, high: f32) -> f32 { if value < low { low } else if value > high { high } else { value } }
/// Unit vector toward (dx, dy) (pointing left if they coincide).
fn normalize(dx: f32, dy: f32) -> (f32, f32) {
    let length = (dx * dx + dy * dy).sqrt();
    if length < 0.001 { (-1.0, 0.0) } else { (dx / length, dy / length) }
}
/// A triangle wave in -1..1 with period 1 (a cheap stand-in for sin on the capsule's flight path).
fn wave(phase: f32) -> f32 {
    let fraction = phase - phase.floor();
    if fraction < 0.5 { 4.0 * fraction - 1.0 } else { 3.0 - 4.0 * fraction }
}
pub fn water_at(x: f32) -> Option<(f32, f32)> { level::WATER.iter().copied().find(|&(left, right)| x >= left && x <= right) }

impl Default for World { fn default() -> Self { World::new() } }

impl World {
    pub fn new() -> World {
        let mut world = World {
            phase: Phase::Ready, phase_seconds: 0.0, hero: Hero::new(level::HERO_START_X), entities: [Entity::EMPTY; MAX_ENTITIES],
            bullets: [Bullet::EMPTY; MAX_PLAYER_BULLETS], enemy_bullets: [EnemyBullet::EMPTY; MAX_ENEMY_BULLETS], particles: [Particle::EMPTY; MAX_PARTICLES],
            platform_alive: [true; PLATFORM_COUNT], bridge_timers: [-1.0; level::BRIDGE_COUNT], camera_x: 0.0, view_width: 400.0, input: 0, previous_input: 0,
            jump_buffer_seconds: 0.0, fire_tapped: false, accumulator: 0.0, events: 0, score: 0, lives: START_LIVES, continues: START_CONTINUES,
            weapon: Weapon::Rifle, checkpoint_reached: false, next_spawn: 0, soldier_timer: 1.0, soldiers_spawned: 0, random_state: 0x9e37_79b9,
            hitch_grace_seconds: 0.0, boss_active: false, enemies_defeated: 0, debug_invincible: false, clock: 0.0,
        };
        world.reset_stage();
        world
    }

    fn random(&mut self) -> f32 {
        self.random_state = self.random_state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.random_state >> 8) as f32 / 16_777_216.0
    }

    /// Put everything back for a (re)start at the beginning or at the checkpoint; score, lives and weapon are kept.
    fn reset_stage(&mut self) {
        for entity in self.entities.iter_mut() { entity.active = false; }
        for bullet in self.bullets.iter_mut() { bullet.active = false; }
        for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
        for particle in self.particles.iter_mut() { particle.active = false; }
        self.platform_alive = [true; PLATFORM_COUNT];
        self.bridge_timers = [-1.0; level::BRIDGE_COUNT];
        let start_x = if self.checkpoint_reached { level::CHECKPOINT_START_X } else { level::HERO_START_X };
        self.hero = Hero::new(start_x);
        self.hero.platform = self.platform_under(start_x, level::GROUND_TOP).map_or(-1, |index| index as i32);
        self.camera_x = 0.0;
        self.follow_camera(true);
        self.next_spawn = level::SPAWNS.iter().position(|spawn| spawn.x >= self.camera_x + 8.0).unwrap_or(level::SPAWNS.len());
        self.soldier_timer = 1.5;
        self.boss_active = false;
        self.accumulator = 0.0;
        self.jump_buffer_seconds = 0.0;
        self.fire_tapped = false;
        self.hitch_grace_seconds = 0.0;
    }

    pub fn start(&mut self) {
        if self.phase == Phase::Ready { self.phase = Phase::Playing; self.phase_seconds = 0.0; }
    }

    /// A brand-new game from the very beginning.
    pub fn restart(&mut self) {
        self.score = 0;
        self.lives = START_LIVES;
        self.continues = START_CONTINUES;
        self.weapon = Weapon::Rifle;
        self.checkpoint_reached = false;
        self.enemies_defeated = 0;
        self.reset_stage();
        self.phase = Phase::Ready;
        self.phase_seconds = 0.0;
    }

    /// After a game over: spend a continue to play on from the last checkpoint with fresh lives (the score resets).
    pub fn continue_game(&mut self) -> bool {
        if self.phase != Phase::GameOver || self.continues == 0 { return false; }
        self.continues -= 1;
        self.lives = START_LIVES;
        self.score = 0;
        self.weapon = Weapon::Rifle;
        self.reset_stage();
        self.hero.invulnerable_seconds = RESPAWN_INVULNERABLE_SECONDS;
        self.phase = Phase::Playing;
        self.phase_seconds = 0.0;
        true
    }

    /// Restore saved progress (after a refresh) onto the Ready screen.
    pub fn restore(&mut self, checkpoint_reached: bool, lives: u32, score: u32, weapon: u8, continues: u32) -> bool {
        if lives == 0 || lives > 9 || weapon > 3 || continues > START_CONTINUES { return false; }
        self.checkpoint_reached = checkpoint_reached;
        self.lives = lives;
        self.score = score;
        self.weapon = Weapon::from_u8(weapon);
        self.continues = continues;
        self.reset_stage();
        self.phase = Phase::Ready;
        self.phase_seconds = 0.0;
        true
    }

    pub fn press_jump(&mut self) { self.jump_buffer_seconds = 0.12; }
    pub fn press_fire(&mut self) { self.fire_tapped = true; }

    /// Simulate `seconds` of real time. Returns the events bitmask.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        self.events = 0;
        let seconds = if seconds > 0.0 { seconds } else { 0.0 }; // NaN or a clock going backwards
        let frame_seconds = if seconds > HITCH_SECONDS {
            if self.phase == Phase::Playing { self.events |= events::HITCH; self.hitch_grace_seconds = HITCH_GRACE_SECONDS; }
            1.0 / 60.0
        } else if seconds > MAX_FRAME_SECONDS { MAX_FRAME_SECONDS } else { seconds };
        if self.input & buttons::JUMP != 0 && self.previous_input & buttons::JUMP == 0 { self.press_jump(); }
        if self.input & buttons::FIRE != 0 && self.previous_input & buttons::FIRE == 0 { self.fire_tapped = true; }
        self.previous_input = self.input;
        self.accumulator += frame_seconds;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            self.step(STEP_SECONDS);
        }
        self.events
    }

    fn step(&mut self, dt: f32) {
        self.clock += dt;
        self.phase_seconds += dt;
        self.update_particles(dt);
        match self.phase {
            Phase::Ready | Phase::GameOver | Phase::Cleared => {}
            Phase::Playing => self.step_playing(dt),
            Phase::Dying => self.step_dying(dt),
            Phase::BossDown => self.step_boss_down(dt),
        }
    }

    fn step_playing(&mut self, dt: f32) {
        self.hitch_grace_seconds = (self.hitch_grace_seconds - dt).max(0.0);
        self.hero.invulnerable_seconds = (self.hero.invulnerable_seconds - dt).max(0.0);
        self.move_hero(dt);
        if self.phase != Phase::Playing { return; }
        self.follow_camera(false);
        self.update_bridges(dt);
        self.activate_spawns();
        self.spawn_soldiers(dt);
        self.fire_weapon(dt);
        self.update_bullets(dt);
        self.update_entities(dt);
        self.update_enemy_bullets(dt);
        if self.phase != Phase::Playing { return; }
        self.hero_meets_enemies();
        if !self.checkpoint_reached && self.hero.x >= level::CHECKPOINT_X {
            self.checkpoint_reached = true;
            self.events |= events::CHECKPOINT;
        }
    }

    // ---------------------------------------------------------------- terrain

    /// The highest live platform whose span covers x and whose top is at or below `feet_y` (within a small margin).
    pub fn platform_under(&self, x: f32, feet_y: f32) -> Option<usize> {
        let mut best: Option<usize> = None;
        for (index, platform) in PLATFORMS.iter().enumerate() {
            if !self.platform_alive[index] || x < platform.left || x > platform.right || platform.top < feet_y - 0.5 { continue; }
            if best.map_or(true, |current| platform.top < PLATFORMS[current].top) { best = Some(index); }
        }
        best
    }

    /// Landing: the highest live platform crossed between `previous_y` and `y` at x (skipping `ignore`).
    fn landing_platform(&self, x: f32, previous_y: f32, y: f32, ignore: i32) -> Option<usize> {
        let mut best: Option<usize> = None;
        for (index, platform) in PLATFORMS.iter().enumerate() {
            if !self.platform_alive[index] || index as i32 == ignore || x < platform.left || x > platform.right { continue; }
            if previous_y <= platform.top + 0.01 && y >= platform.top && best.map_or(true, |current| platform.top < PLATFORMS[current].top) { best = Some(index); }
        }
        best
    }

    fn update_bridges(&mut self, dt: f32) {
        for bridge in 0..level::BRIDGE_COUNT {
            let first = level::BRIDGES[bridge];
            if self.bridge_timers[bridge] < 0.0 {
                let standing = self.hero.on_ground && self.hero.platform >= first as i32 && self.hero.platform < (first + level::PLANKS_PER_BRIDGE) as i32;
                if standing { self.bridge_timers[bridge] = 0.0; }
                continue;
            }
            self.bridge_timers[bridge] += dt;
            for plank in 0..level::PLANKS_PER_BRIDGE {
                let index = first + plank;
                if self.platform_alive[index] && self.bridge_timers[bridge] >= 0.45 + plank as f32 * 0.3 {
                    self.platform_alive[index] = false;
                    let center = (PLATFORMS[index].left + PLATFORMS[index].right) * 0.5;
                    self.add_particle(ParticleKind::Explosion, center, level::GROUND_TOP - 6.0, 0.0, 0.0, 0.5);
                    self.events |= events::BRIDGE_BLAST | events::EXPLOSION;
                }
            }
        }
    }

    // ---------------------------------------------------------------- hero

    fn move_hero(&mut self, dt: f32) {
        let input = self.input;
        let held = |button: u32| input & button != 0;
        let (left, right, up, down) = (held(buttons::LEFT), held(buttons::RIGHT), held(buttons::UP), held(buttons::DOWN));
        let direction = (right as i32 - left as i32) as f32;
        let jump_pressed = self.jump_buffer_seconds > 0.0;
        self.jump_buffer_seconds = (self.jump_buffer_seconds - dt).max(0.0);
        let hero = &mut self.hero;
        hero.fire_cooldown = (hero.fire_cooldown - dt).max(0.0);
        if direction != 0.0 { hero.facing = direction; }
        let facing_aim: u8 = if hero.facing > 0.0 { 0 } else { 4 };

        if hero.in_water {
            hero.is_prone = false;
            hero.is_spinning = false;
            hero.velocity_x = direction * SWIM_SPEED;
            hero.x += hero.velocity_x * dt;
            hero.stride += dt * direction.abs() * 6.0;
            hero.pose = Pose::Swim;
            self.jump_buffer_seconds = 0.0;
            // in the water you can only shoot forward or up
            hero.aim = if up && direction != 0.0 { if hero.facing > 0.0 { 7 } else { 5 } } else if up { 6 } else { facing_aim };
            if let Some((water_left, water_right)) = water_at(hero.x) {
                // wade out onto the bank at either end
                let bank_x = if hero.x > water_right - 6.0 && right { Some(water_right + 4.0) } else if hero.x < water_left + 6.0 && left { Some(water_left - 4.0) } else { None };
                if let Some(bank_x) = bank_x {
                    let platform = self.platform_under(bank_x, level::GROUND_TOP);
                    if let Some(platform) = platform {
                        let hero = &mut self.hero;
                        hero.x = bank_x;
                        hero.y = PLATFORMS[platform].top;
                        hero.in_water = false;
                        hero.on_ground = true;
                        hero.platform = platform as i32;
                        hero.pose = Pose::Stand;
                    }
                }
            } else {
                hero.in_water = false; // pushed out by the camera edge onto a bank
            }
            self.clamp_hero_x();
            return;
        }

        let mut started_jump = false;
        let mut dropped = false;
        if hero.on_ground {
            hero.is_prone = down && direction == 0.0 && !up;
            hero.velocity_x = if hero.is_prone { 0.0 } else { direction * RUN_SPEED };
            if jump_pressed {
                self.jump_buffer_seconds = 0.0;
                let platform_kind = if hero.platform >= 0 { PLATFORMS[hero.platform as usize].kind } else { PlatformKind::Ground };
                if down && platform_kind == PlatformKind::Ledge {
                    hero.drop_through = hero.platform;
                    dropped = true;
                } else if down {
                    // Down + Jump on solid ground does nothing (stay prone)
                } else {
                    hero.velocity_y = -JUMP_SPEED;
                    hero.is_spinning = true;
                    started_jump = true;
                }
                if started_jump || dropped {
                    hero.on_ground = false;
                    hero.platform = -1;
                    hero.is_prone = false;
                }
            }
        } else {
            hero.is_prone = false;
            hero.velocity_x = direction * RUN_SPEED;
        }
        if started_jump { self.events |= events::JUMP; }
        let _ = dropped;

        let hero = &mut self.hero;
        let previous_y = hero.y;
        if !hero.on_ground {
            hero.velocity_y = (hero.velocity_y + GRAVITY * dt).min(MAX_FALL_SPEED);
            hero.y += hero.velocity_y * dt;
        }
        hero.x += hero.velocity_x * dt;
        self.clamp_hero_x();

        let hero_x = self.hero.x;
        if self.hero.on_ground {
            // walked off the edge, or the plank underneath blew up
            let platform = self.hero.platform;
            let supported = platform >= 0 && self.platform_alive[platform as usize]
                && hero_x >= PLATFORMS[platform as usize].left - 1.0 && hero_x <= PLATFORMS[platform as usize].right + 1.0;
            if !supported {
                let next = self.platform_under(hero_x, self.hero.y);
                match next {
                    Some(index) if (PLATFORMS[index].top - self.hero.y).abs() < 0.5 => self.hero.platform = index as i32,
                    _ => { self.hero.on_ground = false; self.hero.platform = -1; self.hero.velocity_y = 0.0; }
                }
            }
        } else if self.hero.velocity_y >= 0.0 {
            if let Some(index) = self.landing_platform(hero_x, previous_y, self.hero.y, self.hero.drop_through) {
                let hero = &mut self.hero;
                hero.y = PLATFORMS[index].top;
                hero.velocity_y = 0.0;
                hero.on_ground = true;
                hero.platform = index as i32;
                hero.is_spinning = false;
                hero.drop_through = -1;
            }
        }
        let hero = &mut self.hero;
        if hero.drop_through >= 0 && hero.y > PLATFORMS[hero.drop_through as usize].top + 4.0 { hero.drop_through = -1; }
        if !hero.on_ground && hero.y >= level::WATER_FEET_Y && water_at(hero.x).is_some() {
            hero.y = level::WATER_FEET_Y;
            hero.velocity_y = 0.0;
            hero.in_water = true;
            hero.is_spinning = false;
            hero.pose = Pose::Swim;
            let x = hero.x;
            self.add_particle(ParticleKind::Splash, x, level::WATER_SURFACE_Y, 0.0, 0.0, 0.45);
            self.events |= events::SPLASH;
            return;
        }
        if hero.y > level::KILL_Y { self.kill_hero(); return; }

        // aim and pose
        let hero = &mut self.hero;
        if !hero.on_ground {
            hero.aim = match (direction as i32, up, down) {
                (0, true, _) => 6,
                (0, false, true) => 2,
                (1, true, _) => 7,
                (1, false, true) => 1,
                (-1, true, _) => 5,
                (-1, false, true) => 3,
                _ => facing_aim,
            };
            hero.pose = if hero.is_spinning { Pose::Somersault } else { Pose::Fall };
        } else if hero.is_prone {
            hero.aim = facing_aim;
            hero.pose = Pose::Prone;
        } else {
            let moving = direction != 0.0;
            hero.aim = if up && moving { if hero.facing > 0.0 { 7 } else { 5 } } else if up { 6 } else if down && moving { if hero.facing > 0.0 { 1 } else { 3 } } else { facing_aim };
            hero.pose = if moving { Pose::Run } else { Pose::Stand };
            if moving { hero.stride += dt * 9.0; }
        }
    }

    fn clamp_hero_x(&mut self) {
        let right_limit = if self.boss_active { level::BOSS_WALL_X - 14.0 } else { (self.camera_x + self.view_width - 8.0).min(level::BOSS_WALL_X - 14.0) };
        self.hero.x = clamp_between(self.hero.x, self.camera_x + 6.0, right_limit);
    }

    /// The camera only scrolls forward (the jungle closes in behind you) and stops at the gate.
    fn follow_camera(&mut self, snap: bool) {
        let target = self.hero.x - self.view_width * 0.38;
        let limit = (level::LEVEL_END - self.view_width).max(0.0);
        if snap || target > self.camera_x { self.camera_x = clamp_between(target, 0.0, limit); }
        self.camera_x = self.camera_x.min(limit);
    }

    fn kill_hero(&mut self) {
        if self.phase != Phase::Playing { return; }
        self.phase = Phase::Dying;
        self.phase_seconds = 0.0;
        let hero = &mut self.hero;
        hero.pose = Pose::Dying;
        hero.velocity_x = -hero.facing * 45.0;
        hero.velocity_y = if hero.y > level::KILL_Y { 0.0 } else { -170.0 };
        hero.in_water = false;
        self.events |= events::HERO_DOWN;
    }

    fn step_dying(&mut self, dt: f32) {
        let hero = &mut self.hero;
        if hero.y < level::KILL_Y + 40.0 {
            hero.velocity_y = (hero.velocity_y + GRAVITY * dt).min(MAX_FALL_SPEED);
            let previous_y = hero.y;
            hero.y += hero.velocity_y * dt;
            hero.x += hero.velocity_x * dt;
            // land flat on whatever is below
            if hero.velocity_y > 0.0 {
                if let Some(index) = self.landing_platform(self.hero.x, previous_y, self.hero.y, -1) {
                    self.hero.y = PLATFORMS[index].top;
                    self.hero.velocity_y = 0.0;
                    self.hero.velocity_x = 0.0;
                }
            }
        }
        self.update_enemy_bullets(dt);
        if self.phase_seconds < 1.4 { return; }
        self.lives = self.lives.saturating_sub(1);
        self.weapon = Weapon::Rifle;
        if self.lives == 0 {
            self.phase = Phase::GameOver;
            self.phase_seconds = 0.0;
            self.events |= events::GAME_OVER;
            return;
        }
        self.respawn();
        self.events |= events::LIFE_LOST;
    }

    /// Drop back in from the top of the screen above the first safe spot near the left edge.
    fn respawn(&mut self) {
        let mut x = self.camera_x + 30.0;
        let end = self.camera_x + self.view_width - 20.0;
        while x < end {
            if self.platform_under(x, 0.0).is_some() || water_at(x).is_some() { break; }
            x += 8.0;
        }
        let hero = &mut self.hero;
        *hero = Hero::new(x);
        hero.y = 8.0;
        hero.on_ground = false;
        hero.platform = -1;
        hero.pose = Pose::Fall;
        hero.invulnerable_seconds = RESPAWN_INVULNERABLE_SECONDS;
        for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
        self.phase = Phase::Playing;
        self.phase_seconds = 0.0;
        self.soldier_timer = 1.5;
    }

    // ---------------------------------------------------------------- shooting

    fn fire_weapon(&mut self, _dt: f32) {
        let wants_fire = self.input & buttons::FIRE != 0 || self.fire_tapped;
        if !wants_fire || self.hero.fire_cooldown > 0.0 { return; }
        let (cooldown, speed, limit) = match self.weapon {
            Weapon::Rifle => (0.18, 220.0, 4),
            Weapon::Rapid => (0.1, 270.0, 7),
            Weapon::Spread => (0.26, 200.0, 20),
            Weapon::Laser => (0.42, 360.0, 2),
        };
        let weapon = self.weapon;
        let alive = self.bullets.iter().filter(|bullet| bullet.active && (bullet.weapon == weapon)).count();
        if alive >= limit { return; }
        self.fire_tapped = false;
        self.hero.fire_cooldown = cooldown;
        let (muzzle_x, muzzle_y) = self.hero.muzzle();
        let (direction_x, direction_y) = AIM_DIRECTIONS[self.hero.aim as usize];
        if weapon == Weapon::Spread {
            // five pellets fanned out at 0, ±15° and ±30°
            const FAN: [(f32, f32); 5] = [(1.0, 0.0), (0.9659258, 0.25881904), (0.9659258, -0.25881904), (0.8660254, 0.5), (0.8660254, -0.5)];
            for (cos, sin) in FAN {
                let (vx, vy) = (direction_x * cos - direction_y * sin, direction_x * sin + direction_y * cos);
                self.add_bullet(weapon, muzzle_x, muzzle_y, vx * speed, vy * speed);
            }
        } else {
            self.add_bullet(weapon, muzzle_x, muzzle_y, direction_x * speed, direction_y * speed);
        }
        self.add_particle(ParticleKind::Muzzle, muzzle_x, muzzle_y, 0.0, 0.0, 0.06);
        self.events |= if weapon == Weapon::Laser { events::LASER } else { events::SHOOT };
    }

    fn add_bullet(&mut self, weapon: Weapon, x: f32, y: f32, velocity_x: f32, velocity_y: f32) {
        if let Some(bullet) = self.bullets.iter_mut().find(|bullet| !bullet.active) {
            *bullet = Bullet { active: true, weapon, x, y, velocity_x, velocity_y, hit_mask: 0 };
        }
    }

    fn add_enemy_bullet(&mut self, x: f32, y: f32, direction_x: f32, direction_y: f32) {
        if let Some(bullet) = self.enemy_bullets.iter_mut().find(|bullet| !bullet.active) {
            *bullet = EnemyBullet { active: true, x, y, velocity_x: direction_x * ENEMY_BULLET_SPEED, velocity_y: direction_y * ENEMY_BULLET_SPEED };
            self.events |= events::ENEMY_SHOOT;
        }
    }

    pub fn add_particle(&mut self, kind: ParticleKind, x: f32, y: f32, velocity_x: f32, velocity_y: f32, life: f32) {
        // when the pool is full the oldest particle is recycled
        let mut slot = 0;
        let mut oldest = -1.0;
        for (index, particle) in self.particles.iter().enumerate() {
            if !particle.active { slot = index; break; }
            let progress = particle.age / particle.life;
            if progress > oldest { oldest = progress; slot = index; }
        }
        self.particles[slot] = Particle { active: true, kind, x, y, velocity_x, velocity_y, age: 0.0, life };
    }

    fn update_particles(&mut self, dt: f32) {
        for particle in self.particles.iter_mut().filter(|particle| particle.active) {
            particle.age += dt;
            particle.x += particle.velocity_x * dt;
            particle.y += particle.velocity_y * dt;
            if particle.kind == ParticleKind::Spark { particle.velocity_y += 300.0 * dt; }
            if particle.age >= particle.life { particle.active = false; }
        }
    }

    fn is_on_screen(&self, x: f32, y: f32, margin: f32) -> bool {
        x > self.camera_x - margin && x < self.camera_x + self.view_width + margin && y > -margin && y < 240.0 + margin
    }

    fn update_bullets(&mut self, dt: f32) {
        for bullet_index in 0..MAX_PLAYER_BULLETS {
            if !self.bullets[bullet_index].active { continue; }
            {
                let bullet = &mut self.bullets[bullet_index];
                bullet.x += bullet.velocity_x * dt;
                bullet.y += bullet.velocity_y * dt;
            }
            let (x, y) = (self.bullets[bullet_index].x, self.bullets[bullet_index].y);
            if !self.is_on_screen(x, y, 8.0) { self.bullets[bullet_index].active = false; continue; }
            let is_laser = self.bullets[bullet_index].weapon == Weapon::Laser;
            for entity_index in 0..MAX_ENTITIES {
                let entity = &self.entities[entity_index];
                if !entity.active || !entity.is_target() { continue; }
                let mut hit_box = entity.hit_box();
                if is_laser { hit_box = (hit_box.0 - 8.0, hit_box.1 - 2.0, hit_box.2 + 8.0, hit_box.3 + 2.0); } // the beam is long
                if !contains(hit_box, x, y) { continue; }
                if is_laser {
                    let bit = 1u32 << entity_index;
                    if self.bullets[bullet_index].hit_mask & bit != 0 { continue; }
                    self.bullets[bullet_index].hit_mask |= bit;
                    self.damage_entity(entity_index, 4);
                } else {
                    self.bullets[bullet_index].active = false;
                    self.damage_entity(entity_index, 1);
                    break;
                }
            }
        }
    }

    fn damage_entity(&mut self, index: usize, damage: i32) {
        let x = self.entities[index].x;
        let y = self.entities[index].y;
        let kind = self.entities[index].kind;
        self.entities[index].hit_points -= damage;
        self.entities[index].flash = 0.08;
        self.events |= if kind == EntityKind::BossCore || kind == EntityKind::BossCannon { events::BOSS_HIT } else { events::ENEMY_HIT };
        self.add_particle(ParticleKind::Spark, x, y - if matches!(kind, EntityKind::Soldier | EntityKind::Sniper) { 16.0 } else { 0.0 }, 0.0, -40.0, 0.18);
        if self.entities[index].hit_points > 0 { return; }
        self.enemies_defeated += 1;
        self.events |= events::ENEMY_DOWN | events::EXPLOSION;
        let center_y = if matches!(kind, EntityKind::Soldier | EntityKind::Sniper) { y - 14.0 } else { y };
        match kind {
            EntityKind::Soldier => { self.score += 100; self.add_particle(ParticleKind::Explosion, x, center_y, 0.0, 0.0, 0.4); self.entities[index].active = false; }
            EntityKind::Sniper => { self.score += 300; self.add_particle(ParticleKind::Explosion, x, center_y, 0.0, 0.0, 0.4); self.entities[index].active = false; }
            EntityKind::Turret | EntityKind::Cannon => { self.score += 500; self.add_particle(ParticleKind::BigExplosion, x, y, 0.0, 0.0, 0.6); self.entities[index].active = false; }
            EntityKind::Capsule => {
                self.score += 200;
                self.add_particle(ParticleKind::Explosion, x, y, 0.0, 0.0, 0.4);
                let weapon = self.entities[index].param;
                self.entities[index] = Entity { active: true, kind: EntityKind::Pickup, x, y, velocity_x: 30.0, velocity_y: -140.0, param: weapon, ..Entity::EMPTY };
                self.events |= events::CAPSULE_OPEN;
            }
            EntityKind::BossCannon => {
                self.score += 1000;
                self.add_particle(ParticleKind::BigExplosion, x, y, 0.0, 0.0, 0.6);
                self.entities[index].state = 2;
            }
            EntityKind::BossCore => {
                self.score += 10_000;
                self.add_particle(ParticleKind::BigExplosion, x, y, 0.0, 0.0, 0.8);
                self.entities[index].active = false;
                self.phase = Phase::BossDown;
                self.phase_seconds = 0.0;
                for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
                for entity in self.entities.iter_mut() { if entity.kind == EntityKind::BossCannon { entity.state = 2; } }
                self.events |= events::BOSS_DOWN;
            }
            EntityKind::Pickup => {}
        }
    }

    // ---------------------------------------------------------------- enemies

    fn add_entity(&mut self, entity: Entity) -> bool {
        if let Some(slot) = self.entities.iter_mut().find(|slot| !slot.active) { *slot = entity; true } else { false }
    }

    fn activate_spawns(&mut self) {
        let right_edge = self.camera_x + self.view_width;
        while self.next_spawn < level::SPAWNS.len() && level::SPAWNS[self.next_spawn].x <= right_edge + 24.0 {
            let spawn = level::SPAWNS[self.next_spawn];
            self.next_spawn += 1;
            let entity = match spawn.kind {
                SpawnKind::Turret => Entity { active: true, kind: EntityKind::Turret, x: spawn.x, y: spawn.y, hit_points: 8, aim: 6, ..Entity::EMPTY },
                SpawnKind::Cannon => Entity { active: true, kind: EntityKind::Cannon, x: spawn.x, y: spawn.y, hit_points: 6, aim: 6, state: 1, ..Entity::EMPTY },
                SpawnKind::Sniper => Entity { active: true, kind: EntityKind::Sniper, x: spawn.x, y: spawn.y, hit_points: 1, param: spawn.param, timer: 0.6, ..Entity::EMPTY },
                SpawnKind::Capsule => Entity { active: true, kind: EntityKind::Capsule, x: self.camera_x - 12.0, y: spawn.y, base_y: spawn.y, hit_points: 1, param: spawn.param, ..Entity::EMPTY },
                SpawnKind::BossCannon => {
                    self.boss_active = true;
                    Entity { active: true, kind: EntityKind::BossCannon, x: level::BOSS_CANNON_X, y: spawn.y, hit_points: 10, aim: 6, param: spawn.param, timer: spawn.param as f32 * 1.0, ..Entity::EMPTY }
                }
                SpawnKind::BossCore => { self.boss_active = true; Entity { active: true, kind: EntityKind::BossCore, x: level::BOSS_CORE_X, y: spawn.y, hit_points: 40, ..Entity::EMPTY } }
            };
            self.add_entity(entity);
        }
    }

    fn spawn_soldiers(&mut self, dt: f32) {
        if self.boss_active { return; }
        let center = self.camera_x + self.view_width * 0.5;
        let Some(&(_, _, interval)) = level::SOLDIER_ZONES.iter().find(|&&(from, to, _)| center >= from && center <= to) else { return; };
        self.soldier_timer -= dt;
        if self.soldier_timer > 0.0 { return; }
        self.soldier_timer = interval * (0.75 + self.random() * 0.5);
        let soldiers = self.entities.iter().filter(|entity| entity.active && entity.kind == EntityKind::Soldier).count();
        if soldiers >= MAX_SOLDIERS { return; }
        self.soldiers_spawned += 1;
        let from_left = self.soldiers_spawned % 4 == 0;
        let x = if from_left { self.camera_x - 6.0 } else { self.camera_x + self.view_width + 6.0 };
        // pick one of the platforms at that edge
        let mut candidates = [0usize; 4];
        let mut count = 0;
        for (index, platform) in PLATFORMS.iter().enumerate() {
            if self.platform_alive[index] && platform.kind != PlatformKind::Bridge && x >= platform.left && x <= platform.right && count < candidates.len() {
                candidates[count] = index;
                count += 1;
            }
        }
        if count == 0 { return; }
        let choice = candidates[((self.random() * count as f32) as usize).min(count - 1)];
        let direction = if from_left { 1.0 } else { -1.0 };
        self.add_entity(Entity { active: true, kind: EntityKind::Soldier, x, y: PLATFORMS[choice].top, velocity_x: direction * SOLDIER_SPEED, facing: direction,
            hit_points: 1, on_ground: true, ..Entity::EMPTY });
    }

    /// TURRET_DIRECTIONS index pointing closest to (dx, dy), limited to `allowed` if given.
    fn closest_direction(dx: f32, dy: f32, allowed: Option<&[u8]>) -> u8 {
        let (ux, uy) = normalize(dx, dy);
        let mut best = 0u8;
        let mut best_dot = -2.0;
        for (index, &(cx, cy)) in TURRET_DIRECTIONS.iter().enumerate() {
            if let Some(allowed) = allowed { if !allowed.contains(&(index as u8)) { continue; } }
            let dot = ux * cx + uy * cy;
            if dot > best_dot { best_dot = dot; best = index as u8; }
        }
        best
    }

    fn update_entities(&mut self, dt: f32) {
        let (hero_x, hero_y) = (self.hero.x, self.hero.y - 15.0);
        for index in 0..MAX_ENTITIES {
            if !self.entities[index].active { continue; }
            let mut entity = self.entities[index];
            entity.flash = (entity.flash - dt).max(0.0);
            entity.timer += dt;
            let on_screen = self.is_on_screen(entity.x, entity.y, 0.0);
            let mut fire: Option<(f32, f32, f32, f32)> = None;
            match entity.kind {
                EntityKind::Soldier => {
                    let previous_y = entity.y;
                    entity.x += entity.velocity_x * dt;
                    if entity.on_ground {
                        let still = PLATFORMS.iter().enumerate().any(|(platform_index, platform)| self.platform_alive[platform_index]
                            && (platform.top - entity.y).abs() < 0.5 && entity.x >= platform.left && entity.x <= platform.right);
                        if !still {
                            entity.on_ground = false;
                            // some leap off ledges, the rest just drop
                            entity.velocity_y = if self.random() < 0.4 { -170.0 } else { 0.0 };
                        }
                    } else {
                        entity.velocity_y = (entity.velocity_y + GRAVITY * dt).min(MAX_FALL_SPEED);
                        entity.y += entity.velocity_y * dt;
                        if entity.velocity_y >= 0.0 {
                            if let Some(platform) = self.landing_platform(entity.x, previous_y, entity.y, -1) {
                                entity.y = PLATFORMS[platform].top;
                                entity.velocity_y = 0.0;
                                entity.on_ground = true;
                            }
                        }
                    }
                    if entity.y >= level::WATER_FEET_Y - 4.0 && water_at(entity.x).is_some() {
                        self.add_particle(ParticleKind::Splash, entity.x, level::WATER_SURFACE_Y, 0.0, 0.0, 0.45);
                        entity.active = false;
                    }
                    if entity.y > level::KILL_Y || entity.x < self.camera_x - 40.0 || entity.x > self.camera_x + self.view_width + 60.0 { entity.active = false; }
                }
                EntityKind::Turret | EntityKind::Cannon | EntityKind::BossCannon => {
                    if entity.kind == EntityKind::BossCannon && entity.state == 2 { self.entities[index] = entity; continue; }
                    if entity.kind == EntityKind::Turret && entity.state == 0 {
                        if entity.timer > 0.5 { entity.state = 1; entity.timer = 0.6; } // pops up out of the ground
                    } else {
                        let allowed: Option<&[u8]> = if entity.kind == EntityKind::Turret { None } else { Some(&CANNON_DIRECTIONS) };
                        let target = World::closest_direction(hero_x - entity.x, hero_y - entity.y, allowed);
                        // turn one 30° step at a time, the shorter way round
                        let turn_interval = 0.22;
                        if entity.aim != target && (entity.timer % turn_interval) < dt {
                            let difference = (target as i32 - entity.aim as i32).rem_euclid(12);
                            entity.aim = ((entity.aim as i32 + if difference <= 6 { 1 } else { -1 }).rem_euclid(12)) as u8;
                        }
                        let fire_interval = if entity.kind == EntityKind::BossCannon { 2.0 } else { 1.7 };
                        if entity.timer >= fire_interval && on_screen && self.hitch_grace_seconds <= 0.0 {
                            entity.timer = 0.0;
                            if entity.aim == target || entity.kind != EntityKind::Turret {
                                let (dx, dy) = TURRET_DIRECTIONS[entity.aim as usize];
                                fire = Some((entity.x + dx * 12.0, entity.y + dy * 12.0, dx, dy));
                            }
                        }
                    }
                    if entity.x < self.camera_x - 30.0 { entity.active = false; }
                }
                EntityKind::Sniper => {
                    entity.facing = if hero_x < entity.x { -1.0 } else { 1.0 };
                    let aimed_shot = |entity: &Entity| {
                        let muzzle = (entity.x + entity.facing * 8.0, entity.y - 22.0);
                        let (dx, dy) = normalize(hero_x - muzzle.0, hero_y - muzzle.1);
                        (muzzle.0, muzzle.1, dx, dy)
                    };
                    if entity.param == 0 {
                        if entity.timer >= 1.8 && on_screen { entity.timer = 0.0; fire = Some(aimed_shot(&entity)); }
                    } else if entity.state == 0 {
                        if entity.timer >= 2.2 && on_screen { entity.state = 1; entity.timer = 0.0; }
                    } else {
                        if entity.timer >= 0.45 && entity.timer - dt < 0.45 { fire = Some(aimed_shot(&entity)); }
                        if entity.timer >= 1.3 { entity.state = 0; entity.timer = 0.0; }
                    }
                    if entity.x < self.camera_x - 30.0 { entity.active = false; }
                }
                EntityKind::Capsule => {
                    entity.x += 70.0 * dt;
                    entity.y = entity.base_y + wave(entity.timer * 0.6) * 18.0;
                    if entity.x > self.camera_x + self.view_width + 30.0 { entity.active = false; }
                }
                EntityKind::Pickup => {
                    if !entity.on_ground {
                        let previous_y = entity.y;
                        entity.velocity_y = (entity.velocity_y + GRAVITY * 0.6 * dt).min(200.0);
                        entity.y += entity.velocity_y * dt;
                        entity.x += entity.velocity_x * dt;
                        if entity.velocity_y >= 0.0 {
                            if let Some(platform) = self.landing_platform(entity.x, previous_y, entity.y, -1) {
                                entity.y = PLATFORMS[platform].top;
                                entity.on_ground = true;
                            } else if entity.y >= level::WATER_SURFACE_Y + 4.0 && water_at(entity.x).is_some() {
                                entity.y = level::WATER_SURFACE_Y + 4.0; // floats
                                entity.on_ground = true;
                            }
                        }
                    }
                    if entity.y > level::KILL_Y || entity.x < self.camera_x - 30.0 { entity.active = false; }
                }
                EntityKind::BossCore => {}
            }
            self.entities[index] = entity;
            if let Some((x, y, dx, dy)) = fire { self.add_enemy_bullet(x, y, dx, dy); }
        }
    }

    fn update_enemy_bullets(&mut self, dt: f32) {
        for index in 0..MAX_ENEMY_BULLETS {
            if !self.enemy_bullets[index].active { continue; }
            let bullet = &mut self.enemy_bullets[index];
            bullet.x += bullet.velocity_x * dt;
            bullet.y += bullet.velocity_y * dt;
            let (x, y) = (bullet.x, bullet.y);
            if !self.is_on_screen(x, y, 10.0) { self.enemy_bullets[index].active = false; }
        }
    }

    fn can_be_hurt(&self) -> bool {
        self.phase == Phase::Playing && self.hero.invulnerable_seconds <= 0.0 && self.hitch_grace_seconds <= 0.0 && !self.debug_invincible
    }

    fn hero_meets_enemies(&mut self) {
        let hurt_box = self.hero.hurt_box();
        // pickups are collected even while invulnerable
        for index in 0..MAX_ENTITIES {
            let entity = self.entities[index];
            if !entity.active || entity.kind != EntityKind::Pickup || !overlaps(hurt_box, entity.hit_box()) { continue; }
            self.weapon = Weapon::from_u8(entity.param);
            self.entities[index].active = false;
            self.score += 500;
            self.events |= events::POWER_UP;
        }
        if !self.can_be_hurt() { return; }
        for bullet in self.enemy_bullets.iter() {
            if bullet.active && contains((hurt_box.0 - 1.5, hurt_box.1 - 1.5, hurt_box.2 + 1.5, hurt_box.3 + 1.5), bullet.x, bullet.y) {
                self.kill_hero();
                return;
            }
        }
        for entity in self.entities.iter() {
            if entity.active && entity.kind == EntityKind::Soldier && overlaps(hurt_box, entity.hit_box()) {
                self.kill_hero();
                return;
            }
        }
    }

    // ---------------------------------------------------------------- boss

    fn step_boss_down(&mut self, dt: f32) {
        // a chain of explosions across the gate, then the stage is clear
        let before = ((self.phase_seconds - dt) / 0.14) as i32;
        let now = (self.phase_seconds / 0.14) as i32;
        if now != before && self.phase_seconds < 2.6 {
            let x = level::BOSS_WALL_X + self.random() * 70.0;
            let y = 60.0 + self.random() * 140.0;
            self.add_particle(ParticleKind::BigExplosion, x, y, 0.0, 0.0, 0.6);
            self.events |= events::EXPLOSION;
        }
        self.update_bullets(dt);
        if self.phase_seconds >= 3.0 {
            self.phase = Phase::Cleared;
            self.phase_seconds = 0.0;
            self.score += 5000 + self.lives * 1000;
            self.events |= events::STAGE_CLEAR;
        }
    }

    // ---------------------------------------------------------------- test hooks

    /// Move the hero to x on the ground (or into the water) and snap the camera; enemies left behind vanish.
    pub fn teleport(&mut self, x: f32) {
        let x = clamp_between(x, 8.0, level::BOSS_WALL_X - 14.0);
        let mut hero = Hero::new(x);
        hero.invulnerable_seconds = self.hero.invulnerable_seconds;
        if let Some(index) = self.platform_under(x, level::GROUND_TOP) {
            hero.y = PLATFORMS[index].top;
            hero.platform = index as i32;
        } else if water_at(x).is_some() {
            hero.y = level::WATER_FEET_Y;
            hero.in_water = true;
            hero.on_ground = false;
            hero.pose = Pose::Swim;
        }
        self.hero = hero;
        self.camera_x = 0.0;
        self.follow_camera(true);
        let camera_x = self.camera_x;
        for entity in self.entities.iter_mut() { if entity.x < camera_x - 20.0 && entity.kind != EntityKind::Pickup { entity.active = false; } }
        for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
        while self.next_spawn < level::SPAWNS.len() && level::SPAWNS[self.next_spawn].x < camera_x { self.next_spawn += 1; }
    }

    pub fn active_count(&self, kind: EntityKind) -> usize { self.entities.iter().filter(|entity| entity.active && entity.kind == kind).count() }
}
