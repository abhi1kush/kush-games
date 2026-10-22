use super::world::*;

fn playing_world() -> World {
    let mut world = World::new(5);
    world.bricks = [0; BRICK_COLUMNS * BRICK_ROWS];
    world.bricks[0] = 1; // keep one far-away brick so the level isn't cleared
    world.phase = Phase::Playing;
    world.balls.clear();
    world
}

fn run_steps(world: &mut World, steps: usize) -> u32 { (0..steps).fold(0, |events, _| events | world.step()) }

#[test]
fn ball_bounces_off_the_bottom_of_a_brick() {
    let mut world = playing_world();
    let index = 4 * BRICK_COLUMNS + 5;
    world.bricks[index] = 2;
    let (left, _, right, bottom) = brick_rect(index);
    world.balls.push(Ball { x: (left + right) / 2.0, y: bottom + 20.0, velocity_x: 0.0, velocity_y: -300.0 });
    let events = run_steps(&mut world, 20);
    assert!(events & events::BRICK_HIT != 0);
    assert!(world.balls[0].velocity_y > 0.0, "now moving down");
    assert_eq!(world.bricks[index], 1);
}

#[test]
fn ball_bounces_sideways_off_the_side_of_a_brick() {
    let mut world = playing_world();
    let index = 3 * BRICK_COLUMNS + 4;
    world.bricks[index] = 1;
    let (left, top, _, bottom) = brick_rect(index);
    world.balls.push(Ball { x: left - 20.0, y: (top + bottom) / 2.0, velocity_x: 300.0, velocity_y: -120.0 });
    let events = run_steps(&mut world, 12);
    assert!(events & events::BRICK_BROKEN != 0);
    assert!(world.balls[0].velocity_x < 0.0, "reflected horizontally");
    assert!(world.balls[0].velocity_y < 0.0, "still moving up");
}

#[test]
fn corner_hit_reverses_both_directions() {
    let mut world = playing_world();
    let index = 5 * BRICK_COLUMNS + 5;
    world.bricks[index] = STEEL;
    let (left, _, _, bottom) = brick_rect(index);
    // heading diagonally up-right straight at the bottom-left corner
    world.balls.push(Ball { x: left - 10.0, y: bottom + 10.0, velocity_x: 250.0, velocity_y: -250.0 });
    let events = run_steps(&mut world, 10);
    assert!(events & events::STEEL_HIT != 0);
    assert!(world.balls[0].velocity_x < 0.0 && world.balls[0].velocity_y > 0.0, "{:?}", world.balls[0]);
}

#[test]
fn fast_ball_never_tunnels_through_a_brick_row() {
    for column in 0..BRICK_COLUMNS {
        let mut world = playing_world();
        for c in 0..BRICK_COLUMNS { world.bricks[6 * BRICK_COLUMNS + c] = STEEL; }
        let (left, _, right, bottom) = brick_rect(6 * BRICK_COLUMNS + column);
        world.ball_speed = level_speed(99) * 1.3;
        world.balls.push(Ball { x: (left + right) / 2.0 + 3.0, y: bottom + 40.0, velocity_x: 40.0, velocity_y: -world.ball_speed });
        run_steps(&mut world, 30);
        assert!(world.balls[0].y > bottom, "column {column}: ball got through ({:?})", world.balls[0]);
    }
}

#[test]
fn paddle_centre_sends_the_ball_up_and_edges_send_it_sideways() {
    for (offset, expect_sideways) in [(0.0f32, false), (38.0, true), (-38.0, true)] {
        let mut world = playing_world();
        world.paddle_x = 240.0;
        world.balls.push(Ball { x: 240.0 + offset, y: PADDLE_Y - 20.0, velocity_x: 0.0, velocity_y: 300.0 });
        let events = run_steps(&mut world, 12);
        assert!(events & events::PADDLE != 0);
        let ball = world.balls[0];
        assert!(ball.velocity_y < 0.0);
        if expect_sideways { assert!(ball.velocity_x.abs() > 150.0 && ball.velocity_x.signum() == offset.signum()); } else { assert!(ball.velocity_x.abs() < 1.0); }
    }
}

#[test]
fn ball_stays_inside_the_walls_and_never_goes_flat() {
    let mut world = playing_world();
    world.balls.push(Ball { x: 10.0, y: 300.0, velocity_x: -400.0, velocity_y: -5.0 });
    for _ in 0..600 {
        world.step();
        let Some(ball) = world.balls.first() else { break };
        assert!(ball.x >= BALL_RADIUS - 0.01 && ball.x <= WORLD_WIDTH - BALL_RADIUS + 0.01 && ball.y >= BALL_RADIUS - 0.01);
        assert!(ball.velocity_y.abs() >= world.ball_speed * 0.2);
    }
}

#[test]
fn losing_the_last_ball_costs_a_life_and_the_last_life_ends_the_game() {
    let mut world = playing_world();
    world.lives = 2;
    world.balls.push(Ball { x: 20.0, y: 620.0, velocity_x: 0.0, velocity_y: 400.0 });
    let events = run_steps(&mut world, 30);
    assert!(events & events::LIFE_LOST != 0);
    assert_eq!(world.lives, 1);
    assert_eq!(world.phase, Phase::Serving);
    world.launch();
    world.balls[0] = Ball { x: 20.0, y: 620.0, velocity_x: 0.0, velocity_y: 400.0 };
    let events = run_steps(&mut world, 30);
    assert!(events & events::GAME_OVER != 0);
    assert_eq!(world.phase, Phase::GameOver);
}

#[test]
fn level_is_cleared_when_only_steel_is_left() {
    let mut world = playing_world();
    world.bricks[0] = 0;
    world.bricks[5] = STEEL;
    world.bricks[12] = 1;
    let (left, _, right, bottom) = brick_rect(12);
    world.balls.push(Ball { x: (left + right) / 2.0, y: bottom + 15.0, velocity_x: 0.0, velocity_y: -300.0 });
    let events = run_steps(&mut world, 20);
    assert!(events & events::LEVEL_CLEARED != 0);
    assert_eq!(world.phase, Phase::LevelCleared);
}

#[test]
fn multi_ball_and_wide_paddle_power_ups() {
    let mut world = playing_world();
    world.balls.push(Ball { x: 200.0, y: 300.0, velocity_x: 100.0, velocity_y: -280.0 });
    world.apply_power_up(PowerUpKind::MultiBall);
    assert_eq!(world.balls.len(), 3);
    assert!(world.balls.iter().all(|ball| ball.velocity_y < 0.0));
    world.apply_power_up(PowerUpKind::Wide);
    run_steps(&mut world, 60);
    assert!(world.paddle_width > PADDLE_WIDTH + 30.0);
}

#[test]
fn levels_get_harder() {
    let count_hits = |level: u32| level_layout(level).iter().filter(|&&hits| hits != STEEL).map(|&hits| hits as u32).sum::<u32>();
    assert!(level_speed(8) > level_speed(1));
    assert!(count_hits(7) > count_hits(1));
    assert!(level_layout(9).iter().any(|&hits| hits == 3));
    assert!(level_layout(1).iter().all(|&hits| hits <= 1));
    for level in 1..30 { assert!(level_layout(level).iter().any(|&hits| hits > 0 && hits != STEEL), "level {level} has bricks"); }
}

#[test]
fn restore_puts_the_ball_back_on_the_paddle() {
    let mut world = World::new(1);
    let mut bricks = level_layout(3);
    bricks[0] = 0;
    assert!(world.restore(3, 1234, 2, &bricks));
    assert_eq!((world.level, world.score, world.lives, world.phase), (3, 1234, 2, Phase::Serving));
    assert_eq!(world.bricks, bricks);
    assert!(!world.restore(3, 0, 2, &[0; 5]));
    assert!(!world.restore(3, 0, 0, &bricks));
}

#[test]
fn a_bot_following_the_ball_clears_level_one() {
    let mut world = World::new(9);
    world.launch();
    for step in 0..120 * 600 {
        // aim with a different part of the paddle now and then, so the ball doesn't repeat one path forever
        let aim = ((step / 700) % 5) as f32 * 14.0 - 28.0;
        if let Some(lowest) = world.balls.iter().filter(|ball| ball.velocity_y > 0.0).max_by(|a, b| a.y.total_cmp(&b.y)) {
            world.paddle_target = Some(lowest.x - aim);
        }
        world.step();
        if world.phase == Phase::Serving { world.launch(); }
        if world.phase != Phase::Playing { break; }
    }
    assert_eq!(world.phase, Phase::LevelCleared, "bricks left: {}", world.breakable_left());
}
