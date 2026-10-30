//! The whole simulation of Pralay Run: Aru's movement (run, jump, double jump, dash, shoot), the Pralay — the
//! collapse that eats the sky-temple from the left and speeds up over time — hazards, enemies, scoring and the run flow.
//!
//! Frame-time protection (same rules as the other action games): fixed 1/120 s steps; a frame gap longer than
//! HITCH_SECONDS (the page froze) is dropped to one 60 Hz frame; otherwise at most MAX_FRAME_SECONDS are simulated.

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const MAX_FRAME_SECONDS: f32 = 0.05;
pub const HITCH_SECONDS: f32 = 0.1;

/// The view is always 270 world units tall.
pub const VIEW_HEIGHT: f32 = 270.0;
/// Below this the hero (or an enemy) has fallen out of the world.
pub const KILL_Y: f32 = 320.0;
pub const HERO_HALF_WIDTH: f32 = 5.0;
pub const HERO_HEIGHT: f32 = 18.0;
pub const MAX_HP: u32 = 3;
pub const START_X: f32 = 40.0;
pub const START_GROUND: f32 = 196.0;

pub const MAX_PLATFORMS: usize = 80;
pub const MAX_PROPS: usize = 48;
pub const MAX_ENEMIES: usize = 24;
pub const MAX_BULLETS: usize = 40;
pub const MAX_EFFECTS: usize = 48;

const RUN_SPEED: f32 = 150.0;
const GROUND_ACCELERATION: f32 = 1500.0;
const AIR_ACCELERATION: f32 = 1050.0;
const FRICTION: f32 = 1700.0;
const GRAVITY: f32 = 1350.0;
/// Extra gravity while rising with jump released: a tap is a hop, a hold is a full jump.
const RELEASE_GRAVITY: f32 = 1500.0;
const MAX_FALL_SPEED: f32 = 520.0;
pub const JUMP_SPEED: f32 = 440.0;
pub const AIR_JUMP_SPEED: f32 = 390.0;
const COYOTE_SECONDS: f32 = 0.1;
const BUFFER_SECONDS: f32 = 0.13;
pub const DASH_SECONDS: f32 = 0.17;
pub const DASH_SPEED: f32 = 430.0;
const DASH_COOLDOWN: f32 = 0.42;
const SHOT_COOLDOWN: f32 = 0.2;
const BOLT_SPEED: f32 = 440.0;
const BOLT_LIFE: f32 = 0.7;
const ORB_SPEED: f32 = 125.0;
const ORB_LIFE: f32 = 3.2;
const INVULNERABLE_SECONDS: f32 = 1.25;
const STOMP_BOUNCE: f32 = 340.0;
pub const DYING_SECONDS: f32 = 1.3;
/// The Pralay's base speed (units/s) at the start, how much faster it gets each second, and its cap.
pub const VOID_BASE_SPEED: f32 = 34.0;
pub const VOID_RAMP: f32 = 0.9;
pub const VOID_MAX_SPEED: f32 = 118.0;
/// If the hero gets further ahead than this, the Pralay surges to catch up (it is always close behind).
pub const VOID_LEASH: f32 = 290.0;
pub const VENT_PERIOD: f32 = 2.8;
pub const VENT_ACTIVE: f32 = 1.0;

pub mod events {
    pub const JUMP: u32 = 1;
    pub const AIR_JUMP: u32 = 2;
    pub const DASH: u32 = 4;
    pub const SHOOT: u32 = 8;
    pub const HIT: u32 = 16;
    pub const KILL: u32 = 32;
    pub const HURT: u32 = 64;
    pub const GEM: u32 = 128;
    pub const CRUMBLE: u32 = 256;
    pub const DEATH: u32 = 512;
    pub const GAME_OVER: u32 = 1024;
    pub const STOMP: u32 = 2048;
    pub const ENEMY_SHOT: u32 = 4096;
    pub const HEART: u32 = 8192;
    pub const LAND: u32 = 16384;
    pub const ORB_POP: u32 = 32768;
    pub const COLLAPSE: u32 = 65536;
}

pub mod buttons {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const JUMP: u32 = 4;
    pub const DASH: u32 = 8;
    pub const FIRE: u32 = 16;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Pose { Idle = 0, Run = 1, Rise = 2, Fall = 3, Dash = 4, Hurt = 5, Dead = 6 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PlatformKind { Ground = 0, Ledge = 1, Crumble = 2, Pillar = 3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PropKind { Spikes = 0, Vent = 1, Gem = 2, Heart = 3, Lamp = 4 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EnemyKind { Shade = 0, Wisp = 1, Idol = 2 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EffectKind { Spark = 0, Burst = 1, Score = 2, Dust = 3, Pickup = 4, Hurt = 5, Crumble = 6 }

#[derive(Clone, Copy, Debug)]
pub struct Platform {
    pub x: f32, pub y: f32, pub w: f32, pub h: f32,
    pub kind: PlatformKind,
    /// Seconds until a stepped-on crumbling ledge gives way (negative: not stepped on yet).
    pub crumble: f32,
    pub falling: bool,
    pub fall_y: f32,
    pub fall_speed: f32,
    /// How far past this block's left edge the Pralay must reach before it falls (so the edge looks ragged).
    pub jitter: f32,
}

impl Platform {
    pub fn one_way(&self) -> bool { matches!(self.kind, PlatformKind::Ledge | PlatformKind::Crumble) }
    pub fn right(&self) -> f32 { self.x + self.w }
}

#[derive(Clone, Copy, Debug)]
pub struct Prop {
    pub kind: PropKind,
    pub x: f32, pub y: f32, pub w: f32,
    /// Vents: phase offset in their cycle.
    pub phase: f32,
    pub taken: bool,
    pub falling: bool,
    pub fall_y: f32,
    pub fall_speed: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct Enemy {
    pub kind: EnemyKind,
    /// Centre x and bottom y.
    pub x: f32, pub y: f32,
    pub velocity_y: f32,
    pub hp: i32,
    pub min_x: f32, pub max_x: f32,
    pub base_y: f32,
    pub timer: f32,
    pub flash: f32,
    pub facing: f32,
    pub alive: bool,
}

impl Enemy {
    pub fn half_width(&self) -> f32 { match self.kind { EnemyKind::Shade => 7.0, EnemyKind::Wisp => 8.0, EnemyKind::Idol => 9.0 } }
    pub fn height(&self) -> f32 { match self.kind { EnemyKind::Shade => 17.0, EnemyKind::Wisp => 12.0, EnemyKind::Idol => 26.0 } }
    pub fn points(&self) -> u32 { match self.kind { EnemyKind::Shade => 50, EnemyKind::Wisp => 40, EnemyKind::Idol => 120 } }
}

#[derive(Clone, Copy, Debug)]
pub struct Bullet { pub from_hero: bool, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub life: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Effect { pub kind: EffectKind, pub x: f32, pub y: f32, pub age: f32, pub value: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Hero {
    /// Centre x, feet y.
    pub x: f32, pub y: f32,
    pub velocity_x: f32, pub velocity_y: f32,
    pub facing: f32,
    pub on_ground: bool,
    pub coyote: f32,
    pub jump_buffer: f32,
    pub dash_buffer: f32,
    pub air_jumps: u32,
    pub can_dash: bool,
    pub dash_time: f32,
    pub dash_cooldown: f32,
    pub shot_cooldown: f32,
    pub invulnerable: f32,
    pub hp: u32,
    pub stride: f32,
    pub pose: Pose,
}

impl Hero {
    fn new() -> Hero {
        Hero {
            x: START_X, y: START_GROUND, velocity_x: 0.0, velocity_y: 0.0, facing: 1.0, on_ground: true, coyote: 0.0, jump_buffer: 0.0,
            dash_buffer: 0.0, air_jumps: 1, can_dash: true, dash_time: 0.0, dash_cooldown: 0.0, shot_cooldown: 0.0, invulnerable: 0.0,
            hp: MAX_HP, stride: 0.0, pose: Pose::Idle,
        }
    }
    pub fn left(&self) -> f32 { self.x - HERO_HALF_WIDTH }
    pub fn right(&self) -> f32 { self.x + HERO_HALF_WIDTH }
    pub fn top(&self) -> f32 { self.y - HERO_HEIGHT }
}

/// xorshift32: small, fast, deterministic per seed.
#[derive(Clone, Copy, Debug)]
pub struct Rng(pub u32);
impl Rng {
    pub fn next_u32(&mut self) -> u32 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.0 = value;
        value
    }
    /// In [0, 1).
    pub fn unit(&mut self) -> f32 { (self.next_u32() >> 8) as f32 / 16_777_216.0 }
    pub fn range(&mut self, low: f32, high: f32) -> f32 { low + (high - low) * self.unit() }
    pub fn chance(&mut self, probability: f32) -> bool { self.unit() < probability }
}

/// A smooth -1…1 wave with period 1 (a cheap stand-in for sin, keeps libm out of the .wasm).
pub fn wave(t: f32) -> f32 {
    let x = t - t.floor();
    let half = if x < 0.5 { x * 2.0 } else { x * 2.0 - 1.0 };
    let bump = 4.0 * half * (1.0 - half);
    if x < 0.5 { bump } else { -bump }
}

pub fn clamp_between(value: f32, low: f32, high: f32) -> f32 { if value < low { low } else if value > high { high } else { value } }
fn approach(value: f32, target: f32, amount: f32) -> f32 {
    if value < target { (value + amount).min(target) } else { (value - amount).max(target) }
}

pub struct World {
    pub phase: Phase,
    pub hero: Hero,
    pub platforms: Vec<Platform>,
    pub props: Vec<Prop>,
    pub enemies: Vec<Enemy>,
    pub bullets: Vec<Bullet>,
    pub effects: Vec<Effect>,
    pub input: u32,
    pub view_width: f32,
    pub camera_x: f32,
    pub void_x: f32,
    pub void_speed: f32,
    /// Seconds of play this run (drives the Pralay's speed).
    pub elapsed: f32,
    /// Seconds since the world was made (animations).
    pub clock: f32,
    pub bonus: u32,
    pub kills: u32,
    pub gems: u32,
    pub max_x: f32,
    pub dying_time: f32,
    pub seed: u32,
    pub rng: Rng,
    // generator state
    pub gen_x: f32,
    pub ground_y: f32,
    pub need_ground: bool,
    pub max_rise: f32,
    pub last_heart_x: f32,
    accumulator: f32,
    collapse_cooldown: f32,
}

impl World {
    pub fn new(seed: u32) -> World {
        let seed = if seed == 0 { 0x9e37_79b9 } else { seed };
        let mut world = World {
            phase: Phase::Ready, hero: Hero::new(), platforms: Vec::with_capacity(MAX_PLATFORMS), props: Vec::with_capacity(MAX_PROPS),
            enemies: Vec::with_capacity(MAX_ENEMIES), bullets: Vec::with_capacity(MAX_BULLETS), effects: Vec::with_capacity(MAX_EFFECTS),
            input: 0, view_width: 480.0, camera_x: START_X - 480.0 * 0.36, void_x: START_X - 230.0, void_speed: 0.0, elapsed: 0.0, clock: 0.0,
            bonus: 0, kills: 0, gems: 0, max_x: START_X, dying_time: 0.0, seed, rng: Rng(seed), gen_x: 0.0, ground_y: START_GROUND,
            need_ground: false, max_rise: 40.0, last_heart_x: 0.0, accumulator: 0.0, collapse_cooldown: 0.0,
        };
        world.build_start();
        world.generate();
        world
    }

    pub fn start(&mut self) { if self.phase == Phase::Ready { self.phase = Phase::Playing; } }

    pub fn press_jump(&mut self) { self.hero.jump_buffer = BUFFER_SECONDS; }
    pub fn press_dash(&mut self) { self.hero.dash_buffer = BUFFER_SECONDS; }

    pub fn distance(&self) -> u32 { ((self.max_x - START_X) / 10.0).max(0.0) as u32 }
    pub fn score(&self) -> u32 { self.distance() + self.bonus }
    /// How fast the Pralay moves compared with the start (×1.0 … ×3.5).
    pub fn pace(&self) -> f32 { self.base_void_speed() / VOID_BASE_SPEED }
    fn base_void_speed(&self) -> f32 { (VOID_BASE_SPEED + self.elapsed * VOID_RAMP).min(VOID_MAX_SPEED) }

    pub fn vent_cycle(&self, prop: &Prop) -> f32 { let t = self.clock + prop.phase; t - (t / VENT_PERIOD).floor() * VENT_PERIOD }
    pub fn vent_is_active(&self, prop: &Prop) -> bool { self.vent_cycle(prop) < VENT_ACTIVE }

    pub fn advance(&mut self, seconds: f32) -> u32 {
        let seconds = if !(seconds > 0.0) { 0.0 } else if seconds > HITCH_SECONDS { 1.0 / 60.0 } else { seconds.min(MAX_FRAME_SECONDS) };
        self.accumulator += seconds;
        let mut events = 0;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            events |= self.step(STEP_SECONDS);
        }
        events
    }

    pub fn step(&mut self, dt: f32) -> u32 {
        let mut events = 0;
        self.clock += dt;
        if self.collapse_cooldown > 0.0 { self.collapse_cooldown -= dt; }
        match self.phase {
            Phase::Ready => { self.update_effects(dt); return 0; }
            Phase::GameOver => { self.update_falling(dt, &mut events); self.update_effects(dt); return 0; }
            Phase::Playing => {
                self.elapsed += dt;
                self.step_hero(dt, &mut events);
            }
            Phase::Dying => {
                self.dying_time += dt;
                let hero = &mut self.hero;
                hero.velocity_y = (hero.velocity_y + GRAVITY * 0.6 * dt).min(MAX_FALL_SPEED);
                if hero.y < KILL_Y + 40.0 { hero.y += hero.velocity_y * dt * 0.35; }
                if self.dying_time >= DYING_SECONDS { self.phase = Phase::GameOver; events |= events::GAME_OVER; }
            }
        }
        self.update_void(dt, &mut events);
        self.update_falling(dt, &mut events);
        self.update_props(&mut events);
        self.update_enemies(dt, &mut events);
        self.update_bullets(dt, &mut events);
        self.update_effects(dt);
        self.update_camera(dt);
        self.cleanup();
        self.generate();
        events
    }

    fn step_hero(&mut self, dt: f32, events: &mut u32) {
        let input = self.input;
        let hero = &mut self.hero;
        let previous_bottom = hero.y;
        let was_on_ground = hero.on_ground;
        let fall_speed_before = hero.velocity_y;
        hero.jump_buffer -= dt;
        hero.dash_buffer -= dt;
        hero.coyote -= dt;
        hero.dash_cooldown -= dt;
        hero.shot_cooldown -= dt;
        if hero.invulnerable > 0.0 { hero.invulnerable -= dt; }
        let direction = (if input & buttons::RIGHT != 0 { 1.0 } else { 0.0 }) - (if input & buttons::LEFT != 0 { 1.0 } else { 0.0 });

        // dash: a short, gravity-free burst (cancel it with a jump); once per time in the air
        if hero.dash_buffer > 0.0 && hero.dash_cooldown <= 0.0 && hero.can_dash && hero.dash_time <= 0.0 {
            if direction != 0.0 { hero.facing = direction; }
            hero.dash_time = DASH_SECONDS;
            hero.dash_cooldown = DASH_COOLDOWN;
            hero.dash_buffer = 0.0;
            hero.can_dash = false;
            *events |= events::DASH;
        }
        // jumps (a jump can cancel a dash)
        if hero.jump_buffer > 0.0 {
            if hero.on_ground || hero.coyote > 0.0 {
                hero.velocity_y = -JUMP_SPEED;
                hero.on_ground = false;
                hero.coyote = 0.0;
                hero.jump_buffer = 0.0;
                *events |= events::JUMP;
            } else if hero.air_jumps > 0 {
                hero.velocity_y = -AIR_JUMP_SPEED;
                hero.air_jumps -= 1;
                hero.jump_buffer = 0.0;
                *events |= events::AIR_JUMP;
            }
            if hero.jump_buffer <= 0.0 && hero.dash_time > 0.0 { hero.dash_time = 0.0; hero.velocity_x = hero.facing * RUN_SPEED * 1.15; }
        }

        if hero.dash_time > 0.0 {
            hero.dash_time -= dt;
            hero.velocity_x = hero.facing * DASH_SPEED;
            hero.velocity_y = 0.0;
            if hero.dash_time <= 0.0 { hero.velocity_x = hero.facing * RUN_SPEED; }
        } else {
            if direction != 0.0 { hero.facing = direction; }
            let target = direction * RUN_SPEED;
            let rate = if direction == 0.0 && hero.on_ground { FRICTION } else if hero.on_ground { GROUND_ACCELERATION } else { AIR_ACCELERATION };
            hero.velocity_x = approach(hero.velocity_x, target, rate * dt);
            hero.velocity_y += GRAVITY * dt;
            if hero.velocity_y < 0.0 && input & buttons::JUMP == 0 { hero.velocity_y += RELEASE_GRAVITY * dt; }
            hero.velocity_y = hero.velocity_y.min(MAX_FALL_SPEED);
        }

        // shoot: hold to keep firing
        if input & buttons::FIRE != 0 && hero.shot_cooldown <= 0.0 && self.bullets.len() < MAX_BULLETS {
            hero.shot_cooldown = SHOT_COOLDOWN;
            self.bullets.push(Bullet { from_hero: true, x: hero.x + hero.facing * 8.0, y: hero.y - 10.0, velocity_x: hero.facing * BOLT_SPEED, velocity_y: 0.0, life: BOLT_LIFE });
            *events |= events::SHOOT;
        }

        let standing = move_body(hero, &self.platforms, previous_bottom, dt);
        if hero.on_ground {
            hero.coyote = COYOTE_SECONDS;
            hero.air_jumps = 1;
            if hero.dash_time <= 0.0 { hero.can_dash = true; }
            if !was_on_ground && fall_speed_before > 260.0 {
                *events |= events::LAND;
                push_effect(&mut self.effects, EffectKind::Dust, hero.x, hero.y, 0.0);
            }
        }
        if let Some(index) = standing {
            let platform = &mut self.platforms[index];
            if platform.kind == PlatformKind::Crumble && platform.crumble < 0.0 { platform.crumble = 0.42; *events |= events::CRUMBLE; }
        }
        hero.stride += hero.velocity_x.abs() * dt;
        hero.pose = if hero.dash_time > 0.0 { Pose::Dash }
            else if hero.invulnerable > INVULNERABLE_SECONDS - 0.3 { Pose::Hurt }
            else if !hero.on_ground { if hero.velocity_y < 0.0 { Pose::Rise } else { Pose::Fall } }
            else if hero.velocity_x.abs() > 8.0 { Pose::Run } else { Pose::Idle };
        if hero.x > self.max_x { self.max_x = hero.x; }
        if hero.y > KILL_Y { self.die(events); }
    }

    fn hurt_hero(&mut self, events: &mut u32) {
        let hero = &mut self.hero;
        if self.phase != Phase::Playing || hero.invulnerable > 0.0 || hero.dash_time > 0.0 { return; }
        hero.hp = hero.hp.saturating_sub(1);
        hero.invulnerable = INVULNERABLE_SECONDS;
        hero.velocity_y = -250.0;
        hero.on_ground = false;
        *events |= events::HURT;
        push_effect(&mut self.effects, EffectKind::Hurt, hero.x, hero.y - 9.0, 0.0);
        if hero.hp == 0 { self.die(events); }
    }

    pub fn die(&mut self, events: &mut u32) {
        if self.phase != Phase::Playing { return; }
        self.phase = Phase::Dying;
        self.dying_time = 0.0;
        self.hero.pose = Pose::Dead;
        self.hero.hp = 0;
        self.hero.velocity_y = -160.0;
        self.hero.dash_time = 0.0;
        *events |= events::DEATH;
    }

    fn update_void(&mut self, dt: f32, events: &mut u32) {
        let warm_up = clamp_between(self.elapsed / 2.0, 0.0, 1.0);
        let gap = self.hero.x - self.void_x;
        let surge = if gap > VOID_LEASH { (gap - VOID_LEASH) * 1.3 } else { 0.0 };
        self.void_speed = self.base_void_speed() * warm_up + surge;
        self.void_x += self.void_speed * dt;
        let void_x = self.void_x;
        let mut collapsed = false;
        for platform in self.platforms.iter_mut() {
            if !platform.falling && void_x > platform.x + platform.jitter {
                platform.falling = true;
                platform.fall_speed = 20.0;
                collapsed = true;
            }
        }
        if collapsed && self.collapse_cooldown <= 0.0 {
            self.collapse_cooldown = 0.22;
            *events |= events::COLLAPSE;
            let level = self.ground_level_near(void_x);
            push_effect(&mut self.effects, EffectKind::Crumble, void_x, level, 0.0);
        }
        for prop in self.props.iter_mut() {
            if !prop.falling && !prop.taken && void_x > prop.x { prop.falling = true; }
        }
        if self.phase == Phase::Playing && self.hero.left() < self.void_x { self.die(events); }
    }

    fn ground_level_near(&self, x: f32) -> f32 {
        let mut level = VIEW_HEIGHT;
        for platform in self.platforms.iter() { if x >= platform.x - 8.0 && x <= platform.right() + 8.0 { level = level.min(platform.y + platform.fall_y); } }
        level
    }

    fn update_falling(&mut self, dt: f32, events: &mut u32) {
        for platform in self.platforms.iter_mut() {
            if !platform.falling && platform.crumble >= 0.0 {
                platform.crumble -= dt;
                if platform.crumble <= 0.0 { platform.falling = true; platform.fall_speed = 30.0; *events |= events::CRUMBLE; }
            }
            if platform.falling { platform.fall_speed += 760.0 * dt; platform.fall_y += platform.fall_speed * dt; }
        }
        for prop in self.props.iter_mut() {
            if prop.falling { prop.fall_speed += 760.0 * dt; prop.fall_y += prop.fall_speed * dt; }
        }
    }

    fn update_props(&mut self, events: &mut u32) {
        if self.phase != Phase::Playing { return; }
        let hero = self.hero;
        let mut hurt = false;
        for index in 0..self.props.len() {
            let prop = self.props[index];
            if prop.taken || prop.falling { continue; }
            match prop.kind {
                PropKind::Spikes => {
                    if hero.right() > prop.x + 2.0 && hero.left() < prop.x + prop.w - 2.0 && hero.y > prop.y - 7.0 && hero.top() < prop.y { hurt = true; }
                }
                PropKind::Vent => {
                    if self.vent_is_active(&prop) && hero.right() > prop.x - 6.0 && hero.left() < prop.x + 6.0 && hero.y > prop.y - 54.0 && hero.top() < prop.y { hurt = true; }
                }
                PropKind::Gem | PropKind::Heart => {
                    let dx = hero.x - prop.x;
                    let dy = hero.y - 9.0 - prop.y;
                    if dx * dx + dy * dy < 15.0 * 15.0 {
                        self.props[index].taken = true;
                        if prop.kind == PropKind::Gem {
                            self.gems += 1;
                            self.bonus += 25;
                            *events |= events::GEM;
                            push_effect(&mut self.effects, EffectKind::Pickup, prop.x, prop.y, 25.0);
                        } else {
                            self.hero.hp = (self.hero.hp + 1).min(MAX_HP);
                            *events |= events::HEART;
                            push_effect(&mut self.effects, EffectKind::Pickup, prop.x, prop.y, 0.0);
                        }
                    }
                }
                PropKind::Lamp => {}
            }
        }
        if hurt {
            let was_hurt = self.hero.invulnerable > 0.0 || self.hero.dash_time > 0.0;
            self.hurt_hero(events);
            if !was_hurt { self.hero.velocity_y = -330.0; }
        }
    }

    fn damage_enemy(&mut self, index: usize, amount: i32, events: &mut u32) {
        let enemy = &mut self.enemies[index];
        if !enemy.alive { return; }
        enemy.hp -= amount;
        enemy.flash = 0.14;
        *events |= events::HIT;
        if enemy.hp <= 0 {
            enemy.alive = false;
            let points = enemy.points();
            let (x, y) = (enemy.x, enemy.y - enemy.height() * 0.5);
            let kind = enemy.kind as u8 as f32;
            self.kills += 1;
            self.bonus += points;
            *events |= events::KILL;
            push_effect(&mut self.effects, EffectKind::Burst, x, y, kind);
            push_effect(&mut self.effects, EffectKind::Score, x, y - 8.0, points as f32);
        } else {
            push_effect(&mut self.effects, EffectKind::Spark, enemy.x, enemy.y - enemy.height() * 0.5, 0.0);
        }
    }

    fn update_enemies(&mut self, dt: f32, events: &mut u32) {
        let hero = self.hero;
        let void_x = self.void_x;
        let playing = self.phase == Phase::Playing;
        for index in 0..self.enemies.len() {
            if !self.enemies[index].alive { continue; }
            let mut enemy = self.enemies[index];
            enemy.timer += dt;
            if enemy.flash > 0.0 { enemy.flash -= dt; }
            if enemy.x < void_x + 2.0 || enemy.y > KILL_Y {
                enemy.alive = false;
                push_effect(&mut self.effects, EffectKind::Burst, enemy.x, enemy.y - enemy.height() * 0.5, enemy.kind as u8 as f32);
                self.enemies[index] = enemy;
                continue;
            }
            match enemy.kind {
                EnemyKind::Shade => {
                    // patrol its stretch of ground; hurry toward the hero when close and level
                    let near = (hero.x - enemy.x).abs() < 110.0 && (hero.y - enemy.y).abs() < 30.0;
                    if near { enemy.facing = if hero.x < enemy.x { -1.0 } else { 1.0 }; }
                    let speed = if near { 52.0 } else { 32.0 };
                    let next_x = enemy.x + enemy.facing * speed * dt;
                    if next_x < enemy.min_x || next_x > enemy.max_x { enemy.facing = -enemy.facing; } else { enemy.x = next_x; }
                    let previous_bottom = enemy.y;
                    enemy.velocity_y = (enemy.velocity_y + GRAVITY * dt).min(MAX_FALL_SPEED);
                    enemy.y += enemy.velocity_y * dt;
                    for platform in self.platforms.iter() {
                        if platform.falling || enemy.x < platform.x || enemy.x > platform.right() { continue; }
                        if enemy.velocity_y >= 0.0 && previous_bottom <= platform.y + 0.5 && enemy.y >= platform.y { enemy.y = platform.y; enemy.velocity_y = 0.0; }
                    }
                }
                EnemyKind::Wisp => {
                    let dx = hero.x - enemy.x;
                    if dx.abs() < 250.0 && playing {
                        enemy.facing = if dx < 0.0 { -1.0 } else { 1.0 };
                        enemy.x += clamp_between(dx * 0.6, -48.0, 48.0) * dt;
                        let target_y = hero.y - 6.0;
                        enemy.base_y = approach(enemy.base_y, clamp_between(target_y, 60.0, 230.0), 26.0 * dt);
                    }
                    enemy.y = enemy.base_y + wave(enemy.timer * 0.5) * 11.0;
                }
                EnemyKind::Idol => {
                    enemy.facing = if hero.x < enemy.x { -1.0 } else { 1.0 };
                    let dx = hero.x - enemy.x;
                    let in_range = playing && dx.abs() < 270.0 && dx > -200.0;
                    if !in_range && enemy.timer > 1.2 { enemy.timer = 1.2; }
                    if enemy.timer >= 2.4 && self.bullets.len() < MAX_BULLETS {
                        enemy.timer = 0.0;
                        let (start_x, start_y) = (enemy.x + enemy.facing * 6.0, enemy.y - 19.0);
                        let (aim_x, aim_y) = (hero.x - start_x, hero.y - 9.0 - start_y);
                        let length = (aim_x * aim_x + aim_y * aim_y).sqrt().max(1.0);
                        self.bullets.push(Bullet { from_hero: false, x: start_x, y: start_y, velocity_x: aim_x / length * ORB_SPEED, velocity_y: aim_y / length * ORB_SPEED, life: ORB_LIFE });
                        *events |= events::ENEMY_SHOT;
                    }
                }
            }
            self.enemies[index] = enemy;
            // touching the hero: dash through it (hurts it), stomp it, or get hurt
            if !playing || !self.enemies[index].alive { continue; }
            let enemy = self.enemies[index];
            let hero = self.hero;
            let (left, right, top) = (enemy.x - enemy.half_width(), enemy.x + enemy.half_width(), enemy.y - enemy.height());
            if hero.right() > left && hero.left() < right && hero.y > top && hero.top() < enemy.y {
                if hero.dash_time > 0.0 {
                    if enemy.flash <= 0.0 { self.damage_enemy(index, 1, events); }
                } else if hero.velocity_y > 40.0 && hero.y - hero.velocity_y * dt <= top + 7.0 {
                    self.damage_enemy(index, 2, events);
                    let hero = &mut self.hero;
                    hero.velocity_y = -STOMP_BOUNCE;
                    hero.y = top;
                    hero.air_jumps = 1;
                    hero.can_dash = true;
                    *events |= events::STOMP;
                } else {
                    self.hurt_hero(events);
                }
            }
        }
    }

    fn update_bullets(&mut self, dt: f32, events: &mut u32) {
        let mut index = 0;
        while index < self.bullets.len() {
            let mut bullet = self.bullets[index];
            bullet.x += bullet.velocity_x * dt;
            bullet.y += bullet.velocity_y * dt;
            bullet.life -= dt;
            let mut gone = bullet.life <= 0.0 || bullet.x < self.void_x;
            if !gone && self.platforms.iter().any(|p| !p.falling && bullet.x > p.x && bullet.x < p.right() && bullet.y > p.y + 2.0 && bullet.y < p.y + p.h) {
                gone = true;
                push_effect(&mut self.effects, EffectKind::Spark, bullet.x, bullet.y, 1.0);
            }
            if !gone && bullet.from_hero {
                for target in 0..self.enemies.len() {
                    let enemy = self.enemies[target];
                    if enemy.alive && (bullet.x - enemy.x).abs() < enemy.half_width() + 3.0 && bullet.y > enemy.y - enemy.height() - 3.0 && bullet.y < enemy.y + 2.0 {
                        self.damage_enemy(target, 1, events);
                        gone = true;
                        break;
                    }
                }
                if !gone {
                    for other in 0..self.bullets.len() {
                        let orb = self.bullets[other];
                        if !orb.from_hero && orb.life > 0.0 && (orb.x - bullet.x).abs() < 9.0 && (orb.y - bullet.y).abs() < 9.0 {
                            self.bullets[other].life = 0.0;
                            gone = true;
                            self.bonus += 10;
                            *events |= events::ORB_POP;
                            push_effect(&mut self.effects, EffectKind::Spark, orb.x, orb.y, 2.0);
                            break;
                        }
                    }
                }
            } else if !gone && self.phase == Phase::Playing {
                let hero = self.hero;
                if bullet.x > hero.left() - 3.0 && bullet.x < hero.right() + 3.0 && bullet.y > hero.top() - 3.0 && bullet.y < hero.y + 1.0
                    && hero.invulnerable <= 0.0 && hero.dash_time <= 0.0 {
                    gone = true;
                    self.hurt_hero(events);
                }
            }
            if gone { self.bullets.swap_remove(index); } else { self.bullets[index] = bullet; index += 1; }
        }
    }

    fn update_effects(&mut self, dt: f32) {
        for effect in self.effects.iter_mut() { effect.age += dt; }
        self.effects.retain(|effect| effect.age < if effect.kind == EffectKind::Score { 0.9 } else { 0.7 });
    }

    fn update_camera(&mut self, dt: f32) {
        let target = self.hero.x - self.view_width * 0.36;
        self.camera_x += (target - self.camera_x) * (dt * 7.0).min(1.0);
    }

    fn cleanup(&mut self) {
        self.platforms.retain(|platform| platform.fall_y < 420.0);
        self.props.retain(|prop| !prop.taken && prop.fall_y < 420.0 && !(prop.falling && matches!(prop.kind, PropKind::Gem | PropKind::Heart)));
        self.enemies.retain(|enemy| enemy.alive);
    }

    // ---------- test hooks ----------
    pub fn spawn_enemy(&mut self, kind: EnemyKind, x: f32, y: f32) {
        if self.enemies.len() >= MAX_ENEMIES { return; }
        let hp = match kind { EnemyKind::Shade => 2, EnemyKind::Wisp => 1, EnemyKind::Idol => 3 };
        self.enemies.push(Enemy { kind, x, y, velocity_y: 0.0, hp, min_x: x - 60.0, max_x: x + 60.0, base_y: y, timer: 0.0, flash: 0.0, facing: -1.0, alive: true });
    }
}

pub fn push_effect(effects: &mut Vec<Effect>, kind: EffectKind, x: f32, y: f32, value: f32) {
    if effects.len() >= MAX_EFFECTS { effects.swap_remove(0); }
    effects.push(Effect { kind, x, y, age: 0.0, value });
}

/// Move the hero by its velocity and resolve collisions (x then y). Ledges are one-way (land on them from above).
/// Returns the platform the hero is standing on.
fn move_body(hero: &mut Hero, platforms: &[Platform], previous_bottom: f32, dt: f32) -> Option<usize> {
    hero.x += hero.velocity_x * dt;
    for platform in platforms.iter() {
        if platform.falling || platform.one_way() { continue; }
        if hero.right() > platform.x && hero.left() < platform.right() && hero.y > platform.y + 0.01 && hero.top() < platform.y + platform.h {
            if hero.x < platform.x + platform.w * 0.5 { hero.x = platform.x - HERO_HALF_WIDTH; } else { hero.x = platform.right() + HERO_HALF_WIDTH; }
            if hero.dash_time > 0.0 { hero.dash_time = 0.0; }
            hero.velocity_x = 0.0;
        }
    }
    hero.y += hero.velocity_y * dt;
    hero.on_ground = false;
    let mut standing = None;
    for (index, platform) in platforms.iter().enumerate() {
        if platform.falling { continue; }
        if !(hero.right() > platform.x && hero.left() < platform.right()) { continue; }
        if hero.velocity_y >= 0.0 && previous_bottom <= platform.y + 0.5 && hero.y >= platform.y {
            hero.y = platform.y;
            hero.velocity_y = 0.0;
            hero.on_ground = true;
            standing = Some(index);
        } else if !platform.one_way() && hero.velocity_y < 0.0 && hero.y > platform.y && hero.top() < platform.y + platform.h {
            hero.y = platform.y + platform.h + HERO_HEIGHT;
            hero.velocity_y = 0.0;
        }
    }
    // standing still on a ledge counts as on ground too
    if !hero.on_ground && hero.velocity_y == 0.0 {
        for (index, platform) in platforms.iter().enumerate() {
            if !platform.falling && hero.right() > platform.x && hero.left() < platform.right() && (hero.y - platform.y).abs() < 0.01 { hero.on_ground = true; standing = Some(index); }
        }
    }
    standing
}
