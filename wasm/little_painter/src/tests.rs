use crate::book::*;
use crate::LittlePainter;

fn paint_everything(book: &mut Book, picture: usize) {
    book.set_active_picture(picture);
    for region in 0..REGION_COUNTS[picture] as usize {
        book.select_color(1 + (region % PALETTE.len()) as u8);
        book.fill(region);
    }
}

#[test]
fn a_new_book_opens_on_the_white_peacock() {
    let book = Book::new();
    assert_eq!(book.active_picture(), 0, "the Peacock is picture 0 and opens first");
    assert_eq!(book.colors(0).len(), REGION_COUNTS[0] as usize);
    assert!(REGION_COUNTS[0] >= 30, "the peacock has plenty to color");
    assert!((0..PICTURE_COUNT).all(|picture| book.colored_count(picture) == 0));
    assert_eq!(book.selected_color(), 1);
    assert!(!book.can_undo());
    assert_eq!(book.completed_mask(), 0);
    assert_eq!(book.first_unpainted(), 0);
}

#[test]
fn filling_paints_one_region_with_the_selected_color() {
    let mut book = Book::new();
    assert!(book.select_color(7));
    assert!(book.fill(4));
    assert_eq!(book.color_of(0, 4), 7);
    assert_eq!(book.colored_count(0), 1);
    assert!(!book.fill(4), "the same colour again changes nothing and adds no undo step");
    assert_eq!(book.undo_depth(), 1);
    assert!(!book.fill(REGION_COUNTS[0] as usize), "a region past the end is ignored");
    assert!(!book.select_color(PALETTE.len() as u8 + 1), "no such paint");
    assert_eq!(book.colored_count(1), 0, "other pictures are untouched");
}

#[test]
fn the_eraser_makes_a_region_white_again() {
    let mut book = Book::new();
    book.fill(2);
    assert!(book.select_color(ERASER));
    assert!(book.fill(2));
    assert_eq!(book.color_of(0, 2), ERASER);
    assert_eq!(book.colored_count(0), 0);
    assert_eq!(palette_rgb(ERASER), 0xffffff);
    assert_eq!(palette_rgb(1), PALETTE[0]);
}

#[test]
fn undo_walks_back_step_by_step() {
    let mut book = Book::new();
    book.select_color(3);
    book.fill(0);
    book.select_color(5);
    book.fill(0);
    book.fill(1);
    assert!(book.undo());
    assert_eq!(book.color_of(0, 1), ERASER);
    assert!(book.undo());
    assert_eq!(book.color_of(0, 0), 3, "back to the earlier colour, not white");
    assert!(book.undo());
    assert_eq!(book.color_of(0, 0), ERASER);
    assert!(!book.undo());
}

#[test]
fn undo_history_is_kept_per_picture_and_capped() {
    let mut book = Book::new();
    book.fill(0);
    book.set_active_picture(2);
    assert!(!book.can_undo(), "the rocket has no history yet");
    book.fill(3);
    book.set_active_picture(0);
    assert!(book.undo());
    assert_eq!(book.color_of(0, 0), ERASER);
    assert_eq!(book.color_of(2, 3), 1, "undo on the peacock leaves the rocket alone");
    for step in 0..MAX_UNDO + 50 {
        book.select_color(1 + (step % 2) as u8);
        book.fill(0);
    }
    assert_eq!(book.undo_depth(), MAX_UNDO);
}

#[test]
fn clear_is_one_undoable_step() {
    let mut book = Book::new();
    paint_everything(&mut book, 0);
    let painted = book.colors(0).to_vec();
    assert!(book.clear());
    assert_eq!(book.colored_count(0), 0);
    assert!(!book.clear(), "an empty picture has nothing to clear");
    assert!(book.undo());
    assert_eq!(book.colors(0), painted.as_slice(), "undo brings the whole drawing back");
}

#[test]
fn completion_is_detected_per_picture() {
    let mut book = Book::new();
    for region in 0..REGION_COUNTS[0] as usize - 1 { book.fill(region); }
    assert!(!book.is_complete(0));
    assert_eq!(book.first_unpainted(), REGION_COUNTS[0] as i32 - 1);
    book.fill(REGION_COUNTS[0] as usize - 1);
    assert!(book.is_complete(0));
    assert_eq!(book.first_unpainted(), -1);
    assert_eq!(book.completed_mask(), 1);
    paint_everything(&mut book, 3);
    assert_eq!(book.completed_mask(), 0b1001);
    book.select_color(ERASER);
    book.fill(0);
    assert_eq!(book.completed_mask(), 0b0001, "erasing a region un-completes the dinosaur");
    assert!(!book.is_complete(PICTURE_COUNT));
}

#[test]
fn save_and_load_round_trip() {
    let mut book = Book::new();
    paint_everything(&mut book, 0);
    book.set_active_picture(4);
    book.select_color(9);
    book.fill(2);
    let bytes = book.save();
    assert_eq!(bytes.len(), 4 + PICTURE_COUNT + REGION_COUNTS.iter().map(|count| *count as usize).sum::<usize>());
    let mut restored = Book::new();
    assert!(restored.load(&bytes));
    assert_eq!(restored.active_picture(), 4);
    assert_eq!(restored.selected_color(), 9);
    for picture in 0..PICTURE_COUNT { assert_eq!(restored.colors(picture), book.colors(picture)); }
    assert!(restored.is_complete(0));
    assert!(!restored.can_undo(), "history starts fresh after a load");
    assert_eq!(restored.save(), bytes);
}

#[test]
fn bad_saves_are_rejected_without_changing_anything() {
    let mut book = Book::new();
    book.fill(1);
    let good = Book::new().save();
    let mut wrong_version = good.clone();
    wrong_version[0] = 99;
    let mut bad_picture = good.clone();
    bad_picture[1] = PICTURE_COUNT as u8;
    let mut bad_color = good.clone();
    bad_color[5] = 200;
    let truncated = &good[..good.len() - 1];
    let mut extra = good.clone();
    extra.push(0);
    for bytes in [&[][..], &[1, 0][..], &wrong_version, &bad_picture, &bad_color, truncated, &extra] {
        assert!(!book.load(bytes));
    }
    assert_eq!(book.color_of(0, 1), 1);
}

#[test]
fn a_picture_whose_outline_changed_starts_white_but_the_rest_loads() {
    let mut book = Book::new();
    paint_everything(&mut book, 1);
    paint_everything(&mut book, 0);
    let mut bytes = book.save();
    // shrink the peacock's stored region count by one, as if an older version of the art had fewer regions
    bytes[4] -= 1;
    bytes.remove(5);
    let mut restored = Book::new();
    assert!(restored.load(&bytes));
    assert_eq!(restored.colored_count(0), 0);
    assert!(restored.is_complete(1));
}

#[test]
fn the_wasm_wrapper_reports_the_catalog() {
    assert_eq!(LittlePainter::picture_count(), PICTURE_COUNT);
    assert_eq!(LittlePainter::region_count(0), REGION_COUNTS[0] as usize);
    assert_eq!(LittlePainter::region_count(PICTURE_COUNT), 0);
    assert_eq!(LittlePainter::palette_size(), 16);
    let mut painter = LittlePainter::new();
    assert!(painter.fill(0));
    assert_eq!(painter.colors(0)[0], 1);
    assert!(PALETTE.iter().all(|rgb| *rgb <= 0xffffff));
}
