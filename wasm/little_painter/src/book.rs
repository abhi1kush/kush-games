//! The coloring book state, independent of JavaScript.

/// Peacock, Butterfly, Rocket, Dinosaur, House, Whale, Elephant (same order as pictures.ts).
pub const PICTURE_COUNT: usize = 7;
/// Tappable regions per picture. Mirrors pictures.ts (checked by src/wasm/wasm.test.ts).
pub const REGION_COUNTS: [u8; PICTURE_COUNT] = [34, 19, 16, 16, 17, 17, 14];
/// Colour 0 means "not painted" (white); the eraser paints 0.
pub const ERASER: u8 = 0;
/// Soft, cheerful paints (0xRRGGBB); palette index = position + 1. Mirrors the names in pictures.ts.
pub const PALETTE: [u32; 16] = [
    0xe9645f, // cherry red
    0xf5a25d, // orange
    0xf7d661, // sunny yellow
    0xa8d672, // lime
    0x5cb88a, // leaf green
    0x4cb8b0, // teal
    0x6cc3ec, // sky blue
    0x4d82cf, // ocean blue
    0x8a73c9, // purple
    0xf29bc0, // pink
    0xf7c6a3, // peach
    0xa87a5a, // brown
    0xe3c48f, // sand
    0xb9bec7, // cloud gray
    0x55525f, // charcoal
    0xfffaf0, // snow white (painted, unlike the eraser)
];
/// Undo steps kept per picture.
pub const MAX_UNDO: usize = 200;
/// First byte of a save; bump when the layout changes.
pub const SAVE_VERSION: u8 = 1;

pub fn palette_rgb(color: u8) -> u32 {
    if color == ERASER { 0xffffff } else { PALETTE.get(color as usize - 1).copied().unwrap_or(0xffffff) }
}

const fn is_paint(color: u8) -> bool {
    color as usize <= PALETTE.len()
}

/// One undoable change to a picture.
#[derive(Clone, Debug, PartialEq)]
enum Step {
    /// A region was painted; `previous` is the colour it had before.
    Fill { region: u8, previous: u8 },
    /// The picture was cleared; `previous` is every region's colour before.
    Clear { previous: Vec<u8> },
}

#[derive(Clone, Debug)]
pub struct Book {
    /// colours[picture][region]
    colours: Vec<Vec<u8>>,
    /// undo history per picture (newest last)
    histories: Vec<Vec<Step>>,
    active_picture: usize,
    selected_color: u8,
}

impl Default for Book {
    fn default() -> Self {
        Self::new()
    }
}

impl Book {
    pub fn new() -> Book {
        Book {
            colours: REGION_COUNTS.iter().map(|count| vec![ERASER; *count as usize]).collect(),
            histories: (0..PICTURE_COUNT).map(|_| Vec::new()).collect(),
            active_picture: 0,
            selected_color: 1,
        }
    }

    pub fn active_picture(&self) -> usize {
        self.active_picture
    }

    pub fn set_active_picture(&mut self, picture: usize) -> bool {
        if picture >= PICTURE_COUNT || picture == self.active_picture { return false; }
        self.active_picture = picture;
        true
    }

    pub fn selected_color(&self) -> u8 {
        self.selected_color
    }

    pub fn select_color(&mut self, color: u8) -> bool {
        if !is_paint(color) || color == self.selected_color { return false; }
        self.selected_color = color;
        true
    }

    pub fn fill(&mut self, region: usize) -> bool {
        let picture = self.active_picture;
        let Some(slot) = self.colours[picture].get_mut(region) else { return false };
        if *slot == self.selected_color { return false; }
        let previous = *slot;
        *slot = self.selected_color;
        self.push(Step::Fill { region: region as u8, previous });
        true
    }

    fn push(&mut self, step: Step) {
        let history = &mut self.histories[self.active_picture];
        if history.len() == MAX_UNDO { history.remove(0); }
        history.push(step);
    }

    pub fn color_of(&self, picture: usize, region: usize) -> u8 {
        self.colours.get(picture).and_then(|regions| regions.get(region)).copied().unwrap_or(ERASER)
    }

    pub fn colors(&self, picture: usize) -> &[u8] {
        self.colours.get(picture).map_or(&[], |regions| regions.as_slice())
    }

    pub fn undo(&mut self) -> bool {
        let picture = self.active_picture;
        match self.histories[picture].pop() {
            Some(Step::Fill { region, previous }) => self.colours[picture][region as usize] = previous,
            Some(Step::Clear { previous }) => self.colours[picture] = previous,
            None => return false,
        }
        true
    }

    pub fn can_undo(&self) -> bool {
        !self.histories[self.active_picture].is_empty()
    }

    pub fn undo_depth(&self) -> usize {
        self.histories[self.active_picture].len()
    }

    pub fn clear(&mut self) -> bool {
        let picture = self.active_picture;
        if self.colored_count(picture) == 0 { return false; }
        let previous = core::mem::replace(&mut self.colours[picture], vec![ERASER; REGION_COUNTS[picture] as usize]);
        self.push(Step::Clear { previous });
        true
    }

    pub fn colored_count(&self, picture: usize) -> usize {
        self.colors(picture).iter().filter(|color| **color != ERASER).count()
    }

    pub fn is_complete(&self, picture: usize) -> bool {
        picture < PICTURE_COUNT && self.colored_count(picture) == REGION_COUNTS[picture] as usize
    }

    pub fn completed_mask(&self) -> u32 {
        (0..PICTURE_COUNT).filter(|picture| self.is_complete(*picture)).fold(0, |mask, picture| mask | 1 << picture)
    }

    pub fn first_unpainted(&self) -> i32 {
        self.colors(self.active_picture).iter().position(|color| *color == ERASER).map_or(-1, |region| region as i32)
    }

    /// Layout: [SAVE_VERSION, active picture, selected colour, picture count, then per picture: region count, colours…].
    /// Undo history is not saved (a refresh starts a fresh history).
    pub fn save(&self) -> Vec<u8> {
        let mut bytes = vec![SAVE_VERSION, self.active_picture as u8, self.selected_color, PICTURE_COUNT as u8];
        for regions in &self.colours {
            bytes.push(regions.len() as u8);
            bytes.extend_from_slice(regions);
        }
        bytes
    }

    /// Restores a save. A picture whose region count no longer matches (its outline changed) starts white; anything
    /// else malformed rejects the whole save.
    pub fn load(&mut self, bytes: &[u8]) -> bool {
        let [version, active_picture, selected_color, picture_count, rest @ ..] = bytes else { return false };
        if *version != SAVE_VERSION || *active_picture as usize >= PICTURE_COUNT || !is_paint(*selected_color) { return false; }
        let mut colours = Book::new().colours;
        let mut cursor = rest;
        for picture in 0..*picture_count as usize {
            let [count, after @ ..] = cursor else { return false };
            let count = *count as usize;
            if after.len() < count { return false; }
            let (regions, after) = after.split_at(count);
            if !regions.iter().all(|color| is_paint(*color)) { return false; }
            if picture < PICTURE_COUNT && count == REGION_COUNTS[picture] as usize { colours[picture].copy_from_slice(regions); }
            cursor = after;
        }
        if !cursor.is_empty() { return false; }
        self.colours = colours;
        self.histories.iter_mut().for_each(Vec::clear);
        self.active_picture = *active_picture as usize;
        self.selected_color = *selected_color;
        true
    }
}
