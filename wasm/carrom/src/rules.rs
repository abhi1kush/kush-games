//! Carrom rules (a friendly subset of the international rules) on top of the physics.
//!
//! - Player 0 plays White and breaks from the bottom baseline; player 1 plays Black from the top.
//! - Pocket one of your coins (or the Queen) and you shoot again.
//! - The Queen must be covered: pocket one of your coins in the same shot or the next one, or she returns to the centre.
//! - Fouls (the turn ends): pocketing the striker (your coins from that shot go back, plus one already pocketed coin
//!   as a penalty — owed if you have none yet); pocketing your last coin, or your opponent's last coin, while the
//!   Queen isn't covered (that coin goes back, plus a penalty).
//! - Pocket all nine of your coins after the Queen is covered to win the board: 1 point for each coin the opponent
//!   still has on the board, plus 3 if you covered the Queen.
use crate::physics::*;

pub const QUEEN: usize = 1;
pub const COINS_EACH: usize = 9;
/// Bodies 2…10 are White, 11…19 Black.
pub const fn first_coin(player: u8) -> usize { if player == 0 { 2 } else { 2 + COINS_EACH } }
pub const BASELINE_Y: [f32; 2] = [863.0, 137.0];
pub const BASELINE_MIN: f32 = 182.0;
pub const BASELINE_MAX: f32 = 818.0;
const CENTRE: f32 = 500.0;

/// The most fixed steps one `advance` call may run (an animation frame needs at most ~24).
pub const MAX_STEPS_PER_CALL: u32 = 64;

pub const PHASE_AIM: u8 = 0;
pub const PHASE_MOVING: u8 = 1;
pub const PHASE_OVER: u8 = 2;

pub const QUEEN_ON_BOARD: u8 = 0;
pub const QUEEN_PENDING: u8 = 1;
pub const QUEEN_COVERED: u8 = 2;

pub const FOUL_NONE: u8 = 0;
pub const FOUL_STRIKER: u8 = 1;
pub const FOUL_LAST_COIN: u8 = 2;
pub const FOUL_OPPONENT_LAST: u8 = 3;

/// Outcome of the last finished shot (for messages and sounds).
#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub struct Outcome {
    pub player: u8,
    pub foul: u8,
    /// Own / opponent coins that stayed pocketed.
    pub own: u8,
    pub opponent: u8,
    /// bit 1 pocketed, 2 covered, 4 returned to the centre
    pub queen: u8,
    /// coins put back on the board (returns and penalties)
    pub returned: u8,
    pub again: bool,
}

#[derive(Clone, Copy)]
pub struct Game {
    pub world: World,
    pub turn: u8,
    pub phase: u8,
    pub queen_state: u8,
    pub queen_owner: u8,
    /// Penalty coins owed (a foul before having pocketed anything).
    pub due: [u8; 2],
    pub winner: u8,
    pub points: u8,
    pub shots: u32,
    pub last: Outcome,
}

/// Hex-lattice offsets (in coin spacings) of the starting rosette, in angle order per ring.
const RING1: [(i8, i8); 6] = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)];
const RING2: [(i8, i8); 12] = [(2, 0), (1, 1), (0, 2), (-1, 2), (-2, 2), (-2, 1), (-2, 0), (-1, -1), (0, -2), (1, -2), (2, -2), (2, -1)];
const SPACING: f32 = 2.0 * COIN_R + 0.6;
const HALF_SQRT3: f32 = 0.866_025_4;
fn lattice(a: i8, b: i8, spacing: f32) -> (f32, f32) { (CENTRE + (a as f32 + b as f32 * 0.5) * spacing, CENTRE + b as f32 * HALF_SQRT3 * spacing) }

impl Game {
    pub fn new() -> Game {
        let mut game = Game { world: World::new(), turn: 0, phase: PHASE_AIM, queen_state: QUEEN_ON_BOARD, queen_owner: 0, due: [0, 0], winner: 255, points: 0, shots: 0, last: Outcome::default() };
        game.reset();
        game
    }

    pub fn reset(&mut self) {
        self.world = World::new();
        let (mut white, mut black) = (first_coin(0), first_coin(1));
        let mut put = |world: &mut World, index: usize, (x, y): (f32, f32)| { world.bodies[index].x = x; world.bodies[index].y = y; };
        put(&mut self.world, QUEEN, (CENTRE, CENTRE));
        for (index, &(a, b)) in RING1.iter().enumerate() {
            let slot = if index % 2 == 0 { white += 1; white - 1 } else { black += 1; black - 1 };
            put(&mut self.world, slot, lattice(a, b, SPACING));
        }
        for (index, &(a, b)) in RING2.iter().enumerate() {
            let slot = if index % 2 == 1 { white += 1; white - 1 } else { black += 1; black - 1 };
            put(&mut self.world, slot, lattice(a, b, SPACING));
        }
        self.turn = 0; self.phase = PHASE_AIM; self.queen_state = QUEEN_ON_BOARD; self.queen_owner = 0;
        self.due = [0, 0]; self.winner = 255; self.points = 0; self.shots = 0; self.last = Outcome::default();
        self.place_striker_default();
    }

    pub fn coins_left(&self, player: u8) -> u8 {
        let start = first_coin(player);
        self.world.bodies[start..start + COINS_EACH].iter().filter(|body| body.is_on()).count() as u8
    }
    pub fn pocketed(&self, player: u8) -> u8 { COINS_EACH as u8 - self.coins_left(player) }
    pub fn owner_of(index: usize) -> Option<u8> { if index < 2 { None } else if index < 2 + COINS_EACH { Some(0) } else { Some(1) } }

    /// Can the striker sit at `x` on the current player's baseline?
    pub fn can_place(&self, x: f32) -> bool {
        (BASELINE_MIN..=BASELINE_MAX).contains(&x) && self.world.is_free(x, BASELINE_Y[self.turn as usize], STRIKER_R, 0)
    }

    /// Puts the striker on the baseline (for display while aiming); false if it doesn't fit there.
    pub fn place_striker(&mut self, x: f32) -> bool {
        if self.phase != PHASE_AIM || !self.can_place(x) { return false; }
        let striker = &mut self.world.bodies[0];
        striker.x = x; striker.y = BASELINE_Y[self.turn as usize]; striker.on = 1.0; striker.vx = 0.0; striker.vy = 0.0;
        true
    }

    /// The free spot on the baseline closest to the middle.
    pub fn place_striker_default(&mut self) {
        let striker = &mut self.world.bodies[0];
        striker.on = 1.0; striker.vx = 0.0; striker.vy = 0.0; striker.y = BASELINE_Y[self.turn as usize]; striker.x = CENTRE;
        let mut offset = 0.0;
        while offset <= BASELINE_MAX - CENTRE {
            for x in [CENTRE - offset, CENTRE + offset] { if self.can_place(x) { self.world.bodies[0].x = x; return; } }
            offset += 4.0;
        }
    }

    /// Starts a shot: striker at `x` on the baseline, aimed at (aim_x, aim_y), power 1…1000.
    pub fn shoot(&mut self, x: f32, aim_x: f32, aim_y: f32, power: u32) -> bool {
        if self.phase != PHASE_AIM || power == 0 || power > 1000 || !self.can_place(x) { return false; }
        let y = BASELINE_Y[self.turn as usize];
        let (dx, dy) = (aim_x - x, aim_y - y);
        let length = (dx * dx + dy * dy).sqrt();
        if !(length >= 1.0) { return false; }
        self.place_striker(x);
        let speed = speed_of(power);
        let striker = &mut self.world.bodies[0];
        striker.vx = dx / length * speed; striker.vy = dy / length * speed;
        self.world.fallen_count = 0;
        self.world.striker_touched = false;
        self.world.steps = 0;
        self.phase = PHASE_MOVING;
        self.shots += 1;
        true
    }

    /// Advances up to `steps` fixed steps (at most MAX_STEPS_PER_CALL, so a bad count — e.g. a negative number from
    /// JavaScript wrapping to 4 billion — can never finish a whole shot in one frame); when everything rests the shot
    /// is scored. True while still moving.
    pub fn advance(&mut self, steps: u32) -> bool {
        if self.phase != PHASE_MOVING { return false; }
        for _ in 0..steps.min(MAX_STEPS_PER_CALL) {
            let moving = self.world.step();
            if !moving || self.world.steps >= MAX_SHOT_STEPS { self.world.stop_all(); self.finish_shot(); return false; }
        }
        true
    }

    pub fn settle(&mut self) { while self.advance(MAX_STEPS_PER_CALL) {} }

    /// A pocketed body goes back on the board, at the centre or the closest free spot to it.
    fn return_to_centre(&mut self, index: usize) {
        let r = self.world.bodies[index].r;
        let mut best = (CENTRE, CENTRE);
        let mut best_distance = f32::MAX;
        for a in -9i8..=9 {
            for b in -9i8..=9 {
                let (x, y) = lattice(a, b, 2.0 * r + 1.0);
                let distance = (x - CENTRE) * (x - CENTRE) + (y - CENTRE) * (y - CENTRE);
                if distance < best_distance && x > 100.0 && x < 900.0 && y > 200.0 && y < 800.0 && self.world.is_free(x, y, r, index) { best = (x, y); best_distance = distance; }
            }
        }
        let body = &mut self.world.bodies[index];
        body.x = best.0; body.y = best.1; body.vx = 0.0; body.vy = 0.0; body.on = 1.0;
    }

    /// Returns one of `player`'s pocketed coins as a penalty (or owes one).
    fn penalty(&mut self, player: u8, outcome: &mut Outcome) {
        let start = first_coin(player);
        if let Some(index) = (start..start + COINS_EACH).find(|&index| !self.world.bodies[index].is_on()) { self.return_to_centre(index); outcome.returned += 1; } else { self.due[player as usize] += 1; }
    }

    fn finish_shot(&mut self) {
        let me = self.turn;
        let them = 1 - me;
        let mut outcome = Outcome { player: me, ..Outcome::default() };
        let fallen: Vec<usize> = self.world.fallen[..self.world.fallen_count].iter().map(|&index| index as usize).collect();
        let striker_in = fallen.contains(&0);
        let queen_in = fallen.contains(&QUEEN);
        let mut own: Vec<usize> = fallen.iter().copied().filter(|&index| Game::owner_of(index) == Some(me)).collect();
        let theirs: Vec<usize> = fallen.iter().copied().filter(|&index| Game::owner_of(index) == Some(them)).collect();
        if queen_in { outcome.queen |= 1; }
        let queen_was_mine_pending = self.queen_state == QUEEN_PENDING && self.queen_owner == me;

        if striker_in {
            outcome.foul = FOUL_STRIKER;
            for &index in &own { self.return_to_centre(index); outcome.returned += 1; }
            own.clear();
            if queen_in || queen_was_mine_pending { self.return_to_centre(QUEEN); self.queen_state = QUEEN_ON_BOARD; outcome.queen |= 4; }
            self.penalty(me, &mut outcome);
        } else {
            // owed penalties are paid with freshly pocketed coins
            while self.due[me as usize] > 0 && !own.is_empty() {
                let index = own.pop().unwrap();
                self.return_to_centre(index);
                self.due[me as usize] -= 1;
                outcome.returned += 1;
            }
            if queen_in {
                if !own.is_empty() { self.queen_state = QUEEN_COVERED; outcome.queen |= 2; } else { self.queen_state = QUEEN_PENDING; }
                self.queen_owner = me;
            } else if queen_was_mine_pending {
                if !own.is_empty() { self.queen_state = QUEEN_COVERED; outcome.queen |= 2; } else { self.return_to_centre(QUEEN); self.queen_state = QUEEN_ON_BOARD; outcome.queen |= 4; }
            }
            let covered = self.queen_state == QUEEN_COVERED;
            if !covered && !own.is_empty() && self.coins_left(me) == 0 {
                outcome.foul = FOUL_LAST_COIN;
                if let Some(index) = own.pop() { self.return_to_centre(index); outcome.returned += 1; }
                if self.queen_state == QUEEN_PENDING && self.queen_owner == me { self.return_to_centre(QUEEN); self.queen_state = QUEEN_ON_BOARD; outcome.queen |= 4; }
                self.penalty(me, &mut outcome);
            }
            if !covered && !theirs.is_empty() && self.coins_left(them) == 0 {
                outcome.foul = FOUL_OPPONENT_LAST;
                if let Some(&index) = theirs.last() { self.return_to_centre(index); outcome.returned += 1; }
                self.penalty(me, &mut outcome);
            }
        }
        outcome.own = own.len() as u8;
        outcome.opponent = theirs.iter().filter(|&&index| !self.world.bodies[index].is_on()).count() as u8;
        let covered = self.queen_state == QUEEN_COVERED;
        if covered && self.coins_left(me) == 0 { self.win(me); }
        else if covered && self.coins_left(them) == 0 { self.win(them); }
        outcome.again = outcome.foul == FOUL_NONE && (outcome.own > 0 || queen_in) && self.winner == 255;
        self.last = outcome;
        if self.winner != 255 { self.phase = PHASE_OVER; self.world.bodies[0].on = 0.0; return; }
        if !outcome.again { self.turn = them; }
        self.phase = PHASE_AIM;
        self.place_striker_default();
    }

    fn win(&mut self, player: u8) {
        self.winner = player;
        self.points = self.coins_left(1 - player) + if self.queen_owner == player { 3 } else { 0 };
    }
}

impl Default for Game { fn default() -> Self { Game::new() } }
