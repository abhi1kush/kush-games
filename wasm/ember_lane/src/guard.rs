//! Stage two, "The Guard Steps": Mira and Kabir come out of the sanctuary's back door onto a terrace. A stone
//! staircase leads down into a walled yard where a soldier with a spear patrols under a hanging lamp. Seen in the
//! lamp light, his suspicion fills; full suspicion and he charges and runs her through (game over). Mira carries
//! stones as well as embers: a stone thrown at the lamp snuffs it, and in the dark she can creep up behind him and
//! take him down. Kabir won't come down into a dark yard, so she must relight the lamp with an ember before the two
//! of them can leave by the far gate. Rats live in a drain under the lamp: while it burns the yard is theirs to
//! fear, but a few seconds after it goes out they pour up out of the grate and swarm anyone standing in the dark
//! (the stage-one rules) — Mira, Kabir, and the soldier too, so a snuffed lamp left dark lets them take him. World units: x left to right, y up; the terrace is y = 0, the yard y = -YARD_DEPTH.

use crate::rats::{spawn_swarm, step_swarm, swarm_touching, Emerge, Lit, Rat};
use crate::world::{Light, BITE_SECONDS, BUTTON_LEFT, BUTTON_RIGHT, GRAVITY, SIBLING_GAP, SIBLING_SPEED, STEP, MAX_STEPS, WALK_SPEED, LIT_LEVEL};
use crate::Within;
use wasm_bindgen::prelude::*;

pub const GUARD_STAGE_END: f32 = 1200.0;
pub const GUARD_START_X: f32 = 90.0;
pub const YARD_DEPTH: f32 = 48.0;
/// The staircase down: from the terrace edge to the yard floor, in STAIR_STEPS treads.
pub const STAIRS_TOP: f32 = 380.0;
pub const STAIRS_BOTTOM: f32 = 476.0;
/// The steps up out of the yard to the far gate.
pub const EXIT_BOTTOM: f32 = 960.0;
pub const EXIT_TOP: f32 = 1040.0;
pub const STAIR_STEPS: f32 = 6.0;
pub const GATE_X: f32 = 1130.0;
/// Kabir hides behind the barrels at the top of the steps until the yard is safe.
pub const KABIR_HIDE_X: f32 = 335.0;
pub const STONE_PILE_X: f32 = 250.0;
pub const TORCH_X: f32 = 150.0;
pub const LAMP_X: f32 = 700.0;
pub const LAMP: usize = 1;
pub const GUARD_LIGHT_COUNT: usize = 3;
/// x, flame height (world y), radius, kind (renderer kinds: 1 torch, 8 hanging lamp), starts lit
pub const GUARD_LIGHTS: [(f32, f32, f32, u8, bool); GUARD_LIGHT_COUNT] = [
    (TORCH_X, 62.0, 175.0, 1, true),
    (LAMP_X, 24.0, 245.0, 8, true),
    (1100.0, 62.0, 140.0, 1, true),
];

pub const PATROL_LEFT: f32 = 545.0;
pub const PATROL_RIGHT: f32 = 860.0;
pub const PATROL_SPEED: f32 = 27.0;
pub const PATROL_PAUSE: f32 = 1.6;
pub const SEARCH_SPEED: f32 = 22.0;
pub const CHARGE_SPEED: f32 = 112.0;
pub const SIGHT: f32 = 330.0;
/// In the dark he only notices someone right in front of him.
pub const DARK_SIGHT: f32 = 30.0;
pub const HEARING: f32 = 16.0;
pub const SPEAR_REACH: f32 = 30.0;
pub const SPEAR_SECONDS: f32 = 0.55;
pub const SPEAR_HIT: f32 = 0.3;
pub const STARTLE_SECONDS: f32 = 0.9;
pub const RELIGHT_SECONDS: f32 = 6.5;
pub const STRIKE_REACH: f32 = 28.0;
pub const STRIKE_SECONDS: f32 = 0.6;
pub const THROW_SECONDS: f32 = 0.45;
pub const STONE_RANGE: f32 = 390.0;
pub const EMBER_RANGE: f32 = 320.0;
pub const NOISE_HEARING: f32 = 280.0;
pub const MAX_STONES: u8 = 3;
pub const DEATH_SECONDS: f32 = 2.4;
pub const REACH: f32 = 24.0;

/// The yard's rat nest (all of it inside the lamp's light while it burns) and the drain they live in.
pub const YARD_NEST: [(f32, f32, u8); 1] = [(500.0, 900.0, 36)];
pub const GUARD_RAT_COUNT: usize = 36;
pub const DRAIN_X: f32 = LAMP_X + 39.0;
/// Seconds of darkness before the first rats climb out of the drain: time enough for a quick takedown.
pub const DRAIN_DELAY: f32 = 5.5;
/// The soldier stamps and swats, so they need a little longer on him than on Mira.
pub const GUARD_BITE_SECONDS: f32 = 1.4;

pub const KILLED_BY_SPEAR: u8 = 0;
pub const KILLED_BY_RATS: u8 = 1;

pub const ITEM_EMBER: u8 = 0;
pub const ITEM_STONE: u8 = 1;

pub const STATE_IDLE: u8 = 0;
pub const STATE_WALK: u8 = 1;
pub const STATE_THROW: u8 = 4;
pub const STATE_DEAD: u8 = 5;
pub const STATE_STRIKE: u8 = 6;

pub const GUARD_PATROL: u8 = 0;
pub const GUARD_SUSPICIOUS: u8 = 1;
pub const GUARD_CHARGE: u8 = 2;
pub const GUARD_SPEAR: u8 = 3;
pub const GUARD_RELIGHT: u8 = 4;
pub const GUARD_DOWN: u8 = 5;

pub const PROMPT_NONE: u8 = 0;
pub const PROMPT_TAKE_EMBER: u8 = 1;
pub const PROMPT_TAKE_STONES: u8 = 2;
pub const PROMPT_STRIKE: u8 = 3;

pub const EVENT_THROW: u32 = 1;
pub const EVENT_SNUFF: u32 = 2;
pub const EVENT_CLATTER: u32 = 4;
pub const EVENT_IGNITE: u32 = 8;
pub const EVENT_FIZZLE: u32 = 16;
pub const EVENT_NOTICE: u32 = 32;
pub const EVENT_ALARM: u32 = 64;
pub const EVENT_SPEAR: u32 = 128;
pub const EVENT_DEATH: u32 = 256;
pub const EVENT_TAKEDOWN: u32 = 512;
pub const EVENT_GUARD_RELIT: u32 = 1024;
pub const EVENT_TAKE: u32 = 2048;
pub const EVENT_KABIR_COMES: u32 = 4096;
pub const EVENT_CLEAR: u32 = 8192;
pub const EVENT_CAUGHT: u32 = 16384;
pub const EVENT_GUARD_EATEN: u32 = 32768;
pub const EVENT_BITTEN: u32 = 65536;
pub const EVENT_RATS_OUT: u32 = 131072;

/// The ground height at x: the terrace, six treads down, the yard, six treads up, the gate terrace.
pub fn ground_at(x: f32) -> f32 {
    let tread = |from: f32, to: f32, x: f32| ((x - from) / ((to - from) / STAIR_STEPS)).ceil().within(0.0, STAIR_STEPS) / STAIR_STEPS;
    if x <= STAIRS_TOP || x >= EXIT_TOP { 0.0 }
    else if x < STAIRS_BOTTOM { -YARD_DEPTH * tread(STAIRS_TOP, STAIRS_BOTTOM, x) }
    else if x <= EXIT_BOTTOM { -YARD_DEPTH }
    else { -YARD_DEPTH * (1.0 - tread(EXIT_BOTTOM, EXIT_TOP, x)) }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Missile { pub active: bool, pub item: u8, pub x: f32, pub y: f32, pub vx: f32, pub vy: f32, pub time: f32, pub flight: f32, pub hits_lamp: bool, pub land_y: f32 }

#[derive(Clone, Copy, Debug)]
pub struct GuardWorld {
    pub time: f32,
    pub player_x: f32,
    pub player_y: f32,
    pub facing: f32,
    pub state: u8,
    pub state_time: f32,
    pub walked: f32,
    pub sibling_x: f32,
    pub sibling_y: f32,
    pub sibling_facing: f32,
    pub sibling_walked: f32,
    pub kabir_follows: bool,
    pub lights: [Light; GUARD_LIGHT_COUNT],
    pub embers: u8,
    pub stones: u8,
    pub item: u8,
    pub missile: Missile,
    pub guard_x: f32,
    pub guard_facing: f32,
    pub guard_state: u8,
    pub guard_time: f32,
    pub guard_walked: f32,
    pub suspicion: f32,
    /// Where he last saw or heard something.
    pub guard_target: f32,
    /// Seconds since he last saw her (suspicion only drains after a short while).
    pub unseen: f32,
    /// Seconds he has spent at the lamp post striking his tinder.
    pub relight: f32,
    pub cleared: bool,
    pub caught: bool,
    pub events: u32,
    pub rats: [Rat; GUARD_RAT_COUNT],
    /// Seconds the lamp has been out (0 while it burns).
    pub dark_time: f32,
    pub danger: f32,
    pub sibling_danger: f32,
    pub guard_danger: f32,
    /// The rats got him (rather than Mira's takedown).
    pub guard_eaten: bool,
    pub killed_by: u8,
}

impl Lit for GuardWorld { fn lit_at(&self, x: f32) -> bool { self.is_lit(x) } }

impl GuardWorld {
    pub fn new() -> GuardWorld {
        let mut lights = [Light::default(); GUARD_LIGHT_COUNT];
        for (index, &(x, height, radius, kind, lit)) in GUARD_LIGHTS.iter().enumerate() {
            lights[index] = Light { x, height, radius, intensity: 1.0, kind: kind as f32, lit: if lit { 1.0 } else { 0.0 }, left: 0.0, right: GUARD_STAGE_END };
        }
        let mut world = GuardWorld {
            time: 0.0, player_x: GUARD_START_X, player_y: 0.0, facing: 1.0, state: STATE_IDLE, state_time: 0.0, walked: 0.0,
            sibling_x: GUARD_START_X - SIBLING_GAP, sibling_y: 0.0, sibling_facing: 1.0, sibling_walked: 0.0, kabir_follows: false,
            lights, embers: 1, stones: MAX_STONES, item: ITEM_STONE, missile: Missile::default(),
            guard_x: 640.0, guard_facing: 1.0, guard_state: GUARD_PATROL, guard_time: 0.0, guard_walked: 0.0, suspicion: 0.0, guard_target: 640.0, unseen: 9.0, relight: 0.0,
            cleared: false, caught: false, events: 0,
            rats: [Rat::default(); GUARD_RAT_COUNT], dark_time: 0.0, danger: 0.0, sibling_danger: 0.0, guard_danger: 0.0, guard_eaten: false, killed_by: KILLED_BY_SPEAR,
        };
        let mut rats = world.rats;
        spawn_swarm(&world, &mut rats, &YARD_NEST);
        world.rats = rats;
        world
    }

    pub fn lamp_lit(&self) -> bool { self.lights[LAMP].lit > 0.5 }

    pub fn light_at(&self, x: f32) -> f32 {
        let mut best = 0.0f32;
        for light in &self.lights {
            if light.lit < 0.5 { continue; }
            let distance = (x - light.x).abs();
            if distance >= light.radius { continue; }
            best = best.max(((light.radius - distance) / (light.radius * 0.3)).min(1.0) * light.intensity);
        }
        best
    }
    pub fn is_lit(&self, x: f32) -> bool { self.light_at(x) >= LIT_LEVEL }

    fn guard_busy(&self) -> bool { matches!(self.guard_state, GUARD_DOWN | GUARD_SPEAR | GUARD_CHARGE) }

    /// Mira is close behind him, he stands in the dark, and she is down on the yard floor.
    pub fn can_strike(&self) -> bool {
        if self.guard_busy() || self.state == STATE_DEAD || self.player_y > -YARD_DEPTH + 4.0 { return false; }
        let offset = self.player_x - self.guard_x;
        offset.abs() < STRIKE_REACH && (offset * self.guard_facing < 0.0 || self.fumbling()) && !self.is_lit(self.guard_x)
    }

    /// At the lamp post striking his tinder: absorbed, he only notices someone right on top of him.
    pub fn fumbling(&self) -> bool { self.guard_state == GUARD_RELIGHT && self.relight > 0.0 }

    pub fn prompt(&self) -> u8 {
        if self.state == STATE_DEAD || self.state == STATE_STRIKE || self.cleared { return PROMPT_NONE; }
        if self.can_strike() { return PROMPT_STRIKE; }
        if (self.player_x - TORCH_X).abs() < REACH + 10.0 && self.embers == 0 { return PROMPT_TAKE_EMBER; }
        if (self.player_x - STONE_PILE_X).abs() < REACH && self.stones < MAX_STONES { return PROMPT_TAKE_STONES; }
        PROMPT_NONE
    }

    pub fn interact(&mut self) {
        match self.prompt() {
            PROMPT_TAKE_EMBER => { self.embers = 1; self.events |= EVENT_TAKE; }
            PROMPT_TAKE_STONES => { self.stones = MAX_STONES; self.events |= EVENT_TAKE; }
            PROMPT_STRIKE => {
                self.state = STATE_STRIKE;
                self.state_time = 0.0;
                self.facing = (self.guard_x - self.player_x).signum();
                self.guard_state = GUARD_DOWN;
                self.guard_time = 0.0;
                self.suspicion = 0.0;
                self.events |= EVENT_TAKEDOWN;
            }
            _ => {}
        }
    }

    /// The lamp, if the selected item would fly to it: a stone at a lit lamp, an ember at a dark one, ahead and in range.
    pub fn throw_target(&self) -> bool {
        let lamp = self.lights[LAMP];
        let distance = (lamp.x - self.player_x) * self.facing;
        if self.item == ITEM_STONE { self.stones > 0 && lamp.lit > 0.5 && (30.0..=STONE_RANGE).contains(&distance) }
        else { self.embers > 0 && lamp.lit < 0.5 && (30.0..=EMBER_RANGE).contains(&distance) }
    }

    pub fn throw_selected(&mut self) -> bool {
        if self.missile.active || self.cleared || !matches!(self.state, STATE_IDLE | STATE_WALK) { return false; }
        let item = self.item;
        if (item == ITEM_STONE && self.stones == 0) || (item == ITEM_EMBER && self.embers == 0) { return false; }
        let hits_lamp = self.throw_target();
        let lamp = self.lights[LAMP];
        let (land_x, land_y) = if hits_lamp { (lamp.x, lamp.height) } else { let x = (self.player_x + self.facing * 140.0).within(30.0, GUARD_STAGE_END - 30.0); (x, ground_at(x)) };
        let start_y = self.player_y + 34.0;
        let distance = land_x - self.player_x;
        let flight = 0.5 + distance.abs() / 750.0;
        self.missile = Missile {
            active: true, item, x: self.player_x + self.facing * 6.0, y: start_y, vx: distance / flight,
            vy: (land_y - start_y + 0.5 * GRAVITY * flight * flight) / flight, time: 0.0, flight, hits_lamp, land_y,
        };
        if item == ITEM_STONE { self.stones -= 1; } else { self.embers -= 1; }
        self.state = STATE_THROW;
        self.state_time = 0.0;
        self.events |= EVENT_THROW;
        true
    }

    pub fn step(&mut self, buttons: u8) {
        self.time += STEP;
        self.state_time += STEP;
        self.guard_time += STEP;
        if self.state == STATE_DEAD {
            if self.state_time >= DEATH_SECONDS && !self.caught { self.caught = true; self.events |= EVENT_CAUGHT; }
            self.step_guard();
            self.step_rats();
            return;
        }
        if self.cleared { self.move_sibling(); self.step_rats(); return; }
        self.move_player(buttons);
        self.step_missile();
        self.step_guard();
        self.step_rats();
        self.check_bites();
        if self.state == STATE_DEAD { return; }
        if !self.kabir_follows && self.guard_state == GUARD_DOWN && self.lamp_lit() { self.kabir_follows = true; self.events |= EVENT_KABIR_COMES; }
        self.move_sibling();
        if self.player_x >= GATE_X - 6.0 && self.kabir_follows && (self.sibling_x - self.player_x).abs() < 70.0 {
            self.cleared = true;
            self.state = STATE_IDLE;
            self.events |= EVENT_CLEAR;
        }
    }

    fn step_rats(&mut self) {
        let was_dark = self.dark_time;
        self.dark_time = if self.lamp_lit() { 0.0 } else { self.dark_time + STEP };
        if was_dark < DRAIN_DELAY && self.dark_time >= DRAIN_DELAY { self.events |= EVENT_RATS_OUT; }
        let emerge = if self.dark_time >= DRAIN_DELAY { Emerge::Drain(DRAIN_X) } else { Emerge::Closed };
        let dead = self.state == STATE_DEAD;
        let prey = [
            (self.player_x, dead || !self.is_lit(self.player_x)),
            (self.sibling_x, !self.is_lit(self.sibling_x)),
            // once he is down they leave him and come for whoever is still standing in the dark
            (self.guard_x, self.guard_state != GUARD_DOWN && !self.is_lit(self.guard_x)),
        ];
        let mut rats = self.rats;
        step_swarm(self, &mut rats, &YARD_NEST, &prey, emerge);
        self.rats = rats;
    }

    /// The stage-one rule for everyone: rats touching someone in the dark wear them down, and the light lets them recover.
    fn check_bites(&mut self) {
        let bitten = |world: &GuardWorld, x: f32| !world.is_lit(x) && swarm_touching(&world.rats, x);
        let (player, sibling) = (bitten(self, self.player_x), bitten(self, self.sibling_x));
        let guard = self.guard_state != GUARD_DOWN && bitten(self, self.guard_x);
        self.danger = if player { self.danger + STEP / BITE_SECONDS } else { (self.danger - STEP * 0.9).max(0.0) };
        self.sibling_danger = if sibling { self.sibling_danger + STEP / BITE_SECONDS } else { (self.sibling_danger - STEP * 0.9).max(0.0) };
        self.guard_danger = if guard { self.guard_danger + STEP / GUARD_BITE_SECONDS } else if self.guard_state == GUARD_DOWN { self.guard_danger } else { (self.guard_danger - STEP * 0.9).max(0.0) };
        if self.guard_danger >= 1.0 && self.guard_state != GUARD_DOWN {
            self.guard_danger = 1.0;
            self.guard_state = GUARD_DOWN;
            self.guard_time = 0.0;
            self.guard_eaten = true;
            self.suspicion = 0.0;
            self.relight = 0.0;
            self.events |= EVENT_GUARD_EATEN;
        }
        if self.danger >= 1.0 || self.sibling_danger >= 1.0 {
            self.state = STATE_DEAD;
            self.state_time = 0.0;
            self.killed_by = KILLED_BY_RATS;
            self.events |= EVENT_DEATH | EVENT_BITTEN;
        }
    }

    /// Rats are on him: he stamps and swats instead of striking his tinder.
    pub fn guard_beset(&self) -> bool { self.guard_state != GUARD_DOWN && !self.is_lit(self.guard_x) && swarm_touching(&self.rats, self.guard_x) }

    fn move_player(&mut self, buttons: u8) {
        if self.state == STATE_STRIKE && self.state_time < STRIKE_SECONDS { return; }
        if self.state == STATE_THROW && self.state_time < 0.35 { return; }
        let direction = (buttons & BUTTON_RIGHT != 0) as i32 as f32 - (buttons & BUTTON_LEFT != 0) as i32 as f32;
        if direction == 0.0 { self.state = STATE_IDLE; } else {
            self.facing = direction;
            // she can't leave through the gate without Kabir
            let limit = if self.kabir_follows { GUARD_STAGE_END - 20.0 } else { GATE_X - 6.0 };
            let on_stairs = (STAIRS_TOP..STAIRS_BOTTOM).contains(&self.player_x) || (EXIT_BOTTOM..EXIT_TOP).contains(&self.player_x);
            let speed = if on_stairs { WALK_SPEED * 0.8 } else { WALK_SPEED };
            let next = (self.player_x + direction * speed * STEP).within(20.0, limit);
            self.walked += (next - self.player_x).abs();
            self.player_x = next;
            self.state = STATE_WALK;
        }
        let ground = ground_at(self.player_x);
        self.player_y += (ground - self.player_y) * 0.4;
        if (ground - self.player_y).abs() < 0.2 { self.player_y = ground; }
    }

    fn move_sibling(&mut self) {
        let target = if self.kabir_follows { self.player_x - self.facing * SIBLING_GAP } else { KABIR_HIDE_X.min(self.player_x.max(GUARD_START_X) - SIBLING_GAP) };
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
        let ground = ground_at(self.sibling_x);
        self.sibling_y += (ground - self.sibling_y) * 0.4;
    }

    fn step_missile(&mut self) {
        if !self.missile.active { return; }
        let missile = &mut self.missile;
        missile.time += STEP;
        missile.x += missile.vx * STEP;
        missile.vy -= GRAVITY * STEP;
        missile.y += missile.vy * STEP;
        if missile.time < missile.flight { return; }
        missile.active = false;
        let (item, hits_lamp, x) = (missile.item, missile.hits_lamp, missile.x);
        if hits_lamp {
            if item == ITEM_STONE && self.lamp_lit() {
                self.lights[LAMP].lit = 0.0;
                self.events |= EVENT_SNUFF;
                if self.guard_state != GUARD_DOWN {
                    // startled: he goes to relight it
                    self.guard_state = GUARD_RELIGHT;
                    self.guard_time = 0.0;
                    self.suspicion = self.suspicion.max(0.25);
                }
                return;
            }
            if item == ITEM_EMBER && !self.lamp_lit() {
                self.lights[LAMP].lit = 1.0;
                self.events |= EVENT_IGNITE;
                if self.guard_state == GUARD_RELIGHT { self.guard_state = GUARD_SUSPICIOUS; self.guard_target = self.player_x; self.suspicion = self.suspicion.max(0.5); }
                return;
            }
        }
        if item == ITEM_STONE {
            self.events |= EVENT_CLATTER;
            // a stone clattering on the flagstones: he turns to look and wanders over
            if matches!(self.guard_state, GUARD_PATROL | GUARD_SUSPICIOUS) && (x - self.guard_x).abs() < NOISE_HEARING {
                self.guard_state = GUARD_SUSPICIOUS;
                self.guard_target = x;
                self.suspicion = self.suspicion.max(0.45);
                self.unseen = 0.0;
                self.events |= EVENT_NOTICE;
            }
        } else {
            self.events |= EVENT_FIZZLE;
        }
    }

    /// Can the soldier see Mira right now (and how close is she)?
    fn sees_player(&self) -> Option<f32> {
        if self.state == STATE_DEAD || self.player_y > -12.0 || self.guard_state == GUARD_DOWN { return None; }
        let offset = self.player_x - self.guard_x;
        let distance = offset.abs();
        let in_front = offset * self.guard_facing >= -4.0;
        if self.is_lit(self.player_x) && in_front && distance < SIGHT { return Some(distance); }
        let fumbling = self.fumbling();
        if in_front && distance < if fumbling { 8.0 } else { DARK_SIGHT } { return Some(distance); }
        // he hears footsteps right behind him
        if !fumbling && !in_front && distance < HEARING && self.state == STATE_WALK { return Some(SIGHT * 0.8); }
        None
    }

    fn walk_guard(&mut self, target: f32, speed: f32) -> bool {
        let delta = target - self.guard_x;
        if delta.abs() < 1.5 { return true; }
        let step = delta.signum() * (speed * STEP).min(delta.abs());
        self.guard_x = (self.guard_x + step).within(STAIRS_BOTTOM + 10.0, EXIT_BOTTOM - 10.0);
        self.guard_facing = delta.signum();
        self.guard_walked += step.abs();
        false
    }

    fn step_guard(&mut self) {
        match self.guard_state {
            GUARD_DOWN => return,
            GUARD_SPEAR => {
                if self.guard_time >= SPEAR_HIT && self.state != STATE_DEAD {
                    self.state = STATE_DEAD;
                    self.state_time = 0.0;
                    self.events |= EVENT_DEATH;
                }
                return;
            }
            GUARD_CHARGE => {
                // he runs her down, up the steps if need be
                let delta = self.player_x - self.guard_x;
                self.guard_facing = if delta == 0.0 { self.guard_facing } else { delta.signum() };
                let step = delta.signum() * (CHARGE_SPEED * STEP).min(delta.abs());
                self.guard_x = (self.guard_x + step).within(20.0, GUARD_STAGE_END - 20.0);
                self.guard_walked += step.abs();
                if (self.player_x - self.guard_x).abs() < SPEAR_REACH {
                    self.guard_state = GUARD_SPEAR;
                    self.guard_time = 0.0;
                    self.events |= EVENT_SPEAR;
                }
                return;
            }
            _ => {}
        }
        // suspicion
        match self.sees_player() {
            Some(distance) => {
                let rate = 0.45 + 1.6 * (1.0 - distance / SIGHT).max(0.0);
                if self.suspicion < 0.05 { self.events |= EVENT_NOTICE; }
                self.suspicion += rate * STEP;
                self.guard_target = self.player_x;
                self.unseen = 0.0;
                if self.guard_state == GUARD_PATROL { self.guard_state = GUARD_SUSPICIOUS; self.guard_time = 0.0; }
            }
            None => {
                self.unseen += STEP;
                if self.unseen > 1.2 { self.suspicion = (self.suspicion - 0.22 * STEP).max(0.0); }
            }
        }
        if self.suspicion >= 1.0 {
            self.suspicion = 1.0;
            self.guard_state = GUARD_CHARGE;
            self.guard_time = 0.0;
            self.events |= EVENT_ALARM;
            return;
        }
        match self.guard_state {
            GUARD_PATROL => {
                let end = if self.guard_facing > 0.0 { PATROL_RIGHT } else { PATROL_LEFT };
                if (self.guard_x - end).abs() < 1.5 {
                    // pause at the end of the beat, then turn round
                    if self.guard_time > PATROL_PAUSE { self.guard_facing = -self.guard_facing; self.guard_time = 0.0; }
                } else {
                    self.walk_guard(end, PATROL_SPEED);
                    self.guard_time = 0.0;
                }
            }
            GUARD_SUSPICIOUS => {
                let toward = (self.guard_target - self.guard_x).signum();
                if toward != 0.0 { self.guard_facing = toward; }
                if self.suspicion > 0.4 && self.unseen > 0.4 { self.walk_guard(self.guard_target.within(PATROL_LEFT - 60.0, PATROL_RIGHT + 60.0), SEARCH_SPEED); }
                if self.suspicion <= 0.0 { self.guard_state = GUARD_PATROL; self.guard_time = 0.0; }
            }
            GUARD_RELIGHT => {
                if self.lamp_lit() { self.guard_state = GUARD_SUSPICIOUS; self.relight = 0.0; return; }
                if self.guard_time < STARTLE_SECONDS { self.guard_facing = (LAMP_X - self.guard_x).signum(); return; }
                let post = if self.guard_x < LAMP_X { LAMP_X - 9.0 } else { LAMP_X + 9.0 };
                if self.walk_guard(post, SEARCH_SPEED) {
                    // at the post, fumbling with his tinder, facing the lamp
                    self.guard_facing = (LAMP_X - self.guard_x).signum();
                    if !self.guard_beset() { self.relight += STEP; }
                    if self.relight >= RELIGHT_SECONDS {
                        self.relight = 0.0;
                        self.lights[LAMP].lit = 1.0;
                        self.guard_state = GUARD_SUSPICIOUS;
                        self.suspicion = self.suspicion.max(0.35);
                        self.unseen = 0.0;
                        self.guard_target = self.guard_x;
                        self.events |= EVENT_GUARD_RELIT;
                    }
                } else {
                    self.relight = 0.0;
                }
            }
            _ => {}
        }
    }
}

/// Stage two as JavaScript sees it: the same fixed 60 Hz step as stage one.
#[wasm_bindgen]
pub struct GuardSteps { world: GuardWorld, buttons: u8, carry: f32, events: u32 }

impl Default for GuardSteps { fn default() -> Self { Self::new() } }

#[wasm_bindgen]
impl GuardSteps {
    #[wasm_bindgen(constructor)]
    pub fn new() -> GuardSteps { GuardSteps { world: GuardWorld::new(), buttons: 0, carry: 0.0, events: 0 } }

    /// Held buttons: 1 left, 2 right.
    pub fn set_input(&mut self, buttons: u8) { self.buttons = buttons; }
    pub fn interact(&mut self) { self.world.interact(); self.collect(); }
    /// Throw whatever is selected (stone or ember). False if nothing was thrown.
    pub fn throw_selected(&mut self) -> bool { let thrown = self.world.throw_selected(); self.collect(); thrown }
    /// 0 ember, 1 stone.
    pub fn select_item(&mut self, item: u8) { self.world.item = if item == ITEM_EMBER { ITEM_EMBER } else { ITEM_STONE }; }
    pub fn toggle_item(&mut self) { self.world.item = if self.world.item == ITEM_EMBER { ITEM_STONE } else { ITEM_EMBER }; }

    pub fn advance(&mut self, ms: f32) {
        let ms = if ms.is_finite() { ms.within(0.0, 200.0) } else { 0.0 };
        self.carry += ms / 1000.0;
        let mut steps = 0;
        while self.carry >= STEP && steps < MAX_STEPS {
            self.carry -= STEP;
            steps += 1;
            self.world.step(self.buttons);
            self.collect();
        }
        if steps == MAX_STEPS { self.carry = 0.0; }
    }

    fn collect(&mut self) { self.events |= self.world.events; self.world.events = 0; }
    pub fn take_events(&mut self) -> u32 { let events = self.events; self.events = 0; events }

    pub fn player_x(&self) -> f32 { self.world.player_x }
    pub fn player_y(&self) -> f32 { self.world.player_y }
    pub fn facing(&self) -> f32 { self.world.facing }
    pub fn state(&self) -> u8 { self.world.state }
    pub fn state_time(&self) -> f32 { self.world.state_time }
    pub fn walked(&self) -> f32 { self.world.walked }
    pub fn sibling_x(&self) -> f32 { self.world.sibling_x }
    pub fn sibling_y(&self) -> f32 { self.world.sibling_y }
    pub fn sibling_facing(&self) -> f32 { self.world.sibling_facing }
    pub fn sibling_walked(&self) -> f32 { self.world.sibling_walked }
    pub fn kabir_follows(&self) -> bool { self.world.kabir_follows }
    pub fn player_lit(&self) -> bool { self.world.is_lit(self.world.player_x) }
    pub fn light_at(&self, x: f32) -> f32 { self.world.light_at(x) }
    pub fn ground_at(&self, x: f32) -> f32 { ground_at(x) }
    pub fn lamp_lit(&self) -> bool { self.world.lamp_lit() }
    pub fn embers(&self) -> u8 { self.world.embers }
    pub fn stones(&self) -> u8 { self.world.stones }
    pub fn item(&self) -> u8 { self.world.item }
    pub fn prompt(&self) -> u8 { self.world.prompt() }
    pub fn throw_target(&self) -> bool { self.world.throw_target() }
    pub fn cleared(&self) -> bool { self.world.cleared }
    /// The spear found her and the fall is over: game over.
    pub fn caught(&self) -> bool { self.world.caught }
    /// What ended the run: 0 the spear, 1 the rats.
    pub fn killed_by(&self) -> u8 { self.world.killed_by }
    /// 0…1: how close the rats are to finishing Mira or Kabir.
    pub fn danger(&self) -> f32 { self.world.danger.max(self.world.sibling_danger).min(1.0) }
    /// 0…1: how close the rats are to finishing the soldier.
    pub fn guard_danger(&self) -> f32 { self.world.guard_danger.min(1.0) }
    pub fn guard_eaten(&self) -> bool { self.world.guard_eaten }
    pub fn guard_beset(&self) -> bool { self.world.guard_beset() }
    /// Seconds the lamp has been dark.
    pub fn dark_time(&self) -> f32 { self.world.dark_time }
    pub fn rat_count(&self) -> usize { GUARD_RAT_COUNT }
    /// rat_count × 8 × 4 bytes, the same layout as stage one's rats.
    pub fn rats_ptr(&self) -> *const Rat { self.world.rats.as_ptr() }
    pub fn time(&self) -> f32 { self.world.time }

    pub fn guard_x(&self) -> f32 { self.world.guard_x }
    pub fn guard_y(&self) -> f32 { ground_at(self.world.guard_x) }
    pub fn guard_facing(&self) -> f32 { self.world.guard_facing }
    pub fn guard_state(&self) -> u8 { self.world.guard_state }
    pub fn guard_time(&self) -> f32 { self.world.guard_time }
    pub fn guard_walked(&self) -> f32 { self.world.guard_walked }
    pub fn suspicion(&self) -> f32 { self.world.suspicion }
    /// 0…1 while he strikes his tinder at the lamp post.
    pub fn relight_progress(&self) -> f32 { self.world.relight / RELIGHT_SECONDS }

    pub fn missile_active(&self) -> bool { self.world.missile.active }
    pub fn missile_item(&self) -> u8 { self.world.missile.item }
    pub fn missile_x(&self) -> f32 { self.world.missile.x }
    pub fn missile_y(&self) -> f32 { self.world.missile.y }

    pub fn light_count(&self) -> usize { GUARD_LIGHT_COUNT }
    /// light_count × 8 f32, the same layout as stage one's lights.
    pub fn lights_ptr(&self) -> *const Light { self.world.lights.as_ptr() }

    /// Test hook: put Mira at x (standing on the ground there).
    pub fn debug_place(&mut self, x: f32) { self.world.player_x = x.within(20.0, GATE_X - 6.0); self.world.player_y = ground_at(self.world.player_x); }
    /// Test hook: put the soldier at x facing the given way, back on patrol.
    pub fn debug_guard(&mut self, x: f32, facing: f32) { self.world.guard_x = x; self.world.guard_facing = if facing < 0.0 { -1.0 } else { 1.0 }; self.world.guard_state = GUARD_PATROL; self.world.guard_time = 0.0; self.world.suspicion = 0.0; }
}

#[cfg(test)]
mod guard_tests {
    use super::*;

    fn run(game: &mut GuardSteps, buttons: u8, seconds: f32) { game.set_input(buttons); for _ in 0..(seconds * 60.0) as usize { game.advance(1000.0 / 60.0); } }
    fn walk_to(game: &mut GuardSteps, x: f32) {
        for _ in 0..4000 { if (game.player_x() - x).abs() < 1.5 || game.state() == STATE_DEAD { break; } game.set_input(if game.player_x() < x { BUTTON_RIGHT } else { BUTTON_LEFT }); game.advance(1000.0 / 60.0); }
        game.set_input(0);
    }

    #[test]
    fn the_steps_go_down_into_the_yard_and_up_to_the_gate() {
        assert_eq!(ground_at(100.0), 0.0);
        assert_eq!(ground_at(700.0), -YARD_DEPTH);
        assert!(ground_at(420.0) < 0.0 && ground_at(420.0) > -YARD_DEPTH);
        assert_eq!(ground_at(GATE_X), 0.0);
    }

    #[test]
    fn walking_into_the_lamp_light_fills_his_suspicion_and_the_spear_ends_it() {
        let mut game = GuardSteps::new();
        game.debug_place(520.0);
        game.debug_guard(640.0, -1.0);
        run(&mut game, 0, 0.2);
        assert!(game.suspicion() > 0.0 || game.state() == STATE_DEAD);
        run(&mut game, 0, 6.0);
        assert_eq!(game.state(), STATE_DEAD);
        assert!(game.caught());
    }

    #[test]
    fn a_stone_snuffs_the_lamp_a_takedown_in_the_dark_an_ember_relights_it_and_both_reach_the_gate() {
        let mut game = GuardSteps::new();
        game.debug_guard(840.0, 1.0);
        walk_to(&mut game, 375.0);
        assert_eq!(game.item(), ITEM_STONE);
        assert!(game.throw_target());
        assert!(game.throw_selected());
        run(&mut game, 0, 1.0);
        assert!(!game.lamp_lit());
        assert_eq!(game.guard_state(), GUARD_RELIGHT);
        assert_eq!(game.stones(), MAX_STONES - 1);
        // hurry down while he heads for the post: the rats are already stirring in the drain
        walk_to(&mut game, 620.0);
        for _ in 0..600 { if game.prompt() == PROMPT_STRIKE { break; } let toward = if game.player_x() < game.guard_x() { BUTTON_RIGHT } else { BUTTON_LEFT }; game.set_input(toward); game.advance(1000.0 / 60.0); }
        assert_eq!(game.prompt(), PROMPT_STRIKE, "guard {} state {} mira {} susp {}", game.guard_x(), game.guard_state(), game.player_x(), game.suspicion());
        assert!(game.dark_time() < DRAIN_DELAY, "the takedown beats the rats out of the drain ({}s dark)", game.dark_time());
        game.interact();
        assert_eq!(game.guard_state(), GUARD_DOWN);
        assert!(!game.guard_eaten());
        run(&mut game, 0, 0.6);
        assert!(!game.kabir_follows(), "Kabir waits while the yard is dark");
        // step back from the post and throw the ember up at the dark lamp before the rats come up
        walk_to(&mut game, LAMP_X - 60.0);
        game.select_item(ITEM_EMBER);
        run(&mut game, BUTTON_RIGHT, 0.05); game.set_input(0);
        assert!(game.throw_target());
        assert!(game.throw_selected());
        run(&mut game, 0, 1.5);
        assert_ne!(game.state(), STATE_DEAD, "relit in time: {}s dark", game.dark_time());
        assert!(game.lamp_lit());
        assert!(game.kabir_follows());
        walk_to(&mut game, GUARD_STAGE_END - 20.0);
        run(&mut game, 0, 3.0);
        assert!(game.cleared());
        assert!(!game.caught());
    }

    #[test]
    fn a_stone_on_the_flagstones_draws_him_over_and_supplies_refill() {
        let mut game = GuardSteps::new();
        game.debug_guard(560.0, -1.0);
        game.debug_place(470.0);
        game.select_item(ITEM_STONE);
        // facing left: the stone clatters on the terrace steps behind her, near enough for him to hear
        run(&mut game, BUTTON_LEFT, 0.05); game.set_input(0);
        let stones = game.stones();
        assert!(game.throw_selected());
        run(&mut game, 0, 1.2);
        assert_eq!(game.stones(), stones - 1);
        assert_eq!(game.guard_state(), GUARD_SUSPICIOUS);
        walk_to(&mut game, STONE_PILE_X);
        assert_eq!(game.prompt(), PROMPT_TAKE_STONES);
        game.interact();
        assert_eq!(game.stones(), MAX_STONES);
    }

    fn rats_out(game: &GuardSteps) -> usize { game.world.rats.iter().filter(|rat| rat.state != crate::rats::RAT_HIDDEN).count() }

    #[test]
    fn while_the_lamp_burns_the_rats_stay_down_the_drain() {
        let mut game = GuardSteps::new();
        assert_eq!(rats_out(&game), 0);
        walk_to(&mut game, 340.0);
        run(&mut game, 0, 8.0);
        assert_eq!(rats_out(&game), 0);
        assert_eq!(game.guard_danger(), 0.0);
    }

    #[test]
    fn a_snuffed_lamp_left_dark_lets_the_rats_take_him_wherever_he_was() {
        for (x, facing) in [(550.0, -1.0), (640.0, 1.0), (700.0, -1.0), (760.0, 1.0), (855.0, 1.0)] {
            let mut game = GuardSteps::new();
            game.debug_guard(x, facing);
            walk_to(&mut game, 375.0);
            run(&mut game, BUTTON_RIGHT, 0.02); game.set_input(0);
            assert!(game.throw_selected());
            // Mira waits up on the steps, out of the rats' reach; the drain stays shut for a while
            run(&mut game, 0, 1.0 + DRAIN_DELAY - 0.5);
            assert!(!game.lamp_lit());
            assert_eq!(rats_out(&game), 0, "nothing comes up out of the drain at first");
            run(&mut game, 0, 4.0);
            assert!(game.guard_eaten(), "the rats got the soldier who started at {x}");
            assert_eq!(game.guard_state(), GUARD_DOWN);
            assert!(!game.lamp_lit(), "he never got it relit");
            assert_ne!(game.state(), STATE_DEAD, "the rats can't reach Mira on the steps");
            // relight it from the foot of the top steps (still out of their reach): the rats scatter, and Kabir comes down
            walk_to(&mut game, 400.0);
            assert_ne!(game.state(), STATE_DEAD);
            game.select_item(ITEM_EMBER);
            assert!(game.throw_target());
            assert!(game.throw_selected());
            run(&mut game, 0, 2.0);
            assert!(game.lamp_lit());
            assert!(game.kabir_follows());
            walk_to(&mut game, GUARD_STAGE_END - 20.0);
            run(&mut game, 0, 3.0);
            assert!(game.cleared(), "both reach the gate");
            assert!(!game.caught());
        }
    }

    #[test]
    fn mira_in_the_dark_yard_once_the_rats_are_out_is_bitten_to_death() {
        let mut game = GuardSteps::new();
        game.debug_guard(855.0, 1.0);
        walk_to(&mut game, 375.0);
        run(&mut game, BUTTON_RIGHT, 0.02); game.set_input(0);
        assert!(game.throw_selected());
        run(&mut game, 0, 1.0 + DRAIN_DELAY + 1.5);
        walk_to(&mut game, 600.0);
        run(&mut game, 0, 3.0);
        assert_eq!(game.state(), STATE_DEAD);
        assert_eq!(game.killed_by(), KILLED_BY_RATS);
        run(&mut game, 0, DEATH_SECONDS + 0.2);
        assert!(game.caught());
    }
}
