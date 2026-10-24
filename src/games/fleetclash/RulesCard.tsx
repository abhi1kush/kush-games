/** Fleet colours and the how-to-play card (menu and online placement). */
export const NAVY = '#2f7fd8';
export const SAFFRON = '#ff9933';

export function RulesCard() {
  return (
    <section className="fleet-rules" data-testid="fleet-rules">
      <h2>How to play</h2>
      <ul>
        <li><b>Place</b> your 5 ships: Carrier (5), Destroyer (4), Frigate (3), Submarine (3), Patrol boat (2). Drag them onto the sea, tap one to turn it, or press <b>Random</b>. <kbd>R</kbd> turns the selected ship.</li>
        <li><b>Fire</b>: take turns tapping a square in the enemy waters (or use the arrow keys and <kbd>Enter</kbd>). ○ is a miss, 🔥 a hit.</li>
        <li>Hit every square of a ship to <b>sink</b> it — the wreck is revealed. Sink all five to win.</li>
        <li>Online, fleets stay secret: each browser seals its fleet with a fingerprint at the start, and both are revealed and checked at the end.</li>
      </ul>
    </section>
  );
}
