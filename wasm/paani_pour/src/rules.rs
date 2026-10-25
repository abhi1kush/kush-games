//! Tubes of coloured water. Each tube holds `CAPACITY` layers, bottom first; 0 is empty.
//! A pour moves the run of same-coloured layers on top of one tube onto another tube whose top is empty or the same
//! colour, as many layers as fit.

pub const CAPACITY: usize = 4;
pub const MAX_TUBES: usize = 14;
pub const EMPTY: u8 = 0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(C)]
pub struct Board {
    /// `layers[tube * CAPACITY + depth]`, depth 0 = bottom.
    pub layers: [u8; MAX_TUBES * CAPACITY],
    pub tube_count: u8,
}

impl Board {
    pub fn new(tube_count: u8) -> Board { Board { layers: [EMPTY; MAX_TUBES * CAPACITY], tube_count: tube_count.min(MAX_TUBES as u8) } }

    pub fn tube(&self, tube: usize) -> &[u8] { &self.layers[tube * CAPACITY..tube * CAPACITY + CAPACITY] }

    pub fn height(&self, tube: usize) -> usize { self.tube(tube).iter().take_while(|&&colour| colour != EMPTY).count() }

    pub fn top(&self, tube: usize) -> u8 { let height = self.height(tube); if height == 0 { EMPTY } else { self.tube(tube)[height - 1] } }

    /// How many same-coloured layers sit on top.
    pub fn top_run(&self, tube: usize) -> usize {
        let height = self.height(tube);
        if height == 0 { return 0; }
        let colour = self.tube(tube)[height - 1];
        self.tube(tube)[..height].iter().rev().take_while(|&&layer| layer == colour).count()
    }

    /// Full of a single colour.
    pub fn is_done(&self, tube: usize) -> bool { self.height(tube) == CAPACITY && self.top_run(tube) == CAPACITY }

    /// How many layers a pour from `from` to `to` would move (0 = not allowed).
    pub fn pour_amount(&self, from: usize, to: usize) -> usize {
        let count = self.tube_count as usize;
        if from >= count || to >= count || from == to { return 0; }
        let from_height = self.height(from);
        if from_height == 0 { return 0; }
        let to_height = self.height(to);
        if to_height == CAPACITY { return 0; }
        if to_height > 0 && self.top(to) != self.top(from) { return 0; }
        self.top_run(from).min(CAPACITY - to_height)
    }

    pub fn pour(&mut self, from: usize, to: usize) -> usize {
        let amount = self.pour_amount(from, to);
        self.move_layers(from, to, amount);
        amount
    }

    /// Move `amount` top layers from one tube to another with no checks (used to undo).
    pub fn move_layers(&mut self, from: usize, to: usize, amount: usize) {
        for _ in 0..amount {
            let from_height = self.height(from);
            let to_height = self.height(to);
            if from_height == 0 || to_height == CAPACITY { return; }
            let colour = self.layers[from * CAPACITY + from_height - 1];
            self.layers[from * CAPACITY + from_height - 1] = EMPTY;
            self.layers[to * CAPACITY + to_height] = colour;
        }
    }

    pub fn is_solved(&self) -> bool { (0..self.tube_count as usize).all(|tube| self.height(tube) == 0 || self.is_done(tube)) }

    /// Is there any pour that is allowed and not pointless (moving a whole single-colour tube into an empty one)?
    pub fn has_useful_pour(&self) -> bool {
        let count = self.tube_count as usize;
        (0..count).any(|from| (0..count).any(|to| self.pour_amount(from, to) > 0 && !self.is_pointless(from, to)))
    }

    /// Pouring a tube that holds only one colour into an empty tube changes nothing.
    pub fn is_pointless(&self, from: usize, to: usize) -> bool { self.height(to) == 0 && self.top_run(from) == self.height(from) }
}
