//! The endless mountain trail: a smooth function of distance down the hill (z, metres), so any stretch of it can be
//! rebuilt from the seed alone. The centre line swings left and right as a sum of three slow sine waves (gentle
//! S-curves), and the height falls steadily downhill with two rolling waves on top (crests and dips).
//! Everything else (obstacles, the player) stands at a sideways offset from the centre line.

/// How far the trail drops per metre on average (a 10% downhill).
pub const DOWNHILL_GRADE: f64 = 0.1;
/// Packed-snow trail half width; the banked snow edges rise just beyond it.
pub const TRAIL_HALF_WIDTH: f32 = 7.0;

/// Sideways swing (amplitude metres, wavelength divisor metres) of the three curve waves.
const CURVE_WAVES: [(f64, f64); 3] = [(10.0, 55.0), (5.0, 31.0), (2.5, 17.0)];
/// Height (amplitude metres, wavelength divisor metres) of the two rolling hill waves.
const HILL_WAVES: [(f64, f64); 2] = [(5.0, 42.0), (2.0, 23.0)];
/// Curves and hills ease in over the first stretch so the run starts on a calm, straight slope.
const EASE_IN_METRES: f64 = 120.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Track {
    pub seed: u32,
    curve_phases: [f64; 3],
    hill_phases: [f64; 2],
}

/// A tiny deterministic hash → [0, 1).
pub fn unit_hash(seed: u32, salt: u32) -> f64 {
    let mut value = seed ^ salt.wrapping_mul(0x9e37_79b9);
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846c_a68b);
    value ^= value >> 16;
    value as f64 / 4_294_967_296.0
}

const TAU: f64 = core::f64::consts::PI * 2.0;

impl Track {
    pub fn new(seed: u32) -> Track {
        Track {
            seed,
            curve_phases: [unit_hash(seed, 1) * TAU, unit_hash(seed, 2) * TAU, unit_hash(seed, 3) * TAU],
            hill_phases: [unit_hash(seed, 4) * TAU, unit_hash(seed, 5) * TAU],
        }
    }

    /// 0 at the start line, rising smoothly to 1 after EASE_IN_METRES.
    fn ease(z: f64) -> (f64, f64) {
        if z <= 0.0 { return (0.0, 0.0); }
        if z >= EASE_IN_METRES { return (1.0, 0.0); }
        let progress = z / EASE_IN_METRES;
        // smoothstep and its derivative (per metre)
        (progress * progress * (3.0 - 2.0 * progress), 6.0 * progress * (1.0 - progress) / EASE_IN_METRES)
    }

    /// Sideways position of the centre line (metres) at distance z.
    pub fn center_x(&self, z: f64) -> f64 {
        let (ease, _) = Track::ease(z);
        let mut sum = 0.0;
        for (index, (amplitude, wavelength)) in CURVE_WAVES.iter().enumerate() {
            sum += amplitude * ((z / wavelength + self.curve_phases[index]).sin() - self.curve_phases[index].sin());
        }
        sum * ease
    }

    /// Which way the trail is heading (dx/dz of the centre line).
    pub fn heading(&self, z: f64) -> f64 { (self.center_x(z + 0.5) - self.center_x(z - 0.5)) / 1.0 }

    /// How sharply the trail bends (d²x/dz²); positive bends right.
    pub fn curvature(&self, z: f64) -> f64 { (self.center_x(z + 2.0) - 2.0 * self.center_x(z) + self.center_x(z - 2.0)) / 4.0 }

    /// Height of the snow (metres) at distance z: steadily downhill with rolling crests and dips.
    pub fn height(&self, z: f64) -> f64 {
        let (ease, _) = Track::ease(z);
        let mut hills = 0.0;
        for (index, (amplitude, wavelength)) in HILL_WAVES.iter().enumerate() {
            hills += amplitude * ((z / wavelength + self.hill_phases[index]).sin() - self.hill_phases[index].sin());
        }
        -DOWNHILL_GRADE * z + hills * ease
    }

    /// Slope of the snow (dy/dz); negative is downhill.
    pub fn slope(&self, z: f64) -> f64 { (self.height(z + 0.5) - self.height(z - 0.5)) / 1.0 }
}
