//! The Alpine Sled simulation: a wooden sled gliding down an endless curving, rolling snowy trail. The sled speeds up
//! as the run gets longer; the player steers left and right between the banked snow edges and jumps. Ramps launch the
//! sled into a long arc over the obstacles below, with golden stars hanging in the air. Pine trees, boulders,
//! snowmen and fallen logs end the run unless a Shield absorbs the hit. Fixed 1/120 s steps; every pool is a fixed
//! array (no allocation while playing).
use crate::track::{Track, TRAIL_HALF_WIDTH};

pub const STEP_SECONDS: f32 = 1.0 / 120.0;
/// Frames longer than this are a hitch (a background tab, a GC pause) and are dropped instead of simulated.
const HITCH_SECONDS: f32 = 0.1;
/// Slow frames are simulated at most this long, so a struggling phone slows down instead of skipping through trees.
const MAX_FRAME_SECONDS: f32 = 0.05;

// ---------- the sled ----------
pub const START_SPEED: f32 = 13.0;
pub const MAX_SPEED: f32 = 32.0;
/// Distance (metres) at which the sled is half way from its start speed to its top speed.
pub const HALF_SPEED_DISTANCE: f32 = 2200.0;
pub const STEER_SPEED: f32 = 8.5;
/// How quickly the sideways speed follows the steering (per second); halved in the air.
const STEER_RESPONSE: f32 = 9.0;
/// How strongly a bend pushes the sled toward its outside edge.
const BEND_PUSH: f32 = 0.3;
/// The sled's centre can go this far from the centre line before the banked edge stops it.
pub const SIDE_LIMIT: f32 = TRAIL_HALF_WIDTH - 0.7;
pub const GRAVITY: f32 = 20.0;
pub const JUMP_SPEED: f32 = 7.0;
pub const RAMP_LAUNCH_SPEED: f32 = 10.5;
/// A jump pressed this long before landing still happens on landing.
const JUMP_BUFFER_SECONDS: f32 = 0.15;
pub const PLAYER_HALF_WIDTH: f32 = 0.55;
pub const PLAYER_HALF_DEPTH: f32 = 0.7;
pub const CRASH_SECONDS: f32 = 1.3;
pub const SHIELD_GRACE_SECONDS: f32 = 1.0;
pub const MILESTONE_METRES: f32 = 500.0;

// ---------- the camera (behind and above the sled) ----------
pub const CAMERA_BACK: f32 = 6.0;
pub const CAMERA_HEIGHT: f32 = 2.5;
pub const CRASH_PULLBACK: f32 = 5.0;
/// The camera swings this share of the sled's sideways offset from the trail centre (the rest shows as the sled moving
/// across the screen, which is what makes steering feel alive).
pub const LATERAL_FOLLOW: f32 = 0.75;
/// How quickly (per second) the camera eases toward that position.
pub const LATERAL_FOLLOW_RATE: f32 = 9.0;
/// The sled's centre is held within this share of half the screen on wide layouts.
pub const SLED_SCREEN_COMFORT: f32 = 0.55;
/// How far the drawn sled reaches sideways from its centre (metres): runners, rider, scarf and the shield bubble.
pub const SLED_DRAWN_HALF_WIDTH: f32 = 1.05;
/// The sled's drawn edges are held within this share of half the screen. On an upright phone the sled is big on
/// screen, so this (not the comfort share above) is what holds it, and it sits a little closer to the middle there.
pub const SLED_EDGE_KEEP: f32 = 0.88;
/// Half the screen width ÷ the focal length for the narrowest layout (an upright phone); the page reports the real one.
pub const NARROWEST_VIEW_HALF_WIDTH: f32 = 1.0 / 3.0;

// ---------- the trail ahead ----------
pub const RAMP_LENGTH: f32 = 4.5;
pub const RAMP_HALF_WIDTH: f32 = 1.6;
pub const RAMP_HEIGHT: f32 = 1.1;
pub const LANE_COUNT: usize = 5;
pub const LANE_WIDTH: f32 = 2.6;
pub const ROW_LENGTH: f32 = 14.0;
pub const FIRST_ROW_Z: f32 = 60.0;
pub const SEGMENT_LENGTH: f32 = 4.0;
pub const DRAW_SEGMENTS: usize = 100;
pub const VIEW_DISTANCE: f32 = SEGMENT_LENGTH * DRAW_SEGMENTS as f32;
pub const MAX_ENTITIES: usize = 128;
/// Stars hang this high above the snow after a ramp (the arc passes through them at any speed).
pub const AIR_STAR_ALTITUDE: f32 = 3.0;
/// How close in height the sled must be to a collectible to pick it up.
pub const PICKUP_REACH: f32 = 1.4;

pub const GIFT_POINTS: u32 = 25;
pub const STAR_POINTS: u32 = 50;
pub const SPARE_SHIELD_POINTS: u32 = 100;

/// Event bits returned by `advance`. Mirrored in src/games/alpinesled/engine.ts.
pub mod events {
    pub const JUMP: u32 = 1;
    pub const LAND: u32 = 2;
    pub const RAMP: u32 = 4;
    pub const GIFT: u32 = 8;
    pub const STAR: u32 = 16;
    pub const SHIELD: u32 = 32;
    pub const SHIELD_BREAK: u32 = 64;
    pub const CRASH: u32 = 128;
    pub const GAME_OVER: u32 = 256;
    pub const MILESTONE: u32 = 512;
    pub const BANK_SCRAPE: u32 = 1024;
}

/// Held-button bits for `input`.
pub mod buttons {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Ready = 0, Playing = 1, Crashing = 2, GameOver = 3 }

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Motion { Sliding = 0, OnRamp = 1, Airborne = 2 }

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntityKind { Pine = 0, Boulder = 1, Snowman = 2, Log = 3, Ramp = 4, Gift = 5, Star = 6, Shield = 7 }
pub const ENTITY_KIND_COUNT: u8 = 8;

impl EntityKind {
    pub fn from_index(index: u32) -> Option<EntityKind> {
        Some(match index {
            0 => EntityKind::Pine, 1 => EntityKind::Boulder, 2 => EntityKind::Snowman, 3 => EntityKind::Log,
            4 => EntityKind::Ramp, 5 => EntityKind::Gift, 6 => EntityKind::Star, 7 => EntityKind::Shield,
            _ => return None,
        })
    }
    pub fn is_obstacle(self) -> bool { (self as u8) <= EntityKind::Log as u8 }
    pub fn is_collectible(self) -> bool { (self as u8) >= EntityKind::Gift as u8 }
}

/// Footprint of each kind: half width (sideways), half depth (along the trail) and height, in metres.
pub struct KindSize { pub half_width: f32, pub half_depth: f32, pub height: f32 }

pub fn kind_size(kind: EntityKind) -> KindSize {
    match kind {
        EntityKind::Pine => KindSize { half_width: 0.8, half_depth: 0.8, height: 3.2 },
        EntityKind::Boulder => KindSize { half_width: 1.0, half_depth: 0.9, height: 1.0 },
        EntityKind::Snowman => KindSize { half_width: 0.7, half_depth: 0.7, height: 1.7 },
        EntityKind::Log => KindSize { half_width: 1.5, half_depth: 0.4, height: 0.6 },
        EntityKind::Ramp => KindSize { half_width: RAMP_HALF_WIDTH, half_depth: RAMP_LENGTH / 2.0, height: RAMP_HEIGHT },
        EntityKind::Gift => KindSize { half_width: 0.7, half_depth: 0.7, height: 0.8 },
        EntityKind::Star => KindSize { half_width: 0.8, half_depth: 0.8, height: 0.8 },
        EntityKind::Shield => KindSize { half_width: 0.8, half_depth: 0.8, height: 1.0 },
    }
}

/// Something on the trail. `z` is its distance down the hill (a ramp's z is where it starts), `x` its sideways
/// offset from the centre line, `altitude` how high above the snow it hangs (stars in the air).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Entity { pub active: bool, pub kind: EntityKind, pub z: f64, pub x: f32, pub altitude: f32 }

impl Entity {
    const EMPTY: Entity = Entity { active: false, kind: EntityKind::Pine, z: 0.0, x: 0.0, altitude: 0.0 };
}

pub fn lane_x(lane: usize) -> f32 { (lane as f32 - (LANE_COUNT as f32 - 1.0) / 2.0) * LANE_WIDTH }
const ALL_LANES: u8 = (1 << LANE_COUNT) - 1;

pub fn limit(value: f32, low: f32, high: f32) -> f32 { if value < low { low } else if value > high { high } else { value } }

/// The speed the sled settles at after `distance` metres: smoothly from START_SPEED toward MAX_SPEED.
pub fn cruise_speed(distance: f32) -> f32 {
    let distance = distance.max(0.0);
    START_SPEED + (MAX_SPEED - START_SPEED) * distance / (distance + HALF_SPEED_DISTANCE)
}

#[derive(Clone)]
pub struct World {
    pub track: Track,
    pub random_state: u32,
    pub phase: Phase,
    pub phase_seconds: f32,
    /// Distance down the hill (metres); the run starts at 0.
    pub player_z: f64,
    /// Sideways offset of the sled from the centre line.
    pub player_x: f32,
    pub sideways_speed: f32,
    /// Height of the runners above the snow.
    pub altitude: f32,
    pub vertical_speed: f32,
    pub motion: Motion,
    /// Where the ramp being ridden ends (launch point).
    pub ramp_top_z: f64,
    pub speed: f32,
    pub bonus_points: u32,
    pub gifts: u32,
    pub stars: u32,
    pub has_shield: bool,
    pub grace_seconds: f32,
    pub airborne_seconds: f32,
    pub next_milestone: f32,
    pub scored_distance: f32,
    // trail generation
    pub next_row: u32,
    pub previous_free_lanes: u8,
    pub rows_since_shield: u32,
    pub rows_since_ramp: u32,
    pub calm_rows: u32,
    pub entities: [Entity; MAX_ENTITIES],
    // input
    pub input: u32,
    pub steer_axis: f32,
    pub jump_buffer: f32,
    // camera smoothing
    pub camera_offset: f32,
    pub camera_lift: f32,
    /// After a wipeout the camera eases back and up so the sled and what it hit are both in view.
    pub camera_pullback: f32,
    /// Half the screen width ÷ the focal length of the page's current layout (not saved: it belongs to the screen).
    pub view_half_width: f32,
    pub accumulated_seconds: f32,
    pub debug_invincible: bool,
}

impl World {
    pub fn new(seed: u32) -> World {
        let mut world = World {
            track: Track::new(seed),
            random_state: seed.wrapping_mul(2_654_435_761) | 1,
            phase: Phase::Ready,
            phase_seconds: 0.0,
            player_z: 0.0,
            player_x: 0.0,
            sideways_speed: 0.0,
            altitude: 0.0,
            vertical_speed: 0.0,
            motion: Motion::Sliding,
            ramp_top_z: 0.0,
            speed: START_SPEED,
            bonus_points: 0,
            gifts: 0,
            stars: 0,
            has_shield: false,
            grace_seconds: 0.0,
            airborne_seconds: 0.0,
            next_milestone: MILESTONE_METRES,
            scored_distance: 0.0,
            next_row: 0,
            previous_free_lanes: ALL_LANES,
            rows_since_shield: 0,
            rows_since_ramp: 0,
            calm_rows: 0,
            entities: [Entity::EMPTY; MAX_ENTITIES],
            input: 0,
            steer_axis: 0.0,
            jump_buffer: 0.0,
            camera_offset: 0.0,
            camera_lift: 0.0,
            camera_pullback: 0.0,
            view_half_width: NARROWEST_VIEW_HALF_WIDTH,
            accumulated_seconds: 0.0,
            debug_invincible: false,
        };
        world.spawn_ahead();
        world
    }

    /// Metres travelled for the score (frozen at a crash while the sled tumbles on).
    pub fn distance(&self) -> f32 { self.scored_distance }
    pub fn score(&self) -> u32 { self.distance() as u32 + self.bonus_points }
    pub fn collectibles(&self) -> u32 { self.gifts + self.stars }
    pub fn camera_z(&self) -> f64 { self.player_z - (CAMERA_BACK + self.camera_pullback) as f64 }

    pub fn start(&mut self) {
        if self.phase == Phase::Ready { self.phase = Phase::Playing; self.phase_seconds = 0.0; }
    }

    /// Queue a jump (it happens as soon as the sled is on the snow, within a short buffer).
    pub fn press_jump(&mut self) { if self.phase == Phase::Playing { self.jump_buffer = JUMP_BUFFER_SECONDS; } }

    pub fn random(&mut self) -> f32 {
        let mut value = self.random_state;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.random_state = value;
        (value >> 8) as f32 / 16_777_216.0
    }
    fn random_below(&mut self, count: usize) -> usize { ((self.random() * count as f32) as usize).min(count - 1) }

    /// Simulate `seconds` in fixed steps. Returns a bitmask of `events`.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        if !(seconds > 0.0) || seconds > HITCH_SECONDS { return 0; }
        self.accumulated_seconds += seconds.min(MAX_FRAME_SECONDS);
        let mut happened = 0;
        while self.accumulated_seconds >= STEP_SECONDS {
            self.accumulated_seconds -= STEP_SECONDS;
            happened |= self.step(STEP_SECONDS);
        }
        happened
    }

    pub fn step(&mut self, seconds: f32) -> u32 {
        self.phase_seconds += seconds;
        let happened = match self.phase {
            Phase::Ready | Phase::GameOver => 0,
            Phase::Playing => self.step_playing(seconds),
            Phase::Crashing => self.step_crashing(seconds),
        };
        self.step_camera(seconds);
        happened
    }

    fn step_crashing(&mut self, seconds: f32) -> u32 {
        // the sled tumbles to a stop in the snow
        self.speed *= (-3.5 * seconds).exp();
        self.player_z += (self.speed * seconds) as f64;
        self.sideways_speed *= (-4.0 * seconds).exp();
        self.player_x = limit(self.player_x + self.sideways_speed * seconds, -SIDE_LIMIT, SIDE_LIMIT);
        if self.motion == Motion::Airborne || self.altitude > 0.0 {
            self.vertical_speed -= GRAVITY * seconds;
            self.altitude = (self.altitude + self.vertical_speed * seconds).max(0.0);
        }
        if self.phase_seconds >= CRASH_SECONDS {
            self.phase = Phase::GameOver;
            self.phase_seconds = 0.0;
            return events::GAME_OVER;
        }
        0
    }

    fn step_playing(&mut self, seconds: f32) -> u32 {
        let mut happened = 0;
        // speed: settle toward the cruise speed for this distance
        let cruise = cruise_speed(self.distance());
        self.speed += limit(cruise - self.speed, -6.0 * seconds, 3.0 * seconds);

        // steering: the sideways speed follows the stick; bends push toward the outside edge
        let mut axis = self.steer_axis;
        if self.input & buttons::LEFT != 0 { axis -= 1.0; }
        if self.input & buttons::RIGHT != 0 { axis += 1.0; }
        let axis = limit(axis, -1.0, 1.0);
        let response = if self.motion == Motion::Airborne { STEER_RESPONSE * 0.5 } else { STEER_RESPONSE };
        self.sideways_speed += (axis * STEER_SPEED - self.sideways_speed) * (response * seconds).min(1.0);
        let bend_drift = if self.motion == Motion::Airborne { 0.0 } else { -(self.track.curvature(self.player_z) as f32) * self.speed * self.speed * BEND_PUSH };
        let wanted_x = self.player_x + (self.sideways_speed + bend_drift) * seconds;
        self.player_x = limit(wanted_x, -SIDE_LIMIT, SIDE_LIMIT);
        if self.player_x != wanted_x {
            // pressed into the banked edge: it holds the sled and scrubs a little speed
            if self.sideways_speed * self.player_x > 0.0 { self.sideways_speed = 0.0; }
            self.speed = (self.speed - 4.0 * seconds).max(START_SPEED * 0.8);
            happened |= events::BANK_SCRAPE;
        }

        // jumping (buffered so a press just before landing still counts)
        if self.jump_buffer > 0.0 {
            self.jump_buffer -= seconds;
            if self.motion == Motion::Sliding {
                self.jump_buffer = 0.0;
                self.motion = Motion::Airborne;
                self.vertical_speed = JUMP_SPEED;
                self.airborne_seconds = 0.0;
                happened |= events::JUMP;
            }
        }

        let previous_z = self.player_z;
        self.player_z += (self.speed * seconds) as f64;
        self.scored_distance = self.player_z as f32;

        // flying: a smooth arc under gravity, landing back on the snow
        if self.motion == Motion::Airborne {
            self.airborne_seconds += seconds;
            self.vertical_speed -= GRAVITY * seconds;
            self.altitude += self.vertical_speed * seconds;
            if self.altitude <= 0.0 && self.vertical_speed < 0.0 {
                self.altitude = 0.0;
                self.vertical_speed = 0.0;
                self.motion = Motion::Sliding;
                happened |= events::LAND;
            }
        }

        // ramps: ride up the slope, then launch off the top
        if self.motion != Motion::Airborne {
            happened |= self.ride_ramps();
        }

        happened |= self.touch_entities(previous_z);
        if self.phase != Phase::Playing { return happened; }

        self.grace_seconds = (self.grace_seconds - seconds).max(0.0);
        if self.distance() >= self.next_milestone {
            self.next_milestone += MILESTONE_METRES;
            happened |= events::MILESTONE;
        }
        self.spawn_ahead();
        self.retire_behind();
        happened
    }

    fn ride_ramps(&mut self) -> u32 {
        let player_z = self.player_z;
        let ramp = self.entities.iter().find(|entity| entity.active && entity.kind == EntityKind::Ramp
            && player_z >= entity.z && player_z <= entity.z + RAMP_LENGTH as f64 && (entity.x - self.player_x).abs() < RAMP_HALF_WIDTH).copied();
        match ramp {
            Some(ramp) => {
                self.motion = Motion::OnRamp;
                self.ramp_top_z = ramp.z + RAMP_LENGTH as f64;
                self.altitude = RAMP_HEIGHT * ((player_z - ramp.z) as f32 / RAMP_LENGTH);
                0
            }
            None if self.motion == Motion::OnRamp => {
                self.motion = Motion::Airborne;
                self.airborne_seconds = 0.0;
                if player_z >= self.ramp_top_z {
                    self.vertical_speed = RAMP_LAUNCH_SPEED;
                    events::RAMP
                } else {
                    self.vertical_speed = 0.0; // slid off the side of the ramp: just drop
                    0
                }
            }
            None => 0,
        }
    }

    /// Hits and pickups between the last step and this one.
    fn touch_entities(&mut self, previous_z: f64) -> u32 {
        let mut happened = 0;
        for index in 0..MAX_ENTITIES {
            let entity = self.entities[index];
            if !entity.active || entity.kind == EntityKind::Ramp { continue; }
            let size = kind_size(entity.kind);
            let reach_z = (size.half_depth + PLAYER_HALF_DEPTH) as f64;
            // swept along the trail, so even a fast sled can't step over something thin
            if entity.z + reach_z < previous_z || entity.z - reach_z > self.player_z { continue; }
            if (entity.x - self.player_x).abs() >= size.half_width + PLAYER_HALF_WIDTH { continue; }
            if entity.kind.is_collectible() {
                if (self.altitude - entity.altitude).abs() >= PICKUP_REACH { continue; }
                self.entities[index].active = false;
                happened |= match entity.kind {
                    EntityKind::Gift => { self.gifts += 1; self.bonus_points += GIFT_POINTS; events::GIFT }
                    EntityKind::Star => { self.stars += 1; self.bonus_points += STAR_POINTS; events::STAR }
                    _ => {
                        if self.has_shield { self.bonus_points += SPARE_SHIELD_POINTS; } else { self.has_shield = true; }
                        events::SHIELD
                    }
                };
            } else {
                if self.altitude >= size.height || self.grace_seconds > 0.0 || self.debug_invincible { continue; }
                if self.has_shield {
                    self.has_shield = false;
                    self.grace_seconds = SHIELD_GRACE_SECONDS;
                    self.entities[index].active = false;
                    happened |= events::SHIELD_BREAK;
                } else {
                    self.phase = Phase::Crashing;
                    self.phase_seconds = 0.0;
                    self.speed *= 0.3; // the sled thumps to a stop against it
                    self.sideways_speed = if self.player_x >= entity.x { 3.0 } else { -3.0 };
                    if self.motion == Motion::OnRamp { self.motion = Motion::Airborne; self.vertical_speed = 0.0; }
                    return happened | events::CRASH;
                }
            }
        }
        happened
    }

    fn step_camera(&mut self, seconds: f32) {
        let follow = (LATERAL_FOLLOW_RATE * seconds).min(1.0);
        self.camera_offset += (self.player_x * LATERAL_FOLLOW - self.camera_offset) * follow;
        self.camera_lift += (self.altitude * 0.45 - self.camera_lift) * (6.0 * seconds).min(1.0);
        let pullback = if matches!(self.phase, Phase::Crashing | Phase::GameOver) { CRASH_PULLBACK } else { 0.0 };
        self.camera_pullback += (pullback - self.camera_pullback) * (3.0 * seconds).min(1.0);
        self.camera_offset = self.held_camera_offset();
    }

    /// Tell the world how wide the screen is (half width ÷ focal length) so the camera can keep the sled inside it.
    pub fn set_view_half_width(&mut self, view_half_width: f32) {
        self.view_half_width = if view_half_width.is_finite() { limit(view_half_width, 0.12, 3.0) } else { NARROWEST_VIEW_HALF_WIDTH };
    }

    /// How far (metres) the sled may sit sideways from the camera before it would leave the comfortable middle of the screen.
    pub fn sled_reach(&self) -> f32 {
        let half_view_metres = self.view_half_width * (CAMERA_BACK + self.camera_pullback); // half the screen, at the sled
        (half_view_metres * SLED_SCREEN_COMFORT).min(half_view_metres * SLED_EDGE_KEEP - SLED_DRAWN_HALF_WIDTH).max(0.0)
    }

    /// The camera's sideways offset from the trail centre under the sled, held close enough to the sled to keep it on screen.
    fn held_camera_offset(&self) -> f32 {
        let reach = self.sled_reach();
        limit(self.camera_offset, self.player_x - reach, self.player_x + reach)
    }

    /// The sled's sideways screen position as a share of half the screen (0 = centre, ±1 = an edge).
    pub fn sled_screen_share(&self) -> f32 {
        let relative_x = self.track.center_x(self.player_z) + self.player_x as f64 - self.camera_x();
        (relative_x / (self.player_z - self.camera_z())) as f32 / self.view_half_width
    }

    /// The camera sits behind the sled but measures its sideways position from the trail centre *under the sled*, so a
    /// curve never drags the sled toward the edge of the screen; only steering moves it, and that is held in check.
    pub fn camera_x(&self) -> f64 { self.track.center_x(self.player_z) + self.held_camera_offset() as f64 }
    /// The camera rides a fixed height above the snow under the sled (so the sled stays put on screen over crests and dips).
    pub fn camera_y(&self) -> f64 { self.track.height(self.player_z) + (CAMERA_HEIGHT + self.camera_lift + self.camera_pullback * 0.35) as f64 }

    // ---------- the trail ahead: rows of obstacles and collectibles ----------
    pub fn row_z(row: u32) -> f64 { FIRST_ROW_Z as f64 + row as f64 * ROW_LENGTH as f64 }

    fn spawn_ahead(&mut self) {
        while World::row_z(self.next_row) < self.player_z + VIEW_DISTANCE as f64 {
            let row = self.next_row;
            self.spawn_row(row);
            self.next_row += 1;
        }
    }

    fn retire_behind(&mut self) {
        let behind = self.camera_z() - 2.0;
        for entity in self.entities.iter_mut() {
            if entity.active && entity.z + RAMP_LENGTH as f64 + 2.0 < behind { entity.active = false; }
        }
    }

    pub fn spawn(&mut self, kind: EntityKind, z: f64, x: f32, altitude: f32) -> bool {
        match self.entities.iter_mut().find(|entity| !entity.active) {
            Some(slot) => { *slot = Entity { active: true, kind, z, x, altitude }; true }
            None => false,
        }
    }

    /// A lane the sled can reach from the lanes left free in the row before (the same lane or a neighbour).
    fn reachable_lane(&mut self) -> usize {
        let mut choices = [0usize; LANE_COUNT];
        let mut count = 0;
        for lane in 0..LANE_COUNT {
            if reachable_from(self.previous_free_lanes, lane) { choices[count] = lane; count += 1; }
        }
        if count == 0 { return LANE_COUNT / 2; }
        let pick = self.random_below(count);
        choices[pick]
    }

    fn spawn_row(&mut self, row: u32) {
        let z = World::row_z(row);
        let difficulty = limit(z as f32 / 3000.0, 0.0, 1.0);
        self.rows_since_ramp += 1;
        self.rows_since_shield += 1;

        // just after a ramp the landing zone stays clear (a few gifts to land on)
        if self.calm_rows > 0 {
            self.calm_rows -= 1;
            if self.random() < 0.6 {
                let lane = self.free_lane(ALL_LANES & !self.previous_free_lanes);
                self.spawn_gift_line(z, lane);
            }
            self.previous_free_lanes = ALL_LANES;
            return;
        }

        let roll = self.random();
        if self.rows_since_ramp >= 14 || (self.rows_since_ramp >= 6 && roll < 0.2) {
            // a ramp, a blocker under the arc, and stars hanging along the flight
            let lane = self.reachable_lane();
            let x = lane_x(lane);
            self.spawn(EntityKind::Ramp, z, x, 0.0);
            let landing = z + RAMP_LENGTH as f64;
            let blocker = if self.random() < 0.5 { EntityKind::Boulder } else { EntityKind::Snowman };
            self.spawn(blocker, landing + 6.0, x, 0.0);
            for (index, ahead) in [3.0, 7.0, 11.0].iter().enumerate() {
                let lift = if index == 1 { 0.3 } else { 0.0 };
                self.spawn(EntityKind::Star, landing + ahead, x, AIR_STAR_ALTITUDE + lift);
            }
            self.rows_since_ramp = 0;
            // the landing zone stays clear: two rows, three once the sled is fast enough to fly further
            self.calm_rows = if cruise_speed(z as f32) > 24.0 { 3 } else { 2 };
            self.previous_free_lanes = ALL_LANES & !(1 << lane);
            return;
        }

        let mut blocked: u8 = 0;
        let wants_empty = self.random() < 0.25 * (1.0 - difficulty);
        if !wants_empty {
            let count = (1 + (self.random() * (1.0 + difficulty * 2.2)) as usize).min(3);
            let mut placed = 0;
            while placed < count {
                let lane = self.random_below(LANE_COUNT);
                if blocked & (1 << lane) != 0 { continue; }
                blocked |= 1 << lane;
                placed += 1;
            }
            // keep a way through: some free lane must be reachable from the last row's free lanes
            if !(0..LANE_COUNT).any(|lane| blocked & (1 << lane) == 0 && reachable_from(self.previous_free_lanes, lane)) {
                let opening = self.reachable_lane();
                blocked &= !(1 << opening);
            }
        }

        let shield_lane = if self.rows_since_shield >= 30 && z > 300.0 && roll < 0.35 { Some(self.free_lane(blocked)) } else { None };
        for lane in 0..LANE_COUNT {
            if blocked & (1 << lane) == 0 { continue; }
            let kind_roll = self.random();
            let kind = if kind_roll < 0.45 { EntityKind::Pine } else if kind_roll < 0.67 { EntityKind::Boulder } else if kind_roll < 0.85 { EntityKind::Snowman } else { EntityKind::Log };
            let jitter_x = (self.random() - 0.5) * 0.6;
            let jitter_z = (self.random() - 0.5) * 4.0;
            self.spawn(kind, z + jitter_z as f64, lane_x(lane) + jitter_x, 0.0);
            // a star floating over a log: jump the log to collect it
            if kind == EntityKind::Log && self.random() < 0.4 { self.spawn(EntityKind::Star, z + jitter_z as f64, lane_x(lane) + jitter_x, 1.6); }
        }
        if let Some(lane) = shield_lane {
            self.spawn(EntityKind::Shield, z, lane_x(lane), 0.0);
            self.rows_since_shield = 0;
        } else if self.random() < 0.45 {
            let lane = self.free_lane(blocked);
            self.spawn_gift_line(z, lane);
        }
        self.previous_free_lanes = ALL_LANES & !blocked;
    }

    fn free_lane(&mut self, blocked: u8) -> usize {
        let free_count = (0..LANE_COUNT).filter(|lane| blocked & (1 << lane) == 0).count();
        if free_count == 0 { return LANE_COUNT / 2; }
        let mut pick = self.random_below(free_count);
        for lane in 0..LANE_COUNT {
            if blocked & (1 << lane) != 0 { continue; }
            if pick == 0 { return lane; }
            pick -= 1;
        }
        LANE_COUNT / 2
    }

    fn spawn_gift_line(&mut self, z: f64, lane: usize) {
        let count = 2 + self.random_below(3);
        for index in 0..count { self.spawn(EntityKind::Gift, z - 3.0 + index as f64 * 2.5, lane_x(lane), 0.0); }
    }

    // ---------- test hooks ----------
    #[cfg(test)]
    pub fn debug_spawn_row(&mut self, row: u32) { self.spawn_row(row); }
    pub fn clear_entities(&mut self) { for entity in self.entities.iter_mut() { entity.active = false; } }

    /// Jump straight to `distance` metres; the trail ahead is generated afresh from 40 m in front of the sled.
    pub fn teleport(&mut self, distance: f64) {
        self.player_z = distance.max(0.0);
        self.scored_distance = self.player_z as f32;
        self.clear_entities();
        // the trail refills from just ahead of the sled
        self.next_row = (((self.player_z + 40.0 - FIRST_ROW_Z as f64) / ROW_LENGTH as f64).ceil()).max(0.0) as u32;
        self.previous_free_lanes = ALL_LANES;
        self.calm_rows = 0;
        self.next_milestone = ((self.distance() / MILESTONE_METRES).floor() + 1.0) * MILESTONE_METRES;
        self.speed = cruise_speed(self.distance());
        self.spawn_ahead();
    }

    // ---------- save / load ----------
    pub fn save(&self) -> Vec<u8> {
        let mut writer = Writer { bytes: Vec::with_capacity(96 + MAX_ENTITIES * 17) };
        writer.bytes.extend_from_slice(&SAVE_MAGIC);
        writer.byte(SAVE_VERSION);
        writer.word(self.track.seed);
        writer.word(self.random_state);
        writer.double(self.player_z);
        for value in [self.player_x, self.sideways_speed, self.altitude, self.vertical_speed] { writer.float(value); }
        writer.byte(self.motion as u8);
        writer.double(self.ramp_top_z);
        writer.float(self.speed);
        for value in [self.bonus_points, self.gifts, self.stars] { writer.word(value); }
        writer.byte(self.has_shield as u8);
        for value in [self.grace_seconds, self.airborne_seconds, self.next_milestone] { writer.float(value); }
        for value in [self.next_row, self.rows_since_shield, self.rows_since_ramp, self.calm_rows] { writer.word(value); }
        writer.byte(self.previous_free_lanes);
        writer.float(self.camera_offset);
        writer.float(self.camera_lift);
        let active = self.entities.iter().filter(|entity| entity.active).count();
        writer.byte(active as u8);
        for entity in self.entities.iter().filter(|entity| entity.active) {
            writer.byte(entity.kind as u8);
            writer.double(entity.z);
            writer.float(entity.x);
            writer.float(entity.altitude);
        }
        writer.bytes
    }

    /// Rebuild a run from `save()` bytes. The world is unchanged if the bytes are not a valid save.
    /// A restored run is in the Playing phase (the screen shows it paused until the player resumes).
    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        match World::parse(bytes) { Some(mut world) => { world.view_half_width = self.view_half_width; *self = world; true } None => false }
    }

    fn parse(bytes: &[u8]) -> Option<World> {
        let mut reader = Reader { bytes, position: 0 };
        if reader.take(SAVE_MAGIC.len())? != SAVE_MAGIC || reader.byte()? != SAVE_VERSION { return None; }
        let mut world = World::new(reader.word()?);
        world.clear_entities();
        world.random_state = reader.word()?;
        if world.random_state == 0 { return None; }
        world.player_z = reader.double()?;
        if !(0.0..1.0e7).contains(&world.player_z) { return None; }
        world.scored_distance = world.player_z as f32;
        world.player_x = reader.float()?;
        world.sideways_speed = reader.float()?;
        world.altitude = reader.float()?;
        world.vertical_speed = reader.float()?;
        world.motion = match reader.byte()? { 0 => Motion::Sliding, 1 => Motion::OnRamp, 2 => Motion::Airborne, _ => return None };
        world.ramp_top_z = reader.double()?;
        world.speed = reader.float()?;
        world.bonus_points = reader.word()?;
        world.gifts = reader.word()?;
        world.stars = reader.word()?;
        world.has_shield = match reader.byte()? { 0 => false, 1 => true, _ => return None };
        world.grace_seconds = reader.float()?;
        world.airborne_seconds = reader.float()?;
        world.next_milestone = reader.float()?;
        world.next_row = reader.word()?;
        world.rows_since_shield = reader.word()?;
        world.rows_since_ramp = reader.word()?;
        world.calm_rows = reader.word()?;
        world.previous_free_lanes = reader.byte()? & ALL_LANES;
        world.camera_offset = reader.float()?;
        world.camera_lift = reader.float()?;
        let count = reader.byte()? as usize;
        if count > MAX_ENTITIES { return None; }
        for index in 0..count {
            let kind = EntityKind::from_index(reader.byte()? as u32)?;
            let z = reader.double()?;
            let x = reader.float()?;
            let altitude = reader.float()?;
            if !z.is_finite() || x.abs() > TRAIL_HALF_WIDTH * 2.0 || !(0.0..20.0).contains(&altitude) { return None; }
            world.entities[index] = Entity { active: true, kind, z, x, altitude };
        }
        if reader.position != bytes.len() { return None; }
        let floats = [world.player_x, world.sideways_speed, world.altitude, world.vertical_speed, world.speed, world.grace_seconds,
            world.airborne_seconds, world.next_milestone, world.camera_offset, world.camera_lift];
        if floats.iter().any(|value| !value.is_finite()) || !world.ramp_top_z.is_finite() { return None; }
        if world.player_x.abs() > SIDE_LIMIT + 0.01 || !(0.0..=MAX_SPEED * 2.0).contains(&world.speed) || world.altitude < 0.0 { return None; }
        world.phase = Phase::Playing;
        world.phase_seconds = 0.0;
        Some(world)
    }
}

/// Can the sled get to `lane` from any of the `free_lanes` of the row before (same lane or a neighbour)?
fn reachable_from(free_lanes: u8, lane: usize) -> bool {
    (lane.saturating_sub(1)..=(lane + 1).min(LANE_COUNT - 1)).any(|from| free_lanes & (1 << from) != 0)
}

pub const SAVE_MAGIC: [u8; 2] = *b"AS";
pub const SAVE_VERSION: u8 = 1;

struct Writer { bytes: Vec<u8> }
impl Writer {
    fn byte(&mut self, value: u8) { self.bytes.push(value); }
    fn word(&mut self, value: u32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn float(&mut self, value: f32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn double(&mut self, value: f64) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
}

struct Reader<'a> { bytes: &'a [u8], position: usize }
impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Option<&'a [u8]> {
        let slice = self.bytes.get(self.position..self.position + count)?;
        self.position += count;
        Some(slice)
    }
    fn byte(&mut self) -> Option<u8> { Some(self.take(1)?[0]) }
    fn word(&mut self) -> Option<u32> { Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?)) }
    fn float(&mut self) -> Option<f32> { Some(f32::from_le_bytes(self.take(4)?.try_into().ok()?)) }
    fn double(&mut self) -> Option<f64> { Some(f64::from_le_bytes(self.take(8)?.try_into().ok()?)) }
}
