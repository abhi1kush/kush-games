/** Ludo: the shared turn-game app (menu, rooms, table) with the Ludo board, rules and colours. */
import { TurnGameScreen, type TurnGameUi } from '../online/turnRoom/TurnGameApp';
import { BoardView } from './BoardView';
import { EnginePhase, type GameView, Ludo, loadLudoEngine, NoMoveReason, SEATS } from './engine';
import { ludoSpec } from './spec';
import './ludo.css';

const LUDO_UI: TurnGameUi<GameView> = {
  spec: ludoSpec,
  title: 'Ludo',
  className: 'ludo',
  testPrefix: 'ludo',
  logo: <h1 className="turn-logo" aria-label="Ludo">{['L', 'U', 'D', 'O'].map((letter, index) => <span key={letter} style={{ color: SEATS[index].color }}>{letter}</span>)}</h1>,
  tagline: 'The classic race home for 2–4 players — online with friends or on one device.',
  seatColors: SEATS.map(seat => seat.color),
  defaultSeats: ['human', 'computer', 'human', 'computer'],
  loadEngine: loadLudoEngine,
  createEngine: () => new Ludo((Math.random() * 0xffffffff) >>> 0),
  Board: BoardView,
  rules: (
    <>
      <li><b>Roll</b>: tap the dice (or press <kbd>Space</kbd>). Then tap a glowing token (or press <kbd>1</kbd>–<kbd>4</kbd>).</li>
      <li>Roll a <b>6</b> to bring a token out. A 6 gives another roll — but three 6s in a row lose the turn.</li>
      <li>Land on an opponent to <b>capture</b> it: it goes back to its yard and you roll again. Tokens on ★ squares are safe.</li>
      <li>Go round the board, up your coloured column and into the centre with an <b>exact</b> roll. Getting a token home gives another roll.</li>
      <li>First to bring all 4 tokens home is 1st; play goes on until 2nd and 3rd are decided.</li>
    </>
  ),
  turnText(view, current, isMine, isLocal) {
    if (view.phase === EnginePhase.NoMove) return view.noMoveReason === NoMoveReason.ThreeSixes ? `Three 6s — ${current?.name ?? ''} loses the turn` : `${current?.name ?? ''} rolled ${view.dice} — no move`;
    if (current && isMine && view.phase === EnginePhase.AwaitMove) return `${isLocal ? `${current.name}: ` : ''}pick a token to move ${view.dice}`;
    return null;
  },
};

export default function LudoScreen() {
  return <TurnGameScreen game={LUDO_UI} />;
}
