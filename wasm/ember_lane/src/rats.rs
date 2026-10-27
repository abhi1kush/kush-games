//! The rat swarms. Each rat belongs to a nest (a stretch of street) and never leaves it. In the dark it wanders and
//! streams towards anyone standing in the dark nearby; light drives it back to the nearest darkness, so rats boil
//! along the edge of every pool of light. A rat with no darkness left in its nest dives into a drain and comes back
//! out when its nest goes dark again.

use crate::stage::*;
use crate::Within;
use crate::world::*;

pub const RAT_HIDDEN: f32 = 0.0;
pub const RAT_ACTIVE: f32 = 1.0;
pub const RAT_FLEEING: f32 = 2.0;
pub const RAT_SPEED: f32 = 118.0;
pub const FLEE_SPEED: f32 = 170.0;
pub const WANDER_SPEED: f32 = 34.0;
pub const SENSE: f32 = 230.0;
pub const BITE_REACH: f32 = 12.0;

/// One rat as the renderer reads it (8 × 4 bytes): x, velocity, lane (0 back … 1 front), state, timer, phase, nest, rng.
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct Rat { pub x: f32, pub vx: f32, pub lane: f32, pub state: f32, pub timer: f32, pub phase: f32, pub zone: f32, pub seed: u32 }

impl Rat {
    fn random(&mut self) -> f32 {
        let mut x = self.seed;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        self.seed = x;
        (x >> 8) as f32 / 16_777_216.0
    }
}

/// Anything the rats live in: it only has to say where the light falls.
pub trait Lit { fn lit_at(&self, x: f32) -> bool; }
impl Lit for World { fn lit_at(&self, x: f32) -> bool { self.is_lit(x) } }

pub fn spawn_rats(world: &mut World) {
    let mut rats = world.rats;
    spawn_swarm(world, &mut rats, &ZONES);
    world.rats = rats;
}

/// Fill `rats` nest by nest (rats spawned in the light start hidden down a drain).
pub fn spawn_swarm(place: &dyn Lit, rats: &mut [Rat], zones: &[(f32, f32, u8)]) {
    let mut index = 0;
    for (zone, &(x0, x1, count)) in zones.iter().enumerate() {
        for number in 0..count as usize {
            if index >= rats.len() { return; }
            let mut rat = Rat { seed: 0x9e37_79b9u32.wrapping_mul(index as u32 + 1) ^ 0x51ed_270b, zone: zone as f32, state: RAT_ACTIVE, ..Rat::default() };
            rat.random();
            rat.x = x0 + (x1 - x0) * ((number as f32 + rat.random()) / count as f32);
            rat.lane = rat.random();
            rat.phase = rat.random() * 6.28;
            if place.lit_at(rat.x) { rat.state = RAT_HIDDEN; rat.timer = rat.random(); }
            rats[index] = rat;
            index += 1;
        }
    }
}

/// Nearest dark ground inside the nest, or None.
fn darkness_near(place: &dyn Lit, x: f32, x0: f32, x1: f32) -> Option<f32> {
    let mut offset = 0.0;
    while offset < x1 - x0 {
        for candidate in [x - offset, x + offset] {
            if candidate >= x0 && candidate <= x1 && !place.lit_at(candidate) { return Some(candidate); }
        }
        offset += 8.0;
    }
    None
}

pub fn step_rats(world: &mut World) {
    let player = (world.player_x, !world.is_lit(world.player_x) && world.state != STATE_DEAD || world.state == STATE_DEAD);
    let sibling = (world.sibling_x, !world.is_lit(world.sibling_x));
    let mut rats = world.rats;
    step_swarm(world, &mut rats, &ZONES, &[player, sibling], Emerge::Anywhere);
    world.rats = rats;
}

/// Where hidden rats come back up.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Emerge { Anywhere, Drain(f32), Closed }

/// One step of every rat. `prey` is everyone they might go for: (x, standing in the dark). Hidden rats come back
/// out anywhere dark in their nest, out of one drain (if it is dark there), or not at all yet.
pub fn step_swarm(place: &dyn Lit, rats: &mut [Rat], zones: &[(f32, f32, u8)], prey: &[(f32, bool)], emerge: Emerge) {
    for index in 0..rats.len() {
        let mut rat = rats[index];
        let (x0, x1, _) = zones[rat.zone as usize];
        rat.phase += STEP * (6.0 + rat.vx.abs() * 0.08);
        rat.timer -= STEP;
        if rat.state == RAT_HIDDEN {
            if rat.timer <= 0.0 {
                // come back out of a drain somewhere dark
                let out = match emerge {
                    Emerge::Drain(x) => if place.lit_at(x) { None } else { Some(x + (rat.random() - 0.5) * 8.0) },
                    Emerge::Closed => None,
                    Emerge::Anywhere => { let spot = x0 + (x1 - x0) * rat.random(); darkness_near(place, spot, x0, x1) }
                };
                match out {
                    Some(dark) => { rat.x = dark; rat.state = RAT_ACTIVE; rat.vx = 0.0; }
                    None => rat.timer = 0.4 + rat.random() * 0.8,
                }
            }
            rats[index] = rat;
            continue;
        }
        let here_lit = place.lit_at(rat.x);
        if here_lit {
            match darkness_near(place, rat.x, x0, x1) {
                Some(dark) => { rat.state = RAT_FLEEING; rat.vx = (dark - rat.x).signum() * FLEE_SPEED * (0.85 + 0.3 * rat.random()); }
                None => { rat.state = RAT_HIDDEN; rat.timer = 0.6 + rat.random() * 1.6; rats[index] = rat; continue; }
            }
        } else {
            rat.state = RAT_ACTIVE;
            // the nearest person standing in the dark, if any
            let mut target: Option<f32> = None;
            for &(x, dark) in prey {
                if dark && x >= x0 - 40.0 && x <= x1 + 40.0 && (x - rat.x).abs() < SENSE && target.map_or(true, |t: f32| (x - rat.x).abs() < (t - rat.x).abs()) { target = Some(x); }
            }
            let desired = match target {
                Some(x) => {
                    let offset = (rat.random() - 0.5) * 10.0;
                    let delta = x + offset - rat.x;
                    if delta.abs() < 4.0 { (rat.random() - 0.5) * 40.0 } else { delta.signum() * RAT_SPEED * (0.8 + 0.4 * rat.random()) }
                }
                None => rat.vx + (rat.random() - 0.5) * 60.0,
            };
            let limit = if target.is_some() { RAT_SPEED * 1.2 } else { WANDER_SPEED };
            rat.vx += (desired - rat.vx) * 0.2;
            rat.vx = rat.vx.within(-limit, limit);
            // never step into the light: squirm back instead
            let ahead = rat.x + rat.vx * STEP + rat.vx.signum() * 3.0;
            if place.lit_at(ahead) { rat.vx = -rat.vx * 0.6 + (rat.random() - 0.5) * 20.0; }
        }
        rat.x = (rat.x + rat.vx * STEP).within(x0, x1);
        if rat.x <= x0 || rat.x >= x1 { rat.vx = -rat.vx * 0.5; }
        rat.lane = (rat.lane + (rat.random() - 0.5) * 0.04).within(0.0, 1.0);
        rats[index] = rat;
    }
}

pub fn rats_touching(world: &World, x: f32) -> bool { swarm_touching(&world.rats, x) }
pub fn swarm_touching(rats: &[Rat], x: f32) -> bool {
    rats.iter().any(|rat| rat.state == RAT_ACTIVE && (rat.x - x).abs() < BITE_REACH)
}
