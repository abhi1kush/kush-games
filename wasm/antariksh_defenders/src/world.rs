//! The whole Antariksh Defenders simulation: a fixed shooter in a 240 × 280 world.
//! Time runs in fixed STEP_SECONDS steps with the same lag protections as the other games:
//! - a frame gap longer than HITCH_SECONDS (the page froze) is dropped: only one 60 Hz frame is simulated, and for
//!   HITCH_GRACE_SECONDS afterwards nothing can hurt the player
//! - a slow frame simulates at most MAX_FRAME_SECONDS
//! Every pool (enemies, bullets, particles, capsules) is a fixed-size array; nothing is allocated after `World::new`.
use crate::waves::{self, Difficulty, COLUMNS, ROWS};

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const MAX_FRAME_SECONDS: f32 = 0.05;
pub const HITCH_SECONDS: f32 = 0.1;
pub const HITCH_GRACE_SECONDS: f32 = 0.3;

pub const WORLD_WIDTH: f32 = 240.0;
pub const WORLD_HEIGHT: f32 = 280.0;

pub const PLAYER_Y: f32 = 257.0;
pub const PLAYER_HALF_WIDTH: f32 = 7.0;
pub const PLAYER_SPEED: f32 = 95.0;
pub const PLAYER_MIN_X: f32 = 10.0;
pub const PLAYER_MAX_X: f32 = WORLD_WIDTH - 10.0;
pub const PLAYER_BULLET_SPEED: f32 = 270.0;
pub const FIRE_COOLDOWN_SECONDS: f32 = 0.34;
pub const MAX_PLAYER_SHOTS_IN_FLIGHT: usize = 2;
pub const STARTING_LIVES: u32 = 3;
pub const MAX_LIVES: u32 = 6;
pub const EXTRA_LIFE_EVERY: u32 = 5000;
pub const RESPAWN_INVULNERABLE_SECONDS: f32 = 1.6;
pub const DYING_SECONDS: f32 = 1.3;
pub const COUNTDOWN_SECONDS: f32 = 3.6;
pub const WAVE_CLEAR_SECONDS: f32 = 1.4;
pub const WAVE_INTRO_SECONDS: f32 = 1.8;

/// Formation grid: columns 18 units apart, rows 16 apart; each enemy is 12 × 10.
pub const CELL_WIDTH: f32 = 18.0;
pub const CELL_HEIGHT: f32 = 16.0;
pub const ENEMY_HALF_WIDTH: f32 = 6.0;
pub const ENEMY_HALF_HEIGHT: f32 = 5.0;
pub const MARCH_STEP: f32 = 2.0;
pub const DESCENT_STEP: f32 = 7.0;
pub const MARCH_EDGE: f32 = 4.0;

/// Legacy shield strip: the satellite barriers in front of the ship were removed, so these cells stay empty forever.
/// The byte array and its layout are kept so the JS memory view and `shields_pointer()` stay stable.
pub const SHIELD_COUNT: usize = 4;
pub const SHIELD_WIDTH: usize = 24;
pub const SHIELD_HEIGHT: usize = 16;
pub const SHIELD_CELLS: usize = SHIELD_WIDTH * SHIELD_HEIGHT;
/// The formation has landed when an enemy's bottom reaches this line (just above the ship).
pub const INVASION_LINE: f32 = 220.0;

pub const MYSTERY_Y: f32 = 30.0;
pub const MYSTERY_HALF_WIDTH: f32 = 11.0;
pub const MYSTERY_SPEED: f32 = 48.0;
pub const MYSTERY_POINTS: [u32; 4] = [50, 100, 150, 300];

pub const CAPSULE_SPEED: f32 = 42.0;
pub const TRIPLE_SHOT_SECONDS: f32 = 9.0;
pub const SHIELD_BUBBLE_SECONDS: f32 = 9.0;

pub const MAX_ENEMIES: usize = ROWS * COLUMNS;
pub const MAX_PLAYER_BULLETS: usize = 8;
pub const MAX_ENEMY_BULLETS: usize = 10;
pub const MAX_PARTICLES: usize = 160;
pub const MAX_CAPSULES: usize = 2;

pub mod buttons {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const FIRE: u32 = 4;
}

pub mod events {
    pub const SHOOT: u32 = 1;
    pub const ENEMY_DOWN: u32 = 2;
    pub const PLAYER_DOWN: u32 = 4;
    pub const MARCH: u32 = 8;
    pub const MYSTERY_APPEAR: u32 = 16;
    pub const MYSTERY_DOWN: u32 = 32;
    pub const SHIELD_HIT: u32 = 64;
    pub const WAVE_CLEAR: u32 = 128;
    pub const WAVE_START: u32 = 256;
    pub const GAME_OVER: u32 = 512;
    pub const EXTRA_LIFE: u32 = 1024;
    pub const POWER_UP: u32 = 2048;
    pub const COUNTDOWN_TICK: u32 = 4096;
    pub const LIFTOFF: u32 = 8192;
    pub const ENEMY_SHOOT: u32 = 16384;
    pub const HITCH: u32 = 32768;
    pub const BUBBLE_POP: u32 = 65536;
    pub const INVADED: u32 = 131072;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Phase { Ready = 0, Countdown = 1, Playing = 2, Dying = 3, WaveClear = 4, WaveIntro = 5, GameOver = 6 }

/// Bottom rows are asteroids, the middle rows debris clusters, the top row rogue drones.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum EnemyKind { Asteroid = 0, Debris = 1, Drone = 2 }

impl EnemyKind {
    pub fn for_row(row: usize) -> EnemyKind { match row { 0 => EnemyKind::Drone, 1 | 2 => EnemyKind::Debris, _ => EnemyKind::Asteroid } }
    pub fn points(self) -> u32 { match self { EnemyKind::Asteroid => 10, EnemyKind::Debris => 20, EnemyKind::Drone => 30 } }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Power { None = 0, TripleShot = 1, Bubble = 2 }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ParticleKind { Spark = 0, Ring = 1, Ember = 2, ScoreText = 3, Shard = 4 }

#[derive(Clone, Copy, Debug, Default)]
pub struct Enemy { pub alive: bool, pub row: u8, pub column: u8, pub x: f32, pub y: f32 }

impl Enemy {
    pub fn kind(&self) -> EnemyKind { EnemyKind::for_row(self.row as usize) }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Bullet { pub active: bool, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub kind: u8, pub age: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Particle { pub active: bool, pub kind: ParticleKind, pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32, pub age: f32, pub life: f32, pub value: f32 }

impl Default for Particle {
    fn default() -> Self { Particle { active: false, kind: ParticleKind::Spark, x: 0.0, y: 0.0, velocity_x: 0.0, velocity_y: 0.0, age: 0.0, life: 1.0, value: 0.0 } }
}

#[derive(Clone, Copy, Debug)]
pub struct Capsule { pub active: bool, pub power: Power, pub x: f32, pub y: f32 }

impl Default for Capsule { fn default() -> Self { Capsule { active: false, power: Power::None, x: 0.0, y: 0.0 } } }

#[derive(Clone, Copy, Debug, Default)]
pub struct Mystery { pub active: bool, pub x: f32, pub direction: f32, pub points: u32 }

pub struct World {
    pub phase: Phase,
    pub phase_seconds: f32,
    pub wave: u32,
    pub difficulty: Difficulty,
    pub score: u32,
    pub lives: u32,
    pub next_extra_life: u32,
    pub player_x: f32,
    pub invulnerable_seconds: f32,
    pub fire_cooldown: f32,
    pub power: Power,
    pub power_seconds: f32,
    pub input: u32,
    /// Where a finger wants the ship (world x), or negative for none; the ship flies there at its normal speed.
    pub target_x: f32,
    pub enemies: [Enemy; MAX_ENEMIES],
    pub enemies_at_start: u32,
    pub enemies_alive: u32,
    pub formation_x: f32,
    pub formation_y: f32,
    pub march_direction: f32,
    pub march_timer: f32,
    pub descend_next: bool,
    pub march_note: u32,
    pub march_frame: u32,
    pub shot_timer: f32,
    pub mystery: Mystery,
    pub mystery_timer: f32,
    pub mysteries_seen: u32,
    pub shields: [u8; SHIELD_COUNT * SHIELD_CELLS],
    pub shield_version: u32,
    pub player_bullets: [Bullet; MAX_PLAYER_BULLETS],
    pub enemy_bullets: [Bullet; MAX_ENEMY_BULLETS],
    pub particles: [Particle; MAX_PARTICLES],
    pub capsules: [Capsule; MAX_CAPSULES],
    pub shake: f32,
    pub flash: f32,
    pub hitch_grace_seconds: f32,
    pub accumulator: f32,
    pub events: u32,
    pub kills: u32,
    pub debug_invincible: bool,
    random_state: u32,
}

impl Default for World { fn default() -> Self { World::new() } }

impl World {
    pub fn new() -> World {
        let mut world = World {
            phase: Phase::Ready, phase_seconds: 0.0, wave: 1, difficulty: waves::difficulty_for_wave(1), score: 0, lives: STARTING_LIVES,
            next_extra_life: EXTRA_LIFE_EVERY, player_x: WORLD_WIDTH / 2.0, invulnerable_seconds: 0.0, fire_cooldown: 0.0,
            power: Power::None, power_seconds: 0.0, input: 0, target_x: -1.0,
            enemies: [Enemy::default(); MAX_ENEMIES], enemies_at_start: 0, enemies_alive: 0, formation_x: 0.0, formation_y: 0.0,
            march_direction: 1.0, march_timer: 0.0, descend_next: false, march_note: 0, march_frame: 0, shot_timer: 0.0,
            mystery: Mystery::default(), mystery_timer: 0.0, mysteries_seen: 0,
            shields: [0; SHIELD_COUNT * SHIELD_CELLS], shield_version: 0,
            player_bullets: [Bullet::default(); MAX_PLAYER_BULLETS], enemy_bullets: [Bullet::default(); MAX_ENEMY_BULLETS],
            particles: [Particle::default(); MAX_PARTICLES], capsules: [Capsule::default(); MAX_CAPSULES],
            shake: 0.0, flash: 0.0, hitch_grace_seconds: 0.0, accumulator: 0.0, events: 0, kills: 0, debug_invincible: false,
            random_state: 0x2545_f491,
        };
        world.setup_wave(1);
        world
    }

    fn random(&mut self) -> f32 {
        self.random_state = self.random_state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.random_state >> 8) as f32 / 16_777_216.0
    }

    pub fn seed(&mut self, seed: u32) { self.random_state = seed | 1; }

    // ---------------------------------------------------------------- game flow

    /// Load wave `wave`: a fresh formation, cleared bullets. No barriers in front of the ship.
    pub fn setup_wave(&mut self, wave: u32) {
        self.wave = wave.max(1);
        self.difficulty = waves::difficulty_for_wave(self.wave);
        let formation = waves::formation_for_wave(self.wave);
        let mut alive = 0;
        for row in 0..ROWS {
            let pattern = formation[row].as_bytes();
            for column in 0..COLUMNS {
                let enemy = &mut self.enemies[row * COLUMNS + column];
                enemy.row = row as u8;
                enemy.column = column as u8;
                enemy.alive = pattern[column] == b'X';
                if enemy.alive { alive += 1; }
            }
        }
        self.enemies_at_start = alive;
        self.enemies_alive = alive;
        self.formation_x = (WORLD_WIDTH - CELL_WIDTH * COLUMNS as f32) / 2.0;
        self.formation_y = self.difficulty.start_y;
        self.march_direction = 1.0;
        self.march_timer = 0.0;
        self.descend_next = false;
        self.shot_timer = self.difficulty.shot_interval_seconds * 1.5;
        self.mystery = Mystery::default();
        self.mystery_timer = 14.0 + self.random() * 8.0;
        self.place_enemies();
        self.clear_shields();
        self.clear_shots();
        for capsule in self.capsules.iter_mut() { capsule.active = false; }
    }

    fn clear_shots(&mut self) {
        for bullet in self.player_bullets.iter_mut() { bullet.active = false; }
        for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
    }

    /// No barriers: every cell stays empty, so nothing is drawn and nothing blocks a shot.
    fn clear_shields(&mut self) {
        self.shields = [0; SHIELD_COUNT * SHIELD_CELLS];
        self.shield_version = self.shield_version.wrapping_add(1);
    }

    fn set_phase(&mut self, phase: Phase) { self.phase = phase; self.phase_seconds = 0.0; }

    /// Start (from the Ready screen): mission-control countdown, then liftoff.
    pub fn start(&mut self) {
        if self.phase == Phase::Ready { self.set_phase(Phase::Countdown); }
    }

    /// A new game from wave 1.
    pub fn restart(&mut self) {
        self.score = 0;
        self.lives = STARTING_LIVES;
        self.next_extra_life = EXTRA_LIFE_EVERY;
        self.power = Power::None;
        self.power_seconds = 0.0;
        self.player_x = WORLD_WIDTH / 2.0;
        self.invulnerable_seconds = 0.0;
        self.kills = 0;
        for particle in self.particles.iter_mut() { particle.active = false; }
        self.setup_wave(1);
        self.set_phase(Phase::Countdown);
    }

    /// Resume a saved run at the start of `wave` (from the Ready screen). Returns false for nonsense values.
    pub fn restore(&mut self, wave: u32, score: u32, lives: u32) -> bool {
        if wave == 0 || wave > 999 || lives == 0 || lives > MAX_LIVES { return false; }
        self.score = score;
        self.lives = lives;
        self.next_extra_life = (score / EXTRA_LIFE_EVERY + 1) * EXTRA_LIFE_EVERY;
        self.setup_wave(wave);
        self.set_phase(Phase::Ready);
        true
    }

    pub fn advance(&mut self, seconds: f32) -> u32 {
        self.events = 0;
        let seconds = if seconds > 0.0 { seconds } else { 0.0 }; // NaN or a clock going backwards
        let frame_seconds = if seconds > HITCH_SECONDS {
            if self.phase == Phase::Playing { self.events |= events::HITCH; self.hitch_grace_seconds = HITCH_GRACE_SECONDS; }
            1.0 / 60.0
        } else if seconds > MAX_FRAME_SECONDS { MAX_FRAME_SECONDS } else { seconds };
        self.accumulator += frame_seconds;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            self.step(STEP_SECONDS);
        }
        self.events
    }

    fn step(&mut self, dt: f32) {
        let before = self.phase_seconds;
        self.phase_seconds += dt;
        self.shake = (self.shake - dt * 6.0).max(0.0);
        self.flash = (self.flash - dt * 3.0).max(0.0);
        self.update_particles(dt);
        match self.phase {
            Phase::Ready | Phase::GameOver => {}
            Phase::Countdown => {
                // T-3, T-2, T-1 ticks then LIFTOFF at 3 s; play starts a beat later.
                for tick in 0..3 { if before < tick as f32 + 0.0001 && self.phase_seconds >= tick as f32 + 0.0001 { self.events |= events::COUNTDOWN_TICK; } }
                if before < 3.0 && self.phase_seconds >= 3.0 { self.events |= events::LIFTOFF; }
                self.move_player(dt);
                if self.phase_seconds >= COUNTDOWN_SECONDS { self.set_phase(Phase::Playing); self.events |= events::WAVE_START; }
            }
            Phase::Playing => self.step_playing(dt),
            Phase::Dying => {
                self.update_enemy_bullets(dt);
                if self.phase_seconds >= DYING_SECONDS {
                    if self.lives == 0 { self.game_over(); } else {
                        self.set_phase(Phase::Playing);
                        self.player_x = WORLD_WIDTH / 2.0;
                        self.invulnerable_seconds = RESPAWN_INVULNERABLE_SECONDS;
                        for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
                    }
                }
            }
            Phase::WaveClear => {
                self.move_player(dt);
                self.update_player_bullets(dt);
                self.update_capsules(dt);
                if self.phase_seconds >= WAVE_CLEAR_SECONDS {
                    let next = self.wave + 1;
                    self.setup_wave(next);
                    self.set_phase(Phase::WaveIntro);
                }
            }
            Phase::WaveIntro => {
                self.move_player(dt);
                if self.phase_seconds >= WAVE_INTRO_SECONDS { self.set_phase(Phase::Playing); self.events |= events::WAVE_START; }
            }
        }
    }

    fn game_over(&mut self) {
        self.set_phase(Phase::GameOver);
        self.events |= events::GAME_OVER;
    }

    fn step_playing(&mut self, dt: f32) {
        self.hitch_grace_seconds = (self.hitch_grace_seconds - dt).max(0.0);
        self.invulnerable_seconds = (self.invulnerable_seconds - dt).max(0.0);
        if self.power != Power::None {
            self.power_seconds -= dt;
            if self.power_seconds <= 0.0 { self.power = Power::None; self.power_seconds = 0.0; }
        }
        self.move_player(dt);
        self.fire(dt);
        self.march(dt);
        if self.phase != Phase::Playing { return; }
        self.enemy_fire(dt);
        self.update_mystery(dt);
        self.update_player_bullets(dt);
        self.update_enemy_bullets(dt);
        self.update_capsules(dt);
        if self.phase == Phase::Playing && self.enemies_alive == 0 {
            self.set_phase(Phase::WaveClear);
            self.events |= events::WAVE_CLEAR;
            for bullet in self.enemy_bullets.iter_mut() { bullet.active = false; }
            self.mystery.active = false;
        }
    }

    // ---------------------------------------------------------------- player

    fn move_player(&mut self, dt: f32) {
        let mut direction = 0.0;
        if self.input & buttons::LEFT != 0 { direction -= 1.0; }
        if self.input & buttons::RIGHT != 0 { direction += 1.0; }
        if direction != 0.0 {
            self.player_x += direction * PLAYER_SPEED * dt;
        } else if self.target_x >= 0.0 {
            let gap = self.target_x - self.player_x;
            let reach = PLAYER_SPEED * dt;
            self.player_x += gap.clamp(-reach, reach);
        }
        self.player_x = self.player_x.clamp(PLAYER_MIN_X, PLAYER_MAX_X);
    }

    fn fire(&mut self, dt: f32) {
        self.fire_cooldown = (self.fire_cooldown - dt).max(0.0);
        if self.input & buttons::FIRE == 0 || self.fire_cooldown > 0.0 { return; }
        let in_flight = self.player_bullets.iter().filter(|bullet| bullet.active).count();
        let limit = if self.power == Power::TripleShot { MAX_PLAYER_BULLETS } else { MAX_PLAYER_SHOTS_IN_FLIGHT };
        if in_flight >= limit { return; }
        let x = self.player_x;
        if self.power == Power::TripleShot {
            self.add_player_bullet(x, -50.0);
            self.add_player_bullet(x, 0.0);
            self.add_player_bullet(x, 50.0);
        } else {
            self.add_player_bullet(x, 0.0);
        }
        self.fire_cooldown = FIRE_COOLDOWN_SECONDS;
        self.events |= events::SHOOT;
        self.add_particle(ParticleKind::Ember, x, PLAYER_Y - 9.0, 0.0, -20.0, 0.08, 0.0);
    }

    fn add_player_bullet(&mut self, x: f32, velocity_x: f32) {
        if let Some(bullet) = self.player_bullets.iter_mut().find(|bullet| !bullet.active) {
            *bullet = Bullet { active: true, x, y: PLAYER_Y - 9.0, velocity_x, velocity_y: -PLAYER_BULLET_SPEED, kind: 0, age: 0.0 };
        }
    }

    fn update_player_bullets(&mut self, dt: f32) {
        for index in 0..MAX_PLAYER_BULLETS {
            if !self.player_bullets[index].active { continue; }
            let bullet = &mut self.player_bullets[index];
            bullet.x += bullet.velocity_x * dt;
            bullet.y += bullet.velocity_y * dt;
            bullet.age += dt;
            let (x, y) = (bullet.x, bullet.y);
            if y < 14.0 || x < 0.0 || x > WORLD_WIDTH { bullet.active = false; continue; }
            if self.mystery.active && (x - self.mystery.x).abs() < MYSTERY_HALF_WIDTH && (y - MYSTERY_Y).abs() < 6.0 {
                self.player_bullets[index].active = false;
                self.destroy_mystery();
                continue;
            }
            if let Some(enemy_index) = self.enemy_at(x, y) {
                self.player_bullets[index].active = false;
                self.destroy_enemy(enemy_index);
                continue;
            }
            // Shots can cancel enemy shots head-on.
            for other in self.enemy_bullets.iter_mut() {
                if other.active && (other.x - x).abs() < 2.5 && (other.y - y).abs() < 4.0 {
                    other.active = false;
                    self.player_bullets[index].active = false;
                    break;
                }
            }
            if !self.player_bullets[index].active { self.add_sparks(x, y, 4, 0.0); }
        }
    }

    fn enemy_at(&self, x: f32, y: f32) -> Option<usize> {
        self.enemies.iter().position(|enemy| enemy.alive && (enemy.x - x).abs() <= ENEMY_HALF_WIDTH && (enemy.y - y).abs() <= ENEMY_HALF_HEIGHT)
    }

    fn destroy_enemy(&mut self, index: usize) {
        let enemy = self.enemies[index];
        self.enemies[index].alive = false;
        self.enemies_alive -= 1;
        self.kills += 1;
        self.add_score(enemy.kind().points());
        self.events |= events::ENEMY_DOWN;
        self.add_sparks(enemy.x, enemy.y, 7, enemy.kind() as u8 as f32);
        self.add_particle(ParticleKind::Ring, enemy.x, enemy.y, 0.0, 0.0, 0.28, enemy.kind() as u8 as f32);
        self.shake = self.shake.max(0.25);
        let capsule_falling = self.capsules.iter().any(|capsule| capsule.active);
        if !capsule_falling && self.power == Power::None && self.enemies_alive > 3 && self.random() < 0.03 {
            let power = if self.random() < 0.5 { Power::TripleShot } else { Power::Bubble };
            self.drop_capsule(enemy.x, enemy.y, power);
        }
    }

    fn add_score(&mut self, points: u32) {
        self.score += points;
        while self.score >= self.next_extra_life {
            self.next_extra_life += EXTRA_LIFE_EVERY;
            if self.lives < MAX_LIVES { self.lives += 1; self.events |= events::EXTRA_LIFE; }
        }
    }

    fn hit_player(&mut self) {
        if self.debug_invincible { return; }
        if self.power == Power::Bubble {
            self.power = Power::None;
            self.power_seconds = 0.0;
            self.invulnerable_seconds = 0.6;
            self.events |= events::BUBBLE_POP;
            self.add_particle(ParticleKind::Ring, self.player_x, PLAYER_Y, 0.0, 0.0, 0.35, 3.0);
            return;
        }
        self.lives = self.lives.saturating_sub(1);
        self.power = Power::None;
        self.power_seconds = 0.0;
        self.events |= events::PLAYER_DOWN;
        self.shake = 1.0;
        self.flash = 0.6;
        let x = self.player_x;
        self.add_sparks(x, PLAYER_Y, 16, 4.0);
        self.add_particle(ParticleKind::Ring, x, PLAYER_Y, 0.0, 0.0, 0.5, 4.0);
        for bullet in self.player_bullets.iter_mut() { bullet.active = false; }
        self.set_phase(Phase::Dying);
    }

    // ---------------------------------------------------------------- formation

    fn place_enemies(&mut self) {
        for enemy in self.enemies.iter_mut() {
            enemy.x = self.formation_x + enemy.column as f32 * CELL_WIDTH + CELL_WIDTH / 2.0;
            enemy.y = self.formation_y + enemy.row as f32 * CELL_HEIGHT;
        }
    }

    /// Seconds between march steps right now: slow with a full formation, frantic with one left.
    pub fn march_interval(&self) -> f32 {
        let difficulty = self.difficulty;
        if self.enemies_at_start <= 1 { return difficulty.fastest_step_seconds; }
        let share = (self.enemies_alive.max(1) - 1) as f32 / (self.enemies_at_start - 1) as f32;
        difficulty.fastest_step_seconds + (difficulty.slowest_step_seconds - difficulty.fastest_step_seconds) * share * share.sqrt()
    }

    fn march(&mut self, dt: f32) {
        if self.enemies_alive == 0 { return; }
        self.march_timer += dt;
        let interval = self.march_interval();
        if self.march_timer < interval { return; }
        self.march_timer -= interval;
        if self.march_timer > interval { self.march_timer = 0.0; }
        self.march_step();
    }

    /// One step of the whole formation: sideways, or down (and turn around) after touching an edge.
    pub fn march_step(&mut self) {
        if self.descend_next {
            self.formation_y += DESCENT_STEP;
            self.march_direction = -self.march_direction;
            self.descend_next = false;
        } else {
            let step = if self.enemies_alive <= 2 { MARCH_STEP * 1.5 } else { MARCH_STEP };
            self.formation_x += self.march_direction * step;
        }
        self.place_enemies();
        self.march_note = (self.march_note + 1) % 4;
        self.march_frame ^= 1;
        self.events |= events::MARCH;
        let mut left = f32::MAX;
        let mut right = f32::MIN;
        let mut bottom = f32::MIN;
        for enemy in self.enemies.iter().filter(|enemy| enemy.alive) {
            left = left.min(enemy.x - ENEMY_HALF_WIDTH);
            right = right.max(enemy.x + ENEMY_HALF_WIDTH);
            bottom = bottom.max(enemy.y + ENEMY_HALF_HEIGHT);
        }
        let step = MARCH_STEP * 1.5;
        if (self.march_direction > 0.0 && right + step > WORLD_WIDTH - MARCH_EDGE) || (self.march_direction < 0.0 && left - step < MARCH_EDGE) {
            self.descend_next = true;
        }
        if bottom >= INVASION_LINE {
            self.events |= events::INVADED;
            self.shake = 1.0;
            self.flash = 0.6;
            self.lives = 0;
            self.add_sparks(self.player_x, PLAYER_Y, 16, 4.0);
            self.game_over();
        }
    }

    pub fn lowest_enemy_bottom(&self) -> f32 {
        self.enemies.iter().filter(|enemy| enemy.alive).map(|enemy| enemy.y + ENEMY_HALF_HEIGHT).fold(f32::MIN, f32::max)
    }

    fn bottom_enemy_in_column(&self, column: usize, skip: usize) -> Option<usize> {
        let mut skipped = 0;
        for row in (0..ROWS).rev() {
            let index = row * COLUMNS + column;
            if self.enemies[index].alive {
                if skipped == skip { return Some(index); }
                skipped += 1;
            }
        }
        None
    }

    fn enemy_fire(&mut self, dt: f32) {
        self.shot_timer -= dt;
        if self.shot_timer > 0.0 { return; }
        let difficulty = self.difficulty;
        self.shot_timer = difficulty.shot_interval_seconds * (0.6 + self.random() * 0.8);
        let in_flight = self.enemy_bullets.iter().filter(|bullet| bullet.active).count();
        if in_flight >= difficulty.max_enemy_bullets { return; }
        // Columns that still have someone in them, chosen at random or (more often in later waves) the one above the player.
        let mut column = None;
        if self.random() < difficulty.aimed_shot_chance {
            let mut best = f32::MAX;
            for candidate in 0..COLUMNS {
                if let Some(index) = self.bottom_enemy_in_column(candidate, 0) {
                    let distance = (self.enemies[index].x - self.player_x).abs();
                    if distance < best { best = distance; column = Some(candidate); }
                }
            }
        }
        if column.is_none() {
            let occupied = (0..COLUMNS).filter(|&candidate| self.bottom_enemy_in_column(candidate, 0).is_some()).count();
            if occupied == 0 { return; }
            let mut pick = ((self.random() * occupied as f32) as usize).min(occupied - 1);
            for candidate in 0..COLUMNS {
                if self.bottom_enemy_in_column(candidate, 0).is_some() {
                    if pick == 0 { column = Some(candidate); break; }
                    pick -= 1;
                }
            }
        }
        let Some(column) = column else { return };
        if let Some(index) = self.bottom_enemy_in_column(column, 0) { self.enemy_shoots(index); }
        if self.random() < difficulty.extra_shooter_chance && in_flight + 1 < difficulty.max_enemy_bullets {
            if let Some(index) = self.bottom_enemy_in_column(column, 1) { self.enemy_shoots(index); }
        }
    }

    fn enemy_shoots(&mut self, index: usize) {
        let enemy = self.enemies[index];
        let kind = enemy.kind() as u8;
        let speed = self.difficulty.enemy_bullet_speed * if kind == EnemyKind::Debris as u8 { 1.2 } else { 1.0 };
        if let Some(bullet) = self.enemy_bullets.iter_mut().find(|bullet| !bullet.active) {
            *bullet = Bullet { active: true, x: enemy.x, y: enemy.y + ENEMY_HALF_HEIGHT + 2.0, velocity_x: 0.0, velocity_y: speed, kind, age: 0.0 };
            self.events |= events::ENEMY_SHOOT;
        }
    }

    fn update_enemy_bullets(&mut self, dt: f32) {
        let dying = self.phase == Phase::Dying;
        for index in 0..MAX_ENEMY_BULLETS {
            if !self.enemy_bullets[index].active { continue; }
            let bullet = &mut self.enemy_bullets[index];
            bullet.age += dt;
            bullet.y += bullet.velocity_y * dt;
            // Drone plasma weaves side to side.
            bullet.velocity_x = if bullet.kind == EnemyKind::Drone as u8 { (bullet.age * 14.0).cos() * 30.0 } else { 0.0 };
            bullet.x += bullet.velocity_x * dt;
            let (x, y) = (bullet.x, bullet.y + 3.0);
            if y > WORLD_HEIGHT - 8.0 { bullet.active = false; self.add_sparks(x, WORLD_HEIGHT - 9.0, 3, 0.0); continue; }
            if !dying && self.invulnerable_seconds <= 0.0 && self.hitch_grace_seconds <= 0.0
                && (x - self.player_x).abs() <= PLAYER_HALF_WIDTH && y >= PLAYER_Y - 6.0 && y <= PLAYER_Y + 7.0 {
                self.enemy_bullets[index].active = false;
                self.hit_player();
                if self.phase != Phase::Playing { return; }
            }
        }
    }

    // ---------------------------------------------------------------- shields (removed; always empty)

    pub fn shield_cells_left(&self) -> usize { self.shields.iter().filter(|cell| **cell != 0).count() }

    // ---------------------------------------------------------------- mystery ship, capsules

    fn update_mystery(&mut self, dt: f32) {
        if self.mystery.active {
            self.mystery.x += self.mystery.direction * MYSTERY_SPEED * dt;
            if self.mystery.x < -MYSTERY_HALF_WIDTH * 2.0 || self.mystery.x > WORLD_WIDTH + MYSTERY_HALF_WIDTH * 2.0 { self.mystery.active = false; }
            return;
        }
        if self.enemies_alive < 8 { return; }
        self.mystery_timer -= dt;
        if self.mystery_timer <= 0.0 { self.launch_mystery(); }
    }

    pub fn launch_mystery(&mut self) {
        let direction = if self.mysteries_seen % 2 == 0 { 1.0 } else { -1.0 };
        self.mysteries_seen += 1;
        let points = MYSTERY_POINTS[((self.random() * 4.0) as usize).min(3)];
        self.mystery = Mystery { active: true, x: if direction > 0.0 { -MYSTERY_HALF_WIDTH * 1.5 } else { WORLD_WIDTH + MYSTERY_HALF_WIDTH * 1.5 }, direction, points };
        self.mystery_timer = 18.0 + self.random() * 8.0;
        self.events |= events::MYSTERY_APPEAR;
    }

    fn destroy_mystery(&mut self) {
        let mystery = self.mystery;
        self.mystery.active = false;
        self.add_score(mystery.points);
        self.events |= events::MYSTERY_DOWN;
        self.shake = self.shake.max(0.6);
        self.add_sparks(mystery.x, MYSTERY_Y, 14, 3.0);
        self.add_particle(ParticleKind::Ring, mystery.x, MYSTERY_Y, 0.0, 0.0, 0.45, 3.0);
        self.add_particle(ParticleKind::ScoreText, mystery.x, MYSTERY_Y, 0.0, -10.0, 1.2, mystery.points as f32);
        if self.power == Power::None && !self.capsules.iter().any(|capsule| capsule.active) {
            let power = if self.mysteries_seen % 2 == 1 { Power::TripleShot } else { Power::Bubble };
            self.drop_capsule(mystery.x.clamp(12.0, WORLD_WIDTH - 12.0), MYSTERY_Y, power);
        }
    }

    pub fn drop_capsule(&mut self, x: f32, y: f32, power: Power) {
        if let Some(capsule) = self.capsules.iter_mut().find(|capsule| !capsule.active) { *capsule = Capsule { active: true, power, x, y }; }
    }

    fn update_capsules(&mut self, dt: f32) {
        for index in 0..MAX_CAPSULES {
            let capsule = &mut self.capsules[index];
            if !capsule.active { continue; }
            capsule.y += CAPSULE_SPEED * dt;
            if capsule.y > WORLD_HEIGHT { capsule.active = false; continue; }
            if (capsule.x - self.player_x).abs() < PLAYER_HALF_WIDTH + 4.0 && (capsule.y - PLAYER_Y).abs() < 9.0 {
                let power = capsule.power;
                capsule.active = false;
                self.power = power;
                self.power_seconds = if power == Power::TripleShot { TRIPLE_SHOT_SECONDS } else { SHIELD_BUBBLE_SECONDS };
                self.events |= events::POWER_UP;
                self.add_particle(ParticleKind::Ring, self.player_x, PLAYER_Y, 0.0, 0.0, 0.35, 5.0);
            }
        }
    }

    // ---------------------------------------------------------------- particles

    fn add_particle(&mut self, kind: ParticleKind, x: f32, y: f32, velocity_x: f32, velocity_y: f32, life: f32, value: f32) {
        // When the pool is full the oldest effect makes room (it's only decoration).
        let mut slot = 0;
        let mut oldest = -1.0;
        for (index, particle) in self.particles.iter().enumerate() {
            if !particle.active { slot = index; break; }
            let progress = particle.age / particle.life;
            if progress > oldest { oldest = progress; slot = index; }
        }
        self.particles[slot] = Particle { active: true, kind, x, y, velocity_x, velocity_y, age: 0.0, life, value };
    }

    /// `color` picks the palette in the renderer: 0 asteroid, 1 debris, 2 drone, 3 mystery, 4 player, 5 shield.
    fn add_sparks(&mut self, x: f32, y: f32, count: usize, color: f32) {
        for index in 0..count {
            let angle = (index as f32 + self.random()) / count as f32 * core::f32::consts::TAU;
            let speed = 35.0 + self.random() * 60.0;
            let kind = if index % 3 == 0 { ParticleKind::Shard } else { ParticleKind::Spark };
            let life = 0.3 + self.random() * 0.25;
            self.add_particle(kind, x, y, angle.cos() * speed, angle.sin() * speed, life, color);
        }
    }

    fn update_particles(&mut self, dt: f32) {
        for particle in self.particles.iter_mut().filter(|particle| particle.active) {
            particle.age += dt;
            if particle.age >= particle.life { particle.active = false; continue; }
            particle.x += particle.velocity_x * dt;
            particle.y += particle.velocity_y * dt;
            particle.velocity_x *= 1.0 - 2.5 * dt;
            particle.velocity_y *= 1.0 - 2.5 * dt;
        }
    }

    // ---------------------------------------------------------------- test hooks

    /// Kill every enemy except the first `keep` still alive (no score).
    pub fn debug_thin_formation(&mut self, keep: u32) {
        let mut kept = 0;
        for enemy in self.enemies.iter_mut().rev() {
            if !enemy.alive { continue; }
            if kept < keep { kept += 1; } else { enemy.alive = false; }
        }
        self.enemies_alive = kept;
    }
}
