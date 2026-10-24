import { useEffect, useId, useRef, useState } from 'react';
import { setTheme, THEMES, useTheme } from '../theme';

/**
 * The ⚙ settings button and its popover with the colour-theme picker. Closes on an outside tap/click or Esc
 * (Esc is caught first, so on a game page it closes the panel instead of leaving the game).
 */
export default function ThemeSettings({ className = '' }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation(); // don't let the page (game → hub, modal → close) see this Esc
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); window.removeEventListener('keydown', handleKeyDown, true); };
  }, [isOpen]);

  // Arrow keys move between the theme options (radio-group behaviour).
  const handleOptionKey = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = THEMES[(index + step + THEMES.length) % THEMES.length];
    setTheme(next.id);
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${next.id}"]`)?.focus();
  };

  return (
    <div className={`settings ${className}`} ref={rootRef}>
      <button type="button" ref={buttonRef} className="settings__button" data-testid="settings-button" aria-label="Settings" title="Settings"
        aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setIsOpen(open => !open)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M19.14 12.94a7.4 7.4 0 0 0 .05-.94 7.4 7.4 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.4 7.4 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>
      {isOpen && (
        <div className="settings__panel" id={panelId} ref={panelRef} role="dialog" aria-labelledby={headingId} data-testid="settings-panel">
          <h2 className="settings__heading" id={headingId}>Color theme</h2>
          <div role="radiogroup" aria-labelledby={headingId} className="settings__options">
            {THEMES.map((option, index) => (
              <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} tabIndex={theme === option.id ? 0 : -1}
                className="settings__option" data-theme-option={option.id} data-testid={`theme-${option.id}`}
                onClick={() => setTheme(option.id)} onKeyDown={event => handleOptionKey(event, index)}>
                <span className="settings__swatches" aria-hidden="true">
                  {option.swatches.map(color => <span key={color} style={{ background: color }} />)}
                </span>
                <span className="settings__name">{option.name}{theme === option.id && <span className="settings__check" aria-hidden="true"> ✓</span>}</span>
                <span className="settings__description">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
