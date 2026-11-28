//! The Metro Dash simulation: three railway lanes, the runner (instant lane switches, a jump with coyote time and an input
//! buffer, a roll that also fast-drops you out of the air), trains (parked ones with ramps up to their roofs, and ones
//! rolling toward you), low and high barriers, overhead signs, coins, four power-ups, stumbles, the chaser, scoring,
//! the run generator that always leaves a fair path, and the save format. Fixed 1/120 s steps.

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const LANE_COUNT: usize = 3;
pub const LANE_WIDTH: f32 = 2.5;
/// A full lane switch: a quick, eased snap.
pub const LANE_SWITCH_SECONDS: f32 = 0.13;
pub const GRAVITY: f32 = 38.0;
/// About 1.56 m high and 0.57 s in the air.
pub const JUMP_VELOCITY: f32 = 10.9;
/// With the super sneakers: about 4.6 m high (over a train), 0.99 s in the air.
pub const SUPER_JUMP_VELOCITY: f32 = 18.8;
/// Swiping down in the air slams you down at this speed (and you roll when you land).
pub const FAST_DROP_VELOCITY: f32 = 24.0;
pub const ROLL_SECONDS: f32 = 0.6;
/// A jump or roll pressed this long before it is possible still happens.
pub const INPUT_BUFFER_SECONDS: f32 = 0.16;
/// A jump this soon after running off an edge still works.
pub const COYOTE_SECONDS: f32 = 0.1;
pub const PLAYER_HALF_WIDTH: f32 = 0.4;
pub const PLAYER_HALF_DEPTH: f64 = 0.35;
pub const STAND_HEIGHT: f32 = 1.7;
pub const ROLL_HEIGHT: f32 = 0.8;
/// Ledges lower than this above your feet are stepped up onto, not run into.
pub const STEP_UP: f32 = 0.45;
pub const TRAIN_HALF_WIDTH: f32 = 1.15;
pub const TRAIN_HEIGHT: f32 = 3.2;
pub const CAR_LENGTH: f32 = 13.0;
pub const RAMP_LENGTH: f32 = 7.0;
pub const BARRIER_DEPTH: f32 = 0.45;
/// A low barrier is drawn 1.0 m tall but only hits below this (a jump that nearly clears it, clears it).
pub const LOW_BARRIER_HIT_HEIGHT: f32 = 0.85;
pub const LOW_BARRIER_HEIGHT: f32 = 1.0;
/// The bar of a high barrier: rolling (0.8 m) passes under, standing or jumping hits it.
pub const HIGH_BARRIER_BOTTOM: f32 = 1.15;
pub const HIGH_BARRIER_TOP: f32 = 3.0;
pub const SIGN_BOTTOM: f32 = 1.2;
pub const SIGN_TOP: f32 = 2.7;
/// Only a hit this close to the middle of an obstacle's face is head-on; anything wider is a glancing stumble.
pub const HEAD_ON_HALF_WIDTH: f32 = 0.95;
pub const START_SPEED: f32 = 11.0;
pub const MAX_SPEED: f32 = 27.0;
/// The speed is halfway from START_SPEED to MAX_SPEED after this many metres.
pub const SPEED_HALF_DISTANCE: f64 = 2400.0;
/// A second stumble within this long of the first gets you caught.
pub const STUMBLE_WINDOW_SECONDS: f32 = 5.0;
/// After a stumble, glancing hits are ignored this long (you are being bounced clear).
pub const HIT_GRACE_SECONDS: f32 = 0.5;
pub const CRASH_SECONDS: f32 = 1.2;
pub const MAGNET_SECONDS: f32 = 10.0;
pub const SNEAKERS_SECONDS: f32 = 10.0;
pub const MULTIPLIER_SECONDS: f32 = 15.0;
pub const HOVERBOARD_SECONDS: f32 = 30.0;
/// Safe time after the hoverboard takes a crash for you.
pub const SHIELD_GHOST_SECONDS: f32 = 1.0;
pub const MAGNET_RANGE: f64 = 16.0;
pub const COIN_SCORE: u32 = 5;
pub const COIN_STREAK_SECONDS: f32 = 1.2;
pub const FIRST_ROW_Z: f64 = 40.0;
pub const SPAWN_AHEAD: f64 = 180.0;
pub const DESPAWN_BEHIND: f64 = 14.0;
pub const MAX_ENTITIES: usize = 200;
pub const MILESTONE_METRES: f64 = 500.0;
pub const CHASER_NEAR_GAP: f32 = 2.4;
pub const CHASER_FAR_GAP: f32 = 18.0;
pub const CHASER_INTRO_SECONDS: f32 = 2.5;

pub fn limit(value: f32, low: f32, high: f32) -> f32 { if value < low { low } else if value > high { high } else { value } }
pub fn lane_x(lane: usize) -> f32 { (lane as f32 - 1.0) * LANE_WIDTH }
/// The running speed `distance` metres into a run (rises smoothly and never stops rising; no randomness, so the
/// generator knows how fast you will be going at every row).
pub fn speed_at(distance: f64) -> f32 {
    let distance = if distance > 0.0 { distance } else { 0.0 };
    START_SPEED + (MAX_SPEED - START_SPEED) * (distance / (distance + SPEED_HALF_DISTANCE)) as f32
}
fn smooth(t: f32) -> f32 { t * t * (3.0 - 2.0 * t) }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Phase { Ready = 0, Playing = 1, Crashed = 2, GameOver = 3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Kind { Train = 0, MovingTrain = 1, Ramp = 2, LowBarrier = 3, HighBarrier = 4, Sign = 5, Coin = 6, Magnet = 7, Sneakers = 8, Multiplier = 9, Hoverboard = 10 }
pub const KIND_COUNT: u32 = 11;
impl Kind {
    pub fn from_index(index: u32) -> Option<Kind> {
        Some(match index {
            0 => Kind::Train, 1 => Kind::MovingTrain, 2 => Kind::Ramp, 3 => Kind::LowBarrier, 4 => Kind::HighBarrier, 5 => Kind::Sign,
            6 => Kind::Coin, 7 => Kind::Magnet, 8 => Kind::Sneakers, 9 => Kind::Multiplier, 10 => Kind::Hoverboard, _ => return None,
        })
    }
    pub fn is_obstacle(self) -> bool { (self as u8) <= Kind::Sign as u8 }
    pub fn is_power_up(self) -> bool { (self as u8) >= Kind::Magnet as u8 }
    /// Trains and ramps: you can stand on them.
    pub fn is_walkable(self) -> bool { (self as u8) <= Kind::Ramp as u8 }
}

/// Why the run ended.
pub const CRASH_HEAD_ON: u8 = 1;
pub const CRASH_CAUGHT: u8 = 2;

/// Event bits returned by `advance`.
pub mod events {
    pub const JUMP: u32 = 1;
    pub const SUPER_JUMP: u32 = 2;
    pub const LAND: u32 = 4;
    pub const ROLL: u32 = 8;
    pub const LANE: u32 = 16;
    pub const COIN: u32 = 32;
    pub const POWER_UP: u32 = 64;
    pub const HOVERBOARD_BREAK: u32 = 128;
    pub const STUMBLE: u32 = 256;
    pub const CRASH: u32 = 512;
    pub const GAME_OVER: u32 = 1024;
    pub const MILESTONE: u32 = 2048;
    pub const RAMP: u32 = 4096;
    pub const STREAK: u32 = 8192;
    pub const POWER_UP_END: u32 = 16384;
    pub const LANE_BUMP: u32 = 32768;
    pub const CAUGHT: u32 = 65536;
}

#[derive(Clone, Copy, Debug)]
pub struct Entity {
    pub active: bool,
    pub kind: Kind,
    pub lane: u8,
    /// colour of a train; set on a coin the magnet is pulling in
    pub variant: u8,
    pub x: f32,
    pub y: f32,
    /// the near end (the end facing the runner)
    pub z: f64,
    pub length: f32,
    /// toward the runner, metres per second (moving trains)
    pub velocity: f32,
}
const NO_ENTITY: Entity = Entity { active: false, kind: Kind::Coin, lane: 0, variant: 0, x: 0.0, y: 0.0, z: 0.0, length: 0.0, velocity: 0.0 };

#[derive(Clone)]
pub struct World {
    pub phase: Phase,
    pub phase_seconds: f32,
    pub run_seconds: f32,
    pub seed: u32,
    pub random_state: u32,
    leftover_seconds: f32,
    pending_events: u32,
    // ---- the runner ----
    pub player_z: f64,
    /// the lane being run in (or switched to)
    pub lane: u8,
    pub previous_lane: u8,
    pub switch_from_x: f32,
    pub switch_seconds: f32,
    pub x: f32,
    pub lateral_velocity: f32,
    /// height of the feet above the rails
    pub y: f32,
    pub vertical_velocity: f32,
    pub grounded: bool,
    pub has_jumped: bool,
    pub airborne_seconds: f32,
    pub roll_seconds: f32,
    pub jump_buffer: f32,
    pub roll_buffer: f32,
    pub roll_on_landing: bool,
    pub surface: f32,
    pub run_cycle: f32,
    // ---- trouble ----
    pub stumble_window: f32,
    pub hit_grace: f32,
    pub ghost_seconds: f32,
    pub stumbles: u32,
    pub crash_reason: u8,
    pub chaser_gap: f32,
    // ---- power-ups ----
    pub magnet_seconds: f32,
    pub sneakers_seconds: f32,
    pub multiplier_seconds: f32,
    pub hoverboard_seconds: f32,
    pub last_power_up: u8,
    // ---- score ----
    pub distance_score: f64,
    pub coins: u32,
    pub coin_streak: u32,
    pub streak_seconds: f32,
    pub next_milestone: f64,
    // ---- the run generator ----
    pub next_row_z: f64,
    pub safe_lane: u8,
    /// the path may not switch into a lane until a train in it has passed
    pub blocked_until: [f64; LANE_COUNT],
    /// nothing new is put in a lane before this (a train, or the stretch a moving train will sweep)
    pub reserved_until: [f64; LANE_COUNT],
    /// the guaranteed path runs along a train roof until here
    pub roof_until: f64,
    pub next_power_up_z: f64,
    pub rows: u32,
    pub entities: [Entity; MAX_ENTITIES],
    // ---- test hooks ----
    pub debug_invincible: bool,
    pub debug_no_spawning: bool,
    pub autopilot: bool,
    pub autopilot_seconds: f32,
}

impl World {
    pub fn new(seed: u32) -> World {
        let mut world = World {
            phase: Phase::Ready, phase_seconds: 0.0, run_seconds: 0.0, seed, random_state: seed ^ 0x9E37_79B9, leftover_seconds: 0.0, pending_events: 0,
            player_z: 0.0, lane: 1, previous_lane: 1, switch_from_x: 0.0, switch_seconds: LANE_SWITCH_SECONDS, x: 0.0, lateral_velocity: 0.0,
            y: 0.0, vertical_velocity: 0.0, grounded: true, has_jumped: false, airborne_seconds: 0.0, roll_seconds: 0.0, jump_buffer: 0.0,
            roll_buffer: 0.0, roll_on_landing: false, surface: 0.0, run_cycle: 0.0,
            stumble_window: 0.0, hit_grace: 0.0, ghost_seconds: 0.0, stumbles: 0, crash_reason: 0, chaser_gap: CHASER_NEAR_GAP,
            magnet_seconds: 0.0, sneakers_seconds: 0.0, multiplier_seconds: 0.0, hoverboard_seconds: 0.0, last_power_up: 0,
            distance_score: 0.0, coins: 0, coin_streak: 0, streak_seconds: 0.0, next_milestone: MILESTONE_METRES,
            next_row_z: FIRST_ROW_Z, safe_lane: 1, blocked_until: [0.0; LANE_COUNT], reserved_until: [0.0; LANE_COUNT], roof_until: 0.0,
            next_power_up_z: 240.0, rows: 0, entities: [NO_ENTITY; MAX_ENTITIES],
            debug_invincible: false, debug_no_spawning: false, autopilot: false, autopilot_seconds: 0.0,
        };
        if world.random_state == 0 { world.random_state = 0x1234_5678; }
        world.generate();
        world
    }

    pub fn start(&mut self) {
        if self.phase != Phase::Ready { return; }
        self.phase = Phase::Playing;
        self.phase_seconds = 0.0;
        self.run_seconds = 0.0;
    }

    pub fn distance(&self) -> f32 { self.player_z as f32 }
    pub fn speed(&self) -> f32 { if self.phase == Phase::Playing { speed_at(self.player_z) } else { 0.0 } }
    pub fn multiplier(&self) -> u32 { if self.multiplier_seconds > 0.0 { 2 } else { 1 } }
    pub fn score(&self) -> u32 { self.distance_score as u32 + self.coins * COIN_SCORE }
    pub fn is_rolling(&self) -> bool { self.roll_seconds > 0.0 }
    pub fn height(&self) -> f32 { if self.is_rolling() { ROLL_HEIGHT } else { STAND_HEIGHT } }

    // ---------- input ----------
    pub fn press_lane(&mut self, direction: i32) {
        if self.phase != Phase::Playing { return; }
        let target = self.lane as i32 + direction.signum();
        if !(0..LANE_COUNT as i32).contains(&target) { self.pending_events |= events::LANE_BUMP; return; }
        self.set_target_lane(target as u8);
        self.pending_events |= events::LANE;
    }
    fn set_target_lane(&mut self, lane: u8) {
        self.previous_lane = self.lane;
        self.lane = lane;
        self.switch_from_x = self.x;
        self.switch_seconds = 0.0;
    }
    pub fn press_jump(&mut self) { if self.phase == Phase::Playing { self.jump_buffer = INPUT_BUFFER_SECONDS; } }
    pub fn press_roll(&mut self) { if self.phase == Phase::Playing { self.roll_buffer = INPUT_BUFFER_SECONDS; } }

    // ---------- time ----------
    /// Simulate `seconds` of play in fixed steps. A hitch over 100 ms is dropped (the game freezes instead of jumping
    /// ahead) and slow frames are capped at 50 ms. Returns the event bits.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let mut happened = core::mem::take(&mut self.pending_events);
        if !(seconds > 0.0) || seconds > 0.1 { return happened; }
        self.leftover_seconds += if seconds > 0.05 { 0.05 } else { seconds };
        while self.leftover_seconds >= STEP_SECONDS {
            self.leftover_seconds -= STEP_SECONDS;
            if self.autopilot && self.phase == Phase::Playing {
                self.autopilot_seconds -= STEP_SECONDS;
                if self.autopilot_seconds <= 0.0 {
                    self.autopilot_seconds = 0.05;
                    let action = self.choose_action();
                    self.apply_action(action);
                }
            }
            happened |= self.step();
        }
        happened | core::mem::take(&mut self.pending_events)
    }

    /// One fixed step.
    pub fn step(&mut self) -> u32 {
        let dt = STEP_SECONDS;
        let mut happened = 0;
        self.phase_seconds += dt;
        match self.phase {
            Phase::Ready => { self.run_cycle = (self.run_cycle + dt * 0.8).fract(); return 0; }
            Phase::Crashed => {
                self.chaser_gap += (0.9 - self.chaser_gap) * limit(dt * 3.0, 0.0, 1.0);
                if self.phase_seconds >= CRASH_SECONDS { self.phase = Phase::GameOver; self.phase_seconds = 0.0; happened |= events::GAME_OVER; }
                if !self.grounded {
                    self.vertical_velocity -= GRAVITY * dt;
                    self.y += self.vertical_velocity * dt;
                    if self.y <= self.surface { self.y = self.surface; self.grounded = true; self.vertical_velocity = 0.0; }
                }
                return happened;
            }
            Phase::GameOver => return 0,
            Phase::Playing => {}
        }
        self.run_seconds += dt;
        let speed = speed_at(self.player_z);

        // timers
        let count_down = |value: &mut f32| { if *value > 0.0 { *value -= dt; if *value <= 0.0 { *value = 0.0; return true; } } false };
        count_down(&mut self.stumble_window);
        count_down(&mut self.hit_grace);
        count_down(&mut self.jump_buffer);
        count_down(&mut self.roll_buffer);
        if count_down(&mut self.streak_seconds) { self.coin_streak = 0; }
        let mut power_up_ended = count_down(&mut self.magnet_seconds);
        power_up_ended |= count_down(&mut self.sneakers_seconds);
        power_up_ended |= count_down(&mut self.multiplier_seconds);
        power_up_ended |= count_down(&mut self.hoverboard_seconds);
        if power_up_ended { happened |= events::POWER_UP_END; }

        // the chaser shows up at the start and right after a stumble, then drops back out of sight
        let chaser_target = if self.run_seconds < CHASER_INTRO_SECONDS || self.stumble_window > 0.0 { CHASER_NEAR_GAP } else { CHASER_FAR_GAP };
        self.chaser_gap += (chaser_target - self.chaser_gap) * limit(dt * if chaser_target < self.chaser_gap { 6.0 } else { 1.2 }, 0.0, 1.0);

        // sideways: an eased snap to the target lane
        let previous_x = self.x;
        if self.switch_seconds < LANE_SWITCH_SECONDS {
            self.switch_seconds += dt;
            let target_x = lane_x(self.lane as usize);
            // a retarget from mid-switch takes the same time, so double swipes feel just as quick
            let t = limit(self.switch_seconds / LANE_SWITCH_SECONDS, 0.0, 1.0);
            self.x = self.switch_from_x + (target_x - self.switch_from_x) * smooth(t);
        } else {
            self.x = lane_x(self.lane as usize);
        }
        self.lateral_velocity = (self.x - previous_x) / dt;

        if self.roll_seconds > 0.0 { self.roll_seconds = (self.roll_seconds - dt).max(0.0); }

        // jump (buffered, with coyote time after running off an edge)
        if self.jump_buffer > 0.0 && !self.has_jumped && (self.grounded || self.airborne_seconds < COYOTE_SECONDS) {
            let is_super = self.sneakers_seconds > 0.0;
            self.vertical_velocity = if is_super { SUPER_JUMP_VELOCITY } else { JUMP_VELOCITY };
            self.grounded = false;
            self.has_jumped = true;
            self.airborne_seconds = COYOTE_SECONDS;
            self.roll_seconds = 0.0;
            self.roll_on_landing = false;
            self.jump_buffer = 0.0;
            happened |= if is_super { events::SUPER_JUMP } else { events::JUMP };
        }
        // roll (in the air: slam down, then roll on landing)
        if self.roll_buffer > 0.0 {
            if self.grounded {
                self.roll_seconds = ROLL_SECONDS;
                self.roll_buffer = 0.0;
                happened |= events::ROLL;
            } else if !self.roll_on_landing {
                if self.vertical_velocity > -FAST_DROP_VELOCITY { self.vertical_velocity = -FAST_DROP_VELOCITY; }
                self.roll_on_landing = true;
                self.roll_buffer = 0.0;
            }
        }

        // forward
        let step_distance = speed * dt;
        self.player_z += step_distance as f64;
        self.distance_score += (step_distance * self.multiplier() as f32) as f64;
        for entity in self.entities.iter_mut() {
            if entity.active && entity.velocity != 0.0 { entity.z -= (entity.velocity * dt) as f64; }
        }

        // up and down: follow the ground (rails, ramps, roofs); fall when it drops away
        let was_on_ground_level = self.surface < 0.05;
        let surface = self.surface_at(self.x, self.player_z, self.y);
        self.surface = surface;
        if self.grounded {
            if surface < self.y - 0.01 {
                self.grounded = false;
                self.airborne_seconds = 0.0;
                self.vertical_velocity = 0.0;
            } else {
                self.y = surface;
                self.airborne_seconds = 0.0;
                if was_on_ground_level && surface > 0.05 { happened |= events::RAMP; }
            }
        }
        if !self.grounded {
            self.airborne_seconds += dt;
            self.vertical_velocity -= GRAVITY * dt;
            self.y += self.vertical_velocity * dt;
            if self.y <= surface && self.vertical_velocity <= 0.0 {
                self.y = surface;
                self.vertical_velocity = 0.0;
                self.grounded = true;
                self.has_jumped = false;
                happened |= events::LAND;
                if self.roll_on_landing || self.roll_buffer > 0.0 {
                    self.roll_on_landing = false;
                    self.roll_buffer = 0.0;
                    self.roll_seconds = ROLL_SECONDS;
                    happened |= events::ROLL;
                }
            }
        }
        if self.grounded {
            self.has_jumped = false;
            self.run_cycle = (self.run_cycle + step_distance / 2.4).fract();
        }

        happened |= self.collide(speed);
        if self.phase != Phase::Playing { return happened; }
        happened |= self.collect();
        if self.player_z >= self.next_milestone { self.next_milestone += MILESTONE_METRES; happened |= events::MILESTONE; }
        self.despawn();
        self.generate();
        happened
    }

    /// Height of whatever you would be standing on at (x, z): rails (0), a ramp or a train roof, if it is no higher
    /// than a step above your feet.
    pub fn surface_at(&self, x: f32, z: f64, feet: f32) -> f32 {
        let mut best = 0.0;
        for entity in self.entities.iter() {
            if !entity.active || !entity.kind.is_walkable() { continue; }
            // any part of your footprint over it counts (so landing on a roof's front edge lands you on the roof)
            if (x - entity.x).abs() >= TRAIN_HALF_WIDTH || z + PLAYER_HALF_DEPTH < entity.z || z - PLAYER_HALF_DEPTH > entity.z + entity.length as f64 { continue; }
            let height = if entity.kind == Kind::Ramp { TRAIN_HEIGHT * limit((z - entity.z) as f32 / entity.length, 0.0, 1.0) } else { TRAIN_HEIGHT };
            if height <= feet + STEP_UP && height > best { best = height; }
        }
        best
    }

    /// The first obstacle you are overlapping: (index, head-on?, sideways offset from its middle).
    fn first_blocking(&self, speed: f32) -> Option<(usize, bool, f32)> {
        let bottom = self.y;
        let top = self.y + self.height();
        for (index, entity) in self.entities.iter().enumerate() {
            if !entity.active || !entity.kind.is_obstacle() { continue; }
            let offset = self.x - entity.x;
            if offset.abs() >= PLAYER_HALF_WIDTH + TRAIN_HALF_WIDTH { continue; }
            let depth = if entity.kind.is_walkable() { entity.length } else { BARRIER_DEPTH };
            let front = entity.z;
            if self.player_z + PLAYER_HALF_DEPTH <= front || self.player_z - PLAYER_HALF_DEPTH >= front + depth as f64 { continue; }
            let blocks = match entity.kind {
                Kind::Train | Kind::MovingTrain => bottom < TRAIN_HEIGHT - STEP_UP,
                Kind::Ramp => bottom < TRAIN_HEIGHT * limit((self.player_z - entity.z) as f32 / entity.length, 0.0, 1.0) - STEP_UP,
                Kind::LowBarrier => bottom < LOW_BARRIER_HIT_HEIGHT,
                Kind::HighBarrier => top > HIGH_BARRIER_BOTTOM + 0.1 && bottom < HIGH_BARRIER_TOP,
                _ => top > SIGN_BOTTOM + 0.1 && bottom < SIGN_TOP,
            };
            if !blocks { continue; }
            let penetration = (self.player_z + PLAYER_HALF_DEPTH - front) as f32;
            let head_on = entity.kind != Kind::Ramp && penetration <= (speed + entity.velocity) * STEP_SECONDS * 2.0 + 0.05
                && offset.abs() < HEAD_ON_HALF_WIDTH;
            return Some((index, head_on, offset));
        }
        None
    }

    fn collide(&mut self, speed: f32) -> u32 {
        if self.debug_invincible { return 0; }
        if self.ghost_seconds > 0.0 {
            self.ghost_seconds -= STEP_SECONDS;
            // the hoverboard's safe time lasts until you are clear of whatever you went through
            if self.ghost_seconds <= 0.0 { self.ghost_seconds = if self.first_blocking(speed).is_some() { STEP_SECONDS } else { 0.0 }; }
            return 0;
        }
        let Some((index, head_on, offset)) = self.first_blocking(speed) else { return 0 };
        if head_on {
            if self.hoverboard_seconds > 0.0 {
                self.hoverboard_seconds = 0.0;
                self.ghost_seconds = SHIELD_GHOST_SECONDS;
                return events::HOVERBOARD_BREAK;
            }
            self.end_run(CRASH_HEAD_ON);
            return events::CRASH;
        }
        // a side or edge hit: stumble and bounce back the way you came
        let obstacle = self.entities[index];
        let moving = lane_x(self.lane as usize) - self.x;
        let direction = if moving > 0.01 { 1 } else if moving < -0.01 { -1 } else { 0 };
        let mut bounce: Option<u8> = None;
        if direction != 0 && (obstacle.x - self.x) * direction as f32 > 0.0 {
            // it is on the side you were moving toward: back to the lane on your side of it
            let back = obstacle.lane as i32 - direction;
            if (0..LANE_COUNT as i32).contains(&back) { bounce = Some(back as u8); }
        } else if direction == 0 && obstacle.lane == self.lane {
            // you came down on it: step off sideways if there is room
            let first = if offset >= 0.0 { 1 } else { -1 };
            for side in [first, -first] {
                let lane = self.lane as i32 + side;
                if (0..LANE_COUNT as i32).contains(&lane) && self.is_lane_clear_beside(lane as usize) { bounce = Some(lane as u8); break; }
            }
            // nowhere to go and it is a train: that is a crash
            if bounce.is_none() && obstacle.kind.is_walkable() {
                if self.hoverboard_seconds > 0.0 { self.hoverboard_seconds = 0.0; self.ghost_seconds = SHIELD_GHOST_SECONDS; return events::HOVERBOARD_BREAK; }
                self.end_run(CRASH_HEAD_ON);
                return events::CRASH;
            }
        }
        if self.hit_grace > 0.0 {
            // still being bounced clear of the last hit: no new stumble, but you can't slip into a train either
            if let Some(lane) = bounce { if lane != self.lane { self.set_target_lane(lane); } }
            return 0;
        }
        if self.stumble_window > 0.0 {
            self.end_run(CRASH_CAUGHT);
            return events::STUMBLE | events::CAUGHT;
        }
        self.stumbles += 1;
        self.stumble_window = STUMBLE_WINDOW_SECONDS;
        self.hit_grace = HIT_GRACE_SECONDS;
        if let Some(lane) = bounce { if lane != self.lane { self.set_target_lane(lane); } }
        events::STUMBLE
    }

    fn is_lane_clear_beside(&self, lane: usize) -> bool {
        let x = lane_x(lane);
        !self.entities.iter().any(|entity| entity.active && entity.kind.is_obstacle() && (entity.x - x).abs() < 0.1
            && self.player_z + 2.0 > entity.z && self.player_z - 2.0 < entity.z + entity.length.max(BARRIER_DEPTH) as f64)
    }

    fn end_run(&mut self, reason: u8) {
        self.phase = Phase::Crashed;
        self.phase_seconds = 0.0;
        self.crash_reason = reason;
        self.roll_seconds = 0.0;
        if self.vertical_velocity > 0.0 { self.vertical_velocity = 0.0; }
        self.surface = self.surface_at(self.x, self.player_z, self.y);
    }

    fn collect(&mut self) -> u32 {
        let mut happened = 0;
        let dt = STEP_SECONDS;
        let (x, z, feet, top) = (self.x, self.player_z, self.y, self.y + self.height());
        let middle = feet + self.height() * 0.5;
        let magnet = self.magnet_seconds > 0.0;
        for index in 0..MAX_ENTITIES {
            let entity = &mut self.entities[index];
            if !entity.active || entity.kind.is_obstacle() { continue; }
            let ahead = entity.z - z;
            let mut taken = false;
            if entity.kind == Kind::Coin && (entity.variant == 1 || (magnet && ahead > -2.0 && ahead < MAGNET_RANGE && (entity.x - x).abs() < 6.0)) {
                // the magnet pulls the coin in
                entity.variant = 1;
                let pull = limit(dt * 9.0, 0.0, 1.0);
                let (relative_x, relative_y, relative_z) = (entity.x - x, entity.y - middle, ahead as f32);
                let distance = (relative_x * relative_x + relative_y * relative_y + relative_z * relative_z).sqrt();
                let shrink = if distance > 0.001 { limit(1.0 - pull - 30.0 * dt / distance, 0.0, 1.0) } else { 0.0 };
                entity.x = x + relative_x * shrink;
                entity.y = middle + relative_y * shrink;
                entity.z = z + (relative_z * shrink) as f64;
                taken = distance * shrink < 0.7;
            } else if ahead.abs() < 0.9 && (entity.x - x).abs() < 0.95 {
                let reach = if entity.kind == Kind::Coin { 0.45 } else { 0.7 };
                taken = entity.y > feet - reach && entity.y < top + reach;
            }
            if !taken { continue; }
            entity.active = false;
            let kind = entity.kind;
            if kind == Kind::Coin {
                self.coins += 1;
                self.coin_streak += 1;
                self.streak_seconds = COIN_STREAK_SECONDS;
                happened |= events::COIN;
                if self.coin_streak % 10 == 0 { happened |= events::STREAK; }
            } else {
                self.activate(kind);
                happened |= events::POWER_UP;
            }
        }
        happened
    }

    pub fn activate(&mut self, kind: Kind) {
        match kind {
            Kind::Magnet => self.magnet_seconds = MAGNET_SECONDS,
            Kind::Sneakers => self.sneakers_seconds = SNEAKERS_SECONDS,
            Kind::Multiplier => self.multiplier_seconds = MULTIPLIER_SECONDS,
            Kind::Hoverboard => self.hoverboard_seconds = HOVERBOARD_SECONDS,
            _ => return,
        }
        self.last_power_up = kind as u8;
    }

    fn despawn(&mut self) {
        let behind = self.player_z - DESPAWN_BEHIND;
        for entity in self.entities.iter_mut() {
            if entity.active && entity.z + (entity.length as f64) < behind { entity.active = false; }
        }
    }

    // ---------- the run generator ----------
    fn random(&mut self) -> f32 {
        let mut state = self.random_state;
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        self.random_state = state;
        (state >> 8) as f32 / 16_777_216.0
    }
    fn random_below(&mut self, count: u32) -> u32 { ((self.random() * count as f32) as u32).min(count.saturating_sub(1)) }

    pub fn spawn(&mut self, kind: Kind, lane: usize, z: f64, y: f32, length: f32, velocity: f32, variant: u8) -> bool {
        let Some(slot) = self.entities.iter_mut().find(|entity| !entity.active) else { return false };
        *slot = Entity { active: true, kind, lane: lane as u8, variant, x: lane_x(lane), y, z, length, velocity };
        true
    }

    fn coin_line(&mut self, lane: usize, from: f64, until: f64, spacing: f64, y: f32) {
        let mut z = from;
        while z <= until {
            if !self.spawn(Kind::Coin, lane, z, y, 0.0, 0.0, 0) { return; }
            z += spacing;
        }
    }

    /// Place rows of obstacles and coins until SPAWN_AHEAD metres ahead of the runner.
    pub fn generate(&mut self) {
        if self.debug_no_spawning { return; }
        while self.next_row_z < self.player_z + SPAWN_AHEAD { self.plan_row(); }
    }

    /// One row. A guaranteed path (`safe_lane`) runs through every row: it moves at most one lane per row, only into a
    /// lane whose trains have passed, and only ever meets things you can get past (nothing, a low barrier to jump, a high
    /// barrier or sign to roll under, or a ramp up onto a parked train). The other lanes get trains and barriers.
    fn plan_row(&mut self) {
        let z = self.next_row_z;
        let difficulty = limit(((z - FIRST_ROW_Z) / 4500.0) as f32, 0.0, 1.0);
        let speed = speed_at(z);
        let gap = (speed * (1.15 - 0.37 * difficulty + self.random() * 0.4)) as f64;
        let next = z + gap;
        let calm = self.rows < 2;
        let old_lane = self.safe_lane as usize;
        let switch_room = (speed * 0.4) as f64;

        // 1. where the guaranteed path goes
        if z >= self.roof_until && self.random() > 0.45 {
            let mut options = [old_lane; 2];
            let mut count = 0;
            for lane in [old_lane.wrapping_sub(1), old_lane + 1] {
                if lane < LANE_COUNT && self.blocked_until[lane] <= z - switch_room { options[count] = lane; count += 1; }
            }
            if count > 0 { self.safe_lane = options[self.random_below(count as u32) as usize] as u8; }
        }
        let lane = self.safe_lane as usize;

        // 2. what the path meets at this row
        if z >= self.roof_until && self.reserved_until[lane] <= z {
            let pick = if calm { 1.0 } else { self.random() };
            if pick < 0.22 {
                let cars = 1 + self.random_below(if difficulty > 0.3 { 3 } else { 2 });
                let length = cars as f32 * CAR_LENGTH;
                let variant = self.random_below(4) as u8;
                self.spawn(Kind::Ramp, lane, z, 0.0, RAMP_LENGTH, 0.0, 0);
                let train_z = z + RAMP_LENGTH as f64;
                self.spawn(Kind::Train, lane, train_z, 0.0, length, 0.0, variant);
                let end = train_z + length as f64;
                self.coin_line(lane, train_z + 2.0, end - 1.5, 2.6, TRAIN_HEIGHT + 0.7);
                self.roof_until = end + (speed * 0.9) as f64;
                self.blocked_until[lane] = end;
                self.reserved_until[lane] = self.roof_until;
            } else if pick < 0.42 {
                self.spawn(Kind::LowBarrier, lane, z, 0.0, 0.0, 0.0, 0);
                // coins along the jump arc, peaking over the barrier
                let take_off = z - (speed * 0.285) as f64;
                for step in 0..6 {
                    let t = 0.08 + step as f32 * 0.082;
                    self.spawn(Kind::Coin, lane, take_off + (speed * t) as f64, JUMP_VELOCITY * t - 0.5 * GRAVITY * t * t + 0.6, 0.0, 0.0, 0);
                }
                self.blocked_until[lane] = z + 1.0;
                self.reserved_until[lane] = z + 1.0;
            } else if pick < 0.6 {
                let kind = if self.random() < 0.55 { Kind::HighBarrier } else { Kind::Sign };
                let variant = self.random_below(4) as u8;
                self.spawn(kind, lane, z, 0.0, 0.0, 0.0, variant);
                self.coin_line(lane, z - 3.0, z + 3.0, 2.0, 0.45);
                self.blocked_until[lane] = z + 1.0;
                self.reserved_until[lane] = z + 1.0;
            } else {
                // open track: a line of coins, sometimes with a power-up in it
                let until = (z + 4.0 + self.random_below(6) as f64 * 2.4).min(next - 3.0);
                if z >= self.next_power_up_z && !calm {
                    let kind = match self.random_below(7) { 0 | 1 => Kind::Magnet, 2 | 3 => Kind::Multiplier, 4 | 5 => Kind::Sneakers, _ => Kind::Hoverboard };
                    self.spawn(kind, lane, z, 1.0, 0.0, 0.0, 0);
                    self.coin_line(lane, z + 3.0, until, 2.4, 0.7);
                    self.next_power_up_z = z + 300.0 + self.random() as f64 * 250.0;
                } else {
                    self.coin_line(lane, z, until, 2.4, 0.7);
                }
            }
        }

        // 3. the other lanes
        for other in 0..LANE_COUNT {
            if other == lane || self.reserved_until[other] > z - 0.5 { continue; }
            if calm || self.random() > 0.32 + 0.45 * difficulty {
                if self.random() < 0.25 { self.coin_line(other, z, (z + 7.2).min(next - 3.0), 2.4, 0.7); }
                continue;
            }
            let pick = self.random();
            if pick < 0.42 {
                let cars = 1 + self.random_below(3);
                let length = cars as f32 * CAR_LENGTH;
                let variant = self.random_below(4) as u8;
                let mut train_z = z;
                if self.random() < 0.35 {
                    self.spawn(Kind::Ramp, other, z, 0.0, RAMP_LENGTH, 0.0, 0);
                    train_z += RAMP_LENGTH as f64;
                    if self.random() < 0.6 { self.coin_line(other, train_z + 2.0, train_z + length as f64 - 1.5, 2.6, TRAIN_HEIGHT + 0.7); }
                }
                self.spawn(Kind::Train, other, train_z, 0.0, length, 0.0, variant);
                let end = train_z + length as f64;
                self.blocked_until[other] = end;
                self.reserved_until[other] = end + 3.0;
            } else if pick < 0.62 && difficulty > 0.08 && other != old_lane {
                // a train rolling toward you, timed to pass the runner at this row
                let length = (1 + self.random_below(2)) as f32 * CAR_LENGTH;
                let velocity = 6.0 + 6.0 * difficulty;
                let travel_seconds = (z - self.player_z) / ((speed_at(self.player_z) + speed) * 0.5) as f64;
                let front = z + velocity as f64 * travel_seconds.max(0.0);
                self.spawn(Kind::MovingTrain, other, front, 0.0, length, velocity, 4);
                self.blocked_until[other] = z + (length * speed / (speed + velocity)) as f64 + switch_room;
                self.reserved_until[other] = front + length as f64 + 3.0;
            } else {
                let kind = if pick < 0.76 { Kind::LowBarrier } else if pick < 0.88 { Kind::HighBarrier } else { Kind::Sign };
                let variant = self.random_below(4) as u8;
                self.spawn(kind, other, z, 0.0, 0.0, 0.0, variant);
                self.blocked_until[other] = z + 1.0;
                self.reserved_until[other] = z + 1.0;
            }
        }
        self.next_row_z = next;
        self.rows += 1;
    }

    // ---------- test hooks ----------
    pub fn clear_entities(&mut self) {
        for entity in self.entities.iter_mut() { entity.active = false; }
    }
    /// Stop generating (for tests that build their own track); clears what is ahead.
    pub fn clear_track(&mut self) {
        self.clear_entities();
        self.debug_no_spawning = true;
    }
    pub fn resume_spawning(&mut self) {
        self.debug_no_spawning = false;
        let from = self.player_z + 30.0;
        self.next_row_z = from;
        self.roof_until = 0.0;
        self.blocked_until = [0.0; LANE_COUNT];
        self.reserved_until = [from; LANE_COUNT];
        self.generate();
    }
}
