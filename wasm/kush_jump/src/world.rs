//! The whole simulation of Kush Jump: hero physics, tiles, enemies, power-ups, scoring and the stage flow.
//!
//! Frame-time protection (same rules as Breakout):
//! - the world runs in fixed 1/120 s steps;
//! - a frame gap longer than HITCH_SECONDS (the page froze) is dropped: only one 60 Hz frame is simulated, so time
//!   freezes instead of the hero jumping ahead, and for HITCH_GRACE_SECONDS afterwards enemies can't hurt the hero
//!   and a fall into a pit puts the hero back on the last safe ground instead of costing a life;
//! - otherwise at most MAX_FRAME_SECONDS are simulated per frame (a slow frame plays in slight slow motion).
use crate::level::{self, build_stage_one, is_solid, tile, EnemyKind, LEVEL_COLUMNS, LEVEL_ROWS, TILE};

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const MAX_FRAME_SECONDS: f32 = 0.05;
pub const HITCH_SECONDS: f32 = 0.1;
pub const HITCH_GRACE_SECONDS: f32 = 0.3;

pub const LEVEL_WIDTH: f32 = LEVEL_COLUMNS as f32 * TILE;
pub const LEVEL_HEIGHT: f32 = LEVEL_ROWS as f32 * TILE;
pub const HERO_WIDTH: f32 = 12.0;
pub const SMALL_HEIGHT: f32 = 14.0;
pub const BIG_HEIGHT: f32 = 27.0;

const WALK_SPEED: f32 = 96.0;
const RUN_SPEED: f32 = 168.0;
const GROUND_ACCELERATION: f32 = 420.0;
const AIR_ACCELERATION: f32 = 300.0;
const FRICTION: f32 = 520.0;
const SKID_DECELERATION: f32 = 1100.0;
const JUMP_SPEED: f32 = 470.0;
/// Extra take-off speed at full running speed.
const RUN_JUMP_BONUS: f32 = 60.0;
/// Gravity while rising with jump held (long jump) and otherwise (short hop, falling): variable jump height.
const GRAVITY_HELD: f32 = 1450.0;
const GRAVITY: f32 = 3600.0;
const MAX_FALL_SPEED: f32 = 480.0;
const STOMP_BOUNCE: f32 = 300.0;
const STOMP_BOUNCE_HELD: f32 = 470.0;
/// Jump pressed slightly before landing still jumps; jumping slightly after walking off a ledge still works.
const JUMP_BUFFER_SECONDS: f32 = 0.1;
const COYOTE_SECONDS: f32 = 0.08;
/// Head-bump corner correction: a jump that clips a block's corner by this much slides past it.
const CORNER_SLIP: f32 = 5.0;

const ENEMY_SPEED: f32 = 32.0;
const SHELL_SPEED: f32 = 270.0;
const BERRY_SPEED: f32 = 60.0;
const ENEMY_GRAVITY: f32 = 1800.0;
const SHELL_WAKE_SECONDS: f32 = 8.0;
const INVULNERABLE_SECONDS: f32 = 2.0;
const DEATH_SECONDS: f32 = 2.6;
const START_TIME: f32 = 300.0;
/// Clock units per real second (300 units ≈ 2½ minutes).
const TIME_RATE: f32 = 2.0;
pub const START_LIVES: u32 = 3;
pub const MAX_LIVES: u32 = 9;
pub const MAX_ENTITIES: usize = 32;
pub const MAX_EFFECTS: usize = 16;

pub mod events {
    pub const JUMP: u32 = 1;
    pub const COIN: u32 = 2;
    pub const STOMP: u32 = 4;
    pub const BUMP: u32 = 8;
    pub const BREAK: u32 = 16;
    pub const POWER_UP_APPEARS: u32 = 32;
    pub const POWER_UP: u32 = 64;
    pub const SHRINK: u32 = 128;
    pub const DEATH: u32 = 256;
    pub const KICK: u32 = 512;
    pub const FLAG: u32 = 1024;
    pub const STAGE_CLEAR: u32 = 2048;
    pub const ONE_UP: u32 = 4096;
    pub const CHECKPOINT: u32 = 8192;
    pub const HITCH: u32 = 16384;
    /// Fell into a pit right after a hitch: put back on safe ground, no life lost.
    pub const RESCUE: u32 = 32768;
    pub const GAME_OVER: u32 = 65536;
    /// A life was used up and the hero is waiting at the start or checkpoint (a good moment to save).
    pub const LIFE_LOST: u32 = 131072;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3, Goal = 4, Cleared = 5 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EntityKind { Walker = 0, Shellbug = 1, Shell = 2, Berry = 3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EntityState { Dormant = 0, Active = 1, Squashed = 2, Knocked = 3, Emerging = 4 }

#[derive(Clone, Copy, Debug)]
pub struct Entity {
    pub kind: EntityKind,
    pub state: EntityState,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    /// Squash / emerge / shell-wake countdown, or kick grace for a shell.
    pub timer: f32,
}

impl Entity {
    pub fn width(&self) -> f32 { 14.0 }
    pub fn height(&self) -> f32 { match self.kind { EntityKind::Shellbug => 20.0, EntityKind::Shell => 14.0, _ => 14.0 } }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EffectKind { CoinPop = 0, Debris = 1, Score = 2, Bump = 3 }

#[derive(Clone, Copy, Debug)]
pub struct Effect { pub kind: EffectKind, pub x: f32, pub y: f32, pub age: f32, pub value: f32 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HeroPose { Standing = 0, Walking = 1, Jumping = 2, Skidding = 3, Dead = 4, OnPole = 5, Hidden = 6 }

#[derive(Clone, Copy, Debug)]
pub struct Hero {
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub is_big: bool,
    pub on_ground: bool,
    pub facing: f32,
    pub invulnerable_seconds: f32,
    pub pose: HeroPose,
    /// Distance walked, for the leg animation.
    pub stride: f32,
}

impl Hero {
    pub fn height(&self) -> f32 { if self.is_big { BIG_HEIGHT } else { SMALL_HEIGHT } }
    fn at(x: f32) -> Hero {
        Hero { x, y: level::GROUND_ROW as f32 * TILE - SMALL_HEIGHT, velocity_x: 0.0, velocity_y: 0.0, is_big: false, on_ground: true, facing: 1.0,
            invulnerable_seconds: 0.0, pose: HeroPose::Standing, stride: 0.0 }
    }
}

/// Buttons held this frame (bit flags from JavaScript).
pub mod input {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const JUMP: u32 = 4;
    pub const RUN: u32 = 8;
}

pub struct World {
    pub tiles: [u8; LEVEL_COLUMNS * LEVEL_ROWS],
    /// Coins left in each coin brick (by tile index), 0 for other tiles.
    coin_brick_payouts: [u8; LEVEL_COLUMNS * LEVEL_ROWS],
    pub tiles_version: u32,
    pub hero: Hero,
    pub entities: Vec<Entity>,
    pub effects: Vec<Effect>,
    pub phase: Phase,
    pub camera_x: f32,
    pub view_width: f32,
    pub score: u32,
    pub coins: u32,
    pub lives: u32,
    pub time_left: f32,
    pub checkpoint_reached: bool,
    /// Height of the goal flag's cloth (world y); slides down with the hero.
    pub flag_y: f32,
    pub input: u32,
    /// Enemies stomped or knocked out this game (for tests and stats).
    pub enemies_defeated: u32,
    previous_input: u32,
    jump_buffer_seconds: f32,
    coyote_seconds: f32,
    jump_held_since_takeoff: bool,
    stomp_chain: u32,
    phase_seconds: f32,
    hitch_grace_seconds: f32,
    last_safe_x: f32,
    last_safe_y: f32,
    accumulator: f32,
    events: u32,
}

const FLAG_TOP_Y: f32 = level::FLAG_TOP_ROW as f32 * TILE + 4.0;
const POLE_BASE_Y: f32 = (level::GROUND_ROW - 1) as f32 * TILE;

pub fn clamp_between(value: f32, low: f32, high: f32) -> f32 { value.max(low).min(high) }
fn approach(value: f32, target: f32, amount: f32) -> f32 {
    if value < target { (value + amount).min(target) } else { (value - amount).max(target) }
}
fn overlaps(ax: f32, ay: f32, aw: f32, ah: f32, bx: f32, by: f32, bw: f32, bh: f32) -> bool {
    ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah
}

impl World {
    pub fn new() -> World {
        let mut world = World {
            tiles: [0; LEVEL_COLUMNS * LEVEL_ROWS], coin_brick_payouts: [0; LEVEL_COLUMNS * LEVEL_ROWS], tiles_version: 0,
            hero: Hero::at(level::START_COLUMN as f32 * TILE), entities: Vec::with_capacity(MAX_ENTITIES), effects: Vec::with_capacity(MAX_EFFECTS),
            phase: Phase::Ready, camera_x: 0.0, view_width: 320.0, score: 0, coins: 0, lives: START_LIVES, time_left: START_TIME,
            checkpoint_reached: false, flag_y: FLAG_TOP_Y, input: 0, enemies_defeated: 0, previous_input: 0, jump_buffer_seconds: 0.0, coyote_seconds: 0.0,
            jump_held_since_takeoff: false, stomp_chain: 0, phase_seconds: 0.0, hitch_grace_seconds: 0.0, last_safe_x: 0.0, last_safe_y: 0.0,
            accumulator: 0.0, events: 0,
        };
        world.reset_stage();
        world
    }

    /// Fresh tiles and enemies; the hero waits at the start or the checkpoint (score, coins and lives are kept).
    pub fn reset_stage(&mut self) {
        let layout = build_stage_one();
        self.tiles = layout.tiles;
        self.coin_brick_payouts = [0; LEVEL_COLUMNS * LEVEL_ROWS];
        for (index, &kind) in self.tiles.iter().enumerate() { if kind == tile::COIN_BRICK { self.coin_brick_payouts[index] = 6; } }
        self.tiles_version = self.tiles_version.wrapping_add(1);
        let start_column = if self.checkpoint_reached { level::CHECKPOINT_COLUMN } else { level::START_COLUMN };
        self.hero = Hero::at(start_column as f32 * TILE);
        self.last_safe_x = self.hero.x;
        self.last_safe_y = self.hero.y;
        self.camera_x = 0.0;
        self.follow_camera(true);
        self.entities.clear();
        for &(kind, column) in layout.enemies.iter() {
            let x = column * TILE + 1.0;
            if x < self.camera_x + self.view_width { continue; } // behind or right at the restart point: skip
            let kind = if kind == EnemyKind::Walker { EntityKind::Walker } else { EntityKind::Shellbug };
            let mut entity = Entity { kind, state: EntityState::Dormant, x, y: 0.0, velocity_x: -ENEMY_SPEED, velocity_y: 0.0, timer: 0.0 };
            entity.y = level::GROUND_ROW as f32 * TILE - entity.height();
            self.entities.push(entity);
        }
        self.effects.clear();
        self.time_left = START_TIME;
        self.flag_y = FLAG_TOP_Y;
        self.phase = Phase::Ready;
        self.phase_seconds = 0.0;
        self.stomp_chain = 0;
        self.hitch_grace_seconds = 0.0;
        self.accumulator = 0.0;
    }

    /// Jump pressed (latched until the next step, so a tap shorter than a frame still jumps).
    pub fn press_jump(&mut self) { self.jump_buffer_seconds = JUMP_BUFFER_SECONDS; }

    /// Ready → Playing (first key or tap).
    pub fn start(&mut self) {
        if self.phase == Phase::Ready { self.phase = Phase::Playing; self.phase_seconds = 0.0; }
    }

    /// New game from the beginning (after game over or a cleared stage).
    pub fn restart(&mut self) {
        self.score = 0;
        self.coins = 0;
        self.lives = START_LIVES;
        self.enemies_defeated = 0;
        self.checkpoint_reached = false;
        self.reset_stage();
    }

    pub fn tile_at(&self, column: i32, row: i32) -> u8 {
        if column < 0 || column >= LEVEL_COLUMNS as i32 { return tile::STONE; } // invisible walls at both ends
        if row < 0 || row >= LEVEL_ROWS as i32 { return tile::EMPTY; }
        self.tiles[row as usize * LEVEL_COLUMNS + column as usize]
    }
    fn set_tile(&mut self, column: i32, row: i32, kind: u8) {
        if column >= 0 && (column as usize) < LEVEL_COLUMNS && row >= 0 && (row as usize) < LEVEL_ROWS {
            self.tiles[row as usize * LEVEL_COLUMNS + column as usize] = kind;
            self.tiles_version = self.tiles_version.wrapping_add(1);
        }
    }
    fn solid_at(&self, column: i32, row: i32) -> bool { is_solid(self.tile_at(column, row)) }
    /// The first solid tile a box overlaps (top row first, left to right).
    fn solid_tile_in_box(&self, x: f32, y: f32, width: f32, height: f32) -> Option<(i32, i32)> {
        let left = (x / TILE).floor() as i32;
        let right = ((x + width - 0.01) / TILE).floor() as i32;
        let top = (y / TILE).floor() as i32;
        let bottom = ((y + height - 0.01) / TILE).floor() as i32;
        for row in top..=bottom { for column in left..=right { if self.solid_at(column, row) { return Some((column, row)); } } }
        None
    }

    fn add_effect(&mut self, kind: EffectKind, x: f32, y: f32, value: f32) {
        if self.effects.len() >= MAX_EFFECTS { self.effects.remove(0); }
        self.effects.push(Effect { kind, x, y, age: 0.0, value });
    }
    fn add_score(&mut self, points: u32, x: f32, y: f32) {
        self.score += points;
        self.add_effect(EffectKind::Score, x, y, points as f32);
    }
    fn add_coin(&mut self) {
        self.coins += 1;
        self.score += 200;
        self.events |= events::COIN;
        if self.coins % 100 == 0 && self.lives < MAX_LIVES { self.lives += 1; self.events |= events::ONE_UP; }
    }

    /// Simulate `seconds` of play (fixed steps inside, see the module notes). Returns a bitmask of `events`.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        self.events = 0;
        let seconds = if seconds > 0.0 { seconds } else { 0.0 }; // NaN or a clock going backwards
        let frame_seconds = if seconds > HITCH_SECONDS {
            if self.phase == Phase::Playing { self.events |= events::HITCH; self.hitch_grace_seconds = HITCH_GRACE_SECONDS; }
            1.0 / 60.0
        } else { seconds.min(MAX_FRAME_SECONDS) };
        self.accumulator += frame_seconds;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            self.step(STEP_SECONDS);
        }
        self.previous_input = self.input;
        self.events
    }

    fn step(&mut self, dt: f32) {
        for effect in self.effects.iter_mut() { effect.age += dt; }
        self.effects.retain(|effect| effect.age < if effect.kind == EffectKind::Bump { 0.16 } else { 0.8 });
        self.phase_seconds += dt;
        match self.phase {
            Phase::Ready | Phase::GameOver | Phase::Cleared => {}
            Phase::Playing => self.step_playing(dt),
            Phase::Dying => self.step_dying(dt),
            Phase::Goal => self.step_goal(dt),
        }
    }

    fn step_playing(&mut self, dt: f32) {
        self.hitch_grace_seconds = (self.hitch_grace_seconds - dt).max(0.0);
        self.hero.invulnerable_seconds = (self.hero.invulnerable_seconds - dt).max(0.0);
        self.time_left -= dt * TIME_RATE;
        if self.time_left <= 0.0 { self.time_left = 0.0; self.kill_hero(); return; }
        self.move_hero(dt);
        if self.phase != Phase::Playing { return; }
        self.follow_camera(false);
        self.update_entities(dt);
        if self.phase != Phase::Playing { return; }
        self.hero_meets_entities();
        if !self.checkpoint_reached && self.hero.x >= level::CHECKPOINT_COLUMN as f32 * TILE {
            self.checkpoint_reached = true;
            self.events |= events::CHECKPOINT;
        }
        let pole_x = level::FLAG_COLUMN as f32 * TILE + TILE / 2.0;
        // touching the pole or the stone at its foot
        if self.hero.x + HERO_WIDTH >= pole_x - TILE / 2.0 - 0.5 { self.grab_pole(pole_x); }
    }

    fn move_hero(&mut self, dt: f32) {
        let pressed = self.input & !self.previous_input;
        let held = self.input;
        if pressed & input::JUMP != 0 { self.jump_buffer_seconds = JUMP_BUFFER_SECONDS; } else { self.jump_buffer_seconds = (self.jump_buffer_seconds - dt).max(0.0); }
        // the jump button counts as "pressed" only once per frame, not once per sub-step
        self.previous_input |= pressed;
        let hero = &mut self.hero;
        let direction = (if held & input::RIGHT != 0 { 1.0 } else { 0.0 }) - (if held & input::LEFT != 0 { 1.0 } else { 0.0 });
        let max_speed = if held & input::RUN != 0 { RUN_SPEED } else { WALK_SPEED };
        let mut is_skidding = false;
        if direction != 0.0 {
            hero.facing = direction;
            if hero.on_ground && hero.velocity_x * direction < 0.0 {
                hero.velocity_x = approach(hero.velocity_x, 0.0, SKID_DECELERATION * dt);
                is_skidding = true;
            } else {
                let acceleration = if hero.on_ground { GROUND_ACCELERATION } else { AIR_ACCELERATION };
                if hero.velocity_x * direction < max_speed { hero.velocity_x = approach(hero.velocity_x, direction * max_speed, acceleration * dt); }
                else if hero.on_ground { hero.velocity_x = approach(hero.velocity_x, direction * max_speed, FRICTION * dt); }
            }
        } else if hero.on_ground {
            hero.velocity_x = approach(hero.velocity_x, 0.0, FRICTION * dt);
        }

        if hero.on_ground { self.coyote_seconds = COYOTE_SECONDS; } else { self.coyote_seconds = (self.coyote_seconds - dt).max(0.0); }
        if self.jump_buffer_seconds > 0.0 && self.coyote_seconds > 0.0 {
            let speed_share = clamp_between(hero.velocity_x.abs() / RUN_SPEED, 0.0, 1.0);
            hero.velocity_y = -(JUMP_SPEED + RUN_JUMP_BONUS * speed_share);
            hero.on_ground = false;
            self.jump_buffer_seconds = 0.0;
            self.coyote_seconds = 0.0;
            self.jump_held_since_takeoff = true;
            self.events |= events::JUMP;
        }
        if held & input::JUMP == 0 { self.jump_held_since_takeoff = false; }
        let gravity = if hero.velocity_y < 0.0 && self.jump_held_since_takeoff { GRAVITY_HELD } else { GRAVITY };
        hero.velocity_y = (hero.velocity_y + gravity * dt).min(MAX_FALL_SPEED);

        // Horizontal move and wall collisions.
        let height = hero.height();
        hero.x += hero.velocity_x * dt;
        if hero.x < self.camera_x { hero.x = self.camera_x; if hero.velocity_x < 0.0 { hero.velocity_x = 0.0; } }
        let (hero_x, hero_y) = (hero.x, hero.y);
        if let Some((column, _)) = self.solid_tile_in_box(hero_x, hero_y, HERO_WIDTH, height) {
            let hero = &mut self.hero;
            let tile_left = column as f32 * TILE;
            if hero.x + HERO_WIDTH / 2.0 < tile_left + TILE / 2.0 { hero.x = tile_left - HERO_WIDTH; } else { hero.x = tile_left + TILE; }
            hero.velocity_x = 0.0;
        }

        // Vertical move: land on top, or bump a block with the head.
        let hero = &mut self.hero;
        let was_on_ground = hero.on_ground;
        hero.on_ground = false;
        hero.y += hero.velocity_y * dt;
        if hero.velocity_y >= 0.0 {
            let feet_row = ((hero.y + height) / TILE).floor() as i32;
            let left = (hero.x / TILE).floor() as i32;
            let right = ((hero.x + HERO_WIDTH - 0.01) / TILE).floor() as i32;
            let previous_feet = hero.y + height - hero.velocity_y * dt;
            if (left..=right).any(|column| self.solid_at(column, feet_row)) && previous_feet <= feet_row as f32 * TILE + 0.5 {
                let hero = &mut self.hero;
                hero.y = feet_row as f32 * TILE - height;
                hero.velocity_y = 0.0;
                hero.on_ground = true;
                self.stomp_chain = 0;
                if !was_on_ground || hero.x != self.last_safe_x { self.last_safe_x = hero.x; self.last_safe_y = hero.y; }
            }
        } else {
            let head_row = (hero.y / TILE).floor() as i32;
            let left = (hero.x / TILE).floor() as i32;
            let right = ((hero.x + HERO_WIDTH - 0.01) / TILE).floor() as i32;
            let left_solid = self.solid_at(left, head_row);
            let right_solid = right != left && self.solid_at(right, head_row);
            if left_solid || right_solid {
                let hero_x = self.hero.x;
                // Corner slip: only the edge of one block was clipped and the other side is free.
                let overlap_left = (left + 1) as f32 * TILE - hero_x;
                let overlap_right = hero_x + HERO_WIDTH - right as f32 * TILE;
                if left_solid && !right_solid && right != left && overlap_left <= CORNER_SLIP {
                    self.hero.x = (left + 1) as f32 * TILE;
                } else if right_solid && !left_solid && overlap_right <= CORNER_SLIP {
                    self.hero.x = right as f32 * TILE - HERO_WIDTH;
                } else {
                    let center = hero_x + HERO_WIDTH / 2.0;
                    let bumped = if left_solid && right_solid {
                        if center < (left + 1) as f32 * TILE { left } else { right }
                    } else if left_solid { left } else { right };
                    let hero = &mut self.hero;
                    hero.y = (head_row + 1) as f32 * TILE;
                    hero.velocity_y = 30.0;
                    self.bump_block(bumped, head_row);
                }
            }
        }

        // Coins touched.
        let hero = self.hero;
        let left = (hero.x / TILE).floor() as i32;
        let right = ((hero.x + HERO_WIDTH - 0.01) / TILE).floor() as i32;
        let top = (hero.y / TILE).floor() as i32;
        let bottom = ((hero.y + height - 0.01) / TILE).floor() as i32;
        for row in top..=bottom {
            for column in left..=right {
                if self.tile_at(column, row) == tile::COIN { self.set_tile(column, row, tile::EMPTY); self.add_coin(); }
            }
        }

        // Pose for drawing.
        let hero = &mut self.hero;
        if hero.on_ground { hero.stride += hero.velocity_x.abs() * dt; }
        hero.pose = if !hero.on_ground { HeroPose::Jumping } else if is_skidding { HeroPose::Skidding }
            else if hero.velocity_x.abs() > 4.0 { HeroPose::Walking } else { HeroPose::Standing };

        // Fell into a pit.
        if hero.y > LEVEL_HEIGHT + 24.0 {
            if self.hitch_grace_seconds > 0.0 {
                let hero = &mut self.hero;
                hero.x = self.last_safe_x;
                hero.y = self.last_safe_y;
                hero.velocity_x = 0.0;
                hero.velocity_y = 0.0;
                hero.invulnerable_seconds = INVULNERABLE_SECONDS;
                self.events |= events::RESCUE;
            } else {
                self.kill_hero();
            }
        }
    }

    fn bump_block(&mut self, column: i32, row: i32) {
        let kind = self.tile_at(column, row);
        let x = column as f32 * TILE;
        let y = row as f32 * TILE;
        match kind {
            tile::COIN_CRATE | tile::COIN_BRICK => {
                if kind == tile::COIN_CRATE { self.set_tile(column, row, tile::USED_CRATE); }
                else {
                    let index = row as usize * LEVEL_COLUMNS + column as usize;
                    self.coin_brick_payouts[index] = self.coin_brick_payouts[index].saturating_sub(1);
                    if self.coin_brick_payouts[index] == 0 { self.set_tile(column, row, tile::USED_CRATE); }
                }
                self.add_coin();
                self.add_effect(EffectKind::CoinPop, x + TILE / 2.0, y - 4.0, 0.0);
                self.add_effect(EffectKind::Bump, column as f32, row as f32, 0.0);
            }
            tile::BERRY_CRATE => {
                self.set_tile(column, row, tile::USED_CRATE);
                self.add_effect(EffectKind::Bump, column as f32, row as f32, 0.0);
                if self.entities.len() < MAX_ENTITIES {
                    self.entities.push(Entity { kind: EntityKind::Berry, state: EntityState::Emerging, x: x + 1.0, y, velocity_x: BERRY_SPEED, velocity_y: 0.0, timer: 0.5 });
                }
                self.events |= events::POWER_UP_APPEARS;
            }
            tile::BRICK if self.hero.is_big => {
                self.set_tile(column, row, tile::EMPTY);
                self.score += 50;
                self.add_effect(EffectKind::Debris, x + TILE / 2.0, y + TILE / 2.0, 0.0);
                self.events |= events::BREAK;
            }
            tile::BRICK => { self.add_effect(EffectKind::Bump, column as f32, row as f32, 0.0); self.events |= events::BUMP; }
            _ => { self.events |= events::BUMP; return; }
        }
        // Whatever stands on a bumped block gets knocked: enemies flip, a berry hops, a coin is collected.
        if self.tile_at(column, row - 1) == tile::COIN { self.set_tile(column, row - 1, tile::EMPTY); self.add_coin(); self.add_effect(EffectKind::CoinPop, x + TILE / 2.0, y - 20.0, 0.0); }
        let mut knocked_points = 0;
        for entity in self.entities.iter_mut() {
            if entity.state != EntityState::Active { continue; }
            let standing_on = (entity.y + entity.height() - y).abs() < 3.0 && entity.x + entity.width() > x && entity.x < x + TILE;
            if !standing_on { continue; }
            if entity.kind == EntityKind::Berry { entity.velocity_y = -260.0; continue; }
            entity.state = EntityState::Knocked;
            entity.velocity_y = -260.0;
            knocked_points += 100;
            self.enemies_defeated += 1;
        }
        if knocked_points > 0 { self.add_score(knocked_points, x + TILE / 2.0, y - 12.0); self.events |= events::STOMP; }
    }

    fn follow_camera(&mut self, snap: bool) {
        let target = self.hero.x + HERO_WIDTH / 2.0 - self.view_width * 0.42;
        let limit = (LEVEL_WIDTH - self.view_width).max(0.0);
        let target = clamp_between(target, 0.0, limit);
        // The camera only scrolls forward, like the classics (no walking back to an earlier part of the stage).
        self.camera_x = if snap { target } else { self.camera_x.max(target).min(limit) };
    }

    fn update_entities(&mut self, dt: f32) {
        let wake_edge = self.camera_x + self.view_width + 2.0 * TILE;
        for index in 0..self.entities.len() {
            let mut entity = self.entities[index];
            match entity.state {
                EntityState::Dormant => { if entity.x < wake_edge { entity.state = EntityState::Active; } }
                EntityState::Squashed => entity.timer -= dt,
                EntityState::Knocked => {
                    entity.velocity_y = (entity.velocity_y + ENEMY_GRAVITY * dt).min(MAX_FALL_SPEED);
                    entity.y += entity.velocity_y * dt;
                    entity.x += entity.velocity_x.signum() * 30.0 * dt;
                }
                EntityState::Emerging => {
                    entity.timer -= dt;
                    entity.y -= TILE / 0.5 * dt;
                    // risen one tile out of its crate: sit exactly on top of it
                    if entity.timer <= 0.0 { entity.state = EntityState::Active; entity.y = (entity.y / TILE).round() * TILE + TILE - entity.height(); }
                }
                EntityState::Active => self.move_entity(&mut entity, dt),
            }
            self.entities[index] = entity;
        }
        // Moving shells knock other enemies; walkers bump into each other and turn around.
        let count = self.entities.len();
        let mut shell_points = 0;
        for first in 0..count {
            for second in first + 1..count {
                let (a, b) = (self.entities[first], self.entities[second]);
                if a.state != EntityState::Active || b.state != EntityState::Active || a.kind == EntityKind::Berry || b.kind == EntityKind::Berry { continue; }
                if !overlaps(a.x, a.y, a.width(), a.height(), b.x, b.y, b.width(), b.height()) { continue; }
                let a_slides = a.kind == EntityKind::Shell && a.velocity_x != 0.0;
                let b_slides = b.kind == EntityKind::Shell && b.velocity_x != 0.0;
                if a_slides || b_slides {
                    let victim = if a_slides && !b_slides { second } else if b_slides && !a_slides { first } else { second };
                    self.entities[victim].state = EntityState::Knocked;
                    self.entities[victim].velocity_y = -220.0;
                    shell_points += 200;
                    self.enemies_defeated += 1;
                    self.events |= events::KICK;
                } else {
                    let (a_x, b_x) = (a.x, b.x);
                    self.entities[first].velocity_x = if a_x < b_x { -a.velocity_x.abs() } else { a.velocity_x.abs() };
                    self.entities[second].velocity_x = if b_x < a_x { -b.velocity_x.abs() } else { b.velocity_x.abs() };
                }
            }
        }
        if shell_points > 0 { self.score += shell_points; }
        let left_edge = self.camera_x - 4.0 * TILE;
        self.entities.retain(|entity| {
            !(entity.state == EntityState::Squashed && entity.timer <= 0.0) && entity.y < LEVEL_HEIGHT + 32.0 && entity.x + entity.width() > left_edge
                && entity.x < LEVEL_WIDTH
        });
    }

    fn move_entity(&self, entity: &mut Entity, dt: f32) {
        if entity.kind == EntityKind::Shell {
            entity.timer -= dt;
            if entity.velocity_x == 0.0 && entity.timer <= 0.0 {
                // wakes up and walks on
                entity.kind = EntityKind::Shellbug;
                entity.y -= 20.0 - 14.0;
                entity.velocity_x = -ENEMY_SPEED;
                return;
            }
        }
        entity.velocity_y = (entity.velocity_y + ENEMY_GRAVITY * dt).min(MAX_FALL_SPEED);
        let (width, height) = (entity.width(), entity.height());
        entity.x += entity.velocity_x * dt;
        if let Some((column, _)) = self.solid_tile_in_box(entity.x, entity.y, width, height) {
            let tile_left = column as f32 * TILE;
            if entity.velocity_x > 0.0 { entity.x = tile_left - width; } else { entity.x = tile_left + TILE; }
            entity.velocity_x = -entity.velocity_x;
        }
        entity.y += entity.velocity_y * dt;
        if entity.velocity_y > 0.0 {
            let feet_row = ((entity.y + height) / TILE).floor() as i32;
            let left = (entity.x / TILE).floor() as i32;
            let right = ((entity.x + width - 0.01) / TILE).floor() as i32;
            if (left..=right).any(|column| self.solid_at(column, feet_row)) && entity.y + height - entity.velocity_y * dt <= feet_row as f32 * TILE + 0.5 {
                entity.y = feet_row as f32 * TILE - height;
                entity.velocity_y = 0.0;
            }
        }
    }

    fn hero_meets_entities(&mut self) {
        let hero = self.hero;
        let height = hero.height();
        let can_be_hurt = hero.invulnerable_seconds <= 0.0 && self.hitch_grace_seconds <= 0.0;
        let mut hurt = false;
        let mut bounce = false;
        for index in 0..self.entities.len() {
            let entity = self.entities[index];
            if entity.state != EntityState::Active { continue; }
            if !overlaps(hero.x, hero.y, HERO_WIDTH, height, entity.x, entity.y, entity.width(), entity.height()) { continue; }
            let center_x = entity.x + entity.width() / 2.0;
            let from_above = hero.velocity_y > 0.0 && hero.y + height - entity.y < 8.0 + hero.velocity_y * STEP_SECONDS;
            match entity.kind {
                EntityKind::Berry => {
                    self.entities[index].state = EntityState::Squashed;
                    self.entities[index].timer = 0.0;
                    if !self.hero.is_big { self.hero.is_big = true; self.hero.y -= BIG_HEIGHT - SMALL_HEIGHT; }
                    self.add_score(1000, center_x, entity.y);
                    self.events |= events::POWER_UP;
                }
                EntityKind::Walker | EntityKind::Shellbug if from_above => {
                    self.stomp_chain += 1;
                    let points = match self.stomp_chain { 1 => 100, 2 => 200, 3 => 400, 4 => 800, _ => 1000 };
                    let target = &mut self.entities[index];
                    if entity.kind == EntityKind::Walker {
                        target.state = EntityState::Squashed;
                        target.timer = 0.5;
                    } else {
                        target.kind = EntityKind::Shell;
                        target.y += 20.0 - 14.0;
                        target.velocity_x = 0.0;
                        target.timer = SHELL_WAKE_SECONDS;
                    }
                    self.add_score(points, center_x, entity.y);
                    self.enemies_defeated += 1;
                    self.events |= events::STOMP;
                    bounce = true;
                }
                EntityKind::Shell if entity.velocity_x == 0.0 => {
                    // a resting shell: any touch kicks it away from the hero
                    let direction = if hero.x + HERO_WIDTH / 2.0 < center_x { 1.0 } else { -1.0 };
                    let target = &mut self.entities[index];
                    target.velocity_x = direction * SHELL_SPEED;
                    target.timer = 0.25; // kick grace: the shell can't hurt the kicker straight away
                    target.x = if direction > 0.0 { target.x.max(hero.x + HERO_WIDTH + 1.0) } else { target.x.min(hero.x - entity.width() - 1.0) };
                    self.add_score(100, center_x, entity.y);
                    self.events |= events::KICK;
                    if from_above { bounce = true; }
                }
                EntityKind::Shell if from_above => {
                    let target = &mut self.entities[index];
                    target.velocity_x = 0.0;
                    target.timer = SHELL_WAKE_SECONDS;
                    self.add_score(100, center_x, entity.y);
                    self.events |= events::STOMP;
                    bounce = true;
                }
                EntityKind::Shell if entity.velocity_x != 0.0 && entity.timer > 0.0 => {} // just kicked
                _ => { if can_be_hurt { hurt = true; } }
            }
        }
        if bounce {
            self.hero.velocity_y = -(if self.input & input::JUMP != 0 { STOMP_BOUNCE_HELD } else { STOMP_BOUNCE });
            self.jump_held_since_takeoff = self.input & input::JUMP != 0;
        } else if hurt {
            if self.hero.is_big {
                self.hero.is_big = false;
                self.hero.y += BIG_HEIGHT - SMALL_HEIGHT;
                self.hero.invulnerable_seconds = INVULNERABLE_SECONDS;
                self.events |= events::SHRINK;
            } else {
                self.kill_hero();
            }
        }
    }

    pub fn kill_hero(&mut self) {
        if self.phase != Phase::Playing { return; }
        self.phase = Phase::Dying;
        self.phase_seconds = 0.0;
        self.hero.is_big = false;
        self.hero.pose = HeroPose::Dead;
        self.hero.velocity_x = 0.0;
        self.hero.velocity_y = -420.0;
        self.events |= events::DEATH;
    }

    fn step_dying(&mut self, dt: f32) {
        // A short freeze, then the hero hops up and falls off the screen.
        if self.phase_seconds > 0.45 {
            self.hero.velocity_y = (self.hero.velocity_y + GRAVITY_HELD * dt).min(MAX_FALL_SPEED);
            self.hero.y += self.hero.velocity_y * dt;
        }
        if self.phase_seconds < DEATH_SECONDS { return; }
        self.lives = self.lives.saturating_sub(1);
        if self.lives == 0 {
            self.phase = Phase::GameOver;
            self.events |= events::GAME_OVER;
        } else {
            self.reset_stage();
            self.events |= events::LIFE_LOST;
        }
    }

    fn grab_pole(&mut self, pole_x: f32) {
        let feet = self.hero.y + self.hero.height();
        let bonus = if feet < 72.0 { 5000 } else if feet < 104.0 { 2000 } else if feet < 136.0 { 800 } else if feet < 168.0 { 400 } else { 100 };
        self.add_score(bonus, pole_x + 16.0, feet);
        self.hero.x = pole_x - HERO_WIDTH + 2.0;
        self.hero.velocity_x = 0.0;
        self.hero.velocity_y = 0.0;
        self.hero.facing = 1.0;
        self.hero.pose = HeroPose::OnPole;
        self.flag_y = FLAG_TOP_Y.max(self.flag_y);
        self.phase = Phase::Goal;
        self.phase_seconds = 0.0;
        self.events |= events::FLAG;
    }

    /// Slide down the pole with the flag, walk into the fort, then count the time left into the score.
    fn step_goal(&mut self, dt: f32) {
        let height = self.hero.height();
        let door_x = level::FORT_DOOR_COLUMN as f32 * TILE;
        if self.hero.pose == HeroPose::OnPole {
            self.hero.y = (self.hero.y + 150.0 * dt).min(POLE_BASE_Y - height);
            self.flag_y = (self.flag_y + 150.0 * dt).min(POLE_BASE_Y - 16.0);
            if self.hero.y >= POLE_BASE_Y - height && self.flag_y >= POLE_BASE_Y - 16.0 && self.phase_seconds > 0.6 {
                self.hero.pose = HeroPose::Walking;
                self.hero.x += 2.0 * TILE / 2.0 + 4.0;
            }
        } else if self.hero.pose != HeroPose::Hidden {
            // walk to the fort door (drop down from the pole base to the ground first)
            self.hero.velocity_y = (self.hero.velocity_y + GRAVITY * dt).min(MAX_FALL_SPEED);
            self.hero.y = (self.hero.y + self.hero.velocity_y * dt).min(level::GROUND_ROW as f32 * TILE - height);
            if self.hero.y >= level::GROUND_ROW as f32 * TILE - height { self.hero.velocity_y = 0.0; }
            self.hero.x += 70.0 * dt;
            self.hero.stride += 70.0 * dt;
            self.follow_camera(false);
            if self.hero.x >= door_x { self.hero.pose = HeroPose::Hidden; }
        } else if self.time_left > 0.0 {
            let counted = (self.time_left.min(150.0 * dt)).max(0.0);
            let before = self.time_left.ceil() as u32;
            self.time_left -= counted;
            let after = self.time_left.max(0.0).ceil() as u32;
            self.score += (before - after) * 50;
            if self.time_left <= 0.0 { self.time_left = 0.0; }
        } else {
            self.phase = Phase::Cleared;
            self.events |= events::STAGE_CLEAR;
        }
    }

    /// Saved progress: restart at the start or checkpoint with these numbers.
    pub fn restore(&mut self, checkpoint_reached: bool, lives: u32, score: u32, coins: u32) -> bool {
        if lives == 0 || lives > MAX_LIVES { return false; }
        self.checkpoint_reached = checkpoint_reached;
        self.lives = lives;
        self.score = score;
        self.coins = coins % 100;
        self.reset_stage();
        true
    }

    /// Test hook: move the hero to a tile column standing on the ground (and the camera with it).
    pub fn teleport(&mut self, column: f32) {
        let height = self.hero.height();
        self.hero.x = column * TILE;
        self.hero.y = level::GROUND_ROW as f32 * TILE - height;
        while self.solid_tile_in_box(self.hero.x, self.hero.y, HERO_WIDTH, height).is_some() && self.hero.y > 0.0 { self.hero.y -= TILE; }
        self.hero.velocity_x = 0.0;
        self.hero.velocity_y = 0.0;
        let limit = (LEVEL_WIDTH - self.view_width).max(0.0);
        self.camera_x = clamp_between(self.hero.x - self.view_width * 0.42, 0.0, limit);
        self.entities.retain(|entity| entity.x > self.camera_x);
    }
}

impl Default for World { fn default() -> Self { World::new() } }
