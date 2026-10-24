//! Snakes & Ladders rules. Squares 1..=100 (0 = not on the board yet); 2–4 seats take turns rolling one die.
//!
//! A roll moves the token forward; landing on the foot of a ladder climbs it, on a snake's head slides down to its
//! tail. 100 must be reached exactly (a roll that would overshoot leaves the token where it is). A 6 gives another
//! roll, but three 6s in a row end the turn without moving. Seats finish in order (1st, 2nd, …) and play goes on until
//! one seat is left.
//!
//! Turn flow (same phases as Ludo, so the shared room code drives both): AwaitRoll → roll → Resolving (the browsers
//! animate the move; the host then calls `pass_turn`) → next seat (or the same seat after a 6). Missed turns:
//! `timeout` rolls for the player and adds a strike (once per turn); the third strike forfeits the seat.

pub const SEATS: usize = 4;
pub const LAST_SQUARE: u8 = 100;
pub const MAX_STRIKES: u8 = 3;
pub const REMOVED: u8 = 254;

/// The boards: (from, to) pairs. `to > from` is a ladder, `to < from` a snake. Board 0 is the default.
pub const BOARDS: [&[(u8, u8)]; 5] = [
    // 0 Mango Grove: the classic balance
    &[(4, 14), (9, 31), (21, 42), (28, 84), (40, 59), (51, 67), (63, 81), (71, 91),
      (17, 7), (54, 34), (62, 19), (64, 60), (87, 24), (93, 73), (95, 75), (99, 78)],
    // 1 Monsoon Rapids: more snakes than ladders
    &[(3, 22), (11, 26), (20, 29), (36, 55), (50, 69), (57, 76), (72, 92),
      (27, 5), (38, 15), (46, 25), (49, 12), (66, 45), (74, 53), (83, 58), (89, 68), (97, 78), (98, 41)],
    // 2 Temple Steps: long ladders, long snakes
    &[(2, 38), (8, 31), (16, 45), (33, 70), (36, 44), (51, 73), (61, 88), (79, 98),
      (25, 3), (48, 26), (56, 37), (69, 32), (86, 52), (94, 65), (96, 58)],
    // 3 Spice Bazaar: lots of short hops both ways
    &[(5, 16), (12, 23), (19, 38), (30, 41), (42, 63), (53, 64), (60, 79), (77, 86), (82, 93),
      (24, 13), (35, 27), (47, 34), (58, 39), (67, 48), (75, 55), (88, 69), (92, 72), (97, 84)],
    // 4 Starry Night: a few huge jumps
    &[(6, 46), (18, 39), (26, 85), (44, 65), (58, 87), (70, 90),
      (31, 9), (52, 10), (64, 22), (73, 41), (81, 43), (89, 54), (95, 35), (98, 8)],
];
pub const BOARD_COUNT: u8 = BOARDS.len() as u8;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Phase { Lobby = 0, AwaitRoll = 1, Resolving = 3, Over = 4 }

/// What the last roll did besides moving (shown to the players).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum RollNote { None = 0, Overshoot = 1, ThreeSixes = 2 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum TimeoutResult { Nothing = 0, AutoPlayed = 1, Forfeited = 2 }

/// The last move, so every browser animates the same hops, climb or slide.
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct LastMove { pub id: u8, pub seat: u8, pub from: u8, pub landed: u8, pub to: u8 }

#[derive(Clone)]
pub struct Game {
    pub board: u8,
    pub phase: Phase,
    pub current: u8,
    pub dice: u8,
    pub roll_id: u8,
    pub sixes_in_row: u8,
    pub struck_this_turn: bool,
    pub auto_played_last: bool,
    pub note: RollNote,
    pub active: u8,
    pub joined: u8,
    pub places: [u8; SEATS],
    pub next_place: u8,
    pub strikes: [u8; SEATS],
    pub positions: [u8; SEATS],
    pub rng: u32,
    pub forced_roll: u8,
    pub last_move: LastMove,
}

/// Where a token that lands on `square` ends up on `board` (the top of a ladder, the tail of a snake, or there).
pub fn jump(board: u8, square: u8) -> u8 {
    BOARDS[(board % BOARD_COUNT) as usize].iter().find(|&&(from, _)| from == square).map_or(square, |&(_, to)| to)
}

impl Game {
    pub fn new(seed: u32) -> Game {
        Game {
            board: 0, phase: Phase::Lobby, current: 0, dice: 0, roll_id: 0, sixes_in_row: 0, struck_this_turn: false, auto_played_last: false,
            note: RollNote::None, active: 0, joined: 0, places: [0; SEATS], next_place: 1, strikes: [0; SEATS], positions: [0; SEATS],
            rng: if seed == 0 { 1 } else { seed }, forced_roll: 0, last_move: LastMove { seat: 255, ..LastMove::default() },
        }
    }

    pub fn set_board(&mut self, board: u8) -> bool {
        if board >= BOARD_COUNT || !matches!(self.phase, Phase::Lobby | Phase::Over) { return false; }
        self.board = board;
        true
    }

    /// Start with the seats in `seats_mask` (at least two); `first` rolls first.
    pub fn start(&mut self, seats_mask: u8, first: u8) -> bool {
        let mask = seats_mask & 0b1111;
        if mask.count_ones() < 2 { return false; }
        let (rng, board) = (self.rng, self.board);
        *self = Game::new(rng);
        self.board = board;
        self.joined = mask;
        self.active = mask;
        for seat in 0..SEATS { if mask & (1 << seat) == 0 { self.positions[seat] = REMOVED; } }
        self.current = first % 4;
        if !self.in_play(self.current) { self.current = self.next_seat_after(self.current); }
        self.phase = Phase::AwaitRoll;
        true
    }

    pub fn in_play(&self, seat: u8) -> bool { self.active & (1 << seat) != 0 && self.places[seat as usize] == 0 }

    fn next_seat_after(&self, seat: u8) -> u8 {
        for step in 1..=SEATS as u8 {
            let candidate = (seat + step) % 4;
            if self.in_play(candidate) { return candidate; }
        }
        seat
    }

    fn random_die(&mut self) -> u8 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        (x % 6) as u8 + 1
    }

    /// Roll and move the current seat. Returns the dice (0 if not allowed). The phase becomes Resolving.
    pub fn roll(&mut self) -> u8 {
        if self.phase != Phase::AwaitRoll { return 0; }
        let dice = if self.forced_roll != 0 { let value = self.forced_roll; self.forced_roll = 0; value } else { self.random_die() };
        self.dice = dice;
        self.roll_id = self.roll_id.wrapping_add(1);
        self.auto_played_last = false;
        self.sixes_in_row = if dice == 6 { self.sixes_in_row + 1 } else { 0 };
        let seat = self.current;
        let from = self.positions[seat as usize];
        let mut last = LastMove { id: self.last_move.id.wrapping_add(1), seat, from, landed: from, to: from };
        if self.sixes_in_row >= 3 {
            self.note = RollNote::ThreeSixes;
        } else if from + dice > LAST_SQUARE {
            self.note = RollNote::Overshoot;
        } else {
            self.note = RollNote::None;
            last.landed = from + dice;
            last.to = jump(self.board, last.landed);
            self.positions[seat as usize] = last.to;
            if last.to == LAST_SQUARE {
                self.places[seat as usize] = self.next_place;
                self.next_place += 1;
            }
        }
        self.last_move = last;
        self.phase = Phase::Resolving;
        dice
    }

    /// After the move has been shown: next seat, or the same seat again after a 6 (unless it just finished).
    pub fn pass_turn(&mut self) -> bool {
        if self.phase != Phase::Resolving { return false; }
        self.check_over();
        if self.phase == Phase::Over { return true; }
        let again = self.dice == 6 && self.note != RollNote::ThreeSixes && self.in_play(self.current);
        if !again {
            self.sixes_in_row = 0;
            self.current = self.next_seat_after(self.current);
        }
        self.phase = Phase::AwaitRoll;
        self.struck_this_turn = false;
        self.note = RollNote::None;
        true
    }

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

    /// A seat leaves (left, removed or forfeited): its token goes and play goes on.
    pub fn remove_seat(&mut self, seat: u8) -> bool {
        if seat as usize >= SEATS || self.active & (1 << seat) == 0 { return false; }
        self.active &= !(1 << seat);
        self.positions[seat as usize] = REMOVED;
        if matches!(self.phase, Phase::Lobby | Phase::Over) { return true; }
        let was_current = self.current == seat;
        self.check_over();
        if self.phase != Phase::Over && was_current {
            self.sixes_in_row = 0;
            self.current = self.next_seat_after(seat);
            self.phase = Phase::AwaitRoll;
            self.struck_this_turn = false;
            self.note = RollNote::None;
        }
        true
    }

    /// The current seat ran out of time: a strike (once per turn; the third forfeits), then roll for them.
    pub fn timeout(&mut self) -> TimeoutResult {
        if self.phase != Phase::AwaitRoll { return TimeoutResult::Nothing; }
        let seat = self.current;
        if !self.struck_this_turn {
            self.struck_this_turn = true;
            self.strikes[seat as usize] += 1;
            if self.strikes[seat as usize] >= MAX_STRIKES {
                self.remove_seat(seat);
                return TimeoutResult::Forfeited;
            }
        }
        self.roll();
        self.auto_played_last = true;
        TimeoutResult::AutoPlayed
    }

    // ---------- snapshot (the host broadcasts it; a new host restores it) ----------
    pub const SNAPSHOT_LENGTH: usize = 34;
    pub fn snapshot(&self) -> [u8; Self::SNAPSHOT_LENGTH] {
        let mut bytes = [0u8; Self::SNAPSHOT_LENGTH];
        bytes[0] = 1;
        bytes[1] = self.phase as u8;
        bytes[2] = self.current;
        bytes[3] = self.dice;
        bytes[4] = self.roll_id;
        bytes[5] = self.sixes_in_row;
        bytes[6] = self.struck_this_turn as u8 | (self.auto_played_last as u8) << 1;
        bytes[7] = self.note as u8;
        bytes[8] = self.active;
        bytes[9] = self.joined;
        bytes[10] = self.next_place;
        bytes[11] = self.board;
        bytes[12..16].copy_from_slice(&self.places);
        bytes[16..20].copy_from_slice(&self.strikes);
        bytes[20..24].copy_from_slice(&self.positions);
        bytes[24..28].copy_from_slice(&self.rng.to_le_bytes());
        bytes[28] = self.last_move.id;
        bytes[29] = self.last_move.seat;
        bytes[30] = self.last_move.from;
        bytes[31] = self.last_move.landed;
        bytes[32] = self.last_move.to;
        bytes[33] = self.forced_roll;
        bytes
    }

    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        if bytes.len() != Self::SNAPSHOT_LENGTH || bytes[0] != 1 || bytes[11] >= BOARD_COUNT { return false; }
        let phase = match bytes[1] { 0 => Phase::Lobby, 1 => Phase::AwaitRoll, 3 => Phase::Resolving, 4 => Phase::Over, _ => return false };
        let note = match bytes[7] { 0 => RollNote::None, 1 => RollNote::Overshoot, 2 => RollNote::ThreeSixes, _ => return false };
        if bytes[2] >= SEATS as u8 { return false; }
        for seat in 0..SEATS { let position = bytes[20 + seat]; if position > LAST_SQUARE && position != REMOVED { return false; } }
        let mut game = Game::new(1);
        game.phase = phase;
        game.current = bytes[2];
        game.dice = bytes[3].min(6);
        game.roll_id = bytes[4];
        game.sixes_in_row = bytes[5].min(3);
        game.struck_this_turn = bytes[6] & 1 != 0;
        game.auto_played_last = bytes[6] & 2 != 0;
        game.note = note;
        game.active = bytes[8] & 0b1111;
        game.joined = bytes[9] & 0b1111;
        game.next_place = bytes[10].clamp(1, 5);
        game.board = bytes[11];
        for seat in 0..SEATS {
            game.places[seat] = bytes[12 + seat].min(4);
            game.strikes[seat] = bytes[16 + seat].min(MAX_STRIKES);
            game.positions[seat] = bytes[20 + seat];
        }
        let rng = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
        game.rng = if rng == 0 { 1 } else { rng };
        game.last_move = LastMove { id: bytes[28], seat: bytes[29], from: bytes[30], landed: bytes[31], to: bytes[32] };
        game.forced_roll = bytes[33].min(6);
        *self = game;
        true
    }
}
