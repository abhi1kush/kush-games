//! Alpine Drive for JavaScript. Rust owns the whole simulation (the curving, rolling road, the car's heading and
//! steering, jumps and ramp arcs, obstacles, collectibles, the shield, scoring, the chase camera and the save format).
//! Each frame JavaScript sets the held buttons, calls `advance(seconds)` and reads everything it needs to draw straight
//! out of wasm memory: one fixed f32 render buffer (`render_pointer()`) refilled in place, with every position already
//! in camera space (so a turn swings the whole view). No allocation per frame.
pub mod track;
pub mod world;
#[cfg(test)]
mod tests;
use wasm_bindgen::prelude::*;
pub use track::*;
pub use world::*;

/// Layout of the render buffer (f32 slots). Mirrored in src/games/alpinesled/engine.ts (checked by a test).
pub mod render_slot {
    use crate::world::{DRAW_SEGMENTS, MAX_ENTITIES};
    pub const PHASE: usize = 0;
    pub const PHASE_SECONDS: usize = 1;
    pub const DISTANCE: usize = 2;
    pub const SCORE: usize = 3;
    pub const GIFTS: usize = 4;
    pub const STARS: usize = 5;
    pub const SPEED: usize = 6;
    /// the car's sideways offset from the centre line
    pub const PLAYER_X: usize = 7;
    /// height of the tyres above the snow (ramps included)
    pub const ALTITUDE: usize = 8;
    /// -1 (hard left) … 1 (hard right): how far the car is steered / rolled into its turn
    pub const LEAN: usize = 9;
    pub const SHIELD: usize = 10;
    pub const GRACE_SECONDS: usize = 11;
    /// the camera's world yaw (radians): the mountains and the road swing with it
    pub const HEADING: usize = 12;
    /// absolute index of the first trail segment (for scenery that must stay put)
    pub const FIRST_SEGMENT: usize = 13;
    pub const SEGMENT_COUNT: usize = 14;
    pub const ENTITY_COUNT: usize = 15;
    /// the car relative to the camera: sideways, height of the car, height of the snow under it, distance ahead
    pub const PLAYER_RELATIVE_X: usize = 16;
    pub const PLAYER_RELATIVE_Y: usize = 17;
    pub const PLAYER_GROUND_Y: usize = 18;
    pub const PLAYER_RELATIVE_Z: usize = 19;
    /// 0 sliding, 1 on a ramp, 2 in the air
    pub const MOTION: usize = 20;
    /// slope of the snow under the sled (dy/dz) for its pitch
    pub const SLOPE: usize = 21;
    pub const COLLECTIBLES: usize = 22;
    pub const CURVATURE: usize = 23;
    /// the car's yaw relative to the camera (radians): the body is drawn turned
    pub const CAR_YAW: usize = 24;
    /// a slight camera roll into the turn
    pub const CAMERA_ROLL: usize = 25;
    /// 0 chase camera, 1 bumper / hood view
    pub const VIEW_MODE: usize = 26;
    /// wheel rotation (radians), from distance travelled
    pub const WHEEL_ANGLE: usize = 27;
    /// relative z, centre-line x and snow height of each segment boundary, nearest first
    pub const SEGMENTS: usize = 32;
    pub const SEGMENT_STRIDE: usize = 3;
    /// kind, relative z, x, snow height, altitude, far-end x, far-end snow height, far-end z (ramps) per entity in view
    pub const ENTITIES: usize = SEGMENTS + DRAW_SEGMENTS * SEGMENT_STRIDE;
    pub const ENTITY_STRIDE: usize = 8;
    pub const LENGTH: usize = ENTITIES + MAX_ENTITIES * ENTITY_STRIDE;
}

#[wasm_bindgen]
pub struct AlpineSled {
    world: World,
    render: [f32; render_slot::LENGTH],
}

#[wasm_bindgen]
impl AlpineSled {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> AlpineSled {
        let mut game = AlpineSled { world: World::new(seed), render: [0.0; render_slot::LENGTH] };
        game.fill_render();
        game
    }

    /// Held buttons: 1 left, 2 right.
    pub fn set_input(&mut self, buttons: u32) { self.world.input = buttons; }
    /// Analog steering from a drag (-1 … 1), added to the buttons.
    pub fn set_steer_axis(&mut self, axis: f32) { self.world.steer_axis = if axis.is_finite() { limit(axis, -1.0, 1.0) } else { 0.0 }; }
    pub fn press_jump(&mut self) { self.world.press_jump(); }

    /// Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
    pub fn advance(&mut self, seconds: f32) -> u32 {
        let happened = self.world.advance(seconds);
        self.fill_render();
        happened
    }

    pub fn start(&mut self) { self.world.start(); self.fill_render(); }
    /// A brand-new run on a new trail, straight into play.
    pub fn restart(&mut self, seed: u32) {
        let view_half_width = self.world.view_half_width;
        let bumper_view = self.world.bumper_view;
        self.world = World::new(seed);
        self.world.set_view_half_width(view_half_width);
        self.world.set_bumper_view(bumper_view);
        self.world.start();
        self.fill_render();
    }
    pub fn save(&self) -> Vec<u8> { self.world.save() }
    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        let restored = self.world.restore(bytes);
        self.fill_render();
        restored
    }

    #[inline(never)]
    fn fill_render(&mut self) {
        use render_slot::*;
        let world = &self.world;
        let track = &world.track;
        let render = &mut self.render;
        let camera_z = world.camera_z();
        let camera_y = world.camera_y();
        render[PHASE] = world.phase as u8 as f32;
        render[PHASE_SECONDS] = world.phase_seconds;
        render[DISTANCE] = world.distance();
        render[SCORE] = world.score() as f32;
        render[GIFTS] = world.gifts as f32;
        render[STARS] = world.stars as f32;
        render[COLLECTIBLES] = world.collectibles() as f32;
        render[SPEED] = world.speed;
        render[PLAYER_X] = world.player_x;
        render[ALTITUDE] = world.altitude;
        render[LEAN] = limit(world.heading / MAX_STEER_ANGLE, -1.0, 1.0);
        render[SHIELD] = if world.has_shield { 1.0 } else { 0.0 };
        render[GRACE_SECONDS] = world.grace_seconds;
        render[HEADING] = world.camera_yaw;
        render[CURVATURE] = track.curvature(world.player_z) as f32;
        render[MOTION] = world.motion as u8 as f32;
        render[SLOPE] = track.slope(world.player_z) as f32;
        render[CAR_YAW] = world.car_world_yaw() - world.camera_yaw;
        render[CAMERA_ROLL] = world.camera_roll;
        render[VIEW_MODE] = if world.bumper_view { 1.0 } else { 0.0 };
        render[WHEEL_ANGLE] = world.player_z as f32 / 0.20; // tyre radius, so the wheels roll without slipping
        let ground = track.height(world.player_z);
        let (player_cx, player_cz) = world.world_to_camera(world.car_world_x(), world.player_z);
        render[PLAYER_RELATIVE_X] = player_cx;
        render[PLAYER_RELATIVE_Y] = (ground + world.altitude as f64 - camera_y) as f32;
        render[PLAYER_GROUND_Y] = (ground - camera_y) as f32;
        render[PLAYER_RELATIVE_Z] = player_cz;

        // a little behind the camera along the road, so the nearest strip still fills the bottom of the screen
        let first_segment = (camera_z.min(world.player_z) / SEGMENT_LENGTH as f64).floor() + 1.0;
        render[FIRST_SEGMENT] = first_segment as f32;
        for index in 0..DRAW_SEGMENTS {
            let z = (first_segment + index as f64) * SEGMENT_LENGTH as f64;
            let (cx, cz) = world.world_to_camera(track.center_x(z), z);
            let offset = SEGMENTS + index * SEGMENT_STRIDE;
            render[offset] = cz;
            render[offset + 1] = cx;
            render[offset + 2] = (track.height(z) - camera_y) as f32;
        }
        render[SEGMENT_COUNT] = DRAW_SEGMENTS as f32;

        let mut count = 0;
        for entity in world.entities.iter().filter(|entity| entity.active) {
            let far_world_z = if entity.kind == EntityKind::Ramp { entity.z + RAMP_LENGTH as f64 } else { entity.z };
            let (near_cx, near_cz) = world.world_to_camera(track.center_x(entity.z) + entity.x as f64, entity.z);
            let (far_cx, far_cz) = if entity.kind == EntityKind::Ramp {
                world.world_to_camera(track.center_x(far_world_z) + entity.x as f64, far_world_z)
            } else { (near_cx, near_cz) };
            let nearest_cz = near_cz.max(far_cz);
            let furthest_cz = near_cz.min(far_cz);
            if nearest_cz < 0.3 || furthest_cz > VIEW_DISTANCE { continue; }
            let offset = ENTITIES + count * ENTITY_STRIDE;
            render[offset] = entity.kind as u8 as f32;
            render[offset + 1] = near_cz;
            render[offset + 2] = near_cx;
            render[offset + 3] = (track.height(entity.z) - camera_y) as f32;
            render[offset + 4] = entity.altitude;
            render[offset + 5] = far_cx;
            render[offset + 6] = (track.height(far_world_z) - camera_y) as f32;
            render[offset + 7] = far_cz;
            count += 1;
        }
        render[ENTITY_COUNT] = count as f32;
    }

    /// The page's layout: half the screen width ÷ the focal length, so the camera keeps the sled on screen.
    pub fn set_view_half_width(&mut self, view_half_width: f32) { self.world.set_view_half_width(view_half_width); self.fill_render(); }
    /// The car's sideways screen position as a share of half the screen (0 = centre, ±1 = an edge).
    pub fn sled_screen_share(&self) -> f32 { self.world.sled_screen_share() }
    pub fn heading(&self) -> f32 { self.world.heading }
    pub fn camera_yaw(&self) -> f32 { self.world.camera_yaw }
    pub fn is_bumper_view(&self) -> bool { self.world.bumper_view }
    pub fn set_bumper_view(&mut self, bumper: bool) { self.world.set_bumper_view(bumper); self.fill_render(); }
    pub fn toggle_view(&mut self) { self.world.toggle_view(); self.fill_render(); }
    pub fn render_pointer(&self) -> *const f32 { self.render.as_ptr() }
    pub fn render_length() -> u32 { render_slot::LENGTH as u32 }

    pub fn phase(&self) -> u32 { self.world.phase as u32 }
    pub fn distance(&self) -> f32 { self.world.distance() }
    pub fn score(&self) -> u32 { self.world.score() }
    pub fn gifts(&self) -> u32 { self.world.gifts }
    pub fn stars(&self) -> u32 { self.world.stars }
    pub fn collectibles(&self) -> u32 { self.world.collectibles() }
    pub fn speed(&self) -> f32 { self.world.speed }
    pub fn player_x(&self) -> f32 { self.world.player_x }
    pub fn altitude(&self) -> f32 { self.world.altitude }
    pub fn motion(&self) -> u32 { self.world.motion as u32 }
    pub fn has_shield(&self) -> bool { self.world.has_shield }
    pub fn seed(&self) -> u32 { self.world.track.seed }

    // ---- test hooks (used by e2e/alpine-sled.mjs through ?sledTest; harmless in normal play) ----
    pub fn debug_set_invincible(&mut self, invincible: bool) { self.world.debug_invincible = invincible; }
    pub fn debug_prepare_crash(&mut self) { self.world.prepare_crash(); self.fill_render(); }
    pub fn debug_clear_trail(&mut self) { self.world.clear_entities(); self.fill_render(); }
    pub fn debug_teleport(&mut self, distance: f64) { self.world.teleport(distance); self.fill_render(); }
    /// Put something `ahead` metres in front of the car at sideways offset `x`.
    pub fn debug_spawn(&mut self, kind: u32, ahead: f64, x: f32, altitude: f32) -> bool {
        let Some(kind) = EntityKind::from_index(kind) else { return false };
        let spawned = self.world.spawn(kind, self.world.player_z + ahead, x, altitude);
        self.fill_render();
        spawned
    }
    /// Count of obstacles (kind < 4) within `ahead` metres of the car.
    pub fn debug_obstacles_ahead(&self, ahead: f64) -> u32 {
        let player_z = self.world.player_z;
        self.world.entities.iter().filter(|entity| entity.active && entity.kind.is_obstacle() && entity.z > player_z && entity.z < player_z + ahead).count() as u32
    }
}
