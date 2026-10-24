//! Carrom board physics: a fixed time step, sliding friction, cushions, corner pockets and coin collisions.
//!
//! Units: the playing surface is 1000 × 1000 (about 0.74 m), y grows downwards. Everything lives in fixed arrays
//! (an object pool of 20 bodies), so a step never allocates. Only sqrt is used (no trig), which is exact in
//! WebAssembly, so two browsers given the same shot get the same result.

pub const BOARD: f32 = 1000.0;
pub const COIN_R: f32 = 21.5;
pub const STRIKER_R: f32 = 27.5;
pub const COIN_MASS: f32 = 1.0;
pub const STRIKER_MASS: f32 = 2.7;
pub const POCKET_R: f32 = 31.0;
/// A body falls when its centre comes this close to a pocket's centre.
pub const POCKET_CAPTURE: f32 = 30.0;
pub const POCKETS: [(f32, f32); 4] = [(31.0, 31.0), (969.0, 31.0), (31.0, 969.0), (969.0, 969.0)];
/// 400 steps per simulated second.
pub const DT: f32 = 1.0 / 400.0;
/// Sliding friction (units / s²) plus a little speed-proportional drag (1 / s).
pub const FRICTION: f32 = 1500.0;
pub const DRAG: f32 = 0.5;
pub const REST_SPEED: f32 = 5.0;
pub const CUSHION_BOUNCE: f32 = 0.68;
pub const COIN_BOUNCE: f32 = 0.9;
pub const MIN_SPEED: f32 = 300.0;
pub const MAX_SPEED: f32 = 4200.0;
/// A shot can't run longer than this (simulated seconds) — a guard against endless creeping.
pub const MAX_SHOT_STEPS: u32 = 400 * 14;
pub const BODIES: usize = 20;

/// One disc. `#[repr(C)]` so JavaScript can read the pool straight from wasm memory (7 floats each).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Body {
    pub x: f32, pub y: f32, pub vx: f32, pub vy: f32, pub r: f32, pub mass: f32,
    /// 1 on the board, 0 pocketed
    pub on: f32,
}

impl Body {
    pub const fn new(r: f32, mass: f32) -> Body { Body { x: 500.0, y: 500.0, vx: 0.0, vy: 0.0, r, mass, on: 1.0 } }
    #[inline] pub fn is_on(&self) -> bool { self.on > 0.5 }
    #[inline] pub fn is_moving(&self) -> bool { self.vx != 0.0 || self.vy != 0.0 }
}

/// What happened during the steps since the last `take` (for sounds) — strongest impacts and pockets.
#[derive(Clone, Copy, Default, Debug)]
pub struct Impacts { pub coin: f32, pub cushion: f32, pub pockets: u32 }

#[derive(Clone, Copy)]
pub struct World {
    pub bodies: [Body; BODIES],
    /// Bodies pocketed during the current shot, in order.
    pub fallen: [u8; BODIES],
    pub fallen_count: usize,
    /// The striker touched a coin this shot.
    pub striker_touched: bool,
    pub impacts: Impacts,
    pub steps: u32,
}

impl World {
    pub fn new() -> World {
        let mut bodies = [Body::new(COIN_R, COIN_MASS); BODIES];
        bodies[0] = Body::new(STRIKER_R, STRIKER_MASS);
        World { bodies, fallen: [0; BODIES], fallen_count: 0, striker_touched: false, impacts: Impacts::default(), steps: 0 }
    }

    pub fn any_moving(&self) -> bool { self.bodies.iter().any(|body| body.is_on() && body.is_moving()) }

    pub fn stop_all(&mut self) { for body in self.bodies.iter_mut() { body.vx = 0.0; body.vy = 0.0; } }

    /// One fixed step. Returns true while something still moves.
    pub fn step(&mut self) -> bool {
        self.steps += 1;
        let mut moving = false;
        for index in 0..BODIES {
            let body = &mut self.bodies[index];
            if !body.is_on() || !body.is_moving() { continue; }
            body.x += body.vx * DT;
            body.y += body.vy * DT;
            let speed = (body.vx * body.vx + body.vy * body.vy).sqrt();
            let loss = FRICTION * DT + speed * DRAG * DT;
            if speed <= loss || speed < REST_SPEED { body.vx = 0.0; body.vy = 0.0; } else {
                let keep = (speed - loss) / speed;
                body.vx *= keep;
                body.vy *= keep;
                moving = true;
            }
            // pockets first: a disc running along a cushion into a corner drops in
            if POCKETS.iter().any(|&(px, py)| { let (dx, dy) = (body.x - px, body.y - py); dx * dx + dy * dy < POCKET_CAPTURE * POCKET_CAPTURE }) {
                body.on = 0.0; body.vx = 0.0; body.vy = 0.0;
                if self.fallen_count < BODIES { self.fallen[self.fallen_count] = index as u8; self.fallen_count += 1; }
                self.impacts.pockets += 1;
                continue;
            }
            let r = body.r;
            let mut hit = 0.0f32;
            if body.x < r { body.x = r; if body.vx < 0.0 { hit = hit.max(-body.vx); body.vx = -body.vx * CUSHION_BOUNCE; body.vy *= 0.95; } }
            if body.x > BOARD - r { body.x = BOARD - r; if body.vx > 0.0 { hit = hit.max(body.vx); body.vx = -body.vx * CUSHION_BOUNCE; body.vy *= 0.95; } }
            if body.y < r { body.y = r; if body.vy < 0.0 { hit = hit.max(-body.vy); body.vy = -body.vy * CUSHION_BOUNCE; body.vx *= 0.95; } }
            if body.y > BOARD - r { body.y = BOARD - r; if body.vy > 0.0 { hit = hit.max(body.vy); body.vy = -body.vy * CUSHION_BOUNCE; body.vx *= 0.95; } }
            if hit > self.impacts.cushion { self.impacts.cushion = hit; }
        }
        // collisions: only pairs where at least one disc moves
        for a in 0..BODIES {
            if !self.bodies[a].is_on() { continue; }
            for b in (a + 1)..BODIES {
                if !self.bodies[b].is_on() || !(self.bodies[a].is_moving() || self.bodies[b].is_moving()) { continue; }
                if self.collide(a, b) { moving = true; if a == 0 { self.striker_touched = true; } }
            }
        }
        moving || self.any_moving()
    }

    /// Elastic-ish collision with positional correction. True if the pair touched.
    fn collide(&mut self, a: usize, b: usize) -> bool {
        let (p, q) = (self.bodies[a], self.bodies[b]);
        let (dx, dy) = (q.x - p.x, q.y - p.y);
        let reach = p.r + q.r;
        let distance_squared = dx * dx + dy * dy;
        if distance_squared >= reach * reach { return false; }
        let distance = distance_squared.sqrt().max(0.0001);
        let (nx, ny) = (dx / distance, dy / distance);
        let (inverse_p, inverse_q) = (1.0 / p.mass, 1.0 / q.mass);
        // push apart in proportion to the inverse masses
        let overlap = reach - distance;
        let share = overlap / (inverse_p + inverse_q);
        self.bodies[a].x -= nx * share * inverse_p; self.bodies[a].y -= ny * share * inverse_p;
        self.bodies[b].x += nx * share * inverse_q; self.bodies[b].y += ny * share * inverse_q;
        let approach = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if approach <= 0.0 { return true; }
        let impulse = (1.0 + COIN_BOUNCE) * approach / (inverse_p + inverse_q);
        self.bodies[a].vx -= impulse * inverse_p * nx; self.bodies[a].vy -= impulse * inverse_p * ny;
        self.bodies[b].vx += impulse * inverse_q * nx; self.bodies[b].vy += impulse * inverse_q * ny;
        if approach > self.impacts.coin { self.impacts.coin = approach; }
        true
    }

    /// Runs until everything rests (or the step guard trips). Returns the number of steps.
    pub fn settle(&mut self) -> u32 {
        let start = self.steps;
        while self.step() { if self.steps - start >= MAX_SHOT_STEPS { self.stop_all(); break; } }
        self.steps - start
    }

    pub fn take_impacts(&mut self) -> Impacts { let value = self.impacts; self.impacts = Impacts::default(); value }

    /// True if a disc of radius `r` at (x, y) doesn't overlap any disc on the board (except `skip`).
    pub fn is_free(&self, x: f32, y: f32, r: f32, skip: usize) -> bool {
        self.bodies.iter().enumerate().all(|(index, body)| {
            if index == skip || !body.is_on() { return true; }
            let (dx, dy) = (body.x - x, body.y - y);
            dx * dx + dy * dy >= (body.r + r) * (body.r + r)
        })
    }
}

impl Default for World { fn default() -> Self { World::new() } }

/// Shot speed for a power of 1…1000.
pub fn speed_of(power: u32) -> f32 { MIN_SPEED + (MAX_SPEED - MIN_SPEED) * (power.min(1000) as f32 / 1000.0) }
/// The power (1…1000) for a wanted speed.
pub fn power_of(speed: f32) -> u32 { (((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 1000.0).clamp(1.0, 1000.0) as u32 }
/// Distance a disc slides from `speed` before stopping (sliding friction only — a slight overestimate).
pub fn slide_distance(speed: f32) -> f32 { speed * speed / (2.0 * FRICTION) }
