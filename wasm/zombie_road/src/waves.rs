//! How each wave of the horde is made up: how many zombies, how fast they come, which kinds, and when a Tank leads them.

/// One wave's recipe. Kind weights are in `ZombieKind` order: walker, runner, brute, spitter.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WavePlan {
    /// Ordinary zombies to spawn (the Tank, when there is one, comes on top of these).
    pub regular_total: u32,
    pub has_tank: bool,
    /// Seconds between spawn groups (randomised ±30%).
    pub spawn_interval: f32,
    /// At most this many zombies step out of the dark together.
    pub max_group: u32,
    /// Multiplies every zombie's walking speed.
    pub speed_factor: f32,
    /// Multiplies every zombie's health.
    pub health_factor: f32,
    pub kind_weights: [u32; 4],
}

/// Every fifth wave a Tank comes with the horde.
pub const TANK_EVERY: u32 = 5;

pub fn plan(wave: u32) -> WavePlan {
    let wave = wave.max(1);
    // difficulty stops climbing after wave 21 (later waves are still long and mixed)
    let level = (wave - 1).min(20) as f32;
    WavePlan {
        regular_total: (8 + wave * 4).min(72),
        has_tank: wave % TANK_EVERY == 0,
        spawn_interval: (1.4 - level * 0.06).max(0.4),
        max_group: (1 + wave / 2).min(4),
        speed_factor: 1.0 + level * 0.045,
        health_factor: 1.0 + level * 0.08,
        kind_weights: [
            10,
            if wave >= 2 { (2 + wave).min(12) } else { 0 },
            if wave >= 4 { (1 + wave / 3).min(6) } else { 0 },
            if wave >= 3 { (1 + wave / 2).min(7) } else { 0 },
        ],
    }
}

/// Everything a wave will send, Tank included.
pub fn total_zombies(wave: u32) -> u32 {
    let wave_plan = plan(wave);
    wave_plan.regular_total + wave_plan.has_tank as u32
}
