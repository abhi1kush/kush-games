//! The Zombie Road simulation: one survivor at the bottom of a road, waves of zombies shambling down from the top,
//! cover the horde chews through, acid spit, pickups. Fixed 1/120 s steps; every pool is a fixed array (no allocation).
use crate::waves::{self, WavePlan};

// ---------- the playfield (world units; JavaScript scales them to the canvas) ----------
pub const WORLD_WIDTH: f32 = 240.0;
pub const WORLD_HEIGHT: f32 = 320.0;
/// Where the survivor stands.
pub const PLAYER_Y: f32 = 290.0;
/// The line the horde must not cross: a zombie reaching it hurts the survivor.
pub const DEFENSE_LINE_Y: f32 = 306.0;
pub const PLAYER_MIN_X: f32 = 12.0;
pub const PLAYER_MAX_X: f32 = WORLD_WIDTH - 12.0;
pub const PLAYER_RADIUS: f32 = 8.0;
const PLAYER_SPEED: f32 = 130.0;
/// Where the cover line sits (centre of each barricade / wreck).
pub const COVER_Y: f32 = 240.0;

// ---------- timing ----------
pub const STEP_SECONDS: f32 = 1.0 / 120.0;
const MAX_FRAME_SECONDS: f32 = 0.05;
/// A frame gap longer than this (a tab switch, a GC pause) is treated as one normal frame instead of a jump.
const HITCH_SECONDS: f32 = 0.1;
pub const DYING_SECONDS: f32 = 1.4;
pub const WAVE_CLEAR_SECONDS: f32 = 2.2;
pub const WAVE_INTRO_SECONDS: f32 = 1.8;
const INVULNERABLE_SECONDS: f32 = 2.0;

// ---------- the survivor's gun ----------
const BULLET_SPEED: f32 = 330.0;
const SPREAD_BULLET_SIDEWAYS_SPEED: f32 = 70.0;
pub const FIRE_COOLDOWN_SECONDS: f32 = 0.3;
pub const RAPID_FIRE_COOLDOWN_SECONDS: f32 = 0.12;
pub const POWER_SECONDS: f32 = 12.0;

// ---------- health ----------
pub const MAX_HEALTH: f32 = 100.0;
pub const START_LIVES: u32 = 3;
pub const MAX_LIVES: u32 = 5;
pub const MEDKIT_HEALTH: f32 = 40.0;

// ---------- zombie acid spit ----------
const SPIT_SPEED: f32 = 78.0;
pub const SPIT_DAMAGE: f32 = 12.0;
const SPIT_RADIUS: f32 = 3.0;
const SPIT_WINDUP_SECONDS: f32 = 0.55;
/// Zombies stuck at cover take a bite this often.
const CHEW_SECONDS: f32 = 0.5;

const PICKUP_FALL_SPEED: f32 = 42.0;
const PICKUP_CATCH_DISTANCE: f32 = 13.0;

// ---------- pool sizes ----------
pub const MAX_ZOMBIES: usize = 40;
pub const MAX_BULLETS: usize = 36;
pub const MAX_SPITS: usize = 12;
pub const MAX_PARTICLES: usize = 120;
pub const MAX_PICKUPS: usize = 3;
pub const COVER_COUNT: usize = 4;
/// The last few places a zombie fell, so JavaScript can paint a lasting stain on the road there.
pub const STAIN_RING: usize = 8;

/// `value` kept within low..=high. (Not `f32::clamp`: its NaN assert pulls float formatting into the wasm, ~20 KB.)
#[inline]
pub fn limit(value: f32, low: f32, high: f32) -> f32 { value.max(low).min(high) }

/// Bits returned by `advance` so JavaScript can play sounds and save at the right moments.
pub mod events {
    pub const SHOOT: u32 = 1;
    pub const ZOMBIE_HIT: u32 = 2;
    pub const ZOMBIE_DOWN: u32 = 4;
    pub const PLAYER_HURT: u32 = 8;
    pub const LIFE_LOST: u32 = 16;
    pub const WAVE_CLEAR: u32 = 32;
    pub const WAVE_START: u32 = 64;
    pub const GAME_OVER: u32 = 128;
    pub const PICKUP: u32 = 256;
    pub const COVER_HIT: u32 = 512;
    pub const SPIT: u32 = 1024;
    pub const BREACH: u32 = 2048;
    pub const TANK_ARRIVES: u32 = 4096;
    pub const GROAN: u32 = 8192;
    pub const TANK_DOWN: u32 = 16384;
    pub const COVER_BROKEN: u32 = 32768;
    pub const EXTRA_LIFE: u32 = 65536;
}

/// Held-button bits for `input`.
pub mod buttons {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const FIRE: u32 = 4;
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Ready = 0, Playing = 1, Dying = 2, WaveClear = 3, WaveIntro = 4, GameOver = 5 }

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ZombieKind { Walker = 0, Runner = 1, Brute = 2, Spitter = 3, Tank = 4 }

impl ZombieKind {
    pub fn from_index(index: u32) -> ZombieKind {
        match index { 1 => ZombieKind::Runner, 2 => ZombieKind::Brute, 3 => ZombieKind::Spitter, 4 => ZombieKind::Tank, _ => ZombieKind::Walker }
    }
}

/// What every kind of zombie is like before the wave's speed and health factors.
pub struct KindStats {
    pub health: f32,
    pub speed: f32,
    pub radius: f32,
    /// Health the survivor loses when this zombie reaches them or the defense line.
    pub damage: f32,
    pub points: u32,
    pub drop_chance: f32,
    /// Cover health taken per bite.
    pub bite: f32,
    /// How far it sways side to side while shambling.
    pub sway: f32,
}

pub fn stats(kind: ZombieKind) -> KindStats {
    match kind {
        ZombieKind::Walker => KindStats { health: 2.0, speed: 14.0, radius: 6.0, damage: 20.0, points: 10, drop_chance: 0.05, bite: 1.0, sway: 7.0 },
        ZombieKind::Runner => KindStats { health: 1.0, speed: 33.0, radius: 5.0, damage: 15.0, points: 20, drop_chance: 0.05, bite: 1.0, sway: 22.0 },
        ZombieKind::Brute => KindStats { health: 10.0, speed: 8.5, radius: 10.0, damage: 40.0, points: 60, drop_chance: 0.35, bite: 3.0, sway: 3.0 },
        ZombieKind::Spitter => KindStats { health: 3.0, speed: 11.0, radius: 6.0, damage: 20.0, points: 30, drop_chance: 0.1, bite: 1.0, sway: 5.0 },
        ZombieKind::Tank => KindStats { health: 45.0, speed: 5.5, radius: 16.0, damage: 100.0, points: 500, drop_chance: 1.0, bite: 8.0, sway: 2.0 },
    }
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoverKind { Barricade = 0, WreckedCar = 1 }

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PickupKind { Spread = 0, Rapid = 1, Medkit = 2 }

impl PickupKind {
    pub fn from_index(index: u32) -> PickupKind {
        match index { 1 => PickupKind::Rapid, 2 => PickupKind::Medkit, _ => PickupKind::Spread }
    }
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParticleKind { Splat = 0, Spark = 1, ScoreText = 2, Debris = 3, Acid = 4 }

/// What a zombie is busy with (drawn differently).
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ZombieState { Walking = 0, Biting = 1, Spitting = 2 }

#[derive(Clone, Copy, Debug)]
pub struct Zombie {
    pub active: bool,
    pub kind: ZombieKind,
    pub state: ZombieState,
    pub x: f32,
    pub y: f32,
    pub health: f32,
    pub max_health: f32,
    pub speed: f32,
    /// Sway phase and rate (each zombie lurches on its own rhythm).
    pub sway_phase: f32,
    pub sway_rate: f32,
    /// Walk cycle for the legs, in steps.
    pub walk_cycle: f32,
    pub hit_flash: f32,
    /// Bite timer at cover, or the countdown to the next spit.
    pub attack_timer: f32,
    pub windup_seconds: f32,
}

impl Zombie {
    const EMPTY: Zombie = Zombie {
        active: false, kind: ZombieKind::Walker, state: ZombieState::Walking, x: 0.0, y: 0.0, health: 0.0, max_health: 1.0, speed: 0.0,
        sway_phase: 0.0, sway_rate: 1.0, walk_cycle: 0.0, hit_flash: 0.0, attack_timer: 0.0, windup_seconds: 0.0,
    };
}

#[derive(Clone, Copy, Debug)]
pub struct Bullet { pub active: bool, pub x: f32, pub y: f32, pub velocity_x: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Spit { pub active: bool, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub age: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Particle {
    pub active: bool,
    pub kind: ParticleKind,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub age: f32,
    pub life: f32,
    /// Colour variant, or points for score text.
    pub value: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct Pickup { pub active: bool, pub kind: PickupKind, pub x: f32, pub y: f32, pub age: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Cover { pub kind: CoverKind, pub x: f32, pub y: f32, pub half_width: f32, pub half_height: f32, pub health: f32, pub max_health: f32 }

impl Cover {
    pub fn is_standing(&self) -> bool { self.health > 0.0 }
    fn touches_circle(&self, x: f32, y: f32, radius: f32) -> bool {
        let nearest_x = limit(x, self.x - self.half_width, self.x + self.half_width);
        let nearest_y = limit(y, self.y - self.half_height, self.y + self.half_height);
        let (dx, dy) = (x - nearest_x, y - nearest_y);
        dx * dx + dy * dy < radius * radius
    }
}

/// The cover line, left to right: a wrecked car, two barricades, a wrecked car (gaps between them so the horde can come through).
pub fn cover_layout() -> [Cover; COVER_COUNT] {
    let car = |x: f32| Cover { kind: CoverKind::WreckedCar, x, y: COVER_Y, half_width: 15.0, half_height: 9.0, health: 24.0, max_health: 24.0 };
    let barricade = |x: f32| Cover { kind: CoverKind::Barricade, x, y: COVER_Y + 2.0, half_width: 15.0, half_height: 5.0, health: 14.0, max_health: 14.0 };
    [car(38.0), barricade(96.0), barricade(144.0), car(202.0)]
}

pub struct World {
    pub phase: Phase,
    pub phase_seconds: f32,
    pub wave: u32,
    pub score: u32,
    pub lives: u32,
    pub health: f32,
    pub kills: u32,
    pub player_x: f32,
    /// World x a finger wants the survivor at, or negative.
    pub target_x: f32,
    pub input: u32,
    pub auto_fire: bool,
    pub fire_cooldown: f32,
    /// Seconds since the last shot (muzzle flash).
    pub since_shot: f32,
    pub spread_seconds: f32,
    pub rapid_seconds: f32,
    pub invulnerable_seconds: f32,
    pub shake: f32,
    /// Red damage flash (1 → 0).
    pub flash: f32,
    pub plan: WavePlan,
    pub regular_spawned: u32,
    pub tank_spawned: bool,
    pub spawn_timer: f32,
    pub zombies_alive: u32,
    pub zombies: [Zombie; MAX_ZOMBIES],
    pub bullets: [Bullet; MAX_BULLETS],
    pub spits: [Spit; MAX_SPITS],
    pub particles: [Particle; MAX_PARTICLES],
    pub pickups: [Pickup; MAX_PICKUPS],
    pub covers: [Cover; COVER_COUNT],
    /// x, y, zombie kind of the newest stains (ring buffer; `stain_serial` counts every stain ever made).
    pub stains: [[f32; 3]; STAIN_RING],
    pub stain_serial: u32,
    pub events: u32,
    accumulator: f32,
    random_state: u32,
    pub debug_invincible: bool,
}

impl Default for World { fn default() -> Self { World::new() } }

impl World {
    pub fn new() -> World {
        let mut world = World {
            phase: Phase::Ready, phase_seconds: 0.0, wave: 1, score: 0, lives: START_LIVES, health: MAX_HEALTH, kills: 0,
            player_x: WORLD_WIDTH / 2.0, target_x: -1.0, input: 0, auto_fire: false, fire_cooldown: 0.0, since_shot: 10.0,
            spread_seconds: 0.0, rapid_seconds: 0.0, invulnerable_seconds: 0.0, shake: 0.0, flash: 0.0,
            plan: waves::plan(1), regular_spawned: 0, tank_spawned: false, spawn_timer: 0.0, zombies_alive: 0,
            zombies: [Zombie::EMPTY; MAX_ZOMBIES],
            bullets: [Bullet { active: false, x: 0.0, y: 0.0, velocity_x: 0.0 }; MAX_BULLETS],
            spits: [Spit { active: false, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, age: 0.0 }; MAX_SPITS],
            particles: [Particle { active: false, kind: ParticleKind::Spark, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, age: 0.0, life: 1.0, value: 0.0 }; MAX_PARTICLES],
            pickups: [Pickup { active: false, kind: PickupKind::Spread, x: 0.0, y: 0.0, age: 0.0 }; MAX_PICKUPS],
            covers: cover_layout(),
            stains: [[0.0; 3]; STAIN_RING],
            stain_serial: 0,
            events: 0, accumulator: 0.0, random_state: 0x2545_f491, debug_invincible: false,
        };
        world.setup_wave(1);
        world
    }

    pub fn seed(&mut self, seed: u32) { self.random_state = seed | 1; }

    /// 0..1
    fn random(&mut self) -> f32 {
        self.random_state = self.random_state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.random_state >> 8) as f32 / 16_777_216.0
    }

    fn set_phase(&mut self, phase: Phase) { self.phase = phase; self.phase_seconds = 0.0; }

    /// Ready → the wave banner, then play.
    pub fn start(&mut self) {
        if self.phase == Phase::Ready { self.set_phase(Phase::WaveIntro); }
    }

    /// A new game from wave 1, straight into the wave banner.
    pub fn restart(&mut self) {
        self.score = 0;
        self.lives = START_LIVES;
        self.health = MAX_HEALTH;
        self.kills = 0;
        self.player_x = WORLD_WIDTH / 2.0;
        self.clear_effects();
        self.setup_wave(1);
        self.covers = cover_layout();
        self.set_phase(Phase::WaveIntro);
    }

    /// Back to a saved game: the start of `wave`, with that score and lives (full health). False if the numbers make no sense.
    pub fn restore(&mut self, wave: u32, score: u32, lives: u32) -> bool {
        if wave == 0 || wave > 999 || lives == 0 || lives > MAX_LIVES { return false; }
        self.score = score;
        self.lives = lives;
        self.health = MAX_HEALTH;
        self.clear_effects();
        self.setup_wave(wave);
        self.covers = cover_layout();
        self.set_phase(Phase::Ready);
        true
    }

    fn clear_effects(&mut self) {
        self.spread_seconds = 0.0;
        self.rapid_seconds = 0.0;
        self.invulnerable_seconds = 0.0;
        self.shake = 0.0;
        self.flash = 0.0;
        for particle in self.particles.iter_mut() { particle.active = false; }
        for pickup in self.pickups.iter_mut() { pickup.active = false; }
    }

    /// Clear the road for `wave` and repair the cover a little (rebuilt in full every third wave).
    pub fn setup_wave(&mut self, wave: u32) {
        self.wave = wave.max(1);
        self.plan = waves::plan(self.wave);
        self.regular_spawned = 0;
        self.tank_spawned = false;
        self.spawn_timer = 0.6;
        self.zombies_alive = 0;
        for zombie in self.zombies.iter_mut() { zombie.active = false; }
        for bullet in self.bullets.iter_mut() { bullet.active = false; }
        for spit in self.spits.iter_mut() { spit.active = false; }
        if (self.wave - 1) % 3 == 0 {
            self.covers = cover_layout();
        } else {
            for cover in self.covers.iter_mut() { cover.health = (cover.health + cover.max_health * 0.35).min(cover.max_health); }
        }
    }

    /// Zombies still to come this wave, including the ones on the road.
    pub fn zombies_left(&self) -> u32 {
        let unspawned = self.plan.regular_total - self.regular_spawned + (self.plan.has_tank && !self.tank_spawned) as u32;
        unspawned + self.zombies_alive
    }

    /// Simulate `seconds` in fixed steps; returns the event bits that happened.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        self.events = 0;
        let seconds = if seconds > 0.0 { seconds } else { 0.0 }; // NaN or a clock going backwards
        let frame_seconds = if seconds > HITCH_SECONDS { 1.0 / 60.0 } else if seconds > MAX_FRAME_SECONDS { MAX_FRAME_SECONDS } else { seconds };
        self.accumulator += frame_seconds;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            self.step(STEP_SECONDS);
        }
        self.events
    }

    fn step(&mut self, seconds: f32) {
        self.phase_seconds += seconds;
        self.shake = (self.shake - seconds * 5.0).max(0.0);
        self.flash = (self.flash - seconds * 2.5).max(0.0);
        self.since_shot += seconds;
        self.update_particles(seconds);
        match self.phase {
            Phase::Ready | Phase::GameOver => {}
            Phase::WaveIntro => {
                self.move_player(seconds);
                if self.phase_seconds >= WAVE_INTRO_SECONDS { self.set_phase(Phase::Playing); self.events |= events::WAVE_START; }
            }
            Phase::Playing => self.step_playing(seconds),
            Phase::Dying => {
                if self.phase_seconds >= DYING_SECONDS {
                    if self.lives == 0 { self.set_phase(Phase::GameOver); self.events |= events::GAME_OVER; } else { self.respawn(); }
                }
            }
            Phase::WaveClear => {
                self.move_player(seconds);
                self.update_bullets(seconds);
                self.update_pickups(seconds);
                if self.phase_seconds >= WAVE_CLEAR_SECONDS {
                    let next_wave = self.wave + 1;
                    self.setup_wave(next_wave);
                    self.set_phase(Phase::WaveIntro);
                }
            }
        }
    }

    fn step_playing(&mut self, seconds: f32) {
        self.invulnerable_seconds = (self.invulnerable_seconds - seconds).max(0.0);
        self.spread_seconds = (self.spread_seconds - seconds).max(0.0);
        self.rapid_seconds = (self.rapid_seconds - seconds).max(0.0);
        self.move_player(seconds);
        self.fire(seconds);
        self.update_spawner(seconds);
        self.update_bullets(seconds);
        self.update_zombies(seconds);
        if self.phase != Phase::Playing { return; }
        self.update_spits(seconds);
        if self.phase != Phase::Playing { return; }
        self.update_pickups(seconds);
        if self.zombies_left() == 0 {
            self.score += 50 * self.wave + self.health as u32;
            for spit in self.spits.iter_mut() { spit.active = false; }
            self.set_phase(Phase::WaveClear);
            self.events |= events::WAVE_CLEAR;
        }
    }

    fn move_player(&mut self, seconds: f32) {
        let mut direction = 0.0;
        if self.input & buttons::LEFT != 0 { direction -= 1.0; }
        if self.input & buttons::RIGHT != 0 { direction += 1.0; }
        if direction != 0.0 {
            self.player_x += direction * PLAYER_SPEED * seconds;
        } else if self.target_x >= 0.0 {
            let gap = self.target_x - self.player_x;
            let reach = PLAYER_SPEED * 1.5 * seconds;
            self.player_x += limit(gap, -reach, reach);
        }
        self.player_x = limit(self.player_x, PLAYER_MIN_X, PLAYER_MAX_X);
    }

    fn fire(&mut self, seconds: f32) {
        self.fire_cooldown = (self.fire_cooldown - seconds).max(0.0);
        let wants_to_fire = self.auto_fire || self.input & buttons::FIRE != 0;
        if !wants_to_fire || self.fire_cooldown > 0.0 { return; }
        self.fire_cooldown = if self.rapid_seconds > 0.0 { RAPID_FIRE_COOLDOWN_SECONDS } else { FIRE_COOLDOWN_SECONDS };
        let muzzle_y = PLAYER_Y - 10.0;
        if self.spread_seconds > 0.0 {
            for sideways in [-SPREAD_BULLET_SIDEWAYS_SPEED, 0.0, SPREAD_BULLET_SIDEWAYS_SPEED] { self.add_bullet(self.player_x, muzzle_y, sideways); }
        } else {
            self.add_bullet(self.player_x, muzzle_y, 0.0);
        }
        self.since_shot = 0.0;
        self.events |= events::SHOOT;
    }

    fn add_bullet(&mut self, x: f32, y: f32, velocity_x: f32) {
        if let Some(bullet) = self.bullets.iter_mut().find(|bullet| !bullet.active) {
            *bullet = Bullet { active: true, x, y, velocity_x };
        }
    }

    // ---------- the horde ----------

    fn update_spawner(&mut self, seconds: f32) {
        let regular_done = self.regular_spawned >= self.plan.regular_total;
        let tank_due = self.plan.has_tank && !self.tank_spawned && self.regular_spawned >= self.plan.regular_total / 2;
        if regular_done && !tank_due { return; }
        self.spawn_timer -= seconds;
        if self.spawn_timer > 0.0 { return; }
        self.spawn_timer = self.plan.spawn_interval * (0.7 + self.random() * 0.6);
        if tank_due {
            if self.spawn_zombie(ZombieKind::Tank, WORLD_WIDTH / 2.0, -18.0) { self.tank_spawned = true; self.events |= events::TANK_ARRIVES; }
            else { self.spawn_timer = 0.2; }
            return;
        }
        let group = 1 + (self.random() * self.plan.max_group as f32) as u32;
        let group = group.min(self.plan.max_group);
        // a group spreads out across one stretch of road
        let center = 24.0 + self.random() * (WORLD_WIDTH - 48.0);
        for member in 0..group {
            if self.regular_spawned >= self.plan.regular_total { break; }
            let kind = self.pick_kind();
            let x = limit(center + (member as f32 - (group - 1) as f32 / 2.0) * 22.0 + (self.random() - 0.5) * 8.0, 10.0, WORLD_WIDTH - 10.0);
            let y = -10.0 - self.random() * 16.0;
            if !self.spawn_zombie(kind, x, y) { self.spawn_timer = 0.2; break; }
            self.regular_spawned += 1;
        }
        if self.random() < 0.18 { self.events |= events::GROAN; }
    }

    fn pick_kind(&mut self) -> ZombieKind {
        let weights = self.plan.kind_weights;
        let total: u32 = weights.iter().sum();
        let mut roll = (self.random() * total as f32) as u32;
        for (index, weight) in weights.iter().enumerate() {
            if roll < *weight { return ZombieKind::from_index(index as u32); }
            roll -= weight;
        }
        ZombieKind::Walker
    }

    /// Put a zombie on the road; false when every slot is taken.
    pub fn spawn_zombie(&mut self, kind: ZombieKind, x: f32, y: f32) -> bool {
        let Some(slot) = self.zombies.iter().position(|zombie| !zombie.active) else { return false; };
        let kind_stats = stats(kind);
        let health = (kind_stats.health * self.plan.health_factor).round().max(1.0);
        let speed = kind_stats.speed * self.plan.speed_factor * (0.88 + self.random() * 0.24);
        let sway_phase = self.random() * 6.283;
        let sway_rate = 1.4 + self.random() * 1.6;
        let first_spit = 1.0 + self.random() * 2.5;
        self.zombies[slot] = Zombie {
            active: true, kind, state: ZombieState::Walking, x, y, health, max_health: health, speed, sway_phase, sway_rate,
            walk_cycle: self.random() * 4.0, hit_flash: 0.0, attack_timer: first_spit, windup_seconds: 0.0,
        };
        self.zombies_alive += 1;
        true
    }

    /// The first standing cover a zombie's body is pressing against.
    fn blocking_cover(&self, x: f32, y: f32, radius: f32) -> Option<usize> {
        self.covers.iter().position(|cover| cover.is_standing() && cover.touches_circle(x, y, radius))
    }

    fn update_zombies(&mut self, seconds: f32) {
        for index in 0..MAX_ZOMBIES {
            if !self.zombies[index].active { continue; }
            let mut zombie = self.zombies[index];
            let kind_stats = stats(zombie.kind);
            zombie.hit_flash = (zombie.hit_flash - seconds).max(0.0);
            zombie.sway_phase += seconds * zombie.sway_rate;
            let mut walks = true;
            zombie.state = ZombieState::Walking;

            // spitters stop, rear back, and spit acid at the survivor
            if zombie.kind == ZombieKind::Spitter {
                if zombie.windup_seconds > 0.0 {
                    zombie.windup_seconds -= seconds;
                    zombie.state = ZombieState::Spitting;
                    walks = false;
                    if zombie.windup_seconds <= 0.0 {
                        self.spit_at_player(zombie.x, zombie.y + 4.0);
                        zombie.attack_timer = 2.4 + self.random() * 1.8;
                    }
                } else {
                    zombie.attack_timer -= seconds;
                    if zombie.attack_timer <= 0.0 && zombie.y > 20.0 && zombie.y < COVER_Y - 30.0 { zombie.windup_seconds = SPIT_WINDUP_SECONDS; }
                }
            }

            // cover in the way: runners slip around it, everyone else chews through
            if let Some(cover_index) = self.blocking_cover(zombie.x, zombie.y, kind_stats.radius) {
                walks = false;
                if zombie.kind == ZombieKind::Runner {
                    let cover_x = self.covers[cover_index].x;
                    let direction = if zombie.x < cover_x { -1.0 } else { 1.0 };
                    zombie.x += direction * zombie.speed * seconds;
                    zombie.walk_cycle += seconds * zombie.speed * 0.25;
                } else {
                    zombie.state = ZombieState::Biting;
                    zombie.windup_seconds = 0.0;
                    zombie.attack_timer -= seconds;
                    if zombie.attack_timer <= 0.0 {
                        zombie.attack_timer = CHEW_SECONDS;
                        let bite_y = zombie.y + kind_stats.radius;
                        self.damage_cover(cover_index, kind_stats.bite, zombie.x, bite_y);
                    }
                }
            }

            if walks {
                let sway = zombie.sway_phase.sin() * kind_stats.sway;
                // in the lower half everyone but the Tank leans toward the survivor
                let lean = if zombie.y > WORLD_HEIGHT * 0.45 && zombie.kind != ZombieKind::Tank {
                    limit((self.player_x - zombie.x) * 0.6, -zombie.speed * 0.5, zombie.speed * 0.5)
                } else { 0.0 };
                // shambling: speed surges and drags with each step
                let lurch = 0.75 + 0.25 * (zombie.walk_cycle * 3.1416).sin().abs() * 2.0;
                zombie.y += zombie.speed * lurch * seconds;
                zombie.x += (sway + lean) * seconds;
                zombie.walk_cycle += seconds * zombie.speed * 0.22;
                if zombie.kind == ZombieKind::Runner && self.random() < seconds * 0.6 { zombie.sway_rate = 2.0 + self.random() * 3.0; }
            }
            zombie.x = limit(zombie.x, 8.0, WORLD_WIDTH - 8.0);
            self.zombies[index] = zombie;

            // reached the survivor, or got past them
            let distance_x = zombie.x - self.player_x;
            let distance_y = zombie.y - PLAYER_Y;
            let reach = kind_stats.radius + PLAYER_RADIUS;
            if distance_x * distance_x + distance_y * distance_y < reach * reach {
                self.remove_zombie(index, false);
                self.hurt(kind_stats.damage);
            } else if zombie.y >= DEFENSE_LINE_Y {
                self.remove_zombie(index, false);
                self.events |= events::BREACH;
                self.hurt(kind_stats.damage);
            }
            if self.phase != Phase::Playing { return; }
        }
    }

    fn spit_at_player(&mut self, x: f32, y: f32) {
        let Some(slot) = self.spits.iter().position(|spit| !spit.active) else { return; };
        let aim_x = self.player_x + (self.random() - 0.5) * 18.0;
        let (dx, dy) = (aim_x - x, PLAYER_Y - y);
        let length = (dx * dx + dy * dy).sqrt().max(1.0);
        let speed = SPIT_SPEED * (1.0 + (self.wave.min(20) as f32) * 0.02);
        self.spits[slot] = Spit { active: true, x, y, velocity_x: dx / length * speed, velocity_y: dy / length * speed, age: 0.0 };
        self.events |= events::SPIT;
    }

    fn damage_cover(&mut self, cover_index: usize, amount: f32, x: f32, y: f32) {
        let cover = &mut self.covers[cover_index];
        if !cover.is_standing() { return; }
        cover.health = (cover.health - amount).max(0.0);
        let broken = cover.health <= 0.0;
        self.events |= if broken { events::COVER_BROKEN } else { events::COVER_HIT };
        let chips = if broken { 10 } else { 2 };
        for _ in 0..chips { self.add_particle(ParticleKind::Debris, x, y, 50.0, cover_index as f32); }
    }

    fn remove_zombie(&mut self, index: usize, by_player: bool) {
        let zombie = self.zombies[index];
        if !zombie.active { return; }
        self.zombies[index].active = false;
        self.zombies_alive -= 1;
        let kind_stats = stats(zombie.kind);
        let splats = match zombie.kind { ZombieKind::Tank => 18, ZombieKind::Brute => 10, _ => 6 };
        for _ in 0..splats { self.add_particle(ParticleKind::Splat, zombie.x, zombie.y, 40.0 + kind_stats.radius * 3.0, zombie.kind as u8 as f32); }
        self.stains[self.stain_serial as usize % STAIN_RING] = [zombie.x, zombie.y, zombie.kind as u8 as f32];
        self.stain_serial = self.stain_serial.wrapping_add(1);
        if !by_player { return; }
        self.kills += 1;
        self.score += kind_stats.points;
        self.add_text(zombie.x, zombie.y - 6.0, kind_stats.points as f32);
        self.events |= events::ZOMBIE_DOWN;
        if zombie.kind == ZombieKind::Tank { self.events |= events::TANK_DOWN; self.shake = self.shake.max(1.0); }
        if self.random() < kind_stats.drop_chance { self.drop_pickup_at(zombie.x, zombie.y); }
    }

    fn drop_pickup_at(&mut self, x: f32, y: f32) {
        // hurt survivors find more medkits
        let medkit_chance = if self.health < 50.0 { 0.55 } else { 0.25 };
        let roll = self.random();
        let kind = if roll < medkit_chance { PickupKind::Medkit } else if roll < medkit_chance + (1.0 - medkit_chance) / 2.0 { PickupKind::Spread } else { PickupKind::Rapid };
        self.drop_pickup(kind, x, y);
    }

    pub fn drop_pickup(&mut self, kind: PickupKind, x: f32, y: f32) {
        if let Some(pickup) = self.pickups.iter_mut().find(|pickup| !pickup.active) {
            *pickup = Pickup { active: true, kind, x: limit(x, PLAYER_MIN_X, PLAYER_MAX_X), y, age: 0.0 };
        }
    }

    fn hurt(&mut self, damage: f32) {
        if self.debug_invincible || self.invulnerable_seconds > 0.0 || self.phase != Phase::Playing { return; }
        self.health -= damage;
        self.flash = 1.0;
        self.shake = self.shake.max(0.6);
        self.events |= events::PLAYER_HURT;
        if self.health <= 0.0 {
            self.health = 0.0;
            self.lives -= 1;
            self.events |= events::LIFE_LOST;
            self.shake = 1.2;
            self.add_burst(self.player_x, PLAYER_Y);
            self.set_phase(Phase::Dying);
        }
    }

    /// After losing a life: the horde near the survivor is knocked back dead, health refills, a moment of safety.
    fn respawn(&mut self) {
        for index in 0..MAX_ZOMBIES {
            if self.zombies[index].active && self.zombies[index].y > WORLD_HEIGHT * 0.5 && self.zombies[index].kind != ZombieKind::Tank { self.remove_zombie(index, false); }
        }
        for spit in self.spits.iter_mut() { spit.active = false; }
        self.health = MAX_HEALTH;
        self.spread_seconds = 0.0;
        self.rapid_seconds = 0.0;
        self.invulnerable_seconds = INVULNERABLE_SECONDS;
        self.set_phase(Phase::Playing);
    }

    fn update_bullets(&mut self, seconds: f32) {
        for index in 0..MAX_BULLETS {
            if !self.bullets[index].active { continue; }
            let mut bullet = self.bullets[index];
            bullet.y -= BULLET_SPEED * seconds;
            bullet.x += bullet.velocity_x * seconds;
            if bullet.y < -6.0 || bullet.x < -6.0 || bullet.x > WORLD_WIDTH + 6.0 { self.bullets[index].active = false; continue; }
            // shots fly over the cover (the survivor fires from behind it); they stop at the first zombie
            let mut hit = None;
            for zombie_index in 0..MAX_ZOMBIES {
                let zombie = &self.zombies[zombie_index];
                if !zombie.active || zombie.y < -4.0 { continue; }
                let radius = stats(zombie.kind).radius + 1.5;
                let (dx, dy) = (bullet.x - zombie.x, bullet.y - zombie.y);
                if dx * dx + dy * dy < radius * radius { hit = Some(zombie_index); break; }
            }
            match hit {
                Some(zombie_index) => {
                    self.bullets[index].active = false;
                    self.add_particle(ParticleKind::Spark, bullet.x, bullet.y + 2.0, 30.0, 0.0);
                    let zombie = &mut self.zombies[zombie_index];
                    zombie.health -= 1.0;
                    zombie.hit_flash = 0.08;
                    // a hit staggers a zombie back a step (big ones barely flinch)
                    zombie.y -= match zombie.kind { ZombieKind::Tank => 0.2, ZombieKind::Brute => 0.6, _ => 1.8 };
                    if zombie.health <= 0.0 { self.remove_zombie(zombie_index, true); } else { self.events |= events::ZOMBIE_HIT; }
                }
                None => self.bullets[index] = bullet,
            }
        }
    }

    fn update_spits(&mut self, seconds: f32) {
        for index in 0..MAX_SPITS {
            if !self.spits[index].active { continue; }
            let mut spit = self.spits[index];
            spit.x += spit.velocity_x * seconds;
            spit.y += spit.velocity_y * seconds;
            spit.age += seconds;
            if spit.y > WORLD_HEIGHT + 4.0 || spit.x < -4.0 || spit.x > WORLD_WIDTH + 4.0 { self.spits[index].active = false; continue; }
            if let Some(cover_index) = self.blocking_cover(spit.x, spit.y, SPIT_RADIUS) {
                self.spits[index].active = false;
                self.damage_cover(cover_index, 1.0, spit.x, spit.y);
                for _ in 0..3 { self.add_particle(ParticleKind::Acid, spit.x, spit.y, 25.0, 0.0); }
                continue;
            }
            let (dx, dy) = (spit.x - self.player_x, spit.y - PLAYER_Y);
            let reach = SPIT_RADIUS + PLAYER_RADIUS - 1.0;
            if dx * dx + dy * dy < reach * reach {
                self.spits[index].active = false;
                for _ in 0..4 { self.add_particle(ParticleKind::Acid, spit.x, spit.y, 30.0, 0.0); }
                self.hurt(SPIT_DAMAGE);
                if self.phase != Phase::Playing { return; }
                continue;
            }
            self.spits[index] = spit;
        }
    }

    fn update_pickups(&mut self, seconds: f32) {
        for index in 0..MAX_PICKUPS {
            if !self.pickups[index].active { continue; }
            let mut pickup = self.pickups[index];
            pickup.age += seconds;
            pickup.y += PICKUP_FALL_SPEED * seconds;
            if pickup.y > WORLD_HEIGHT + 8.0 { self.pickups[index].active = false; continue; }
            if (pickup.x - self.player_x).abs() < PICKUP_CATCH_DISTANCE && (pickup.y - PLAYER_Y).abs() < PICKUP_CATCH_DISTANCE {
                self.pickups[index].active = false;
                self.collect(pickup.kind);
                continue;
            }
            self.pickups[index] = pickup;
        }
    }

    pub fn collect(&mut self, kind: PickupKind) {
        self.events |= events::PICKUP;
        match kind {
            PickupKind::Spread => self.spread_seconds = POWER_SECONDS,
            PickupKind::Rapid => self.rapid_seconds = POWER_SECONDS,
            PickupKind::Medkit => {
                // at full health a medkit is an extra life instead
                if self.health >= MAX_HEALTH && self.lives < MAX_LIVES { self.lives += 1; self.events |= events::EXTRA_LIFE; }
                self.health = (self.health + MEDKIT_HEALTH).min(MAX_HEALTH);
            }
        }
    }

    // ---------- particles ----------

    fn add_particle(&mut self, kind: ParticleKind, x: f32, y: f32, speed: f32, value: f32) {
        let angle = self.random() * 6.283;
        let speed = speed * (0.3 + self.random() * 0.7);
        let life = match kind { ParticleKind::Splat => 0.5 + self.random() * 0.4, ParticleKind::Debris => 0.6, ParticleKind::Spark => 0.18, ParticleKind::Acid => 0.4, ParticleKind::ScoreText => 0.8 };
        if let Some(particle) = self.particles.iter_mut().find(|particle| !particle.active) {
            *particle = Particle { active: true, kind, x, y, velocity_x: angle.cos() * speed, velocity_y: angle.sin() * speed, age: 0.0, life, value };
        }
    }

    fn add_text(&mut self, x: f32, y: f32, points: f32) {
        if let Some(particle) = self.particles.iter_mut().find(|particle| !particle.active) {
            *particle = Particle { active: true, kind: ParticleKind::ScoreText, x, y, velocity_x: 0.0, velocity_y: -18.0, age: 0.0, life: 0.8, value: points };
        }
    }

    fn add_burst(&mut self, x: f32, y: f32) {
        for _ in 0..14 { self.add_particle(ParticleKind::Spark, x, y, 90.0, 1.0); }
    }

    fn update_particles(&mut self, seconds: f32) {
        let drag = 1.0 - seconds * 4.0;
        for particle in self.particles.iter_mut().filter(|particle| particle.active) {
            particle.age += seconds;
            if particle.age >= particle.life { particle.active = false; continue; }
            particle.x += particle.velocity_x * seconds;
            particle.y += particle.velocity_y * seconds;
            if particle.kind != ParticleKind::ScoreText { particle.velocity_x *= drag; particle.velocity_y *= drag; }
        }
    }

    // ---------- test helpers ----------

    /// Kill every zombie on the road and skip the rest of the wave (tests only).
    pub fn debug_clear_wave(&mut self) {
        for index in 0..MAX_ZOMBIES { if self.zombies[index].active { self.remove_zombie(index, true); } }
        self.regular_spawned = self.plan.regular_total;
        self.tank_spawned = self.plan.has_tank;
    }

    pub fn shots_per_second(&self) -> f32 {
        1.0 / if self.rapid_seconds > 0.0 { RAPID_FIRE_COOLDOWN_SECONDS } else { FIRE_COOLDOWN_SECONDS }
    }
}
