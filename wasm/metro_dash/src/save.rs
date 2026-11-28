//! The save format: the whole run as little-endian bytes (validated on load; a damaged save is refused, never half-loaded).
use crate::world::*;

pub const SAVE_MAGIC: [u8; 2] = *b"MD";
pub const SAVE_VERSION: u8 = 1;

impl World {
    pub fn save(&self) -> Vec<u8> {
        let mut writer = Writer { bytes: Vec::with_capacity(160 + MAX_ENTITIES * 27) };
        writer.bytes.extend_from_slice(&SAVE_MAGIC);
        writer.byte(SAVE_VERSION);
        writer.word(self.seed);
        writer.word(self.random_state);
        writer.double(self.player_z);
        writer.double(self.distance_score);
        writer.double(self.next_milestone);
        for value in [self.lane, self.previous_lane, self.grounded as u8, self.has_jumped as u8, self.roll_on_landing as u8, self.crash_reason, self.last_power_up, self.safe_lane] {
            writer.byte(value);
        }
        for value in [self.run_seconds, self.switch_from_x, self.switch_seconds, self.x, self.y, self.vertical_velocity, self.airborne_seconds, self.roll_seconds,
            self.surface, self.run_cycle, self.stumble_window, self.hit_grace, self.ghost_seconds, self.chaser_gap, self.magnet_seconds, self.sneakers_seconds,
            self.multiplier_seconds, self.hoverboard_seconds, self.streak_seconds] {
            writer.float(value);
        }
        for value in [self.stumbles, self.coins, self.coin_streak, self.rows] { writer.word(value); }
        writer.double(self.next_row_z);
        for value in self.blocked_until.iter().chain(self.reserved_until.iter()) { writer.double(*value); }
        writer.double(self.roof_until);
        writer.double(self.next_power_up_z);
        let active = self.entities.iter().filter(|entity| entity.active).count();
        writer.byte(active as u8);
        for entity in self.entities.iter().filter(|entity| entity.active) {
            writer.byte(entity.kind as u8);
            writer.byte(entity.lane);
            writer.byte(entity.variant);
            writer.float(entity.x);
            writer.float(entity.y);
            writer.double(entity.z);
            writer.float(entity.length);
            writer.float(entity.velocity);
        }
        writer.bytes
    }

    /// Rebuild a run from `save()` bytes; the world is unchanged if they are not a valid save. A restored run is in the
    /// Playing phase (the screen shows it paused until the player carries on).
    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        match World::parse(bytes) {
            Some(world) => { *self = world; true }
            None => false,
        }
    }

    fn parse(bytes: &[u8]) -> Option<World> {
        let mut reader = Reader { bytes, position: 0 };
        if reader.take(SAVE_MAGIC.len())? != SAVE_MAGIC || reader.byte()? != SAVE_VERSION { return None; }
        let mut world = World::new(reader.word()?);
        world.clear_entities();
        world.random_state = reader.word()?;
        world.player_z = reader.double()?;
        world.distance_score = reader.double()?;
        world.next_milestone = reader.double()?;
        let flags = [reader.byte()?, reader.byte()?, reader.byte()?, reader.byte()?, reader.byte()?, reader.byte()?, reader.byte()?, reader.byte()?];
        let lanes_ok = flags[0] < 3 && flags[1] < 3 && flags[7] < 3;
        if !lanes_ok || flags[2] > 1 || flags[3] > 1 || flags[4] > 1 || flags[5] > 2 || flags[6] > 10 || world.random_state == 0 { return None; }
        world.lane = flags[0];
        world.previous_lane = flags[1];
        world.grounded = flags[2] == 1;
        world.has_jumped = flags[3] == 1;
        world.roll_on_landing = flags[4] == 1;
        world.crash_reason = flags[5];
        world.last_power_up = flags[6];
        world.safe_lane = flags[7];
        let mut floats = [0.0f32; 19];
        for value in floats.iter_mut() {
            *value = reader.float()?;
            if !value.is_finite() || value.abs() > 1.0e6 { return None; }
        }
        [world.run_seconds, world.switch_from_x, world.switch_seconds, world.x, world.y, world.vertical_velocity, world.airborne_seconds, world.roll_seconds,
            world.surface, world.run_cycle, world.stumble_window, world.hit_grace, world.ghost_seconds, world.chaser_gap, world.magnet_seconds, world.sneakers_seconds,
            world.multiplier_seconds, world.hoverboard_seconds, world.streak_seconds] = floats;
        world.stumbles = reader.word()?;
        world.coins = reader.word()?;
        world.coin_streak = reader.word()?;
        world.rows = reader.word()?;
        world.next_row_z = reader.double()?;
        for index in 0..LANE_COUNT { world.blocked_until[index] = reader.double()?; }
        for index in 0..LANE_COUNT { world.reserved_until[index] = reader.double()?; }
        world.roof_until = reader.double()?;
        world.next_power_up_z = reader.double()?;
        let doubles = [world.player_z, world.distance_score, world.next_milestone, world.next_row_z, world.roof_until, world.next_power_up_z];
        if doubles.iter().chain(world.blocked_until.iter()).chain(world.reserved_until.iter()).any(|value| !value.is_finite() || value.abs() > 1.0e8) { return None; }
        if world.player_z < 0.0 || world.distance_score < 0.0 || world.x.abs() > LANE_WIDTH + 0.01 || world.y < 0.0 || world.y > 20.0 { return None; }
        let count = reader.byte()? as usize;
        if count > MAX_ENTITIES { return None; }
        for index in 0..count {
            let kind = Kind::from_index(reader.byte()? as u32)?;
            let lane = reader.byte()?;
            let variant = reader.byte()?;
            let (x, y, z, length, velocity) = (reader.float()?, reader.float()?, reader.double()?, reader.float()?, reader.float()?);
            if lane >= 3 || !z.is_finite() || ![x, y, length, velocity].iter().all(|value| value.is_finite() && value.abs() < 1.0e4) { return None; }
            world.entities[index] = Entity { active: true, kind, lane, variant, x, y, z, length, velocity };
        }
        if reader.position != bytes.len() { return None; }
        world.phase = Phase::Playing;
        world.phase_seconds = 0.0;
        Some(world)
    }
}

struct Writer { bytes: Vec<u8> }
impl Writer {
    fn byte(&mut self, value: u8) { self.bytes.push(value); }
    fn word(&mut self, value: u32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn float(&mut self, value: f32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn double(&mut self, value: f64) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
}

struct Reader<'a> { bytes: &'a [u8], position: usize }
impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Option<&'a [u8]> {
        let slice = self.bytes.get(self.position..self.position + count)?;
        self.position += count;
        Some(slice)
    }
    fn byte(&mut self) -> Option<u8> { Some(self.take(1)?[0]) }
    fn word(&mut self) -> Option<u32> { Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?)) }
    fn float(&mut self) -> Option<f32> { Some(f32::from_le_bytes(self.take(4)?.try_into().ok()?)) }
    fn double(&mut self) -> Option<f64> { Some(f64::from_le_bytes(self.take(8)?.try_into().ok()?)) }
}
