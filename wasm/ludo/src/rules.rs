//! Ludo rules. Four seats (0 Red, 1 Green, 2 Yellow, 3 Blue) move clockwise around a 52-square track.
//!
//! A token's progress is relative to its own seat: `YARD` (not out yet), 0..=50 on the shared track (0 is the seat's
//! start square, absolute square `seat * 13`), 51..=55 in its home column, `HOME` (56) finished. `REMOVED` marks the
//! tokens of a seat that left, was removed by the host or forfeited.
//!
//! Turn flow: AwaitRoll → roll → AwaitMove (pick a token) or NoMove (nothing legal / third six; the host shows the
//! dice, then calls `pass_turn`). A six, a capture or a token reaching home gives another roll; three sixes in a row
//! forfeit the turn. Missed turns: `timeout` plays the turn automatically and adds a strike (once per turn); the third
//! strike forfeits the seat. Seats finish in order (1st, 2nd, …); the game ends when one unfinished seat remains.

pub const SEATS: usize = 4;
pub const TOKENS: usize = 4;
pub const TRACK: u8 = 52;
pub const LAST_TRACK: u8 = 50;
pub const HOME: u8 = 56;
pub const YARD: u8 = 255;
pub const REMOVED: u8 = 254;
pub const MAX_STRIKES: u8 = 3;
/// Absolute squares where nobody can be captured: the four start squares and the four stars.
pub const SAFE_SQUARES: [u8; 8] = [0, 8, 13, 21, 26, 34, 39, 47];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Phase { Lobby = 0, AwaitRoll = 1, AwaitMove = 2, NoMove = 3, Over = 4 }

/// Why the last roll had no move (shown to the players).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum NoMoveReason { None = 0, NothingLegal = 1, ThreeSixes = 2 }

/// What `timeout` did.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum TimeoutResult { Nothing = 0, AutoPlayed = 1, Forfeited = 2 }

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Capture { pub seat: u8, pub token: u8, pub from: u8 }

/// The last token move, so every browser can animate the same hops.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct LastMove { pub id: u8, pub seat: u8, pub token: u8, pub from: u8, pub to: u8, pub capture_count: u8, pub captures: [Capture; 3] }

impl Default for LastMove {
    fn default() -> Self { LastMove { id: 0, seat: 255, token: 255, from: YARD, to: YARD, capture_count: 0, captures: [Capture::default(); 3] } }
}

#[derive(Clone)]
pub struct Game {
    pub phase: Phase,
    pub current: u8,
    pub dice: u8,
    /// Increases with every roll (lets the browsers replay the dice animation once per roll).
    pub roll_id: u8,
    pub sixes_in_row: u8,
    pub struck_this_turn: bool,
    pub auto_played_last: bool,
    pub no_move_reason: NoMoveReason,
    /// Seats still in the game (joined and not left / removed / forfeited).
    pub active: u8,
    pub joined: u8,
    pub places: [u8; SEATS],
    pub next_place: u8,
    pub strikes: [u8; SEATS],
    pub progress: [[u8; TOKENS]; SEATS],
    pub rng: u32,
    pub forced_roll: u8,
    pub last_move: LastMove,
}

pub fn absolute_square(seat: u8, progress: u8) -> u8 { (seat * 13 + progress) % TRACK }
pub fn is_safe(square: u8) -> bool { SAFE_SQUARES.contains(&square) }

impl Game {
    pub fn new(seed: u32) -> Game {
        Game {
            phase: Phase::Lobby, current: 0, dice: 0, roll_id: 0, sixes_in_row: 0, struck_this_turn: false, auto_played_last: false,
            no_move_reason: NoMoveReason::None, active: 0, joined: 0, places: [0; SEATS], next_place: 1, strikes: [0; SEATS],
            progress: [[YARD; TOKENS]; SEATS], rng: seed | 1, forced_roll: 0, last_move: LastMove::default(),
        }
    }

    /// Start a game with the seats in `seats_mask` (at least two); `first` rolls first (moved on if not seated).
    pub fn start(&mut self, seats_mask: u8, first: u8) -> bool {
        let mask = seats_mask & 0b1111;
        if mask.count_ones() < 2 { return false; }
        let rng = self.rng;
        *self = Game::new(rng);
        self.joined = mask;
        self.active = mask;
        for seat in 0..SEATS { if mask & (1 << seat) == 0 { self.progress[seat] = [REMOVED; TOKENS]; } }
        self.current = first % 4;
        if !self.in_play(self.current) { self.current = self.next_seat_after(self.current); }
        self.phase = Phase::AwaitRoll;
        true
    }

    /// Still taking turns: seated, not removed and not finished.
    pub fn in_play(&self, seat: u8) -> bool { self.active & (1 << seat) != 0 && self.places[seat as usize] == 0 }

    fn next_seat_after(&self, seat: u8) -> u8 {
        for step in 1..=SEATS as u8 {
            let candidate = (seat + step) % 4;
            if self.in_play(candidate) { return candidate; }
        }
        seat
    }

    fn random_die(&mut self) -> u8 {
        // xorshift32
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        (x % 6) as u8 + 1
    }

    /// Where a token would land with `dice`, or None if it can't move.
    pub fn target(&self, seat: u8, token: u8, dice: u8) -> Option<u8> {
        let progress = self.progress[seat as usize][token as usize];
        match progress {
            REMOVED | HOME => None,
            YARD => if dice == 6 { Some(0) } else { None },
            _ => { let to = progress + dice; if to <= HOME { Some(to) } else { None } }
        }
    }

    pub fn legal_mask(&self) -> u8 {
        if self.phase != Phase::AwaitMove { return 0; }
        let mut mask = 0;
        for token in 0..TOKENS as u8 { if self.target(self.current, token, self.dice).is_some() { mask |= 1 << token; } }
        mask
    }

    fn legal_mask_for(&self, dice: u8) -> u8 {
        let mut mask = 0;
        for token in 0..TOKENS as u8 { if self.target(self.current, token, dice).is_some() { mask |= 1 << token; } }
        mask
    }

    /// Roll for the current seat (the host's RNG; `forced_roll` is for tests). Returns the dice, or 0 if not allowed.
    pub fn roll(&mut self) -> u8 {
        if self.phase != Phase::AwaitRoll { return 0; }
        let dice = if self.forced_roll != 0 { let value = self.forced_roll; self.forced_roll = 0; value } else { self.random_die() };
        self.dice = dice;
        self.roll_id = self.roll_id.wrapping_add(1);
        self.auto_played_last = false;
        if dice == 6 { self.sixes_in_row += 1; } else { self.sixes_in_row = 0; }
        if self.sixes_in_row >= 3 {
            self.phase = Phase::NoMove;
            self.no_move_reason = NoMoveReason::ThreeSixes;
        } else if self.legal_mask_for(dice) == 0 {
            self.phase = Phase::NoMove;
            self.no_move_reason = NoMoveReason::NothingLegal;
        } else {
            self.phase = Phase::AwaitMove;
            self.no_move_reason = NoMoveReason::None;
        }
        dice
    }

    /// After a roll with no move: next seat (or the same seat again after a six that couldn't be used).
    pub fn pass_turn(&mut self) -> bool {
        if self.phase != Phase::NoMove { return false; }
        let again = self.dice == 6 && self.no_move_reason == NoMoveReason::NothingLegal;
        self.end_turn(again);
        true
    }

    fn end_turn(&mut self, again: bool) {
        if self.phase == Phase::Over { return; }
        if !(again && self.in_play(self.current)) {
            self.sixes_in_row = 0;
            self.current = self.next_seat_after(self.current);
        }
        self.phase = Phase::AwaitRoll;
        self.struck_this_turn = false;
        self.no_move_reason = NoMoveReason::None;
    }

    /// Move `token` of the current seat by the dice. False if it isn't a legal move.
    pub fn move_token(&mut self, token: u8) -> bool {
        if self.phase != Phase::AwaitMove || token as usize >= TOKENS { return false; }
        let seat = self.current;
        let Some(to) = self.target(seat, token, self.dice) else { return false };
        let from = self.progress[seat as usize][token as usize];
        self.progress[seat as usize][token as usize] = to;
        let mut last = LastMove { id: self.last_move.id.wrapping_add(1), seat, token, from, to, capture_count: 0, captures: [Capture::default(); 3] };
        if to <= LAST_TRACK {
            let square = absolute_square(seat, to);
            if !is_safe(square) {
                for other in 0..SEATS as u8 {
                    if other == seat { continue; }
                    for other_token in 0..TOKENS as u8 {
                        let other_progress = self.progress[other as usize][other_token as usize];
                        if other_progress <= LAST_TRACK && absolute_square(other, other_progress) == square {
                            self.progress[other as usize][other_token as usize] = YARD;
                            if (last.capture_count as usize) < last.captures.len() {
                                last.captures[last.capture_count as usize] = Capture { seat: other, token: other_token, from: other_progress };
                                last.capture_count += 1;
                            }
                        }
                    }
                }
            }
        }
        self.last_move = last;
        let reached_home = to == HOME;
        if reached_home && self.progress[seat as usize].iter().all(|&progress| progress == HOME) {
            self.places[seat as usize] = self.next_place;
            self.next_place += 1;
            self.check_over();
        }
        let again = self.dice == 6 || last.capture_count > 0 || reached_home;
        self.end_turn(again);
        true
    }

    /// The game ends when at most one seat is still taking turns; that seat gets the next place.
    fn check_over(&mut self) {
        let remaining: Vec<u8> = (0..SEATS as u8).filter(|&seat| self.in_play(seat)).collect();
        if remaining.len() <= 1 {
            if let Some(&last) = remaining.first() {
                self.places[last as usize] = self.next_place;
                self.next_place += 1;
            }
            self.phase = Phase::Over;
        }
    }

    /// A seat leaves (left, removed by the host or forfeited): its tokens go and the game goes on without it.
    pub fn remove_seat(&mut self, seat: u8) -> bool {
        if seat as usize >= SEATS || self.active & (1 << seat) == 0 { return false; }
        self.active &= !(1 << seat);
        self.progress[seat as usize] = [REMOVED; TOKENS];
        if self.phase == Phase::Lobby { return true; }
        if self.phase == Phase::Over { return true; }
        let was_current = self.current == seat;
        self.check_over();
        if self.phase != Phase::Over && was_current {
            self.sixes_in_row = 0;
            self.current = self.next_seat_after(seat);
            self.phase = Phase::AwaitRoll;
            self.struck_this_turn = false;
            self.no_move_reason = NoMoveReason::None;
        }
        true
    }

    /// The current seat ran out of time: a strike (once per turn; the third forfeits), then roll and move for them.
    pub fn timeout(&mut self) -> TimeoutResult {
        if !matches!(self.phase, Phase::AwaitRoll | Phase::AwaitMove) { return TimeoutResult::Nothing; }
        let seat = self.current;
        if !self.struck_this_turn {
            self.struck_this_turn = true;
            self.strikes[seat as usize] += 1;
            if self.strikes[seat as usize] >= MAX_STRIKES {
                self.remove_seat(seat);
                return TimeoutResult::Forfeited;
            }
        }
        if self.phase == Phase::AwaitRoll { self.roll(); }
        if self.phase == Phase::AwaitMove {
            let token = self.choose_move();
            self.move_token(token);
        }
        self.auto_played_last = true;
        TimeoutResult::AutoPlayed
    }

    /// Is an opponent token on the track 1..=6 squares behind `square` (so it could capture there next turn)?
    fn threatened(&self, seat: u8, square: u8) -> bool {
        if is_safe(square) { return false; }
        for other in 0..SEATS as u8 {
            if other == seat { continue; }
            for &progress in self.progress[other as usize].iter() {
                if progress > LAST_TRACK { continue; }
                let from = absolute_square(other, progress);
                let distance = (square + TRACK - from) % TRACK;
                // the attacker must not turn into its home column before reaching the square
                if (1..=6).contains(&distance) && progress + distance <= LAST_TRACK { return true; }
            }
        }
        false
    }

    /// A sensible move for an auto-played turn (or a computer player): capture, finish, leave the yard, get safe,
    /// avoid danger, otherwise advance the leading token. Returns the token (or 255 if none).
    pub fn choose_move(&self) -> u8 {
        let seat = self.current;
        let mut best = 255u8;
        let mut best_score = i32::MIN;
        for token in 0..TOKENS as u8 {
            let Some(to) = self.target(seat, token, self.dice) else { continue };
            let from = self.progress[seat as usize][token as usize];
            let mut score = to as i32;
            if to == HOME { score += 400; }
            if from == YARD { score += 300; }
            if to <= LAST_TRACK {
                let square = absolute_square(seat, to);
                let captures = (0..SEATS as u8).filter(|&other| other != seat).any(|other| {
                    self.progress[other as usize].iter().any(|&progress| progress <= LAST_TRACK && absolute_square(other, progress) == square)
                });
                if captures && !is_safe(square) { score += 500; }
                if is_safe(square) { score += 120; }
                if self.threatened(seat, square) { score -= 200; }
            } else if from <= LAST_TRACK {
                score += 150; // into the home column: out of reach
            }
            if from <= LAST_TRACK && self.threatened(seat, absolute_square(seat, from)) { score += 180; }
            if score > best_score { best_score = score; best = token; }
        }
        best
    }

    // ---------- snapshot: the whole state in a few bytes (the host broadcasts it; a new host restores it) ----------
    pub const SNAPSHOT_LENGTH: usize = 56;
    pub fn snapshot(&self) -> [u8; Self::SNAPSHOT_LENGTH] {
        let mut bytes = [0u8; Self::SNAPSHOT_LENGTH];
        bytes[0] = 1; // layout version
        bytes[1] = self.phase as u8;
        bytes[2] = self.current;
        bytes[3] = self.dice;
        bytes[4] = self.roll_id;
        bytes[5] = self.sixes_in_row;
        bytes[6] = self.struck_this_turn as u8 | (self.auto_played_last as u8) << 1;
        bytes[7] = self.no_move_reason as u8;
        bytes[8] = self.active;
        bytes[9] = self.joined;
        bytes[10] = self.next_place;
        bytes[11] = self.legal_mask();
        for seat in 0..SEATS {
            bytes[12 + seat] = self.places[seat];
            bytes[16 + seat] = self.strikes[seat];
            for token in 0..TOKENS { bytes[20 + seat * 4 + token] = self.progress[seat][token]; }
        }
        bytes[36..40].copy_from_slice(&self.rng.to_le_bytes());
        let last = &self.last_move;
        bytes[40] = last.id;
        bytes[41] = last.seat;
        bytes[42] = last.token;
        bytes[43] = last.from;
        bytes[44] = last.to;
        bytes[45] = last.capture_count;
        for (index, capture) in last.captures.iter().enumerate() {
            bytes[46 + index * 3] = capture.seat;
            bytes[47 + index * 3] = capture.token;
            bytes[48 + index * 3] = capture.from;
        }
        bytes[55] = self.forced_roll;
        bytes
    }

    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        if bytes.len() != Self::SNAPSHOT_LENGTH || bytes[0] != 1 || bytes[1] > 4 || bytes[2] > 3 || bytes[3] > 6 { return false; }
        let valid_progress = |value: u8| value <= HOME || value == YARD || value == REMOVED;
        if !bytes[20..36].iter().all(|&value| valid_progress(value)) { return false; }
        let mut game = Game::new(1);
        game.phase = match bytes[1] { 0 => Phase::Lobby, 1 => Phase::AwaitRoll, 2 => Phase::AwaitMove, 3 => Phase::NoMove, _ => Phase::Over };
        game.current = bytes[2];
        game.dice = bytes[3];
        game.roll_id = bytes[4];
        game.sixes_in_row = bytes[5].min(3);
        game.struck_this_turn = bytes[6] & 1 != 0;
        game.auto_played_last = bytes[6] & 2 != 0;
        game.no_move_reason = match bytes[7] { 1 => NoMoveReason::NothingLegal, 2 => NoMoveReason::ThreeSixes, _ => NoMoveReason::None };
        game.active = bytes[8] & 15;
        game.joined = bytes[9] & 15;
        game.next_place = bytes[10].clamp(1, 5);
        for seat in 0..SEATS {
            game.places[seat] = bytes[12 + seat].min(4);
            game.strikes[seat] = bytes[16 + seat].min(MAX_STRIKES);
            for token in 0..TOKENS { game.progress[seat][token] = bytes[20 + seat * 4 + token]; }
        }
        let rng = u32::from_le_bytes([bytes[36], bytes[37], bytes[38], bytes[39]]);
        game.rng = if rng == 0 { 1 } else { rng };
        game.last_move = LastMove {
            id: bytes[40], seat: bytes[41], token: bytes[42], from: bytes[43], to: bytes[44], capture_count: bytes[45].min(3),
            captures: [0, 1, 2].map(|index| Capture { seat: bytes[46 + index * 3], token: bytes[47 + index * 3], from: bytes[48 + index * 3] }),
        };
        game.forced_roll = bytes[55].min(6);
        *self = game;
        true
    }
}
