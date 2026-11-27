//! Little Painter for JavaScript: a coloring book for children. Rust owns the book: which picture is open, the colour
//! of every region of every picture (palette index, 0 = still white), the selected colour, a per-picture undo history,
//! completion tracking and the save format. The pictures themselves (SVG outlines) live in TypeScript
//! (src/games/littlepainter/pictures.ts); a test checks both sides agree on how many regions each picture has.
pub mod book;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use book::*;

#[wasm_bindgen]
pub struct LittlePainter {
    book: Book,
}

#[wasm_bindgen]
impl LittlePainter {
    /// A fresh book: every picture white, the Peacock (picture 0) open, the first colour selected.
    #[wasm_bindgen(constructor)]
    pub fn new() -> LittlePainter {
        LittlePainter { book: Book::new() }
    }
    pub fn picture_count() -> usize {
        PICTURE_COUNT
    }
    /// Number of tappable regions in a picture (0 for an unknown picture).
    pub fn region_count(picture: usize) -> usize {
        REGION_COUNTS.get(picture).map_or(0, |count| *count as usize)
    }
    /// Number of paint colours; the eraser (index 0) is extra.
    pub fn palette_size() -> usize {
        PALETTE.len()
    }
    /// 0xRRGGBB of a palette index (index 0, the eraser / unpainted, is white).
    pub fn palette_rgb(color: u8) -> u32 {
        palette_rgb(color)
    }
    pub fn active_picture(&self) -> usize {
        self.book.active_picture()
    }
    pub fn set_active_picture(&mut self, picture: usize) -> bool {
        self.book.set_active_picture(picture)
    }
    pub fn selected_color(&self) -> u8 {
        self.book.selected_color()
    }
    pub fn select_color(&mut self, color: u8) -> bool {
        self.book.select_color(color)
    }
    /// Paint a region of the open picture with the selected colour. False when nothing changed.
    pub fn fill(&mut self, region: usize) -> bool {
        self.book.fill(region)
    }
    pub fn color_of(&self, picture: usize, region: usize) -> u8 {
        self.book.color_of(picture, region)
    }
    /// Every region's colour of a picture (a copy, one byte per region).
    pub fn colors(&self, picture: usize) -> Vec<u8> {
        self.book.colors(picture).to_vec()
    }
    pub fn undo(&mut self) -> bool {
        self.book.undo()
    }
    pub fn can_undo(&self) -> bool {
        self.book.can_undo()
    }
    pub fn undo_depth(&self) -> usize {
        self.book.undo_depth()
    }
    /// Make the open picture white again (one undo step brings it all back).
    pub fn clear(&mut self) -> bool {
        self.book.clear()
    }
    pub fn colored_count(&self, picture: usize) -> usize {
        self.book.colored_count(picture)
    }
    pub fn is_complete(&self, picture: usize) -> bool {
        self.book.is_complete(picture)
    }
    /// Bit i set = picture i has every region painted.
    pub fn completed_mask(&self) -> u32 {
        self.book.completed_mask()
    }
    /// Index of the first region of the open picture that is still white, or -1.
    pub fn first_unpainted(&self) -> i32 {
        self.book.first_unpainted()
    }
    /// The whole book as bytes (see `Book::save`).
    pub fn save(&self) -> Vec<u8> {
        self.book.save()
    }
    /// Restore a saved book. False (and nothing changes) when the bytes aren't a valid save.
    pub fn load(&mut self, bytes: &[u8]) -> bool {
        self.book.load(bytes)
    }
}

impl Default for LittlePainter {
    fn default() -> Self {
        Self::new()
    }
}
