//! The one stage, "Green Hell Ridge": a fixed layout of platforms, water, collapsing bridges and an enemy spawn table.
//! All coordinates are world units (the view is always 240 units tall); y grows downward and platform `top` is the
//! surface a foot stands on.

/// Where the stage ends: the boss gate's right edge. The camera never scrolls past `LEVEL_END - view width`.
pub const LEVEL_END: f32 = 3900.0;
/// The boss gate's face: nothing walks past it.
pub const BOSS_WALL_X: f32 = 3820.0;
pub const HERO_START_X: f32 = 40.0;
pub const CHECKPOINT_X: f32 = 1900.0;
pub const CHECKPOINT_START_X: f32 = 1880.0;
pub const GROUND_TOP: f32 = 200.0;
pub const LOW_LEDGE_TOP: f32 = 156.0;
pub const HIGH_LEDGE_TOP: f32 = 112.0;
/// A swimmer's feet sit here; the water surface is drawn at `WATER_SURFACE_Y`.
pub const WATER_FEET_Y: f32 = 222.0;
pub const WATER_SURFACE_Y: f32 = 210.0;
/// Anything whose feet drop below this has fallen into a pit.
pub const KILL_Y: f32 = 256.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PlatformKind {
    /// Solid ground: you can't drop through it.
    Ground = 0,
    /// A rock or branch ledge: Down + Jump drops through it.
    Ledge = 1,
    /// One plank of a bridge that blows up piece by piece once stepped on.
    Bridge = 2,
}

#[derive(Clone, Copy, Debug)]
pub struct Platform { pub left: f32, pub right: f32, pub top: f32, pub kind: PlatformKind }

const fn ground(left: f32, right: f32) -> Platform { Platform { left, right, top: GROUND_TOP, kind: PlatformKind::Ground } }
const fn ledge(left: f32, right: f32, top: f32) -> Platform { Platform { left, right, top, kind: PlatformKind::Ledge } }
const fn plank(left: f32) -> Platform { Platform { left, right: left + BRIDGE_PLANK_WIDTH, top: GROUND_TOP, kind: PlatformKind::Bridge } }

pub const BRIDGE_PLANK_WIDTH: f32 = 20.0;
pub const PLANKS_PER_BRIDGE: usize = 8;

/// Every platform. The two bridges are listed plank by plank (indices in `BRIDGES`).
pub const PLATFORMS: [Platform; 34] = [
    ground(0.0, 700.0),
    ledge(150.0, 330.0, LOW_LEDGE_TOP),
    ledge(260.0, 420.0, HIGH_LEDGE_TOP),
    ledge(470.0, 640.0, LOW_LEDGE_TOP),
    // bridge 1 over the river (indices 4..12)
    plank(700.0), plank(720.0), plank(740.0), plank(760.0), plank(780.0), plank(800.0), plank(820.0), plank(840.0),
    ledge(940.0, 1080.0, LOW_LEDGE_TOP),
    ground(1290.0, 2200.0),
    ledge(1400.0, 1560.0, LOW_LEDGE_TOP),
    ledge(1520.0, 1700.0, HIGH_LEDGE_TOP),
    ledge(1800.0, 1980.0, LOW_LEDGE_TOP),
    ledge(2050.0, 2160.0, LOW_LEDGE_TOP),
    // a pit at 2200..2256 with a ledge over it
    ledge(2180.0, 2290.0, LOW_LEDGE_TOP),
    ground(2256.0, 3000.0),
    ledge(2380.0, 2560.0, LOW_LEDGE_TOP),
    ledge(2500.0, 2680.0, HIGH_LEDGE_TOP),
    ledge(2760.0, 2920.0, LOW_LEDGE_TOP),
    // bridge 2 over a gorge (indices 23..31)
    plank(3000.0), plank(3020.0), plank(3040.0), plank(3060.0), plank(3080.0), plank(3100.0), plank(3120.0), plank(3140.0),
    ground(3160.0, LEVEL_END),
    ledge(3300.0, 3460.0, LOW_LEDGE_TOP),
    ledge(3560.0, 3700.0, LOW_LEDGE_TOP),
];
pub const PLATFORM_COUNT: usize = PLATFORMS.len();

/// First plank index of each bridge.
pub const BRIDGES: [usize; 2] = [4, 23];
pub const BRIDGE_COUNT: usize = BRIDGES.len();

/// River spans (left, right): no ground below, a swimmer can only move and shoot forward or up.
pub const WATER: [(f32, f32); 1] = [(700.0, 1290.0)];

/// Stretches where foot soldiers keep running in from the screen edges: (from camera-centre x, to, seconds between).
pub const SOLDIER_ZONES: [(f32, f32, f32); 4] = [(260.0, 760.0, 1.9), (1250.0, 2200.0, 1.6), (2260.0, 3000.0, 1.5), (3150.0, 3640.0, 1.7)];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum SpawnKind { Turret = 1, Cannon = 2, Sniper = 3, Capsule = 4, BossCannon = 6, BossCore = 7 }

/// One fixed enemy or event. It appears once the camera's right edge passes `x` (capsules fly in from the left edge
/// at height `y`). `param`: sniper 0 stands, 1 hides in a bush; capsule = the weapon it carries; boss cannon = fire offset.
#[derive(Clone, Copy, Debug)]
pub struct Spawn { pub kind: SpawnKind, pub x: f32, pub y: f32, pub param: u8 }

const fn spawn(kind: SpawnKind, x: f32, y: f32, param: u8) -> Spawn { Spawn { kind, x, y, param } }

/// Weapons a capsule can carry (mirrors `Weapon`).
pub const RAPID: u8 = 1;
pub const SPREAD: u8 = 2;
pub const LASER: u8 = 3;

/// Sorted by x.
pub const SPAWNS: [Spawn; 22] = [
    spawn(SpawnKind::Sniper, 360.0, HIGH_LEDGE_TOP, 0),
    spawn(SpawnKind::Capsule, 470.0, 60.0, RAPID),
    spawn(SpawnKind::Turret, 600.0, GROUND_TOP - 12.0, 0),
    spawn(SpawnKind::Sniper, 1010.0, LOW_LEDGE_TOP, 1),
    spawn(SpawnKind::Cannon, 1270.0, GROUND_TOP - 4.0, 0),
    spawn(SpawnKind::Turret, 1340.0, GROUND_TOP - 12.0, 0),
    spawn(SpawnKind::Capsule, 1520.0, 56.0, SPREAD),
    spawn(SpawnKind::Turret, 1640.0, HIGH_LEDGE_TOP - 12.0, 0),
    spawn(SpawnKind::Sniper, 1760.0, GROUND_TOP, 1),
    spawn(SpawnKind::Turret, 2100.0, GROUND_TOP - 12.0, 0),
    spawn(SpawnKind::Capsule, 2420.0, 52.0, LASER),
    spawn(SpawnKind::Sniper, 2600.0, HIGH_LEDGE_TOP, 0),
    spawn(SpawnKind::Turret, 2640.0, GROUND_TOP - 12.0, 0),
    spawn(SpawnKind::Sniper, 2840.0, LOW_LEDGE_TOP, 1),
    spawn(SpawnKind::Cannon, 2960.0, GROUND_TOP - 10.0, 0),
    spawn(SpawnKind::Capsule, 3260.0, 60.0, SPREAD),
    spawn(SpawnKind::Turret, 3380.0, LOW_LEDGE_TOP - 12.0, 0),
    spawn(SpawnKind::Sniper, 3500.0, GROUND_TOP, 1),
    spawn(SpawnKind::Sniper, 3640.0, LOW_LEDGE_TOP, 0),
    spawn(SpawnKind::BossCannon, 3870.0, 104.0, 0),
    spawn(SpawnKind::BossCannon, 3870.0, 136.0, 1),
    spawn(SpawnKind::BossCore, 3880.0, 180.0, 0),
];

/// Where the boss parts actually sit (on the gate face).
pub const BOSS_CANNON_X: f32 = 3830.0;
pub const BOSS_CORE_X: f32 = 3836.0;
