//! A look-ahead autopilot, used by the tests (and the e2e bot run) to show the generated runs always leave a way
//! through. It picks the lane with the longest clear run ahead, then checks each action by simulating copies of the
//! world a little over a second ahead, keeping the first action that neither crashes nor stumbles.
use crate::world::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action { Wait, Left, Right, Jump, Roll }

const CHUNK_STEPS: u32 = 24;
const SEARCH_DEPTH: u32 = 5;
/// Simulated steps per decision before giving up and taking the best so far.
const STEP_BUDGET: u32 = 40_000;

impl World {
    pub fn apply_action(&mut self, action: Action) {
        match action {
            Action::Wait => {}
            Action::Left => self.press_lane(-1),
            Action::Right => self.press_lane(1),
            Action::Jump => self.press_jump(),
            Action::Roll => self.press_roll(),
        }
    }

    /// How far a lane stays runnable ahead: up to the first train you can't get onto (a parked train without a ramp,
    /// or where a train rolling toward you would meet you).
    pub fn clear_run(&self, lane: usize) -> f64 {
        let x = lane_x(lane);
        let speed = speed_at(self.player_z);
        let mut clear = 200.0f64;
        for entity in self.entities.iter() {
            if !entity.active || (entity.x - x).abs() > 0.1 { continue; }
            let ahead = entity.z - self.player_z;
            match entity.kind {
                Kind::Train => {
                    let on_roof = self.surface > TRAIN_HEIGHT - 0.5 && (self.x - x).abs() < 0.1 && ahead < 0.0;
                    let has_ramp = self.entities.iter().any(|ramp| ramp.active && ramp.kind == Kind::Ramp && (ramp.x - x).abs() < 0.1
                        && (ramp.z + ramp.length as f64 - entity.z).abs() < 0.01);
                    if ahead > -PLAYER_HALF_DEPTH && !has_ramp && !(on_roof) { clear = clear.min(ahead); }
                    else if ahead + (entity.length as f64) > 0.0 && ahead <= 0.0 && !on_roof { clear = clear.min(0.0); }
                }
                Kind::MovingTrain => {
                    if ahead + entity.length as f64 > -1.0 {
                        let meet = (ahead * speed as f64 / (speed + entity.velocity) as f64).max(0.0);
                        clear = clear.min(meet);
                    }
                }
                _ => {}
            }
        }
        clear
    }

    pub fn choose_action(&self) -> Action {
        let mut probe = self.clone();
        probe.autopilot = false;
        let current = self.lane as usize;
        // the lane with the longest clear run (ties: stay)
        let mut best_lane = current;
        let mut best_run = self.clear_run(current);
        for lane in 0..LANE_COUNT {
            let run = self.clear_run(lane);
            if run > best_run + 4.0 { best_lane = lane; best_run = run; }
        }
        let toward = if best_lane > current { Some(Action::Right) } else if best_lane < current { Some(Action::Left) } else { None };
        let mut order = [Action::Wait; 6];
        let mut count = 0;
        if let Some(step) = toward { order[count] = step; count += 1; }
        for action in [Action::Wait, Action::Jump, Action::Roll, Action::Left, Action::Right] {
            if Some(action) != toward { order[count] = action; count += 1; }
        }
        let mut budget = STEP_BUDGET;
        for &action in &order[..count] {
            if survives(&probe, action, SEARCH_DEPTH, &mut budget) { return action; }
        }
        Action::Wait
    }
}

fn survives(world: &World, action: Action, depth: u32, budget: &mut u32) -> bool {
    if *budget < CHUNK_STEPS { return true; }
    let mut copy = world.clone();
    copy.apply_action(action);
    for _ in 0..CHUNK_STEPS {
        let happened = copy.step();
        *budget -= 1;
        if copy.phase != Phase::Playing || happened & (events::STUMBLE | events::HOVERBOARD_BREAK) != 0 { return false; }
    }
    if depth == 0 { return true; }
    for next in [Action::Wait, Action::Jump, Action::Roll, Action::Left, Action::Right] {
        if survives(&copy, next, depth - 1, budget) { return true; }
    }
    false
}
