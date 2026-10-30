//! Endless level generation: the sky-temple is laid out ahead of the hero in short segments (temple ground with
//! hazards and enemies, gaps, floating ledges, stone pillars). Difficulty rises with distance; every gap stays
//! reachable (a single jump clears about 95 units, a double jump or dash much more).
use crate::world::*;

pub const BLOCK: f32 = 32.0;
const GROUND_BOTTOM: f32 = VIEW_HEIGHT + 60.0;
const HIGHEST_GROUND: f32 = 132.0;
const LOWEST_GROUND: f32 = 228.0;
/// The first stretch has no hazards or enemies.
const SAFE_UNTIL: f32 = 520.0;

impl World {
    pub(crate) fn build_start(&mut self) {
        let mut x = -512.0;
        while x < 320.0 {
            self.push_block(x, START_GROUND, BLOCK, PlatformKind::Ground);
            x += BLOCK;
        }
        self.push_prop(PropKind::Lamp, 4.0, START_GROUND, 0.0);
        self.push_prop(PropKind::Lamp, 196.0, START_GROUND, 0.0);
        self.gen_x = 320.0;
        self.ground_y = START_GROUND;
        self.need_ground = false;
        self.max_rise = 24.0;
        self.last_heart_x = 0.0;
    }

    pub(crate) fn generate(&mut self) {
        let horizon = self.camera_x.max(self.hero.x - self.view_width) + self.view_width + 360.0;
        while self.gen_x < horizon && self.platforms.len() < MAX_PLATFORMS - 10 {
            self.next_segment();
        }
    }

    /// 0 at the start, 1 after about 7 000 units (≈ 700 m).
    pub fn difficulty_at(x: f32) -> f32 { clamp_between((x - 300.0) / 7000.0, 0.0, 1.0) }

    fn next_segment(&mut self) {
        let d = World::difficulty_at(self.gen_x);
        if self.need_ground || self.gen_x < SAFE_UNTIL {
            self.ground_run(d);
            self.need_ground = false;
            return;
        }
        let roll = self.rng.unit();
        if roll < 0.36 { self.gap(d); }
        else if roll < 0.66 { self.ledges(d); }
        else if roll < 0.84 { self.pillars(d); }
        else { self.ground_run(d); return; }
        self.need_ground = true;
    }

    fn push_block(&mut self, x: f32, y: f32, w: f32, kind: PlatformKind) {
        if self.platforms.len() >= MAX_PLATFORMS { return; }
        let h = if matches!(kind, PlatformKind::Ledge | PlatformKind::Crumble) { 10.0 } else { GROUND_BOTTOM - y };
        let jitter = self.rng.range(0.0, 16.0);
        self.platforms.push(Platform { x, y, w, h, kind, crumble: -1.0, falling: false, fall_y: 0.0, fall_speed: 0.0, jitter });
    }

    fn push_prop(&mut self, kind: PropKind, x: f32, y: f32, w: f32) {
        if self.props.len() >= MAX_PROPS { return; }
        let phase = self.rng.range(0.0, VENT_PERIOD);
        self.props.push(Prop { kind, x, y, w, phase, taken: false, falling: false, fall_y: 0.0, fall_speed: 0.0 });
    }

    fn push_enemy(&mut self, kind: EnemyKind, x: f32, y: f32, min_x: f32, max_x: f32) {
        if self.enemies.len() >= MAX_ENEMIES { return; }
        let hp = match kind { EnemyKind::Shade => 2, EnemyKind::Wisp => 1, EnemyKind::Idol => 3 };
        let timer = self.rng.range(0.0, 1.2);
        self.enemies.push(Enemy { kind, x, y, velocity_y: 0.0, hp, min_x, max_x, base_y: y, timer, flash: 0.0, facing: -1.0, alive: true });
    }

    fn gem_arc(&mut self, start_x: f32, end_x: f32, base_y: f32, count: usize, height: f32) {
        for index in 0..count {
            let t = (index as f32 + 0.5) / count as f32;
            let lift = 4.0 * t * (1.0 - t) * height;
            self.push_prop(PropKind::Gem, start_x + (end_x - start_x) * t, base_y - lift, 0.0);
        }
    }

    /// Temple ground: a run of blocks, maybe a step up or down from the last level, with hazards, enemies and gems.
    fn ground_run(&mut self, d: f32) {
        let safe = self.gen_x < SAFE_UNTIL;
        if !safe {
            let steps: [f32; 6] = [-40.0, -24.0, 0.0, 0.0, 24.0, 40.0];
            let step = steps[(self.rng.next_u32() % 6) as usize];
            let step = if step < 0.0 { step.max(-self.max_rise) } else { step };
            self.ground_y = clamp_between(self.ground_y + step, HIGHEST_GROUND, LOWEST_GROUND);
        }
        self.max_rise = 40.0;
        let count = if safe { 7 } else { 4 + (self.rng.next_u32() % 5) as usize };
        let start = self.gen_x;
        let y = self.ground_y;
        for index in 0..count { self.push_block(start + index as f32 * BLOCK, y, BLOCK, PlatformKind::Ground); }
        let end = start + count as f32 * BLOCK;
        self.gen_x = end;
        let length = end - start;
        if safe { return; }

        let mut hazard_x = -1.0;
        if count >= 5 && self.rng.chance(0.3 + 0.45 * d) {
            if self.rng.chance(0.55) {
                let width = if d > 0.4 && self.rng.chance(0.5) { 32.0 } else { 16.0 };
                hazard_x = start + 64.0 + ((self.rng.unit() * (length - 128.0 - width) / 16.0) as i32) as f32 * 16.0;
                self.push_prop(PropKind::Spikes, hazard_x, y, width);
            } else {
                hazard_x = start + length * 0.5;
                self.push_prop(PropKind::Vent, hazard_x, y, 0.0);
            }
        }
        if self.rng.chance(0.3 + 0.4 * d) {
            if count >= 5 && self.rng.chance(0.25 + 0.3 * d) {
                self.push_enemy(EnemyKind::Idol, end - 22.0, y, end - 22.0, end - 22.0);
            } else {
                let x = start + length * 0.65;
                self.push_enemy(EnemyKind::Shade, x, y, start + 8.0, end - 8.0);
            }
        }
        if self.rng.chance(0.5) {
            let gems = 3 + (self.rng.next_u32() % 3) as usize;
            self.gem_arc(start + length * 0.2, start + length * 0.8, y - 22.0, gems, if hazard_x > 0.0 { 34.0 } else { 14.0 });
        }
        if self.hero.hp < MAX_HP && start - self.last_heart_x > 1600.0 && self.rng.chance(0.35) {
            self.last_heart_x = start;
            self.push_prop(PropKind::Heart, start + length * 0.5, y - 44.0, 0.0);
        } else if hazard_x < 0.0 && self.rng.chance(0.3) {
            self.push_prop(PropKind::Lamp, start + 12.0, y, 0.0);
        }
    }

    /// A gap to jump; wider later on, sometimes with a wisp guarding it.
    fn gap(&mut self, d: f32) {
        let width = (self.rng.range(40.0, 76.0 + 62.0 * d) / 4.0).floor() * 4.0;
        let start = self.gen_x;
        self.gen_x += width;
        self.max_rise = if width > 88.0 { 0.0 } else if width > 70.0 { 24.0 } else { 40.0 };
        if self.rng.chance(0.15 + 0.35 * d) {
            let y = self.ground_y - self.rng.range(40.0, 64.0);
            self.push_enemy(EnemyKind::Wisp, start + width * 0.5, y, start, start + width);
        } else if self.rng.chance(0.45) {
            self.gem_arc(start - 8.0, start + width + 8.0, self.ground_y - 26.0, 3, 30.0);
        }
    }

    /// Floating ledges over a pit (some crumble when you land on them).
    fn ledges(&mut self, d: f32) {
        let mut x = self.gen_x + self.rng.range(30.0, 52.0);
        let count = 2 + (self.rng.next_u32() % 3) as usize;
        let mut y = clamp_between(self.ground_y - self.rng.range(10.0, 44.0), 104.0, 214.0);
        let mut middle = x;
        for index in 0..count {
            let width = (self.rng.range(40.0 - 6.0 * d, 72.0 - 12.0 * d) / 4.0).floor() * 4.0;
            let kind = if self.rng.chance(0.12 + 0.5 * d) { PlatformKind::Crumble } else { PlatformKind::Ledge };
            self.push_block(x, y, width, kind);
            if self.rng.chance(0.45) { self.push_prop(PropKind::Gem, x + width * 0.5, y - 20.0, 0.0); }
            if index == count / 2 { middle = x + width * 0.5; }
            x += width;
            if index + 1 < count {
                x += self.rng.range(30.0, 56.0 + 24.0 * d);
                y = clamp_between(y + self.rng.range(-32.0, 30.0), 104.0, 214.0);
            }
        }
        if self.rng.chance(0.2 + 0.3 * d) { self.push_enemy(EnemyKind::Wisp, middle, y - 52.0, middle - 60.0, middle + 60.0); }
        self.gen_x = x + self.rng.range(30.0, 50.0);
        self.ground_y = clamp_between(y + self.rng.range(-8.0, 28.0), y - 24.0, LOWEST_GROUND);
        self.ground_y = clamp_between(self.ground_y, HIGHEST_GROUND, LOWEST_GROUND);
        self.max_rise = 0.0;
    }

    /// Stone pillars of different heights; a fire-spitting idol may sit on the last one.
    fn pillars(&mut self, d: f32) {
        let mut x = self.gen_x + self.rng.range(30.0, 56.0);
        let count = 2 + (self.rng.next_u32() % 2) as usize;
        let mut y = self.ground_y;
        for index in 0..count {
            let width = if self.rng.chance(0.5) { 32.0 } else { 48.0 };
            y = clamp_between(y + self.rng.range(-36.0, 30.0), HIGHEST_GROUND, LOWEST_GROUND - 8.0);
            self.push_block(x, y, width, PlatformKind::Pillar);
            if index + 1 == count && self.rng.chance(0.3 + 0.3 * d) {
                self.push_enemy(EnemyKind::Idol, x + width * 0.5, y, x + width * 0.5, x + width * 0.5);
            } else if self.rng.chance(0.4) {
                self.push_prop(PropKind::Gem, x + width * 0.5, y - 22.0, 0.0);
            }
            x += width;
            if index + 1 < count { x += self.rng.range(32.0, 58.0 + 16.0 * d); }
        }
        self.gen_x = x + self.rng.range(30.0, 52.0);
        self.ground_y = clamp_between(y + 16.0, HIGHEST_GROUND, LOWEST_GROUND);
        self.max_rise = 0.0;
    }
}
