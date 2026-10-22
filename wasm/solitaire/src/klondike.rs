pub const STOCK: u8 = 0;
pub const WASTE: u8 = 1;
pub const FIRST_FOUNDATION: u8 = 2;
pub const FIRST_COLUMN: u8 = 6;
pub const LAST_COLUMN: u8 = 12;

pub fn suit_of(card: u8) -> u8 { card / 13 }
pub fn rank_of(card: u8) -> u8 { card % 13 }
pub fn is_red(card: u8) -> bool { matches!(suit_of(card), 1 | 2) }
fn is_foundation(location: u8) -> bool { (FIRST_FOUNDATION..FIRST_COLUMN).contains(&location) }
fn is_column(location: u8) -> bool { (FIRST_COLUMN..=LAST_COLUMN).contains(&location) }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action { Draw, Move { from: u8, count: u8, to: u8 } }

#[derive(Clone, Debug)]
pub struct Klondike {
    pub seed: u32,
    pub draw_count: u8,
    /// Top card = last element.
    pub stock: Vec<u8>,
    pub waste: Vec<u8>,
    /// Foundation i holds suit i, ace first.
    pub foundations: [Vec<u8>; 4],
    pub columns: [Vec<u8>; 7],
    /// How many cards at the bottom of each column are face down.
    pub face_down: [u8; 7],
    pub score: i32,
    pub actions: Vec<Action>,
}

/// Seeded shuffle (mulberry32), so a seed always gives the same deal.
fn shuffled_deck(seed: u32) -> Vec<u8> {
    let mut state = seed;
    let mut next = move || {
        state = state.wrapping_add(0x6D2B_79F5);
        let mut value = state;
        value = (value ^ (value >> 15)).wrapping_mul(value | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        value ^ (value >> 14)
    };
    let mut deck: Vec<u8> = (0..52).collect();
    for i in (1..deck.len()).rev() { deck.swap(i, (next() % (i as u32 + 1)) as usize); }
    deck
}

impl Klondike {
    pub fn deal(seed: u32, draw_count: u8) -> Klondike {
        let mut deck = shuffled_deck(seed);
        let mut columns: [Vec<u8>; 7] = Default::default();
        for (index, column) in columns.iter_mut().enumerate() {
            for _ in 0..=index { column.push(deck.pop().unwrap_or(0)); }
        }
        let face_down = [0, 1, 2, 3, 4, 5, 6];
        Klondike { seed, draw_count, stock: deck, waste: Vec::new(), foundations: Default::default(), columns, face_down, score: 0, actions: Vec::new() }
    }

    pub fn replay(seed: u32, draw_count: u8, encoded: &[u8]) -> Option<Klondike> {
        if encoded.len() % 3 != 0 { return None; }
        let mut game = Klondike::deal(seed, draw_count);
        for chunk in encoded.chunks(3) {
            let action = if chunk[0] == 255 { Action::Draw } else { Action::Move { from: chunk[0], count: chunk[1], to: chunk[2] } };
            if !game.perform(action) { return None; }
        }
        Some(game)
    }

    pub fn encoded_actions(&self) -> Vec<u8> {
        self.actions.iter().flat_map(|action| match *action {
            Action::Draw => [255, 0, 0],
            Action::Move { from, count, to } => [from, count, to],
        }).collect()
    }

    pub fn undo(&mut self) -> bool {
        if self.actions.is_empty() { return false; }
        let mut encoded = self.encoded_actions();
        encoded.truncate(encoded.len() - 3);
        match Klondike::replay(self.seed, self.draw_count, &encoded) { Some(game) => { *self = game; true } None => false }
    }

    fn face_up_count(&self, column: usize) -> usize { self.columns[column].len() - self.face_down[column] as usize }

    /// The cards that would move (bottom first), if `count` cards can be picked up at `from`.
    fn picked_cards(&self, from: u8, count: u8) -> Option<&[u8]> {
        let count = count as usize;
        if count == 0 { return None; }
        if from == WASTE { return if count == 1 { self.waste.last().map(core::slice::from_ref) } else { None }; }
        if is_foundation(from) {
            return if count == 1 { self.foundations[(from - FIRST_FOUNDATION) as usize].last().map(core::slice::from_ref) } else { None };
        }
        if !is_column(from) { return None; }
        let column = (from - FIRST_COLUMN) as usize;
        if count > self.face_up_count(column) { return None; }
        let cards = &self.columns[column][self.columns[column].len() - count..];
        let is_run = cards.windows(2).all(|pair| rank_of(pair[0]) == rank_of(pair[1]) + 1 && is_red(pair[0]) != is_red(pair[1]));
        if is_run { Some(cards) } else { None }
    }

    fn accepts(&self, to: u8, cards: &[u8]) -> bool {
        let first = cards[0];
        if is_foundation(to) {
            let foundation = &self.foundations[(to - FIRST_FOUNDATION) as usize];
            return cards.len() == 1 && suit_of(first) == to - FIRST_FOUNDATION && rank_of(first) as usize == foundation.len();
        }
        if !is_column(to) { return false; }
        match self.columns[(to - FIRST_COLUMN) as usize].last() {
            None => rank_of(first) == 12,
            Some(&top) => rank_of(top) == rank_of(first) + 1 && is_red(top) != is_red(first),
        }
    }

    pub fn can_move(&self, from: u8, count: u8, to: u8) -> bool {
        if from == to { return false; }
        match self.picked_cards(from, count) { Some(cards) => self.accepts(to, cards), None => false }
    }

    pub fn perform(&mut self, action: Action) -> bool {
        match action {
            Action::Draw => {
                if self.stock.is_empty() {
                    if self.waste.is_empty() { return false; }
                    while let Some(card) = self.waste.pop() { self.stock.push(card); }
                    self.score = (self.score - if self.draw_count == 1 { 100 } else { 20 }).max(0);
                } else {
                    for _ in 0..self.draw_count { if let Some(card) = self.stock.pop() { self.waste.push(card); } }
                }
            }
            Action::Move { from, count, to } => {
                if !self.can_move(from, count, to) { return false; }
                let moving: Vec<u8> = self.picked_cards(from, count).unwrap_or(&[]).to_vec();
                match from {
                    WASTE => { self.waste.pop(); }
                    location if is_foundation(location) => { self.foundations[(location - FIRST_FOUNDATION) as usize].pop(); }
                    location => {
                        let column = (location - FIRST_COLUMN) as usize;
                        let keep = self.columns[column].len() - moving.len();
                        self.columns[column].truncate(keep);
                        if self.face_down[column] as usize == keep && keep > 0 { self.face_down[column] -= 1; self.score += 5; }
                    }
                }
                if is_foundation(to) { self.foundations[(to - FIRST_FOUNDATION) as usize].extend_from_slice(&moving); }
                else { self.columns[(to - FIRST_COLUMN) as usize].extend_from_slice(&moving); }
                self.score += match (from, to) {
                    (WASTE, to) if is_column(to) => 5,
                    (from, to) if !is_foundation(from) && is_foundation(to) => 10,
                    (from, to) if is_foundation(from) && is_column(to) => -15,
                    _ => 0,
                };
                self.score = self.score.max(0);
            }
        }
        self.actions.push(action);
        true
    }

    pub fn is_won(&self) -> bool { self.foundations.iter().all(|foundation| foundation.len() == 13) }

    pub fn can_auto_finish(&self) -> bool { self.stock.is_empty() && self.waste.is_empty() && self.face_down.iter().all(|&count| count == 0) && !self.is_won() }

    /// Best place for `count` cards from `from`: a foundation, then a column with cards, then an empty column
    /// (a king isn't moved from one empty-bottomed column to another).
    pub fn best_destination(&self, from: u8, count: u8) -> Option<u8> {
        let cards = self.picked_cards(from, count)?;
        if count == 1 {
            let foundation = FIRST_FOUNDATION + suit_of(cards[0]);
            if !is_foundation(from) && self.accepts(foundation, cards) { return Some(foundation); }
        }
        let is_whole_column = is_column(from) && self.face_down[(from - FIRST_COLUMN) as usize] == 0
            && self.columns[(from - FIRST_COLUMN) as usize].len() == count as usize;
        let mut empty_target = None;
        for to in FIRST_COLUMN..=LAST_COLUMN {
            if to == from || !self.accepts(to, cards) { continue; }
            if self.columns[(to - FIRST_COLUMN) as usize].is_empty() { if empty_target.is_none() && !is_whole_column { empty_target = Some(to); } }
            else { return Some(to); }
        }
        empty_target
    }

    /// A card that can go to its foundation. Safe = no card in play could still need it (both foundations of the
    /// other color are at least up to one rank below).
    pub fn foundation_candidate(&self, safe_only: bool) -> Option<(u8, u8)> {
        let sources = core::iter::once(WASTE).chain(FIRST_COLUMN..=LAST_COLUMN);
        for from in sources {
            let Some(cards) = self.picked_cards(from, 1) else { continue };
            let card = cards[0];
            let to = FIRST_FOUNDATION + suit_of(card);
            if !self.accepts(to, cards) { continue; }
            if safe_only && rank_of(card) > 1 {
                let other_color_lowest = (0..4u8).filter(|&suit| (suit == 1 || suit == 2) != is_red(card))
                    .map(|suit| self.foundations[suit as usize].len()).min().unwrap_or(0);
                if other_color_lowest + 1 < rank_of(card) as usize { continue; }
            }
            return Some((from, to));
        }
        None
    }

    /// A move that makes progress: to a foundation, one that turns a face-down card, waste to a column, or draw.
    pub fn hint(&self) -> Option<Action> {
        if let Some((from, to)) = self.foundation_candidate(false) { return Some(Action::Move { from, count: 1, to }); }
        // whole face-up runs that uncover a face-down card (or empty a column for a king waiting elsewhere)
        for column in 0..7usize {
            let face_up = self.face_up_count(column);
            if face_up == 0 || self.face_down[column] == 0 { continue; }
            let from = FIRST_COLUMN + column as u8;
            for to in FIRST_COLUMN..=LAST_COLUMN {
                if self.can_move(from, face_up as u8, to) { return Some(Action::Move { from, count: face_up as u8, to }); }
            }
        }
        if let Some(to) = self.best_destination(WASTE, 1) { return Some(Action::Move { from: WASTE, count: 1, to }); }
        // a partial run that frees a card which can then go up to a foundation
        for column in 0..7usize {
            let from = FIRST_COLUMN + column as u8;
            for count in 1..self.face_up_count(column) {
                let length = self.columns[column].len();
                let freed = self.columns[column][length - count - 1];
                let freed_can_go_up = rank_of(freed) as usize == self.foundations[suit_of(freed) as usize].len();
                if !freed_can_go_up { continue; }
                for to in FIRST_COLUMN..=LAST_COLUMN {
                    if self.can_move(from, count as u8, to) { return Some(Action::Move { from, count: count as u8, to }); }
                }
            }
        }
        if !self.stock.is_empty() || !self.waste.is_empty() { return Some(Action::Draw); }
        None
    }

    pub fn layout(&self) -> Vec<u8> {
        let mut layout = vec![self.stock.len() as u8, self.waste.len() as u8];
        layout.extend_from_slice(&self.waste);
        for foundation in &self.foundations { layout.push(foundation.len() as u8); layout.extend_from_slice(foundation); }
        for (column, cards) in self.columns.iter().enumerate() {
            layout.push(cards.len() as u8);
            layout.push(self.face_down[column]);
            layout.extend_from_slice(cards);
        }
        layout
    }
}
