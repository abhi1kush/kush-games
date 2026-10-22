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
        // the centre sends it (almost) straight up, never exactly: an exactly vertical ball can bounce forever
        if expect_sideways { assert!(ball.velocity_x.abs() > 150.0 && ball.velocity_x.signum() == offset.signum()); } else { assert!(ball.velocity_x.abs() > 0.5 && ball.velocity_x.abs() < world.ball_speed * 0.07); }
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


// ---------- frame pacing, hitches and continuous collision ----------

fn falling_ball_world(paddle_x: f32, ball_x: f32, ball_y: f32, velocity_y: f32) -> World {
    let mut world = playing_world();
    world.paddle_x = paddle_x;
    world.paddle_target = Some(paddle_x);
    world.balls.push(Ball { x: ball_x, y: ball_y, velocity_x: 0.0, velocity_y });
    world
}

#[test]
fn even_an_absurdly_fast_ball_never_tunnels_through_the_paddle_or_bricks() {
    // 6000 units/s is ~10× the fastest real ball: 50 units per fixed step, far more than the paddle or a brick is thick
    for frame_seconds in [1.0 / 120.0, 1.0 / 60.0, 0.05, 0.09] {
        let mut world = falling_ball_world(240.0, 250.0, 400.0, 6000.0);
        world.ball_speed = 6000.0;
        let mut lowest = 0.0f32;
        let mut bounced = false;
        for _ in 0..4 {
            let events = world.advance(frame_seconds);
            bounced |= events & events::PADDLE != 0;
            if let Some(ball) = world.balls.first() { lowest = lowest.max(ball.y); }
        }
        assert!(bounced, "frame {frame_seconds}: missed the paddle");
        assert!(lowest <= PADDLE_Y - BALL_RADIUS + 0.01, "frame {frame_seconds}: ball went into the paddle (y {lowest})");
    }
    for column in 0..BRICK_COLUMNS {
        let mut world = playing_world();
        for c in 0..BRICK_COLUMNS { world.bricks[6 * BRICK_COLUMNS + c] = STEEL; }
        let (left, top, right, bottom) = brick_rect(6 * BRICK_COLUMNS + column);
        world.ball_speed = 6000.0;
        world.balls.push(Ball { x: (left + right) / 2.0, y: bottom + 60.0, velocity_x: 300.0, velocity_y: -5990.0 });
        let mut highest = f32::MAX;
        for _ in 0..3 { world.advance(0.05); if let Some(ball) = world.balls.first() { highest = highest.min(ball.y); } }
        let _ = top;
        assert!(highest >= bottom + BALL_RADIUS - 0.5, "column {column}: ball entered the steel row (y {highest})");
    }
}

#[test]
fn a_long_frame_gap_is_dropped_instead_of_teleporting_the_ball() {
    let mut world = falling_ball_world(240.0, 100.0, 300.0, 400.0);
    let events = world.advance(0.3);
    assert!(events & events::HITCH != 0);
    let moved = world.balls[0].y - 300.0;
    assert!(moved > 0.0 && moved <= 400.0 / 60.0 + 0.01, "a 300 ms freeze moved the ball {moved} units (one 60 Hz frame at most)");
    // a slow but normal frame (80 ms) plays at most 50 ms: slow motion, not a jump
    let mut world = falling_ball_world(240.0, 100.0, 300.0, 400.0);
    let events = world.advance(0.08);
    assert_eq!(events & events::HITCH, 0);
    assert!(world.balls[0].y - 300.0 <= 400.0 * MAX_FRAME_SECONDS + 0.01);
    // and the leftover isn't stored up for the next frame
    let before = world.balls[0].y;
    world.advance(1.0 / 60.0);
    assert!(world.balls[0].y - before <= 400.0 / 60.0 + 0.01);
}

#[test]
fn losing_the_ball_right_after_a_hitch_costs_no_life() {
    // paddle far away, ball about to fall out
    let mut world = falling_ball_world(60.0, 400.0, 600.0, 400.0);
    world.lives = 3;
    let mut events = world.advance(0.3);
    for _ in 0..30 { if world.phase != Phase::Playing { break; } events |= world.advance(1.0 / 60.0); }
    assert!(events & events::FREE_RELAUNCH != 0, "events {events:b}");
    assert_eq!(events & events::LIFE_LOST, 0);
    assert_eq!(world.lives, 3);
    assert_eq!(world.phase, Phase::Serving);

    // without a hitch the same miss costs a life
    let mut world = falling_ball_world(60.0, 400.0, 600.0, 400.0);
    world.lives = 3;
    let mut events = 0;
    for _ in 0..30 { if world.phase != Phase::Playing { break; } events |= world.advance(1.0 / 60.0); }
    assert!(events & events::LIFE_LOST != 0);
    assert_eq!(world.lives, 2);

    // the grace period is short: a miss half a second after the hitch counts
    let mut world = falling_ball_world(60.0, 400.0, 400.0, 300.0);
    world.lives = 3;
    let mut events = world.advance(0.3);
    for _ in 0..120 { if world.phase != Phase::Playing { break; } events |= world.advance(1.0 / 60.0); }
    assert!(events & events::LIFE_LOST != 0 && events & events::FREE_RELAUNCH == 0);
    assert_eq!(world.lives, 2);
}

#[test]
fn a_hitch_while_serving_does_nothing_special() {
    let mut world = World::new(3);
    let events = world.advance(0.5);
    assert_eq!(events & events::HITCH, 0);
    assert_eq!(world.phase, Phase::Serving);
}

#[test]
fn a_ball_pushed_inside_a_brick_comes_straight_out() {
    let mut world = playing_world();
    for c in 2..6 { world.bricks[3 * BRICK_COLUMNS + c] = STEEL; world.bricks[4 * BRICK_COLUMNS + c] = STEEL; }
    let (left, top, _, _) = brick_rect(4 * BRICK_COLUMNS + 3);
    world.balls.push(Ball { x: left + 5.0, y: top + 2.0, velocity_x: 200.0, velocity_y: -250.0 });
    for _ in 0..3 { world.step(); }
    let ball = world.balls[0];
    for index in 0..world.bricks.len() {
        if world.bricks[index] == 0 { continue; }
        let (l, t, r, b) = brick_rect(index);
        let dx = ball.x - clamp_between(ball.x, l, r);
        let dy = ball.y - clamp_between(ball.y, t, b);
        assert!((dx * dx + dy * dy).sqrt() >= BALL_RADIUS - 0.05, "still inside brick {index}: {ball:?}");
    }
}

#[test]
fn a_vertical_ball_trapped_above_steel_drifts_and_escapes_through_the_gap() {
    let mut world = playing_world();
    for c in 0..BRICK_COLUMNS { if c != 8 { world.bricks[2 * BRICK_COLUMNS + c] = STEEL; } }
    world.bricks[0] = 0;
    world.bricks[BRICK_COLUMNS * BRICK_ROWS - 1] = 1; // keep the level going
    let (left, top, right, _) = brick_rect(2 * BRICK_COLUMNS + 2);
    world.balls.push(Ball { x: (left + right) / 2.0, y: top - 30.0, velocity_x: 0.0, velocity_y: -300.0 });
    let mut escaped = false;
    for _ in 0..120 * 60 {
        world.paddle_target = world.balls.first().map(|ball| ball.x);
        world.step();
        if world.balls.first().map_or(false, |ball| ball.y > 160.0) { escaped = true; break; }
    }
    assert!(escaped, "ball still trapped: {:?}", world.balls.first());
}

#[test]
fn a_bot_never_waits_long_for_progress_on_any_level() {
    let mut longest = (0.0f32, 0u32, 0u32);
    for seed in 1..10u32 {
        for level in [1u32, 4, 6, 8, 11, 12] {
            let mut world = World::new(seed);
            world.start_level(level);
            world.launch();
            let mut since_progress = 0.0f32;
            for step in 0..(120 * 90) {
                if let Some(ball) = world.balls.iter().filter(|ball| ball.velocity_y > 0.0).max_by(|a, b| a.y.total_cmp(&b.y)) {
                    world.paddle_target = Some(ball.x + ((step / 97) % 5) as f32 * 8.0 - 16.0);
                }
                let events = world.step();
                if events & (events::PADDLE | events::BRICK_BROKEN | events::BRICK_HIT) != 0 { since_progress = 0.0; } else { since_progress += STEP_SECONDS; }
                if since_progress > longest.0 { longest = (since_progress, seed, level); }
                match world.phase { Phase::Serving => world.launch(), Phase::LevelCleared | Phase::GameOver => break, _ => {} }
            }
        }
    }
    assert!(longest.0 < 8.0, "{:.1} s without touching the paddle or a brick (seed {}, level {})", longest.0, longest.1, longest.2);
}

#[test]
fn the_ball_never_jumps_between_steps_while_bouncing_around_dense_levels() {
    // a jump bigger than the step's travel (plus a little push-out) would look like a teleport
    for seed in 1..8u32 {
        for level in [5u32, 6, 9, 12] {
            let mut world = World::new(seed);
            world.start_level(level);
            world.launch();
            for step in 0..(120 * 60) {
                if let Some(ball) = world.balls.iter().filter(|ball| ball.velocity_y > 0.0).max_by(|a, b| a.y.total_cmp(&b.y)) {
                    world.paddle_target = Some(ball.x + ((step / 89) % 5) as f32 * 8.0 - 16.0);
                }
                let before: Vec<Ball> = world.balls.clone();
                world.step();
                if world.phase != Phase::Playing { if world.phase == Phase::Serving { world.launch(); continue; } break; }
                if world.balls.len() != before.len() { continue; }
                for (old, new) in before.iter().zip(&world.balls) {
                    let speed = (old.velocity_x * old.velocity_x + old.velocity_y * old.velocity_y).sqrt();
                    let jump = ((new.x - old.x).powi(2) + (new.y - old.y).powi(2)).sqrt();
                    assert!(jump <= speed * STEP_SECONDS + 4.0, "seed {seed} level {level}: jumped {jump:.1} ({old:?} -> {new:?})");
                }
            }
        }
    }
}
