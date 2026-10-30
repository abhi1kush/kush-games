//! One mountain road, left to right. Height is a smooth curve through fixed keyframes, so the jeep, the
//! coins and the drawing all read the same ground.

pub const FINISH_X: f32 = 1680.0;
pub const COURSE_END: f32 = 1760.0;

/// (x, road height). Rises stay climbable if you ease off the gas; the drops are the jumps.
const KEYS: [(f32, f32); 20] = [
    (0.0, 42.0),
    (110.0, 42.0),
    (190.0, 74.0),
    (270.0, 38.0),
    (360.0, 86.0),
    (450.0, 52.0),
    (540.0, 108.0),
    (630.0, 96.0),
    (710.0, 48.0),
    (800.0, 102.0),
    (890.0, 64.0),
    (980.0, 112.0),
    (1080.0, 108.0),
    (1170.0, 58.0),
    (1260.0, 92.0),
    (1350.0, 50.0),
    (1450.0, 104.0),
    (1550.0, 76.0),
    (1640.0, 58.0),
    (COURSE_END, 58.0),
];

pub const COIN_X: [f32; 13] = [150.0, 230.0, 330.0, 490.0, 660.0, 760.0, 860.0, 1020.0, 1130.0, 1230.0, 1400.0, 1500.0, 1600.0];
pub const FUEL_X: [f32; 4] = [270.0, 710.0, 1170.0, 1550.0];
pub const COIN_LIFT: f32 = 22.0;
pub const FUEL_LIFT: f32 = 14.0;
pub const PICKUP_COUNT: usize = COIN_X.len() + FUEL_X.len();

pub fn height(x: f32) -> f32 {
    let x = if x < 0.0 { 0.0 } else if x > COURSE_END { COURSE_END } else { x };
    let mut index = 0;
    while index + 1 < KEYS.len() && KEYS[index + 1].0 < x { index += 1; }
    let (x0, y0) = KEYS[index];
    let (x1, y1) = KEYS[(index + 1).min(KEYS.len() - 1)];
    let span = x1 - x0;
    if span <= 0.0 { return y0; }
    let t = ((x - x0) / span).clamp_unit();
    let s = t * t * (3.0 - 2.0 * t);
    y0 + (y1 - y0) * s
}

/// Rise over run, sampled a few units either side so a wheel sees the hill it is about to meet.
pub fn slope(x: f32) -> f32 {
    let d = 4.0;
    (height(x + d) - height(x - d)) / (2.0 * d)
}

/// Unit normal pointing out of the road (up on the flat).
pub fn normal(x: f32) -> (f32, f32) {
    let s = slope(x);
    let len = (s * s + 1.0).sqrt();
    (-s / len, 1.0 / len)
}

/// Angle of the road (0 on the flat, positive uphill to the right). Bhaskara-free atan.
pub fn grade(x: f32) -> f32 {
    let s = slope(x);
    s / (1.0 + 0.28 * s * s)
}

trait ClampUnit { fn clamp_unit(self) -> f32; }
impl ClampUnit for f32 { fn clamp_unit(self) -> f32 { if self < 0.0 { 0.0 } else if self > 1.0 { 1.0 } else { self } } }
