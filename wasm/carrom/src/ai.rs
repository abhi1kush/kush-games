//! The computer player: lines up cut shots (striker → coin → pocket), then (Medium/Hard) tries the best ones on a
//! copy of the board with the real physics and keeps the shot that scores best. Easy aims loosely and never checks.
use crate::physics::*;
use crate::rules::*;

pub struct Rng(u32);
impl Rng {
    pub fn new(seed: u32) -> Rng { Rng(if seed == 0 { 0x9e37_79b9 } else { seed }) }
    pub fn next(&mut self) -> u32 { let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x; x }
    /// Uniform in [-1, 1).
    pub fn signed(&mut self) -> f32 { (self.next() >> 8) as f32 / (1u32 << 23) as f32 - 1.0 }
    pub fn below(&mut self, limit: u32) -> u32 { if limit == 0 { 0 } else { self.next() % limit } }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Shot { pub x: f32, pub aim_x: f32, pub aim_y: f32, pub power: u32 }

#[derive(Clone, Copy)]
struct Candidate { shot: Shot, guess: f32 }

const MAX_CANDIDATES: usize = 48;

/// Distance from point p to segment a→b.
fn segment_distance(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let (dx, dy) = (bx - ax, by - ay);
    let length = dx * dx + dy * dy;
    let t = if length > 0.0 { (((px - ax) * dx + (py - ay) * dy) / length).clamp(0.0, 1.0) } else { 0.0 };
    let (cx, cy) = (ax + dx * t - px, ay + dy * t - py);
    (cx * cx + cy * cy).sqrt()
}

fn path_clear(game: &Game, ax: f32, ay: f32, bx: f32, by: f32, radius: f32, skip_a: usize, skip_b: usize) -> bool {
    game.world.bodies.iter().enumerate().all(|(index, body)| {
        index == skip_a || index == skip_b || !body.is_on() || segment_distance(body.x, body.y, ax, ay, bx, by) >= body.r + radius - 1.0
    })
}

/// Cut-shot candidates, best first (by a quick geometric guess), into a fixed array.
fn candidates(game: &Game, out: &mut [Candidate; MAX_CANDIDATES]) -> usize {
    let me = game.turn;
    let y = BASELINE_Y[me as usize];
    let start = first_coin(me);
    let mut count = 0usize;
    let mut targets = [0usize; COINS_EACH + 1];
    let mut target_count = 0;
    for index in start..start + COINS_EACH { if game.world.bodies[index].is_on() { targets[target_count] = index; target_count += 1; } }
    if game.world.bodies[QUEEN].is_on() && game.pocketed(me) > 0 { targets[target_count] = QUEEN; target_count += 1; }
    for step in 0..=16 {
        let x = BASELINE_MIN + (BASELINE_MAX - BASELINE_MIN) * step as f32 / 16.0;
        if !game.can_place(x) { continue; }
        for &target in &targets[..target_count] {
            let coin = game.world.bodies[target];
            for &(px, py) in POCKETS.iter() {
                let (ux, uy, coin_distance) = { let (dx, dy) = (px - coin.x, py - coin.y); let d = (dx * dx + dy * dy).sqrt(); (dx / d, dy / d, d) };
                let (gx, gy) = (coin.x - ux * (COIN_R + STRIKER_R), coin.y - uy * (COIN_R + STRIKER_R));
                if !(STRIKER_R..=BOARD - STRIKER_R).contains(&gx) || !(STRIKER_R..=BOARD - STRIKER_R).contains(&gy) { continue; }
                let (vx, vy, striker_distance) = { let (dx, dy) = (gx - x, gy - y); let d = (dx * dx + dy * dy).sqrt(); (dx / d, dy / d, d) };
                let cut = vx * ux + vy * uy;
                if cut < 0.3 || striker_distance < 5.0 { continue; }
                if !path_clear(game, x, y, gx, gy, STRIKER_R, 0, target) || !path_clear(game, coin.x, coin.y, px, py, COIN_R, 0, target) { continue; }
                // speed: the coin must reach the pocket; the striker must reach the coin
                let coin_speed = (2.0 * FRICTION * coin_distance * 1.25 + 250.0 * 250.0).sqrt();
                let at_contact = coin_speed / (cut * (1.0 + COIN_BOUNCE) * STRIKER_MASS / (STRIKER_MASS + COIN_MASS));
                let speed = (at_contact * at_contact + 2.0 * FRICTION * striker_distance * 1.15).sqrt();
                if speed > MAX_SPEED * 1.05 { continue; }
                let guess = cut * 3.0 - (coin_distance + striker_distance) / 900.0 - if target == QUEEN { 0.0 } else { 0.2 };
                let candidate = Candidate { shot: Shot { x, aim_x: gx, aim_y: gy, power: power_of(speed) }, guess };
                // keep the best MAX_CANDIDATES (insertion into a sorted fixed array)
                let mut position = count.min(MAX_CANDIDATES);
                while position > 0 && out[position - 1].guess < guess { position -= 1; }
                if position >= MAX_CANDIDATES { continue; }
                let end = count.min(MAX_CANDIDATES - 1);
                let mut index = end;
                while index > position { out[index] = out[index - 1]; index -= 1; }
                out[position] = candidate;
                if count < MAX_CANDIDATES { count += 1; }
            }
        }
    }
    count
}

/// How good the board is for `me` after trying `shot` on a copy.
fn score(game: &Game, shot: Shot) -> f32 {
    let me = game.turn;
    let mut copy = *game;
    if !copy.shoot(shot.x, shot.aim_x, shot.aim_y, shot.power) { return -1000.0; }
    copy.settle();
    if copy.winner == me { return 1000.0; }
    if copy.winner != 255 { return -1000.0; }
    let outcome = copy.last;
    let mut value = outcome.own as f32 * 12.0 - outcome.opponent as f32 * 5.0 - outcome.returned as f32 * 6.0;
    if outcome.foul != FOUL_NONE { value -= 40.0; }
    if outcome.queen & 2 != 0 { value += 18.0; } else if outcome.queen & 1 != 0 { value += 7.0; }
    if outcome.again { value += 4.0; }
    value
}

/// Turns the aim by a small random angle (radians, as an offset across the line).
fn wobble(shot: Shot, y: f32, angle: f32, rng: &mut Rng) -> Shot {
    let (dx, dy) = (shot.aim_x - shot.x, shot.aim_y - y);
    let turn = rng.signed() * angle;
    Shot { aim_x: shot.aim_x - dy * turn, aim_y: shot.aim_y + dx * turn, ..shot }
}

/// The computer's shot at `level` (0 Easy, 1 Medium, 2 Hard).
pub fn choose(game: &Game, level: u8, seed: u32) -> Shot {
    let mut rng = Rng::new(seed);
    let y = BASELINE_Y[game.turn as usize];
    let mut list = [Candidate { shot: Shot { x: 500.0, aim_x: 500.0, aim_y: 500.0, power: 1000 }, guess: 0.0 }; MAX_CANDIDATES];
    let count = candidates(game, &mut list);
    let mut best = fallback(game, &mut rng);
    if count > 0 {
        match level {
            0 => { let pick = list[rng.below(count.min(5) as u32) as usize].shot; best = Shot { power: ((pick.power as f32) * (0.85 + 0.45 * (rng.signed() + 1.0) / 2.0)).min(1000.0) as u32, ..pick }; }
            _ => {
                let (tries, powers): (usize, &[f32]) = if level == 1 { (8, &[1.0, 1.25]) } else { (28, &[0.95, 1.1, 1.35]) };
                let mut best_value = score(game, best) - 10.0;
                for candidate in &list[..count.min(tries)] {
                    for &factor in powers {
                        let shot = Shot { power: ((candidate.shot.power as f32) * factor).min(1000.0) as u32, ..candidate.shot };
                        let value = score(game, shot) + candidate.guess;
                        if value > best_value { best_value = value; best = shot; }
                    }
                }
            }
        }
    }
    let spread = [0.05, 0.016, 0.004][level.min(2) as usize];
    wobble(best, y, spread, &mut rng)
}

/// No clean cut: the opening break, or a firm shot at the nearest own coin to stir things up.
fn fallback(game: &Game, rng: &mut Rng) -> Shot {
    let me = game.turn;
    let y = BASELINE_Y[me as usize];
    let x = if game.can_place(500.0) { 500.0 } else { (0..=32).map(|step| BASELINE_MIN + (BASELINE_MAX - BASELINE_MIN) * step as f32 / 32.0).find(|&x| game.can_place(x)).unwrap_or(500.0) };
    if game.shots == 0 { return Shot { x, aim_x: 500.0 + rng.signed() * 4.0, aim_y: 500.0, power: 1000 }; }
    let start = first_coin(me);
    let mut target = (500.0, 500.0);
    let mut nearest = f32::MAX;
    for body in game.world.bodies[start..start + COINS_EACH].iter().chain(core::iter::once(&game.world.bodies[QUEEN])) {
        if !body.is_on() { continue; }
        let distance = (body.x - x).abs() + (body.y - y).abs();
        if distance < nearest { nearest = distance; target = (body.x, body.y); }
    }
    Shot { x, aim_x: target.0, aim_y: target.1, power: 700 }
}
