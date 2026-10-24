//! The level path: move limits, goals, board layouts and star scores. Later levels add colours, blockers and fewer spare moves.

/// What a level asks for (besides staying within the move limit).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Goal {
    /// Reach this score.
    Score(u32),
    /// Clear this many pieces of one colour.
    Collect { colour: u8, count: u32 },
    /// Clear every jelly layer.
    ClearJelly,
    /// Break every stone and lock.
    ClearBlockers,
}

#[derive(Clone, Copy, Debug)]
pub struct Level {
    pub moves: u32,
    pub colours: u8,
    pub goal: Goal,
    /// Scores for the 2nd and 3rd star (1 star for finishing).
    pub two_stars: u32,
    pub three_stars: u32,
    /// 8 rows of 8: '.' plain, 'j' jelly, 'J' double jelly, 's' stone, 'S' 2-hit stone, 'l' locked piece, 'm' locked piece on jelly, '#' no cell.
    pub layout: [&'static str; 8],
}

const OPEN: [&str; 8] = ["........", "........", "........", "........", "........", "........", "........", "........"];

pub const LEVEL_COUNT: usize = 20;

pub const LEVELS: [Level; LEVEL_COUNT] = [
    // 1–4: learn matching, a colour goal and jelly (5 colours)
    Level { moves: 20, colours: 5, goal: Goal::Score(1500), two_stars: 3000, three_stars: 5000, layout: OPEN },
    Level { moves: 18, colours: 5, goal: Goal::Score(3000), two_stars: 5000, three_stars: 8000, layout: ["#......#", "........", "........", "........", "........", "........", "........", "#......#"] },
    Level { moves: 20, colours: 5, goal: Goal::Collect { colour: 0, count: 22 }, two_stars: 4000, three_stars: 7000, layout: OPEN },
    Level { moves: 22, colours: 5, goal: Goal::ClearJelly, two_stars: 5000, three_stars: 8000,
        layout: ["........", "........", "..jjjj..", "..jjjj..", "..jjjj..", "..jjjj..", "........", "........"] },
    // 5–8: six colours, holes, stones
    Level { moves: 22, colours: 6, goal: Goal::Score(4000), two_stars: 6000, three_stars: 9000, layout: ["##....##", "#......#", "........", "........", "........", "........", "#......#", "##....##"] },
    Level { moves: 22, colours: 6, goal: Goal::Collect { colour: 2, count: 24 }, two_stars: 5000, three_stars: 8000, layout: OPEN },
    Level { moves: 26, colours: 6, goal: Goal::ClearJelly, two_stars: 6000, three_stars: 9500,
        layout: ["jjjjjjjj", "j......j", "j......j", "j......j", "j......j", "j......j", "j......j", "jjjjjjjj"] },
    Level { moves: 18, colours: 6, goal: Goal::ClearBlockers, two_stars: 5000, three_stars: 8000,
        layout: ["........", "........", "........", "ssSSSSss", "........", "........", "........", "........"] },
    // 9–12: tighter limits, double jelly, locks
    Level { moves: 18, colours: 6, goal: Goal::Score(5500), two_stars: 8000, three_stars: 11000, layout: ["...##...", "........", "........", "#......#", "#......#", "........", "........", "...##..."] },
    Level { moves: 24, colours: 6, goal: Goal::ClearJelly, two_stars: 7000, three_stars: 11000,
        layout: ["........", ".jjjjjj.", ".jJJJJj.", ".jJ..Jj.", ".jJ..Jj.", ".jJJJJj.", ".jjjjjj.", "........"] },
    Level { moves: 26, colours: 6, goal: Goal::ClearBlockers, two_stars: 6000, three_stars: 9500,
        layout: ["........", ".l....l.", "..l..l..", "........", "........", "..l..l..", ".l....l.", "........"] },
    Level { moves: 22, colours: 6, goal: Goal::Collect { colour: 5, count: 38 }, two_stars: 7000, three_stars: 11000, layout: ["#......#", "........", "........", "........", "........", "........", "........", "#......#"] },
    // 13–16: two-hit stones, half-board jelly with holes, big scores, mixed blockers
    Level { moves: 24, colours: 6, goal: Goal::ClearBlockers, two_stars: 7000, three_stars: 11000,
        layout: ["........", "........", ".SS..SS.", ".SS..SS.", "........", "........", "ss....ss", "ss....ss"] },
    Level { moves: 28, colours: 6, goal: Goal::ClearJelly, two_stars: 8000, three_stars: 12000,
        layout: ["###..###", "##....##", "#......#", "........", "jjjjjjjj", "jjjjjjjj", "jjjjjjjj", "JjjjjjjJ"] },
    Level { moves: 18, colours: 6, goal: Goal::Score(8000), two_stars: 11000, three_stars: 15000, layout: OPEN },
    Level { moves: 21, colours: 6, goal: Goal::ClearBlockers, two_stars: 8000, three_stars: 12000,
        layout: ["........", "s.l..l.s", ".s....s.", "..SllS..", "..SllS..", ".s....s.", "s.l..l.s", "........"] },
    // 17–20: everything at once
    Level { moves: 30, colours: 6, goal: Goal::ClearJelly, two_stars: 9000, three_stars: 14000,
        layout: ["JjjjjjjJ", "jjjjjjjj", "jjjjjjjj", "jjjJJjjj", "jjjJJjjj", "jjjjjjjj", "jjjjjjjj", "JjjjjjjJ"] },
    Level { moves: 20, colours: 6, goal: Goal::Collect { colour: 1, count: 40 }, two_stars: 9000, three_stars: 13000, layout: ["##....##", "........", "........", "........", "........", "........", "........", "##....##"] },
    Level { moves: 26, colours: 6, goal: Goal::ClearBlockers, two_stars: 9000, three_stars: 14000,
        layout: ["........", "SlSlSlSl", "........", "lSlSlSlS", "........", "SlSlSlSl", "........", "........"] },
    Level { moves: 32, colours: 6, goal: Goal::ClearJelly, two_stars: 11000, three_stars: 16000,
        layout: ["#jjjjjj#", "jjmjjmjj", "jJjjjjJj", "jjjSSjjj", "jjjSSjjj", "jJjjjjJj", "jjmjjmjj", "#jjjjjj#"] },
];
