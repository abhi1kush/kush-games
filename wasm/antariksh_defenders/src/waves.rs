//! The journey: wave names, formations and how each wave gets harder (Earth orbit → the Moon → Mars → deep space).

pub const ROWS: usize = 5;
pub const COLUMNS: usize = 11;

/// Stage names, one per wave; after the last one the journey continues in deep space (and keeps getting harder).
pub const STAGE_NAMES: [&str; 7] = ["Low Earth Orbit", "Earth Departure", "Lunar Orbit", "Lunar Far Side", "Mars Transfer", "Mars Approach", "Deep Space"];
/// Which backdrop to draw: 0 Earth, 1 Moon, 2 Mars, 3 deep space.
pub fn backdrop_for_wave(wave: u32) -> u32 { match wave { 1 | 2 => 0, 3 | 4 => 1, 5 | 6 => 2, _ => 3 } }
pub fn stage_index(wave: u32) -> usize { (wave.max(1) as usize - 1).min(STAGE_NAMES.len() - 1) }

/// Formations: 5 rows of 11 columns, 'X' = an enemy.
const FORMATIONS: [[&str; ROWS]; 5] = [
    [".XXXXXXXXX.", ".XXXXXXXXX.", ".XXXXXXXXX.", ".XXXXXXXXX.", ".XXXXXXXXX."],
    ["XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX"],
    ["...XXXXX...", "..XXXXXXX..", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXX...XXXX"],
    ["XXXXXXXXXXX", "XXXX...XXXX", "XXX.....XXX", "XXXX...XXXX", "XXXXXXXXXXX"],
    ["X.X.X.X.X.X", ".X.X.X.X.X.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XX.XXXXX.XX"],
];
const FORMATION_ORDER: [usize; 6] = [0, 1, 2, 3, 4, 1];

pub fn formation_for_wave(wave: u32) -> &'static [&'static str; ROWS] {
    &FORMATIONS[FORMATION_ORDER[(wave.max(1) as usize - 1) % FORMATION_ORDER.len()]]
}

/// Everything that makes a wave harder, as numbers.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Difficulty {
    /// Top row's y when the wave starts (later waves start lower).
    pub start_y: f32,
    /// Seconds between march steps with the full formation; it shrinks toward `fastest_step_seconds` as enemies fall.
    pub slowest_step_seconds: f32,
    pub fastest_step_seconds: f32,
    /// Seconds between enemy shots, and how many enemy bullets may be on screen.
    pub shot_interval_seconds: f32,
    pub max_enemy_bullets: usize,
    pub enemy_bullet_speed: f32,
    /// Chance that a shot comes from the column above the player (aimed) rather than a random column.
    pub aimed_shot_chance: f32,
    /// Chance that the second-lowest enemy of a column fires too (more shooters in later waves).
    pub extra_shooter_chance: f32,
}

pub fn difficulty_for_wave(wave: u32) -> Difficulty {
    let level = (wave.max(1) - 1) as f32;
    Difficulty {
        start_y: 46.0 + level.min(6.0) * 7.0,
        slowest_step_seconds: (0.55 * 0.88f32.powi(level as i32)).max(0.2),
        fastest_step_seconds: (0.05 - 0.003 * level).max(0.03),
        shot_interval_seconds: (1.25 - 0.12 * level).max(0.32),
        max_enemy_bullets: (2 + wave as usize).min(7),
        enemy_bullet_speed: (72.0 + 7.0 * level).min(125.0),
        aimed_shot_chance: (0.2 + 0.08 * level).min(0.7),
        extra_shooter_chance: if wave >= 3 { (0.1 * (level - 1.0)).min(0.45) } else { 0.0 },
    }
}
