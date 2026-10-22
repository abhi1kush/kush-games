//! Breakout physics: a fixed 1/120 s timestep, circle-vs-rectangle collisions, levels and power-ups.
//! Coordinates are in a 480 × 640 world (y grows downwards).

pub const WORLD_WIDTH: f32 = 480.0;
pub const WORLD_HEIGHT: f32 = 640.0;
pub const BRICK_COLUMNS: usize = 10;
pub const BRICK_ROWS: usize = 9;
pub const BRICK_WIDTH: f32 = 42.0;
pub const BRICK_HEIGHT: f32 = 18.0;
pub const BRICK_GAP: f32 = 4.0;
pub const BRICKS_LEFT: f32 = (WORLD_WIDTH - (BRICK_COLUMNS as f32 * (BRICK_WIDTH + BRICK_GAP) - BRICK_GAP)) / 2.0;
pub const BRICKS_TOP: f32 = 72.0;
pub const PADDLE_Y: f32 = 596.0;
pub const PADDLE_HEIGHT: f32 = 12.0;
pub const PADDLE_WIDTH: f32 = 84.0;
pub const WIDE_PADDLE_WIDTH: f32 = 126.0;
pub const PADDLE_KEY_SPEED: f32 = 640.0;
pub const BALL_RADIUS: f32 = 6.0;
pub const MAX_BALLS: usize = 3;
pub const MAX_POWER_UPS: usize = 4;
pub const STEP_SECONDS: f32 = 1.0 / 120.0;
pub const STEEL: u8 = 9;
pub const START_LIVES: u32 = 3;
pub const MAX_LIVES: u32 = 5;
const POWER_UP_FALL_SPEED: f32 = 150.0;
const WIDE_SECONDS: f32 = 15.0;
const MAX_BOUNCE_ANGLE: f32 = 1.05; // radians (~60°) at the paddle's edge

/// `value` limited to `low..=high` (f32::clamp would pull float formatting into the wasm for its panic message).
pub fn clamp_between(value: f32, low: f32, high: f32) -> f32 { value.max(low).min(high) }

/// Sine and cosine for the small angles used here (|angle| ≤ ~1.2 rad), as Taylor series: avoids linking libm.
pub fn sine_cosine(angle: f32) -> (f32, f32) {
    let squared = angle * angle;
    let sine = angle * (1.0 - squared / 6.0 * (1.0 - squared / 20.0 * (1.0 - squared / 42.0 * (1.0 - squared / 72.0))));
    let cosine = 1.0 - squared / 2.0 * (1.0 - squared / 12.0 * (1.0 - squared / 30.0 * (1.0 - squared / 56.0 * (1.0 - squared / 90.0))));
    (sine, cosine)
}

pub mod events {
    pub const WALL: u32 = 1;
    pub const PADDLE: u32 = 2;
    pub const BRICK_HIT: u32 = 4;
    pub const BRICK_BROKEN: u32 = 8;
    pub const STEEL_HIT: u32 = 16;
    pub const POWER_UP: u32 = 32;
    pub const LIFE_LOST: u32 = 64;
    pub const LEVEL_CLEARED: u32 = 128;
    pub const GAME_OVER: u32 = 256;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase { Serving = 0, Playing = 1, LevelCleared = 2, GameOver = 3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PowerUpKind { Wide = 0, MultiBall = 1, Slow = 2, ExtraLife = 3 }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ball { pub x: f32, pub y: f32, pub velocity_x: f32, pub velocity_y: f32 }

#[derive(Clone, Copy, Debug)]
pub struct PowerUp { pub x: f32, pub y: f32, pub kind: PowerUpKind }

pub struct World {
    pub level: u32,
    pub score: u32,
    pub lives: u32,
    pub phase: Phase,
    pub paddle_x: f32,
    pub paddle_width: f32,
    pub wide_seconds_left: f32,
    pub paddle_target: Option<f32>,
    pub paddle_direction: f32,
    pub balls: Vec<Ball>,
    pub power_ups: Vec<PowerUp>,
    /// Hits left per brick (row-major), 0 = gone, STEEL = unbreakable.
    pub bricks: [u8; BRICK_COLUMNS * BRICK_ROWS],
    /// Bumped whenever a brick changes, so the renderer can cache the brick layer.
    pub bricks_version: u32,
    pub ball_speed: f32,
    accumulator: f32,
    random_state: u32,
}

pub fn brick_rect(index: usize) -> (f32, f32, f32, f32) {
    let column = index % BRICK_COLUMNS;
    let row = index / BRICK_COLUMNS;
    let left = BRICKS_LEFT + column as f32 * (BRICK_WIDTH + BRICK_GAP);
    let top = BRICKS_TOP + row as f32 * (BRICK_HEIGHT + BRICK_GAP);
    (left, top, left + BRICK_WIDTH, top + BRICK_HEIGHT)
}

/// Base ball speed for a level (world units per second).
pub fn level_speed(level: u32) -> f32 { (290.0 + 16.0 * (level.saturating_sub(1)) as f32).min(500.0) }

/// Brick layout for a level: patterns cycle, more rows, tougher bricks and steel as levels go up.
pub fn level_layout(level: u32) -> [u8; BRICK_COLUMNS * BRICK_ROWS] {
    let mut bricks = [0u8; BRICK_COLUMNS * BRICK_ROWS];
    let rows = (4 + level as usize / 2).min(BRICK_ROWS);
    let toughest = (1 + level / 3).min(3) as u8;
    let pattern = (level - 1) % 6;
    let use_steel = level >= 4;
    for row in 0..rows {
        for column in 0..BRICK_COLUMNS {
            let mirrored = column.min(BRICK_COLUMNS - 1 - column); // 0 at the edges, 4 in the middle
            let present = match pattern {
                0 => true,
                1 => mirrored + 1 >= rows.saturating_sub(row).min(5), // pyramid
                2 => (row + column) % 2 == 0 || row == 0,               // checkerboard
                3 => (mirrored as i32 - 2).abs() + (row as i32 - rows as i32 / 2).abs() <= 3, // diamond
                4 => column % 3 != 2,                                   // pillars with gaps
                _ => row == 0 || row == rows - 1 || column == 0 || column == BRICK_COLUMNS - 1 || (row % 2 == 1 && column % 2 == 1),
            };
            if !present { continue; }
            // tougher bricks towards the top
            let hits = if row < (rows / 3).max(1) { toughest } else if row < rows / 2 { toughest.saturating_sub(1).max(1) } else { 1 };
            let is_steel = use_steel && match pattern {
                2 => row == rows - 1 && column % 4 == 1,
                3 => row == rows / 2 && mirrored == 4,
                4 => row == rows - 1 && column % 3 == 0,
                5 => row == rows / 2 && (column == 2 || column == 7),
                _ => level >= 8 && row == rows - 1 && (column == 1 || column == 8),
            };
            bricks[row * BRICK_COLUMNS + column] = if is_steel { STEEL } else { hits };
        }
    }
    bricks
}

impl World {
    pub fn new(seed: u32) -> World {
        let mut world = World {
            level: 1, score: 0, lives: START_LIVES, phase: Phase::Serving,
            paddle_x: WORLD_WIDTH / 2.0, paddle_width: PADDLE_WIDTH, wide_seconds_left: 0.0, paddle_target: None, paddle_direction: 0.0,
            balls: Vec::with_capacity(MAX_BALLS), power_ups: Vec::with_capacity(MAX_POWER_UPS),
            bricks: [0; BRICK_COLUMNS * BRICK_ROWS], bricks_version: 0, ball_speed: level_speed(1), accumulator: 0.0,
            random_state: seed | 1,
        };
        world.start_level(1);
        world
    }

    fn random(&mut self) -> u32 { let mut x = self.random_state; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.random_state = x; x }

    pub fn start_level(&mut self, level: u32) {
        self.level = level.max(1);
        self.bricks = level_layout(self.level);
        self.bricks_version += 1;
        self.serve();
    }

    /// Put a single ball back on the paddle.
    pub fn serve(&mut self) {
        self.phase = Phase::Serving;
        self.ball_speed = level_speed(self.level);
        self.balls.clear();
        self.power_ups.clear();
        self.paddle_width = PADDLE_WIDTH;
        self.wide_seconds_left = 0.0;
        self.balls.push(Ball { x: self.paddle_x, y: PADDLE_Y - BALL_RADIUS - 1.0, velocity_x: 0.0, velocity_y: 0.0 });
        self.accumulator = 0.0;
    }

    pub fn launch(&mut self) {
        if self.phase != Phase::Serving { return; }
        let angle = ((self.random() % 41) as f32 - 20.0) * (core::f32::consts::PI / 180.0);
        let (sine, cosine) = sine_cosine(angle);
        let ball = &mut self.balls[0];
        ball.velocity_x = self.ball_speed * sine;
        ball.velocity_y = -self.ball_speed * cosine;
        self.phase = Phase::Playing;
    }

    pub fn breakable_left(&self) -> usize { self.bricks.iter().filter(|&&hits| hits > 0 && hits != STEEL).count() }

    /// Run whole fixed steps for `seconds` of real time (capped so a long pause doesn't fast-forward). Returns events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        self.accumulator = (self.accumulator + clamp_between(seconds, 0.0, 0.1)).min(0.1);
        let mut events = 0;
        while self.accumulator >= STEP_SECONDS {
            self.accumulator -= STEP_SECONDS;
            events |= self.step();
        }
        events
    }

    fn move_paddle(&mut self) {
        if self.paddle_direction != 0.0 {
            self.paddle_x += self.paddle_direction * PADDLE_KEY_SPEED * STEP_SECONDS;
        } else if let Some(target) = self.paddle_target {
            let max_step = PADDLE_KEY_SPEED * 2.5 * STEP_SECONDS;
            self.paddle_x += clamp_between(target - self.paddle_x, -max_step, max_step);
        }
        let half = self.paddle_width / 2.0;
        self.paddle_x = clamp_between(self.paddle_x, half, WORLD_WIDTH - half);
    }

    pub fn step(&mut self) -> u32 {
        if matches!(self.phase, Phase::LevelCleared | Phase::GameOver) { return 0; }
        let mut events = 0;
        if self.wide_seconds_left > 0.0 {
            self.wide_seconds_left -= STEP_SECONDS;
            let target_width = if self.wide_seconds_left > 0.0 { WIDE_PADDLE_WIDTH } else { PADDLE_WIDTH };
            self.paddle_width += (target_width - self.paddle_width) * 0.2;
        }
        self.move_paddle();
        if self.phase == Phase::Serving {
            self.balls[0].x = self.paddle_x;
            self.balls[0].y = PADDLE_Y - BALL_RADIUS - 1.0;
            return 0;
        }
        let mut index = 0;
        while index < self.balls.len() {
            events |= self.step_ball(index);
            if self.balls[index].y - BALL_RADIUS > WORLD_HEIGHT { self.balls.swap_remove(index); } else { index += 1; }
        }
        events |= self.step_power_ups();
        if self.balls.is_empty() {
            events |= events::LIFE_LOST;
            self.lives = self.lives.saturating_sub(1);
            if self.lives == 0 { self.phase = Phase::GameOver; events |= events::GAME_OVER; } else { self.serve(); }
        } else if self.breakable_left() == 0 {
            self.phase = Phase::LevelCleared;
            self.score += 100 * self.level;
            events |= events::LEVEL_CLEARED;
        }
        events
    }

    fn step_ball(&mut self, index: usize) -> u32 {
        let mut events = 0;
        let mut ball = self.balls[index];
        ball.x += ball.velocity_x * STEP_SECONDS;
        ball.y += ball.velocity_y * STEP_SECONDS;
        // walls
        if ball.x < BALL_RADIUS { ball.x = BALL_RADIUS; ball.velocity_x = ball.velocity_x.abs(); events |= events::WALL; }
        if ball.x > WORLD_WIDTH - BALL_RADIUS { ball.x = WORLD_WIDTH - BALL_RADIUS; ball.velocity_x = -ball.velocity_x.abs(); events |= events::WALL; }
        if ball.y < BALL_RADIUS { ball.y = BALL_RADIUS; ball.velocity_y = ball.velocity_y.abs(); events |= events::WALL; }
        // paddle: only while moving down and not already below the paddle's middle
        let half = self.paddle_width / 2.0;
        if ball.velocity_y > 0.0 && ball.y + BALL_RADIUS >= PADDLE_Y && ball.y < PADDLE_Y + PADDLE_HEIGHT / 2.0
            && ball.x >= self.paddle_x - half - BALL_RADIUS && ball.x <= self.paddle_x + half + BALL_RADIUS {
            let offset = clamp_between((ball.x - self.paddle_x) / half, -1.0, 1.0);
            let angle = offset * MAX_BOUNCE_ANGLE;
            self.ball_speed = (self.ball_speed * 1.012).min(level_speed(self.level) * 1.3);
            let (sine, cosine) = sine_cosine(angle);
            ball.velocity_x = self.ball_speed * sine;
            ball.velocity_y = -self.ball_speed * cosine;
            ball.y = PADDLE_Y - BALL_RADIUS;
            events |= events::PADDLE;
        }
        events |= self.collide_bricks(&mut ball);
        // never let the ball go (almost) horizontal, or it can bounce between the walls forever
        let minimum_vertical = self.ball_speed * 0.22;
        if ball.velocity_y.abs() < minimum_vertical {
            let sign = if ball.velocity_y < 0.0 { -1.0 } else { 1.0 };
            ball.velocity_y = sign * minimum_vertical;
            let horizontal = (self.ball_speed * self.ball_speed - minimum_vertical * minimum_vertical).sqrt();
            ball.velocity_x = horizontal * ball.velocity_x.signum();
        }
        self.balls[index] = ball;
        events
    }

    /// Bounce off the brick the ball overlaps most (one per step, so the ball never flips twice).
    pub fn collide_bricks(&mut self, ball: &mut Ball) -> u32 {
        let first_column = (((ball.x - BALL_RADIUS - BRICKS_LEFT) / (BRICK_WIDTH + BRICK_GAP)).floor().max(0.0)) as usize;
        let last_column = (((ball.x + BALL_RADIUS - BRICKS_LEFT) / (BRICK_WIDTH + BRICK_GAP)).floor()) as isize;
        let first_row = (((ball.y - BALL_RADIUS - BRICKS_TOP) / (BRICK_HEIGHT + BRICK_GAP)).floor().max(0.0)) as usize;
        let last_row = (((ball.y + BALL_RADIUS - BRICKS_TOP) / (BRICK_HEIGHT + BRICK_GAP)).floor()) as isize;
        if last_column < 0 || last_row < 0 { return 0; }
        let mut best: Option<(usize, f32, f32, f32)> = None; // index, normal x, normal y, penetration
        for row in first_row..=(last_row as usize).min(BRICK_ROWS - 1) {
            for column in first_column..=(last_column as usize).min(BRICK_COLUMNS - 1) {
                let index = row * BRICK_COLUMNS + column;
                if self.bricks[index] == 0 { continue; }
                let (left, top, right, bottom) = brick_rect(index);
                let closest_x = clamp_between(ball.x, left, right);
                let closest_y = clamp_between(ball.y, top, bottom);
                let distance_x = ball.x - closest_x;
                let distance_y = ball.y - closest_y;
                let distance = (distance_x * distance_x + distance_y * distance_y).sqrt();
                if distance >= BALL_RADIUS { continue; }
                let (normal_x, normal_y) = if distance > 0.0001 { (distance_x / distance, distance_y / distance) } else {
                    // centre inside the brick: push out the way the ball came from
                    if ball.velocity_y.abs() > ball.velocity_x.abs() { (0.0, -ball.velocity_y.signum()) } else { (-ball.velocity_x.signum(), 0.0) }
                };
                let penetration = BALL_RADIUS - distance;
                if best.map_or(true, |(_, _, _, deepest)| penetration > deepest) { best = Some((index, normal_x, normal_y, penetration)); }
            }
        }
        let Some((index, normal_x, normal_y, penetration)) = best else { return 0 };
        ball.x += normal_x * penetration;
        ball.y += normal_y * penetration;
        // reflect the parts of the velocity that point into the brick
        let is_corner = normal_x.abs() > 0.3 && normal_y.abs() > 0.3;
        if (is_corner || normal_x.abs() >= normal_y.abs()) && ball.velocity_x * normal_x < 0.0 { ball.velocity_x = -ball.velocity_x; }
        if (is_corner || normal_y.abs() > normal_x.abs()) && ball.velocity_y * normal_y < 0.0 { ball.velocity_y = -ball.velocity_y; }
        self.hit_brick(index)
    }

    fn hit_brick(&mut self, index: usize) -> u32 {
        if self.bricks[index] == STEEL { return events::STEEL_HIT; }
        self.bricks[index] -= 1;
        self.bricks_version += 1;
        self.score += 10;
        if self.bricks[index] > 0 { return events::BRICK_HIT; }
        self.score += 10 * self.level;
        if self.random() % 9 == 0 && self.power_ups.len() < MAX_POWER_UPS {
            let roll = self.random() % 10;
            let kind = match roll { 0..=3 => PowerUpKind::Wide, 4..=6 => PowerUpKind::MultiBall, 7..=8 => PowerUpKind::Slow, _ => PowerUpKind::ExtraLife };
            let (left, top, right, bottom) = brick_rect(index);
            self.power_ups.push(PowerUp { x: (left + right) / 2.0, y: (top + bottom) / 2.0, kind });
        }
        events::BRICK_BROKEN
    }

    fn step_power_ups(&mut self) -> u32 {
        let mut events = 0;
        let mut index = 0;
        while index < self.power_ups.len() {
            let power_up = &mut self.power_ups[index];
            power_up.y += POWER_UP_FALL_SPEED * STEP_SECONDS;
            let caught = power_up.y + 8.0 >= PADDLE_Y && power_up.y - 8.0 <= PADDLE_Y + PADDLE_HEIGHT
                && (power_up.x - self.paddle_x).abs() <= self.paddle_width / 2.0 + 10.0;
            if caught {
                let kind = power_up.kind;
                self.power_ups.swap_remove(index);
                self.apply_power_up(kind);
                events |= events::POWER_UP;
            } else if power_up.y > WORLD_HEIGHT + 10.0 { self.power_ups.swap_remove(index); } else { index += 1; }
        }
        events
    }

    pub fn apply_power_up(&mut self, kind: PowerUpKind) {
        self.score += 50;
        match kind {
            PowerUpKind::Wide => self.wide_seconds_left = WIDE_SECONDS,
            PowerUpKind::ExtraLife => self.lives = (self.lives + 1).min(MAX_LIVES),
            PowerUpKind::Slow => {
                self.ball_speed = (self.ball_speed * 0.8).max(level_speed(self.level) * 0.75);
                let speed = self.ball_speed;
                for ball in &mut self.balls {
                    let length = (ball.velocity_x * ball.velocity_x + ball.velocity_y * ball.velocity_y).sqrt().max(0.001);
                    ball.velocity_x *= speed / length;
                    ball.velocity_y *= speed / length;
                }
            }
            PowerUpKind::MultiBall => {
                let Some(&source) = self.balls.first() else { return };
                for turn in [0.45f32, -0.45] {
                    if self.balls.len() >= MAX_BALLS { break; }
                    let (sine, cosine) = sine_cosine(turn);
                    let mut copy = source;
                    copy.velocity_x = source.velocity_x * cosine - source.velocity_y * sine;
                    copy.velocity_y = source.velocity_x * sine + source.velocity_y * cosine;
                    if copy.velocity_y > 0.0 { copy.velocity_y = -copy.velocity_y; }
                    self.balls.push(copy);
                }
            }
        }
    }

    /// Restore a saved game (always paused on the paddle). False if the data doesn't fit.
    pub fn restore(&mut self, level: u32, score: u32, lives: u32, bricks: &[u8]) -> bool {
        if level == 0 || lives == 0 || lives > MAX_LIVES || bricks.len() != self.bricks.len() || bricks.iter().any(|&hits| hits > 3 && hits != STEEL) {
            return false;
        }
        self.level = level;
        self.score = score;
        self.lives = lives;
        self.bricks.copy_from_slice(bricks);
        self.bricks_version += 1;
        self.serve();
        if self.breakable_left() == 0 { self.start_level(level + 1); }
        true
    }
}
