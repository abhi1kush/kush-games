/** The score cards (coins pocketed, the Queen, whose turn) and the how-to-play card. */
import { PLAYER_NAMES, QUEEN_COVERED, QUEEN_PENDING } from './engine';
import type { TableState } from './CarromTable';

export function ScoreCards({ state, names, labels }: { state: TableState; names: readonly [string, string]; labels?: readonly [string, string] }) {
  return (
    <div className="carrom-scores" data-testid="carrom-scores">
      {([0, 1] as const).map(player => {
        const queen = state.queenOwner === player && state.queenState === QUEEN_COVERED ? 'covered' : state.queenOwner === player && state.queenState === QUEEN_PENDING ? 'pending' : null;
        return (
          <div key={player} className={`carrom-score carrom-score--${player === 0 ? 'white' : 'black'}${state.turn === player && state.winner === null ? ' is-turn' : ''}${state.winner === player ? ' is-winner' : ''}`}
            data-testid={`carrom-score-${player}`} data-pocketed={state.pocketed[player]}>
            <span className="carrom-score__coin" aria-hidden="true" />
            <span className="carrom-score__name">{names[player]}<small>{labels?.[player] ?? PLAYER_NAMES[player]}</small></span>
            <span className="carrom-score__count" title="Coins pocketed">{state.pocketed[player]}<small>/9</small></span>
            {queen && <span className={`carrom-score__queen is-${queen}`} title={queen === 'covered' ? 'Queen covered' : 'Queen pocketed — cover her!'} data-testid={`carrom-queen-${player}`}>👑</span>}
            {state.due[player] > 0 && <span className="carrom-score__due" title="Penalty coins owed">−{state.due[player]}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function RulesCard() {
  return (
    <section className="carrom-rules" data-testid="carrom-rules">
      <h2>How to play</h2>
      <ul>
        <li><b>Place</b> the striker on your baseline: drag it sideways, use the slider, or <kbd>←</kbd>/<kbd>→</kbd>.</li>
        <li><b>Shoot</b>: pull back from the striker like a slingshot and let go — the further you pull, the harder the shot (watch the power ring). Keyboard: <kbd>↑</kbd>/<kbd>↓</kbd> aim, hold <kbd>Space</kbd> and release at the power you want.</li>
        <li>White breaks. Pocket <b>your</b> coins (White or Black); pocket one and you shoot again.</li>
        <li>The red <b>Queen</b> 👑 must be <b>covered</b>: pocket one of your coins in the same or the next shot, or she goes back to the centre.</li>
        <li><b>Fouls</b> (turn ends, one of your coins comes back): pocketing the striker, or pocketing the last coin of either colour before the Queen is covered.</li>
        <li>Pocket all nine coins (Queen covered) to win: 1 point per coin your opponent has left, +3 if you covered the Queen.</li>
      </ul>
    </section>
  );
}
