//! The jeep. Two wheels rest on the road; gas drives the rear wheel and lifts the nose, brake digs the nose
//! down. Fuel burns while the engine pulls. Coins and jerry cans sit on the road. Flip onto the roof, or roll
//! to a stop with an empty tank, and the climb is over. Crossing the pass upright clears it.

use crate::course::*;

pub const STEP: f32 = 1.0 / 120.0;
pub const MAX_STEPS: u32 = 10;
pub const WHEEL_R: f32 = 6.5;
pub const REAR: f32 = -16.0;
pub const FRONT: f32 = 15.5;
/// Axle, in body space (negative is down).
pub const AXLE: f32 = -5.0;
pub const ROOF: f32 = 11.5;
const GRAVITY: f32 = 46.0;
const ENGINE: f32 = 74.0;
/// Top speed on the flat. The engine pulls at full force until near it, so the gas answers at once.
const TOP_SPEED: f32 = 110.0;
const INERTIA: f32 = 340.0;
/// Kinetic friction as a fraction of the weight. On the flat this is all that slows a coast, so stopping takes
/// a while. On a hill it is smaller than the slope's pull, but it still spends energy, so a drop never quite
/// climbs back to the height it fell from.
const FRICTION: f32 = 0.12;
const BRAKE_FORCE: f32 = 75.0;
const PITCH_SHARE: f32 = 0.6;
/// Suspension droop: how far the body can lift off a tyre before the tyre leaves the road.
pub const TOUCH: f32 = 1.5;
const REVERSE: f32 = 32.0;
const AIR_GAS: f32 = 0.6;
const AIR_BRAKE: f32 = 2.4;
const BURN: f32 = 3.0;
pub const FUEL_MAX: f32 = 100.0;
const FUEL_CAN: f32 = 46.0;
const COIN_SCORE: u32 = 25;
const FINISH_BONUS: u32 = 500;
const PICK_REACH: f32 = 16.0;

pub const PHASE_READY: u8 = 0;
pub const PHASE_DRIVING: u8 = 1;
pub const PHASE_CRASHED: u8 = 2;
pub const PHASE_STRANDED: u8 = 3;
pub const PHASE_FINISHED: u8 = 4;

pub const BUTTON_GAS: u8 = 1;
pub const BUTTON_BRAKE: u8 = 2;

pub const EVENT_COIN: u32 = 1;
pub const EVENT_FUEL: u32 = 2;
pub const EVENT_CRASH: u32 = 4;
pub const EVENT_STRANDED: u32 = 8;
pub const EVENT_FINISH: u32 = 16;

pub const KIND_COIN: f32 = 1.0;
pub const KIND_FUEL: f32 = 2.0;

/// One pickup as the renderer reads it: x, y, kind (1 coin, 2 fuel), taken (0 or 1).
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct Pickup { pub x: f32, pub y: f32, pub kind: f32, pub taken: f32 }

#[derive(Clone, Debug)]
pub struct World {
    pub x: f32,
    pub y: f32,
    pub angle: f32,
    pub vx: f32,
    pub vy: f32,
    pub omega: f32,
    pub spin: f32,
    pub fuel: f32,
    pub coins: u32,
    pub best_x: f32,
    pub time: f32,
    pub phase: u8,
    pub events: u32,
    pub slow: f32,
    /// Engine pull this step, 0 to 1. Zero while gas is held means the rear tyre is off the road.
    pub drive: f32,
    /// Share of the engine spent holding the slope, 0 to 1.5.
    pub strain: f32,
    /// Bit 1: rear tyre on the road. Bit 2: front tyre on the road.
    pub contact: u8,
    pub pickups: [Pickup; PICKUP_COUNT],
}

impl World {
    pub fn new() -> World {
        let mut pickups = [Pickup { x: 0.0, y: 0.0, kind: 0.0, taken: 0.0 }; PICKUP_COUNT];
        for (index, &x) in COIN_X.iter().enumerate() {
            pickups[index] = Pickup { x, y: height(x) + COIN_LIFT, kind: KIND_COIN, taken: 0.0 };
        }
        for (index, &x) in FUEL_X.iter().enumerate() {
            pickups[COIN_X.len() + index] = Pickup { x, y: height(x) + FUEL_LIFT, kind: KIND_FUEL, taken: 0.0 };
        }
        let mut world = World {
            x: 0.0, y: 0.0, angle: 0.0, vx: 0.0, vy: 0.0, omega: 0.0, spin: 0.0, fuel: FUEL_MAX, coins: 0, best_x: 36.0,
            time: 0.0, phase: PHASE_READY, events: 0, slow: 0.0, drive: 0.0, strain: 0.0, contact: 3, pickups,
        };
        world.place(36.0);
        world.best_x = world.x;
        world
    }

    /// Sit the jeep on the road at x, upright to the grade, stopped.
    pub fn place(&mut self, x: f32) {
        let x = if x < 20.0 { 20.0 } else { x };
        self.angle = grade(x);
        let (_, cos_a) = sine_cosine(self.angle);
        self.x = x;
        self.y = height(x) + WHEEL_R - AXLE * cos_a;
        self.vx = 0.0;
        self.vy = 0.0;
        self.omega = 0.0;
    }

    pub fn start(&mut self) {
        if self.phase == PHASE_READY { self.phase = PHASE_DRIVING; }
    }

    /// Continue a saved climb: on the road at x, with this much fuel and these coins already picked up.
    pub fn restore(&mut self, x: f32, fuel: f32, coins: u32) {
        self.place(x);
        self.fuel = if fuel < 0.0 { 0.0 } else if fuel > FUEL_MAX { FUEL_MAX } else { fuel };
        self.coins = coins;
        self.best_x = self.x;
        self.phase = PHASE_DRIVING;
        self.slow = 0.0;
        for pickup in &mut self.pickups {
            if pickup.x < self.x - 8.0 { pickup.taken = 1.0; }
        }
    }

    pub fn score(&self) -> u32 {
        let meters = if self.best_x < 0.0 { 0 } else { self.best_x as u32 };
        meters + self.coins * COIN_SCORE + if self.phase == PHASE_FINISHED { FINISH_BONUS } else { 0 }
    }

    pub fn step(&mut self, buttons: u8) {
        if self.phase != PHASE_DRIVING { return; }
        self.time += STEP;
        let gas = buttons & BUTTON_GAS != 0;
        let brake = buttons & BUTTON_BRAKE != 0;
        // Same mechanism as Hill Climb: gravity pulls the chassis, the road pushes at the tyres.
        // Gas is a force at the rear tyre, so the jeep rolls forward and the nose lifts. Velocity is only
        // changed by those forces — it is never rewritten.
        self.vy -= GRAVITY * STEP;
        self.x += self.vx * STEP;
        self.y += self.vy * STEP;
        self.angle = wrap_pi(self.angle + self.omega * STEP);
        let (sin_a, cos_a) = sine_cosine(self.angle);
        let mut wheels_down = 0u8;
        let mut rear_down = false;
        self.drive = 0.0;
        for &(along, powered) in &[(REAR, true), (FRONT, false)] {
            let (wx, wy) = body_point(self.x, self.y, sin_a, cos_a, along, AXLE);
            let (nx, ny) = normal(wx);
            let (tx, ty) = (ny, -nx);
            let pen = WHEEL_R - (wy - height(wx)) * ny;
            // a tyre resting on the road hovers around zero sink; it still grips there
            if pen <= -TOUCH { continue; }
            wheels_down += 1;
            if powered { rear_down = true; }
            let corr = (pen - 0.04).limit(0.0, 0.4) * 0.35;
            self.x += nx * corr;
            self.y += ny * corr;
            let rx = wx - self.x;
            let ry = wy - self.y;
            let pvx = self.vx - self.omega * ry;
            let pvy = self.vy + self.omega * rx;
            let vn = pvx * nx + pvy * ny;
            let rn = rx * ny - ry * nx;
            let kn = 1.0 + rn * rn / INERTIA;
            // stiff spring and damper: the tyre barely sinks, so a downhill shoves the chassis at once
            let bias = ((pen - 0.04).max(0.0) * 4.5).min(8.0);
            let mut jn = (-1.15 * vn + bias) / kn;
            if jn < 0.0 { jn = 0.0; }
            self.vx += jn * nx;
            self.vy += jn * ny;
            self.omega += (rx * jn * ny - ry * jn * nx) / INERTIA;
            let pvx = self.vx - self.omega * ry;
            let pvy = self.vy + self.omega * rx;
            let vt = pvx * tx + pvy * ty;
            let mut force = 0.0;
            if vt.abs() > 0.25 {
                let sign = if vt > 0.0 { 1.0 } else { -1.0 };
                force -= sign * FRICTION * GRAVITY * ny * 0.55;
            }
            if gas && powered && self.fuel > 0.0 {
                // full pull until close to top speed, then it tapers
                let headroom = ((TOP_SPEED - vt) / (TOP_SPEED * 0.3)).limit(0.0, 1.0);
                force += ENGINE * headroom;
                self.drive = headroom;
                self.fuel = (self.fuel - BURN * STEP).max(0.0);
            } else if brake && powered && vt > -8.0 && vt < 4.0 && self.fuel > 0.0 {
                force -= REVERSE;
                self.fuel = (self.fuel - BURN * 0.25 * STEP).max(0.0);
            }
            // both wheels brake, and the brake grips right away
            if brake && vt > 4.0 { force -= BRAKE_FORCE.min(vt / STEP * 0.5); }
            let jt = force * STEP;
            self.vx += jt * tx;
            self.vy += jt * ty;
            // the suspension soaks up part of the pitch, so a strong pull doesn't loop the jeep
            self.omega += (rx * jt * ty - ry * jt * tx) / INERTIA * PITCH_SHARE;
        }
        self.contact = if rear_down { 1 } else { 0 } | if wheels_down > (rear_down as u8) { 2 } else { 0 };
        // how much of the engine the slope eats: past 1 the jeep can't hold the hill
        let (nx, _) = normal(self.x);
        self.strain = if gas && self.fuel > 0.0 { ((-nx * GRAVITY + FRICTION * GRAVITY * 0.55) / ENGINE).limit(0.0, 1.5) } else { 0.0 };
        if wheels_down > 0 {
            // a heavy body doesn't keep spinning after a bump
            self.omega *= 0.97;
        } else {
            if gas && self.fuel > 0.0 {
                self.omega += AIR_GAS * STEP;
                self.fuel = (self.fuel - BURN * 0.3 * STEP).max(0.0);
            }
            if brake { self.omega -= AIR_BRAKE * STEP; }
        }
        self.spin += self.vx * STEP / WHEEL_R;
        self.vx = self.vx.limit(-70.0, 155.0);
        self.vy = self.vy.limit(-120.0, 90.0);
        self.omega = self.omega.limit(-4.2, 4.2);
        if self.x < 18.0 { self.x = 18.0; if self.vx < 0.0 { self.vx = 0.0; } }
        if self.x > self.best_x { self.best_x = self.x; }

        self.collect();
        if self.crashed(sin_a, cos_a) {
            self.phase = PHASE_CRASHED;
            self.events |= EVENT_CRASH;
            return;
        }
        if cos_a > 0.35 && self.x >= FINISH_X {
            self.phase = PHASE_FINISHED;
            self.events |= EVENT_FINISH;
            return;
        }
        let speed = (self.vx * self.vx + self.vy * self.vy).sqrt();
        if self.fuel <= 0.0 && wheels_down > 0 && speed < 8.0 {
            self.slow += STEP;
            if self.slow > 1.3 {
                self.phase = PHASE_STRANDED;
                self.events |= EVENT_STRANDED;
            }
        } else {
            self.slow = 0.0;
        }
    }

    fn collect(&mut self) {
        for pickup in &mut self.pickups {
            if pickup.taken > 0.5 { continue; }
            let dx = pickup.x - self.x;
            let dy = pickup.y - self.y;
            if dx * dx + dy * dy > PICK_REACH * PICK_REACH { continue; }
            pickup.taken = 1.0;
            if pickup.kind == KIND_FUEL {
                self.fuel = (self.fuel + FUEL_CAN).min(FUEL_MAX);
                self.events |= EVENT_FUEL;
            } else {
                self.coins += 1;
                self.events |= EVENT_COIN;
            }
        }
    }

    fn crashed(&self, sin_a: f32, cos_a: f32) -> bool {
        // past vertical the jeep is flipping; it will not land on its wheels
        if cos_a < -0.05 { return true; }
        for &along in &[-11.0_f32, 9.0] {
            let (px, py) = body_point(self.x, self.y, sin_a, cos_a, along, ROOF);
            if py < height(px) + 0.8 { return true; }
        }
        self.y < height(self.x) - 8.0
    }
}

pub fn body_point(x: f32, y: f32, sin_a: f32, cos_a: f32, along: f32, up: f32) -> (f32, f32) {
    (x + along * cos_a - up * sin_a, y + along * sin_a + up * cos_a)
}

/// Angle into [-π, π].
pub fn wrap_pi(angle: f32) -> f32 {
    const PI: f32 = 3.14159265;
    const TAU: f32 = 6.2831853;
    if !angle.is_finite() { return 0.0; }
    let mut a = angle % TAU;
    if a > PI { a -= TAU; }
    if a < -PI { a += TAU; }
    a
}

/// Sine and cosine for any angle. Bhaskara's approximation on [0, π], so the wasm stays free of libm.
pub fn sine_cosine(angle: f32) -> (f32, f32) {
    let a = wrap_pi(angle);
    let sine = bhaskara_sin(a);
    let cosine = bhaskara_sin(wrap_pi(a + 1.5707963));
    (sine, cosine)
}

fn bhaskara_sin(angle: f32) -> f32 {
    const PI: f32 = 3.14159265;
    let x = angle.abs();
    let product = x * (PI - x);
    let den = 5.0 * PI * PI - 4.0 * product;
    let sine = if den.abs() < 1.0e-3 { 0.0 } else { 16.0 * product / den };
    if angle < 0.0 { -sine } else { sine }
}

trait Limit { fn limit(self, low: f32, high: f32) -> f32; }
impl Limit for f32 { fn limit(self, low: f32, high: f32) -> f32 { if self < low { low } else if self > high { high } else { self } } }
