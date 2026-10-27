//! The game state and its fixed 60 Hz step: Mira (the player) walks, pushes crates, climbs onto them, carries the
//! lantern, pulls levers and throws embers at braziers; her little brother Kabir follows. Light comes from flames,
//! windows and the lantern; crates block it. Rats live in the dark (see rats.rs) and bite anyone standing in it.

use crate::rats::*;
use crate::stage::*;
use crate::Within;

pub const STEP: f32 = 1.0 / 60.0;
pub const MAX_STEPS: u32 = 12;
pub const WALK_SPEED: f32 = 82.0;
pub const PUSH_SPEED: f32 = 38.0;
pub const SIBLING_SPEED: f32 = 104.0;
pub const SIBLING_GAP: f32 = 24.0;
pub const REACH: f32 = 22.0;
pub const LIT_LEVEL: f32 = 0.5;
/// Seconds of lantern oil (it burns from the moment she picks it up). Enough to cross the dark alley to the
/// brazier's light with a short stop, but spent before a non-stop walk reaches Cooper's Yard's crate, so the
/// lantern can't be carried past the crate puzzle.
pub const LANTERN_OIL: f32 = 8.0;
pub const FIRE_POT_SECONDS: f32 = 12.0;
pub const THROW_RANGE: f32 = 250.0;
pub const CLIMB_SECONDS: f32 = 0.55;
pub const DEATH_SECONDS: f32 = 1.8;
pub const BITE_SECONDS: f32 = 0.85;
pub const GRAVITY: f32 = 620.0;
pub const HALF_BODY: f32 = 8.0;
/// The windmill before the staircase: a big four-sailed mill with ONE lit sail, a lamp at its tip. It stands still
/// (lit sail low, light on the street) until Mira is up on the stone landing; then the wind takes it. Each full turn
/// is one light cycle: while the lit sail swings low the street under it is lit; as it climbs past level the light
/// leaves the street (fade), it stays dark while the lamp is high, and floods back (flare) as it comes down again. It starts turning at the start of the fade, so she watches the whole
/// cycle — light, dark, light — from a safe spot.
/// Its cycle: lit, fading, dark, flaring back up (seconds; the sum is one half turn).
pub const FLICKER_ON: f32 = 4.2;
pub const FLICKER_FADE: f32 = 0.3;
pub const FLICKER_DARK: f32 = 1.3;
pub const FLICKER_FLARE: f32 = 0.2;
pub const FLICKER_PERIOD: f32 = FLICKER_ON + FLICKER_FADE + FLICKER_DARK + FLICKER_FLARE;
/// Standing this high (on a crate) the rats can't reach you.
pub const OUT_OF_REACH: f32 = 10.0;

pub const BUTTON_LEFT: u8 = 1;
pub const BUTTON_RIGHT: u8 = 2;

pub const STATE_IDLE: u8 = 0;
pub const STATE_WALK: u8 = 1;
pub const STATE_PUSH: u8 = 2;
pub const STATE_CLIMB: u8 = 3;
pub const STATE_THROW: u8 = 4;
pub const STATE_DEAD: u8 = 5;

pub const PROMPT_NONE: u8 = 0;
pub const PROMPT_TAKE_LANTERN: u8 = 1;
pub const PROMPT_DROP_LANTERN: u8 = 2;
pub const PROMPT_LEVER: u8 = 3;
pub const PROMPT_CLIMB: u8 = 4;
pub const PROMPT_HOP_DOWN: u8 = 5;

pub const EVENT_IGNITE: u32 = 1;
pub const EVENT_DEATH: u32 = 2;
pub const EVENT_CHECKPOINT: u32 = 4;
pub const EVENT_TAKE: u32 = 8;
pub const EVENT_DROP: u32 = 16;
pub const EVENT_LEVER: u32 = 32;
pub const EVENT_THROW: u32 = 64;
pub const EVENT_FIZZLE: u32 = 128;
pub const EVENT_CLEAR: u32 = 256;
pub const EVENT_CLIMB: u32 = 512;
pub const EVENT_LANTERN_OUT: u32 = 1024;
pub const EVENT_POT_OUT: u32 = 2048;
pub const EVENT_RESPAWN: u32 = 4096;
pub const EVENT_PUSH: u32 = 8192;

/// One light as the renderer reads it (8 × f32).
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct Light { pub x: f32, pub height: f32, pub radius: f32, pub intensity: f32, pub kind: f32, pub lit: f32, pub left: f32, pub right: f32 }

#[derive(Clone, Copy, Debug)]
pub struct Crate { pub x: f32, pub half: f32, pub height: f32, pub min_x: f32, pub max_x: f32 }

impl Crate {
    /// A fixed block (stone wall): never slides and doesn't block light.
    pub fn fixed(&self) -> bool { self.min_x >= self.max_x }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Ember { pub active: bool, pub x: f32, pub y: f32, pub vx: f32, pub vy: f32, pub time: f32, pub flight: f32, pub target: i8 }

#[derive(Clone, Copy, Debug)]
pub struct World {
    pub time: f32,
    pub player_x: f32,
    pub player_y: f32,
    pub facing: f32,
    pub state: u8,
    pub state_time: f32,
    pub climb_from: f32,
    pub climb_to: f32,
    pub climb_from_y: f32,
    pub climb_to_y: f32,
    /// The crate Mira stands on (-1: on the ground).
    pub on_crate: i8,
    /// The current climb goes up or down the staircase (step by step rather than a scramble).
    pub climb_stairs: bool,
    /// Just walked up onto the landing: she stays there until the direction key is let go.
    pub stair_hold: bool,
    /// When the wind took the windmill (-1: still becalmed and lit).
    pub flicker_start: f32,
    pub walked: f32,
    pub sibling_x: f32,
    pub sibling_y: f32,
    pub sibling_facing: f32,
    pub sibling_walked: f32,
    pub danger: f32,
    pub sibling_danger: f32,
    pub lights: [Light; LIGHT_COUNT],
    pub base_lit: [bool; LIGHT_COUNT],
    pub pot_left: f32,
    pub carrying: bool,
    pub lantern_used: bool,
    pub oil: f32,
    pub embers: u8,
    pub ember: Ember,
    pub crates: [Crate; CRATES.len()],
    pub levers: [bool; LEVERS.len()],
    pub rats: [Rat; RAT_COUNT],
    pub checkpoint: u8,
    pub cleared: bool,
    pub events: u32,
}

impl World {
    pub fn new() -> World {
        let mut lights = [Light::default(); LIGHT_COUNT];
        let mut base_lit = [false; LIGHT_COUNT];
        for (index, &(x, height, radius, kind, lit)) in LIGHTS.iter().chain(EXTRA_LIGHTS.iter()).enumerate() {
            lights[index] = Light { x, height, radius, intensity: 1.0, kind: kind as f32, lit: 0.0, left: 0.0, right: STAGE_END };
            base_lit[index] = lit;
        }
        let crates = CRATES.map(|(x, half, height, min_x, max_x)| Crate { x, half, height, min_x, max_x });
        let mut world = World {
            time: 0.0, player_x: START_X, player_y: 0.0, facing: 1.0, state: STATE_IDLE, state_time: 0.0, climb_from: 0.0, climb_to: 0.0, climb_from_y: 0.0, climb_to_y: 0.0, on_crate: -1, climb_stairs: false, stair_hold: false, flicker_start: -1.0, walked: 0.0,
            sibling_x: START_X - SIBLING_GAP, sibling_y: 0.0, sibling_facing: 1.0, sibling_walked: 0.0, danger: 0.0, sibling_danger: 0.0,
            lights, base_lit, pot_left: 0.0, carrying: false, lantern_used: false, oil: LANTERN_OIL, embers: CHECKPOINTS[0].1, ember: Ember::default(),
            crates, levers: [false; LEVERS.len()], rats: [Rat::default(); RAT_COUNT], checkpoint: 0, cleared: false, events: 0,
        };
        world.update_lights();
        spawn_rats(&mut world);
        world
    }

    /// Brightness 0…1 at ground position x.
    pub fn light_at(&self, x: f32) -> f32 {
        let mut best = 0.0f32;
        for light in &self.lights {
            if light.lit < 0.5 || light.intensity <= 0.0 || x < light.left || x > light.right { continue; }
            let distance = (x - light.x).abs();
            if distance >= light.radius { continue; }
            let level = ((light.radius - distance) / (light.radius * 0.3)).min(1.0) * light.intensity;
            best = best.max(level);
        }
        best
    }

    pub fn is_lit(&self, x: f32) -> bool { self.light_at(x) >= LIT_LEVEL }

    pub fn flicker_intensity(&self) -> f32 {
        if self.flicker_start < 0.0 { return 1.0; } // becalmed, lit sail low, until Mira is up on the landing
        let dark_end = FLICKER_ON + FLICKER_FADE + FLICKER_DARK;
        let phase = self.flicker_phase();
        if phase < FLICKER_ON { 1.0 }
        else if phase < FLICKER_ON + FLICKER_FADE { 1.0 - (phase - FLICKER_ON) / FLICKER_FADE }
        else if phase < dark_end { 0.0 }
        else { (phase - dark_end) / FLICKER_FLARE }
    }

    /// Seconds into the windmill's light cycle (0 = start of the lit stretch). Becalmed it rests at the end of the lit
    /// stretch, so when the wind takes it the light starts to fade straight away.
    pub fn flicker_phase(&self) -> f32 {
        if self.flicker_start < 0.0 { return FLICKER_ON; }
        let elapsed = self.time - self.flicker_start + FLICKER_ON; // never negative; floor is one wasm op, fmod a library call
        elapsed - (elapsed / FLICKER_PERIOD).floor() * FLICKER_PERIOD
    }

    /// Angle of the lit sail from hanging straight down (radians, clockwise on screen). One full turn per light cycle,
    /// at a steady speed; the lit sail hangs straight down in the middle of the lit stretch, and is high overhead in
    /// the dark stretch.
    pub fn windmill_angle(&self) -> f32 {
        core::f32::consts::TAU * (self.flicker_phase() - FLICKER_ON * 0.5) / FLICKER_PERIOD
    }

    pub fn update_lights(&mut self) {
        if self.flicker_start < 0.0 && self.on_crate == STAIRS as i8 && self.state != STATE_CLIMB { self.flicker_start = self.time; }
        let flicker = self.flicker_intensity();
        for index in 0..LIGHT_COUNT {
            let kind = self.lights[index].kind as u8;
            let mut lit = self.base_lit[index];
            let mut intensity = 1.0;
            match kind {
                KIND_FLICKER => intensity = flicker,
                KIND_FIRE_POT => { lit = self.pot_left > 0.0; intensity = (self.pot_left / 1.5).min(1.0); }
                KIND_LANTERN => {
                    lit = self.lantern_used && self.oil > 0.0;
                    intensity = if self.oil < 3.0 { 0.55 + 0.45 * (self.oil / 3.0) } else { 1.0 };
                    if self.carrying { self.lights[index].x = self.player_x + self.facing * 7.0; }
                }
                _ => {}
            }
            self.lights[index].lit = if lit { 1.0 } else { 0.0 };
            self.lights[index].intensity = intensity;
            // crates block light along the ground
            let x = self.lights[index].x;
            let mut left = 0.0f32;
            let mut right = STAGE_END;
            for crate_box in self.crates.iter().filter(|crate_box| !crate_box.fixed()) {
                // the crate itself stays lit on the light's side; the street beyond its far edge is in shadow
                if crate_box.x + crate_box.half <= x { left = left.max(crate_box.x - crate_box.half); }
                if crate_box.x - crate_box.half >= x { right = right.min(crate_box.x + crate_box.half); }
            }
            self.lights[index].left = left;
            self.lights[index].right = right;
        }
    }

    /// What Interact would do right now.
    pub fn prompt(&self) -> u8 {
        if self.state == STATE_DEAD || self.state == STATE_CLIMB || self.cleared { return PROMPT_NONE; }
        if LEVERS.iter().any(|&(x, _)| (x - self.player_x).abs() < REACH) { return PROMPT_LEVER; }
        let lantern = self.lights[LANTERN];
        if !self.carrying && (lantern.x - self.player_x).abs() < REACH && (!self.lantern_used || self.oil > 0.0) { return PROMPT_TAKE_LANTERN; }
        if self.on_crate >= 0 { return PROMPT_HOP_DOWN; }
        if self.climbable_crate().is_some() { return PROMPT_CLIMB; }
        if self.carrying { return PROMPT_DROP_LANTERN; }
        PROMPT_NONE
    }

    fn climbable_crate(&self) -> Option<usize> {
        self.crates.iter().position(|crate_box| {
            let edge = if self.facing > 0.0 { crate_box.x - crate_box.half } else { crate_box.x + crate_box.half };
            let gap = (edge - self.player_x) * self.facing;
            (0.0..=HALF_BODY + 10.0).contains(&gap)
        })
    }

    pub fn interact(&mut self) {
        match self.prompt() {
            PROMPT_LEVER => {
                let index = LEVERS.iter().position(|&(x, _)| (x - self.player_x).abs() < REACH).unwrap_or(0);
                self.levers[index] = !self.levers[index];
                // one rope: opening a window closes the other
                let (window, other) = if LEVERS[index].1 == WINDOW_A { (WINDOW_A, WINDOW_B) } else { (WINDOW_B, WINDOW_A) };
                let open = !self.base_lit[window];
                self.base_lit[window] = open;
                if open { self.base_lit[other] = false; }
                self.events |= EVENT_LEVER;
            }
            PROMPT_TAKE_LANTERN => { self.carrying = true; self.lantern_used = true; self.events |= EVENT_TAKE; }
            PROMPT_DROP_LANTERN => {
                self.carrying = false;
                self.lights[LANTERN].x = self.player_x + self.facing * 12.0;
                self.lights[LANTERN].height = 8.0;
                self.events |= EVENT_DROP;
            }
            PROMPT_CLIMB => {
                if let Some(index) = self.climbable_crate() { self.climb_onto(index); }
            }
            PROMPT_HOP_DOWN => self.hop_down(self.facing),
            _ => {}
        }
        self.update_lights();
    }

    /// Up onto a crate (the near half of its top) or up the staircase (onto its landing): out of the rats' reach.
    fn climb_onto(&mut self, index: usize) {
        let crate_box = self.crates[index];
        let to_x = if index == STAIRS { crate_box.x - self.facing * 3.0 } else { crate_box.x - self.facing * crate_box.half * 0.35 };
        self.start_climb(to_x, 0.0, crate_box.height);
        self.climb_stairs = index == STAIRS;
        self.on_crate = index as i8;
    }

    /// Height of the ground (or a step) at x for someone walking over the staircase.
    pub fn stairs_height(&self, x: f32) -> f32 {
        let stairs = self.crates[STAIRS];
        let from_centre = (x - stairs.x).abs();
        if from_centre <= STAIRS_LANDING { return stairs.height; }
        if from_centre >= stairs.half { return 0.0; }
        let tread = (stairs.half - STAIRS_LANDING) / STAIRS_STEPS;
        stairs.height * ((stairs.half - from_centre) / tread).ceil() / STAIRS_STEPS
    }

    fn start_climb(&mut self, to_x: f32, from_y: f32, to_y: f32) {
        self.climb_stairs = false;
        self.state = STATE_CLIMB;
        self.state_time = 0.0;
        self.climb_from = self.player_x;
        self.climb_to = to_x;
        self.climb_from_y = from_y;
        self.climb_to_y = to_y;
        self.events |= EVENT_CLIMB;
    }

    /// Jump off the crate Mira stands on, to the ground on the given side.
    fn hop_down(&mut self, direction: f32) {
        if self.on_crate < 0 { return; }
        let crate_box = self.crates[self.on_crate as usize];
        self.facing = direction;
        self.start_climb(crate_box.x + direction * (crate_box.half + HALF_BODY + 2.0), crate_box.height, 0.0);
        self.climb_stairs = self.on_crate == STAIRS as i8;
        self.stair_hold = false;
        self.on_crate = -1;
    }

    /// The unlit brazier / fire pot an ember would fly to (in the facing direction, within range).
    pub fn throw_target(&self) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for (index, light) in self.lights.iter().enumerate() {
            let kind = light.kind as u8;
            if !(kind == KIND_BRAZIER || kind == KIND_FIRE_POT) || light.lit > 0.5 { continue; }
            let distance = (light.x - self.player_x) * self.facing;
            if !(30.0..=THROW_RANGE).contains(&distance) { continue; }
            if best.map_or(true, |(_, d)| distance < d) { best = Some((index, distance)); }
        }
        best.map(|(index, _)| index)
    }

    pub fn throw_ember(&mut self) -> bool {
        if self.embers == 0 || self.ember.active || self.state == STATE_DEAD || self.state == STATE_CLIMB || self.cleared { return false; }
        let target = self.throw_target();
        let (land_x, land_y) = match target { Some(index) => (self.lights[index].x, self.lights[index].height), None => (self.player_x + self.facing * 150.0, 0.0) };
        let start_y = 34.0;
        let distance = land_x - self.player_x;
        let flight = 0.55 + distance.abs() / 700.0;
        self.ember = Ember {
            active: true, x: self.player_x + self.facing * 6.0, y: start_y, vx: distance / flight,
            vy: (land_y - start_y + 0.5 * GRAVITY * flight * flight) / flight, time: 0.0, flight, target: target.map_or(-1, |index| index as i8),
        };
        self.embers -= 1;
        self.state = STATE_THROW;
        self.state_time = 0.0;
        self.events |= EVENT_THROW;
        true
    }

    pub fn step(&mut self, buttons: u8) {
        self.time += STEP;
        self.state_time += STEP;
        if self.state == STATE_DEAD {
            step_rats(self);
            if self.state_time >= DEATH_SECONDS { self.events |= EVENT_RESPAWN; }
            self.update_lights();
            return;
        }
        if self.cleared { self.update_lights(); step_rats(self); return; }
        self.move_player(buttons);
        self.move_sibling();
        self.step_ember();
        // burning things
        if self.pot_left > 0.0 { self.pot_left -= STEP; if self.pot_left <= 0.0 { self.pot_left = 0.0; self.events |= EVENT_POT_OUT; } }
        if self.lantern_used && self.oil > 0.0 {
            self.oil -= STEP;
            if self.oil <= 0.0 { self.oil = 0.0; self.carrying = false; self.lights[LANTERN].x = self.player_x; self.events |= EVENT_LANTERN_OUT; }
        }
        self.update_lights();
        step_rats(self);
        self.check_bites();
        self.check_progress();
    }

    fn move_player(&mut self, buttons: u8) {
        if self.state == STATE_CLIMB {
            let t = (self.state_time / CLIMB_SECONDS).min(1.0);
            self.player_x = self.climb_from + (self.climb_to - self.climb_from) * t;
            self.player_y = if self.climb_stairs {
                // one step at a time: a little lift on each tread
                let steps = t * STAIRS_STEPS;
                let lift = steps.floor() + (steps.fract() * 2.0).min(1.0);
                self.climb_from_y + (self.climb_to_y - self.climb_from_y) * (lift / STAIRS_STEPS).min(1.0)
            } else {
                self.climb_from_y + (self.climb_to_y - self.climb_from_y) * t + 4.0 * t * (1.0 - t) * 12.0
            };
            if t >= 1.0 {
                self.state = STATE_IDLE;
                self.player_y = self.climb_to_y;
                // walked up onto the landing: stop there until the key is let go, so she sees the torch go out
                if self.climb_stairs && self.on_crate == STAIRS as i8 { self.stair_hold = true; }
            }
            return;
        }
        if self.state == STATE_THROW && self.state_time < 0.35 { return; }
        let direction = (buttons & BUTTON_RIGHT != 0) as i32 as f32 - (buttons & BUTTON_LEFT != 0) as i32 as f32;
        if direction == 0.0 { self.state = STATE_IDLE; self.stair_hold = false; return; }
        if self.stair_hold { self.state = STATE_IDLE; return; }
        self.facing = direction;
        if self.on_crate >= 0 {
            // walking on top of a crate; stepping off an edge hops down on that side
            let crate_box = self.crates[self.on_crate as usize];
            let next = self.player_x + direction * WALK_SPEED * STEP;
            let top = if self.on_crate == STAIRS as i8 { STAIRS_LANDING } else { crate_box.half - 3.0 };
            // stepping off the edge: hop down that side (or walk down the staircase's far flight)
            if (next - crate_box.x).abs() > top { self.hop_down(direction); return; }
            self.walked += (next - self.player_x).abs();
            self.player_x = next;
            self.state = STATE_WALK;
            return;
        }
        let mut step = direction * WALK_SPEED * STEP;
        let mut pushing = false;
        let mut up_the_stairs = false;
        for crate_box in self.crates.iter_mut() {
            let edge_gap = if direction > 0.0 { (crate_box.x - crate_box.half) - (self.player_x + HALF_BODY) } else { (self.player_x - HALF_BODY) - (crate_box.x + crate_box.half) };
            if edge_gap < -0.5 || edge_gap > step.abs() { continue; }
            // walking into the staircase: she walks up it
            if crate_box.fixed() { step = direction * edge_gap.max(0.0); up_the_stairs = true; continue; }
            // touching: push it (slower) as far as its track allows
            let push = direction * PUSH_SPEED * STEP;
            let new_x = (crate_box.x + push).within(crate_box.min_x, crate_box.max_x);
            let moved = new_x - crate_box.x;
            crate_box.x = new_x;
            step = direction * edge_gap.max(0.0) + moved;
            pushing = true;
        }
        self.player_x = (self.player_x + step).within(20.0, STAGE_END);
        self.walked += step.abs();
        self.state = if pushing { STATE_PUSH } else { STATE_WALK };
        if pushing && step.abs() > 0.0 { self.events |= EVENT_PUSH; }
        if up_the_stairs { self.climb_onto(STAIRS); }
    }

    fn move_sibling(&mut self) {
        let gap = if self.carrying { SIBLING_GAP * 0.8 } else { SIBLING_GAP };
        let mut target = self.player_x - self.facing * gap;
        if self.on_crate >= 0 {
            // Mira is up on a crate: Kabir scrambles up beside her, out of the rats' reach
            let crate_box = self.crates[self.on_crate as usize];
            let reach = if self.on_crate == STAIRS as i8 { STAIRS_LANDING - 4.0 } else { crate_box.half - 4.0 };
            target = target.within(crate_box.x - reach, crate_box.x + reach);
        }
        let delta = target - self.sibling_x;
        if delta.abs() > 2.0 {
            let speed = if delta.abs() > 60.0 { SIBLING_SPEED * 1.3 } else { SIBLING_SPEED };
            let step = delta.signum() * (speed * STEP).min(delta.abs());
            self.sibling_x += step;
            self.sibling_walked += step.abs();
            self.sibling_facing = delta.signum();
        } else if (self.player_x - self.sibling_x).abs() > 1.0 {
            self.sibling_facing = (self.player_x - self.sibling_x).signum();
        }
        // hop onto / over crates
        let mut height = 0.0f32;
        for (index, crate_box) in self.crates.iter().enumerate() {
            if index == STAIRS { height = height.max(self.stairs_height(self.sibling_x)); continue; } // he trots up the steps
            if (self.sibling_x - crate_box.x).abs() < crate_box.half + 4.0 { height = height.max(crate_box.height); }
        }
        self.sibling_y += (height - self.sibling_y) * 0.35;
    }

    fn step_ember(&mut self) {
        if !self.ember.active { return; }
        let ember = &mut self.ember;
        ember.time += STEP;
        ember.x += ember.vx * STEP;
        ember.vy -= GRAVITY * STEP;
        ember.y += ember.vy * STEP;
        if ember.time < ember.flight { return; }
        ember.active = false;
        if ember.target >= 0 {
            let index = ember.target as usize;
            if self.lights[index].kind as u8 == KIND_FIRE_POT { self.pot_left = FIRE_POT_SECONDS; } else { self.base_lit[index] = true; }
            self.events |= EVENT_IGNITE;
        } else {
            self.events |= EVENT_FIZZLE;
        }
    }

    fn check_bites(&mut self) {
        // rats can't climb: up on a crate is safe even in the dark
        let player_dark = self.player_y < OUT_OF_REACH && !self.is_lit(self.player_x);
        let sibling_dark = self.sibling_y < OUT_OF_REACH && !self.is_lit(self.sibling_x);
        let player_bitten = player_dark && rats_touching(self, self.player_x);
        let sibling_bitten = sibling_dark && rats_touching(self, self.sibling_x);
        self.danger = if player_bitten { self.danger + STEP / BITE_SECONDS } else { (self.danger - STEP * 0.9).max(0.0) };
        self.sibling_danger = if sibling_bitten { self.sibling_danger + STEP / BITE_SECONDS } else { (self.sibling_danger - STEP * 0.9).max(0.0) };
        if self.danger >= 1.0 || self.sibling_danger >= 1.0 {
            self.state = STATE_DEAD;
            self.state_time = 0.0;
            self.carrying = false;
            self.events |= EVENT_DEATH;
        }
    }

    fn check_progress(&mut self) {
        let next = self.checkpoint as usize + 1;
        if next < CHECKPOINTS.len() && self.player_x >= CHECKPOINTS[next].0 && self.is_lit(self.player_x) && self.state != STATE_CLIMB {
            self.checkpoint = next as u8;
            self.embers = self.embers.max(CHECKPOINTS[next].1);
            self.events |= EVENT_CHECKPOINT;
        }
        if self.player_x >= DOOR_X - 6.0 && (self.sibling_x - self.player_x).abs() < 70.0 {
            self.cleared = true;
            self.state = STATE_IDLE;
            self.events |= EVENT_CLEAR;
        }
    }
}
