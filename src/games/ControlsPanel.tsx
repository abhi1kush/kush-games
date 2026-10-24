import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import './controlsPanel.css';

/** One row of key caps and what they do. */
export interface KeyRow { keys: string[]; label: string; }
/** The on-screen touch layout, left to right as it appears on the phone. */
export interface TouchLayout { leftControl: 'stick' | 'pad' | 'drag'; leftLabel: string; buttons: { name: string; label: string; color: string }[]; where?: string; }
export interface ControlsGuide { keyRows: KeyRow[]; touch: TouchLayout; touchTips?: string[]; weapons?: { letter: string; name: string; color: string }[]; weaponsLabel?: string; }

/** Which kinds of input to explain: touch on coarse pointers, keys when a fine pointer exists or touch is unknown (both on hybrids). */
function detectInputs(): { showsKeys: boolean; showsTouch: boolean } {
  if (typeof window === 'undefined' || !window.matchMedia) return { showsKeys: true, showsTouch: true };
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches;
  const hasTouch = isCoarse || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!hasTouch) return { showsKeys: true, showsTouch: false };
  if (isCoarse && !hasFinePointer) return { showsKeys: false, showsTouch: true };
  return { showsKeys: true, showsTouch: true };
}

/**
 * A compact controls card for a game's start and pause screens: key caps for keyboards, a labelled sketch of the
 * on-screen buttons for touch screens (both when unsure), plus optional tips and a weapon legend.
 * `stopsClicks` keeps a click on the card from reaching the overlay (used on the pause screen so reading doesn't resume).
 */
export function ControlsPanel({ guide, stopsClicks = false, testId }: { guide: ControlsGuide; stopsClicks?: boolean; testId: string }) {
  const [{ showsKeys, showsTouch }] = useState(detectInputs);
  const stop = stopsClicks ? (event: ReactMouseEvent) => event.stopPropagation() : undefined;
  return (
    <div className="controls-panel" data-testid={testId} data-keys={showsKeys} data-touch={showsTouch} onClick={stop} onPointerDown={stopsClicks ? event => event.stopPropagation() : undefined}>
      {showsKeys && (
        <ul className="controls-panel__keys" aria-label="Keyboard controls">
          {guide.keyRows.map(row => (
            <li key={row.label}>
              <span className="controls-panel__caps">{row.keys.map((key, index) => key === '/' || key === '+' ? <i key={index}>{key}</i> : <kbd key={index}>{key}</kbd>)}</span>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
      )}
      {showsTouch && (
        <div className="controls-panel__touch" aria-label="Touch controls" data-testid={`${testId}-touch`}>
          <span className="controls-panel__touch-left">
            {guide.touch.leftControl === 'stick'
              ? <span className="controls-panel__stick" aria-hidden="true"><span /></span>
              : guide.touch.leftControl === 'drag'
                ? <span className="controls-panel__drag" aria-hidden="true"><b>◀</b><span /><b>▶</b></span>
                : <span className="controls-panel__pad" aria-hidden="true"><b>◀</b><b>▶</b></span>}
            <small>{guide.touch.leftLabel}</small>
          </span>
          {guide.touch.where ? <span className="controls-panel__where">{guide.touch.where}</span> : <span className="controls-panel__where">
            <span className="controls-panel__where-portrait">buttons below the screen</span>
            <span className="controls-panel__where-landscape">buttons on the screen corners</span>
          </span>}
          <span className="controls-panel__touch-right">
            {guide.touch.buttons.map(button => (
              <span key={button.name} className="controls-panel__touch-button">
                <b className="controls-panel__button" style={{ background: button.color }} aria-hidden="true">{button.name}</b>
                <small>{button.label}</small>
              </span>
            ))}
          </span>
        </div>
      )}
      {showsTouch && guide.touchTips && <p className="controls-panel__tips">{guide.touchTips.join(' · ')}</p>}
      {guide.weapons && (
        <p className="controls-panel__weapons" data-testid={`${testId}-weapons`}>
          <span>{guide.weaponsLabel ?? 'Capsules drop'}</span>
          {guide.weapons.map(weapon => (
            <span key={weapon.letter} className="controls-panel__weapon"><b style={{ background: weapon.color }}>{weapon.letter}</b>{weapon.name}</span>
          ))}
        </p>
      )}
    </div>
  );
}

/** The small "? Controls" toggle shown on pause screens. */
export function ControlsToggle({ isOpen, onToggle, testId }: { isOpen: boolean; onToggle: () => void; testId: string }) {
  return (
    <button type="button" className="controls-toggle" aria-expanded={isOpen} data-testid={testId}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); onToggle(); }}>
      {isOpen ? 'Hide controls' : '? Controls'}
    </button>
  );
}
