/** The battle: enemy waters (where you fire) and your own fleet, with the ships-left panels and shot callouts. */
import { useEffect, useRef, useState } from 'react';
import { cellName, type FleetCode, Mark, placementsOf, type SeaView, SHIPS, SUNK } from './engine';
import { FleetStatus, Sea, type SeaShip } from './Sea';

export interface Callout { id: number; text: string; kind: 'miss' | 'hit' | 'sunk'; /** Over which sea: where I fired, or my own fleet. */ side: 'target' | 'own'; }

/** Text for a shot result, e.g. "B7 — Hit!" or "Sunk the Frigate!". */
export function resultText(cell: number, result: number, mine: boolean) {
  if (result === 1) return { text: `${cellName(cell)} — Miss`, kind: 'miss' as const };
  if (result === 2) return { text: `${cellName(cell)} — Hit!`, kind: 'hit' as const };
  const ship = SHIPS[result - SUNK]?.name ?? 'ship';
  return { text: mine ? `You sank the ${ship}!` : `Your ${ship} was sunk!`, kind: 'sunk' as const };
}

export function BattleView({ target, incoming, myFleet, revealFleet, canFire, onFire, enemyTitle, myTitle, myColor, enemyColor, callout, testPrefix = 'fleet' }: {
  /** What I know about the enemy sea. */
  target: SeaView;
  /** What the enemy knows about my sea (their shots). */
  incoming: SeaView;
  myFleet: FleetCode;
  /** The enemy fleet, shown faintly when the game is over. */
  revealFleet?: FleetCode | null;
  canFire: boolean;
  onFire(cell: number): void;
  enemyTitle: string;
  myTitle: string;
  myColor: string;
  enemyColor: string;
  callout: Callout | null;
  testPrefix?: string;
}) {
  const [shake, setShake] = useState(0);
  const lastCallout = useRef(0);
  useEffect(() => {
    if (!callout || callout.id === lastCallout.current) return;
    lastCallout.current = callout.id;
    if (callout.kind !== 'miss' && callout.side === 'target') setShake(value => value + 1);
  }, [callout]);

  const enemyShips: SeaShip[] = target.sunk.map(placement => ({ ...placement, state: 'sunk' }));
  if (revealFleet) for (const placement of placementsOf(revealFleet)) if (!(target.sunkMask & (1 << placement.ship))) enemyShips.push({ ...placement, state: 'ghost' });
  const myShips: SeaShip[] = placementsOf(myFleet).map(placement => ({ ...placement, state: incoming.sunkMask & (1 << placement.ship) ? 'sunk' : 'afloat' }));
  const myMarks = incoming.marks.map(mark => (mark === Mark.Sunk ? Mark.Hit : mark));

  return (
    <div className="fleet-battle">
      <section className={`fleet-battle__target${canFire ? ' is-active' : ''}`} style={{ ['--fleet' as string]: enemyColor }}>
        <h2>{enemyTitle}</h2>
        <div className={`fleet-battle__sea${shake % 2 ? ' is-shake-a' : shake ? ' is-shake-b' : ''}`}>
          <Sea marks={target.marks} ships={enemyShips} lastShot={target.lastShot} onCell={canFire ? onFire : undefined} canFire={canFire} testId={`${testPrefix}-target`} label="Enemy waters" />
          {callout?.side === 'target' && <p key={callout.id} className={`fleet-callout fleet-callout--${callout.kind}`} data-testid={`${testPrefix}-callout`} data-kind={callout.kind}>{callout.text}</p>}
        </div>
        <FleetStatus title="Enemy fleet" sunkMask={target.sunkMask} testId={`${testPrefix}-enemy-status`} color={enemyColor} />
      </section>
      <section className="fleet-battle__own" style={{ ['--fleet' as string]: myColor }}>
        <h2>{myTitle}</h2>
        <div className="fleet-battle__sea">
          <Sea marks={myMarks} ships={myShips} lastShot={incoming.lastShot} size="small" testId={`${testPrefix}-own`} label="Your fleet" />
          {callout?.side === 'own' && <p key={callout.id} className={`fleet-callout fleet-callout--small fleet-callout--${callout.kind}`} data-testid={`${testPrefix}-callout`} data-kind={callout.kind}>{callout.text}</p>}
        </div>
        <FleetStatus title="Your fleet" sunkMask={incoming.sunkMask} testId={`${testPrefix}-my-status`} color={myColor} />
        <p className="fleet-battle__stats" data-testid={`${testPrefix}-stats`}>Shots {target.shots} · Hits {target.hits} · Accuracy {target.shots ? Math.round((target.hits / target.shots) * 100) : 0}%</p>
      </section>
    </div>
  );
}
