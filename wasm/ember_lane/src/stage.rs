//! The one stage: a night street through a rat-infested village, left to right (world units; the ground is y = 0).
//! Five sections, each starting at a checkpoint: the flickering torch, the braziers, the lantern alley, the crate
//! and the fire pot, the shutter levers — then the lit sanctuary door.

pub const STAGE_END: f32 = 3760.0;
pub const DOOR_X: f32 = 3700.0;
pub const START_X: f32 = 120.0;

pub const KIND_HEARTH: u8 = 0;
pub const KIND_TORCH: u8 = 1;
pub const KIND_FLICKER: u8 = 2;
pub const KIND_BRAZIER: u8 = 3;
pub const KIND_FIRE_POT: u8 = 4;
pub const KIND_LANTERN: u8 = 5;
pub const KIND_WINDOW: u8 = 6;
pub const KIND_DOOR: u8 = 7;

/// x, flame height above the ground, radius, kind, starts lit
pub const LIGHTS: [(f32, f32, f32, u8, bool); 16] = [
    (60.0, 18.0, 190.0, KIND_HEARTH, true),
    (330.0, 62.0, 120.0, KIND_TORCH, true),
    (470.0, 62.0, 110.0, KIND_TORCH, true),
    (655.0, 62.0, 135.0, KIND_FLICKER, true),
    (850.0, 62.0, 120.0, KIND_TORCH, true),
    (990.0, 62.0, 125.0, KIND_TORCH, true),
    (1290.0, 26.0, 150.0, KIND_BRAZIER, false),
    (1500.0, 26.0, 150.0, KIND_BRAZIER, false),
    (1700.0, 62.0, 130.0, KIND_TORCH, true),
    (1765.0, 40.0, 92.0, KIND_LANTERN, false),
    (2410.0, 62.0, 125.0, KIND_TORCH, true),
    (2520.0, 26.0, 330.0, KIND_BRAZIER, true),
    (2625.0, 18.0, 70.0, KIND_FIRE_POT, false),
    (3000.0, 62.0, 130.0, KIND_TORCH, true),
    (3150.0, 48.0, 150.0, KIND_WINDOW, false),
    (3395.0, 48.0, 150.0, KIND_WINDOW, false),
];
pub const EXTRA_LIGHTS: [(f32, f32, f32, u8, bool); 3] = [(2900.0, 62.0, 120.0, KIND_TORCH, true), (3580.0, 62.0, 115.0, KIND_TORCH, true), (DOOR_X, 50.0, 170.0, KIND_DOOR, true)];
pub const LIGHT_COUNT: usize = LIGHTS.len() + EXTRA_LIGHTS.len();
pub const LANTERN: usize = 9;
pub const FIRE_POT: usize = 12;
pub const WINDOW_A: usize = 14;
pub const WINDOW_B: usize = 15;
pub const FLICKER: usize = 3;

/// Rat nests: x range and how many rats live there.
pub const ZONES: [(f32, f32, u8); 5] = [(575.0, 740.0, 24), (1110.0, 1640.0, 52), (1830.0, 2330.0, 56), (2565.0, 2795.0, 34), (3085.0, 3530.0, 52)];
pub const RAT_COUNT: usize = 220;

/// Checkpoints: x, embers given (at least), lantern oil topped up to (0 = unchanged)
pub const CHECKPOINTS: [(f32, u8); 5] = [(START_X, 0), (990.0, 3), (1700.0, 0), (2410.0, 2), (3000.0, 0)];

/// Crate: start x (centre), half width, height, how far it may slide
pub const CRATES: [(f32, f32, f32, f32, f32); 1] = [(2575.0, 15.0, 30.0, 2440.0, 2700.0)];

/// Levers: x, and which window each opens (the other one closes: a shared rope).
pub const LEVERS: [(f32, usize); 2] = [(3060.0, WINDOW_A), (3262.0, WINDOW_B)];
