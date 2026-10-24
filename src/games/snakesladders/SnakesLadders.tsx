/** Snakes & Ladders: the shared turn-game app (menu, rooms, table) with five boards to pick from. */
import { TurnGameScreen, type TurnGameUi } from '../online/turnRoom/TurnGameApp';
import { BoardView } from './BoardView';
import { BOARDS, EnginePhase, type GameView, LAST_SQUARE, loadSnakesEngine, RollNote, SEATS, SnakesLadders } from './engine';
import { BoardPreview } from './Preview';
import { snakesSpec } from './spec';
import './snakesladders.css';

const SNAKES_UI: TurnGameUi<GameView> = {
  spec: snakesSpec,
  title: 'Snakes & Ladders',
  className: 'snakes',
  testPrefix: 'snakes',
  logo: (
    <h1 className="turn-logo snakes-logo" aria-label="Snakes & Ladders">
      <span style={{ color: SEATS[1].color }}>Snakes</span> <span className="snakes-logo__amp">&amp;</span> <span style={{ color: SEATS[2].color }}>Ladders</span>
    </h1>
  ),
  tagline: 'Race from 1 to 100 — climb the ladders, dodge the snakes. 2–4 players, online or on one device.',
  seatColors: SEATS.map(seat => seat.color),
  defaultSeats: ['human', 'off', 'computer', 'off'],
  loadEngine: loadSnakesEngine,
  createEngine: () => new SnakesLadders((Math.random() * 0xffffffff) >>> 0),
  Board: BoardView,
  variants: { label: 'Board', names: BOARDS.map(board => board.name), Preview: BoardPreview, storageKey: 'kush-games-snakes-ladders-board' },
  rules: (
    <>
      <li><b>Roll</b>: tap the dice in your corner (or press <kbd>Space</kbd>). Your token hops forward by itself.</li>
      <li>Land at the foot of a <b>ladder</b> to climb it; land on a <b>snake’s head</b> and slide down to its tail.</li>
      <li>A <b>6</b> rolls again — but three 6s in a row lose the turn.</li>
      <li>You need the <b>exact</b> number to land on 100. First there is 1st; play goes on for 2nd and 3rd.</li>
      <li>Five boards: Mango Grove (classic, default), Monsoon Rapids, Temple Steps, Spice Bazaar and Starry Night.</li>
    </>
  ),
  turnText(view, current, isMine, isLocal) {
    if (view.phase !== EnginePhase.Resolving || !current) return null;
    const who = isMine && !isLocal ? 'You' : current.name;
    if (view.note === RollNote.ThreeSixes) return `Three 6s — ${who} lose${who === 'You' ? '' : 's'} the turn`;
    if (view.note === RollNote.Overshoot) return `${who} rolled ${view.dice} — need${who === 'You' ? '' : 's'} exactly ${LAST_SQUARE - view.positions[view.current]}`;
    const move = view.lastMove;
    if (!move) return null;
    if (move.to === LAST_SQUARE) return `${who} reached 100! 🎉`;
    if (move.to > move.landed) return `${who} climb${who === 'You' ? '' : 's'} a ladder to ${move.to}!`;
    if (move.to < move.landed) return `Snake! ${who} slide${who === 'You' ? '' : 's'} down to ${move.to}`;
    return `${who} rolled ${view.dice} → square ${move.to}`;
  },
};

export default function SnakesLaddersScreen() {
  return <TurnGameScreen game={SNAKES_UI} />;
}
